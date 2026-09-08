/**
 * WLT-01 — Destination Revocation + AML Revocation Signal Ingestion, PRIVATE disposable database.
 * `POST /internal/wlt1/destinations/:destination_id/revoke` + `POST /internal/wlt1/aml-revocations`.
 * Also covers the mandatory C-1 Phase 4B amendment regression
 * (`routes/decision-consume.ts`'s destination read is now `loadDestinationEvalSnapshotForUpdate`).
 *
 * Mirrors `wlt1-decision-consume-route.test.ts`'s own established rationale: a PRIVATE, uniquely
 * named database (migrated through head 059, with the real `fnd`/`wlt1` runtime grant files
 * applied — the SAME grants this phase ships with, deliberately unmodified), so this file's own
 * forced-audit-failure ACL mutation against `foundation.outbox_event` can never reach any other
 * file's bystander request.
 *
 * GENUINE CONCURRENCY (not a bare `Promise.all` coin flip — mirrors `clt1-db.test.ts`'s own
 * documented, established lesson, reused verbatim by every prior WLT-01 concurrency test in this
 * session): every concurrency test below holds the destination row's OWN `FOR UPDATE` lock from an
 * INDEPENDENT connection, launches the competing requests, deterministically PROVES both are
 * genuinely blocked on that held lock (neither settles within a bounded wait), THEN releases the
 * lock so both requests race for it at the real PostgreSQL level. This proves genuine overlap; only
 * the winner/loser identity is (deliberately) left nondeterministic — both valid serializations are
 * asserted.
 *
 * P-ROSTER and AML-01 fetch stubs are configured to THROW IF CALLED by default — neither
 * revocation route may ever make either network call (frozen phase boundary). The ONE exception is
 * CONCURRENCY TEST 4 (revoke vs evaluate-use), which legitimately needs `evaluate-use` to reach its
 * own locked TX-B re-check for real — that single test temporarily swaps in real-success P-ROSTER/
 * AML-01 stubs (mirroring `wlt1-evaluate-use-route.test.ts`'s own established response shapes) and
 * restores the throw-if-called stubs afterward, exactly like this codebase's own established
 * per-test-override-then-`afterEach`-reset convention.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { REVOCATION_ID_REGEX } from "../../services/wlt1/src/lib/destination-revocation.js";
import { hashToken, mintDecisionId, mintDecisionToken } from "../../services/wlt1/src/lib/decision-token.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_destrevocation_route_test";

const PRIVATE_DB_NAME = `wlt1_destrevoc_it_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

function ignoreExpectedDisconnect(): void {
  /* intentionally empty — expected during DROP DATABASE ... WITH (FORCE) teardown */
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let maintenancePool: Pool;
let privateDbUrl: string;
let runtimeDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_destrevocprivate";
const OTHER_CLIENT_ID = "clt1client_destrevocother";

function mustNotBeCalledFetch(label: string): typeof fetch {
  return (async () => {
    throw new Error(`TEST ASSERTION FAILURE: ${label} must not be called by the revocation routes`);
  }) as unknown as typeof fetch;
}

/** P-ROSTER (CLT-01) always-ok fake fetch — own copy, F3(c), same response shape as
 * `wlt1-evaluate-use-route.test.ts`'s own established `clt1RosterOk`. Used ONLY by CONCURRENCY
 * TEST 4, which needs `evaluate-use` to genuinely reach its own locked TX-B. */
function clt1RosterOkFetch(clientId: string): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, authorised_party_refs: ["ap_1"] } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, status: "active" } }) } as Response;
  }) as unknown as typeof fetch;
}

/** AML-01 always-allow fake fetch — own copy, F3(c), same response shape as
 * `wlt1-evaluate-use-route.test.ts`'s own established `aml1Allow`. Used ONLY by CONCURRENCY TEST 4. */
function aml1AllowFetch(clientId: string): typeof fetch {
  return (async () => {
    const now = new Date();
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          decision: "allow",
          decision_id: "aml1ptd_" + randomUUID(),
          reason_code: "evidence_clear",
          evaluated_at_utc: now.toISOString(),
          valid_until_utc: new Date(now.getTime() + 600_000).toISOString(),
          evidence_provider_ids: ["stub-v1"],
          client_id: clientId,
          requested_action: "destination_use",
        },
      }),
    } as Response;
  }) as unknown as typeof fetch;
}

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-destrevoc-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-destrevoc-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-destrevoc-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

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

  runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-destrevocprivate-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: "stub-wallet-analytics-v1",
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    destinationCoolingOffHours: 24,
    iam2BaseUrl: "http://127.0.0.1:0",
    iam2InternalServiceToken: "test-iam2-internal-token-it",
    decisionTokenTtlMinutes: 5,
    aml1BaseUrl: "http://127.0.0.1:0",
    aml1InternalServiceToken: "test-aml1-internal-token-destrevocprivate-it",
    clt1FetchImpl: mustNotBeCalledFetch("CLT-01/P-ROSTER"),
    aml1FetchImpl: mustNotBeCalledFetch("AML-01"),
  };
  app = await buildApp(mainConfig);

  // Limits / Velocity / Concentration / First-Use — a single permissive client-default policy,
  // seeded once for the whole file (schema-owner provisioning fixture via superuser `verifyPool`,
  // never through a runtime route — this phase implements no policy-mutation API), so any fixture
  // decision bound to (OWNED_CLIENT_ID, wallet, ETH, ethereum, mainnet) can genuinely reach ALLOW.
  await verifyPool.query(
    `INSERT INTO wlt1.destination_limit_profile
       (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network,
        per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
     VALUES ('wlt1lp_destrevoc_permissive',1,$1,'wallet','ETH','ethereum','mainnet','1000000','1000000','1000000',24,'500000','active','test-approved')`,
    [OWNED_CLIENT_ID],
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

afterEach(async () => {
  if (!schemaReady) return;
  // Restore the default throw-if-called stubs — CONCURRENCY TEST 4 is the one test that
  // legitimately overrides these, and must never leak a real-success stub into any other test.
  mainConfig.clt1FetchImpl = mustNotBeCalledFetch("CLT-01/P-ROSTER");
  mainConfig.aml1FetchImpl = mustNotBeCalledFetch("AML-01");
  await verifyPool.query(
    `DELETE FROM wlt1.limit_evaluation WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = ANY($1))`,
    [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]],
  );
  await verifyPool.query(
    `DELETE FROM wlt1.destination_decision WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = ANY($1))`,
    [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]],
  );
  await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE client_id = ANY($1)`, [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = ANY($1))`, [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = ANY($1))`, [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = ANY($1)`, [[OWNED_CLIENT_ID, OTHER_CLIENT_ID]]);
});

// -------------------------------------------------------------------------------------------
// Fixtures — direct DB inserts. Neither revocation route joins `wallet_destination`
// (`lib/destination-revocation.ts`'s own `loadDestinationForRevocationUpdate` selects only from
// `wlt1.destination`), so a bare destination row (no wallet_destination row) is sufficient here —
// EXCEPT for the C-1 regression test, which exercises `verify-and-consume`
// (`loadDestinationEvalSnapshotForUpdate` DOES join `wallet_destination`) and therefore needs a
// real one, inserted explicitly in that test only.
// -------------------------------------------------------------------------------------------
async function insertDestinationFixture(overrides: { status?: string; clientId?: string; destinationStatusVersion?: number; whitelistVersion?: number; revocationEpoch?: number } = {}): Promise<{
  destinationId: string;
  clientId: string;
}> {
  const destinationId = "wlt1dest_revtest_" + randomUUID();
  const clientId = overrides.clientId ?? OWNED_CLIENT_ID;
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, destination_status_version, whitelist_version, revocation_epoch)
     VALUES ($1,$2,'wallet',$3,$4,$5,$6,$7)`,
    [destinationId, clientId, "hash_" + randomUUID(), overrides.status ?? "active", overrides.destinationStatusVersion ?? 1, overrides.whitelistVersion ?? 1, overrides.revocationEpoch ?? 0],
  );
  return { destinationId, clientId };
}

async function destinationRow(destinationId: string): Promise<Record<string, unknown>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  return r.rows[0];
}

async function evidenceRows(destinationId: string): Promise<Array<Record<string, unknown>>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.destination_revocation WHERE destination_id = $1 ORDER BY created_at_utc ASC`, [destinationId]);
  return r.rows;
}

function revoke(destinationId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/revoke`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: body,
  });
}

function revokeBody(clientId: string, overrides: Record<string, unknown> = {}) {
  return { client_id: clientId, actor_id: "staff_1", reason_code: "compromise", ...overrides };
}

function amlRevoke(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/internal/wlt1/aml-revocations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: body,
  });
}

function amlBody(clientId: string, destinationId: string, overrides: Record<string, unknown> = {}) {
  return { signal_id: "aml1sig_" + randomUUID(), signal_type: "confirmed_hit", client_id: clientId, destination_id: destinationId, ...overrides };
}

async function auditRows(destinationId: string): Promise<Array<{ payload: Record<string, unknown> }>> {
  const r = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_revoked' AND payload_ref LIKE $1 ORDER BY created_at_utc ASC`, [
    `%${destinationId}%`,
  ]);
  return r.rows.map((row) => ({ payload: JSON.parse(row.payload_ref) }));
}

/** Deterministic concurrency barrier: holds the destination row's own `FOR UPDATE` lock from an
 * INDEPENDENT connection. Both `routes/destination-revoke.ts`/`routes/aml-revocation.ts` and
 * (post-C-1-fix) `routes/decision-consume.ts` all take this same lock, so any of them genuinely
 * blocks while it is held — never a simulated/sequential race. */
async function holdDestinationRowLock(destinationId: string): Promise<{ release: () => Promise<void> }> {
  const holder = await verifyPool.connect();
  await holder.query("BEGIN");
  await holder.query(`SELECT 1 FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`, [destinationId]);
  return {
    release: async () => {
      await holder.query("COMMIT");
      holder.release();
    },
  };
}

/** Proves neither promise has settled within `waitMs` — the deterministic "genuinely blocked"
 * assertion this codebase's own established concurrency-test lesson requires (never a bare
 * `Promise.all` coin flip). */
async function assertNeitherSettled(promises: Array<Promise<unknown>>, waitMs = 300): Promise<void> {
  let settledCount = 0;
  for (const p of promises) {
    p.then(() => settledCount++).catch(() => settledCount++);
  }
  await sleep(waitMs);
  expect(settledCount, "expected both requests to still be blocked on the held lock").toBe(0);
}

describe("WLT-01 Destination Revocation + AML Revocation Signal Ingestion", () => {
  it("H-fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate through 059 + fnd/wlt1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) throw new Error("canary requires TEST_DATABASE_URL — must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: runtimeDbUrl });
    try {
      const r = await probe.query<{ current_user: string; rolsuper: boolean }>(`SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user`);
      expect(r.rows[0]?.current_user).toBe(RUNTIME_ROLE_USER);
      expect(r.rows[0]?.rolsuper).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("grants", () => {
    it("runtime role has SELECT+INSERT on destination_revocation, never UPDATE/DELETE", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema='wlt1' AND table_name='destination_revocation' AND grantee='role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
    });

    it("UPDATE/DELETE on destination_revocation is DENIED at the database (42501) for the restricted runtime role", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      const runtimePool = new Pool({ connectionString: runtimeDbUrl });
      try {
        await expect(runtimePool.query(`UPDATE wlt1.destination_revocation SET reason_detail = 'x' WHERE destination_id = $1`, [destinationId])).rejects.toThrow(/permission denied/);
        await expect(runtimePool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId])).rejects.toThrow(/permission denied/);
      } finally {
        await runtimePool.end();
      }
    });
  });

  describe("operator revocation — POST .../destinations/:destination_id/revoke", () => {
    it("unknown destination -> 404 WLT1_DESTINATION_NOT_FOUND, no write", async () => {
      if (!schemaReady) return;
      const res = await revoke("wlt1dest_totally_unknown", revokeBody(OWNED_CLIENT_ID));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("foreign-client destination -> the IDENTICAL 404 shape (no cross-client existence oracle), no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture({ clientId: OTHER_CLIENT_ID });
      const res = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
      const row = await destinationRow(destinationId);
      expect(row.status).toBe("active");
      expect(await evidenceRows(destinationId)).toHaveLength(0);
    });

    it.each(["draft", "pending_screening", "pending_review", "approved_pending_cooling", "active"])("every non-revoked source state (%s) is revocable", async (status) => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture({ status });
      const res = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.outcome).toBe("revoked");
      const row = await destinationRow(destinationId);
      expect(row.status).toBe("revoked");
    });

    it("first revoke: exact 9-key response, valid revocation_id, epoch+1, status_version+1, whitelist_version unchanged, exactly one evidence row, PostgreSQL-authoritative revoked_at_utc", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture({ destinationStatusVersion: 3, whitelistVersion: 5, revocationEpoch: 0 });
      const res = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID, { reason_detail: "device compromised" }));
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(Object.keys(body).sort()).toEqual(
        ["outcome", "evidence_recorded", "revocation_id", "destination_id", "client_id", "revocation_epoch", "destination_status_version", "revoked_at_utc", "signal_ref"].sort(),
      );
      expect(body.outcome).toBe("revoked");
      expect(body.evidence_recorded).toBe(true);
      expect(body.revocation_id).toMatch(REVOCATION_ID_REGEX);
      expect(body.destination_id).toBe(destinationId);
      expect(body.client_id).toBe(OWNED_CLIENT_ID);
      expect(body.revocation_epoch).toBe(1);
      expect(body.destination_status_version).toBe(4);
      expect(body.signal_ref).toBeNull();

      const row = await destinationRow(destinationId);
      expect(row.status).toBe("revoked");
      expect(row.revocation_epoch).toBe(1);
      expect(row.destination_status_version).toBe(4);
      expect(row.whitelist_version).toBe(5); // UNCHANGED — revocation never touches whitelist_version.

      const rows = await evidenceRows(destinationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.revocation_id).toBe(body.revocation_id);
      expect(rows[0]?.actor_id).toBe("staff_1");
      expect(rows[0]?.reason_code).toBe("compromise");
      expect(rows[0]?.reason_detail).toBe("device compromised");
      expect(rows[0]?.source).toBe("operator");
      expect((rows[0]?.revoked_at_utc as Date).toISOString()).toBe(body.revoked_at_utc);
    });

    it("operator repeat on an already-revoked destination: idempotent — exact null-evidence 9-key body, NO second write, NO second evidence row, still audited", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const first = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(first.statusCode).toBe(200);
      const rowAfterFirst = await destinationRow(destinationId);

      const second = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID, { actor_id: "staff_2", reason_code: "administrative" }));
      expect(second.statusCode).toBe(200);
      const body = second.json().data;
      expect(body).toEqual({
        outcome: "already_revoked",
        evidence_recorded: false,
        revocation_id: null,
        destination_id: destinationId,
        client_id: OWNED_CLIENT_ID,
        revocation_epoch: rowAfterFirst.revocation_epoch,
        destination_status_version: rowAfterFirst.destination_status_version,
        revoked_at_utc: null,
        signal_ref: null,
      });

      const rowAfterSecond = await destinationRow(destinationId);
      expect(rowAfterSecond).toEqual(rowAfterFirst);
      expect(await evidenceRows(destinationId)).toHaveLength(1);

      const audits = await auditRows(destinationId);
      expect(audits).toHaveLength(2);
      expect(audits[1]?.payload.metadata).toMatchObject({ outcome: "already_revoked", source: "operator", revocation_id: null, evidence_recorded: false, actor_id: "staff_2" });
    });
  });

  describe("AML revocation ingestion — POST /internal/wlt1/aml-revocations", () => {
    it("unknown destination -> 404 WLT1_DESTINATION_NOT_FOUND, no write", async () => {
      if (!schemaReady) return;
      const res = await amlRevoke(amlBody(OWNED_CLIENT_ID, "wlt1dest_totally_unknown"));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("client_id/destination_id mismatch -> the IDENTICAL 404 shape, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture({ clientId: OTHER_CLIENT_ID });
      const res = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
      expect(await evidenceRows(destinationId)).toHaveLength(0);
    });

    it("first signal on a non-revoked destination: outcome=revoked, evidence_recorded=true, signal_ref persisted, epoch+1, status_version+1", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture({ destinationStatusVersion: 1, revocationEpoch: 0 });
      const signalId = "aml1sig_" + randomUUID();
      const res = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId, signal_type: "confirmed_hit" }));
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.outcome).toBe("revoked");
      expect(body.evidence_recorded).toBe(true);
      expect(body.signal_ref).toBe(signalId);
      expect(body.revocation_epoch).toBe(1);
      expect(body.destination_status_version).toBe(2);

      const rows = await evidenceRows(destinationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.source).toBe("aml");
      expect(rows[0]?.reason_code).toBe("aml_risk_signal");
      expect(rows[0]?.actor_id).toBeNull();
      expect(rows[0]?.signal_type).toBe("confirmed_hit");
    });

    it("exact duplicate signal_ref: outcome=already_revoked, evidence_recorded=false, returns the ORIGINAL revocation_id/revoked_at_utc, no new row, versions unchanged", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const signalId = "aml1sig_" + randomUUID();
      const first = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId }));
      const firstBody = first.json().data;

      const second = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId, signal_type: "rescreen_overdue", reason_detail: "different detail, same signal" }));
      expect(second.statusCode).toBe(200);
      const secondBody = second.json().data;
      expect(secondBody.outcome).toBe("already_revoked");
      expect(secondBody.evidence_recorded).toBe(false);
      expect(secondBody.revocation_id).toBe(firstBody.revocation_id);
      expect(secondBody.revoked_at_utc).toBe(firstBody.revoked_at_utc);
      expect(secondBody.signal_ref).toBe(signalId);
      expect(secondBody.revocation_epoch).toBe(firstBody.revocation_epoch);
      expect(secondBody.destination_status_version).toBe(firstBody.destination_status_version);

      expect(await evidenceRows(destinationId)).toHaveLength(1);
    });

    it("new signal_ref against an already-revoked destination: outcome=already_revoked, evidence_recorded=true, NEW revocation_id/revoked_at_utc, versions unchanged, second evidence row exists", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const opRevoke = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      const opBody = opRevoke.json().data;

      const newSignalId = "aml1sig_" + randomUUID();
      const res = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: newSignalId, signal_type: "potential_match_unresolved" }));
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.outcome).toBe("already_revoked");
      expect(body.evidence_recorded).toBe(true);
      expect(body.revocation_id).not.toBe(opBody.revocation_id);
      expect(body.signal_ref).toBe(newSignalId);
      expect(body.revocation_epoch).toBe(opBody.revocation_epoch);
      expect(body.destination_status_version).toBe(opBody.destination_status_version);

      const rows = await evidenceRows(destinationId);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.source).sort()).toEqual(["aml", "operator"]);
    });

    it("misbound signal_ref (already names evidence for a DIFFERENT destination): -> the IDENTICAL 404 shape, never disclosed as a duplicate, no new row for the misbound target, original untouched", async () => {
      if (!schemaReady) return;
      const { destinationId: destA } = await insertDestinationFixture();
      const { destinationId: destB } = await insertDestinationFixture();
      const signalId = "aml1sig_" + randomUUID();
      const first = await amlRevoke(amlBody(OWNED_CLIENT_ID, destA, { signal_id: signalId }));
      expect(first.statusCode).toBe(200);

      const misbound = await amlRevoke(amlBody(OWNED_CLIENT_ID, destB, { signal_id: signalId }));
      expect(misbound.statusCode).toBe(404);
      expect(misbound.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");

      expect(await evidenceRows(destA)).toHaveLength(1);
      expect(await evidenceRows(destB)).toHaveLength(0);
      const rowB = await destinationRow(destB);
      expect(rowB.status).toBe("active");
    });

    it("response never leaks address/natural_key_hash/token/PII — exactly the frozen 9 keys, nothing more", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const res = await amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId));
      const raw = JSON.stringify(res.json().data);
      for (const forbidden of ["address", "natural_key_hash", "token_hash", "decision_token", "poc_challenge_id"]) {
        expect(raw).not.toContain(forbidden);
      }
    });
  });

  describe("audit failure rollback", () => {
    it("forced audit-INSERT failure on first operator revoke -> 503 WLT1_AUDIT_REQUIRED; destination/evidence fully rolled back; retry succeeds cleanly", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const before = await destinationRow(destinationId);

      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      expect(await destinationRow(destinationId)).toEqual(before);
      expect(await evidenceRows(destinationId)).toHaveLength(0);

      const retry = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.outcome).toBe("revoked");
    }, 30_000);
  });

  describe("decision effect — 4A-3 verify / 4B consume observe revocation via the EXISTING evaluator, no bulk mutation", () => {
    async function insertUnhostedDestinationWithWallet(): Promise<{ destinationId: string }> {
      const destinationId = "wlt1dest_revdeceffect_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, destination_status_version, whitelist_version, revocation_epoch)
         VALUES ($1,$2,'wallet',$3,'active',1,1,0)`,
        [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, memo_tag_identity, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1,'ethereum','mainnet',$2,$3,'',1,'hosted','self')`,
        [destinationId, "0x" + randomUUID().replace(/-/g, "").padEnd(40, "0").slice(0, 40), "ah_" + randomUUID()],
      );
      return { destinationId };
    }

    async function insertIssuedDecision(destinationId: string, overrides: Record<string, unknown> = {}): Promise<{ decisionId: string; rawToken: string }> {
      const decisionId = mintDecisionId();
      const rawToken = mintDecisionToken();
      const now = new Date();
      const bound = overrides.amount !== null;
      await verifyPool.query(
        `INSERT INTO wlt1.destination_decision
           (decision_id, token_hash, destination_id, client_id, requested_action, decision,
            aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
            destination_status_version, whitelist_version, revocation_epoch, chain, network,
            destination_type, issued_at_utc, expires_at_utc, status, consumed_at_utc, consumption_id, execution_ref,
            amount, asset_or_currency, limits_version, client_limit_profile_id, client_limit_profile_version)
         VALUES ($1,$2,$3,$4,'destination_use','allow',$5,$6,$7,NULL,1,1,0,'ethereum','mainnet','wallet',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          decisionId,
          hashToken(rawToken),
          destinationId,
          OWNED_CLIENT_ID,
          "aml1ptd_" + randomUUID(),
          new Date(now.getTime() + 3600_000).toISOString(),
          "wlt1screen_" + randomUUID(),
          now.toISOString(),
          new Date(now.getTime() + 300_000).toISOString(),
          overrides.status ?? "issued",
          overrides.consumedAtUtc ?? null,
          overrides.consumptionId ?? null,
          overrides.executionRef ?? null,
          bound ? "40" : null,
          bound ? "ETH" : null,
          bound ? 0 : null,
          bound ? "wlt1lp_destrevoc_permissive" : null,
          bound ? 1 : null,
        ],
      );
      return { decisionId, rawToken };
    }

    function verifyDecision(decisionId: string, destinationId: string, rawToken: string) {
      return app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/${decisionId}/verify`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: { decision_token: rawToken, client_id: OWNED_CLIENT_ID, destination_id: destinationId, requested_action: "destination_use" },
      });
    }

    function consumeDecision(decisionId: string, destinationId: string, rawToken: string, executionRef: string) {
      return app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/${decisionId}/verify-and-consume`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: {
          decision_token: rawToken,
          client_id: OWNED_CLIENT_ID,
          destination_id: destinationId,
          requested_action: "destination_use",
          execution_ref: executionRef,
          caller_module: "TEST",
          amount: "40",
          asset_or_currency: "ETH",
        },
      });
    }

    it("an issued decision is valid via verify BEFORE revocation, and becomes reason_code=revoked via verify AFTER revocation — no destination_decision row was ever mutated by revoke", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertUnhostedDestinationWithWallet();
      const { decisionId, rawToken } = await insertIssuedDecision(destinationId);
      const decisionRowBefore = (await verifyPool.query(`SELECT * FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId])).rows[0];

      const beforeRevoke = await verifyDecision(decisionId, destinationId, rawToken);
      expect(beforeRevoke.json().data.valid).toBe(true);

      const rev = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(rev.statusCode).toBe(200);

      const afterRevoke = await verifyDecision(decisionId, destinationId, rawToken);
      expect(afterRevoke.json().data.valid).toBe(false);
      expect(afterRevoke.json().data.reason_code).toBe("revoked");

      const decisionRowAfter = (await verifyPool.query(`SELECT * FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId])).rows[0];
      expect(decisionRowAfter).toEqual(decisionRowBefore); // untouched by revoke — no bulk mutation.
    });

    it("verify-and-consume denies with reason_code=revoked for an issued (never-consumed) decision AFTER revocation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertUnhostedDestinationWithWallet();
      const { decisionId, rawToken } = await insertIssuedDecision(destinationId);
      await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));

      const res = await consumeDecision(decisionId, destinationId, rawToken, "exec_" + randomUUID());
      expect(res.statusCode).toBe(200);
      expect(res.json().data.consumed).toBe(false);
      expect(res.json().data.reason_code).toBe("revoked");

      const row = (await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId])).rows[0];
      expect(row.status).toBe("issued"); // never transitioned to consumed.
    });

    it("an ALREADY-consumed decision's SAME-execution_ref replay still returns replay:true AFTER the destination is later revoked — historical evidence survives", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertUnhostedDestinationWithWallet();
      const { decisionId, rawToken } = await insertIssuedDecision(destinationId);
      const executionRef = "exec_" + randomUUID();

      const firstConsume = await consumeDecision(decisionId, destinationId, rawToken, executionRef);
      expect(firstConsume.json().data.consumed).toBe(true);
      expect(firstConsume.json().data.replay).toBe(false);

      const rev = await revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      expect(rev.statusCode).toBe(200);

      const replay = await consumeDecision(decisionId, destinationId, rawToken, executionRef);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.consumed).toBe(true);
      expect(replay.json().data.replay).toBe(true);
      expect(replay.json().data.consumption_id).toBe(firstConsume.json().data.consumption_id);
    });
  });

  describe("genuine concurrency — real PostgreSQL lock contention, never a Promise.all coin flip", () => {
    it("CONCURRENCY 1 (human/human): two simultaneous operator revokes -> exactly one first revocation, one already_revoked; epoch/status_version each increment exactly once; exactly one evidence row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const lock = await holdDestinationRowLock(destinationId);

      const p1 = revoke(destinationId, revokeBody(OWNED_CLIENT_ID, { actor_id: "staff_a" }));
      const p2 = revoke(destinationId, revokeBody(OWNED_CLIENT_ID, { actor_id: "staff_b" }));
      await assertNeitherSettled([p1, p2]);
      await lock.release();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      const outcomes = [r1.json().data.outcome, r2.json().data.outcome].sort();
      expect(outcomes).toEqual(["already_revoked", "revoked"]);

      const row = await destinationRow(destinationId);
      expect(row.revocation_epoch).toBe(1);
      expect(row.destination_status_version).toBe(2);
      expect(await evidenceRows(destinationId)).toHaveLength(1);

      const audits = await auditRows(destinationId);
      expect(audits).toHaveLength(2);
    });

    it("CONCURRENCY 2 (AML/AML same signal): two simultaneous identical AML signals -> exactly one evidence row, one transition, one revocation_id; second returns the original receipt", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const signalId = "aml1sig_" + randomUUID();
      const lock = await holdDestinationRowLock(destinationId);

      const p1 = amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId }));
      const p2 = amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId }));
      await assertNeitherSettled([p1, p2]);
      await lock.release();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      const bodies = [r1.json().data, r2.json().data];
      const revocationIds = new Set(bodies.map((b) => b.revocation_id));
      expect(revocationIds.size).toBe(1); // identical revocation_id on both responses.

      const row = await destinationRow(destinationId);
      expect(row.revocation_epoch).toBe(1);
      expect(row.destination_status_version).toBe(2);
      expect(await evidenceRows(destinationId)).toHaveLength(1);
    });

    it("CONCURRENCY 3 (human/AML): simultaneous operator revoke + AML signal -> destination ends revoked, epoch/status_version each increment exactly once, evidence rows match the actual winner", async () => {
      if (!schemaReady) return;
      const { destinationId } = await insertDestinationFixture();
      const signalId = "aml1sig_" + randomUUID();
      const lock = await holdDestinationRowLock(destinationId);

      const pOperator = revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      const pAml = amlRevoke(amlBody(OWNED_CLIENT_ID, destinationId, { signal_id: signalId }));
      await assertNeitherSettled([pOperator, pAml]);
      await lock.release();

      const [operatorRes, amlRes] = await Promise.all([pOperator, pAml]);
      expect(operatorRes.statusCode).toBe(200);
      expect(amlRes.statusCode).toBe(200);

      const row = await destinationRow(destinationId);
      expect(row.status).toBe("revoked");
      expect(row.revocation_epoch).toBe(1);
      expect(row.destination_status_version).toBe(2);

      const rows = await evidenceRows(destinationId);
      const outcomes = [operatorRes.json().data.outcome, amlRes.json().data.outcome];
      if (outcomes[0] === "revoked" && outcomes[1] === "already_revoked") {
        // Operator won: AML's new evidence is recorded against an already-revoked destination.
        expect(rows).toHaveLength(2);
        expect(amlRes.json().data.evidence_recorded).toBe(true);
      } else if (outcomes[0] === "already_revoked" && outcomes[1] === "revoked") {
        // AML won: operator's repeat is a pure idempotent no-op, no second evidence row.
        expect(rows).toHaveLength(1);
        expect(operatorRes.json().data.evidence_recorded).toBe(false);
      } else {
        throw new Error(`unexpected outcome combination: ${JSON.stringify(outcomes)}`);
      }
    });

    it("CONCURRENCY 4 (revoke/evaluate-use): simultaneous revoke + evaluate-use genuinely contend for the destination row lock (evaluate-use's own pre-existing TX-B re-check already takes loadDestinationEvalSnapshotForUpdate — proven here to be real, not merely asserted); either evaluate-use issues a decision and revocation follows, or revocation wins and evaluate-use denies state_changed_during_evaluation — no post-revocation issuable authority", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_c4evaluse_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, destination_status_version, whitelist_version, revocation_epoch)
         VALUES ($1,$2,'wallet',$3,'active',1,1,0)`,
        [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, memo_tag_identity, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1,'ethereum','mainnet',$2,$3,'',1,'hosted','self')`,
        [destinationId, "0x" + randomUUID().replace(/-/g, "").padEnd(40, "0").slice(0, 40), "ah_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result
           (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, valid_until_utc)
         VALUES ($1,$2,1,'stub-wallet-analytics-v1','v1','ethereum','mainnet',$3,'clear', now() + interval '1 hour')`,
        ["wlt1screen_c4evaluse_" + randomUUID(), destinationId, "ah_" + randomUUID()],
      );

      // The ONE test in this file that legitimately needs P-ROSTER/AML-01 to succeed — evaluate-use
      // cannot reach its own locked TX-B otherwise. Restored to throw-if-called by `afterEach`.
      mainConfig.clt1FetchImpl = clt1RosterOkFetch(OWNED_CLIENT_ID);
      mainConfig.aml1FetchImpl = aml1AllowFetch(OWNED_CLIENT_ID);

      const lock = await holdDestinationRowLock(destinationId);
      const pRevoke = revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      const pEvaluateUse = app.inject({
        method: "POST",
        url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "TEST", amount: "40", asset_or_currency: "ETH" },
      });
      // Load-bearing: evaluate-use's pre-existing TX-B ALSO takes the destination row's own
      // FOR UPDATE lock (`loadDestinationEvalSnapshotForUpdate`, unchanged since Phase 4A-2) — so it
      // genuinely blocks here too, same barrier proof as CONCURRENCY 5's C-1 regression.
      await assertNeitherSettled([pRevoke, pEvaluateUse]);
      await lock.release();

      const [revokeRes, evaluateUseRes] = await Promise.all([pRevoke, pEvaluateUse]);
      expect(revokeRes.statusCode).toBe(200);
      expect(evaluateUseRes.statusCode).toBe(200);

      const finalDestRow = await destinationRow(destinationId);
      expect(finalDestRow.status).toBe("revoked");
      expect(finalDestRow.revocation_epoch).toBe(1); // single increment regardless of winner.

      const evalData = evaluateUseRes.json().data;
      if (evalData.decision === "allow") {
        // evaluate-use won the destination lock first, issued a decision against pre-revocation
        // state; revocation then proceeded normally afterward.
        expect(revokeRes.json().data.outcome).toBe("revoked");
      } else {
        // Revocation won; evaluate-use's own locked TX-B re-check observed it and denied — no
        // post-revocation authority was ever issuable.
        expect(evalData.decision).toBe("deny");
        expect(evalData.reason_code).toBe("state_changed_during_evaluation");
      }
    }, 15_000);

    it("CONCURRENCY 5 / C-1 REGRESSION: simultaneous revoke + verify-and-consume genuinely contend for the destination row lock (proves the C-1 fix is real — without it, consume would not block here at all); either the consumption succeeds and revocation follows, or revocation wins and consumption is denied reason_code=revoked — never both a committed revocation AND a NEW consumption based on stale unlocked state", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_c1regr_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, destination_status_version, whitelist_version, revocation_epoch)
         VALUES ($1,$2,'wallet',$3,'active',1,1,0)`,
        [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, memo_tag_identity, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1,'ethereum','mainnet',$2,$3,'',1,'hosted','self')`,
        [destinationId, "0x" + randomUUID().replace(/-/g, "").padEnd(40, "0").slice(0, 40), "ah_" + randomUUID()],
      );
      const decisionId = mintDecisionId();
      const rawToken = mintDecisionToken();
      const now = new Date();
      await verifyPool.query(
        `INSERT INTO wlt1.destination_decision
           (decision_id, token_hash, destination_id, client_id, requested_action, decision,
            aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
            destination_status_version, whitelist_version, revocation_epoch, chain, network,
            destination_type, issued_at_utc, expires_at_utc, status, consumed_at_utc, consumption_id, execution_ref,
            amount, asset_or_currency, limits_version, client_limit_profile_id, client_limit_profile_version)
         VALUES ($1,$2,$3,$4,'destination_use','allow',$5,$6,$7,NULL,1,1,0,'ethereum','mainnet','wallet',$8,$9,'issued',NULL,NULL,NULL,'40','ETH',0,'wlt1lp_destrevoc_permissive',1)`,
        [
          decisionId,
          hashToken(rawToken),
          destinationId,
          OWNED_CLIENT_ID,
          "aml1ptd_" + randomUUID(),
          new Date(now.getTime() + 3600_000).toISOString(),
          "wlt1screen_" + randomUUID(),
          now.toISOString(),
          new Date(now.getTime() + 300_000).toISOString(),
        ],
      );

      const lock = await holdDestinationRowLock(destinationId);
      const pRevoke = revoke(destinationId, revokeBody(OWNED_CLIENT_ID));
      const pConsume = app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/${decisionId}/verify-and-consume`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: {
          decision_token: rawToken,
          client_id: OWNED_CLIENT_ID,
          destination_id: destinationId,
          requested_action: "destination_use",
          execution_ref: "exec_c1_" + randomUUID(),
          caller_module: "TEST",
          amount: "40",
          asset_or_currency: "ETH",
        },
      });
      // The load-bearing assertion: post-C-1-fix, verify-and-consume ALSO takes the destination
      // row's own FOR UPDATE lock — so it genuinely blocks here too. Before the fix, this request
      // would settle almost immediately (its unlocked SELECT does not wait), failing this
      // assertion and exposing the regression.
      await assertNeitherSettled([pRevoke, pConsume]);
      await lock.release();

      const [revokeRes, consumeRes] = await Promise.all([pRevoke, pConsume]);
      expect(revokeRes.statusCode).toBe(200);
      expect(consumeRes.statusCode).toBe(200);

      const finalDestRow = await destinationRow(destinationId);
      const finalDecisionRow = (await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId])).rows[0];

      expect(finalDestRow.status).toBe("revoked");
      expect(finalDestRow.revocation_epoch).toBe(1); // single increment regardless of winner.
      expect(finalDestRow.destination_status_version).toBe(2);

      if (finalDecisionRow.status === "consumed") {
        // Consume acquired the destination lock first, saw pre-revocation state, and legitimately
        // consumed; revocation then proceeded normally afterward.
        expect(consumeRes.json().data.consumed).toBe(true);
        expect(revokeRes.json().data.outcome).toBe("revoked");
      } else {
        // Revocation committed first (or consume's own locked read observed the committed
        // revocation); consume correctly denies — the forbidden C-1 outcome (a NEW consumption
        // succeeding despite a concurrently-committed revocation) never occurs.
        expect(finalDecisionRow.status).toBe("issued");
        expect(consumeRes.json().data.consumed).toBe(false);
        expect(consumeRes.json().data.reason_code).toBe("revoked");
      }
    }, 15_000);
  });
});
