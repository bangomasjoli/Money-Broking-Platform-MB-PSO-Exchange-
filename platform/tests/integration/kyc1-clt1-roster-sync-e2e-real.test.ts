/**
 * CLT-01 Phase 4A.2B — the D1-closing ORGANIC end-to-end test. Self-skips unless
 * `TEST_DATABASE_URL` is set. Mirrors `tests/integration/kyc1-clt1-outcome-delivery-real.test.ts`'s
 * own throwaway-database provisioning shape, extended to run BOTH a real CLT-01 app and a real
 * KYC-01 app in the SAME process.
 *
 * WHY A COMBINED-ROLE FIXTURE: `@aix/foundation`'s `getPool()`/`initPool()` is a single,
 * process-wide singleton pool (confirmed directly in `packages/foundation/src/db.ts`) — exactly
 * why `kyc1-clt1-outcome-delivery-real.test.ts` deliberately avoids building a second real KYC-01
 * app in its own process. This file instead creates ONE throwaway login role that is a member of
 * BOTH pre-existing runtime roles (`role_clt1_runtime` AND `role_kyc1_runtime`) and calls
 * `initPool()` exactly once — a test-fixture-only convenience that changes nothing about the real,
 * permanent invariant either service's OWN runtime role enforces (`role_clt1_runtime` and
 * `role_kyc1_runtime` themselves are never modified, never granted into each other's schema — see
 * `infra/grants/clt1_runtime_grants.sql`/`kyc1_runtime_grants.sql`, both untouched by this file).
 *
 * WHY AN INJECT-FETCH ADAPTER, NOT A LISTENING SOCKET: KYC-01's own `lib/roster-client.ts`/
 * `lib/clt1-client.ts` reach CLT-01 exclusively via `fetch` (`config.clt1FetchImpl`, the SAME
 * dependency-injection seam every other KYC-01 test file already uses). `injectFetch` below adapts
 * that seam onto `clt1App.inject(...)` — Fastify's own in-process HTTP-shaped request/response
 * path — so KYC-01's roster-sync and deliver routes exercise CLT-01's REAL route handlers (real
 * schema validation, real internal-identity guard, real business logic, real Postgres writes)
 * without an actual TCP socket. This is NOT a hand-written stub: every field either service
 * observes is produced by the OTHER service's own real route code.
 *
 * FORBIDDEN THROUGHOUT THE ORGANIC WORKFLOW BELOW (verify by reading the test body — every step is
 * a `.inject()` call against a real route, not a query):
 *   - no raw SQL `INSERT INTO clt1.authorised_party`
 *   - no raw SQL `INSERT INTO kyc1.kyc_case`
 *   - no caller-supplied fake `party_id`
 *   - no direct cross-schema SQL
 *   - no maker-checker bypass
 *   - no direct `outcome_publication`/`client_profile` INSERT
 * `verifyPool` (a separate superuser connection) is used ONLY for final, read-only assertions.
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
import type { Kyc1Config } from "../../services/kyc1/src/config.js";
import { buildApp as buildKyc1App } from "../../services/kyc1/src/server.js";

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

const PRIVATE_DB_NAME = `kyc1_clt1_rostersync_e2e_${randomBytes(6).toString("hex")}`;
const RUNTIME_ROLE_USER = "clt1_kyc1_app_test_rostersync_e2e";

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let maintenancePool: Pool;
let privateDbUrl: string;
let schemaReady = false;
let verifyPool: Pool;
let clt1App: FastifyInstance;
let kyc1App: FastifyInstance;

const clt1InternalHeaders = { "x-internal-service-token": "test-clt1-internal-token-e2e" };
const kyc1InternalHeaders = { "x-internal-service-token": "test-kyc1-internal-token-e2e" };

/** Adapts a KYC-01 `fetchImpl` (or CLT-01's own dependency clients — same shape) onto a Fastify
 * app's `inject()` — see this file's own header comment for why this proves REAL cross-service
 * route execution without a listening socket. */
function injectFetch(app: FastifyInstance): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const u = new URL(String(url));
    const reqInit = init as { method?: string; headers?: Record<string, string>; body?: string } | undefined;
    const res = await app.inject({
      method: (reqInit?.method ?? "GET") as "GET" | "POST",
      url: u.pathname + u.search,
      headers: reqInit?.headers,
      payload: reqInit?.body,
    });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => res.json(),
    } as Response;
  }) as typeof fetch;
}

function allowAllCfg1Fetch(): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).endsWith("/internal/cfg1/features/evaluate")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_e2e" } }) } as Response;
    }
    throw new Error(`Unexpected CFG-01 URL in the Phase 4A.2B organic E2E fixture: ${String(url)}`);
  }) as typeof fetch;
}

/** Allow-everything IAM-02 stub — baseline permission_granted, execute-verify always authorises.
 * Used for CLT-01's own approve/request+apply and Phase 4A.2A authorised-party maker-checker calls
 * — the actual IDENTITY discipline (distinct maker/checker actor ids) is enforced by THIS test's
 * own request bodies, not by the IAM-02 stub. */
function allowAllIam2Fetch(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in the Phase 4A.2B organic E2E fixture: ${urlStr}`);
  }) as typeof fetch;
}

const clt1Config: Clt1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused",
  internalServiceToken: "test-clt1-internal-token-e2e",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-e2e",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-cfg1-token-unused",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-token-unused",
};

const kyc1Config: Kyc1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused",
  internalServiceToken: "test-kyc1-internal-token-e2e",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  kyc1InternalServiceToken: "test-kyc1-internal-token-e2e",
  clt1BaseUrl: "http://clt1.e2e.invalid",
  clt1InternalServiceToken: "test-clt1-internal-token-e2e",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-token-unused",
};

describe("CLT-01 Phase 4A.2B: organic CLT-to-KYC end-to-end (real CLT-01 + real KYC-01, no raw SQL party/case seeding)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "kyc1clt1-e2e-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "kyc1clt1-e2e-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "kyc1clt1-e2e-private-db-iam02-token";

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

    // ONE throwaway login role, member of BOTH pre-existing runtime roles — see this file's own
    // header comment for why this is safe and does not touch either role's own real grants.
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
    await verifyPool.query(`GRANT role_kyc1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeUrl = new URL(privateDbUrl);
    runtimeUrl.username = RUNTIME_ROLE_USER;
    runtimeUrl.password = "";
    initPool(runtimeUrl.toString());

    clt1Config.cfg1FetchImpl = allowAllCfg1Fetch();
    clt1Config.iam2FetchImpl = allowAllIam2Fetch();
    clt1App = await buildClt1App(clt1Config);

    kyc1Config.clt1FetchImpl = injectFetch(clt1App);
    kyc1App = await buildKyc1App(kyc1Config);
  }, 60_000);

  afterAll(async () => {
    if (clt1App) await clt1App.close();
    if (kyc1App) await kyc1App.close();
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

  it("D1-closing organic flow: create -> submit -> review -> CLT authorised-party capture -> KYC primary handoff -> KYC roster-sync -> KYC evidence/outcome -> AML handoff+outcomes -> KYC publish -> KYC deliver -> CLT approve -> client_profile, with zero raw SQL party/case seeding", async () => {
    if (!schemaReady) return;

    // -----------------------------------------------------------------------------------------
    // INFRASTRUCTURE (not the organic workflow itself): actor identities used purely to satisfy
    // the pre-existing, unrelated self-approval/self-request maker-checker rules with distinct
    // human ids — no fixture provisions any party/case row directly.
    // -----------------------------------------------------------------------------------------
    const reviewerId = "e2e_reviewer_1";
    const partyMakerId = "e2e_party_maker_1";
    const approverId = "e2e_approver_1";

    // ===========================================================================================
    // 1. create CLT application
    // ===========================================================================================
    const createRes = await clt1App.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: clt1InternalHeaders,
      payload: { applicant_type: "individual", legal_name: "Phase 4A.2B Organic E2E Applicant", client_class_claimed: "professional", created_by: "e2e_applicant_1" },
    });
    expect(createRes.statusCode, JSON.stringify(createRes.json())).toBe(201);
    const applicationId = createRes.json().data.application_id as string;

    // ===========================================================================================
    // 2. submit application (consent first — the accepted precondition)
    // ===========================================================================================
    const consentRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/consents`,
      headers: clt1InternalHeaders,
      payload: { consent_type: "terms_of_service", consent_version: "v1", consent_given: true, given_by: "e2e_applicant_1" },
    });
    expect(consentRes.statusCode, JSON.stringify(consentRes.json())).toBe(201);
    const submitRes = await clt1App.inject({ method: "POST", url: `/internal/clt1/applications/${applicationId}/submit`, headers: clt1InternalHeaders });
    expect(submitRes.statusCode, JSON.stringify(submitRes.json())).toBe(200);

    // ===========================================================================================
    // 3. start review
    // ===========================================================================================
    const startReviewRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/start-review`,
      headers: clt1InternalHeaders,
      payload: { reviewer_id: reviewerId },
    });
    expect(startReviewRes.statusCode, JSON.stringify(startReviewRes.json())).toBe(200);
    expect(startReviewRes.json().data.status).toBe("under_review");

    // ===========================================================================================
    // 4. capture authorised party through Phase 4A.2A add/request + add/apply (distinct maker/
    //    checker identities: partyMakerId requests, IAM-02's own execute-verify authorises apply)
    // ===========================================================================================
    const addRequestRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/authorised-parties/add/request`,
      headers: clt1InternalHeaders,
      payload: { party_type: "director", party_reference: "E2E Organic Party Reference", requested_by: partyMakerId },
    });
    expect(addRequestRes.statusCode, JSON.stringify(addRequestRes.json())).toBe(200);
    const partyDecisionId = addRequestRes.json().data.decision_id as string;

    const addApplyRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/authorised-parties/add/apply`,
      headers: clt1InternalHeaders,
      payload: { decision_id: partyDecisionId, approval_id: "iam2appr_e2e_party", decision_token: "tok_e2e_party" },
    });
    expect(addApplyRes.statusCode, JSON.stringify(addApplyRes.json())).toBe(200);
    const authorisedPartyId = addApplyRes.json().data.authorised_party_id as string;
    expect(authorisedPartyId).toBeTruthy();

    // ===========================================================================================
    // 5. create the primary KYC case through the accepted handoff route
    // ===========================================================================================
    const primaryHandoffRes = await kyc1App.inject({
      method: "POST",
      url: "/internal/kyc1/handoffs",
      headers: kyc1InternalHeaders,
      payload: { application_id: applicationId, case_type: "individual" },
    });
    expect(primaryHandoffRes.statusCode, JSON.stringify(primaryHandoffRes.json())).toBe(201);
    const primaryCaseId = primaryHandoffRes.json().data.case_id as string;

    // ===========================================================================================
    // 6. invoke KYC roster-sync — the phase's own new operation
    // ===========================================================================================
    const syncRes = await kyc1App.inject({ method: "POST", url: `/internal/kyc1/applications/${applicationId}/roster-sync`, headers: kyc1InternalHeaders, payload: {} });
    expect(syncRes.statusCode, JSON.stringify(syncRes.json())).toBe(200);
    const syncData = syncRes.json().data;
    expect(syncData.created_count).toBe(1);
    expect(syncData.primary_anchor_present).toBe(true);
    expect(syncData.created_anchors).toEqual([{ party_id: authorisedPartyId, case_id: expect.any(String) }]);
    const partyCaseId = syncData.created_anchors[0].case_id as string;

    // ===========================================================================================
    // 7. assert exactly one authorised_party case exists with the exact CLT party_id — read-only
    // ===========================================================================================
    const partyCaseRow = await verifyPool.query(`SELECT case_type, party_id FROM kyc1.kyc_case WHERE case_id = $1`, [partyCaseId]);
    expect(partyCaseRow.rows).toEqual([{ case_type: "authorised_party", party_id: authorisedPartyId }]);

    // ===========================================================================================
    // 8. complete accepted evidence/checklist/verification/outcome workflows for BOTH cases
    // ===========================================================================================
    async function passKycCase(caseId: string, documentTypes: string[]): Promise<void> {
      for (const dt of documentTypes) {
        const evidenceRes = await kyc1App.inject({
          method: "POST",
          url: `/internal/kyc1/cases/${caseId}/evidence`,
          headers: kyc1InternalHeaders,
          payload: { document_type: dt, evidence_ref: `dms://${caseId}-${dt}` },
        });
        expect(evidenceRes.statusCode, JSON.stringify(evidenceRes.json())).toBe(201);
      }
      const checklistRes = await kyc1App.inject({ method: "GET", url: `/internal/kyc1/cases/${caseId}/checklist`, headers: kyc1InternalHeaders });
      const checklist = checklistRes.json().data.checklist as Array<{ checklist_item_id: string; document_type: string }>;
      for (const dt of documentTypes) {
        const item = checklist.find((c) => c.document_type === dt)!;
        const vrRes = await kyc1App.inject({
          method: "POST",
          url: `/internal/kyc1/cases/${caseId}/verification-results`,
          headers: kyc1InternalHeaders,
          payload: { source_type: "manual", source_id: "e2e_verifier_1", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id },
        });
        expect(vrRes.statusCode, JSON.stringify(vrRes.json())).toBe(201);
      }
      const identityRes = await kyc1App.inject({
        method: "POST",
        url: `/internal/kyc1/cases/${caseId}/verification-results`,
        headers: kyc1InternalHeaders,
        payload: { source_type: "manual", source_id: "e2e_verifier_1", result_type: "identity", result_status: "pass" },
      });
      expect(identityRes.statusCode, JSON.stringify(identityRes.json())).toBe(201);
      const outcomeRes = await kyc1App.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/compute-outcome`, headers: kyc1InternalHeaders });
      expect(outcomeRes.statusCode, JSON.stringify(outcomeRes.json())).toBe(201);
      expect(outcomeRes.json().data.outcome_status).toBe("pass");
    }
    await passKycCase(primaryCaseId, ["identity_document"]);
    await passKycCase(partyCaseId, ["identity_document", "authority_evidence"]);

    // ===========================================================================================
    // 9-10. CLT AML handoff marker + the three non-KYC outcome receipts (required by CLT's own
    //       approval gate — blueprint's own "all four rollup columns pass" rule)
    // ===========================================================================================
    const kycHandoffMarker = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/handoff/kyc-kyb`,
      headers: clt1InternalHeaders,
      payload: { created_by: "e2e_fixture" },
    });
    expect(kycHandoffMarker.statusCode, JSON.stringify(kycHandoffMarker.json())).toBe(201);
    const amlHandoffMarker = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/handoff/aml`,
      headers: clt1InternalHeaders,
      payload: { created_by: "e2e_fixture" },
    });
    expect(amlHandoffMarker.statusCode, JSON.stringify(amlHandoffMarker.json())).toBe(201);

    for (const outcomeType of ["aml_sanctions", "pep_adverse_media", "risk_rating"]) {
      const outcomeRes = await clt1App.inject({
        method: "POST",
        url: `/internal/clt1/applications/${applicationId}/outcomes`,
        headers: clt1InternalHeaders,
        payload: { outcome_type: outcomeType, outcome_status: "pass", source_module: "TEST", created_by: "e2e_fixture" },
      });
      expect(outcomeRes.statusCode, JSON.stringify(outcomeRes.json())).toBe(201);
    }

    // ===========================================================================================
    // 11. publish the roster-bound KYC application outcome
    // ===========================================================================================
    const publishRes = await kyc1App.inject({
      method: "POST",
      url: `/internal/kyc1/applications/${applicationId}/publish-outcome`,
      headers: kyc1InternalHeaders,
      payload: { requested_by: "e2e_kyc_officer_1" },
    });
    expect(publishRes.statusCode, JSON.stringify(publishRes.json())).toBe(201);
    const publicationId = publishRes.json().data.publication_id as string;
    expect(publishRes.json().data.aggregate_status).toBe("pass");
    expect(publishRes.json().data.required_party_count).toBe(1);
    expect(publishRes.json().data.contributing_party_ids).toEqual([authorisedPartyId]);

    // ===========================================================================================
    // 12. deliver it atomically to CLT — the REAL cross-service HTTP call, via injectFetch, against
    //     CLT-01's real receipt route (migration 047's own atomic contract)
    // ===========================================================================================
    const deliverRes = await kyc1App.inject({
      method: "POST",
      url: `/internal/kyc1/outcome-publications/${publicationId}/deliver`,
      headers: kyc1InternalHeaders,
      payload: { requested_by: "e2e_kyc_officer_1" },
    });
    expect(deliverRes.statusCode, JSON.stringify(deliverRes.json())).toBe(200);
    expect(deliverRes.json().data.status).toBe("succeeded");

    // ===========================================================================================
    // 13. assert CLT-01 stores the accepted roster hash — read-only
    // ===========================================================================================
    const rosterAfterDeliverRes = await clt1App.inject({ method: "GET", url: `/internal/clt1/applications/${applicationId}/kyc-roster`, headers: clt1InternalHeaders });
    const currentRosterHash = rosterAfterDeliverRes.json().data.roster_hash as string;
    const rollupRow = await verifyPool.query(`SELECT cdd_outcome_status, kyc_roster_hash FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(rollupRow.rows[0].cdd_outcome_status).toBe("pass");
    expect(rollupRow.rows[0].kyc_roster_hash).toBe(currentRosterHash);

    // ===========================================================================================
    // 14. request and apply final CLT approval (distinct actor from the reviewer — avoids the
    //     pre-existing, unrelated self-approval block)
    // ===========================================================================================
    const approveRequestRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/approve/request`,
      headers: clt1InternalHeaders,
      payload: { requested_by: approverId },
    });
    expect(approveRequestRes.statusCode, JSON.stringify(approveRequestRes.json())).toBe(200);
    const decisionId = approveRequestRes.json().data.decision_id as string;

    const approveApplyRes = await clt1App.inject({
      method: "POST",
      url: `/internal/clt1/applications/${applicationId}/approve/apply`,
      headers: clt1InternalHeaders,
      payload: { decision_id: decisionId, approval_id: "iam2appr_e2e_approve", decision_token: "tok_e2e_approve" },
    });
    expect(approveApplyRes.statusCode, JSON.stringify(approveApplyRes.json())).toBe(200);
    expect(approveApplyRes.json().data.status).toBe("approved");
    const clientId = approveApplyRes.json().data.client_id as string;
    expect(clientId).toBeTruthy();

    // ===========================================================================================
    // 15. final assertions — application approved, client_profile created, roster hash still bound
    // ===========================================================================================
    const finalAppRow = await verifyPool.query(`SELECT status, kyc_roster_hash FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
    expect(finalAppRow.rows[0].status).toBe("approved");
    expect(finalAppRow.rows[0].kyc_roster_hash).toBe(currentRosterHash);
    const clientProfileRow = await verifyPool.query(`SELECT client_id, status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
    expect(clientProfileRow.rows).toEqual([{ client_id: clientId, status: "active_limited" }]);
  }, 30_000);
});
