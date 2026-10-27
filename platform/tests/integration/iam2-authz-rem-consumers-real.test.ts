/**
 * IAM02-AUTHZ-REM-001 — effect of the remediation on ALL SIX integrated consumers (CLT-01,
 * KYC-01, AML-01, CFG-01, SEC-01, WLT-01) without touching consumer production code
 * (T-07, T-42, T-45 consumer leg).
 *
 * A REAL IAM-02 application is booted and LISTENS on an ephemeral port (as
 * cfg1-iam2-guard-real.test.ts does), backed by the disposable Postgres under a
 * `role_iam2_runtime` login. Each consumer's OWN, unmodified `lib/iam2-client.ts`
 * `verifyDecisionToken` is called over real HTTP against it for that consumer's real
 * redeemed (action, resource) pair — so what is asserted is what the consumer's route code
 * would receive.
 *
 * HONEST LIMITS (reported, not hidden): (1) this exercises each consumer's CLIENT function
 * and redemption contract, not each consumer's full HTTP route; (2) the approval payload is
 * BUILT BY THIS HARNESS (it stands in for the operator-built payload — the request-time
 * delivery gap OD-2 is a separate consumer/UAT dependency and is NOT shown closed here);
 * (3) policy rows, role grants and the IAM-01 assertion are SYNTHETIC test fixtures on a
 * disposable database — they are NOT the unapproved production policy matrix or role
 * provisioning (D-5/D-6 remain unapproved) — and the rows are retired (status `inactive`)
 * at the end; (4) IAM-01 is the DI stub, identity facts are covered by the real-IAM-01 file.
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (IMPL-02 / N-1 convention). With TEST_DATABASE_URL unset the
 * suite is skipped with an explicit, named reason. With it SET, the database must hold foundation, iam
 * and iam2 (006, 072) migrated and the fnd/iam/iam2 grant files applied; if it does not (or is
 * unreachable, or the test login role / listening app cannot be prepared) EVERY test FAILS with the
 * prerequisite evidence. There is no early-return that passes.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, fingerprint, initPool } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp } from "../../services/iam2/src/server.js";
import { verifyDecisionToken as clt1Verify } from "../../services/clt1/src/lib/iam2-client.js";
import { verifyDecisionToken as kyc1Verify } from "../../services/kyc1/src/lib/iam2-client.js";
import { verifyDecisionToken as aml1Verify } from "../../services/aml1/src/lib/iam2-client.js";
import { verifyDecisionToken as cfg1Verify } from "../../services/cfg1/src/lib/iam2-client.js";
import { verifyDecisionToken as sec1Verify } from "../../services/sec1/src/lib/iam2-client.js";
import { verifyDecisionToken as wlt1Verify } from "../../services/wlt1/src/lib/iam2-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_authz_rem_consumers_rt";
const TOKEN = "test-iam2-authz-rem-consumers-token";
const internal = { "x-internal-service-token": TOKEN };

const config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: TOKEN,
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-unused",
  bootstrapTransitionEnabled: false,
};

type Verify = (cfg: { baseUrl: string; internalServiceToken: string }, input: { decisionToken: string; approvalId?: string; actorId: string; action: string; resource: string; entityId?: string; currentPayloadHash?: string }) => Promise<{ authorised: boolean; reason?: string }>;

const CONSUMERS: Array<{ module: string; verify: Verify; pairs: Array<{ action: string; resource: string }> }> = [
  { module: "CLT-01", verify: clt1Verify as unknown as Verify, pairs: [{ action: "clt1.client_profile.suspend", resource: "client_profile" }, { action: "clt1.application.approve", resource: "application" }] },
  { module: "KYC-01", verify: kyc1Verify as unknown as Verify, pairs: [{ action: "kyc1.outcome.override", resource: "cdd_outcome" }] },
  { module: "AML-01", verify: aml1Verify as unknown as Verify, pairs: [{ action: "aml1.match.confirm", resource: "screening_match" }] },
  { module: "CFG-01", verify: cfg1Verify as unknown as Verify, pairs: [{ action: "cfg1.feature.enable", resource: "feature" }, { action: "cfg1.licence_profile.activate", resource: "licence_profile" }] },
  { module: "SEC-01", verify: sec1Verify as unknown as Verify, pairs: [{ action: "sec1.security_alert.close", resource: "security_alert" }] },
  { module: "WLT-01", verify: wlt1Verify as unknown as Verify, pairs: [{ action: "wlt1.destination.approve_apply", resource: "destination" }, { action: "wlt1.evidence_export.apply", resource: "evidence_export" }] },
];

let app: FastifyInstance;
let verifyPool: Pool;
let baseUrl = "";
/** Set when a prerequisite is unavailable; every test then FAILS with this evidence. */
let prerequisiteError: Error | undefined;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the six-consumer IAM-02 contract tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL with foundation, iam and iam2 (incl. migration 072) migrated and the fnd/iam/iam2 grant files applied.";

// Explicit, named skip when the database environment is not configured.
// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM02-AUTHZ-REM-001 — six integrated consumers against a real listening IAM-02 (consumer production code unmodified) (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

/** Everything this file needs that a configured TEST_DATABASE_URL must already provide. */
async function missingPrerequisites(pool: Pool, extraGrants: Array<[table: string, privilege: string]>): Promise<string[]> {
  const missing: string[] = [];
  const schemas = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('foundation','iam','iam2')`,
  );
  const have = new Set(schemas.rows.map((r) => r.schema_name));
  for (const s of ["foundation", "iam", "iam2"]) if (!have.has(s)) missing.push(`schema ${s} is missing (run migrate:up)`);
  const role = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'role_iam2_runtime'`);
  if ((role.rowCount ?? 0) === 0) missing.push("role role_iam2_runtime is missing (create the runtime roles before migrating)");
  if (have.has("iam2")) {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'iam2' AND table_name = 'approval_request' AND column_name = 'snapshot_taken_at_utc'`,
    );
    if ((col.rowCount ?? 0) === 0) missing.push("migration 072 is not applied (iam2.approval_request.snapshot_taken_at_utc is missing)");
    if ((role.rowCount ?? 0) > 0) {
      for (const [table, privilege] of [["iam2.approval_request", "SELECT"], ...extraGrants]) {
        const grant = await pool.query<{ ok: boolean | null }>(
          `SELECT to_regclass($1) IS NOT NULL AND has_table_privilege('role_iam2_runtime', $1, $2) AS ok`,
          [table, privilege],
        );
        if (grant.rows[0]?.ok !== true) missing.push(`iam2_runtime_grants.sql is not applied (role_iam2_runtime lacks ${privilege} on ${table})`);
      }
    }
  }
  return missing;
}
const insertedPolicies: string[] = [];

const iam01Stub = (async (_u: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { recent_auth_assertion: string; required_purpose: string };
  const [, userId, purpose] = String(body.recent_auth_assertion).split("|");
  if (purpose !== body.required_purpose) return { ok: false, json: async () => ({}) } as Response;
  return {
    ok: true,
    json: async () => ({ success: true, data: { valid: true, user_id: userId, auth_level: "mfa", fresh_until_utc: new Date(Date.now() + 600_000).toISOString(), user_type: "staff", user_class: "staff", user_status: "active" } }),
  } as Response;
}) as unknown as typeof fetch;

async function permissionId(code: string): Promise<string> {
  const r = await verifyPool.query<{ permission_id: string }>(`SELECT permission_id FROM iam2.permission WHERE permission_code = $1`, [code]);
  if (!r.rows[0]) throw new Error("permission not registered: " + code);
  return r.rows[0].permission_id;
}
async function grant(userId: string, codes: string[]): Promise<string> {
  const roleId = "role_cons_" + randomUUID();
  await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status) VALUES ($1,$2,$2,'staff','normal','active')`, [roleId, "cons_" + randomUUID().slice(0, 12)]);
  for (const code of codes) await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [roleId, await permissionId(code)]);
  await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [userId, roleId]);
  return roleId;
}
async function syntheticPolicy(action: string, resource: string): Promise<void> {
  const id = "policy_cons_" + randomUUID();
  const r = await verifyPool.query(
    `INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
     VALUES ($1,$2,$3,'count','[]'::jsonb,1,true,60,'active') ON CONFLICT (action, resource) WHERE status = 'active' DO NOTHING RETURNING policy_id`,
    [id, action, resource],
  );
  if ((r.rowCount ?? 0) > 0) insertedPolicies.push(id);
}

async function issue(pair: { action: string; resource: string }, entityId: string, payload: Record<string, unknown>): Promise<{ maker: string; makerRoleId: string; approvalId: string; token: string }> {
  const maker = "user_cons_maker_" + randomUUID();
  const approver = "user_cons_appr_" + randomUUID();
  const makerRoleId = await grant(maker, ["iam2.approval.create", pair.action]);
  await grant(approver, ["iam2.approval.approve"]);
  const req = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: maker, action: pair.action, resource: pair.resource, entity_id: entityId, payload } });
  expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
  const approvalId = req.json().data.approval_id as string;
  const ap = await app.inject({ method: "POST", url: `/iam2/approvals/${approvalId}/approve`, headers: internal, payload: { approver_user_id: approver, recent_auth_assertion: ["asrt", approver, `iam2_approval:${approvalId}`].join("|") } });
  expect(ap.statusCode, JSON.stringify(ap.json())).toBe(200);
  return { maker, makerRoleId, approvalId, token: ap.json().data.decision_token as string };
}

describe.skipIf(!TEST_DB)("IAM02-AUTHZ-REM-001 — six integrated consumers against a real listening IAM-02 (consumer production code unmodified)", () => {
  beforeAll(async () => {
    try {
      verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
      const missing = await missingPrerequisites(verifyPool, [["iam2.approval_decision", "INSERT"], ["iam2.permission_decision_token", "INSERT"]]);
      if (missing.length > 0) {
        prerequisiteError = new Error(
          `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the IAM-02 test database is not ready: ${missing.join("; ")}. ` +
            "Run migrate:up (001-072) and apply infra/grants/{fnd,iam,iam2}_runtime_grants.sql; this test refuses to pass without running.",
        );
        return;
      }
      await verifyPool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN; END IF; END $$;`);
      await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER}`);
      initPool((TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`));
      config.iam01FetchImpl = iam01Stub;
      app = await buildApp(config);
      await app.listen({ port: 0, host: "127.0.0.1" });
      const addr = app.server.address();
      baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      for (const c of CONSUMERS) for (const p of c.pairs) await syntheticPolicy(p.action, p.resource);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the test environment could not be prepared: [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)}. ` +
          "Use a superuser (or CREATEROLE) URL to a migrated database; this test refuses to pass without running.",
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (verifyPool && insertedPolicies.length > 0) {
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = ANY($1::varchar[])`, [insertedPolicies]);
    }
    if (app) await app.close();
    if (verifyPool) await verifyPool.end();
    await closePool();
  });

  for (const consumer of CONSUMERS) {
    for (const pair of consumer.pairs) {
      it(`${consumer.module} ${pair.action}: real approval redeems exactly once; a later revocation of the maker's grant is refused through the consumer's own client`, async () => {
        assertPrerequisites();
        const cfg = { baseUrl, internalServiceToken: TOKEN };
        const entityId = "ent_" + randomUUID().slice(0, 12);
        const payload = { harness_built: true, n: randomUUID() };
        const hash = fingerprint(payload);
        const redeem = (t: { maker: string; approvalId: string; token: string }, over: Record<string, unknown> = {}) =>
          consumer.verify(cfg, { decisionToken: t.token, approvalId: t.approvalId, actorId: t.maker, action: pair.action, resource: pair.resource, entityId, currentPayloadHash: hash, ...over });

        const ok = await issue(pair, entityId, payload);
        expect(await redeem(ok)).toEqual({ authorised: true });
        expect(await redeem(ok)).toMatchObject({ authorised: false, reason: "IAM2_DECISION_TOKEN_INVALID" }); // single use

        const revoked = await issue(pair, entityId, payload);
        await verifyPool.query(`UPDATE iam2.role_permission SET status = 'revoked', revoked_at_utc = now() WHERE role_id = $1`, [revoked.makerRoleId]);
        expect(await redeem(revoked)).toMatchObject({ authorised: false, reason: "IAM2_PERMISSION_DENIED" });

        const wrongApproval = await issue(pair, entityId, payload);
        expect(await redeem(wrongApproval, { approvalId: "appr_FABRICATED_" + randomUUID().slice(0, 6) })).toMatchObject({ authorised: false, reason: "IAM2_DECISION_TOKEN_INVALID" });

        const wrongPayload = await issue(pair, entityId, payload);
        expect(await redeem(wrongPayload, { currentPayloadHash: fingerprint({ tampered: 1 }) })).toMatchObject({ authorised: false, reason: "IAM2_PAYLOAD_HASH_MISMATCH" });
      });
    }
  }

  it("SEC-01 (N1 inverted through the consumer's own client): a guard-issued token for the UNFLAGGED sec1.security_alert.close plus a fabricated approval_id no longer authorises", async () => {
    assertPrerequisites();
    const cfg = { baseUrl, internalServiceToken: TOKEN };
    const actor = "user_cons_sec1_" + randomUUID();
    await grant(actor, ["sec1.security_alert.close"]);
    const alertId = "alert_" + randomUUID();
    const hash = fingerprint({ alert_id: alertId, severity: "critical", closure_reason: "x", closure_evidence_ref: "y" });
    const check = await app.inject({ method: "POST", url: "/internal/iam2/permission/check", headers: internal, payload: { actor_id: actor, action: "sec1.security_alert.close", resource: "security_alert", entity_id: alertId, payload_hash: hash } });
    expect(check.json().data.decision).toBe("allow");
    const token = check.json().data.decision_token as string;
    const res = await sec1Verify(cfg, { decisionToken: token, approvalId: "appr_FABRICATED_never_existed", actorId: actor, action: "sec1.security_alert.close", resource: "security_alert", entityId: alertId, currentPayloadHash: hash });
    expect(res.authorised).toBe(false);
  });

  it("the WLT-01 apply paths (which run NO advisory baseline) are now gated by the central maker-entitlement recheck", async () => {
    assertPrerequisites();
    const cfg = { baseUrl, internalServiceToken: TOKEN };
    for (const pair of CONSUMERS.find((c) => c.module === "WLT-01")!.pairs) {
      const entityId = "ent_" + randomUUID().slice(0, 12);
      const payload = { wlt1_apply: randomUUID() };
      const t = await issue(pair, entityId, payload);
      await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [t.maker, await permissionId(pair.action)]);
      const res = await wlt1Verify(cfg, { decisionToken: t.token, approvalId: t.approvalId, actorId: t.maker, action: pair.action, resource: pair.resource, entityId, currentPayloadHash: fingerprint(payload) });
      expect(res, pair.action).toMatchObject({ authorised: false, reason: "IAM2_PERMISSION_DENIED" });
    }
  });
});
