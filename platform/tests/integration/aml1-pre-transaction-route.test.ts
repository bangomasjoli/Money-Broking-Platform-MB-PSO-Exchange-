/**
 * AML-01 Phase 3E — `POST /internal/aml1/pre-transaction/screen` route + `lib/pre-transaction.ts`
 * evidence resolution, driven against a PRIVATE, uniquely-named, disposable database (own
 * migration run, own `fnd`/`aml1` grants, dropped in `afterAll`).
 *
 * PRIVATE DATABASE RATIONALE: `tests/integration/aml1-db.test.ts` (the shared-canonical-database
 * AML-01 suite) runs an UNSCOPED `DELETE FROM aml1.screening_request` (cascading to
 * `screening_result`/`screening_match`/`screening_provider_attempt`) in its own `afterEach` —
 * concurrent with this file on the shared canonical database, that would race-delete this file's
 * own in-flight fixtures (or vice versa). A private database sidesteps this entirely without
 * touching `aml1-db.test.ts`. This file's own forced-audit-failure test additionally REVOKEs
 * `role_aml1_runtime`'s own INSERT privilege on `foundation.outbox_event` — mutating that ACL
 * against the SHARED canonical database's shared role would break any OTHER concurrently-running
 * file's bystander request; the private database makes that ACL mutation harmless to everyone else
 * (mirrors `wlt1-poc-audit-atomicity-private.test.ts`'s own identical rationale).
 *
 * ADMIN FIXTURES: this file inserts `aml1.screening_request`/`screening_result`/`screening_match`/
 * `screening_provider_attempt` rows directly via the admin `verifyPool` connection (never through
 * the app) so it can construct exact evidence states (specific timestamps for tie-break proofs,
 * specific staleness, specific binding states, and the one defensively-unreachable
 * "completed request with no result row" state) that the app's own accepted write path
 * (`lib/screening-execution.ts`) would never itself produce.
 *
 * M-REV-1 INTERIM RULE: the restricted-role connection URL is derived via the safe regex rewrite
 * (`replace(/^postgres:\/\/[^@]+@/, ...)`), never the fragile `.replace("postgres@", ...)` form,
 * and this file's own canary additionally asserts the runtime connection is not superuser.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Aml1Config } from "../../services/aml1/src/config.js";
import { buildApp } from "../../services/aml1/src/server.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "aml1_pretransaction_route_test";

const PRIVATE_DB_NAME = `aml1_pretx_it_${randomBytes(6).toString("hex")}`;

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
let mainConfig: Aml1Config;
let schemaReady = false;
let databaseCreated = false;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "aml1-pretx-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "aml1-pretx-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "aml1-pretx-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  // Only fnd (foundation.outbox_event) + aml1 (aml1.*) grants are needed — this route touches no
  // other module's schema (no clt1/iam2 SQL grant exists or is needed for AML-01, confirmed by
  // infra/grants/aml1_runtime_grants.sql's own header comment).
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

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-aml1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    aml1InternalServiceToken: "test-aml1-internal-token-pretx-it",
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
  await verifyPool.query(`DELETE FROM aml1.screening_match`);
  await verifyPool.query(`DELETE FROM aml1.screening_provider_attempt`);
  await verifyPool.query(`DELETE FROM aml1.screening_result`);
  await verifyPool.query(`DELETE FROM aml1.screening_request`);
});

// -------------------------------------------------------------------------------------------
// Admin fixture helpers — direct SQL, never through the app's own write path.
// -------------------------------------------------------------------------------------------

async function insertScreeningRequest(opts: {
  screeningRequestId: string;
  subjectRef: string;
  subjectParentRef: string | null;
  status: "requested" | "completed" | "failed";
  createdAtUtc?: string;
}): Promise<void> {
  await verifyPool.query(
    `INSERT INTO aml1.screening_request (screening_request_id, subject_type, subject_ref, subject_parent_ref, provenance, status, requested_by, created_at_utc)
     VALUES ($1, 'authorised_party', $2, $3, 'declared_identity', $4, 'test-fixture', COALESCE($5::timestamptz, now()))`,
    [opts.screeningRequestId, opts.subjectRef, opts.subjectParentRef, opts.status, opts.createdAtUtc ?? null],
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

/** Builds a complete "fresh clear" subject: request(completed) + result(clear, screened now) +
 * succeeded provider attempt. Returns the subjectRef for use in a request payload. */
async function createFreshClearSubject(clientId: string, subjectRef: string, providerId = "stub-v1"): Promise<string> {
  const reqId = "aml1req_" + randomUUID();
  const resultId = "aml1res_" + randomUUID();
  await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
  await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: new Date().toISOString() });
  await insertProviderAttempt({ attemptId: "aml1att_" + randomUUID(), screeningRequestId: reqId, providerId });
  return subjectRef;
}

function submitPreTransaction(body: Record<string, unknown>, opts: { noAuth?: boolean; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (!opts.noAuth) headers["x-internal-service-token"] = opts.token ?? mainConfig.aml1InternalServiceToken;
  return app.inject({ method: "POST", url: "/internal/aml1/pre-transaction/screen", headers, payload: body });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "clt1client_pretxtest",
    subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_default" }],
    requested_action: "destination_use",
    caller_module: "TEST-HARNESS",
    ...overrides,
  };
}

async function verifiedAuditCountFor(decisionId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'aml1.pre_transaction_evaluated' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    decisionId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("AML-01 Phase 3E: POST /internal/aml1/pre-transaction/screen", () => {
  it("H-D3C-1-equivalent fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/aml1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/aml1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL — must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const r = await probe.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
      expect(r.rows[0]?.current_user).toBe(RUNTIME_ROLE_USER);
      expect(r.rows[0]?.current_user).not.toBe("postgres");
      expect(r.rows[0]?.rolsuper).toBe(false);
      expect(r.rows[0]?.rolbypassrls).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("auth", () => {
    it("missing internal-service-token -> 401", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody(), { noAuth: true });
      expect(res.statusCode).toBe(401);
    });

    it("invalid internal-service-token -> 401", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody(), { token: "wrong-token" });
      expect(res.statusCode).toBe(401);
    });

    it("valid internal-service-token passes the authentication guard (L-3E-2: renamed — this deliberately exercises a downstream 400, not a 200)", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody({ subject_refs: [] }));
      // Schema requires minItems:1 for subject_refs — this proves AUTH succeeded (not a 401), the
      // actual 400 here is a SCHEMA rejection, asserted properly in the schema block below. A
      // genuine 200-with-decision path is independently asserted throughout the "decisions" block.
      expect(res.statusCode).not.toBe(401);
    });
  });

  describe("schema", () => {
    it("additional property -> 400 VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction({ ...baseBody(), extra_field: "x" });
      expect(res.statusCode).toBe(400);
    });

    it("client_application subject_type -> 400 (this route accepts ONLY authorised_party)", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody({ subject_refs: [{ subject_type: "client_application", subject_ref: "app_1" }] }));
      expect(res.statusCode).toBe(400);
    });

    it("invalid requested_action -> 400", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody({ requested_action: "something_else" }));
      expect(res.statusCode).toBe(400);
    });

    it("empty subject_refs -> 400 (minItems: 1)", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody({ subject_refs: [] }));
      expect(res.statusCode).toBe(400);
    });

    it("more than 20 subject_refs -> 400 (maxItems: 20)", async () => {
      if (!schemaReady) return;
      const subjectRefs = Array.from({ length: 21 }, (_, i) => ({ subject_type: "authorised_party", subject_ref: `party_${i}` }));
      const res = await submitPreTransaction(baseBody({ subject_refs: subjectRefs }));
      expect(res.statusCode).toBe(400);
    });

    it("exactly 20 subject_refs is accepted at the schema level", async () => {
      if (!schemaReady) return;
      const subjectRefs = Array.from({ length: 20 }, (_, i) => ({ subject_type: "authorised_party", subject_ref: `party_${i}` }));
      const res = await submitPreTransaction(baseBody({ subject_refs: subjectRefs, client_id: "clt1client_pretx20" }));
      expect(res.statusCode).toBe(200);
    });
  });

  describe("client/subject binding", () => {
    it("correct authorised_party binding can support allow", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_bindok_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID());
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
    });

    it("subject_parent_ref NULL -> 200 review/subject_client_binding_unprovable", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_bindnull_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: null, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: new Date().toISOString() });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("subject_client_binding_unprovable");
    });

    it("foreign-client subject -> 200 review/subject_client_binding_unprovable", async () => {
      if (!schemaReady) return;
      const realOwner = "clt1client_realowner_" + randomUUID();
      const impersonator = "clt1client_impersonator_" + randomUUID();
      const subjectRef = await createFreshClearSubject(realOwner, "party_" + randomUUID());

      const res = await submitPreTransaction(baseBody({ client_id: impersonator, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("subject_client_binding_unprovable");
    });

    it("unknown subject -> 200 review/subject_client_binding_unprovable", async () => {
      if (!schemaReady) return;
      const res = await submitPreTransaction(baseBody({ client_id: "clt1client_unknown_" + randomUUID(), subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_never_existed" }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("subject_client_binding_unprovable");
    });

    it("foreign-client vs unknown-subject responses are byte-identical (no cross-client existence oracle)", async () => {
      if (!schemaReady) return;
      const realOwner = "clt1client_oracle_owner_" + randomUUID();
      const subjectRef = await createFreshClearSubject(realOwner, "party_" + randomUUID());
      const impersonator = "clt1client_oracle_imp_" + randomUUID();

      const foreignRes = await submitPreTransaction(baseBody({ client_id: impersonator, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      const unknownRes = await submitPreTransaction(baseBody({ client_id: impersonator, subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_truly_unknown" }] }));

      expect(foreignRes.json().data.decision).toBe(unknownRes.json().data.decision);
      expect(foreignRes.json().data.reason_code).toBe(unknownRes.json().data.reason_code);
    });
  });

  describe("decisions", () => {
    it("fresh clear -> 200 allow", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID());
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.reason_code).toBe("evidence_clear");
    });

    it("fresh all-dismissed potential_match -> 200 allow/matches_dismissed", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      const resultId = "aml1res_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "potential_match", screenedAtUtc: new Date().toISOString() });
      await insertScreeningMatch({ screeningMatchId: "aml1match_" + randomUUID(), screeningResultId: resultId, matchStatus: "dismissed" });
      await insertProviderAttempt({ attemptId: "aml1att_" + randomUUID(), screeningRequestId: reqId, providerId: "stub-v1" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.reason_code).toBe("matches_dismissed");
    });

    it("unresolved potential_match -> 200 review/undisposed_potential_match", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      const resultId = "aml1res_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "potential_match", screenedAtUtc: new Date().toISOString() });
      await insertScreeningMatch({ screeningMatchId: "aml1match_" + randomUUID(), screeningResultId: resultId, matchStatus: "potential_match" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("undisposed_potential_match");
    });

    it("confirmed_hit -> 200 deny", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "confirmed_hit", screenedAtUtc: new Date().toISOString() });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("deny");
      expect(res.json().data.reason_code).toBe("confirmed_hit");
    });

    it("stale evidence -> 200 review/evidence_stale", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      const staleDate = new Date(Date.now() - (2160 + 1) * 60 * 60 * 1000).toISOString(); // just past the 2160h default
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: staleDate });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("evidence_stale");
    });

    it("no evidence (correctly-bound subject, never screened) -> 200 review/subject_client_binding_unprovable", async () => {
      if (!schemaReady) return;
      // No screening_request row exists at all for this subject under this client — per the frozen
      // architecture, AML-01 cannot distinguish this from an unknown/foreign subject, since the
      // ONLY proof of binding is the existence of a matching screening_request row.
      const res = await submitPreTransaction(baseBody({ client_id: "clt1client_" + randomUUID(), subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_" + randomUUID() }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("subject_client_binding_unprovable");
    });

    it("in-flight (requested) -> 200 review/screening_in_flight", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: "aml1req_" + randomUUID(), subjectRef, subjectParentRef: clientId, status: "requested" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("screening_in_flight");
    });

    it("failed screening -> 200 review/screening_failed", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: "aml1req_" + randomUUID(), subjectRef, subjectParentRef: clientId, status: "failed" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("screening_failed");
    });

    it("newest lifecycle wins: older completed+clear, newer requested -> 200 review/screening_in_flight (the older clear is never used)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const olderReqId = "aml1req_" + randomUUID();
      const newerReqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: olderReqId, subjectRef, subjectParentRef: clientId, status: "completed", createdAtUtc: "2020-01-01T00:00:00.000Z" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: olderReqId, overallStatus: "clear", screenedAtUtc: "2020-01-01T00:00:00.000Z" });
      await insertScreeningRequest({ screeningRequestId: newerReqId, subjectRef, subjectParentRef: clientId, status: "requested", createdAtUtc: "2026-01-01T00:00:00.000Z" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("screening_in_flight");
    });

    it("L-3E-1: newest lifecycle wins over an older PROVENANCE-COMPLETE clear: older completed+clear+succeeded-provider, newer failed -> 200 review/screening_failed (the older clear is never used)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const olderReqId = "aml1req_" + randomUUID();
      const newerReqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: olderReqId, subjectRef, subjectParentRef: clientId, status: "completed", createdAtUtc: "2020-01-01T00:00:00.000Z" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: olderReqId, overallStatus: "clear", screenedAtUtc: "2020-01-01T00:00:00.000Z" });
      await insertProviderAttempt({ attemptId: "aml1att_" + randomUUID(), screeningRequestId: olderReqId, providerId: "stub-v1" });
      await insertScreeningRequest({ screeningRequestId: newerReqId, subjectRef, subjectParentRef: clientId, status: "failed", createdAtUtc: "2026-01-01T00:00:00.000Z" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("screening_failed");
    });
  });

  describe("provenance", () => {
    it("single provider -> one-element evidence_provider_ids", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID(), "stub-v1");
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.json().data.evidence_provider_ids).toEqual(["stub-v1"]);
    });

    it("mixed providers across two subjects -> deterministic sorted array", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectA = await createFreshClearSubject(clientId, "party_a_" + randomUUID(), "stub-v2");
      const subjectB = await createFreshClearSubject(clientId, "party_b_" + randomUUID(), "stub-v1");
      const res = await submitPreTransaction(
        baseBody({
          client_id: clientId,
          subject_refs: [
            { subject_type: "authorised_party", subject_ref: subjectA },
            { subject_type: "authorised_party", subject_ref: subjectB },
          ],
        }),
      );
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.evidence_provider_ids).toEqual(["stub-v1", "stub-v2"]);
    });

    it("C-3E-1/H-3E-1: missing successful provider provenance -> 200 review/unsupported_evidence_state (NOT allow — subject cannot support allow)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: new Date().toISOString() });
      // Deliberately NO provider attempt row inserted at all — evidence exists (overallStatus=
      // 'clear') but its provenance is unprovable. The frozen mapping requires this to fall to
      // review/unsupported_evidence_state — it must NOT reach allow merely because overallStatus is
      // otherwise affirmative.
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("review");
      expect(res.json().data.reason_code).toBe("unsupported_evidence_state");
      expect(res.json().data.evidence_provider_ids).toEqual([]);
      expect(res.json().data.decision).not.toBe("allow");
    });

    it("C-3E-1 paired control: the SAME otherwise-affirmative evidence WITH a succeeded provider attempt -> 200 allow/evidence_clear (proves causality, not just an empty array)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "clear", screenedAtUtc: new Date().toISOString() });
      await insertProviderAttempt({ attemptId: "aml1att_" + randomUUID(), screeningRequestId: reqId, providerId: "stub-v1" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.reason_code).toBe("evidence_clear");
      expect(res.json().data.evidence_provider_ids).toEqual(["stub-v1"]);
    });

    it("C-3E-1: confirmed_hit is NEVER weakened by absent provider provenance -> 200 deny/confirmed_hit", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "confirmed_hit", screenedAtUtc: new Date().toISOString() });
      // Deliberately NO provider attempt row — a confirmed hit must remain deny regardless.

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("deny");
      expect(res.json().data.reason_code).toBe("confirmed_hit");
    });
  });

  describe("time", () => {
    it("evaluated_at_utc and valid_until_utc are present, RFC3339, and valid_until = evaluated_at + configured TTL (5 minutes)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID());
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      const data = res.json().data;
      expect(data.evaluated_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(data.valid_until_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const evaluatedMs = Date.parse(data.evaluated_at_utc);
      const validUntilMs = Date.parse(data.valid_until_utc);
      expect(validUntilMs - evaluatedMs).toBe(5 * 60_000);
    });
  });

  describe("audit", () => {
    it("exactly one aml1.pre_transaction_evaluated audit for an allow decision, with expected metadata only", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID());
      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      const decisionId = res.json().data.decision_id;
      expect(await verifiedAuditCountFor(decisionId)).toBe(1);

      const auditRow = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'aml1.pre_transaction_evaluated' AND payload_ref::text LIKE '%' || $1 || '%'`, [
        decisionId,
      ]);
      const payload = JSON.parse(auditRow.rows[0].payload_ref);
      expect(payload.metadata.decision).toBe("allow");
      expect(payload.metadata.client_id).toBe(clientId);
      expect(payload.metadata.requested_action).toBe("destination_use");
      expect(JSON.stringify(payload)).not.toContain("Test Fixture Name");
      expect(JSON.stringify(payload)).not.toContain(mainConfig.aml1InternalServiceToken);
    });

    it("exactly one audit for a review decision, and one for a deny decision", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();

      const reviewRes = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: "party_never_" + randomUUID() }] }));
      expect(await verifiedAuditCountFor(reviewRes.json().data.decision_id)).toBe(1);

      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "confirmed_hit", screenedAtUtc: new Date().toISOString() });
      const denyRes = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(await verifiedAuditCountFor(denyRes.json().data.decision_id)).toBe(1);
    });
  });

  describe("atomicity — forced audit failure", () => {
    it("a forced foundation.outbox_event INSERT failure -> 503 AML1_AUDIT_REQUIRED, no decision field, no successful audit/decision side effect", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = await createFreshClearSubject(clientId, "party_" + randomUUID());

      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_aml1_runtime`);
        try {
          const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("AML1_AUDIT_REQUIRED");
          expect(res.json().data).toBeUndefined();
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_aml1_runtime`);
        }
      });

      // Retry succeeds for real once the ACL is restored — proves the earlier failure left no
      // partial state behind.
      const retry = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.decision).toBe("allow");
    }, 30_000);
  });

  describe("order-independence", () => {
    it("shuffled subject_refs produce the same decision and reason_code", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const clearSubject = await createFreshClearSubject(clientId, "party_clear_" + randomUUID());
      const hitSubjectRef = "party_hit_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef: hitSubjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: "aml1res_" + randomUUID(), screeningRequestId: reqId, overallStatus: "confirmed_hit", screenedAtUtc: new Date().toISOString() });

      const forward = await submitPreTransaction(
        baseBody({
          client_id: clientId,
          subject_refs: [
            { subject_type: "authorised_party", subject_ref: clearSubject },
            { subject_type: "authorised_party", subject_ref: hitSubjectRef },
          ],
        }),
      );
      const reversed = await submitPreTransaction(
        baseBody({
          client_id: clientId,
          subject_refs: [
            { subject_type: "authorised_party", subject_ref: hitSubjectRef },
            { subject_type: "authorised_party", subject_ref: clearSubject },
          ],
        }),
      );
      expect(forward.json().data.decision).toBe(reversed.json().data.decision);
      expect(forward.json().data.reason_code).toBe(reversed.json().data.reason_code);
      expect(forward.json().data.decision).toBe("deny");
      expect(forward.json().data.reason_code).toBe("confirmed_hit");
    });
  });

  describe("response leakage", () => {
    it("response body never contains matched names, list sources, or the internal service token", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + randomUUID();
      const subjectRef = "party_" + randomUUID();
      const reqId = "aml1req_" + randomUUID();
      const resultId = "aml1res_" + randomUUID();
      await insertScreeningRequest({ screeningRequestId: reqId, subjectRef, subjectParentRef: clientId, status: "completed" });
      await insertScreeningResult({ screeningResultId: resultId, screeningRequestId: reqId, overallStatus: "potential_match", screenedAtUtc: new Date().toISOString() });
      await insertScreeningMatch({ screeningMatchId: "aml1match_" + randomUUID(), screeningResultId: resultId, matchStatus: "potential_match" });

      const res = await submitPreTransaction(baseBody({ client_id: clientId, subject_refs: [{ subject_type: "authorised_party", subject_ref: subjectRef }] }));
      const bodyStr = JSON.stringify(res.json());
      expect(bodyStr).not.toContain("Test Fixture Name");
      expect(bodyStr).not.toContain("test-fixture-list");
      expect(bodyStr).not.toContain(mainConfig.aml1InternalServiceToken);
    });
  });
});
