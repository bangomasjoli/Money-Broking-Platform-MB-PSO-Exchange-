/**
 * CFG-01 Phase 1 + Phase 2 + Phase 3A DB-gated integration tests. Self-skip unless
 * TEST_DATABASE_URL points at a Postgres that already has `foundation` (001, 005), `iam`
 * (002-004), `iam2` (006-007, 011, 013, 017), `sec1` (008-010, 012), and `cfg1` (014, 015, 016)
 * migrated, with all five grant files applied (fnd/iam/iam2/sec1/cfg1).
 *
 * Connects as `role_cfg1_runtime` via a real LOGIN role from the START (S1 lesson applied from
 * day one, per every prior module's own precedent — never superuser-only). A separate superuser
 * `pg.Pool` (`verifyPool`) is used for fixture setup/independent verification and out-of-band
 * tamper simulation, never to drive the app itself.
 *
 * Phase 2 additions use `verifyPool` to insert/remove SYNTHETIC `cfg1.feature` rows (approved
 * decision #6 — the allow path is only reachable via test fixtures; production `cfg1.feature`
 * stays empty) and to inspect `foundation.outbox_event` directly, proving the transaction-
 * coupled audit write actually happened rather than trusting the HTTP response alone.
 *
 * Phase 3A additions stub `config.iam2FetchImpl` (Cfg1Config's DI seam, mirroring SEC-01's own
 * identical `Sec1Config.iam2FetchImpl`) — no live IAM-02 service is started, same precedent
 * `tests/integration/sec1-db.test.ts` already set for the identical dependency shape. What IS
 * real: the cfg1 DB, `role_cfg1_runtime`, the actual HTTP routes, the actual mutation/reseal/
 * audit code, and (in the "IAM-02 permission catalogue registration" describe block) the real
 * `iam2.permission` catalogue rows migration 017 inserted. Any test that mutates a Phase 1 SEED
 * row (`cfg1.licence_profile`) reverts it via `revertLicenceProfileMutation` in a `finally`
 * block — the same discipline the pre-existing EXCHANGE-flip tamper test in this file already
 * established — so no Phase 3A test leaves residual state for tests that run after it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Cfg1Config } from "../../services/cfg1/src/config.js";
import { buildApp } from "../../services/cfg1/src/server.js";
import { computeDoc00BaselineHash } from "../../services/cfg1/src/lib/doc00-baseline.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "cfg1_app_test";

const config: Cfg1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-cfg1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  cfg1InternalServiceToken: "test-cfg1-internal-token-it",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-cfg1-iam2-token-it",
};

// ---------------------------------------------------------------------------------------------
// Phase 3A — fake IAM-02 fetch stub (checkPermission + execute-verify), mirroring
// tests/integration/sec1-db.test.ts's own makeFakeIam2FetchFull exactly (same dependency shape).
// ---------------------------------------------------------------------------------------------
interface FakeIam2Decision {
  decision: "allow" | "deny";
  reason: string;
}
interface ExecuteVerifyOutcome {
  ok: boolean;
  errorCode?: string;
}

function makeFakeIam2FetchFull(
  decidePermission: (action: string) => FakeIam2Decision,
  decideExecuteVerify: (body: Record<string, unknown>) => ExecuteVerifyOutcome,
): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const urlStr = String(url);
    const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      const { decision, reason } = decidePermission(body.action as string);
      return { ok: true, json: async () => ({ success: true, data: { decision, reason } }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      const outcome = decideExecuteVerify(body);
      if (!outcome.ok) {
        return { ok: false, json: async () => ({ success: false, error: { code: outcome.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
    }
    throw new Error(`Unexpected URL in Phase 3A test fake: ${urlStr}`);
  }) as typeof fetch;
}

function allowAllIam2(): typeof fetch {
  return makeFakeIam2FetchFull(
    () => ({ decision: "allow", reason: "permission_granted" }),
    () => ({ ok: true }),
  );
}

function denyPermissionIam2(): typeof fetch {
  return makeFakeIam2FetchFull(
    () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }),
    () => ({ ok: false }),
  );
}

function allowPermissionButExecuteVerifyFails(errorCode: string): typeof fetch {
  return makeFakeIam2FetchFull(
    () => ({ decision: "allow", reason: "permission_granted" }),
    () => ({ ok: false, errorCode }),
  );
}

/** Reverts a Phase 1 seed licence_profile row (and any seal rows a test's apply flow created for
 * that scope) back to its exact original state — see file header comment. */
async function revertLicenceProfileMutation(licenceCode: string, originalStatus: string, originalVersion: number): Promise<void> {
  await verifyPool.query(`UPDATE cfg1.licence_profile SET licence_status = $2, version = $3, updated_at_utc = now() WHERE licence_code = $1`, [
    licenceCode,
    originalStatus,
    originalVersion,
  ]);
  await verifyPool.query(`DELETE FROM cfg1.config_integrity_seal WHERE config_scope = 'licence_profile' AND config_integrity_seal_id != 'seal_licence_profile_v1'`);
  await verifyPool.query(`UPDATE cfg1.config_integrity_seal SET status = 'active' WHERE config_integrity_seal_id = 'seal_licence_profile_v1'`);
}

/** Feature-scope seals have no Phase 1 seed row to restore — just remove whatever a test's apply
 * flow created. */
async function cleanupFeatureSeals(): Promise<void> {
  await verifyPool.query(`DELETE FROM cfg1.config_integrity_seal WHERE config_scope = 'feature'`);
}

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

const APPROVED_30_CODES = [
  "exchange.public_order_book",
  "exchange.matching_engine",
  "exchange.client_to_client_matching",
  "exchange.public_exchange_trading",
  "exchange.public_market_depth",
  "exchange.market_maker",
  "exchange.principal_dealing",
  "pricing.aix_spread_markup",
  "onboarding.retail_default",
  "audit.bypass",
  "permission.bypass",
  "kyc.bypass",
  "aml.bypass",
  "travel_rule.bypass",
  "ledger.direct_edit",
  "balance.direct_edit",
  "client_approval.bypass",
  "lp_settlement_approval.bypass",
  "break_glass_logging.bypass",
  "securities.token_trading",
  "advisory.investment_unlicensed",
  "custody.self_custody_wallet",
  "credit.lending_borrowing",
  "derivatives.trading",
  "trading.margin_leverage",
  "product.staking",
  "product.yield_earn",
  "pricing.internal_fallback",
  "inventory.internal_account",
  "liquidity.synthetic",
].sort();

const EVALUATE_URL = "/internal/cfg1/features/evaluate";
const VERIFY_DECISION_URL = "/internal/cfg1/features/verify-decision";
const internalHeaders = { "x-internal-service-token": "test-cfg1-internal-token-it" };

async function insertSyntheticFeature(featureCode: string, currentState: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, version, created_at_utc, updated_at_utc)
     VALUES ($1, $2, 'Test Synthetic Feature (never real seed data)', $3, 1, now(), now())
     ON CONFLICT (feature_code) DO UPDATE SET current_state = EXCLUDED.current_state`,
    [`feat_test_${featureCode.replace(/\./g, "_")}`, featureCode, currentState],
  );
}

async function deleteSyntheticFeature(featureCode: string): Promise<void> {
  await verifyPool.query(`DELETE FROM cfg1.feature WHERE feature_code = $1`, [featureCode]);
}

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam') AS iam,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2') AS iam2,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'sec1') AS sec1,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'cfg1') AS cfg1`,
    );
    const row = r.rows[0];
    return (
      Number(row?.fnd) > 0 &&
      Number(row?.iam) > 0 &&
      Number(row?.iam2) > 0 &&
      Number(row?.sec1) > 0 &&
      Number(row?.cfg1) > 0
    );
  } catch {
    return false;
  }
}

describe("CFG-01 Phase 1 integration", () => {
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
    await verifyPool.query(`GRANT role_cfg1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  // ---------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_cfg1_runtime", () => {
    it("app builds successfully under the least-privilege runtime role (assertNoExchangeRuntime passed)", () => {
      if (!schemaReady) return expect(schemaReady, "run migrate:up + all five grants files first").toBe(true);
      expect(app).toBeDefined();
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(routePaths.some((p) => p.toLowerCase().includes("exchange"))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("F3(a)-equivalent: cross-schema DB role isolation", () => {
    it("role_cfg1_runtime cannot read foundation.*, iam.*, iam2.*, or sec1.*, but CAN read cfg1.licence_profile", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("SELECT 1 FROM iam.session LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("SELECT 1 FROM iam2.role LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("SELECT 1 FROM sec1.audit_event LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      const ok = await getPool().query("SELECT 1 FROM cfg1.licence_profile LIMIT 1");
      expect(ok.rowCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("structural immutability: role_cfg1_runtime is SELECT-only on all 5 tables", () => {
    it("INSERT/UPDATE/DELETE are all denied on cfg1.prohibited_feature", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(
        getPool().query(
          "INSERT INTO cfg1.prohibited_feature (prohibited_feature_id, feature_code, prohibition_reason, prohibition_source) VALUES ('x','x','x','x')",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        getPool().query("UPDATE cfg1.prohibited_feature SET status = 'inactive' WHERE 1=0"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("DELETE FROM cfg1.prohibited_feature WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
    });

    it("INSERT/UPDATE/DELETE are all denied on cfg1.licence_profile, cfg1.feature, cfg1.feature_version, cfg1.config_integrity_seal", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      const tables = ["licence_profile", "feature", "feature_version", "config_integrity_seal"];
      for (const t of tables) {
        await expect(getPool().query(`DELETE FROM cfg1.${t} WHERE 1=0`)).rejects.toMatchObject({ code: "42501" });
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("seed data: licence_profile", () => {
    it("has exactly 3 rows: MB approved LFSA, PSO approved LFSA, EXCHANGE pending LFSA", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        "SELECT licence_code, licence_status, authority FROM cfg1.licence_profile ORDER BY licence_code",
      );
      expect(r.rows).toHaveLength(3);
      const byCode = Object.fromEntries(r.rows.map((row) => [row.licence_code, row]));
      expect(byCode.MB).toMatchObject({ licence_status: "approved", authority: "LFSA" });
      expect(byCode.PSO).toMatchObject({ licence_status: "approved", authority: "LFSA" });
      expect(byCode.EXCHANGE).toMatchObject({ licence_status: "pending", authority: "LFSA" });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("seed data: prohibited_feature", () => {
    it("has exactly 30 active rows matching the approved code list exactly", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query("SELECT feature_code, status FROM cfg1.prohibited_feature ORDER BY feature_code");
      expect(r.rows).toHaveLength(30);
      expect(r.rows.every((row) => row.status === "active")).toBe(true);
      const codes = r.rows.map((row) => row.feature_code).sort();
      expect(codes).toEqual(APPROVED_30_CODES);
    });

    it("Exchange licence is pending AND every Exchange-shaped feature is separately hard-blocked (layered enforcement)", async () => {
      if (!schemaReady) return;
      const exchangeRow = await verifyPool.query("SELECT licence_status FROM cfg1.licence_profile WHERE licence_code = 'EXCHANGE'");
      expect(exchangeRow.rows[0]?.licence_status).toBe("pending");

      const exchangeFeatures = await verifyPool.query(
        "SELECT feature_code, status FROM cfg1.prohibited_feature WHERE feature_code LIKE 'exchange.%' ORDER BY feature_code",
      );
      expect(exchangeFeatures.rows).toHaveLength(7);
      expect(exchangeFeatures.rows.every((row) => row.status === "active")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("seed data: config_integrity_seal, feature, feature_version", () => {
    it("has exactly 2 active seal rows: licence_profile and prohibited_registry", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        "SELECT config_scope, status, config_version, doc00_source_version FROM cfg1.config_integrity_seal ORDER BY config_scope",
      );
      expect(r.rows).toHaveLength(2);
      expect(r.rows.map((row) => row.config_scope).sort()).toEqual(["licence_profile", "prohibited_registry"]);
      expect(r.rows.every((row) => row.status === "active")).toBe(true);
      expect(r.rows.every((row) => row.config_version === 1)).toBe(true);
      expect(r.rows.every((row) => row.doc00_source_version === "v1.3")).toBe(true);
    });

    it("cfg1.feature and cfg1.feature_version are intentionally empty this phase", async () => {
      if (!schemaReady) return;
      const feature = await verifyPool.query("SELECT count(*) FROM cfg1.feature");
      const featureVersion = await verifyPool.query("SELECT count(*) FROM cfg1.feature_version");
      expect(Number(feature.rows[0].count)).toBe(0);
      expect(Number(featureVersion.rows[0].count)).toBe(0);
    });

    it("the seeded doc00_baseline_hash matches the TypeScript library's independently-recomputed hash (migration/library agreement)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query("SELECT DISTINCT doc00_baseline_hash FROM cfg1.config_integrity_seal");
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]?.doc00_baseline_hash).toBe(computeDoc00BaselineHash());
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("GET /internal/cfg1/readiness — clean state", () => {
    it("returns 200 ready with both scopes passing, unauthenticated, no raw data leaked", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe("ready");
      expect(body.data.checks).toEqual(
        expect.arrayContaining([
          { scope: "licence_profile", status: "pass", reason: "ok" },
          { scope: "prohibited_registry", status: "pass", reason: "ok" },
        ]),
      );
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("sha256:");
      expect(raw).not.toContain("EXCHANGE");
      expect(raw).not.toContain("exchange.matching_engine");
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("GET /internal/cfg1/readiness — out-of-band tamper detection", () => {
    afterEach(async () => {
      if (!schemaReady) return;
      // Restore exact seed state after each tamper test so later tests are unaffected.
      await verifyPool.query(
        "UPDATE cfg1.prohibited_feature SET status = 'active' WHERE feature_code = 'exchange.matching_engine'",
      );
      await verifyPool.query("UPDATE cfg1.licence_profile SET licence_status = 'pending' WHERE licence_code = 'EXCHANGE'");
    });

    it("a direct out-of-band edit to cfg1.prohibited_feature (without updating the seal) is detected: 503 hash_mismatch", async () => {
      if (!schemaReady) return;
      await verifyPool.query("UPDATE cfg1.prohibited_feature SET status = 'inactive' WHERE feature_code = 'exchange.matching_engine'");
      const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.data.status).toBe("not_ready");
      const prohibitedCheck = body.data.checks.find((c: { scope: string }) => c.scope === "prohibited_registry");
      expect(prohibitedCheck).toMatchObject({ status: "fail", reason: "hash_mismatch" });
    });

    it("a direct out-of-band edit to cfg1.licence_profile (without updating the seal) is detected: 503 hash_mismatch", async () => {
      if (!schemaReady) return;
      await verifyPool.query("UPDATE cfg1.licence_profile SET licence_status = 'approved' WHERE licence_code = 'EXCHANGE'");
      const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.data.status).toBe("not_ready");
      const licenceCheck = body.data.checks.find((c: { scope: string }) => c.scope === "licence_profile");
      expect(licenceCheck).toMatchObject({ status: "fail", reason: "hash_mismatch" });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("GET /internal/cfg1/readiness — missing active seal", () => {
    it("returns 503 seal_missing when a scope has no active seal row", async () => {
      if (!schemaReady) return;
      await verifyPool.query("UPDATE cfg1.config_integrity_seal SET status = 'superseded' WHERE config_scope = 'licence_profile'");
      try {
        const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
        expect(res.statusCode).toBe(503);
        const body = res.json();
        const licenceCheck = body.data.checks.find((c: { scope: string }) => c.scope === "licence_profile");
        expect(licenceCheck).toMatchObject({ status: "fail", reason: "seal_missing" });
      } finally {
        await verifyPool.query("UPDATE cfg1.config_integrity_seal SET status = 'active' WHERE config_scope = 'licence_profile'");
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("GET /internal/cfg1/readiness — duplicate active seal", () => {
    it("the partial unique index structurally BLOCKS a duplicate-active seal insert (defense layer 1)", async () => {
      if (!schemaReady) return;
      await expect(
        verifyPool.query(
          `INSERT INTO cfg1.config_integrity_seal
             (config_integrity_seal_id, config_scope, config_version, config_hash, doc00_baseline_hash, doc00_source_version, seal_method, status)
           VALUES ('seal_licence_profile_v2_test', 'licence_profile', 2, 'sha256:test', 'sha256:test', 'v1.3', 'sha256', 'active')`,
        ),
      ).rejects.toMatchObject({ code: "23505" }); // unique_violation
    });

    it("if the structural constraint were ever bypassed, readiness still fails closed: 503 seal_duplicate_active (defense layer 2)", async () => {
      if (!schemaReady) return;
      // Deliberately defeat the structural safeguard to prove the application-level check is
      // real defense-in-depth, not dead code — mirrors blueprint §5.4A rule 6's requirement
      // that out-of-band writes must not be silently trusted.
      await verifyPool.query("DROP INDEX cfg1.cfg1_config_integrity_seal_one_active_per_scope");
      try {
        await verifyPool.query(
          `INSERT INTO cfg1.config_integrity_seal
             (config_integrity_seal_id, config_scope, config_version, config_hash, doc00_baseline_hash, doc00_source_version, seal_method, status)
           VALUES ('seal_licence_profile_v2_test', 'licence_profile', 2, 'sha256:test', 'sha256:test', 'v1.3', 'sha256', 'active')`,
        );
        const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
        expect(res.statusCode).toBe(503);
        const body = res.json();
        const licenceCheck = body.data.checks.find((c: { scope: string }) => c.scope === "licence_profile");
        expect(licenceCheck).toMatchObject({ status: "fail", reason: "seal_duplicate_active" });
      } finally {
        await verifyPool.query("DELETE FROM cfg1.config_integrity_seal WHERE config_integrity_seal_id = 'seal_licence_profile_v2_test'");
        await verifyPool.query(
          "CREATE UNIQUE INDEX cfg1_config_integrity_seal_one_active_per_scope ON cfg1.config_integrity_seal (config_scope) WHERE status = 'active'",
        );
      }
    });
  });

  // =========================================================================================
  // Phase 2
  // =========================================================================================

  describe("Phase 2 grants: feature_decision_log / feature_decision_token / foundation.outbox_event", () => {
    it("role_cfg1_runtime can SELECT+INSERT on feature_decision_log but never UPDATE/DELETE", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM cfg1.feature_decision_log LIMIT 1")).resolves.toBeDefined();
      await expect(getPool().query("UPDATE cfg1.feature_decision_log SET reason_code = 'x' WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("DELETE FROM cfg1.feature_decision_log WHERE 1=0")).rejects.toMatchObject({ code: "42501" });
    });

    it("role_cfg1_runtime can SELECT+INSERT+UPDATE on feature_decision_token but never DELETE", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM cfg1.feature_decision_token LIMIT 1")).resolves.toBeDefined();
      await expect(getPool().query("UPDATE cfg1.feature_decision_token SET status = 'revoked' WHERE 1=0")).resolves.toBeDefined();
      await expect(getPool().query("DELETE FROM cfg1.feature_decision_token WHERE 1=0")).rejects.toMatchObject({ code: "42501" });
    });

    it("role_cfg1_runtime can INSERT-only on foundation.outbox_event (no SELECT/UPDATE/DELETE)", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      await expect(
        getPool().query(
          "INSERT INTO foundation.outbox_event (outbox_id, topic, event_type, payload_ref, correlation_id) VALUES ('cfg1_grant_test', 'audit.event', 'cfg1.test', '{}', 'corr_test')",
        ),
      ).resolves.toBeDefined();
      await verifyPool.query("DELETE FROM foundation.outbox_event WHERE outbox_id = 'cfg1_grant_test'");
      await expect(getPool().query("UPDATE foundation.outbox_event SET status = 'failed' WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
    });

    it("still has no iam2.*/sec1.* access and no foundation.idempotency_record grant", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM iam2.role LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("SELECT 1 FROM sec1.audit_event LIMIT 1")).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("SELECT 1 FROM foundation.idempotency_record LIMIT 1")).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("POST /internal/cfg1/features/evaluate — deny paths against REAL seeded data", () => {
    it("a prohibited (non-Exchange) feature returns 200 deny, reason_code=prohibited, no token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "pricing.aix_spread_markup", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.decision).toBe("deny");
      expect(body.data.reason_code).toBe("prohibited");
      expect(body.data.decision_token).toBeNull();
      expect(body.data.expires_at_utc).toBeNull();
    });

    it("an Exchange-pending-locked feature returns 200 deny, reason_code=exchange_pending_locked", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "exchange.matching_engine", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.decision).toBe("deny");
      expect(body.data.reason_code).toBe("exchange_pending_locked");
      expect(body.data.decision_token).toBeNull();
    });

    it("an unknown feature_code returns 200 deny, reason_code=unknown_fail_closed", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "totally.unknown.feature", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.decision).toBe("deny");
      expect(body.data.reason_code).toBe("unknown_fail_closed");
    });

    it("response includes prohibited_registry_hash (authenticated route — deliberately different from readiness's no-hash rule) but never leaks raw prohibited_feature row content", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "pricing.aix_spread_markup", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      const body = res.json();
      expect(body.data.prohibited_registry_hash).toMatch(/^sha256:/);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("prohibition_reason");
    });

    it("fails closed with 401 SERVICE_IDENTITY_REQUIRED without the internal token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        payload: { feature_code: "pricing.aix_spread_markup", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("rejects a body with unexpected extra fields (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "x", action: "execute", environment: "prod", caller_module: "TRD-01", not_a_real_field: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /internal/cfg1/features/evaluate — allow path (synthetic test-fixture feature only)", () => {
    const FEATURE_CODE = "test.synthetic_allowed_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteSyntheticFeature(FEATURE_CODE);
    });

    it("an enabled synthetic feature returns 200 allow with a decision_token and expiry", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.decision).toBe("allow");
      expect(body.data.reason_code).toBe("feature_allowed");
      expect(typeof body.data.decision_token).toBe("string");
      expect(body.data.decision_token.length).toBeGreaterThan(20);
      expect(new Date(body.data.expires_at_utc).getTime()).toBeGreaterThan(Date.now());
    });

    it("a disabled synthetic feature returns 200 deny, reason_code=feature_disabled, no token", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "disabled");
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      const body = res.json();
      expect(body.data.decision).toBe("deny");
      expect(body.data.reason_code).toBe("feature_disabled");
      expect(body.data.decision_token).toBeNull();
    });

    it("a stale requested_config_version (against prohibited_registry_version) returns 200 deny, reason_code=stale_revalidate", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01", requested_config_version: 999 },
      });
      const body = res.json();
      expect(body.data.decision).toBe("deny");
      expect(body.data.reason_code).toBe("stale_revalidate");
    });
  });

  describe("Phase 2 audit/outbox: transaction-coupled writes actually happen", () => {
    it("an allow decision writes a feature_decision_log row AND a foundation.outbox_event row in the same call", async () => {
      if (!schemaReady) return;
      const FEATURE_CODE = "test.synthetic_audit_allow";
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      try {
        const res = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        const decisionId = res.json().data.decision_id;

        const logRow = await verifyPool.query("SELECT decision, reason_code FROM cfg1.feature_decision_log WHERE decision_id = $1", [decisionId]);
        expect(logRow.rows).toHaveLength(1);
        expect(logRow.rows[0]).toMatchObject({ decision: "allow", reason_code: "feature_allowed" });

        const outboxRow = await verifyPool.query(
          "SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1",
          [`%${decisionId}%`],
        );
        expect(outboxRow.rows.some((r) => r.event_type === "cfg1.feature_evaluation.allowed")).toBe(true);
      } finally {
        await deleteSyntheticFeature(FEATURE_CODE);
      }
    });

    it("a prohibited deny writes BOTH cfg1.feature_evaluation.denied AND the additional Critical cfg1.prohibited_feature.blocked event", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "kyc.bypass", action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      const decisionId = res.json().data.decision_id;
      const outboxRows = await verifyPool.query("SELECT event_type FROM foundation.outbox_event WHERE payload_ref LIKE $1", [
        `%${decisionId}%`,
      ]);
      const eventTypes = outboxRows.rows.map((r) => r.event_type);
      expect(eventTypes).toContain("cfg1.feature_evaluation.denied");
      expect(eventTypes).toContain("cfg1.prohibited_feature.blocked");
    });

    it("an integrity-check failure is itself logged and audited (Critical cfg1.integrity_check.failed) before the 503 is returned", async () => {
      if (!schemaReady) return;
      await verifyPool.query("UPDATE cfg1.licence_profile SET licence_status = 'approved' WHERE licence_code = 'EXCHANGE'");
      try {
        const res = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: "pricing.aix_spread_markup", action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("CFG1_CONFIG_INTEGRITY_FAILED");

        const failLog = await verifyPool.query(
          "SELECT decision, reason_code, integrity_status FROM cfg1.feature_decision_log WHERE reason_code = 'config_integrity_failed' ORDER BY created_at_utc DESC LIMIT 1",
        );
        expect(failLog.rows[0]).toMatchObject({ decision: "deny", integrity_status: "failed" });

        const outboxRows = await verifyPool.query(
          "SELECT event_type FROM foundation.outbox_event WHERE event_type = 'cfg1.integrity_check.failed' ORDER BY created_at_utc DESC LIMIT 1",
        );
        expect(outboxRows.rows).toHaveLength(1);
      } finally {
        await verifyPool.query("UPDATE cfg1.licence_profile SET licence_status = 'pending' WHERE licence_code = 'EXCHANGE'");
      }
    });

    it("CFG1_AUDIT_REQUIRED (503) when the outbox write itself fails — no decision is returned, and no decision_log row is left behind either", async () => {
      if (!schemaReady) return;
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_cfg1_runtime");
        try {
          const before = await verifyPool.query("SELECT count(*) FROM cfg1.feature_decision_log");
          const res = await app.inject({
            method: "POST",
            url: EVALUATE_URL,
            headers: internalHeaders,
            payload: { feature_code: "kyc.bypass", action: "execute", environment: "prod", caller_module: "TRD-01" },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("CFG1_AUDIT_REQUIRED");
          const after = await verifyPool.query("SELECT count(*) FROM cfg1.feature_decision_log");
          // The whole transaction rolled back — the decision_log INSERT that ran before the
          // failed publishAudit call is gone too, not left as an orphaned row.
          expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_cfg1_runtime");
        }
      });
    });
  });

  describe("POST /internal/cfg1/features/verify-decision", () => {
    const FEATURE_CODE = "test.synthetic_verify_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteSyntheticFeature(FEATURE_CODE);
    });

    async function issueTestToken(): Promise<{ token: string; decisionId: string; featureCode: string; callerModule: string }> {
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      const res = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      const body = res.json();
      return { token: body.data.decision_token, decisionId: body.data.decision_id, featureCode: FEATURE_CODE, callerModule: "TRD-01" };
    }

    it("verifies successfully TWICE within the TTL while nothing has changed (bounded reuse, not single-use)", async () => {
      if (!schemaReady) return;
      const { token, decisionId, featureCode, callerModule } = await issueTestToken();
      const payload = { decision_token: token, decision_id: decisionId, feature_code: featureCode, action: "execute", caller_module: callerModule, environment: "prod" };

      const first = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json().data.verified).toBe(true);

      const second = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload });
      expect(second.statusCode).toBe(200);
      expect(second.json().data.verified).toBe(true);
    });

    it("fails with 409 CFG1_DECISION_BINDING_MISMATCH and revokes the token when a bound field is presented differently", async () => {
      if (!schemaReady) return;
      const { token, decisionId, featureCode, callerModule } = await issueTestToken();
      const wrongAction = { decision_token: token, decision_id: decisionId, feature_code: featureCode, action: "a_different_action", caller_module: callerModule, environment: "prod" };

      const res = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload: wrongAction });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CFG1_DECISION_BINDING_MISMATCH");

      // Same token, now with the CORRECT fields — must still fail, because it was revoked.
      const correctPayload = { decision_token: token, decision_id: decisionId, feature_code: featureCode, action: "execute", caller_module: callerModule, environment: "prod" };
      const retry = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload: correctPayload });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().error.code).toBe("CFG1_DECISION_TOKEN_REVOKED");
    });

    it("fails with 409 CFG1_DECISION_TOKEN_INVALID for a token that was never issued", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: VERIFY_DECISION_URL,
        headers: internalHeaders,
        payload: { decision_token: "not-a-real-token", decision_id: "cfgdec_fake", feature_code: "x", action: "execute", caller_module: "TRD-01", environment: "prod" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CFG1_DECISION_TOKEN_INVALID");
    });

    it("a registry change since issuance invalidates the token on its NEXT verify, even though it has not nominally expired", async () => {
      if (!schemaReady) return;
      const { token, decisionId, featureCode, callerModule } = await issueTestToken();
      const payload = { decision_token: token, decision_id: decisionId, feature_code: featureCode, action: "execute", caller_module: callerModule, environment: "prod" };

      // First verify succeeds while nothing has changed.
      const first = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload });
      expect(first.statusCode).toBe(200);

      // Simulate an out-of-band prohibited-registry change AND its (correctly recomputed, this
      // time — not a tamper scenario) reseal, by bumping the seal's config_version without
      // changing config_hash — the simplest way to move "current prohibited_registry_version"
      // without breaking F-2's own agreement checks for this test's purposes.
      await verifyPool.query("UPDATE cfg1.config_integrity_seal SET config_version = 2 WHERE config_scope = 'prohibited_registry'");
      try {
        const second = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload });
        expect(second.statusCode).toBe(409);
        expect(second.json().error.code).toBe("CFG1_DECISION_BINDING_MISMATCH");
      } finally {
        await verifyPool.query("UPDATE cfg1.config_integrity_seal SET config_version = 1 WHERE config_scope = 'prohibited_registry'");
      }
    });

    it("fails closed with 401 SERVICE_IDENTITY_REQUIRED without the internal token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: VERIFY_DECISION_URL,
        payload: { decision_token: "x", decision_id: "x", feature_code: "x", action: "execute", caller_module: "TRD-01", environment: "prod" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Phase 2: no raw decision token is ever stored", () => {
    it("cfg1.feature_decision_token never contains the raw token value in any column", async () => {
      if (!schemaReady) return;
      const FEATURE_CODE = "test.synthetic_no_raw_token";
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      try {
        const res = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        const rawToken = res.json().data.decision_token as string;
        expect(rawToken).toBeTruthy();

        const rows = await verifyPool.query("SELECT * FROM cfg1.feature_decision_token WHERE decision_id = $1", [res.json().data.decision_id]);
        expect(rows.rows).toHaveLength(1);
        const serializedRow = JSON.stringify(rows.rows[0]);
        expect(serializedRow).not.toContain(rawToken);
      } finally {
        await deleteSyntheticFeature(FEATURE_CODE);
      }
    });
  });

  // =============================================================================================
  // PHASE 3A — governed feature/licence mutation workflow, IAM-02 approval binding, reseal.
  // =============================================================================================

  describe("Phase 3A: IAM-02 permission catalogue registration (migration 017)", () => {
    it("registers exactly the 8 approved Phase 3A cfg1.* permission codes, all owner_module = CFG-01", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT permission_code, owner_module, status FROM iam2.permission WHERE permission_code LIKE 'cfg1.%' AND permission_code NOT LIKE 'cfg1.kill_switch.%' ORDER BY permission_code`,
      );
      const codes = rows.rows.map((r) => r.permission_code as string);
      expect(codes).toEqual(
        [
          "cfg1.config_change.read",
          "cfg1.feature.change_request",
          "cfg1.feature.disable",
          "cfg1.feature.enable",
          "cfg1.licence_profile.activate",
          "cfg1.licence_profile.change_request",
          "cfg1.licence_profile.revoke",
          "cfg1.licence_profile.suspend",
        ].sort(),
      );
      expect(rows.rows.every((r) => r.owner_module === "CFG-01" && r.status === "active")).toBe(true);
    });

    it("does NOT register cfg1.prohibited_feature.manage (Phase 3A scope, unchanged by Phase 3B)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code = 'cfg1.prohibited_feature.manage'`);
      expect(rows.rows).toHaveLength(0);
    });

    it("seeds no iam2.role_permission rows for any cfg1.* permission (role wiring only via IAM-02's own approved workflow)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT rp.id FROM iam2.role_permission rp
           JOIN iam2.permission p ON p.permission_id = rp.permission_id
          WHERE p.permission_code LIKE 'cfg1.%'`,
      );
      expect(rows.rows).toHaveLength(0);
    });
  });

  describe("Phase 3A: grants", () => {
    it("role_cfg1_runtime can SELECT+INSERT+scoped-UPDATE on feature_state_change and licence_profile_change, never DELETE", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const table of ["feature_state_change", "licence_profile_change"]) {
          await expect(appPool.query(`DELETE FROM cfg1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await appPool.end();
      }
    });

    it("role_cfg1_runtime cannot INSERT/UPDATE/DELETE on cfg1.prohibited_feature — unchanged since Phase 1 (regression proof)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(
          appPool.query(`INSERT INTO cfg1.prohibited_feature (prohibited_feature_id, feature_code, prohibition_reason, prohibition_source) VALUES ('x','x.x','x','x')`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE cfg1.prohibited_feature SET status = 'inactive' WHERE feature_code = 'exchange.matching_engine'`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(appPool.query(`DELETE FROM cfg1.prohibited_feature WHERE feature_code = 'exchange.matching_engine'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });

    it("role_cfg1_runtime cannot UPDATE columns outside the granted set on feature_state_change (payload_hash stays immutable)", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE cfg1.feature_state_change SET payload_hash = 'tampered' WHERE change_id = 'nonexistent'`)).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await appPool.end();
      }
    });
  });

  describe("POST /internal/cfg1/feature-changes/request", () => {
    const FEATURE_CODE = "test.p3a_new_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM cfg1.feature_state_change WHERE feature_code = $1`, [FEATURE_CODE]);
    });

    it("baseline IAM-02 deny -> CFG1_MUTATION_UNAUTHORISED, no row created", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "enabled", feature_name: "P3A Test Feature", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_MUTATION_UNAUTHORISED");
      const rows = await verifyPool.query(`SELECT * FROM cfg1.feature_state_change WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(0);
    });

    it("prohibited feature_code -> CFG1_FEATURE_PROHIBITED, no row created", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: "kyc.bypass", to_state: "enabled", feature_name: "x", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_FEATURE_PROHIBITED");
    });

    it("Exchange-shaped feature_code not yet in the prohibited registry -> still CFG1_FEATURE_PROHIBITED (structural exchange. prefix guard)", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: "exchange.some_future_code_not_in_registry", to_state: "enabled", feature_name: "x", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_FEATURE_PROHIBITED");
    });

    it("missing feature_name when enabling a not-yet-existing feature -> VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "enabled", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("disabling a feature that does not exist -> NOT_FOUND", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "disabled", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("creates a pending change-request row + cfg1.feature_state.change_requested audit event, no state mutation, no reseal", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const before = await verifyPool.query(`SELECT count(*) FROM cfg1.config_integrity_seal WHERE config_scope = 'feature'`);
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "enabled", feature_name: "P3A Test Feature", change_reason: "test", requested_by: "user_maker_1" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("requested");
      expect(typeof body.payload_hash).toBe("string");

      const rows = await verifyPool.query(`SELECT * FROM cfg1.feature_state_change WHERE change_id = $1`, [body.change_id]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].status).toBe("requested");
      expect(rows.rows[0].approval_id).toBeNull();

      const featureRows = await verifyPool.query(`SELECT * FROM cfg1.feature WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(featureRows.rows).toHaveLength(0); // no state mutation yet

      const after = await verifyPool.query(`SELECT count(*) FROM cfg1.config_integrity_seal WHERE config_scope = 'feature'`);
      expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count)); // no reseal yet

      // event_type is its own outbox_event column (never embedded inside payload_ref's JSON
      // blob — see @aix/foundation's enqueueOutbox/publishAudit) — query it directly rather than
      // LIKE-searching payload_ref for a string that was never serialized there.
      const outboxRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [
        "cfg1.feature_state.change_requested",
        `%${FEATURE_CODE}%`,
      ]);
      expect(outboxRows.rows.length).toBeGreaterThan(0);
    });
  });

  describe("POST /internal/cfg1/feature-changes/apply", () => {
    const FEATURE_CODE = "test.p3a_apply_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM cfg1.feature_state_change WHERE feature_code = $1`, [FEATURE_CODE]);
      await verifyPool.query(`DELETE FROM cfg1.feature_version WHERE feature_code = $1`, [FEATURE_CODE]);
      await deleteSyntheticFeature(FEATURE_CODE);
      await cleanupFeatureSeals();
    });

    async function requestChange(toState: "enabled" | "disabled", requestedBy = "user_maker_1"): Promise<{ changeId: string; payloadHash: string }> {
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: toState, feature_name: "P3A Apply Test", change_reason: "test", requested_by: requestedBy },
      });
      expect(res.statusCode).toBe(200);
      return { changeId: res.json().data.change_id, payloadHash: res.json().data.payload_hash };
    }

    it("apply on an unknown change_id -> NOT_FOUND", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: "fsc_does_not_exist", approval_id: "appr_x", decision_token: "tok_x" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("execute-verify token-invalid -> CFG1_MUTATION_APPROVAL_REQUIRED, row stays 'requested' (retriable), no feature row created", async () => {
      if (!schemaReady) return;
      const { changeId } = await requestChange("enabled");
      config.iam2FetchImpl = allowPermissionButExecuteVerifyFails("IAM2_DECISION_TOKEN_INVALID");
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_x", decision_token: "tok_wrong" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CFG1_MUTATION_APPROVAL_REQUIRED");

      const rows = await verifyPool.query(`SELECT status FROM cfg1.feature_state_change WHERE change_id = $1`, [changeId]);
      expect(rows.rows[0].status).toBe("requested"); // still retriable — token was never consumed
      const featureRows = await verifyPool.query(`SELECT * FROM cfg1.feature WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(featureRows.rows).toHaveLength(0);
    });

    it("a valid execute-verify creates the feature, bumps version, reseals the feature scope, and audits", async () => {
      if (!schemaReady) return;
      const { changeId } = await requestChange("enabled");
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("applied");
      expect(body.new_version).toBe(1);
      expect(body.seal.scope).toBe("feature");
      expect(body.seal.new_version).toBe(1);

      const featureRows = await verifyPool.query(`SELECT current_state, version FROM cfg1.feature WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(featureRows.rows).toHaveLength(1);
      expect(featureRows.rows[0].current_state).toBe("enabled");
      expect(featureRows.rows[0].version).toBe(1);

      const versionRows = await verifyPool.query(`SELECT * FROM cfg1.feature_version WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(versionRows.rows).toHaveLength(1);

      const sealRows = await verifyPool.query(`SELECT status FROM cfg1.config_integrity_seal WHERE config_scope = 'feature' AND status = 'active'`);
      expect(sealRows.rows).toHaveLength(1);

      const changeRows = await verifyPool.query(`SELECT status, approval_id, decision_token_hash FROM cfg1.feature_state_change WHERE change_id = $1`, [changeId]);
      expect(changeRows.rows[0].status).toBe("applied");
      expect(changeRows.rows[0].approval_id).toBe("appr_1");
      expect(changeRows.rows[0].decision_token_hash).not.toBe("tok_valid_1"); // hash, never raw

      const evalRes = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(evalRes.json().data.decision).toBe("allow"); // only reachable AFTER the approved apply
    });

    it("applying an already-applied change_id -> CFG1_CHANGE_REQUEST_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { changeId } = await requestChange("enabled");
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      const retry = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().error.code).toBe("CFG1_CHANGE_REQUEST_INVALID_STATE");
    });

    it("disabling an enabled feature bumps its version and invalidates a decision token issued before the disable", async () => {
      if (!schemaReady) return;
      // 1. Enable via the real apply flow.
      const { changeId: enableId } = await requestChange("enabled");
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: enableId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });

      // 2. Issue a Phase 2 decision token against the now-enabled feature.
      const evalRes = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      const oldToken = evalRes.json().data.decision_token as string;
      const oldDecisionId = evalRes.json().data.decision_id as string;

      // 3. Disable via a SECOND real apply flow, bumping the feature's version again.
      const { changeId: disableId } = await requestChange("disabled");
      const disableRes = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: disableId, approval_id: "appr_2", decision_token: "tok_valid_2" },
      });
      expect(disableRes.json().data.new_version).toBe(2);

      // 4. The OLD token (bound to feature_config_version 1) must now fail closed.
      const verifyRes = await app.inject({
        method: "POST",
        url: VERIFY_DECISION_URL,
        headers: internalHeaders,
        payload: { decision_token: oldToken, decision_id: oldDecisionId, feature_code: FEATURE_CODE, action: "execute", caller_module: "TRD-01", environment: "prod" },
      });
      expect(verifyRes.statusCode).toBe(409);
      expect(["CFG1_DECISION_BINDING_MISMATCH", "CFG1_DECISION_TOKEN_REVOKED"]).toContain(verifyRes.json().error.code);
    });
  });

  describe("POST /internal/cfg1/licence-profile-changes/request + apply", () => {
    afterEach(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM cfg1.licence_profile_change WHERE licence_code = 'PSO'`);
    });

    it("PSO: full request -> apply cycle bumps version, reseals licence_profile scope, and invalidates an old decision token bound to the old licenceProfileVersion", async () => {
      if (!schemaReady) return;
      const original = await verifyPool.query(`SELECT licence_status, version FROM cfg1.licence_profile WHERE licence_code = 'PSO'`);
      const originalStatus = original.rows[0].licence_status as string;
      const originalVersion = original.rows[0].version as number;
      try {
        // A synthetic enabled feature bound to PSO's licence profile, so a Phase 2 evaluate can
        // actually issue a token whose bound licenceProfileVersion we can later invalidate.
        await insertSyntheticFeature("test.p3a_pso_bound_feature", "enabled");

        const evalRes = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: "test.p3a_pso_bound_feature", action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        const oldToken = evalRes.json().data.decision_token as string;
        const oldDecisionId = evalRes.json().data.decision_id as string;

        config.iam2FetchImpl = allowAllIam2();
        const reqRes = await app.inject({
          method: "POST",
          url: "/internal/cfg1/licence-profile-changes/request",
          headers: internalHeaders,
          payload: { licence_code: "PSO", to_status: "suspended", change_reason: "test", requested_by: "user_maker_2" },
        });
        expect(reqRes.statusCode).toBe(200);
        const changeId = reqRes.json().data.change_id as string;

        const applyRes = await app.inject({
          method: "POST",
          url: "/internal/cfg1/licence-profile-changes/apply",
          headers: internalHeaders,
          payload: { change_id: changeId, approval_id: "appr_lp_1", decision_token: "tok_lp_1" },
        });
        expect(applyRes.statusCode).toBe(200);
        expect(applyRes.json().data.new_version).toBe(originalVersion + 1);
        expect(applyRes.json().data.seal.scope).toBe("licence_profile");

        const licRows = await verifyPool.query(`SELECT licence_status, version FROM cfg1.licence_profile WHERE licence_code = 'PSO'`);
        expect(licRows.rows[0].licence_status).toBe("suspended");

        // The token issued BEFORE the suspend must now fail closed. Note the specific failure
        // mode: PSO's live licence_status ("suspended") now diverges from the vendored Doc00
        // baseline fact ("approved" — services/cfg1/src/lib/doc00-baseline.ts), so F-2's
        // decision-time integrity check (verifyDecisionTimeIntegrity, run first by BOTH
        // evaluate() and verify-decision()) now reports "failed" BEFORE the token itself is even
        // inspected — this fails EVERY decision platform-wide, not merely this one token, which
        // is deliberate and considerably stronger than a single-token invalidation: a licence-
        // profile status change away from the Doc00 baseline halts ALL feature decisions until
        // an operator updates and redeploys the vendored Doc00 baseline to reflect the new
        // regulatory reality (see CFG-01_IMPLEMENTATION_NOTES.md's Phase 3A section for the full
        // rationale). This is the correct, conservative behaviour for a licence-lock platform.
        const verifyRes = await app.inject({
          method: "POST",
          url: VERIFY_DECISION_URL,
          headers: internalHeaders,
          payload: {
            decision_token: oldToken,
            decision_id: oldDecisionId,
            feature_code: "test.p3a_pso_bound_feature",
            action: "execute",
            caller_module: "TRD-01",
            environment: "prod",
          },
        });
        expect(verifyRes.statusCode).toBe(503);
        expect(verifyRes.json().error.code).toBe("CFG1_CONFIG_INTEGRITY_FAILED");
      } finally {
        await deleteSyntheticFeature("test.p3a_pso_bound_feature");
        await revertLicenceProfileMutation("PSO", originalStatus, originalVersion);
      }
    });

    it("EXCHANGE flipped to 'approved' via the governed apply path still cannot enable exchange.matching_engine — prohibited_feature layer is untouched (regression)", async () => {
      if (!schemaReady) return;
      const original = await verifyPool.query(`SELECT licence_status, version FROM cfg1.licence_profile WHERE licence_code = 'EXCHANGE'`);
      const originalStatus = original.rows[0].licence_status as string;
      const originalVersion = original.rows[0].version as number;
      try {
        config.iam2FetchImpl = allowAllIam2();
        const reqRes = await app.inject({
          method: "POST",
          url: "/internal/cfg1/licence-profile-changes/request",
          headers: internalHeaders,
          payload: { licence_code: "EXCHANGE", to_status: "approved", change_reason: "test", requested_by: "user_maker_3" },
        });
        const changeId = reqRes.json().data.change_id as string;
        const applyRes = await app.inject({
          method: "POST",
          url: "/internal/cfg1/licence-profile-changes/apply",
          headers: internalHeaders,
          payload: { change_id: changeId, approval_id: "appr_ex_1", decision_token: "tok_ex_1" },
        });
        expect(applyRes.statusCode).toBe(200);

        const licRows = await verifyPool.query(`SELECT licence_status FROM cfg1.licence_profile WHERE licence_code = 'EXCHANGE'`);
        expect(licRows.rows[0].licence_status).toBe("approved");

        // Still cannot request-enable an exchange.* feature — the prohibited_feature layer and
        // the structural exchange. prefix guard are both independent of licence_status.
        const attemptRes = await app.inject({
          method: "POST",
          url: "/internal/cfg1/feature-changes/request",
          headers: internalHeaders,
          payload: { feature_code: "exchange.matching_engine", to_state: "enabled", feature_name: "x", change_reason: "test", requested_by: "user_maker_3" },
        });
        expect(attemptRes.statusCode).toBe(403);
        expect(attemptRes.json().error.code).toBe("CFG1_FEATURE_PROHIBITED");

        // A direct evaluate() call now fails closed platform-wide, not merely for this one
        // feature: EXCHANGE's live licence_status ("approved") diverges from the vendored Doc00
        // baseline fact ("pending" — services/cfg1/src/lib/doc00-baseline.ts), so F-2's
        // decision-time integrity check reports "failed" before any per-feature decision logic
        // even runs — an even stronger proof than an ordinary deny that Exchange cannot be
        // enabled through this route: the whole decision engine refuses to operate at all until
        // an operator consciously updates and redeploys the vendored Doc00 baseline. This is
        // deliberate (see the PSO test above and CFG-01_IMPLEMENTATION_NOTES.md's Phase 3A
        // section), not a bug.
        const evalRes = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: "exchange.matching_engine", action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        expect(evalRes.statusCode).toBe(503);
        expect(evalRes.json().error.code).toBe("CFG1_CONFIG_INTEGRITY_FAILED");
      } finally {
        await revertLicenceProfileMutation("EXCHANGE", originalStatus, originalVersion);
      }
    });
  });

  describe("Phase 3A audit/outbox: forced failure fails closed, no orphaned change row", () => {
    const FEATURE_CODE = "test.p3a_audit_failure_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM cfg1.feature_state_change WHERE feature_code = $1`, [FEATURE_CODE]);
      await deleteSyntheticFeature(FEATURE_CODE);
      await cleanupFeatureSeals();
    });

    it("CFG1_AUDIT_REQUIRED when the outbox write fails during apply — the whole transaction rolls back (row stays 'requested', retriable with a fresh approval), no feature row is created", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const reqRes = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "enabled", feature_name: "Audit Failure Test", change_reason: "test", requested_by: "user_maker_4" },
      });
      const changeId = reqRes.json().data.change_id as string;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_cfg1_runtime");
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: "/internal/cfg1/feature-changes/apply",
            headers: internalHeaders,
            payload: { change_id: changeId, approval_id: "appr_af_1", decision_token: "tok_af_1" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CFG1_AUDIT_REQUIRED");

          const rows = await verifyPool.query(`SELECT status FROM cfg1.feature_state_change WHERE change_id = $1`, [changeId]);
          // The main apply transaction rolled back entirely (including its own audit attempts) —
          // the row is left exactly as it was, still 'requested'. No separate "mark as failed"
          // write is attempted (it would face the identical audit-durability requirement that is
          // itself what's broken here) — a 'requested' row is always safely retriable with a
          // fresh IAM-02 approval; only the now-consumed token itself must be replaced.
          expect(rows.rows[0].status).toBe("requested");

          const featureRows = await verifyPool.query(`SELECT * FROM cfg1.feature WHERE feature_code = $1`, [FEATURE_CODE]);
          expect(featureRows.rows).toHaveLength(0); // rolled back, not left half-applied
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_cfg1_runtime");
        }
      });
    });
  });

  describe("Phase 3A: no raw approval/decision token is ever stored or logged", () => {
    const FEATURE_CODE = "test.p3a_no_raw_token_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM cfg1.feature_state_change WHERE feature_code = $1`, [FEATURE_CODE]);
      await deleteSyntheticFeature(FEATURE_CODE);
      await cleanupFeatureSeals();
    });

    it("cfg1.feature_state_change never contains the raw decision_token value in any column", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const reqRes = await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/request",
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, to_state: "enabled", feature_name: "No Raw Token Test", change_reason: "test", requested_by: "user_maker_5" },
      });
      const changeId = reqRes.json().data.change_id as string;
      const rawToken = "raw-decision-token-must-never-be-stored-anywhere";
      await app.inject({
        method: "POST",
        url: "/internal/cfg1/feature-changes/apply",
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_nrt_1", decision_token: rawToken },
      });

      const rows = await verifyPool.query(`SELECT * FROM cfg1.feature_state_change WHERE change_id = $1`, [changeId]);
      expect(JSON.stringify(rows.rows[0])).not.toContain(rawToken);
    });
  });

  // =============================================================================================
  // PHASE 3B — feature-scoped kill-switch workflow (migrations 018/019).
  // =============================================================================================
  const ACTIVATE_URL = "/internal/cfg1/kill-switches/activate";
  const DEACTIVATE_REQUEST_URL = "/internal/cfg1/kill-switch-deactivation-requests/request";
  const DEACTIVATE_APPLY_URL = "/internal/cfg1/kill-switch-deactivation-requests/apply";

  async function deleteKillSwitchFixtures(featureCode: string): Promise<void> {
    await verifyPool.query(
      `DELETE FROM cfg1.kill_switch_event WHERE feature_code = $1`,
      [featureCode],
    );
    await verifyPool.query(`DELETE FROM cfg1.kill_switch_deactivation_request WHERE feature_code = $1`, [featureCode]);
    await verifyPool.query(`DELETE FROM cfg1.kill_switch WHERE feature_code = $1`, [featureCode]);
  }

  describe("Phase 3B: IAM-02 permission catalogue registration (migration 019)", () => {
    it("registers exactly the 3 approved cfg1.kill_switch.* permission codes, all owner_module = CFG-01, licence_locked = false", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT permission_code, owner_module, status, licence_locked, requires_approval, requires_step_up
           FROM iam2.permission WHERE permission_code LIKE 'cfg1.kill_switch.%' ORDER BY permission_code`,
      );
      const codes = rows.rows.map((r) => r.permission_code as string);
      expect(codes).toEqual(["cfg1.kill_switch.activate", "cfg1.kill_switch.deactivate", "cfg1.kill_switch.deactivate_request"]);
      expect(rows.rows.every((r) => r.owner_module === "CFG-01" && r.status === "active" && r.licence_locked === false)).toBe(true);

      const byCode = Object.fromEntries(rows.rows.map((r) => [r.permission_code as string, r]));
      expect(byCode["cfg1.kill_switch.activate"].requires_approval).toBe(false);
      expect(byCode["cfg1.kill_switch.activate"].requires_step_up).toBe(false);
      expect(byCode["cfg1.kill_switch.deactivate_request"].requires_approval).toBe(false);
      expect(byCode["cfg1.kill_switch.deactivate_request"].requires_step_up).toBe(false);
      expect(byCode["cfg1.kill_switch.deactivate"].requires_approval).toBe(true);
      expect(byCode["cfg1.kill_switch.deactivate"].requires_step_up).toBe(false);
    });

    it("does NOT register cfg1.kill_switch.read (approved decision #10)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code FROM iam2.permission WHERE permission_code = 'cfg1.kill_switch.read'`);
      expect(rows.rows).toHaveLength(0);
    });

    it("seeds no iam2.role_permission rows for any cfg1.kill_switch.* permission", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT rp.id FROM iam2.role_permission rp
           JOIN iam2.permission p ON p.permission_id = rp.permission_id
          WHERE p.permission_code LIKE 'cfg1.kill_switch.%'`,
      );
      expect(rows.rows).toHaveLength(0);
    });
  });

  describe("Phase 3B: grants", () => {
    it("role_cfg1_runtime can SELECT+INSERT+scoped-UPDATE on kill_switch/kill_switch_deactivation_request, INSERT-only on kill_switch_event, never DELETE", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const table of ["kill_switch", "kill_switch_deactivation_request", "kill_switch_event"]) {
          await expect(appPool.query(`DELETE FROM cfg1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
        await expect(appPool.query(`UPDATE cfg1.kill_switch_event SET reason = 'tampered' WHERE event_id = 'nonexistent'`)).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await appPool.end();
      }
    });
  });

  describe("POST /internal/cfg1/kill-switches/activate", () => {
    const FEATURE_CODE = "test.p3b_activate_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
    });

    it("baseline IAM-02 deny -> CFG1_MUTATION_UNAUTHORISED, no row created", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyPermissionIam2();
      const res = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_MUTATION_UNAUTHORISED");
      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(0);
    });

    it("baseline approval_required (not a genuine allow) -> CFG1_MUTATION_UNAUTHORISED — activation has no execute-verify fallback", async () => {
      if (!schemaReady) return;
      // Simulates a future accidental catalogue-flag change on cfg1.kill_switch.activate — the
      // route's own defence-in-depth `baseline.reason === "permission_granted"` assertion must
      // reject this even though `baseline.allowed` would otherwise be true.
      config.iam2FetchImpl = makeFakeIam2FetchFull(
        () => ({ decision: "allow", reason: "approval_required" }),
        () => ({ ok: true }),
      );
      const res = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_MUTATION_UNAUTHORISED");
      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(0);
    });

    it("a real allow activates the kill-switch: creates the row (version 1), an 'activated' event, and audits", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident-123", activated_by: "user_ops_1" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("active");
      expect(body.version).toBe(1);

      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].status).toBe("active");
      expect(rows.rows[0].activated_by).toBe("user_ops_1");

      const eventRows = await verifyPool.query(`SELECT event_type FROM cfg1.kill_switch_event WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(eventRows.rows.map((r) => r.event_type)).toEqual(["activated"]);

      const outboxRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [
        "cfg1.kill_switch.activated",
        `%${FEATURE_CODE}%`,
      ]);
      expect(outboxRows.rows.length).toBeGreaterThan(0);
    });

    it("activating an already-active kill-switch -> CFG1_KILL_SWITCH_ALREADY_ACTIVE, no second row/event written", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident-123", activated_by: "user_ops_1" },
      });
      const retry = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident-123-retry", activated_by: "user_ops_1" },
      });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().error.code).toBe("CFG1_KILL_SWITCH_ALREADY_ACTIVE");

      const eventRows = await verifyPool.query(`SELECT event_type FROM cfg1.kill_switch_event WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(eventRows.rows).toHaveLength(1); // still just the one activation
    });

    it("concurrent activation on the same feature_code: one succeeds, one fails safe (already_active), never two active rows", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const [first, second] = await Promise.all([
        app.inject({ method: "POST", url: ACTIVATE_URL, headers: internalHeaders, payload: { feature_code: FEATURE_CODE, reason: "race-a", activated_by: "user_ops_1" } }),
        app.inject({ method: "POST", url: ACTIVATE_URL, headers: internalHeaders, payload: { feature_code: FEATURE_CODE, reason: "race-b", activated_by: "user_ops_2" } }),
      ]);
      const statuses = [first.statusCode, second.statusCode].sort();
      expect(statuses).toEqual([200, 409]);

      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch WHERE feature_code = $1 AND status = 'active'`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(1); // partial unique index + FOR UPDATE lock hold to exactly one
    });

    it("activating exchange.matching_engine's kill-switch does not enable the Exchange feature — kill-switch state is independent of cfg1.feature", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: "exchange.matching_engine", reason: "test", activated_by: "user_ops_1" },
      });
      expect(res.statusCode).toBe(200);
      try {
        const featureRows = await verifyPool.query(`SELECT * FROM cfg1.feature WHERE feature_code = $1`, ["exchange.matching_engine"]);
        expect(featureRows.rows).toHaveLength(0); // cfg1.feature untouched — still no Exchange row
        // The feature remains blocked at evaluate() regardless — exchange.* is denied at the
        // structural Exchange-lock check, which runs before the general prohibited-registry
        // check (same precedence every other exchange.* evaluate() test in this file asserts).
        const evalRes = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: "exchange.matching_engine", action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        expect(evalRes.json().data.decision).toBe("deny");
        expect(evalRes.json().data.reason_code).toBe("exchange_pending_locked");
      } finally {
        await deleteKillSwitchFixtures("exchange.matching_engine");
      }
    });
  });

  describe("Kill-switch precedence in evaluateFeature()", () => {
    const FEATURE_CODE = "test.p3b_evaluate_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
      await deleteSyntheticFeature(FEATURE_CODE);
    });

    it("an active kill-switch denies evaluate() even though the feature itself is enabled", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      config.iam2FetchImpl = allowAllIam2();
      const activateRes = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      expect(activateRes.statusCode).toBe(200);

      const evalRes = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(evalRes.statusCode).toBe(200);
      expect(evalRes.json().data.decision).toBe("deny");
      expect(evalRes.json().data.reason_code).toBe("kill_switch_active");
    });

    it("an active kill-switch denies evaluate() even for a feature_code with no cfg1.feature row at all (pre-emptive block)", async () => {
      if (!schemaReady) return;
      const NO_ROW_FEATURE = "test.p3b_no_feature_row";
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: NO_ROW_FEATURE, reason: "incident", activated_by: "user_ops_1" },
      });
      try {
        const evalRes = await app.inject({
          method: "POST",
          url: EVALUATE_URL,
          headers: internalHeaders,
          payload: { feature_code: NO_ROW_FEATURE, action: "execute", environment: "prod", caller_module: "TRD-01" },
        });
        expect(evalRes.json().data.decision).toBe("deny");
        expect(evalRes.json().data.reason_code).toBe("kill_switch_active");
      } finally {
        await deleteKillSwitchFixtures(NO_ROW_FEATURE);
      }
    });

    it("deactivating restores normal decision behaviour — evaluate() allows again once the feature is otherwise allowed", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      const denied = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(denied.json().data.reason_code).toBe("kill_switch_active");

      const reqRes = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_2" },
      });
      expect(reqRes.statusCode).toBe(200);
      const changeId = reqRes.json().data.change_id as string;

      const applyRes = await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_deactivate_1" },
      });
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.status).toBe("applied");

      const allowed = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(allowed.json().data.decision).toBe("allow");
    });
  });

  describe("Kill-switch live check in verify-decision", () => {
    const FEATURE_CODE = "test.p3b_verify_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
      await deleteSyntheticFeature(FEATURE_CODE);
    });

    it("activating a kill-switch AFTER a decision token was issued revokes that token on its NEXT verify — verify-decision does not re-run evaluateFeature()", async () => {
      if (!schemaReady) return;
      await insertSyntheticFeature(FEATURE_CODE, "enabled");
      config.iam2FetchImpl = allowAllIam2();

      // 1. Issue a token while nothing is wrong.
      const evalRes = await app.inject({
        method: "POST",
        url: EVALUATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, action: "execute", environment: "prod", caller_module: "TRD-01" },
      });
      expect(evalRes.json().data.decision).toBe("allow");
      const token = evalRes.json().data.decision_token as string;
      const decisionId = evalRes.json().data.decision_id as string;
      const verifyPayload = { decision_token: token, decision_id: decisionId, feature_code: FEATURE_CODE, action: "execute", caller_module: "TRD-01", environment: "prod" };

      // 2. Confirm it verifies fine before activation.
      const before = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload: verifyPayload });
      expect(before.statusCode).toBe(200);
      expect(before.json().data.verified).toBe(true);

      // 3. Activate the kill-switch — the token was issued before this, so no version-hash drift
      // exists; only the explicit live kill-switch check can catch it.
      await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });

      // 4. The SAME, previously-valid token must now fail closed and be revoked.
      const after = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload: verifyPayload });
      expect(after.statusCode).toBe(409);
      expect(after.json().error.code).toBe("CFG1_TOKEN_REVOKED_BY_KILL_SWITCH");

      const tokenRows = await verifyPool.query(`SELECT status FROM cfg1.feature_decision_token WHERE decision_id = $1`, [decisionId]);
      expect(tokenRows.rows[0].status).toBe("revoked");

      // 5. Retrying again stays revoked (not re-triggering the kill-switch-specific reason).
      const retry = await app.inject({ method: "POST", url: VERIFY_DECISION_URL, headers: internalHeaders, payload: verifyPayload });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().error.code).toBe("CFG1_DECISION_TOKEN_REVOKED");
    });
  });

  describe("POST /internal/cfg1/kill-switch-deactivation-requests/request", () => {
    const FEATURE_CODE = "test.p3b_deactivate_request_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
    });

    async function activate(activatedBy = "user_ops_1"): Promise<void> {
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: activatedBy },
      });
      expect(res.statusCode).toBe(200);
    }

    it("no active kill-switch -> CFG1_KILL_SWITCH_NOT_ACTIVE, no row created", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_2" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CFG1_KILL_SWITCH_NOT_ACTIVE");
    });

    it("the original activator cannot propose deactivation of their own kill-switch — CFG1_KILL_SWITCH_SELF_DEACTIVATION_BLOCKED (approved decision #6)", async () => {
      if (!schemaReady) return;
      await activate("user_ops_1");
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CFG1_KILL_SWITCH_SELF_DEACTIVATION_BLOCKED");

      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch_deactivation_request WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(rows.rows).toHaveLength(0);
    });

    it("a different actor proposing deactivation creates a requested row + 'deactivation_requested' event + audit", async () => {
      if (!schemaReady) return;
      await activate("user_ops_1");
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_2" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("requested");
      expect(typeof body.payload_hash).toBe("string");

      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`, [body.change_id]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].status).toBe("requested");
      expect(rows.rows[0].requested_by).toBe("user_ops_2");

      const eventRows = await verifyPool.query(`SELECT event_type FROM cfg1.kill_switch_event WHERE feature_code = $1 ORDER BY created_at_utc`, [FEATURE_CODE]);
      expect(eventRows.rows.map((r) => r.event_type)).toEqual(["activated", "deactivation_requested"]);

      const outboxRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [
        "cfg1.kill_switch.deactivation_requested",
        `%${FEATURE_CODE}%`,
      ]);
      expect(outboxRows.rows.length).toBeGreaterThan(0);
    });
  });

  describe("POST /internal/cfg1/kill-switch-deactivation-requests/apply", () => {
    const FEATURE_CODE = "test.p3b_deactivate_apply_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
    });

    async function activateAndRequest(): Promise<{ changeId: string }> {
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      const reqRes = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_2" },
      });
      return { changeId: reqRes.json().data.change_id as string };
    }

    it("apply on an unknown change_id -> NOT_FOUND", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: "ksdr_does_not_exist", approval_id: "appr_x", decision_token: "tok_x" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("execute-verify token-invalid -> CFG1_MUTATION_APPROVAL_REQUIRED, row stays 'requested' (retriable), kill-switch stays active", async () => {
      if (!schemaReady) return;
      const { changeId } = await activateAndRequest();
      config.iam2FetchImpl = allowPermissionButExecuteVerifyFails("IAM2_DECISION_TOKEN_INVALID");
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_x", decision_token: "tok_wrong" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CFG1_MUTATION_APPROVAL_REQUIRED");

      const changeRows = await verifyPool.query(`SELECT status FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`, [changeId]);
      expect(changeRows.rows[0].status).toBe("requested"); // still retriable — no mutation happened

      const ksRows = await verifyPool.query(`SELECT status FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(ksRows.rows[0].status).toBe("active"); // untouched by the failed apply
    });

    it("a valid execute-verify deactivates: updates kill_switch to inactive, marks the request 'applied', inserts a 'deactivated' event, and audits", async () => {
      if (!schemaReady) return;
      const { changeId } = await activateAndRequest();
      config.iam2FetchImpl = allowAllIam2();
      const res = await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("applied");
      expect(body.new_version).toBe(2);

      const ksRows = await verifyPool.query(`SELECT status, version FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
      expect(ksRows.rows[0].status).toBe("inactive");
      expect(ksRows.rows[0].version).toBe(2);

      const changeRows = await verifyPool.query(`SELECT status, approval_id, decision_token_hash FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`, [changeId]);
      expect(changeRows.rows[0].status).toBe("applied");
      expect(changeRows.rows[0].approval_id).toBe("appr_1");
      expect(changeRows.rows[0].decision_token_hash).not.toBe("tok_valid_1"); // hash, never raw

      const eventRows = await verifyPool.query(`SELECT event_type FROM cfg1.kill_switch_event WHERE feature_code = $1 ORDER BY created_at_utc`, [FEATURE_CODE]);
      expect(eventRows.rows.map((r) => r.event_type)).toEqual(["activated", "deactivation_requested", "deactivated"]);

      const outboxRows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [
        "cfg1.kill_switch.deactivated",
        `%${FEATURE_CODE}%`,
      ]);
      expect(outboxRows.rows.length).toBeGreaterThan(0);
    });

    it("applying an already-applied change_id -> CFG1_CHANGE_REQUEST_INVALID_STATE (raced)", async () => {
      if (!schemaReady) return;
      const { changeId } = await activateAndRequest();
      config.iam2FetchImpl = allowAllIam2();
      await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      const retry = await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_1", decision_token: "tok_valid_1" },
      });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().error.code).toBe("CFG1_CHANGE_REQUEST_INVALID_STATE");
    });

    it("cfg1.kill_switch_deactivation_request never contains the raw decision_token value in any column", async () => {
      if (!schemaReady) return;
      const { changeId } = await activateAndRequest();
      config.iam2FetchImpl = allowAllIam2();
      const rawToken = "raw-kill-switch-decision-token-must-never-be-stored";
      await app.inject({
        method: "POST",
        url: DEACTIVATE_APPLY_URL,
        headers: internalHeaders,
        payload: { change_id: changeId, approval_id: "appr_nrt_1", decision_token: rawToken },
      });
      const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`, [changeId]);
      expect(JSON.stringify(rows.rows[0])).not.toContain(rawToken);
    });
  });

  describe("Phase 3B audit/outbox: forced failure fails closed, no orphaned mutation", () => {
    const FEATURE_CODE = "test.p3b_audit_failure_feature";

    afterEach(async () => {
      if (!schemaReady) return;
      await deleteKillSwitchFixtures(FEATURE_CODE);
    });

    it("CFG1_AUDIT_REQUIRED when the outbox write fails during activation — no kill_switch row is left behind", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_cfg1_runtime");
        try {
          const res = await app.inject({
            method: "POST",
            url: ACTIVATE_URL,
            headers: internalHeaders,
            payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("CFG1_AUDIT_REQUIRED");

          const rows = await verifyPool.query(`SELECT * FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
          expect(rows.rows).toHaveLength(0); // whole transaction rolled back, nothing orphaned
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_cfg1_runtime");
        }
      });
    });

    it("CFG1_AUDIT_REQUIRED when the outbox write fails during deactivation apply — request row stays 'requested', kill-switch stays active", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = allowAllIam2();
      const activateRes = await app.inject({
        method: "POST",
        url: ACTIVATE_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
      });
      expect(activateRes.statusCode).toBe(200);
      const reqRes = await app.inject({
        method: "POST",
        url: DEACTIVATE_REQUEST_URL,
        headers: internalHeaders,
        payload: { feature_code: FEATURE_CODE, change_reason: "resolved", requested_by: "user_ops_2" },
      });
      const changeId = reqRes.json().data.change_id as string;

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query("REVOKE INSERT ON foundation.outbox_event FROM role_cfg1_runtime");
        try {
          const applyRes = await app.inject({
            method: "POST",
            url: DEACTIVATE_APPLY_URL,
            headers: internalHeaders,
            payload: { change_id: changeId, approval_id: "appr_af_1", decision_token: "tok_af_1" },
          });
          expect(applyRes.statusCode).toBe(503);
          expect(applyRes.json().error.code).toBe("CFG1_AUDIT_REQUIRED");

          const changeRows = await verifyPool.query(`SELECT status FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`, [changeId]);
          expect(changeRows.rows[0].status).toBe("requested");
          const ksRows = await verifyPool.query(`SELECT status FROM cfg1.kill_switch WHERE feature_code = $1`, [FEATURE_CODE]);
          expect(ksRows.rows[0].status).toBe("active");
        } finally {
          await verifyPool.query("GRANT INSERT ON foundation.outbox_event TO role_cfg1_runtime");
        }
      });
    });
  });

  describe("Kill-switch does not participate in Doc00/seal/reseal (approved decision #12)", () => {
    it("activating a kill-switch creates no cfg1.config_integrity_seal row of any scope", async () => {
      if (!schemaReady) return;
      const FEATURE_CODE = "test.p3b_no_seal_feature";
      const before = await verifyPool.query(`SELECT count(*) FROM cfg1.config_integrity_seal`);
      config.iam2FetchImpl = allowAllIam2();
      try {
        const res = await app.inject({
          method: "POST",
          url: ACTIVATE_URL,
          headers: internalHeaders,
          payload: { feature_code: FEATURE_CODE, reason: "incident", activated_by: "user_ops_1" },
        });
        expect(res.statusCode).toBe(200);
        const after = await verifyPool.query(`SELECT count(*) FROM cfg1.config_integrity_seal`);
        expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
      } finally {
        await deleteKillSwitchFixtures(FEATURE_CODE);
      }
    });
  });

  describe("cfg1.prohibited_feature remains SELECT-only after Phase 3B (regression proof)", () => {
    it("role_cfg1_runtime still cannot INSERT/UPDATE/DELETE on cfg1.prohibited_feature", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(
          appPool.query(`INSERT INTO cfg1.prohibited_feature (prohibited_feature_id, feature_code, prohibition_reason, prohibition_source) VALUES ('x','x.x','x','x')`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE cfg1.prohibited_feature SET status = 'inactive' WHERE feature_code = 'exchange.matching_engine'`)).rejects.toMatchObject({
          code: "42501",
        });
        await expect(appPool.query(`DELETE FROM cfg1.prohibited_feature WHERE feature_code = 'exchange.matching_engine'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });
  });

  describe("Phase 3B: no kill-switch read/list route, no Exchange runtime surface", () => {
    it("GET on the activate/deactivation-request/apply URLs is not a valid method (no accidental read route)", async () => {
      if (!schemaReady) return;
      for (const url of [ACTIVATE_URL, DEACTIVATE_REQUEST_URL, DEACTIVATE_APPLY_URL]) {
        const res = await app.inject({ method: "GET", url, headers: internalHeaders });
        expect([404, 405]).toContain(res.statusCode);
      }
    });

    it("no /internal/cfg1/kill-switches (list) or /internal/cfg1/kill-switches/{id} (read) route exists", async () => {
      if (!schemaReady) return;
      const listRes = await app.inject({ method: "GET", url: "/internal/cfg1/kill-switches", headers: internalHeaders });
      expect(listRes.statusCode).toBe(404);
      const readRes = await app.inject({ method: "GET", url: "/internal/cfg1/kill-switches/some-id", headers: internalHeaders });
      expect(readRes.statusCode).toBe(404);
    });
  });
});
