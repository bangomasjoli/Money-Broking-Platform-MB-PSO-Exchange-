/**
 * KYC-01 Phase 2B — REAL CLT-01 integration test. Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Mirrors `tests/integration/aml1-clt1-outcome-delivery-real.test.ts`'s own shape exactly (the
 * established "never rely on a stub alone for the positive delivery path" precedent this codebase
 * follows for every cross-module outcome-delivery client). This file provisions its OWN throwaway,
 * uniquely-named Postgres database in `beforeAll` (full migration chain 001->048 + all 8 grant
 * files) so it can never collide with any other test file's own `afterEach` cleanup under default
 * full-suite parallelism, builds and LISTENS a real CLT-01 app on an ephemeral port, and calls
 * KYC-01's own `lib/clt1-client.ts` (`deliverKycOutcome`) against it over REAL HTTP — the exact
 * client code `routes/outcome-publication.ts`'s `/deliver` route uses.
 *
 * Proves the two claims the accepted Phase 2B plan named as required, not assumed:
 *   1. CLT-01's real `under_review` precondition is enforced — delivery before start-review is
 *      genuinely rejected (CLT1_APPLICATION_INVALID_STATE), not stubbed.
 *   2. CLT-01's real `cdd_outcome_status` rollup column converges to the delivered `kyc_kyb` value,
 *      including across a `pass`/`fail`/`remediation_required` value and an at-least-once duplicate
 *      delivery.
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
import { deliverKycOutcome, type Clt1ClientConfig } from "../../services/kyc1/src/lib/clt1-client.js";
import { fetchClt1KycRoster } from "../../services/kyc1/src/lib/roster-client.js";

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
  "kyc1_runtime_grants.sql",
];

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `kyc1_real_clt1_it_${randomBytes(6).toString("hex")}`;
const RUNTIME_ROLE_USER = "clt1_app_test_kyc1_real";

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
  internalServiceToken: "test-clt1-internal-token-kyc1-real-it",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-kyc1-real-it",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-cfg1-token-unused",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-token-unused",
};

// ---------------------------------------------------------------------------------------------
// Local, own-copy fake CFG-01/IAM-02 fetch stubs for CLT-01's OWN dependency clients — never
// KYC-01's concern, needed only to walk CLT-01's real lifecycle to `under_review`. Deliberately
// NOT imported from any other test file (test files are not a shared library).
// ---------------------------------------------------------------------------------------------
function allowAllCfg1Fetch(): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).endsWith("/internal/cfg1/features/evaluate")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_real_it" } }) } as Response;
    }
    throw new Error(`Unexpected CFG-01 URL in KYC-01 real-CLT-01 test fixture: ${String(url)}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in KYC-01 real-CLT-01 test fixture: ${urlStr}`);
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
      legal_name: "KYC-01 Real CLT-01 Delivery Test Applicant",
      client_class_claimed: "institutional",
      created_by: "kyc1_real_it_user",
    },
  });
  expect(createRes.statusCode, JSON.stringify(createRes.json())).toBe(201);
  const applicationId = createRes.json().data.application_id as string;

  const consentRes = await clt1App.inject({
    method: "POST",
    url: `/internal/clt1/applications/${applicationId}/consents`,
    headers: internalHeaders,
    payload: { consent_type: "terms_of_service", consent_version: "v1", consent_given: true, given_by: "kyc1_real_it_user" },
  });
  expect(consentRes.statusCode, JSON.stringify(consentRes.json())).toBe(201);

  const submitRes = await clt1App.inject({ method: "POST", url: `/internal/clt1/applications/${applicationId}/submit`, headers: internalHeaders });
  expect(submitRes.statusCode, JSON.stringify(submitRes.json())).toBe(200);

  const startReviewRes = await clt1App.inject({
    method: "POST",
    url: `/internal/clt1/applications/${applicationId}/start-review`,
    headers: internalHeaders,
    payload: { reviewer_id: "kyc1_real_it_reviewer" },
  });
  expect(startReviewRes.statusCode, JSON.stringify(startReviewRes.json())).toBe(200);
  expect(startReviewRes.json().data.status).toBe("under_review");

  return applicationId;
}

/** Phase 4B — `expected_roster_hash` is now mandatory on every `kyc_kyb` delivery (CLT-01 migration
 * 047). For the two application-status precondition tests below, CLT-01's own receipt route checks
 * `status = 'under_review'` BEFORE it ever compares the roster hash (verified directly in the
 * CLT-01 Phase 4A.1 implementation — the status-guarded read precedes the `isKycKyb` hash-check
 * block) — so a syntactically well-formed but otherwise-arbitrary placeholder is sufficient there;
 * the request is rejected for a status reason before the hash value could matter. Every OTHER call
 * site fetches the REAL current roster hash via KYC-01's own `fetchClt1KycRoster` client against
 * this file's real, listening CLT-01 server — never a placeholder. */
const PLACEHOLDER_ROSTER_HASH = "sha256:" + "0".repeat(64);

describe("KYC-01 Phase 2B: real CLT-01 outcome delivery (no stub-only positive path)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    // Full migration chain — clt1's own migrations depend on the earlier foundation/iam/iam2/
    // sec1/cfg1 migrations having already run, same as the real deployment order. Migration 008
    // (sec1 core) reads these three ingest-token vars directly off `process.env` — this is a
    // PRIVATE, throwaway database no other test file ever touches, so their literal value is
    // irrelevant beyond satisfying the migration's own fail-closed presence check.
    process.env.SEC1_INGEST_TOKEN_FND01 ??= "kyc1-real-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "kyc1-real-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "kyc1-real-it-private-db-iam02-token";

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
      payload: { applicant_type: "corporate", legal_name: "Draft Only Applicant", client_class_claimed: "institutional", created_by: "kyc1_real_it_user" },
    });
    expect(createRes.statusCode).toBe(201);
    const applicationId = createRes.json().data.application_id as string;

    const result = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: PLACEHOLDER_ROSTER_HASH });
    expect(result).toEqual({ succeeded: false, kind: "rejected", failureReasonCode: "CLT1_APPLICATION_INVALID_STATE" });
  });

  it("REAL under_review precondition: delivery to a SUBMITTED (not yet under_review) application is genuinely rejected", async () => {
    if (!schemaReady) return;
    const createRes = await clt1App.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: internalHeaders,
      payload: { applicant_type: "corporate", legal_name: "Submitted Only Applicant", client_class_claimed: "institutional", created_by: "kyc1_real_it_user" },
    });
    const applicationId = createRes.json().data.application_id as string;
    await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/consents`,
      headers: internalHeaders,
      payload: { consent_type: "terms_of_service", consent_version: "v1", consent_given: true, given_by: "kyc1_real_it_user" },
    });
    const submitRes = await clt1App.inject({ method: "POST", url: `/internal/clt1/applications/${applicationId}/submit`, headers: internalHeaders });
    expect(submitRes.json().data.status).toBe("submitted");

    const result = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: PLACEHOLDER_ROSTER_HASH });
    expect(result).toEqual({ succeeded: false, kind: "rejected", failureReasonCode: "CLT1_APPLICATION_INVALID_STATE" });
  });

  it("REAL delivery of a pass to an under_review application succeeds and CLT-01's real rollup column converges", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();
    const rosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    expect(rosterResult.ok, JSON.stringify(rosterResult)).toBe(true);
    if (!rosterResult.ok) throw new Error("unreachable");

    const result = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: rosterResult.roster.rosterHash });
    expect(result.succeeded, JSON.stringify(result)).toBe(true);
    if (!result.succeeded) throw new Error("unreachable");
    expect(result.responseRef).toBeTruthy();

    const rows = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rows.rows[0].cdd_outcome_status).toBe("pass");

    const cddRows = await verifyPool.query(`SELECT count(*) FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'kyc_kyb'`, [applicationId]);
    expect(Number(cddRows.rows[0].count)).toBe(1);
  });

  it("REAL delivery of a fail converges CLT-01's rollup to 'fail'", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();
    const rosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    if (!rosterResult.ok) throw new Error("unreachable");
    const result = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "fail", createdBy: "kyc1_real_it_user", expectedRosterHash: rosterResult.roster.rosterHash });
    expect(result.succeeded, JSON.stringify(result)).toBe(true);
    const rows = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rows.rows[0].cdd_outcome_status).toBe("fail");
  });

  it("REAL delivery of remediation_required converges CLT-01's rollup to 'remediation_required'", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();
    const rosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    if (!rosterResult.ok) throw new Error("unreachable");
    const result = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "remediation_required", createdBy: "kyc1_real_it_user", expectedRosterHash: rosterResult.roster.rosterHash });
    expect(result.succeeded, JSON.stringify(result)).toBe(true);
    const rows = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rows.rows[0].cdd_outcome_status).toBe("remediation_required");
  });

  it("REAL rollup convergence: an at-least-once DUPLICATE delivery is safe — CLT-01 records a second cdd_outcome row but the rollup column stays converged to the LATEST delivered value", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();
    const rosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    if (!rosterResult.ok) throw new Error("unreachable");
    const rosterHash = rosterResult.roster.rosterHash;

    const first = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "remediation_required", createdBy: "kyc1_real_it_user", expectedRosterHash: rosterHash });
    expect(first.succeeded, JSON.stringify(first)).toBe(true);
    const rowsAfterFirst = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rowsAfterFirst.rows[0].cdd_outcome_status).toBe("remediation_required");

    // Simulates KYC-01's own /deliver retry re-delivering the SAME (now-corrected) publication —
    // the roster has not changed, so the SAME hash is genuinely still current.
    const second = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: rosterHash });
    expect(second.succeeded, JSON.stringify(second)).toBe(true);

    const rowsAfterSecond = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rowsAfterSecond.rows[0].cdd_outcome_status).toBe("pass");

    const cddRows = await verifyPool.query(`SELECT count(*) FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'kyc_kyb'`, [applicationId]);
    expect(Number(cddRows.rows[0].count)).toBe(2);
  });

  // ===============================================================================================
  // PHASE 4B — real CLT-01 stale-roster rejection (migration 047's own atomic-receipt contract).
  //
  // SCOPE NOTE (per the approved Phase 4B task instructions): CLT-01's currently supported HTTP
  // surface has no way to create an `authorised_party` row before an application is approved (every
  // party-mutation route requires an already-approved, active_limited client — see the CLT-01 Phase
  // 4A.1 implementation notes). The roster mutation below therefore uses a raw-SQL fixture, exactly
  // like the CLT-01 Phase 4A/4A.1 test suites already do for the identical reason. This is a
  // TECHNICAL CONSISTENCY test — it proves the atomic stale-roster CONTROL is genuinely wired
  // end-to-end against a REAL CLT-01 server, NOT that the organic pre-approval workflow is complete
  // (it is not — see this repo's own Phase 4A.2 carry-forward).
  //
  // This file drives only the raw `deliverKycOutcome`/`fetchClt1KycRoster` CLIENT functions against
  // a real, listening CLT-01 (the same pattern every other test in this file already uses) — it
  // does NOT build a second, real KYC-01 Fastify app in this process, because `@aix/foundation`'s
  // `initPool()` is a single process-wide singleton (confirmed by direct inspection of
  // `packages/foundation/src/db.ts`): a second app connected as `role_kyc1_runtime` in the SAME
  // process would silently reuse CLT-01's OWN pool/role, which has no grant into `kyc1.*` — the
  // real multi-service deployment always runs each service as its own separate process. What this
  // test proves is the REAL network/CLT-01 boundary: that CLT-01 genuinely returns
  // `CLT1_KYC_ROSTER_STALE` for a real stale hash, and that KYC-01's own `deliverKycOutcome` client
  // correctly discriminates it as `kind: "stale"` — the exact signal
  // `routes/outcome-publication.ts` maps to `KYC1_OUTCOME_PUBLICATION_STALE`. That ROUTE-level
  // mapping itself (with a stubbed CLT-01 response, where the exact response shape is controlled) is
  // separately proven in `tests/integration/kyc1-db.test.ts`.
  // ===============================================================================================
  it("PHASE 4B: real CLT-01 genuinely returns CLT1_KYC_ROSTER_STALE for a stale hash — rollup untouched — then a fresh hash delivers successfully", async () => {
    if (!schemaReady) return;
    const applicationId = await createUnderReviewApplication();

    // Step 1 — seed one authorised_party row directly (raw SQL — see this describe block's own
    // scope note above) and capture the roster hash X a "KYC-01 publication" would have bound to.
    await verifyPool.query(
      `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
       VALUES ('clt1ap_e2e_stale_1', $1, 'director', 'Technical Consistency Fixture', 'pending', 'probe')`,
      [applicationId],
    );
    const staleRosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    expect(staleRosterResult.ok, JSON.stringify(staleRosterResult)).toBe(true);
    if (!staleRosterResult.ok) throw new Error("unreachable");
    const hashX = staleRosterResult.roster.rosterHash;

    // Step 2 — mutate the CLT roster (hash X -> hash Y) — simulates a roster change occurring
    // between a KYC-01 publication and its delivery attempt.
    await verifyPool.query(`INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
                             VALUES ('clt1ap_e2e_stale_2', $1, 'ubo', 'Technical Consistency Fixture 2', 'pending', 'probe')`, [applicationId]);
    const currentRosterResult = await fetchClt1KycRoster(clt1ClientConfig, applicationId);
    if (!currentRosterResult.ok) throw new Error("unreachable");
    const hashY = currentRosterResult.roster.rosterHash;
    expect(hashY).not.toBe(hashX);

    // Step 3+4 — attempt delivery bound to the NOW-STALE hash X; confirm CLT-01 genuinely refuses.
    const staleDelivery = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: hashX });
    expect(staleDelivery).toEqual({ succeeded: false, kind: "stale", failureReasonCode: "CLT1_KYC_ROSTER_STALE" });

    // Step 6 — CLT-01's rollup must remain completely untouched by the refused attempt.
    const afterStale = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(afterStale.rows[0].cdd_outcome_status).not.toBe("pass");
    const cddCountAfterStale = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'kyc_kyb'`, [applicationId]);
    expect(cddCountAfterStale.rows[0].n).toBe(0);

    // Step 7+8 — a "fresh publication" (hash Y) delivers successfully.
    const freshDelivery = await deliverKycOutcome(clt1ClientConfig, { applicationId, aggregateStatus: "pass", createdBy: "kyc1_real_it_user", expectedRosterHash: hashY });
    expect(freshDelivery.succeeded, JSON.stringify(freshDelivery)).toBe(true);
    const afterFresh = await verifyPool.query(`SELECT cdd_outcome_status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(afterFresh.rows[0].cdd_outcome_status).toBe("pass");
  });
});
