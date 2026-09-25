/**
 * MIG-004 — CFG-01 `environment_scope` / live decision-chain step 4, the CFG-FIND-001 trust
 * boundary, the HD-2 PRODUCTION hold and the HD-4 structural `exchange.` deny, proven against a
 * REAL Postgres (`docs/03_implementation/tasks/MIG-004/01-plan.md` §5, §7, §8, §10, §11, §13).
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only (migrated to head with the
 * real migration runner, real `fnd`/`cfg1` runtime grant files applied), dropped in `afterAll`.
 * Private because this file inserts and mutates `cfg1.feature` rows (and, in one test,
 * temporarily drops migration 071's CHECK constraint to prove the runtime parser's own
 * defence in depth) — none of which may leak into the shared `TEST_DATABASE_URL`, where
 * `cfg1-db.test.ts` asserts `cfg1.feature` is empty. Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * One CFG-01 app per deployment identifier (`dev`, `qa`, `uat`, `demo`, `staging`, `prod`), all
 * on the same private DB and all connected as a real LOGIN role holding only
 * `role_cfg1_runtime` — so "which environment CFG-01 evaluates" is decided by each app's own
 * config, exactly as in a real deployment. Every `environment_scope` value used here is a
 * test-controlled superuser fixture: MIG-004 has no runtime environment-scope write path.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, getPool, initPool, ENVIRONMENTS, canonicalEnvironment, type Environment } from "@aix/foundation";
import type { Cfg1Config } from "../../services/cfg1/src/config.js";
import { buildApp } from "../../services/cfg1/src/server.js";
import { computeFeatureScopeHash, type FeatureSealRow } from "../../services/cfg1/src/lib/integrity-seal.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const PRIVATE_DB_NAME = `cfg1_mig004_it_${randomBytes(6).toString("hex")}`;
const RUNTIME_ROLE_USER = "cfg1_app_test";
const INTERNAL_TOKEN = "test-cfg1-internal-token-mig004-it";
const internalHeaders = { "x-internal-service-token": INTERNAL_TOKEN };
const EVALUATE_URL = "/internal/cfg1/features/evaluate";
const VERIFY_DECISION_URL = "/internal/cfg1/features/verify-decision";

type Canonical = "DEVELOPMENT" | "TEST" | "UAT" | "DEMO" | "PRODUCTION";
type Scope = Record<Canonical, string>;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}
function silentLog(): void {
  /* silence node-pg-migrate's per-statement logging */
}
function ignoreExpectedDisconnect(): void {
  /* expected during DROP DATABASE ... WITH (FORCE) teardown */
}

function scope(overrides: Partial<Scope> = {}): Scope {
  return { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED", PRODUCTION: "DISABLED", ...overrides };
}
/** Every entry `other`, except `own` which is `ownState` — proves only the own entry is read. */
function onlyOwn(own: Canonical, ownState: string, other: string): Scope {
  const s = scope();
  for (const k of Object.keys(s) as Canonical[]) s[k] = k === own ? ownState : other;
  return s;
}
const ALL_ENABLED = scope({ DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED", PRODUCTION: "ENABLED" });

function cfg(environment: Environment, databaseUrl: string): Cfg1Config {
  return {
    environment,
    databaseUrl,
    internalServiceToken: "test-cfg1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    cfg1InternalServiceToken: INTERNAL_TOKEN,
    iam2BaseUrl: "http://127.0.0.1:0",
    iam2InternalServiceToken: "test-cfg1-iam2-token-mig004-it",
  };
}

let maintenancePool: Pool;
let verifyPool: Pool;
let databaseCreated = false;
let schemaReady = false;
const apps = {} as Record<Environment, FastifyInstance>;

async function upsertFeature(featureCode: string, currentState: string, environmentScope: Scope): Promise<void> {
  await verifyPool.query(
    `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, version, environment_scope, created_at_utc, updated_at_utc)
     VALUES ($1, $2, 'MIG-004 synthetic test feature (never real seed data)', $3, 1, $4::jsonb, now(), now())
     ON CONFLICT (feature_code) DO UPDATE SET current_state = EXCLUDED.current_state, environment_scope = EXCLUDED.environment_scope`,
    [`feat_mig004_${featureCode.replace(/[^a-z0-9]/gi, "_")}`, featureCode, currentState, JSON.stringify(environmentScope)],
  );
}

async function evaluate(env: Environment, featureCode: string, asserted: string = env) {
  const res = await apps[env].inject({
    method: "POST",
    url: EVALUATE_URL,
    headers: internalHeaders,
    payload: { feature_code: featureCode, action: "execute", environment: asserted, caller_module: "TRD-01" },
  });
  return res;
}

async function verify(env: Environment, token: string, decisionId: string, featureCode: string, asserted: string = env) {
  return apps[env].inject({
    method: "POST",
    url: VERIFY_DECISION_URL,
    headers: internalHeaders,
    payload: { decision_token: token, decision_id: decisionId, feature_code: featureCode, action: "execute", caller_module: "TRD-01", environment: asserted },
  });
}

async function auditEvents(decisionId: string): Promise<Array<{ event_type: string; severity: string; reason_code?: string; metadata?: Record<string, unknown> }>> {
  const r = await verifyPool.query(`SELECT event_type, payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${decisionId}%`]);
  return r.rows.map((row) => ({ event_type: row.event_type, ...JSON.parse(row.payload_ref) }));
}

async function tokenRowsFor(decisionId: string) {
  return (await verifyPool.query(`SELECT status, revoked_reason, environment FROM cfg1.feature_decision_token WHERE decision_id = $1`, [decisionId])).rows;
}

beforeAll(async () => {
  if (!TEST_DB) return;
  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  const privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "cfg1-mig004-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "cfg1-mig004-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "cfg1-mig004-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "cfg1_runtime_grants.sql"), "utf8"));
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

  initPool(privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`));
  for (const env of ENVIRONMENTS) apps[env] = await buildApp(cfg(env, privateDbUrl));
  schemaReady = true;
}, 120_000);

afterAll(async () => {
  for (const app of Object.values(apps)) await app.close();
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

function ready(): boolean {
  if (!TEST_DB) return false;
  expect(schemaReady, "private DB setup (migrate + fnd/cfg1 grants) must have succeeded").toBe(true);
  return true;
}

describe("MIG-004 schema and runtime grants (private DB, real role_cfg1_runtime)", () => {
  it("cfg1.feature.environment_scope is jsonb NOT NULL with the all-DISABLED default and the strict CHECK", async () => {
    if (!ready()) return;
    const col = await verifyPool.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'cfg1' AND table_name = 'feature' AND column_name = 'environment_scope'`,
    );
    expect(col.rows[0]).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(String(col.rows[0].column_default)).toContain('"PRODUCTION": "DISABLED"');
    const con = await verifyPool.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'cfg1_feature_environment_scope_valid'`);
    expect(con.rows[0].n).toBe(1);
  });

  it("role_cfg1_runtime cannot INSERT environment_scope (42501)", async () => {
    if (!ready()) return;
    await expect(
      getPool().query(
        `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, environment_scope) VALUES ('feat_mig004_grant_ins', 'test.mig004.grant_ins', 'x', 'enabled', $1::jsonb)`,
        [JSON.stringify(ALL_ENABLED)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("role_cfg1_runtime cannot UPDATE environment_scope (42501), even on an existing row", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.grant_upd", "enabled", scope());
    await expect(
      getPool().query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig004.grant_upd'`, [JSON.stringify(ALL_ENABLED)]),
    ).rejects.toMatchObject({ code: "42501" });
    const row = await verifyPool.query(`SELECT environment_scope FROM cfg1.feature WHERE feature_code = 'test.mig004.grant_upd'`);
    expect(row.rows[0].environment_scope).toEqual(scope());
  });

  it("role_cfg1_runtime CAN still insert a feature row without environment_scope (column-scoped grant), which takes the all-DISABLED default", async () => {
    if (!ready()) return;
    await getPool().query(
      `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, licence_profile_id, version, created_at_utc, updated_at_utc)
       VALUES ('feat_mig004_grant_ok', 'test.mig004.grant_ok', 'x', 'enabled', NULL, 1, now(), now())`,
    );
    const row = await verifyPool.query(`SELECT environment_scope FROM cfg1.feature WHERE feature_code = 'test.mig004.grant_ok'`);
    expect(row.rows[0].environment_scope).toEqual(scope());
  });

  it("the privilege catalogue itself shows no INSERT/UPDATE on environment_scope for role_cfg1_runtime", async () => {
    if (!ready()) return;
    const r = await verifyPool.query(
      `SELECT has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'environment_scope', 'INSERT') AS ins,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'environment_scope', 'UPDATE') AS upd,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'environment_scope', 'SELECT') AS sel,
              has_table_privilege('role_cfg1_runtime', 'cfg1.feature', 'INSERT') AS table_ins`,
    );
    expect(r.rows[0]).toEqual({ ins: false, upd: false, sel: true, table_ins: false });
  });
});

describe("MIG-004 step 4 matrix — every deployment identifier × every availability state", () => {
  const nonProductionAllow: Environment[] = ["dev", "qa", "uat", "demo"];

  it.each(ENVIRONMENTS.map((e) => [e]))("%s: ENABLED passes step 4; DISABLED and NOT_APPLICABLE deny environment_not_available; only its own canonical entry counts", async (env) => {
    if (!ready()) return;
    const canonical = canonicalEnvironment(env) as Canonical;
    const code = `test.mig004.matrix_${env}`;

    // ENABLED only in the own entry.
    await upsertFeature(code, "enabled", onlyOwn(canonical, "ENABLED", "DISABLED"));
    const enabled = (await evaluate(env, code)).json().data;
    if (nonProductionAllow.includes(env)) {
      expect(enabled).toMatchObject({ decision: "allow", reason_code: "feature_allowed" });
      expect(enabled.decision_token).toEqual(expect.any(String));
    } else {
      // Canonical PRODUCTION: step 4 passed, then the HD-2 hold denies.
      expect(enabled).toMatchObject({ decision: "deny", reason_code: "production_activation_absent", decision_token: null });
    }

    // DISABLED / NOT_APPLICABLE in the own entry, ENABLED everywhere else.
    for (const state of ["DISABLED", "NOT_APPLICABLE"]) {
      await upsertFeature(code, "enabled", onlyOwn(canonical, state, "ENABLED"));
      const denied = (await evaluate(env, code)).json().data;
      expect(denied).toMatchObject({ decision: "deny", reason_code: "environment_not_available", decision_token: null });
    }
  });

  it("staging reads the PRODUCTION entry: PRODUCTION DISABLED with every other entry ENABLED denies", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.staging_prod_entry", "enabled", scope({ DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED" }));
    expect((await evaluate("staging", "test.mig004.staging_prod_entry")).json().data.reason_code).toBe("environment_not_available");
  });

  it("no non-production availability propagates to production: four non-production entries ENABLED, PRODUCTION DISABLED → prod and staging deny", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.no_propagation", "enabled", scope({ DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED" }));
    for (const env of ["prod", "staging"] as const) {
      expect((await evaluate(env, "test.mig004.no_propagation")).json().data.reason_code).toBe("environment_not_available");
    }
    expect((await evaluate("dev", "test.mig004.no_propagation")).json().data.decision).toBe("allow");
  });

  it("the migration default (all DISABLED) is available nowhere", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.default_scope", "enabled", scope());
    for (const env of ENVIRONMENTS) {
      expect((await evaluate(env, "test.mig004.default_scope")).json().data.reason_code).toBe("environment_not_available");
    }
  });

  it("a malformed environment_scope that bypassed the DB CHECK still denies environment_scope_invalid in every environment (runtime defence in depth)", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.invalid_scope", "enabled", scope({ DEVELOPMENT: "ENABLED" }));
    await verifyPool.query(`ALTER TABLE cfg1.feature DROP CONSTRAINT cfg1_feature_environment_scope_valid`);
    try {
      for (const bad of [
        { ...scope({ DEVELOPMENT: "ENABLED" }), STAGING: "ENABLED" },
        { DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED" },
        scope({ DEVELOPMENT: "enabled" as string }),
        { ...scope(), DEVELOPMENT: true },
        ["ENABLED"],
      ]) {
        await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig004.invalid_scope'`, [JSON.stringify(bad)]);
        for (const env of ENVIRONMENTS) {
          expect((await evaluate(env, "test.mig004.invalid_scope")).json().data.reason_code).toBe("environment_scope_invalid");
        }
      }
    } finally {
      await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig004.invalid_scope'`, [JSON.stringify(scope())]);
      await verifyPool.query(`ALTER TABLE cfg1.feature ADD CONSTRAINT cfg1_feature_environment_scope_valid CHECK (
        jsonb_typeof(environment_scope) = 'object'
        AND environment_scope ?& ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']
        AND (environment_scope - ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']) = '{}'::jsonb
        AND jsonb_typeof(environment_scope->'DEVELOPMENT') = 'string' AND environment_scope->>'DEVELOPMENT' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'TEST') = 'string' AND environment_scope->>'TEST' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'UAT') = 'string' AND environment_scope->>'UAT' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'DEMO') = 'string' AND environment_scope->>'DEMO' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
        AND jsonb_typeof(environment_scope->'PRODUCTION') = 'string' AND environment_scope->>'PRODUCTION' IN ('ENABLED','DISABLED','NOT_APPLICABLE'))`);
    }
  });
});

describe("MIG-004 CFG-FIND-001 trust boundary — CFG-01's own environment is authoritative", () => {
  it("prod CFG-01 + caller asserting dev → environment_mismatch; decision log records prod; Critical mismatch audit; no token", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.trust", "enabled", scope({ DEVELOPMENT: "ENABLED" }));
    const res = await evaluate("prod", "test.mig004.trust", "dev");
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ decision: "deny", reason_code: "environment_mismatch", decision_token: null });

    const log = await verifyPool.query(`SELECT environment, decision, reason_code FROM cfg1.feature_decision_log WHERE decision_id = $1`, [data.decision_id]);
    expect(log.rows).toEqual([{ environment: "prod", decision: "deny", reason_code: "environment_mismatch" }]);
    expect(await tokenRowsFor(data.decision_id)).toEqual([]);

    const events = await auditEvents(data.decision_id);
    const mismatch = events.find((e) => e.event_type === "cfg1.feature_decision.environment_mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("critical");
    expect(mismatch!.metadata).toEqual({ decision_id: data.decision_id, environment: "prod", canonical_environment: "PRODUCTION", asserted_environment: "dev" });
  });

  it("prod CFG-01 + caller asserting prod on a DEVELOPMENT-only feature cannot evaluate as DEVELOPMENT → environment_not_available", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.trust", "enabled", scope({ DEVELOPMENT: "ENABLED" }));
    expect((await evaluate("prod", "test.mig004.trust", "prod")).json().data.reason_code).toBe("environment_not_available");
  });

  it("demo is accepted by the CFG-01 request schema (FND-FIND-013, CFG-01 part)", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.demo", "enabled", scope({ DEMO: "ENABLED" }));
    const own = await evaluate("demo", "test.mig004.demo", "demo");
    expect(own.statusCode).toBe(200);
    expect(own.json().data.decision).toBe("allow");
    // A well-formed but different assertion is a mismatch decision, never a schema rejection.
    const asserted = await evaluate("dev", "test.mig004.demo", "demo");
    expect(asserted.statusCode).toBe(200);
    expect(asserted.json().data.reason_code).toBe("environment_mismatch");
  });

  it("an identifier outside the foundation vocabulary is still a 400 schema failure", async () => {
    if (!ready()) return;
    for (const bad of ["production", "PROD", "STAGING", "development"]) {
      expect((await evaluate("dev", "test.mig004.demo", bad)).statusCode).toBe(400);
    }
  });

  it("a token issued under dev can never verify under a prod-configured CFG-01 (binding mismatch, revoked)", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.cross_env", "enabled", ALL_ENABLED);
    const issued = (await evaluate("dev", "test.mig004.cross_env")).json().data;
    expect(issued.decision).toBe("allow");
    expect((await tokenRowsFor(issued.decision_id))[0].environment).toBe("dev");

    const cross = await verify("prod", issued.decision_token, issued.decision_id, "test.mig004.cross_env", "prod");
    expect(cross.statusCode).toBe(409);
    expect(cross.json().error.code).toBe("CFG1_DECISION_BINDING_MISMATCH");
    expect(await tokenRowsFor(issued.decision_id)).toEqual([{ status: "revoked", revoked_reason: "binding_mismatch", environment: "dev" }]);
  });

  it("verify with a caller assertion that differs from CFG-01's own environment revokes with environment_mismatch", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.verify_mismatch", "enabled", ALL_ENABLED);
    const issued = (await evaluate("dev", "test.mig004.verify_mismatch")).json().data;
    const ok = await verify("dev", issued.decision_token, issued.decision_id, "test.mig004.verify_mismatch");
    expect(ok.statusCode).toBe(200);

    const res = await verify("dev", issued.decision_token, issued.decision_id, "test.mig004.verify_mismatch", "prod");
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CFG1_DECISION_BINDING_MISMATCH");
    expect(await tokenRowsFor(issued.decision_id)).toEqual([{ status: "revoked", revoked_reason: "environment_mismatch", environment: "dev" }]);

    const rejected = (await auditEvents(issued.decision_id)).find((e) => e.event_type === "cfg1.feature_decision.rejected");
    expect(rejected!.metadata).toMatchObject({ environment: "dev", asserted_environment: "prod", revoked_reason: "environment_mismatch" });
  });

  it("an out-of-band flip of the own environment entry to DISABLED revokes an outstanding token on its next verify (environment_unavailable), with no version change", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.fresh", "enabled", ALL_ENABLED);
    const issued = (await evaluate("dev", "test.mig004.fresh")).json().data;
    expect((await verify("dev", issued.decision_token, issued.decision_id, "test.mig004.fresh")).statusCode).toBe(200);

    const before = await verifyPool.query(`SELECT version FROM cfg1.feature WHERE feature_code = 'test.mig004.fresh'`);
    await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig004.fresh'`, [
      JSON.stringify({ ...ALL_ENABLED, DEVELOPMENT: "DISABLED" }),
    ]);
    const after = await verifyPool.query(`SELECT version FROM cfg1.feature WHERE feature_code = 'test.mig004.fresh'`);
    expect(after.rows[0].version).toBe(before.rows[0].version);

    const res = await verify("dev", issued.decision_token, issued.decision_id, "test.mig004.fresh");
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CFG1_DECISION_BINDING_MISMATCH");
    expect(await tokenRowsFor(issued.decision_id)).toEqual([{ status: "revoked", revoked_reason: "environment_unavailable", environment: "dev" }]);
  });
});

describe("MIG-004 precedence and permanent prohibitions", () => {
  it("a prohibited-registry code with a feature row ENABLED everywhere still denies prohibited", async () => {
    if (!ready()) return;
    await upsertFeature("pricing.aix_spread_markup", "enabled", ALL_ENABLED);
    for (const env of ENVIRONMENTS) {
      expect((await evaluate(env, "pricing.aix_spread_markup")).json().data.reason_code).toBe("prohibited");
    }
  });

  it("prohibited + environment mismatch → the decision stays prohibited, the Critical prohibited audit is intact, and the mismatch audit is layered on", async () => {
    if (!ready()) return;
    await upsertFeature("pricing.aix_spread_markup", "enabled", ALL_ENABLED);
    const data = (await evaluate("dev", "pricing.aix_spread_markup", "prod")).json().data;
    expect(data).toMatchObject({ decision: "deny", reason_code: "prohibited", decision_token: null });
    const log = await verifyPool.query(`SELECT environment, reason_code FROM cfg1.feature_decision_log WHERE decision_id = $1`, [data.decision_id]);
    expect(log.rows).toEqual([{ environment: "dev", reason_code: "prohibited" }]);
    const types = (await auditEvents(data.decision_id)).map((e) => e.event_type).sort();
    expect(types).toEqual(["cfg1.feature_decision.environment_mismatch", "cfg1.feature_evaluation.denied", "cfg1.prohibited_feature.blocked"]);
  });

  it("an exchange.* code absent from the registry, with a feature row ENABLED everywhere, denies prohibited (HD-4 structural deny)", async () => {
    if (!ready()) return;
    const registry = await verifyPool.query(`SELECT count(*)::int AS n FROM cfg1.prohibited_feature WHERE feature_code = 'exchange.mig004_unlisted_probe'`);
    expect(registry.rows[0].n).toBe(0);
    await upsertFeature("exchange.mig004_unlisted_probe", "enabled", ALL_ENABLED);
    for (const env of ENVIRONMENTS) {
      expect((await evaluate(env, "exchange.mig004_unlisted_probe")).json().data.reason_code).toBe("prohibited");
    }
    // Prohibited attribution also survives a mismatched assertion.
    expect((await evaluate("dev", "exchange.mig004_unlisted_probe", "prod")).json().data.reason_code).toBe("prohibited");
  });

  it("the structural deny is scoped to exchange. only — a securities_market.* synthetic fixture is not caught by it", async () => {
    if (!ready()) return;
    await upsertFeature("securities_market.mig004_synthetic_probe", "enabled", scope({ DEVELOPMENT: "ENABLED" }));
    expect((await evaluate("dev", "securities_market.mig004_synthetic_probe")).json().data.reason_code).toBe("feature_allowed");
    expect((await evaluate("prod", "securities_market.mig004_synthetic_probe")).json().data.reason_code).toBe("environment_not_available");
  });

  it("an active kill switch denies kill_switch_active even when the environment is ENABLED", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.killed", "enabled", ALL_ENABLED);
    await verifyPool.query(
      `INSERT INTO cfg1.kill_switch (kill_switch_id, feature_code, reason, activated_by, status, activated_at_utc) VALUES ('ks_mig004_it', 'test.mig004.killed', 'mig004 it', 'it', 'active', now())`,
    );
    expect((await evaluate("dev", "test.mig004.killed")).json().data.reason_code).toBe("kill_switch_active");
  });

  it("current_state disabled with the own environment ENABLED denies feature_disabled (DEC-014: environment availability is not activation)", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.state_disabled", "disabled", ALL_ENABLED);
    expect((await evaluate("dev", "test.mig004.state_disabled")).json().data.reason_code).toBe("feature_disabled");
  });

  it("an unknown feature code denies unknown_fail_closed", async () => {
    if (!ready()) return;
    expect((await evaluate("dev", "test.mig004.never_created")).json().data.reason_code).toBe("unknown_fail_closed");
  });
});

describe("MIG-004 HD-2 PRODUCTION hold", () => {
  it.each([["prod"], ["staging"]] as const)("%s: every other check passing (PRODUCTION ENABLED, current_state enabled) → production_activation_absent, no token, decision logged", async (env) => {
    if (!ready()) return;
    await upsertFeature("test.mig004.prod_hold", "enabled", ALL_ENABLED);
    const data = (await evaluate(env, "test.mig004.prod_hold")).json().data;
    expect(data).toMatchObject({ decision: "deny", reason_code: "production_activation_absent", decision_token: null });
    expect(await tokenRowsFor(data.decision_id)).toEqual([]);
    const log = await verifyPool.query(`SELECT environment, reason_code FROM cfg1.feature_decision_log WHERE decision_id = $1`, [data.decision_id]);
    expect(log.rows).toEqual([{ environment: env, reason_code: "production_activation_absent" }]);
  });

  it("the non-production positive path: dev, DEVELOPMENT ENABLED, current_state enabled → allow + a token that verifies", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.dev_allow", "enabled", scope({ DEVELOPMENT: "ENABLED" }));
    const data = (await evaluate("dev", "test.mig004.dev_allow")).json().data;
    expect(data).toMatchObject({ decision: "allow", reason_code: "feature_allowed" });
    expect((await verify("dev", data.decision_token, data.decision_id, "test.mig004.dev_allow")).statusCode).toBe(200);
    expect((await tokenRowsFor(data.decision_id))[0]).toMatchObject({ status: "active", environment: "dev" });
  });

  it("every new reason code fits cfg1.feature_decision_log.reason_code (varchar(32)) — proven by real inserts above and by the column width", async () => {
    if (!ready()) return;
    const width = await verifyPool.query(
      `SELECT character_maximum_length AS n FROM information_schema.columns WHERE table_schema = 'cfg1' AND table_name = 'feature_decision_log' AND column_name = 'reason_code'`,
    );
    for (const code of ["environment_mismatch", "environment_scope_invalid", "environment_not_available", "production_activation_absent"]) {
      expect(code.length).toBeLessThanOrEqual(width.rows[0].n);
    }
  });
});

describe("MIG-004 leaves the feature-scope integrity seal unchanged (CFG-FIND-002 owns that change)", () => {
  it("an environment_scope-only change does not alter computeFeatureScopeHash over the live rows; a current_state change does", async () => {
    if (!ready()) return;
    await upsertFeature("test.mig004.seal", "enabled", scope());
    const read = async () =>
      (
        await verifyPool.query<FeatureSealRow>(
          `SELECT feature_id, feature_code, feature_name, current_state, licence_profile_id, version FROM cfg1.feature`,
        )
      ).rows;
    const before = computeFeatureScopeHash(await read());
    await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig004.seal'`, [JSON.stringify(ALL_ENABLED)]);
    expect(computeFeatureScopeHash(await read())).toBe(before);
    await verifyPool.query(`UPDATE cfg1.feature SET current_state = 'disabled' WHERE feature_code = 'test.mig004.seal'`);
    expect(computeFeatureScopeHash(await read())).not.toBe(before);
  });

  it("FeatureSealRow's hashed allow-list does not include environment_scope", () => {
    const row: FeatureSealRow = { feature_id: "f", feature_code: "c", feature_name: "n", current_state: "enabled", licence_profile_id: null, version: 1 };
    const withScope = { ...row, environment_scope: ALL_ENABLED } as unknown as FeatureSealRow;
    expect(computeFeatureScopeHash([withScope])).toBe(computeFeatureScopeHash([row]));
  });
});
