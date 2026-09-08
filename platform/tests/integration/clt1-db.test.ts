/**
 * CLT-01 Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 DB-gated integration tests.
 * Self-skip unless `TEST_DATABASE_URL` points at a Postgres that already has `foundation` (001,
 * 005), `iam2` (006, 007, 011, 013, 017, 019, 022, 024, 026, 028, 030) and CLT-01's own `clt1`
 * schema (020, 021, 023, 025, 027, 029) migrated, with `fnd_runtime_grants.sql`,
 * `iam2_runtime_grants.sql`, and `clt1_runtime_grants.sql`
 * all applied.
 *
 * Connects as `role_clt1_runtime` via a real LOGIN role from the START (S1 lesson applied from
 * day one, per every prior module's own precedent — never superuser-only). A separate superuser
 * `pg.Pool` (`verifyPool`) is used for fixture setup/independent verification, never to drive the
 * app itself.
 *
 * No live CFG-01 or IAM-02 service is started here — `config.cfg1FetchImpl`/`config.iam2FetchImpl`
 * (Clt1Config's DI seams, mirroring CFG-01's own identical `Cfg1Config.iam2FetchImpl`) are stubbed
 * per test, same precedent `tests/integration/cfg1-db.test.ts` already set for the identical
 * dependency shape. The REAL, non-stubbed IAM-02 guard is proven separately in
 * `tests/integration/clt1-iam2-guard-real.test.ts` (mirrors `cfg1-iam2-guard-real.test.ts`). What
 * IS real here: the clt1 DB, `role_clt1_runtime`, the actual HTTP routes, the actual
 * state-machine/audit/CDD-gate code, and Postgres's own grant enforcement.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Clt1Config } from "../../services/clt1/src/config.js";
import { buildApp } from "../../services/clt1/src/server.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "clt1_app_test";

const config: Clt1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-clt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-it",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-clt1-cfg1-token-it",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-clt1-iam2-token-it",
};

// ---------------------------------------------------------------------------------------------
// Fake IAM-02 fetch stub — permission/check + execute-verify. Phase 2's own equivalent of the
// makeFakeCfg1Fetch helper below, same fail-closed-by-default philosophy.
// ---------------------------------------------------------------------------------------------
function makeFakeIam2Fetch(opts: {
  checkDecision?: (body: Record<string, unknown>) => { decision: string; reason: string };
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
        return {
          ok: false,
          json: async () => ({ success: false, error: { code: result.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }),
        } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: result.execution_authorised ?? true } }) } as Response;
    }
    throw new Error(`Unexpected URL in Phase 2 IAM-02 test fake: ${urlStr}`);
  }) as typeof fetch;
}

/** Allow-everything IAM-02 stub — baseline permission_granted, execute-verify always authorises.
 * The default for tests exercising CLT-01's own logic, not IAM-02's. */
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

/** Authenticated Principal -> Client Membership Authority — maker-checker substitution proof
 * helper: execute-verify only authorises if the CURRENT recomputed payload hash CLT sends
 * (`current_payload_hash`) matches the hash captured at request time. Unlike `allowAllIam2Fetch`
 * (which ignores the hash entirely), this genuinely proves CLT's own recomputation changes when
 * the underlying decision-request row is tampered — an approval minted for one payload can never
 * authorise a DIFFERENT (tampered) payload. */
function hashCheckingIam2Fetch(expectedPayloadHash: string): typeof fetch {
  return makeFakeIam2Fetch({
    verify: (body) => {
      const ok = body.current_payload_hash === expectedPayloadHash;
      return { ok, execution_authorised: ok, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" };
    },
  });
}

/** Authenticated Principal -> Client Membership Authority — deterministic-overlap concurrency
 * barrier (SECURITY REMEDIATION discipline already established above: never a bare Promise.all
 * timing assumption). Both racing add/apply calls stall in their own execute-verify network call
 * for the SAME delay before either can reach its INSERT, forcing genuine overlap at the
 * partial-unique-index INSERT itself — the index's own row-level lock, not test timing, is what
 * then determines the winner. */
function delayedAllowAllIam2Fetch(delayMs: number): typeof fetch {
  const inner = allowAllIam2Fetch();
  return (async (url: unknown, init?: unknown) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return inner(url as never, init as never);
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// Fake CFG-01 fetch stub (evaluate() only — CLT-01 Phase 1 never calls verify-decision).
// ---------------------------------------------------------------------------------------------
interface FakeCfg1Decision {
  decision: "allow" | "deny";
  reason_code: string;
}

function makeFakeCfg1Fetch(decide: (body: Record<string, unknown>) => FakeCfg1Decision): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    if (urlStr.endsWith("/internal/cfg1/features/evaluate")) {
      const result = decide(body);
      return {
        ok: true,
        json: async () => ({ success: true, data: { decision: result.decision, reason_code: result.reason_code, decision_id: "cfgdec_test_" + Math.random().toString(36).slice(2) } }),
      } as Response;
    }
    throw new Error(`Unexpected URL in Phase 1 test fake: ${urlStr}`);
  }) as typeof fetch;
}

/** Simulates a real, fully-governed CFG-01: institutional/hnwi/professional allowed (as if an
 * operator already ran the CFG-01 Phase 3A governed mutation workflow to enable them), retail
 * denied via the REAL permanent prohibited-registry reason_code ("prohibited") — mirrors
 * `services/cfg1/src/lib/decision.ts`'s own real return shape for `onboarding.retail_default`
 * exactly, so this fixture behaves identically to the real CFG-01 for the one feature code that
 * genuinely IS seeded in production (approved Phase 1 design decision — see Design Issue 1). */
function realisticCfg1Fetch(): typeof fetch {
  return makeFakeCfg1Fetch((body) => {
    if (body.feature_code === "onboarding.retail_default") {
      return { decision: "deny", reason_code: "prohibited" };
    }
    return { decision: "allow", reason_code: "feature_allowed" };
  });
}

function denyAllCfg1(reasonCode = "unknown_fail_closed"): typeof fetch {
  return makeFakeCfg1Fetch(() => ({ decision: "deny", reason_code: reasonCode }));
}

function cfg1Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

const APPLICATIONS_URL = "/internal/clt1/applications";
const internalHeaders = { "x-internal-service-token": "test-clt1-internal-token-it" };

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'clt1') AS clt1`,
    );
    const row = r.rows[0];
    return Number(row?.fnd) > 0 && Number(row?.clt1) > 0;
  } catch {
    return false;
  }
}

interface CreateApplicationInput {
  applicant_type?: "individual" | "corporate" | "institutional";
  legal_name?: string;
  registration_number?: string;
  country_of_incorporation?: string;
  applicant_email?: string;
  client_class_claimed?: "institutional" | "hnwi" | "professional" | "retail" | "unknown";
  created_by?: string;
}

/** Creates a draft application via the real HTTP route, with `config.cfg1FetchImpl` already
 * stubbed to allow by the caller. Returns the created application's non-PII response body. */
async function createDraft(overrides: CreateApplicationInput = {}): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: "POST",
    url: APPLICATIONS_URL,
    headers: internalHeaders,
    payload: {
      applicant_type: "corporate",
      legal_name: "Test Applicant Pte Ltd",
      registration_number: "REG-123456",
      country_of_incorporation: "SG",
      applicant_email: "applicant@example.com",
      client_class_claimed: "institutional",
      created_by: "user_maker_1",
      ...overrides,
    },
  });
  expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
  return res.json().data;
}

describe("CLT-01 Phase 1 integration", () => {
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
    await verifyPool.query(`GRANT role_clt1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
    // Default: allow-everything IAM-02 stub, so Phase 1 tests (which predate IAM-02 integration)
    // don't each need updating individually. Phase 2 tests that care about IAM-02 behaviour
    // override this per-test.
    config.iam2FetchImpl = allowAllIam2Fetch();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  afterEach(async () => {
    if (!schemaReady) return;
    // Clean slate between tests — no test depends on another's application rows. FK-safe order:
    // children before parent (client_profile/cdd_outcome/handoff_status/application_decision_
    // request all FK to client_application; the Phase 3 decision-request tables FK to both
    // client_profile AND their own target entity table, so they must go first).
    await verifyPool.query(`DELETE FROM clt1.consent_record`);
    await verifyPool.query(`DELETE FROM clt1.client_classification_evidence`);
    await verifyPool.query(`DELETE FROM clt1.application_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.cdd_outcome`);
    await verifyPool.query(`DELETE FROM clt1.handoff_status`);
    await verifyPool.query(`DELETE FROM clt1.client_mandate_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.authorised_user_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.authorised_party_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.related_party_edge_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.duplicate_candidate_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.client_profile_lifecycle_decision_request`);
    await verifyPool.query(`DELETE FROM clt1.client_mandate`);
    await verifyPool.query(`DELETE FROM clt1.authorised_user`);
    await verifyPool.query(`DELETE FROM clt1.authorised_party`);
    await verifyPool.query(`DELETE FROM clt1.related_party_edge`);
    await verifyPool.query(`DELETE FROM clt1.duplicate_candidate`);
    await verifyPool.query(`DELETE FROM clt1.client_profile`);
    await verifyPool.query(`DELETE FROM clt1.client_application`);
  });

  // -----------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_clt1_runtime", () => {
    it("boots and registers no Exchange-runtime route surface", () => {
      if (!schemaReady) return;
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(routePaths.filter((p) => p.toLowerCase().includes("exchange"))).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("F3(a)-equivalent: cross-schema DB role isolation", () => {
    it("role_clt1_runtime cannot read foundation.audit_seal_batch-shaped or iam/iam2/sec1/cfg1 schemas, but CAN read clt1.client_application", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const schema of ["iam", "iam2", "sec1", "cfg1"]) {
          const exists = await verifyPool.query(`SELECT count(*) FROM information_schema.schemata WHERE schema_name = $1`, [schema]);
          if (Number(exists.rows[0].count) === 0) continue; // schema not present in this test DB — nothing to prove isolation against
          await expect(client.query(`SELECT 1 FROM ${schema}.pg_proc_placeholder_nonexistent`)).rejects.toBeTruthy();
        }
        await expect(client.query(`SELECT * FROM clt1.client_application LIMIT 1`)).resolves.toBeTruthy();
      } finally {
        await client.release();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("structural immutability: role_clt1_runtime cannot DELETE/TRUNCATE on any clt1 table", () => {
    it("DELETE/TRUNCATE are rejected (42501) on client_application, client_profile, client_classification_evidence, consent_record", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["client_application", "client_profile", "client_classification_evidence", "consent_record"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime CAN SELECT/INSERT but cannot UPDATE client_profile (Phase 2: INSERT granted for approve/apply; no UPDATE grant — no suspend/close/upgrade route exists yet)", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        // FK-satisfying application row required for a real INSERT to reach the grant check
        // rather than fail earlier on 23503 — grant-boundary tests must isolate the ONE thing
        // they're proving.
        await verifyPool.query(
          `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, created_by)
           VALUES ('a_grant_test','corporate','X','institutional','under_review','tester')`,
        );
        await expect(
          client.query(
            `INSERT INTO clt1.client_profile (client_id, application_id, applicant_type, legal_name, client_class) VALUES ('c1','a_grant_test','corporate','X','institutional')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_profile SET legal_name = 'x'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`SELECT * FROM clt1.client_profile`)).resolves.toBeTruthy();
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot UPDATE client_classification_evidence or consent_record — append-only, INSERT+SELECT only", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(client.query(`UPDATE clt1.client_classification_evidence SET status = 'verified'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.consent_record SET consent_given = false`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot UPDATE columns outside the granted set on client_application (applicant_type/application_id/created_by stay immutable)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(`UPDATE clt1.client_application SET applicant_type = 'individual' WHERE application_id = $1`, [created.application_id]),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          client.query(`UPDATE clt1.client_application SET created_by = 'someone_else' WHERE application_id = $1`, [created.application_id]),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/clt1/readiness — clean state", () => {
    it("returns 200 ready once the clt1 schema is reachable", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/clt1/readiness" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ready");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/clt1/applications — create", () => {
    it("an allowed class creates a draft application and stores safe CFG-01 gate evidence (no raw token)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft({ client_class_claimed: "institutional" });
      expect(created.status).toBe("draft");
      expect(created.client_class_status).toBe("claimed");
      expect(created.cfg_feature_code).toBe("onboarding.institutional");
      expect(created.cfg_reason_code).toBe("feature_allowed");
      expect(typeof created.cfg_decision_id).toBe("string");
      expect(created).not.toHaveProperty("decision_token");
      expect(created).not.toHaveProperty("cfg_decision_token");
    });

    it("retail maps to onboarding.retail_default and is blocked with CLT1_RETAIL_ONBOARDING_BLOCKED — no row is created", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const res = await app.inject({
        method: "POST",
        url: APPLICATIONS_URL,
        headers: internalHeaders,
        payload: { applicant_type: "individual", legal_name: "Retail Person", client_class_claimed: "retail", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_RETAIL_ONBOARDING_BLOCKED");
      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.client_application WHERE legal_name = 'Retail Person'`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("unknown ALSO maps to onboarding.retail_default and is blocked the same way (no local special-casing)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const res = await app.inject({
        method: "POST",
        url: APPLICATIONS_URL,
        headers: internalHeaders,
        payload: { applicant_type: "individual", legal_name: "Unknown Class Person", client_class_claimed: "unknown", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_RETAIL_ONBOARDING_BLOCKED");
    });

    it("a non-retail deny (e.g. feature not yet enabled) returns CLT1_CFG_GATE_DENIED, not the retail-specific code", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = denyAllCfg1("unknown_fail_closed");
      const res = await app.inject({
        method: "POST",
        url: APPLICATIONS_URL,
        headers: internalHeaders,
        payload: { applicant_type: "corporate", legal_name: "Not Yet Enabled Co", client_class_claimed: "professional", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_DENIED");
    });

    it("CFG-01 unreachable fails closed with CLT1_CFG_GATE_UNAVAILABLE, not a silent allow, and not CLT1_SERVICE_UNAVAILABLE (Phase 2 split — that code is reserved for CLT-01's own DB failure)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = cfg1Unreachable();
      const res = await app.inject({
        method: "POST",
        url: APPLICATIONS_URL,
        headers: internalHeaders,
        payload: { applicant_type: "corporate", legal_name: "Unreachable Co", client_class_claimed: "institutional", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_UNAVAILABLE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("PATCH /internal/clt1/applications/:application_id", () => {
    it("updates draft-only fields and bumps version", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "PATCH",
        url: `${APPLICATIONS_URL}/${created.application_id}`,
        headers: internalHeaders,
        payload: { applicant_email: "updated@example.com" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.version).toBe(2);
    });

    it("a client_class_claimed change re-runs the CFG-01 gate and updates the stored evidence", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft({ client_class_claimed: "institutional" });
      expect(created.cfg_feature_code).toBe("onboarding.institutional");

      const res = await app.inject({
        method: "PATCH",
        url: `${APPLICATIONS_URL}/${created.application_id}`,
        headers: internalHeaders,
        payload: { client_class_claimed: "hnwi" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.client_class_claimed).toBe("hnwi");
      expect(res.json().data.cfg_feature_code).toBe("onboarding.hnwi");
    });

    it("changing class to retail is blocked (CLT1_RETAIL_ONBOARDING_BLOCKED) and the row is left unchanged", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft({ client_class_claimed: "institutional" });
      const res = await app.inject({
        method: "PATCH",
        url: `${APPLICATIONS_URL}/${created.application_id}`,
        headers: internalHeaders,
        payload: { client_class_claimed: "retail" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_RETAIL_ONBOARDING_BLOCKED");
      const row = await verifyPool.query(`SELECT client_class_claimed, version FROM clt1.client_application WHERE application_id = $1`, [created.application_id]);
      expect(row.rows[0]).toMatchObject({ client_class_claimed: "institutional", version: 1 });
    });

    it("rejects PATCH on a non-draft application (CLT1_APPLICATION_INVALID_STATE)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });

      const res = await app.inject({
        method: "PATCH",
        url: `${APPLICATIONS_URL}/${created.application_id}`,
        headers: internalHeaders,
        payload: { applicant_email: "too-late@example.com" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/clt1/applications/:application_id/classification-evidence", () => {
    it("attaches evidence with status provided (no verify route exists this phase)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/classification-evidence`,
        headers: internalHeaders,
        payload: { evidence_type: "incorporation_certificate", evidence_ref: "doc_ref_123", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.status).toBe("provided");
      expect(res.json().data.client_class).toBe(created.client_class_claimed);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/clt1/applications/:application_id/consents", () => {
    it("records a consent", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.consent_type).toBe("terms");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/clt1/applications/:application_id/submit", () => {
    async function withConsent(applicationId: string): Promise<void> {
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
    }

    it("fails with CLT1_CONSENT_REQUIRED when no consent is on file", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CONSENT_REQUIRED");
    });

    it("succeeds with consent + an allow gate re-check — status becomes submitted", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await withConsent(created.application_id as string);
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("submitted");
      expect(typeof res.json().data.submitted_at_utc).toBe("string");
    });

    it("a fresh deny at submit time (registry changed since creation) blocks submission even though creation succeeded", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft({ client_class_claimed: "professional" });
      await withConsent(created.application_id as string);

      config.cfg1FetchImpl = denyAllCfg1("kill_switch_active");
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_DENIED");

      const row = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [created.application_id]);
      expect(row.rows[0].status).toBe("draft");
    });

    it("fails with CLT1_APPLICATION_INVALID_STATE when submitting twice", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await withConsent(created.application_id as string);
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });

    it("CLT1_CFG_GATE_REQUIRED — defensive invariant: submit fails closed if the stored gate columns are ever cleared directly (should never happen via the API, proven anyway)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await withConsent(created.application_id as string);
      await verifyPool.query(`UPDATE clt1.client_application SET cfg_feature_code = NULL, cfg_reason_code = NULL WHERE application_id = $1`, [created.application_id]);

      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_REQUIRED");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /internal/clt1/applications/:application_id/start-review + cancel", () => {
    it("submitted -> under_review via start-review", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
        headers: internalHeaders,
        payload: { reviewer_id: "user_reviewer_1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("under_review");
      expect(res.json().data.assigned_reviewer).toBe("user_reviewer_1");
    });

    it("start-review fails on a draft application (must be submitted first)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
        headers: internalHeaders,
        payload: { reviewer_id: "user_reviewer_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });

    it("start-review rejects a missing reviewer_id (Phase 2: now required, not optional)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/start-review`, headers: internalHeaders, payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("start-review fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies the baseline check", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });

      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
        headers: internalHeaders,
        payload: { reviewer_id: "user_reviewer_1" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");

      const row = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [created.application_id]);
      expect(row.rows[0].status).toBe("submitted");
    });

    it("start-review fails closed with CLT1_IAM2_UNAVAILABLE (503, distinct from a real permission denial) when IAM-02 is unreachable", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });

      config.iam2FetchImpl = iam2Unreachable();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
        headers: internalHeaders,
        payload: { reviewer_id: "user_reviewer_1" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("CLT1_IAM2_UNAVAILABLE");
    });

    it("draft -> cancelled", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/cancel`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("cancelled");
    });

    it("cancel fails on an already-cancelled application", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/cancel`, headers: internalHeaders });
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/cancel`, headers: internalHeaders });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/clt1/applications/:application_id — PII exclusion", () => {
    it("never returns legal_name, applicant_email, registration_number, or country_of_incorporation", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft({ legal_name: "Must Not Leak Pte Ltd", applicant_email: "must-not-leak@example.com" });
      const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${created.application_id}`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain("Must Not Leak");
      expect(raw).not.toContain("must-not-leak@example.com");
      expect(res.json().data).not.toHaveProperty("legal_name");
      expect(res.json().data).not.toHaveProperty("applicant_email");
    });

    it("returns CLT1_APPLICATION_NOT_FOUND for an unknown application_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/clt1app_does_not_exist`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("audit/outbox: transaction-coupled writes actually happen", () => {
    it("a successful create writes clt1.application_created AND clt1.client_class_claimed to foundation.outbox_event", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${created.application_id}%`]);
      const types = rows.rows.map((r) => r.event_type);
      expect(types).toContain("clt1.application_created");
      expect(types).toContain("clt1.client_class_claimed");
    });

    it("a retail-blocked create writes clt1.retail_onboarding_blocked even though no application row exists", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const res = await app.inject({
        method: "POST",
        url: APPLICATIONS_URL,
        headers: internalHeaders,
        payload: { applicant_type: "individual", legal_name: "Audited Retail Block", client_class_claimed: "retail", created_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type = 'clt1.retail_onboarding_blocked' ORDER BY created_at_utc DESC LIMIT 1`);
      expect(rows.rows).toHaveLength(1);
    });

    it("CLT1_AUDIT_REQUIRED (503) when the outbox write itself fails — no orphaned application row", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime");
        try {
          const before = await verifyPool.query(`SELECT count(*) FROM clt1.client_application`);
          const res = await app.inject({
            method: "POST",
            url: APPLICATIONS_URL,
            headers: internalHeaders,
            payload: { applicant_type: "corporate", legal_name: "Should Not Persist Co", client_class_claimed: "institutional", created_by: "user_maker_1" },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("CLT1_AUDIT_REQUIRED");
          const after = await verifyPool.query(`SELECT count(*) FROM clt1.client_application`);
          expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime");
        }
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("client_profile — zero rows created by any Phase 1 flow", () => {
    it("remains empty after create/patch/evidence/consent/submit/start-review/cancel", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/classification-evidence`,
        headers: internalHeaders,
        payload: { evidence_type: "passport", evidence_ref: "doc_ref_999", created_by: "user_maker_1" },
      });
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
        headers: internalHeaders,
        payload: { reviewer_id: "user_reviewer_1" },
      });

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // =============================================================================================
  // PHASE 2 — CDD outcome gate + final approval control.
  // =============================================================================================

  async function progressToUnderReview(overrides: CreateApplicationInput = {}): Promise<Record<string, unknown>> {
    config.cfg1FetchImpl = realisticCfg1Fetch();
    const created = await createDraft(overrides);
    await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
      headers: internalHeaders,
      payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
    });
    await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
    await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${created.application_id}/start-review`,
      headers: internalHeaders,
      payload: { reviewer_id: "user_reviewer_1" },
    });
    return created;
  }

  /** Phase 4A.1 — the real roster digest this application currently has, via the accepted
   * Phase 4A GET route (never recomputed independently — this is exactly what a real KYC-01
   * caller does before delivering a kyc_kyb outcome). */
  async function currentRosterHash(applicationId: string): Promise<string> {
    const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${applicationId}/kyc-roster`, headers: internalHeaders });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    return res.json().data.roster_hash as string;
  }

  /** Phase 4A.1 — `kyc_kyb` now requires a matching `expected_roster_hash` (migration 047); every
   * other outcome_type is unaffected (AML-01's own accepted delivery client sends none). Fetches
   * the CURRENT digest via the real roster route immediately before delivering, mirroring the
   * approved KYC-01 Phase 4B delivery shape (fetch -> validate -> deliver against that hash). */
  async function receiveOutcome(applicationId: string, outcomeType: string, outcomeStatus: string, expectedRosterHash?: string): Promise<void> {
    const rosterHash = outcomeType === "kyc_kyb" ? (expectedRosterHash ?? (await currentRosterHash(applicationId))) : undefined;
    const res = await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
      headers: internalHeaders,
      payload: {
        outcome_type: outcomeType,
        outcome_status: outcomeStatus,
        source_module: "TEST",
        created_by: "test_fixture",
        ...(rosterHash !== undefined ? { expected_roster_hash: rosterHash } : {}),
      },
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
  }

  async function createHandoff(applicationId: string, targetModule: "kyc-kyb" | "aml"): Promise<void> {
    const res = await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${applicationId}/handoff/${targetModule}`,
      headers: internalHeaders,
      payload: { created_by: "test_fixture" },
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
  }

  async function passAllOutcomes(applicationId: string): Promise<void> {
    await createHandoff(applicationId, "kyc-kyb");
    await createHandoff(applicationId, "aml");
    await receiveOutcome(applicationId, "kyc_kyb", "pass");
    await receiveOutcome(applicationId, "aml_sanctions", "pass");
    await receiveOutcome(applicationId, "pep_adverse_media", "pass");
    await receiveOutcome(applicationId, "risk_rating", "pass");
  }

  async function requestApproval(applicationId: string, requestedBy = "user_approver_1"): Promise<{ decision_id: string; payload_hash: string }> {
    const res = await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${applicationId}/approve/request`,
      headers: internalHeaders,
      payload: { requested_by: requestedBy },
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    return res.json().data;
  }

  /** Phase 3 helper — drives an application all the way to an approved, active_limited
   * client_profile via the real Phase 1+2 HTTP flow, and returns the resulting client_id. */
  async function createActiveClient(overrides: CreateApplicationInput = {}): Promise<string> {
    const created = await progressToUnderReview(overrides);
    await passAllOutcomes(created.application_id as string);
    const { decision_id } = await requestApproval(created.application_id as string, "user_approver_" + Math.random().toString(36).slice(2, 8));
    const applyRes = await app.inject({
      method: "POST",
      url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return applyRes.json().data.client_id as string;
  }

  // Phase 8 helper — drives a lifecycle action's request/apply pair via the real HTTP flow.
  // Returns the apply response body (`{ client_id, status, decision_id }`).
  async function runLifecycleAction(
    clientId: string,
    action: "suspend" | "reactivate" | "close",
    overrides: { reason?: string; evidence_ref?: string; requested_by?: string } = {},
  ): Promise<{ requestRes: Awaited<ReturnType<FastifyInstance["inject"]>>; applyRes: Awaited<ReturnType<FastifyInstance["inject"]>> }> {
    const defaultReason = action === "reactivate" ? undefined : "test fixture reason";
    const requestPayload: Record<string, unknown> = { requested_by: "staff_lifecycle_1", ...(defaultReason ? { reason: defaultReason } : {}), ...overrides };
    const requestRes = await app.inject({ method: "POST", url: `/internal/clt1/clients/${clientId}/${action}/request`, headers: internalHeaders, payload: requestPayload });
    let applyRes = requestRes;
    if (requestRes.statusCode === 200) {
      const { decision_id } = requestRes.json().data;
      applyRes = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/${action}/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_cpl_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_cpl_" + Math.random().toString(36).slice(2, 8) },
      });
    }
    return { requestRes, applyRes };
  }

  const AU_URL = (clientId: string) => `/internal/clt1/clients/${clientId}/authorised-users`;
  const MANDATE_URL = (clientId: string) => `/internal/clt1/clients/${clientId}/mandates`;

  async function addAuthorisedUser(
    clientId: string,
    overrides: { user_reference?: string; role?: string; requested_by?: string; iam_user_id?: string } = {},
  ): Promise<{ authorised_user_id: string }> {
    const requestRes = await app.inject({
      method: "POST",
      url: `${AU_URL(clientId)}/add/request`,
      headers: internalHeaders,
      payload: { user_reference: "jane@example.com", role: "client_maker", requested_by: "staff_1", ...overrides },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${AU_URL(clientId)}/add/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_au_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_au_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return { authorised_user_id: applyRes.json().data.authorised_user_id };
  }

  async function createMandate(clientId: string, overrides: { mandate_type?: string; rules?: Record<string, unknown>; requested_by?: string } = {}): Promise<{ mandate_id: string }> {
    const requestRes = await app.inject({
      method: "POST",
      url: `${MANDATE_URL(clientId)}/create/request`,
      headers: internalHeaders,
      payload: { mandate_type: "institutional", rules: { max_transaction_amount: 100000 }, requested_by: "staff_1", ...overrides },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${MANDATE_URL(clientId)}/create/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_mnd_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_mnd_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return { mandate_id: applyRes.json().data.mandate_id };
  }

  const AP_URL = (clientId: string) => `/internal/clt1/clients/${clientId}/authorised-parties`;

  /** Phase 4 helper — drives add/request -> add/apply via the real HTTP flow. Returns the
   * created authorised_party_id (authority_status='pending', both screening columns 'pending'). */
  async function addAuthorisedParty(
    clientId: string,
    overrides: { party_type?: string; party_reference?: string; requested_by?: string; ownership_percentage?: number; sec_audit_ref?: string } = {},
  ): Promise<{ authorised_party_id: string }> {
    const requestRes = await app.inject({
      method: "POST",
      url: `${AP_URL(clientId)}/add/request`,
      headers: internalHeaders,
      payload: { party_type: "director", party_reference: "director@example.com", requested_by: "staff_1", ...overrides },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${AP_URL(clientId)}/add/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_ap_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_ap_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return { authorised_party_id: applyRes.json().data.authorised_party_id };
  }

  /** Phase 4 helper — receives a screening outcome (internal-identity only) then drives
   * activate/request -> activate/apply, returning once authority_status='active'. */
  async function activateAuthorisedParty(clientId: string, authorisedPartyId: string, screening: { identity_verification_status?: string; sanctions_pep_status?: string } = {}): Promise<void> {
    const screeningRes = await app.inject({
      method: "POST",
      url: `${AP_URL(clientId)}/${authorisedPartyId}/screening-outcome`,
      headers: internalHeaders,
      payload: { identity_verification_status: "pass", sanctions_pep_status: "clear", source_module: "TEST-SCREEN", created_by: "svc_screen", ...screening },
    });
    expect(screeningRes.statusCode, JSON.stringify(screeningRes.json())).toBe(200);

    const requestRes = await app.inject({
      method: "POST",
      url: `${AP_URL(clientId)}/${authorisedPartyId}/activate/request`,
      headers: internalHeaders,
      payload: { requested_by: "staff_1" },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${AP_URL(clientId)}/${authorisedPartyId}/activate/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_apact_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_apact_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
  }

  const RPE_URL = "/internal/clt1/related-party-edges";

  /** Phase 5 helper — drives add/request -> add/apply via the real HTTP flow. Returns the
   * created related_party_edge_id (status='active'). */
  async function addRelatedPartyEdge(
    overrides: { from_entity_type?: string; from_entity_id?: string; to_entity_type?: string; to_entity_id?: string; relationship_type?: string; requested_by?: string; evidence_ref?: string } = {},
  ): Promise<{ related_party_edge_id: string }> {
    // Default from/to nodes are REAL client_profile rows (node existence is validated at
    // add/request) — only created when the caller hasn't already supplied an explicit
    // from_entity_id/to_entity_id override.
    const defaultFromId = overrides.from_entity_id ?? (await createActiveClient());
    const defaultToId = overrides.to_entity_id ?? (await createActiveClient());
    const requestRes = await app.inject({
      method: "POST",
      url: `${RPE_URL}/add/request`,
      headers: internalHeaders,
      payload: { from_entity_type: "client", from_entity_id: defaultFromId, to_entity_type: "client", to_entity_id: defaultToId, relationship_type: "shared_address", requested_by: "staff_1", ...overrides },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${RPE_URL}/add/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_rpe_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_rpe_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return { related_party_edge_id: applyRes.json().data.related_party_edge_id };
  }

  const DC_URL = "/internal/clt1/duplicate-candidates";

  /** Phase 6 helper — drives create/request -> create/apply via the real HTTP flow. Returns the
   * created duplicate_candidate_id (status='open'). Default subject/matched nodes are REAL
   * client_profile rows (node existence is validated at create/request) — only created when the
   * caller hasn't already supplied an explicit subject_ref/matched_ref override. */
  async function addDuplicateCandidate(
    overrides: { subject_type?: string; subject_ref?: string; matched_type?: string; matched_ref?: string; match_type?: string; requested_by?: string; evidence_ref?: string } = {},
  ): Promise<{ duplicate_candidate_id: string }> {
    const defaultSubjectRef = overrides.subject_ref ?? (await createActiveClient());
    const defaultMatchedRef = overrides.matched_ref ?? (await createActiveClient());
    const requestRes = await app.inject({
      method: "POST",
      url: `${DC_URL}/create/request`,
      headers: internalHeaders,
      payload: { subject_type: "client", subject_ref: defaultSubjectRef, matched_type: "client", matched_ref: defaultMatchedRef, match_type: "name", requested_by: "staff_1", ...overrides },
    });
    expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
    const { decision_id } = requestRes.json().data;
    const applyRes = await app.inject({
      method: "POST",
      url: `${DC_URL}/create/apply`,
      headers: internalHeaders,
      payload: { decision_id, approval_id: "iam2appr_dc_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_dc_" + Math.random().toString(36).slice(2, 8) },
    });
    expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
    return { duplicate_candidate_id: applyRes.json().data.duplicate_candidate_id };
  }

  // -----------------------------------------------------------------------------------------
  describe("IAM-02 permission catalogue — direct inspection", () => {
    it("registers exactly 33 clt1.* permissions (5 Phase 2 + 8 Phase 3 + 8 Phase 4 + 4 Phase 5 + 5 Phase 6 + 3 Phase 8), all licence_locked = false, zero role_permission seed", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code, licence_locked, requires_approval FROM iam2.permission WHERE permission_code LIKE 'clt1.%' ORDER BY permission_code`);
      expect(rows.rows).toHaveLength(33);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must have licence_locked = false`).toBe(false);
      }
      for (const code of [
        "clt1.application.approve",
        "clt1.authorised_user.add",
        "clt1.authorised_user.remove",
        "clt1.client_mandate.create",
        "clt1.client_mandate.update",
        "clt1.authorised_party.add",
        "clt1.authorised_party.update",
        "clt1.authorised_party.remove",
        "clt1.authorised_party.activate",
        "clt1.related_party.add",
        "clt1.related_party.update",
        "clt1.related_party.remove",
        "clt1.duplicate_candidate.create",
        "clt1.duplicate_candidate.update",
        "clt1.duplicate_candidate.confirm",
        "clt1.duplicate_candidate.dismiss",
        "clt1.client_profile.suspend",
        "clt1.client_profile.reactivate",
        "clt1.client_profile.close",
      ]) {
        expect(rows.rows.find((r) => r.permission_code === code).requires_approval, `${code} must require approval`).toBe(true);
      }
      for (const code of [
        "clt1.application.review",
        "clt1.application.reject",
        "clt1.application.hold",
        "clt1.cdd_outcome.read",
        "clt1.authorised_user.read",
        "clt1.authorised_user.suspend",
        "clt1.authorised_user.reactivate",
        "clt1.client_mandate.read",
        "clt1.authorised_party.read",
        "clt1.authorised_party.restrict",
        "clt1.authorised_party.reject",
        "clt1.authorised_party.suspend",
        "clt1.related_party.read",
        "clt1.duplicate_candidate.read",
      ]) {
        expect(rows.rows.find((r) => r.permission_code === code).requires_approval, `${code} must be single-step`).toBe(false);
      }

      // M-1: scoped via countUnauthorizedCltRolePermissionBindings() — see that helper's own
      // header comment for why an unscoped whole-database count is unsafe here (a legitimate
      // clt1-iam2-guard-real.test.ts fixture in a different Vitest worker can otherwise be
      // observed mid-flight).
      expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
    });

    it("does not register a screening_outcome.receive permission, the blueprint's own literal clt1.duplicate.review code, a needs_more_info permission, or any duplicate-detection/wallet/deposit/withdraw/trade/Exchange permission", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code LIKE 'clt1.%'`);
      const codes = rows.rows.map((r) => r.permission_code as string);
      expect(codes).not.toContain("clt1.authorised_party.screening_outcome.receive");
      expect(codes).not.toContain("clt1.duplicate.review");
      expect(codes).not.toContain("clt1.duplicate_candidate.needs_more_info");
      expect(codes).not.toContain("clt1.client_profile.read");
      expect(codes).not.toContain("clt1.client_profile.history");
      expect(codes).not.toContain("clt1.client_profile.activate");
      expect(codes).not.toContain("clt1.client_profile.reopen");
      for (const forbidden of ["screening_outcome", "wallet", "deposit", "withdraw", "trade", "exchange"]) {
        expect(codes.some((c) => c.toLowerCase().includes(forbidden)), `no permission code should contain '${forbidden}'`).toBe(false);
      }
    });

    it("registers exactly 3 clt1.client_profile.* permissions — no read/history/activate/reopen permission", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code LIKE 'clt1.client_profile%' ORDER BY permission_code`);
      expect(rows.rows.map((r) => r.permission_code)).toEqual(["clt1.client_profile.close", "clt1.client_profile.reactivate", "clt1.client_profile.suspend"]);
    });

    it("registers exactly 4 clt1.related_party.* permissions — no graph-traversal, UBO-threshold, scoring, or risk-engine permission", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code LIKE 'clt1.related_party%' ORDER BY permission_code`);
      expect(rows.rows.map((r) => r.permission_code)).toEqual(["clt1.related_party.add", "clt1.related_party.read", "clt1.related_party.remove", "clt1.related_party.update"]);
      for (const forbidden of ["graph", "traversal", "ubo_threshold", "score", "risk"]) {
        expect(rows.rows.some((r) => (r.permission_code as string).toLowerCase().includes(forbidden)), `no related_party permission code should contain '${forbidden}'`).toBe(false);
      }
    });

    it("registers exactly 5 clt1.duplicate_candidate.* permissions — no fuzzy-matching, scoring, graph-traversal, or UBO-threshold permission", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code LIKE 'clt1.duplicate_candidate%' ORDER BY permission_code`);
      expect(rows.rows.map((r) => r.permission_code)).toEqual([
        "clt1.duplicate_candidate.confirm",
        "clt1.duplicate_candidate.create",
        "clt1.duplicate_candidate.dismiss",
        "clt1.duplicate_candidate.read",
        "clt1.duplicate_candidate.update",
      ]);
      for (const forbidden of ["fuzzy", "score", "graph", "traversal", "ubo_threshold"]) {
        expect(rows.rows.some((r) => (r.permission_code as string).toLowerCase().includes(forbidden)), `no duplicate_candidate permission code should contain '${forbidden}'`).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — Phase 2 tables", () => {
    it("role_clt1_runtime can SELECT+INSERT but not UPDATE cdd_outcome/handoff_status", async () => {
      if (!schemaReady) return;
      await verifyPool.query(
        `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, created_by)
         VALUES ('a_grant_test2','corporate','X','institutional','under_review','tester')`,
      );
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.cdd_outcome (outcome_id, application_id, source_module, outcome_type, outcome_status, created_by) VALUES ('o1','a_grant_test2','TEST','kyc_kyb','pass','tester')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.cdd_outcome SET outcome_status = 'fail'`)).rejects.toMatchObject({ code: "42501" });

        await expect(
          client.query(`INSERT INTO clt1.handoff_status (handoff_id, application_id, target_module, created_by) VALUES ('h1','a_grant_test2','KYC','tester')`),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.handoff_status SET delivery_status = 'sent'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on application_decision_request, but not update requested_by/payload_hash", async () => {
      if (!schemaReady) return;
      await verifyPool.query(
        `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, created_by)
         VALUES ('a_grant_test3','corporate','X','institutional','under_review','tester')`,
      );
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.application_decision_request (decision_id, application_id, client_class_claimed, requested_by, payload_hash) VALUES ('d1','a_grant_test3','institutional','user_1','sha256:x')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.application_decision_request SET status = 'applied' WHERE decision_id = 'd1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.application_decision_request SET requested_by = 'someone_else' WHERE decision_id = 'd1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.application_decision_request SET payload_hash = 'sha256:tampered' WHERE decision_id = 'd1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on any Phase 2 table", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["cdd_outcome", "handoff_status", "application_decision_request", "client_profile"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — Phase 3 tables", () => {
    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on authorised_user, but not update user_reference/client_id/requested_by", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.authorised_user (authorised_user_id, client_id, user_reference, role, requested_by) VALUES ('au_grant_1',$1,'x@example.com','viewer','tester')`,
            [clientId],
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_user SET status = 'suspended' WHERE authorised_user_id = 'au_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_user SET user_reference = 'someone_else' WHERE authorised_user_id = 'au_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.authorised_user SET requested_by = 'someone_else' WHERE authorised_user_id = 'au_grant_1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on client_mandate, but not update client_id/requested_by", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.client_mandate (mandate_id, client_id, mandate_type, rules, requested_by) VALUES ('mnd_grant_1',$1,'standard','{}','tester')`,
            [clientId],
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_mandate SET rules = '{"max_daily_amount":1}' WHERE mandate_id = 'mnd_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_mandate SET client_id = 'someone_else' WHERE mandate_id = 'mnd_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_mandate SET requested_by = 'someone_else' WHERE mandate_id = 'mnd_grant_1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on any Phase 3 table", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["authorised_user", "client_mandate", "authorised_user_decision_request", "client_mandate_decision_request"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime has no grant into iam2/cfg1/sec1 (Phase 3 unchanged)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — Phase 4 tables", () => {
    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on authorised_party, but not update application_id/party_type/party_reference/requested_by", async () => {
      if (!schemaReady) return;
      await verifyPool.query(
        `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, created_by)
         VALUES ('a_grant_test_ap','corporate','X','institutional','under_review','tester')`,
      );
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, requested_by) VALUES ('ap_grant_1','a_grant_test_ap','director','x@example.com','tester')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_party SET authority_status = 'restricted' WHERE authorised_party_id = 'ap_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_party SET identity_verification_status = 'pass' WHERE authorised_party_id = 'ap_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_party SET application_id = 'someone_else' WHERE authorised_party_id = 'ap_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.authorised_party SET party_type = 'ubo' WHERE authorised_party_id = 'ap_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.authorised_party SET party_reference = 'someone_else' WHERE authorised_party_id = 'ap_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.authorised_party SET requested_by = 'someone_else' WHERE authorised_party_id = 'ap_grant_1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on authorised_party_decision_request, but not update requested_by/payload_hash", async () => {
      if (!schemaReady) return;
      await verifyPool.query(
        `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, created_by)
         VALUES ('a_grant_test_apd','corporate','X','institutional','under_review','tester')`,
      );
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.authorised_party_decision_request (decision_id, application_id, decision_type, requested_by, payload_hash) VALUES ('apd1','a_grant_test_apd','add','user_1','sha256:x')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_party_decision_request SET status = 'applied' WHERE decision_id = 'apd1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.authorised_party_decision_request SET requested_by = 'someone_else' WHERE decision_id = 'apd1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.authorised_party_decision_request SET payload_hash = 'sha256:tampered' WHERE decision_id = 'apd1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on any Phase 4 table", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["authorised_party", "authorised_party_decision_request"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("authorised_party table has no client_id column (application-scoped only)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'authorised_party' AND column_name = 'client_id'`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("role_clt1_runtime has no grant into iam2/cfg1/sec1 (Phase 4 unchanged)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — Phase 5 tables", () => {
    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on related_party_edge, but not update from_entity_type/from_entity_id/to_entity_type/to_entity_id/relationship_type/requested_by", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.related_party_edge (related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, requested_by) VALUES ('rpe_grant_1','client','c1','client','c2','shared_address','tester')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.related_party_edge SET status = 'inactive' WHERE related_party_edge_id = 'rpe_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.related_party_edge SET evidence_ref = 'ref_1' WHERE related_party_edge_id = 'rpe_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.related_party_edge SET from_entity_type = 'application' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge SET from_entity_id = 'someone_else' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge SET to_entity_type = 'application' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge SET to_entity_id = 'someone_else' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge SET relationship_type = 'ubo' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge SET requested_by = 'someone_else' WHERE related_party_edge_id = 'rpe_grant_1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on related_party_edge_decision_request, but not update requested_by/payload_hash", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.related_party_edge_decision_request (decision_id, decision_type, requested_by, payload_hash) VALUES ('rped1','add','user_1','sha256:x')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.related_party_edge_decision_request SET status = 'applied' WHERE decision_id = 'rped1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.related_party_edge_decision_request SET requested_by = 'someone_else' WHERE decision_id = 'rped1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.related_party_edge_decision_request SET payload_hash = 'sha256:tampered' WHERE decision_id = 'rped1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on any Phase 5 table", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["related_party_edge", "related_party_edge_decision_request"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("related_party_edge table has no owning_application_id or owning_client_id column (no single owning scope)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'related_party_edge' AND column_name IN ('owning_application_id','owning_client_id','application_id','client_id')`,
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("role_clt1_runtime has no grant into iam2/cfg1/sec1 (Phase 5 unchanged)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("grants — Phase 6 tables", () => {
    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on duplicate_candidate, but not update subject_type/subject_ref/matched_type/matched_ref/match_type/source_type/source_ref/match_score/requested_by/sec_audit_ref", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.duplicate_candidate (duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, requested_by) VALUES ('dc_grant_1','client','c1','client','c2','name','tester')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET status = 'duplicate' WHERE duplicate_candidate_id = 'dc_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET evidence_ref = 'ref_1' WHERE duplicate_candidate_id = 'dc_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET reviewed_by = 'staff_1' WHERE duplicate_candidate_id = 'dc_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET reviewed_at_utc = now() WHERE duplicate_candidate_id = 'dc_grant_1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET subject_type = 'application' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET subject_ref = 'someone_else' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET matched_type = 'application' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET matched_ref = 'someone_else' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET match_type = 'email' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET source_type = 'future_detector' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET source_ref = 'x' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET match_score = 1.0 WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET requested_by = 'someone_else' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate SET sec_audit_ref = 'x' WHERE duplicate_candidate_id = 'dc_grant_1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on duplicate_candidate_decision_request, but not update requested_by/payload_hash", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.duplicate_candidate_decision_request (decision_id, decision_type, requested_by, payload_hash) VALUES ('dcd1','create','user_1','sha256:x')`,
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate_decision_request SET status = 'applied' WHERE decision_id = 'dcd1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.duplicate_candidate_decision_request SET requested_by = 'someone_else' WHERE decision_id = 'dcd1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.duplicate_candidate_decision_request SET payload_hash = 'sha256:tampered' WHERE decision_id = 'dcd1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on any Phase 6 table", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["duplicate_candidate", "duplicate_candidate_decision_request"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("duplicate_candidate table has no owning_application_id or owning_client_id column (no single owning scope)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'duplicate_candidate' AND column_name IN ('owning_application_id','owning_client_id','application_id','client_id')`,
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("role_clt1_runtime has no grant into iam2/cfg1/sec1 (Phase 6 unchanged)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST .../outcomes + GET .../outcome-status", () => {
    it("receives an outcome, updates the matching rollup column, and returns a non-PII summary", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");

      const statusRes = await app.inject({
        method: "GET",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcome-status?actor_id=user_1`,
        headers: internalHeaders,
      });
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.json().data.aml_sanctions_status).toBe("pass");
      expect(statusRes.json().data.gate_ready).toBe(false);
    });

    it("gate_ready becomes true once all four outcomes pass", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await receiveOutcome(created.application_id as string, "kyc_kyb", "pass");
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");
      await receiveOutcome(created.application_id as string, "pep_adverse_media", "pass");
      await receiveOutcome(created.application_id as string, "risk_rating", "pass");

      const statusRes = await app.inject({
        method: "GET",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcome-status?actor_id=user_1`,
        headers: internalHeaders,
      });
      expect(statusRes.json().data.gate_ready).toBe(true);
    });

    it("rejects outcome receipt when the application is not under_review", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });

    it("outcome-status read fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({
        method: "GET",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcome-status?actor_id=user_1`,
        headers: internalHeaders,
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });

    it("outcomes route does not return PII", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview({ legal_name: "Outcome PII Must Not Leak Ltd" });
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture" },
      });
      expect(JSON.stringify(res.json())).not.toContain("Outcome PII Must Not Leak");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST .../handoff/kyc-kyb + .../handoff/aml + GET .../handoff-status", () => {
    it("creates a KYC handoff row with delivery_status pending", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await createHandoff(created.application_id as string, "kyc-kyb");

      const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${created.application_id}/handoff-status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.handoffs).toEqual([expect.objectContaining({ target_module: "KYC", delivery_status: "pending" })]);
    });

    it("creates both KYC and AML handoffs independently", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await createHandoff(created.application_id as string, "kyc-kyb");
      await createHandoff(created.application_id as string, "aml");

      const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${created.application_id}/handoff-status`, headers: internalHeaders });
      const modules = res.json().data.handoffs.map((h: { target_module: string }) => h.target_module).sort();
      expect(modules).toEqual(["AML", "KYC"]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("approval flow — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: handoffs + all-pass outcomes -> approve/request -> approve/apply creates exactly one active_limited client_profile row", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_test_1", decision_token: "tok_valid_1" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.status).toBe("approved");
      const clientId = res.json().data.client_id as string;
      expect(typeof clientId).toBe("string");

      const profileRows = await verifyPool.query(`SELECT client_id, status, application_id FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(profileRows.rows).toHaveLength(1);
      expect(profileRows.rows[0]).toMatchObject({ client_id: clientId, status: "active_limited" });

      const appRow = await verifyPool.query(`SELECT status, client_id, approval_id FROM clt1.client_application WHERE application_id = $1`, [created.application_id]);
      expect(appRow.rows[0]).toMatchObject({ status: "approved", client_id: clientId, approval_id: "iam2appr_test_1" });
    });

    it("duplicate apply on an already-applied decision cannot create a second client_profile row", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      const applyPayload = { decision_id, approval_id: "iam2appr_test_2", decision_token: "tok_valid_2" };
      const first = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`, headers: internalHeaders, payload: applyPayload });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`, headers: internalHeaders, payload: applyPayload });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(1);
    });

    it("self-approval is blocked: the assigned reviewer cannot request their own approval", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_reviewer_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_SELF_APPROVAL_BLOCKED");
    });

    it("approve/request fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies the baseline check", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });

    it("approve/apply fails closed with CLT1_APPROVAL_REQUIRED when execute-verify does not authorise (invalid/mismatched token)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad", decision_token: "tok_bad" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");

      // Decision row must remain 'requested' (safely retriable), not forced into a 'failed' state.
      const decisionRow = await verifyPool.query(`SELECT status FROM clt1.application_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].status).toBe("requested");
    });

    it("approve/apply blocks with CLT1_KYC_HANDOFF_REQUIRED when no KYC handoff exists, even with all outcomes passing", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await createHandoff(created.application_id as string, "aml");
      await receiveOutcome(created.application_id as string, "kyc_kyb", "pass");
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");
      await receiveOutcome(created.application_id as string, "pep_adverse_media", "pass");
      await receiveOutcome(created.application_id as string, "risk_rating", "pass");
      const { decision_id } = await requestApproval(created.application_id as string);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_hoff", decision_token: "tok_hoff" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_HANDOFF_REQUIRED");
    });

    it("approve/apply blocks with CLT1_AML_HANDOFF_REQUIRED when only the AML handoff is missing", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await createHandoff(created.application_id as string, "kyc-kyb");
      await receiveOutcome(created.application_id as string, "kyc_kyb", "pass");
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");
      await receiveOutcome(created.application_id as string, "pep_adverse_media", "pass");
      await receiveOutcome(created.application_id as string, "risk_rating", "pass");
      const { decision_id } = await requestApproval(created.application_id as string);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_hoff2", decision_token: "tok_hoff2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_AML_HANDOFF_REQUIRED");
    });

    it("approve/apply blocks with CLT1_CDD_OUTCOME_REQUIRED when a required outcome is still pending", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await createHandoff(created.application_id as string, "kyc-kyb");
      await createHandoff(created.application_id as string, "aml");
      await receiveOutcome(created.application_id as string, "kyc_kyb", "pass");
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");
      await receiveOutcome(created.application_id as string, "pep_adverse_media", "pass");
      // risk_rating left at its default 'pending'
      const { decision_id } = await requestApproval(created.application_id as string);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_pend", decision_token: "tok_pend" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CDD_OUTCOME_REQUIRED");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
    });

    for (const [label, outcomeType, outcomeStatus, expectedCode] of [
      ["a failed kyc_kyb outcome", "kyc_kyb", "fail", "CLT1_CDD_OUTCOME_FAILED"],
      ["an AML sanctions hit", "aml_sanctions", "hit", "CLT1_AML_SANCTIONS_HIT"],
      ["a rejected risk rating", "risk_rating", "rejected", "CLT1_RISK_REJECTED"],
      ["a stale pep/adverse-media outcome", "pep_adverse_media", "stale", "CLT1_CDD_OUTCOME_FAILED"],
    ] as const) {
      it(`approve/apply blocks with ${expectedCode} on ${label}`, async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        await createHandoff(created.application_id as string, "kyc-kyb");
        await createHandoff(created.application_id as string, "aml");
        const allTypes = ["kyc_kyb", "aml_sanctions", "pep_adverse_media", "risk_rating"];
        for (const t of allTypes) {
          await receiveOutcome(created.application_id as string, t, t === outcomeType ? outcomeStatus : "pass");
        }
        const { decision_id } = await requestApproval(created.application_id as string);

        const res = await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_x", decision_token: "tok_x" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe(expectedCode);

        const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
        expect(Number(profileRows.rows[0].count)).toBe(0);
      });
    }

    it("audit/outbox failure rolls back approve/apply — no orphaned profile, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime");
        try {
          const res = await app.inject({
            method: "POST",
            url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_audit", decision_token: "tok_audit" },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("CLT1_AUDIT_REQUIRED");

          const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
          expect(Number(profileRows.rows[0].count)).toBe(0);
          const decisionRow = await verifyPool.query(`SELECT status FROM clt1.application_decision_request WHERE decision_id = $1`, [decision_id]);
          expect(decisionRow.rows[0].status).toBe("requested");
          const appRow = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [created.application_id]);
          expect(appRow.rows[0].status).toBe("under_review");
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime");
        }
      });
    });

    it("approve/apply re-runs the CFG-01 gate fresh and blocks if it now denies", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      config.cfg1FetchImpl = denyAllCfg1("kill_switch_active");
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_cfg", decision_token: "tok_cfg" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_DENIED");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
    });

    it("does not return PII anywhere in the approve request/apply response", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview({ legal_name: "Approve Flow PII Must Not Leak Ltd" });
      await passAllOutcomes(created.application_id as string);
      const requestRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(JSON.stringify(requestRes.json())).not.toContain("Approve Flow PII Must Not Leak");

      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_pii", decision_token: "tok_pii" },
      });
      expect(JSON.stringify(applyRes.json())).not.toContain("Approve Flow PII Must Not Leak");
    });
  });

  // -----------------------------------------------------------------------------------------
  // M-1 remediation (test-harness-only, narrow): the Phase-7 "seeds no permission/grant" check
  // below used to count `iam2.role_permission` rows for `clt1.*` permissions across the ENTIRE
  // database, unscoped. `tests/integration/clt1-iam2-guard-real.test.ts` legitimately creates such
  // a row — through the REAL IAM-02 RBAC-assignment path, never a migration seed — as its own
  // transient fixture, in a DIFFERENT file (therefore a different Vitest worker under default
  // parallelism), cleaned up in that file's own `afterAll`. That file's own role fixtures all
  // follow ONE deterministic, documented naming convention: `role_id` always matches
  // `role_clt1_[pN_]it_<random>` (six exact call sites, one per Phase 5/6 test — verified by direct
  // source inspection before this fix). The unscoped count could therefore observe another file's
  // own legitimate, in-flight fixture and fail non-deterministically (measured independently at
  // ~33% incidence across fresh canonical runs) — never a genuine CLT-01/WLT-01/production RBAC
  // defect.
  //
  // The fix narrows the query to its actual, true intent (this test's own header comment already
  // documented that intent: "Phase 7 itself added zero permissions") — EXCLUDING ONLY rows created
  // under the guard-real file's own documented naming convention, never any other row. This is the
  // narrowest predicate that separates "a legitimate runtime IAM-02 RBAC-workflow assignment made
  // by a sibling test file" from "an unauthorized/unexpected clt1.* role_permission binding that
  // Phase 7 itself (or anything else) left behind" — the exact security invariant this test has
  // always existed to protect, now provably preserved by the two proof tests immediately below.
  async function countUnauthorizedCltRolePermissionBindings(): Promise<number> {
    const rows = await verifyPool.query(
      `SELECT rp.id
         FROM iam2.role_permission rp
         JOIN iam2.permission p ON p.permission_id = rp.permission_id
        WHERE p.permission_code LIKE 'clt1.%'
          AND rp.role_id !~ '^role_clt1_(p[0-9]+_)?it_'`,
    );
    return rows.rows.length;
  }

  describe("Phase 7 — duplicate-candidate final approval compliance gate", () => {
    it("approve/request is blocked with CLT1_DUPLICATE_REVIEW_REQUIRED when an open duplicate_candidate touches the application (subject side)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    });

    it("approve/request is blocked when an open duplicate_candidate touches the application on the MATCHED side (bidirectional check)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      await addDuplicateCandidate({ subject_type: "client", matched_type: "application", matched_ref: created.application_id as string, match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    });

    it("approve/request is blocked when an open duplicate_candidate touches an authorised_party under the application (query-logic proof — authorised_party cannot organically exist before THIS application's own approval, since it is created only via an already-approved client, so the row is inserted directly to prove the gate's own party-node query is correct)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const partyId = "clt1ap_gatecheck_" + Math.random().toString(36).slice(2, 8);
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, requested_by) VALUES ($1,$2,'director','gatecheck@example.com','tester')`,
        [partyId, created.application_id],
      );
      await addDuplicateCandidate({ subject_type: "party", subject_ref: partyId, matched_type: "client", match_type: "name" });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    });

    it("approve/request is blocked when a touching candidate's status is duplicate (confirmed adverse, not resolved-safe)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });
      const confirmReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: confirmReq.json().data.decision_id, approval_id: "iam2appr_p7conf", decision_token: "tok_p7conf" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    });

    it("approve/request is blocked when a touching candidate's status is needs_more_info (defensive — no Phase 6 route can produce this status, so it is set directly)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });
      await verifyPool.query(`UPDATE clt1.duplicate_candidate SET status = 'needs_more_info' WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    });

    it("approve/request is allowed when every touching candidate is not_duplicate", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });
      const dismissReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/apply`,
        headers: internalHeaders,
        payload: { decision_id: dismissReq.json().data.decision_id, approval_id: "iam2appr_p7dis", decision_token: "tok_p7dis" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("approve/request is allowed when no duplicate_candidate touches the application or any of its authorised_party nodes", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("approve/apply is blocked when an open duplicate_candidate appears AFTER a successful approve/request (dynamic re-check, not baked into payload_hash)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      // Candidate created only NOW, after request already succeeded with zero touching candidates.
      await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_p7appear", decision_token: "tok_p7appear" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
      const decisionRow = await verifyPool.query(`SELECT status FROM clt1.application_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].status).toBe("requested");
    });

    it("approve/apply is blocked when a candidate transitions to duplicate AFTER a successful approve/request", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });
      const confirmReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: confirmReq.json().data.decision_id, approval_id: "iam2appr_p7trans", decision_token: "tok_p7trans" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_p7trans2", decision_token: "tok_p7trans2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
    });

    it("approve/apply's IN-TRANSACTION duplicate-gate re-check (defense in depth) blocks a candidate that appears strictly between the pre-check and the locked transaction — genuine race proof, audited as clt1.application_approval_denied with reason_code CLT1_DUPLICATE_REVIEW_REQUIRED", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      // Side-effects the CFG-01 stub (invoked AFTER decisions.ts's own duplicate-gate PRE-check has
      // already passed with zero candidates, but BEFORE the locked in-transaction re-check) to
      // insert a blocking candidate as a side effect of being called — the only available hook to
      // simulate a genuine concurrent race from a synchronous test, since app.inject offers no
      // mid-request interception point.
      config.cfg1FetchImpl = (async () => {
        await verifyPool.query(
          `INSERT INTO clt1.duplicate_candidate (duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, requested_by) VALUES ($1,'application',$2,'client',$3,'name','tester')`,
          ["clt1dc_race_" + Math.random().toString(36).slice(2, 8), created.application_id, "clt1client_race_target_" + Math.random().toString(36).slice(2, 8)],
        );
        return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_race" } }) } as Response;
      }) as typeof fetch;

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_p7race", decision_token: "tok_p7race" },
      });
      config.cfg1FetchImpl = realisticCfg1Fetch();
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
      const decisionRow = await verifyPool.query(`SELECT status FROM clt1.application_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].status).toBe("requested");

      const auditRows = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'clt1.application_approval_denied' AND payload_ref LIKE $1`,
        [`%${created.application_id}%`],
      );
      expect(auditRows.rows.length).toBeGreaterThan(0);
      expect(auditRows.rows.some((r) => (r.payload_ref as string).includes("CLT1_DUPLICATE_REVIEW_REQUIRED"))).toBe(true);
    });

    it("approval succeeds after the blocking candidate is dismissed to not_duplicate — the SAME decision_id is retriable, no new request needed", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", match_type: "corporate_ref" });

      const blockedReq = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(blockedReq.statusCode).toBe(409);
      expect(blockedReq.json().error.code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");

      const dismissReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/apply`,
        headers: internalHeaders,
        payload: { decision_id: dismissReq.json().data.decision_id, approval_id: "iam2appr_p7retry", decision_token: "tok_p7retry" },
      });

      const requestRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/request`,
        headers: internalHeaders,
        payload: { requested_by: "user_approver_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_p7retry2", decision_token: "tok_p7retry2" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      expect(applyRes.json().data.status).toBe("approved");

      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(1);
    });

    it("the CFG-01-gate-denial failure audit now uses clt1.application_approval_denied (Phase 2 L1 closed) — the old clt1.cdd_gate_denied name never appears", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);

      config.cfg1FetchImpl = denyAllCfg1("kill_switch_active");
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_p7cfgaudit", decision_token: "tok_p7cfgaudit" },
      });
      config.cfg1FetchImpl = realisticCfg1Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_CFG_GATE_DENIED");

      const renamedRows = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'clt1.application_approval_denied' AND payload_ref LIKE $1`,
        [`%${created.application_id}%`],
      );
      expect(renamedRows.rows.length).toBeGreaterThan(0);
      expect(renamedRows.rows.some((r) => (r.payload_ref as string).includes("kill_switch_active"))).toBe(true);

      const oldNameRows = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'clt1.cdd_gate_denied'`);
      expect(Number(oldNameRows.rows[0].count)).toBe(0);
    });

    it("does not add a new route, IAM-02 permission, or grant — Phase 7 is gate logic only", async () => {
      if (!schemaReady) return;
      // This query counts the LIVE total against the fully-migrated test database (all
      // migrations run upfront), not a Phase-7-scoped delta — so it reflects every later
      // phase's permissions too (33 total after Phase 8's own 3 additions), not just Phase 6's
      // 30. The assertion this test actually protects (Phase 7 itself added zero permissions) is
      // proven by the Phase 6 -> Phase 7 catalogue count staying unchanged, independently
      // confirmed by direct migration-file inspection (no `022`/`024`/`026`/`028`/`030`-shaped
      // permission-registration migration exists between 029 and 031).
      const permRows = await verifyPool.query(`SELECT count(*) FROM iam2.permission WHERE permission_code LIKE 'clt1.%'`);
      expect(Number(permRows.rows[0].count)).toBe(33);
      // M-1 remediation: scoped to exclude clt1-iam2-guard-real.test.ts's own documented,
      // legitimate runtime fixture namespace (see the helper's own header comment above) — never
      // a whole-database, cross-file-fixture-blind count. See the two proof tests immediately
      // below for the load-bearing evidence that this scoping neither hides a real defect nor
      // merely ignores every clt1.* binding wholesale.
      expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
    });

    // ---------------------------------------------------------------------------------------
    // M-1 load-bearing ownership-isolation proof. Both tests below drive the EXACT SAME
    // `countUnauthorizedCltRolePermissionBindings()` helper the real assertion above uses — not a
    // re-typed copy of the SQL — so this is a genuine proof of that helper's own behaviour, not a
    // parallel assertion that could silently drift from it.
    // ---------------------------------------------------------------------------------------
    it("M-1 proof (A+B): a foreign legitimate CLT integration-test role_permission fixture is ignored, while an unauthorized binding OUTSIDE that namespace is still detected", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.application.review'`);
      const permissionId = permRow.rows[0]?.permission_id as string | undefined;
      expect(permissionId, "fixture precondition: clt1.application.review must exist in the catalogue").toBeTruthy();

      // --- A: foreign sentinel, matching clt1-iam2-guard-real.test.ts's own exact naming
      // convention (role_clt1_[pN_]it_<random>) byte-for-byte — a legitimate row this test must
      // NEVER flag. ---
      const foreignRoleId = "role_clt1_it_m1sentinel_" + Math.random().toString(36).slice(2, 10);
      const foreignRoleCode = "clt1_it_test_role_m1sentinel_" + Math.random().toString(36).slice(2, 8);
      // --- B: an "owned-scope" unauthorized binding — deliberately OUTSIDE the foreign namespace
      // (does not match role_clt1_[pN_]it_) — modelling a hypothetical real Phase-7 leak that the
      // scoped assertion must still catch. ---
      const unauthorizedRoleId = "role_m1_unauthorized_probe_" + Math.random().toString(36).slice(2, 10);
      const unauthorizedRoleCode = "m1_unauthorized_probe_" + Math.random().toString(36).slice(2, 8);

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        foreignRoleId,
        foreignRoleCode,
        "M-1 foreign sentinel role (mirrors clt1-iam2-guard-real.test.ts)",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [foreignRoleId, permissionId]);

      try {
        // A: the foreign fixture alone must NOT be detected.
        expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);

        // B: now add an unauthorized binding OUTSIDE the foreign namespace — it MUST be detected,
        // proving the scoping did not degrade into "ignore every clt1.* binding".
        await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
          unauthorizedRoleId,
          unauthorizedRoleCode,
          "M-1 unauthorized-binding detection probe (deliberately outside the foreign namespace)",
        ]);
        await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [unauthorizedRoleId, permissionId]);
        try {
          expect(await countUnauthorizedCltRolePermissionBindings()).toBe(1);
        } finally {
          await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [unauthorizedRoleId]);
          await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [unauthorizedRoleId]);
        }

        // C: back to only the foreign fixture — must return to 0, proving the detection above was
        // genuinely caused by the unauthorized row, not a side effect.
        expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
      } finally {
        await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [foreignRoleId]);
        await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [foreignRoleId]);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("reject / hold — single-step, IAM-02-permission-gated", () => {
    it("reject transitions under_review -> rejected and creates no client_profile row", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/reject`,
        headers: internalHeaders,
        payload: { actor_id: "user_approver_1", reason_code: "duplicate_application" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("rejected");
      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
    });

    it("hold transitions under_review -> held and creates no client_profile row", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/hold`,
        headers: internalHeaders,
        payload: { actor_id: "user_approver_1", reason_code: "pending_more_evidence" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("held");
      const profileRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_profile WHERE application_id = $1`, [created.application_id]);
      expect(Number(profileRows.rows[0].count)).toBe(0);
    });

    it("reject fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/reject`,
        headers: internalHeaders,
        payload: { actor_id: "user_approver_1" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });

    it("reject/hold reject a non-under_review application", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/reject`,
        headers: internalHeaders,
        payload: { actor_id: "user_approver_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /internal/clt1/clients/:client_id/status", () => {
    it("returns only client_id/status/client_class/created_at_utc plus Phase 3+4's capability-readiness booleans — no PII", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview({ legal_name: "Client Status PII Must Not Leak Ltd" });
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);
      const applyRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_status", decision_token: "tok_status" },
      });
      const clientId = applyRes.json().data.client_id as string;

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({
        client_id: clientId,
        status: "active_limited",
        client_class: "institutional",
        created_at_utc: expect.any(String),
        mandate_configured: false,
        authorised_users_configured: false,
        authorised_parties_configured: false,
      });
      expect(JSON.stringify(res.json())).not.toContain("Client Status PII Must Not Leak");
    });

    it("returns CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/clt1client_does_not_exist/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2 audit/outbox events", () => {
    it("writes the full Phase 2 event set for a complete approve flow", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await passAllOutcomes(created.application_id as string);
      const { decision_id } = await requestApproval(created.application_id as string);
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_evt", decision_token: "tok_evt" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${created.application_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of [
        "clt1.kyc_handoff_created",
        "clt1.aml_handoff_created",
        "clt1.cdd_outcome_received",
        "clt1.application_under_review",
        "clt1.application_approval_requested",
        "clt1.application_approved",
      ]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.cdd_outcome_failed for a failed outcome receipt", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await receiveOutcome(created.application_id as string, "aml_sanctions", "hit");
      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type = 'clt1.cdd_outcome_failed' AND payload_ref LIKE $1`, [`%${created.application_id}%`]);
      expect(rows.rows.length).toBeGreaterThan(0);
    });

    it("writes clt1.application_rejected / clt1.application_held", async () => {
      if (!schemaReady) return;
      const rejected = await progressToUnderReview();
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${rejected.application_id}/reject`, headers: internalHeaders, payload: { actor_id: "user_approver_1" } });
      const rejectedRows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type = 'clt1.application_rejected' AND payload_ref LIKE $1`, [`%${rejected.application_id}%`]);
      expect(rejectedRows.rows.length).toBeGreaterThan(0);

      const held = await progressToUnderReview();
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${held.application_id}/hold`, headers: internalHeaders, payload: { actor_id: "user_approver_1" } });
      const heldRows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE event_type = 'clt1.application_held' AND payload_ref LIKE $1`, [`%${held.application_id}%`]);
      expect(heldRows.rows.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================================
  // PHASE 3 — authorised users + client mandate baseline.
  // =============================================================================================

  // -----------------------------------------------------------------------------------------
  describe("Phase 3 precondition: active_limited client required", () => {
    it("authorised-user add/request fails with CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL("clt1client_does_not_exist")}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("authorised-user add/request fails with CLT1_CLIENT_NOT_ACTIVE for a rejected application's (nonexistent) client", async () => {
      if (!schemaReady) return;
      const rejected = await progressToUnderReview();
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${rejected.application_id}/reject`, headers: internalHeaders, payload: { actor_id: "user_approver_1" } });
      // A rejected application never gets a client_profile row at all — CLT1_CLIENT_NOT_FOUND, not CLT1_CLIENT_NOT_ACTIVE.
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL("clt1client_never_created")}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("mandate create/request fails with CLT1_CLIENT_NOT_FOUND for a held application's (nonexistent) client", async () => {
      if (!schemaReady) return;
      const held = await progressToUnderReview();
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${held.application_id}/hold`, headers: internalHeaders, payload: { actor_id: "user_approver_1" } });
      const res = await app.inject({
        method: "POST",
        url: `${MANDATE_URL("clt1client_never_created")}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: {}, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-user add — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: add/request -> add/apply creates exactly one active authorised_user", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId, { user_reference: "jane@example.com", role: "client_maker" });
      expect(typeof authorised_user_id).toBe("string");

      const rows = await verifyPool.query(`SELECT authorised_user_id, client_id, role, status FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({ authorised_user_id, client_id: clientId, role: "client_maker", status: "active" });
    });

    it("self-add is blocked: requested_by cannot equal user_reference", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "same_identity@example.com", role: "viewer", requested_by: "same_identity@example.com" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_SELF_APPROVAL_BLOCKED");
    });

    it("add/request fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });

    it("add/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch (mismatched/invalid token)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad", decision_token: "tok_bad" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");

      const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].status).toBe("requested");
      const auRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      expect(Number(auRows.rows[0].count)).toBe(0);
    });

    it("duplicate apply on an already-applied add-decision cannot create a second authorised_user", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;
      const applyPayload = { decision_id, approval_id: "iam2appr_dup", decision_token: "tok_dup" };

      const first = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/add/apply`, headers: internalHeaders, payload: applyPayload });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/add/apply`, headers: internalHeaders, payload: applyPayload });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");

      const auRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      expect(Number(auRows.rows[0].count)).toBe(1);
    });

    it("audit/outbox failure rolls back add/apply — no orphaned authorised_user, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime");
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `${AU_URL(clientId)}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_audit", decision_token: "tok_audit" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");

          const auRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
          expect(Number(auRows.rows[0].count)).toBe(0);
          const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decision_id]);
          expect(decisionRow.rows[0].status).toBe("requested");
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime");
        }
      });
    });
  });

  // =============================================================================================
  // Authenticated Principal -> Client Membership Authority — the OPTIONAL iam_user_id binding on
  // add/request + add/apply (migration 067). The read-only resolution route
  // (GET /internal/clt1/principals/:iam_user_id/client-memberships) has its own dedicated file:
  // tests/integration/clt1-principal-membership-route.test.ts.
  // =============================================================================================
  describe("Authenticated Principal -> Client Membership Authority — add/request + add/apply binding", () => {
    it("add/request WITHOUT iam_user_id succeeds — creates an UNBOUND membership (iam_user_id IS NULL on both rows)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "unbound@example.com", role: "viewer", requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const decisionRow = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].iam_user_id).toBeNull();

      const { authorised_user_id } = await addAuthorisedUser(clientId, { user_reference: "unbound2@example.com" });
      const auRow = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user WHERE authorised_user_id = $1`, [authorised_user_id]);
      expect(auRow.rows[0].iam_user_id).toBeNull();
    });

    it("add/request rejects an empty-string iam_user_id (400 VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1", iam_user_id: "" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("add/request rejects a 65-character iam_user_id (400 VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1", iam_user_id: "u".repeat(65) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("add/request accepts a 64-character iam_user_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "jane@example.com", role: "viewer", requested_by: "staff_1", iam_user_id: "u".repeat(64) },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("add/request WITH iam_user_id persists it on the decision_request row, and add/apply carries it through to authorised_user.iam_user_id unchanged", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const iamUserId = "user_" + Math.random().toString(36).slice(2, 8);
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "bound@example.com", role: "client_admin", requested_by: "staff_1", iam_user_id: iamUserId },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;

      const decisionRow = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].iam_user_id).toBe(iamUserId);

      const applyRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bound", decision_token: "tok_bound" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      const auRow = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user WHERE authorised_user_id = $1`, [applyRes.json().data.authorised_user_id]);
      expect(auRow.rows[0].iam_user_id).toBe(iamUserId);
    });

    it("MAKER-CHECKER SUBSTITUTION PROOF: a request approved for iam_user_id=U1 cannot be applied as U2 — tampering the stored binding invalidates the approved payload hash", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "substitution@example.com", role: "viewer", requested_by: "staff_1", iam_user_id: "user_U1_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id, payload_hash: approvedHash } = requestRes.json().data;

      // Schema-owner simulated corruption: the stored decision request is rebound from U1 to U2
      // AFTER the maker's request was approved against U1's own payload hash.
      await verifyPool.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = $1 WHERE decision_id = $2`, ["user_U2_" + Math.random().toString(36).slice(2, 8), decision_id]);

      config.iam2FetchImpl = hashCheckingIam2Fetch(approvedHash);
      let applyRes;
      try {
        applyRes = await app.inject({
          method: "POST",
          url: `${AU_URL(clientId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_sub", decision_token: "tok_sub" },
        });
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");

      // No membership was ever created — under EITHER identity.
      const auRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      expect(Number(auRows.rows[0].count)).toBe(0);
      const decisionRowAfter = await verifyPool.query(`SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRowAfter.rows[0].status).toBe("requested");
    });

    it("runtime cannot UPDATE iam_user_id on clt1.authorised_user (column-scoped UPDATE grant unchanged)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId, { iam_user_id: "user_immutable_" + Math.random().toString(36).slice(2, 8) });
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(client.query(`UPDATE clt1.authorised_user SET iam_user_id = 'user_hijacked' WHERE authorised_user_id = $1`, [authorised_user_id])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
      const row = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user WHERE authorised_user_id = $1`, [authorised_user_id]);
      expect(row.rows[0].iam_user_id).not.toBe("user_hijacked");
    });

    it("runtime cannot UPDATE iam_user_id on clt1.authorised_user_decision_request (column-scoped UPDATE grant unchanged)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "immutable2@example.com", role: "viewer", requested_by: "staff_1", iam_user_id: "user_orig_" + Math.random().toString(36).slice(2, 8) },
      });
      const { decision_id } = requestRes.json().data;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(client.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = 'user_hijacked' WHERE decision_id = $1`, [decision_id])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("DUPLICATE-ACTIVE MAPPING: suspend M1, apply a second bound membership M2 for the SAME (iam_user_id, client_id) — allowed; reactivating M1 afterward fails closed with CLT1_AUTHORISED_USER_INVALID_STATE (never a raw 23505), M2 remains the sole active row", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const iamUserId = "user_suspreact_" + Math.random().toString(36).slice(2, 8);
      const { authorised_user_id: m1 } = await addAuthorisedUser(clientId, { user_reference: "m1@example.com", iam_user_id: iamUserId });
      const suspendRes = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${m1}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(suspendRes.statusCode, JSON.stringify(suspendRes.json())).toBe(200);

      // Creation of a new ACTIVE M2 for the SAME (iam_user_id, client_id) while M1 is suspended is
      // INTENTIONALLY allowed — the invariant is "at most one ACTIVE membership", never "one
      // historical lineage forever".
      const { authorised_user_id: m2 } = await addAuthorisedUser(clientId, { user_reference: "m2@example.com", iam_user_id: iamUserId });

      const reactivateRes = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${m1}/reactivate`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(reactivateRes.statusCode).toBe(409);
      expect(reactivateRes.json().error.code).toBe("CLT1_AUTHORISED_USER_INVALID_STATE");
      expect(JSON.stringify(reactivateRes.json())).not.toMatch(/23505|duplicate key/i);

      const rows = await verifyPool.query(`SELECT authorised_user_id, status FROM clt1.authorised_user WHERE authorised_user_id IN ($1,$2) ORDER BY authorised_user_id`, [m1, m2]);
      const byId = Object.fromEntries(rows.rows.map((r) => [r.authorised_user_id, r.status]));
      expect(byId[m1]).toBe("suspended");
      expect(byId[m2]).toBe("active");
      const activeCount = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE iam_user_id = $1 AND client_id = $2 AND status = 'active'`, [iamUserId, clientId]);
      expect(Number(activeCount.rows[0].count)).toBe(1);
    });

    it("CONCURRENCY CASE A (same decision request): a held row lock genuinely blocks a racing apply; exactly one applies, the other gets CLT1_DECISION_REQUEST_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "caseA@example.com", role: "viewer", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      const holder = await verifyPool.connect();
      await holder.query("BEGIN");
      await holder.query(`SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1 FOR UPDATE`, [decision_id]);

      let settled = false;
      const applyPromise = app
        .inject({
          method: "POST",
          url: `${AU_URL(clientId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_caseA_1", decision_token: "tok_caseA_1" },
        })
        .then((res) => {
          settled = true;
          return res;
        });

      await new Promise((r) => setTimeout(r, 300));
      expect(settled, "add/apply must be blocked on the held decision-request row lock — the barrier is not working").toBe(false);

      await holder.query("COMMIT");
      holder.release();
      const firstApply = await applyPromise;
      expect(firstApply.statusCode, JSON.stringify(firstApply.json())).toBe(200);

      const secondApply = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_caseA_2", decision_token: "tok_caseA_2" },
      });
      expect(secondApply.statusCode).toBe(409);
      expect(secondApply.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");

      const auRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      expect(Number(auRows.rows[0].count)).toBe(1);
    });

    it("CONCURRENCY CASE B (two DIFFERENT approved requests, same iam_user_id + client_id): a deterministic-overlap barrier forces both applies to race the partial unique index directly — exactly one active membership survives, the loser maps to CLT1_AUTHORISED_USER_INVALID_STATE, never a raw 23505", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const iamUserId = "user_caseB_" + Math.random().toString(36).slice(2, 8);

      async function approvedAddRequest(userReference: string): Promise<string> {
        const res = await app.inject({
          method: "POST",
          url: `${AU_URL(clientId)}/add/request`,
          headers: internalHeaders,
          payload: { user_reference: userReference, role: "viewer", requested_by: "staff_1", iam_user_id: iamUserId },
        });
        expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
        return res.json().data.decision_id as string;
      }

      const decisionA = await approvedAddRequest("caseB-a@example.com");
      const decisionB = await approvedAddRequest("caseB-b@example.com");

      // Both applies stall in the SAME 300ms execute-verify delay, forcing genuine overlap at the
      // partial-unique-index INSERT itself — never a bare-timing Promise.all assumption.
      config.iam2FetchImpl = delayedAllowAllIam2Fetch(300);
      let applyA, applyB;
      try {
        [applyA, applyB] = await Promise.all([
          app.inject({ method: "POST", url: `${AU_URL(clientId)}/add/apply`, headers: internalHeaders, payload: { decision_id: decisionA, approval_id: "iam2appr_caseB_a", decision_token: "tok_caseB_a" } }),
          app.inject({ method: "POST", url: `${AU_URL(clientId)}/add/apply`, headers: internalHeaders, payload: { decision_id: decisionB, approval_id: "iam2appr_caseB_b", decision_token: "tok_caseB_b" } }),
        ]);
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }

      const statuses = [applyA.statusCode, applyB.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = applyA.statusCode === 200 ? applyA : applyB;
      const loser = applyA.statusCode === 200 ? applyB : applyA;
      expect(winner.json().data.status).toBe("applied");
      expect(loser.json().error.code).toBe("CLT1_AUTHORISED_USER_INVALID_STATE");
      expect(JSON.stringify(loser.json())).not.toMatch(/23505|duplicate key/i);

      const activeCount = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE iam_user_id = $1 AND client_id = $2 AND status = 'active'`, [iamUserId, clientId]);
      expect(Number(activeCount.rows[0].count)).toBe(1);
    });

    it("SOURCE GUARD: the new resolution route makes NO IAM call/dependency of any kind — no iam.user_identity, no iam2.user_role, no validateAccessToken/verifyAccessToken, no IAM client import", async () => {
      const fullSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "principal-memberships.ts"), "utf8");
      // Strip the leading file-header JSDoc block — it deliberately DOCUMENTS these exact forbidden
      // terms (as an explicit "this route does NOT do X" assurance for future readers), which would
      // otherwise self-trigger a naive substring scan. Actual CODE must still avoid every term.
      const src = fullSrc.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
      for (const forbidden of ["iam.user_identity", "iam2.user_role", "validateAccessToken", "verifyAccessToken", "from \"../lib/iam2-client", "iam2Config", "iam2BaseUrl", "iam2FetchImpl"]) {
        expect(src, `principal-memberships.ts code must not reference ${forbidden}`).not.toContain(forbidden);
      }
    });

    it("SOURCE GUARD: the new resolution route mutates nothing — no publishAudit call, no INSERT/UPDATE/DELETE statement", async () => {
      const src = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "principal-memberships.ts"), "utf8");
      for (const forbidden of ["publishAudit", "INSERT INTO", "UPDATE ", "DELETE FROM", "withTransaction"]) {
        expect(src, `principal-memberships.ts must not contain ${forbidden}`).not.toContain(forbidden);
      }
    });

    it("INVENTORY: CLT1 error codes remain exactly 44 — duplicate-active membership reuses the existing CLT1_AUTHORISED_USER_INVALID_STATE, no new code", async () => {
      const { CLT1_ERROR_CODES } = await import("../../services/clt1/src/lib/errors.js");
      expect(Object.keys(CLT1_ERROR_CODES)).toHaveLength(44);
    });

    it("INVENTORY: authorised_user audit event vocabulary is unchanged at exactly 8 event types — this phase adds zero new audit events", async () => {
      const src = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "authorised-users.ts"), "utf8");
      const eventTypes = new Set(Array.from(src.matchAll(/event_type:\s*"(clt1\.authorised_user_[a-z_]+)"/g), (m) => m[1]));
      expect([...eventTypes].sort()).toEqual(
        [
          "clt1.authorised_user_add_requested",
          "clt1.authorised_user_added",
          "clt1.authorised_user_add_failed",
          "clt1.authorised_user_remove_requested",
          "clt1.authorised_user_removed",
          "clt1.authorised_user_remove_failed",
          "clt1.authorised_user_suspended",
          "clt1.authorised_user_reactivated",
        ].sort(),
      );
    });

    it("INVENTORY: migration 067 columns are exactly varchar(64) nullable on both tables, and the partial unique index has the exact frozen name", async () => {
      const cols = await verifyPool.query(
        `SELECT table_name, column_name, data_type, is_nullable, character_maximum_length
           FROM information_schema.columns
          WHERE table_schema = 'clt1' AND column_name = 'iam_user_id'
          ORDER BY table_name`,
      );
      expect(cols.rows).toEqual([
        { table_name: "authorised_user", column_name: "iam_user_id", data_type: "character varying", is_nullable: "YES", character_maximum_length: 64 },
        { table_name: "authorised_user_decision_request", column_name: "iam_user_id", data_type: "character varying", is_nullable: "YES", character_maximum_length: 64 },
      ]);
      const idx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'clt1' AND indexname = 'idx_clt1_authorised_user_one_active_per_iam_client'`);
      expect(idx.rows).toHaveLength(1);
    });

    it("INVENTORY: migration head is 067_clt1_authorised_user_iam_binding", async () => {
      const row = await verifyPool.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
      expect(row.rows[0].name).toBe("067_clt1_authorised_user_iam_binding");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-user remove — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: remove/request -> remove/apply revokes the authorised_user", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);

      const requestRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_2" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;

      const applyRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_rm", decision_token: "tok_rm" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const row = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE authorised_user_id = $1`, [authorised_user_id]);
      expect(row.rows[0].status).toBe("revoked");
    });

    it("remove/request fails with CLT1_AUTHORISED_USER_NOT_FOUND for an unknown authorised_user_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/clt1au_does_not_exist/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_USER_NOT_FOUND");
    });

    it("remove/request fails with CLT1_AUTHORISED_USER_INVALID_STATE on an already-revoked user", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);
      await verifyPool.query(`UPDATE clt1.authorised_user SET status = 'revoked' WHERE authorised_user_id = $1`, [authorised_user_id]);

      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_USER_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-user suspend/reactivate — single-step, permission-gated", () => {
    it("suspend transitions active -> suspended", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);

      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`,
        headers: internalHeaders,
        payload: { actor_id: "staff_1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("suspended");
    });

    it("reactivate transitions suspended -> active", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);
      await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });

      const res = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/reactivate`,
        headers: internalHeaders,
        payload: { actor_id: "staff_1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("active");
    });

    it("suspend fails with CLT1_AUTHORISED_USER_INVALID_STATE on an already-suspended user; reactivate fails on an active user", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);

      const reactivateOnActive = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/reactivate`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(reactivateOnActive.statusCode).toBe(409);
      expect(reactivateOnActive.json().error.code).toBe("CLT1_AUTHORISED_USER_INVALID_STATE");

      await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      const suspendAgain = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(suspendAgain.statusCode).toBe(409);
      expect(suspendAgain.json().error.code).toBe("CLT1_AUTHORISED_USER_INVALID_STATE");
    });

    it("suspend fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../authorised-users — list excludes user_reference", () => {
    it("returns the list without user_reference anywhere in the response", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedUser(clientId, { user_reference: "must-not-leak@example.com" });

      const res = await app.inject({ method: "GET", url: `${AU_URL(clientId)}?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.authorised_users).toHaveLength(1);
      expect(res.json().data.authorised_users[0]).not.toHaveProperty("user_reference");
      expect(JSON.stringify(res.json())).not.toContain("must-not-leak@example.com");
    });

    it("list read fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      config.iam2FetchImpl = denyPermissionIam2Fetch();
      const res = await app.inject({ method: "GET", url: `${AU_URL(clientId)}?actor_id=staff_1`, headers: internalHeaders });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("client mandate create — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: create/request -> create/apply creates exactly one active client_mandate", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { mandate_id } = await createMandate(clientId, { rules: { max_transaction_amount: 50000, currency: "USD" } });

      const rows = await verifyPool.query(`SELECT mandate_id, client_id, status, rules FROM clt1.client_mandate WHERE client_id = $1`, [clientId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({ mandate_id, client_id: clientId, status: "active" });
      expect(rows.rows[0].rules).toEqual({ max_transaction_amount: 50000, currency: "USD" });
    });

    it("strict rules validation rejects an unknown key at the HTTP boundary", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: { not_a_real_key: true }, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("one active mandate per client is enforced — a second create/apply for the same client fails with 409 CLT1_MANDATE_ALREADY_ACTIVE (Phase 9 F1 closure — was 503 CLT1_AUDIT_REQUIRED prior to Phase 9)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await createMandate(clientId);

      const requestRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: {}, requested_by: "staff_2" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;

      const applyRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dup_mnd", decision_token: "tok_dup_mnd" },
      });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("CLT1_MANDATE_ALREADY_ACTIVE");

      const activeRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_mandate WHERE client_id = $1 AND status = 'active'`, [clientId]);
      expect(Number(activeRows.rows[0].count)).toBe(1);
    });

    it("create/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: {}, requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad_mnd", decision_token: "tok_bad_mnd" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");

      const decisionRow = await verifyPool.query(`SELECT status FROM clt1.client_mandate_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRow.rows[0].status).toBe("requested");
    });

    it("audit/outbox failure rolls back create/apply — no orphaned mandate, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: {}, requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime");
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `${MANDATE_URL(clientId)}/create/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_audit_mnd", decision_token: "tok_audit_mnd" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");

          const mndRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_mandate WHERE client_id = $1`, [clientId]);
          expect(Number(mndRows.rows[0].count)).toBe(0);
          const decisionRow = await verifyPool.query(`SELECT status FROM clt1.client_mandate_decision_request WHERE decision_id = $1`, [decision_id]);
          expect(decisionRow.rows[0].status).toBe("requested");
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime");
        }
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("client mandate update — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: update/request -> update/apply mutates the active mandate in place and bumps version", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { mandate_id } = await createMandate(clientId, { rules: { max_transaction_amount: 1000 } });

      const requestRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/${mandate_id}/update/request`,
        headers: internalHeaders,
        payload: { rules: { max_transaction_amount: 2000 }, requested_by: "staff_2" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;

      const applyRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/${mandate_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_upd", decision_token: "tok_upd" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const row = await verifyPool.query(`SELECT rules, version FROM clt1.client_mandate WHERE mandate_id = $1`, [mandate_id]);
      expect(row.rows[0].rules).toEqual({ max_transaction_amount: 2000 });
      expect(row.rows[0].version).toBe(2);

      const countRows = await verifyPool.query(`SELECT count(*) FROM clt1.client_mandate WHERE client_id = $1`, [clientId]);
      expect(Number(countRows.rows[0].count)).toBe(1);
    });

    it("update/request fails with CLT1_MANDATE_NOT_FOUND when no mandate exists for the client", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/clt1mnd_does_not_exist/update/request`,
        headers: internalHeaders,
        payload: { rules: {}, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_MANDATE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../mandates/current", () => {
    it("returns rules (business configuration, not PII) and no applicant PII", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient({ legal_name: "Mandate Read PII Must Not Leak Ltd" });
      await createMandate(clientId, { rules: { currency: "SGD", requires_dual_signature: true } });

      const res = await app.inject({ method: "GET", url: `${MANDATE_URL(clientId)}/current?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.rules).toEqual({ currency: "SGD", requires_dual_signature: true });
      expect(JSON.stringify(res.json())).not.toContain("Mandate Read PII Must Not Leak");
    });

    it("returns CLT1_MANDATE_NOT_FOUND when the client has no active mandate", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `${MANDATE_URL(clientId)}/current?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_MANDATE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/status — Phase 3 capability-readiness extension", () => {
    it("mandate_configured and authorised_users_configured are false with no capability configured, and client_profile stays active_limited", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ status: "active_limited", mandate_configured: false, authorised_users_configured: false });
    });

    it("both flip to true once an authorised user and an active mandate exist; status remains active_limited (never active)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedUser(clientId);
      await createMandate(clientId);

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ status: "active_limited", mandate_configured: true, authorised_users_configured: true });
      expect(res.json().data.status).not.toBe("active");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 3 audit/outbox events", () => {
    it("writes the full Phase 3 event set for authorised-user add + mandate create", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedUser(clientId);
      await createMandate(clientId);

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${clientId}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.authorised_user_add_requested", "clt1.authorised_user_added", "clt1.client_mandate_create_requested", "clt1.client_mandate_created"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.authorised_user_remove_requested/.removed and clt1.authorised_user_suspended/.reactivated", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_user_id } = await addAuthorisedUser(clientId);
      await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/reactivate`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      const removeRequestRes = await app.inject({ method: "POST", url: `${AU_URL(clientId)}/${authorised_user_id}/remove/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/${authorised_user_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: removeRequestRes.json().data.decision_id, approval_id: "iam2appr_evt", decision_token: "tok_evt" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_user_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of [
        "clt1.authorised_user_suspended",
        "clt1.authorised_user_reactivated",
        "clt1.authorised_user_remove_requested",
        "clt1.authorised_user_removed",
      ]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.client_mandate_update_requested/.changed", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { mandate_id } = await createMandate(clientId);
      const updateRequestRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/${mandate_id}/update/request`,
        headers: internalHeaders,
        payload: { rules: { max_daily_amount: 1 }, requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/${mandate_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id: updateRequestRes.json().data.decision_id, approval_id: "iam2appr_evt2", decision_token: "tok_evt2" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${mandate_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      expect(types.has("clt1.client_mandate_update_requested")).toBe(true);
      expect(types.has("clt1.client_mandate_changed")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 4 precondition: active_limited client required", () => {
    it("authorised-party add/request fails with CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL("clt1client_does_not_exist")}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("authorised-party add/request fails with CLT1_CLIENT_NOT_FOUND for a held application's (nonexistent) client", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL("clt1client_never_created")}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-party add — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: add/request -> add/apply creates exactly one authorised_party at authority_status=pending with both screening columns pending", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { party_type: "ubo", ownership_percentage: 30 });

      const rows = await verifyPool.query(`SELECT authorised_party_id, party_type, authority_status, identity_verification_status, sanctions_pep_status, ownership_percentage FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        authorised_party_id,
        party_type: "ubo",
        authority_status: "pending",
        identity_verification_status: "pending",
        sanctions_pep_status: "pending",
      });
      expect(Number(rows.rows[0].ownership_percentage)).toBe(30);
    });

    it("self-add is blocked: requested_by cannot equal party_reference", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "jane@example.com", requested_by: "jane@example.com" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_SELF_APPROVAL_BLOCKED");
    });

    it("add/request fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });

    it("add/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch (mismatched/invalid token)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: true, execution_authorised: false, errorCode: "PAYLOAD_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad", decision_token: "tok_bad" },
      });
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
      config.iam2FetchImpl = allowAllIam2Fetch();

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_party`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("duplicate apply on an already-applied add-decision cannot create a second authorised_party", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;
      const payload = { decision_id, approval_id: "iam2appr_dup_ap", decision_token: "tok_dup_ap" };

      const firstApply = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/add/apply`, headers: internalHeaders, payload });
      expect(firstApply.statusCode).toBe(200);
      const secondApply = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/add/apply`, headers: internalHeaders, payload });
      expect(secondApply.statusCode).toBe(409);
      expect(secondApply.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_party WHERE application_id = (SELECT application_id FROM clt1.client_profile WHERE client_id = $1)`, [clientId]);
      expect(Number(rows.rows[0].count)).toBe(1);
    });

    it("audit/outbox failure rolls back add/apply — no orphaned authorised_party, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime`);
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `${AP_URL(clientId)}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_rb_ap", decision_token: "tok_rb_ap" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime`);
        }
      });

      const partyRows = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_party`);
      expect(Number(partyRows.rows[0].count)).toBe(0);
      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-party update — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: update/request -> update/apply mutates ownership_percentage/sec_audit_ref in place and bumps version", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { party_type: "ubo", ownership_percentage: 10 });

      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 45, sec_audit_ref: "sec_ref_updated", requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_apupd", decision_token: "tok_apupd" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT ownership_percentage, sec_audit_ref, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(Number(rows.rows[0].ownership_percentage)).toBe(45);
      expect(rows.rows[0].sec_audit_ref).toBe("sec_ref_updated");
      expect(rows.rows[0].version).toBe(2);
    });

    it("Opus M1 regression: updating only ownership_percentage must not erase an existing sec_audit_ref", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { sec_audit_ref: "sec_ref_original" });

      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 12.34, requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_m1a", decision_token: "tok_m1a" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT ownership_percentage, sec_audit_ref FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(Number(rows.rows[0].ownership_percentage)).toBe(12.34);
      expect(rows.rows[0].sec_audit_ref).toBe("sec_ref_original");
    });

    it("Opus M1 regression: updating only sec_audit_ref must not erase an existing ownership_percentage", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { ownership_percentage: 20 });

      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { sec_audit_ref: "sec_ref_only", requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_m1b", decision_token: "tok_m1b" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT ownership_percentage, sec_audit_ref FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(Number(rows.rows[0].ownership_percentage)).toBe(20);
      expect(rows.rows[0].sec_audit_ref).toBe("sec_ref_only");
    });

    it("Opus L1 regression: an ownership_percentage with more than 2 decimal places is rejected with VALIDATION_ERROR, not silently rounded or hash-mismatched", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 0.0000001, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("Opus L1 regression: a 2-decimal-place ownership_percentage round-trips through request/apply with no payload_hash mismatch", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { ownership_percentage: 33.33 });

      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 66.67, requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_l1", decision_token: "tok_l1" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT ownership_percentage FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(Number(rows.rows[0].ownership_percentage)).toBe(66.67);
    });

    it("update/request fails with CLT1_AUTHORISED_PARTY_NOT_FOUND when no party exists for the client's application", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/clt1ap_does_not_exist/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 10, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-party remove — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: remove/request -> remove/apply sets authority_status revoked", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_aprem", decision_token: "tok_aprem" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(rows.rows[0].authority_status).toBe("revoked");
    });

    it("remove/request fails with CLT1_AUTHORISED_PARTY_NOT_FOUND for an unknown authorised_party_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/clt1ap_does_not_exist/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_NOT_FOUND");
    });

    it("remove/request fails with CLT1_AUTHORISED_PARTY_INVALID_STATE on an already-revoked party", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      const req1 = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/remove/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: req1.json().data.decision_id, approval_id: "iam2appr_aprem2", decision_token: "tok_aprem2" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-party activate — screening-gated request/apply with IAM-02 execute-verify", () => {
    it("activate/request is blocked with CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED until screening is pass/clear", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/activate/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
    });

    it("full happy path: screening-outcome pass/clear -> activate/request -> activate/apply sets authority_status active", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);

      const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(rows.rows[0].authority_status).toBe("active");
    });

    it("activate succeeds when sanctions_pep_status is review_required (locked design decision, not just clear)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id, { sanctions_pep_status: "review_required" });

      const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(rows.rows[0].authority_status).toBe("active");
    });

    it("activate/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/screening-outcome`,
        headers: internalHeaders,
        payload: { identity_verification_status: "pass", sanctions_pep_status: "clear", source_module: "TEST-SCREEN", created_by: "svc_screen" },
      });
      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/activate/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: true, execution_authorised: false, errorCode: "PAYLOAD_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/activate/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad2", decision_token: "tok_bad2" },
      });
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
      config.iam2FetchImpl = allowAllIam2Fetch();

      const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
      expect(rows.rows[0].authority_status).toBe("pending");
    });

    it("activate fails with CLT1_AUTHORISED_PARTY_INVALID_STATE when the party is already active (no reactivation path)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);

      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/activate/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised-party restrict/reject/suspend — single-step, permission-gated", () => {
    it("restrict transitions pending -> restricted", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      const res = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/restrict`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.authority_status).toBe("restricted");
    });

    it("reject transitions pending -> rejected", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      const res = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.authority_status).toBe("rejected");
    });

    it("suspend transitions active -> suspended", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);
      const res = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.authority_status).toBe("suspended");
    });

    it("restrict/reject fail with CLT1_AUTHORISED_PARTY_INVALID_STATE on an already-active party; suspend fails on a pending party", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);

      const restrictRes = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/restrict`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(restrictRes.statusCode).toBe(409);
      expect(restrictRes.json().error.code).toBe("CLT1_AUTHORISED_PARTY_INVALID_STATE");

      const { authorised_party_id: pendingPartyId } = await addAuthorisedParty(clientId, { party_reference: "another@example.com" });
      const suspendRes = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${pendingPartyId}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(suspendRes.statusCode).toBe(409);
      expect(suspendRes.json().error.code).toBe("CLT1_AUTHORISED_PARTY_INVALID_STATE");
    });

    it("restrict fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/restrict`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST .../screening-outcome — internal-identity only, no IAM-02 call", () => {
    it("updates identity_verification_status/sanctions_pep_status/sec_audit_ref and sets last_screened_at_utc/screening_source_module", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/screening-outcome`,
        headers: internalHeaders,
        payload: { identity_verification_status: "fail", sec_audit_ref: "sec_ref_screen_1", source_module: "TEST-SCREEN", created_by: "svc_screen" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data).toMatchObject({ identity_verification_status: "fail", sec_audit_ref: "sec_ref_screen_1", screening_source_module: "TEST-SCREEN" });
      expect(res.json().data.last_screened_at_utc).not.toBeNull();
    });

    it("succeeds even though no iam2FetchImpl call would ever authorise it — proves the route never calls checkPermission", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      // Deliberately deny-everything IAM-02 stub — if the route called checkPermission at all,
      // this would surface as CLT1_PERMISSION_DENIED. It must not.
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/screening-outcome`,
        headers: internalHeaders,
        payload: { identity_verification_status: "pass", source_module: "TEST-SCREEN", created_by: "svc_screen" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      config.iam2FetchImpl = allowAllIam2Fetch();
    });

    it("fails with CLT1_AUTHORISED_PARTY_NOT_FOUND for an unknown authorised_party_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/clt1ap_does_not_exist/screening-outcome`,
        headers: internalHeaders,
        payload: { identity_verification_status: "pass", source_module: "TEST-SCREEN", created_by: "svc_screen" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_AUTHORISED_PARTY_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../authorised-parties — list excludes party_reference", () => {
    it("returns the list without party_reference anywhere, and no per-party client_id field (client_id appears only once, at the envelope's own top level)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedParty(clientId, { party_reference: "Must Never Appear jane@example.com" });

      const res = await app.inject({ method: "GET", url: `${AP_URL(clientId)}?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain("Must Never Appear");
      expect(JSON.stringify(res.json())).not.toContain("party_reference");
      // The envelope's own top-level client_id (mirrors authorised-users.ts's identical list
      // shape) is expected — what must be absent is a client_id field on each PER-PARTY object,
      // since authorised_party is application-scoped, not client-scoped (see
      // lib/authorised-parties.ts header comment).
      expect(res.json().data.client_id).toBe(clientId);
      for (const party of res.json().data.authorised_parties) {
        expect(party).not.toHaveProperty("client_id");
      }
    });

    it("list read fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({ method: "GET", url: `${AP_URL(clientId)}?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("authorised_party.party_type rejects client_admin/client_approver (Design Issue 2 deviation enforced, not just documented)", () => {
    it("400s on party_type='client_admin'", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "client_admin", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("400s on party_type='client_approver'", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "client_approver", party_reference: "x@example.com", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/status — Phase 4 capability-readiness extension", () => {
    it("authorised_parties_configured is false with no active party configured", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedParty(clientId);
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.authorised_parties_configured).toBe(false);
    });

    it("flips to true once an authorised_party reaches authority_status=active; status remains active_limited", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ status: "active_limited", authorised_parties_configured: true });
      expect(res.json().data.status).not.toBe("active");
    });

    it("does not change Phase 2's approval gate or client_profile.status — regression check", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("active_limited");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 4 audit/outbox events", () => {
    it("writes the full add lifecycle event set", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId, { party_type: "ubo" });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_party_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.authorised_party_added", "clt1.ubo_identified"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.authorised_party_update_requested/.updated, .remove_requested/.removed, .restricted/.rejected/.suspended, and .screened", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/screening-outcome`,
        headers: internalHeaders,
        payload: { identity_verification_status: "fail", source_module: "TEST-SCREEN", created_by: "svc_screen" },
      });
      const updateReq = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/request`,
        headers: internalHeaders,
        payload: { ownership_percentage: 5, requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id: updateReq.json().data.decision_id, approval_id: "iam2appr_evt_ap1", decision_token: "tok_evt_ap1" },
      });
      await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1" } });
      const removeReq = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/${authorised_party_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: removeReq.json().data.decision_id, approval_id: "iam2appr_evt_ap2", decision_token: "tok_evt_ap2" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_party_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of [
        "clt1.authorised_party_screened",
        "clt1.authorised_party_update_requested",
        "clt1.authorised_party_updated",
        "clt1.authorised_party_rejected",
        "clt1.authorised_party_remove_requested",
        "clt1.authorised_party_removed",
      ]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.authorised_party_activate_requested/.activated and clt1.authorised_party_suspended", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      await activateAuthorisedParty(clientId, authorised_party_id);
      await app.inject({ method: "POST", url: `${AP_URL(clientId)}/${authorised_party_id}/suspend`, headers: internalHeaders, payload: { actor_id: "staff_1" } });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_party_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.authorised_party_activate_requested", "clt1.authorised_party_activated", "clt1.authorised_party_suspended"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // PHASE 4A.2A — application-keyed pre-approval authorised-party capture. See
  // routes/application-authorised-parties.ts's own header comment for the full design.
  // -----------------------------------------------------------------------------------------
  describe("Phase 4A.2A — application-keyed pre-approval authorised-party capture", () => {
    const APP_AP_URL = (applicationId: string) => `/internal/clt1/applications/${applicationId}/authorised-parties`;

    /** Application-keyed mirror of addAuthorisedParty (Phase 4) — drives add/request -> add/apply
     * via the real HTTP flow, keyed by application_id, never client_id. */
    async function addAuthorisedPartyViaApplication(
      applicationId: string,
      overrides: { party_type?: string; party_reference?: string; requested_by?: string; ownership_percentage?: number; sec_audit_ref?: string } = {},
    ): Promise<{ authorised_party_id: string; requestRes: Awaited<ReturnType<FastifyInstance["inject"]>> }> {
      const requestRes = await app.inject({
        method: "POST",
        url: `${APP_AP_URL(applicationId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "director@example.com", requested_by: "staff_1", ...overrides },
      });
      if (requestRes.statusCode !== 200) return { authorised_party_id: "", requestRes };
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${APP_AP_URL(applicationId)}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_appap_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_appap_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      return { authorised_party_id: applyRes.json().data.authorised_party_id, requestRes };
    }

    // -----------------------------------------------------------------------------------------
    describe("organic pre-approval capture — the D1-relevant proof", () => {
      it("captures a party during under_review with NO client_id, NO client_profile row, via HTTP only (no raw SQL) — appears in GET application authorised-parties AND the Phase 4A KYC roster", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;

        // Confirm no client_profile exists yet — the entire point of this route family.
        const profileRows = await verifyPool.query(`SELECT count(*)::int n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
        expect(profileRows.rows[0].n).toBe(0);

        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "organic-director@example.com" });
        expect(authorised_party_id).toMatch(/^clt1ap_/);

        // Still no client_profile after capture.
        const profileRowsAfter = await verifyPool.query(`SELECT count(*)::int n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
        expect(profileRowsAfter.rows[0].n).toBe(0);

        const listRes = await app.inject({ method: "GET", url: `${APP_AP_URL(applicationId)}?actor_id=staff_1`, headers: internalHeaders });
        expect(listRes.statusCode).toBe(200);
        expect(listRes.json().data.application_id).toBe(applicationId);
        expect(listRes.json().data.authorised_parties.map((p: { authorised_party_id: string }) => p.authorised_party_id)).toContain(authorised_party_id);

        const rosterRes = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${applicationId}/kyc-roster`, headers: internalHeaders });
        expect(rosterRes.statusCode).toBe(200);
        const roster = rosterRes.json().data;
        expect(roster.party_count).toBe(1);
        expect(roster.authorised_parties[0].authorised_party_id).toBe(authorised_party_id);
        expect(roster.authorised_parties[0].authority_status).toBe("pending");
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("application lifecycle gating — list/add/update/remove permitted only in draft/submitted/under_review", () => {
      it("add/request succeeds while draft", async () => {
        if (!schemaReady) return;
        config.cfg1FetchImpl = realisticCfg1Fetch();
        const created = await createDraft();
        const { requestRes } = await addAuthorisedPartyViaApplication(created.application_id as string);
        expect(requestRes.statusCode).toBe(200);
      });

      it("add/request succeeds while submitted", async () => {
        if (!schemaReady) return;
        config.cfg1FetchImpl = realisticCfg1Fetch();
        const created = await createDraft();
        await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
          headers: internalHeaders,
          payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
        });
        await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
        const { requestRes } = await addAuthorisedPartyViaApplication(created.application_id as string);
        expect(requestRes.statusCode).toBe(200);
      });

      it("add/request succeeds while under_review", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const { requestRes } = await addAuthorisedPartyViaApplication(created.application_id as string);
        expect(requestRes.statusCode).toBe(200);
      });

      it("add/request refused (CLT1_APPLICATION_INVALID_STATE) while held", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const holdRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/hold`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "pending_info" } });
        expect(holdRes.statusCode).toBe(200);

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "held@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("add/request refused (CLT1_APPLICATION_INVALID_STATE) once approved", async () => {
        if (!schemaReady) return;
        const clientId = await createActiveClient();
        const clientRow = await verifyPool.query(`SELECT application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
        const applicationId = clientRow.rows[0].application_id as string;

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "approved@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("add/request refused (CLT1_APPLICATION_INVALID_STATE) once rejected", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const rejectRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "failed_review" } });
        expect(rejectRes.statusCode).toBe(200);

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "rejected@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("add/request refused (CLT1_APPLICATION_INVALID_STATE) once cancelled", async () => {
        if (!schemaReady) return;
        config.cfg1FetchImpl = realisticCfg1Fetch();
        const created = await createDraft();
        const applicationId = created.application_id as string;
        const cancelRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/cancel`, headers: internalHeaders });
        expect(cancelRes.statusCode).toBe(200);

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "cancelled@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("GET list refused (CLT1_APPLICATION_INVALID_STATE) once approved — same lifecycle gate as add/update/remove", async () => {
        if (!schemaReady) return;
        const clientId = await createActiveClient();
        const clientRow = await verifyPool.query(`SELECT application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
        const applicationId = clientRow.rows[0].application_id as string;
        const res = await app.inject({ method: "GET", url: `${APP_AP_URL(applicationId)}?actor_id=staff_1`, headers: internalHeaders });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("update/request and remove/request are gated identically — refused once approved", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId);

        await passAllOutcomes(applicationId);
        const { decision_id } = await requestApproval(applicationId, "user_approver_p42a_" + Math.random().toString(36).slice(2, 8));
        await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_p42a_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_p42a_" + Math.random().toString(36).slice(2, 8) },
        });

        const updateRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/update/request`,
          headers: internalHeaders,
          payload: { sec_audit_ref: "ref-1", requested_by: "staff_1" },
        });
        expect(updateRes.statusCode).toBe(409);
        expect(updateRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");

        const removeRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/remove/request`,
          headers: internalHeaders,
          payload: { requested_by: "staff_1" },
        });
        expect(removeRes.statusCode).toBe(409);
        expect(removeRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("screening-outcome lifecycle gating — permitted only in under_review", () => {
      it("succeeds while under_review", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId);

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/screening-outcome`,
          headers: internalHeaders,
          payload: { identity_verification_status: "pass", sanctions_pep_status: "clear", source_module: "TEST-SCREEN", created_by: "svc_screen" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.identity_verification_status).toBe("pass");
        // Never activates the party — capture and activation are separate concerns.
        expect(res.json().data.authority_status).toBe("pending");
      });

      it("refused (CLT1_APPLICATION_INVALID_STATE) while draft — narrower than capture itself (a party can be captured but not yet screened)", async () => {
        if (!schemaReady) return;
        config.cfg1FetchImpl = realisticCfg1Fetch();
        const created = await createDraft();
        const applicationId = created.application_id as string;
        // No party can genuinely exist yet in draft, but the lifecycle gate must fire BEFORE any
        // party lookup — confirmed via an arbitrary authorised_party_id.
        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/clt1ap_nonexistent/screening-outcome`,
          headers: internalHeaders,
          payload: { identity_verification_status: "pass", source_module: "TEST-SCREEN", created_by: "svc_screen" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });

      it("refused (CLT1_APPLICATION_INVALID_STATE) once submitted — narrower window than capture", async () => {
        if (!schemaReady) return;
        config.cfg1FetchImpl = realisticCfg1Fetch();
        const created = await createDraft();
        const applicationId = created.application_id as string;
        await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/consents`,
          headers: internalHeaders,
          payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
        });
        await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/submit`, headers: internalHeaders });

        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/clt1ap_nonexistent/screening-outcome`,
          headers: internalHeaders,
          payload: { identity_verification_status: "pass", source_module: "TEST-SCREEN", created_by: "svc_screen" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("party types", () => {
      for (const partyType of ["signatory", "director", "controller", "ubo"]) {
        it(`captures a ${partyType} party via the application-keyed route`, async () => {
          if (!schemaReady) return;
          const created = await progressToUnderReview();
          const applicationId = created.application_id as string;
          const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_type: partyType, party_reference: `${partyType}@example.com` });
          expect(authorised_party_id).toMatch(/^clt1ap_/);

          const rows = await verifyPool.query(`SELECT party_type FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
          expect(rows.rows[0].party_type).toBe(partyType);
        });
      }

      it("ubo_identified audit event fires for a ubo party captured via the application-keyed route (same as the client-keyed route)", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_type: "ubo", party_reference: "ubo-app-keyed@example.com" });

        const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_party_id}%`]);
        const types = new Set(rows.rows.map((r) => r.event_type));
        expect(types.has("clt1.authorised_party_added")).toBe(true);
        expect(types.has("clt1.ubo_identified")).toBe(true);
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("maker-checker preservation — identical guarantees to the client-keyed route", () => {
      it("requester cannot approve their own add (CLT1_SELF_APPROVAL_BLOCKED — requested_by === party_reference)", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "staff_1", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("CLT1_SELF_APPROVAL_BLOCKED");
      });

      it("apply requires a valid approval token — a deny from IAM-02 execute-verify refuses with CLT1_APPROVAL_REQUIRED, no party row created", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "denyme@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;

        config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_DECISION_TOKEN_INVALID" }) });
        const applyRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_deny_" + Math.random().toString(36).slice(2, 8), decision_token: "bad_tok" },
        });
        expect(applyRes.statusCode).toBe(403);
        expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
        config.iam2FetchImpl = allowAllIam2Fetch();

        const rows = await verifyPool.query(`SELECT count(*)::int n FROM clt1.authorised_party WHERE application_id = $1`, [applicationId]);
        expect(rows.rows[0].n).toBe(0);
      });

      it("payload_hash is recomputed from the STORED decision row at apply time, not a re-submitted body — an approval bound to a different party_type is rejected", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "hashcheck@example.com", requested_by: "staff_1" },
        });
        const { decision_id, payload_hash: requestedHash } = requestRes.json().data;

        let seenPayloadHash: string | undefined;
        config.iam2FetchImpl = makeFakeIam2Fetch({
          verify: (body) => {
            seenPayloadHash = body.current_payload_hash as string;
            return { ok: true, execution_authorised: true };
          },
        });
        const applyRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_hash_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_hash_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(applyRes.statusCode).toBe(200);
        expect(seenPayloadHash).toBe(requestedHash);
        config.iam2FetchImpl = allowAllIam2Fetch();
      });

      it("stale request refused (CLT1_DECISION_REQUEST_INVALID_STATE) — a decision already applied cannot be applied again", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "stale@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;
        const applyPayload = { decision_id, approval_id: "iam2appr_stale_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_stale_" + Math.random().toString(36).slice(2, 8) };
        const firstApply = await app.inject({ method: "POST", url: `${APP_AP_URL(applicationId)}/add/apply`, headers: internalHeaders, payload: applyPayload });
        expect(firstApply.statusCode).toBe(200);

        const secondApply = await app.inject({ method: "POST", url: `${APP_AP_URL(applicationId)}/add/apply`, headers: internalHeaders, payload: applyPayload });
        expect(secondApply.statusCode).toBe(409);
        expect(secondApply.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");
      });

      it("a decision request belonging to a DIFFERENT application cannot be applied through this application's route (CLT1_AUTHORISED_PARTY_NOT_FOUND)", async () => {
        if (!schemaReady) return;
        const createdA = await progressToUnderReview();
        const createdB = await progressToUnderReview();
        const applicationIdA = createdA.application_id as string;
        const applicationIdB = createdB.application_id as string;

        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationIdA)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "cross-app@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;

        const crossApplyRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationIdB)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_cross_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_cross_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(crossApplyRes.statusCode).toBe(404);
        expect(crossApplyRes.json().error.code).toBe("CLT1_AUTHORISED_PARTY_NOT_FOUND");
      });

      it("the decision token is never stored raw — only fingerprint(decision_token) lands in decision_token_hash", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const rawToken = "tok_never_stored_raw_" + Math.random().toString(36).slice(2, 8);
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "rawtoken@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;
        await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_raw_" + Math.random().toString(36).slice(2, 8), decision_token: rawToken },
        });

        const rows = await verifyPool.query(`SELECT decision_token_hash FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
        expect(rows.rows[0].decision_token_hash).not.toBe(rawToken);
        expect(rows.rows[0].decision_token_hash).not.toContain(rawToken);
      });

      it("a duplicate pending add/request for the same application is independently trackable (both requests coexist as separate decision rows — unchanged behaviour)", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const first = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "dup1@example.com", requested_by: "staff_1" },
        });
        const second = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "dup2@example.com", requested_by: "staff_1" },
        });
        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(200);
        expect(first.json().data.decision_id).not.toBe(second.json().data.decision_id);
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("party lifecycle — immutability and revoke-not-delete", () => {
      it("add creates a party in authority_status='pending'", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId);
        const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(rows.rows[0].authority_status).toBe("pending");
      });

      it("update via the application-keyed route mutates ownership_percentage/sec_audit_ref only — authorised_party_id/application_id/party_type/party_reference stay immutable", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_type: "controller", party_reference: "immutable@example.com" });

        const updateReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/update/request`,
          headers: internalHeaders,
          payload: { sec_audit_ref: "ref-updated", requested_by: "staff_1" },
        });
        expect(updateReq.statusCode).toBe(200);
        const { decision_id } = updateReq.json().data;
        const updateApply = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/update/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_upd_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_upd_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(updateApply.statusCode).toBe(200);

        const rows = await verifyPool.query(`SELECT authorised_party_id, application_id, party_type, party_reference, sec_audit_ref FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(rows.rows[0].authorised_party_id).toBe(authorised_party_id);
        expect(rows.rows[0].application_id).toBe(applicationId);
        expect(rows.rows[0].party_type).toBe("controller");
        expect(rows.rows[0].party_reference).toBe("immutable@example.com");
        expect(rows.rows[0].sec_audit_ref).toBe("ref-updated");
      });

      it("remove results in authority_status='revoked' — the row is never deleted", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId);

        const removeReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/remove/request`,
          headers: internalHeaders,
          payload: { requested_by: "staff_2" },
        });
        expect(removeReq.statusCode).toBe(200);
        const { decision_id } = removeReq.json().data;
        const removeApply = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/remove/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_rem_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_rem_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(removeApply.statusCode).toBe(200);
        expect(removeApply.json().data.status).toBe("revoked");

        const rows = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(rows.rows).toHaveLength(1); // row still exists — never deleted
        expect(rows.rows[0].authority_status).toBe("revoked");
      });

      it("replacing a party (revoke + add) creates a genuinely NEW authorised_party_id, never reusing the revoked one", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id: originalId } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "original@example.com" });

        const removeReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${originalId}/remove/request`,
          headers: internalHeaders,
          payload: { requested_by: "staff_2" },
        });
        const { decision_id: removeDecisionId } = removeReq.json().data;
        await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${originalId}/remove/apply`,
          headers: internalHeaders,
          payload: { decision_id: removeDecisionId, approval_id: "iam2appr_rep_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_rep_" + Math.random().toString(36).slice(2, 8) },
        });

        const { authorised_party_id: replacementId } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "replacement@example.com" });
        expect(replacementId).not.toBe(originalId);

        const rows = await verifyPool.query(`SELECT authorised_party_id, authority_status FROM clt1.authorised_party WHERE application_id = $1 ORDER BY created_at_utc ASC`, [applicationId]);
        expect(rows.rows).toHaveLength(2);
        expect(rows.rows[0]).toMatchObject({ authorised_party_id: originalId, authority_status: "revoked" });
        expect(rows.rows[1]).toMatchObject({ authorised_party_id: replacementId, authority_status: "pending" });
      });

      it("GET application authorised-parties list never returns party_reference (same safe projection as the client-keyed route)", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        await addAuthorisedPartyViaApplication(applicationId, { party_reference: "must-not-leak@example.com" });

        const res = await app.inject({ method: "GET", url: `${APP_AP_URL(applicationId)}?actor_id=staff_1`, headers: internalHeaders });
        expect(res.statusCode).toBe(200);
        const serialized = JSON.stringify(res.json().data);
        expect(serialized).not.toContain("must-not-leak@example.com");
        expect(serialized).not.toContain("party_reference");
      });

      it("deterministic ordering — created_at_utc ASC, identical to the client-keyed route's own ordering", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id: first } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "first@example.com" });
        const { authorised_party_id: second } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "second@example.com" });

        const res = await app.inject({ method: "GET", url: `${APP_AP_URL(applicationId)}?actor_id=staff_1`, headers: internalHeaders });
        const ids = res.json().data.authorised_parties.map((p: { authorised_party_id: string }) => p.authorised_party_id);
        expect(ids).toEqual([first, second]);
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("permission model — reuses the existing 8 clt1.authorised_party.* permissions, entityId=application_id", () => {
      it("add/request denies when IAM-02 returns deny (CLT1_PERMISSION_DENIED), no decision row created", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        config.iam2FetchImpl = denyPermissionIam2Fetch();
        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "denied@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
        config.iam2FetchImpl = allowAllIam2Fetch();

        const rows = await verifyPool.query(`SELECT count(*)::int n FROM clt1.authorised_party_decision_request WHERE application_id = $1`, [applicationId]);
        expect(rows.rows[0].n).toBe(0);
      });

      it("IAM-02 unreachable -> CLT1_IAM2_UNAVAILABLE", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        config.iam2FetchImpl = iam2Unreachable();
        const res = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "unreachable@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("CLT1_IAM2_UNAVAILABLE");
        config.iam2FetchImpl = allowAllIam2Fetch();
      });

      it("checkPermission is called with entityId=application_id, exactly matching the existing client-keyed contract", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        let seenEntityId: string | undefined;
        let seenAction: string | undefined;
        config.iam2FetchImpl = makeFakeIam2Fetch({
          checkDecision: (body) => {
            seenEntityId = body.entity_id as string;
            seenAction = body.action as string;
            return { decision: "allow", reason: "permission_granted" };
          },
        });
        await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "entityid@example.com", requested_by: "staff_1" },
        });
        expect(seenEntityId).toBe(applicationId);
        expect(seenAction).toBe("clt1.authorised_party.add");
        config.iam2FetchImpl = allowAllIam2Fetch();
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("concurrency — the application-keyed apply path takes the SAME advisory lock", () => {
      it("application-keyed add/apply genuinely blocks on the SAME advisory lock held by an independent connection", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "app-lockprobe@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;

        const holder = await verifyPool.connect();
        await holder.query("BEGIN");
        await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);

        let applySettled = false;
        const applyPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_applockprobe_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_applockprobe_" + Math.random().toString(36).slice(2, 8) },
          })
          .then((res) => {
            applySettled = true;
            return res;
          });

        await new Promise((r) => setTimeout(r, 300));
        expect(applySettled, "application-keyed authorised-party add/apply completed WITHOUT waiting for the held advisory lock").toBe(false);

        await holder.query("COMMIT");
        holder.release();
        const res = await applyPromise;
        expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      });

      // =====================================================================================
      // SECURITY REMEDIATION (post-Opus-review CRITICAL-1/CRITICAL-2) — deterministic proofs
      // that no application-keyed roster mutation can commit after its application becomes
      // ineligible. The original version of this test used Promise.all and asserted only "exactly
      // one side succeeds" — a coin flip that could not detect the unsafe third outcome (BOTH
      // succeed) unless that exact ordering happened to occur in a given run. Every test below
      // uses an OBSERVABLE BARRIER (a held advisory lock, or a deterministically-delayed IAM-02
      // stub call) to force a specific ordering, never a bare sleep as the sole synchronisation
      // mechanism.
      // =====================================================================================

      /** Deterministically forces "reject/hold wins" against an in-flight application-keyed
       * add/apply: holds the roster advisory lock from an independent connection so add/apply
       * blocks INSIDE its own transaction (after acquireKycRosterLock, before its new
       * client_application FOR UPDATE lifecycle check), performs the given lifecycle-changing
       * action (which — critically — takes NO roster advisory lock, so it commits freely while
       * add/apply is blocked), then releases the lock and returns add/apply's final response. */
      async function raceLifecycleChangeAgainstBlockedAddApply(
        applicationId: string,
        decisionId: string,
        performLifecycleChange: () => Promise<void>,
      ): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
        const holder = await verifyPool.connect();
        await holder.query("BEGIN");
        await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);

        let applySettled = false;
        const applyPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id: decisionId, approval_id: "iam2appr_detrace_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detrace_" + Math.random().toString(36).slice(2, 8) },
          })
          .then((res) => {
            applySettled = true;
            return res;
          });

        await new Promise((r) => setTimeout(r, 300));
        expect(applySettled, "add/apply must be blocked on the held advisory lock at this point — the barrier is not working").toBe(false);

        await performLifecycleChange();

        await holder.query("COMMIT");
        holder.release();
        return applyPromise;
      }

      it("DETERMINISTIC: reject wins the race against an in-flight add/apply — add/apply refuses with CLT1_APPLICATION_INVALID_STATE, no party inserted, decision request remains requested, no success audit", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "det-reject-race@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;

        const applyRes = await raceLifecycleChangeAgainstBlockedAddApply(applicationId, decision_id, async () => {
          const rejectRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "failed_review" } });
          expect(rejectRes.statusCode).toBe(200);
          const st = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
          expect(st.rows[0].status, "reject must have genuinely committed before add/apply is released").toBe("rejected");
        });

        expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(409);
        expect(applyRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");

        const parties = await verifyPool.query(`SELECT count(*)::int n FROM clt1.authorised_party WHERE application_id = $1`, [applicationId]);
        expect(parties.rows[0].n, "no authorised_party row may exist after a lifecycle-refused add/apply").toBe(0);

        const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
        expect(decisionRow.rows[0].status, "the decision request must remain requested — never consumed on lifecycle refusal").toBe("requested");

        const events = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${decision_id}%`]);
        const types = new Set(events.rows.map((r) => r.event_type));
        expect(types.has("clt1.authorised_party_added"), "no success event may be emitted for a lifecycle-refused apply").toBe(false);
        expect(types.has("clt1.authorised_party_add_failed"), "a genuine failure event must still be recorded").toBe(true);
      });

      it("DETERMINISTIC: hold wins the race against an in-flight add/apply — add/apply refuses with CLT1_APPLICATION_INVALID_STATE, no party inserted", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const requestRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "det-hold-race@example.com", requested_by: "staff_1" },
        });
        const { decision_id } = requestRes.json().data;

        const applyRes = await raceLifecycleChangeAgainstBlockedAddApply(applicationId, decision_id, async () => {
          const holdRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/hold`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "pending_info" } });
          expect(holdRes.statusCode).toBe(200);
          const st = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
          expect(st.rows[0].status, "hold must have genuinely committed before add/apply is released").toBe("held");
        });

        expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(409);
        expect(applyRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");

        const parties = await verifyPool.query(`SELECT count(*)::int n FROM clt1.authorised_party WHERE application_id = $1`, [applicationId]);
        expect(parties.rows[0].n).toBe(0);
        const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
        expect(decisionRow.rows[0].status).toBe("requested");
      });

      it("DETERMINISTIC: the same reject-vs-blocked-mutation barrier proves update/apply refuses with no field change and no version increment", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "det-update-target@example.com" });
        const before = await verifyPool.query(`SELECT sec_audit_ref, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);

        const updateReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/update/request`,
          headers: internalHeaders,
          payload: { sec_audit_ref: "det-update-ref", requested_by: "staff_1" },
        });
        const { decision_id } = updateReq.json().data;

        const holder = await verifyPool.connect();
        await holder.query("BEGIN");
        await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);
        let applySettled = false;
        const applyPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/update/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_detupd_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detupd_" + Math.random().toString(36).slice(2, 8) },
          })
          .then((r) => { applySettled = true; return r; });
        await new Promise((r) => setTimeout(r, 300));
        expect(applySettled).toBe(false);
        const rejectRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "failed_review" } });
        expect(rejectRes.statusCode).toBe(200);
        await holder.query("COMMIT");
        holder.release();
        const applyRes = await applyPromise;

        expect(applyRes.statusCode).toBe(409);
        expect(applyRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
        const after = await verifyPool.query(`SELECT sec_audit_ref, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(after.rows[0].sec_audit_ref).toBe(before.rows[0].sec_audit_ref);
        expect(after.rows[0].version).toBe(before.rows[0].version);
        const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
        expect(decisionRow.rows[0].status).toBe("requested");
        const events = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${decision_id}%`]);
        expect(new Set(events.rows.map((r) => r.event_type)).has("clt1.authorised_party_updated")).toBe(false);
      });

      it("DETERMINISTIC: the same reject-vs-blocked-mutation barrier proves remove/apply refuses — party never revoked, never deleted, no version increment", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "det-remove-target@example.com" });
        const before = await verifyPool.query(`SELECT authority_status, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);

        const removeReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/remove/request`,
          headers: internalHeaders,
          payload: { requested_by: "staff_2" },
        });
        const { decision_id } = removeReq.json().data;

        const holder = await verifyPool.connect();
        await holder.query("BEGIN");
        await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);
        let applySettled = false;
        const applyPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/remove/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_detrem_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detrem_" + Math.random().toString(36).slice(2, 8) },
          })
          .then((r) => { applySettled = true; return r; });
        await new Promise((r) => setTimeout(r, 300));
        expect(applySettled).toBe(false);
        const rejectRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "failed_review" } });
        expect(rejectRes.statusCode).toBe(200);
        await holder.query("COMMIT");
        holder.release();
        const applyRes = await applyPromise;

        expect(applyRes.statusCode).toBe(409);
        expect(applyRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
        const after = await verifyPool.query(`SELECT authority_status, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(after.rows[0].authority_status).toBe(before.rows[0].authority_status);
        expect(after.rows[0].authority_status).not.toBe("revoked");
        expect(after.rows[0].version).toBe(before.rows[0].version);
        const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [decision_id]);
        expect(decisionRow.rows[0].status).toBe("requested");
      });

      it("DETERMINISTIC: the same reject-vs-blocked-mutation barrier proves screening-outcome refuses — no field change, no version increment, no audit", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId, { party_reference: "det-screen-target@example.com" });
        const before = await verifyPool.query(`SELECT identity_verification_status, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);

        const holder = await verifyPool.connect();
        await holder.query("BEGIN");
        await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);
        let applySettled = false;
        const screenPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/screening-outcome`,
            headers: internalHeaders,
            payload: { identity_verification_status: "pass", sanctions_pep_status: "clear", source_module: "DET-TEST", created_by: "det_svc" },
          })
          .then((r) => { applySettled = true; return r; });
        await new Promise((r) => setTimeout(r, 300));
        expect(applySettled).toBe(false);
        const rejectRes = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${applicationId}/reject`, headers: internalHeaders, payload: { actor_id: "staff_1", reason_code: "failed_review" } });
        expect(rejectRes.statusCode).toBe(200);
        await holder.query("COMMIT");
        holder.release();
        const screenRes = await screenPromise;

        expect(screenRes.statusCode).toBe(409);
        expect(screenRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
        const after = await verifyPool.query(`SELECT identity_verification_status, version FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);
        expect(after.rows[0].identity_verification_status).toBe(before.rows[0].identity_verification_status);
        expect(after.rows[0].identity_verification_status).not.toBe("pass");
        expect(after.rows[0].version).toBe(before.rows[0].version);
        const events = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${authorised_party_id}%`]);
        expect(new Set(events.rows.map((r) => r.event_type)).has("clt1.authorised_party_screened")).toBe(false);
      });

      it("DETERMINISTIC: approval commits first (deterministically delayed IAM-02 barrier on add/apply's own execute-verify call) — add/apply then refuses with CLT1_APPLICATION_INVALID_STATE, roster stays unchanged, no divergence between accepted and current roster hash", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        await passAllOutcomes(applicationId); // kyc_kyb carries the real, current (zero-party) roster hash
        const rosterBefore = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${applicationId}/kyc-roster`, headers: internalHeaders });
        const rosterHashBefore = rosterBefore.json().data.roster_hash as string;
        expect(rosterBefore.json().data.party_count).toBe(0);

        const addReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "det-approval-first@example.com", requested_by: "staff_1" },
        });
        const { decision_id: addDecisionId } = addReq.json().data;
        const { decision_id: approvalDecisionId } = await requestApproval(applicationId, "user_approver_detfirst_" + Math.random().toString(36).slice(2, 8));

        // Deterministic barrier — a REAL delay inside the IAM-02 stub itself, matched by
        // action=clt1.authorised_party.add so it hits ONLY add/apply's own execute-verify call
        // (the LAST await before applyPartyAdd enters its transaction). This makes add/apply
        // observably pause AFTER its route preflight and AFTER its own checkPermission call, but
        // BEFORE it ever reaches acquireKycRosterLock — precisely the real window CRITICAL-2
        // exploited. approve/apply's own execute-verify call (action=clt1.application.approve)
        // is never delayed, so its entire transaction (lock, roster recheck, client_profile
        // INSERT, status UPDATE, commit) can complete well within the delay window — this is a
        // genuine ordering guarantee, not a race: add/apply CANNOT reach the roster lock until
        // the delay elapses, and approve/apply's undelayed round trip finishes in milliseconds.
        const ADD_VERIFY_DELAY_MS = 500;
        config.iam2FetchImpl = (async (url: unknown, init?: unknown) => {
          const urlStr = String(url);
          const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
          if (urlStr.endsWith("/internal/iam2/permission/check")) {
            return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
          }
          if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
            if (body.action === "clt1.authorised_party.add") await new Promise((r) => setTimeout(r, ADD_VERIFY_DELAY_MS));
            return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
          }
          throw new Error(`unexpected IAM-02 URL in det-approval-first barrier: ${urlStr}`);
        }) as typeof fetch;

        let addApplySettled = false;
        const addApplyPromise = app
          .inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id: addDecisionId, approval_id: "iam2appr_detfirst1_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detfirst1_" + Math.random().toString(36).slice(2, 8) },
          })
          .then((r) => { addApplySettled = true; return r; });

        // approve/apply is fired and FULLY AWAITED while add/apply is still sitting inside the
        // delayed execute-verify call — guaranteed by the delay being strictly longer than a
        // local in-process HTTP+DB round trip.
        const approveApplyRes = await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
          headers: internalHeaders,
          payload: { decision_id: approvalDecisionId, approval_id: "iam2appr_detfirst2_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detfirst2_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(addApplySettled, "add/apply must still be paused inside its delayed execute-verify call when approve/apply completes").toBe(false);
        expect(approveApplyRes.statusCode, JSON.stringify(approveApplyRes.json())).toBe(200);
        const appRow = await verifyPool.query(`SELECT status, kyc_roster_hash FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
        expect(appRow.rows[0].status).toBe("approved");
        const profileRow = await verifyPool.query(`SELECT count(*)::int n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
        expect(profileRow.rows[0].n).toBe(1);

        const addApplyRes = await addApplyPromise;
        expect(addApplyRes.statusCode, JSON.stringify(addApplyRes.json())).toBe(409);
        expect(addApplyRes.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");

        const parties = await verifyPool.query(`SELECT count(*)::int n FROM clt1.authorised_party WHERE application_id = $1`, [applicationId]);
        expect(parties.rows[0].n, "no authorised_party may exist after approval — CRITICAL-2 must not reproduce").toBe(0);
        const decisionRow = await verifyPool.query(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1`, [addDecisionId]);
        expect(decisionRow.rows[0].status).toBe("requested");
        const events = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${addDecisionId}%`]);
        expect(new Set(events.rows.map((r) => r.event_type)).has("clt1.authorised_party_added")).toBe(false);

        const rosterAfter = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${applicationId}/kyc-roster`, headers: internalHeaders });
        expect(rosterAfter.json().data.party_count, "current roster must still be zero — no party ever landed").toBe(0);
        // The roster hash itself is EXPECTED to differ from rosterHashBefore, and there is no
        // general invariant that the accepted kyc_roster_hash keeps matching the live roster
        // forever after approval — application_status is part of the hashed canonical input
        // (confirmed directly in lib/kyc-roster.ts), so approval alone changes the hash even with
        // zero parties, and the client-keyed post-approval routes can legitimately mutate the
        // roster afterward (that is the whole reason POST_APPROVAL_PARTY_STATUSES exists). The
        // property that DOES matter, and is what CRITICAL-2 broke, is proven directly above and
        // below instead: zero authorised_party rows exist, and the current roster's own
        // party_count is zero — no unKYC'd party ever landed on this approved application.
        expect(rosterAfter.json().data.roster_hash).not.toBe(rosterHashBefore); // sanity: application_status did change the hash, as expected

        config.iam2FetchImpl = allowAllIam2Fetch();
      });

      it("DETERMINISTIC (complementary ordering): party add/apply commits FIRST, roster changes, final approval then refuses with CLT1_KYC_ROSTER_STALE — no client_profile created", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        await passAllOutcomes(applicationId);

        const addReq = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "det-party-first@example.com", requested_by: "staff_1" },
        });
        const { decision_id: addDecisionId } = addReq.json().data;
        const { decision_id: approvalDecisionId } = await requestApproval(applicationId, "user_approver_detsecond_" + Math.random().toString(36).slice(2, 8));

        // Purely sequential — no race needed to prove this direction: add/apply is awaited to
        // full completion BEFORE approve/apply is ever called, which is itself a deterministic
        // proof that "party commits first" leads to a stale-roster approval refusal.
        const addApplyRes = await app.inject({
          method: "POST",
          url: `${APP_AP_URL(applicationId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id: addDecisionId, approval_id: "iam2appr_detsecond1_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detsecond1_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(addApplyRes.statusCode, JSON.stringify(addApplyRes.json())).toBe(200);

        const approveApplyRes = await app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
          headers: internalHeaders,
          payload: { decision_id: approvalDecisionId, approval_id: "iam2appr_detsecond2_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_detsecond2_" + Math.random().toString(36).slice(2, 8) },
        });
        expect(approveApplyRes.statusCode).toBe(409);
        expect(approveApplyRes.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");

        const profileRow = await verifyPool.query(`SELECT count(*)::int n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
        expect(profileRow.rows[0].n, "no client_profile may be created when approval is refused as stale").toBe(0);
        const appRow = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
        expect(appRow.rows[0].status).toBe("under_review");
      });
    });

    // -----------------------------------------------------------------------------------------
    describe("regression — existing client-keyed routes remain byte-identical after the shared-service refactor", () => {
      it("client-keyed add/request -> add/apply still returns client_id (never application_id) in the response, exactly as before", async () => {
        if (!schemaReady) return;
        const clientId = await createActiveClient();
        const { authorised_party_id } = await addAuthorisedParty(clientId, { party_reference: "regression-check@example.com" });
        expect(authorised_party_id).toMatch(/^clt1ap_/);

        const listRes = await app.inject({ method: "GET", url: `${AP_URL(clientId)}?actor_id=staff_1`, headers: internalHeaders });
        expect(listRes.statusCode).toBe(200);
        expect(listRes.json().data.client_id).toBe(clientId);
        expect(listRes.json().data).not.toHaveProperty("application_id");
      });

      it("client-keyed routes still require an active_limited client_profile — CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
        if (!schemaReady) return;
        const res = await app.inject({
          method: "POST",
          url: `/internal/clt1/clients/clt1client_does_not_exist/authorised-parties/add/request`,
          headers: internalHeaders,
          payload: { party_type: "director", party_reference: "x@example.com", requested_by: "staff_1" },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
      });

      it("activate/restrict/reject/suspend remain client-keyed-only — no application-keyed equivalent route exists", async () => {
        if (!schemaReady) return;
        const created = await progressToUnderReview();
        const applicationId = created.application_id as string;
        const { authorised_party_id } = await addAuthorisedPartyViaApplication(applicationId);
        for (const pathSegment of ["activate/request", "restrict", "reject", "suspend"]) {
          const res = await app.inject({
            method: "POST",
            url: `${APP_AP_URL(applicationId)}/${authorised_party_id}/${pathSegment}`,
            headers: internalHeaders,
            payload: { requested_by: "staff_1", actor_id: "staff_1" },
          });
          expect(res.statusCode, `${pathSegment} unexpectedly has an application-keyed route`).toBe(404);
        }
      });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 5 precondition: node existence required", () => {
    it("add/request fails with CLT1_RELATED_PARTY_NODE_NOT_FOUND when from_entity_id does not exist", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: "clt1client_does_not_exist", to_entity_type: "client", to_entity_id: "clt1client_does_not_exist_2", relationship_type: "shared_address", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_RELATED_PARTY_NODE_NOT_FOUND");
    });

    it("add/request fails with CLT1_RELATED_PARTY_NODE_NOT_FOUND when to_entity_id does not exist", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientId, to_entity_type: "client", to_entity_id: "clt1client_does_not_exist", relationship_type: "shared_address", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_RELATED_PARTY_NODE_NOT_FOUND");
    });

    it("add/request validates application and party node types too, not just client", async () => {
      if (!schemaReady) return;
      const applicationRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "application", from_entity_id: "clt1app_does_not_exist", to_entity_type: "application", to_entity_id: "clt1app_does_not_exist_2", relationship_type: "shared_identity", requested_by: "staff_1" },
      });
      expect(applicationRes.statusCode).toBe(404);
      expect(applicationRes.json().error.code).toBe("CLT1_RELATED_PARTY_NODE_NOT_FOUND");

      const partyRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "party", from_entity_id: "clt1ap_does_not_exist", to_entity_type: "party", to_entity_id: "clt1ap_does_not_exist_2", relationship_type: "ubo", requested_by: "staff_1" },
      });
      expect(partyRes.statusCode).toBe(404);
      expect(partyRes.json().error.code).toBe("CLT1_RELATED_PARTY_NODE_NOT_FOUND");
    });

    it("does not allow an arbitrary unvalidated entity_type value (schema rejects it at the HTTP boundary)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "not_a_real_type", from_entity_id: "x", to_entity_type: "client", to_entity_id: "y", relationship_type: "shared_address", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("related-party edge add — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: add/request -> add/apply creates exactly one active related_party_edge", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const { related_party_edge_id } = await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address" });

      const rows = await verifyPool.query(`SELECT related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, status FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({ related_party_edge_id, from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", status: "active" });
    });

    it("self-reference is blocked with VALIDATION_ERROR at add/request", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientId, to_entity_type: "client", to_entity_id: clientId, relationship_type: "shared_address", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("add/request fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });

    it("add/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: true, execution_authorised: false, errorCode: "PAYLOAD_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_bad_rpe", decision_token: "tok_bad_rpe" },
      });
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
      config.iam2FetchImpl = allowAllIam2Fetch();

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.related_party_edge`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("duplicate apply on an already-applied add-decision cannot create a second related_party_edge", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;
      const payload = { decision_id, approval_id: "iam2appr_dup_rpe", decision_token: "tok_dup_rpe" };

      const firstApply = await app.inject({ method: "POST", url: `${RPE_URL}/add/apply`, headers: internalHeaders, payload });
      expect(firstApply.statusCode).toBe(200);
      const secondApply = await app.inject({ method: "POST", url: `${RPE_URL}/add/apply`, headers: internalHeaders, payload });
      expect(secondApply.statusCode).toBe(409);
      expect(secondApply.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.related_party_edge WHERE from_entity_id = $1`, [clientA]);
      expect(Number(rows.rows[0].count)).toBe(1);
    });

    it("a second add/apply for the exact same (from,to,relationship_type) tuple is rejected with CLT1_RELATED_PARTY_EDGE_DUPLICATE (409), not CLT1_AUDIT_REQUIRED (503)", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address" });

      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", requested_by: "staff_2" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dupedge", decision_token: "tok_dupedge" },
      });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("CLT1_RELATED_PARTY_EDGE_DUPLICATE");

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.related_party_edge WHERE from_entity_id = $1 AND to_entity_id = $2 AND status = 'active'`, [clientA, clientB]);
      expect(Number(rows.rows[0].count)).toBe(1);
    });

    it("a different relationship_type between the same two nodes is NOT blocked as a duplicate (exact-tuple uniqueness only)", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address" });
      const { related_party_edge_id } = await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_identity" });
      expect(related_party_edge_id).toBeTruthy();

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.related_party_edge WHERE from_entity_id = $1 AND to_entity_id = $2 AND status = 'active'`, [clientA, clientB]);
      expect(Number(rows.rows[0].count)).toBe(2);
    });

    it("audit/outbox failure rolls back add/apply — no orphaned related_party_edge, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/add/request`,
        headers: internalHeaders,
        payload: { from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime`);
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `${RPE_URL}/add/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_rb_rpe", decision_token: "tok_rb_rpe" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime`);
        }
      });

      const edgeRows = await verifyPool.query(`SELECT count(*) FROM clt1.related_party_edge`);
      expect(Number(edgeRows.rows[0].count)).toBe(0);
      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.related_party_edge_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("related-party edge update — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: update/request -> update/apply mutates evidence_ref only and bumps version", async () => {
      if (!schemaReady) return;
      const { related_party_edge_id } = await addRelatedPartyEdge();

      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "evidence_ref_updated", requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_rpeupd", decision_token: "tok_rpeupd" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT evidence_ref, version FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      expect(rows.rows[0].evidence_ref).toBe("evidence_ref_updated");
      expect(rows.rows[0].version).toBe(2);
    });

    it("update/request fails with CLT1_RELATED_PARTY_EDGE_NOT_FOUND when no edge exists", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/clt1rpe_does_not_exist/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "x", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("related-party edge remove — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: remove/request -> remove/apply sets status inactive", async () => {
      if (!schemaReady) return;
      const { related_party_edge_id } = await addRelatedPartyEdge();

      const requestRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_rperem", decision_token: "tok_rperem" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT status FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      expect(rows.rows[0].status).toBe("inactive");
    });

    it("remove/request fails with CLT1_RELATED_PARTY_EDGE_NOT_FOUND for an unknown related_party_edge_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/clt1rpe_does_not_exist/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
    });

    it("remove/request fails with CLT1_RELATED_PARTY_EDGE_INVALID_STATE on an already-inactive edge (no reactivation path)", async () => {
      if (!schemaReady) return;
      const { related_party_edge_id } = await addRelatedPartyEdge();
      const req1 = await app.inject({ method: "POST", url: `${RPE_URL}/${related_party_edge_id}/remove/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: req1.json().data.decision_id, approval_id: "iam2appr_rperem2", decision_token: "tok_rperem2" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_RELATED_PARTY_EDGE_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/related-parties — bounded single-hop client-scoped read", () => {
    it("returns active edges touching the client's own client_id node in either direction", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address" });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientA}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.related_parties).toHaveLength(1);
      expect(res.json().data.related_parties[0]).toMatchObject({ from_entity_id: clientA, to_entity_id: clientB });

      // Symmetric: the OTHER side of the same edge sees it too.
      const resB = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientB}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(resB.json().data.related_parties).toHaveLength(1);
    });

    it("returns active edges touching the client's own authorised_party nodes (party-level linkage)", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientA);
      const otherClient = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "party", from_entity_id: authorised_party_id, to_entity_type: "client", to_entity_id: otherClient, relationship_type: "ubo" });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientA}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.related_parties).toHaveLength(1);
      expect(res.json().data.related_parties[0]).toMatchObject({ from_entity_type: "party", from_entity_id: authorised_party_id, relationship_type: "ubo" });
    });

    it("does not return an inactive (removed) edge", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const { related_party_edge_id } = await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientA, to_entity_type: "client", to_entity_id: clientB, relationship_type: "shared_address" });
      const req = await app.inject({ method: "POST", url: `${RPE_URL}/${related_party_edge_id}/remove/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: req.json().data.decision_id, approval_id: "iam2appr_readrm", decision_token: "tok_readrm" },
      });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientA}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.json().data.related_parties).toHaveLength(0);
    });

    it("never returns authorised_party.party_reference — no joined PII", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientA, { party_reference: "Must Never Appear jane@example.com" });
      const otherClient = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "party", from_entity_id: authorised_party_id, to_entity_type: "client", to_entity_id: otherClient, relationship_type: "ubo" });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientA}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain("Must Never Appear");
      expect(JSON.stringify(res.json())).not.toContain("party_reference");
    });

    it("returns an empty list, not an error, when the client has no related-party edges", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.related_parties).toEqual([]);
    });

    it("requires active_limited client — fails with CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/clt1client_does_not_exist/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("fails closed with CLT1_PERMISSION_DENIED when IAM-02 denies", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      config.iam2FetchImpl = makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "no_grant" }) });
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/related-parties?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      config.iam2FetchImpl = allowAllIam2Fetch();
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/status — Phase 5 leaves the response shape unchanged", () => {
    it("does not include a related_parties_configured field", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).not.toHaveProperty("related_parties_configured");
    });

    it("does not change Phase 2's approval gate or client_profile.status — regression check", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("active_limited");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 5 audit/outbox events", () => {
    it("writes clt1.related_party_edge_add_requested and clt1.related_party_edge_created", async () => {
      if (!schemaReady) return;
      const { related_party_edge_id } = await addRelatedPartyEdge();

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${related_party_edge_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      expect(types.has("clt1.related_party_edge_created")).toBe(true);
    });

    it("writes clt1.related_party_edge_update_requested/.updated and .remove_requested/.removed", async () => {
      if (!schemaReady) return;
      const { related_party_edge_id } = await addRelatedPartyEdge();

      const updateReq = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "ref_evt", requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id: updateReq.json().data.decision_id, approval_id: "iam2appr_evt_rpe1", decision_token: "tok_evt_rpe1" },
      });
      const removeReq = await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${RPE_URL}/${related_party_edge_id}/remove/apply`,
        headers: internalHeaders,
        payload: { decision_id: removeReq.json().data.decision_id, approval_id: "iam2appr_evt_rpe2", decision_token: "tok_evt_rpe2" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${related_party_edge_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.related_party_edge_update_requested", "clt1.related_party_edge_updated", "clt1.related_party_edge_remove_requested", "clt1.related_party_edge_removed"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 6 precondition: node existence required", () => {
    it("create/request fails with CLT1_DUPLICATE_NODE_NOT_FOUND when subject_ref does not exist", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: "clt1client_does_not_exist", matched_type: "client", matched_ref: "clt1client_does_not_exist_2", match_type: "name", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_NODE_NOT_FOUND");
    });

    it("create/request fails with CLT1_DUPLICATE_NODE_NOT_FOUND when matched_ref does not exist", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: clientId, matched_type: "client", matched_ref: "clt1client_does_not_exist", match_type: "name", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_NODE_NOT_FOUND");
    });

    it("create/request validates application and party node types too, not just client", async () => {
      if (!schemaReady) return;
      const applicationRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "application", subject_ref: "clt1app_does_not_exist", matched_type: "application", matched_ref: "clt1app_does_not_exist_2", match_type: "corporate_ref", requested_by: "staff_1" },
      });
      expect(applicationRes.statusCode).toBe(404);
      expect(applicationRes.json().error.code).toBe("CLT1_DUPLICATE_NODE_NOT_FOUND");

      const partyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "party", subject_ref: "clt1ap_does_not_exist", matched_type: "party", matched_ref: "clt1ap_does_not_exist_2", match_type: "id", requested_by: "staff_1" },
      });
      expect(partyRes.statusCode).toBe(404);
      expect(partyRes.json().error.code).toBe("CLT1_DUPLICATE_NODE_NOT_FOUND");
    });

    it("does not allow an arbitrary unvalidated node type value (schema rejects it at the HTTP boundary)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "not_a_real_type", subject_ref: "x", matched_type: "client", matched_ref: "y", match_type: "name", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate candidate create — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: create/request -> create/apply creates exactly one open duplicate_candidate", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "email" });
      expect(duplicate_candidate_id).toBeTruthy();

      const rows = await verifyPool.query(`SELECT status, match_type, source_type, match_score FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      expect(rows.rows[0]).toMatchObject({ status: "open", match_type: "email", source_type: "manual", match_score: null });
    });

    it("self-candidate (subject == matched) is rejected with VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: clientId, matched_type: "client", matched_ref: clientId, match_type: "name", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("add/apply fails closed with CLT1_APPROVAL_REQUIRED on a payload_hash mismatch", async () => {
      if (!schemaReady) return;
      // Create the fixtures and the request FIRST, under the default allow-all stub (createActiveClient
      // itself drives a real approve/apply through IAM-02 execute-verify) — only swap to the
      // mismatch stub for the one apply call under test, same discipline every prior payload-hash-
      // mismatch test in this file (e.g. line 2095) already established.
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: subjectId, matched_type: "client", matched_ref: matchedId, match_type: "name", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: true, execution_authorised: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_mismatch", decision_token: "tok_mismatch" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();
      expect(applyRes.statusCode).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
    });

    it("a second create/apply for the exact same (subject,matched,match_type) tuple while the first is still open is rejected with CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN (409), not CLT1_AUDIT_REQUIRED (503)", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "name" });

      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: subjectId, matched_type: "client", matched_ref: matchedId, match_type: "name", requested_by: "staff_2" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dupdc", decision_token: "tok_dupdc" },
      });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN");

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.duplicate_candidate WHERE subject_ref = $1 AND matched_ref = $2 AND status = 'open'`, [subjectId, matchedId]);
      expect(Number(rows.rows[0].count)).toBe(1);
    });

    it("a different match_type between the same two nodes is NOT blocked as a duplicate (exact-tuple uniqueness only)", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "name" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "email" });
      expect(duplicate_candidate_id).toBeTruthy();

      const rows = await verifyPool.query(`SELECT count(*) FROM clt1.duplicate_candidate WHERE subject_ref = $1 AND matched_ref = $2 AND status = 'open'`, [subjectId, matchedId]);
      expect(Number(rows.rows[0].count)).toBe(2);
    });

    it("the same tuple CAN be re-declared once the earlier candidate is resolved (status='open'-scoped index only, no permanent uniqueness)", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      const first = await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "phone" });

      const confirmReq = await app.inject({
        method: "POST",
        url: `${DC_URL}/${first.duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_9" },
      });
      const confirmApply = await app.inject({
        method: "POST",
        url: `${DC_URL}/${first.duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: confirmReq.json().data.decision_id, approval_id: "iam2appr_resolve1", decision_token: "tok_resolve1" },
      });
      expect(confirmApply.statusCode, JSON.stringify(confirmApply.json())).toBe(200);

      const second = await addDuplicateCandidate({ subject_ref: subjectId, matched_ref: matchedId, match_type: "phone" });
      expect(second.duplicate_candidate_id).toBeTruthy();
      expect(second.duplicate_candidate_id).not.toBe(first.duplicate_candidate_id);
    });

    it("audit/outbox failure rolls back create/apply — no orphaned duplicate_candidate, no orphaned applied decision", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/create/request`,
        headers: internalHeaders,
        payload: { subject_type: "client", subject_ref: subjectId, matched_type: "client", matched_ref: matchedId, match_type: "name", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime`);
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `${DC_URL}/create/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_rb_dc", decision_token: "tok_rb_dc" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime`);
        }
      });

      const candidateRows = await verifyPool.query(`SELECT count(*) FROM clt1.duplicate_candidate`);
      expect(Number(candidateRows.rows[0].count)).toBe(0);
      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate candidate update — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: update/request -> update/apply mutates evidence_ref only and bumps version", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();

      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "evidence_ref_updated", requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dcupd", decision_token: "tok_dcupd" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT evidence_ref, version FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      expect(rows.rows[0].evidence_ref).toBe("evidence_ref_updated");
      expect(rows.rows[0].version).toBe(2);
    });

    it("update/request fails with CLT1_DUPLICATE_CANDIDATE_NOT_FOUND when no candidate exists", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/clt1dc_does_not_exist/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "x", requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
    });

    it("update/request fails with CLT1_DUPLICATE_CANDIDATE_INVALID_STATE on an already-resolved candidate", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();
      const dismissReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/apply`,
        headers: internalHeaders,
        payload: { decision_id: dismissReq.json().data.decision_id, approval_id: "iam2appr_dcdis0", decision_token: "tok_dcdis0" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "x", requested_by: "staff_2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate candidate confirm — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: confirm/request -> confirm/apply sets status duplicate and stamps reviewed_by/reviewed_at_utc", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();

      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_confirm_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dcconf", decision_token: "tok_dcconf" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT status, reviewed_by, reviewed_at_utc FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      expect(rows.rows[0].status).toBe("duplicate");
      expect(rows.rows[0].reviewed_by).toBe("staff_confirm_1");
      expect(rows.rows[0].reviewed_at_utc).toBeTruthy();
    });

    it("confirm/request fails with CLT1_DUPLICATE_CANDIDATE_NOT_FOUND for an unknown duplicate_candidate_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/clt1dc_does_not_exist/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
    });

    it("confirm/request fails with CLT1_DUPLICATE_CANDIDATE_INVALID_STATE on an already-resolved candidate (no reactivation path)", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();
      const req1 = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: req1.json().data.decision_id, approval_id: "iam2appr_dcconf2", decision_token: "tok_dcconf2" },
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
    });

    it("blueprint SoD rule 4: confirm/request is blocked with CLT1_DUPLICATE_SELF_REVIEW_BLOCKED when requested_by created the subject application", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview({ created_by: "staff_creator_1" });
      const matchedId = await createActiveClient();
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", matched_ref: matchedId, match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_creator_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    });

    it("blueprint SoD rule 4: confirm/request succeeds when requested_by did NOT create the subject application", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview({ created_by: "staff_creator_2" });
      const matchedId = await createActiveClient();
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", matched_ref: matchedId, match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_reviewer_2" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("blueprint SoD rule 4 is a no-op for client-vs-client candidates — neither side is an application", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const matchedId = await createActiveClient();
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "client", subject_ref: subjectId, matched_type: "client", matched_ref: matchedId, match_type: "name" });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_anyone" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("blueprint SoD rule 4 is a no-op for party-vs-party candidates — neither side is an application", async () => {
      if (!schemaReady) return;
      const subjectClientId = await createActiveClient();
      const { authorised_party_id: subjectPartyId } = await addAuthorisedParty(subjectClientId);
      const matchedClientId = await createActiveClient();
      const { authorised_party_id: matchedPartyId } = await addAuthorisedParty(matchedClientId);
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "party", subject_ref: subjectPartyId, matched_type: "party", matched_ref: matchedPartyId, match_type: "name" });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_anyone" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("blueprint SoD rule 4 (L1 fix): application-vs-application confirm/request is blocked when requested_by created the SUBJECT application", async () => {
      if (!schemaReady) return;
      const subjectApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_subj" });
      const matchedApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_matched" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({
        subject_type: "application",
        subject_ref: subjectApp.application_id as string,
        matched_type: "application",
        matched_ref: matchedApp.application_id as string,
        match_type: "corporate_ref",
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_creator_appvsapp_subj" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    });

    it("blueprint SoD rule 4 (L1 fix): application-vs-application confirm/request is blocked when requested_by created the MATCHED application (not just the subject)", async () => {
      if (!schemaReady) return;
      const subjectApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_subj2" });
      const matchedApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_matched2" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({
        subject_type: "application",
        subject_ref: subjectApp.application_id as string,
        matched_type: "application",
        matched_ref: matchedApp.application_id as string,
        match_type: "corporate_ref",
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_creator_appvsapp_matched2" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    });

    it("blueprint SoD rule 4: application-vs-application confirm/request succeeds when requested_by created NEITHER application", async () => {
      if (!schemaReady) return;
      const subjectApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_subj3" });
      const matchedApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_matched3" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({
        subject_type: "application",
        subject_ref: subjectApp.application_id as string,
        matched_type: "application",
        matched_ref: matchedApp.application_id as string,
        match_type: "corporate_ref",
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_uninvolved_reviewer" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate candidate dismiss — request/apply with IAM-02 execute-verify", () => {
    it("full happy path: dismiss/request -> dismiss/apply sets status not_duplicate", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();

      const requestRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      const { decision_id } = requestRes.json().data;
      const applyRes = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_dcdis", decision_token: "tok_dcdis" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT status FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      expect(rows.rows[0].status).toBe("not_duplicate");
    });

    it("dismiss/request fails with CLT1_DUPLICATE_CANDIDATE_NOT_FOUND for an unknown duplicate_candidate_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/clt1dc_does_not_exist/dismiss/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
    });

    it("blueprint SoD rule 4: dismiss/request is blocked with CLT1_DUPLICATE_SELF_REVIEW_BLOCKED when requested_by created the matched application", async () => {
      if (!schemaReady) return;
      const subjectId = await createActiveClient();
      const created = await progressToUnderReview({ created_by: "staff_creator_3" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({ subject_type: "client", subject_ref: subjectId, matched_type: "application", matched_ref: created.application_id as string, match_type: "corporate_ref" });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_creator_3" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    });

    it("blueprint SoD rule 4 (L1 fix): application-vs-application dismiss/request is blocked when requested_by created the MATCHED application", async () => {
      if (!schemaReady) return;
      const subjectApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_dis_subj" });
      const matchedApp = await progressToUnderReview({ created_by: "staff_creator_appvsapp_dis_matched" });
      const { duplicate_candidate_id } = await addDuplicateCandidate({
        subject_type: "application",
        subject_ref: subjectApp.application_id as string,
        matched_type: "application",
        matched_ref: matchedApp.application_id as string,
        match_type: "corporate_ref",
      });

      const res = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_creator_appvsapp_dis_matched" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../applications/:application_id/duplicate-candidates", () => {
    it("returns candidates touching the application on either the subject or matched side, without joined PII", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const matchedId = await createActiveClient();
      await addDuplicateCandidate({ subject_type: "application", subject_ref: created.application_id as string, matched_type: "client", matched_ref: matchedId, match_type: "corporate_ref" });

      const res = await app.inject({
        method: "GET",
        url: `/internal/clt1/applications/${created.application_id}/duplicate-candidates?actor_id=staff_1`,
        headers: internalHeaders,
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.duplicate_candidates).toHaveLength(1);
      const candidate = res.json().data.duplicate_candidates[0];
      expect(candidate).not.toHaveProperty("legal_name");
      expect(candidate).not.toHaveProperty("applicant_email");
      expect(candidate).not.toHaveProperty("party_reference");
      expect(candidate).not.toHaveProperty("requested_by");
    });

    it("fails with CLT1_APPLICATION_NOT_FOUND for an unknown application_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/clt1/applications/clt1app_does_not_exist/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_NOT_FOUND");
    });

    it("returns an empty list, not an error, when the application has no duplicate candidates", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "GET",
        url: `/internal/clt1/applications/${created.application_id}/duplicate-candidates?actor_id=staff_1`,
        headers: internalHeaders,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.duplicate_candidates).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/duplicate-candidates — bounded single-hop client-scoped read", () => {
    it("returns candidates touching the client's own client_id node in either subject/matched role", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      await addDuplicateCandidate({ subject_type: "client", subject_ref: clientA, matched_type: "client", matched_ref: clientB, match_type: "name" });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientA}/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.duplicate_candidates).toHaveLength(1);

      const resB = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientB}/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(resB.json().data.duplicate_candidates).toHaveLength(1);
    });

    it("returns candidates touching the client's own authorised_party nodes (party-level linkage)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { authorised_party_id } = await addAuthorisedParty(clientId);
      const matchedPartyClientId = await createActiveClient();
      const { authorised_party_id: matchedPartyId } = await addAuthorisedParty(matchedPartyClientId);
      await addDuplicateCandidate({ subject_type: "party", subject_ref: authorised_party_id, matched_type: "party", matched_ref: matchedPartyId, match_type: "name" });

      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      expect(res.json().data.duplicate_candidates).toHaveLength(1);
    });

    it("fails with CLT1_CLIENT_NOT_FOUND for an unknown client_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/clt1client_does_not_exist/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("returns an empty list, not an error, when the client has no duplicate candidates", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/duplicate-candidates?actor_id=staff_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.duplicate_candidates).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET .../clients/:client_id/status — Phase 6 leaves the response shape unchanged", () => {
    it("does not include a duplicate_candidates-related field of any kind", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      const keys = Object.keys(res.json().data);
      expect(keys.some((k) => k.toLowerCase().includes("duplicate"))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 6 audit/outbox events", () => {
    it("writes clt1.duplicate_candidate_created (create/request's own _create_requested event is keyed to the decision_id, not the candidate_id, so it is not queryable by candidate_id here)", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${duplicate_candidate_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      expect(types.has("clt1.duplicate_candidate_created")).toBe(true);
    });

    it("writes clt1.duplicate_candidate_update_requested/.updated and .confirm_requested/.confirmed", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();

      const updateReq = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/update/request`,
        headers: internalHeaders,
        payload: { evidence_ref: "ref_evt", requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/update/apply`,
        headers: internalHeaders,
        payload: { decision_id: updateReq.json().data.decision_id, approval_id: "iam2appr_evt_dc1", decision_token: "tok_evt_dc1" },
      });
      const confirmReq = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: confirmReq.json().data.decision_id, approval_id: "iam2appr_evt_dc2", decision_token: "tok_evt_dc2" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${duplicate_candidate_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.duplicate_candidate_update_requested", "clt1.duplicate_candidate_updated", "clt1.duplicate_candidate_confirm_requested", "clt1.duplicate_candidate_confirmed"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });

    it("writes clt1.duplicate_candidate_dismiss_requested and .dismissed", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();
      const dismissReq = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_1" },
      });
      await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/dismiss/apply`,
        headers: internalHeaders,
        payload: { decision_id: dismissReq.json().data.decision_id, approval_id: "iam2appr_evt_dc3", decision_token: "tok_evt_dc3" },
      });

      const rows = await verifyPool.query(`SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${duplicate_candidate_id}%`]);
      const types = new Set(rows.rows.map((r) => r.event_type));
      for (const expected of ["clt1.duplicate_candidate_dismiss_requested", "clt1.duplicate_candidate_dismissed"]) {
        expect(types.has(expected), `expected ${expected} to have been written`).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("no public routes / no out-of-scope surface", () => {
    it("every Phase 1+2+3+4+5+6 route stays under /internal/clt1/*", () => {
      if (!schemaReady) return;
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
      expect(routePaths).not.toMatch(/(^|\s)\/clt1\//);
    });

    it("no mandate-check route exists, and Phase 6's own duplicate-candidates routes exist ONLY under the approved manual-review action set — no needs_more_info route", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      expect(routePaths).not.toContain("mandate-check");
      expect(routePaths).toContain("duplicate-candidates");
      expect(routePaths).not.toContain("needs-more-info");
      expect(routePaths).not.toContain("needs_more_info");
    });

    it("no duplicate-detection/scoring/fuzzy-matching engine route exists — only the manually-declared create/update/confirm/dismiss/read actions", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      for (const forbidden of ["duplicate-detection", "duplicate-scoring", "fuzzy-match", "fuzzy_match", "auto-match", "auto_match"]) {
        expect(routePaths).not.toContain(forbidden);
      }
    });

    it("no graph-traversal, UBO-threshold, or risk-scoring route exists", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      for (const forbidden of ["traversal", "graph-walk", "ubo-threshold", "risk-score", "concentration"]) {
        expect(routePaths).not.toContain(forbidden);
      }
    });

    it("no sensitive authorised-party detail route exists", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      expect(routePaths).not.toContain("sensitive");
    });

    it("clt1.authorised_party table exists with exactly the locked column set (no client_id, no linked_user_id)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'authorised_party'`);
      const columns = rows.rows.map((r) => r.column_name as string);
      expect(columns).not.toContain("client_id");
      expect(columns).not.toContain("linked_user_id");
      expect(columns).toContain("party_reference");
      expect(columns).toContain("application_id");
    });

    it("clt1.related_party_edge table exists with exactly the blueprint's polymorphic column set (no owning_application_id, no owning_client_id)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'related_party_edge'`);
      const columns = rows.rows.map((r) => r.column_name as string);
      expect(columns).toEqual(
        expect.arrayContaining(["from_entity_type", "from_entity_id", "to_entity_type", "to_entity_id", "relationship_type", "status", "evidence_ref"]),
      );
      expect(columns).not.toContain("owning_application_id");
      expect(columns).not.toContain("owning_client_id");
      expect(columns).not.toContain("confidence");
      expect(columns).not.toContain("score");
    });

    it("clt1.duplicate_candidate table exists with exactly the locked polymorphic column set (no owning_application_id, no owning_client_id, no confidence column)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'duplicate_candidate'`);
      const columns = rows.rows.map((r) => r.column_name as string);
      expect(columns).toEqual(
        expect.arrayContaining(["subject_type", "subject_ref", "matched_type", "matched_ref", "match_type", "match_score", "status", "source_type", "source_ref", "evidence_ref"]),
      );
      expect(columns).not.toContain("owning_application_id");
      expect(columns).not.toContain("owning_client_id");
      expect(columns).not.toContain("application_id");
      expect(columns).not.toContain("client_id");
      expect(columns).not.toContain("confidence");
    });

    it("CLT1_DUPLICATE_REVIEW_REQUIRED is never thrown by any Phase 6 route (not registered this phase — no reachable throw site)", async () => {
      if (!schemaReady) return;
      const { duplicate_candidate_id } = await addDuplicateCandidate();
      const confirmReq = await app.inject({ method: "POST", url: `${DC_URL}/${duplicate_candidate_id}/confirm/request`, headers: internalHeaders, payload: { requested_by: "staff_1" } });
      const confirmApply = await app.inject({
        method: "POST",
        url: `${DC_URL}/${duplicate_candidate_id}/confirm/apply`,
        headers: internalHeaders,
        payload: { decision_id: confirmReq.json().data.decision_id, approval_id: "iam2appr_noreqcode", decision_token: "tok_noreqcode" },
      });
      expect(confirmApply.json().error?.code).not.toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
      // Confirming a duplicate candidate must never itself gate/deny application approval — Phase 2's
      // approval-gate route (routes/decisions.ts) is completely untouched by Phase 6 (Design Issue 12).
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 8 — client_profile lifecycle baseline (suspend/reactivate/close)", () => {
    it("suspend request/apply: active_limited -> suspended", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { requestRes, applyRes } = await runLifecycleAction(clientId, "suspend");
      expect(requestRes.statusCode, JSON.stringify(requestRes.json())).toBe(200);
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      expect(applyRes.json().data).toEqual({ client_id: clientId, status: "suspended", decision_id: requestRes.json().data.decision_id });

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("suspended");

      const requestedAudit = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'clt1.client_profile_suspend_requested' AND payload_ref LIKE $1`, [`%${clientId}%`]);
      expect(Number(requestedAudit.rows[0].count)).toBeGreaterThan(0);
      const appliedAudit = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'clt1.client_profile_suspended' AND payload_ref LIKE $1`, [`%${clientId}%`]);
      expect(Number(appliedAudit.rows[0].count)).toBeGreaterThan(0);
    });

    it("reactivate request/apply: suspended -> active_limited", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const { applyRes } = await runLifecycleAction(clientId, "reactivate");
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      expect(applyRes.json().data.status).toBe("active_limited");

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("active_limited");
    });

    it("close request/apply: active_limited -> closed", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { applyRes } = await runLifecycleAction(clientId, "close");
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      expect(applyRes.json().data.status).toBe("closed");

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("closed");
    });

    it("close request/apply: suspended -> closed", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const { applyRes } = await runLifecycleAction(clientId, "close");
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      expect(applyRes.json().data.status).toBe("closed");
    });

    it("closed is terminal — suspend/reactivate/close all blocked from closed at request time", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "close");

      for (const action of ["suspend", "reactivate", "close"] as const) {
        const res = await app.inject({
          method: "POST",
          url: `/internal/clt1/clients/${clientId}/${action}/request`,
          headers: internalHeaders,
          payload: { requested_by: "staff_lifecycle_1", reason: action === "reactivate" ? undefined : "attempt after close" },
        });
        expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
        expect(res.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");
      }
    });

    it("reactivate blocked from active_limited (already active)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "POST", url: `/internal/clt1/clients/${clientId}/reactivate/request`, headers: internalHeaders, payload: { requested_by: "staff_lifecycle_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");
    });

    it("suspend blocked from suspended (already suspended)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const res = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1", reason: "second attempt" },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");
    });

    it("reason is required for suspend — request rejected with no reason", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "POST", url: `/internal/clt1/clients/${clientId}/suspend/request`, headers: internalHeaders, payload: { requested_by: "staff_lifecycle_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");
    });

    it("reason is required for close — request rejected with no reason", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "POST", url: `/internal/clt1/clients/${clientId}/close/request`, headers: internalHeaders, payload: { requested_by: "staff_lifecycle_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
      expect(res.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");
    });

    it("reason is optional for reactivate — request succeeds with no reason", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const res = await app.inject({ method: "POST", url: `/internal/clt1/clients/${clientId}/reactivate/request`, headers: internalHeaders, payload: { requested_by: "staff_lifecycle_1" } });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("payload_hash mismatch (tampered actor between request and apply) is blocked with CLT1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1", reason: "hash test" },
      });
      const { decision_id } = requestRes.json().data;

      config.iam2FetchImpl = makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_PAYLOAD_HASH_MISMATCH" }) });
      const applyRes = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_hashtest", decision_token: "tok_hashtest" },
      });
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(403);
      expect(applyRes.json().error.code).toBe("CLT1_APPROVAL_REQUIRED");
      config.iam2FetchImpl = allowAllIam2Fetch();

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("active_limited");
    });

    it("decision-request replay is blocked with CLT1_DECISION_REQUEST_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { requestRes } = await runLifecycleAction(clientId, "suspend");
      const { decision_id } = requestRes.json().data;

      const replayRes = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_replay", decision_token: "tok_replay" },
      });
      expect(replayRes.statusCode, JSON.stringify(replayRes.json())).toBe(409);
      expect(replayRes.json().error.code).toBe("CLT1_DECISION_REQUEST_INVALID_STATE");
    });

    it("a decision requested from active_limited remains valid at apply time even after a concurrent transition, since close is valid from both active_limited and suspended", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const suspendReq = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1", reason: "race test suspend" },
      });
      const closeReq = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/close/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1", reason: "race test close" },
      });

      // Apply suspend first — succeeds, moves the client to 'suspended'.
      const suspendApply = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/apply`,
        headers: internalHeaders,
        payload: { decision_id: suspendReq.json().data.decision_id, approval_id: "iam2appr_race1", decision_token: "tok_race1" },
      });
      expect(suspendApply.statusCode, JSON.stringify(suspendApply.json())).toBe(200);

      // The close decision was requested from active_limited but the client is now 'suspended' —
      // close is still valid FROM suspended, so this specific pair doesn't race-fail; use it only
      // to prove the in-transaction re-check runs (both requests were valid at request time, both
      // remain valid at apply time here). The genuine race-block case is the mismatched pair below.
      const closeApply = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/close/apply`,
        headers: internalHeaders,
        payload: { decision_id: closeReq.json().data.decision_id, approval_id: "iam2appr_race2", decision_token: "tok_race2" },
      });
      expect(closeApply.statusCode, JSON.stringify(closeApply.json())).toBe(200);

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("closed");
    });

    it("pre-check race: a reactivate requested while suspended, applied after a concurrent close, is blocked before any IAM-02 call — no failure audit for a pure pre-check rejection (mirrors decisions.ts's own pre-check-vs-post-verify audit split)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const reactivateReq = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/reactivate/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1" },
      });
      // Concurrently close the client before the reactivate is applied.
      await runLifecycleAction(clientId, "close");

      const reactivateApply = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/reactivate/apply`,
        headers: internalHeaders,
        payload: { decision_id: reactivateReq.json().data.decision_id, approval_id: "iam2appr_race3", decision_token: "tok_race3" },
      });
      expect(reactivateApply.statusCode, JSON.stringify(reactivateApply.json())).toBe(409);
      expect(reactivateApply.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("closed");
    });

    it("genuine in-transaction race: a status change occurring strictly between the pre-check and the locked re-check (simulated via an IAM-02 execute-verify stub side-effect, the same technique Phase 7's own race test uses) is caught by the in-transaction re-check and audited via clt1.client_profile_lifecycle_denied", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const reactivateReq = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/reactivate/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1" },
      });
      const { decision_id } = reactivateReq.json().data;

      // The pre-check (still 'suspended' at this point) passes clean. The client_profile status
      // is flipped to 'closed' from inside the execute-verify stub — the only hook point between
      // the pre-check and the locked transaction available to a synchronous test, mirroring
      // Phase 7's own CFG-01-stub-hijack race proof.
      config.iam2FetchImpl = (async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/internal/iam2/permission/check")) {
          return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
        }
        if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
          await verifyPool.query(`UPDATE clt1.client_profile SET status = 'closed' WHERE client_id = $1`, [clientId]);
          return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
        }
        throw new Error(`Unexpected URL in Phase 8 race-test stub: ${urlStr}`);
      }) as typeof fetch;

      const reactivateApply = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/reactivate/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_race4", decision_token: "tok_race4" },
      });
      config.iam2FetchImpl = allowAllIam2Fetch();

      expect(reactivateApply.statusCode, JSON.stringify(reactivateApply.json())).toBe(409);
      expect(reactivateApply.json().error.code).toBe("CLT1_CLIENT_PROFILE_INVALID_STATE");

      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("closed");
      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.client_profile_lifecycle_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");

      const deniedAudit = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'clt1.client_profile_lifecycle_denied' AND payload_ref LIKE $1`, [`%${clientId}%`]);
      expect(deniedAudit.rows.length).toBeGreaterThan(0);
      expect(deniedAudit.rows.some((r) => (r.payload_ref as string).includes("CLT1_CLIENT_PROFILE_INVALID_STATE"))).toBe(true);
    });

    it("audit/outbox rollback (forced outbox-grant revoke) leaves client_profile.status unchanged and the decision row 'requested'", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `/internal/clt1/clients/${clientId}/suspend/request`,
        headers: internalHeaders,
        payload: { requested_by: "staff_lifecycle_1", reason: "audit rollback test" },
      });
      const { decision_id } = requestRes.json().data;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_clt1_runtime`);
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: `/internal/clt1/clients/${clientId}/suspend/apply`,
            headers: internalHeaders,
            payload: { decision_id, approval_id: "iam2appr_auditrb", decision_token: "tok_auditrb" },
          });
          expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(503);
          expect(applyRes.json().error.code).toBe("CLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime`);
        }
      });

      const profileRows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(profileRows.rows[0].status).toBe("active_limited");
      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.client_profile_lifecycle_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");
    });

    it("client_profile.status never becomes 'active' — reactivate always restores exactly 'active_limited'", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      await runLifecycleAction(clientId, "reactivate");
      const rows = await verifyPool.query(`SELECT status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      expect(rows.rows[0].status).toBe("active_limited");
      expect(rows.rows[0].status).not.toBe("active");
    });

    it("GET /clients/:client_id/status naturally reflects suspended and closed with no code change", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");
      const suspendedStatusRes = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(suspendedStatusRes.json().data.status).toBe("suspended");

      await runLifecycleAction(clientId, "reactivate");
      await runLifecycleAction(clientId, "close");
      const closedStatusRes = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      expect(closedStatusRes.json().data.status).toBe("closed");
    });

    it("downstream mutations are blocked with CLT1_CLIENT_NOT_ACTIVE while suspended — authorised_user/mandate/authorised_party — and succeed again after reactivate", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "suspend");

      const auRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "blocked@example.com", role: "client_maker", requested_by: "staff_1" },
      });
      expect(auRes.statusCode, JSON.stringify(auRes.json())).toBe(409);
      expect(auRes.json().error.code).toBe("CLT1_CLIENT_NOT_ACTIVE");

      const mandateRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "institutional", rules: {}, requested_by: "staff_1" },
      });
      expect(mandateRes.statusCode, JSON.stringify(mandateRes.json())).toBe(409);
      expect(mandateRes.json().error.code).toBe("CLT1_CLIENT_NOT_ACTIVE");

      const apRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "blocked-director@example.com", requested_by: "staff_1" },
      });
      expect(apRes.statusCode, JSON.stringify(apRes.json())).toBe(409);
      expect(apRes.json().error.code).toBe("CLT1_CLIENT_NOT_ACTIVE");

      // Reactivate — the exact same mutation now succeeds.
      await runLifecycleAction(clientId, "reactivate");
      const auRetryRes = await app.inject({
        method: "POST",
        url: `${AU_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { user_reference: "unblocked@example.com", role: "client_maker", requested_by: "staff_1" },
      });
      expect(auRetryRes.statusCode, JSON.stringify(auRetryRes.json())).toBe(200);
    });

    it("downstream mutations remain blocked with CLT1_CLIENT_NOT_ACTIVE after close (terminal)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await runLifecycleAction(clientId, "close");

      const mandateRes = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "institutional", rules: {}, requested_by: "staff_1" },
      });
      expect(mandateRes.statusCode, JSON.stringify(mandateRes.json())).toBe(409);
      expect(mandateRes.json().error.code).toBe("CLT1_CLIENT_NOT_ACTIVE");
    });

    it("no cascade update — close only updates client_profile.status, authorised_user/client_mandate/authorised_party rows are left untouched", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedUser(clientId);
      await createMandate(clientId);
      const { authorised_party_id } = await addAuthorisedParty(clientId);

      const beforeAu = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      const beforeMnd = await verifyPool.query(`SELECT status FROM clt1.client_mandate WHERE client_id = $1`, [clientId]);
      const beforeAp = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);

      await runLifecycleAction(clientId, "close");

      const afterAu = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE client_id = $1`, [clientId]);
      const afterMnd = await verifyPool.query(`SELECT status FROM clt1.client_mandate WHERE client_id = $1`, [clientId]);
      const afterAp = await verifyPool.query(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1`, [authorised_party_id]);

      expect(afterAu.rows[0].status).toBe(beforeAu.rows[0].status);
      expect(afterMnd.rows[0].status).toBe(beforeMnd.rows[0].status);
      expect(afterAp.rows[0].authority_status).toBe(beforeAp.rows[0].authority_status);
    });

    it("no new public /clt1/* route was added", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      expect(routePaths).not.toMatch(/(^|\s)\/clt1\//);
    });

    it("no wallet/trading/settlement capability was introduced", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      for (const forbidden of ["wallet", "deposit", "withdraw", "trading", "settlement", "exchange"]) {
        expect(routePaths).not.toContain(forbidden);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 8 grants — client_profile_lifecycle_decision_request + client_profile UPDATE", () => {
    it("role_clt1_runtime can SELECT+INSERT+column-scoped-UPDATE on client_profile_lifecycle_decision_request, but not update client_id/decision_type/requested_by/payload_hash", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(
          client.query(
            `INSERT INTO clt1.client_profile_lifecycle_decision_request (decision_id, client_id, decision_type, reason, requested_by, payload_hash) VALUES ('lcd1',$1,'suspend','r','user_1','sha256:x')`,
            [clientId],
          ),
        ).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_profile_lifecycle_decision_request SET status = 'applied' WHERE decision_id = 'lcd1'`)).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_profile_lifecycle_decision_request SET requested_by = 'someone_else' WHERE decision_id = 'lcd1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_profile_lifecycle_decision_request SET payload_hash = 'sha256:tampered' WHERE decision_id = 'lcd1'`)).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_profile_lifecycle_decision_request SET decision_type = 'close' WHERE decision_id = 'lcd1'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime can column-scoped-UPDATE client_profile (status/version/updated_at_utc) but not legal_name/registration_number/client_class/created_at_utc", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        await expect(client.query(`UPDATE clt1.client_profile SET status = 'suspended', version = version + 1 WHERE client_id = $1`, [clientId])).resolves.toBeTruthy();
        await expect(client.query(`UPDATE clt1.client_profile SET legal_name = 'tampered' WHERE client_id = $1`, [clientId])).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_profile SET registration_number = 'tampered' WHERE client_id = $1`, [clientId])).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_profile SET client_class = 'retail' WHERE client_id = $1`, [clientId])).rejects.toMatchObject({ code: "42501" });
        await expect(client.query(`UPDATE clt1.client_profile SET created_at_utc = now() WHERE client_id = $1`, [clientId])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.release();
      }
    });

    it("role_clt1_runtime cannot DELETE/TRUNCATE on client_profile or client_profile_lifecycle_decision_request", async () => {
      if (!schemaReady) return;
      const client = await new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) }).connect();
      try {
        for (const table of ["client_profile", "client_profile_lifecycle_decision_request"]) {
          await expect(client.query(`DELETE FROM clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(client.query(`TRUNCATE clt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await client.release();
      }
    });

    it("no direct grant into iam2/cfg1/sec1 schemas was added this phase", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT table_schema, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`,
      );
      expect(rows.rows).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 9 — module closure & final hardening baseline
  // -----------------------------------------------------------------------------------------
  describe("Phase 9 — F1 closure: client_mandate duplicate-active now maps to 409", () => {
    it("a second create/apply for a client with an already-active mandate returns 409 CLT1_MANDATE_ALREADY_ACTIVE, not 503, and no second active mandate row is created", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await createMandate(clientId);

      const secondReq = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: { max_transaction_amount: 5000 }, requested_by: "staff_f1" },
      });
      expect(secondReq.statusCode, JSON.stringify(secondReq.json())).toBe(200);
      const { decision_id } = secondReq.json().data;

      const secondApply = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_f1_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_f1_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(secondApply.statusCode, JSON.stringify(secondApply.json())).toBe(409);
      expect(secondApply.json().error.code).toBe("CLT1_MANDATE_ALREADY_ACTIVE");

      const activeMandates = await verifyPool.query(`SELECT count(*) FROM clt1.client_mandate WHERE client_id = $1 AND status = 'active'`, [clientId]);
      expect(Number(activeMandates.rows[0].count)).toBe(1);

      const decisionRows = await verifyPool.query(`SELECT status FROM clt1.client_mandate_decision_request WHERE decision_id = $1`, [decision_id]);
      expect(decisionRows.rows[0].status).toBe("requested");
    });

    it("after the existing active mandate becomes inactive (direct DB update — no organic deactivation route exists this phase), a new create/apply succeeds", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { mandate_id } = await createMandate(clientId);
      await verifyPool.query(`UPDATE clt1.client_mandate SET status = 'inactive' WHERE mandate_id = $1`, [mandate_id]);

      const req = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/request`,
        headers: internalHeaders,
        payload: { mandate_type: "standard", rules: {}, requested_by: "staff_f1b" },
      });
      expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
      const { decision_id } = req.json().data;
      const apply = await app.inject({
        method: "POST",
        url: `${MANDATE_URL(clientId)}/create/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_f1b_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_f1b_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(apply.statusCode, JSON.stringify(apply.json())).toBe(200);
    });
  });

  describe("Phase 9 — permission inventory: final closure count (33)", () => {
    it("classifies all 33 clt1.* permissions: 19 maker-checker + 14 single-step, all licence_locked=false, prohibited=false, zero role_permission seed", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code, requires_approval, licence_locked, prohibited FROM iam2.permission WHERE permission_code LIKE 'clt1.%' ORDER BY permission_code`);
      expect(rows.rows).toHaveLength(33);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must be licence_locked=false`).toBe(false);
        expect(row.prohibited, `${row.permission_code} must be prohibited=false`).toBe(false);
      }
      const makerChecker = rows.rows.filter((r) => r.requires_approval);
      const singleStep = rows.rows.filter((r) => !r.requires_approval);
      expect(makerChecker, "maker-checker (requires_approval=true) count").toHaveLength(19);
      expect(singleStep, "single-step (requires_approval=false) count").toHaveLength(14);

      // M-1: scoped via countUnauthorizedCltRolePermissionBindings() (see its own header comment).
      expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
    });

    it("forbidden closure permissions are absent: client_profile.read/.history/.activate/.reopen, approval.override, duplicate.override, wallet/trading/Exchange", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code LIKE 'clt1.%'`);
      const codes = rows.rows.map((r) => r.permission_code as string);
      for (const forbidden of [
        "clt1.client_profile.read",
        "clt1.client_profile.history",
        "clt1.client_profile.activate",
        "clt1.client_profile.reopen",
        "clt1.approval.override",
        "clt1.duplicate.override",
      ]) {
        expect(codes).not.toContain(forbidden);
      }
      for (const fragment of ["wallet", "trading", "exchange", "deposit", "withdraw", "settlement"]) {
        expect(codes.some((c) => c.toLowerCase().includes(fragment)), `no permission code should contain '${fragment}'`).toBe(false);
      }
    });
  });

  describe("Phase 9 — grant inventory: final closure matrix", () => {
    it("role_clt1_runtime has zero DELETE/TRUNCATE grants anywhere", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND privilege_type IN ('DELETE','TRUNCATE')`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("role_clt1_runtime has zero direct grant into iam2/cfg1/sec1 schemas", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam2','cfg1','sec1')`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("role_clt1_runtime has no foundation.idempotency_record grant; foundation.outbox_event is INSERT-only", async () => {
      if (!schemaReady) return;
      const idem = await verifyPool.query(`SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_name = 'idempotency_record'`);
      expect(Number(idem.rows[0].count)).toBe(0);
      const outbox = await verifyPool.query(
        `SELECT string_agg(DISTINCT privilege_type, ',') AS privs FROM information_schema.role_table_grants WHERE grantee = 'role_clt1_runtime' AND table_schema = 'foundation' AND table_name = 'outbox_event'`,
      );
      expect(outbox.rows[0].privs).toBe("INSERT");
    });

    it("client_profile UPDATE grant is limited to exactly status/version/updated_at_utc", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'clt1' AND table_name = 'client_profile' AND grantee = 'role_clt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(rows.rows.map((r) => r.column_name)).toEqual(["status", "updated_at_utc", "version"]);
    });

    it("every decision-request table's UPDATE grant is limited to exactly status/approval_id/decision_token_hash/applied_at_utc", async () => {
      if (!schemaReady) return;
      for (const table of [
        "application_decision_request",
        "authorised_user_decision_request",
        "client_mandate_decision_request",
        "authorised_party_decision_request",
        "related_party_edge_decision_request",
        "duplicate_candidate_decision_request",
        "client_profile_lifecycle_decision_request",
      ]) {
        const rows = await verifyPool.query(
          `SELECT column_name FROM information_schema.role_column_grants WHERE table_schema = 'clt1' AND table_name = $1 AND grantee = 'role_clt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
          [table],
        );
        expect(rows.rows.map((r) => r.column_name), `${table} UPDATE grant`).toEqual(["applied_at_utc", "approval_id", "decision_token_hash", "status"]);
      }
    });
  });

  describe("Phase 9 — audit-event inventory: final closure sweep", () => {
    it("the documented event set has been emitted at least once per phase family across the full suite run so far", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'clt1.%'`);
      const emitted = new Set(rows.rows.map((r) => r.event_type as string));
      const expectedByPhase: Record<string, string[]> = {
        "Phase 1 intake": ["clt1.application_created", "clt1.application_submitted", "clt1.application_under_review", "clt1.client_class_claimed", "clt1.consent_recorded"],
        "Phase 2 approval/CDD/handoff/client_profile": [
          "clt1.application_approval_requested",
          "clt1.application_approved",
          "clt1.cdd_outcome_received",
          "clt1.kyc_handoff_created",
          "clt1.aml_handoff_created",
          "clt1.client_profile_created",
        ],
        "Phase 3 authorised_user/client_mandate": ["clt1.authorised_user_add_requested", "clt1.authorised_user_added", "clt1.client_mandate_create_requested", "clt1.client_mandate_created"],
        "Phase 4 authorised_party/screening": ["clt1.authorised_party_add_requested", "clt1.authorised_party_added", "clt1.authorised_party_screened"],
        "Phase 5 related_party_edge": ["clt1.related_party_edge_add_requested", "clt1.related_party_edge_created"],
        "Phase 6 duplicate_candidate": ["clt1.duplicate_candidate_create_requested", "clt1.duplicate_candidate_created"],
        "Phase 7 approval-denial wrapper": ["clt1.application_approval_denied"],
        "Phase 8 client_profile lifecycle": ["clt1.client_profile_suspend_requested", "clt1.client_profile_suspended", "clt1.client_profile_lifecycle_denied"],
      };
      for (const [family, events] of Object.entries(expectedByPhase)) {
        for (const eventType of events) {
          expect(emitted.has(eventType), `${family} — expected ${eventType} to have been emitted at least once`).toBe(true);
        }
      }
    });

    it("clt1.cdd_gate_denied is never emitted (Phase 7 rename to clt1.application_approval_denied holds)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'clt1.cdd_gate_denied'`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("every clt1.application_approval_denied and clt1.client_profile_lifecycle_denied event carries a non-empty reason_code", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type IN ('clt1.application_approval_denied', 'clt1.client_profile_lifecycle_denied')`,
      );
      expect(rows.rows.length).toBeGreaterThan(0);
      for (const row of rows.rows) {
        const payload = JSON.parse(row.payload_ref as string) as { reason_code?: string };
        expect(payload.reason_code, `payload_ref must carry a reason_code: ${row.payload_ref}`).toBeTruthy();
      }
    });

    it("no PII substring appears in any clt1.* audit payload_ref accumulated across the full suite run", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type LIKE 'clt1.%'`);
      expect(rows.rows.length).toBeGreaterThan(0);
      const forbidden = ["legal_name", "applicant_email", "registration_number", "country_of_incorporation", "user_reference", "party_reference"];
      for (const row of rows.rows) {
        const payloadStr = row.payload_ref as string;
        for (const field of forbidden) {
          expect(payloadStr.includes(`"${field}"`), `payload_ref must not contain PII key "${field}": ${payloadStr}`).toBe(false);
        }
      }
    });
  });

  describe("Phase 9 — PII/safe-response regression: one route per family", () => {
    it("application GET response excludes legal_name/registration_number/country_of_incorporation/applicant_email", async () => {
      if (!schemaReady) return;
      const created = await createDraft();
      const res = await app.inject({ method: "GET", url: `${APPLICATIONS_URL}/${created.application_id}`, headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.json().data);
      for (const field of ["legal_name", "registration_number", "country_of_incorporation", "applicant_email"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("client status response excludes PII and decision-internal fields", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/status`, headers: internalHeaders });
      const body = JSON.stringify(res.json().data);
      for (const field of ["legal_name", "registration_number", "country_of_incorporation", "applicant_email", "requested_by", "approval_id"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("authorised_user list response excludes user_reference/requested_by/approval_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedUser(clientId);
      const res = await app.inject({ method: "GET", url: `${AU_URL(clientId)}?actor_id=staff_read_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const body = JSON.stringify(res.json().data);
      for (const field of ["user_reference", "requested_by", "approval_id"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("mandate current response excludes requested_by/approval_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await createMandate(clientId);
      const res = await app.inject({ method: "GET", url: `${MANDATE_URL(clientId)}/current?actor_id=staff_read_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const body = JSON.stringify(res.json().data);
      for (const field of ["requested_by", "approval_id"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("authorised_party list response excludes party_reference/requested_by/approval_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addAuthorisedParty(clientId);
      const res = await app.inject({ method: "GET", url: `${AP_URL(clientId)}?actor_id=staff_read_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const body = JSON.stringify(res.json().data);
      for (const field of ["party_reference", "requested_by", "approval_id"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("related-party client-scoped read response excludes requested_by", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addRelatedPartyEdge({ from_entity_type: "client", from_entity_id: clientId });
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/related-parties?actor_id=staff_read_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const body = JSON.stringify(res.json().data);
      expect(body.includes('"requested_by"')).toBe(false);
    });

    it("duplicate-candidate client-scoped read response excludes reviewed_by/requested_by/approval_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      await addDuplicateCandidate({ subject_type: "client", subject_ref: clientId });
      const res = await app.inject({ method: "GET", url: `/internal/clt1/clients/${clientId}/duplicate-candidates?actor_id=staff_read_1`, headers: internalHeaders });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const body = JSON.stringify(res.json().data);
      for (const field of ["reviewed_by", "requested_by", "approval_id"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });

    it("client_profile lifecycle apply response excludes requested_by/approval_id/decision_token_hash/reason/evidence_ref", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const { applyRes } = await runLifecycleAction(clientId, "suspend");
      expect(applyRes.statusCode, JSON.stringify(applyRes.json())).toBe(200);
      const body = JSON.stringify(applyRes.json().data);
      for (const field of ["requested_by", "approval_id", "decision_token_hash", "reason", "evidence_ref"]) {
        expect(body.includes(`"${field}"`)).toBe(false);
      }
    });
  });

  describe("Phase 9 — no-Exchange/no-trading/no-wallet posture: final verification", () => {
    it("client_profile.status live values are only active_limited/suspended/closed — never active/trading_enabled/wallet_enabled", async () => {
      if (!schemaReady) return;
      // afterEach clears clt1.client_profile between tests (unlike foundation.outbox_event, which
      // accumulates), so this test creates its own fixtures spanning all three reachable statuses
      // rather than relying on state left behind by earlier tests in the file.
      await createActiveClient();
      const suspendedClientId = await createActiveClient();
      await runLifecycleAction(suspendedClientId, "suspend");
      const closedClientId = await createActiveClient();
      await runLifecycleAction(closedClientId, "close");

      const rows = await verifyPool.query(`SELECT DISTINCT status FROM clt1.client_profile`);
      const statuses = rows.rows.map((r) => r.status as string);
      expect(statuses).toEqual(expect.arrayContaining(["active_limited", "suspended", "closed"]));
      for (const status of statuses) {
        expect(["active_limited", "suspended", "closed"], `unexpected client_profile.status value: ${status}`).toContain(status);
      }
      expect(statuses).not.toContain("active");
      expect(statuses).not.toContain("trading_enabled");
      expect(statuses).not.toContain("wallet_enabled");
    });

    it("no forbidden business-capability route fragment in the live route surface", () => {
      if (!schemaReady) return;
      const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
      for (const forbidden of [
        "exchange",
        "order-book",
        "orderbook",
        "matching",
        "market-making",
        // "principal" alone is NOT listed here: it collides with the legitimate Authenticated
        // Principal -> Client Membership Authority route (`/internal/clt1/principals/...`), an
        // IAM/security identity concept unrelated to the market-microstructure "principal
        // trading" concept this guard exists to catch.
        "principal-trading",
        "spread-markup",
        "wallet",
        "deposit",
        "withdraw",
        "trading",
        "settlement",
      ]) {
        expect(routePaths).not.toContain(forbidden);
      }
    });
  });

  // =============================================================================================
  // PHASE 4A — application-keyed KYC roster contract
  // (GET /internal/clt1/applications/:application_id/kyc-roster)
  //
  // The point of this phase is that the roster is readable BEFORE final approval. Every fixture
  // below therefore seeds `clt1.authorised_party` rows DIRECTLY (raw SQL via `verifyPool`) against
  // an `under_review` application with NO `client_profile` row — the Phase 4 maker-checker
  // `add/request`+`add/apply` routes cannot be used here at all, because they are client-keyed and
  // require `client_profile.status='active_limited'`, which is exactly the chronological inversion
  // this route exists to remove.
  // =============================================================================================
  describe("Phase 4A — GET /internal/clt1/applications/:application_id/kyc-roster", () => {
    const ROSTER_URL = (applicationId: string) => `${APPLICATIONS_URL}/${applicationId}/kyc-roster`;

    /** Inserts an `authorised_party` row directly, bypassing the client-keyed maker-checker
     * routes (see the describe-block comment). `party_reference` is deliberately given a
     * recognisable PII-shaped value so the PII-safety assertions below are meaningful. */
    async function seedParty(
      applicationId: string,
      authorisedPartyId: string,
      opts: { party_type?: string; authority_status?: string; version?: number; party_reference?: string; ownership_percentage?: string } = {},
    ): Promise<void> {
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party
           (authorised_party_id, application_id, party_type, party_reference, ownership_percentage, authority_status, version, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'staff_seed')`,
        [
          authorisedPartyId,
          applicationId,
          opts.party_type ?? "director",
          opts.party_reference ?? "Jane Q Director <jane.director@example.com>",
          opts.ownership_percentage ?? "51.00",
          opts.authority_status ?? "pending",
          opts.version ?? 1,
        ],
      );
    }

    async function fetchRoster(applicationId: string, extraHeaders: Record<string, string> = {}): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const res = await app.inject({ method: "GET", url: ROSTER_URL(applicationId), headers: { ...internalHeaders, ...extraHeaders } });
      return { statusCode: res.statusCode, body: res.json() };
    }

    /** Drives an application to `under_review` and asserts no client_profile exists yet — the
     * exact pre-approval window this contract must serve. */
    async function underReviewApplication(overrides: CreateApplicationInput = {}): Promise<string> {
      const created = await progressToUnderReview(overrides);
      const applicationId = created.application_id as string;
      const profiles = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
      expect(profiles.rows[0].n).toBe(0);
      const app_ = await verifyPool.query(`SELECT status, client_id FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
      expect(app_.rows[0].status).toBe("under_review");
      expect(app_.rows[0].client_id).toBeNull();
      return applicationId;
    }

    // -------------------------------------------------------------------------------------
    // Authentication — internal service identity only, no human actor accepted at all.
    // -------------------------------------------------------------------------------------
    it("rejects a request with NO internal service token (401)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const res = await app.inject({ method: "GET", url: ROSTER_URL(applicationId) });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("rejects a request with a WRONG internal service token (401)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const res = await app.inject({ method: "GET", url: ROSTER_URL(applicationId), headers: { "x-internal-service-token": "not-the-real-token" } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("accepts a valid internal service token with NO actor_id — the route requires no human identity", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const { statusCode, body } = await fetchRoster(applicationId);
      expect(statusCode, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
    });

    it("REJECTS a caller-asserted actor_id (400) — the route structurally cannot grow an actor-trust surface", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const res = await app.inject({ method: "GET", url: `${ROSTER_URL(applicationId)}?actor_id=user_operator_1`, headers: internalHeaders });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("makes NO IAM-02 call at all (permission-gating this machine read would manufacture an identity nobody supplied)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_iam2probe_1");

      let iam2Calls = 0;
      const previous = config.iam2FetchImpl;
      config.iam2FetchImpl = (async (...args: Parameters<typeof fetch>) => {
        iam2Calls += 1;
        void args;
        throw new Error("IAM-02 must not be called by the kyc-roster route");
      }) as unknown as typeof fetch;
      try {
        const { statusCode, body } = await fetchRoster(applicationId);
        expect(statusCode, JSON.stringify(body)).toBe(200);
        expect(iam2Calls).toBe(0);
      } finally {
        config.iam2FetchImpl = previous;
      }
    });

    // -------------------------------------------------------------------------------------
    // Chronological regression — the entire reason Phase 4A exists.
    // -------------------------------------------------------------------------------------
    it("CHRONOLOGICAL REGRESSION: serves the roster while status='under_review' with NO client_profile row and NO client_id — the pre-approval window the client-keyed route cannot reach", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_chrono_1", { party_type: "director" });
      await seedParty(applicationId, "clt1ap_chrono_2", { party_type: "ubo" });

      const { statusCode, body } = await fetchRoster(applicationId);
      expect(statusCode, JSON.stringify(body)).toBe(200);
      const data = body.data as Record<string, unknown>;
      expect(data.application_status).toBe("under_review");
      expect(data.party_count).toBe(2);

      // Direct proof of the inversion this replaces: the pre-existing client-keyed route cannot
      // serve this application at all, because no client_id exists to key it by yet.
      const profiles = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.client_profile`);
      expect(profiles.rows[0].n).toBe(0);
    });

    it("serves the roster at other application statuses too — CLT-01 reports application_status and applies no eligibility policy of its own", async () => {
      if (!schemaReady) return;
      // draft
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const draft = await createDraft();
      const draftRes = await fetchRoster(draft.application_id as string);
      expect(draftRes.statusCode, JSON.stringify(draftRes.body)).toBe(200);
      expect((draftRes.body.data as Record<string, unknown>).application_status).toBe("draft");

      // approved
      const clientId = await createActiveClient();
      const approved = await verifyPool.query(`SELECT application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      const approvedRes = await fetchRoster(approved.rows[0].application_id);
      expect(approvedRes.statusCode, JSON.stringify(approvedRes.body)).toBe(200);
      expect((approvedRes.body.data as Record<string, unknown>).application_status).toBe("approved");
    });

    // -------------------------------------------------------------------------------------
    // Application lookup.
    // -------------------------------------------------------------------------------------
    it("unknown application_id returns CLT1_APPLICATION_NOT_FOUND (404) — never CLT1_CLIENT_NOT_FOUND, and never reveals whether a client_profile exists", async () => {
      if (!schemaReady) return;
      const { statusCode, body } = await fetchRoster("clt1app_does_not_exist");
      expect(statusCode).toBe(404);
      expect((body.error as Record<string, unknown>).code).toBe("CLT1_APPLICATION_NOT_FOUND");
      expect(JSON.stringify(body)).not.toContain("CLT1_CLIENT_NOT_FOUND");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("client_profile");
    });

    it("writes nothing — no row in any clt1 table changes as a result of a roster read", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_readonly_1");
      const before = await verifyPool.query(
        `SELECT (SELECT count(*) FROM clt1.authorised_party) AS ap,
                (SELECT count(*) FROM clt1.client_application) AS ca,
                (SELECT max(version) FROM clt1.authorised_party) AS v,
                (SELECT max(updated_at_utc) FROM clt1.client_application) AS u`,
      );
      await fetchRoster(applicationId);
      await fetchRoster(applicationId);
      const after = await verifyPool.query(
        `SELECT (SELECT count(*) FROM clt1.authorised_party) AS ap,
                (SELECT count(*) FROM clt1.client_application) AS ca,
                (SELECT max(version) FROM clt1.authorised_party) AS v,
                (SELECT max(updated_at_utc) FROM clt1.client_application) AS u`,
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    // -------------------------------------------------------------------------------------
    // Response contract.
    // -------------------------------------------------------------------------------------
    it("returns EXACTLY the six approved top-level fields and EXACTLY the four approved per-party fields", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_shape_1");
      const { body } = await fetchRoster(applicationId);
      const data = body.data as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(["application_id", "application_status", "authorised_parties", "party_count", "primary_subject_type", "roster_hash"].sort());
      for (const p of data.authorised_parties as Record<string, unknown>[]) {
        expect(Object.keys(p).sort()).toEqual(["authorised_party_id", "authority_status", "party_type", "version"].sort());
      }
      expect(data.application_id).toBe(applicationId);
      expect(data.roster_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("primary_subject_type mapping: individual -> individual, corporate -> entity, institutional -> entity (and applicant_type itself is never returned)", async () => {
      if (!schemaReady) return;
      for (const [applicantType, expected] of [
        ["individual", "individual"],
        ["corporate", "entity"],
        ["institutional", "entity"],
      ] as const) {
        const applicationId = await underReviewApplication({ applicant_type: applicantType });
        const { body } = await fetchRoster(applicationId);
        const data = body.data as Record<string, unknown>;
        expect(data.primary_subject_type, `applicant_type=${applicantType}`).toBe(expected);
        expect(Object.keys(data)).not.toContain("applicant_type");
        expect(JSON.stringify(data)).not.toContain(applicantType === "individual" ? "\"corporate\"" : `"${applicantType}"`);
        await verifyPool.query(`DELETE FROM clt1.consent_record WHERE application_id = $1`, [applicationId]);
        await verifyPool.query(`DELETE FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
      }
    });

    it("party_count equals the COMPLETE returned array length (never a page size)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      for (let i = 0; i < 7; i += 1) await seedParty(applicationId, `clt1ap_count_${i}`);
      const { body } = await fetchRoster(applicationId);
      const data = body.data as Record<string, unknown>;
      expect(data.party_count).toBe(7);
      expect((data.authorised_parties as unknown[]).length).toBe(7);
    });

    // -------------------------------------------------------------------------------------
    // PII safety.
    // -------------------------------------------------------------------------------------
    it("PII SAFETY: no party_reference, no applicant PII, no ownership_percentage, no raw DB objects anywhere in the response", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication({
        legal_name: "Confidential Holdings Pte Ltd",
        applicant_email: "secret.applicant@example.com",
        registration_number: "REG-SECRET-999",
        country_of_incorporation: "SG",
      });
      await seedParty(applicationId, "clt1ap_pii_1", { party_reference: "Alice Beneficial-Owner <alice.ubo@example.com>", ownership_percentage: "76.50", party_type: "ubo" });

      const { statusCode, body } = await fetchRoster(applicationId);
      expect(statusCode).toBe(200);
      const serialised = JSON.stringify(body);
      for (const forbidden of [
        "Alice Beneficial-Owner",
        "alice.ubo@example.com",
        "party_reference",
        "ownership_percentage",
        "76.50",
        "Confidential Holdings",
        "secret.applicant@example.com",
        "REG-SECRET-999",
        "legal_name",
        "applicant_email",
        "registration_number",
        "country_of_incorporation",
        "identity_verification_status",
        "sanctions_pep_status",
        "sec_audit_ref",
        "requested_by",
        "created_at_utc",
        "updated_at_utc",
        "x-internal-service-token",
        "test-clt1-internal-token-it",
      ]) {
        expect(serialised, `response leaked: ${forbidden}`).not.toContain(forbidden);
      }
    });

    // -------------------------------------------------------------------------------------
    // Complete roster — no filtering, no pagination, no truncation.
    // -------------------------------------------------------------------------------------
    it("empty roster returns an empty array, party_count 0, and a real hash", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const { body } = await fetchRoster(applicationId);
      const data = body.data as Record<string, unknown>;
      expect(data.authorised_parties).toEqual([]);
      expect(data.party_count).toBe(0);
      expect(data.roster_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("single-party and multi-party rosters are both returned complete", async () => {
      if (!schemaReady) return;
      const one = await underReviewApplication();
      await seedParty(one, "clt1ap_one_1");
      expect(((await fetchRoster(one)).body.data as Record<string, unknown>).party_count).toBe(1);

      const many = await underReviewApplication();
      for (let i = 0; i < 12; i += 1) await seedParty(many, `clt1ap_many_${String(i).padStart(3, "0")}`);
      expect(((await fetchRoster(many)).body.data as Record<string, unknown>).party_count).toBe(12);
    });

    it("returns EVERY authority_status unfiltered — no status is silently dropped (KYC-01, not CLT-01, decides which are required)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const statuses = ["pending", "active", "restricted", "rejected", "revoked", "suspended"];
      for (const [i, s] of statuses.entries()) await seedParty(applicationId, `clt1ap_st_${i}`, { authority_status: s });

      const { body } = await fetchRoster(applicationId);
      const data = body.data as Record<string, unknown>;
      expect(data.party_count).toBe(statuses.length);
      expect((data.authorised_parties as { authority_status: string }[]).map((p) => p.authority_status).sort()).toEqual([...statuses].sort());
    });

    it("returns EVERY party_type unfiltered, including 'ubo'", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      const types = ["signatory", "director", "controller", "ubo"];
      for (const [i, t] of types.entries()) await seedParty(applicationId, `clt1ap_pt_${i}`, { party_type: t });
      const { body } = await fetchRoster(applicationId);
      expect(((body.data as Record<string, unknown>).authorised_parties as { party_type: string }[]).map((p) => p.party_type).sort()).toEqual([...types].sort());
    });

    it("exactly 500 parties succeeds and returns all 500; 501 fails EXPLICITLY with no truncation and no partial hash", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
         SELECT 'clt1ap_cap_' || lpad(g::text, 4, '0'), $1, 'director', 'seed ' || g, 'pending', 'staff_seed'
           FROM generate_series(1, 500) AS g`,
        [applicationId],
      );
      const atCap = await fetchRoster(applicationId);
      expect(atCap.statusCode, JSON.stringify(atCap.body)).toBe(200);
      const capData = atCap.body.data as Record<string, unknown>;
      expect(capData.party_count).toBe(500);
      expect((capData.authorised_parties as unknown[]).length).toBe(500);

      await seedParty(applicationId, "clt1ap_cap_0501");
      const overCap = await fetchRoster(applicationId);
      expect(overCap.statusCode).toBe(409);
      const err = overCap.body.error as Record<string, unknown>;
      expect(err.code).toBe("CLT1_KYC_ROSTER_TOO_LARGE");
      expect(err.code).not.toBe("CLT1_APPLICATION_INVALID_STATE");
      // No roster and no hash may be produced on the refusal path.
      expect(overCap.body.data).toBeUndefined();
      expect(JSON.stringify(overCap.body)).not.toContain("roster_hash");
      expect(JSON.stringify(overCap.body)).not.toContain("sha256:");
      // No party IDs or party content leak into the refusal (the `details[0].field` value
      // "authorised_parties" is the bounded field NAME the schema already uses elsewhere, not
      // roster content, so it is not itself a leak).
      expect(JSON.stringify(overCap.body)).not.toContain("clt1ap_cap_");
    });

    it("CLT1_KYC_ROSTER_TOO_LARGE's message concerns roster size, not application status, and its details are bounded/non-PII", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
         SELECT 'clt1ap_msg_' || lpad(g::text, 4, '0'), $1, 'director', 'Confidential Person ' || g, 'pending', 'staff_seed'
           FROM generate_series(1, 501) AS g`,
        [applicationId],
      );
      const res = await fetchRoster(applicationId);
      expect(res.statusCode).toBe(409);
      const err = res.body.error as { code: string; message: string; details: { field: string; issue: string }[] };
      expect(err.code).toBe("CLT1_KYC_ROSTER_TOO_LARGE");
      expect(err.message.toLowerCase()).toContain("roster");
      expect(err.message.toLowerCase()).not.toContain("status");
      expect(err.details[0]?.field).toBe("authorised_parties");
      expect(err.details[0]?.issue).toContain("reason_code=roster_too_large");
      expect(err.details[0]?.issue).toContain("maximum_party_count=500");
      expect(err.details[0]?.issue).toContain("observed_at_least=501");
      // Bounded diagnostics only — no roster content, no PII, no exact row count beyond the cap+1 floor.
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain("Confidential Person");
      expect(serialised).not.toContain("clt1ap_msg_");
      expect(serialised).not.toContain("party_reference");
    });

    it("existing CLT1_APPLICATION_INVALID_STATE call sites elsewhere are unaffected by the roster-cap error split (e.g. double-submit still returns it)", async () => {
      if (!schemaReady) return;
      config.cfg1FetchImpl = realisticCfg1Fetch();
      const created = await createDraft();
      await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/consents`,
        headers: internalHeaders,
        payload: { consent_type: "terms", consent_version: "v1", consent_given: true, given_by: "user_applicant_1" },
      });
      await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      const res = await app.inject({ method: "POST", url: `${APPLICATIONS_URL}/${created.application_id}/submit`, headers: internalHeaders });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });

    it("offers no pagination surface — limit/offset/cursor/page query parameters are all rejected", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      for (const qs of ["limit=1", "offset=1", "cursor=abc", "page=2", "page_size=10"]) {
        const res = await app.inject({ method: "GET", url: `${ROSTER_URL(applicationId)}?${qs}`, headers: internalHeaders });
        expect(res.statusCode, `query ${qs} was not rejected`).toBe(400);
      }
    });

    // -------------------------------------------------------------------------------------
    // Canonicalisation.
    // -------------------------------------------------------------------------------------
    it("returns parties in authorised_party_id ASC order, and that order is independent of database insertion order", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      // Inserted deliberately out of order, with created_at_utc DESCENDING relative to the id
      // order — so a created_at_utc-based ordering (the existing client-keyed route's) would
      // produce a DIFFERENT sequence than the required one.
      for (const id of ["clt1ap_ord_c", "clt1ap_ord_a", "clt1ap_ord_b"]) await seedParty(applicationId, id);
      await verifyPool.query(`UPDATE clt1.authorised_party SET created_at_utc = now() - (position(right(authorised_party_id,1) in 'abc') * interval '1 hour')`);

      const { body } = await fetchRoster(applicationId);
      expect(((body.data as Record<string, unknown>).authorised_parties as { authorised_party_id: string }[]).map((p) => p.authorised_party_id)).toEqual([
        "clt1ap_ord_a",
        "clt1ap_ord_b",
        "clt1ap_ord_c",
      ]);
    });

    it("insertion order does not affect roster_hash — two applications with the same semantic roster inserted in opposite orders hash identically", async () => {
      if (!schemaReady) return;
      const a = await underReviewApplication();
      const b = await underReviewApplication();
      for (const id of ["p_x", "p_y", "p_z"]) await seedParty(a, id + "_A");
      for (const id of ["p_z", "p_y", "p_x"]) await seedParty(b, id + "_B");

      const hashA = ((await fetchRoster(a)).body.data as Record<string, unknown>).roster_hash as string;
      const hashB = ((await fetchRoster(b)).body.data as Record<string, unknown>).roster_hash as string;
      // The two hashes differ only because application_id differs — prove insertion-order
      // independence by comparing each application against a re-read of ITSELF after a rewrite
      // that changes physical row order but nothing semantic.
      await verifyPool.query(`UPDATE clt1.authorised_party SET updated_at_utc = now() WHERE application_id = $1`, [a]);
      expect(((await fetchRoster(a)).body.data as Record<string, unknown>).roster_hash).toBe(hashA);
      expect(hashA).not.toBe(hashB);
    });

    // -------------------------------------------------------------------------------------
    // Hash sensitivity + stability, proven end-to-end through the real route.
    // -------------------------------------------------------------------------------------
    it("roster_hash CHANGES on add, on remove, on authority_status change, on party_type change, and on version increment", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_h_1");
      await seedParty(applicationId, "clt1ap_h_2");
      const hashOf = async () => ((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash as string;

      const base = await hashOf();

      await seedParty(applicationId, "clt1ap_h_3");
      const afterAdd = await hashOf();
      expect(afterAdd).not.toBe(base);

      await verifyPool.query(`DELETE FROM clt1.authorised_party WHERE authorised_party_id = 'clt1ap_h_3'`);
      expect(await hashOf()).toBe(base); // removal restores the exact prior roster state

      await verifyPool.query(`UPDATE clt1.authorised_party SET authority_status = 'active' WHERE authorised_party_id = 'clt1ap_h_1'`);
      const afterStatus = await hashOf();
      expect(afterStatus).not.toBe(base);

      await verifyPool.query(`UPDATE clt1.authorised_party SET party_type = 'ubo' WHERE authorised_party_id = 'clt1ap_h_1'`);
      const afterType = await hashOf();
      expect(afterType).not.toBe(afterStatus);

      await verifyPool.query(`UPDATE clt1.authorised_party SET version = version + 1 WHERE authorised_party_id = 'clt1ap_h_1'`);
      expect(await hashOf()).not.toBe(afterType);
    });

    it("roster_hash CHANGES when application_status changes, with the roster itself untouched", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_appstat_1");
      const before = ((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash;
      await verifyPool.query(`UPDATE clt1.client_application SET status = 'held' WHERE application_id = $1`, [applicationId]);
      const after = (await fetchRoster(applicationId)).body.data as Record<string, unknown>;
      expect(after.application_status).toBe("held");
      expect(after.roster_hash).not.toBe(before);
    });

    it("roster_hash CHANGES when primary_subject_type changes (applicant_type individual vs corporate), with an identical roster", async () => {
      if (!schemaReady) return;
      const ind = await underReviewApplication({ applicant_type: "individual" });
      await verifyPool.query(`UPDATE clt1.client_application SET application_id = application_id WHERE application_id = $1`, [ind]);
      const indHash = ((await fetchRoster(ind)).body.data as Record<string, unknown>).roster_hash;
      // Flip applicant_type in place so ONLY primary_subject_type differs — application_id,
      // application_status and the (empty) roster are all identical across the two reads.
      await verifyPool.query(`UPDATE clt1.client_application SET applicant_type = 'corporate' WHERE application_id = $1`, [ind]);
      const corpRead = (await fetchRoster(ind)).body.data as Record<string, unknown>;
      expect(corpRead.primary_subject_type).toBe("entity");
      expect(corpRead.roster_hash).not.toBe(indHash);
    });

    it("roster_hash is STABLE: an identical semantic roster re-read yields an identical hash, and timestamp churn does not move it", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_stab_1");
      await seedParty(applicationId, "clt1ap_stab_2");
      const first = ((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash;

      await verifyPool.query(`UPDATE clt1.authorised_party SET created_at_utc = now() - interval '9 days', updated_at_utc = now(), last_screened_at_utc = now()`);
      await verifyPool.query(`UPDATE clt1.client_application SET updated_at_utc = now() WHERE application_id = $1`, [applicationId]);
      expect(((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash).toBe(first);
    });

    it("roster_hash is STABLE across differing request_id / correlation_id — per-request context can never enter the digest", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_ctx_1");
      const a = await fetchRoster(applicationId, { "x-request-id": "req-aaaaaaaa", "x-correlation-id": "corr-aaaaaaaa" });
      const b = await fetchRoster(applicationId, { "x-request-id": "req-bbbbbbbb", "x-correlation-id": "corr-bbbbbbbb" });
      expect(a.body.request_id).not.toBe(b.body.request_id);
      expect(a.body.correlation_id).not.toBe(b.body.correlation_id);
      expect((a.body.data as Record<string, unknown>).roster_hash).toBe((b.body.data as Record<string, unknown>).roster_hash);
    });

    it("roster_hash is STABLE against a PII-only change — editing party_reference/ownership_percentage alone does not move the digest (they are not hashed)", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_piihash_1", { party_reference: "Original Name", ownership_percentage: "10.00" });
      const before = ((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash;
      await verifyPool.query(`UPDATE clt1.authorised_party SET party_reference = 'Completely Different Name', ownership_percentage = '99.99' WHERE authorised_party_id = 'clt1ap_piihash_1'`);
      expect(((await fetchRoster(applicationId)).body.data as Record<string, unknown>).roster_hash).toBe(before);
    });

    it("a roster read scoped to one application never includes another application's parties", async () => {
      if (!schemaReady) return;
      const a = await underReviewApplication();
      const b = await underReviewApplication();
      await seedParty(a, "clt1ap_scope_a1");
      await seedParty(b, "clt1ap_scope_b1");
      await seedParty(b, "clt1ap_scope_b2");

      const aData = (await fetchRoster(a)).body.data as Record<string, unknown>;
      expect(aData.party_count).toBe(1);
      expect(JSON.stringify(aData)).not.toContain("clt1ap_scope_b");
      expect(((await fetchRoster(b)).body.data as Record<string, unknown>).party_count).toBe(2);
    });

    // -------------------------------------------------------------------------------------
    // Scope / drift guards.
    // -------------------------------------------------------------------------------------
    it("SCOPE: kyc-roster is the ONLY route matching /kyc-roster, and no roster publication/delivery/completeness route was added", async () => {
      if (!schemaReady) return;
      const routes = app.printRoutes({ commonPrefix: false }).toLowerCase();
      expect((routes.match(/kyc-roster/g) ?? []).length).toBe(1);
      for (const forbidden of ["roster-publication", "roster-completeness", "publish-outcome", "outcome-publications", "roster-version", "roster/verify"]) {
        expect(routes).not.toContain(forbidden);
      }
    });

    it("SCOPE: no clt1 IAM-02 permission was added for the roster contract, and no role_permission seed exists", async () => {
      if (!schemaReady) return;
      const rosterPerms = await verifyPool.query(`SELECT count(*)::int AS n FROM iam2.permission WHERE permission_code LIKE 'clt1.%roster%' OR permission_code LIKE 'clt1.kyc%'`);
      expect(rosterPerms.rows[0].n).toBe(0);
      // 33 = the accepted CLT-01 catalogue through Phase 8 (Phase 2's 5 + Phase 3's 8 + Phase 4's
      // 8 + Phase 5's 4 + Phase 6's 5 + Phase 8's 3). Phase 4A adds NONE.
      const clt1Perms = await verifyPool.query(`SELECT count(*)::int AS n FROM iam2.permission WHERE permission_code LIKE 'clt1.%'`);
      expect(clt1Perms.rows[0].n).toBe(33);
      // M-1: scoped via countUnauthorizedCltRolePermissionBindings() — deliberately excludes only
      // clt1-iam2-guard-real.test.ts's own documented fixture namespace (a legitimate, real
      // RBAC-assignment made by a sibling test file/Vitest worker, never a CLT-01 scope leak); see
      // that helper's own header comment for the full rationale.
      expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
    });

    it("SCOPE: no schema change — clt1.authorised_party and clt1.client_application carry no roster_version/roster_hash column", async () => {
      if (!schemaReady) return;
      const cols = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'clt1' AND (column_name LIKE 'roster%' OR column_name = 'kyc_roster_version')`,
      );
      expect(cols.rows[0].n).toBe(0);
    });

    it("SCOPE: the roster read needs no grant beyond the existing SELECT posture — it succeeds under role_clt1_runtime with no DELETE/TRUNCATE anywhere in clt1", async () => {
      if (!schemaReady) return;
      const applicationId = await underReviewApplication();
      await seedParty(applicationId, "clt1ap_grant_1");
      expect((await fetchRoster(applicationId)).statusCode).toBe(200);
      const bad = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
          WHERE grantee = 'role_clt1_runtime' AND table_schema = 'clt1' AND privilege_type IN ('DELETE','TRUNCATE')`,
      );
      expect(bad.rows[0].n).toBe(0);
    });
  });

  // =============================================================================================
  // PHASE 4A.1 — atomic KYC outcome receipt + approval roster binding
  // (migration 047_clt1_atomic_kyc_roster_binding.cjs)
  //
  // Closes a confirmed, empirically-reproduced TOCTOU between a KYC-01 roster read (the accepted
  // Phase 4A GET .../kyc-roster contract) and CLT-01's outcome acceptance, plus a second, larger
  // window between an accepted pass and final approval. See the KYC-01 Phase 4 delivery-atomicity
  // planning amendment for the original reproduction.
  //
  // IMPORTANT SCOPE NOTE: every `authorised_party` mutation ROUTE requires an already-approved,
  // active_limited client (`fetchActiveClientOrThrow`) — so, via the real HTTP surface, no party
  // can be added/changed while an application is still `under_review` (the exact window this
  // phase protects). The party-mutation tests below therefore seed/mutate `authorised_party`
  // directly via `verifyPool` (raw SQL), exactly like the Phase 4A test block above already does
  // for the identical reason — this proves the LOCK+HASH mechanism is genuinely correct as
  // defense-in-depth (direct DB access, a future migration, or a later application-id-keyed party
  // route), even though today's HTTP surface cannot itself reach this exact race.
  //
  // LOCK SCOPE NOTE: `patch`/`submit`/`cancel`/`start-review`/`hold`/`reject` deliberately do NOT
  // take the shared roster advisory lock, even though each mutates `client_application.status` (a
  // `roster_hash` input). This is safe, not merely convenient: `patch`/`submit`/`cancel` operate
  // exclusively in the draft/submitted state space, disjoint by the state machine's own guards
  // from the `under_review` window either race threatens; `hold`/`reject`/`start-review`'s
  // protection is independent of the lock — it comes from the receipt's own
  // `WHERE status = 'under_review'` guarded UPDATE, which fails closed against ANY status change
  // regardless of which mechanism produced it. See the dedicated test below that flips status via
  // raw SQL (bypassing the lock entirely) and confirms the receipt is still refused.
  // =============================================================================================
  describe("Phase 4A.1 — atomic KYC outcome receipt + approval roster binding", () => {
    const FAKE_MISMATCHED_HASH = "sha256:" + "0".repeat(64);

    async function seedParty(applicationId: string, authorisedPartyId: string, opts: { authority_status?: string; party_type?: string; version?: number } = {}): Promise<void> {
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, version, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,'staff_seed')`,
        [authorisedPartyId, applicationId, opts.party_type ?? "director", "Seed Person " + authorisedPartyId, opts.authority_status ?? "pending", opts.version ?? 1],
      );
    }

    async function applicationRow(applicationId: string): Promise<{ cdd_outcome_status: string; version: number; kyc_roster_hash: string | null }> {
      const r = await verifyPool.query(`SELECT cdd_outcome_status, version, kyc_roster_hash FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
      return r.rows[0];
    }

    async function cddOutcomeCount(applicationId: string): Promise<number> {
      const r = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.cdd_outcome WHERE application_id = $1`, [applicationId]);
      return r.rows[0].n;
    }

    async function auditEnvelopes(applicationId: string, eventType: string): Promise<Record<string, unknown>[]> {
      const r = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2 ORDER BY created_at_utc ASC`, [
        eventType,
        `%${applicationId}%`,
      ]);
      return r.rows.map((row) => JSON.parse(row.payload_ref as string));
    }

    // -------------------------------------------------------------------------------------
    // Contract.
    // -------------------------------------------------------------------------------------
    it("kyc_kyb without expected_roster_hash -> 400 VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("kyc_kyb with a malformed expected_roster_hash -> 400 VALIDATION_ERROR (schema pattern, not a bespoke code)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: "not-a-real-hash'; DROP TABLE x;--" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      // The malformed value is never echoed back raw in the response.
      expect(JSON.stringify(res.json())).not.toContain("DROP TABLE");
    });

    it("non-kyc_kyb outcome types remain valid with NO expected_roster_hash (AML-01 compatibility preserved)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      await receiveOutcome(created.application_id as string, "aml_sanctions", "pass");
      const row = await applicationRow(created.application_id as string);
      expect(row.cdd_outcome_status).not.toBe("pass"); // unaffected — aml_sanctions is a different rollup column
      expect(row.kyc_roster_hash).toBeNull(); // never touched by a non-kyc_kyb receipt
    });

    it("exact matching hash -> normal 201 receipt", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const hash = await currentRosterHash(applicationId);
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: hash },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
    });

    it("mismatched hash -> 409 CLT1_KYC_ROSTER_STALE", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${created.application_id}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: FAKE_MISMATCHED_HASH },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
      expect(res.json().error.message.toLowerCase()).toContain("roster");
    });

    // -------------------------------------------------------------------------------------
    // No-write stale refusal.
    // -------------------------------------------------------------------------------------
    it("stale refusal writes NOTHING: no cdd_outcome row, no rollup/version/kyc_roster_hash change, no success audit — exactly one high-severity refusal audit", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const before = await applicationRow(applicationId);
      const outcomeCountBefore = await cddOutcomeCount(applicationId);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: FAKE_MISMATCHED_HASH },
      });
      expect(res.statusCode).toBe(409);

      const after = await applicationRow(applicationId);
      expect(after).toEqual(before);
      expect(await cddOutcomeCount(applicationId)).toBe(outcomeCountBefore);

      const successAudits = await auditEnvelopes(applicationId, "clt1.cdd_outcome_received");
      expect(successAudits).toEqual([]);

      const refusalAudits = await auditEnvelopes(applicationId, "clt1.kyc_outcome_refused");
      expect(refusalAudits).toHaveLength(1);
      expect(refusalAudits[0]!.severity).toBe("high");
      expect(refusalAudits[0]!.reason_code).toBe("roster_stale");
      const metadata = refusalAudits[0]!.metadata as Record<string, unknown>;
      expect(metadata.expected_roster_hash).toBe(FAKE_MISMATCHED_HASH);
      expect(metadata.current_roster_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    // -------------------------------------------------------------------------------------
    // Historical binding.
    // -------------------------------------------------------------------------------------
    it("an accepted kyc_kyb receipt stores the EXACT accepted hash on both cdd_outcome and client_application", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const hash = await currentRosterHash(applicationId);
      await receiveOutcome(applicationId, "kyc_kyb", "pass", hash);

      const appRow = await applicationRow(applicationId);
      expect(appRow.kyc_roster_hash).toBe(hash);

      const outcomeRow = await verifyPool.query(`SELECT kyc_roster_hash FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'kyc_kyb'`, [applicationId]);
      expect(outcomeRow.rows[0].kyc_roster_hash).toBe(hash);
    });

    it("non-kyc_kyb outcomes store a NULL kyc_roster_hash on cdd_outcome", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await receiveOutcome(applicationId, "risk_rating", "pass");
      const outcomeRow = await verifyPool.query(`SELECT kyc_roster_hash FROM clt1.cdd_outcome WHERE application_id = $1 AND outcome_type = 'risk_rating'`, [applicationId]);
      expect(outcomeRow.rows[0].kyc_roster_hash).toBeNull();
    });

    it("cdd_outcome.kyc_roster_hash is NOT updateable by role_clt1_runtime — immutable historical evidence", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const hash = await currentRosterHash(applicationId);
      await receiveOutcome(applicationId, "kyc_kyb", "pass", hash);

      const client = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      await expect(client.query(`UPDATE clt1.cdd_outcome SET kyc_roster_hash = 'sha256:${"1".repeat(64)}' WHERE application_id = $1`, [applicationId])).rejects.toMatchObject({
        code: "42501",
      });
      await client.end();
    });

    it("client_application.kyc_roster_hash IS updateable by role_clt1_runtime (needed for the receipt/approval-gate write path)", async () => {
      if (!schemaReady) return;
      const perms = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.role_column_grants
          WHERE grantee = 'role_clt1_runtime' AND table_schema = 'clt1' AND table_name = 'client_application'
            AND column_name = 'kyc_roster_hash' AND privilege_type = 'UPDATE'`,
      );
      expect(perms.rows[0].n).toBe(1);
    });

    // -------------------------------------------------------------------------------------
    // Atomicity — the confirmed TOCTOU, now closed. Roster mutated via raw SQL (see the
    // describe-block header comment for why: no HTTP route can reach authorised_party pre-approval).
    // -------------------------------------------------------------------------------------
    it("party ADDED between hash-read and receipt -> stale outcome rejected; a fresh receipt against the NEW hash then succeeds", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_toctou_a");
      const staleHash = await currentRosterHash(applicationId);

      await seedParty(applicationId, "clt1ap_toctou_b"); // the race: roster changes mid-window

      const staleRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: staleHash },
      });
      expect(staleRes.statusCode).toBe(409);
      expect(staleRes.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");

      const freshHash = await currentRosterHash(applicationId);
      expect(freshHash).not.toBe(staleHash);
      await receiveOutcome(applicationId, "kyc_kyb", "pass", freshHash);
      expect((await applicationRow(applicationId)).kyc_roster_hash).toBe(freshHash);
    });

    it("party REMOVED (revoked) between hash-read and receipt -> stale outcome rejected", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_toctou_rm");
      const staleHash = await currentRosterHash(applicationId);
      await verifyPool.query(`UPDATE clt1.authorised_party SET authority_status = 'revoked', version = version + 1 WHERE authorised_party_id = 'clt1ap_toctou_rm'`);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: staleHash },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
    });

    it("authority_status change between hash-read and receipt -> stale outcome rejected", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_toctou_st", { authority_status: "pending" });
      const staleHash = await currentRosterHash(applicationId);
      await verifyPool.query(`UPDATE clt1.authorised_party SET authority_status = 'active', version = version + 1 WHERE authorised_party_id = 'clt1ap_toctou_st'`);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: staleHash },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
    });

    it("party_type change between hash-read and receipt -> stale outcome rejected", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_toctou_pt", { party_type: "director" });
      const staleHash = await currentRosterHash(applicationId);
      await verifyPool.query(`UPDATE clt1.authorised_party SET party_type = 'ubo', version = version + 1 WHERE authorised_party_id = 'clt1ap_toctou_pt'`);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: staleHash },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
    });

    it("version-only bump (e.g. a screening receipt) between hash-read and receipt -> stale outcome rejected", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_toctou_ver");
      const staleHash = await currentRosterHash(applicationId);
      await verifyPool.query(`UPDATE clt1.authorised_party SET version = version + 1 WHERE authorised_party_id = 'clt1ap_toctou_ver'`);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: staleHash },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
    });

    // `hold`/`reject`/`start-review` deliberately do NOT acquire the shared roster advisory lock
    // (see routes/decisions.ts's own Phase 4A.1 header comment) — their fail-closed protection
    // against a concurrently in-flight receipt comes from a DIFFERENT, independent mechanism: the
    // receipt's own `UPDATE clt1.client_application ... WHERE application_id = $1 AND
    // status = 'under_review'` predicate, re-evaluated fresh on every receipt attempt. A status
    // flip by ANY path — lock-holding or not — makes that predicate match zero rows, so the
    // receipt fails closed regardless of whether the flipping path held the roster lock. This is
    // proven directly below, not assumed: the status is flipped via raw SQL (bypassing the lock
    // entirely) between the hash read and the receipt, and the receipt is still refused.
    it("application-status change -> the EXISTING fail-closed behaviour is preserved (CLT1_APPLICATION_INVALID_STATE, not a roster code)", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const hash = await currentRosterHash(applicationId);
      await verifyPool.query(`UPDATE clt1.client_application SET status = 'held' WHERE application_id = $1`, [applicationId]);

      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: hash },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CLT1_APPLICATION_INVALID_STATE");
    });

    it("unchanged roster -> accepted", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_stable_1");
      const hash = await currentRosterHash(applicationId);
      // No mutation at all in between.
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: hash },
      });
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
    });

    // -------------------------------------------------------------------------------------
    // Approval window — the SECOND, larger race this phase closes.
    // -------------------------------------------------------------------------------------
    async function approvalGateReadyApplication(): Promise<string> {
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await createHandoff(applicationId, "kyc-kyb");
      await createHandoff(applicationId, "aml");
      const hash = await currentRosterHash(applicationId);
      await receiveOutcome(applicationId, "kyc_kyb", "pass", hash);
      await receiveOutcome(applicationId, "aml_sanctions", "pass");
      await receiveOutcome(applicationId, "pep_adverse_media", "pass");
      await receiveOutcome(applicationId, "risk_rating", "pass");
      return applicationId;
    }

    it("approval REFUSED when the roster changed after a genuine accepted pass — no client_profile created, application NOT approved, refusal audited", async () => {
      if (!schemaReady) return;
      const applicationId = await approvalGateReadyApplication();
      // The second, larger window: mutate the roster AFTER the pass was genuinely accepted.
      await seedParty(applicationId, "clt1ap_postpass_new");

      const { decision_id } = await requestApproval(applicationId, "user_approver_" + Math.random().toString(36).slice(2, 8));
      const applyRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");

      const profiles = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
      expect(profiles.rows[0].n).toBe(0);
      const appRow = await verifyPool.query(`SELECT status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
      expect(appRow.rows[0].status).toBe("under_review");

      const denialAudits = await auditEnvelopes(applicationId, "clt1.application_approval_denied");
      expect(denialAudits.some((a) => a.reason_code === "CLT1_KYC_ROSTER_STALE")).toBe(true);
    });

    it("approval REFUSED when kyc_roster_hash is NULL (no kyc_kyb pass ever accepted under this binding) — never treated as 'no check configured'", async () => {
      if (!schemaReady) return;
      // Directly force the CDD gate open without ever going through the atomic receipt path, to
      // prove the recheck refuses a NULL binding rather than silently allowing it.
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await createHandoff(applicationId, "kyc-kyb");
      await createHandoff(applicationId, "aml");
      await verifyPool.query(
        `UPDATE clt1.client_application SET cdd_outcome_status='pass', aml_sanctions_status='pass', pep_adverse_media_status='pass', risk_rating_status='pass' WHERE application_id = $1`,
        [applicationId],
      );
      expect((await applicationRow(applicationId)).kyc_roster_hash).toBeNull();

      const { decision_id } = await requestApproval(applicationId, "user_approver_" + Math.random().toString(36).slice(2, 8));
      const applyRes = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(applyRes.statusCode).toBe(409);
      expect(applyRes.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
    });

    it("RECOVERY: stale refusal at approval, then a fresh kyc_kyb receipt against the new hash, then approval succeeds only against the NEW stored hash", async () => {
      if (!schemaReady) return;
      const applicationId = await approvalGateReadyApplication();
      await seedParty(applicationId, "clt1ap_recovery_new");

      const firstRequest = await requestApproval(applicationId, "user_approver_" + Math.random().toString(36).slice(2, 8));
      const staleApply = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id: firstRequest.decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(staleApply.statusCode).toBe(409);

      // Fresh receipt against the CURRENT (post-mutation) roster hash.
      const newHash = await currentRosterHash(applicationId);
      await receiveOutcome(applicationId, "kyc_kyb", "pass", newHash);
      expect((await applicationRow(applicationId)).kyc_roster_hash).toBe(newHash);

      const secondRequest = await requestApproval(applicationId, "user_approver_" + Math.random().toString(36).slice(2, 8));
      const finalApply = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
        headers: internalHeaders,
        payload: { decision_id: secondRequest.decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
      });
      expect(finalApply.statusCode, JSON.stringify(finalApply.json())).toBe(200);
      const profiles = await verifyPool.query(`SELECT count(*)::int AS n FROM clt1.client_profile WHERE application_id = $1`, [applicationId]);
      expect(profiles.rows[0].n).toBe(1);
    });

    // -------------------------------------------------------------------------------------
    // Lock discipline.
    // -------------------------------------------------------------------------------------
    // -------------------------------------------------------------------------------------
    // STATIC LOCK-POSITION GUARD.
    //
    // SCOPE, STATED HONESTLY (this replaces an earlier version of this test whose name and
    // comments overclaimed what a text count can prove — see the KYC-01 Phase 4A.1 Opus review,
    // MED-1): this guard verifies, for the CURRENTLY INVENTORIED set of 8 roster-mutating source
    // transactions, that `acquireKycRosterLock(...)` appears — inside that transaction's OWN
    // `withTransaction(...)` block, not merely somewhere in the same file — BEFORE every row lock
    // (`FOR UPDATE`), INSERT, UPDATE, DELETE, and `publishAudit(...)` call in that same block. It
    // does this by extracting each transaction's balanced-brace block starting from a stable,
    // file-unique ownership anchor (a quoted route-path literal, or a uniquely-named function),
    // so a lock call belonging to one transaction can never satisfy another transaction's check.
    //
    // WHAT THIS DOES NOT DO, STATED HONESTLY:
    //   - It does NOT automatically discover a NEW roster-hash-mutating route added in the future.
    //     Adding one requires a human to add its anchor to `TRANSACTION_ANCHORS` below — this is a
    //     maintained inventory, not an inference engine. No static analysis can determine that an
    //     arbitrary new route touches `authorised_party`/`client_application.status` without
    //     understanding the business semantics of what that route does.
    //   - It does NOT prove the lock genuinely blocks a concurrent transaction at runtime — a text
    //     position check cannot observe Postgres lock-wait behaviour. That is what the three
    //     behavioural tests below this one (independent-connection lock-hold + block-then-release,
    //     for outcome receipt, approve/apply, and add/apply) and the concurrent-mutation-vs-receipt
    //     test remain the AUTHORITATIVE proof for — this static guard is a cheap, fast, always-run
    //     complement to them, not a replacement.
    //
    // WHAT THIS DOES PROVE, and did not before: moving `acquireKycRosterLock(...)` to AFTER a row
    // lock or write inside any of the 8 inventoried blocks — the exact regression that would
    // reintroduce deadlock risk and defeat the atomicity guarantee — now FAILS this test. Verified
    // directly: the same extraction/ordering logic below, run against a synthetic block with the
    // lock deliberately placed after a `FOR UPDATE`, fails (see the negative-control assertion at
    // the end of this test).
    //
    // HONEST SCOPE LIMITATION (post-Opus-review CRITICAL-1/CRITICAL-2 remediation — do not over-
    // trust this guard beyond what it actually checks): this guard proves LOCK ORDERING within
    // each inventoried transaction block. It does NOT, and structurally cannot, prove that a
    // transaction re-reads EVERY piece of state its own correctness depends on — that was exactly
    // how the original Phase 4A.2A implementation passed this guard while still containing a real,
    // exploitable application-lifecycle TOCTOU (CRITICAL-1/CRITICAL-2): `acquireKycRosterLock` was
    // correctly first, but no `client_application` row lock existed anywhere in the block for this
    // guard to find, so there was nothing for it to flag. Transaction-local LIFECYCLE safety
    // (proving that no mutation can commit after its application becomes ineligible) is proven
    // instead by the deterministic behavioural race tests in the "Phase 4A.2A" describe block
    // below (reject-wins, hold-wins, and both approval-ordering tests), which exercise the real
    // HTTP routes against a real, adversarially-raced database — never by this static guard alone.
    // A future shared mutation function must be added to BOTH this guard's `TRANSACTION_ANCHORS`
    // inventory below AND to that behavioural test suite; neither one alone is a substitute for
    // the other.
    // -------------------------------------------------------------------------------------

    /** Returns the source text of the balanced-brace block starting at `openBraceIndex` (which
     * must point at the block's own opening `{`). Skips `//` line comments, `/* *\/` block
     * comments, single/double-quoted strings, and template literals when counting braces — a
     * naive counter desyncs on the first apostrophe inside a prose comment (e.g. "routes' own
     * header comment"), which is common in this codebase's own commenting style. Deliberately not
     * a general-purpose parser (no new dependency) — sufficient for this file's real TypeScript,
     * not for arbitrary input. */
    function balancedBlockFrom(src: string, openBraceIndex: number): string {
      let depth = 0;
      let inTemplate = false;
      let inString: '"' | "'" | null = null;
      let inLineComment = false;
      let inBlockComment = false;
      let escaped = false;
      for (let i = openBraceIndex; i < src.length; i += 1) {
        const c = src[i];
        const c2 = src[i + 1];
        if (inLineComment) {
          if (c === "\n") inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (c === "*" && c2 === "/") {
            inBlockComment = false;
            i += 1;
          }
          continue;
        }
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (inString) {
          if (c === inString) inString = null;
          continue;
        }
        if (inTemplate) {
          if (c === "`") inTemplate = false;
          continue;
        }
        if (c === "/" && c2 === "/") {
          inLineComment = true;
          i += 1;
          continue;
        }
        if (c === "/" && c2 === "*") {
          inBlockComment = true;
          i += 1;
          continue;
        }
        if (c === '"' || c === "'") {
          inString = c;
          continue;
        }
        if (c === "`") {
          inTemplate = true;
          continue;
        }
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) return src.slice(openBraceIndex, i + 1);
        }
      }
      throw new Error(`unbalanced block starting at index ${openBraceIndex}`);
    }

    /** Finds `anchor` (a file-unique ownership marker — a quoted route-path literal or a uniquely
     * named function declaration), then extracts the block of the NEXT `withTransaction(async
     * (...) => { ... })` call after it — specifically requiring the `async` keyword and an
     * explicit `{` block body, which is what distinguishes each route's REAL mutating transaction
     * from the earlier, textually-preceding `recordFailureAudit()` helper's bare
     * `withTransaction((txClient) => publishAudit(...))` (no `async`, no block body, a single
     * expression) — without this distinction, "the next withTransaction after the anchor" would
     * wrongly match the audit-only helper instead of the real transaction. */
    function extractOwnTransactionBlock(src: string, anchor: string): string {
      const anchorIndex = src.indexOf(anchor);
      if (anchorIndex === -1) throw new Error(`ownership anchor not found: ${anchor}`);
      const after = src.slice(anchorIndex);
      const match = /withTransaction\(async \([a-zA-Z]+\) => \{/.exec(after);
      if (!match) throw new Error(`no withTransaction(async (...) => { found after anchor: ${anchor}`);
      const openBraceIndex = anchorIndex + match.index + match[0].length - 1;
      return balancedBlockFrom(src, openBraceIndex);
    }

    /** Within one transaction's own block, asserts `acquireKycRosterLock(` is present and precedes
     * every row-lock/mutation/audit marker that IS present in that block ("if any" — not every
     * transaction contains every marker, e.g. outcomes.ts's receipt has no `FOR UPDATE`). */
    function assertLockPrecedesAllMutations(block: string, label: string): void {
      const lockIndex = block.indexOf("acquireKycRosterLock(");
      expect(lockIndex, `${label}: acquireKycRosterLock(...) not found in its own transaction block`).toBeGreaterThan(-1);
      for (const marker of ["FOR UPDATE", "INSERT INTO clt1.", "UPDATE clt1.", "DELETE FROM clt1.", "publishAudit("]) {
        const markerIndex = block.indexOf(marker);
        if (markerIndex === -1) continue;
        expect(markerIndex, `${label}: '${marker}' (index ${markerIndex}) appears BEFORE acquireKycRosterLock(...) (index ${lockIndex})`).toBeGreaterThan(lockIndex);
      }
    }

    // File-unique ownership anchors for all 8 CURRENTLY-INVENTORIED SOURCE CALL SITES (Phase
    // 4A.2A): 4 live in the shared service layer (lib/authorised-party-service.ts) — each reached
    // by TWO runtime paths (the client-keyed route AND the application-keyed route both call the
    // SAME function, never a duplicated second implementation) — and 4 remain unchanged in
    // routes/authorised-parties.ts (activate/apply and registerSingleStepTransition were NOT
    // touched by the Phase 4A.2A refactor; restrict/reject/suspend has no application-keyed
    // counterpart at all — Phase 4A.2A's own scope deliberately excludes pre-approval
    // activation). Each anchor's uniqueness and correct block-resolution were verified directly
    // against the real source before this test was written, not assumed.
    const TRANSACTION_ANCHORS: Array<{ label: string; file: string; anchor: string }> = [
      { label: "authorised-party-service applyPartyAdd (shared: client-keyed + application-keyed add/apply)", file: "authorised-party-service.ts", anchor: "export async function applyPartyAdd(" },
      { label: "authorised-party-service applyPartyUpdate (shared: client-keyed + application-keyed update/apply)", file: "authorised-party-service.ts", anchor: "export async function applyPartyUpdate(" },
      { label: "authorised-party-service applyPartyRemoval (shared: client-keyed + application-keyed remove/apply)", file: "authorised-party-service.ts", anchor: "export async function applyPartyRemoval(" },
      { label: "authorised-party-service recordPartyScreeningOutcome (shared: client-keyed + application-keyed screening-outcome)", file: "authorised-party-service.ts", anchor: "export async function recordPartyScreeningOutcome(" },
      { label: "authorised-parties activate/apply (client-keyed only, unchanged)", file: "authorised-parties.ts", anchor: '"/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/apply"' },
      { label: "authorised-parties restrict/reject/suspend (shared function, client-keyed only, unchanged)", file: "authorised-parties.ts", anchor: "function registerSingleStepTransition(" },
      { label: "outcomes kyc_kyb (and every other outcome_type) receipt", file: "outcomes.ts", anchor: '"/internal/clt1/applications/:application_id/outcomes"' },
      { label: "decisions approve/apply", file: "decisions.ts", anchor: '"/internal/clt1/applications/:application_id/approve/apply"' },
    ];

    it("LOCK-POSITION GUARD: for every currently-inventoried roster-mutating transaction, acquireKycRosterLock is the first row-lock/mutation/audit statement in its OWN transaction block", async () => {
      if (!schemaReady) return;
      const sourceByFile: Record<string, string> = {
        "authorised-parties.ts": readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "authorised-parties.ts"), "utf8"),
        "application-authorised-parties.ts": readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "application-authorised-parties.ts"), "utf8"),
        "authorised-party-service.ts": readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "lib", "authorised-party-service.ts"), "utf8"),
        "outcomes.ts": readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "outcomes.ts"), "utf8"),
        "decisions.ts": readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "decisions.ts"), "utf8"),
      };

      for (const { label, file, anchor } of TRANSACTION_ANCHORS) {
        const block = extractOwnTransactionBlock(sourceByFile[file]!, anchor);
        assertLockPrecedesAllMutations(block, `${file} :: ${label}`);
      }

      // SUPPLEMENTAL (optional, per the CRITICAL-1/CRITICAL-2 remediation) — position check for
      // `lockAndAssertApplicationLifecycle(` in the 4 shared mutation functions specifically:
      // must appear after `acquireKycRosterLock(` and before the first business write
      // (`INSERT INTO clt1.authorised_party`/`UPDATE clt1.authorised_party`) and before
      // `publishAudit(`. This is supplemental only — it can confirm the call is textually present
      // in the right position, but (like the guard above) cannot prove the check is semantically
      // sufficient; the deterministic behavioural race tests remain authoritative for that.
      const serviceSrc = sourceByFile["authorised-party-service.ts"]!;
      for (const fnAnchor of [
        "export async function applyPartyAdd(",
        "export async function applyPartyUpdate(",
        "export async function applyPartyRemoval(",
        "export async function recordPartyScreeningOutcome(",
      ]) {
        const block = extractOwnTransactionBlock(serviceSrc, fnAnchor);
        const lockIdx = block.indexOf("acquireKycRosterLock(");
        const lifecycleIdx = block.indexOf("lockAndAssertApplicationLifecycle(");
        expect(lifecycleIdx, `${fnAnchor}: lockAndAssertApplicationLifecycle(...) not found in its own transaction block`).toBeGreaterThan(-1);
        expect(lifecycleIdx, `${fnAnchor}: lockAndAssertApplicationLifecycle(...) must appear AFTER acquireKycRosterLock(...)`).toBeGreaterThan(lockIdx);
        for (const writeMarker of ["INSERT INTO clt1.authorised_party", "UPDATE clt1.authorised_party SET", "publishAudit("]) {
          const writeIdx = block.indexOf(writeMarker);
          if (writeIdx === -1) continue;
          expect(writeIdx, `${fnAnchor}: '${writeMarker}' appears BEFORE lockAndAssertApplicationLifecycle(...)`).toBeGreaterThan(lifecycleIdx);
        }
      }

      // Coarse total-count sanity check — a secondary signal, NOT the primary proof (the
      // per-transaction assertions above are). Existing to catch an accidental duplicate/removed
      // call that the per-transaction checks, which only look for AT LEAST one lock call each,
      // would not by themselves flag. Phase 4A.2A moved 4 calls out of authorised-parties.ts
      // (add/update/remove-apply + screening-outcome) into authorised-party-service.ts — the
      // SOURCE call-site total stays at 8 (unchanged), it did not double.
      const countCalls = (src: string) => (src.match(/acquireKycRosterLock\(/g) ?? []).length;
      expect(countCalls(sourceByFile["authorised-parties.ts"]!)).toBe(2);
      expect(countCalls(sourceByFile["authorised-party-service.ts"]!)).toBe(4);
      expect(countCalls(sourceByFile["application-authorised-parties.ts"]!)).toBe(0); // calls the shared functions, holds no lock itself
      expect(countCalls(sourceByFile["outcomes.ts"]!)).toBe(1);
      expect(countCalls(sourceByFile["decisions.ts"]!)).toBe(1);
      expect(
        countCalls(sourceByFile["authorised-parties.ts"]!) +
          countCalls(sourceByFile["authorised-party-service.ts"]!) +
          countCalls(sourceByFile["application-authorised-parties.ts"]!) +
          countCalls(sourceByFile["outcomes.ts"]!) +
          countCalls(sourceByFile["decisions.ts"]!),
      ).toBe(8);

      // The */request functions (staging-table-only INSERTs into `authorised_party_decision_
      // request`, never touch `authorised_party` itself) must NOT hold the lock. `activate/
      // request` is unchanged in routes/authorised-parties.ts and still checked the original way;
      // requestPartyAdd/requestPartyUpdate/requestPartyRemoval now live in the shared service
      // layer (called identically by both route families) and are checked there instead — the
      // client-keyed and application-keyed */request ROUTES themselves no longer own any
      // transaction block at all post-refactor (they just call these shared functions and
      // return), so anchoring on the route path there would silently check the wrong block.
      const requestBlockNoLock = extractOwnTransactionBlock(sourceByFile["authorised-parties.ts"]!, '"/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/request"');
      expect(requestBlockNoLock, "activate/request unexpectedly holds the roster lock").not.toContain("acquireKycRosterLock(");
      for (const fnAnchor of ["export async function requestPartyAdd(", "export async function requestPartyUpdate(", "export async function requestPartyRemoval("]) {
        const block = extractOwnTransactionBlock(sourceByFile["authorised-party-service.ts"]!, fnAnchor);
        expect(block, `${fnAnchor} unexpectedly holds the roster lock`).not.toContain("acquireKycRosterLock(");
      }

      // SHARED-NOT-DUPLICATED PROOF: every one of the 8 shared service functions (request-side,
      // apply-side, screening, and list) is called exactly once from the client-keyed route file
      // and exactly once from the application-keyed route file — empirical proof of "only one
      // implementation, reached by two route families" (not a second, silently-diverging copy).
      // Only the 4 apply/screening functions actually hold the lock (see the runtime-path
      // inventory test below) — this proof covers the full shared surface, lock-holding or not.
      const callCount = (src: string, fnName: string) => (src.match(new RegExp(`\\b${fnName}\\(`, "g")) ?? []).length;
      for (const fn of ["requestPartyAdd", "applyPartyAdd", "requestPartyUpdate", "applyPartyUpdate", "requestPartyRemoval", "applyPartyRemoval", "recordPartyScreeningOutcome", "listAuthorisedPartiesForApplication"]) {
        const clientKeyedCalls = callCount(sourceByFile["authorised-parties.ts"]!, fn);
        const applicationKeyedCalls = callCount(sourceByFile["application-authorised-parties.ts"]!, fn);
        expect(clientKeyedCalls, `${fn} should be called exactly once from the client-keyed route file`).toBe(1);
        expect(applicationKeyedCalls, `${fn} should be called exactly once from the application-keyed route file`).toBe(1);
      }

      // NEGATIVE CONTROL — proves this guard has teeth, not just that the current code happens to
      // pass it. A synthetic block with the lock deliberately placed AFTER a FOR UPDATE (the exact
      // regression class this guard exists to catch) must FAIL assertLockPrecedesAllMutations.
      const deliberatelyBrokenBlock = [
        "{",
        "  const lockedDecision = await txClient.query(`SELECT status FROM clt1.x WHERE y = $1 FOR UPDATE`, [1]);",
        "  await acquireKycRosterLock(txClient, applicationId);",
        "  await txClient.query(`INSERT INTO clt1.foo (a) VALUES ($1)`, [1]);",
        "}",
      ].join("\n");
      expect(() => assertLockPrecedesAllMutations(deliberatelyBrokenBlock, "negative-control")).toThrow();
    });

    it("LOCK-GUARD INVENTORY (Phase 4A.2A): derives exact source call-site and runtime-path counts from the real source, not the planning report's estimate", async () => {
      if (!schemaReady) return;
      const authorisedPartiesSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "authorised-parties.ts"), "utf8");
      const applicationAuthorisedPartiesSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "application-authorised-parties.ts"), "utf8");
      const serviceSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "lib", "authorised-party-service.ts"), "utf8");
      const outcomesSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "outcomes.ts"), "utf8");
      const decisionsSrc = readFileSync(join(__dirname, "..", "..", "services", "clt1", "src", "routes", "decisions.ts"), "utf8");

      const lockCallCount = (src: string) => (src.match(/acquireKycRosterLock\(/g) ?? []).length;
      const sourceCallSites = lockCallCount(authorisedPartiesSrc) + lockCallCount(applicationAuthorisedPartiesSrc) + lockCallCount(serviceSrc) + lockCallCount(outcomesSrc) + lockCallCount(decisionsSrc);
      expect(sourceCallSites, "total source call sites must not double from Phase 4A.1's own 8").toBe(8);

      // registerSingleStepTransition is DECLARED once and INVOKED 3 times (restrict/reject/
      // suspend) at the bottom of the file — total textual occurrences of the name = 4.
      const registerSingleStepOccurrences = (authorisedPartiesSrc.match(/registerSingleStepTransition\(/g) ?? []).length;
      expect(registerSingleStepOccurrences, "registerSingleStepTransition should be declared once and invoked 3 times").toBe(4);
      const restrictRejectSuspendPaths = registerSingleStepOccurrences - 1;

      // The 4 lock-holding shared functions each verified above to be called exactly once from
      // BOTH route families -> exactly 2 runtime paths each (client-keyed + application-keyed).
      const sharedLockHoldingFunctions = ["applyPartyAdd", "applyPartyUpdate", "applyPartyRemoval", "recordPartyScreeningOutcome"];
      const sharedRuntimePaths = sharedLockHoldingFunctions.length * 2;
      // activate/apply has no application-keyed counterpart (Phase 4A.2A scope exclusion) — 1
      // client-keyed-only path, unchanged in authorised-parties.ts.
      const activateApplyPaths = 1;
      // outcomes.ts kyc_kyb receipt + decisions.ts approve/apply — unaffected by this phase.
      const otherModulePaths = lockCallCount(outcomesSrc) + lockCallCount(decisionsSrc);

      const totalRuntimePaths = sharedRuntimePaths + restrictRejectSuspendPaths + activateApplyPaths + otherModulePaths;
      const clientKeyedRuntimePaths = sharedLockHoldingFunctions.length + restrictRejectSuspendPaths + activateApplyPaths; // 4 + 3 + 1 = 8, unchanged from Phase 4A.1
      const applicationKeyedRuntimePaths = sharedLockHoldingFunctions.length; // 4, new this phase

      expect(sourceCallSites).toBe(8);
      expect(clientKeyedRuntimePaths, "client-keyed runtime paths must remain exactly 8, unchanged from Phase 4A.1").toBe(8);
      expect(applicationKeyedRuntimePaths, "application-keyed runtime paths — new this phase").toBe(4);
      expect(totalRuntimePaths, "total runtime paths increased from Phase 4A.1's 10 because both route families call the same shared functions").toBe(14);
    });

    it("OUTCOME RECEIPT genuinely blocks on the SAME advisory lock held by an independent connection", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      const hash = await currentRosterHash(applicationId);

      const holder = await verifyPool.connect();
      await holder.query("BEGIN");
      await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);

      let receiptSettled = false;
      const receiptPromise = app
        .inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
          headers: internalHeaders,
          payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: hash },
        })
        .then((res) => {
          receiptSettled = true;
          return res;
        });

      await new Promise((r) => setTimeout(r, 300));
      expect(receiptSettled, "outcome receipt completed WITHOUT waiting for the held advisory lock").toBe(false);

      await holder.query("COMMIT");
      holder.release();
      const res = await receiptPromise;
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
    });

    it("APPROVE/APPLY genuinely blocks on the SAME advisory lock held by an independent connection", async () => {
      if (!schemaReady) return;
      const applicationId = await approvalGateReadyApplication();
      const { decision_id } = await requestApproval(applicationId, "user_approver_" + Math.random().toString(36).slice(2, 8));

      const holder = await verifyPool.connect();
      await holder.query("BEGIN");
      await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);

      let applySettled = false;
      const applyPromise = app
        .inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/approve/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_" + Math.random().toString(36).slice(2, 8) },
        })
        .then((res) => {
          applySettled = true;
          return res;
        });

      await new Promise((r) => setTimeout(r, 300));
      expect(applySettled, "approve/apply completed WITHOUT waiting for the held advisory lock").toBe(false);

      await holder.query("COMMIT");
      holder.release();
      const res = await applyPromise;
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    it("a real roster-mutating transaction (add/apply) genuinely blocks on the SAME advisory lock", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const requestRes = await app.inject({
        method: "POST",
        url: `${AP_URL(clientId)}/add/request`,
        headers: internalHeaders,
        payload: { party_type: "director", party_reference: "lock-probe@example.com", requested_by: "staff_1" },
      });
      const { decision_id } = requestRes.json().data;
      const clientRow = await verifyPool.query(`SELECT application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      const applicationId = clientRow.rows[0].application_id as string;

      const holder = await verifyPool.connect();
      await holder.query("BEGIN");
      await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);

      let applySettled = false;
      const applyPromise = app
        .inject({
          method: "POST",
          url: `${AP_URL(clientId)}/add/apply`,
          headers: internalHeaders,
          payload: { decision_id, approval_id: "iam2appr_lockprobe_" + Math.random().toString(36).slice(2, 8), decision_token: "tok_lockprobe_" + Math.random().toString(36).slice(2, 8) },
        })
        .then((res) => {
          applySettled = true;
          return res;
        });

      await new Promise((r) => setTimeout(r, 300));
      expect(applySettled, "authorised-party add/apply completed WITHOUT waiting for the held advisory lock").toBe(false);

      await holder.query("COMMIT");
      holder.release();
      const res = await applyPromise;
      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    });

    // -------------------------------------------------------------------------------------
    // Concurrency / deadlock.
    // -------------------------------------------------------------------------------------
    it("genuinely concurrent roster mutation + outcome receipt on the SAME application serialize deterministically — no deadlock, no 40P01", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_concurrent_1");
      const hash = await currentRosterHash(applicationId);

      const mutator = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      const mutate = async () => {
        const c = await mutator.connect();
        try {
          await c.query("BEGIN");
          await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`clt1.kyc_roster:${applicationId}`]);
          await c.query(`INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
                         VALUES ('clt1ap_concurrent_2',$1,'ubo','Concurrent Party','pending','probe')`, [applicationId]);
          await new Promise((r) => setTimeout(r, 150));
          await c.query("COMMIT");
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      };
      const receipt = () =>
        app.inject({
          method: "POST",
          url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
          headers: internalHeaders,
          payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: hash },
        });

      const [, receiptRes] = await Promise.all([mutate(), receipt()]);
      await mutator.end();

      // Deterministic: whichever wins the lock first, the OTHER sees a consistent, non-corrupted
      // outcome — either the receipt is accepted against the pre-mutation hash (mutator lost the
      // race) or refused as stale (mutator won) — never a partial/undefined state, never a raw
      // Postgres deadlock error surfacing to the caller.
      expect([201, 409]).toContain(receiptRes.statusCode);
      if (receiptRes.statusCode === 409) {
        expect(receiptRes.json().error.code).toBe("CLT1_KYC_ROSTER_STALE");
      }
    });

    // -------------------------------------------------------------------------------------
    // Security.
    // -------------------------------------------------------------------------------------
    it("no PII, party ID, or secret appears in the stale-refusal error response or its audit metadata", async () => {
      if (!schemaReady) return;
      const created = await progressToUnderReview();
      const applicationId = created.application_id as string;
      await seedParty(applicationId, "clt1ap_pii_sweep_1", { party_type: "ubo" });
      const res = await app.inject({
        method: "POST",
        url: `${APPLICATIONS_URL}/${applicationId}/outcomes`,
        headers: internalHeaders,
        payload: { outcome_type: "kyc_kyb", outcome_status: "pass", source_module: "TEST", created_by: "test_fixture", expected_roster_hash: FAKE_MISMATCHED_HASH },
      });
      expect(res.statusCode).toBe(409);
      const body = JSON.stringify(res.json());
      const refusalAudits = await auditEnvelopes(applicationId, "clt1.kyc_outcome_refused");
      const auditBody = JSON.stringify(refusalAudits);
      for (const forbidden of ["clt1ap_pii_sweep_1", "Seed Person", "party_reference", internalHeaders["x-internal-service-token"]]) {
        expect(body, `error response leaked: ${forbidden}`).not.toContain(forbidden);
        expect(auditBody, `audit leaked: ${forbidden}`).not.toContain(forbidden);
      }
    });

    // -------------------------------------------------------------------------------------
    // Scope / drift.
    // -------------------------------------------------------------------------------------
    it("SCOPE: no new route was added — the route tree is unchanged from Phase 4A", async () => {
      if (!schemaReady) return;
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(routePaths.filter((p) => p.toLowerCase().includes("exchange"))).toEqual([]);
      expect((app.printRoutes({ commonPrefix: false }).match(/kyc-roster/g) ?? []).length).toBe(1);
    });

    it("SCOPE: migration 047 (this phase's own) is present and untouched by KYC-01 Phase 4B; 048 exists as a LATER, KYC-01-owned migration; 049 exists as a LATER, WLT-01-owned migration", async () => {
      if (!schemaReady) return;
      const files = readdirSync(join(__dirname, "..", "..", "infra", "migrations"));
      expect(files.some((f) => f.startsWith("047_clt1_atomic_kyc_roster_binding"))).toBe(true);
      // Phase 4B (KYC-01) added 048_kyc1_publication_roster_binding — a KYC-01-owned migration
      // that only touches kyc1.outcome_publication, never clt1.*. WLT-01 Phase 1B later added
      // 049_wlt1_core — a WLT-01-owned migration that only touches the new wlt1 schema, never
      // clt1.*. This CLT-01 file only asserts CLT-01's own migration (047) is unmodified and
      // still present; it does not assert what the LATEST migration head is, since that changes
      // as later, unrelated modules claim new numbers.
      expect(files.some((f) => f.startsWith("048_kyc1_publication_roster_binding"))).toBe(true);
      expect(files.some((f) => f.startsWith("049_wlt1_core"))).toBe(true);
    });

    it("SCOPE: no clt1 IAM-02 permission was added for this phase, and no role_permission seed exists", async () => {
      if (!schemaReady) return;
      const perms = await verifyPool.query(`SELECT count(*)::int AS n FROM iam2.permission WHERE permission_code LIKE 'clt1.%'`);
      expect(perms.rows[0].n).toBe(33);
      // M-1: scoped via countUnauthorizedCltRolePermissionBindings() (see its own header comment).
      expect(await countUnauthorizedCltRolePermissionBindings()).toBe(0);
    });

    it("SCOPE: no DELETE/TRUNCATE grant anywhere in clt1, no cross-schema grant beyond foundation.outbox_event", async () => {
      if (!schemaReady) return;
      const bad = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
          WHERE grantee = 'role_clt1_runtime' AND table_schema = 'clt1' AND privilege_type IN ('DELETE','TRUNCATE')`,
      );
      expect(bad.rows[0].n).toBe(0);
      const xschema = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.role_table_grants
          WHERE grantee = 'role_clt1_runtime' AND table_schema IN ('iam','iam2','sec1','cfg1')`,
      );
      expect(xschema.rows[0].n).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  // P-ROSTER — GET /internal/clt1/clients/:client_id/authorised-parties/active-refs
  // WLT-01 Phase 4A prerequisite: a machine-to-machine reference seam, no actor_id, no IAM-02.
  // -----------------------------------------------------------------------------------------
  describe("P-ROSTER — GET /internal/clt1/clients/:client_id/authorised-parties/active-refs", () => {
    const ACTIVE_REFS_URL = (clientId: string) => `${AP_URL(clientId)}/active-refs`;

    async function applicationIdForClient(clientId: string): Promise<string> {
      const rows = await verifyPool.query(`SELECT application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
      return rows.rows[0].application_id as string;
    }

    async function seedActiveRefParty(applicationId: string, authorisedPartyId: string, authorityStatus: string): Promise<void> {
      await verifyPool.query(
        `INSERT INTO clt1.authorised_party (authorised_party_id, application_id, party_type, party_reference, authority_status, requested_by)
         VALUES ($1,$2,'director',$3,$4,'staff_proster_seed')`,
        [authorisedPartyId, applicationId, "P-ROSTER Seed " + authorisedPartyId, authorityStatus],
      );
    }

    it("missing internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId) });
      expect(res.statusCode).toBe(401);
    });

    it("invalid internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: { "x-internal-service-token": "wrong-token" } });
      expect(res.statusCode).toBe(401);
    });

    it("valid internal-service token passes authentication and no actor_id is required (schema carries no actor_id field)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ client_id: clientId, authorised_party_refs: [] });
    });

    it("no IAM-02 permission check is made — succeeds even when the IAM-02 stub is unreachable (would fail closed if checkPermission were ever called)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      await seedActiveRefParty(applicationId, "ap_prosterauth_" + Math.random().toString(36).slice(2, 8), "active");

      config.iam2FetchImpl = iam2Unreachable();
      try {
        const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.authorised_party_refs).toHaveLength(1);
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });

    it("known client with one active authorised party -> returns that authorised_party_id", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      const authorisedPartyId = "ap_prosterone_" + Math.random().toString(36).slice(2, 8);
      await seedActiveRefParty(applicationId, authorisedPartyId, "active");

      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.authorised_party_refs).toEqual([authorisedPartyId]);
    });

    it("known client with multiple active authorised parties -> returns all active references", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      const idA = "ap_prostermulti_a_" + Math.random().toString(36).slice(2, 8);
      const idB = "ap_prostermulti_b_" + Math.random().toString(36).slice(2, 8);
      await seedActiveRefParty(applicationId, idA, "active");
      await seedActiveRefParty(applicationId, idB, "active");

      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(new Set(res.json().data.authorised_party_refs)).toEqual(new Set([idA, idB]));
    });

    it("non-active authorised parties (pending/restricted/rejected/revoked/suspended) are excluded", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      const activeId = "ap_prosterincl_active_" + Math.random().toString(36).slice(2, 8);
      await seedActiveRefParty(applicationId, activeId, "active");
      for (const status of ["pending", "restricted", "rejected", "revoked", "suspended"]) {
        await seedActiveRefParty(applicationId, `ap_prosterexcl_${status}_` + Math.random().toString(36).slice(2, 8), status);
      }

      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.authorised_party_refs).toEqual([activeId]);
    });

    it("known client with zero active authorised parties -> 200 + []", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ client_id: clientId, authorised_party_refs: [] });
    });

    it("unknown client -> 404 CLT1_CLIENT_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL("clt1client_never_existed"), headers: internalHeaders });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("CLT1_CLIENT_NOT_FOUND");
    });

    it("client A's request never returns client B's authorised-party refs (cross-client isolation)", async () => {
      if (!schemaReady) return;
      const clientA = await createActiveClient();
      const clientB = await createActiveClient();
      const appA = await applicationIdForClient(clientA);
      const appB = await applicationIdForClient(clientB);
      const idA = "ap_prosteriso_a_" + Math.random().toString(36).slice(2, 8);
      const idB = "ap_prosteriso_b_" + Math.random().toString(36).slice(2, 8);
      await seedActiveRefParty(appA, idA, "active");
      await seedActiveRefParty(appB, idB, "active");

      const resA = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientA), headers: internalHeaders });
      expect(resA.json().data.authorised_party_refs).toEqual([idA]);
      expect(resA.json().data.authorised_party_refs).not.toContain(idB);
    });

    it("response contains ONLY client_id and authorised_party_refs — no PII-rich fields (party_type, party_reference, ownership_percentage, etc. all absent)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      await seedActiveRefParty(applicationId, "ap_prosterpii_" + Math.random().toString(36).slice(2, 8), "active");

      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      const data = res.json().data as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(["authorised_party_refs", "client_id"]);
      const serialized = JSON.stringify(data);
      for (const forbidden of ["party_type", "party_reference", "ownership_percentage", "identity_verification_status", "sanctions_pep_status", "P-ROSTER Seed"]) {
        expect(serialized.includes(forbidden), `response must not contain "${forbidden}"`).toBe(false);
      }
    });

    it("AML compatibility: the returned reference is the exact authorised_party_id that AML-01 stores as screening_request.subject_ref (identifier round-trip, no transformation)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();
      const applicationId = await applicationIdForClient(clientId);
      const authorisedPartyId = "ap_prosteraml_" + Math.random().toString(36).slice(2, 8);
      await seedActiveRefParty(applicationId, authorisedPartyId, "active");

      const res = await app.inject({ method: "GET", url: ACTIVE_REFS_URL(clientId), headers: internalHeaders });
      const [ref] = res.json().data.authorised_party_refs as string[];
      // Byte-identical to the primary key AML-01's own accepted subject_ref/subject_parent_ref
      // binding (aml1.screening_request, subject_type='authorised_party') is built from — no
      // prefix, suffix, casing, or encoding transformation is ever applied by this route.
      expect(ref).toBe(authorisedPartyId);
    });

    it("BOUNDARY: the existing human GET .../authorised-parties route still requires actor_id and remains IAM-02-gated (unweakened by this addition)", async () => {
      if (!schemaReady) return;
      const clientId = await createActiveClient();

      const missingActor = await app.inject({ method: "GET", url: AP_URL(clientId), headers: internalHeaders });
      expect(missingActor.statusCode).toBe(400);

      config.iam2FetchImpl = denyPermissionIam2Fetch();
      try {
        const denied = await app.inject({ method: "GET", url: `${AP_URL(clientId)}?actor_id=staff_boundary_check`, headers: internalHeaders });
        expect(denied.statusCode).toBe(403);
        expect(denied.json().error.code).toBe("CLT1_PERMISSION_DENIED");
      } finally {
        config.iam2FetchImpl = allowAllIam2Fetch();
      }
    });
  });
});
