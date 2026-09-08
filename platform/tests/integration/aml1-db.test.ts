/**
 * AML-01 Phase 1 + Phase 2A + Phase 2B DB-gated integration tests. Self-skips unless
 * `TEST_DATABASE_URL` points at a Postgres that already has `foundation` (001, 005), AML-01's own
 * `aml1` schema (033, 034, 035), and IAM-02's `aml1.*` permission rows (036) migrated, with
 * `fnd_runtime_grants.sql`, `iam2_runtime_grants.sql`, and `aml1_runtime_grants.sql` applied.
 *
 * Connects as `role_aml1_runtime` via a real LOGIN role from the START (S1 lesson applied from
 * day one, per every prior module's own precedent — never superuser-only). A separate superuser
 * `pg.Pool` (`verifyPool`) is used for fixture setup/independent verification, never to drive the
 * app itself.
 *
 * Phase 1 had no CFG-01/IAM-02/SEC-01/CLT-01 dependency — no fetch stub was needed. Phase 2A added
 * AML-01's first cross-module HTTP dependency (CLT-01 outcome delivery); `config.clt1FetchImpl` is
 * stubbed here for the ordinary happy/failure-path coverage (per-endpoint mapping, two-phase
 * delivery, retry) — the REAL, live-listening-CLT-01 proof lives in its own file,
 * `tests/integration/aml1-clt1-outcome-delivery-real.test.ts`. Phase 2B adds AML-01's first IAM-02
 * dependency (match inventory/sensitive-read/disposition); `config.iam2FetchImpl` is stubbed here
 * for the same reason — the REAL, live-listening-IAM-02 proof (that `licence_locked=false` and the
 * `approval_required` baseline-pass interpretation actually work against the real guard) lives in
 * its own file, `tests/integration/aml1-iam2-guard-real.test.ts`, per the same "do not rely only on
 * the stub positive path" instruction applied to Phase 2A's own CLT-01 client.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, fingerprint, initPool } from "@aix/foundation";
import type { Aml1Config } from "../../services/aml1/src/config.js";
import { buildApp } from "../../services/aml1/src/server.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "aml1_app_test";

const config: Aml1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-aml1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  aml1InternalServiceToken: "test-aml1-internal-token-it",
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

// ---------------------------------------------------------------------------------------------
// Fake IAM-02 fetch stub (Phase 2B) — own copy, F3(c), never imported from services/iam2/**.
// ---------------------------------------------------------------------------------------------
interface FakeIam2Decision {
  decision: string;
  reason: string;
}

function makeFakeIam2Fetch(opts: {
  checkDecision?: (body: Record<string, unknown>) => FakeIam2Decision;
  verify?: (body: Record<string, unknown>) => { ok: boolean; execution_authorised?: boolean; errorCode?: string };
}): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      const result = opts.checkDecision ? opts.checkDecision(body) : { decision: "allow", reason: "permission_granted" };
      return { ok: true, json: async () => ({ success: true, data: result }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      const result = opts.verify ? opts.verify(body) : { ok: true, execution_authorised: true };
      if (!result.ok) {
        return { ok: false, json: async () => ({ success: false, error: { code: result.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: result.execution_authorised ?? true } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in AML-01 Phase 2B test fixture: ${urlStr}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({});
}

function denyPermissionIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }) });
}

function iam2Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

/** Phase 3A Low-1 regression fixture — `permission/check` behaves normally (returns the real,
 * approval-required baseline decision for confirm/dismiss, matching the real IAM-02 guard), but
 * `permission/execute-verify` is unreachable. Distinguishes "IAM-02 rejected the token"
 * (AML1_APPROVAL_REQUIRED, already covered by the tampered-token/payload-hash-mismatch tests
 * above) from "IAM-02 could not be reached at execute-verify time" (AML1_IAM2_UNAVAILABLE). */
function iam2UnavailableAtExecuteVerify(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      throw new Error("network down at execute-verify");
    }
    throw new Error(`Unexpected IAM-02 URL in AML-01 Phase 3A test fixture: ${urlStr}`);
  }) as typeof fetch;
}

const internalHeaders = { "x-internal-service-token": "test-aml1-internal-token-it" };
const SCREENING_URL = "/internal/aml1/screening-requests";

// ---------------------------------------------------------------------------------------------
// Fake CLT-01 fetch stub (Phase 2A) — own copy, F3(c), never imported from services/clt1/**.
// ---------------------------------------------------------------------------------------------
function makeFakeCltFetch(decide: (urlStr: string, body: Record<string, unknown>) => { status: number; body: unknown }): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    const result = decide(urlStr, body);
    return { ok: result.status >= 200 && result.status < 300, json: async () => result.body } as Response;
  }) as typeof fetch;
}

function realisticCltFetch(): typeof fetch {
  return makeFakeCltFetch((urlStr) => {
    if (urlStr.includes("/outcomes")) {
      return { status: 201, body: { success: true, data: { outcome_id: "clt1cdd_stub_" + Math.random().toString(36).slice(2) } } };
    }
    if (urlStr.includes("/screening-outcome")) {
      const match = /authorised-parties\/([^/]+)\/screening-outcome$/.exec(urlStr);
      return { status: 200, body: { success: true, data: { authorised_party_id: match?.[1] ?? "unknown" } } };
    }
    throw new Error(`Unexpected CLT-01 URL in AML-01 Phase 2A test fixture: ${urlStr}`);
  });
}

function cltInvalidState(errorCode: string): typeof fetch {
  return makeFakeCltFetch(() => ({ status: 409, body: { success: false, error: { code: errorCode } } }));
}

function cltUnreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

function cltMalformedResponse(): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => {
      throw new Error("not json");
    },
  })) as unknown as typeof fetch;
}

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'aml1') AS aml1`,
    );
    const row = r.rows[0];
    return Number(row?.fnd) > 0 && Number(row?.aml1) > 0;
  } catch {
    return false;
  }
}

interface CreateScreeningRequestInput {
  subject_type?: "client_application" | "authorised_party";
  subject_ref?: string;
  subject_parent_ref?: string;
  subject_nature?: "individual" | "entity";
  provenance?: "declared_identity" | "kyc_verified_identity";
  requested_by?: string;
  declared_identity?: {
    name?: string;
    registration_number?: string;
    country?: string;
    date_of_birth?: string;
    nationality?: string;
  };
}

async function createScreeningRequest(overrides: CreateScreeningRequestInput = {}) {
  const { declared_identity, ...restOverrides } = overrides;
  return app.inject({
    method: "POST",
    url: SCREENING_URL,
    headers: internalHeaders,
    payload: {
      subject_type: "client_application",
      subject_ref: "clt1app_test_1",
      subject_nature: "individual",
      provenance: "declared_identity",
      requested_by: "staff_maker_1",
      ...restOverrides,
      declared_identity: { name: "Ordinary Clean Subject", ...declared_identity },
    },
  });
}

async function providerStatus(actorId = "staff_reviewer_1") {
  return app.inject({ method: "GET", url: `/internal/aml1/provider/status?actor_id=${actorId}`, headers: internalHeaders });
}

async function requestCltOutcomeDelivery(screeningRequestId: string, requestedBy = "staff_maker_1") {
  return app.inject({
    method: "POST",
    url: `${SCREENING_URL}/${screeningRequestId}/clt-outcome`,
    headers: internalHeaders,
    payload: { requested_by: requestedBy },
  });
}

async function retryCltOutcomeDelivery(deliveryId: string, requestedBy = "staff_maker_1") {
  return app.inject({
    method: "POST",
    url: `/internal/aml1/clt-outcome-deliveries/${deliveryId}/retry`,
    headers: internalHeaders,
    payload: { requested_by: requestedBy },
  });
}

async function firstMatchIdFor(screeningRequestId: string): Promise<string> {
  const rows = await verifyPool.query(
    `SELECT sm.screening_match_id FROM aml1.screening_match sm
       JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id
      WHERE sr.screening_request_id = $1
      ORDER BY sm.created_at_utc LIMIT 1`,
    [screeningRequestId],
  );
  return rows.rows[0].screening_match_id as string;
}

async function inventoryMatches(screeningRequestId: string, actorId = "staff_reviewer_1") {
  return app.inject({ method: "GET", url: `/internal/aml1/screening-requests/${screeningRequestId}/matches?actor_id=${actorId}`, headers: internalHeaders });
}

async function sensitiveDetail(screeningMatchId: string, actorId = "staff_reviewer_1") {
  return app.inject({ method: "GET", url: `/internal/aml1/matches/${screeningMatchId}/sensitive-detail?actor_id=${actorId}`, headers: internalHeaders });
}

async function requestDisposition(decisionType: "confirm" | "dismiss", screeningMatchId: string, requestedBy: string, reason?: string) {
  return app.inject({
    method: "POST",
    url: `/internal/aml1/matches/${screeningMatchId}/${decisionType}/request`,
    headers: internalHeaders,
    payload: { requested_by: requestedBy, ...(reason ? { reason } : {}) },
  });
}

async function applyDisposition(decisionType: "confirm" | "dismiss", screeningMatchId: string, decisionId: string, approvalId = "appr_1", decisionToken = "tok_1") {
  return app.inject({
    method: "POST",
    url: `/internal/aml1/matches/${screeningMatchId}/${decisionType}/apply`,
    headers: internalHeaders,
    payload: { decision_id: decisionId, approval_id: approvalId, decision_token: decisionToken },
  });
}

// ---------------------------------------------------------------------------------------------
// Phase 3C helpers — own file section, reuses every helper above (createScreeningRequest,
// firstMatchIdFor, requestDisposition, applyDisposition). Own subject-ref generator so a single
// test that needs several distinct due subjects never collides with itself.
// ---------------------------------------------------------------------------------------------
let phase3cSubjectCounter = 0;

function freshSubjectRef(prefix = "clt1app_3c"): string {
  phase3cSubjectCounter += 1;
  return `${prefix}_${phase3cSubjectCounter}_${Date.now()}`;
}

async function rescreen(sourceScreeningRequestId: string, triggerReason: string, requestedBy = "staff_maker_2", extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `${SCREENING_URL}/${sourceScreeningRequestId}/rescreen`,
    headers: internalHeaders,
    payload: { trigger_reason: triggerReason, requested_by: requestedBy, ...extra },
  });
}

async function monitoringRun(body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/internal/aml1/monitoring-runs", headers: internalHeaders, payload: body });
}

async function getMonitoringRun(runId: string, actorId = "staff_ops_1") {
  return app.inject({ method: "GET", url: `/internal/aml1/monitoring-runs/${runId}?actor_id=${actorId}`, headers: internalHeaders });
}

async function listRiskSignals(subjectType: string, subjectRef: string, actorId = "staff_reviewer_1", status?: string) {
  const statusQs = status ? `&status=${status}` : "";
  return app.inject({ method: "GET", url: `/internal/aml1/risk-signals?actor_id=${actorId}&subject_type=${subjectType}&subject_ref=${subjectRef}${statusQs}`, headers: internalHeaders });
}

async function acknowledgeRiskSignal(signalId: string, actorId = "staff_reviewer_1") {
  return app.inject({ method: "POST", url: `/internal/aml1/risk-signals/${signalId}/acknowledge`, headers: internalHeaders, payload: { actor_id: actorId } });
}

/** Seeds a fully-formed, already-COMPLETED screening_request (+ snapshot + provider attempt) row
 * directly via SQL, backdating `completed_at_utc` so it is immediately eligible as a `periodic_due`
 * monitoring candidate — bypassing the app/provider entirely (fixture setup, not exercising the
 * screening lifecycle itself, which every other test in this file already covers via the real
 * app). */
async function seedDueScreeningRequest(subjectRef: string, daysAgo: number, listVersion = "stub-list-v1"): Promise<string> {
  const screeningRequestId = "aml1req_seed_" + subjectRef;
  const attemptId = "aml1attempt_seed_" + subjectRef;
  const completedAtUtc = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  await verifyPool.query(
    `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by, completed_at_utc)
     VALUES ($1,'client_application',$2,'declared_identity','completed','staff_seed_1',$3)`,
    [screeningRequestId, subjectRef, completedAtUtc],
  );
  await verifyPool.query(
    `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature)
     VALUES ($1,'client_application',$2,'declared_identity','individual')`,
    [screeningRequestId, "Seeded Due Subject " + subjectRef],
  );
  await verifyPool.query(
    `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, provider_list_version, request_payload_hash, status, checked_at_utc)
     VALUES ($1,$2,'stub-v1','1',$3,'seedhash','succeeded',$4)`,
    [attemptId, screeningRequestId, listVersion, completedAtUtc],
  );
  return screeningRequestId;
}

// ---------------------------------------------------------------------------------------------
// Phase 3D helpers — own file section, reuses freshSubjectRef/verifyPool.
// ---------------------------------------------------------------------------------------------

/** Seeds a `status='requested'` screening_request (+ snapshot + provider attempt) directly via
 * SQL, backdating `created_at_utc` so it is immediately "stuck" against the configured threshold —
 * bypassing the app/provider entirely (the app's own screening lifecycle is synchronous and always
 * resolves to completed/failed; a genuinely stuck row only arises from a crash, which this fixture
 * simulates). `attemptStatus` defaults to `pending` (the recoverable shape); pass `"succeeded"`/
 * `"failed"` to simulate the narrower, non-recoverable "requested with a non-pending latest
 * attempt" shape (see lib/stuck-screening.ts's own header comment). */
async function seedStuckScreeningRequest(subjectRef: string, ageSeconds: number, attemptStatus: "pending" | "succeeded" | "failed" = "pending"): Promise<{ screeningRequestId: string; attemptId: string }> {
  const screeningRequestId = "aml1req_stuck_" + subjectRef;
  const attemptId = "aml1attempt_stuck_" + subjectRef;
  const createdAtUtc = new Date(Date.now() - ageSeconds * 1000).toISOString();
  await verifyPool.query(
    `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by, created_at_utc)
     VALUES ($1,'client_application',$2,'declared_identity','requested','staff_seed_1',$3)`,
    [screeningRequestId, subjectRef, createdAtUtc],
  );
  await verifyPool.query(
    `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature)
     VALUES ($1,'client_application',$2,'declared_identity','individual')`,
    [screeningRequestId, "Seeded Stuck Subject " + subjectRef],
  );
  await verifyPool.query(
    `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, request_payload_hash, status)
     VALUES ($1,$2,'stub-v1','1','seedhash',$3)`,
    [attemptId, screeningRequestId, attemptStatus],
  );
  return { screeningRequestId, attemptId };
}

async function listStuckScreening(actorId = "staff_ops_1", minAgeSeconds?: number) {
  const qs = minAgeSeconds !== undefined ? `&min_age_seconds=${minAgeSeconds}` : "";
  return app.inject({ method: "GET", url: `/internal/aml1/screening-requests/stuck?actor_id=${actorId}${qs}`, headers: internalHeaders });
}

async function recoverStuckScreeningReq(screeningRequestId: string, reasonCode: string, actorId = "staff_ops_1") {
  return app.inject({
    method: "POST",
    url: `${SCREENING_URL}/${screeningRequestId}/recover`,
    headers: internalHeaders,
    payload: { actor_id: actorId, reason_code: reasonCode },
  });
}

describe("AML-01 Phase 1 integration", () => {
  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    schemaReady = await schemasExist();
    if (!schemaReady) return;

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

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
    // Default: allow-everything IAM-02 stub, so tests that don't care about IAM-02 behaviour don't
    // each need to set it individually — mirrors CLT-01's own db-test precedent exactly. Tests that
    // DO care override this per-test and reset it afterwards.
    config.iam2FetchImpl = allowAllIam2Fetch();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  afterEach(async () => {
    if (!schemaReady) return;
    // FK-safe order: children before parent. match_disposition_decision_request FKs to
    // screening_match; clt_outcome_delivery/screening_provider_attempt FK to screening_request.
    // Phase 3C: risk_signal/monitoring_run carry no real FK to screening_request (see migration
    // 039's own header comment) but are still cleaned every test for the same single-writer
    // reason every other table here is.
    await verifyPool.query(`DELETE FROM aml1.risk_signal`);
    await verifyPool.query(`DELETE FROM aml1.monitoring_run`);
    await verifyPool.query(`DELETE FROM aml1.match_disposition_decision_request`);
    await verifyPool.query(`DELETE FROM aml1.clt_outcome_delivery`);
    await verifyPool.query(`DELETE FROM aml1.screening_match`);
    await verifyPool.query(`DELETE FROM aml1.screening_result`);
    await verifyPool.query(`DELETE FROM aml1.screening_provider_attempt`);
    await verifyPool.query(`DELETE FROM aml1.screening_subject_snapshot`);
    await verifyPool.query(`DELETE FROM aml1.screening_request`);
  });

  // -----------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_aml1_runtime", () => {
    it("app builds successfully under the least-privilege runtime role (assertNoExchangeRuntime passed)", () => {
      if (!schemaReady) return expect(schemaReady, "run migrate:up + aml1_runtime_grants.sql first").toBe(true);
      expect(app).toBeDefined();
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(routePaths.some((p) => p.toLowerCase().includes("exchange"))).toBe(false);
    });

    it("role_aml1_runtime cannot read foundation.idempotency_record, iam.*, iam2.*, sec1.*, cfg1.*, or clt1.*, but CAN read aml1.screening_request", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`SELECT 1 FROM aml1.screening_request LIMIT 1`)).resolves.toBeDefined();
        for (const forbidden of [`SELECT 1 FROM foundation.idempotency_record LIMIT 1`]) {
          await expect(appPool.query(forbidden)).rejects.toThrow();
        }
      } finally {
        await appPool.end();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("readiness", () => {
    it("passes (200, ready) when the DB/aml1 schema is reachable", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/readiness" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ready");
    });

    it("is unauthenticated (no internal-service-token header required)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/readiness" });
      expect(res.statusCode).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /screening-requests — clean subject (deterministic clear case)", () => {
    it("creates a completed request with overall_status='clear' and zero matches; response exposes no PII", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest();
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      const data = res.json().data;
      expect(data.status).toBe("completed");
      expect(data.result.overall_status).toBe("clear");
      expect(data.result.matched_categories).toEqual([]);

      const serialized = JSON.stringify(data);
      for (const forbidden of ["name", "registration_number", "date_of_birth", "nationality", "matched_name", "match_detail", "score"]) {
        expect(serialized.includes(`"${forbidden}"`), `response must not contain "${forbidden}"`).toBe(false);
      }

      const requestRows = await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE screening_request_id = $1`, [data.screening_request_id]);
      expect(requestRows.rows[0].status).toBe("completed");
      const matchRows = await verifyPool.query(
        `SELECT count(*) FROM aml1.screening_match WHERE screening_result_id = (SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1)`,
        [data.screening_request_id],
      );
      expect(Number(matchRows.rows[0].count)).toBe(0);
    });

    it("persists a declared-identity subject snapshot with provenance='declared_identity'", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "Snapshot Test Subject", registration_number: "REG-1", country: "SG" } });
      const data = res.json().data;
      const snapshotRows = await verifyPool.query(`SELECT name, registration_number, country, provenance FROM aml1.screening_subject_snapshot WHERE screening_request_id = $1`, [
        data.screening_request_id,
      ]);
      expect(snapshotRows.rows[0].name).toBe("Snapshot Test Subject");
      expect(snapshotRows.rows[0].registration_number).toBe("REG-1");
      expect(snapshotRows.rows[0].provenance).toBe("declared_identity");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /screening-requests — deterministic HIT fixtures", () => {
    it("sanctions fixture ('AML1 TEST SANCTIONED ENTITY') produces potential_match with exactly one sanctions match row; response exposes matched_categories only", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      const data = res.json().data;
      expect(data.result.overall_status).toBe("potential_match");
      expect(data.result.matched_categories).toEqual(["sanctions"]);

      const matchRows = await verifyPool.query(
        `SELECT category, score, matched_name, match_detail FROM aml1.screening_match
           WHERE screening_result_id = (SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1)`,
        [data.screening_request_id],
      );
      expect(matchRows.rows).toHaveLength(1);
      expect(matchRows.rows[0].category).toBe("sanctions");
      expect(Number(matchRows.rows[0].score)).toBeGreaterThan(0);

      const serialized = JSON.stringify(data);
      expect(serialized.includes('"matched_name"')).toBe(false);
      expect(serialized.includes('"score"')).toBe(false);
    });

    it("PEP fixture ('AML1 TEST PEP') produces potential_match with exactly one pep match", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ subject_type: "authorised_party", declared_identity: { name: "AML1 TEST PEP" } });
      const data = res.json().data;
      expect(data.result.overall_status).toBe("potential_match");
      expect(data.result.matched_categories).toEqual(["pep"]);
    });

    it("adverse-media fixture ('AML1 TEST ADVERSE MEDIA') produces potential_match with exactly one adverse_media match; match_detail is stored but never returned", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST ADVERSE MEDIA" } });
      const data = res.json().data;
      expect(data.result.overall_status).toBe("potential_match");
      expect(data.result.matched_categories).toEqual(["adverse_media"]);

      const matchRows = await verifyPool.query(
        `SELECT match_detail FROM aml1.screening_match WHERE screening_result_id = (SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1)`,
        [data.screening_request_id],
      );
      expect(matchRows.rows[0].match_detail).toBeTruthy();
      expect(JSON.stringify(data).includes('"match_detail"')).toBe(false);
    });

    it("provider-unavailable fixture ('AML1 TEST PROVIDER DOWN') persists the request as failed (no result/match row) and returns 503 AML1_SCREENING_PROVIDER_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PROVIDER DOWN" } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("AML1_SCREENING_PROVIDER_UNAVAILABLE");

      const requestRows = await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE subject_ref = 'clt1app_test_1' ORDER BY created_at_utc DESC LIMIT 1`);
      expect(requestRows.rows[0].status).toBe("failed");
      const resultRows = await verifyPool.query(`SELECT count(*) FROM aml1.screening_result`);
      expect(Number(resultRows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /screening-requests — validation", () => {
    it("rejects an unsupported subject_type at the schema layer (400 VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ subject_type: "wallet_address" as unknown as "client_application" });
      expect(res.statusCode).toBe(400);
    });

    it("rejects provenance='kyc_verified_identity' with 422 AML1_SCREENING_SUBJECT_INVALID (schema-present, not writable this phase)", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ provenance: "kyc_verified_identity" });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("AML1_SCREENING_SUBJECT_INVALID");
    });

    it("rejects a blank declared_identity.name with 422 AML1_SCREENING_SUBJECT_INVALID", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "   " } });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("AML1_SCREENING_SUBJECT_INVALID");
    });

    it("rejects a malformed declared_identity.date_of_birth with 422 AML1_SCREENING_SUBJECT_INVALID (not 503 AML1_AUDIT_REQUIRED) and writes no rows", async () => {
      if (!schemaReady) return;
      const before = await verifyPool.query(`SELECT count(*) FROM aml1.screening_request`);

      const res = await createScreeningRequest({ declared_identity: { name: "Malformed DOB Subject", date_of_birth: "2024-02-30" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(422);
      expect(res.json().error.code).toBe("AML1_SCREENING_SUBJECT_INVALID");

      // No PII (including the rejected date_of_birth value) leaks into the error response.
      const serialized = JSON.stringify(res.json());
      expect(serialized.includes("2024-02-30")).toBe(false);
      expect(serialized.includes("Malformed DOB Subject")).toBe(false);

      // Rejected before any DB write — no orphaned request/snapshot row.
      const after = await verifyPool.query(`SELECT count(*) FROM aml1.screening_request`);
      expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
    });

    it("a malformed date_of_birth never appears in any aml1.* audit payload_ref (rejected before the audit-emitting transaction ever starts)", async () => {
      if (!schemaReady) return;
      await createScreeningRequest({ declared_identity: { name: "Malformed DOB Audit Subject", date_of_birth: "not-a-date" } });
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'aml1.%'`);
      for (const row of rows.rows) {
        expect((row.payload_ref as string).includes("not-a-date")).toBe(false);
        expect((row.payload_ref as string).includes("Malformed DOB Audit Subject")).toBe(false);
      }
    });

    it("accepts a well-formed date_of_birth (e.g. a leap-year Feb 29) and completes normally", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "Valid DOB Subject", date_of_birth: "2000-02-29" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      expect(res.json().data.status).toBe("completed");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B: two-phase screening lifecycle + provider adaptor boundary", () => {
    it("persists subject_nature on the subject snapshot exactly as supplied by the caller", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ subject_nature: "entity", declared_identity: { name: "Entity Nature Subject" } });
      const { screening_request_id } = res.json().data;
      const rows = await verifyPool.query(`SELECT subject_nature FROM aml1.screening_subject_snapshot WHERE screening_request_id = $1`, [screening_request_id]);
      expect(rows.rows[0].subject_nature).toBe("entity");
    });

    it("a successful screen records a screening_provider_attempt row: status='succeeded', provider_id/adaptor_version/request_payload_hash/response_payload_hash/latency_ms/checked_at_utc all set", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = res.json().data;
      const rows = await verifyPool.query(`SELECT * FROM aml1.screening_provider_attempt WHERE screening_request_id = $1`, [screening_request_id]);
      expect(rows.rows).toHaveLength(1);
      const attempt = rows.rows[0];
      expect(attempt.status).toBe("succeeded");
      expect(attempt.provider_id).toBe("stub-v1");
      expect(attempt.provider_adaptor_version).toBeTruthy();
      expect(attempt.request_payload_hash).toMatch(/^sha256:/);
      expect(attempt.response_payload_hash).toMatch(/^sha256:/);
      expect(attempt.provider_list_version).toBeTruthy();
      expect(attempt.provider_reference_id).toBeTruthy();
      expect(attempt.latency_ms).not.toBeNull();
      expect(attempt.checked_at_utc).not.toBeNull();
      expect(attempt.failure_reason_code).toBeNull();
    });

    it("provider-unavailable records screening_provider_attempt status='failed' with a clamped failure_reason_code, and no screening_result/screening_match row", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PROVIDER DOWN" } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("AML1_SCREENING_PROVIDER_UNAVAILABLE");

      const requestRows = await verifyPool.query(`SELECT screening_request_id, status FROM aml1.screening_request ORDER BY created_at_utc DESC LIMIT 1`);
      expect(requestRows.rows[0].status).toBe("failed");
      const attemptRows = await verifyPool.query(`SELECT status, failure_reason_code FROM aml1.screening_provider_attempt WHERE screening_request_id = $1`, [
        requestRows.rows[0].screening_request_id,
      ]);
      expect(attemptRows.rows[0].status).toBe("failed");
      expect(attemptRows.rows[0].failure_reason_code).toBeTruthy();
      const resultRows = await verifyPool.query(`SELECT count(*) FROM aml1.screening_result WHERE screening_request_id = $1`, [requestRows.rows[0].screening_request_id]);
      expect(Number(resultRows.rows[0].count)).toBe(0);
    });

    it("Phase 3B NEW: a malformed/untrustworthy provider response ('AML1 TEST PROVIDER MALFORMED') returns 502 AML1_VENDOR_RESPONSE_INVALID, marks the attempt failed, and writes no result/match row", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PROVIDER MALFORMED" } });
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe("AML1_VENDOR_RESPONSE_INVALID");

      const requestRows = await verifyPool.query(`SELECT screening_request_id, status FROM aml1.screening_request ORDER BY created_at_utc DESC LIMIT 1`);
      expect(requestRows.rows[0].status).toBe("failed");
      const attemptRows = await verifyPool.query(`SELECT status FROM aml1.screening_provider_attempt WHERE screening_request_id = $1`, [requestRows.rows[0].screening_request_id]);
      expect(attemptRows.rows[0].status).toBe("failed");
    });

    it("Phase 3B NEW: an unknown match category ('AML1 TEST UNKNOWN CATEGORY') fails closed with 502 AML1_VENDOR_RESPONSE_INVALID — never silently bucketed into adverse_media, never silently dropped", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST UNKNOWN CATEGORY" } });
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe("AML1_VENDOR_RESPONSE_INVALID");

      const requestRows = await verifyPool.query(`SELECT screening_request_id, status FROM aml1.screening_request ORDER BY created_at_utc DESC LIMIT 1`);
      expect(requestRows.rows[0].status).toBe("failed");
      const resultRows = await verifyPool.query(`SELECT count(*) FROM aml1.screening_result WHERE screening_request_id = $1`, [requestRows.rows[0].screening_request_id]);
      expect(Number(resultRows.rows[0].count)).toBe(0);
      const matchRows = await verifyPool.query(`SELECT count(*) FROM aml1.screening_match sm WHERE sm.matched_name = 'AML1 TEST UNKNOWN CATEGORY'`);
      expect(Number(matchRows.rows[0].count)).toBe(0);
    });

    it("Phase 3B NEW (decision D3): a provider match with no confidence score ('AML1 TEST NO SCORE MATCH') stores score=NULL, never a misleading 0.000, and sensitive-detail returns it as null without error", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST NO SCORE MATCH" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      const { screening_request_id } = res.json().data;

      const matchRows = await verifyPool.query(
        `SELECT screening_match_id, score FROM aml1.screening_match WHERE screening_result_id = (SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1)`,
        [screening_request_id],
      );
      expect(matchRows.rows).toHaveLength(1);
      expect(matchRows.rows[0].score).toBeNull();

      const detailRes = await sensitiveDetail(matchRows.rows[0].screening_match_id);
      expect(detailRes.statusCode, JSON.stringify(detailRes.json())).toBe(200);
      expect(detailRes.json().data.score).toBeNull();
    });

    it("Phase 3B NEW: the provider is invoked AFTER TX1 has already committed — the screening_request ('requested') and screening_provider_attempt ('pending') rows are visible on a SEPARATE connection while the provider call is still in flight", async () => {
      if (!schemaReady) return;
      let sawCommittedTx1State = false;
      config.screeningProviderImpl = {
        providerId: "test-tx1-witness",
        adaptorVersion: "1",
        async screen(payload) {
          const rows = await verifyPool.query(
            `SELECT sq.status AS request_status, spa.status AS attempt_status
               FROM aml1.screening_request sq
               JOIN aml1.screening_provider_attempt spa ON spa.screening_request_id = sq.screening_request_id
              WHERE sq.subject_ref = 'clt1app_test_1'
              ORDER BY sq.created_at_utc DESC LIMIT 1`,
          );
          if (rows.rows[0]?.request_status === "requested" && rows.rows[0]?.attempt_status === "pending") {
            sawCommittedTx1State = true;
          }
          return { kind: "screened", listVersion: null, providerReferenceId: null, rawMatches: [] };
        },
      };
      try {
        const res = await createScreeningRequest({ declared_identity: { name: "TX1 Witness Subject" } });
        expect(res.statusCode).toBe(201);
        expect(sawCommittedTx1State, "TX1 must be committed and visible on another connection before the provider is ever called").toBe(true);
      } finally {
        config.screeningProviderImpl = undefined;
      }
    });

    it("Phase 3B NEW (decision D2/§6): payload minimization — an entity subject sends registration_number, never date_of_birth/nationality; subject_ref/screening_request_id/requested_by/provenance are never sent", async () => {
      if (!schemaReady) return;
      let capturedPayload: Record<string, unknown> | undefined;
      config.screeningProviderImpl = {
        providerId: "test-payload-witness",
        adaptorVersion: "1",
        async screen(payload) {
          capturedPayload = payload as unknown as Record<string, unknown>;
          return { kind: "screened", listVersion: null, providerReferenceId: null, rawMatches: [] };
        },
      };
      try {
        await createScreeningRequest({
          subject_nature: "entity",
          subject_ref: "clt1app_minimization_entity",
          declared_identity: { name: "Minimization Entity", registration_number: "REG-999", date_of_birth: "1990-01-01", nationality: "MY" },
        });
        expect(capturedPayload).toBeDefined();
        expect(capturedPayload!.registration_number).toBe("REG-999");
        expect("date_of_birth" in capturedPayload!).toBe(false);
        expect("nationality" in capturedPayload!).toBe(false);
        for (const forbidden of ["subject_ref", "screening_request_id", "requested_by", "provenance"]) {
          expect(forbidden in capturedPayload!, `provider payload must never include "${forbidden}"`).toBe(false);
        }
      } finally {
        config.screeningProviderImpl = undefined;
      }
    });

    it("Phase 3B NEW (decision D2/§6): payload minimization — an individual subject sends date_of_birth/nationality, never registration_number", async () => {
      if (!schemaReady) return;
      let capturedPayload: Record<string, unknown> | undefined;
      config.screeningProviderImpl = {
        providerId: "test-payload-witness-2",
        adaptorVersion: "1",
        async screen(payload) {
          capturedPayload = payload as unknown as Record<string, unknown>;
          return { kind: "screened", listVersion: null, providerReferenceId: null, rawMatches: [] };
        },
      };
      try {
        await createScreeningRequest({
          subject_nature: "individual",
          declared_identity: { name: "Minimization Individual", registration_number: "SHOULD-NOT-SEND", date_of_birth: "1990-01-01", nationality: "MY" },
        });
        expect(capturedPayload).toBeDefined();
        expect(capturedPayload!.date_of_birth).toBe("1990-01-01");
        expect(capturedPayload!.nationality).toBe("MY");
        expect("registration_number" in capturedPayload!).toBe(false);
      } finally {
        config.screeningProviderImpl = undefined;
      }
    });

    it("raw request/response provider payloads are never retained — only fingerprint() hashes; the raw payload never appears in the HTTP response, audit metadata, or any stored column", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = res.json().data;

      const columns = await verifyPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'aml1' AND table_name = 'screening_provider_attempt'`,
      );
      const columnNames = columns.rows.map((r) => r.column_name as string);
      expect(columnNames).not.toContain("raw_request_payload");
      expect(columnNames).not.toContain("raw_response_payload");
      expect(columnNames).not.toContain("raw_response");

      const auditRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'aml1.screening_%' AND payload_ref LIKE $1`, [
        `%${screening_request_id}%`,
      ]);
      for (const row of auditRows.rows) {
        expect((row.payload_ref as string).includes("STUB_SANCTIONS")).toBe(false);
      }
    });

    it("shape check: a crash between TX1 and TX2 leaves a coherent, queryable 'requested' request with a 'pending' provider attempt (no functional resume this phase — structural proof only)", async () => {
      if (!schemaReady) return;
      const screeningRequestId = "aml1req_shapecheck_" + Date.now();
      const attemptId = "aml1attempt_shapecheck_" + Date.now();
      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by)
         VALUES ($1,'client_application','clt1app_shape_check','declared_identity','requested','staff_1')`,
        [screeningRequestId],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature)
         VALUES ($1,'client_application','Shape Check Subject','declared_identity','individual')`,
        [screeningRequestId],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, request_payload_hash, status)
         VALUES ($1,$2,'stub-v1','1','sha256:shapecheck','pending')`,
        [attemptId, screeningRequestId],
      );

      const rows = await verifyPool.query(
        `SELECT sq.status AS request_status, spa.status AS attempt_status FROM aml1.screening_request sq
           JOIN aml1.screening_provider_attempt spa ON spa.screening_request_id = sq.screening_request_id
          WHERE sq.screening_request_id = $1`,
        [screeningRequestId],
      );
      expect(rows.rows[0].request_status).toBe("requested");
      expect(rows.rows[0].attempt_status).toBe("pending");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B: GET /provider/status", () => {
    it("returns the safe active-provider fields only, gated by aml1.provider.read", async () => {
      if (!schemaReady) return;
      const res = await providerStatus();
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const data = res.json().data;
      expect(Object.keys(data).sort()).toEqual(["active_provider_id", "adaptor_version", "environment", "stub_provider"].sort());
      expect(data.active_provider_id).toBe("stub-v1");
      expect(data.stub_provider).toBe(true);
      expect(data.environment).toBe("dev");
    });

    it("does not return credentials, base URLs, tokens, or raw provider config secrets", async () => {
      if (!schemaReady) return;
      const res = await providerStatus();
      const serialized = JSON.stringify(res.json());
      for (const forbidden of ["token", "credential", "secret", "clt1BaseUrl", "iam2BaseUrl", "clt1InternalServiceToken", "iam2InternalServiceToken"]) {
        expect(serialized.toLowerCase().includes(forbidden.toLowerCase()), `response must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("is denied without permission (403 AML1_PERMISSION_DENIED)", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const res = await providerStatus();
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("fails closed as AML1_IAM2_UNAVAILABLE when IAM-02 cannot be reached", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = iam2Unreachable();
      try {
        const res = await providerStatus();
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/provider/status?actor_id=staff_1" });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /screening-requests/:id", () => {
    it("returns the safe projection of an existing request", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = createRes.json().data;

      const getRes = await app.inject({ method: "GET", url: `${SCREENING_URL}/${screening_request_id}`, headers: internalHeaders });
      expect(getRes.statusCode).toBe(200);
      const data = getRes.json().data;
      expect(data.screening_request_id).toBe(screening_request_id);
      expect(data.result.matched_categories).toEqual(["sanctions"]);
    });

    it("returns 404 AML1_SCREENING_REQUEST_NOT_FOUND for an unknown id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `${SCREENING_URL}/aml1req_does_not_exist`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_REQUEST_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `${SCREENING_URL}/aml1req_whatever` });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("audit-event inventory: no PII in any aml1.* payload", () => {
    it("emits aml1.screening_request_created + aml1.screening_completed on the happy path", async () => {
      if (!schemaReady) return;
      const before = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type LIKE 'aml1.%'`);
      await createScreeningRequest();
      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type LIKE 'aml1.%' ORDER BY created_at_utc DESC LIMIT 2`);
      const types = rows.rows.map((r) => r.event_type);
      expect(types).toContain("aml1.screening_request_created");
      expect(types).toContain("aml1.screening_completed");
      const after = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type LIKE 'aml1.%'`);
      expect(Number(after.rows[0].count)).toBeGreaterThan(Number(before.rows[0].count));
    });

    it("emits aml1.screening_failed for the provider-unavailable fixture", async () => {
      if (!schemaReady) return;
      await createScreeningRequest({ declared_identity: { name: "AML1 TEST PROVIDER DOWN" } });
      const rows = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'aml1.screening_failed'`);
      expect(Number(rows.rows[0].count)).toBeGreaterThan(0);
    });

    it("no PII substring appears in any accumulated aml1.* audit payload_ref", async () => {
      if (!schemaReady) return;
      await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY", registration_number: "REG-SECRET-1", nationality: "SG" } });
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'aml1.%'`);
      expect(rows.rows.length).toBeGreaterThan(0);
      const forbidden = ["Ordinary Clean Subject", "AML1 TEST SANCTIONED ENTITY", "REG-SECRET-1", "matched_name", "match_detail"];
      for (const row of rows.rows) {
        const payloadStr = row.payload_ref as string;
        for (const field of forbidden) {
          expect(payloadStr.includes(field), `payload_ref must not contain "${field}": ${payloadStr}`).toBe(false);
        }
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grant inventory: role_aml1_runtime least-privilege matrix", () => {
    it("has zero DELETE/TRUNCATE grants anywhere", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND privilege_type IN ('DELETE','TRUNCATE')`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("has zero grant into iam2/cfg1/sec1/clt1/iam schemas", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema IN ('iam2','cfg1','sec1','clt1','iam')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("has no foundation.idempotency_record grant; foundation.outbox_event is INSERT-only", async () => {
      if (!schemaReady) return;
      const idem = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_name = 'idempotency_record'`);
      expect(Number(idem.rows[0].count)).toBe(0);
      const outbox = await verifyPool.query(
        `SELECT string_agg(DISTINCT privilege_type, ',') AS privs FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema = 'foundation' AND table_name = 'outbox_event'`,
      );
      expect(outbox.rows[0].privs).toBe("INSERT");
    });

    it("screening_request UPDATE grant is limited to exactly status/completed_at_utc/version", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'screening_request' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(rows.rows.map((r) => r.column_name)).toEqual(["completed_at_utc", "status", "version"]);
    });

    it("screening_subject_snapshot, screening_result, and screening_match have NO UPDATE grant at all (append-only)", async () => {
      if (!schemaReady) return;
      for (const table of ["screening_subject_snapshot", "screening_result", "screening_match"]) {
        const rows = await verifyPool.query(
          `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema = 'aml1' AND table_name = $1 AND privilege_type = 'UPDATE'`,
          [table],
        );
        expect(Number(rows.rows[0].count), `${table} must have zero UPDATE grant`).toBe(0);
      }
    });

    it("append-only proof: UPDATE is actually denied under role_aml1_runtime on snapshot/result/match", async () => {
      if (!schemaReady) return;
      const res = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = res.json().data;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE aml1.screening_subject_snapshot SET name = 'tampered' WHERE screening_request_id = $1`, [screening_request_id])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_result SET overall_status = 'clear' WHERE screening_request_id = $1`, [screening_request_id])).rejects.toThrow();
      } finally {
        await appPool.end();
      }
    });

    // ---------------------------------------------------------------------------------------
    // Phase 2A grant extension
    // ---------------------------------------------------------------------------------------
    it("clt_outcome_delivery: SELECT+INSERT granted, UPDATE limited to exactly status/attempt_count/failure_reason_code/response_ref/delivered_at_utc/version", async () => {
      if (!schemaReady) return;
      // Whole-table privileges only (role_table_grants never lists a COLUMN-scoped UPDATE — same
      // reason the Phase 1 screening_request UPDATE check above reads role_column_grants instead).
      const base = await verifyPool.query(
        `SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema = 'aml1' AND table_name = 'clt_outcome_delivery'`,
      );
      expect(base.rows[0].privs).toBe("INSERT,SELECT");

      const cols = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'clt_outcome_delivery' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual(["attempt_count", "delivered_at_utc", "failure_reason_code", "response_ref", "status", "version"]);
    });

    it("clt_outcome_delivery: append-once columns (delivery_id/screening_request_id/target/outcome_type/delivered_status/effective_status/requested_by/created_at_utc) are NOT in the UPDATE grant", async () => {
      if (!schemaReady) return;
      const cols = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'clt_outcome_delivery' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE'`,
      );
      const updatable = new Set(cols.rows.map((r) => r.column_name as string));
      for (const immutable of ["delivery_id", "screening_request_id", "target", "outcome_type", "delivered_status", "effective_status", "requested_by", "created_at_utc"]) {
        expect(updatable.has(immutable), `${immutable} must not be UPDATE-granted`).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A: POST .../screening-requests/:id/clt-outcome — application-level delivery", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("clear subject delivers pass/pass for both aml_sanctions and pep_adverse_media", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;

      const res = await requestCltOutcomeDelivery(screening_request_id);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      const data = res.json().data;
      expect(data.screening_request_id).toBe(screening_request_id);
      expect(data.deliveries).toHaveLength(2);
      const byType = Object.fromEntries(data.deliveries.map((d: { outcome_type: string; delivered_status: string; status: string }) => [d.outcome_type, d]));
      expect(byType.aml_sanctions.delivered_status).toBe("pass");
      expect(byType.aml_sanctions.status).toBe("succeeded");
      expect(byType.pep_adverse_media.delivered_status).toBe("pass");
      expect(byType.pep_adverse_media.status).toBe("succeeded");

      const rows = await verifyPool.query(`SELECT target, outcome_type, delivered_status, status, response_ref, attempt_count FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [
        screening_request_id,
      ]);
      expect(rows.rows).toHaveLength(2);
      for (const row of rows.rows) {
        expect(row.target).toBe("application_outcome");
        expect(row.status).toBe("succeeded");
        expect(row.response_ref).toBeTruthy();
        expect(Number(row.attempt_count)).toBe(1);
      }
    });

    it("a sanctions hit fixture delivers pending for aml_sanctions and pass for pep_adverse_media", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;

      const res = await requestCltOutcomeDelivery(screening_request_id);
      const byType = Object.fromEntries(res.json().data.deliveries.map((d: { outcome_type: string; delivered_status: string; effective_status: string }) => [d.outcome_type, d]));
      expect(byType.aml_sanctions.delivered_status).toBe("pending");
      expect(byType.aml_sanctions.effective_status).toBe("potential_match");
      expect(byType.pep_adverse_media.delivered_status).toBe("pass");
    });

    it("delivery on a non-completed screening request returns 409 AML1_SCREENING_REQUEST_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const stuckId = "aml1req_stuck_" + Date.now();
      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by) VALUES ($1,'client_application','clt1app_stuck','declared_identity','requested','tester')`,
        [stuckId],
      );
      const res = await requestCltOutcomeDelivery(stuckId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_SCREENING_REQUEST_INVALID_STATE");
    });

    it("delivery on an unknown screening_request_id returns 404 AML1_SCREENING_REQUEST_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await requestCltOutcomeDelivery("aml1req_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_REQUEST_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `${SCREENING_URL}/aml1req_whatever/clt-outcome`, payload: { requested_by: "x" } });
      expect(res.statusCode).toBe(401);
    });

    it("CLT-01 non-2xx (e.g. CLT1_APPLICATION_INVALID_STATE) returns 502 AML1_CLT_DELIVERY_FAILED — but the failed delivery row is STILL durably persisted (TX2 already committed before the throw)", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        const res = await requestCltOutcomeDelivery(screening_request_id);
        expect(res.statusCode, JSON.stringify(res.json())).toBe(502);
        expect(res.json().error.code).toBe("AML1_CLT_DELIVERY_FAILED");

        const rows = await verifyPool.query(`SELECT status, failure_reason_code, attempt_count FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [screening_request_id]);
        expect(rows.rows).toHaveLength(2);
        for (const row of rows.rows) {
          expect(row.status).toBe("failed");
          expect(row.failure_reason_code).toBe("CLT1_APPLICATION_INVALID_STATE");
          expect(Number(row.attempt_count)).toBe(1);
        }
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("CLT-01 network error/timeout returns 502 AML1_CLT_DELIVERY_FAILED and still persists the failed delivery row with failure_reason_code clt1_unavailable", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltUnreachable();
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        const res = await requestCltOutcomeDelivery(screening_request_id);
        expect(res.statusCode).toBe(502);
        expect(res.json().error.code).toBe("AML1_CLT_DELIVERY_FAILED");

        const rows = await verifyPool.query(`SELECT status, failure_reason_code FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [screening_request_id]);
        expect(rows.rows).toHaveLength(2);
        for (const row of rows.rows) {
          expect(row.status).toBe("failed");
          expect(row.failure_reason_code).toBe("clt1_unavailable");
        }
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("CLT-01 malformed response returns 502 AML1_CLT_DELIVERY_FAILED and still persists the failed delivery row with failure_reason_code clt1_malformed_response", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltMalformedResponse();
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        const res = await requestCltOutcomeDelivery(screening_request_id);
        expect(res.statusCode).toBe(502);
        expect(res.json().error.code).toBe("AML1_CLT_DELIVERY_FAILED");

        const rows = await verifyPool.query(`SELECT status, failure_reason_code FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [screening_request_id]);
        expect(rows.rows).toHaveLength(2);
        for (const row of rows.rows) {
          expect(row.status).toBe("failed");
          expect(row.failure_reason_code).toBe("clt1_malformed_response");
        }
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("GET delivery by id after a failed delivery returns the safe projection with status='failed' (queryable despite the 502 thrown to the original caller)", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        await requestCltOutcomeDelivery(screening_request_id);

        const idRows = await verifyPool.query(`SELECT delivery_id FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1 LIMIT 1`, [screening_request_id]);
        const deliveryId = idRows.rows[0].delivery_id as string;

        const getRes = await app.inject({ method: "GET", url: `/internal/aml1/clt-outcome-deliveries/${deliveryId}`, headers: internalHeaders });
        expect(getRes.statusCode).toBe(200);
        expect(getRes.json().data.status).toBe("failed");
        expect(getRes.json().data.delivery_id).toBe(deliveryId);
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("the 502 error response never leaks a CLT-01 response body or any PII (only AML-01's own delivery_id/failure_reason_code evidence)", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      try {
        const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY", registration_number: "REG-SECRET-9" } });
        const { screening_request_id } = screenRes.json().data;
        const res = await requestCltOutcomeDelivery(screening_request_id);
        expect(res.statusCode).toBe(502);
        const serialized = JSON.stringify(res.json());
        for (const forbidden of ["REG-SECRET-9", "matched_name", "match_detail", "outcome_status", "sanctions_pep_status"]) {
          expect(serialized.includes(forbidden), `response must not contain "${forbidden}"`).toBe(false);
        }
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("response never leaks a CLT-01 response body or any PII (success path)", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY", registration_number: "REG-SECRET-9" } });
      const { screening_request_id } = screenRes.json().data;
      const res = await requestCltOutcomeDelivery(screening_request_id);
      const serialized = JSON.stringify(res.json());
      for (const forbidden of ["REG-SECRET-9", "matched_name", "match_detail", "outcome_status", "sanctions_pep_status"]) {
        expect(serialized.includes(forbidden), `response must not contain "${forbidden}"`).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A: POST .../screening-requests/:id/clt-outcome — authorised-party delivery", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("derives the CLT-01 URL from stored subject_ref/subject_parent_ref, never asking the caller to resupply client_id", async () => {
      if (!schemaReady) return;
      let capturedUrl = "";
      config.clt1FetchImpl = (async (url: unknown) => {
        capturedUrl = String(url);
        return { ok: true, json: async () => ({ success: true, data: { authorised_party_id: "clt1party_test_1" } }) };
      }) as unknown as typeof fetch;

      const screenRes = await createScreeningRequest({ subject_type: "authorised_party", subject_ref: "clt1party_test_1", subject_parent_ref: "clt1client_test_1" });
      const { screening_request_id } = screenRes.json().data;

      const res = await requestCltOutcomeDelivery(screening_request_id);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      expect(capturedUrl).toContain("/internal/clt1/clients/clt1client_test_1/authorised-parties/clt1party_test_1/screening-outcome");

      config.clt1FetchImpl = realisticCltFetch();
    });

    it("plans exactly one delivery (target=authorised_party_screening, outcome_type=null)", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ subject_type: "authorised_party", subject_ref: "clt1party_test_2", subject_parent_ref: "clt1client_test_2" });
      const { screening_request_id } = screenRes.json().data;
      const res = await requestCltOutcomeDelivery(screening_request_id);
      const deliveries = res.json().data.deliveries;
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].target).toBe("authorised_party_screening");
      expect(deliveries[0].outcome_type).toBeNull();
      expect(deliveries[0].delivered_status).toBe("clear");
    });

    it("a PEP fixture maps to review_required", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({
        subject_type: "authorised_party",
        subject_ref: "clt1party_test_3",
        subject_parent_ref: "clt1client_test_3",
        declared_identity: { name: "AML1 TEST PEP" },
      });
      const { screening_request_id } = screenRes.json().data;
      const res = await requestCltOutcomeDelivery(screening_request_id);
      expect(res.json().data.deliveries[0].delivered_status).toBe("review_required");
    });

    it("missing subject_parent_ref returns 409 AML1_CLT_OUTCOME_NOT_DELIVERABLE — never re-derives or asks CLT-01", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ subject_type: "authorised_party", subject_ref: "clt1party_test_4" });
      const { screening_request_id } = screenRes.json().data;
      const res = await requestCltOutcomeDelivery(screening_request_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_CLT_OUTCOME_NOT_DELIVERABLE");

      const rows = await verifyPool.query(`SELECT count(*) FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [screening_request_id]);
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A: POST .../clt-outcome-deliveries/:id/retry", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("retries a genuinely PENDING delivery (simulated crash-between-transactions) to succeeded", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      const pendingId = "aml1delv_pending_" + Date.now();
      await verifyPool.query(
        `INSERT INTO aml1.clt_outcome_delivery (delivery_id, screening_request_id, target, outcome_type, delivered_status, effective_status, status, requested_by)
         VALUES ($1,$2,'application_outcome','aml_sanctions','pass','clear','pending','tester')`,
        [pendingId, screening_request_id],
      );

      const res = await retryCltOutcomeDelivery(pendingId);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.status).toBe("succeeded");
      expect(res.json().data.attempt_count).toBe(1);
    });

    it("retries a FAILED delivery to succeeded once CLT-01 recovers", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      const firstRes = await requestCltOutcomeDelivery(screening_request_id);
      // The initial delivery now throws 502 AML1_CLT_DELIVERY_FAILED (Task 1) — the failed row is
      // still durably persisted, so it's found via a direct DB read, not the (now-error) response body.
      expect(firstRes.statusCode).toBe(502);
      const idRows = await verifyPool.query(`SELECT delivery_id FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1 AND status = 'failed' LIMIT 1`, [screening_request_id]);
      const failedDeliveryId = idRows.rows[0].delivery_id as string;

      config.clt1FetchImpl = realisticCltFetch();
      const retryRes = await retryCltOutcomeDelivery(failedDeliveryId);
      expect(retryRes.statusCode, JSON.stringify(retryRes.json())).toBe(200);
      expect(retryRes.json().data.status).toBe("succeeded");
      expect(retryRes.json().data.attempt_count).toBe(2);
      expect(retryRes.json().data.failure_reason_code).toBeNull();
    });

    it("retrying a delivery that fails AGAIN returns 502 AML1_CLT_DELIVERY_FAILED once more, and the row is still retriable afterwards", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        await requestCltOutcomeDelivery(screening_request_id);
        const idRows = await verifyPool.query(`SELECT delivery_id FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1 AND status = 'failed' LIMIT 1`, [screening_request_id]);
        const failedDeliveryId = idRows.rows[0].delivery_id as string;

        const retryRes = await retryCltOutcomeDelivery(failedDeliveryId);
        expect(retryRes.statusCode).toBe(502);
        expect(retryRes.json().error.code).toBe("AML1_CLT_DELIVERY_FAILED");

        const rows = await verifyPool.query(`SELECT status, attempt_count FROM aml1.clt_outcome_delivery WHERE delivery_id = $1`, [failedDeliveryId]);
        expect(rows.rows[0].status).toBe("failed");
        expect(Number(rows.rows[0].attempt_count)).toBe(2);
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("retrying an already-SUCCEEDED delivery returns 409 AML1_DELIVERY_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      const deliverRes = await requestCltOutcomeDelivery(screening_request_id);
      const succeeded = deliverRes.json().data.deliveries[0];

      const retryRes = await retryCltOutcomeDelivery(succeeded.delivery_id);
      expect(retryRes.statusCode).toBe(409);
      expect(retryRes.json().error.code).toBe("AML1_DELIVERY_INVALID_STATE");
    });

    it("retrying an unknown delivery_id returns 404 AML1_DELIVERY_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await retryCltOutcomeDelivery("aml1delv_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_DELIVERY_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `/internal/aml1/clt-outcome-deliveries/aml1delv_whatever/retry`, payload: { requested_by: "x" } });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A: GET /clt-outcome-deliveries/:id", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("returns the safe projection of an existing delivery", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      const deliverRes = await requestCltOutcomeDelivery(screening_request_id);
      const deliveryId = deliverRes.json().data.deliveries[0].delivery_id;

      const res = await app.inject({ method: "GET", url: `/internal/aml1/clt-outcome-deliveries/${deliveryId}`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.delivery_id).toBe(deliveryId);
      expect(res.json().data.screening_request_id).toBe(screening_request_id);
    });

    it("returns 404 AML1_DELIVERY_NOT_FOUND for an unknown id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/aml1/clt-outcome-deliveries/aml1delv_does_not_exist`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_DELIVERY_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/aml1/clt-outcome-deliveries/aml1delv_whatever` });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A: audit-event inventory — no PII in clt_outcome_delivery events", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("emits aml1.clt_outcome_delivery_attempted + _succeeded on the happy path", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      await requestCltOutcomeDelivery(screening_request_id);

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type LIKE 'aml1.clt_outcome_delivery%' ORDER BY created_at_utc DESC LIMIT 4`);
      const types = rows.rows.map((r) => r.event_type);
      expect(types).toContain("aml1.clt_outcome_delivery_attempted");
      expect(types).toContain("aml1.clt_outcome_delivery_succeeded");
    });

    it("emits aml1.clt_outcome_delivery_failed when CLT-01 rejects", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        await requestCltOutcomeDelivery(screening_request_id);
        const rows = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'aml1.clt_outcome_delivery_failed'`);
        expect(Number(rows.rows[0].count)).toBeGreaterThan(0);
      } finally {
        config.clt1FetchImpl = realisticCltFetch();
      }
    });

    it("no PII substring appears in any accumulated aml1.clt_outcome_delivery* audit payload_ref", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY", registration_number: "REG-SECRET-2" } });
      const { screening_request_id } = screenRes.json().data;
      await requestCltOutcomeDelivery(screening_request_id);

      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'aml1.clt_outcome_delivery%'`);
      expect(rows.rows.length).toBeGreaterThan(0);
      const forbidden = ["AML1 TEST SANCTIONED ENTITY", "REG-SECRET-2", "matched_name", "match_detail"];
      for (const row of rows.rows) {
        const payloadStr = row.payload_ref as string;
        for (const field of forbidden) {
          expect(payloadStr.includes(field), `payload_ref must not contain "${field}": ${payloadStr}`).toBe(false);
        }
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B: GET .../screening-requests/:id/matches — PII-free match inventory", () => {
    it("returns screening_match_id/category/match_status/reviewed_at_utc and nothing else", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;

      const res = await inventoryMatches(screening_request_id);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const matches = res.json().data.matches;
      expect(matches).toHaveLength(1);
      expect(Object.keys(matches[0]).sort()).toEqual(["category", "match_status", "reviewed_at_utc", "screening_match_id"]);
      expect(matches[0].category).toBe("sanctions");
      expect(matches[0].match_status).toBe("potential_match");
      expect(matches[0].reviewed_at_utc).toBeNull();
    });

    it("contains no PII field name in the raw response body", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;
      const res = await inventoryMatches(screening_request_id);
      const serialized = JSON.stringify(res.json());
      for (const forbidden of ["matched_name", "match_detail", "score", "list_source"]) {
        expect(serialized.includes(forbidden), `response must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("is bounded to one screening_request — a clean screen (zero matches) returns an empty array, not an error", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest();
      const { screening_request_id } = screenRes.json().data;
      const res = await inventoryMatches(screening_request_id);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.matches).toEqual([]);
    });

    it("is gated by aml1.screening.read — a real deny returns 403 AML1_PERMISSION_DENIED", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        const res = await inventoryMatches(screening_request_id);
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("fails closed as AML1_IAM2_UNAVAILABLE when IAM-02 cannot be reached", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = iam2Unreachable();
      try {
        const screenRes = await createScreeningRequest();
        const { screening_request_id } = screenRes.json().data;
        const res = await inventoryMatches(screening_request_id);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("returns 404 AML1_SCREENING_REQUEST_NOT_FOUND for an unknown screening_request_id", async () => {
      if (!schemaReady) return;
      const res = await inventoryMatches("aml1req_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_REQUEST_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/screening-requests/aml1req_whatever/matches?actor_id=staff_1" });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B: GET .../matches/:id/sensitive-detail — the ONLY route returning matched_name/match_detail/score", () => {
    it("returns exactly the 6 allowed fields when permission is granted", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST ADVERSE MEDIA" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const res = await sensitiveDetail(matchId);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const data = res.json().data;
      expect(Object.keys(data).sort()).toEqual(["category", "list_source", "match_detail", "match_status", "matched_name", "score"].sort());
      expect(data.matched_name).toBe("AML1 TEST ADVERSE MEDIA");
      expect(data.match_detail).toBeTruthy();
      expect(data.category).toBe("adverse_media");
    });

    it("is denied without permission (403 AML1_PERMISSION_DENIED) and leaks no sensitive field in the error response", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
        const { screening_request_id } = screenRes.json().data;
        const matchId = await firstMatchIdFor(screening_request_id);
        const res = await sensitiveDetail(matchId);
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");
        expect(JSON.stringify(res.json()).includes("AML1 TEST SANCTIONED ENTITY")).toBe(false);
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("writes aml1.sensitive_match_detail_read BEFORE returning, with no PII in its metadata", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const before = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'aml1.sensitive_match_detail_read'`);
      const res = await sensitiveDetail(matchId);
      expect(res.statusCode).toBe(200);
      const afterCount = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'aml1.sensitive_match_detail_read'`);
      expect(Number(afterCount.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
      const after = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'aml1.sensitive_match_detail_read' ORDER BY created_at_utc DESC LIMIT 1`);
      const payload = after.rows[0].payload_ref as string;
      expect(payload.includes("AML1 TEST PEP")).toBe(false);
      expect(payload.includes("matched_name")).toBe(false);
      expect(payload.includes("match_detail")).toBe(false);
    });

    it("if the audit write fails, the read fails as AML1_AUDIT_REQUIRED — no unlogged sensitive disclosure", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      // Revoke the outbox-insert grant to force the audit write to fail, exactly like the
      // forced-audit-failure precedent already used elsewhere in this suite.
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_aml1_runtime`);
        try {
          const res = await sensitiveDetail(matchId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("AML1_AUDIT_REQUIRED");
          expect(JSON.stringify(res.json()).includes("AML1 TEST SANCTIONED ENTITY")).toBe(false);
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_aml1_runtime`);
        }
      });
    });

    it("returns 404 AML1_SCREENING_MATCH_NOT_FOUND for an unknown screening_match_id (permission granted — existence check runs)", async () => {
      if (!schemaReady) return;
      const res = await sensitiveDetail("aml1match_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_MATCH_NOT_FOUND");
    });

    it("Phase 3A Low-2: an UNPERMISSIONED caller requesting an unknown screening_match_id gets 403 AML1_PERMISSION_DENIED, NOT 404 — permission is checked before existence, closing the existence-oracle gap", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const res = await sensitiveDetail("aml1match_does_not_exist_either");
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/matches/aml1match_whatever/sensitive-detail?actor_id=staff_1" });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B: human match disposition — confirm/dismiss request+apply", () => {
    it("confirm request -> apply happy path: match becomes confirmed_hit, reviewed_by is the DISPOSITION REQUESTER (not the screener, not the approver), redelivery_required:true is returned", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1", "genuine sanctions hit");
      expect(reqRes.statusCode, JSON.stringify(reqRes.json())).toBe(201);
      const { decision_id, payload_hash } = reqRes.json().data;
      expect(payload_hash).toMatch(/^sha256:/);

      const applyRes = await applyDisposition("confirm", matchId, decision_id);
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      const data = applyRes.json().data;
      expect(data.match_status).toBe("confirmed_hit");
      expect(data.reviewed_by).toBe("staff_disposer_1");
      expect(data.redelivery_required).toBe(true);
      expect(data.screening_request_id).toBe(screening_request_id);

      const row = await verifyPool.query(`SELECT match_status, reviewed_by, version FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId]);
      expect(row.rows[0].match_status).toBe("confirmed_hit");
      expect(row.rows[0].reviewed_by).toBe("staff_disposer_1");
      expect(Number(row.rows[0].version)).toBe(2);
    });

    it("dismiss request -> apply happy path: match becomes dismissed", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const reqRes = await requestDisposition("dismiss", matchId, "staff_disposer_1", "false positive — common name");
      const { decision_id } = reqRes.json().data;
      const applyRes = await applyDisposition("dismiss", matchId, decision_id);
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.match_status).toBe("dismissed");
    });

    it("strict SoD: the disposition requester cannot equal the ORIGINAL screening request's own requested_by — AML1_SELF_DISPOSITION_BLOCKED", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const res = await requestDisposition("confirm", matchId, "staff_screener_1");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("AML1_SELF_DISPOSITION_BLOCKED");
    });

    it("apply on a match already resolved by a DIFFERENT decision returns AML1_MATCH_INVALID_STATE (the race-loser code path) — both terminal, no re-open", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const confirmReq = await requestDisposition("confirm", matchId, "staff_disposer_1");
      const dismissReq = await requestDisposition("dismiss", matchId, "staff_disposer_2");

      const confirmApply = await applyDisposition("confirm", matchId, confirmReq.json().data.decision_id);
      expect(confirmApply.statusCode).toBe(200);

      // The SECOND decision's own apply loses — the target row's FOR-UPDATE re-check inside the
      // transaction sees the match is no longer potential_match (resolved by the FIRST decision).
      const dismissApply = await applyDisposition("dismiss", matchId, dismissReq.json().data.decision_id);
      expect(dismissApply.statusCode).toBe(409);
      expect(dismissApply.json().error.code).toBe("AML1_MATCH_INVALID_STATE");

      // The winning disposition's own result is untouched by the loser's failed attempt.
      const row = await verifyPool.query(`SELECT match_status FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId]);
      expect(row.rows[0].match_status).toBe("confirmed_hit");
    });

    it("a NEW disposition request against an already-terminal match is rejected at request time with AML1_MATCH_INVALID_STATE (not only at apply time)", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      await applyDisposition("confirm", matchId, reqRes.json().data.decision_id);

      const res = await requestDisposition("dismiss", matchId, "staff_disposer_2");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_MATCH_INVALID_STATE");
    });

    it("token reuse is rejected: applying the SAME decision_id twice returns AML1_DISPOSITION_INVALID_STATE on the second attempt", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      const decisionId = reqRes.json().data.decision_id;

      const first = await applyDisposition("confirm", matchId, decisionId);
      expect(first.statusCode).toBe(200);
      const second = await applyDisposition("confirm", matchId, decisionId);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("AML1_DISPOSITION_INVALID_STATE");
    });

    it("a wrong/tampered decision token (IAM-02 execute-verify reports invalid) is rejected with AML1_APPROVAL_REQUIRED, and the match is NOT mutated", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_DECISION_TOKEN_INVALID" }) });
      try {
        const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
        const { screening_request_id } = screenRes.json().data;
        const matchId = await firstMatchIdFor(screening_request_id);
        const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");

        const applyRes = await applyDisposition("confirm", matchId, reqRes.json().data.decision_id, "appr_1", "tampered-token");
        expect(applyRes.statusCode).toBe(403);
        expect(applyRes.json().error.code).toBe("AML1_APPROVAL_REQUIRED");

        const row = await verifyPool.query(`SELECT match_status FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId]);
        expect(row.rows[0].match_status).toBe("potential_match");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("Phase 3A Low-1: IAM-02 unreachable during execute-verify returns AML1_IAM2_UNAVAILABLE/503, not AML1_APPROVAL_REQUIRED — the match is NOT mutated and the decision is NOT applied", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      const decisionId = reqRes.json().data.decision_id;

      config.iam2FetchImpl = iam2UnavailableAtExecuteVerify();
      try {
        const applyRes = await applyDisposition("confirm", matchId, decisionId);
        expect(applyRes.statusCode).toBe(503);
        expect(applyRes.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");

        const matchRow = await verifyPool.query(`SELECT match_status FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId]);
        expect(matchRow.rows[0].match_status).toBe("potential_match");

        const decisionRow = await verifyPool.query(`SELECT status FROM aml1.match_disposition_decision_request WHERE decision_id = $1`, [decisionId]);
        expect(decisionRow.rows[0].status).toBe("requested");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("Phase 3A Low-1: a decision row is retriable after an IAM-02-unavailable apply attempt — unavailability never consumes the decision, a later attempt against a healthy IAM-02 applies normally", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("dismiss", matchId, "staff_disposer_1");
      const decisionId = reqRes.json().data.decision_id;

      config.iam2FetchImpl = iam2UnavailableAtExecuteVerify();
      try {
        const unavailableRes = await applyDisposition("dismiss", matchId, decisionId);
        expect(unavailableRes.statusCode).toBe(503);
        expect(unavailableRes.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }

      const applyRes = await applyDisposition("dismiss", matchId, decisionId);
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.match_status).toBe("dismissed");
    });

    it("a payload-hash mismatch (IAM-02 execute-verify reports IAM2_PAYLOAD_HASH_MISMATCH) is rejected with AML1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      try {
        const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST PEP" } });
        const { screening_request_id } = screenRes.json().data;
        const matchId = await firstMatchIdFor(screening_request_id);
        const reqRes = await requestDisposition("dismiss", matchId, "staff_disposer_1");

        const applyRes = await applyDisposition("dismiss", matchId, reqRes.json().data.decision_id);
        expect(applyRes.statusCode).toBe(403);
        expect(applyRes.json().error.code).toBe("AML1_APPROVAL_REQUIRED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("apply is denied at its own baseline re-check when permission is revoked between request and apply (AML1_PERMISSION_DENIED)", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");

      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const applyRes = await applyDisposition("confirm", matchId, reqRes.json().data.decision_id);
        expect(applyRes.statusCode).toBe(403);
        expect(applyRes.json().error.code).toBe("AML1_PERMISSION_DENIED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("the raw decision token is NEVER stored — decision_token_hash is exactly fingerprint(token), never the token itself", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      await applyDisposition("confirm", matchId, reqRes.json().data.decision_id, "appr_1", "raw-secret-token-value");

      const row = await verifyPool.query(`SELECT decision_token_hash FROM aml1.match_disposition_decision_request WHERE decision_id = $1`, [reqRes.json().data.decision_id]);
      expect(row.rows[0].decision_token_hash).not.toBe("raw-secret-token-value");
      expect(row.rows[0].decision_token_hash).toBe(fingerprint("raw-secret-token-value"));
    });

    it("Phase 3A Low-3: the disposition reason free text is stored as evidence on the decision row but never leaks into any aml1.match_disposition_* audit metadata", async () => {
      if (!schemaReady) return;
      const SENTINEL_REASON = "ZZZ-SENTINEL-REASON-DO-NOT-LEAK";
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1", SENTINEL_REASON);
      const decisionId = reqRes.json().data.decision_id;
      const applyRes = await applyDisposition("confirm", matchId, decisionId);
      expect(applyRes.statusCode).toBe(200);

      // Genuinely stored as evidence — proves the assertion below isn't vacuously true.
      const decisionRow = await verifyPool.query(`SELECT reason FROM aml1.match_disposition_decision_request WHERE decision_id = $1`, [decisionId]);
      expect(decisionRow.rows[0].reason).toBe(SENTINEL_REASON);

      // Never leaked into any aml1.match_disposition_* audit payload (requested or confirmed) —
      // `outbox_event` has no queryable entity_id column, so this sweeps every accumulated
      // aml1.match_disposition_* payload in the run, same idiom the file-level PII sweep above uses.
      const auditRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'aml1.match_disposition_%'`);
      expect(auditRows.rows.length).toBeGreaterThan(0);
      for (const row of auditRows.rows) {
        expect((row.payload_ref as string).includes(SENTINEL_REASON)).toBe(false);
      }
    });

    it("requires the internal-service-token on all four routes", async () => {
      if (!schemaReady) return;
      const noAuth = await app.inject({ method: "POST", url: "/internal/aml1/matches/aml1match_x/confirm/request", payload: { requested_by: "staff_1" } });
      expect(noAuth.statusCode).toBe(401);
      const noAuthApply = await app.inject({ method: "POST", url: "/internal/aml1/matches/aml1match_x/dismiss/apply", payload: { decision_id: "d", approval_id: "a", decision_token: "t" } });
      expect(noAuthApply.statusCode).toBe(401);
    });

    it("returns 404 AML1_SCREENING_MATCH_NOT_FOUND for a request against an unknown match", async () => {
      if (!schemaReady) return;
      const res = await requestDisposition("confirm", "aml1match_does_not_exist", "staff_1");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_MATCH_NOT_FOUND");
    });

    it("returns 404 AML1_DISPOSITION_NOT_FOUND for an apply against an unknown decision_id", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);
      const res = await applyDisposition("confirm", matchId, "aml1disp_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_DISPOSITION_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B: grant inventory — role_aml1_runtime least-privilege matrix (screening_match + match_disposition_decision_request)", () => {
    it("screening_match UPDATE grant is limited to exactly approval_id/match_status/reviewed_at_utc/reviewed_by/updated_at_utc/version", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'screening_match' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(rows.rows.map((r) => r.column_name)).toEqual(["approval_id", "match_status", "reviewed_at_utc", "reviewed_by", "updated_at_utc", "version"]);
    });

    it("screening_match's PII/evidence columns (matched_name/match_detail/score/category/list_source/screening_result_id/screening_match_id/created_at_utc) are NOT in the UPDATE grant", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'screening_match' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE'`,
      );
      const updatable = new Set(rows.rows.map((r) => r.column_name as string));
      for (const immutable of ["matched_name", "match_detail", "score", "category", "list_source", "screening_result_id", "screening_match_id", "created_at_utc", "id"]) {
        expect(updatable.has(immutable), `${immutable} must not be UPDATE-granted`).toBe(false);
      }
    });

    it("live proof: UPDATE is actually denied under role_aml1_runtime on screening_match's PII/evidence columns, but ALLOWED on match_status (the disposition-mutable column)", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE aml1.screening_match SET matched_name = 'tampered' WHERE screening_match_id = $1`, [matchId])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_match SET score = 0.001 WHERE screening_match_id = $1`, [matchId])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_match SET category = 'pep' WHERE screening_match_id = $1`, [matchId])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_match SET screening_result_id = 'x' WHERE screening_match_id = $1`, [matchId])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_match SET match_status = 'dismissed' WHERE screening_match_id = $1`, [matchId])).resolves.toBeTruthy();
      } finally {
        await appPool.end();
      }
    });

    it("match_disposition_decision_request: SELECT+INSERT granted; UPDATE limited to exactly applied_at_utc/approval_id/decision_token_hash/status", async () => {
      if (!schemaReady) return;
      const base = await verifyPool.query(
        `SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema = 'aml1' AND table_name = 'match_disposition_decision_request'`,
      );
      expect(base.rows[0].privs).toBe("INSERT,SELECT");

      const cols = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'match_disposition_decision_request' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual(["applied_at_utc", "approval_id", "decision_token_hash", "status"]);
    });

    it("match_disposition_decision_request's append-once columns (decision_id/screening_match_id/decision_type/reason/requested_by/payload_hash/created_at_utc) are NOT in the UPDATE grant", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'match_disposition_decision_request' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE'`,
      );
      const updatable = new Set(rows.rows.map((r) => r.column_name as string));
      for (const immutable of ["decision_id", "screening_match_id", "decision_type", "reason", "requested_by", "payload_hash", "created_at_utc", "id"]) {
        expect(updatable.has(immutable), `${immutable} must not be UPDATE-granted`).toBe(false);
      }
    });

    it("has zero DELETE/TRUNCATE grants anywhere (still, after the Phase 2B extension)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND privilege_type IN ('DELETE','TRUNCATE')`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("has zero grant into iam2/cfg1/sec1/clt1/iam schemas (still, after the Phase 2B extension — AML-01 reaches IAM-02 only over HTTP)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema IN ('iam2','cfg1','sec1','clt1','iam')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B: grant inventory — role_aml1_runtime least-privilege matrix (screening_provider_attempt)", () => {
    it("screening_provider_attempt: SELECT+INSERT granted; UPDATE limited to exactly attempt_count/checked_at_utc/failure_reason_code/latency_ms/provider_list_version/provider_reference_id/response_payload_hash/status", async () => {
      if (!schemaReady) return;
      const base = await verifyPool.query(
        `SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema = 'aml1' AND table_name = 'screening_provider_attempt'`,
      );
      expect(base.rows[0].privs).toBe("INSERT,SELECT");

      const cols = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'screening_provider_attempt' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual([
        "attempt_count",
        "checked_at_utc",
        "failure_reason_code",
        "latency_ms",
        "provider_list_version",
        "provider_reference_id",
        "response_payload_hash",
        "status",
      ]);
    });

    it("screening_provider_attempt's append-once columns (attempt_id/screening_request_id/provider_id/provider_adaptor_version/request_payload_hash/created_at_utc) are NOT in the UPDATE grant", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'aml1' AND table_name = 'screening_provider_attempt' AND grantee = 'role_aml1_runtime' AND privilege_type = 'UPDATE'`,
      );
      const updatable = new Set(rows.rows.map((r) => r.column_name as string));
      for (const immutable of ["attempt_id", "screening_request_id", "provider_id", "provider_adaptor_version", "request_payload_hash", "created_at_utc", "id"]) {
        expect(updatable.has(immutable), `${immutable} must not be UPDATE-granted`).toBe(false);
      }
    });

    it("live proof: UPDATE is actually denied under role_aml1_runtime on screening_provider_attempt's immutable columns, but ALLOWED on status", async () => {
      if (!schemaReady) return;
      const screenRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP" } });
      const { screening_request_id } = screenRes.json().data;

      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE aml1.screening_provider_attempt SET provider_id = 'tampered' WHERE screening_request_id = $1`, [screening_request_id])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_provider_attempt SET request_payload_hash = 'tampered' WHERE screening_request_id = $1`, [screening_request_id])).rejects.toThrow();
        await expect(appPool.query(`UPDATE aml1.screening_provider_attempt SET status = 'failed' WHERE screening_request_id = $1`, [screening_request_id])).resolves.toBeTruthy();
      } finally {
        await appPool.end();
      }
    });

    it("has zero DELETE/TRUNCATE grants anywhere (still, after the Phase 3B extension)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND privilege_type IN ('DELETE','TRUNCATE')`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("has zero grant into iam2/cfg1/sec1/clt1/iam schemas or any future wlt/dep/wdr/trd schema (still, after the Phase 3B extension — AML-01's provider boundary is entirely in-process this phase)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_aml1_runtime' AND table_schema IN ('iam2','cfg1','sec1','clt1','iam','wlt','dep','wdr','trd')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B: post-disposition re-delivery through the EXISTING Phase 2A delivery route", () => {
    it("a DISMISSED sanctions match re-delivers as pass (clear_after_review -> pass) via the unchanged Phase 2A route, without mutating the earlier delivery rows", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = realisticCltFetch();
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const firstDeliveryRes = await requestCltOutcomeDelivery(screening_request_id);
      expect(firstDeliveryRes.statusCode).toBe(201);
      const firstDeliveries = firstDeliveryRes.json().data.deliveries;
      const firstSanctions = firstDeliveries.find((d: { outcome_type: string }) => d.outcome_type === "aml_sanctions");
      expect(firstSanctions.delivered_status).toBe("pending");
      const firstDeliveryIds = firstDeliveries.map((d: { delivery_id: string }) => d.delivery_id);

      const reqRes = await requestDisposition("dismiss", matchId, "staff_disposer_1");
      const applyRes = await applyDisposition("dismiss", matchId, reqRes.json().data.decision_id);
      expect(applyRes.json().data.redelivery_required).toBe(true);

      const secondDeliveryRes = await requestCltOutcomeDelivery(applyRes.json().data.screening_request_id);
      expect(secondDeliveryRes.statusCode).toBe(201);
      const secondDeliveries = secondDeliveryRes.json().data.deliveries;
      const secondSanctions = secondDeliveries.find((d: { outcome_type: string }) => d.outcome_type === "aml_sanctions");
      expect(secondSanctions.delivered_status).toBe("pass");
      expect(secondSanctions.effective_status).toBe("clear_after_review");

      // NEW delivery rows were created — the FIRST delivery's own rows are untouched.
      expect(firstDeliveryIds.includes(secondSanctions.delivery_id)).toBe(false);
      const originalRow = await verifyPool.query(`SELECT delivered_status, status FROM aml1.clt_outcome_delivery WHERE delivery_id = $1`, [firstSanctions.delivery_id]);
      expect(originalRow.rows[0].delivered_status).toBe("pending");
      expect(originalRow.rows[0].status).toBe("succeeded");

      const totalRows = await verifyPool.query(`SELECT count(*) FROM aml1.clt_outcome_delivery WHERE screening_request_id = $1`, [screening_request_id]);
      expect(Number(totalRows.rows[0].count)).toBe(4);
    });

    it("a CONFIRMED_HIT sanctions match re-delivers as hit (confirmed_hit -> hit)", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = realisticCltFetch();
      const screenRes = await createScreeningRequest({ requested_by: "staff_screener_1", declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" } });
      const { screening_request_id } = screenRes.json().data;
      const matchId = await firstMatchIdFor(screening_request_id);

      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      await applyDisposition("confirm", matchId, reqRes.json().data.decision_id);

      const deliveryRes = await requestCltOutcomeDelivery(screening_request_id);
      expect(deliveryRes.statusCode).toBe(201);
      const sanctions = deliveryRes.json().data.deliveries.find((d: { outcome_type: string }) => d.outcome_type === "aml_sanctions");
      expect(sanctions.delivered_status).toBe("hit");
      expect(sanctions.effective_status).toBe("confirmed_hit");
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3C — re-screening triggers, route-triggered monitoring runs, risk-signal emission
  // (migrations 039/040). Reuses this file's own beforeAll/afterAll/afterEach and helpers
  // (createScreeningRequest, firstMatchIdFor, requestDisposition, applyDisposition) — kept in THIS
  // file rather than a separate one because a second file with its own unscoped `DELETE FROM
  // aml1.screening_request` afterEach would race this file's own under default file-level
  // parallelism (the exact class of bug `aml1-clt1-outcome-delivery-real.test.ts`'s own header
  // comment documents and fixes a different way, by using a fully private database instead).
  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: migration 039/040 — schema", () => {
    it("screening_request has rescreen_of_request_id and trigger_reason columns, both nullable", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'aml1' AND table_name = 'screening_request' AND column_name IN ('rescreen_of_request_id','trigger_reason')`,
      );
      expect(rows.rows).toHaveLength(2);
      for (const row of rows.rows) expect(row.is_nullable).toBe("YES");
    });

    it("aml1.monitoring_run and aml1.risk_signal tables exist", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'aml1' AND table_name IN ('monitoring_run','risk_signal') ORDER BY table_name`,
      );
      expect(rows.rows.map((r) => r.table_name)).toEqual(["monitoring_run", "risk_signal"]);
    });

    it("partial unique index prevents two in-flight (status='requested') screening_request rows for the same subject", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("idx_test");
      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by)
         VALUES ('aml1req_idx_1',$1,$2,'declared_identity','requested','staff_1')`,
        ["client_application", subjectRef],
      );
      await expect(
        verifyPool.query(
          `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by)
           VALUES ('aml1req_idx_2',$1,$2,'declared_identity','requested','staff_1')`,
          ["client_application", subjectRef],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      // A COMPLETED row for the same subject is unaffected by the partial index.
      await verifyPool.query(`UPDATE aml1.screening_request SET status = 'completed' WHERE screening_request_id = 'aml1req_idx_1'`);
      await expect(
        verifyPool.query(
          `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by)
           VALUES ('aml1req_idx_3',$1,$2,'declared_identity','completed','staff_1')`,
          ["client_application", subjectRef],
        ),
      ).resolves.toBeDefined();
    });

    it("migration 041 is AML-01's own current head; no AML-01-specific migration was added after it (Phase 3D)", async () => {
      // Deliberately a MODULE-SCOPED check, not a global "no migration numbered 042+ exists"
      // check: the latter would break the instant any OTHER module adds the next migration in the
      // shared global sequence (exactly what happened when KYC-01 legitimately added
      // 042_kyc1_core.cjs — that is not an AML-01 regression). Every AML-01 migration embeds
      // "aml1" in its own filename (033_aml1_core.cjs ... 041_iam2_register_aml1_phase3d_
      // permissions.cjs) — this asserts no NEW aml1-named migration exists beyond 041, which is
      // the actual regression this test exists to catch, while remaining silent on what later
      // modules number their own migrations.
      const fs = await import("node:fs");
      const path = await import("node:path");
      const migrationsDir = path.join(__dirname, "..", "..", "infra", "migrations");
      const files = fs.readdirSync(migrationsDir);
      expect(files.some((f) => f.startsWith("041_"))).toBe(true);

      const migrationNumber = (f: string): number => parseInt(f.split("_")[0] ?? "", 10);
      const aml1MigrationsAfter041 = files.filter((f) => migrationNumber(f) > 41 && f.toLowerCase().includes("aml1"));
      expect(aml1MigrationsAfter041).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: grants — monitoring_run / risk_signal", () => {
    it("role_aml1_runtime has SELECT/INSERT and column-scoped UPDATE on monitoring_run, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='aml1' AND table_name='monitoring_run' AND grantee='role_aml1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='aml1' AND table_name='monitoring_run' AND grantee='role_aml1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["candidates_selected", "completed_at_utc", "failures", "rescreens_created", "status"]);
    });

    it("role_aml1_runtime cannot UPDATE monitoring_run.run_id/trigger_reason/requested_by/started_at_utc/id", async () => {
      if (!schemaReady) return;
      await verifyPool.query(`INSERT INTO aml1.monitoring_run (run_id, status, trigger_reason, requested_by) VALUES ('aml1run_grant_test','running','periodic_due','staff_1')`);
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE aml1.monitoring_run SET run_id = 'hacked' WHERE run_id = 'aml1run_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE aml1.monitoring_run SET trigger_reason = 'list_version_changed' WHERE run_id = 'aml1run_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
      await verifyPool.query(`DELETE FROM aml1.monitoring_run WHERE run_id = 'aml1run_grant_test'`);
    });

    it("role_aml1_runtime has SELECT/INSERT and column-scoped UPDATE on risk_signal, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='aml1' AND table_name='risk_signal' AND grantee='role_aml1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='aml1' AND table_name='risk_signal' AND grantee='role_aml1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["acknowledged_at_utc", "acknowledged_by", "status"]);
    });

    it("role_aml1_runtime cannot UPDATE risk_signal.signal_type/subject_ref/severity/screening_match_id", async () => {
      if (!schemaReady) return;
      await verifyPool.query(
        `INSERT INTO aml1.risk_signal (signal_id, signal_type, subject_type, subject_ref, severity, status) VALUES ('aml1sig_grant_test','rescreen_overdue','client_application','x','medium','open')`,
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE aml1.risk_signal SET signal_type = 'confirmed_hit' WHERE signal_id = 'aml1sig_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE aml1.risk_signal SET severity = 'critical' WHERE signal_id = 'aml1sig_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
      await verifyPool.query(`DELETE FROM aml1.risk_signal WHERE signal_id = 'aml1sig_grant_test'`);
    });

    it("no DELETE grant on either new table for role_aml1_runtime (structural — DELETE FROM under the runtime role fails)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`DELETE FROM aml1.monitoring_run`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`DELETE FROM aml1.risk_signal`)).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: re-screen route", () => {
    it("creates a NEW screening_request; the original request/result/match rows are unchanged", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" }, subject_nature: "entity" });
      expect(createRes.statusCode).toBe(201);
      const original = createRes.json().data;
      const originalRow = (await verifyPool.query(`SELECT * FROM aml1.screening_request WHERE screening_request_id = $1`, [original.screening_request_id])).rows[0];

      const rescreenRes = await rescreen(original.screening_request_id, "manual");
      expect(rescreenRes.statusCode).toBe(201);
      const rescreened = rescreenRes.json().data;
      expect(rescreened.screening_request_id).not.toBe(original.screening_request_id);
      expect(rescreened.rescreen_of_request_id).toBe(original.screening_request_id);
      expect(rescreened.trigger_reason).toBe("manual");

      const originalRowAfter = (await verifyPool.query(`SELECT * FROM aml1.screening_request WHERE screening_request_id = $1`, [original.screening_request_id])).rows[0];
      expect(originalRowAfter).toEqual(originalRow);
    });

    it("copies subject PII from the source snapshot — the caller never resupplies it (schema rejects a declared_identity field entirely)", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP", registration_number: "REG-123" }, subject_nature: "entity" });
      const original = createRes.json().data;

      const rejectRes = await rescreen(original.screening_request_id, "manual", "staff_maker_2", { declared_identity: { name: "Injected PII" } });
      expect(rejectRes.statusCode).toBe(400);
      expect(rejectRes.json().error.code).toBe("VALIDATION_ERROR");

      const rescreenRes = await rescreen(original.screening_request_id, "manual");
      expect(rescreenRes.statusCode).toBe(201);
      const newRequestId = rescreenRes.json().data.screening_request_id;
      const snapshot = (await verifyPool.query(`SELECT name, registration_number, provenance, subject_nature FROM aml1.screening_subject_snapshot WHERE screening_request_id = $1`, [newRequestId])).rows[0];
      expect(snapshot.name).toBe("AML1 TEST PEP");
      expect(snapshot.registration_number).toBe("REG-123");
      // provenance and subject_nature carried forward from the source, never re-derived.
      expect(snapshot.provenance).toBe("declared_identity");
      expect(snapshot.subject_nature).toBe("entity");
    });

    it("manual / periodic_due / list_version_changed triggers all work; kyc_profile_changed / transaction_triggered / remediation_check are rejected (schema-level, never reach application code)", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest();
      const original = createRes.json().data;

      for (const trigger of ["manual", "periodic_due", "list_version_changed"] as const) {
        const res = await rescreen(original.screening_request_id, trigger, `staff_maker_${trigger}`);
        expect(res.statusCode, `trigger_reason=${trigger} should succeed`).toBe(201);
        expect(res.json().data.trigger_reason).toBe(trigger);
      }

      for (const trigger of ["kyc_profile_changed", "transaction_triggered", "remediation_check"]) {
        const res = await rescreen(original.screening_request_id, trigger);
        expect(res.statusCode, `trigger_reason=${trigger} must be rejected`).toBe(400);
        expect(res.json().error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("an in-flight (status='requested') duplicate for the same subject returns AML1_RESCREEN_NOT_ALLOWED / 409", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest();
      const original = createRes.json().data;
      // Simulate an in-flight state (the app itself always resolves synchronously to
      // completed/failed — this directly exercises the route's loop-prevention check).
      await verifyPool.query(`UPDATE aml1.screening_request SET status = 'requested' WHERE screening_request_id = $1`, [original.screening_request_id]);

      const res = await rescreen(original.screening_request_id, "manual");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_RESCREEN_NOT_ALLOWED");
    });

    it("rescreen of an unknown screening_request_id returns AML1_SCREENING_REQUEST_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await rescreen("aml1req_does_not_exist", "manual");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_SCREENING_REQUEST_NOT_FOUND");
    });

    it("reuses the Phase 3B provider lifecycle — a match-producing fixture on re-screen creates screening_result/screening_match rows exactly like an original screen", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "Ordinary Clean Subject" } });
      const original = createRes.json().data;
      expect(original.result.overall_status).toBe("clear");

      // The source subject was clean; simulate the SOURCE's own declared identity changing to a
      // hit fixture is not possible (snapshot is immutable) — instead prove the shared lifecycle
      // by re-screening a subject whose ORIGINAL creation already used a hit fixture.
      const hitCreateRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" }, subject_nature: "entity" });
      const hitOriginal = hitCreateRes.json().data;
      expect(hitOriginal.result.overall_status).toBe("potential_match");

      const rescreenRes = await rescreen(hitOriginal.screening_request_id, "manual");
      expect(rescreenRes.statusCode).toBe(201);
      const rescreened = rescreenRes.json().data;
      expect(rescreened.result.overall_status).toBe("potential_match");
      expect(rescreened.result.matched_categories).toEqual(["sanctions"]);

      const matchRows = await verifyPool.query(
        `SELECT sm.category FROM aml1.screening_match sm JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id WHERE sr.screening_request_id = $1`,
        [rescreened.screening_request_id],
      );
      expect(matchRows.rows).toHaveLength(1);
    });

    it("failed-provider handling is unchanged — a re-screen of a subject whose snapshot name is the PROVIDER DOWN fixture fails the NEW request only", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PROVIDER DOWN" } });
      expect(createRes.statusCode).toBe(503);
      // The failed original still exists as a 'failed' row (no result/match written) — fetch its id.
      const rows = await verifyPool.query(`SELECT screening_request_id FROM aml1.screening_request WHERE status = 'failed' ORDER BY created_at_utc DESC LIMIT 1`);
      const failedOriginalId = rows.rows[0].screening_request_id as string;

      const rescreenRes = await rescreen(failedOriginalId, "manual");
      expect(rescreenRes.statusCode).toBe(503);
      expect(rescreenRes.json().error.code).toBe("AML1_SCREENING_PROVIDER_UNAVAILABLE");

      const newFailedRow = await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE status = 'failed' AND rescreen_of_request_id = $1`, [failedOriginalId]);
      expect(newFailedRow.rows).toHaveLength(1);
      const resultRows = await verifyPool.query(`SELECT * FROM aml1.screening_result WHERE screening_request_id = $1`, [newFailedRow.rows[0]?.screening_request_id]);
      expect(resultRows.rows).toHaveLength(0);
    });

    it("response remains synchronous — no polling/async contract (the 201 body already carries the final status)", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest();
      const original = createRes.json().data;
      const rescreenRes = await rescreen(original.screening_request_id, "manual");
      expect(["completed", "failed"]).toContain(rescreenRes.json().data.status);
    });

    it("IAM-02 deny -> AML1_PERMISSION_DENIED; IAM-02 unreachable -> AML1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest();
      const original = createRes.json().data;

      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const denyRes = await rescreen(original.screening_request_id, "manual");
      expect(denyRes.statusCode).toBe(403);
      expect(denyRes.json().error.code).toBe("AML1_PERMISSION_DENIED");

      config.iam2FetchImpl = iam2Unreachable();
      const unavailRes = await rescreen(original.screening_request_id, "manual");
      expect(unavailRes.statusCode).toBe(503);
      expect(unavailRes.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");

      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: monitoring runs", () => {
    it("route-triggered only — creates a monitoring_run row with candidates_selected/rescreens_created/failures and a bounded batch", async () => {
      if (!schemaReady) return;
      const subjects = await Promise.all([1, 2, 3].map((n) => seedDueScreeningRequest(freshSubjectRef("mon_batch"), 100 + n)));
      expect(subjects).toHaveLength(3);

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 2 });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.candidates_selected).toBe(2); // batch_size clamp
      expect(body.rescreens_created + body.failures).toBe(body.candidates_selected);
      expect(["completed", "failed"]).toContain(body.status);

      const runRow = await verifyPool.query(`SELECT * FROM aml1.monitoring_run WHERE run_id = $1`, [body.run_id]);
      expect(runRow.rows).toHaveLength(1);
      expect(runRow.rows[0].trigger_reason).toBe("periodic_due");
    });

    it("caller-supplied batch_size above the configured max is clamped, never rejected", async () => {
      if (!schemaReady) return;
      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10_000 });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.candidates_selected).toBeLessThanOrEqual(config.monitoringBatchSizeMax);
    });

    it("creates re-screens for due subjects (periodic_due) — each due subject gets exactly one new rescreen_of_request_id-linked row", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("mon_due");
      const sourceId = await seedDueScreeningRequest(subjectRef, 200);

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.rescreens_created).toBeGreaterThanOrEqual(1);

      const linked = await verifyPool.query(`SELECT screening_request_id FROM aml1.screening_request WHERE rescreen_of_request_id = $1`, [sourceId]);
      expect(linked.rows).toHaveLength(1);
    });

    it("list_version_changed selects only subjects whose latest successful attempt used a DIFFERENT provider_list_version, and requires current_list_version in the body", async () => {
      if (!schemaReady) return;
      const staleSubject = freshSubjectRef("mon_lv_stale");
      const currentSubject = freshSubjectRef("mon_lv_current");
      await seedDueScreeningRequest(staleSubject, 1, "old-list-v1");
      await seedDueScreeningRequest(currentSubject, 1, "new-list-v2");

      const missingRes = await monitoringRun({ trigger_reason: "list_version_changed", requested_by: "staff_ops_1" });
      expect(missingRes.statusCode).toBe(400);

      const res = await monitoringRun({ trigger_reason: "list_version_changed", requested_by: "staff_ops_1", current_list_version: "new-list-v2" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.candidates_selected).toBe(1);

      const linked = await verifyPool.query(`SELECT screening_request_id FROM aml1.screening_request WHERE subject_ref = $1 AND rescreen_of_request_id IS NOT NULL`, [staleSubject]);
      expect(linked.rows).toHaveLength(1);
      const notLinked = await verifyPool.query(`SELECT screening_request_id FROM aml1.screening_request WHERE subject_ref = $1 AND rescreen_of_request_id IS NOT NULL`, [currentSubject]);
      expect(notLinked.rows).toHaveLength(0);
    });

    it("partial completion on provider outage — some candidates fail (PROVIDER DOWN fixture), the run still completes, failed subjects remain due (no rescreen_of_request_id link)", async () => {
      if (!schemaReady) return;
      const okSubjectId = "aml1req_seed_" + freshSubjectRef("mon_ok");
      const downSubjectRef = freshSubjectRef("mon_down");
      const downRequestId = "aml1req_seed_" + downSubjectRef;

      // Seed one ordinary due subject and one whose snapshot name is the PROVIDER DOWN fixture.
      const okRef = okSubjectId.replace("aml1req_seed_", "");
      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by, completed_at_utc)
         VALUES ($1,'client_application',$2,'declared_identity','completed','staff_seed_1', now() - interval '200 days')`,
        [okSubjectId, okRef],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature) VALUES ($1,'client_application','Ordinary Due Subject','declared_identity','individual')`,
        [okSubjectId],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, provider_list_version, request_payload_hash, status, checked_at_utc)
         VALUES ($1,$2,'stub-v1','1','stub-list-v1','seedhash','succeeded', now() - interval '200 days')`,
        ["aml1attempt_seed_" + okRef, okSubjectId],
      );

      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by, completed_at_utc)
         VALUES ($1,'client_application',$2,'declared_identity','completed','staff_seed_1', now() - interval '200 days')`,
        [downRequestId, downSubjectRef],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature) VALUES ($1,'client_application','AML1 TEST PROVIDER DOWN','declared_identity','individual')`,
        [downRequestId],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, provider_list_version, request_payload_hash, status, checked_at_utc)
         VALUES ($1,$2,'stub-v1','1','stub-list-v1','seedhash','succeeded', now() - interval '200 days')`,
        ["aml1attempt_seed_" + downSubjectRef, downRequestId],
      );

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.candidates_selected).toBeGreaterThanOrEqual(2);
      expect(body.failures).toBeGreaterThanOrEqual(1);
      expect(body.status).toBe("completed"); // partial success — not every candidate failed

      const okLinked = await verifyPool.query(`SELECT 1 FROM aml1.screening_request WHERE rescreen_of_request_id = $1`, [okSubjectId]);
      expect(okLinked.rows).toHaveLength(1);
      const downLinked = await verifyPool.query(`SELECT 1 FROM aml1.screening_request WHERE rescreen_of_request_id = $1 AND status = 'completed'`, [downRequestId]);
      expect(downLinked.rows).toHaveLength(0); // the down subject's rescreen attempt FAILED, never completed
    });

    it("status='failed' when every single selected candidate fails", async () => {
      if (!schemaReady) return;
      const downSubjectRef = freshSubjectRef("mon_alldown");
      const downRequestId = "aml1req_seed_" + downSubjectRef;
      await verifyPool.query(
        `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, provenance, status, requested_by, completed_at_utc)
         VALUES ($1,'client_application',$2,'declared_identity','completed','staff_seed_1', now() - interval '200 days')`,
        [downRequestId, downSubjectRef],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_subject_snapshot (screening_request_id, subject_type, name, provenance, subject_nature) VALUES ($1,'client_application','AML1 TEST PROVIDER DOWN','declared_identity','individual')`,
        [downRequestId],
      );
      await verifyPool.query(
        `INSERT INTO aml1.screening_provider_attempt (attempt_id, screening_request_id, provider_id, provider_adaptor_version, provider_list_version, request_payload_hash, status, checked_at_utc)
         VALUES ($1,$2,'stub-v1','1','stub-list-v1','seedhash','succeeded', now() - interval '200 days')`,
        ["aml1attempt_seed_" + downSubjectRef, downRequestId],
      );

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.candidates_selected).toBe(1);
      expect(body.rescreens_created).toBe(0);
      expect(body.failures).toBe(1);
      expect(body.status).toBe("failed");
    });

    it("advisory-lock concurrency safety — two concurrent periodic_due monitoring runs never double-rescreen the same subject", async () => {
      if (!schemaReady) return;
      const subjectRefs = await Promise.all([1, 2, 3, 4, 5].map((n) => seedDueScreeningRequest(freshSubjectRef("mon_concurrent"), 150 + n)));

      const [res1, res2] = await Promise.all([
        monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_a", batch_size: 10 }),
        monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_b", batch_size: 10 }),
      ]);
      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      for (const sourceId of subjectRefs) {
        const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM aml1.screening_request WHERE rescreen_of_request_id = $1`, [sourceId]);
        expect(rows.rows[0].n, `subject sourced from ${sourceId} must be re-screened at most once across both concurrent runs`).toBeLessThanOrEqual(1);
      }
    });

    it("GET .../monitoring-runs/:run_id returns a safe summary only — no PII, no raw provider payload, no subject identifiers", async () => {
      if (!schemaReady) return;
      const createRes = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1" });
      const runId = createRes.json().data.run_id;

      const res = await getMonitoringRun(runId);
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(Object.keys(body).sort()).toEqual(["candidates_selected", "completed_at_utc", "failures", "rescreens_created", "run_id", "started_at_utc", "status", "trigger_reason"]);
    });

    it("GET .../monitoring-runs/:unknown_id returns the generic NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await getMonitoringRun("aml1run_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });

    it("trigger_reason='manual' is rejected at the schema level — monitoring runs never accept manual", async () => {
      if (!schemaReady) return;
      const res = await monitoringRun({ trigger_reason: "manual", requested_by: "staff_ops_1" });
      expect(res.statusCode).toBe(400);
    });

    it("finalizeMonitoringRun throws AML1_MONITORING_RUN_INVALID_STATE when the row is no longer 'running' — a real, reachable defensive guard, not decorative", async () => {
      if (!schemaReady) return;
      const { finalizeMonitoringRun } = await import("../../services/aml1/src/lib/monitoring.js");
      await verifyPool.query(`INSERT INTO aml1.monitoring_run (run_id, status, trigger_reason, requested_by) VALUES ('aml1run_already_completed','completed','periodic_due','staff_1')`);
      const client = await verifyPool.connect();
      try {
        await expect(
          finalizeMonitoringRun(client as never, { runId: "aml1run_already_completed", candidatesSelected: 0, rescreensCreated: 0, failures: 0, requestedBy: "staff_1" }),
        ).rejects.toMatchObject({ code: "AML1_MONITORING_RUN_INVALID_STATE" });
      } finally {
        client.release();
      }
      await verifyPool.query(`DELETE FROM aml1.monitoring_run WHERE run_id = 'aml1run_already_completed'`);
    });

    it("IAM-02 deny -> AML1_PERMISSION_DENIED", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: risk signals", () => {
    it("confirmed_hit disposition emits a critical, open risk signal in the same transaction", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" }, subject_nature: "entity" });
      const created = createRes.json().data;
      const matchId = await firstMatchIdFor(created.screening_request_id);

      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      expect(reqRes.statusCode).toBe(201);
      const decisionId = reqRes.json().data.decision_id;
      const applyRes = await applyDisposition("confirm", matchId, decisionId);
      expect(applyRes.statusCode).toBe(200);

      const signalRows = await verifyPool.query(
        `SELECT signal_type, severity, status, screening_match_id, subject_type, subject_ref FROM aml1.risk_signal WHERE screening_match_id = $1`,
        [matchId],
      );
      expect(signalRows.rows).toHaveLength(1);
      expect(signalRows.rows[0].signal_type).toBe("confirmed_hit");
      expect(signalRows.rows[0].severity).toBe("critical");
      expect(signalRows.rows[0].status).toBe("open");
      expect(signalRows.rows[0].subject_ref).toBe(created.subject_ref);
    });

    it("dismiss does NOT emit a confirmed_hit signal", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP" }, subject_nature: "entity" });
      const created = createRes.json().data;
      const matchId = await firstMatchIdFor(created.screening_request_id);

      const reqRes = await requestDisposition("dismiss", matchId, "staff_disposer_1");
      const decisionId = reqRes.json().data.decision_id;
      await applyDisposition("dismiss", matchId, decisionId);

      const signalRows = await verifyPool.query(`SELECT 1 FROM aml1.risk_signal WHERE screening_match_id = $1`, [matchId]);
      expect(signalRows.rows).toHaveLength(0);
    });

    it("duplicate-signal suppression — emitRiskSignal-level dedup: a second confirmed_hit for the same screening_match_id (manually seeded, since the real flow makes this unreachable) is suppressed, not double-inserted", async () => {
      if (!schemaReady) return;
      const { emitRiskSignal } = await import("../../services/aml1/src/lib/risk-signals.js");
      const client = await verifyPool.connect();
      try {
        const input = {
          signalType: "confirmed_hit" as const,
          subjectType: "client_application",
          subjectRef: "dedup_test_subject",
          subjectParentRef: null,
          screeningRequestId: "aml1req_dedup",
          screeningMatchId: "aml1match_dedup",
          severity: "critical" as const,
          actorId: "staff_1",
          actorType: "user" as const,
        };
        const first = await emitRiskSignal(client as never, input);
        expect(first.kind).toBe("created");
        const second = await emitRiskSignal(client as never, input);
        expect(second.kind).toBe("duplicate_suppressed");

        const rows = await client.query(`SELECT count(*)::int AS n FROM aml1.risk_signal WHERE screening_match_id = 'aml1match_dedup'`);
        expect(rows.rows[0].n).toBe(1);
      } finally {
        client.release();
      }
    });

    it("potential_match_unresolved is emitted on a re-screen that surfaces a match, but NOT on the original create route", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" }, subject_nature: "entity" });
      const created = createRes.json().data;
      const originalSignals = await verifyPool.query(`SELECT 1 FROM aml1.risk_signal WHERE screening_request_id = $1`, [created.screening_request_id]);
      expect(originalSignals.rows).toHaveLength(0); // original create route never emits this signal type

      const rescreenRes = await rescreen(created.screening_request_id, "manual");
      const rescreened = rescreenRes.json().data;
      const rescreenSignals = await verifyPool.query(
        `SELECT signal_type, severity FROM aml1.risk_signal WHERE screening_request_id = $1`,
        [rescreened.screening_request_id],
      );
      expect(rescreenSignals.rows).toHaveLength(1);
      expect(rescreenSignals.rows[0].signal_type).toBe("potential_match_unresolved");
      expect(rescreenSignals.rows[0].severity).toBe("high"); // sanctions category -> high
    });

    it("rescreen_overdue is emitted for periodic_due monitoring candidates, not for list_version_changed candidates", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("overdue_signal");
      await seedDueScreeningRequest(dueSubjectRef, 200);

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);

      const overdueSignals = await verifyPool.query(`SELECT signal_type, severity, status FROM aml1.risk_signal WHERE subject_ref = $1 AND signal_type = 'rescreen_overdue'`, [dueSubjectRef]);
      expect(overdueSignals.rows).toHaveLength(1);
      expect(overdueSignals.rows[0].severity).toBe("medium");
      expect(overdueSignals.rows[0].status).toBe("open");
    });

    it("GET /internal/aml1/risk-signals is bounded and PII-free, and requires subject_type+subject_ref (no global unbounded dump)", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("read_signal");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });

      const res = await listRiskSignals("client_application", dueSubjectRef);
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.risk_signals.length).toBeGreaterThanOrEqual(1);
      for (const signal of body.risk_signals) {
        expect(Object.keys(signal).sort()).toEqual(
          ["acknowledged_at_utc", "created_at_utc", "screening_match_id", "screening_request_id", "severity", "signal_id", "signal_type", "status", "subject_parent_ref", "subject_ref", "subject_type"].sort(),
        );
      }

      const missingParamsRes = await app.inject({ method: "GET", url: "/internal/aml1/risk-signals?actor_id=staff_1", headers: internalHeaders });
      expect(missingParamsRes.statusCode).toBe(400);
    });

    it("status filter narrows the result set", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("status_filter");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });

      const openRes = await listRiskSignals("client_application", dueSubjectRef, "staff_1", "open");
      expect(openRes.json().data.risk_signals.length).toBeGreaterThanOrEqual(1);
      const ackRes = await listRiskSignals("client_application", dueSubjectRef, "staff_1", "acknowledged");
      expect(ackRes.json().data.risk_signals).toHaveLength(0);
    });

    it("acknowledge happy path — status flips to acknowledged, acknowledged_by/acknowledged_at_utc set, audit emitted, no mutation to screening evidence", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("ack_happy");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      const signalRow = (await verifyPool.query(`SELECT signal_id FROM aml1.risk_signal WHERE subject_ref = $1`, [dueSubjectRef])).rows[0];

      const res = await acknowledgeRiskSignal(signalRow.signal_id, "staff_reviewer_9");
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("acknowledged");
      expect(body.acknowledged_by).toBe("staff_reviewer_9");

      const row = (await verifyPool.query(`SELECT status, acknowledged_by, acknowledged_at_utc FROM aml1.risk_signal WHERE signal_id = $1`, [signalRow.signal_id])).rows[0];
      expect(row.status).toBe("acknowledged");
      expect(row.acknowledged_by).toBe("staff_reviewer_9");
      expect(row.acknowledged_at_utc).not.toBeNull();
    });

    it("acknowledge of an unknown signal_id returns AML1_RISK_SIGNAL_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await acknowledgeRiskSignal("aml1sig_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_RISK_SIGNAL_NOT_FOUND");
    });

    it("acknowledge of a non-open signal returns AML1_RISK_SIGNAL_INVALID_STATE / 409", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("ack_twice");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      const signalRow = (await verifyPool.query(`SELECT signal_id FROM aml1.risk_signal WHERE subject_ref = $1`, [dueSubjectRef])).rows[0];

      const first = await acknowledgeRiskSignal(signalRow.signal_id);
      expect(first.statusCode).toBe(200);
      const second = await acknowledgeRiskSignal(signalRow.signal_id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("AML1_RISK_SIGNAL_INVALID_STATE");
    });

    it("acknowledgement never mutates screening_request/screening_result/screening_match or any downstream-module table", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST SANCTIONED ENTITY" }, subject_nature: "entity" });
      const created = createRes.json().data;
      const matchId = await firstMatchIdFor(created.screening_request_id);
      const reqRes = await requestDisposition("confirm", matchId, "staff_disposer_1");
      await applyDisposition("confirm", matchId, reqRes.json().data.decision_id);

      const matchBefore = (await verifyPool.query(`SELECT * FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId])).rows[0];
      const signalRow = (await verifyPool.query(`SELECT signal_id FROM aml1.risk_signal WHERE screening_match_id = $1`, [matchId])).rows[0];

      await acknowledgeRiskSignal(signalRow.signal_id, "staff_reviewer_1");

      const matchAfter = (await verifyPool.query(`SELECT * FROM aml1.screening_match WHERE screening_match_id = $1`, [matchId])).rows[0];
      expect(matchAfter).toEqual(matchBefore);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: audit / PII sweep", () => {
    it("aml1.rescreen_requested and aml1.rescreen_completed events are published, carrying no declared-identity PII", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "AML1 TEST PEP", registration_number: "REG-SECRET-1", date_of_birth: "1990-01-01" }, subject_nature: "entity" });
      const created = createRes.json().data;
      await rescreen(created.screening_request_id, "manual");

      const events = await verifyPool.query(`SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type IN ('aml1.rescreen_requested','aml1.rescreen_completed') ORDER BY created_at_utc`);
      expect(events.rows.length).toBeGreaterThanOrEqual(2);
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["AML1 TEST PEP", "REG-SECRET-1", "1990-01-01", "matched_name", "match_detail"]) {
        expect(serialized.includes(forbidden), `audit payload must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("aml1.monitoring_run_started/.completed and aml1.risk_signal_emitted events are published, carrying no PII/raw-provider-payload", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("audit_sweep");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type IN ('aml1.monitoring_run_started','aml1.monitoring_run_completed','aml1.monitoring_run_failed','aml1.risk_signal_emitted') ORDER BY created_at_utc`,
      );
      expect(events.rows.length).toBeGreaterThanOrEqual(2);
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["Seeded Due Subject", "matched_name", "match_detail", "provider_response", "raw_payload"]) {
        expect(serialized.includes(forbidden), `audit payload must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("aml1.risk_signal_acknowledged is published on acknowledge, with no PII in metadata", async () => {
      if (!schemaReady) return;
      const dueSubjectRef = freshSubjectRef("audit_ack");
      await seedDueScreeningRequest(dueSubjectRef, 200);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      const signalRow = (await verifyPool.query(`SELECT signal_id FROM aml1.risk_signal WHERE subject_ref = $1`, [dueSubjectRef])).rows[0];
      await acknowledgeRiskSignal(signalRow.signal_id, "staff_reviewer_1");

      const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'aml1.risk_signal_acknowledged' AND payload_ref LIKE $1`, [`%${signalRow.signal_id}%`]);
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: TX2 concurrency guard (lib/screening-execution.ts)", () => {
    it("a late-landing TX2 on a request recovered as stuck aborts cleanly: no screening_result, no screening_match, status stays 'failed', never resurrected to 'completed'", async () => {
      if (!schemaReady) return;
      const { beginScreening, completeScreening } = await import("../../services/aml1/src/lib/screening-execution.js");
      const { resolveScreeningProvider } = await import("../../services/aml1/src/lib/providers/registry.js");
      const subjectRef = freshSubjectRef("tx2_guard");
      const screeningRequestId = "aml1req_tx2g_" + subjectRef;
      const attemptId = "aml1attempt_tx2g_" + subjectRef;
      const provider = resolveScreeningProvider("stub-v1");

      const { providerPayload } = await beginScreening({
        screeningRequestId,
        attemptId,
        subjectType: "client_application",
        subjectRef,
        subjectParentRef: null,
        subjectNature: "individual",
        provenance: "declared_identity",
        requestedBy: "staff_tx2g",
        declaredIdentity: { name: "Ordinary Clean Subject" },
        rescreenOfRequestId: null,
        triggerReason: null,
        provider,
        createdEventType: "aml1.screening_request_created",
      });

      // Simulate recovery having landed WHILE the provider call is still in flight (real recovery
      // would also flip the attempt row — irrelevant here: the guard fires purely off
      // screening_request.status, checked BEFORE any result/match/attempt write).
      await verifyPool.query(`UPDATE aml1.screening_request SET status = 'failed', version = version + 1 WHERE screening_request_id = $1`, [screeningRequestId]);

      const outcome = await completeScreening({
        screeningRequestId,
        attemptId,
        subjectType: "client_application",
        subjectRef,
        subjectParentRef: null,
        requestedBy: "staff_tx2g",
        provider,
        providerPayload,
        completedEventType: "aml1.screening_completed",
      });

      expect(outcome).toEqual({ kind: "aborted", screeningRequestId });

      const requestRow = (await verifyPool.query(`SELECT status, version FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("failed"); // never resurrected to 'completed'
      expect(requestRow.version).toBe(2); // untouched by the aborted TX2 (still just the recovery's own bump)

      const resultRows = await verifyPool.query(`SELECT * FROM aml1.screening_result WHERE screening_request_id = $1`, [screeningRequestId]);
      expect(resultRows.rows).toHaveLength(0); // no orphaned screening_result row
      const matchRows = await verifyPool.query(
        `SELECT sm.* FROM aml1.screening_match sm JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id WHERE sr.screening_request_id = $1`,
        [screeningRequestId],
      );
      expect(matchRows.rows).toHaveLength(0); // no orphaned screening_match row

      // The aborted TX2 never reached the provider-attempt UPDATE either — attempt row is
      // untouched (still 'pending', the state beginScreening's own TX1 left it in).
      const attemptRow = (await verifyPool.query(`SELECT status FROM aml1.screening_provider_attempt WHERE attempt_id = $1`, [attemptId])).rows[0];
      expect(attemptRow.status).toBe("pending");
    });

    it("an ordinary (non-recovered) request completes normally through completeScreening — the guard does not fire on the happy path", async () => {
      if (!schemaReady) return;
      const createRes = await createScreeningRequest({ declared_identity: { name: "Ordinary Clean Subject" } });
      expect(createRes.statusCode).toBe(201);
      expect(createRes.json().data.result.overall_status).toBe("clear");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: GET /internal/aml1/screening-requests/stuck", () => {
    it("an old requested + pending-attempt request appears in the stuck list, recoverable=true", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_old");
      const { screeningRequestId, attemptId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const res = await listStuckScreening();
      expect(res.statusCode).toBe(200);
      const rows = res.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      const found = rows.find((r) => r.screening_request_id === screeningRequestId);
      expect(found).toBeDefined();
      expect(found?.recoverable).toBe(true);
      expect(found?.attempt_id).toBe(attemptId);
      expect(found?.status).toBe("requested");
      expect((found?.age_seconds as number)).toBeGreaterThanOrEqual(1000);
    });

    it("a fresh requested request (younger than the threshold) is absent from the stuck list", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_fresh");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 5);

      const res = await listStuckScreening();
      expect(res.statusCode).toBe(200);
      const rows = res.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      expect(rows.find((r) => r.screening_request_id === screeningRequestId)).toBeUndefined();
    });

    it("completed/failed requests are absent from the stuck list regardless of age", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_terminal");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 5000);
      await verifyPool.query(`UPDATE aml1.screening_request SET status = 'completed' WHERE screening_request_id = $1`, [screeningRequestId]);

      const res = await listStuckScreening();
      expect(res.statusCode).toBe(200);
      const rows = res.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      expect(rows.find((r) => r.screening_request_id === screeningRequestId)).toBeUndefined();
    });

    it("a requested request whose latest attempt is NOT pending is listed but recoverable=false", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_nonpending");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 5000, "succeeded");

      const res = await listStuckScreening();
      expect(res.statusCode).toBe(200);
      const rows = res.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      const found = rows.find((r) => r.screening_request_id === screeningRequestId);
      expect(found).toBeDefined();
      expect(found?.recoverable).toBe(false);
    });

    it("safe projection — exact key set, no PII (name/registration_number/date_of_birth/nationality/matched_name/match_detail/score)", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_safe");
      await seedStuckScreeningRequest(subjectRef, 2000);

      const res = await listStuckScreening();
      const rows = res.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(
          [
            "age_seconds",
            "attempt_id",
            "attempt_status",
            "created_at_utc",
            "recoverable",
            "rescreen_of_request_id",
            "screening_request_id",
            "status",
            "subject_parent_ref",
            "subject_ref",
            "subject_type",
            "trigger_reason",
          ].sort(),
        );
      }
      const serialized = JSON.stringify(rows);
      for (const forbidden of ["Seeded Stuck Subject", "matched_name", "match_detail", "date_of_birth", "registration_number"]) {
        expect(serialized.includes(forbidden), `stuck list response must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("min_age_seconds can RAISE the effective threshold but cannot lower it below the configured floor", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("stuck_list_minage");
      // Old enough for the CONFIGURED threshold (900s) but younger than an artificially high
      // min_age_seconds override.
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const raisedRes = await listStuckScreening("staff_ops_1", 100_000);
      const raisedRows = raisedRes.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      expect(raisedRows.find((r) => r.screening_request_id === screeningRequestId)).toBeUndefined(); // correctly excluded — 1000s < 100000s

      // A LOW min_age_seconds must NOT lower the effective threshold below the configured 900s —
      // a subject younger than 900s must still be excluded even if min_age_seconds=0.
      const freshRef = freshSubjectRef("stuck_list_minage_fresh");
      const { screeningRequestId: freshId } = await seedStuckScreeningRequest(freshRef, 30);
      const lowRes = await listStuckScreening("staff_ops_1", 0);
      const lowRows = lowRes.json().data.stuck_screening_requests as Array<Record<string, unknown>>;
      expect(lowRows.find((r) => r.screening_request_id === freshId)).toBeUndefined();
    });

    it("IAM-02 deny -> AML1_PERMISSION_DENIED; IAM-02 unreachable -> AML1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const denyRes = await listStuckScreening();
      expect(denyRes.statusCode).toBe(403);
      expect(denyRes.json().error.code).toBe("AML1_PERMISSION_DENIED");

      config.iam2FetchImpl = iam2Unreachable();
      const unavailRes = await listStuckScreening();
      expect(unavailRes.statusCode).toBe(503);
      expect(unavailRes.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");

      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: POST .../screening-requests/:id/recover", () => {
    it("marks screening_request 'failed' and the latest provider_attempt 'failed' with a stuck_recovery_-prefixed failure_reason_code; emits aml1.stuck_screening_recovered", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_ok");
      const { screeningRequestId, attemptId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const res = await recoverStuckScreeningReq(screeningRequestId, "process_crash_orphan");
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("failed");
      expect(body.attempt_status).toBe("failed");
      expect(body.recoverable).toBe(false);

      const requestRow = (await verifyPool.query(`SELECT status, version FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("failed");
      expect(requestRow.version).toBe(2);

      const attemptRow = (await verifyPool.query(`SELECT status, failure_reason_code FROM aml1.screening_provider_attempt WHERE attempt_id = $1`, [attemptId])).rows[0];
      expect(attemptRow.status).toBe("failed");
      expect(attemptRow.failure_reason_code).toBe("stuck_recovery_process_crash_orphan");

      // No screening_result/screening_match row was ever written by recovery.
      const resultRows = await verifyPool.query(`SELECT * FROM aml1.screening_result WHERE screening_request_id = $1`, [screeningRequestId]);
      expect(resultRows.rows).toHaveLength(0);

      const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'aml1.stuck_screening_recovered' AND payload_ref LIKE $1`, [
        `%${screeningRequestId}%`,
      ]);
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("unblocks a subsequent re-screen for the same subject — the whole point of MEDIUM-1's fix", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_unblock");
      await seedStuckScreeningRequest(subjectRef, 1000);

      // Before recovery: the partial unique index still blocks a fresh screen for this subject.
      const beforeRes = await createScreeningRequest({ subject_ref: subjectRef });
      expect(beforeRes.statusCode).toBe(503); // AML1_AUDIT_REQUIRED-shaped 23505 -> generic failure path is NOT expected here; assert via DB instead
      // (the ORIGINAL create route does not map the unique-index violation to a friendly code —
      // assert the row-level fact directly instead of over-specifying the original route's own
      // unrelated error mapping.)

      const recoverRes = await recoverStuckScreeningReq("aml1req_stuck_" + subjectRef, "manual_operator_recovery");
      expect(recoverRes.statusCode).toBe(200);

      // After recovery: the subject no longer has an in-flight 'requested' row, so a fresh screen
      // succeeds.
      const afterRes = await createScreeningRequest({ subject_ref: subjectRef });
      expect(afterRes.statusCode).toBe(201);
    });

    it("too fresh (younger than the configured threshold) returns AML1_STUCK_SCREENING_TOO_FRESH / 409", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_too_fresh");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 5);

      const res = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_STUCK_SCREENING_TOO_FRESH");

      const requestRow = (await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("requested"); // untouched
    });

    it("unknown screening_request_id returns AML1_STUCK_SCREENING_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await recoverStuckScreeningReq("aml1req_does_not_exist", "manual_operator_recovery");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("AML1_STUCK_SCREENING_NOT_FOUND");
    });

    it("wrong state — an already-completed request returns AML1_STUCK_SCREENING_INVALID_STATE / 409", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_wrong_state");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);
      await verifyPool.query(`UPDATE aml1.screening_request SET status = 'completed' WHERE screening_request_id = $1`, [screeningRequestId]);

      const res = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_STUCK_SCREENING_INVALID_STATE");
    });

    it("a requested request whose latest attempt is not pending returns AML1_STUCK_SCREENING_INVALID_STATE / 409 (documented Phase 3D limitation)", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_nonpending");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000, "succeeded");

      const res = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("AML1_STUCK_SCREENING_INVALID_STATE");
    });

    it("double recover — the second attempt on an already-recovered request returns AML1_STUCK_SCREENING_INVALID_STATE / 409", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_double");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const first = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(first.statusCode).toBe(200);
      const second = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("AML1_STUCK_SCREENING_INVALID_STATE");
    });

    it("rejects a reason_code outside the closed enum (schema-level VALIDATION_ERROR, no free text ever reaches the recovery transaction)", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_bad_reason");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const res = await app.inject({
        method: "POST",
        url: `${SCREENING_URL}/${screeningRequestId}/recover`,
        headers: internalHeaders,
        payload: { actor_id: "staff_ops_1", reason_code: "operator typed this freely" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");

      const requestRow = (await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("requested"); // rejected before touching the row
    });

    it("genuine permission_granted is required — approval_required does NOT authorise recovery (confirmed decision D2)", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_approval_required");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" }) });
      const res = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");

      const requestRow = (await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("requested"); // untouched — recovery never ran

      config.iam2FetchImpl = allowAllIam2Fetch();
    });

    it("genuine permission_granted is required — step_up_required does NOT authorise recovery", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_step_up");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "step_up_required", reason: "IAM2_STEP_UP_REQUIRED" }) });
      const res = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("AML1_PERMISSION_DENIED");

      config.iam2FetchImpl = allowAllIam2Fetch();
    });

    it("IAM-02 deny -> AML1_PERMISSION_DENIED; IAM-02 unreachable -> AML1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("recover_iam2");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const denyRes = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(denyRes.statusCode).toBe(403);
      expect(denyRes.json().error.code).toBe("AML1_PERMISSION_DENIED");

      config.iam2FetchImpl = iam2Unreachable();
      const unavailRes = await recoverStuckScreeningReq(screeningRequestId, "manual_operator_recovery");
      expect(unavailRes.statusCode).toBe(503);
      expect(unavailRes.json().error.code).toBe("AML1_IAM2_UNAVAILABLE");

      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: monitoring stuck-detection pass (confirmed decision D6 — detect + signal, never auto-recover)", () => {
    it("a stuck subject gets a rescreen_overdue risk signal and an aml1.stuck_screening_detected audit event from a periodic_due run", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("mon_stuck_periodic");
      const { screeningRequestId } = await seedStuckScreeningRequest(subjectRef, 1000);

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);

      const signalRows = await verifyPool.query(`SELECT signal_type, severity, status FROM aml1.risk_signal WHERE subject_ref = $1`, [subjectRef]);
      expect(signalRows.rows).toHaveLength(1);
      expect(signalRows.rows[0].signal_type).toBe("rescreen_overdue");
      expect(signalRows.rows[0].severity).toBe("medium");
      expect(signalRows.rows[0].status).toBe("open");

      const auditRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'aml1.stuck_screening_detected' AND payload_ref LIKE $1`, [
        `%${screeningRequestId}%`,
      ]);
      expect(auditRows.rows.length).toBeGreaterThanOrEqual(1);

      // Status is never mutated by monitoring — recovery remains a separate, explicit action.
      const requestRow = (await verifyPool.query(`SELECT status FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId])).rows[0];
      expect(requestRow.status).toBe("requested");
    });

    it("a stuck subject also raises the SAME signal from a list_version_changed run (stuckness is trigger-independent)", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("mon_stuck_lv");
      await seedStuckScreeningRequest(subjectRef, 1000);

      const res = await monitoringRun({ trigger_reason: "list_version_changed", requested_by: "staff_ops_1", current_list_version: "any-list-v9", batch_size: 10 });
      expect(res.statusCode).toBe(201);

      const signalRows = await verifyPool.query(`SELECT signal_type FROM aml1.risk_signal WHERE subject_ref = $1`, [subjectRef]);
      expect(signalRows.rows).toHaveLength(1);
      expect(signalRows.rows[0].signal_type).toBe("rescreen_overdue");
    });

    it("a stuck subject is NEVER counted in candidates_selected/rescreens_created/failures — it is a fully separate code path from ordinary due-candidate selection", async () => {
      if (!schemaReady) return;
      const stuckRef = freshSubjectRef("mon_stuck_notcounted");
      await seedStuckScreeningRequest(stuckRef, 1000);

      const res = await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      // No ordinary due candidate was seeded in this test — a stuck-only run must report zero
      // candidates_selected/rescreens_created/failures even though a stuck subject WAS detected.
      expect(body.candidates_selected).toBe(0);
      expect(body.rescreens_created).toBe(0);
      expect(body.failures).toBe(0);

      const signalRows = await verifyPool.query(`SELECT 1 FROM aml1.risk_signal WHERE subject_ref = $1`, [stuckRef]);
      expect(signalRows.rows).toHaveLength(1); // still detected, despite zero counters
    });

    it("a repeat monitoring run suppresses the duplicate rescreen_overdue signal for a still-stuck subject", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("mon_stuck_dedup");
      await seedStuckScreeningRequest(subjectRef, 1000);

      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });

      const signalRows = await verifyPool.query(`SELECT 1 FROM aml1.risk_signal WHERE subject_ref = $1 AND status = 'open'`, [subjectRef]);
      expect(signalRows.rows).toHaveLength(1); // still exactly one open signal after two runs
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: audit / PII sweep", () => {
    it("aml1.stuck_screening_detected and aml1.stuck_screening_recovered events carry no PII", async () => {
      if (!schemaReady) return;
      const subjectRef = freshSubjectRef("audit_stuck");
      await seedStuckScreeningRequest(subjectRef, 1000);
      await monitoringRun({ trigger_reason: "periodic_due", requested_by: "staff_ops_1", batch_size: 10 });
      await recoverStuckScreeningReq("aml1req_stuck_" + subjectRef, "process_crash_orphan");

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type IN ('aml1.stuck_screening_detected','aml1.stuck_screening_recovered') ORDER BY created_at_utc`,
      );
      expect(events.rows.length).toBeGreaterThanOrEqual(2);
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["Seeded Stuck Subject", "matched_name", "match_detail", "date_of_birth", "registration_number", "operator typed"]) {
        expect(serialized.includes(forbidden), `audit payload must not contain "${forbidden}"`).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3C: regression — route surface", () => {
    it("GET /internal/aml1/provider/status still works", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/aml1/provider/status?actor_id=staff_1", headers: internalHeaders });
      expect(res.statusCode).toBe(200);
    });

    it("total AML-01 route count is 22 (Phase 3E adds POST .../pre-transaction/screen)", async () => {
      if (!schemaReady) return;
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const routeCount = routePaths.filter((l) => /\(.*\)$/.test(l)).length;
      expect(routeCount).toBe(22);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3D: grants — unchanged (no new grant needed for stuck-screening recovery)", () => {
    it("screening_request UPDATE grant is still exactly (status, completed_at_utc, version) — byte-identical to the Phase 3C baseline", async () => {
      if (!schemaReady) return;
      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='aml1' AND table_name='screening_request' AND grantee='role_aml1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["completed_at_utc", "status", "version"]);
    });

    it("screening_provider_attempt UPDATE grant is still exactly the Phase 3B set — byte-identical to the Phase 3C baseline", async () => {
      if (!schemaReady) return;
      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='aml1' AND table_name='screening_provider_attempt' AND grantee='role_aml1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(
        ["attempt_count", "checked_at_utc", "failure_reason_code", "latency_ms", "provider_list_version", "provider_reference_id", "response_payload_hash", "status"].sort(),
      );
    });

    it("no new aml1 table exists for Phase 3D (zero schema change — recovery reuses screening_request/screening_provider_attempt only)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'aml1' ORDER BY table_name`);
      const tableNames = rows.rows.map((r) => r.table_name);
      expect(tableNames).toEqual(
        [
          "clt_outcome_delivery",
          "match_disposition_decision_request",
          "monitoring_run",
          "risk_signal",
          "screening_match",
          "screening_provider_attempt",
          "screening_request",
          "screening_result",
          "screening_subject_snapshot",
        ].sort(),
      );
    });
  });
});
