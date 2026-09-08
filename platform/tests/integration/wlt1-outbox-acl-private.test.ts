/**
 * WLT-01 outbox-ACL failure probes — PRIVATE, disposable database.
 *
 * WHY THIS FILE EXISTS: `role_wlt1_runtime` is the SAME runtime role shared by every WLT-01
 * integration-test file running against the canonical shared `TEST_DATABASE_URL`
 * (`wlt1-db.test.ts`, `wlt1-screening-application.test.ts`, `wlt1-screening-route.test.ts`). An ACL
 * REVOKE against that group role — even fully serialized behind the shared `withOutboxAclLock`
 * advisory lock against every OTHER ACL-mutating test — still removes ordinary INSERT privilege
 * from any BYSTANDER request one of those OTHER files' concurrently-running, non-mutating tests
 * might issue during the revoke window, because the lock only serializes MUTATORS against each
 * other; it provides zero protection to a bystander that never takes the lock at all. This was
 * empirically observed: a fresh-canonical run failed a `wlt1-screening-route.test.ts` test with
 * `WLT1_AUDIT_REQUIRED` while `wlt1-db.test.ts`'s own (fully advisory-lock-guarded) ACL-failure
 * test was running concurrently in a sibling file, both against the same shared canonical database.
 *
 * The fix is not a better lock — no advisory-lock discipline among MUTATORS can protect a
 * bystander in another file that simply needs ordinary INSERT during the revoke window. Instead,
 * every WLT-01 test whose own mechanism is to REVOKE/GRANT `role_wlt1_runtime`'s INSERT privilege
 * on `foundation.outbox_event` is moved into THIS file, which provisions its own PRIVATE, uniquely
 * named, disposable database (migrated through head 052, with the real `fnd`/`wlt1` runtime grant
 * files applied) — so its ACL mutations can never again reach any other file's bystander request.
 * The shared canonical database's `role_wlt1_runtime` privilege state is never touched by this file.
 *
 * Five tests moved here, verbatim in intent and assertions, from:
 *   - tests/integration/wlt1-db.test.ts, describe("atomicity / rollback") — 2 tests
 *   - tests/integration/wlt1-screening-application.test.ts, describe("audit atomicity / rollback")
 *     — 1 test
 *   - tests/integration/wlt1-screening-route.test.ts, describe("requested-audit atomicity (L3 — TX-1
 *     failure)") + describe("terminal-application audit failure (L3 — post-commit failure, TX-1
 *     stays committed)") — 2 tests
 *
 * Mirrors the already-established private-DB pattern (`wlt1-migration-05x-regression.test.ts`):
 * `CREATE DATABASE`, migrate via node-pg-migrate's programmatic `runner()`, `DROP DATABASE ...
 * WITH (FORCE)` in `afterAll` — extended here with the two runtime grant files this file's tests
 * actually need (`fnd_runtime_grants.sql`, `wlt1_runtime_grants.sql`), since (unlike the migration-
 * regression files) these tests drive real HTTP routes / a real service call under
 * `role_wlt1_runtime`, not just the migration layer. Every pool that can observe an administrative
 * disconnect during `DROP DATABASE ... WITH (FORCE)` carries a no-op `'error'` listener, and DB-drop
 * teardown is gated on successful `CREATE DATABASE`, not on later setup succeeding — see Issue C's
 * identical hardening in the migration-regression files.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { createScreeningApplication } from "../../services/wlt1/src/lib/screening-application.js";
import { loadWlt1Config } from "../../services/wlt1/src/config.js";
import type { NormalizedScreeningResult, ScreeningEvidenceEnvelope } from "../../services/wlt1/src/lib/providers/types.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import {
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  stubProvider,
  STUB_PROVIDER_ID,
  STUB_ADAPTOR_VERSION,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_outbox_acl_test";
const RECEIPT_URL = "/internal/wlt1/provider-results/receipt";
/** Same rationale as wlt1-provider-receipt-route.test.ts's own identical constant — a real,
 * deterministic, well-over-the-32-char-floor test-only receipt secret, distinct from every other
 * credential this file uses. */
const REAL_RECEIPT_SECRET = "test-receipt-secret-" + "a".repeat(20);

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_outbox_acl_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

/** No-op — expected during `DROP DATABASE ... WITH (FORCE)` teardown, which administratively
 * terminates any remaining backend on the dropped database. Without this listener `pg` surfaces
 * that expected disconnect as an unhandled exception (Issue C). Never swallows an assertion or
 * test-body error — those propagate normally through the awaited query/test promise chain, not
 * through this listener. */
function ignoreExpectedDisconnect(): void {
  /* intentionally empty */
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let screeningApplication: ReturnType<typeof createScreeningApplication>;
let schemaReady = false;
let databaseCreated = false;

/** Always reports every client as `active` — none of the five moved tests exercise CLT-01 gating
 * itself (that is `wlt1-db.test.ts`'s own coverage); they exist to prove outbox-ACL-failure
 * behaviour only. Own copy, F3(c) — never imported from services/clt1/**. */
const clt1AlwaysActiveFetch: typeof fetch = (async (url: unknown) => {
  const match = /\/internal\/clt1\/clients\/([^/]+)\/status$/.exec(String(url));
  const clientId = match?.[1] ? decodeURIComponent(match[1]) : "unknown";
  return new Response(JSON.stringify({ success: true, data: { client_id: clientId, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}) as unknown as typeof fetch;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-outbox-acl-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-outbox-acl-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-outbox-acl-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  // Applied AFTER migrations, exactly as infra/grants/wlt1_runtime_grants.sql's own header
  // requires (the tables must exist first) — plain multi-statement SQL, no psql meta-commands, so
  // a single `query()` call with the raw file text is sufficient (node-postgres's simple query
  // protocol executes semicolon-separated statements in one round trip).
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "wlt1_runtime_grants.sql"), "utf8"));

  await verifyPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
        CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
      END IF;
    END
    $$;
  `);
  await verifyPool.query(`GRANT role_wlt1_runtime TO ${RUNTIME_ROLE_USER};`);

  const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-outboxacl-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: "stub-wallet-analytics-v1",
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: { [STUB_PROVIDER_ID]: REAL_RECEIPT_SECRET },
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    destinationCoolingOffHours: 24,
    iam2BaseUrl: "http://127.0.0.1:0",
    iam2InternalServiceToken: "test-iam2-internal-token-it",
    decisionTokenTtlMinutes: 5,
    aml1BaseUrl: "http://127.0.0.1:0",
    aml1InternalServiceToken: "test-aml1-internal-token-it",
    clt1FetchImpl: clt1AlwaysActiveFetch,
  };
  app = await buildApp(mainConfig);

  screeningApplication = createScreeningApplication(
    loadWlt1Config({
      ENVIRONMENT: "dev",
      DATABASE_URL: "postgres://unused@localhost:5432/unused",
      PORT: "8090",
      WLT1_INTERNAL_SERVICE_TOKEN: "a".repeat(40),
      CLT1_BASE_URL: "http://localhost:8085",
      CLT1_INTERNAL_SERVICE_TOKEN: "b".repeat(40),
      IAM2_BASE_URL: "http://localhost:8082",
      IAM2_INTERNAL_SERVICE_TOKEN: "c".repeat(40),
      AML1_BASE_URL: "http://localhost:8087",
      AML1_INTERNAL_SERVICE_TOKEN: "d".repeat(40),
    WLT1_FIAT_ENC_KEY: "e".repeat(40),
      WLT1_SCREENING_MAX_VALIDITY_HOURS: "720",
    }),
  );

  schemaReady = true;
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
  if (maintenancePool) {
    if (databaseCreated) {
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME} WITH (FORCE)`).catch(async () => {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME}`).catch(() => undefined);
      });
    }
    await maintenancePool.end();
  }
});

const OWNED_CLIENT_ID = "clt1client_outboxacl";

// This file is the SOLE owner of its own private, disposable database — no other test file ever
// connects to it, so this cleanup needs no client_id/action scoping the way the shared-canonical-
// database files require (P2CC2-MED-1). It exists only so each of this file's own five tests
// starts from a clean slate (e.g. two route-level tests below both legitimately register the SAME
// stub address under the SAME client_id and would otherwise collide on the natural-key unique
// constraint).
afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01'`);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(opts: { chain: string; network: string; address: string }): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: {
      client_id: OWNED_CLIENT_ID,
      chain: opts.chain,
      network: opts.network,
      address: opts.address,
      wallet_type: "unhosted",
      beneficiary_relationship: "self",
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  }
  return { destinationId: res.json().data.destination_id };
}

function screen(destinationId: string, idempotencyKey: string): Promise<{ statusCode: number; body: any }> {
  return app
    .inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
      payload: {},
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

async function fetchDestinationStatus(destinationId: string): Promise<{ status: string; destination_status_version: number }> {
  const r = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  return r.rows[0];
}

async function auditCountFor(screeningResultId: string, eventType: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`, [
    eventType,
    screeningResultId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

// -------------------------------------------------------------------------------------------
// Moved verbatim (intent + assertions) from wlt1-db.test.ts's "atomicity / rollback" describe.
// -------------------------------------------------------------------------------------------
describe("WLT-01 outbox-ACL failure probes (private database)", () => {
  describe("registration atomicity / rollback (moved from wlt1-db.test.ts)", () => {
    it("audit failure rolls back the ENTIRE registration — no destination/wallet_destination/address_integrity_check row survives, mapped to WLT1_AUDIT_REQUIRED", async () => {
      if (!schemaReady) return;
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await app.inject({
            method: "POST",
            url: "/internal/wlt1/wallet-destinations",
            headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg-audit") },
            payload: {
              client_id: OWNED_CLIENT_ID,
              chain: "ethereum",
              network: "mainnet",
              address: "0x2222222222222222222222222222222222222B",
              wallet_type: "unhosted",
              beneficiary_relationship: "self",
            },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
          const destCount = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
          expect(Number(destCount.rows[0].count)).toBe(0);
          // Private database — no sibling file's idempotency reservations can ever be counted
          // here, so the scoping below is a belt-and-suspenders match to the original assertion
          // shape, not a strict necessity the way it was on the shared canonical database.
          const idemCount = await verifyPool.query(
            `SELECT count(*) FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.wallet_destination.register'`,
          );
          expect(Number(idemCount.rows[0].count)).toBe(0);
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
    });

    it("refusal-evidence audit failure rolls back the refusal transaction too — never claims a refusal was durably recorded", async () => {
      if (!schemaReady) return;
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await app.inject({
            method: "POST",
            url: "/internal/wlt1/wallet-destinations",
            headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg-refusal") },
            payload: {
              client_id: OWNED_CLIENT_ID,
              chain: "ethereum",
              network: "mainnet",
              // Deliberately invalid EIP-55 checksum (last-char case flipped incorrectly) — same
              // refusal-evidence path the original wlt1-db.test.ts test exercised.
              address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD",
              wallet_type: "unhosted",
              beneficiary_relationship: "self",
            },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
          const evidenceCount = await verifyPool.query(`SELECT count(*) FROM wlt1.address_integrity_check WHERE client_id = $1`, [OWNED_CLIENT_ID]);
          expect(Number(evidenceCount.rows[0].count)).toBe(0);
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  // Moved verbatim (intent + assertions) from wlt1-screening-application.test.ts's "audit
  // atomicity / rollback" describe.
  // -----------------------------------------------------------------------------------------
  describe("terminal-application audit atomicity (moved from wlt1-screening-application.test.ts)", () => {
    async function insertPendingDestination(destinationId: string): Promise<void> {
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'pending_screening')`,
        [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID()],
      );
    }
    async function insertPendingScreening(screeningResultId: string, destinationId: string): Promise<void> {
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
         VALUES ($1, $2, 1, $3, $4, 'ethereum', 'mainnet', $5)`,
        [screeningResultId, destinationId, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, "addrhash_" + randomUUID()],
      );
    }
    async function fetchScreeningRow(screeningResultId: string) {
      const r = await verifyPool.query(`SELECT risk_status, issued_at_utc FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      return r.rows[0];
    }
    async function fetchDestinationRow(destinationId: string) {
      const r = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      return r.rows[0];
    }
    const SYNCHRONOUS_ENVELOPE: ScreeningEvidenceEnvelope = { sourceKind: "synchronous_provider", providerId: STUB_PROVIDER_ID, providerAdaptorVersion: STUB_ADAPTOR_VERSION };
    function baseResult(overrides: Partial<NormalizedScreeningResult> = {}): NormalizedScreeningResult {
      return {
        providerResultId: "presult_" + randomUUID(),
        riskStatus: "clear",
        riskScore: 2.0,
        riskCategories: [],
        directExposure: [],
        indirectExposure: [],
        sanctionsExposure: false,
        clusterRef: null,
        issuedAtUtc: new Date().toISOString(),
        validUntilUtc: null,
        ...overrides,
      };
    }

    it("an audit publish failure rolls back everything — screening stays pending, destination stays pending_screening, no terminal evidence survives", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_outboxacl_" + randomUUID();
      const screeningResultId = "wlt1screen_outboxacl_" + randomUUID();
      await insertPendingDestination(destinationId);
      await insertPendingScreening(screeningResultId, destinationId);
      const beforeDestination = await fetchDestinationRow(destinationId);

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          await expect(
            screeningApplication.applyNormalizedScreeningResult({
              destinationId,
              screeningResultId,
              result: baseResult({ riskStatus: "clear" }),
              evidence: SYNCHRONOUS_ENVELOPE,
            }),
          ).rejects.toBeDefined();
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("pending");
      expect(screening.issued_at_utc).toBeNull();
      const destination = await fetchDestinationRow(destinationId);
      expect(destination.status).toBe("pending_screening");
      expect(destination.destination_status_version).toBe(beforeDestination.destination_status_version);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Moved verbatim (intent + assertions) from wlt1-screening-route.test.ts's "requested-audit
  // atomicity (L3 — TX-1 failure)" / "terminal-application audit failure (L3 — post-commit
  // failure, TX-1 stays committed)" describes.
  // -----------------------------------------------------------------------------------------
  describe("route-level L3 audit atomicity (moved from wlt1-screening-route.test.ts)", () => {
    it("forced outbox INSERT denial during TX-1: route returns WLT1_AUDIT_REQUIRED, destination stays draft, no screening row, no audit, no idempotency success", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await screen(destinationId, freshKey());
          expect(res.statusCode).toBe(503);
          expect(res.body.error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      const destStatus = await fetchDestinationStatus(destinationId);
      expect(destStatus.status).toBe("draft");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows[0].n).toBe(0);

      // Idempotency reservation must have rolled back too — a retry with the SAME key must succeed cleanly.
      const retryKey = freshKey();
      const retry = await screen(destinationId, retryKey);
      expect(retry.statusCode).toBe(200);
    });

    it("provider returns screened, but the terminal-application audit fails: TX-1 remains committed (screening_requested audit survives), terminal mutation rolls back, route returns WLT1_AUDIT_REQUIRED, screening stays pending", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });

      // Deterministic: the provider call itself succeeds (real stub), but we revoke outbox INSERT
      // BEFORE calling /screen so ONLY the terminal-application transaction (which runs after the
      // provider responds) can fail — TX-1 has nothing further to fail on the audit side.
      const revokeOnceThenRestoreProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = revokeOnceThenRestoreProvider;

      await withOutboxAclLock(TEST_DB as string, async () => {
        try {
          const res = await screen(destinationId, freshKey());
          expect(res.statusCode).toBe(503);
          expect(res.body.error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
          mainConfig.screeningProviderImpl = undefined;
        }
      });

      // TX-1 (initiation) is durably committed: destination moved to pending_screening, and the
      // requested audit survives — only the LATER terminal-application transaction rolled back.
      const destStatus = await fetchDestinationStatus(destinationId);
      expect(destStatus.status).toBe("pending_screening");
      const rows = await verifyPool.query(`SELECT screening_result_id, risk_status, issued_at_utc FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].risk_status).toBe("pending");
      expect(rows.rows[0].issued_at_utc).toBeNull();
      expect(await auditCountFor(rows.rows[0].screening_result_id, "wlt1.wallet_screening_requested")).toBe(1);
      expect(await auditCountFor(rows.rows[0].screening_result_id, "wlt1.wallet_screening_completed")).toBe(0);
    });

    // ---------------------------------------------------------------------------------------
    // Phase 2C-C3 recovery proof, built directly on the L3 terminal-application-failure scenario
    // above: a screening genuinely stranded by a REAL (not simulated) terminal-application audit
    // failure — the exact class of failure C3's recovery guarantee names explicitly — must still
    // become retryable once the fixed 30-second cooldown has elapsed, on the SAME
    // screening_result_id/version. This belongs in the private-DB file (not the shared-canonical
    // route test file) because it drives the identical outbox-ACL REVOKE/GRANT mechanism as the
    // test immediately above.
    // ---------------------------------------------------------------------------------------
    it("Phase 2C-C3: a screening stranded by a REAL terminal-application audit failure recovers on a NEW key after the cooldown — SAME row/version, successful terminal application this time", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });

      const revokeOnceThenRestoreProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = revokeOnceThenRestoreProvider;

      let screeningResultId = "";
      await withOutboxAclLock(TEST_DB as string, async () => {
        try {
          const res = await screen(destinationId, freshKey());
          expect(res.statusCode).toBe(503);
          expect(res.body.error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
          mainConfig.screeningProviderImpl = undefined;
        }
      });

      const stranded = await verifyPool.query(`SELECT screening_result_id, risk_status FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(stranded.rows).toHaveLength(1);
      expect(stranded.rows[0].risk_status).toBe("pending");
      screeningResultId = stranded.rows[0].screening_result_id;

      // Deterministically force cooldown eligibility (no sleep) — the outbox ACL is already
      // restored (finally block above), so this retry's own terminal application will succeed for
      // real this time.
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);

      const recovered = await screen(destinationId, freshKey());
      expect(recovered.statusCode).toBe(200);
      expect(recovered.body.data.screening_result_id).toBe(screeningResultId);
      expect(recovered.body.data.risk_status).toBe("clear");

      const finalDest = await fetchDestinationStatus(destinationId);
      expect(finalDest.status).toBe("pending_review");
      const finalRow = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(finalRow.rows[0].n).toBe(1); // no new row was ever created
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_requested")).toBe(1); // never re-emitted
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-D2 — provider_receipt_conflict_detected audit atomicity. Belongs in THIS private-DB
  // file (not wlt1-provider-receipt-route.test.ts, which shares the canonical database) for the
  // exact same reason every other test in this file does: an ACL REVOKE against the SHARED
  // role_wlt1_runtime would remove ordinary INSERT privilege from any bystander request another
  // file's concurrently-running test might issue.
  // -----------------------------------------------------------------------------------------
  describe("D2 conflict-audit atomicity (provider_receipt_conflict_detected)", () => {
    async function sendReceipt(providerResultId: string, resultBody: unknown) {
      return app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": "stub-wallet-analytics-v1", "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_oacl_" + randomUUID(), provider_result_id: providerResultId, result: resultBody },
      });
    }

    it("a conflict-audit publish failure rolls back the whole transaction and surfaces WLT1_AUDIT_REQUIRED — never a false 409, never a silently-dropped conflict, original row completely untouched", async () => {
      if (!schemaReady) return;
      const providerResultId = "presult_outboxacl_conflict_" + randomUUID();

      // First delivery: succeeds normally (outbox ACL intact at this point).
      const first = await sendReceipt(providerResultId, { attempt: 1 });
      expect(first.statusCode).toBe(202);
      const originalRow = (await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId])).rows[0];
      expect(originalRow).toBeDefined();

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          // Second delivery: SAME provider_result_id, DIFFERENT body -> different server-computed
          // payload_hash -> a genuine conflict, whose detection must publish
          // wlt1.provider_receipt_conflict_detected BEFORE the 409 is ever returned. With INSERT
          // revoked, that publish fails, and the established L3 pattern requires the WHOLE
          // transaction (including the earlier no-op INSERT ON CONFLICT DO NOTHING attempt) to
          // roll back — never a false claim that the conflict was durably recorded.
          const second = await sendReceipt(providerResultId, { attempt: 2 });
          expect(second.statusCode).toBe(503);
          expect(second.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      // Still exactly one row — the failed conflict-detection attempt never created a second one.
      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      // The ORIGINAL row is byte-for-byte unchanged — field-by-field, not a shallow spot-check.
      expect(rows.rows[0]).toEqual(originalRow);

      // No conflict audit (or any audit) was left behind by the failed attempt.
      const auditRows = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.provider_receipt_conflict_detected' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [providerResultId],
      );
      expect(Number(auditRows.rows[0].n)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-D3B — terminal-application audit atomicity via the receipt route. Belongs in THIS
  // private-DB file for the identical reason every other test here does: an ACL REVOKE against the
  // shared role_wlt1_runtime would remove ordinary INSERT privilege from a bystander request in
  // another concurrently-running file. `ScreeningApplicationService.applyNormalizedScreeningResult`
  // publishes its own terminal audit inside the SAME transaction as the terminal screening/
  // destination mutation (screening-application.ts) — an outbox-INSERT failure there rolls back the
  // whole thing, and this route's own catch (mirroring wallet-screening.ts's established idiom)
  // maps any unexpected non-Wlt1Error/AppError failure to WLT1_AUDIT_REQUIRED, leaving the inbox row
  // untouched at 'received' (TX-C's own conditional received->processed transition is never
  // attempted once the service throws).
  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3B — terminal-application audit atomicity (receipt route)", () => {
    async function createRealPendingScreening(): Promise<{ destinationId: string; screeningResultId: string }> {
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(destinationId, freshKey());
      if (first.statusCode !== 202) throw new Error(`expected pending screening, got ${first.statusCode} ${JSON.stringify(first.body)}`);
      return { destinationId, screeningResultId: first.body.data.screening_result_id as string };
    }

    function validStubReceiptBody(providerResultId: string): Record<string, unknown> {
      return {
        provider_result_id: providerResultId,
        risk_status: "clear",
        risk_score: 2.0,
        risk_categories: [],
        direct_exposure: [],
        indirect_exposure: [],
        sanctions_exposure: false,
        cluster_ref: null,
        issued_at_utc: new Date().toISOString(),
        valid_until_utc: null,
      };
    }

    async function fetchInboxRow(providerResultId: string) {
      const r = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      return r.rows[0];
    }

    it("a terminal-application audit failure leaves the inbox row 'received' (never rejected, never processed), screening stays pending, destination stays pending_screening, no terminal audit — 503 WLT1_AUDIT_REQUIRED; an exact-byte replay after ACL restoration recovers and applies, exactly ONE terminal audit total", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = "presult_outboxacl_d3b_" + randomUUID();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await app.inject({
            method: "POST",
            url: RECEIPT_URL,
            headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
            payload: rawBody,
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      // TX-A's own inbox INSERT never touches foundation.outbox_event — it committed durably before
      // the service was ever called; only the SERVICE's own TX-B (terminal screening + destination +
      // audit) rolled back, so the row remains EXACTLY 'received' — TX-C's own conditional
      // received->processed transition is never reached, and it must never be classified 'rejected'
      // either (no permanent-stale condition applies here; this is a transient failure).
      const stranded = await fetchInboxRow(providerResultId);
      expect(stranded.processing_status).toBe("received");
      expect(stranded.rejection_reason_code).toBeNull();
      const screening = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(screening.rows[0].risk_status).toBe("pending");
      const dest = await fetchDestinationStatus(destinationId);
      expect(dest.status).toBe("pending_screening");
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(0);

      // Exact-byte replay (same raw body -> same server-computed payload_hash -> D2 exact-duplicate
      // against the still-'received' row) after the ACL is restored: reconciliation finds no
      // matching terminal evidence yet (the prior attempt fully rolled back), so it re-normalizes
      // and terminally applies for real this time.
      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ received: true, applied: true });

      const recovered = await fetchInboxRow(providerResultId);
      expect(recovered.processing_status).toBe("processed");
      const screeningAfter = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(screeningAfter.rows[0].risk_status).toBe("clear");
      const destAfter = await fetchDestinationStatus(destinationId);
      expect(destAfter.status).toBe("pending_review");
      // Exactly ONE terminal audit total across both the failed attempt and the successful replay.
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
    });
  });
});
