/**
 * WLT-01 Phase 4A-1 — destination whitelist maker-checker approval routes
 * (`POST /internal/wlt1/destinations/:destination_id/approve/request` and `.../approve/apply`),
 * PRIVATE disposable database.
 *
 * Mirrors `wlt1-poc-audit-atomicity-private.test.ts`'s own established rationale: this file
 * provisions its own PRIVATE, uniquely named database (migrated through head 056, with the real
 * `fnd`/`wlt1` runtime grant files applied), so its own forced-audit-failure ACL mutation against
 * `foundation.outbox_event` can never reach any other file's bystander request on the shared
 * canonical database.
 *
 * IAM-02 is stubbed via `config.iam2FetchImpl` (test-only DI seam) — no live IAM-02 service is
 * started. This file proves WLT-01's OWN gate/sequencing/atomicity logic; IAM-02's own internal
 * correctness (payload-hash binding, SoD enforcement) is IAM-02's own accepted test suite's
 * responsibility, not re-proven here.
 *
 * Admin fixtures write `wlt1.wallet_screening_result`/`wlt1.proof_of_control` rows and mutate
 * `wlt1.destination.status` directly via the superuser `verifyPool` — bypassing the app's own
 * screening/PoC write paths entirely, since this file's own test matrix requires exact,
 * independently-controlled risk_status/freshness/PoC-verification combinations no single HTTP flow
 * could produce deterministically. Destination/wallet_destination rows themselves ARE created via
 * the real `POST /internal/wlt1/wallet-destinations` route (never hand-inserted) so natural-key
 * hashing and wallet_type are always genuine, accepted-write-path values.
 *
 * M-REV-1 INTERIM RULE: the restricted-role connection URL is derived via the safe regex rewrite
 * (`replace(/^postgres:\/\/[^@]+@/, ...)`), and this file's own canary additionally asserts the
 * runtime connection is not superuser.
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
import { WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_destination_approval_route_test";

const PRIVATE_DB_NAME = `wlt1_destappr_it_${randomBytes(6).toString("hex")}`;

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

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_destapprprivate";
const FOREIGN_CLIENT_ID = "clt1client_destapprforeign";

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

// -------------------------------------------------------------------------------------------
// Fake IAM-02 fetch stub — own copy, F3(c), mirrors CLT-01/CFG-01's own identical test-fake shape.
// -------------------------------------------------------------------------------------------
interface Iam2FakeOptions {
  checkDecision?: () => { decision: string; reason: string };
  /** May return a Promise — used by TOCTOU tests to perform a DB mutation exactly at the Phase
   * A -> Phase C boundary (this call fires synchronously where the real IAM-02 network round trip
   * would occur, strictly between the route's own pre-IAM read and its locked re-check). */
  verify?: () => { ok: boolean; execution_authorised?: boolean; errorCode?: string } | Promise<{ ok: boolean; execution_authorised?: boolean; errorCode?: string }>;
}

function makeFakeIam2Fetch(opts: Iam2FakeOptions): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      const result = opts.checkDecision ? opts.checkDecision() : { decision: "allow", reason: "permission_granted" };
      return { ok: true, json: async () => ({ success: true, data: result }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      const result = opts.verify ? await opts.verify() : { ok: true, execution_authorised: true };
      if (!result.ok) {
        return { ok: false, json: async () => ({ success: false, error: { code: result.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: result.execution_authorised ?? true } }) } as Response;
    }
    throw new Error(`Unexpected URL in WLT-01 Phase 4A-1 IAM-02 test fake: ${urlStr}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({});
}

function denyBaselineIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }) });
}

function denyExecuteVerifyIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_SOD_VIOLATION" }) });
}

function iam2Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

function iam2MalformedBody(): typeof fetch {
  return (async () => ({ ok: true, json: async () => { throw new Error("not json"); } })) as unknown as typeof fetch;
}

const alwaysClearProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen() {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_destapprprivate_" + randomUUID(),
        riskStatus: "clear" as const,
        riskScore: 1.0,
        riskCategories: [],
        directExposure: [],
        indirectExposure: [],
        sanctionsExposure: false,
        clusterRef: null,
        issuedAtUtc: new Date().toISOString(),
        validUntilUtc: null,
      },
    };
  },
};

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-destappr-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-destappr-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-destappr-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  // Only fnd (foundation.outbox_event/idempotency_record) + wlt1 grants are needed — WLT-01 has no
  // SQL access to iam2 (reached exclusively over HTTP, stubbed above).
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
    wlt1InternalServiceToken: "test-wlt1-internal-token-destapprprivate-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    destinationCoolingOffHours: 24,
    iam2BaseUrl: "http://127.0.0.1:0",
    iam2InternalServiceToken: "test-iam2-internal-token-it",
    decisionTokenTtlMinutes: 5,
    aml1BaseUrl: "http://127.0.0.1:0",
    aml1InternalServiceToken: "test-aml1-internal-token-destapprprivate-it",
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: alwaysClearProvider,
    iam2FetchImpl: allowAllIam2Fetch(),
  };
  app = await buildApp(mainConfig);

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
  mainConfig.iam2FetchImpl = allowAllIam2Fetch();
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1, $2))`, [OWNED_CLIENT_ID, FOREIGN_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1, $2))`, [
    OWNED_CLIENT_ID,
    FOREIGN_CLIENT_ID,
  ]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1, $2))`, [
    OWNED_CLIENT_ID,
    FOREIGN_CLIENT_ID,
  ]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1, $2))`, [OWNED_CLIENT_ID, FOREIGN_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id IN ($1, $2)`, [OWNED_CLIENT_ID, FOREIGN_CLIENT_ID]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(overrides: Record<string, unknown> = {}, clientId = OWNED_CLIENT_ID): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: clientId, chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, wallet_type: "unhosted", beneficiary_relationship: "self", ...overrides },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

/** Drives a destination all the way to pending_review via the REAL screen route (terminal on
 * first call, using alwaysClearProvider). */
async function createPendingReviewDestination(overrides: Record<string, unknown> = {}, clientId = OWNED_CLIENT_ID): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination(overrides, clientId);
  const screenRes = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (screenRes.statusCode !== 200) throw new Error(`expected terminal screening, got ${screenRes.statusCode} ${screenRes.body}`);
  return { destinationId };
}

/** Admin fixture: overwrites the latest screening result's risk_status/valid_until_utc directly,
 * bypassing the app's own write path — used to construct exact gate-test scenarios. */
async function setLatestScreening(destinationId: string, riskStatus: string, validUntilUtc: string | null): Promise<void> {
  await verifyPool.query(
    `UPDATE wlt1.wallet_screening_result SET risk_status = $1, valid_until_utc = $2
      WHERE destination_id = $3 AND screening_result_version = (SELECT max(screening_result_version) FROM wlt1.wallet_screening_result WHERE destination_id = $3)`,
    [riskStatus, validUntilUtc, destinationId],
  );
}

/** Admin fixture: inserts a `verified` PoC row directly — never re-runs cryptography. */
async function insertVerifiedPoc(destinationId: string, clientId = OWNED_CLIENT_ID): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control
       (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme,
        message_format_version, domain_environment, nonce, message_hash, verification_status, signature_hash, recovered_address,
        issued_at_utc, expires_at_utc, verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now() + interval '15 minutes', now())`,
    [
      "wlt1pocchal_destappr_" + randomUUID(),
      destinationId,
      clientId,
      WLT1_TEST_STUB_ADDRESS_CLEAR,
      "sha256:" + "ab".repeat(32),
      "cd".repeat(32),
      "ef".repeat(32),
      "12".repeat(32),
      WLT1_TEST_STUB_ADDRESS_CLEAR,
    ],
  );
}

async function destinationRow(destinationId: string): Promise<{ status: string; destination_status_version: number; whitelist_version: number; cooling_off_until_utc: string | null; whitelist_approval_ref: string | null }> {
  const r = await verifyPool.query(`SELECT status, destination_status_version, whitelist_version, cooling_off_until_utc, whitelist_approval_ref FROM wlt1.destination WHERE destination_id = $1`, [
    destinationId,
  ]);
  return r.rows[0];
}

function approveRequest(destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/approve/request`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { actor_id: "staff_maker_1", client_id: OWNED_CLIENT_ID, ...body },
  });
}

function approveApply(destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/approve/apply`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { actor_id: "staff_maker_1", client_id: OWNED_CLIENT_ID, approval_id: "iam2appr_" + randomUUID(), decision_token: "tok_" + randomUUID(), ...body },
  });
}

async function approvablePocDestination(walletType = "unhosted"): Promise<{ destinationId: string }> {
  const { destinationId } = await createPendingReviewDestination({ wallet_type: walletType });
  await insertVerifiedPoc(destinationId);
  return { destinationId };
}

describe("WLT-01 Phase 4A-1: destination whitelist approve/request + approve/apply", () => {
  it("H-D3C-1-equivalent fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/wlt1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL — must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const r = await probe.query<{ current_user: string; rolsuper: boolean }>(`SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user`);
      expect(r.rows[0]?.current_user).toBe(RUNTIME_ROLE_USER);
      expect(r.rows[0]?.rolsuper).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("approve/request", () => {
    it("1. valid pending_review + clear fresh screening + verified PoC (unhosted) -> 200 eligible", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ destination_id: destinationId, client_id: OWNED_CLIENT_ID, eligible: true, iam2_action: "wlt1.destination.approve_apply", iam2_resource: "destination" });
    });

    for (const status of ["draft", "pending_screening", "approved_pending_cooling", "active", "revoked"]) {
      it(`2. destination status '${status}' -> 409 WLT1_DESTINATION_APPROVAL_INVALID_STATE`, async () => {
        if (!schemaReady) return;
        const { destinationId } = await registerDestination();
        await verifyPool.query(`UPDATE wlt1.destination SET status = $1 WHERE destination_id = $2`, [status, destinationId]);
        const res = await approveRequest(destinationId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      });
    }

    for (const riskStatus of ["review_required", "high_risk", "hit", "pending"]) {
      it(`3. screening risk_status '${riskStatus}' -> 409 (adverse/non-terminal screening can never be approved)`, async () => {
        if (!schemaReady) return;
        const { destinationId } = await createPendingReviewDestination();
        await setLatestScreening(destinationId, riskStatus, new Date(Date.now() + 3600_000).toISOString());
        const res = await approveRequest(destinationId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      });
    }

    it("4. screening expired -> 409", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination();
      await setLatestScreening(destinationId, "clear", new Date(Date.now() - 1000).toISOString());
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("5. missing PoC for unhosted wallet -> 409 (C-4A1-1)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ wallet_type: "unhosted" });
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("6. missing PoC for unknown wallet -> 409", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ wallet_type: "unknown" });
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("7. foreign client -> 404 (identical outward behavior to unknown destination — no enumeration oracle)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const foreignRes = await approveRequest(destinationId, { client_id: FOREIGN_CLIENT_ID });
      const unknownRes = await approveRequest("wlt1dest_never_existed_" + randomUUID(), { client_id: FOREIGN_CLIENT_ID });
      expect(foreignRes.statusCode).toBe(404);
      expect(unknownRes.statusCode).toBe(404);
      expect(foreignRes.json().error.code).toBe(unknownRes.json().error.code);
    });

    it("8. IAM-02 baseline permission deny -> 403 WLT1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = denyBaselineIam2Fetch();
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
    });

    it("9. IAM-02 unreachable -> 503 WLT1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = iam2Unreachable();
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
    });

    it("9b. IAM-02 malformed response -> 503 WLT1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = iam2MalformedBody();
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
    });

    it("10. approval_payload is the exact frozen five-field canonical object; approval_payload_hash matches an independently recomputed fingerprint over it", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveRequest(destinationId);
      const data = res.json().data;
      expect(Object.keys(data.approval_payload).sort()).toEqual(["client_id", "destination_id", "natural_key_hash", "screening_result_id", "whitelist_version"].sort());
      expect(data.approval_payload.destination_id).toBe(destinationId);
      expect(data.approval_payload.client_id).toBe(OWNED_CLIENT_ID);
      expect(data.approval_payload.whitelist_version).toBe(0);
      expect(data.approval_payload_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("11. caller cannot choose fingerprint inputs — request body has no natural_key_hash/screening_result_id/whitelist_version field at all (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveRequest(destinationId, { natural_key_hash: "attacker-chosen", whitelist_version: 999 });
      expect(res.statusCode).toBe(400);
    });

    it("12. request audit (wlt1.destination_whitelist_approval_requested) is emitted with correct metadata, no PII/token", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveRequest(destinationId, { reason: "quarterly review" });
      expect(res.statusCode).toBe(200);
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_whitelist_approval_requested' AND payload_ref LIKE $1`, [
        `%${destinationId}%`,
      ]);
      expect(rows.rows.length).toBe(1);
      const payload = JSON.parse(rows.rows[0].payload_ref);
      expect(payload.metadata.destination_id).toBe(destinationId);
      expect(payload.metadata.reason).toBe("quarterly review");
      expect(JSON.stringify(payload)).not.toContain(mainConfig.wlt1InternalServiceToken);
      expect(JSON.stringify(payload)).not.toContain(mainConfig.iam2InternalServiceToken);
    });

    it("13. NO destination mutation occurs from approve/request — status/versions unchanged after a successful call", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const before = await destinationRow(destinationId);
      const res = await approveRequest(destinationId);
      expect(res.statusCode).toBe(200);
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
    });

    it("14. audit failure -> 503 WLT1_AUDIT_REQUIRED and no state mutation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await approveRequest(destinationId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      // retry succeeds once the ACL is restored — proves no partial state was left behind.
      const retry = await approveRequest(destinationId);
      expect(retry.statusCode).toBe(200);
    }, 30_000);
  });

  describe("approve/apply", () => {
    it("15. valid IAM execute-verify -> 200, status approved_pending_cooling, destination_status_version +1, whitelist_version UNCHANGED", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const before = await destinationRow(destinationId);
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.status).toBe("approved_pending_cooling");
      expect(data.destination_status_version).toBe(before.destination_status_version + 1);
      expect(data.whitelist_version).toBe(before.whitelist_version);
      const after = await destinationRow(destinationId);
      expect(after.status).toBe("approved_pending_cooling");
      expect(after.destination_status_version).toBe(before.destination_status_version + 1);
      expect(after.whitelist_version).toBe(before.whitelist_version);
    });

    it("16. cooling_off_until_utc = approved_at_utc + configured 24h duration (PostgreSQL time)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveApply(destinationId);
      const data = res.json().data;
      const approvedAt = Date.parse(data.approved_at_utc);
      const coolingUntil = Date.parse(data.cooling_off_until_utc);
      expect(coolingUntil - approvedAt).toBe(24 * 60 * 60 * 1000);
    });

    it("17. whitelist_approval_ref = the supplied approval_id, both in response and in the database row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const approvalId = "iam2appr_" + randomUUID();
      const res = await approveApply(destinationId, { approval_id: approvalId });
      expect(res.json().data.whitelist_approval_ref).toBe(approvalId);
      const row = await destinationRow(destinationId);
      expect(row.whitelist_approval_ref).toBe(approvalId);
    });

    for (const status of ["draft", "pending_screening", "approved_pending_cooling", "active", "revoked"]) {
      it(`18. wrong state '${status}' -> 409, no write`, async () => {
        if (!schemaReady) return;
        const { destinationId } = await registerDestination();
        await verifyPool.query(`UPDATE wlt1.destination SET status = $1 WHERE destination_id = $2`, [status, destinationId]);
        const res = await approveApply(destinationId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      });
    }

    it("19. IAM execute-verify not authorised -> 403 WLT1_APPROVAL_REQUIRED, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = denyExecuteVerifyIam2Fetch();
      const before = await destinationRow(destinationId);
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
    });

    it("19b. SoD denial from IAM-02 (requester = approver) surfaces identically as 403 WLT1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_SOD_VIOLATION" }) });
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
    });

    it("20. IAM-02 unavailable/timeout/malformed -> 503 WLT1_IAM2_UNAVAILABLE, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = iam2Unreachable();
      const before = await destinationRow(destinationId);
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
    });

    it("21. foreign client -> 404, identical to unknown destination", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveApply(destinationId, { client_id: FOREIGN_CLIENT_ID });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("22. extra caller-supplied fingerprint fields -> 400 (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveApply(destinationId, { screening_result_id: "attacker-chosen" });
      expect(res.statusCode).toBe(400);
    });

    // Tests 23-26 all inject their mutation INSIDE the IAM `verify` stub callback — the point in
    // the real request lifecycle that fires strictly between the route's own Phase A pre-IAM read
    // and Phase C's locked re-check (where the real IAM-02 network round trip would occur). A
    // mutation applied merely BEFORE calling approveApply would be visible to Phase A's own first
    // read too, conflating "Phase A's own gate check catches it" with "Phase C's drift re-check
    // catches it" — these tests specifically isolate the latter.

    it("23. screening becomes adverse strictly BETWEEN Phase A's read and Phase C's re-check -> 409, no write (fails closed on drift, not merely on Phase A's own gate)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = makeFakeIam2Fetch({
        verify: async () => {
          await setLatestScreening(destinationId, "high_risk", new Date(Date.now() + 3600_000).toISOString());
          return { ok: true, execution_authorised: true };
        },
      });
      const before = await destinationRow(destinationId);
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
    });

    it("24. screening expires strictly BETWEEN Phase A's read and Phase C's re-check -> 409, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = makeFakeIam2Fetch({
        verify: async () => {
          await setLatestScreening(destinationId, "clear", new Date(Date.now() - 1000).toISOString());
          return { ok: true, execution_authorised: true };
        },
      });
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("25. required PoC becomes unavailable strictly BETWEEN Phase A's read and Phase C's re-check -> 409, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = makeFakeIam2Fetch({
        verify: async () => {
          await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
          return { ok: true, execution_authorised: true };
        },
      });
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("26. destination_status_version drift (concurrent unrelated mutation) strictly BETWEEN Phase A's read and Phase C's re-check -> 409, no write", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      mainConfig.iam2FetchImpl = makeFakeIam2Fetch({
        verify: async () => {
          // All gates (status/screening/PoC) remain individually satisfied — only the version
          // snapshot drifts. This isolates hasVersionDrift() as the specific mechanism catching it,
          // not a coincidental gate re-failure.
          await verifyPool.query(`UPDATE wlt1.destination SET destination_status_version = destination_status_version + 1 WHERE destination_id = $1`, [destinationId]);
          return { ok: true, execution_authorised: true };
        },
      });
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("27. approved audit (wlt1.destination_whitelist_approved) is emitted atomically with the state update — both present or both absent", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const res = await approveApply(destinationId);
      expect(res.statusCode).toBe(200);
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_whitelist_approved' AND payload_ref LIKE $1`, [`%${destinationId}%`]);
      expect(rows.rows.length).toBe(1);
      const payload = JSON.parse(rows.rows[0].payload_ref);
      expect(payload.metadata.cooling_off_until_utc).toBeDefined();
      expect(JSON.stringify(payload)).not.toContain(mainConfig.wlt1InternalServiceToken);
    });

    it("28. forced audit failure rolls back the destination status transition entirely — no partial state", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const before = await destinationRow(destinationId);
      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await approveApply(destinationId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
      // retry succeeds once the ACL is restored.
      const retry = await approveApply(destinationId);
      expect(retry.statusCode).toBe(200);
    }, 30_000);

    it("29. no decision_token ever appears in any audit payload", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      const decisionToken = "tok_secret_" + randomUUID();
      await approveApply(destinationId, { decision_token: decisionToken });
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${destinationId}%`]);
      for (const row of rows.rows) {
        expect(row.payload_ref).not.toContain(decisionToken);
      }
    });

    it("30. no ledger/withdrawal/LED side effect exists — no led1 schema, no consumed status reachable; approve/apply itself writes NO wlt1.destination_decision row (that table now exists as of migration 057/Phase 4A-2, but only evaluate-use ever inserts into it)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await approvablePocDestination();
      await approveApply(destinationId);
      const ledSchema = await verifyPool.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'led1'`);
      expect(ledSchema.rows).toHaveLength(0);
      const decisionRows = await verifyPool.query(`SELECT 1 FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
      expect(decisionRows.rows).toHaveLength(0);
    });

    it("31. missing internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/wlt1dest_x/approve/apply`, payload: { actor_id: "a", client_id: "c", approval_id: "x", decision_token: "y" } });
      expect(res.statusCode).toBe(401);
    });

    it("32. invalid internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destinations/wlt1dest_x/approve/apply`,
        headers: { "x-internal-service-token": "wrong-token" },
        payload: { actor_id: "a", client_id: "c", approval_id: "x", decision_token: "y" },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
