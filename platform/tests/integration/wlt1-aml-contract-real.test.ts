/**
 * WLT-01 Phase 4A-2 — REAL AML-01 Phase 3E contract test. Proves WLT-01's own
 * `lib/aml1-client.ts` (`screenPreTransaction`) correctly consumes the ACTUAL accepted AML-01
 * response — never a hand-authored mock — by building and LISTENING a real AML-01 app
 * (`services/aml1/src/server.ts`'s `buildApp`, `app.listen({ port: 0 })` on an ephemeral port,
 * backed by a real, migrated, privately-disposable Postgres database) and calling WLT's own real
 * client function against it over REAL HTTP. No `fetchImpl` stub anywhere in this file — the
 * client uses the global `fetch`, exactly as it does in production.
 *
 * Mirrors the established, already-accepted "real cross-module contract" pattern in this
 * codebase (`tests/integration/aml1-iam2-guard-real.test.ts`, `clt1-iam2-guard-real.test.ts`,
 * `cfg1-iam2-guard-real.test.ts`, `kyc1-clt1-roster-sync-e2e-real.test.ts`): the DOWNSTREAM
 * service (here AML-01) gets `@aix/foundation`'s ONE process-wide `initPool()` singleton (its
 * route genuinely needs real DB access); the CALLING module's client code (here WLT-01's
 * `screenPreTransaction`) makes no direct DB call at all, so it never contends for that same
 * singleton — this is exactly why `initPool()` is called ONLY ONCE in this file, for AML-01, and
 * WLT-01 itself has no app/route/DB involvement here whatsoever (its client is pure HTTP + parsing
 * logic, verified by inspection of `lib/aml1-client.ts`'s own imports).
 *
 * Admin fixtures write `aml1.screening_request`/`screening_result`/`screening_provider_attempt`/
 * `screening_match` rows directly via a SEPARATE plain `pg.Pool` (`verifyPool`, never routed
 * through `@aix/foundation`'s singleton) — mirrors `aml1-pre-transaction-route.test.ts`'s own
 * identical fixture helpers exactly (same INSERT shapes, same admin-fixture rationale: this file's
 * own matrix needs exact, independently-controlled evidence states no single HTTP flow could
 * produce deterministically).
 *
 * SCOPE: this file proves the CONTRACT — that WLT's client accepts what AML-01's real route
 * genuinely returns. It does not re-prove AML-01's own evidence-mapping/precedence correctness
 * (that is `tests/unit/aml1-pre-transaction.test.ts` / `tests/integration/aml1-pre-transaction-
 * route.test.ts`'s own job) and does not re-prove WLT's own technical-failure sweep (that is
 * `tests/unit/wlt1-aml1-client.test.ts`'s own job, using a hand-authored stub for the many
 * malformed/adversarial shapes a real server would never itself produce). No AML-01 production
 * code is modified.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Aml1Config } from "../../services/aml1/src/config.js";
import { buildApp as buildAml1App } from "../../services/aml1/src/server.js";
import { screenPreTransaction, type Aml1ClientConfig } from "../../services/wlt1/src/lib/aml1-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "aml1_wlt1_contract_real_test";

const PRIVATE_DB_NAME = `wlt1_amlcontract_it_${randomBytes(6).toString("hex")}`;

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
let aml1App: FastifyInstance;
let aml1Config: Aml1Config;
let wltClientConfig: Aml1ClientConfig;
let schemaReady = false;
let databaseCreated = false;

const CLIENT_ID = "clt1client_wltamlcontract";

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-amlcontract-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-amlcontract-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-amlcontract-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  // Only fnd (foundation.outbox_event) + aml1 (aml1.*) grants are needed — this file exercises
  // ONLY AML-01's own real route; WLT-01 itself has no SQL access here at all (its client is HTTP
  // only), mirroring aml1-pre-transaction-route.test.ts's own identical grant scope.
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "aml1_runtime_grants.sql"), "utf8"));

  await verifyPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
        CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
      END IF;
    END
    $$;
  `);
  await verifyPool.query(`GRANT role_aml1_runtime TO ${RUNTIME_ROLE_USER};`);

  const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  aml1Config = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-aml1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    aml1InternalServiceToken: "test-aml1-internal-token-wltcontract-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    iam2BaseUrl: "http://127.0.0.1:0",
    iam2InternalServiceToken: "test-iam2-internal-token-it",
    screeningProviderId: "stub-v1",
    rescreenDueDays: 90,
    monitoringBatchSizeDefault: 50,
    monitoringBatchSizeMax: 200,
    stuckScreeningThresholdSeconds: 900,
    pretransactionEvidenceMaxAgeHours: 2160,
    pretransactionDecisionTtlMinutes: 5,
  };
  aml1App = await buildAml1App(aml1Config);

  // Real HTTP server on an ephemeral port — WLT-01's aml1-client.ts uses the global `fetch`, not
  // app.inject(), so it needs something real to connect to over the network (same rationale as
  // aml1-iam2-guard-real.test.ts's own identical listen() call for the exact same reason).
  await aml1App.listen({ port: 0, host: "127.0.0.1" });
  const address = aml1App.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  wltClientConfig = { baseUrl: `http://127.0.0.1:${port}`, internalServiceToken: aml1Config.aml1InternalServiceToken };

  schemaReady = true;
}, 60_000);

afterAll(async () => {
  if (aml1App) await aml1App.close();
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
  await verifyPool.query(`DELETE FROM aml1.screening_match`);
  await verifyPool.query(`DELETE FROM aml1.screening_provider_attempt`);
  await verifyPool.query(`DELETE FROM aml1.screening_result`);
  await verifyPool.query(`DELETE FROM aml1.screening_request`);
});

// -------------------------------------------------------------------------------------------
// Admin fixture helpers — direct SQL against the REAL aml1.* schema, never through any app's own
// write path. Exact same INSERT shapes as aml1-pre-transaction-route.test.ts's own established
// helpers (not reimplemented differently — this file is not inventing a second AML-01 fixture
// dialect).
// -------------------------------------------------------------------------------------------
async function insertScreeningRequest(opts: { screeningRequestId: string; subjectRef: string; subjectParentRef: string | null; status: "requested" | "completed" | "failed" }): Promise<void> {
  await verifyPool.query(
    `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, subject_parent_ref, provenance, status, requested_by, created_at_utc)
     VALUES ($1, 'authorised_party', $2, $3, 'declared_identity', $4, 'test-fixture', now())`,
    [opts.screeningRequestId, opts.subjectRef, opts.subjectParentRef, opts.status],
  );
}

async function insertScreeningResult(opts: { screeningResultId: string; screeningRequestId: string; overallStatus: "clear" | "potential_match" | "confirmed_hit" | "error"; screenedAtUtc: string }): Promise<void> {
  await verifyPool.query(
    `INSERT INTO aml1.screening_result (screening_result_id, screening_request_id, overall_status, provider_ref, screened_at_utc)
     VALUES ($1, $2, $3, 'test-fixture-ref', $4::timestamptz)`,
    [opts.screeningResultId, opts.screeningRequestId, opts.overallStatus, opts.screenedAtUtc],
  );
}

async function insertScreeningMatch(opts: { screeningMatchId: string; screeningResultId: string; matchStatus: "potential_match" | "confirmed_hit" | "dismissed" }): Promise<void> {
  await verifyPool.query(
    `INSERT INTO aml1.screening_match (screening_match_id, screening_result_id, category, match_status, score, list_source, matched_name)
     VALUES ($1, $2, 'sanctions', $3, 0.900, 'test-fixture-list', 'Test Fixture Name')`,
    [opts.screeningMatchId, opts.screeningResultId, opts.matchStatus],
  );
}

async function insertProviderAttempt(opts: { attemptId: string; screeningRequestId: string; providerId: string; status?: "succeeded" | "failed" }): Promise<void> {
  await verifyPool.query(
    `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, request_payload_hash, status)
     VALUES ($1, $2, $3, '1', 'test-fixture-hash', $4)`,
    [opts.attemptId, opts.screeningRequestId, opts.providerId, opts.status ?? "succeeded"],
  );
}

/** Builds a complete "fresh clear" authorised_party: request(completed, bound to clientId) +
 * result(clear, screened now) + succeeded provider attempt. Returns the subjectRef. */
async function createFreshClearSubject(clientId: string, subjectRef: string, providerId = "stub-v1"): Promise<string> {
  const reqId = "aml1req_" + randomUUID();
  const resultId = "aml1res_" + randomUUID();
  await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
  await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: new Date().toISOString() });
  await insertProviderAttempt({ attemptId: "aml1att_" + randomUUID(), screeningRequestId: reqId, providerId });
  return subjectRef;
}

/** Builds a confirmed-hit subject — a genuine real AML deny (never a fabricated response). */
async function createConfirmedHitSubject(clientId: string, subjectRef: string): Promise<string> {
  const reqId = "aml1req_" + randomUUID();
  const resultId = "aml1res_" + randomUUID();
  await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
  await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "confirmed_hit", screenedAtUtc: new Date().toISOString() });
  await insertScreeningMatch({ screeningMatchId: "aml1match_" + randomUUID(), screeningResultId: resultId, matchStatus: "confirmed_hit" });
  return subjectRef;
}

function wltInput(overrides: Partial<Parameters<typeof screenPreTransaction>[1]> = {}) {
  return {
    clientId: CLIENT_ID,
    subjectRefs: ["party_default"],
    destinationRef: "wlt1dest_contracttest",
    chain: "ethereum",
    network: "mainnet",
    nowUtc: new Date(),
    ...overrides,
  };
}

describe("WLT-01 Phase 4A-2 — REAL AML-01 Phase 3E contract (screenPreTransaction against a real, listening AML-01 app)", () => {
  it("H-fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/aml1 grants, real AML-01 app listening) must have succeeded").toBe(true);
    const res = await aml1App.inject({ method: "GET", url: "/internal/aml1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: AML-01's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
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

  it("1. actual AML-01 Phase 3E allow response -> accepted by WLT's real screenPreTransaction as outcome:'allow'", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_default");
    const result = await screenPreTransaction(wltClientConfig, wltInput());
    expect(result.outcome).toBe("allow");
  });

  it("2. actual client_id binding survives end-to-end: evidence bound to a DIFFERENT client_id is genuinely NOT bound (real subject_client_binding_unprovable review) -> WLT correctly treats as not_allow, never allow", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject("clt1client_someoneelse", "party_wrongclient");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_wrongclient"], clientId: CLIENT_ID }));
    // Real AML-01 route: no screening_request row matches (clientId, subjectRef) together ->
    // requestStatus null -> review/subject_client_binding_unprovable -> WLT: not_allow.
    expect(result.outcome).toBe("not_allow");
  });

  it("2b. actual client_id binding survives end-to-end (positive direction): the SAME evidence correctly bound to the REQUESTED client_id reaches allow", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_correctbinding");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_correctbinding"] }));
    expect(result.outcome).toBe("allow");
  });

  it("3. actual requested_action='destination_use' survives end-to-end through the real route's own binding echo/check", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_action");
    // screenPreTransaction always sends requested_action:'destination_use' (its only supported
    // value) — proving THIS reaches allow proves the real route echoed it back and WLT's own
    // binding check (`data.requested_action !== 'destination_use'` -> unavailable) passed against
    // a genuine server response, not an assumption.
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_action"] }));
    expect(result.outcome).toBe("allow");
  });

  it("4. actual decision_id format returned by the real route matches WLT's own accepted regex", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_decisionid");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_decisionid"] }));
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.decisionId).toMatch(/^aml1ptd_[0-9a-f-]{36}$/);
    }

    // Independently confirm against the REAL route's own raw response (not just WLT's parsed
    // result) — the decision_id WLT accepted really did come from the real server, unaltered.
    const raw = await aml1App.inject({
      method: "POST",
      url: "/internal/aml1/pre-transaction/screen",
      headers: { "x-internal-service-token": aml1Config.aml1InternalServiceToken },
      payload: { client_id: CLIENT_ID, subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_decisionid" }], requested_action: "destination_use", caller_module: "WLT-01" },
    });
    expect(raw.json().data.decision_id).toMatch(/^aml1ptd_[0-9a-f-]{36}$/);
  });

  it("5. actual evidence_provider_ids on a real allow response is non-empty and accepted", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_provider", "stub-v1");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_provider"] }));
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.evidenceProviderIds.length).toBeGreaterThan(0);
      expect(result.evidenceProviderIds).toContain("stub-v1");
    }
  });

  it("6. actual evaluated_at_utc/valid_until_utc from the real route are parsed and accepted, matching the server's own configured TTL", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_ttl");
    const before = Date.now();
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_ttl"] }));
    const after = Date.now();
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      const validUntilMs = result.validUntilUtc.getTime();
      // aml1Config.pretransactionDecisionTtlMinutes === 5 -> valid_until_utc ~= evaluated_at (real
      // DB now()) + 5 minutes. Bounded window accounts for real request latency, never a fabricated
      // fixed offset.
      expect(validUntilMs).toBeGreaterThan(before + 4 * 60_000);
      expect(validUntilMs).toBeLessThan(after + 6 * 60_000);
    }
  });

  it("7. no raw AML evidence beyond the Phase 3E decision response is required by (or exposed to) WLT: the real response body carries exactly the documented field set, no internal screening_request_id/screening_match_id/provider-payload leakage", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_shape");
    const raw = await aml1App.inject({
      method: "POST",
      url: "/internal/aml1/pre-transaction/screen",
      headers: { "x-internal-service-token": aml1Config.aml1InternalServiceToken },
      payload: { client_id: CLIENT_ID, subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_shape" }], requested_action: "destination_use", caller_module: "WLT-01" },
    });
    expect(raw.statusCode).toBe(200);
    const data = raw.json().data;
    expect(Object.keys(data).sort()).toEqual(
      ["decision", "decision_id", "reason_code", "evaluated_at_utc", "valid_until_utc", "evidence_provider_ids", "client_id", "requested_action"].sort(),
    );
    // No internal identifier (screening_request_id / screening_result_id / screening_match_id /
    // provider request/response payload) ever appears in the field set WLT actually consumes.
    const bodyText = JSON.stringify(data);
    expect(bodyText).not.toMatch(/screening_request_id|screening_result_id|screening_match_id|provider_ref|request_payload/);
  });

  it("8. actual AML-01 review response -> WLT does not treat it as allow (real subject_client_binding_unprovable: no evidence exists at all)", async () => {
    if (!schemaReady) return;
    // No fixture inserted at all for this subject_ref -> real route's own evidence resolution
    // finds no bound screening_request row -> genuine review/subject_client_binding_unprovable.
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_never_screened_" + randomUUID()] }));
    expect(result.outcome).toBe("not_allow");
  });

  it("9. actual AML-01 deny response (real confirmed_hit) -> WLT does not treat it as allow", async () => {
    if (!schemaReady) return;
    await createConfirmedHitSubject(CLIENT_ID, "party_hit");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_hit"] }));
    expect(result.outcome).toBe("not_allow");
  });

  it("10. a real allow decision is genuinely audited by AML-01 itself (aml1.pre_transaction_evaluated) — the contract exercised a real, fully-committed decision, not an in-memory-only response", async () => {
    if (!schemaReady) return;
    await createFreshClearSubject(CLIENT_ID, "party_audited");
    const result = await screenPreTransaction(wltClientConfig, wltInput({ subjectRefs: ["party_audited"] }));
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'aml1.pre_transaction_evaluated' AND payload_ref::text LIKE '%' || $1 || '%'`, [
        result.decisionId,
      ]);
      expect(rows.rows[0].n).toBe(1);
    }
  });
});
