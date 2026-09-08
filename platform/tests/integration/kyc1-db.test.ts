/**
 * KYC-01 Phase 1 DB-gated integration tests. Self-skips unless `TEST_DATABASE_URL` points at a
 * Postgres that already has `foundation` (001, 005) and KYC-01's own `kyc1` schema (042) migrated,
 * with `fnd_runtime_grants.sql` and `kyc1_runtime_grants.sql` applied.
 *
 * Connects as `role_kyc1_runtime` via a real LOGIN role from the START (S1 lesson applied from day
 * one, per every prior module's own precedent — never superuser-only). A separate superuser
 * `pg.Pool` (`verifyPool`) is used for fixture setup/independent verification, never to drive the
 * app itself.
 *
 * Phase 2B addition: `config.clt1FetchImpl` is a MUTABLE stub the delivery-lifecycle tests swap
 * per-scenario (`config.clt1FetchImpl = realisticCltFetch()` etc., before each call) — the SAME
 * pattern `tests/integration/aml1-db.test.ts` already established for the identical dependency
 * shape. `services/kyc1/src/routes/outcome-publication.ts` reads `app.config.clt1FetchImpl` fresh
 * at request time (never captured at boot), so mutating this shared object between tests is safe
 * and does not require rebuilding `app`. A SEPARATE file
 * (`tests/integration/kyc1-clt1-outcome-delivery-real.test.ts`) proves the positive delivery path
 * against a REAL listening CLT-01 server, not a stub — never rely on a stub alone for that.
 *
 * Phase 3A addition: `config.iam2FetchImpl` is the identical mutable-stub DI seam for KYC-01's own
 * `lib/iam2-client.ts` — `routes/sensitive-evidence.ts` reads `app.config.iam2FetchImpl` fresh at
 * request time, same as `clt1FetchImpl` above.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Kyc1Config } from "../../services/kyc1/src/config.js";
import { buildApp } from "../../services/kyc1/src/server.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "kyc1_app_test";

// ---------------------------------------------------------------------------------------------
// CLT-01 fetch stubs (Phase 2B) — mirrors tests/integration/aml1-db.test.ts's own shape exactly.
// ---------------------------------------------------------------------------------------------
function makeFakeCltFetch(decide: (urlStr: string, body: Record<string, unknown>) => { status: number; body: unknown }): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    const result = decide(urlStr, body);
    return { ok: result.status >= 200 && result.status < 300, json: async () => result.body } as Response;
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// Phase 4B roster-stub support. Publish and deliver now ALWAYS call CLT-01's
// GET .../kyc-roster before doing anything else, so every fetch stub below must be able to
// answer that request too, not just the legacy POST .../outcomes call. Rather than editing every
// call site in this file, each stub transparently answers /kyc-roster with a deterministic,
// correctly-hashed EMPTY roster (no authorised parties — this test file has no clt1.* tables and
// predates the pre-approval reachability gap fixtures), deriving primary_subject_type from
// whatever primary case actually exists for that application_id so completeness checks agree
// with the KYC-side fixtures each test already set up. Only the /outcomes behaviour differs
// between stub variants, exactly as before.
// ---------------------------------------------------------------------------------------------
function canonicalTestJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalTestJson(v)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalTestJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeTestRosterHash(
  applicationId: string,
  applicationStatus: string,
  primarySubjectType: string,
  parties: Array<{ authorised_party_id: string; party_type: string; authority_status: string; version: number }>,
): string {
  const canonical = canonicalTestJson({
    application_id: applicationId,
    application_status: applicationStatus,
    primary_subject_type: primarySubjectType,
    authorised_parties: parties,
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

async function primarySubjectTypeForApplication(applicationId: string): Promise<"individual" | "entity"> {
  const r = await verifyPool.query(
    `SELECT case_type FROM kyc1.kyc_case WHERE application_id = $1 AND case_type IN ('individual', 'entity') AND party_id IS NULL ORDER BY created_at_utc DESC LIMIT 1`,
    [applicationId],
  );
  return r.rows[0]?.case_type === "entity" ? "entity" : "individual";
}

async function stubRosterResponse(urlStr: string): Promise<Response> {
  const m = /applications\/([^/?]+)\/kyc-roster/.exec(urlStr);
  const applicationId = m ? decodeURIComponent(m[1]) : "unknown";
  const primarySubjectType = await primarySubjectTypeForApplication(applicationId);
  const applicationStatus = "under_review";
  const parties: Array<{ authorised_party_id: string; party_type: string; authority_status: string; version: number }> = [];
  const rosterHash = computeTestRosterHash(applicationId, applicationStatus, primarySubjectType, parties);
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        application_id: applicationId,
        application_status: applicationStatus,
        primary_subject_type: primarySubjectType,
        authorised_parties: parties,
        party_count: parties.length,
        roster_hash: rosterHash,
      },
    }),
  } as Response;
}

function realisticCltFetch(): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
    if (urlStr.includes("/outcomes")) {
      return { ok: true, json: async () => ({ success: true, data: { outcome_id: "clt1cdd_stub_" + Math.random().toString(36).slice(2) } }) } as Response;
    }
    throw new Error(`Unexpected CLT-01 URL in KYC-01 Phase 2B test fixture: ${urlStr}`);
  }) as typeof fetch;
}

function cltInvalidState(errorCode: string): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
    return { ok: false, json: async () => ({ success: false, error: { code: errorCode } }) } as Response;
  }) as typeof fetch;
}

function cltUnreachable(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

function cltMalformedResponse(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
    return {
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function cltSuccessFalse(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
    return { ok: true, json: async () => ({ success: false }) } as Response;
  }) as typeof fetch;
}

// Roster-aware stub for tests that need CLT-01's roster GET itself to fail (distinct from the
// /outcomes-failure stubs above, which always answer /kyc-roster successfully).
function cltRosterUnreachable(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) throw new Error("network down");
    throw new Error(`Unexpected CLT-01 URL — roster fetch should have short-circuited: ${urlStr}`);
  }) as unknown as typeof fetch;
}

// Roster-aware stub for tests needing a specific non-empty roster (Phase 4B completeness /
// staleness scenarios). Parties/status/type are caller-supplied; /outcomes always accepts.
function cltRosterFetch(opts: {
  primarySubjectType?: "individual" | "entity";
  applicationStatus?: string;
  parties?: Array<{ authorised_party_id: string; party_type: string; authority_status: string; version: number }>;
}): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) {
      const m = /applications\/([^/?]+)\/kyc-roster/.exec(urlStr);
      const applicationId = m ? decodeURIComponent(m[1]) : "unknown";
      const primarySubjectType = opts.primarySubjectType ?? "individual";
      const applicationStatus = opts.applicationStatus ?? "under_review";
      const parties = [...(opts.parties ?? [])].sort((a, b) => (a.authorised_party_id < b.authorised_party_id ? -1 : a.authorised_party_id > b.authorised_party_id ? 1 : 0));
      const rosterHash = computeTestRosterHash(applicationId, applicationStatus, primarySubjectType, parties);
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            application_id: applicationId,
            application_status: applicationStatus,
            primary_subject_type: primarySubjectType,
            authorised_parties: parties,
            party_count: parties.length,
            roster_hash: rosterHash,
          },
        }),
      } as Response;
    }
    if (urlStr.includes("/outcomes")) {
      return { ok: true, json: async () => ({ success: true, data: { outcome_id: "clt1cdd_stub_" + Math.random().toString(36).slice(2) } }) } as Response;
    }
    throw new Error(`Unexpected CLT-01 URL in KYC-01 Phase 4B test fixture: ${urlStr}`);
  }) as typeof fetch;
}

// Roster-aware stub (Phase 4A.2B) — the roster GET itself returns 2xx but an unparseable body.
function cltRosterMalformed(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) {
      return {
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response;
    }
    throw new Error(`Unexpected CLT-01 URL in KYC-01 roster-sync malformed-roster fixture: ${urlStr}`);
  }) as unknown as typeof fetch;
}

// Roster-aware stub (Phase 4A.2B) — the roster GET echoes a DIFFERENT application_id than the one
// requested (a misconfigured/misrouted CLT-01 defence — lib/roster-client.ts's own strict shape
// validation must reject this as malformed, never trust it).
function cltRosterWrongApplicationId(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/kyc-roster")) {
      const wrongId = "clt1app_completely_different_application";
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            application_id: wrongId,
            application_status: "under_review",
            primary_subject_type: "individual",
            authorised_parties: [],
            party_count: 0,
            roster_hash: computeTestRosterHash(wrongId, "under_review", "individual", []),
          },
        }),
      } as Response;
    }
    throw new Error(`Unexpected CLT-01 URL in KYC-01 roster-sync wrong-application-id fixture: ${urlStr}`);
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// IAM-02 fetch stubs (Phase 3A) — mirrors the CLT-01 stub shape above exactly (same DI seam
// pattern, config.iam2FetchImpl read fresh per-request by routes/sensitive-evidence.ts).
// ---------------------------------------------------------------------------------------------
function allowAllIam2Fetch(): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in KYC-01 Phase 3A test fixture: ${String(url)}`);
  }) as typeof fetch;
}

function denyIam2Fetch(): typeof fetch {
  return (async (url: unknown) => {
    if (String(url).endsWith("/internal/iam2/permission/check")) {
      return { ok: true, json: async () => ({ success: true, data: { decision: "deny", reason: "IAM2_PERMISSION_DENIED" } }) } as Response;
    }
    throw new Error(`Unexpected IAM-02 URL in KYC-01 Phase 3A test fixture: ${String(url)}`);
  }) as typeof fetch;
}

function iam2Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// IAM-02 fetch stubs (Phase 3B) — handle BOTH /permission/check and /permission/execute-verify,
// since the override apply route calls both. Mirrors the same DI-seam pattern as the Phase 3A
// stubs above.
// ---------------------------------------------------------------------------------------------
function makeFakeIam2FetchFull(decide: (path: "check" | "execute-verify", body: Record<string, unknown>) => { ok: boolean; body: unknown }): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    const path: "check" | "execute-verify" = urlStr.endsWith("/permission/check") ? "check" : urlStr.endsWith("/permission/execute-verify") ? "execute-verify" : (() => {
      throw new Error(`Unexpected IAM-02 URL in KYC-01 Phase 3B test fixture: ${urlStr}`);
    })();
    const result = decide(path, body);
    return { ok: result.ok, json: async () => result.body } as Response;
  }) as typeof fetch;
}

/** Baseline allow + execute-verify authorised — the full happy path. */
function allowOverrideIam2Fetch(): typeof fetch {
  return makeFakeIam2FetchFull((path) => {
    if (path === "check") return { ok: true, body: { success: true, data: { decision: "allow", reason: "permission_granted" } } };
    return { ok: true, body: { success: true, data: { execution_authorised: true } } };
  });
}

/** Baseline deny — execute-verify is never reached in practice (request/apply return before
 * calling it), but the stub still answers safely if it somehow were. */
function denyOverrideIam2Fetch(): typeof fetch {
  return makeFakeIam2FetchFull((path) => {
    if (path === "check") return { ok: true, body: { success: true, data: { decision: "deny", reason: "IAM2_PERMISSION_DENIED" } } };
    return { ok: false, body: { success: false, error: { code: "IAM2_DECISION_TOKEN_INVALID" } } };
  });
}

/** Baseline approval_required (a genuine PASS, not a denial) + execute-verify REJECTS with the
 * given IAM-02 reason code — non-2xx, mirrors execute-verify's own real failure shape. */
function executeVerifyRejectsFetch(errorCode: string): typeof fetch {
  return makeFakeIam2FetchFull((path) => {
    if (path === "check") return { ok: true, body: { success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } } };
    return { ok: false, body: { success: false, error: { code: errorCode } } };
  });
}

/** Baseline approval_required + execute-verify returns 200 with execution_authorised !== true
 * (malformed, not a genuine denial code). */
function executeVerifyMalformedFetch(): typeof fetch {
  return makeFakeIam2FetchFull((path) => {
    if (path === "check") return { ok: true, body: { success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } } };
    return { ok: true, body: { success: true, data: {} } };
  });
}

const config: Kyc1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-kyc1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  kyc1InternalServiceToken: "test-kyc1-internal-token-it",
  clt1BaseUrl: "http://clt1.invalid",
  clt1InternalServiceToken: "test-clt1-shared-token-it",
  clt1FetchImpl: undefined,
  iam2BaseUrl: "http://iam2.invalid",
  iam2InternalServiceToken: "test-iam2-shared-token-it",
  iam2FetchImpl: undefined,
};

const internalHeaders = { "x-internal-service-token": "test-kyc1-internal-token-it" };

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'kyc1') AS kyc1`,
    );
    const row = r.rows[0];
    return Number(row?.fnd) > 0 && Number(row?.kyc1) > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------------------------
let caseCounter = 0;
function freshApplicationId(prefix = "clt1app_kyc"): string {
  caseCounter += 1;
  return `${prefix}_${caseCounter}_${Date.now()}`;
}

interface CreateHandoffInput {
  application_id?: string;
  client_id?: string;
  party_id?: string;
  case_type?: "individual" | "entity" | "authorised_party";
  created_from_handoff_id?: string;
}

async function createHandoff(overrides: CreateHandoffInput = {}) {
  return app.inject({
    method: "POST",
    url: "/internal/kyc1/handoffs",
    headers: internalHeaders,
    payload: {
      application_id: overrides.application_id ?? freshApplicationId(),
      case_type: overrides.case_type ?? "individual",
      ...(overrides.client_id ? { client_id: overrides.client_id } : {}),
      ...(overrides.party_id ? { party_id: overrides.party_id } : {}),
      ...(overrides.created_from_handoff_id ? { created_from_handoff_id: overrides.created_from_handoff_id } : {}),
    },
  });
}

async function getCase(caseId: string) {
  return app.inject({ method: "GET", url: `/internal/kyc1/cases/${caseId}`, headers: internalHeaders });
}

async function listCases(qs: string) {
  return app.inject({ method: "GET", url: `/internal/kyc1/cases?${qs}`, headers: internalHeaders });
}

async function getChecklist(caseId: string) {
  return app.inject({ method: "GET", url: `/internal/kyc1/cases/${caseId}/checklist`, headers: internalHeaders });
}

async function addEvidence(caseId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/evidence`, headers: internalHeaders, payload: body });
}

async function addVerificationResult(caseId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/verification-results`, headers: internalHeaders, payload: body });
}

async function computeOutcome(caseId: string) {
  return app.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/compute-outcome`, headers: internalHeaders });
}

async function getOutcome(caseId: string) {
  return app.inject({ method: "GET", url: `/internal/kyc1/cases/${caseId}/outcome`, headers: internalHeaders });
}

async function publishOutcome(applicationId: string, requestedBy = "staff_1") {
  return app.inject({
    method: "POST",
    url: `/internal/kyc1/applications/${applicationId}/publish-outcome`,
    headers: internalHeaders,
    payload: { requested_by: requestedBy },
  });
}

async function deliverOutcome(publicationId: string, requestedBy = "staff_1") {
  return app.inject({
    method: "POST",
    url: `/internal/kyc1/outcome-publications/${publicationId}/deliver`,
    headers: internalHeaders,
    payload: { requested_by: requestedBy },
  });
}

async function getPublication(publicationId: string) {
  return app.inject({ method: "GET", url: `/internal/kyc1/outcome-publications/${publicationId}`, headers: internalHeaders });
}

async function getSensitiveDetail(checklistItemId: string, actorId = "staff_1") {
  return app.inject({
    method: "GET",
    url: `/internal/kyc1/checklist-items/${checklistItemId}/sensitive-detail?actor_id=${encodeURIComponent(actorId)}`,
    headers: internalHeaders,
  });
}

async function rosterSync(applicationId: string) {
  return app.inject({ method: "POST", url: `/internal/kyc1/applications/${applicationId}/roster-sync`, headers: internalHeaders, payload: {} });
}

async function requestOverride(caseId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/outcome-override/request`, headers: internalHeaders, payload: body });
}

async function applyOverride(caseId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/kyc1/cases/${caseId}/outcome-override/apply`, headers: internalHeaders, payload: body });
}

/** Full happy-path: create an individual case, satisfy its baseline checklist, record an identity
 * pass, and compute the outcome — returns everything a test might need. */
async function createAndPassIndividualCase(applicationId = freshApplicationId()) {
  const createRes = await createHandoff({ application_id: applicationId, case_type: "individual" });
  const created = createRes.json().data;
  await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
  await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
  const checklist = (await getChecklist(created.case_id)).json().data.checklist as Array<{ checklist_item_id: string; document_type: string }>;
  const item = checklist.find((c) => c.document_type === "identity_document")!;
  await addVerificationResult(created.case_id, {
    source_type: "manual",
    source_id: "staff_1",
    result_type: "document",
    result_status: "pass",
    checklist_item_id: item.checklist_item_id,
  });
  const outcomeRes = await computeOutcome(created.case_id);
  return { caseId: created.case_id, applicationId, outcomeRes };
}

/** Companion to createAndPassIndividualCase — same shape, but the identity verification result is
 * a genuine 'fail', so compute-outcome resolves to 'fail'. The manual verifier is `staff_1` (same
 * as the passing helper) — tests that need a NON-self-blocked override requester should use a
 * DIFFERENT `requested_by` (e.g. "compliance_officer_1"); dedicated self-override tests use
 * "staff_1" explicitly. */
async function createAndFailIndividualCase(applicationId = freshApplicationId()) {
  const createRes = await createHandoff({ application_id: applicationId, case_type: "individual" });
  const created = createRes.json().data;
  await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
  await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
  const outcomeRes = await computeOutcome(created.case_id);
  return { caseId: created.case_id, applicationId, outcomeRes };
}

/** Registry-only case — every verification result is `source_type='registry'`, so no manual
 * verifier `source_id` exists on the case at all. Used to prove the self-override check is
 * vacuous here (KYC1_SELF_OVERRIDE_BLOCKED's own documented, accepted limitation). */
async function createAndFailRegistryOnlyEntityCase(applicationId = freshApplicationId()) {
  const createRes = await createHandoff({ application_id: applicationId, case_type: "entity" });
  const created = createRes.json().data;
  await addVerificationResult(created.case_id, { source_type: "registry", source_id: "registry_feed_1", result_type: "entity", result_status: "fail" });
  const outcomeRes = await computeOutcome(created.case_id);
  return { caseId: created.case_id, applicationId, outcomeRes };
}

/** Phase 4B helper: creates an authorised_party case for the given party_id, satisfies BOTH
 * required checklist items (identity_document + authority_evidence), records a genuine pass. */
async function createAndPassAuthorisedPartyCase(applicationId: string, partyId: string) {
  const created = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: partyId })).json().data;
  for (const dt of ["identity_document", "authority_evidence"]) await addEvidence(created.case_id, { document_type: dt, evidence_ref: `dms://${partyId}-${dt}` });
  const checklist = (await getChecklist(created.case_id)).json().data.checklist as Array<{ checklist_item_id: string; document_type: string }>;
  for (const dt of ["identity_document", "authority_evidence"]) {
    const item = checklist.find((c) => c.document_type === dt)!;
    await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id });
  }
  await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
  const outcomeRes = await computeOutcome(created.case_id);
  return { caseId: created.case_id, applicationId, partyId, outcomeRes };
}

describe("KYC-01 Phase 1 integration", () => {
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
    await verifyPool.query(`GRANT role_kyc1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
    // Phase 4B: publish AND deliver now always fetch the CLT-01 roster first, so every test that
    // calls either — even ones that predate Phase 4B and never touched CLT-01's stub directly —
    // needs a working default. Individual tests still override this immediately before their own
    // assertion when they need a specific CLT-01 behaviour.
    config.clt1FetchImpl = realisticCltFetch();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  afterEach(async () => {
    if (!schemaReady) return;
    // FK-safe order: children before parent. outcome_publication has no FK to kyc_case (it
    // references cases only via opaque contributing_case_ids jsonb), so its position relative to
    // kyc_case is not FK-load-bearing, but it is cleared every run regardless for the same
    // hardcoded-literal-id reuse reason the other tables already are.
    await verifyPool.query(`DELETE FROM kyc1.outcome_publication`);
    await verifyPool.query(`DELETE FROM kyc1.manual_override_request`);
    await verifyPool.query(`DELETE FROM kyc1.cdd_outcome`);
    await verifyPool.query(`DELETE FROM kyc1.verification_result`);
    await verifyPool.query(`DELETE FROM kyc1.document_checklist_item`);
    await verifyPool.query(`DELETE FROM kyc1.kyc_case`);
    // Reset the CLT-01 stub to the working default so a test that intentionally leaves it in a
    // broken/failing state (network-down, malformed, etc.) can never leak into the next test.
    config.clt1FetchImpl = realisticCltFetch();
  });

  // -----------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_kyc1_runtime", () => {
    it("app builds successfully under the least-privilege runtime role (assertNoExchangeRuntime passed)", () => {
      if (!schemaReady) return;
      expect(app).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("readiness", () => {
    it("GET /internal/kyc1/readiness returns 200/ready once kyc1 tables exist", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/kyc1/readiness" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ready");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("migrations 042+043 — schema", () => {
    it("kyc1 schema and all six tables exist (four Phase 1 + Phase 2A's outcome_publication + Phase 3B's manual_override_request)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'kyc1' ORDER BY table_name`,
      );
      expect(rows.rows.map((r) => r.table_name)).toEqual(["cdd_outcome", "document_checklist_item", "kyc_case", "manual_override_request", "outcome_publication", "verification_result"]);
    });

    it("migrations 042-048 exist (048 is KYC-01's own current head) — 047 is CLT-01's own Phase 4A.1 migration, not KYC-01's; 049 is WLT-01's own Phase 1B migration, not KYC-01's", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const migrationsDir = path.join(__dirname, "..", "..", "infra", "migrations");
      const files = fs.readdirSync(migrationsDir);
      expect(files.some((f) => f.startsWith("042_"))).toBe(true);
      expect(files.some((f) => f.startsWith("043_"))).toBe(true);
      expect(files.some((f) => f.startsWith("044_"))).toBe(true);
      expect(files.some((f) => f.startsWith("045_"))).toBe(true);
      expect(files.some((f) => f.startsWith("046_"))).toBe(true);
      expect(files.some((f) => f.startsWith("047_clt1_atomic_kyc_roster_binding"))).toBe(true);
      expect(files.some((f) => f.startsWith("048_kyc1_publication_roster_binding"))).toBe(true);
      // 049_wlt1_core is WLT-01's own Phase 1B migration — a later, unrelated module claiming the
      // next free number, exactly as 047 was CLT-01's own. KYC-01's own migration set remains
      // exactly 042-046 + 048, untouched by it.
      expect(files.some((f) => f.startsWith("049_wlt1_core"))).toBe(true);
    });

    it("partial unique index prevents two ACTIVE cases for the same (application_id, case_type, party_id) anchor", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("idx_test");
      await verifyPool.query(
        `INSERT INTO kyc1.kyc_case (case_id, application_id, case_type) VALUES ('kyc1case_idx_1',$1,'individual')`,
        [applicationId],
      );
      await expect(
        verifyPool.query(`INSERT INTO kyc1.kyc_case (case_id, application_id, case_type) VALUES ('kyc1case_idx_2',$1,'individual')`, [applicationId]),
      ).rejects.toMatchObject({ code: "23505" });
      // A COMPLETED case for the same anchor is unaffected by the partial index.
      await verifyPool.query(`UPDATE kyc1.kyc_case SET status = 'completed' WHERE case_id = 'kyc1case_idx_1'`);
      await expect(
        verifyPool.query(`INSERT INTO kyc1.kyc_case (case_id, application_id, case_type, status) VALUES ('kyc1case_idx_3',$1,'individual','completed')`, [
          applicationId,
        ]),
      ).resolves.toBeDefined();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — role_kyc1_runtime least-privilege matrix", () => {
    it("role_kyc1_runtime has SELECT/INSERT and column-scoped UPDATE on kyc_case, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='kyc_case' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='kyc_case' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["current_outcome_id", "current_outcome_status", "status", "updated_at_utc"]);
    });

    it("role_kyc1_runtime cannot UPDATE kyc_case.case_id/application_id/case_type/created_at_utc", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("grant_test");
      await verifyPool.query(`INSERT INTO kyc1.kyc_case (case_id, application_id, case_type) VALUES ('kyc1case_grant_test',$1,'individual')`, [applicationId]);
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE kyc1.kyc_case SET application_id = 'hacked' WHERE case_id = 'kyc1case_grant_test'`)).rejects.toMatchObject({
        code: "42501",
      });
      await expect(appPool.query(`UPDATE kyc1.kyc_case SET case_type = 'entity' WHERE case_id = 'kyc1case_grant_test'`)).rejects.toMatchObject({
        code: "42501",
      });
      await appPool.end();
      await verifyPool.query(`DELETE FROM kyc1.kyc_case WHERE case_id = 'kyc1case_grant_test'`);
    });

    it("role_kyc1_runtime has SELECT/INSERT and column-scoped UPDATE on document_checklist_item, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='document_checklist_item' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='document_checklist_item' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["evidence_hash", "evidence_ref", "expiry_date", "status", "updated_at_utc", "verification_result_id"]);
    });

    it("role_kyc1_runtime has NO UPDATE grant on verification_result or cdd_outcome (both immutable after insert)", async () => {
      if (!schemaReady) return;
      for (const table of ["verification_result", "cdd_outcome"]) {
        const privs = await verifyPool.query(
          `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name=$1 AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
          [table],
        );
        const types = privs.rows.map((r) => r.privilege_type);
        expect(types).toContain("SELECT");
        expect(types).toContain("INSERT");
        expect(types).not.toContain("UPDATE");
        expect(types).not.toContain("DELETE");
        expect(types).not.toContain("TRUNCATE");
      }
    });

    it("no DELETE grant on any kyc1 table for role_kyc1_runtime (structural — DELETE FROM under the runtime role fails)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      for (const table of ["kyc_case", "document_checklist_item", "verification_result", "cdd_outcome"]) {
        await expect(appPool.query(`DELETE FROM kyc1.${table}`)).rejects.toMatchObject({ code: "42501" });
      }
      await appPool.end();
    });

    it("role_kyc1_runtime's only cross-schema grant is foundation.outbox_event INSERT-only — no iam2/clt1/aml1/cfg1/sec1/iam grant", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_schema, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' AND table_schema <> 'kyc1' ORDER BY 1,2,3`,
      );
      expect(rows.rows).toEqual([{ table_schema: "foundation", table_name: "outbox_event", privilege_type: "INSERT" }]);
    });

    it("no foundation.idempotency_record grant", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT 1 FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' AND table_schema='foundation' AND table_name='idempotency_record'`,
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("Phase 3B: exactly TWO IAM-02 permissions are registered for kyc1.* (kyc1.evidence.sensitive_read + kyc1.outcome.override) and zero role_permission seed", async () => {
      if (!schemaReady) return;
      const iam2SchemaRows = await verifyPool.query(`SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2'`);
      if (Number(iam2SchemaRows.rows[0].count) === 0) return; // iam2 not migrated in this DB — nothing to assert against
      const permRows = await verifyPool.query(`SELECT permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module FROM iam2.permission WHERE permission_code LIKE 'kyc1.%' ORDER BY permission_code`);
      expect(permRows.rows).toEqual([
        {
          permission_id: "perm_kyc1_evidence_sensitive_read",
          permission_code: "kyc1.evidence.sensitive_read",
          resource: "document_checklist_item",
          action: "sensitive_read",
          sensitivity: "sensitive",
          licence_locked: false,
          prohibited: false,
          requires_step_up: false,
          requires_approval: false,
          status: "active",
          owner_module: "KYC-01",
        },
        {
          permission_id: "perm_kyc1_outcome_override",
          permission_code: "kyc1.outcome.override",
          resource: "cdd_outcome",
          action: "override",
          sensitivity: "sensitive",
          licence_locked: false,
          prohibited: false,
          requires_step_up: false,
          requires_approval: true,
          status: "active",
          owner_module: "KYC-01",
        },
      ]);
      const rolePermRows = await verifyPool.query(
        `SELECT count(*) FROM iam2.role_permission rp JOIN iam2.permission p ON p.permission_id = rp.permission_id WHERE p.permission_code LIKE 'kyc1.%'`,
      );
      expect(Number(rolePermRows.rows[0].count)).toBe(0);
    });

    it("role_kyc1_runtime has SELECT/INSERT and column-scoped UPDATE on manual_override_request, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='manual_override_request' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='manual_override_request' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["applied_at_utc", "applied_outcome_id", "approval_id", "decision_token_hash", "status"]);
    });

    it("role_kyc1_runtime cannot UPDATE manual_override_request.override_id/case_id/target_outcome_status/reason_code/requested_by/payload_hash/approved_against_outcome_id/approved_against_outcome_status (MED-3 fix: the last two are the approval-binding snapshot itself)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_grant_test");
      await verifyPool.query(`INSERT INTO kyc1.kyc_case (case_id, application_id, case_type, current_outcome_status, current_outcome_id) VALUES ('kyc1case_ovr_grant_test',$1,'individual','fail','kyc1outcome_ovr_grant_test')`, [applicationId]);
      await verifyPool.query(
        `INSERT INTO kyc1.cdd_outcome (outcome_id, case_id, outcome_status, outcome_reason, verification_scope, evidence_refs, outcome_version, payload_hash)
         VALUES ('kyc1outcome_ovr_grant_test','kyc1case_ovr_grant_test','fail','identity_verification_failed','{}','{}',1,'sha256:o')`,
      );
      await verifyPool.query(
        `INSERT INTO kyc1.manual_override_request (override_id, case_id, target_type, target_outcome_status, reason_code, approved_against_outcome_id, approved_against_outcome_status, requested_by, status, payload_hash)
         VALUES ('kyc1ovr_grant_test','kyc1case_ovr_grant_test','cdd_outcome','pass','manual_evidence_review','kyc1outcome_ovr_grant_test','fail','staff_1','requested','sha256:x')`,
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET case_id = 'hacked' WHERE override_id = 'kyc1ovr_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET target_outcome_status = 'fail' WHERE override_id = 'kyc1ovr_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET payload_hash = 'hacked' WHERE override_id = 'kyc1ovr_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET approved_against_outcome_id = 'hacked' WHERE override_id = 'kyc1ovr_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET approved_against_outcome_status = 'pass' WHERE override_id = 'kyc1ovr_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
      await verifyPool.query(`DELETE FROM kyc1.manual_override_request WHERE override_id = 'kyc1ovr_grant_test'`);
      await verifyPool.query(`DELETE FROM kyc1.cdd_outcome WHERE outcome_id = 'kyc1outcome_ovr_grant_test'`);
      await verifyPool.query(`DELETE FROM kyc1.kyc_case WHERE case_id = 'kyc1case_ovr_grant_test'`);
    });

    it("role_kyc1_runtime still has NO UPDATE grant on cdd_outcome or verification_result — Phase 3B's override apply route INSERTs, never UPDATEs", async () => {
      if (!schemaReady) return;
      for (const table of ["cdd_outcome", "verification_result"]) {
        const privs = await verifyPool.query(
          `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name=$1 AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
          [table],
        );
        expect(privs.rows.map((r) => r.privilege_type)).not.toContain("UPDATE");
      }
    });

    it("no DELETE grant on manual_override_request for role_kyc1_runtime (structural)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`DELETE FROM kyc1.manual_override_request`)).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/handoffs — case creation", () => {
    it("creates a case and its deterministic default checklist", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId();
      const res = await createHandoff({ application_id: applicationId, case_type: "entity" });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.application_id).toBe(applicationId);
      expect(body.case_type).toBe("entity");
      expect(body.status).toBe("pending_documents");
      expect(body.checklist).toHaveLength(2);
      expect(body.checklist.map((c: { document_type: string }) => c.document_type).sort()).toEqual([
        "authorised_representative_evidence",
        "certificate_of_incorporation",
      ]);
      for (const item of body.checklist) {
        expect(item.status).toBe("missing");
        expect(item.required).toBe(true);
      }
    });

    it("individual case gets exactly the identity_document baseline item", async () => {
      if (!schemaReady) return;
      const res = await createHandoff({ case_type: "individual" });
      const body = res.json().data;
      expect(body.checklist).toHaveLength(1);
      expect(body.checklist[0].document_type).toBe("identity_document");
    });

    it("authorised_party case requires party_id", async () => {
      if (!schemaReady) return;
      const res = await createHandoff({ case_type: "authorised_party" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("authorised_party case with party_id succeeds and gets identity_document + authority_evidence", async () => {
      if (!schemaReady) return;
      const res = await createHandoff({ case_type: "authorised_party", party_id: "clt1party_1" });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.party_id).toBe("clt1party_1");
      expect(body.checklist.map((c: { document_type: string }) => c.document_type).sort()).toEqual(["authority_evidence", "identity_document"]);
    });

    it("duplicate handoff for the same (application_id, case_type) while a case is still active is rejected", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId();
      const first = await createHandoff({ application_id: applicationId, case_type: "individual" });
      expect(first.statusCode).toBe(201);
      const second = await createHandoff({ application_id: applicationId, case_type: "individual" });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("KYC1_CASE_ALREADY_EXISTS");
    });

    it("a NEW handoff for the same anchor is allowed once the prior case is completed", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId();
      const { caseId } = await createAndPassIndividualCase(applicationId);
      const statusRow = (await getCase(caseId)).json().data;
      expect(statusRow.status).toBe("completed");
      const second = await createHandoff({ application_id: applicationId, case_type: "individual" });
      expect(second.statusCode).toBe(201);
    });

    it("stores created_from_handoff_id when supplied, opaque and unverified", async () => {
      if (!schemaReady) return;
      const res = await createHandoff({ created_from_handoff_id: "clt1handoff_abc" });
      expect(res.json().data.created_from_handoff_id).toBe("clt1handoff_abc");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/cases/:case_id — safe projection", () => {
    it("returns exactly the safe field set — no unexpected additions", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff()).json().data;
      const res = await getCase(created.case_id);
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json().data).sort()).toEqual(
        [
          "case_id",
          "application_id",
          "client_id",
          "party_id",
          "case_type",
          "status",
          "current_outcome_status",
          "current_outcome_id",
          "created_from_handoff_id",
          "created_at_utc",
          "updated_at_utc",
        ].sort(),
      );
    });

    it("unknown case_id returns KYC1_CASE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await getCase("kyc1case_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CASE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/cases — bounded list", () => {
    it("filters by application_id", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId();
      const created = (await createHandoff({ application_id: applicationId })).json().data;
      const res = await listCases(`application_id=${applicationId}`);
      expect(res.statusCode).toBe(200);
      const cases = res.json().data.cases;
      expect(cases).toHaveLength(1);
      expect(cases[0].case_id).toBe(created.case_id);
    });

    it("filters by client_id", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_" + Date.now();
      await createHandoff({ client_id: clientId });
      const res = await listCases(`client_id=${clientId}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.cases.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects a request with neither application_id nor client_id — no global unbounded dump", async () => {
      if (!schemaReady) return;
      const res = await listCases("");
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/cases/:case_id/evidence", () => {
    it("adds an evidence reference and moves the matching baseline checklist item to 'received' (Phase 3A: the response no longer echoes evidence_ref/evidence_hash — narrowed alongside the checklist route, D3)", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1", evidence_hash: "sha256:abc" });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.status).toBe("received");
      expect(body.evidence_ref).toBeUndefined();
      expect(body.evidence_hash).toBeUndefined();
      // The write itself is unaffected by the narrowed response — verify directly against the DB.
      const stored = await verifyPool.query(`SELECT evidence_ref, evidence_hash FROM kyc1.document_checklist_item WHERE checklist_item_id = $1`, [body.checklist_item_id]);
      expect(stored.rows[0]).toEqual({ evidence_ref: "dms://ref-1", evidence_hash: "sha256:abc" });
    });

    it("adding evidence for a document_type outside the baseline creates a new, non-required checklist item", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addEvidence(created.case_id, { document_type: "proof_of_address", evidence_ref: "dms://ref-2" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.required).toBe(false);
      expect(res.json().data.status).toBe("received");
    });

    it("raw document content (data: URI) is rejected, never stored", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "data:image/png;base64,iVBORw0KGgo=" });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_EVIDENCE_INVALID");
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      const item = checklist.find((c: { document_type: string }) => c.document_type === "identity_document");
      expect(item.status).toBe("missing");
      // Phase 3A: the checklist route no longer returns evidence_ref at all — verify "never
      // stored" directly against the DB instead.
      const stored = await verifyPool.query(`SELECT evidence_ref FROM kyc1.document_checklist_item WHERE checklist_item_id = $1`, [item.checklist_item_id]);
      expect(stored.rows[0].evidence_ref).toBeNull();
    });

    it("raw base64-blob content is rejected, never stored", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const blob = Buffer.from("x".repeat(155)).toString("base64");
      const res = await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: blob });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_EVIDENCE_INVALID");
    });

    it("unknown case_id returns KYC1_CASE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await addEvidence("kyc1case_does_not_exist", { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CASE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/cases/:case_id/checklist — safe projection", () => {
    it("returns exactly the safe field set, no PII, no raw document content", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await getChecklist(created.case_id);
      expect(res.statusCode).toBe(200);
      const item = res.json().data.checklist[0];
      expect(Object.keys(item).sort()).toEqual(
        [
          "checklist_item_id",
          "case_id",
          "document_type",
          "required",
          "status",
          "expiry_date",
          "verification_result_id",
          "created_at_utc",
          "updated_at_utc",
        ].sort(),
      );
    });

    it("Phase 3A (D3): does NOT return evidence_ref or evidence_hash — both are now sensitive-gated, reachable only via GET .../sensitive-detail", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1", evidence_hash: "sha256:abc" });
      const res = await getChecklist(created.case_id);
      const item = res.json().data.checklist.find((c: { document_type: string }) => c.document_type === "identity_document");
      expect(item.evidence_ref).toBeUndefined();
      expect(item.evidence_hash).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/cases/:case_id/verification-results", () => {
    it("records a manual identity verification result", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.source_type).toBe("manual");
      expect(res.json().data.result_type).toBe("identity");
      expect(res.json().data.result_status).toBe("pass");
    });

    it("records a registry entity verification result", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "entity" })).json().data;
      const res = await addVerificationResult(created.case_id, { source_type: "registry", source_id: "staff_2", result_type: "entity", result_status: "pass" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.source_type).toBe("registry");
    });

    it("rejects source_type='vendor' at the schema level (never reaches application code)", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addVerificationResult(created.case_id, { source_type: "vendor", source_id: "vendor_1", result_type: "identity", result_status: "pass" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects result_type='entity' on an individual case", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "entity", result_status: "pass" });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_VERIFICATION_RESULT_INVALID");
    });

    it("rejects result_type='identity' on an entity case", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "entity" })).json().data;
      const res = await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_VERIFICATION_RESULT_INVALID");
    });

    it("result_type='document' requires a checklist_item_id belonging to the case, and updates its status", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const missingItemIdRes = await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass" });
      expect(missingItemIdRes.statusCode).toBe(422);

      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      const item = checklist[0];
      const res = await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: item.checklist_item_id,
      });
      expect(res.statusCode).toBe(201);
      const updatedChecklist = (await getChecklist(created.case_id)).json().data.checklist;
      expect(updatedChecklist[0].status).toBe("verified");
      expect(updatedChecklist[0].verification_result_id).toBe(res.json().data.verification_result_id);
    });

    it("result_type='document' with result_status='fail' rejects the checklist item", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "fail",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      const updated = (await getChecklist(created.case_id)).json().data.checklist;
      expect(updated[0].status).toBe("rejected");
    });

    it("checklist_item_id from a DIFFERENT case is rejected as KYC1_CHECKLIST_ITEM_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const caseA = (await createHandoff({ case_type: "individual" })).json().data;
      const caseB = (await createHandoff({ case_type: "individual" })).json().data;
      const checklistB = (await getChecklist(caseB.case_id)).json().data.checklist;
      const res = await addVerificationResult(caseA.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: checklistB[0].checklist_item_id,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CHECKLIST_ITEM_NOT_FOUND");
    });

    it("checklist_item_id supplied with a non-'document' result_type is rejected", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      const res = await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "identity",
        result_status: "pass",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_VERIFICATION_RESULT_INVALID");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/cases/:case_id/compute-outcome — deterministic engine", () => {
    it("pass — required checklist verified + identity pass", async () => {
      if (!schemaReady) return;
      const { outcomeRes } = await createAndPassIndividualCase();
      expect(outcomeRes.statusCode).toBe(201);
      expect(outcomeRes.json().data.outcome_status).toBe("pass");
      expect(outcomeRes.json().data.outcome_reason).toBe("all_required_checks_passed");
      expect(outcomeRes.json().data.outcome_version).toBe(1);
    });

    it("fail — identity verification failed", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
      const res = await computeOutcome(created.case_id);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.outcome_status).toBe("fail");
      expect(res.json().data.outcome_reason).toBe("identity_verification_failed");
    });

    it("remediation_required — nothing submitted yet", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await computeOutcome(created.case_id);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.outcome_status).toBe("remediation_required");
    });

    it("case.status moves to 'completed' on pass/fail and 'remediation' on remediation_required", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndPassIndividualCase();
      expect((await getCase(caseId)).json().data.status).toBe("completed");

      const remediationCase = (await createHandoff({ case_type: "individual" })).json().data;
      await computeOutcome(remediationCase.case_id);
      expect((await getCase(remediationCase.case_id)).json().data.status).toBe("remediation");
    });

    it("recomputing a PASSED case is blocked with KYC1_CASE_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndPassIndividualCase();
      const res = await computeOutcome(caseId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("recomputing a remediation_required case is allowed and produces a NEW append-versioned outcome once evidence completes", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const first = await computeOutcome(created.case_id);
      expect(first.json().data.outcome_status).toBe("remediation_required");
      expect(first.json().data.outcome_version).toBe(1);

      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });

      const second = await computeOutcome(created.case_id);
      expect(second.statusCode).toBe(201);
      expect(second.json().data.outcome_status).toBe("pass");
      expect(second.json().data.outcome_version).toBe(2);
    });

    it("never returns/persists outcome_status='pending'", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await computeOutcome(created.case_id);
      expect(["pass", "fail", "remediation_required"]).toContain(res.json().data.outcome_status);
      const dbRows = await verifyPool.query(`SELECT outcome_status FROM kyc1.cdd_outcome WHERE case_id = $1`, [created.case_id]);
      for (const row of dbRows.rows) expect(row.outcome_status).not.toBe("pending");
    });

    it("unknown case_id returns KYC1_CASE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await computeOutcome("kyc1case_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CASE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  // MED-1 fix — deterministic tie-break when concurrent verification_result rows share the same
  // received_at_utc (independent Opus review finding on Phase 0+1). Real HTTP calls even 1ms apart
  // never tie (Postgres `now()` + Node's own event-loop scheduling separate them), so a genuine tie
  // is seeded directly via SQL (superuser `verifyPool`) — the only way to deterministically
  // reproduce the exact race condition the fix addresses, mirroring how other race-condition tests
  // in this codebase (e.g. AML-01's own TX2-guard tests) seed contended state directly rather than
  // relying on real-clock timing.
  // -----------------------------------------------------------------------------------------
  describe("compute-outcome — MED-1 deterministic tie-break under a shared received_at_utc", () => {
    /** Inserts two verification_result rows for the same case/result_type sharing an IDENTICAL
     * received_at_utc, with caller-controlled IDs (so the test can assert exactly which one the
     * DESC tie-break must select). */
    async function seedTiedVerificationResults(
      caseId: string,
      rows: Array<{ verificationResultId: string; resultStatus: "pass" | "fail" }>,
    ): Promise<void> {
      const tiedAt = new Date().toISOString();
      for (const row of rows) {
        await verifyPool.query(
          `INSERT INTO kyc1.verification_result
             (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
           VALUES ($1,$2,'manual','staff_1','identity',$3,'seedhash',$4)`,
          [row.verificationResultId, caseId, row.resultStatus, tiedAt],
        );
      }
    }

    it("tied timestamps: the row with the LEXICOGRAPHICALLY HIGHER verification_result_id wins, deterministically", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      // "kyc1vr_zzzz" > "kyc1vr_aaaa" lexicographically -> the pass row must win the tie.
      await seedTiedVerificationResults(created.case_id, [
        { verificationResultId: "kyc1vr_aaaa", resultStatus: "fail" },
        { verificationResultId: "kyc1vr_zzzz", resultStatus: "pass" },
      ]);

      const res = await computeOutcome(created.case_id);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.outcome_status).toBe("pass");
    });

    it("swapping which row has the higher ID swaps the winner — the SAME tied data, opposite ID assignment, opposite (still deterministic) outcome", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      // Now the FAIL row has the higher ID -> fail must win.
      await seedTiedVerificationResults(created.case_id, [
        { verificationResultId: "kyc1vr_aaaa", resultStatus: "pass" },
        { verificationResultId: "kyc1vr_zzzz", resultStatus: "fail" },
      ]);

      const res = await computeOutcome(created.case_id);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.outcome_status).toBe("fail");
      expect(res.json().data.outcome_reason).toBe("identity_verification_failed");
    });

    it("recomputing over the SAME tied rows (case still in remediation/fail, not yet passed) produces the IDENTICAL outcome every time — determinism holds across repeated computation, not just once", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await seedTiedVerificationResults(created.case_id, [
        { verificationResultId: "kyc1vr_aaaa", resultStatus: "pass" },
        { verificationResultId: "kyc1vr_zzzz", resultStatus: "fail" },
      ]);

      const first = await computeOutcome(created.case_id);
      expect(first.json().data.outcome_status).toBe("fail");

      const second = await computeOutcome(created.case_id);
      expect(second.statusCode).toBe(201);
      expect(second.json().data.outcome_status).toBe("fail");
      expect(second.json().data.outcome_reason).toBe(first.json().data.outcome_reason);
      expect(second.json().data.outcome_version).toBe(2);
    });

    it("a correctly-resolved pass (via the deterministic tie-break) is durably sticky — no longer an ARBITRARY wrong result locked in by unspecified ordering", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      await seedTiedVerificationResults(created.case_id, [
        { verificationResultId: "kyc1vr_aaaa", resultStatus: "fail" },
        { verificationResultId: "kyc1vr_zzzz", resultStatus: "pass" },
      ]);

      const computed = await computeOutcome(created.case_id);
      expect(computed.json().data.outcome_status).toBe("pass");

      // The sticky value is the CORRECT, deterministically-computed one — confirmed via the case
      // read and via a rejected recompute attempt (still the correct guard from Phase 1, untouched
      // by this patch).
      expect((await getCase(created.case_id)).json().data.current_outcome_status).toBe("pass");
      const recompute = await computeOutcome(created.case_id);
      expect(recompute.statusCode).toBe(409);
      expect(recompute.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("SQL retrieval order for verification_result is received_at_utc DESC, verification_result_id DESC", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await seedTiedVerificationResults(created.case_id, [
        { verificationResultId: "kyc1vr_aaaa", resultStatus: "pass" },
        { verificationResultId: "kyc1vr_zzzz", resultStatus: "fail" },
      ]);
      const rows = await verifyPool.query(
        `SELECT verification_result_id, received_at_utc FROM kyc1.verification_result WHERE case_id = $1 ORDER BY received_at_utc DESC, verification_result_id DESC`,
        [created.case_id],
      );
      expect(rows.rows.map((r) => r.verification_result_id)).toEqual(["kyc1vr_zzzz", "kyc1vr_aaaa"]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/cases/:case_id/outcome — safe projection", () => {
    it("returns exactly the safe field set — no PII, no raw evidence, no AML result, no CLT-01 delivery status", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndPassIndividualCase();
      const res = await getOutcome(caseId);
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json().data).sort()).toEqual(
        ["outcome_id", "case_id", "outcome_status", "outcome_reason", "verification_scope", "evidence_refs", "outcome_version", "created_at_utc"].sort(),
      );
    });

    it("returns KYC1_OUTCOME_NOT_FOUND / 404 before compute-outcome has ever run", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await getOutcome(created.case_id);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_FOUND");
    });

    it("returns the LATEST outcome version, not the first", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await computeOutcome(created.case_id); // version 1, remediation_required
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: checklist[0].checklist_item_id,
      });
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      await computeOutcome(created.case_id); // version 2, pass
      const res = await getOutcome(created.case_id);
      expect(res.json().data.outcome_version).toBe(2);
      expect(res.json().data.outcome_status).toBe("pass");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("audit / PII sweep", () => {
    it("kyc1.handoff_received and kyc1.case_created events are published, carrying no PII/free text", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("audit_sweep");
      await createHandoff({ application_id: applicationId, case_type: "individual" });
      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type IN ('kyc1.handoff_received','kyc1.case_created') AND payload_ref LIKE $1 ORDER BY created_at_utc`,
        [`%${applicationId}%`],
      );
      expect(events.rows.length).toBeGreaterThanOrEqual(2);
    });

    it("full lifecycle (handoff -> evidence -> verification -> outcome) emits every documented event type, no PII/free-text/raw-evidence-content in any payload", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("audit_full");
      const { caseId, outcomeRes } = await createAndPassIndividualCase(applicationId);
      expect(outcomeRes.statusCode).toBe(201);

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event
           WHERE payload_ref LIKE $1
           ORDER BY created_at_utc`,
        [`%${caseId}%`],
      );
      const eventTypes = events.rows.map((r) => r.event_type);
      for (const expected of [
        "kyc1.case_created",
        "kyc1.document_reference_added",
        "kyc1.document_verified",
        "kyc1.identity_verified",
        "kyc1.outcome_computed",
      ]) {
        expect(eventTypes, `expected ${expected} among ${JSON.stringify(eventTypes)}`).toContain(expected);
      }

      // "reason_code" is a legitimate, closed-enum, engine-generated field (e.g.
      // "all_required_checks_passed") present in every audit envelope by design — swept for its
      // VALUE being one of the closed set below, not banned by substring (the envelope's own
      // "reason_code" key name would otherwise false-positive a naive "reason" substring check).
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["data:image", "base64", "iVBORw0KGgo", "free_text", "notes"]) {
        expect(serialized.includes(forbidden), `audit payload must not contain "${forbidden}"`).toBe(false);
      }
      const outcomeEvent = events.rows.find((r) => r.event_type === "kyc1.outcome_computed");
      expect(outcomeEvent).toBeDefined();
      const parsed = JSON.parse(outcomeEvent!.payload_ref);
      expect(["identity_verification_failed", "entity_verification_failed", "required_document_invalid_or_expired", "all_required_checks_passed", "required_evidence_incomplete"]).toContain(
        parsed.reason_code,
      );
    });

    it("no deferred-phase event type is ever emitted (outcome_published/manual_review_*/ubo_*/edd_*/vendor_*) — the ORDINARY lifecycle itself never emits kyc1.sensitive_evidence_read", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("audit_deferred");
      const { caseId } = await createAndPassIndividualCase(applicationId);
      // Scoped to THIS lifecycle's own events only. Phase 3A: kyc1.sensitive_evidence_read is no
      // longer a deferred-phase event globally (it is genuinely reachable via the sensitive-detail
      // route, covered by its own describe block below) — a global, unscoped sweep of the whole
      // outbox table would false-positive once that route has been exercised anywhere else in this
      // file's shared database. What THIS test still proves is narrower and still real: the
      // ORDINARY handoff->evidence->verification->outcome lifecycle never emits it on its own.
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%' AND payload_ref LIKE $1`, [`%${caseId}%`]);
      const eventTypes = events.rows.map((r) => r.event_type);
      for (const forbidden of [
        "kyc1.outcome_published",
        "kyc1.manual_review_requested",
        "kyc1.manual_review_decisioned",
        "kyc1.sensitive_evidence_read",
      ]) {
        expect(eventTypes).not.toContain(forbidden);
      }
      expect(eventTypes.some((t) => t.startsWith("kyc1.ubo"))).toBe(false);
      expect(eventTypes.some((t) => t.startsWith("kyc1.edd"))).toBe(false);
      expect(eventTypes.some((t) => t.startsWith("kyc1.vendor"))).toBe(false);
      expect(eventTypes.some((t) => t.startsWith("kyc1.proofing"))).toBe(false);
      expect(eventTypes.some((t) => t.startsWith("kyc1.reconciliation"))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("regression — route surface", () => {
    it("total KYC-01 route count is 17 (1 Phase 0 + 9 Phase 1 + 2 Phase 2A + 1 Phase 2B + 1 Phase 3A + 2 Phase 3B + 1 Phase 4A.2B)", () => {
      if (!schemaReady) return;
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const routeCount = routePaths.filter((l) => /\(.*\)$/.test(l)).length;
      expect(routeCount).toBe(17);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2A — application-level authoritative-outcome publication (approved Phase 2 planning
  // report). No CLT-01 HTTP call anywhere in this describe block — Phase 2B's own concern.
  // -----------------------------------------------------------------------------------------
  describe("kyc1.outcome_publication — grants (Phase 2A)", () => {
    it("role_kyc1_runtime has SELECT/INSERT and column-scoped UPDATE on outcome_publication, no DELETE/TRUNCATE", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='outcome_publication' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
      );
      const types = privs.rows.map((r) => r.privilege_type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
      expect(types).not.toContain("DELETE");
      expect(types).not.toContain("TRUNCATE");

      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='outcome_publication' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["attempt_count", "delivered_at_utc", "failure_reason_code", "response_ref", "status", "version"]);
    });

    it("role_kyc1_runtime cannot UPDATE outcome_publication.publication_id/application_id/aggregate_status/payload_hash", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_grant_test");
      await verifyPool.query(
        `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
         VALUES ('kyc1pub_grant_test',$1,'pass','[]','[]','seedhash','staff_1')`,
        [applicationId],
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE kyc1.outcome_publication SET application_id = 'hacked' WHERE publication_id = 'kyc1pub_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.outcome_publication SET aggregate_status = 'fail' WHERE publication_id = 'kyc1pub_grant_test'`)).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.outcome_publication SET payload_hash = 'hacked' WHERE publication_id = 'kyc1pub_grant_test'`)).rejects.toMatchObject({ code: "42501" });
    });

    it("no DELETE grant on outcome_publication for role_kyc1_runtime (structural)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`DELETE FROM kyc1.outcome_publication WHERE 1=0`)).rejects.toMatchObject({ code: "42501" });
    });

    it("cross-schema grant footprint unchanged — still only foundation.outbox_event INSERT", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_schema, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' AND table_schema <> 'kyc1' ORDER BY 1,2,3`,
      );
      expect(rows.rows).toEqual([{ table_schema: "foundation", table_name: "outbox_event", privilege_type: "INSERT" }]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/applications/:application_id/publish-outcome", () => {
    async function publishOutcome(applicationId: string, requestedBy = "staff_1") {
      return app.inject({
        method: "POST",
        url: `/internal/kyc1/applications/${applicationId}/publish-outcome`,
        headers: internalHeaders,
        payload: { requested_by: requestedBy },
      });
    }

    it("requires the internal-service-token (401 without it)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/internal/kyc1/applications/clt1app_x/publish-outcome", payload: { requested_by: "staff_1" } });
      expect(res.statusCode).toBe(401);
    });

    it("no KYC-01 case ever created for the application -> KYC1_OUTCOME_NOT_PUBLISHABLE / 422, no publication row", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_none");
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM kyc1.outcome_publication WHERE application_id = $1`, [applicationId]);
      expect(rows.rows[0].n).toBe(0);
    });

    it("primary case created but no outcome computed yet -> KYC1_OUTCOME_NOT_PUBLISHABLE / 422", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_pending");
      await createHandoff({ application_id: applicationId, case_type: "individual" });
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
    });

    it("a passed individual case with no authorised_party -> publishes pass with the case as sole contributor", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_pass");
      const { caseId } = await createAndPassIndividualCase(applicationId);
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.aggregate_status).toBe("pass");
      expect(data.status).toBe("pending"); // Phase 2B delivery not implemented yet
      expect(data.contributing_case_ids).toEqual([caseId]);
      expect(data.publication_id).toMatch(/^kyc1pub_/);
      expect(data).not.toHaveProperty("payload_hash");
    });

    it("a failed primary case -> publishes fail", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_fail");
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
      await computeOutcome(created.case_id);
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.aggregate_status).toBe("fail");
    });

    it("THE CRITICAL CASE: an entity case FAILS, then an authorised_party case for the SAME application PASSES — the aggregate is still fail, never overwritten by the later party pass", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_critical");
      const entityCreated = (await createHandoff({ application_id: applicationId, case_type: "entity" })).json().data;
      await addVerificationResult(entityCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "entity", result_status: "fail" });
      await computeOutcome(entityCreated.case_id);

      // authorised_party's own default checklist requires BOTH identity_document AND
      // authority_evidence (DEFAULT_CHECKLIST_BY_CASE_TYPE) — both must be satisfied for this
      // case to genuinely pass, not just identity.
      const partyCreated = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
      await addEvidence(partyCreated.case_id, { document_type: "identity_document", evidence_ref: "dms://party-ref-1" });
      await addEvidence(partyCreated.case_id, { document_type: "authority_evidence", evidence_ref: "dms://party-ref-2" });
      await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      const partyChecklist = (await getChecklist(partyCreated.case_id)).json().data.checklist;
      for (const docType of ["identity_document", "authority_evidence"]) {
        const doc = partyChecklist.find((c: { document_type: string }) => c.document_type === docType);
        await addVerificationResult(partyCreated.case_id, {
          source_type: "manual",
          source_id: "staff_1",
          result_type: "document",
          result_status: "pass",
          checklist_item_id: doc.checklist_item_id,
        });
      }
      const partyOutcomeRes = await computeOutcome(partyCreated.case_id);
      expect(partyOutcomeRes.json().data.outcome_status).toBe("pass"); // the party case itself genuinely passed

      // Phase 4B: party_1 only counts toward the aggregate if CLT-01's roster lists it as a
      // REQUIRED authorised party — otherwise it is an "extra" KYC case, excluded entirely. Give
      // it a matching roster entry so this test still exercises its original intent (worst-wins
      // across a genuinely-contributing primary + party anchor), not the extra-case exclusion path.
      config.clt1FetchImpl = cltRosterFetch({
        primarySubjectType: "entity",
        parties: [{ authorised_party_id: "party_1", party_type: "signatory", authority_status: "active", version: 1 }],
      });
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.aggregate_status).toBe("fail"); // the application-level aggregate is still fail
      expect(res.json().data.contributing_case_ids.sort()).toEqual([entityCreated.case_id, partyCreated.case_id].sort());
    });

    it("a pass would publish, but tied conflicting evidence exists on the contributing case -> KYC1_OUTCOME_EVIDENCE_CONFLICT / 422, no publication row", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_conflict");
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      const tiedAt = new Date().toISOString();
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ($1,$2,'manual','staff_1','identity','fail','seedhash',$3), ($4,$2,'manual','staff_1','identity','pass','seedhash',$3)`,
        ["kyc1vr_pubconflict_aaaa", created.case_id, tiedAt, "kyc1vr_pubconflict_zzzz"],
      );
      // "zzzz" > "aaaa" -> MED-1's own tie-break resolves compute-outcome to pass.
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      const item = checklist.find((c: { document_type: string }) => c.document_type === "identity_document");
      await addVerificationResult(created.case_id, {
        source_type: "manual",
        source_id: "staff_1",
        result_type: "document",
        result_status: "pass",
        checklist_item_id: item.checklist_item_id,
      });
      const computeRes = await computeOutcome(created.case_id);
      expect(computeRes.json().data.outcome_status).toBe("pass");

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_EVIDENCE_CONFLICT");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM kyc1.outcome_publication WHERE application_id = $1`, [applicationId]);
      expect(rows.rows[0].n).toBe(0);
    });

    it("a fail aggregate is NEVER blocked by tied conflicting evidence — the conflict gate only applies to a would-be pass", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_fail_with_tie");
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      const tiedAt = new Date().toISOString();
      // Same tie shape as above, but "aaaa" (fail) is now the lexicographically-higher id, so
      // MED-1's own tie-break resolves compute-outcome to fail, not pass.
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ($1,$2,'manual','staff_1','identity','pass','seedhash',$3), ($4,$2,'manual','staff_1','identity','fail','seedhash',$3)`,
        ["kyc1vr_failtie_aaaa", created.case_id, tiedAt, "kyc1vr_failtie_zzzz"],
      );
      const computeRes = await computeOutcome(created.case_id);
      expect(computeRes.json().data.outcome_status).toBe("fail");

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.aggregate_status).toBe("fail");
    });

    it("republishing for the same application SUPERSEDES the prior active publication (status='superseded', version bumped)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_supersede");
      await createAndPassIndividualCase(applicationId);
      const first = await publishOutcome(applicationId);
      const firstId = first.json().data.publication_id;

      const second = await publishOutcome(applicationId);
      expect(second.statusCode).toBe(201);
      expect(second.json().data.publication_id).not.toBe(firstId);

      const firstRow = await verifyPool.query(`SELECT status, version FROM kyc1.outcome_publication WHERE publication_id = $1`, [firstId]);
      expect(firstRow.rows[0].status).toBe("superseded");
      expect(firstRow.rows[0].version).toBe(2);
    });

    it("the partial unique index permits at most one non-superseded publication per application at the DB level", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_index");
      await verifyPool.query(
        `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
         VALUES ('kyc1pub_index_1',$1,'pass','[]','[]','seedhash','staff_1')`,
        [applicationId],
      );
      await expect(
        verifyPool.query(
          `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
           VALUES ('kyc1pub_index_2',$1,'fail','[]','[]','seedhash','staff_1')`,
          [applicationId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("emits kyc1.outcome_publication_requested on success, kyc1.outcome_publication_superseded on supersede, and kyc1.outcome_publication_refused on a not_publishable refusal — no PII/free text in any payload", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_audit");
      await publishOutcome(applicationId); // refused: not_publishable, no case exists yet
      await createAndPassIndividualCase(applicationId);
      await publishOutcome(applicationId); // requested
      await publishOutcome(applicationId); // requested again -> supersedes the previous one

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.outcome_publication%' AND payload_ref LIKE $1 ORDER BY created_at_utc`,
        [`%${applicationId}%`],
      );
      const eventTypes = events.rows.map((r) => r.event_type);
      expect(eventTypes).toContain("kyc1.outcome_publication_refused");
      expect(eventTypes).toContain("kyc1.outcome_publication_requested");
      expect(eventTypes).toContain("kyc1.outcome_publication_superseded");

      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["data:image", "base64", "iVBORw0KGgo", "free_text", "notes"]) {
        expect(serialized.includes(forbidden)).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/outcome-publications/:publication_id", () => {
    it("requires the internal-service-token (401 without it)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/kyc1/outcome-publications/kyc1pub_x" });
      expect(res.statusCode).toBe(401);
    });

    it("returns KYC1_OUTCOME_PUBLICATION_NOT_FOUND / 404 for an unknown publication_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/kyc1/outcome-publications/kyc1pub_does_not_exist", headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_NOT_FOUND");
    });

    it("returns exactly the safe field set — no payload_hash, no CLT-01 response body", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("pub_read");
      await createAndPassIndividualCase(applicationId);
      const published = await app.inject({
        method: "POST",
        url: `/internal/kyc1/applications/${applicationId}/publish-outcome`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      const publicationId = published.json().data.publication_id;

      const res = await app.inject({ method: "GET", url: `/internal/kyc1/outcome-publications/${publicationId}`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json().data).sort()).toEqual(
        [
          "publication_id",
          "application_id",
          "aggregate_status",
          "contributing_case_ids",
          "contributing_outcome_ids",
          "status",
          "attempt_count",
          "failure_reason_code",
          "response_ref",
          "requested_by",
          "created_at_utc",
          "delivered_at_utc",
          "roster_hash",
          "required_party_count",
          "evaluated_party_count",
          "contributing_party_ids",
          "roster_fetched_at_utc",
        ].sort(),
      );
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2A — DB-boundary timestamp normalization (D5)", () => {
    it("every KYC-01 fetcher returns genuine ISO strings for timestamptz columns, never a raw Date object, when read straight from a live Postgres", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ts_norm");
      const { caseId } = await createAndPassIndividualCase(applicationId);

      const caseRes = await getCase(caseId);
      expect(typeof caseRes.json().data.created_at_utc).toBe("string");
      expect(typeof caseRes.json().data.updated_at_utc).toBe("string");

      const checklistRes = await getChecklist(caseId);
      for (const item of checklistRes.json().data.checklist) {
        expect(typeof item.created_at_utc).toBe("string");
        expect(typeof item.updated_at_utc).toBe("string");
      }

      const outcomeRes = await getOutcome(caseId);
      expect(typeof outcomeRes.json().data.created_at_utc).toBe("string");

      const publishRes = await app.inject({
        method: "POST",
        url: `/internal/kyc1/applications/${applicationId}/publish-outcome`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(typeof publishRes.json().data.created_at_utc).toBe("string");
      // A genuine ISO-8601 string, not merely `typeof === "string"` (a stringified Date via
      // String(date) would also pass a bare typeof check) — round-trips through Date() unchanged.
      expect(new Date(publishRes.json().data.created_at_utc).toISOString()).toBe(publishRes.json().data.created_at_utc);
    });

    it("verification_result.received_at_utc is a genuine ISO string as returned by fetchVerificationResults, the exact field MED-1's own Date-object bug lived in", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      const rows = await verifyPool.query(`SELECT received_at_utc FROM kyc1.verification_result WHERE case_id = $1`, [created.case_id]);
      // Confirms the RAW driver value is genuinely a Date object at this layer (the hazard this
      // normalization exists to contain) — the app-level route response below must still be a
      // string despite that.
      expect(rows.rows[0].received_at_utc).toBeInstanceOf(Date);

      const res = await app.inject({ method: "GET", url: `/internal/kyc1/cases/${created.case_id}/outcome`, headers: internalHeaders });
      expect(res.statusCode).toBe(404); // no compute-outcome call yet — this test only needs the raw-DB Date-object proof above
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2B — closes LOW-5/LOW-6/LOW-7 (independent Opus review of Phase 2A), then adds CLT-01
  // outcome delivery. No migration, no grant change — see the grants-drift test below.
  // -----------------------------------------------------------------------------------------
  describe("LOW-6 closure — evidence-conflict grouping is scoped per case (route-level)", () => {
    it("two DIFFERENT contributing cases sharing one received_at_utc/result_type with OPPOSING statuses publish successfully — neither case is internally tied", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low6_crosscase");
      const primaryCaseId = await createAndPassIndividualCase(applicationId).then((r) => r.caseId);

      const partyCreated = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
      for (const dt of ["identity_document", "authority_evidence"]) {
        await addEvidence(partyCreated.case_id, { document_type: dt, evidence_ref: "dms://party-ref" });
      }
      const partyChecklist = (await getChecklist(partyCreated.case_id)).json().data.checklist;
      for (const dt of ["identity_document", "authority_evidence"]) {
        const doc = partyChecklist.find((c: { document_type: string }) => c.document_type === dt);
        await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: doc.checklist_item_id });
      }
      await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      await computeOutcome(partyCreated.case_id);

      // Force the primary case's own identity row and the party case's own identity row to share
      // one timestamp with OPPOSING statuses — neither case is internally tied (each case has
      // exactly one identity result of its own).
      const primaryTs = (await verifyPool.query(`SELECT received_at_utc FROM kyc1.verification_result WHERE case_id = $1 AND result_type = 'identity'`, [primaryCaseId])).rows[0].received_at_utc;
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ($1,$2,'manual','staff_1','identity','fail','seedhash',$3)`,
        ["kyc1vr_low6_crosscase", partyCreated.case_id, primaryTs],
      );
      // The party case's own LATEST identity result is still 'pass' (MED-1 tie-break: the seeded
      // 'fail' row has a lexicographically lower id than the real submitted 'pass' row is not
      // guaranteed — recompute so the case's own current_outcome_status reflects the seeded row
      // being genuinely tied within ITS OWN case only if it were the same case; here it's a
      // DIFFERENT case, so no recompute is needed for the party case itself to stay 'pass').

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.aggregate_status).toBe("pass");
    });

    it("a tied conflicting pair WITHIN the same case still blocks publication (regression — LOW-6 must not overcorrect)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low6_samecase");
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      const tiedAt = new Date().toISOString();
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ($1,$2,'manual','staff_1','identity','fail','seedhash',$3), ($4,$2,'manual','staff_1','identity','pass','seedhash',$3)`,
        ["kyc1vr_low6same_aaaa", created.case_id, tiedAt, "kyc1vr_low6same_zzzz"],
      );
      await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-1" });
      const checklist = (await getChecklist(created.case_id)).json().data.checklist;
      const item = checklist.find((c: { document_type: string }) => c.document_type === "identity_document");
      await addVerificationResult(created.case_id, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id });
      const computeRes = await computeOutcome(created.case_id);
      expect(computeRes.json().data.outcome_status).toBe("pass");

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_EVIDENCE_CONFLICT");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("LOW-7 closure — corrective same-anchor case blocks/downgrades publication immediately (route-level)", () => {
    it("a terminal pass followed by a corrective same-anchor case with NO outcome yet -> publish-outcome becomes KYC1_OUTCOME_NOT_PUBLISHABLE (the stale pass is no longer authoritative)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low7_primary");
      await createAndPassIndividualCase(applicationId);
      // Corrective case for the SAME anchor — allowed today (migration 042 only blocks a
      // duplicate ACTIVE case, never a duplicate completed one).
      await createHandoff({ application_id: applicationId, case_type: "individual" });

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
    });

    it("a party pass followed by a corrective same-anchor party case with NO outcome yet, for a REQUIRED roster party -> Phase 4B: blocks publication (KYC1_OUTCOME_NOT_PUBLISHABLE), superseding this test's own pre-Phase-4B name — a required party with no outcome always blocks, never downgrades to remediation_required", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low7_party");
      await createAndPassIndividualCase(applicationId);

      const party1 = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
      for (const dt of ["identity_document", "authority_evidence"]) await addEvidence(party1.case_id, { document_type: dt, evidence_ref: "dms://r" });
      const cl1 = (await getChecklist(party1.case_id)).json().data.checklist;
      for (const dt of ["identity_document", "authority_evidence"]) {
        const doc = cl1.find((c: { document_type: string }) => c.document_type === dt);
        await addVerificationResult(party1.case_id, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: doc.checklist_item_id });
      }
      await addVerificationResult(party1.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
      const partyOutcome = await computeOutcome(party1.case_id);
      expect(partyOutcome.json().data.outcome_status).toBe("pass");

      // Corrective same-anchor party case, no outcome yet.
      await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" });

      // Phase 4B: party_1 must be a REQUIRED roster party for its corrective-no-outcome state to
      // reach completeness evaluation at all — otherwise it would just be an excluded "extra"
      // case. As a REQUIRED party with no outcome, per the approved Phase 4B spec this ALWAYS
      // blocks publication outright (party_outcome_pending) — it is never converted into a
      // remediation_required aggregate the way an ordinary non-anchor discrepancy would be.
      config.clt1FetchImpl = cltRosterFetch({
        parties: [{ authorised_party_id: "party_1", party_type: "signatory", authority_status: "active", version: 1 }],
      });
      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
    });

    it("a corrective case WITH a computed outcome still supersedes the prior terminal pass normally (no regression from Phase 2A's own accepted behaviour)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low7_corrected");
      await createAndPassIndividualCase(applicationId);
      const corrective = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      await addVerificationResult(corrective.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
      const correctiveOutcome = await computeOutcome(corrective.case_id);
      expect(correctiveOutcome.json().data.outcome_status).toBe("fail");

      const res = await publishOutcome(applicationId);
      expect(res.statusCode).toBe(201);
      expect(res.json().data.aggregate_status).toBe("fail");
      expect(res.json().data.contributing_case_ids).toEqual([corrective.case_id]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("LOW-5 closure — concurrent publish serializes instead of racing the unique index", () => {
    it("Promise.all of concurrent publish-outcome calls (with a prior active publication already present) never surfaces KYC1_AUDIT_REQUIRED/503, and exactly one active publication survives every trial", async () => {
      if (!schemaReady) return;
      let saw503 = false;
      const otherStatuses = new Set<number>();
      for (let trial = 0; trial < 5; trial++) {
        const applicationId = freshApplicationId(`low5_${trial}`);
        await createAndPassIndividualCase(applicationId);
        await publishOutcome(applicationId); // establish a prior active publication
        const results = await Promise.all([publishOutcome(applicationId), publishOutcome(applicationId), publishOutcome(applicationId)]);
        for (const r of results) {
          if (r.statusCode === 503) saw503 = true;
          else if (r.statusCode !== 201) otherStatuses.add(r.statusCode);
        }
        const active = await verifyPool.query(`SELECT count(*)::int AS n FROM kyc1.outcome_publication WHERE application_id = $1 AND status <> 'superseded'`, [applicationId]);
        expect(active.rows[0].n).toBe(1);
      }
      expect(saw503).toBe(false);
      expect(otherStatuses.size).toBe(0);
    });

    it("versions/supersession remain monotonic and clean after a concurrent race (no gaps, no duplicate active rows)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("low5_monotonic");
      await createAndPassIndividualCase(applicationId);
      await publishOutcome(applicationId);
      await Promise.all([publishOutcome(applicationId), publishOutcome(applicationId)]);

      const rows = await verifyPool.query(`SELECT publication_id, status, version FROM kyc1.outcome_publication WHERE application_id = $1 ORDER BY created_at_utc`, [applicationId]);
      const activeRows = rows.rows.filter((r) => r.status !== "superseded");
      expect(activeRows).toHaveLength(1);
      for (const r of rows.rows) {
        if (r.status === "superseded") expect(r.version).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/outcome-publications/:publication_id/deliver", () => {
    beforeAll(() => {
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("requires the internal-service-token (401 without it)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/internal/kyc1/outcome-publications/kyc1pub_x/deliver", payload: { requested_by: "staff_1" } });
      expect(res.statusCode).toBe(401);
    });

    it("unknown publication_id -> KYC1_OUTCOME_PUBLICATION_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = realisticCltFetch();
      const res = await deliverOutcome("kyc1pub_does_not_exist");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_NOT_FOUND");
    });

    it("delivers a pending publication successfully — status becomes succeeded, response_ref is CLT-01's outcome_id, payload_hash never returned", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_ok");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = realisticCltFetch();

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.status).toBe("succeeded");
      expect(data.attempt_count).toBe(1);
      expect(typeof data.response_ref).toBe("string");
      expect(data.response_ref).toMatch(/^clt1cdd_stub_/);
      expect(data).not.toHaveProperty("payload_hash");
    });

    it("non-2xx from CLT-01 with a parseable error code (the real, expected CLT1_APPLICATION_INVALID_STATE case) -> KYC1_CLT_DELIVERY_FAILED / 502, delivery recorded as failed, retriable", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_rejected");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe("KYC1_CLT_DELIVERY_FAILED");

      const row = await verifyPool.query(`SELECT status, failure_reason_code, attempt_count FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
      expect(row.rows[0].status).toBe("failed");
      expect(row.rows[0].failure_reason_code).toBe("CLT1_APPLICATION_INVALID_STATE");
      expect(row.rows[0].attempt_count).toBe(1);

      // Retriable: a second /deliver call, now with a success stub, succeeds.
      config.clt1FetchImpl = realisticCltFetch();
      const retry = await deliverOutcome(pub.publication_id);
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.status).toBe("succeeded");
      expect(retry.json().data.attempt_count).toBe(2);
    });

    it("CLT-01 unreachable (network error) -> KYC1_CLT_UNAVAILABLE / 503", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_unreachable");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltUnreachable();

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
      const row = await verifyPool.query(`SELECT status, failure_reason_code FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
      expect(row.rows[0].status).toBe("failed");
      expect(row.rows[0].failure_reason_code).toBe("clt1_unavailable");
    });

    it("CLT-01 returns a malformed (unparseable) 2xx body -> KYC1_CLT_UNAVAILABLE / 503", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_malformed");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltMalformedResponse();

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
    });

    it("CLT-01 returns 2xx with success:false -> KYC1_CLT_UNAVAILABLE / 503 (never treated as delivered)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_successfalse");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltSuccessFalse();

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
    });

    it("a CLT-01 error code longer than 64 chars is clamped before being stored (never fails the terminal UPDATE with a raw 22001)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_clamp");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      const longCode = "CLT1_" + "X".repeat(100);
      config.clt1FetchImpl = cltInvalidState(longCode);

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(502);
      const row = await verifyPool.query(`SELECT failure_reason_code FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
      expect(row.rows[0].failure_reason_code.length).toBeLessThanOrEqual(64);
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("delivering an already-succeeded publication -> KYC1_OUTCOME_PUBLICATION_INVALID_STATE / 409", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_succeeded_reject");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = realisticCltFetch();
      await deliverOutcome(pub.publication_id);

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_INVALID_STATE");
    });

    it("delivering a superseded publication -> KYC1_OUTCOME_PUBLICATION_INVALID_STATE / 409, no CLT-01 call made", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_superseded_reject");
      await createAndPassIndividualCase(applicationId);
      const firstPub = (await publishOutcome(applicationId)).json().data;
      await publishOutcome(applicationId); // supersedes firstPub

      // Phase 4B: deliver now always fetches the current roster before its status check, so the
      // stub must answer /kyc-roster normally — the real protection this test cares about is that
      // the /outcomes delivery POST itself is never reached for a superseded publication.
      config.clt1FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
        throw new Error("must not be called — superseded publications are rejected before any CLT-01 delivery HTTP call");
      }) as unknown as typeof fetch;

      const res = await deliverOutcome(firstPub.publication_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_INVALID_STATE");
    });

    it("STALE (LOW-7 delivery-time backstop): a corrective same-anchor case opened AFTER publish but BEFORE deliver blocks delivery with KYC1_OUTCOME_PUBLICATION_STALE / 409, no CLT-01 call made, no publication row mutated", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_stale");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;

      // Corrective case opened after publish, before deliver — the live aggregate no longer
      // matches the stored publication snapshot (computeAuthoritativeOutcome would now say
      // not_publishable, since the corrective case has no outcome yet).
      await createHandoff({ application_id: applicationId, case_type: "individual" });

      // Phase 4B: the roster itself is unchanged here — this test is specifically about the
      // KYC-side (live-aggregate) staleness backstop, so /kyc-roster must succeed with the SAME
      // roster as at publish time; only the /outcomes delivery POST must never be reached.
      config.clt1FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
        throw new Error("must not be called — a stale publication is rejected before any CLT-01 delivery HTTP call");
      }) as unknown as typeof fetch;

      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");

      const row = await verifyPool.query(`SELECT status, version, attempt_count FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
      expect(row.rows[0].status).toBe("pending"); // untouched
      expect(row.rows[0].attempt_count).toBe(0);
    });

    // ---------------------------------------------------------------------------------------
    // MED-2 closure (independent Opus review of Phase 2B) — a fresh publish superseding THIS
    // publication WHILE its own HTTP call to CLT-01 is in flight. Injected deterministically:
    // the fetch stub itself performs the superseding publish before returning, so the race lands
    // exactly inside the window between TX1's commit and TX2's start.
    // ---------------------------------------------------------------------------------------
    it("MED-2 TEST A: CLT-01 ACCEPTS while the publication is superseded mid-flight -> KYC1_OUTCOME_PUBLICATION_STALE / 409, not KYC1_AUDIT_REQUIRED, status stays superseded (never re-enters the active-publication index)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("med2_a");
      await createAndPassIndividualCase(applicationId);
      const pub1 = (await publishOutcome(applicationId)).json().data;

      // Phase 4B: the roster-fetch-outside-tx step must succeed normally so TX1 reaches its
      // commit undisturbed — the race this test injects belongs specifically in the window
      // during the /outcomes delivery POST (between TX1's commit and TX2's start), not earlier.
      config.clt1FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
        await publishOutcome(applicationId); // supersedes pub1 mid-flight, inserts pub2
        return { ok: true, json: async () => ({ success: true, data: { outcome_id: "clt1cdd_med2_a" } }) } as Response;
      }) as unknown as typeof fetch;

      const res = await deliverOutcome(pub1.publication_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");

      const row = await verifyPool.query(
        `SELECT status, attempt_count, failure_reason_code, response_ref, version FROM kyc1.outcome_publication WHERE publication_id = $1`,
        [pub1.publication_id],
      );
      expect(row.rows[0].status).toBe("superseded"); // never moved to 'failed'
      expect(row.rows[0].attempt_count).toBe(1);
      expect(row.rows[0].failure_reason_code).toBe("superseded_during_delivery");
      expect(row.rows[0].response_ref).toBeNull(); // safe-minimal — CLT-01's outcome_id is not stored on the wrong row
      expect(row.rows[0].version).toBeGreaterThanOrEqual(3); // superseded (2) then the delivery-attempt write (3)

      const active = await verifyPool.query(`SELECT count(*)::int AS n FROM kyc1.outcome_publication WHERE application_id = $1 AND status <> 'superseded'`, [applicationId]);
      expect(active.rows[0].n).toBe(1); // exactly the newer publication remains active

      const events = await verifyPool.query(
        `SELECT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.outcome_delivery%' AND payload_ref LIKE $1 ORDER BY created_at_utc`,
        [`%${pub1.publication_id}%`],
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types).toContain("kyc1.outcome_delivery_attempted");
      expect(types).toContain("kyc1.outcome_delivery_failed");
      expect(types).not.toContain("kyc1.outcome_delivery_succeeded");

      config.clt1FetchImpl = realisticCltFetch();
    });

    it("MED-2 TEST B: CLT-01 REJECTS while the publication is superseded mid-flight -> KYC1_OUTCOME_PUBLICATION_STALE / 409, status stays superseded, no raw 23505/KYC1_AUDIT_REQUIRED", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("med2_b");
      await createAndPassIndividualCase(applicationId);
      const pub1 = (await publishOutcome(applicationId)).json().data;

      // Phase 4B: same reasoning as MED-2 TEST A — let the roster-fetch-outside-tx step succeed
      // normally so the race lands during the /outcomes delivery POST, not earlier.
      config.clt1FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
        await publishOutcome(applicationId); // supersedes pub1 mid-flight
        return { ok: false, json: async () => ({ success: false, error: { code: "CLT1_APPLICATION_INVALID_STATE" } }) } as Response;
      }) as unknown as typeof fetch;

      const res = await deliverOutcome(pub1.publication_id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");

      const row = await verifyPool.query(`SELECT status, attempt_count, failure_reason_code FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub1.publication_id]);
      expect(row.rows[0].status).toBe("superseded");
      expect(row.rows[0].attempt_count).toBe(1);
      expect(row.rows[0].failure_reason_code).toBe("superseded_during_delivery");

      const active = await verifyPool.query(`SELECT count(*)::int AS n FROM kyc1.outcome_publication WHERE application_id = $1 AND status <> 'superseded'`, [applicationId]);
      expect(active.rows[0].n).toBe(1);

      config.clt1FetchImpl = realisticCltFetch();
    });

    it("MED-2 regression: a NORMAL (non-raced) successful delivery still sets status='succeeded' with a real response_ref", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("med2_reg_ok");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = realisticCltFetch();
      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("succeeded");
      expect(res.json().data.response_ref).toMatch(/^clt1cdd_stub_/);
    });

    it("MED-2 regression: a NORMAL (non-raced) rejected delivery still sets status='failed'", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("med2_reg_fail");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      const res = await deliverOutcome(pub.publication_id);
      expect(res.statusCode).toBe(502);
      const row = await verifyPool.query(`SELECT status FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
      expect(row.rows[0].status).toBe("failed");
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("does not accept a nonexistent/unknown body field (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      config.clt1FetchImpl = realisticCltFetch();
      const res = await app.inject({
        method: "POST",
        url: "/internal/kyc1/outcome-publications/kyc1pub_x/deliver",
        headers: internalHeaders,
        payload: { requested_by: "staff_1", extra: "nope" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B — audit / PII sweep for delivery events", () => {
    it("emits kyc1.outcome_delivery_attempted + _succeeded on a successful delivery, no PII/evidence_ref/payload_hash/raw CLT body in any payload", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_audit_ok");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = realisticCltFetch();
      await deliverOutcome(pub.publication_id);

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.outcome_delivery%' AND payload_ref LIKE $1 ORDER BY created_at_utc`,
        [`%${pub.publication_id}%`],
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types).toContain("kyc1.outcome_delivery_attempted");
      expect(types).toContain("kyc1.outcome_delivery_succeeded");
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["payload_hash", "evidence_ref", "data:image", "base64", "clt1-shared-token", "sha256:"]) {
        expect(serialized.includes(forbidden), `must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("emits kyc1.outcome_delivery_failed (never succeeded) on a rejected delivery", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_audit_fail");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      config.clt1FetchImpl = cltInvalidState("CLT1_APPLICATION_INVALID_STATE");
      await deliverOutcome(pub.publication_id);

      const events = await verifyPool.query(
        `SELECT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.outcome_delivery%' AND payload_ref LIKE $1`,
        [`%${pub.publication_id}%`],
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types).toContain("kyc1.outcome_delivery_failed");
      expect(types).not.toContain("kyc1.outcome_delivery_succeeded");
      config.clt1FetchImpl = realisticCltFetch();
    });

    it("a stale-delivery refusal reuses kyc1.outcome_publication_refused, no new event type invented — Phase 4B: reason_code is now the specific detectStaleness() cause, not a generic 'stale'", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("deliver_audit_stale");
      await createAndPassIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;
      await createHandoff({ application_id: applicationId, case_type: "individual" });
      config.clt1FetchImpl = realisticCltFetch();
      await deliverOutcome(pub.publication_id);

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.outcome_publication_refused' AND payload_ref LIKE $1`,
        [`%${pub.publication_id}%`],
      );
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(events.rows[0]!.payload_ref);
      // A same-anchor corrective case with no outcome yet is a KYC-side live-aggregate change,
      // not a roster change — detectStaleness() reports the specific, reachable cause.
      expect(parsed.reason_code).toBe("contributing_outcome_changed");
    });

    it("no kyc1.outcome_delivery_blocked/_retry/_stale event type is ever emitted (approved D8 scope — reuse existing events)", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      const types = events.rows.map((r) => r.event_type);
      expect(types).not.toContain("kyc1.outcome_delivery_blocked");
      expect(types).not.toContain("kyc1.outcome_delivery_retry");
      expect(types).not.toContain("kyc1.outcome_delivery_stale");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2B — no schema/grant drift", () => {
    it("outcome_publication grants are BYTE-IDENTICAL to the Phase 2A baseline — SELECT/INSERT + the same 6-column UPDATE grant, no new column added to either", async () => {
      if (!schemaReady) return;
      const privs = await verifyPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='outcome_publication' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`,
      );
      expect(privs.rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const updatable = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='outcome_publication' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(updatable.rows.map((r) => r.column_name)).toEqual(["attempt_count", "delivered_at_utc", "failure_reason_code", "response_ref", "status", "version"]);
    });

    it("no clt1 schema grant of any kind exists for role_kyc1_runtime — CLT-01 is reached over HTTP only", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' AND table_schema='clt1'`);
      expect(rows.rows[0].n).toBe(0);
    });

    it("cross-schema grant footprint is STILL only foundation.outbox_event INSERT — unchanged from Phase 2A", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT table_schema, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' AND table_schema <> 'kyc1' ORDER BY 1,2,3`);
      expect(rows.rows).toEqual([{ table_schema: "foundation", table_name: "outbox_event", privilege_type: "INSERT" }]);
    });

    it("kyc1 schema still has exactly 5 tables at the Phase 2B baseline — Phase 3A's migration 044 is permission-registration only, no table added", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'kyc1' AND table_name <> 'manual_override_request' ORDER BY table_name`);
      expect(rows.rows.map((r) => r.table_name)).toEqual(["cdd_outcome", "document_checklist_item", "kyc_case", "outcome_publication", "verification_result"]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3A — no schema/grant drift beyond the approved scope", () => {
    it("migration 044 exists (permission registration only) and precedes 045/046 (044 was NOT the final head — Phase 3B added two more)", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const migrationsDir = path.join(__dirname, "..", "..", "infra", "migrations");
      const files = fs.readdirSync(migrationsDir);
      expect(files.some((f) => f.startsWith("043_"))).toBe(true);
      expect(files.some((f) => f.startsWith("044_"))).toBe(true);
    });

    it("KYC-01 error catalogue contains Phase 3A's own 2 codes (16 Phase 0/1/2A/2B + 2 Phase 3A, now 22 total with Phase 3B's own 4)", async () => {
      const { KYC1_ERROR_CODES } = await import("../../services/kyc1/src/lib/errors.js");
      for (const code of [
        "KYC1_OUTCOME_PUBLICATION_INVALID_STATE",
        "KYC1_OUTCOME_PUBLICATION_STALE",
        "KYC1_CLT_DELIVERY_FAILED",
        "KYC1_CLT_UNAVAILABLE",
        "KYC1_PERMISSION_DENIED",
        "KYC1_IAM2_UNAVAILABLE",
      ]) {
        expect(code in KYC1_ERROR_CODES).toBe(true);
      }
      for (const code of ["KYC1_OUTCOME_DELIVERY_BLOCKED", "KYC1_OUTCOME_PUBLICATION_CONFLICT", "KYC1_SENSITIVE_EVIDENCE_NOT_FOUND"]) {
        expect(code in KYC1_ERROR_CODES).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — no schema/grant drift beyond the approved scope", () => {
    it("migrations 044-046 exist; 047 is CLT-01's own (not KYC-01's); 048 is KYC-01's Phase 4B migration; 049 is WLT-01's own (not KYC-01's)", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const migrationsDir = path.join(__dirname, "..", "..", "infra", "migrations");
      const files = fs.readdirSync(migrationsDir);
      expect(files.some((f) => f.startsWith("044_"))).toBe(true);
      expect(files.some((f) => f.startsWith("045_"))).toBe(true);
      expect(files.some((f) => f.startsWith("046_"))).toBe(true);
      expect(files.some((f) => f.startsWith("047_clt1_atomic_kyc_roster_binding"))).toBe(true);
      expect(files.some((f) => f.startsWith("048_kyc1_publication_roster_binding"))).toBe(true);
      expect(files.some((f) => f.startsWith("049_wlt1_core"))).toBe(true);
    });

    it("KYC-01 error catalogue has exactly 23 codes (18 Phase 0/1/2A/2B/3A + 4 Phase 3B + 1 Phase 4A.2B)", async () => {
      const { KYC1_ERROR_CODES } = await import("../../services/kyc1/src/lib/errors.js");
      expect(Object.keys(KYC1_ERROR_CODES)).toHaveLength(23);
      for (const code of ["KYC1_APPROVAL_REQUIRED", "KYC1_OVERRIDE_NOT_FOUND", "KYC1_OVERRIDE_INVALID_STATE", "KYC1_SELF_OVERRIDE_BLOCKED", "KYC1_APPLICATION_INVALID_STATE"]) {
        expect(code in KYC1_ERROR_CODES).toBe(true);
      }
      for (const code of ["KYC1_OVERRIDE_NOT_ALLOWED", "KYC1_MANUAL_REVIEW_NOT_FOUND", "KYC1_MANUAL_REVIEW_INVALID_STATE", "KYC1_SENSITIVE_EVIDENCE_NOT_FOUND"]) {
        expect(code in KYC1_ERROR_CODES).toBe(false);
      }
    });

    it("kyc1.manual_override_request exists, no manual_review_request table exists", async () => {
      if (!schemaReady) return;
      const overrideRows = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'kyc1' AND table_name = 'manual_override_request'`);
      expect(overrideRows.rows).toEqual([{ table_name: "manual_override_request" }]);
      const reviewRows = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'kyc1' AND table_name LIKE '%manual_review%'`);
      expect(reviewRows.rows).toEqual([]);
    });

    it("role_kyc1_runtime's grant footprint is the Phase 2B baseline PLUS exactly manual_override_request's own grants — nothing else changed", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_schema, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee='role_kyc1_runtime' ORDER BY 1,2,3`,
      );
      const kyc1Rows = rows.rows.filter((r) => r.table_schema === "kyc1");
      const kyc1Tables = new Set(kyc1Rows.map((r) => r.table_name));
      expect(kyc1Tables).toEqual(new Set(["cdd_outcome", "document_checklist_item", "kyc_case", "manual_override_request", "outcome_publication", "verification_result"]));
      const crossSchemaRows = rows.rows.filter((r) => r.table_schema !== "kyc1");
      expect(crossSchemaRows).toEqual([{ table_schema: "foundation", table_name: "outbox_event", privilege_type: "INSERT" }]);
      // Every OTHER table's own UPDATE-grant column set is byte-identical to the Phase 2B baseline
      // — Phase 3B added no column to any existing table's grant.
      const cddOutcomePrivs = await verifyPool.query(`SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='kyc1' AND table_name='cdd_outcome' AND grantee='role_kyc1_runtime' ORDER BY privilege_type`);
      expect(cddOutcomePrivs.rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const kycCaseUpdatable = await verifyPool.query(`SELECT column_name FROM information_schema.column_privileges WHERE table_schema='kyc1' AND table_name='kyc_case' AND grantee='role_kyc1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`);
      expect(kycCaseUpdatable.rows.map((r) => r.column_name)).toEqual(["current_outcome_id", "current_outcome_status", "status", "updated_at_utc"]);
    });

    it("grant file header no longer claims KYC-01 has no CLT-01/IAM-02 HTTP dependency (INFO-18 closure)", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const grantFile = fs.readFileSync(path.join(__dirname, "..", "..", "infra", "grants", "kyc1_runtime_grants.sql"), "utf8");
      expect(grantFile).not.toMatch(/KYC-01 has no CLT-01\/IAM-02\/AML-01\s*\n?\s*-- HTTP dependency yet/);
      expect(grantFile).toContain("STALE-COMMENT FIX");
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3A — KYC-01's first IAM-02 integration + the sensitive evidence-read route.
  // -----------------------------------------------------------------------------------------
  describe("GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail", () => {
    async function createCaseWithEvidence() {
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const addRes = await addEvidence(created.case_id, { document_type: "identity_document", evidence_ref: "dms://ref-sensitive-1", evidence_hash: "sha256:sensitive-abc" });
      const checklistItemId = addRes.json().data.checklist_item_id as string;
      return { caseId: created.case_id, checklistItemId };
    }

    it("permitted actor + existing checklist item returns evidence_ref/evidence_hash and the approved field set only", async () => {
      if (!schemaReady) return;
      const { caseId, checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = allowAllIam2Fetch();
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body).toEqual({
        checklist_item_id: checklistItemId,
        case_id: caseId,
        document_type: "identity_document",
        status: "received",
        evidence_ref: "dms://ref-sensitive-1",
        evidence_hash: "sha256:sensitive-abc",
        expiry_date: null,
      });
    });

    it("no document content, no raw base64, no data URI, no vendor payload — the response contains only the approved reference fields", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = allowAllIam2Fetch();
      const res = await getSensitiveDetail(checklistItemId);
      const serialized = JSON.stringify(res.json().data);
      for (const forbidden of ["data:image", "base64", "vendor", "payload_hash"]) {
        expect(serialized.toLowerCase().includes(forbidden.toLowerCase()), `must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("actor_id is required (400 VALIDATION_ERROR, never reaches IAM-02)", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => {
        throw new Error("IAM-02 must not be called when actor_id is missing");
      }) as unknown as typeof fetch;
      const res = await app.inject({ method: "GET", url: `/internal/kyc1/checklist-items/${checklistItemId}/sensitive-detail`, headers: internalHeaders });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("is internal-identity gated (401 without the service token)", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      const res = await app.inject({ method: "GET", url: `/internal/kyc1/checklist-items/${checklistItemId}/sensitive-detail?actor_id=staff_1` });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("a genuine IAM-02 deny returns 403 KYC1_PERMISSION_DENIED for an EXISTING item", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = denyIam2Fetch();
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("KYC1_PERMISSION_DENIED");
    });

    it("PERMISSION-BEFORE-EXISTENCE: an unpermissioned caller + a NONEXISTENT checklist_item_id returns 403 KYC1_PERMISSION_DENIED, NOT 404 — closing the existence-oracle gap (mirrors AML-01's own Phase 3A Low-2 fix)", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyIam2Fetch();
      const res = await getSensitiveDetail("kyc1item_does_not_exist_anywhere");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("KYC1_PERMISSION_DENIED");
    });

    it("once permission has genuinely passed, an unknown checklist_item_id resolves to the EXISTING KYC1_CHECKLIST_ITEM_NOT_FOUND — no new sensitive-specific code", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2Fetch();
      const res = await getSensitiveDetail("kyc1item_does_not_exist_anywhere");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CHECKLIST_ITEM_NOT_FOUND");
    });

    // -----------------------------------------------------------------------------------------
    // IAM-02 fail-closed matrix — every non-"allow"/"approval_required"/"step_up_required" shape
    // must resolve to KYC1_IAM2_UNAVAILABLE (distinct from a genuine KYC1_PERMISSION_DENIED).
    // -----------------------------------------------------------------------------------------
    it("IAM-02 unreachable (network error) -> 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = iam2Unreachable();
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("IAM-02 non-2xx -> 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("IAM-02 malformed JSON -> 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      })) as unknown as typeof fetch;
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("IAM-02 success:false -> 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({ ok: true, json: async () => ({ success: false }) })) as unknown as typeof fetch;
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("IAM-02 missing decision field -> 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({ ok: true, json: async () => ({ success: true, data: {} }) })) as unknown as typeof fetch;
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("IAM-02 approval_required and step_up_required both PASS the baseline (mirrors AML-01's own posture — neither is a denial)", async () => {
      if (!schemaReady) return;
      const { checklistItemId: item1 } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({
        ok: true,
        json: async () => ({ success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } }),
      })) as unknown as typeof fetch;
      const res1 = await getSensitiveDetail(item1);
      expect(res1.statusCode).toBe(200);

      const { checklistItemId: item2 } = await createCaseWithEvidence();
      config.iam2FetchImpl = (async () => ({
        ok: true,
        json: async () => ({ success: true, data: { decision: "step_up_required", reason: "IAM2_STEP_UP_REQUIRED" } }),
      })) as unknown as typeof fetch;
      const res2 = await getSensitiveDetail(item2);
      expect(res2.statusCode).toBe(200);
    });

    // -----------------------------------------------------------------------------------------
    // Audit-before-return, fail-closed.
    // -----------------------------------------------------------------------------------------
    it("emits kyc1.sensitive_evidence_read BEFORE the response, with metadata limited to checklist_item_id/case_id/document_type — no evidence_ref/evidence_hash/PII", async () => {
      if (!schemaReady) return;
      const { caseId, checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = allowAllIam2Fetch();
      const res = await getSensitiveDetail(checklistItemId);
      expect(res.statusCode).toBe(200);

      const events = await verifyPool.query(
        `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.sensitive_evidence_read' AND payload_ref LIKE $1`,
        [`%${checklistItemId}%`],
      );
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(events.rows[0]!.payload_ref);
      expect(Object.keys(parsed.metadata).sort()).toEqual(["case_id", "checklist_item_id", "document_type"].sort());
      expect(parsed.metadata.checklist_item_id).toBe(checklistItemId);
      expect(parsed.metadata.case_id).toBe(caseId);
      expect(parsed.metadata.document_type).toBe("identity_document");
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["dms://ref-sensitive-1", "sha256:sensitive-abc", "iam2-shared-token", "kyc1-internal-token"]) {
        expect(serialized.includes(forbidden), `audit payload must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("if the audit/outbox write fails, the route fails with KYC1_AUDIT_REQUIRED and does NOT return the sensitive detail", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      config.iam2FetchImpl = allowAllIam2Fetch();

      // Force the audit write to fail: revoke INSERT on foundation.outbox_event from the runtime
      // role for the duration of this one test, mirroring the established pattern this file's own
      // Phase 2B "audit failure -> AUDIT_REQUIRED" tests use elsewhere in this codebase.
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_kyc1_runtime`);
        try {
          const res = await getSensitiveDetail(checklistItemId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("KYC1_AUDIT_REQUIRED");
          expect(res.json().data).toBeUndefined();
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_kyc1_runtime`);
        }
      });
    });

    // -----------------------------------------------------------------------------------------
    // Cross-route invariant: the sensitive route is the ONLY KYC-01 route that ever returns
    // evidence_ref/evidence_hash.
    // -----------------------------------------------------------------------------------------
    it("the sensitive-detail route is the ONLY KYC-01 route returning evidence_ref/evidence_hash — checklist read and evidence-add both stay narrowed", async () => {
      if (!schemaReady) return;
      const { caseId, checklistItemId } = await createCaseWithEvidence();

      const checklistRes = await getChecklist(caseId);
      expect(JSON.stringify(checklistRes.json().data)).not.toContain("evidence_ref");
      expect(JSON.stringify(checklistRes.json().data)).not.toContain("evidence_hash");

      const addRes = await addEvidence(caseId, { document_type: "proof_of_address", evidence_ref: "dms://ref-2", evidence_hash: "sha256:def" });
      expect(JSON.stringify(addRes.json().data)).not.toContain("dms://ref-2");
      expect(JSON.stringify(addRes.json().data)).not.toContain("sha256:def");

      config.iam2FetchImpl = allowAllIam2Fetch();
      const sensitiveRes = await getSensitiveDetail(checklistItemId);
      expect(sensitiveRes.json().data.evidence_ref).toBe("dms://ref-sensitive-1");
      expect(sensitiveRes.json().data.evidence_hash).toBe("sha256:sensitive-abc");
    });

    it("no kyc1.sensitive_evidence_read event is emitted unless the route is genuinely called (ordinary evidence-add does not trigger it)", async () => {
      if (!schemaReady) return;
      const { checklistItemId } = await createCaseWithEvidence();
      const events = await verifyPool.query(
        `SELECT event_type FROM foundation.outbox_event WHERE event_type = 'kyc1.sensitive_evidence_read' AND payload_ref LIKE $1`,
        [`%${checklistItemId}%`],
      );
      expect(events.rows).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3B — maker-checker manual outcome override.
  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/cases/:case_id/outcome-override/request", () => {
    it("a valid request creates a 'requested' row and returns the safe field set", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const res = await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(Object.keys(body).sort()).toEqual(["case_id", "override_id", "payload_hash", "status", "target_outcome_status"].sort());
      expect(body.case_id).toBe(caseId);
      expect(body.target_outcome_status).toBe("pass");
      expect(body.status).toBe("requested");
      expect(body.override_id).toMatch(/^kyc1ovr_/);

      const row = await verifyPool.query(`SELECT status, target_outcome_status, reason_code, requested_by FROM kyc1.manual_override_request WHERE override_id = $1`, [body.override_id]);
      expect(row.rows[0]).toEqual({ status: "requested", target_outcome_status: "pass", reason_code: "manual_evidence_review", requested_by: "compliance_officer_1" });
    });

    it("unknown case_id returns KYC1_CASE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const res = await requestOverride("kyc1case_does_not_exist", { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_CASE_NOT_FOUND");
    });

    it("a case with no current outcome yet is rejected KYC1_CASE_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const created = (await createHandoff({ case_type: "individual" })).json().data;
      const res = await requestOverride(created.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("a no-op target (same as the case's current outcome) is rejected KYC1_CASE_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      const res = await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "fail", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("a case whose latest outcome is already a manual override is rejected KYC1_CASE_INVALID_STATE — must open a new corrective case instead", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req1 = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req1.override_id, approval_id: "appr_1", decision_token: "tok_1" });

      const res = await requestOverride(caseId, { requested_by: "compliance_officer_2", target_outcome_status: "remediation_required", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("self-override is blocked: requested_by equals the manual verifier's own source_id on this case", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const res = await requestOverride(caseId, { requested_by: "staff_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_SELF_OVERRIDE_BLOCKED");
      const rows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.manual_override_request WHERE case_id = $1`, [caseId]);
      expect(rows.rows[0].n).toBe(0);
    });

    it("self-override block emits kyc1.manual_override_refused with reason_code self_override_blocked, no requested_by/source_id in metadata", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      await requestOverride(caseId, { requested_by: "staff_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });

      const events = await verifyPool.query(`SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.manual_override_refused' AND payload_ref LIKE $1`, [`%${caseId}%`]);
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(events.rows[0]!.payload_ref);
      expect(parsed.metadata).toEqual({ case_id: caseId, requested_by_present: true, reason_code: "self_override_blocked" });
      expect(parsed.actor_id).not.toBe("staff_1");
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      expect(serialized.includes("staff_1")).toBe(false);
    });

    it("registry-only case: self-override check is vacuous (documented limitation) — a registry-only case's own verifier identity never blocks anyone", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailRegistryOnlyEntityCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      // "registry_feed_1" is the registry source_id on this case — since it is NOT source_type='manual',
      // it must NOT trigger the self-block, proving the check is vacuous for a registry-only case.
      const res = await requestOverride(caseId, { requested_by: "registry_feed_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(201);
    });

    it("self-override block skips IAM-02 entirely — no permission/check or execute-verify call is made", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = (async () => {
        throw new Error("IAM-02 must not be called when self-override is blocked");
      }) as unknown as typeof fetch;
      const res = await requestOverride(caseId, { requested_by: "staff_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_SELF_OVERRIDE_BLOCKED");
    });

    it("a genuine IAM-02 deny returns 403 KYC1_PERMISSION_DENIED, no override row created", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = denyOverrideIam2Fetch();
      const res = await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("KYC1_PERMISSION_DENIED");
      const rows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.manual_override_request WHERE case_id = $1`, [caseId]);
      expect(rows.rows[0].n).toBe(0);
    });

    it("IAM-02 unreachable returns 503 KYC1_IAM2_UNAVAILABLE (distinct from a genuine denial)", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = iam2Unreachable();
      const res = await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("approval_required is a baseline PASS at request time — the whole point of this permission", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = makeFakeIam2FetchFull((path) => {
        if (path === "check") return { ok: true, body: { success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } } };
        throw new Error("execute-verify must not be called during request");
      });
      const res = await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(res.statusCode).toBe(201);
    });

    it("concurrent requests for the SAME case: one succeeds, the other receives clean KYC1_OVERRIDE_INVALID_STATE — never a raw 23505/KYC1_AUDIT_REQUIRED", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const results = await Promise.all([
        requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" }),
        requestOverride(caseId, { requested_by: "compliance_officer_2", target_outcome_status: "remediation_required", reason_code: "manual_evidence_review" }),
      ]);
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([201, 409]);
      const codes = results.filter((r) => r.statusCode !== 201).map((r) => r.json().error.code);
      expect(codes).toEqual(["KYC1_OVERRIDE_INVALID_STATE"]);
      const openRows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.manual_override_request WHERE case_id = $1 AND status = 'requested'`, [caseId]);
      expect(openRows.rows[0].n).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/kyc1/cases/:case_id/outcome-override/apply", () => {
    it("a valid apply transitions requested -> applied, inserts a new cdd_outcome, updates the case pointer, and returns the approved response shape", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok_valid" });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body).toEqual({
        override_id: req.override_id,
        case_id: caseId,
        outcome_id: body.outcome_id,
        outcome_status: "pass",
        outcome_version: 2,
        republish_required: true,
        redelivery_required: true,
      });
      expect(body.outcome_id).toMatch(/^kyc1outcome_/);

      const overrideRow = await verifyPool.query(`SELECT status, approval_id, applied_outcome_id, decision_token_hash FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(overrideRow.rows[0].status).toBe("applied");
      expect(overrideRow.rows[0].approval_id).toBe("appr_1");
      expect(overrideRow.rows[0].applied_outcome_id).toBe(body.outcome_id);
      expect(overrideRow.rows[0].decision_token_hash).not.toBeNull();
      expect(overrideRow.rows[0].decision_token_hash).not.toContain("tok_valid");

      const caseRow = await verifyPool.query(`SELECT status, current_outcome_status, current_outcome_id FROM kyc1.kyc_case WHERE case_id = $1`, [caseId]);
      expect(caseRow.rows[0]).toEqual({ status: "completed", current_outcome_status: "pass", current_outcome_id: body.outcome_id });

      const outcomeRow = await verifyPool.query(`SELECT outcome_status, outcome_reason, outcome_version FROM kyc1.cdd_outcome WHERE outcome_id = $1`, [body.outcome_id]);
      expect(outcomeRow.rows[0]).toEqual({ outcome_status: "pass", outcome_reason: "manual_override_pass", outcome_version: 2 });
    });

    it("the raw decision token is never persisted — only fingerprint(decision_token)", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "very-secret-raw-token-xyz" });
      const row = await verifyPool.query(`SELECT decision_token_hash FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(row.rows[0].decision_token_hash).toMatch(/^sha256:/);
      expect(row.rows[0].decision_token_hash).not.toContain("very-secret-raw-token-xyz");
    });

    it("payload_hash used for execute-verify is derived from the STORED request row, not any caller-supplied apply-body field", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      let sentPayloadHash: string | undefined;
      config.iam2FetchImpl = makeFakeIam2FetchFull((path, body) => {
        if (path === "check") return { ok: true, body: { success: true, data: { decision: "allow", reason: "permission_granted" } } };
        sentPayloadHash = body.current_payload_hash as string;
        return { ok: true, body: { success: true, data: { execution_authorised: true } } };
      });
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(sentPayloadHash).toBe(req.payload_hash);
    });

    it("unknown override_id returns KYC1_OVERRIDE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      const res = await applyOverride(caseId, { override_id: "kyc1ovr_does_not_exist", approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_OVERRIDE_NOT_FOUND");
    });

    it("case_id mismatch (override belongs to a different case) returns KYC1_OVERRIDE_NOT_FOUND / 404", async () => {
      if (!schemaReady) return;
      const { caseId: caseA } = await createAndFailIndividualCase();
      const { caseId: caseB } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseA, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const res = await applyOverride(caseB, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("KYC1_OVERRIDE_NOT_FOUND");
    });

    it("applying an already-applied override returns KYC1_OVERRIDE_INVALID_STATE / 409", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_OVERRIDE_INVALID_STATE");
    });

    it("two concurrent applies for the SAME override: one succeeds, the other receives clean KYC1_OVERRIDE_INVALID_STATE — never a raw 23505/KYC1_AUDIT_REQUIRED", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const results = await Promise.all([
        applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" }),
        applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" }),
      ]);
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([200, 409]);
      const codes = results.filter((r) => r.statusCode !== 200).map((r) => r.json().error.code);
      expect(codes).toEqual(["KYC1_OVERRIDE_INVALID_STATE"]);
      const outcomeRows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
      expect(outcomeRows.rows[0].n).toBe(2); // original compute-outcome (fail) + exactly ONE applied override
    });

    it("a genuine IAM-02 deny at apply returns 403 KYC1_PERMISSION_DENIED, override row stays 'requested'", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      config.iam2FetchImpl = denyOverrideIam2Fetch();
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("KYC1_PERMISSION_DENIED");
      const row = await verifyPool.query(`SELECT status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(row.rows[0].status).toBe("requested");
    });

    it("IAM-02 unreachable at apply's baseline check returns 503 KYC1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      config.iam2FetchImpl = iam2Unreachable();
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    // -----------------------------------------------------------------------------------------
    // execute-verify fail-closed matrix.
    // -----------------------------------------------------------------------------------------
    for (const [label, errorCode] of [
      ["invalid token", "IAM2_DECISION_TOKEN_INVALID"],
      ["expired/stale token", "IAM2_DECISION_TOKEN_STALE"],
      ["replayed token", "IAM2_DECISION_TOKEN_ALREADY_USED"],
      ["payload-hash mismatch", "IAM2_PAYLOAD_HASH_MISMATCH"],
      ["approver mismatch", "IAM2_APPROVER_MISMATCH"],
    ] as const) {
      it(`execute-verify rejects (${label}) -> 403 KYC1_APPROVAL_REQUIRED, override row stays 'requested', no cdd_outcome row inserted`, async () => {
        if (!schemaReady) return;
        const { caseId } = await createAndFailIndividualCase();
        config.iam2FetchImpl = allowOverrideIam2Fetch();
        const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
        config.iam2FetchImpl = executeVerifyRejectsFetch(errorCode);
        const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("KYC1_APPROVAL_REQUIRED");
        const row = await verifyPool.query(`SELECT status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
        expect(row.rows[0].status).toBe("requested");
        const outcomeRows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
        expect(outcomeRows.rows[0].n).toBe(1); // only the original compute-outcome row
      });
    }

    it("execute-verify returns a MALFORMED 200 (execution_authorised!==true) -> 503 KYC1_IAM2_UNAVAILABLE — lib/iam2-client.ts treats a malformed response body identically to unreachable, never a genuine denial", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      config.iam2FetchImpl = executeVerifyMalformedFetch();
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("execute-verify network error/unreachable -> 503 KYC1_IAM2_UNAVAILABLE, distinct from KYC1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      config.iam2FetchImpl = makeFakeIam2FetchFull((path) => {
        if (path === "check") return { ok: true, body: { success: true, data: { decision: "allow", reason: "permission_granted" } } };
        throw new Error("simulated network failure");
      });
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("KYC1_IAM2_UNAVAILABLE");
    });

    it("no DB transaction/advisory lock is held open across the IAM-02 execute-verify HTTP call — proven by acquiring the SAME case-scoped advisory lock key from an independent connection WHILE execute-verify is in flight", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      let lockWasFreeDuringExecuteVerify: boolean | undefined;
      config.iam2FetchImpl = (async (url: unknown, init?: unknown) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/permission/execute-verify")) {
          // Same advisory lock key routes/outcome-override.ts's own final apply transaction takes
          // (`kyc1.manual_override:<case_id>`). If that transaction (and its lock) were already
          // open at this point — i.e. if the route held a transaction across the HTTP call — this
          // independent connection's own pg_try_advisory_xact_lock would return false (blocked).
          // It must return true: nothing holds the lock yet, because the lock is only ever taken
          // INSIDE the final apply transaction, which starts AFTER this HTTP call returns.
          const probe = await verifyPool.query<{ acquired: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`, [`kyc1.manual_override:${caseId}`]);
          lockWasFreeDuringExecuteVerify = probe.rows[0]!.acquired;
          return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
        }
        return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
      }) as typeof fetch;

      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(200);
      expect(lockWasFreeDuringExecuteVerify).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  // MED-3 fix (independent Opus review of Phase 3B): every override request/approval is now bound
  // to the EXACT case outcome (`approved_against_outcome_id`/`approved_against_outcome_status`)
  // current at request time; apply refuses `KYC1_CASE_INVALID_STATE` when the case's current
  // outcome no longer matches — see migration 045's own header comment for the full exploit this
  // closes.
  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — MED-3 fix: approved-against outcome-snapshot binding", () => {
    /** Case starts remediation_required: no identity result recorded yet, so
     * required_evidence_incomplete. Distinct from createAndFailIndividualCase, which starts at a
     * genuine 'fail'. */
    async function createRemediationRequiredCase(applicationId = freshApplicationId()) {
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      const outcomeRes = await computeOutcome(created.case_id);
      return { caseId: created.case_id, applicationId, outcomeRes };
    }

    // TEST A — adverse evidence arrives after approval.
    it("TEST A: adverse evidence arrives after approval -> stale apply is refused, fail outcome remains current, no evidence is masked", async () => {
      if (!schemaReady) return;
      const { caseId } = await createRemediationRequiredCase();
      const before = (await getOutcome(caseId)).json().data;
      expect(before.outcome_status).toBe("remediation_required");

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      // Adverse evidence arrives AFTER the request/approval — case recomputes to a genuine fail.
      await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_adverse", result_type: "identity", result_status: "fail" });
      const recomputed = await computeOutcome(caseId);
      expect(recomputed.statusCode).toBe(201);
      expect(recomputed.json().data.outcome_status).toBe("fail");

      const beforeCount = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);

      const applyRes = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("KYC1_CASE_INVALID_STATE");

      const afterCount = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
      expect(afterCount.rows[0].n).toBe(beforeCount.rows[0].n); // no manual_override_pass row inserted

      const current = (await getOutcome(caseId)).json().data;
      expect(current.outcome_status).toBe("fail"); // adverse evidence NOT masked
      expect(current.outcome_reason).toBe("identity_verification_failed");

      const overrideRow = await verifyPool.query(`SELECT status, applied_outcome_id FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(overrideRow.rows[0]).toEqual({ status: "failed", applied_outcome_id: null });

      const events = await verifyPool.query(`SELECT event_type, payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE $1 ORDER BY created_at_utc`, [`%${req.override_id}%`]);
      const types = events.rows.map((r) => r.event_type);
      expect(types).not.toContain("kyc1.manual_override_applied");
      const refusedEvents = events.rows.filter((r) => r.event_type === "kyc1.manual_override_refused");
      expect(refusedEvents).toHaveLength(1);
      const parsed = JSON.parse(refusedEvents[0]!.payload_ref);
      expect(parsed.metadata).toEqual({ override_id: req.override_id, case_id: caseId, reason_code: "case_state_changed" });

      // A new override request can subsequently be created for the case's NEW (fail) outcome.
      const freshReq = await requestOverride(caseId, { requested_by: "compliance_officer_2", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
      expect(freshReq.statusCode).toBe(201);
    });

    // TEST B — case reaches target independently (evidence-derived, not override-derived).
    it("TEST B: case reaches the SAME target status via ordinary evidence before apply -> stale apply still refused, evidence-derived outcome remains current, no recompute-lock introduced", async () => {
      if (!schemaReady) return;
      const { caseId } = await createRemediationRequiredCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      // Evidence arrives and the case reaches 'pass' on its own, BEFORE apply.
      const checklist = (await getChecklist(caseId)).json().data.checklist;
      const item = checklist.find((c: { document_type: string }) => c.document_type === "identity_document");
      await addEvidence(caseId, { document_type: "identity_document", evidence_ref: "dms://x" });
      await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_other", result_type: "identity", result_status: "pass" });
      await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_other", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id });
      const recomputed = await computeOutcome(caseId);
      expect(recomputed.json().data.outcome_status).toBe("pass");
      const evidenceDerivedOutcomeId = recomputed.json().data.outcome_id;

      const applyRes = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("KYC1_CASE_INVALID_STATE");

      const current = (await getOutcome(caseId)).json().data;
      expect(current.outcome_id).toBe(evidenceDerivedOutcomeId);
      expect(current.outcome_reason).toBe("all_required_checks_passed"); // evidence-derived, NOT manual_override_pass

      // Recompute-lock must NOT be incorrectly introduced — this outcome was reached by evidence,
      // not by an applied override, so compute-outcome should still refuse only for the EXISTING
      // Phase 1 reason (latest outcome already 'pass'), not because of anything MED-3 added.
      const rc = await computeOutcome(caseId);
      expect(rc.statusCode).toBe(409);
      expect(rc.json().error.code).toBe("KYC1_CASE_INVALID_STATE");

      const overrideRow = await verifyPool.query(`SELECT status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(overrideRow.rows[0].status).toBe("failed");
    });

    // TEST C — same status, different outcome ID (proves the fix protects outcome VERSION, not
    // merely status).
    it("TEST C: case status matches the approved-against status but the outcome_id differs (a corrective re-verification landed a NEW row with the SAME status) -> apply is still refused", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase(); // current outcome: fail, v1
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const approvedAgainst = await verifyPool.query(`SELECT approved_against_outcome_id, approved_against_outcome_status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(approvedAgainst.rows[0].approved_against_outcome_status).toBe("fail");

      // A corrective re-verification re-affirms the SAME 'fail' status but produces a NEW
      // cdd_outcome row (new outcome_id, version+1) — e.g. a second manual identity check that
      // still fails, recorded independently.
      await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_second_check", result_type: "identity", result_status: "fail" });
      const recomputed = await computeOutcome(caseId);
      expect(recomputed.json().data.outcome_status).toBe("fail");
      expect(recomputed.json().data.outcome_id).not.toBe(approvedAgainst.rows[0].approved_against_outcome_id);

      const applyRes = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    // TEST D — change occurs during the IAM-02 HTTP window (between preflight and the final
    // transaction), and no lock/transaction was held during that window.
    it("TEST D: case state changes DURING the execute-verify HTTP call -> final transaction detects it, refuses cleanly, no lock/transaction was held during IAM-02 HTTP", async () => {
      if (!schemaReady) return;
      const { caseId } = await createRemediationRequiredCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      let lockWasFreeDuringExecuteVerify: boolean | undefined;
      config.iam2FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/permission/execute-verify")) {
          const probe = await verifyPool.query<{ acquired: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`, [`kyc1.manual_override:${caseId}`]);
          lockWasFreeDuringExecuteVerify = probe.rows[0]!.acquired;
          // Adverse evidence arrives and the case recomputes WHILE this HTTP call is "in flight".
          await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_adverse", result_type: "identity", result_status: "fail" });
          await computeOutcome(caseId);
          return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
        }
        return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
      }) as typeof fetch;

      const applyRes = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
      expect(lockWasFreeDuringExecuteVerify).toBe(true);

      const outcomeRows = await verifyPool.query(`SELECT outcome_reason FROM kyc1.cdd_outcome WHERE case_id = $1 ORDER BY outcome_version DESC LIMIT 1`, [caseId]);
      expect(outcomeRows.rows[0].outcome_reason).toBe("identity_verification_failed"); // NOT manual_override_pass

      const overrideRow = await verifyPool.query(`SELECT status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(overrideRow.rows[0].status).toBe("failed");
    });

    // TEST E — unchanged case still applies (the existing normal lifecycle is unaffected).
    it("TEST E: unchanged case -> the normal request -> approve -> apply lifecycle still succeeds", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const applyRes = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.outcome_status).toBe("pass");
      const overrideRow = await verifyPool.query(`SELECT status, applied_outcome_id FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(overrideRow.rows[0].status).toBe("applied");
      expect(overrideRow.rows[0].applied_outcome_id).toBe(applyRes.json().data.outcome_id);
    });

    // TEST F — payload binding: the hash changes when either approved-against field changes, and
    // IAM-02 receives the recomputed stored-row hash.
    it("TEST F: payload_hash changes when approved_against_outcome_id/status differ, and execute-verify receives the STORED row's recomputed hash", async () => {
      if (!schemaReady) return;
      const { caseId: caseA } = await createAndFailIndividualCase();
      const { caseId: caseB } = await createRemediationRequiredCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const reqA = (await requestOverride(caseA, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const reqB = (await requestOverride(caseB, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      // Same requested_by/target/reason, DIFFERENT approved-against snapshot (fail vs
      // remediation_required, different outcome_id) -> different payload_hash.
      expect(reqA.payload_hash).not.toBe(reqB.payload_hash);

      let sentHash: string | undefined;
      config.iam2FetchImpl = makeFakeIam2FetchFull((path, body) => {
        if (path === "check") return { ok: true, body: { success: true, data: { decision: "allow", reason: "permission_granted" } } };
        sentHash = body.current_payload_hash as string;
        return { ok: true, body: { success: true, data: { execution_authorised: true } } };
      });
      await applyOverride(caseA, { override_id: reqA.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(sentHash).toBe(reqA.payload_hash);
    });

    // TEST G — immutable grant enforcement (also covered in the grants describe block above;
    // repeated here as a MED-3-scoped regression anchor).
    it("TEST G: role_kyc1_runtime cannot UPDATE approved_against_outcome_id or approved_against_outcome_status", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET approved_against_outcome_id = 'hacked' WHERE override_id = $1`, [req.override_id])).rejects.toMatchObject({ code: "42501" });
      await expect(appPool.query(`UPDATE kyc1.manual_override_request SET approved_against_outcome_status = 'pass' WHERE override_id = $1`, [req.override_id])).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
    });

    // TEST H (partial — migration round-trip) — the live down/up verification itself is run as
    // part of §12 validation (node-pg-migrate, not vitest); this test only confirms the two new
    // columns are visible and correctly typed/constrained from the app's own runtime connection.
    it("TEST H: approved_against_outcome_id/status are visible, NOT NULL, and CHECK-constrained from the runtime connection", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const row = await verifyPool.query(`SELECT approved_against_outcome_id, approved_against_outcome_status FROM kyc1.manual_override_request WHERE override_id = $1`, [req.override_id]);
      expect(row.rows[0].approved_against_outcome_id).not.toBeNull();
      expect(row.rows[0].approved_against_outcome_status).toBe("fail");
      await expect(
        verifyPool.query(`INSERT INTO kyc1.manual_override_request (override_id, case_id, target_type, target_outcome_status, reason_code, approved_against_outcome_id, approved_against_outcome_status, requested_by, status, payload_hash) VALUES ('kyc1ovr_bad_status',$1,'cdd_outcome','pass','manual_evidence_review',$2,'not_a_real_status','staff_x','requested','sha256:y')`, [
          caseId,
          row.rows[0].approved_against_outcome_id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("audit metadata for case_state_changed never includes approved_against_outcome_id, current_outcome_id, requested_by, or any token/hash", async () => {
      if (!schemaReady) return;
      const { caseId } = await createRemediationRequiredCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_secret", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_adverse", result_type: "identity", result_status: "fail" });
      await computeOutcome(caseId);
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "super-secret-token-value" });

      const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.manual_override_refused' AND payload_ref LIKE $1`, [`%${req.override_id}%`]);
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["compliance_officer_secret", "super-secret-token-value", "sha256:", req.payload_hash, "approved_against"]) {
        expect(serialized.includes(forbidden), `must not contain "${forbidden}"`).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — append-only invariant (D3)", () => {
    it("prior cdd_outcome row is byte-unchanged after override; new row is version+1; no verification_result/document_checklist_item row is touched", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      const beforeOutcome = (await getOutcome(caseId)).json().data;
      const beforeChecklist = (await getChecklist(caseId)).json().data.checklist;
      const beforeVerificationCount = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.verification_result WHERE case_id = $1`, [caseId]);

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const applyRes = (await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" })).json().data;

      // The PRIOR row, fetched by its own outcome_id, is byte-identical.
      const priorRowNow = await verifyPool.query(`SELECT outcome_status, outcome_reason, outcome_version, payload_hash FROM kyc1.cdd_outcome WHERE outcome_id = $1`, [beforeOutcome.outcome_id]);
      expect(priorRowNow.rows[0]).toEqual({ outcome_status: beforeOutcome.outcome_status, outcome_reason: beforeOutcome.outcome_reason, outcome_version: beforeOutcome.outcome_version, payload_hash: expect.any(String) });

      expect(applyRes.outcome_version).toBe(beforeOutcome.outcome_version + 1);

      const afterChecklist = (await getChecklist(caseId)).json().data.checklist;
      expect(afterChecklist).toEqual(beforeChecklist);

      const afterVerificationCount = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.verification_result WHERE case_id = $1`, [caseId]);
      expect(afterVerificationCount.rows[0].n).toBe(beforeVerificationCount.rows[0].n);

      const outcomeCount = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
      expect(outcomeCount.rows[0].n).toBe(2);
    });

    it("role_kyc1_runtime literally CANNOT UPDATE cdd_outcome or verification_result — the append-only guarantee is grant-enforced, not just route-logic-enforced", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      const outcome = (await getOutcome(caseId)).json().data;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(appPool.query(`UPDATE kyc1.cdd_outcome SET outcome_status = 'pass' WHERE outcome_id = $1`, [outcome.outcome_id])).rejects.toMatchObject({ code: "42501" });
      await appPool.end();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — override directions and aggregate effect", () => {
    it("fail -> pass override direction succeeds end to end", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.json().data.outcome_status).toBe("pass");
    });

    it("pass -> fail override direction succeeds end to end (override to a WORSE outcome is also permitted)", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndPassIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "fail", reason_code: "documented_compliance_exception" })).json().data;
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.outcome_status).toBe("fail");
    });

    it("fail -> remediation_required override direction succeeds end to end", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "remediation_required", reason_code: "manual_evidence_review" })).json().data;
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.outcome_status).toBe("remediation_required");
    });

    it("PRIMARY-anchor override to pass makes the whole application-level aggregate pass when no other anchor exists", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_agg_primary");
      const { caseId } = await createAndFailIndividualCase(applicationId);
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      const pubRes = await publishOutcome(applicationId);
      expect(pubRes.statusCode).toBe(201);
      expect(pubRes.json().data.aggregate_status).toBe("pass");
    });

    it("PARTY-anchor override to pass still leaves the aggregate 'fail' if the PRIMARY anchor remains failed (sibling fail wins — worst-wins semantics unaffected by override)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_agg_party");
      const { caseId: primaryCaseId } = await createAndFailIndividualCase(applicationId);

      const partyHandoff = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
      await addVerificationResult(partyHandoff.case_id, { source_type: "manual", source_id: "staff_2", result_type: "identity", result_status: "fail" });
      await computeOutcome(partyHandoff.case_id);

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(partyHandoff.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(partyHandoff.case_id, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      const pubRes = await publishOutcome(applicationId);
      expect(pubRes.statusCode).toBe(201);
      expect(pubRes.json().data.aggregate_status).toBe("fail");
      void primaryCaseId;
    });

    it("override -> pass on a case with a genuine tied conflicting evidence pair still gets refused AT PUBLISH by KYC1_OUTCOME_EVIDENCE_CONFLICT — override does not bypass the evidence-conflict check", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_evidence_conflict");
      const created = (await createHandoff({ application_id: applicationId, case_type: "individual" })).json().data;
      const sharedTimestamp = new Date().toISOString();
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ('kyc1vr_conflict_a',$1,'manual','staff_1','identity','pass','sha256:a',$2)`,
        [created.case_id, sharedTimestamp],
      );
      await verifyPool.query(
        `INSERT INTO kyc1.verification_result (verification_result_id, case_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc)
         VALUES ('kyc1vr_conflict_b',$1,'manual','staff_1','identity','fail','sha256:b',$2)`,
        [created.case_id, sharedTimestamp],
      );
      await computeOutcome(created.case_id);

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(created.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const applyRes = await applyOverride(created.case_id, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.outcome_status).toBe("pass");

      const pubRes = await publishOutcome(applicationId);
      expect(pubRes.statusCode).toBe(422);
      expect(pubRes.json().error.code).toBe("KYC1_OUTCOME_EVIDENCE_CONFLICT");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — recompute-lock (D5)", () => {
    it("compute-outcome on an overridden case is rejected KYC1_CASE_INVALID_STATE, regardless of the override's own outcome_status", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "remediation_required", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      const res = await computeOutcome(caseId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("KYC1_CASE_INVALID_STATE");
    });

    it("no new cdd_outcome row is inserted by the rejected recompute attempt", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      const before = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
      await computeOutcome(caseId);
      const after = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.cdd_outcome WHERE case_id = $1`, [caseId]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("the override remains the case's current outcome after the rejected recompute attempt", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const applied = (await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" })).json().data;
      await computeOutcome(caseId);
      const caseRow = await verifyPool.query(`SELECT current_outcome_id, current_outcome_status FROM kyc1.kyc_case WHERE case_id = $1`, [caseId]);
      expect(caseRow.rows[0]).toEqual({ current_outcome_id: applied.outcome_id, current_outcome_status: "pass" });
    });

    it("a NEW corrective case for the SAME anchor computes normally (recompute-lock scoped to the overridden case only, not the anchor)", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_corrective");
      const { caseId: firstCaseId } = await createAndFailIndividualCase(applicationId);
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(firstCaseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(firstCaseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      const { outcomeRes } = await createAndPassIndividualCase(applicationId);
      expect(outcomeRes.statusCode).toBe(201);
      expect(outcomeRes.json().data.outcome_status).toBe("pass");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — publication/delivery interaction (D2/§10 — never auto-publish, never auto-deliver)", () => {
    it("apply makes ZERO CLT-01 HTTP calls", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      config.clt1FetchImpl = (async () => {
        throw new Error("apply must never call CLT-01");
      }) as unknown as typeof fetch;
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.statusCode).toBe(200);
    });

    it("apply creates NO outcome_publication row", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      const pubRows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.outcome_publication`);
      expect(pubRows.rows[0].n).toBe(0);
    });

    it("an EXISTING publication becomes stale after an override — deliver on it fails KYC1_OUTCOME_PUBLICATION_STALE BEFORE any CLT-01 call, no new code needed", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_stale_pub");
      const { caseId } = await createAndFailIndividualCase(applicationId);
      const pub = (await publishOutcome(applicationId)).json().data;

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      // Phase 4B: the roster itself is unchanged (only the KYC-side override changed the live
      // aggregate) — /kyc-roster must succeed so TX1's own detectStaleness() can catch the
      // KYC-side mismatch; the delivery POST to /outcomes must never be reached.
      config.clt1FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
        throw new Error("must never reach CLT-01 for a stale publication");
      }) as unknown as typeof fetch;
      const deliverRes = await deliverOutcome(pub.publication_id);
      expect(deliverRes.statusCode).toBe(409);
      expect(deliverRes.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
    });

    it("explicit republish + redeliver after an override succeeds and carries the NEW value", async () => {
      if (!schemaReady) return;
      const applicationId = freshApplicationId("ovr_republish");
      const { caseId } = await createAndFailIndividualCase(applicationId);
      await publishOutcome(applicationId);

      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

      const newPub = await publishOutcome(applicationId);
      expect(newPub.statusCode).toBe(201);
      expect(newPub.json().data.aggregate_status).toBe("pass");

      config.clt1FetchImpl = realisticCltFetch();
      const deliverRes = await deliverOutcome(newPub.json().data.publication_id);
      expect(deliverRes.statusCode).toBe(200);
      expect(deliverRes.json().data.status).toBe("succeeded");
    });

    it("apply response ALWAYS carries republish_required:true and redelivery_required:true", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const res = await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      expect(res.json().data.republish_required).toBe(true);
      expect(res.json().data.redelivery_required).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3B — audit / PII sweep", () => {
    it("kyc1.manual_override_requested is emitted with exactly the approved metadata, severity medium", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;

      const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.manual_override_requested' AND payload_ref LIKE $1`, [`%${req.override_id}%`]);
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(events.rows[0]!.payload_ref);
      expect(parsed.severity).toBe("medium");
      expect(parsed.metadata).toEqual({ override_id: req.override_id, case_id: caseId, target_type: "cdd_outcome", target_outcome_status: "pass", reason_code: "manual_evidence_review" });
    });

    it("kyc1.manual_override_applied is emitted with exactly the approved metadata, severity high, in the SAME transaction as the cdd_outcome insert and kyc_case update", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      const applied = (await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" })).json().data;

      const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.manual_override_applied' AND payload_ref LIKE $1`, [`%${applied.outcome_id}%`]);
      expect(events.rows.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(events.rows[0]!.payload_ref);
      expect(parsed.severity).toBe("high");
      expect(parsed.metadata).toEqual({
        override_id: req.override_id,
        case_id: caseId,
        outcome_id: applied.outcome_id,
        outcome_status: "pass",
        outcome_version: 2,
        previous_outcome_status: "fail",
        approval_id: "appr_1",
      });
    });

    it("audit metadata never contains evidence_ref/evidence_hash/payload_hash/decision_token/decision_token_hash/source_id/requested_by value/raw IAM-02 body", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_secret_name", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "super-secret-raw-token" });

      const events = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type IN ('kyc1.manual_override_requested','kyc1.manual_override_applied') AND payload_ref LIKE $1`,
        [`%${req.override_id}%`],
      );
      const serialized = JSON.stringify(events.rows.map((r) => r.payload_ref));
      for (const forbidden of ["evidence_ref", "evidence_hash", "payload_hash", "super-secret-raw-token", "dms://", "sha256:", "data:image", "base64"]) {
        expect(serialized.includes(forbidden), `must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("no kyc1.manual_review_approved/manual_review_rejected/manual_override_denied event is ever emitted — no fabricated approver identity", async () => {
      if (!schemaReady) return;
      const { caseId } = await createAndFailIndividualCase();
      config.iam2FetchImpl = allowOverrideIam2Fetch();
      const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
      await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      const types = events.rows.map((r) => r.event_type);
      expect(types).not.toContain("kyc1.manual_review_approved");
      expect(types).not.toContain("kyc1.manual_review_rejected");
      expect(types).not.toContain("kyc1.manual_override_denied");
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 4B — authoritative roster completeness, publication binding, atomic delivery
  // integration. See routes/outcome-publication.ts's own header comment for the full design.
  // -----------------------------------------------------------------------------------------
  describe("Phase 4B — roster completeness, publication binding, atomic delivery integration", () => {
    describe("publish — roster completeness", () => {
      it("an empty roster (no required parties) still publishes normally — vacuous completeness, unchanged from Phase 2A", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_empty_roster");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(res.json().data.aggregate_status).toBe("pass");
        expect(res.json().data.required_party_count).toBe(0);
        expect(res.json().data.evaluated_party_count).toBe(0);
        expect(res.json().data.contributing_party_ids).toEqual([]);
      });

      it("a complete roster (one required party, present + passed) publishes 'pass' and stores all 5 roster fields correctly", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_complete");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_1");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        const data = res.json().data;
        expect(data.aggregate_status).toBe("pass");
        expect(data.required_party_count).toBe(1);
        expect(data.evaluated_party_count).toBe(1);
        expect(data.contributing_party_ids).toEqual(["party_1"]);
        expect(data.roster_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(typeof data.roster_fetched_at_utc).toBe("string");
      });

      it("contributing_party_ids is sorted and deduplicated for multiple required parties", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_sorted");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_z");
        await createAndPassAuthorisedPartyCase(applicationId, "party_a");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "party_z", party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: "party_a", party_type: "signatory", authority_status: "active", version: 1 },
          ],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(res.json().data.contributing_party_ids).toEqual(["party_a", "party_z"]);
      });

      it("a required party with NO KYC-01 case at all -> KYC1_OUTCOME_NOT_PUBLISHABLE, blocks outright, no publication row (never downgrades to remediation_required)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_missing_party");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_missing", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
        const rows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.outcome_publication WHERE application_id = $1`, [applicationId]);
        expect(rows.rows[0].n).toBe(0);
      });

      it("a required party WITH a case but NO outcome yet -> KYC1_OUTCOME_NOT_PUBLISHABLE (party_outcome_pending), blocks outright", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_pending_outcome");
        await createAndPassIndividualCase(applicationId);
        await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" });
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
      });

      it("only pending/active/restricted/suspended authority_status count as required — rejected/revoked parties are excluded even with no matching case", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_status_filter");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_pending");
        await createAndPassAuthorisedPartyCase(applicationId, "party_active");
        await createAndPassAuthorisedPartyCase(applicationId, "party_restricted");
        await createAndPassAuthorisedPartyCase(applicationId, "party_suspended");
        // party_rejected / party_revoked have NO matching KYC-01 case at all — if they were
        // (incorrectly) treated as required, publish would refuse with party_missing.
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "party_pending", party_type: "director", authority_status: "pending", version: 1 },
            { authorised_party_id: "party_active", party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: "party_restricted", party_type: "director", authority_status: "restricted", version: 1 },
            { authorised_party_id: "party_suspended", party_type: "director", authority_status: "suspended", version: 1 },
            { authorised_party_id: "party_rejected", party_type: "director", authority_status: "rejected", version: 1 },
            { authorised_party_id: "party_revoked", party_type: "director", authority_status: "revoked", version: 1 },
          ],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(res.json().data.required_party_count).toBe(4);
        expect(res.json().data.contributing_party_ids.sort()).toEqual(["party_active", "party_pending", "party_restricted", "party_suspended"]);
      });

      it("an extra KYC case (party_id not present in the roster at all) is excluded from the aggregate entirely, never blocks", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_extra_case");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_extra");
        config.clt1FetchImpl = cltRosterFetch({ parties: [] }); // roster requires nobody
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(res.json().data.aggregate_status).toBe("pass");
        expect(res.json().data.contributing_party_ids).toEqual([]);
        expect(res.json().data.required_party_count).toBe(0);
      });

      it("a party_id mismatch (KYC-01 case's party_id does not EXACTLY match the roster's authorised_party_id) is never fuzzy-matched — treated as both missing-required and extra", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_typo");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_1"); // KYC-01's own case uses "party_1"
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "Party_1", party_type: "director", authority_status: "active", version: 1 }], // roster uses "Party_1" — different codepoints
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
      });

      it("wrong application_status (not under_review) -> KYC1_OUTCOME_NOT_PUBLISHABLE, no publication row", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_wrong_status");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ applicationStatus: "approved", parties: [] });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
        const rows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.outcome_publication WHERE application_id = $1`, [applicationId]);
        expect(rows.rows[0].n).toBe(0);
      });

      it("CLT-01 roster fetch fails (unreachable) -> KYC1_CLT_UNAVAILABLE, no publication row", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_roster_unreachable");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterUnreachable();
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
        const rows = await verifyPool.query(`SELECT count(*)::int n FROM kyc1.outcome_publication WHERE application_id = $1`, [applicationId]);
        expect(rows.rows[0].n).toBe(0);
      });

      it("a required-party refusal still records kyc1.outcome_publication_refused atomically (refusal audit, no publication row)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_refusal_audit");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_missing", party_type: "director", authority_status: "active", version: 1 }],
        });
        await publishOutcome(applicationId);
        const events = await verifyPool.query(
          `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.outcome_publication_refused' AND payload_ref LIKE $1`,
          [`%${applicationId}%`],
        );
        expect(events.rows.length).toBeGreaterThanOrEqual(1);
        const parsed = JSON.parse(events.rows[0]!.payload_ref);
        expect(parsed.reason_code).toBe("party_missing");
      });

      it("the roster is fetched BEFORE the transaction opens — the advisory lock is not held while CLT-01 is in flight", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_no_lock_during_http");
        await createAndPassIndividualCase(applicationId);
        let lockWasFreeWhileFetching = false;
        config.clt1FetchImpl = (async (url: unknown) => {
          const urlStr = String(url);
          if (urlStr.includes("/kyc-roster")) {
            const probe = new Pool({ connectionString: TEST_DB as string });
            const r = await probe.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS got`, [`kyc1.outcome_publication:${applicationId}`]);
            lockWasFreeWhileFetching = r.rows[0].got === true;
            if (lockWasFreeWhileFetching) await probe.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`kyc1.outcome_publication:${applicationId}`]);
            await probe.end();
            return stubRosterResponse(urlStr);
          }
          throw new Error(`unexpected URL: ${urlStr}`);
        }) as typeof fetch;
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(lockWasFreeWhileFetching).toBe(true);
      });
    });

    describe("GET evidence + immutability", () => {
      it("role_kyc1_runtime cannot UPDATE any of the 5 Phase 4B roster-binding columns", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_grant_test");
        await verifyPool.query(
          `INSERT INTO kyc1.outcome_publication
             (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
              roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
           VALUES ('kyc1pub_p4b_grant_test',$1,'pass','[]','[]','seedhash','staff_1','sha256:${"a".repeat(64)}',0,0,'[]',now())`,
          [applicationId],
        );
        const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
        for (const col of ["roster_hash", "required_party_count", "evaluated_party_count", "contributing_party_ids", "roster_fetched_at_utc"]) {
          await expect(appPool.query(`UPDATE kyc1.outcome_publication SET ${col} = ${col} WHERE publication_id = 'kyc1pub_p4b_grant_test'`)).rejects.toMatchObject({
            code: "42501",
          });
        }
      });

      it("a legacy (pre-048) publication row has all 5 fields NULL and GET exposes them as null", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_legacy");
        await verifyPool.query(
          `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
           VALUES ('kyc1pub_p4b_legacy',$1,'pass','[]','[]','seedhash','staff_1')`,
          [applicationId],
        );
        const res = await getPublication("kyc1pub_p4b_legacy");
        expect(res.statusCode).toBe(200);
        const data = res.json().data;
        expect(data.roster_hash).toBeNull();
        expect(data.required_party_count).toBeNull();
        expect(data.evaluated_party_count).toBeNull();
        expect(data.contributing_party_ids).toBeNull();
        expect(data.roster_fetched_at_utc).toBeNull();
      });
    });

    describe("deliver — Phase 4B revalidation", () => {
      it("unchanged roster delivers normally; expected_roster_hash sent to CLT-01 is sourced from the STORED publication row, never request input", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_deliver_ok");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const pub = (await publishOutcome(applicationId)).json().data;

        let sentRosterHash: unknown;
        config.clt1FetchImpl = (async (url: unknown, init?: unknown) => {
          const urlStr = String(url);
          if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
          if (urlStr.includes("/outcomes")) {
            const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}");
            sentRosterHash = body.expected_roster_hash;
            return { ok: true, json: async () => ({ success: true, data: { outcome_id: "clt1cdd_p4b_ok" } }) } as Response;
          }
          throw new Error(`unexpected URL: ${urlStr}`);
        }) as typeof fetch;

        const res = await deliverOutcome(pub.publication_id);
        expect(res.statusCode).toBe(200);
        expect(sentRosterHash).toBe(pub.roster_hash);
      });

      it("a legacy (pre-048, roster_hash NULL) publication -> KYC1_OUTCOME_PUBLICATION_STALE before any CLT-01 delivery HTTP call, must be re-published", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_deliver_legacy");
        await verifyPool.query(
          `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
           VALUES ('kyc1pub_p4b_deliver_legacy',$1,'pass','[]','[]','seedhash','staff_1')`,
          [applicationId],
        );
        config.clt1FetchImpl = (async () => {
          throw new Error("must never be called — a legacy unbound publication is rejected before any CLT-01 HTTP call, including the roster fetch");
        }) as unknown as typeof fetch;
        const res = await deliverOutcome("kyc1pub_p4b_deliver_legacy");
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
      });

      it("roster_hash changed at CLT-01 (a party's authority_status flips) -> KYC1_OUTCOME_PUBLICATION_STALE / roster_changed, no delivery POST reaches CLT-01", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_deliver_roster_changed");
        await createAndPassIndividualCase(applicationId);
        await createAndPassAuthorisedPartyCase(applicationId, "party_1");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const pub = (await publishOutcome(applicationId)).json().data;

        // Same required SET, same party, but version bumped -> roster_hash changes even though
        // required_party_count/ids are unchanged.
        config.clt1FetchImpl = (async (url: unknown) => {
          const urlStr = String(url);
          if (urlStr.includes("/kyc-roster")) {
            return cltRosterFetch({ parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 2 }] })(url as never, undefined as never);
          }
          throw new Error("must not reach the delivery POST — stale roster is rejected before it");
        }) as unknown as typeof fetch;

        const res = await deliverOutcome(pub.publication_id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
        const events = await verifyPool.query(
          `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.outcome_publication_refused' AND payload_ref LIKE $1 ORDER BY created_at_utc DESC LIMIT 1`,
          [`%${pub.publication_id}%`],
        );
        expect(JSON.parse(events.rows[0]!.payload_ref).reason_code).toBe("roster_changed");
      });

      it("required party SET changed (a new required party appears) -> KYC1_OUTCOME_PUBLICATION_STALE / required_party_set_changed", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_deliver_set_changed");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const pub = (await publishOutcome(applicationId)).json().data;

        await createAndPassAuthorisedPartyCase(applicationId, "party_new");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_new", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await deliverOutcome(pub.publication_id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
        const events = await verifyPool.query(
          `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.outcome_publication_refused' AND payload_ref LIKE $1 ORDER BY created_at_utc DESC LIMIT 1`,
          [`%${pub.publication_id}%`],
        );
        expect(JSON.parse(events.rows[0]!.payload_ref).reason_code).toBe("required_party_set_changed");
      });

      it("CLT-01 rejects with CLT1_KYC_ROSTER_STALE at the actual delivery POST -> KYC1_OUTCOME_PUBLICATION_STALE, never KYC1_CLT_DELIVERY_FAILED/KYC1_CLT_UNAVAILABLE, no success audit", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_deliver_clt_stale");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const pub = (await publishOutcome(applicationId)).json().data;

        config.clt1FetchImpl = (async (url: unknown) => {
          const urlStr = String(url);
          if (urlStr.includes("/kyc-roster")) return stubRosterResponse(urlStr);
          if (urlStr.includes("/outcomes")) return { ok: false, status: 409, json: async () => ({ success: false, error: { code: "CLT1_KYC_ROSTER_STALE" } }) } as Response;
          throw new Error(`unexpected URL: ${urlStr}`);
        }) as typeof fetch;

        const res = await deliverOutcome(pub.publication_id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");

        const events = await verifyPool.query(
          `SELECT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.outcome_delivery%' AND payload_ref LIKE $1`,
          [`%${pub.publication_id}%`],
        );
        expect(events.rows.map((r) => r.event_type)).not.toContain("kyc1.outcome_delivery_succeeded");
        const row = await verifyPool.query(`SELECT status FROM kyc1.outcome_publication WHERE publication_id = $1`, [pub.publication_id]);
        expect(row.rows[0].status).toBe("failed"); // queryable, retriable via explicit republish
      });

      it("republish after a roster change succeeds and delivers normally — the only valid recovery from a stale publication", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_republish");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const pub = (await publishOutcome(applicationId)).json().data;

        await createAndPassAuthorisedPartyCase(applicationId, "party_new");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_new", party_type: "director", authority_status: "active", version: 1 }],
        });
        const staleDeliver = await deliverOutcome(pub.publication_id);
        expect(staleDeliver.statusCode).toBe(409);

        const republished = await publishOutcome(applicationId);
        expect(republished.statusCode).toBe(201);
        expect(republished.json().data.publication_id).not.toBe(pub.publication_id);

        const delivered = await deliverOutcome(republished.json().data.publication_id);
        expect(delivered.statusCode).toBe(200);
        expect(delivered.json().data.status).toBe("succeeded");
      });

      it("a blind retry of the SAME (now-superseded) stale publication_id remains refused deterministically — never silently succeeds", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_blind_retry");
        await createAndPassIndividualCase(applicationId);
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const pub = (await publishOutcome(applicationId)).json().data;

        await createAndPassAuthorisedPartyCase(applicationId, "party_new");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_new", party_type: "director", authority_status: "active", version: 1 }],
        });
        await deliverOutcome(pub.publication_id); // stale, refused
        await publishOutcome(applicationId); // republish supersedes pub

        const retry = await deliverOutcome(pub.publication_id); // blind retry of the OLD publication_id
        expect(retry.statusCode).toBe(409);
        expect(["KYC1_OUTCOME_PUBLICATION_INVALID_STATE", "KYC1_OUTCOME_PUBLICATION_STALE"]).toContain(retry.json().error.code);
      });
    });

    describe("manual override interaction with roster binding", () => {
      it("overriding the PRIMARY case to pass, while a required party still lacks any outcome -> publish still refuses (party_outcome_pending)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_ovr_primary");
        const { caseId } = await createAndFailIndividualCase(applicationId);
        await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" });

        config.iam2FetchImpl = allowOverrideIam2Fetch();
        const req = (await requestOverride(caseId, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json().data;
        await applyOverride(caseId, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
      });

      it("overriding a REQUIRED PARTY case to pass (roster otherwise complete) -> publish succeeds", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_ovr_party");
        await createAndPassIndividualCase(applicationId);
        const partyCreated = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
        await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
        await computeOutcome(partyCreated.case_id);

        config.iam2FetchImpl = allowOverrideIam2Fetch();
        const req = (await requestOverride(partyCreated.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json()
          .data;
        await applyOverride(partyCreated.case_id, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(201);
        expect(res.json().data.aggregate_status).toBe("pass");
      });

      it("an override on one required party cannot satisfy a DIFFERENT required party_id", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_ovr_wrong_party");
        await createAndPassIndividualCase(applicationId);
        const partyCreated = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
        await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
        await computeOutcome(partyCreated.case_id);

        config.iam2FetchImpl = allowOverrideIam2Fetch();
        const req = (await requestOverride(partyCreated.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json()
          .data;
        await applyOverride(partyCreated.case_id, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

        // The roster requires party_2, not party_1 — party_1's override is irrelevant to party_2.
        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_2", party_type: "director", authority_status: "active", version: 1 }],
        });
        const res = await publishOutcome(applicationId);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");
      });

      it("a roster change AFTER a successful publish makes the publication stale at deliver time (override-driven publish, then a NEW required party appears)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_ovr_then_stale");
        await createAndPassIndividualCase(applicationId);
        const partyCreated = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: "party_1" })).json().data;
        await addVerificationResult(partyCreated.case_id, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "fail" });
        await computeOutcome(partyCreated.case_id);

        config.iam2FetchImpl = allowOverrideIam2Fetch();
        const req = (await requestOverride(partyCreated.case_id, { requested_by: "compliance_officer_1", target_outcome_status: "pass", reason_code: "manual_evidence_review" })).json()
          .data;
        await applyOverride(partyCreated.case_id, { override_id: req.override_id, approval_id: "appr_1", decision_token: "tok" });

        config.clt1FetchImpl = cltRosterFetch({
          parties: [{ authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 }],
        });
        const pub = (await publishOutcome(applicationId)).json().data;
        expect(pub.aggregate_status).toBe("pass");

        // A second required party now appears on the roster — the publication is stale.
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "party_1", party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: "party_new", party_type: "director", authority_status: "active", version: 1 },
          ],
        });
        const res = await deliverOutcome(pub.publication_id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
      });
    });

    describe("migration 048 — column constraints (DB-level, superuser insert)", () => {
      it("roster_hash format CHECK rejects a non-matching string", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_hash_fmt");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
               roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ('kyc1pub_mig_hash_fmt',$1,'pass','[]','[]','h','staff_1','not-a-valid-hash',0,0,'[]',now())`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("party count bounds CHECK rejects a negative required_party_count", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_bounds");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
               roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ('kyc1pub_mig_bounds',$1,'pass','[]','[]','h','staff_1','sha256:${"a".repeat(64)}',-1,0,'[]',now())`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("all-or-none CHECK rejects a partially-bound row (roster_hash set, the other 4 fields NULL)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_partial");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by, roster_hash)
             VALUES ('kyc1pub_mig_partial',$1,'pass','[]','[]','h','staff_1','sha256:${"a".repeat(64)}')`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("evaluated_party_count must equal required_party_count CHECK rejects a mismatch", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_eval_mismatch");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
               roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ('kyc1pub_mig_eval_mismatch',$1,'pass','[]','[]','h','staff_1','sha256:${"a".repeat(64)}',1,2,'["a"]',now())`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("contributing_party_ids length must equal required_party_count CHECK rejects a mismatch", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_len_mismatch");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
               roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ('kyc1pub_mig_len_mismatch',$1,'pass','[]','[]','h','staff_1','sha256:${"a".repeat(64)}',1,1,'[]',now())`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("contributing_party_ids must be a JSON array CHECK rejects a JSON object", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_not_array");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by,
               roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ('kyc1pub_mig_not_array',$1,'pass','[]','[]','h','staff_1','sha256:${"a".repeat(64)}',0,0,'{}',now())`,
            [applicationId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("a fully NULL roster binding (legacy shape) is still accepted — the all-or-none CHECK permits all-NULL", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("p4b_mig_all_null_ok");
        await expect(
          verifyPool.query(
            `INSERT INTO kyc1.outcome_publication (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by)
             VALUES ('kyc1pub_mig_all_null_ok',$1,'pass','[]','[]','h','staff_1')`,
            [applicationId],
          ),
        ).resolves.toBeDefined();
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  // INFO-17 closure — restores a GLOBAL sweep of the whole outbox table for event types that
  // remain forbidden even after Phase 3B. Deliberately does NOT include kyc1.manual_override_
  // requested/_applied/_refused (all now genuinely reachable) or kyc1.sensitive_evidence_read
  // (Phase 3A, also genuinely reachable) — only checks names that have NO implementation anywhere
  // in KYC-01, at any phase.
  // -----------------------------------------------------------------------------------------
  describe("global forbidden-event sweep (INFO-17 restoration)", () => {
    it("no kyc1.manual_review_requested/_approved/_rejected event exists ANYWHERE in the outbox — this codebase implements manual OVERRIDE, never a manual REVIEW queue (D10)", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      const types = events.rows.map((r) => r.event_type);
      expect(types).not.toContain("kyc1.manual_review_requested");
      expect(types).not.toContain("kyc1.manual_review_approved");
      expect(types).not.toContain("kyc1.manual_review_rejected");
    });

    it("no kyc1.manual_override_denied event exists ANYWHERE in the outbox — the one refusal event is manual_override_refused", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      expect(events.rows.map((r) => r.event_type)).not.toContain("kyc1.manual_override_denied");
    });

    it("no kyc1.outcome_published event exists ANYWHERE in the outbox — publish emits kyc1.outcome_publication_requested/_superseded/_refused, never this name", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      expect(events.rows.map((r) => r.event_type)).not.toContain("kyc1.outcome_published");
    });

    it("no ubo_*/edd_*/vendor_*/proofing_*/reconciliation_* event type exists ANYWHERE in the outbox — none of that scope exists in KYC-01 through Phase 3B", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%'`);
      const types = events.rows.map((r) => r.event_type);
      for (const prefix of ["kyc1.ubo", "kyc1.edd", "kyc1.vendor", "kyc1.proofing", "kyc1.reconciliation", "kyc1.biometric"]) {
        expect(types.some((t) => t.startsWith(prefix)), `no event type should start with "${prefix}"`).toBe(false);
      }
    });

    // The exact global 21-member event-type inventory assertion (formerly here) has moved to the
    // very end of the file, in its own "FINAL KYC AUDIT EVENT INVENTORY" describe block — it must
    // run AFTER every kyc1.*-event-emitting test in this file, including the Phase 4A.2B block
    // below, since kyc1.roster_sync_processed is not yet emitted at this point in declaration
    // order (Vitest runs a file's tests in declaration order). See that block's own doc comment.
  });

  // -----------------------------------------------------------------------------------------
  // Phase 4A.2B — KYC anchor sync (roster-sync). CLT-01 is stubbed throughout (this file has no
  // clt1.* schema access) — see tests/integration/kyc1-clt1-roster-sync-e2e-real.test.ts for the
  // organic, no-raw-SQL, real-HTTP-both-ways D1-closing end-to-end test.
  // -----------------------------------------------------------------------------------------
  describe("Phase 4A.2B — KYC anchor sync (roster-sync)", () => {
    describe("shared case-creation extraction — source-level proof", () => {
      it("handoffs.ts and roster-sync.ts both call the SAME shared createKycCaseWithChecklist exactly once each — never a duplicated INSERT/checklist/audit sequence", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const handoffsSrc = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "routes", "handoffs.ts"), "utf8");
        const rosterSyncSrc = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "routes", "roster-sync.ts"), "utf8");
        expect((handoffsSrc.match(/createKycCaseWithChecklist\(/g) ?? []).length).toBe(1);
        expect((rosterSyncSrc.match(/createKycCaseWithChecklist\(/g) ?? []).length).toBe(1);
        expect(handoffsSrc).not.toMatch(/INSERT INTO kyc1\.kyc_case/);
        expect(rosterSyncSrc).not.toMatch(/INSERT INTO kyc1\.kyc_case/);
      });

      it("roster-sync.ts fetches the CLT-01 roster BEFORE opening any transaction — no CLT HTTP call is ever made from inside withTransaction", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const src = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "routes", "roster-sync.ts"), "utf8");
        const fetchIndex = src.indexOf("await fetchClt1KycRoster(");
        // Targets the MAIN sync transaction specifically (`outcome = await withTransaction(`) —
        // not the best-effort refusal-audit helper's own, unrelated `withTransaction` call earlier
        // in the file, which would otherwise produce a false "fetch is after the transaction" read.
        const transactionIndex = src.indexOf("outcome = await withTransaction(");
        expect(fetchIndex).toBeGreaterThan(-1);
        expect(transactionIndex).toBeGreaterThan(-1);
        expect(fetchIndex).toBeLessThan(transactionIndex);
      });

      it("REQUIRED_AUTHORITY_STATUSES and the application lock helper are exported from a KYC lib module, never re-declared in a route module", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const controlsSrc = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "lib", "roster-controls.ts"), "utf8");
        expect(controlsSrc).toMatch(/export const REQUIRED_AUTHORITY_STATUSES/);
        expect(controlsSrc).toMatch(/export async function takeKycApplicationLock/);
        const publicationSrc = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "routes", "outcome-publication.ts"), "utf8");
        const rosterSyncSrc = fs.readFileSync(path.join(__dirname, "..", "..", "services", "kyc1", "src", "routes", "roster-sync.ts"), "utf8");
        expect(publicationSrc).not.toMatch(/const REQUIRED_AUTHORITY_STATUSES/);
        expect(publicationSrc).toMatch(/from "\.\.\/lib\/roster-controls\.js"/);
        expect(rosterSyncSrc).toMatch(/from "\.\.\/lib\/roster-controls\.js"/);
      });
    });

    describe("organic capture — required-party creation", () => {
      it("empty required roster: 200, created_count=0, skipped_count=0, required_party_count=0, empty created_anchors", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_empty");
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const res = await rosterSync(applicationId);
        expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
        expect(res.json().data).toMatchObject({ application_id: applicationId, required_party_count: 0, created_count: 0, skipped_count: 0, created_anchors: [] });
      });

      it("one required party (pending): creates exactly one authorised_party case with the exact matching party_id", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_one");
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_one", party_type: "director", authority_status: "pending", version: 1 }] });
        const res = await rosterSync(applicationId);
        expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
        const data = res.json().data;
        expect(data.created_count).toBe(1);
        expect(data.skipped_count).toBe(0);
        expect(data.created_anchors).toEqual([{ party_id: "clt1ap_one", case_id: expect.any(String) }]);
        const caseRows = await verifyPool.query(`SELECT case_type, party_id, application_id FROM kyc1.kyc_case WHERE application_id = $1`, [applicationId]);
        expect(caseRows.rows).toEqual([{ case_type: "authorised_party", party_id: "clt1ap_one", application_id: applicationId }]);
      });

      it("several required parties: creates one case per party, response sorted by party_id (code-point order)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_several");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "clt1ap_c", party_type: "ubo", authority_status: "active", version: 1 },
            { authorised_party_id: "clt1ap_a", party_type: "director", authority_status: "pending", version: 1 },
            { authorised_party_id: "clt1ap_b", party_type: "signatory", authority_status: "restricted", version: 1 },
          ],
        });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(data.created_count).toBe(3);
        expect(data.created_anchors.map((a: { party_id: string }) => a.party_id)).toEqual(["clt1ap_a", "clt1ap_b", "clt1ap_c"]);
      });

      it("all four required authority statuses (pending/active/restricted/suspended) are all treated as required and get cases created", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_statuses");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "clt1ap_pending", party_type: "director", authority_status: "pending", version: 1 },
            { authorised_party_id: "clt1ap_active", party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: "clt1ap_restricted", party_type: "director", authority_status: "restricted", version: 1 },
            { authorised_party_id: "clt1ap_suspended", party_type: "director", authority_status: "suspended", version: 1 },
          ],
        });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(data.required_party_count).toBe(4);
        expect(data.created_count).toBe(4);
      });

      it("rejected/revoked authority_status parties are EXCLUDED from the required set — no case created for either", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_excluded");
        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: "clt1ap_rejected", party_type: "director", authority_status: "rejected", version: 1 },
            { authorised_party_id: "clt1ap_revoked", party_type: "director", authority_status: "revoked", version: 1 },
          ],
        });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(data.required_party_count).toBe(0);
        expect(data.created_count).toBe(0);
        const caseRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1`, [applicationId]);
        expect(Number(caseRows.rows[0].count)).toBe(0);
      });
    });

    describe("primary anchor reporting — never enforced by this route", () => {
      it("primary absent: primary_anchor_present=false, sync still succeeds (200)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_noprimary");
        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const res = await rosterSync(applicationId);
        expect(res.statusCode).toBe(200);
        expect(res.json().data.primary_anchor_present).toBe(false);
      });

      it("primary present (matching primary_subject_type): primary_anchor_present=true", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_primary");
        await createHandoff({ application_id: applicationId, case_type: "individual" });
        config.clt1FetchImpl = cltRosterFetch({ primarySubjectType: "individual", parties: [] });
        const res = await rosterSync(applicationId);
        expect(res.json().data.primary_anchor_present).toBe(true);
      });

      it("roster-sync never creates a primary case itself, regardless of primary_anchor_present", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_noprimarycreate");
        config.clt1FetchImpl = cltRosterFetch({ primarySubjectType: "entity", parties: [] });
        await rosterSync(applicationId);
        const primaryRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1 AND party_id IS NULL`, [applicationId]);
        expect(Number(primaryRows.rows[0].count)).toBe(0);
      });
    });

    describe("idempotency", () => {
      it("repeated sync: second call is a no-op — created_count=0, skipped_count=required_party_count, no new case/checklist row, no duplicate kyc1.case_created event", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_repeat");
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_repeat", party_type: "director", authority_status: "pending", version: 1 }] });
        const first = await rosterSync(applicationId);
        expect(first.json().data.created_count).toBe(1);
        const second = await rosterSync(applicationId);
        const data = second.json().data;
        expect(data.created_count).toBe(0);
        expect(data.skipped_count).toBe(1);
        const caseRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1 AND party_id = 'clt1ap_repeat'`, [applicationId]);
        expect(Number(caseRows.rows[0].count)).toBe(1);
        const checklistRows = await verifyPool.query(
          `SELECT count(*) FROM kyc1.document_checklist_item dci JOIN kyc1.kyc_case kc ON kc.case_id = dci.case_id WHERE kc.application_id = $1`,
          [applicationId],
        );
        expect(Number(checklistRows.rows[0].count)).toBe(2);
        const auditRows = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'kyc1.case_created' AND payload_ref LIKE $1`, [`%${applicationId}%`]);
        expect(Number(auditRows.rows[0].count)).toBe(1);
      });

      it("completed case: retry is skipped — a previously-passed anchor is never superseded by a fresh, uncomputed case (the load-bearing correctness property)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_completed");
        const partyId = "clt1ap_completed";
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyId, party_type: "director", authority_status: "active", version: 1 }] });
        const first = await rosterSync(applicationId);
        const caseId = first.json().data.created_anchors[0].case_id;
        for (const dt of ["identity_document", "authority_evidence"]) await addEvidence(caseId, { document_type: dt, evidence_ref: `dms://${partyId}-${dt}` });
        const checklist = (await getChecklist(caseId)).json().data.checklist as Array<{ checklist_item_id: string; document_type: string }>;
        for (const dt of ["identity_document", "authority_evidence"]) {
          const item = checklist.find((c) => c.document_type === dt)!;
          await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id });
        }
        await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
        const outcomeRes = await computeOutcome(caseId);
        expect(outcomeRes.json().data.outcome_status).toBe("pass");

        const retry = await rosterSync(applicationId);
        expect(retry.json().data.created_count).toBe(0);
        expect(retry.json().data.skipped_count).toBe(1);
        const caseRows = await verifyPool.query(`SELECT case_id, status, current_outcome_status FROM kyc1.kyc_case WHERE application_id = $1 AND party_id = $2`, [applicationId, partyId]);
        expect(caseRows.rows).toEqual([{ case_id: caseId, status: "completed", current_outcome_status: "pass" }]);
      });

      it("open corrective case: retry is skipped even though TWO cases already exist for the same anchor (one completed, one corrective) — no THIRD case created", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_corrective");
        const partyId = "clt1ap_corrective";
        const firstCase = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: partyId })).json().data;
        await verifyPool.query(`UPDATE kyc1.kyc_case SET status = 'completed', current_outcome_status = 'fail' WHERE case_id = $1`, [firstCase.case_id]);
        await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: partyId });

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyId, party_type: "director", authority_status: "active", version: 1 }] });
        const res = await rosterSync(applicationId);
        expect(res.json().data.created_count).toBe(0);
        expect(res.json().data.skipped_count).toBe(1);
        const caseRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1 AND party_id = $2`, [applicationId, partyId]);
        expect(Number(caseRows.rows[0].count)).toBe(2);
      });

      it("failed / remediation case: retry is skipped, no duplicate", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_failed");
        const partyId = "clt1ap_failed";
        const created = (await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: partyId })).json().data;
        await verifyPool.query(`UPDATE kyc1.kyc_case SET status = 'remediation', current_outcome_status = 'remediation_required' WHERE case_id = $1`, [created.case_id]);

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyId, party_type: "director", authority_status: "active", version: 1 }] });
        const res = await rosterSync(applicationId);
        expect(res.json().data.created_count).toBe(0);
        const caseRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1 AND party_id = $2`, [applicationId, partyId]);
        expect(Number(caseRows.rows[0].count)).toBe(1);
      });

      it("one existing and one missing: only the missing party gets a new case", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_mixed");
        const existingPartyId = "clt1ap_mixed_existing";
        const missingPartyId = "clt1ap_mixed_missing";
        await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: existingPartyId });

        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: existingPartyId, party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: missingPartyId, party_type: "ubo", authority_status: "pending", version: 1 },
          ],
        });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(data.created_count).toBe(1);
        expect(data.skipped_count).toBe(1);
        expect(data.created_anchors).toEqual([{ party_id: missingPartyId, case_id: expect.any(String) }]);
      });
    });

    describe("concurrency — deterministic advisory-lock barrier", () => {
      it("two concurrent roster-sync calls for the same application create exactly one case per missing anchor — no duplicate, no 40P01", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_race");
        const partyIds = ["clt1ap_race_1", "clt1ap_race_2", "clt1ap_race_3"];
        config.clt1FetchImpl = cltRosterFetch({ parties: partyIds.map((id) => ({ authorised_party_id: id, party_type: "director", authority_status: "active", version: 1 })) });

        const barrierClient = await verifyPool.connect();
        await barrierClient.query("BEGIN");
        await barrierClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kyc1.outcome_publication:${applicationId}`]);

        let firstSettled = false;
        let secondSettled = false;
        const firstPromise = rosterSync(applicationId).then((r) => {
          firstSettled = true;
          return r;
        });
        const secondPromise = rosterSync(applicationId).then((r) => {
          secondSettled = true;
          return r;
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(firstSettled, "first call must still be blocked on the held advisory lock").toBe(false);
        expect(secondSettled, "second call must still be blocked on the held advisory lock").toBe(false);

        await barrierClient.query("COMMIT");
        barrierClient.release();

        const [firstRes, secondRes] = await Promise.all([firstPromise, secondPromise]);
        expect(firstRes.statusCode, JSON.stringify(firstRes.json())).toBe(200);
        expect(secondRes.statusCode, JSON.stringify(secondRes.json())).toBe(200);
        const firstCreated = firstRes.json().data.created_count as number;
        const secondCreated = secondRes.json().data.created_count as number;
        expect([firstCreated, secondCreated].sort()).toEqual([0, 3]);

        const caseRows = await verifyPool.query(`SELECT party_id FROM kyc1.kyc_case WHERE application_id = $1 AND case_type = 'authorised_party' ORDER BY party_id`, [applicationId]);
        expect(caseRows.rows.map((r) => r.party_id)).toEqual(partyIds);
      }, 10_000);
    });

    describe("application lifecycle — refused outside under_review", () => {
      for (const status of ["draft", "submitted", "held", "approved", "rejected", "cancelled"]) {
        it(`sync against a CLT-01 application reported as '${status}' is refused with KYC1_APPLICATION_INVALID_STATE/409`, async () => {
          if (!schemaReady) return;
          const applicationId = freshApplicationId(`rostersync_${status}`);
          config.clt1FetchImpl = cltRosterFetch({ applicationStatus: status, parties: [] });
          const res = await rosterSync(applicationId);
          expect(res.statusCode).toBe(409);
          expect(res.json().error.code).toBe("KYC1_APPLICATION_INVALID_STATE");
          const caseRows = await verifyPool.query(`SELECT count(*) FROM kyc1.kyc_case WHERE application_id = $1`, [applicationId]);
          expect(Number(caseRows.rows[0].count)).toBe(0);
        });
      }
    });

    describe("CLT-01 roster fetch failure", () => {
      it("roster unreachable (network error): KYC1_CLT_UNAVAILABLE/503, no case created", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_unreachable");
        config.clt1FetchImpl = cltRosterUnreachable();
        const res = await rosterSync(applicationId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
      });

      it("malformed roster response: KYC1_CLT_UNAVAILABLE/503", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_malformed");
        config.clt1FetchImpl = cltRosterMalformed();
        const res = await rosterSync(applicationId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
      });

      it("roster response echoes a DIFFERENT application_id than requested: rejected as malformed -> KYC1_CLT_UNAVAILABLE/503", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_wrongid");
        config.clt1FetchImpl = cltRosterWrongApplicationId();
        const res = await rosterSync(applicationId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("KYC1_CLT_UNAVAILABLE");
      });
    });

    describe("exact-match anchor identity — no fuzzy/prefix matching", () => {
      it("a near-miss existing party_id does NOT satisfy a required party with a different id — a fresh case is created for the exact required id", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_nearmiss");
        const nearMissId = "clt1ap_near_miss_X9";
        const requiredId = "clt1ap_near_miss_X";
        await createHandoff({ application_id: applicationId, case_type: "authorised_party", party_id: nearMissId });

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: requiredId, party_type: "director", authority_status: "active", version: 1 }] });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(data.created_count).toBe(1);
        expect(data.created_anchors).toEqual([{ party_id: requiredId, case_id: expect.any(String) }]);
        const partyIds = await verifyPool.query(`SELECT party_id FROM kyc1.kyc_case WHERE application_id = $1 ORDER BY party_id`, [applicationId]);
        expect(partyIds.rows.map((r) => r.party_id).sort()).toEqual([nearMissId, requiredId].sort());
      });
    });

    describe("removed/replaced parties and interaction with existing Phase 4B publish/deliver gates", () => {
      async function passCase(caseId: string, isParty: boolean): Promise<void> {
        const dts = isParty ? ["identity_document", "authority_evidence"] : ["identity_document"];
        for (const dt of dts) await addEvidence(caseId, { document_type: dt, evidence_ref: `dms://${caseId}-${dt}` });
        const checklist = (await getChecklist(caseId)).json().data.checklist as Array<{ checklist_item_id: string; document_type: string }>;
        for (const dt of dts) {
          const item = checklist.find((c) => c.document_type === dt)!;
          await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_1", result_type: "document", result_status: "pass", checklist_item_id: item.checklist_item_id });
        }
        await addVerificationResult(caseId, { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "pass" });
        await computeOutcome(caseId);
      }

      it("party added after sync: publication blocks with party_missing; a re-sync creates its case but publication still waits on its own outcome", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_added_after");
        const partyA = "clt1ap_added_after_a";
        const partyB = "clt1ap_added_after_b";
        await createHandoff({ application_id: applicationId, case_type: "individual" });

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyA, party_type: "director", authority_status: "active", version: 1 }] });
        const syncA = await rosterSync(applicationId);
        const caseA = syncA.json().data.created_anchors[0].case_id;
        const cases = (await listCases(`application_id=${applicationId}`)).json().data.cases as Array<{ case_id: string; party_id: string | null }>;
        const primaryCase = cases.find((c) => c.party_id === null)!.case_id;
        await passCase(primaryCase, false);
        await passCase(caseA, true);

        const publishOk = await publishOutcome(applicationId);
        expect(publishOk.statusCode, JSON.stringify(publishOk.json())).toBe(201);

        config.clt1FetchImpl = cltRosterFetch({
          parties: [
            { authorised_party_id: partyA, party_type: "director", authority_status: "active", version: 1 },
            { authorised_party_id: partyB, party_type: "ubo", authority_status: "pending", version: 1 },
          ],
        });
        const publishBlocked = await publishOutcome(applicationId);
        expect(publishBlocked.statusCode).toBe(422);
        expect(publishBlocked.json().error.code).toBe("KYC1_OUTCOME_NOT_PUBLISHABLE");

        const resync = await rosterSync(applicationId);
        expect(resync.json().data.created_count).toBe(1);
        const publishStillBlocked = await publishOutcome(applicationId);
        expect(publishStillBlocked.statusCode).toBe(422);
      });

      it("revoked party becomes an extra case — does not block publication", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_revoked");
        const partyId = "clt1ap_revoked_after";
        await createHandoff({ application_id: applicationId, case_type: "individual" });

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyId, party_type: "director", authority_status: "active", version: 1 }] });
        const sync = await rosterSync(applicationId);
        const caseId = sync.json().data.created_anchors[0].case_id;
        const cases = (await listCases(`application_id=${applicationId}`)).json().data.cases as Array<{ case_id: string; party_id: string | null }>;
        const primaryCase = cases.find((c) => c.party_id === null)!.case_id;
        await passCase(primaryCase, false);
        await passCase(caseId, true);

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: partyId, party_type: "director", authority_status: "revoked", version: 1 }] });
        const publish = await publishOutcome(applicationId);
        expect(publish.statusCode, JSON.stringify(publish.json())).toBe(201);
        expect(publish.json().data.required_party_count).toBe(0);
      });

      it("roster changed after publication causes stale delivery — roster-sync's own creation does not weaken the existing Phase 4B staleness check", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_stale_delivery");
        await createHandoff({ application_id: applicationId, case_type: "individual" });
        const primaryCase = (await listCases(`application_id=${applicationId}`)).json().data.cases[0].case_id;
        await passCase(primaryCase, false);

        config.clt1FetchImpl = cltRosterFetch({ parties: [] });
        const publish = await publishOutcome(applicationId);
        expect(publish.statusCode, JSON.stringify(publish.json())).toBe(201);
        const publicationId = publish.json().data.publication_id;

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_post_publish", party_type: "director", authority_status: "active", version: 1 }] });
        await rosterSync(applicationId);

        const deliver = await deliverOutcome(publicationId);
        expect(deliver.statusCode).toBe(409);
        expect(deliver.json().error.code).toBe("KYC1_OUTCOME_PUBLICATION_STALE");
      });

      it("replacement party: a new authorised_party_id requires a new anchor; the old party's case is retained (never rewritten/deleted)", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_replacement");
        const oldPartyId = "clt1ap_replaced_old";
        const newPartyId = "clt1ap_replaced_new";
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: oldPartyId, party_type: "director", authority_status: "active", version: 1 }] });
        const first = await rosterSync(applicationId);
        const oldCaseId = first.json().data.created_anchors[0].case_id;

        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: newPartyId, party_type: "director", authority_status: "active", version: 1 }] });
        const second = await rosterSync(applicationId);
        expect(second.json().data.created_count).toBe(1);
        expect(second.json().data.created_anchors[0].party_id).toBe(newPartyId);

        const oldRow = await verifyPool.query(`SELECT case_id, party_id FROM kyc1.kyc_case WHERE case_id = $1`, [oldCaseId]);
        expect(oldRow.rows).toEqual([{ case_id: oldCaseId, party_id: oldPartyId }]);
        const allRows = await verifyPool.query(`SELECT party_id FROM kyc1.kyc_case WHERE application_id = $1 ORDER BY party_id`, [applicationId]);
        expect(allRows.rows.map((r) => r.party_id)).toEqual([newPartyId, oldPartyId].sort());
      });
    });

    describe("audit / PII sweep", () => {
      it("roster-sync NEVER emits kyc1.handoff_received — that event remains exclusively the handoff route's own fact", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_no_handoff_audit");
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_no_handoff", party_type: "director", authority_status: "active", version: 1 }] });
        await rosterSync(applicationId);
        const events = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${applicationId}%`]);
        expect(events.rows.map((r) => r.event_type)).not.toContain("kyc1.handoff_received");
      });

      it("the handoff route STILL emits kyc1.handoff_received exactly once per call, unaffected by the shared-service refactor", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_handoff_unchanged");
        await createHandoff({ application_id: applicationId, case_type: "individual" });
        const events = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'kyc1.handoff_received' AND payload_ref LIKE $1`, [`%${applicationId}%`]);
        expect(Number(events.rows[0].count)).toBe(1);
      });

      it("kyc1.roster_sync_processed is published exactly once per call, result='success', bounded non-PII metadata only", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_audit_success");
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_audit_ok", party_type: "director", authority_status: "active", version: 1 }] });
        await rosterSync(applicationId);
        const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.roster_sync_processed' AND payload_ref LIKE $1`, [
          `%${applicationId}%`,
        ]);
        expect(events.rows).toHaveLength(1);
        const envelope = JSON.parse(events.rows[0].payload_ref);
        expect(envelope.result).toBe("success");
        const metadata = envelope.metadata;
        expect(metadata).toMatchObject({ application_id: applicationId, required_party_count: 1, created_count: 1, skipped_count: 0, primary_anchor_present: false });
        expect(Object.keys(metadata).sort()).toEqual(["application_id", "created_count", "primary_anchor_present", "required_party_count", "roster_hash", "skipped_count"]);
        for (const forbidden of ["party_reference", "party_type", "authorised_party_id", "clt1ap_audit_ok", "name", "email"]) {
          expect(JSON.stringify(metadata)).not.toContain(forbidden);
        }
      });

      it("kyc1.roster_sync_processed is published on refusal too, result='blocked', with a bounded reason_code", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_audit_blocked");
        config.clt1FetchImpl = cltRosterFetch({ applicationStatus: "draft", parties: [] });
        await rosterSync(applicationId);
        const events = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'kyc1.roster_sync_processed' AND payload_ref LIKE $1`, [
          `%${applicationId}%`,
        ]);
        expect(events.rows).toHaveLength(1);
        const envelope = JSON.parse(events.rows[0].payload_ref);
        expect(envelope.result).toBe("blocked");
        expect(envelope.reason_code).toBe("application_status_ineligible");
      });

      it("the response body carries no PII — only opaque application_id/roster_hash/party_id/case_id and bounded counts", async () => {
        if (!schemaReady) return;
        const applicationId = freshApplicationId("rostersync_response_pii");
        config.clt1FetchImpl = cltRosterFetch({ parties: [{ authorised_party_id: "clt1ap_pii_check", party_type: "director", authority_status: "active", version: 1 }] });
        const res = await rosterSync(applicationId);
        const data = res.json().data;
        expect(Object.keys(data).sort()).toEqual(
          ["application_id", "application_status", "created_anchors", "created_count", "primary_anchor_present", "required_party_count", "roster_hash", "skipped_count"].sort(),
        );
        expect(Object.keys(data.created_anchors[0]).sort()).toEqual(["case_id", "party_id"]);
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  // FINAL KYC AUDIT EVENT INVENTORY — MUST be the LAST describe block in this file. The exact
  // global inventory assertion moved here from the INFO-17 sweep (Vitest runs a file's tests in
  // declaration order; the original position ran BEFORE the Phase 4A.2B block above, so
  // kyc1.roster_sync_processed had not yet been organically emitted on a fresh database — an
  // order-dependent false failure, reproduced independently on a fresh Postgres by the Phase
  // 4A.2B review). Placed here, every event-emitting describe block in the file (including Phase
  // 4A.2B's own roster-sync tests) has already run, so the assertion is deterministic regardless
  // of database freshness. This is the ONLY exact global kyc1.% event-type inventory assertion in
  // this file — do not duplicate it elsewhere.
  // -----------------------------------------------------------------------------------------
  describe("FINAL KYC AUDIT EVENT INVENTORY", () => {
    it("global forbidden-event sweep (INFO-17 restoration): the full set of kyc1.% event types ANYWHERE in the outbox is exactly the 21 approved ones (the original 20 + Phase 4A.2B's kyc1.roster_sync_processed) — no extra, no accidental new event type", async () => {
      if (!schemaReady) return;
      const events = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'kyc1.%' ORDER BY event_type`);
      const types = events.rows.map((r) => r.event_type);
      expect(types).toEqual(
        [
          "kyc1.case_created",
          "kyc1.document_reference_added",
          "kyc1.document_rejected",
          "kyc1.document_verified",
          "kyc1.entity_failed",
          "kyc1.entity_verified",
          "kyc1.handoff_received",
          "kyc1.identity_failed",
          "kyc1.identity_verified",
          "kyc1.manual_override_applied",
          "kyc1.manual_override_refused",
          "kyc1.manual_override_requested",
          "kyc1.outcome_computed",
          "kyc1.outcome_delivery_attempted",
          "kyc1.outcome_delivery_failed",
          "kyc1.outcome_delivery_succeeded",
          "kyc1.outcome_publication_refused",
          "kyc1.outcome_publication_requested",
          "kyc1.outcome_publication_superseded",
          "kyc1.roster_sync_processed",
          "kyc1.sensitive_evidence_read",
        ].sort(),
      );
    });
  });
});
