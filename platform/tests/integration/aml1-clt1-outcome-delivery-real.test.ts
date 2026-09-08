/**
 * AML-01 Phase 2A — REAL CLT-01 integration test. Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * STABILITY FIX (micro-stabilization pass): this file used to run against the SAME shared
 * database every other integration test file uses. Under the suite's default file-level
 * parallelism, `tests/integration/clt1-db.test.ts`'s own `afterEach` (`DELETE FROM
 * clt1.client_application` etc., unscoped — correct for ITS OWN single-writer assumption, but not
 * safe against a second writer) could fire in a different worker mid-flight through this file's
 * multi-request CLT-01 lifecycle walk (create -> consent -> submit -> start-review) and wipe an
 * in-progress row. Fixed WITHOUT touching any CLT-01 code (production or test): this file now
 * provisions its OWN throwaway, uniquely-named Postgres database in `beforeAll` — running the full
 * migration chain (001->034, via node-pg-migrate's programmatic API, the same one `npm run
 * migrate:up` uses) and all 7 grant files against it — and drops it in `afterAll`. No other test
 * file ever sees this database, so no cross-file collision is possible, by construction, under
 * default full-suite parallelism.
 *
 * This file builds and LISTENS a real CLT-01 app (`services/clt1/src/server.ts`'s `buildApp`,
 * `app.listen({port: 0})` on an ephemeral port) against this private database, and calls AML-01's
 * own `lib/clt1-client.ts` (`deliverApplicationOutcome`) against it over REAL HTTP — the same
 * client code the Phase 2A delivery routes use.
 *
 * Walks CLT-01's REAL lifecycle (create draft -> add consent -> submit -> start-review) using
 * CLT-01's own stubbed CFG-01/IAM-02 fetch DI seams (never AML-01's concern) to reach a genuine
 * `under_review` application, then proves the two claims the approved Phase 2 planning report
 * flagged as the highest operational risk (§17 risk 1) and the required "do not rely only on the
 * stub positive path" instruction:
 *   1. CLT-01's real `under_review` precondition is enforced — delivery BEFORE start-review is
 *      genuinely rejected by CLT-01 itself (CLT1_APPLICATION_INVALID_STATE), not assumed.
 *   2. CLT-01's real rollup column converges correctly after delivery (and after an at-least-once
 *      duplicate delivery, per the approved D10 design decision).
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Clt1Config } from "../../services/clt1/src/config.js";
import { buildApp as buildClt1App } from "../../services/clt1/src/server.js";
import { deliverApplicationOutcome, type Clt1ClientConfig } from "../../services/aml1/src/lib/clt1-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const GRANT_FILES = [
  "fnd_runtime_grants.sql",
  "iam_runtime_grants.sql",
  "iam2_runtime_grants.sql",
  "sec1_runtime_grants.sql",
  "cfg1_runtime_grants.sql",
  "clt1_runtime_grants.sql",
  "aml1_runtime_grants.sql",
];

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `aml1_real_clt1_it_${randomBytes(6).toString("hex")}`;
const RUNTIME_ROLE_USER = "clt1_app_test_aml1_real";

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let maintenancePool: Pool;
let privateDbUrl: string;
let schemaReady = false;

const clt1Config: Clt1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused",
  internalServiceToken: "test-clt1-internal-token-aml1-real-it",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-aml1-real-it",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-cfg1-token-unused",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-token-unused",
};

// ---------------------------------------------------------------------------------------------
// Local, own-copy fake CFG-01/IAM-02 fetch stubs for CLT-01's OWN dependency clients — never
// AML-01's concern, needed only to walk CLT-01's real lifecycle to `under_review`. Deliberately
// NOT imported from tests/integration/clt1-db.test.ts (test files are not a shared library).
// ---------------------------------------------------------------------------------------------
function allowAllCfg1Fetch(): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).endsWith("/internal/cfg1/features/evaluate")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_real_it" } }) } as Response;
    }
    throw new Error(`Unexpected CFG-01 URL in AML-01 real-CLT-01 test fixture: ${String(url)}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in AML-01 real-CLT-01 test fixture: ${urlStr}`);
  }) as typeof fetch;
}

let clt1App: FastifyInstance;
let verifyPool: Pool;
let clt1ClientConfig: Clt1ClientConfig;

const internalHeaders = { "x-internal-service-token": clt1Config.clt1InternalServiceToken };

async function createUnderReviewApplication(): Promise<string> {
  const createRes = await clt1App.inject({
    method: "POST",
    url: "/internal/clt1/applications",
    headers: internalHeaders,
    payload: {
      applicant_type: "corporate",
      legal_name: "AML-01 Real CLT-01 Delivery Test Applicant",
      client_class_claimed: "institutional",
      created_by: "aml1_real_it_user",
    },
  });
  expect(createRes.statusCode, JSON.stringify(createRes.json())).toBe(201);
  const applicationId = createRes.json().data.application_id as string;

  const consentRes = await clt1App.inject({
    method: "POST",
    url: `/internal/clt1/applications/${applicationId}/consents`,
    headers: internalHeaders,
    payload: { consent_type: "terms_of_service", consent_version: "v1", consent_given: true, given_by: "aml1_real_it_user" },
  });
  expect(consentRes.statusCode, JSON.stringify(consentRes.json())).toBe(201);

  const submitRes = await clt1App.inject({ method: "POST", url: `/internal/clt1/applications/${applicationId}/submit`, headers: internalHeaders });
  expect(submitRes.statusCode, JSON.stringify(submitRes.json())).toBe(200);

  const startReviewRes = await clt1App.inject({
    method: "POST",
    url: `/internal/clt1/applications/${applicationId}/start-review`,
    headers: internalHeaders,
    payload: { reviewer_id: "aml1_real_it_reviewer" },
  });
  expect(startReviewRes.statusCode, JSON.stringify(startReviewRes.json())).toBe(200);
  expect(startReviewRes.json().data.status).toBe("under_review");

  return applicationId;
}

describe("AML-01 Phase 2A: real CLT-01 outcome delivery (no stub-only positive path)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    // Full migration chain — clt1's own migrations (020-032) depend on the earlier
    // foundation/iam/iam2/sec1/cfg1 migrations having already run, same as the real deployment
    // order. Migration 008 (sec1 core) reads these three ingest-token vars directly off
    // `process.env` (node-pg-migrate's runner has no separate env-injection option) — this is a
    // PRIVATE, throwaway database no other test file ever touches, so their literal value is
    // irrelevant beyond satisfying the migration's own fail-closed presence check. Only set if
    // absent, worker-scoped (vitest's default file isolation), never unset afterwards.
    process.env.SEC1_INGEST_TOKEN_FND01 ??= "aml1-real-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "aml1-real-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "aml1-real-it-private-db-iam02-token";

    await runner({
      databaseUrl: privateDbUrl,
      dir: MIGRATIONS_DIR,
      direction: "up",
      checkOrder: false,
      migrationsTable: "pgmigrations",
      log: () => {
        /* silence node-pg-migrate's own verbose per-statement logging */
      },
    });

    const privateDbPool = new Pool({ connectionString: privateDbUrl });
    try {
      for (const grantFile of GRANT_FILES) {
        const sql = await readFile(join(REPO_ROOT, "infra", "grants", grantFile), "utf8");
        await privateDbPool.query(sql);
      }
    } finally {
      await privateDbPool.end();
    }

    verifyPool = new Pool({ connectionString: privateDbUrl });
    schemaReady = true;

    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_clt1_runtime TO ${RUNTIME_ROLE_USER};`);

    // Swap the connecting user to the least-privilege runtime role via the URL API directly
    // (rather than the `postgres@`-substring convention every OTHER integration test file uses —
    // safe regardless of what user TEST_DATABASE_URL itself happens to authenticate as).
    const runtimeUrl = new URL(privateDbUrl);
    runtimeUrl.username = RUNTIME_ROLE_USER;
    runtimeUrl.password = "";
    initPool(runtimeUrl.toString());

    clt1Config.cfg1FetchImpl = allowAllCfg1Fetch();
    clt1Config.iam2FetchImpl = allowAllIam2Fetch();
    clt1App = await buildClt1App(clt1Config);
    await clt1App.listen({ port: 0, host: "127.0.0.1" });
    const address = clt1App.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    clt1ClientConfig = { baseUrl: `http://127.0.0.1:${port}`, internalServiceToken: clt1Config.clt1InternalServiceToken };
  }, 60_000);

  afterAll(async () => {
    if (clt1App) await clt1App.close();
    await closePool();
    await verifyPool?.end();
    if (maintenancePool) {
      if (schemaReady) {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME} WITH (FORCE)`).catch(async () => {
          // Older Postgres without WITH (FORCE) support — best-effort fallback.
          await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME}`).catch(() => undefined);
        });
      }
      await maintenancePool.end();
    }
  });

  it("REAL under_review precondition: delivery to a DRAFT application is genuinely rejected by CLT-01 (not assumed)", async () => {
    if (!schemaReady) return;
    const createRes = await clt1App.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: internalHeaders,
      payload: { applicant_type: "corporate", legal_name: "Draft Only Applicant", client_class_claimed: "institutional", created_by: "aml1_real_it_user" },
    });
    expect(createRes.statusCode).toBe(201);
    const applicationId = createRes.json().data.application_id as string;

    const result = await deliverApplicationOutcome(clt1ClientConfig, {
      applicationId,
      outcomeType: "aml_sanctions",
      outcomeStatus: "pass",
      sourceModule: "AML-01",
      createdBy: "aml1_real_it_user",
    });
    expect(result).toEqual({ succeeded: false, failureReasonCode: "CLT1_APPLICATION_INVALID_STATE" });
  });

  it("REAL under_review precondition: delivery to a SUBMITTED (not yet under_review) application is genuinely rejected", async () => {
    if (!schemaReady) return;
    const createRes = await clt1App.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: internalHeaders,
      payload: { applicant_type: "corporate", legal_name: "Submitted Only Applicant", client_class_claimed: "institutional", created_by: "aml1_real_it_user" },
    });
    const applicationId = createRes.json().data.application_id as string;
    await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/consents`,
      headers: internalHeaders,
      payload: { consent_type: "terms_of_service", consent_version: "v1", consent_given: true, given_by: "aml1_real_it_user" },
    });
    const submitRes = await clt1App.inject({ method: "POST", url: `/internal/clt1/applications/${applicationId}/submit`, headers: internalHeaders });
    expect(submitRes.json().data.status).toBe("submitted");

    const result = await deliverApplicationOutcome(clt1ClientConfig, {
      applicationId,
      outcomeType: "pep_adverse_media",
      outcomeStatus: "pass",
      sourceModule: "AML-01",
      createdBy: "aml1_real_it_user",
    });
    expect(result).toEqual({ succeeded: false, failureReasonCode: "CLT1_APPLICATION_INVALID_STATE" });
  });

  it("REAL delivery to an under_review application succeeds and the real rollup column converges to the delivered value", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();

    const result = await deliverApplicationOutcome(clt1ClientConfig, {
      applicationId,
      outcomeType: "aml_sanctions",
      outcomeStatus: "pass",
      sourceModule: "AML-01",
      createdBy: "aml1_real_it_user",
    });
    expect(result.succeeded).toBe(true);
    if (!result.succeeded) throw new Error("unreachable");
    expect(result.responseRef).toBeTruthy();

    const rows = await verifyPool.query(`SELECT aml_sanctions_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rows.rows[0].aml_sanctions_status).toBe("pass");

    const cddRows = await verifyPool.query(`SELECT count(*) FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'aml_sanctions'`, [applicationId]);
    expect(Number(cddRows.rows[0].count)).toBe(1);
  });

  it("REAL rollup convergence: an at-least-once DUPLICATE delivery (Phase 2 planning report D10) is safe — CLT-01 records a second cdd_outcome row but the rollup column stays converged", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();

    const first = await deliverApplicationOutcome(clt1ClientConfig, { applicationId, outcomeType: "aml_sanctions", outcomeStatus: "pending", sourceModule: "AML-01", createdBy: "aml1_real_it_user" });
    expect(first.succeeded).toBe(true);
    const rowsAfterFirst = await verifyPool.query(`SELECT aml_sanctions_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rowsAfterFirst.rows[0].aml_sanctions_status).toBe("pending");

    // Simulate AML-01's own retry re-delivering the SAME (now-later) effective status — the
    // duplicate-delivery-is-safe-but-noisy posture the approved plan documents.
    const second = await deliverApplicationOutcome(clt1ClientConfig, { applicationId, outcomeType: "aml_sanctions", outcomeStatus: "pass", sourceModule: "AML-01", createdBy: "aml1_real_it_user" });
    expect(second.succeeded).toBe(true);

    const rowsAfterSecond = await verifyPool.query(`SELECT aml_sanctions_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rowsAfterSecond.rows[0].aml_sanctions_status).toBe("pass");

    const cddRows = await verifyPool.query(`SELECT count(*) FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'aml_sanctions'`, [applicationId]);
    expect(Number(cddRows.rows[0].count)).toBe(2);
  });

  it("REAL hit delivery converges to 'hit' — the sharp CLT-01-side sanctions block", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();
    const result = await deliverApplicationOutcome(clt1ClientConfig, { applicationId, outcomeType: "aml_sanctions", outcomeStatus: "hit", sourceModule: "AML-01", createdBy: "aml1_real_it_user" });
    expect(result.succeeded).toBe(true);
    const rows = await verifyPool.query(`SELECT aml_sanctions_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rows.rows[0].aml_sanctions_status).toBe("hit");
  });
});
