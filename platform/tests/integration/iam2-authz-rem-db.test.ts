/**
 * IAM02-AUTHZ-REM-001 — approval-authorisation remediation: negative / security / audit /
 * concurrency integration tests (plan §8, T-01 … T-54 where they are application-level).
 *
 * HTTP-level by design: every test drives the REAL IAM-02 application (`buildApp`) over
 * `app.inject`, backed by a Postgres migrated from scratch with the fnd, iam and iam2 grant
 * files, under a LOGIN role that is a member of `role_iam2_runtime` ONLY (no superuser, no
 * BYPASSRLS). A separate superuser pool is used only to seed fixtures and to simulate
 * privileged-SQL revocation / tampering (the runtime role has no revoke path) and to verify
 * what actually landed. IAM-01 is stubbed through the same `iam01FetchImpl` DI seam the
 * existing suite uses; the stub models IAM-01's real purpose binding (an assertion minted for
 * purpose P is rejected for any other purpose), so cross-approval and cross-user negatives are
 * meaningful. The REAL-IAM-01 end-to-end identity tests live in
 * tests/integration/iam2-authz-rem-iam01-e2e.test.ts.
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (N-1, IMPL-02 convention). With TEST_DATABASE_URL unset
 * the suite is skipped with an explicit, named reason. With it SET, the database must hold
 * foundation (001, 005), iam (002-004) and iam2 (006, 072) migrated and the fnd/iam/iam2 grant
 * files applied; if it does not (or is unreachable, or the test login role cannot be prepared),
 * EVERY test FAILS with the prerequisite evidence. There is no early-return that passes.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, fingerprint, initPool } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp } from "../../services/iam2/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_authz_rem_rt";
const TOKEN = "test-iam2-authz-rem-internal-token";
const internal = { "x-internal-service-token": TOKEN };

const config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-iam2-authz-rem-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: TOKEN,
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-authz-rem-secret",
  bootstrapTransitionEnabled: false,
};

let app: FastifyInstance;
let verifyPool: Pool;
let runtimePool: Pool;
/** Set when a prerequisite is unavailable; every test then FAILS with this evidence. */
let prerequisiteError: Error | undefined;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the IAM-02 approval-authorisation database tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL with foundation, iam and iam2 (incl. migration 072) migrated and the fnd/iam/iam2 grant files applied.";

// Explicit, named skip when the database environment is not configured.
// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM02-AUTHZ-REM-001 — approval authorisation (integration, runtime role) (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

/** Everything this file needs that a configured TEST_DATABASE_URL must already provide. */
async function missingPrerequisites(pool: Pool): Promise<string[]> {
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
      const grant = await pool.query<{ ok: boolean | null }>(
        `SELECT to_regclass('iam2.approval_request') IS NOT NULL AND has_table_privilege('role_iam2_runtime', 'iam2.approval_request', 'SELECT') AS ok`,
      );
      if (grant.rows[0]?.ok !== true) missing.push("iam2_runtime_grants.sql is not applied (role_iam2_runtime cannot SELECT iam2.approval_request)");
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------------------
// IAM-01 stub that models its purpose binding. The "assertion" is a self-describing string:
//   asrt|<userId>|<purpose>|k=v|k=v     (k: type, class, status, fresh, omit, invalid)
// verify-assertion succeeds only when the REQUIRED purpose equals the assertion's purpose.
// ---------------------------------------------------------------------------------------
let iam01Calls: Array<{ requiredPurpose: string; assertion: string }> = [];

function assertionFor(userId: string, approvalId: string, extras: Record<string, string | undefined> = {}): string {
  return ["asrt", userId, `iam2_approval:${approvalId}`, ...Object.entries(extras).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`)].join("|");
}

const iam01Stub = (async (_url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { recent_auth_assertion: string; required_purpose: string };
  iam01Calls.push({ requiredPurpose: body.required_purpose, assertion: body.recent_auth_assertion });
  const [tag, userId, purpose, ...rest] = String(body.recent_auth_assertion).split("|");
  const extras = Object.fromEntries(rest.map((e) => e.split("=") as [string, string]));
  if (tag !== "asrt" || purpose !== body.required_purpose || extras.invalid) {
    return { ok: false, json: async () => ({}) } as Response;
  }
  const data: Record<string, unknown> = {
    valid: true,
    user_id: userId,
    auth_level: "mfa",
    fresh_until_utc: extras.fresh ?? new Date(Date.now() + 600_000).toISOString(),
    user_type: extras.type ?? "staff",
    user_class: extras.class ?? "staff",
    user_status: extras.status ?? "active",
  };
  for (const omitted of (extras.omit ?? "").split(",").filter(Boolean)) delete data[omitted];
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}) as unknown as typeof fetch;

// ---------------------------------------------------------------------------------------
// Fixtures (superuser pool).
// ---------------------------------------------------------------------------------------
async function seedPermission(code: string, resource: string): Promise<string> {
  const id = "perm_rem_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.permission (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
     VALUES ($1,$2,$3,'rem','normal',false,false,false,false,'active','TEST')`,
    [id, code, resource],
  );
  return id;
}
async function permissionId(code: string): Promise<string> {
  const r = await verifyPool.query<{ permission_id: string }>(`SELECT permission_id FROM iam2.permission WHERE permission_code = $1`, [code]);
  if (!r.rows[0]) throw new Error("fixture: permission missing " + code);
  return r.rows[0].permission_id;
}
async function grant(userId: string, codes: Array<{ code: string; resource: string }>): Promise<string> {
  const roleId = "role_rem_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status) VALUES ($1,$2,$2,'staff','normal','active')`,
    [roleId, "rem_" + randomUUID().slice(0, 12)],
  );
  for (const c of codes) {
    let pid: string;
    try {
      pid = await permissionId(c.code);
    } catch {
      pid = await seedPermission(c.code, c.resource);
    }
    await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [roleId, pid]);
  }
  await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [userId, roleId]);
  return roleId;
}
async function namedRole(userId: string, roleCode: string): Promise<void> {
  const roleId = "role_rem_" + randomUUID();
  await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status) VALUES ($1,$2,$2,'staff','normal','active')`, [roleId, roleCode]);
  await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [userId, roleId]);
}
async function seedPolicy(
  action: string,
  resource: string,
  o: { status?: string; requiredCount?: number; roles?: string[]; stepUp?: boolean } = {},
): Promise<string> {
  const id = "policy_rem_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
     VALUES ($1,$2,$3,'count',$4::jsonb,$5,$6,1440,$7)`,
    [id, action, resource, JSON.stringify(o.roles ?? []), o.requiredCount ?? 1, o.stepUp ?? true, o.status ?? "active"],
  );
  return id;
}
async function ensureRoleAssignPolicy(): Promise<void> {
  await verifyPool.query(
    `INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
     VALUES ($1,'iam2.role.assign_user','role','count','[]'::jsonb,1,true,1440,'active')
     ON CONFLICT (action, resource) WHERE status = 'active' DO NOTHING`,
    ["policy_rem_roleassign_" + randomUUID()],
  );
}

interface Scenario {
  action: string;
  resource: string;
  maker: string;
  approver: string;
  entityId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  makerRoleId: string;
  actionPermissionId: string;
  policyId: string;
}

async function newScenario(o: { policy?: Parameters<typeof seedPolicy>[2] | false; makerGrants?: "full" | "create-only" | "none"; approverGrants?: boolean } = {}): Promise<Scenario> {
  const action = "iam2.rem.act_" + randomUUID().slice(0, 8);
  const resource = "rem_resource";
  const maker = "user_rem_maker_" + randomUUID();
  const approver = "user_rem_appr_" + randomUUID();
  const entityId = "ent_" + randomUUID().slice(0, 12);
  const payload = { rem: randomUUID() };
  const actionPermissionId = await seedPermission(action, resource);
  let makerRoleId = "";
  const mg = o.makerGrants ?? "full";
  if (mg === "full") makerRoleId = await grant(maker, [{ code: "iam2.approval.create", resource: "approval" }, { code: action, resource }]);
  else if (mg === "create-only") makerRoleId = await grant(maker, [{ code: "iam2.approval.create", resource: "approval" }]);
  if (o.approverGrants !== false) {
    await grant(approver, [
      { code: "iam2.approval.approve", resource: "approval" },
      { code: "iam2.approval.reject", resource: "approval" },
    ]);
  }
  const policyId = o.policy === false ? "" : await seedPolicy(action, resource, o.policy ?? {});
  return { action, resource, maker, approver, entityId, payload, payloadHash: fingerprint(payload), makerRoleId, actionPermissionId, policyId };
}

function request(s: Scenario, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/iam2/approvals/request",
    headers: internal,
    payload: { maker_user_id: s.maker, action: s.action, resource: s.resource, entity_id: s.entityId, payload: s.payload, ...over },
  });
}
function approve(approvalId: string, approver: string, assertion?: string) {
  return app.inject({
    method: "POST",
    url: `/iam2/approvals/${approvalId}/approve`,
    headers: internal,
    payload: { approver_user_id: approver, ...(assertion !== undefined ? { recent_auth_assertion: assertion } : {}) },
  });
}
function reject(approvalId: string, rejecter: string) {
  return app.inject({ method: "POST", url: `/iam2/approvals/${approvalId}/reject`, headers: internal, payload: { approver_user_id: rejecter } });
}
function execute(s: Scenario, token: string, approvalId: string | undefined, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/internal/iam2/permission/execute-verify",
    headers: internal,
    payload: {
      decision_token: token,
      ...(approvalId !== undefined ? { approval_id: approvalId } : {}),
      actor_id: s.maker,
      action: s.action,
      resource: s.resource,
      entity_id: s.entityId,
      current_payload_hash: s.payloadHash,
      ...over,
    },
  });
}

/** request -> approve with a valid assertion -> { approvalId, token }. */
async function approvedToken(s: Scenario): Promise<{ approvalId: string; token: string }> {
  const req = await request(s);
  expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
  const approvalId = req.json().data.approval_id as string;
  const ap = await approve(approvalId, s.approver, assertionFor(s.approver, approvalId));
  expect(ap.statusCode, JSON.stringify(ap.json())).toBe(200);
  return { approvalId, token: ap.json().data.decision_token as string };
}

async function outbox(eventType: string, contains: string): Promise<number> {
  const r = await verifyPool.query(`SELECT 1 FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [eventType, `%${contains}%`]);
  return r.rowCount ?? 0;
}
async function decisionLog(actor: string, action: string): Promise<Array<{ decision: string; reason_code: string }>> {
  const r = await verifyPool.query<{ decision: string; reason_code: string }>(
    `SELECT decision, reason_code FROM iam2.permission_decision_log WHERE actor_user_id = $1 AND action = $2 ORDER BY occurred_at_utc`,
    [actor, action],
  );
  return r.rows;
}
async function approvalStatus(approvalId: string): Promise<string | undefined> {
  const r = await verifyPool.query<{ status: string }>(`SELECT status FROM iam2.approval_request WHERE approval_id = $1`, [approvalId]);
  return r.rows[0]?.status;
}
async function cacheVersion(subject: string): Promise<number> {
  const r = await verifyPool.query<{ cache_version: number }>(`SELECT cache_version FROM iam2.permission_cache_version WHERE subject_id = $1`, [subject]);
  return r.rows[0]?.cache_version ?? 0;
}

describe.skipIf(!TEST_DB)("IAM02-AUTHZ-REM-001 — approval authorisation (integration, runtime role)", () => {
  beforeAll(async () => {
    try {
      verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
      const missing = await missingPrerequisites(verifyPool);
      if (missing.length > 0) {
        prerequisiteError = new Error(
          `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the IAM-02 test database is not ready: ${missing.join("; ")}. ` +
            "Run migrate:up (001-072) and apply infra/grants/{fnd,iam,iam2}_runtime_grants.sql; this test refuses to pass without running.",
        );
        return;
      }
      await verifyPool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN; END IF; END $$;`);
      await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER}`);
      const runtimeUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
      initPool(runtimeUrl);
      runtimePool = new Pool({ connectionString: runtimeUrl });
      config.iam01FetchImpl = iam01Stub;
      app = await buildApp(config);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the test environment could not be prepared: [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)}. ` +
          "Use a superuser (or CREATEROLE) URL to a migrated database; this test refuses to pass without running.",
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (app) await app.close();
    if (runtimePool) await runtimePool.end();
    if (verifyPool) await verifyPool.end();
    await closePool();
  });

  // =======================================================================================
  describe("create: maker entitlement, policy and snapshot (AZ-01, AZ-06, AZ-18; T-01, T-02, T-15, T-16, T-20, T-38)", () => {
    it("T-01: iam2.approval.create alone is insufficient — the UNDERLYING permission is required; denial evidence commits and no request row exists", async () => {
      assertPrerequisites();
      const s = await newScenario({ makerGrants: "create-only" });
      const res = await request(s);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      const rows = await verifyPool.query(`SELECT 1 FROM iam2.approval_request WHERE maker_user_id = $1`, [s.maker]);
      expect(rows.rowCount).toBe(0);
      const log = await decisionLog(s.maker, s.action);
      expect(log.some((l) => l.decision === "deny")).toBe(true);
    });

    it("T-02: an unprovisioned maker (no iam2.approval.create either) is refused with committed evidence", async () => {
      assertPrerequisites();
      const s = await newScenario({ makerGrants: "none" });
      const res = await request(s);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      const log = await decisionLog(s.maker, "iam2.approval.create");
      expect(log.length).toBeGreaterThan(0);
      expect(log[0]!.decision).toBe("deny");
    });

    it("T-15: an ABSENT policy fails closed (never the silent 1-approval/no-step-up/24h default), with audit evidence and no request row", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: false });
      const res = await request(s);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_POLICY_MISSING");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_request WHERE maker_user_id = $1`, [s.maker])).rowCount).toBe(0);
      expect(await outbox("iam2.approval_request_denied", s.maker)).toBeGreaterThan(0);
    });

    it("T-16: an unknown (unregistered) action is refused", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: false });
      const res = await request(s, { action: "iam2.rem.never_registered_" + randomUUID().slice(0, 6) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_UNKNOWN");
    });

    it("T-20: a second ACTIVE policy for one (action, resource) is rejected by the database; a resource that differs from the registered permission is refused", async () => {
      assertPrerequisites();
      const s = await newScenario();
      await expect(seedPolicy(s.action, s.resource)).rejects.toMatchObject({ code: "23505" });
      // A retired/revoked duplicate is fine (the unique index ignores non-active rows).
      await expect(seedPolicy(s.action, s.resource, { status: "inactive" })).resolves.toBeTruthy();
      const res = await request(s, { resource: "some_other_resource" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_RESOURCE_MISMATCH");
    });

    it("T-38 / AZ-18: a policy with a TRUE count of 2 stays stored as 2; a request under it is refused fail-closed (no row, evidence committed) and is never derived at count 1", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: { requiredCount: 2 } });
      const res = await request(s);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_MULTI_APPROVER_UNSUPPORTED");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_request WHERE maker_user_id = $1`, [s.maker])).rowCount).toBe(0);
      const pol = await verifyPool.query(`SELECT required_approval_count FROM iam2.approval_policy WHERE policy_id = $1`, [s.policyId]);
      expect(pol.rows[0]?.required_approval_count).toBe(2);
      expect(await outbox("iam2.approval_request_denied", s.maker)).toBeGreaterThan(0);
      // Defence in depth: the 072 snapshot CHECK rejects a snapshotted request with count 2.
      await expect(
        verifyPool.query(
          `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc,
             snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type)
           VALUES ($1,$2,$3,$4,$5,'pending',2,0, now() + interval '1 hour', now(), true, '[]'::jsonb, 'count')`,
          ["appr_rem_" + randomUUID(), s.policyId, s.maker, s.action, s.resource],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("C-5: the request carries a SNAPSHOT of step-up, checker roles and threshold type, and the policy's later change does not alter it", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: { roles: ["checker_x"], stepUp: true } });
      const res = await request(s);
      expect(res.statusCode).toBe(200);
      const id = res.json().data.approval_id as string;
      const row = await verifyPool.query(
        `SELECT policy_id, snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type, required_count FROM iam2.approval_request WHERE approval_id = $1`,
        [id],
      );
      expect(row.rows[0]).toMatchObject({ policy_id: s.policyId, snapshot_requires_step_up: true, snapshot_required_approver_roles: ["checker_x"], snapshot_threshold_type: "count", required_count: 1 });
      expect(row.rows[0]?.snapshot_taken_at_utc).toBeTruthy();
      await verifyPool.query(`UPDATE iam2.approval_policy SET required_approver_roles = '[]'::jsonb, requires_step_up = false WHERE policy_id = $1`, [s.policyId]);
      const after = await verifyPool.query(`SELECT snapshot_requires_step_up, snapshot_required_approver_roles FROM iam2.approval_request WHERE approval_id = $1`, [id]);
      expect(after.rows[0]).toMatchObject({ snapshot_requires_step_up: true, snapshot_required_approver_roles: ["checker_x"] });
    });
  });

  // =======================================================================================
  describe("approve: entitlement and mandatory step-up (AZ-04, AZ-05; T-09 … T-14, T-53)", () => {
    it("T-09: create/approve/reject are each refused without their own permission, with a deny override, with a revoked role, with an inactive grant, and for a zero-role actor", async () => {
      assertPrerequisites();
      const s = await newScenario({ approverGrants: false });
      const req = await request(s);
      const id = req.json().data.approval_id as string;

      // approve: unprovisioned approver holding a VALID assertion is still refused (entitlement ≠ step-up).
      const noGrant = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(noGrant.statusCode).toBe(403);
      expect(noGrant.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      expect((await decisionLog(s.approver, "iam2.approval.approve")).some((l) => l.decision === "deny")).toBe(true);

      // reject: zero-role actor refused.
      const rejNoGrant = await reject(id, s.approver);
      expect(rejNoGrant.statusCode).toBe(403);
      expect(rejNoGrant.json().error.code).toBe("IAM2_PERMISSION_DENIED");

      // Provision, then deny override on approve -> refused.
      const roleId = await grant(s.approver, [{ code: "iam2.approval.approve", resource: "approval" }, { code: "iam2.approval.reject", resource: "approval" }]);
      await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [s.approver, await permissionId("iam2.approval.approve")]);
      const denied = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      expect((await decisionLog(s.approver, "iam2.approval.approve")).some((l) => l.reason_code === "explicit_deny_override")).toBe(true);

      // Revoked role_permission / revoked user_role -> refused for reject too.
      await verifyPool.query(`UPDATE iam2.role_permission SET status = 'revoked', revoked_at_utc = now() WHERE role_id = $1`, [roleId]);
      const rejInactive = await reject(id, s.approver);
      expect(rejInactive.statusCode).toBe(403);
      await verifyPool.query(`UPDATE iam2.role_permission SET status = 'active', revoked_at_utc = NULL WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`UPDATE iam2.user_role SET status = 'revoked', revoked_at_utc = now() WHERE user_id = $1`, [s.approver]);
      const rejRevokedRole = await reject(id, s.approver);
      expect(rejRevokedRole.statusCode).toBe(403);
      expect(await approvalStatus(id)).toBe("pending");

      // create: a maker lacking iam2.approval.create is refused (T-09 create leg).
      const s2 = await newScenario({ makerGrants: "none" });
      expect((await request(s2)).statusCode).toBe(403);
    });

    it("T-10: no assertion -> step-up required, IAM-01 is never called, the denial is recorded and the request stays pending", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      iam01Calls = [];
      const res = await approve(id, s.approver);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      expect(iam01Calls.length).toBe(0);
      expect((await decisionLog(s.approver, "iam2.approval.approve")).some((l) => l.decision === "step_up_required")).toBe(true);
      expect(await approvalStatus(id)).toBe("pending");
    });

    it("T-10b: step-up is UNCONDITIONAL — a policy/snapshot with requires_step_up = false cannot relax it", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: { stepUp: false } });
      const id = (await request(s)).json().data.approval_id as string;
      const res = await approve(id, s.approver);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("IAM2_STEP_UP_INVALID");
    });

    it("T-11: an invalid assertion, an expired assertion, and an unreachable IAM-01 all fail closed with evidence; the request stays pending", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      const invalid = await approve(id, s.approver, assertionFor(s.approver, id, { invalid: "1" }));
      expect(invalid.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      const expired = await approve(id, s.approver, assertionFor(s.approver, id, { fresh: new Date(Date.now() - 1000).toISOString() }));
      expect(expired.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      const prev = config.iam01FetchImpl;
      config.iam01FetchImpl = (async () => {
        throw new Error("simulated network failure");
      }) as unknown as typeof fetch;
      const unreachable = await approve(id, s.approver, assertionFor(s.approver, id));
      config.iam01FetchImpl = prev;
      expect(unreachable.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      expect(await approvalStatus(id)).toBe("pending");
      expect((await decisionLog(s.approver, "iam2.approval.approve")).filter((l) => l.decision === "step_up_required").length).toBeGreaterThanOrEqual(3);
    });

    it("T-12: ANOTHER user's valid assertion is refused (R2 inverted) — no decision row is written", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      const other = "user_rem_other_" + randomUUID();
      const res = await approve(id, s.approver, assertionFor(other, id));
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [id])).rowCount).toBe(0);
      expect(await approvalStatus(id)).toBe("pending");
    });

    it("T-13: an assertion minted for ANOTHER approval is refused; IAM-02 asks IAM-01 for the approval-specific purpose (X-1 / C-4)", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const idA = (await request(s)).json().data.approval_id as string;
      const s2 = { ...s, entityId: "ent_" + randomUUID().slice(0, 12) };
      const idB = (await request(s2)).json().data.approval_id as string;
      iam01Calls = [];
      const res = await approve(idB, s.approver, assertionFor(s.approver, idA));
      expect(res.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      expect(iam01Calls[0]?.requiredPurpose).toBe(`iam2_approval:${idB}`);
      expect(await approvalStatus(idB)).toBe("pending");
      // The generic legacy purpose is no longer accepted either.
      const generic = await approve(idB, s.approver, ["asrt", s.approver, "iam2_approval"].join("|"));
      expect(generic.json().error.code).toBe("IAM2_STEP_UP_INVALID");
    });

    it("T-14: a forged step-up object, a smuggled body field and an unentitled actor holding a valid assertion cannot establish step-up", async () => {
      assertPrerequisites();
      const { evaluatePermissionWithStepUp } = await import("../../services/iam2/src/lib/guard.js");
      const { createRequestContext, runWithContext } = await import("@aix/foundation");
      const actor = "user_rem_forge_" + randomUUID();
      await grant(actor, [{ code: "iam2.approval.approve", resource: "approval" }]);
      const forged = { userId: actor, purpose: "iam2_approval:appr_x", authLevel: "mfa", freshUntilMs: Date.now() + 600_000, userType: "staff", userClass: "staff", userStatus: "active" };
      const client = await runtimePool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('aix.user_id', $1, true)", [actor]);
        const result = await runWithContext(createRequestContext({ actorType: "service" }), () =>
          evaluatePermissionWithStepUp(client as never, { actorId: actor, action: "iam2.approval.approve", resource: "approval", entityId: "appr_x" }, { evidence: forged, expectedPurpose: "iam2_approval:appr_x" }),
        );
        await client.query("COMMIT");
        expect(result.decision).toBe("step_up_required"); // structural clone is NOT in the registry
      } finally {
        client.release();
      }
      // A step-up claim smuggled into the HTTP guard endpoint is rejected by schema validation.
      const smuggle = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actor, action: "iam2.approval.approve", resource: "approval", step_up: { userId: actor } },
      });
      expect(smuggle.statusCode).toBe(400);
      const plain = await app.inject({ method: "POST", url: "/internal/iam2/permission/check", headers: internal, payload: { actor_id: actor, action: "iam2.approval.approve", resource: "approval" } });
      expect(plain.json().data.decision).toBe("step_up_required");
    });

    it("T-53: an assertion without a parseable future fresh_until_utc is refused; a stale-purpose assertion too", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      for (const extras of [{ omit: "fresh_until_utc" }, { fresh: "not-a-date" }, { fresh: new Date(Date.now() - 5000).toISOString() }]) {
        const res = await approve(id, s.approver, assertionFor(s.approver, id, extras));
        expect(res.json().error.code, JSON.stringify(extras)).toBe("IAM2_STEP_UP_INVALID");
      }
      expect(await approvalStatus(id)).toBe("pending");
    });
  });

  // =======================================================================================
  describe("approver eligibility from IAM-01 identity facts (AZ-16; T-37, T-46, T-47, T-52 — stubbed IAM-01)", () => {
    async function pending(): Promise<{ s: Scenario; id: string }> {
      const s = await newScenario();
      return { s, id: (await request(s)).json().data.approval_id as string };
    }

    it("T-46: a service principal in EITHER classification is blocked (Critical audit, no decision, no token); client classes are not eligible", async () => {
      assertPrerequisites();
      const { s, id } = await pending();
      for (const extras of [{ type: "service" }, { class: "service" }, { type: "service", class: "service" }]) {
        const res = await approve(id, s.approver, assertionFor(s.approver, id, extras));
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code, JSON.stringify(extras)).toBe("IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED");
      }
      expect(await outbox("iam2.service_account_approver_blocked", id)).toBeGreaterThanOrEqual(3);
      for (const extras of [{ type: "client" }, { class: "client" }, { class: "client_approver" }]) {
        const res = await approve(id, s.approver, assertionFor(s.approver, id, extras));
        expect(res.json().error.code, JSON.stringify(extras)).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
      }
      expect(await outbox("iam2.approver_not_eligible", id)).toBeGreaterThanOrEqual(3);
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [id])).rowCount).toBe(0);
      expect(await approvalStatus(id)).toBe("pending");
    });

    it("T-47: a non-active identity (suspended / locked / deactivated) is refused; the active control succeeds", async () => {
      assertPrerequisites();
      const { s, id } = await pending();
      for (const status of ["suspended", "locked", "deactivated"]) {
        const res = await approve(id, s.approver, assertionFor(s.approver, id, { status }));
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code, status).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
      }
      const ok = await approve(id, s.approver, assertionFor(s.approver, id, { status: "active" }));
      expect(ok.statusCode).toBe(200);
    });

    it("T-52: missing / null / out-of-vocabulary identity facts fail closed; staff/staff, admin/admin and BOTH mixed pairs are eligible (owner clarification 2)", async () => {
      assertPrerequisites();
      const { s, id } = await pending();
      const refused: Array<Record<string, string>> = [
        { omit: "user_type" },
        { omit: "user_class" },
        { omit: "user_status" },
        { omit: "user_type,user_class,user_status" },
        { type: "wizard" },
        { class: "wizard" },
        { status: "ACTIVE" },
        { status: "" },
        { type: "admin", class: "client" },
        { type: "client", class: "admin" },
      ];
      for (const extras of refused) {
        const res = await approve(id, s.approver, assertionFor(s.approver, id, extras));
        expect(res.statusCode, JSON.stringify(extras)).toBe(403);
        expect(["IAM2_APPROVER_NOT_ELIGIBLE", "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED"]).toContain(res.json().error.code);
      }
      expect(await approvalStatus(id)).toBe("pending");
      // Eligible pairs, each on a fresh request.
      for (const [type, cls] of [["staff", "staff"], ["admin", "admin"], ["staff", "admin"], ["admin", "staff"]] as const) {
        const { s: s2, id: id2 } = await pending();
        const res = await approve(id2, s2.approver, assertionFor(s2.approver, id2, { type, class: cls }));
        expect(res.statusCode, `${type}/${cls}`).toBe(200);
      }
    });

    it("T-37: an approver with no assertion bound to its own id is refused (IAM2-TC-063/089 residuals R-1/R-2 are NOT claimed closed here)", async () => {
      assertPrerequisites();
      const { s, id } = await pending();
      const res = await approve(id, s.approver, assertionFor("iam.service_account.svc_1", id));
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("IAM2_STEP_UP_INVALID");
    });
  });

  // =======================================================================================
  describe("snapshot, retired and revoked policies, legacy requests (AZ-06, AZ-17; T-17 … T-19, T-39)", () => {
    it("T-17: a retired (inactive) policy after creation — the snapshot governs: the request proceeds with the assertion and still REQUIRES step-up", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = $1`, [s.policyId]);
      const noAssertion = await approve(id, s.approver);
      expect(noAssertion.json().error.code).toBe("IAM2_STEP_UP_INVALID"); // R3 inverted: step-up is not dropped
      const ok = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.status).toBe("approved");
    });

    it("T-18: a retired policy PLUS a later explicit deny on the maker is refused", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = $1`, [s.policyId]);
      await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [s.maker, s.actionPermissionId]);
      const res = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      expect(await approvalStatus(id)).toBe("pending");
    });

    it("T-19: a LEGACY request (no snapshot) is refused with evidence; the legacy-token path is refused at execution too", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = "appr_rem_legacy_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.approval_request (approval_id, maker_user_id, action, resource, entity_id, payload_hash, status, required_count, approved_count, expires_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',2,0, now() + interval '1 hour')`,
        [id, s.maker, s.action, s.resource, s.entityId, s.payloadHash],
      );
      const res = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_SNAPSHOT_MISSING");
      expect(await outbox("iam2.approval_request_denied", id)).toBeGreaterThan(0);
      expect(await approvalStatus(id)).toBe("pending");
    });

    it("T-39: a REVOKED policy blocks the pending approval and an outstanding unredeemed token, each with evidence; a guard-issued token is unaffected; revoked is terminal", async () => {
      assertPrerequisites();
      // pending request under a policy that is then revoked
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'revoked' WHERE policy_id = $1`, [s.policyId]);
      const blocked = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe("IAM2_APPROVAL_POLICY_REVOKED");
      expect(await outbox("iam2.approval_policy_revoked_blocked", id)).toBeGreaterThan(0);
      // revoked is terminal (072 trigger)
      await expect(verifyPool.query(`UPDATE iam2.approval_policy SET status = 'active' WHERE policy_id = $1`, [s.policyId])).rejects.toMatchObject({ code: "23514" });
      await expect(verifyPool.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = $1`, [s.policyId])).rejects.toMatchObject({ code: "23514" });
      // the unique-active index ignores non-active rows: a new active policy for the pair is allowed
      await expect(seedPolicy(s.action, s.resource)).resolves.toBeTruthy();

      // outstanding unredeemed token under a policy revoked AFTER issuance
      const s2 = await newScenario();
      const { approvalId, token } = await approvedToken(s2);
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'revoked' WHERE policy_id = $1`, [s2.policyId]);
      const res = await execute(s2, token, approvalId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_POLICY_REVOKED");
      expect(await outbox("iam2.execution_provenance_blocked", s2.maker)).toBeGreaterThan(0);

      // inactive (retired) policy does NOT refuse an issued token
      const s3 = await newScenario();
      const t3 = await approvedToken(s3);
      await verifyPool.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = $1`, [s3.policyId]);
      expect((await execute(s3, t3.token, t3.approvalId)).statusCode).toBe(200);

      // guard-issued token (no approval) for an unflagged permission is unaffected by policy status
      const s4 = await newScenario({ policy: false });
      const check = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: s4.maker, action: s4.action, resource: s4.resource, entity_id: s4.entityId, payload_hash: s4.payloadHash },
      });
      expect(check.json().data.decision).toBe("allow");
      expect((await execute(s4, check.json().data.decision_token, undefined)).statusCode).toBe(200);
    });
  });

  // =======================================================================================
  describe("checker roles and rejection (AZ-07, AZ-08; T-21, T-22, T-23, T-40)", () => {
    it("T-21 / T-22: an approver outside the snapshot's required roles is refused; one holding a required role (RLS-scoped lookup) succeeds", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: { roles: ["rem_checker_" + randomUUID().slice(0, 6)] } });
      const roleCode = ((await verifyPool.query(`SELECT required_approver_roles FROM iam2.approval_policy WHERE policy_id = $1`, [s.policyId])).rows[0]!.required_approver_roles as string[])[0]!;
      const id = (await request(s)).json().data.approval_id as string;
      const no = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(no.statusCode).toBe(403);
      expect(no.json().error.code).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
      expect(await outbox("iam2.approver_not_eligible", id)).toBeGreaterThan(0);
      await namedRole(s.approver, roleCode);
      const yes = await approve(id, s.approver, assertionFor(s.approver, id));
      expect(yes.statusCode).toBe(200);
    });

    it("T-22: the approve and reject paths never use Promise.all on the shared scoped client (source scan)", () => {
      for (const f of ["../../services/iam2/src/routes/approvals.ts", "../../services/iam2/src/lib/sod.ts", "../../services/iam2/src/lib/decision-token.ts"]) {
        const text = readFileSync(resolve(__dirname, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
        expect(text, f).not.toMatch(/Promise\.all/);
      }
    });

    it("T-23 / T-40: reject needs iam2.approval.reject; a non-maker must meet the checker roles; the maker may self-reject (audited self_reject); reject issues no token and changes no count", async () => {
      assertPrerequisites();
      // rejecter without the permission
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      const noPerm = await reject(id, "user_rem_noperm_" + randomUUID());
      expect(noPerm.statusCode).toBe(403);
      expect(noPerm.json().error.code).toBe("IAM2_PERMISSION_DENIED");

      // non-maker without the required checker role -> not eligible
      const sr = await newScenario({ policy: { roles: ["rem_reject_checker_" + randomUUID().slice(0, 6)] } });
      const idr = (await request(sr)).json().data.approval_id as string;
      const notEligible = await reject(idr, sr.approver);
      expect(notEligible.statusCode).toBe(403);
      expect(notEligible.json().error.code).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
      expect(await approvalStatus(idr)).toBe("pending");

      // non-maker, empty role list, permission allowed -> rejected; no token, count unchanged
      const ok = await reject(id, s.approver);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.decision_token).toBeUndefined();
      const row = await verifyPool.query(`SELECT status, approved_count FROM iam2.approval_request WHERE approval_id = $1`, [id]);
      expect(row.rows[0]).toMatchObject({ status: "rejected", approved_count: 0 });
      expect((await verifyPool.query(`SELECT 1 FROM iam2.permission_decision_token WHERE approval_id = $1`, [id])).rowCount).toBe(0);
      const flags = await verifyPool.query(`SELECT payload_ref::jsonb -> 'metadata' ->> 'self_reject' AS sr FROM foundation.outbox_event WHERE event_type = 'iam2.approval_rejected' AND payload_ref LIKE $1`, [`%${id}%`]);
      expect(flags.rows[0]?.sr).toBe("false");

      // maker self-rejection: allowed and audited self_reject = true (needs iam2.approval.reject)
      const sm = await newScenario();
      await grant(sm.maker, [{ code: "iam2.approval.reject", resource: "approval" }]);
      const ids = (await request(sm)).json().data.approval_id as string;
      const self = await reject(ids, sm.maker);
      expect(self.statusCode).toBe(200);
      const selfFlag = await verifyPool.query(`SELECT payload_ref::jsonb -> 'metadata' ->> 'self_reject' AS sr FROM foundation.outbox_event WHERE event_type = 'iam2.approval_rejected' AND payload_ref LIKE $1`, [`%${ids}%`]);
      expect(selfFlag.rows[0]?.sr).toBe("true");
      // a maker WITHOUT the reject permission cannot self-reject
      const sm2 = await newScenario();
      const ids2 = (await request(sm2)).json().data.approval_id as string;
      expect((await reject(ids2, sm2.maker)).statusCode).toBe(403);
    });
  });

  // =======================================================================================
  describe("execution: maker entitlement, live revocation, provenance (AZ-02, AZ-14; T-03 … T-06, T-26 … T-28, T-34, T-35)", () => {
    it("control: an entitled maker with a real approval executes exactly once", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const { approvalId, token } = await approvedToken(s);
      const ok = await execute(s, token, approvalId);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.execution_authorised).toBe(true);
      expect((await execute(s, token, approvalId)).json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("T-03 / T-26a: revoking the maker's role_permission, the user_role, or adding a deny override AFTER approval refuses execution — with no cache-version bump", async () => {
      assertPrerequisites();
      for (const kind of ["role_permission", "user_role", "deny_override"] as const) {
        const s = await newScenario();
        const { approvalId, token } = await approvedToken(s);
        const before = await cacheVersion(s.maker);
        if (kind === "role_permission") await verifyPool.query(`UPDATE iam2.role_permission SET status = 'revoked', revoked_at_utc = now() WHERE role_id = $1`, [s.makerRoleId]);
        if (kind === "user_role") await verifyPool.query(`UPDATE iam2.user_role SET status = 'revoked', revoked_at_utc = now() WHERE user_id = $1`, [s.maker]);
        if (kind === "deny_override") await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [s.maker, s.actionPermissionId]);
        expect(await cacheVersion(s.maker), "the test must not rely on a cache bump").toBe(before);
        const res = await execute(s, token, approvalId);
        expect(res.statusCode, kind).toBe(403);
        expect(res.json().error.code, kind).toBe("IAM2_PERMISSION_DENIED");
        // evidence committed: a deny decision for the maker + action, recorded by the wrapper
        expect((await decisionLog(s.maker, s.action)).some((l) => l.decision === "deny"), kind).toBe(true);
      }
    });

    it("T-04: the N2 reproduction is inverted — a deny override added after a guard-issued token refuses execute-verify", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: false });
      const check = await app.inject({ method: "POST", url: "/internal/iam2/permission/check", headers: internal, payload: { actor_id: s.maker, action: s.action, resource: s.resource, entity_id: s.entityId, payload_hash: s.payloadHash } });
      const token = check.json().data.decision_token as string;
      await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [s.maker, s.actionPermissionId]);
      const res = await execute(s, token, undefined);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
    });

    it("T-05 / T-06: a licence lock or a prohibited flag set after approval refuses execution", async () => {
      assertPrerequisites();
      for (const [column, code] of [["licence_locked", "IAM2_LICENCE_LOCKED_PERMISSION"], ["prohibited", "IAM2_LICENCE_LOCKED_PERMISSION"]] as const) {
        const s = await newScenario();
        const { approvalId, token } = await approvedToken(s);
        await verifyPool.query(`UPDATE iam2.permission SET ${column} = true WHERE permission_id = $1`, [s.actionPermissionId]);
        const res = await execute(s, token, approvalId);
        expect(res.statusCode, column).toBe(403);
        expect(res.json().error.code, column).toBe(code);
      }
    });

    it("T-26b / T-27: revocation BEFORE approval of a still-pending request refuses the approval (no token minted), with committed evidence", async () => {
      assertPrerequisites();
      for (const kind of ["role_permission", "user_role", "deny_override"] as const) {
        const s = await newScenario();
        const id = (await request(s)).json().data.approval_id as string;
        if (kind === "role_permission") await verifyPool.query(`UPDATE iam2.role_permission SET status = 'revoked', revoked_at_utc = now() WHERE role_id = $1`, [s.makerRoleId]);
        if (kind === "user_role") await verifyPool.query(`UPDATE iam2.user_role SET status = 'revoked', revoked_at_utc = now() WHERE user_id = $1`, [s.maker]);
        if (kind === "deny_override") await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [s.maker, s.actionPermissionId]);
        const res = await approve(id, s.approver, assertionFor(s.approver, id));
        expect(res.statusCode, kind).toBe(403);
        expect(res.json().error.code, kind).toBe("IAM2_PERMISSION_DENIED");
        expect(await approvalStatus(id), kind).toBe("pending");
        expect((await verifyPool.query(`SELECT 1 FROM iam2.permission_decision_token WHERE approval_id = $1`, [id])).rowCount).toBe(0);
      }
    });

    it("T-28: documented timing bound — a revocation committed AFTER the wrapper's transaction is not retroactive (the consumed token stays consumed; nothing is undone)", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const { approvalId, token } = await approvedToken(s);
      expect((await execute(s, token, approvalId)).statusCode).toBe(200);
      await verifyPool.query(`UPDATE iam2.user_role SET status = 'revoked', revoked_at_utc = now() WHERE user_id = $1`, [s.maker]);
      const again = await execute(s, token, approvalId);
      expect(again.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID"); // single use, regardless of the later revocation
    });

    it("T-34 (F08): a FABRICATED approval_id with a guard-issued token is refused, the token revoked, and the Critical binding-mismatch audit committed (N1 inverted)", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: false });
      const check = await app.inject({ method: "POST", url: "/internal/iam2/permission/check", headers: internal, payload: { actor_id: s.maker, action: s.action, resource: s.resource, entity_id: s.entityId, payload_hash: s.payloadHash } });
      const token = check.json().data.decision_token as string;
      const fake = "appr_FABRICATED_" + randomUUID().slice(0, 8);
      const res = await execute(s, token, fake);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
      expect(await outbox("iam2.decision_token_binding_mismatch", s.action)).toBeGreaterThan(0);
      const tok = await verifyPool.query(`SELECT status FROM iam2.permission_decision_token WHERE token_hash = $1`, [createHash("sha256").update(token).digest("hex")]);
      expect(tok.rows[0]?.status).toBe("revoked");
      expect((await execute(s, token, undefined)).json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID"); // cannot be retried
    });

    it("T-34: an approval-issued token presented with a DIFFERENT approval id is refused and revoked; a null-approval token for an approval-gated permission is refused", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const { approvalId, token } = await approvedToken(s);
      const other = await execute(s, token, "appr_" + randomUUID());
      expect(other.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
      expect((await execute(s, token, approvalId)).json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID"); // revoked, even with the right id now

      // A token with NO approval for a permission flagged requires_approval (state a guard could never issue).
      const s2 = await newScenario({ policy: false });
      await verifyPool.query(`UPDATE iam2.permission SET requires_approval = true WHERE permission_id = $1`, [s2.actionPermissionId]);
      const raw = "tok_rem_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,0,'active', now(), now() + interval '10 minutes')`,
        ["dtok_rem_" + randomUUID(), createHash("sha256").update(raw).digest("hex"), s2.maker, s2.action, s2.resource, s2.entityId, s2.payloadHash],
      );
      const res = await execute(s2, raw, undefined);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_PROVENANCE_INVALID");
      expect(await outbox("iam2.execution_provenance_blocked", s2.maker)).toBeGreaterThan(0);
    });

    it("T-35: execution re-reads the REAL approval — status not approved, binding differs, legacy (no snapshot) and an expired token each refuse", async () => {
      assertPrerequisites();
      // status no longer approved
      const s1 = await newScenario();
      const t1 = await approvedToken(s1);
      await verifyPool.query(`UPDATE iam2.approval_request SET status = 'blocked' WHERE approval_id = $1`, [t1.approvalId]);
      expect((await execute(s1, t1.token, t1.approvalId)).json().error.code).toBe("IAM2_APPROVAL_PROVENANCE_INVALID");

      // token forged for a different maker than the real approval's
      const s2 = await newScenario();
      const t2 = await approvedToken(s2);
      const intruder = "user_rem_intruder_" + randomUUID();
      await grant(intruder, [{ code: s2.action, resource: s2.resource }]);
      const raw = "tok_rem_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active', now(), now() + interval '10 minutes')`,
        ["dtok_rem_" + randomUUID(), createHash("sha256").update(raw).digest("hex"), intruder, s2.action, s2.resource, s2.entityId, s2.payloadHash, t2.approvalId],
      );
      const res = await execute({ ...s2, maker: intruder }, raw, t2.approvalId);
      expect(res.json().error.code).toBe("IAM2_APPROVAL_PROVENANCE_INVALID");

      // token whose payload differs from the approval's
      const s3 = await newScenario();
      const t3 = await approvedToken(s3);
      const raw3 = "tok_rem_" + randomUUID();
      const otherHash = fingerprint({ different: 1 });
      await verifyPool.query(
        `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active', now(), now() + interval '10 minutes')`,
        ["dtok_rem_" + randomUUID(), createHash("sha256").update(raw3).digest("hex"), s3.maker, s3.action, s3.resource, s3.entityId, otherHash, t3.approvalId],
      );
      expect((await execute({ ...s3, payloadHash: otherHash }, raw3, t3.approvalId)).json().error.code).toBe("IAM2_APPROVAL_PROVENANCE_INVALID");

      // expired token
      const s4 = await newScenario();
      const t4 = await approvedToken(s4);
      await verifyPool.query(`UPDATE iam2.permission_decision_token SET expires_at_utc = now() - interval '1 minute' WHERE approval_id = $1`, [t4.approvalId]);
      expect((await execute(s4, t4.token, t4.approvalId)).json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");

      // legacy request (no snapshot) with an outstanding token
      const s5 = await newScenario();
      const legacyId = "appr_rem_legacy_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.approval_request (approval_id, maker_user_id, action, resource, entity_id, payload_hash, status, required_count, approved_count, expires_at_utc, completed_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,'approved',1,1, now() + interval '1 hour', now())`,
        [legacyId, s5.maker, s5.action, s5.resource, s5.entityId, s5.payloadHash],
      );
      const raw5 = "tok_rem_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active', now(), now() + interval '10 minutes')`,
        ["dtok_rem_" + randomUUID(), createHash("sha256").update(raw5).digest("hex"), s5.maker, s5.action, s5.resource, s5.entityId, s5.payloadHash, legacyId],
      );
      const legacy = await execute(s5, raw5, legacyId);
      expect(legacy.statusCode).toBe(409);
      expect(legacy.json().error.code).toBe("IAM2_APPROVAL_SNAPSHOT_MISSING");
    });

    it("T-54: the wrapper scopes aix.user_id to the token's bound actor — interleaved executions for different actors each evaluate their OWN entitlement", async () => {
      assertPrerequisites();
      const a = await newScenario();
      const b = await newScenario();
      const ta = await approvedToken(a);
      const tb = await approvedToken(b);
      await verifyPool.query(`UPDATE iam2.user_role SET status = 'revoked', revoked_at_utc = now() WHERE user_id = $1`, [b.maker]);
      const results = await Promise.all([execute(a, ta.token, ta.approvalId), execute(b, tb.token, tb.approvalId), execute(a, "not-a-token", ta.approvalId)]);
      expect(results[0]!.statusCode).toBe(200);
      expect(results[1]!.statusCode).toBe(403);
      expect(results[2]!.statusCode).toBe(409);
    });
  });

  // =======================================================================================
  describe("roles.ts redemption (AZ-03; T-08, T-36 roles leg)", () => {
    async function roleAssignApproval(admin: string): Promise<{ approvalId: string; token: string; target: string; payload: Record<string, unknown> }> {
      await ensureRoleAssignPolicy();
      const target = "user_rem_tgt_" + randomUUID();
      const payload = { role_code: "auditor", target_user_id: target };
      const approver = "user_rem_roleappr_" + randomUUID();
      await grant(approver, [{ code: "iam2.approval.approve", resource: "approval" }]);
      const req = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: admin, action: "iam2.role.assign_user", resource: "role", entity_id: target, payload } });
      expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
      const approvalId = req.json().data.approval_id as string;
      const ap = await approve(approvalId, approver, assertionFor(approver, approvalId));
      expect(ap.statusCode, JSON.stringify(ap.json())).toBe(200);
      return { approvalId, token: ap.json().data.decision_token as string, target, payload };
    }
    function assign(admin: string, t: { token: string; target: string; payload: Record<string, unknown> }, approvalId?: string) {
      return app.inject({
        method: "POST",
        url: `/iam2/users/${t.target}/roles`,
        headers: internal,
        payload: { acting_admin_user_id: admin, role_code: "auditor", decision_token: t.token, current_payload_hash: fingerprint(t.payload), ...(approvalId ? { approval_id: approvalId } : {}) },
      });
    }

    it("T-08 (R1 inverted): an acting admin with an explicit DENY override added after approval gets NO role even with a valid token; the guard decision is persisted", async () => {
      assertPrerequisites();
      const admin = "user_rem_admin_" + randomUUID();
      await grant(admin, [{ code: "iam2.approval.create", resource: "approval" }, { code: "iam2.role.assign_user", resource: "role" }]);
      const t = await roleAssignApproval(admin);
      await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [admin, await permissionId("iam2.role.assign_user")]);
      const res = await assign(admin, t);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1`, [t.target])).rowCount).toBe(0);
      expect((await decisionLog(admin, "iam2.role.assign_user")).some((l) => l.reason_code === "explicit_deny_override")).toBe(true);
    });

    it("T-08 (N3 inverted): a ZERO-ROLE acting admin holding an approval-issued token gets NO role, and a caller-supplied approval_id is never recorded", async () => {
      assertPrerequisites();
      const admin = "user_rem_zero_" + randomUUID();
      const target = "user_rem_tgt_" + randomUUID();
      const payload = { role_code: "auditor", target_user_id: target };
      // State N3 reproduced: an approval + token exist for an admin who holds NO entitlement.
      // (Creation is now refused for such a maker, so the state is forged via privileged SQL.)
      await ensureRoleAssignPolicy();
      const policy = (await verifyPool.query<{ policy_id: string }>(`SELECT policy_id FROM iam2.approval_policy WHERE action = 'iam2.role.assign_user' AND resource = 'role' AND status = 'active'`)).rows[0]!.policy_id;
      const approvalId = "appr_rem_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, entity_id, payload_hash, status, required_count, approved_count, expires_at_utc, completed_at_utc,
           snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type)
         VALUES ($1,$2,$3,'iam2.role.assign_user','role',$4,$5,'approved',1,1, now() + interval '1 hour', now(), now(), true, '[]'::jsonb, 'count')`,
        [approvalId, policy, admin, target, fingerprint(payload)],
      );
      const raw = "tok_rem_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
         VALUES ($1,$2,$3,'iam2.role.assign_user','role',$4,$5,$6,0,'active', now(), now() + interval '10 minutes')`,
        ["dtok_rem_" + randomUUID(), createHash("sha256").update(raw).digest("hex"), admin, target, fingerprint(payload), approvalId],
      );
      const res = await assign(admin, { token: raw, target, payload });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1`, [target])).rowCount).toBe(0);
    });

    it("T-08: a fabricated body.approval_id with an approval-issued token is refused (never recorded as evidence); with the REAL id the assignment succeeds and records the verified id", async () => {
      assertPrerequisites();
      const admin = "user_rem_admin2_" + randomUUID();
      await grant(admin, [{ code: "iam2.approval.create", resource: "approval" }, { code: "iam2.role.assign_user", resource: "role" }]);
      const bad = await roleAssignApproval(admin);
      const refused = await assign(admin, bad, "appr_FABRICATED_" + randomUUID().slice(0, 6));
      expect(refused.statusCode).toBe(409);
      expect((await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1`, [bad.target])).rowCount).toBe(0);
      const good = await roleAssignApproval(admin);
      const ok = await assign(admin, good, good.approvalId);
      expect(ok.statusCode).toBe(200);
      const row = await verifyPool.query(`SELECT approval_id FROM iam2.user_role WHERE user_id = $1`, [good.target]);
      expect(row.rows[0]?.approval_id).toBe(good.approvalId);
    });

    // ---- D7-01 (fresh-session Opus D-7 review, HIGH): role substitution. The approval binds
    // fingerprint({ role_code, target_user_id }); the redemption used to compare the token against
    // the CALLER-supplied hash, so presenting role A's approved hash while asking for role B (or
    // another target) was assigned. The server now derives the hash from the operation it is about
    // to perform and requires any supplied hash to equal it. ----
    describe("D7-01: the role-assignment payload hash is derived by the SERVER, never trusted from the caller", () => {
      async function ensureRole(roleCode: string): Promise<void> {
        await verifyPool.query(
          `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status)
           SELECT $1::varchar, $2::varchar, $2::varchar, 'staff', 'normal', 'active' WHERE NOT EXISTS (SELECT 1 FROM iam2.role WHERE role_code = $2::varchar)`,
          ["role_d701_" + randomUUID(), roleCode],
        );
      }
      const serverHash = (roleCode: string, target: string) => fingerprint({ role_code: roleCode, target_user_id: target });
      const redeem = (admin: string, target: string, roleCode: string, token: string, extra: Record<string, unknown> = {}) =>
        app.inject({ method: "POST", url: `/iam2/users/${target}/roles`, headers: internal, payload: { acting_admin_user_id: admin, role_code: roleCode, decision_token: token, ...extra } });
      const rolesOf = async (target: string) => (await verifyPool.query<{ role_code: string }>(`SELECT r.role_code FROM iam2.user_role ur JOIN iam2.role r ON r.role_id = ur.role_id WHERE ur.user_id = $1`, [target])).rows.map((r) => r.role_code);
      const tokenStatus = async (raw: string) => (await verifyPool.query<{ status: string }>(`SELECT status FROM iam2.permission_decision_token WHERE token_hash = $1`, [createHash("sha256").update(raw).digest("hex")])).rows[0]?.status;
      const auditCount = async (eventType: string, adminId: string) =>
        Number((await verifyPool.query<{ n: string }>(`SELECT count(*) AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref LIKE $2`, [eventType, `%${adminId}%`])).rows[0]!.n);
      async function admin(): Promise<string> {
        const a = "user_d701_admin_" + randomUUID();
        await grant(a, [{ code: "iam2.approval.create", resource: "approval" }, { code: "iam2.role.assign_user", resource: "role" }]);
        return a;
      }
      /** Approved assignment of `roleCode` to a fresh target; returns what a redeemer needs. */
      async function approved(a: string, roleCode: string) {
        await ensureRole(roleCode);
        await ensureRoleAssignPolicy();
        const target = "user_d701_tgt_" + randomUUID();
        const approver = "user_d701_appr_" + randomUUID();
        await grant(approver, [{ code: "iam2.approval.approve", resource: "approval" }]);
        const req = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: a, action: "iam2.role.assign_user", resource: "role", entity_id: target, payload: { role_code: roleCode, target_user_id: target } } });
        expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
        const approvalId = req.json().data.approval_id as string;
        const ap = await approve(approvalId, approver, assertionFor(approver, approvalId));
        expect(ap.statusCode, JSON.stringify(ap.json())).toBe(200);
        return { approvalId, token: ap.json().data.decision_token as string, target };
      }

      it("positive: approved role A to the approved target succeeds — with the matching hash, with NO hash supplied (server-derived), and records the verified approval id", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const withHash = await approved(a, roleA);
        const r1 = await redeem(a, withHash.target, roleA, withHash.token, { current_payload_hash: serverHash(roleA, withHash.target), approval_id: withHash.approvalId });
        expect(r1.statusCode, JSON.stringify(r1.json())).toBe(200);
        expect(await rolesOf(withHash.target)).toEqual([roleA]);
        expect((await verifyPool.query(`SELECT approval_id FROM iam2.user_role WHERE user_id = $1`, [withHash.target])).rows[0]?.approval_id).toBe(withHash.approvalId);
        // No caller hash at all: previously a hash-bound token was REFUSED (null != bound); now the
        // server supplies the operation's own hash, so the honest caller is no longer forced to compute it.
        const noHash = await approved(a, roleA);
        const r2 = await redeem(a, noHash.target, roleA, noHash.token);
        expect(r2.statusCode, JSON.stringify(r2.json())).toBe(200);
        expect(await rolesOf(noHash.target)).toEqual([roleA]);
      });

      it("D7-01 (the reported attack): approval for role A + A's approved hash presented while asking for role B -> refused, NO role row, token REVOKED, Critical mismatch audit committed", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const roleB = "d701_b_" + randomUUID().slice(0, 8);
        await ensureRole(roleB);
        const t = await approved(a, roleA);
        const before = await auditCount("iam2.approval_payload_hash_mismatch", a);
        const res = await redeem(a, t.target, roleB, t.token, { current_payload_hash: serverHash(roleA, t.target), approval_id: t.approvalId });
        expect(res.statusCode).not.toBe(200);
        expect(res.json().error.code).toBe("IAM2_PAYLOAD_HASH_MISMATCH");
        expect(await rolesOf(t.target)).toEqual([]);
        expect(await tokenStatus(t.token)).toBe("revoked");
        expect(await auditCount("iam2.approval_payload_hash_mismatch", a)).toBe(before + 1);
        // the token can never be retried, not even for the role it WAS approved for
        const retry = await redeem(a, t.target, roleA, t.token, { current_payload_hash: serverHash(roleA, t.target) });
        expect(retry.statusCode).toBe(409);
        expect(await rolesOf(t.target)).toEqual([]);
      });

      it("D7-01: the same substitution WITHOUT supplying any hash is refused identically (the server-derived hash is what is compared)", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const roleB = "d701_b_" + randomUUID().slice(0, 8);
        await ensureRole(roleB);
        const t = await approved(a, roleA);
        const res = await redeem(a, t.target, roleB, t.token);
        expect(res.statusCode).not.toBe(200);
        expect(res.json().error.code).toBe("IAM2_PAYLOAD_HASH_MISMATCH");
        expect(await rolesOf(t.target)).toEqual([]);
        expect(await tokenStatus(t.token)).toBe("revoked");
      });

      it("D7-01: approval for target X redeemed against target Y (with X's hash, and with Y's hash) -> refused, no role row for either, token revoked, Critical binding-mismatch audit", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        for (const useHashOf of ["approved-target", "other-target"] as const) {
          const t = await approved(a, roleA);
          const other = "user_d701_other_" + randomUUID();
          const before = await auditCount("iam2.decision_token_binding_mismatch", a);
          const hash = serverHash(roleA, useHashOf === "approved-target" ? t.target : other);
          const res = await redeem(a, other, roleA, t.token, { current_payload_hash: hash, approval_id: t.approvalId });
          expect(res.statusCode, useHashOf).not.toBe(200);
          expect(await rolesOf(other), useHashOf).toEqual([]);
          expect(await rolesOf(t.target), useHashOf).toEqual([]);
          expect(await tokenStatus(t.token), useHashOf).toBe("revoked");
          expect(await auditCount("iam2.decision_token_binding_mismatch", a), useHashOf).toBe(before + 1);
        }
      });

      it("D7-01: a supplied hash that differs from the actual operation is refused even when the token matches the operation (no bypass, no role row, token revoked, audited with the reason)", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const t = await approved(a, roleA);
        const before = await auditCount("iam2.approval_payload_hash_mismatch", a);
        const res = await redeem(a, t.target, roleA, t.token, { current_payload_hash: "sha256:" + "0".repeat(64), approval_id: t.approvalId });
        expect(res.statusCode).not.toBe(200);
        expect(res.json().error.code).toBe("IAM2_PAYLOAD_HASH_MISMATCH");
        expect(await rolesOf(t.target)).toEqual([]);
        expect(await tokenStatus(t.token)).toBe("revoked");
        expect(await auditCount("iam2.approval_payload_hash_mismatch", a)).toBe(before + 1);
        const evidence = await verifyPool.query<{ payload_ref: string }>(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'iam2.approval_payload_hash_mismatch' AND payload_ref LIKE $1`, [`%${a}%`]);
        expect(evidence.rows.some((r) => r.payload_ref.includes("caller_hash_differs_from_server_derived"))).toBe(true);
        // evidence never carries either hash value
        expect(evidence.rows.every((r) => !r.payload_ref.includes("0000000000"))).toBe(true);
      });

      it("D7-01: a null-payload-hash token can no longer redeem a role assignment (the server hash is never null)", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        await ensureRole(roleA);
        await ensureRoleAssignPolicy();
        const target = "user_d701_null_" + randomUUID();
        const policy = (await verifyPool.query<{ policy_id: string }>(`SELECT policy_id FROM iam2.approval_policy WHERE action = 'iam2.role.assign_user' AND resource = 'role' AND status = 'active'`)).rows[0]!.policy_id;
        const approvalId = "appr_d701_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, entity_id, payload_hash, status, required_count, approved_count, expires_at_utc, completed_at_utc,
             snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type)
           VALUES ($1,$2,$3,'iam2.role.assign_user','role',$4,NULL,'approved',1,1, now() + interval '1 hour', now(), now(), true, '[]'::jsonb, 'count')`,
          [approvalId, policy, a, target],
        );
        const raw = "tok_d701_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO iam2.permission_decision_token (decision_token_id, token_hash, actor_user_id, action, resource, entity_id, payload_hash, approval_id, cache_version, status, issued_at_utc, expires_at_utc)
           VALUES ($1,$2,$3,'iam2.role.assign_user','role',$4,NULL,$5,0,'active', now(), now() + interval '10 minutes')`,
          ["dtok_d701_" + randomUUID(), createHash("sha256").update(raw).digest("hex"), a, target, approvalId],
        );
        const res = await redeem(a, target, roleA, raw, { approval_id: approvalId });
        expect(res.statusCode).not.toBe(200);
        expect(await rolesOf(target)).toEqual([]);
      });

      it("D7-01: entitlement and SoD controls still bind on the matching-hash path — an explicit deny added after approval refuses a correct (role, target, hash) redemption, no role row, token left unconsumed", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const t = await approved(a, roleA);
        await verifyPool.query(`INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status) VALUES ($1,$2,'deny','active')`, [a, await permissionId("iam2.role.assign_user")]);
        const res = await redeem(a, t.target, roleA, t.token, { current_payload_hash: serverHash(roleA, t.target), approval_id: t.approvalId });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("IAM2_PERMISSION_DENIED");
        expect(await rolesOf(t.target)).toEqual([]);
        expect(await tokenStatus(t.token)).toBe("active");
      });

      it("D7-01: single-use still holds — a role assignment replayed with the same token is refused, and concurrent redemption of a server-hash-matched token yields exactly one role row", async () => {
        assertPrerequisites();
        const a = await admin();
        const roleA = "d701_a_" + randomUUID().slice(0, 8);
        const once = await approved(a, roleA);
        expect((await redeem(a, once.target, roleA, once.token)).statusCode).toBe(200);
        const replay = await redeem(a, once.target, roleA, once.token);
        expect(replay.statusCode).toBe(409);
        expect(await rolesOf(once.target)).toEqual([roleA]);
        for (let trial = 0; trial < 4; trial++) {
          const t = await approved(a, roleA);
          const rs = await Promise.all([1, 2, 3, 4].map(() => redeem(a, t.target, roleA, t.token, { current_payload_hash: serverHash(roleA, t.target) })));
          expect(rs.filter((r) => r.statusCode === 200).length, `trial ${trial}`).toBe(1);
          expect(await rolesOf(t.target), `trial ${trial}`).toEqual([roleA]);
        }
      });
    });

    it("T-36 (roles leg): 3 concurrent assignments with ONE token yield exactly one user_role row, over repeated trials", async () => {
      assertPrerequisites();
      const admin = "user_rem_admin3_" + randomUUID();
      await grant(admin, [{ code: "iam2.approval.create", resource: "approval" }, { code: "iam2.role.assign_user", resource: "role" }]);
      for (let trial = 0; trial < 6; trial++) {
        const t = await roleAssignApproval(admin);
        const rs = await Promise.all([assign(admin, t), assign(admin, t), assign(admin, t)]);
        expect(rs.filter((r) => r.statusCode === 200).length, `trial ${trial}`).toBe(1);
        expect((await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1 AND status = 'active'`, [t.target])).rowCount, `trial ${trial}`).toBe(1);
      }
    });
  });

  // =======================================================================================
  describe("atomic single-use consumption (AZ-15; T-36)", () => {
    it("T-36 (F09): N=3 concurrent execute-verify of one approval-issued token — exactly ONE success per trial, over 20 trials (N4 inverted)", async () => {
      assertPrerequisites();
      const s = await newScenario();
      for (let trial = 0; trial < 20; trial++) {
        const s2 = { ...s, entityId: "ent_" + randomUUID().slice(0, 12), payload: { trial, r: randomUUID() } };
        s2.payloadHash = fingerprint(s2.payload);
        const { approvalId, token } = await approvedToken(s2);
        const rs = await Promise.all([execute(s2, token, approvalId), execute(s2, token, approvalId), execute(s2, token, approvalId)]);
        const ok = rs.filter((r) => r.statusCode === 200).length;
        expect(ok, `trial ${trial}`).toBe(1);
        for (const r of rs.filter((x) => x.statusCode !== 200)) expect(r.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
      }
    });

    it("T-36: a guard-issued token is likewise single-use under concurrency", async () => {
      assertPrerequisites();
      const s = await newScenario({ policy: false });
      for (let trial = 0; trial < 10; trial++) {
        const entityId = "ent_" + randomUUID().slice(0, 12);
        const check = await app.inject({ method: "POST", url: "/internal/iam2/permission/check", headers: internal, payload: { actor_id: s.maker, action: s.action, resource: s.resource, entity_id: entityId, payload_hash: s.payloadHash } });
        const token = check.json().data.decision_token as string;
        const rs = await Promise.all([0, 1, 2].map(() => execute({ ...s, entityId }, token, undefined)));
        expect(rs.filter((r) => r.statusCode === 200).length, `trial ${trial}`).toBe(1);
      }
    });
  });

  // =======================================================================================
  describe("approval concurrency (§8.3)", () => {
    it("two distinct approvers on a count-1 request -> exactly one decision and one token; approve vs reject -> one terminal state", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const approver2 = "user_rem_appr2_" + randomUUID();
      await grant(approver2, [{ code: "iam2.approval.approve", resource: "approval" }, { code: "iam2.approval.reject", resource: "approval" }]);
      const id = (await request(s)).json().data.approval_id as string;
      const rs = await Promise.all([approve(id, s.approver, assertionFor(s.approver, id)), approve(id, approver2, assertionFor(approver2, id))]);
      expect(rs.filter((r) => r.statusCode === 200).length).toBe(1);
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [id])).rowCount).toBe(1);
      expect((await verifyPool.query(`SELECT 1 FROM iam2.permission_decision_token WHERE approval_id = $1`, [id])).rowCount).toBe(1);

      const s2 = await newScenario();
      const id2 = (await request(s2)).json().data.approval_id as string;
      const mixed = await Promise.all([approve(id2, s2.approver, assertionFor(s2.approver, id2)), reject(id2, approver2)]);
      expect(mixed.filter((r) => r.statusCode === 200).length).toBeLessThanOrEqual(1);
      expect(["approved", "rejected"]).toContain(await approvalStatus(id2));
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [id2])).rowCount).toBe(1);
    });

    it("three simultaneous same-approver attempts -> one decision; the losers see the terminal status", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      const a = assertionFor(s.approver, id);
      const rs = await Promise.all([approve(id, s.approver, a), approve(id, s.approver, a), approve(id, s.approver, a)]);
      expect(rs.filter((r) => r.statusCode === 200).length).toBe(1);
      for (const r of rs.filter((x) => x.statusCode !== 200)) expect(r.json().error.code).toBe("IAM2_APPROVAL_ALREADY_DECIDED");
      expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [id])).rowCount).toBe(1);
    });
  });

  // =======================================================================================
  describe("migration 072 effects as the runtime role (AZ-17; T-33, T-49)", () => {
    it("T-49: the runtime role cannot UPDATE any snapshot or approval-binding column; the legitimate transitions still work", async () => {
      assertPrerequisites();
      const s = await newScenario();
      const id = (await request(s)).json().data.approval_id as string;
      const attempts: Array<[string, string, unknown[]]> = [
        ["id", "id = gen_random_uuid()", []],
        ["approval_id", "approval_id = $2", ["appr_rem_renamed"]],
        ["maker_user_id", "maker_user_id = $2", ["user_rem_evil"]],
        ["action", "action = $2", ["iam2.rem.other"]],
        ["resource", "resource = $2", ["other"]],
        ["entity_id", "entity_id = $2", ["other"]],
        ["client_id", "client_id = $2", ["other"]],
        ["payload_hash", "payload_hash = $2", ["sha256:evil"]],
        ["payload_ref", "payload_ref = $2", ["evil"]],
        ["policy_id", "policy_id = NULL::varchar", []],
        ["required_count", "required_count = $2", [5]],
        ["expires_at_utc", "expires_at_utc = now() + interval '30 days'", []],
        ["created_at_utc", "created_at_utc = now() - interval '1 day'", []],
        ["snapshot_taken_at_utc", "snapshot_taken_at_utc = NULL", []],
        ["snapshot_requires_step_up", "snapshot_requires_step_up = NOT snapshot_requires_step_up", []],
        ["snapshot_required_approver_roles", "snapshot_required_approver_roles = '[\"anything\"]'::jsonb", []],
        ["snapshot_threshold_type", "snapshot_threshold_type = 'risk'", []],
      ];
      // IMPL-03: each rejection must come from the IMMUTABILITY TRIGGER specifically, not from any
      // unrelated constraint: SQLSTATE 23514 (check_violation, the trigger's ERRCODE), the trigger's
      // own message naming the approval and "immutable", the PL/pgSQL function in the error context,
      // and NO `constraint` field (a table CHECK/FK/unique violation always carries one). That the
      // trigger — not a CHECK — is the control is proved against a disabled-trigger control in
      // iam2-migration-072.test.ts ("the immutability trigger is the control").
      for (const [column, setClause, params] of attempts) {
        let caught: { code?: string; message?: string; constraint?: string; where?: string } | undefined;
        try {
          await runtimePool.query(`UPDATE iam2.approval_request SET ${setClause} WHERE approval_id = $1`, [id, ...params]);
        } catch (err) {
          caught = err as typeof caught;
        }
        expect(caught, `${column}: the UPDATE must be rejected`).toBeDefined();
        expect(caught!.code, `${column}: SQLSTATE`).toBe("23514");
        expect(caught!.message, `${column}: message`).toBe(`iam2.approval_request ${id} binding and snapshot columns are immutable`);
        expect(caught!.constraint, `${column}: must not be a table constraint`).toBeUndefined();
        expect(caught!.where, `${column}: raised inside the immutability trigger function`).toContain("fn_approval_request_binding_is_immutable");
      }
      const unchanged = await verifyPool.query(`SELECT maker_user_id, action, required_count, snapshot_requires_step_up FROM iam2.approval_request WHERE approval_id = $1`, [id]);
      expect(unchanged.rows[0]).toMatchObject({ maker_user_id: s.maker, action: s.action, required_count: 1, snapshot_requires_step_up: true });
      // legitimate transitions
      await expect(runtimePool.query(`UPDATE iam2.approval_request SET status = 'pending', approved_count = approved_count WHERE approval_id = $1`, [id])).resolves.toBeTruthy();
      await expect(runtimePool.query(`UPDATE iam2.approval_request SET status = 'expired', completed_at_utc = now() WHERE approval_id = $1`, [id])).resolves.toBeTruthy();
    });

    it("T-33: policy shape CHECKs reject count < 1, expiry <= 0 and a non-array / non-string roles value; status accepts revoked", async () => {
      assertPrerequisites();
      const base = (over: string) => verifyPool.query(`INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status) VALUES ($1,$2,'r','count',${over})`, ["policy_chk_" + randomUUID(), "iam2.rem.chk_" + randomUUID().slice(0, 8)]);
      await expect(base(`'[]'::jsonb, 0, true, 60, 'active'`)).rejects.toMatchObject({ code: "23514" });
      await expect(base(`'[]'::jsonb, 1, true, 0, 'active'`)).rejects.toMatchObject({ code: "23514" });
      await expect(base(`'{}'::jsonb, 1, true, 60, 'active'`)).rejects.toMatchObject({ code: "23514" });
      await expect(base(`'[1]'::jsonb, 1, true, 60, 'active'`)).rejects.toMatchObject({ code: "23514" });
      await expect(base(`'["a"]'::jsonb, 1, true, 60, 'revoked'`)).resolves.toBeTruthy();
      await expect(base(`'["a"]'::jsonb, 1, true, 60, 'bogus'`)).rejects.toMatchObject({ code: "23514" });
    });
  });
});
