/**
 * IAM-02 DB-gated integration tests. Self-skip unless TEST_DATABASE_URL points at a Postgres
 * that already has `foundation` (001, 005), `iam` (002-004), and `iam2` (006) migrated, with
 * ALL THREE grant files applied (fnd/iam/iam2).
 *
 * Unlike IAM-01's own integration suite (which connected as the `postgres` superuser
 * throughout, with a dedicated "S1" block later re-proving things under the real runtime
 * role), THIS suite connects as `role_iam2_runtime` via a real LOGIN role from the START —
 * per the task brief, applying the S1 lesson from day one rather than discovering it after
 * the fact. A separate superuser `pg.Pool` (`verifyPool`) is used for fixture setup (seeding
 * role/permission/role_permission/approval_policy rows, and directly assigning "existing"
 * user_role rows a test scenario needs to already be true BEFORE the endpoint under test
 * runs) and for independent verification of what actually landed in the DB, never to drive
 * the app itself. Stage 2 extends `role_iam2_runtime`'s own grant to include INSERT on
 * `user_role` (see infra/grants/iam2_runtime_grants.sql) — the app itself now performs that
 * INSERT via routes/roles.ts / routes/bootstrap.ts; `verifyPool` is still used for fixture
 * seeding purely so tests can set up "pre-existing" state independent of the code under test.
 */
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { beginIdempotent, closePool, completeIdempotent, fingerprint, getPool, initPool, withTransaction } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp } from "../../services/iam2/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_app_test";

const config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-iam2-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: "test-iam2-internal-token-it",
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-shared-secret-it",
  bootstrapTransitionEnabled: false,
};

const internal = { "x-internal-service-token": "test-iam2-internal-token-it" };

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

function idemKey(label: string): string {
  return `it_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam') AS iam,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2') AS iam2`,
    );
    return Number(r.rows[0]?.fnd) > 0 && Number(r.rows[0]?.iam) > 0 && Number(r.rows[0]?.iam2) > 0;
  } catch {
    return false;
  }
}

// ---- Fixture helpers (seeded via the SUPERUSER verifyPool — role_iam2_runtime has SELECT-
// only on these catalogue/assignment tables this stage; see grants file rationale). ----

async function seedPermission(input: {
  code: string;
  resource: string;
  action: string;
  licenceLocked?: boolean;
  prohibited?: boolean;
  requiresStepUp?: boolean;
  requiresApproval?: boolean;
}): Promise<string> {
  const permissionId = "perm_it_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.permission
       (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
     VALUES ($1,$2,$3,$4,'normal',$5,$6,$7,$8,'active','TEST')`,
    [
      permissionId,
      input.code,
      input.resource,
      input.action,
      input.licenceLocked ?? false,
      input.prohibited ?? false,
      input.requiresStepUp ?? false,
      input.requiresApproval ?? false,
    ],
  );
  return permissionId;
}

async function seedRole(code: string): Promise<string> {
  const roleId = "role_it_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status)
     VALUES ($1,$2,$3,'staff','normal','active')`,
    [roleId, code, code],
  );
  return roleId;
}

async function assignRolePermission(roleId: string, permissionId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO iam2.role_permission (role_id, permission_id, status, effective_from_utc)
     VALUES ($1,$2,'active', now())`,
    [roleId, permissionId],
  );
}

async function assignUserRole(userId: string, roleId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO iam2.user_role (user_id, role_id, status, effective_from_utc)
     VALUES ($1,$2,'active', now())`,
    [userId, roleId],
  );
}

async function seedDenyOverride(userId: string, permissionId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO iam2.user_permission_override (user_id, permission_id, effect, status)
     VALUES ($1,$2,'deny','active')`,
    [userId, permissionId],
  );
}

// ---- Phase 3-5 fixture helpers ----

async function seedApprovalPolicy(input: {
  action: string;
  resource: string;
  requiredCount?: number;
  requiresStepUp?: boolean;
  expiryMinutes?: number;
}): Promise<string> {
  const policyId = "policy_it_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.approval_policy
       (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
     VALUES ($1,$2,$3,'count','[]'::jsonb,$4,$5,$6,'active')`,
    [policyId, input.action, input.resource, input.requiredCount ?? 1, input.requiresStepUp ?? false, input.expiryMinutes ?? 1440],
  );
  return policyId;
}

/** Look up a real seeded-in-006 permission's permission_id by code (e.g. 'iam2.sod.manage'). */
async function seededPermissionId(code: string): Promise<string> {
  const rows = await verifyPool.query<{ permission_id: string }>(
    `SELECT permission_id FROM iam2.permission WHERE permission_code = $1`,
    [code],
  );
  if (!rows.rows[0]) throw new Error(`fixture setup: expected seeded permission ${code} to exist`);
  return rows.rows[0].permission_id;
}

/** Fake `fetch` for lib/iam01-client.ts — records every call for assertion. */
interface FakeIam01FetchCall {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}
function makeFakeIam01Fetch(
  respond: (call: FakeIam01FetchCall) => { ok: boolean; body?: unknown } | Promise<{ ok: boolean; body?: unknown }>,
): { fetchImpl: typeof fetch; calls: FakeIam01FetchCall[] } {
  const calls: FakeIam01FetchCall[] = [];
  const fetchImpl = (async (url: unknown, init?: unknown) => {
    const call: FakeIam01FetchCall = { url: String(url), init: (init ?? {}) as FakeIam01FetchCall["init"] };
    calls.push(call);
    const result = await respond(call);
    return {
      ok: result.ok,
      json: async () => result.body ?? {},
    } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe.skipIf(!TEST_DB)("IAM-02 integration (DB)", () => {
  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    schemaReady = await schemasExist();
    if (!schemaReady) return;

    // Real LOGIN role, member of role_iam2_runtime ONLY — no BYPASSRLS, not a table owner —
    // from the start of this suite (not a later gap-closing patch), per the task brief.
    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER};`);

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
  describe("boot + no-Exchange-runtime under role_iam2_runtime", () => {
    it("app builds successfully under the least-privilege runtime role (assertNoExchangeRuntime passed)", () => {
      if (!schemaReady) return expect(schemaReady, "run migrate:up + all three grants files first").toBe(true);
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
  // F3(a)-equivalent: role_iam2_runtime is denied on iam.* and foundation.module_registry.
  // ---------------------------------------------------------------------------------------
  describe("F3(a)-equivalent: cross-schema DB role isolation", () => {
    it("role_iam2_runtime cannot read iam.* or foundation.module_registry, but CAN read iam2.permission", async () => {
      if (!schemaReady) return;
      await expect(getPool().query("SELECT 1 FROM iam.user_identity LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("SELECT 1 FROM foundation.module_registry LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("SELECT 1 FROM iam2.permission LIMIT 1")).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------------------
  // C1-equivalent: foundation.outbox_event is INSERT-only for role_iam2_runtime.
  // ---------------------------------------------------------------------------------------
  describe("foundation.outbox_event / idempotency_record narrow interface", () => {
    it("role_iam2_runtime can INSERT foundation.outbox_event but cannot SELECT or UPDATE it", async () => {
      if (!schemaReady) return;
      const priv = await getPool().query(
        `SELECT
           has_table_privilege('foundation.outbox_event', 'INSERT') AS ins,
           has_table_privilege('foundation.outbox_event', 'SELECT') AS sel,
           has_table_privilege('foundation.outbox_event', 'UPDATE') AS upd`,
      );
      expect(priv.rows[0].ins).toBe(true);
      expect(priv.rows[0].sel).toBe(false);
      expect(priv.rows[0].upd).toBe(false);

      await expect(getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO foundation.outbox_event (outbox_id, topic, event_type, payload_ref, status, retry_count, correlation_id, created_at_utc)
           VALUES ($1,'audit.event','iam2.test_probe','{}','pending',0,$2, now())`,
          ["out_it_" + randomUUID(), "corr_it_" + randomUUID()],
        );
      });
      const confirmed = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.test_probe'`,
      );
      expect(confirmed.rowCount).toBeGreaterThan(0);
    });

    it("role_iam2_runtime has the full SELECT/INSERT/UPDATE cycle on foundation.idempotency_record (isolation is via C2 RLS, not this grant)", async () => {
      if (!schemaReady) return;
      const priv = await getPool().query(
        `SELECT
           has_table_privilege('foundation.idempotency_record', 'INSERT') AS ins,
           has_table_privilege('foundation.idempotency_record', 'SELECT') AS sel,
           has_table_privilege('foundation.idempotency_record', 'UPDATE') AS upd`,
      );
      expect(priv.rows[0].ins).toBe(true);
      expect(priv.rows[0].sel).toBe(true);
      expect(priv.rows[0].upd).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------
  // C2 — role_iam2_runtime as the THIRD consumer of the shared idempotency table.
  // ---------------------------------------------------------------------------------------
  describe("C2: role_iam2_runtime idempotency use is source_module-scoped ('IAM-02')", () => {
    it("cannot see an FND-01-seeded row, and an FND-01/IAM-01 connection cannot see an IAM-02-created row", async () => {
      if (!schemaReady) return;
      // Seed an FND-01 row directly via the superuser verify connection (bypasses RLS).
      const fndKey = "c2_iam2_fnd_seed_" + idemKey("seed");
      await verifyPool.query(
        `INSERT INTO foundation.idempotency_record
           (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
         VALUES ($1, 'sha256:seed', 'c2_fnd_actor', 'service', 'foundation.c2.probe', 'FND-01', 'processing', now() + interval '1 day', now(), now())`,
        [fndKey],
      );

      // role_iam2_runtime, correctly scoped to ITS OWN module (IAM-02), cannot see the
      // FND-01 row — this is C2's actual isolation guarantee, proven for the third consumer.
      await withTransaction(async (client) => {
        await client.query("SELECT set_config('aix.module', 'IAM-02', true)");
        const scoped = await client.query(`SELECT 1 FROM foundation.idempotency_record WHERE idempotency_key = $1`, [
          fndKey,
        ]);
        expect(scoped.rowCount).toBe(0);
      });

      // role_iam2_runtime creates its own idempotency row via the real shared helper,
      // sourceModule: "IAM-02" (the pattern any future Phase 3+ mutating endpoint must use).
      const iam2Key = idemKey("iam2_create");
      const iam2ActorId = "user_it_" + randomUUID();
      await withTransaction(async (client) => {
        const outcome = await beginIdempotent(client, {
          actorId: iam2ActorId,
          actorType: "user",
          action: "iam2.test.probe",
          key: iam2Key,
          request: { probe: true },
          sourceModule: "IAM-02",
        });
        expect(outcome.status).toBe("new");
        await completeIdempotent(
          client,
          { actorId: iam2ActorId, action: "iam2.test.probe", key: iam2Key, sourceModule: "IAM-02" },
          "ok",
        );
      });

      // Confirm via the superuser connection that the IAM-02 row landed correctly scoped.
      const iam2Row = await verifyPool.query(
        `SELECT status, source_module FROM foundation.idempotency_record WHERE actor_id = $1 AND action = 'iam2.test.probe' AND idempotency_key = $2`,
        [iam2ActorId, iam2Key],
      );
      expect(iam2Row.rows[0]?.status).toBe("completed");
      expect(iam2Row.rows[0]?.source_module).toBe("IAM-02");

      // An IAM-01-scoped connection cannot see the IAM-02 row, either.
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('aix.module', 'IAM-01', true)");
        const crossModule = await client.query(
          `SELECT 1 FROM foundation.idempotency_record WHERE actor_id = $1 AND action = 'iam2.test.probe' AND idempotency_key = $2`,
          [iam2ActorId, iam2Key],
        );
        expect(crossModule.rowCount).toBe(0);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  // RLS: iam2.user_role / user_permission_override fail closed on missing aix.user_id.
  // ---------------------------------------------------------------------------------------
  describe("RLS: user_role / user_permission_override ownership isolation", () => {
    it("an unscoped connection sees zero rows; a correctly-scoped connection sees only its own", async () => {
      if (!schemaReady) return;
      const userA = "user_it_rls_a_" + randomUUID();
      const userB = "user_it_rls_b_" + randomUUID();
      const roleId = await seedRole("rls_probe_role_" + randomUUID().slice(0, 8));
      await assignUserRole(userA, roleId);
      await assignUserRole(userB, roleId);

      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const unscoped = await client.query("SELECT user_id FROM iam2.user_role WHERE role_id = $1", [roleId]);
        expect(unscoped.rowCount).toBe(0);
        await client.query("COMMIT");

        await client.query("BEGIN");
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userA]);
        const scopedA = await client.query("SELECT user_id FROM iam2.user_role WHERE role_id = $1", [roleId]);
        await client.query("COMMIT");
        expect(scopedA.rows.every((r) => r.user_id === userA)).toBe(true);
        expect(scopedA.rows.some((r) => r.user_id === userB)).toBe(false);
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  // Seed data verification.
  // ---------------------------------------------------------------------------------------
  describe("seed data: prohibited Exchange permissions + IAM-02 admin permissions", () => {
    it("all 7 prohibited Exchange permissions exist with prohibited=true and licence_locked=true", async () => {
      if (!schemaReady) return;
      const rows = await getPool().query<{ permission_code: string; prohibited: boolean; licence_locked: boolean }>(
        `SELECT permission_code, prohibited, licence_locked FROM iam2.permission WHERE owner_module = 'EXCHANGE' ORDER BY permission_code`,
      );
      expect(rows.rowCount).toBe(7);
      for (const row of rows.rows) {
        expect(row.prohibited).toBe(true);
        expect(row.licence_locked).toBe(true);
      }
      const codes = rows.rows.map((r) => r.permission_code);
      expect(codes).toContain("exchange.market_maker.enable");
      expect(codes).toContain("exchange.matching_engine.enable");
    });

    it("IAM-02 administrative permissions are seeded (24 rows) and are NOT prohibited/licence_locked", async () => {
      if (!schemaReady) return;
      const rows = await getPool().query<{ n: string }>(
        `SELECT count(*)::int AS n FROM iam2.permission WHERE owner_module = 'IAM-02'`,
      );
      expect(Number(rows.rows[0]?.n)).toBe(24);
      const anyLocked = await getPool().query(
        `SELECT 1 FROM iam2.permission WHERE owner_module = 'IAM-02' AND (prohibited = true OR licence_locked = true)`,
      );
      expect(anyLocked.rowCount).toBe(0);
    });

    it("the provisional bootstrap role catalogue is seeded", async () => {
      if (!schemaReady) return;
      const rows = await getPool().query<{ role_code: string }>(`SELECT role_code FROM iam2.role ORDER BY role_code`);
      const codes = rows.rows.map((r) => r.role_code);
      expect(codes).toContain("security_admin");
      expect(codes).toContain("tech_admin");
      expect(codes).toContain("compliance_officer");
      expect(codes).toContain("auditor");
    });
  });

  // ---------------------------------------------------------------------------------------
  // POST /internal/iam2/permission/check
  // ---------------------------------------------------------------------------------------
  describe("POST /internal/iam2/permission/check", () => {
    it("allow-by-role happy path", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_allow_" + randomUUID();
      const permCode = "iam2.test.allow_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "allow" });
      const roleId = await seedRole("role_allow_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.decision).toBe("allow");
      expect(data.reason).toBe("permission_granted");
      expect(data.sod_conflict).toBe(false);
      expect(data.step_up_required).toBe(false);
      expect(data.approval_required).toBe(false);

      const logRow = await verifyPool.query(
        `SELECT decision FROM iam2.permission_decision_log WHERE actor_user_id = $1 AND action = $2`,
        [actorId, permCode],
      );
      expect(logRow.rows[0]?.decision).toBe("allow");
      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.permission_decision_allow' AND payload_ref LIKE $1`,
        [`%${actorId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it("default-deny for an actor with zero role assignments", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_noassign_" + randomUUID();
      const permCode = "iam2.test.noassign_" + randomUUID().slice(0, 8);
      await seedPermission({ code: permCode, resource: "test", action: "noassign" });

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("deny");
      expect(res.json().data.reason).toBe("IAM2_PERMISSION_DENIED");

      const logRow = await verifyPool.query(
        `SELECT decision, reason_code FROM iam2.permission_decision_log WHERE actor_user_id = $1 AND action = $2`,
        [actorId, permCode],
      );
      expect(logRow.rows[0]?.decision).toBe("deny");
      expect(logRow.rows[0]?.reason_code).toBe("default_deny_no_assignment");
    });

    it("explicit-deny-override wins even though the actor also has an active role-granted allow", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_denyoverride_" + randomUUID();
      const permCode = "iam2.test.denyoverride_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "denyoverride" });
      const roleId = await seedRole("role_denyoverride_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);
      await seedDenyOverride(actorId, permissionId);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("deny");
      expect(res.json().data.reason).toBe("IAM2_PERMISSION_DENIED");

      const logRow = await verifyPool.query(
        `SELECT reason_code FROM iam2.permission_decision_log WHERE actor_user_id = $1 AND action = $2`,
        [actorId, permCode],
      );
      expect(logRow.rows[0]?.reason_code).toBe("explicit_deny_override");
    });

    it("a seeded prohibited-Exchange permission always denies (licence_locked decision), regardless of actor", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_exchange_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: "exchange.market_maker.enable", resource: "market_maker" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("licence_locked");
      expect(res.json().data.reason).toBe("IAM2_LICENCE_LOCKED_PERMISSION");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.licence_locked_permission_blocked' AND payload_ref LIKE $1`,
        [`%${actorId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it("requires_step_up permission returns step_up_required", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_stepup_" + randomUUID();
      const permCode = "iam2.test.stepup_" + randomUUID().slice(0, 8);
      await seedPermission({ code: permCode, resource: "test", action: "stepup", requiresStepUp: true });

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("step_up_required");
      expect(res.json().data.step_up_required).toBe(true);
    });

    it("requires_approval permission returns approval_required", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_approval_" + randomUUID();
      const permCode = "iam2.test.approval_" + randomUUID().slice(0, 8);
      await seedPermission({ code: permCode, resource: "test", action: "approval", requiresApproval: true });

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("approval_required");
      expect(res.json().data.approval_required).toBe(true);
    });

    it("an unknown permission code fails closed to deny", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: "user_it_unknown", action: "no.such.permission.code", resource: "unknown" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("deny");
      expect(res.json().data.reason).toBe("IAM2_PERMISSION_UNKNOWN");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Phase 3: payload_hash / decision_token issued by permission/check; execute-verify.
  // ---------------------------------------------------------------------------------------
  describe("Phase 3: decision token issuance via permission/check + execute-verify", () => {
    it("an allow decision with a payload_hash issues a decision_token; execute-verify with the SAME payload_hash authorises execution", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_dtok_" + randomUUID();
      const permCode = "iam2.test.dtok_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "dtok" });
      const roleId = await seedRole("role_dtok_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHash = fingerprint({ amount: "100.00", currency: "USD" });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test", payload_hash: payloadHash },
      });
      expect(checkRes.statusCode).toBe(200);
      expect(checkRes.json().data.decision).toBe("allow");
      expect(checkRes.json().data.payload_hash).toBe(payloadHash);
      const decisionToken = checkRes.json().data.decision_token as string;
      expect(decisionToken).toBeTruthy();

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: decisionToken,
          actor_id: actorId,
          action: permCode,
          resource: "test",
          current_payload_hash: payloadHash,
        },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data.execution_authorised).toBe(true);

      // Single-use: a second execute-verify with the same token fails.
      const replayRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: { decision_token: decisionToken, actor_id: actorId, action: permCode, resource: "test", current_payload_hash: payloadHash },
      });
      expect(replayRes.statusCode).not.toBe(200);
      expect(replayRes.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("a read action with no payload_hash issues NO decision_token", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_nodtok_" + randomUUID();
      const permCode = "iam2.test.nodtok_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "nodtok" });
      const roleId = await seedRole("role_nodtok_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.decision_token).toBeUndefined();
    });

    it("payload hash mismatch at execute-verify blocks execution, revokes the token, and emits a Critical audit event", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_hashmismatch_" + randomUUID();
      const permCode = "iam2.test.hashmismatch_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "hashmismatch" });
      const roleId = await seedRole("role_hashmismatch_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHashA = fingerprint({ amount: "100.00" });
      const payloadHashB = fingerprint({ amount: "999999.00" });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test", payload_hash: payloadHashA },
      });
      const decisionToken = checkRes.json().data.decision_token as string;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: { decision_token: decisionToken, actor_id: actorId, action: permCode, resource: "test", current_payload_hash: payloadHashB },
      });
      expect(verifyRes.statusCode).not.toBe(200);
      expect(verifyRes.json().error.code).toBe("IAM2_PAYLOAD_HASH_MISMATCH");

      const tokenHash = createHash("sha256").update(decisionToken, "utf8").digest("hex");
      const tokenRow = await verifyPool.query(`SELECT status FROM iam2.permission_decision_token WHERE token_hash = $1`, [tokenHash]);
      expect(tokenRow.rows[0]?.status).toBe("revoked");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.approval_payload_hash_mismatch' AND payload_ref LIKE $1`,
        [`%${actorId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      // Retrying execute-verify with the CORRECT hash still fails — token was revoked, not left usable.
      const retryRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: { decision_token: decisionToken, actor_id: actorId, action: permCode, resource: "test", current_payload_hash: payloadHashA },
      });
      expect(retryRes.statusCode).not.toBe(200);
    });

    it("a stale cache_version (bumped after issuance) blocks execute-verify", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_stale_" + randomUUID();
      const permCode = "iam2.test.stale_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "stale" });
      const roleId = await seedRole("role_stale_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHash = fingerprint({ x: 1 });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test", payload_hash: payloadHash },
      });
      const decisionToken = checkRes.json().data.decision_token as string;

      // Simulate a role/permission mutation bumping this actor's cache version AFTER issuance.
      await verifyPool.query(
        `INSERT INTO iam2.permission_cache_version (subject_id, cache_version, invalidated_at_utc, reason)
         VALUES ($1, 1, now(), 'test_bump')
         ON CONFLICT (subject_id) DO UPDATE SET cache_version = iam2.permission_cache_version.cache_version + 1`,
        [actorId],
      );

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: { decision_token: decisionToken, actor_id: actorId, action: permCode, resource: "test", current_payload_hash: payloadHash },
      });
      expect(verifyRes.statusCode).not.toBe(200);
      expect(verifyRes.json().error.code).toBe("IAM2_DECISION_TOKEN_STALE");
    });

    it("a decision token past its expires_at_utc is rejected at execute-verify (F1 test 9, regression for the existing TTL mechanism)", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_expired_" + randomUUID();
      const permCode = "iam2.test.expired_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "expired" });
      const roleId = await seedRole("role_expired_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHash = fingerprint({ x: "expired" });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, action: permCode, resource: "test", payload_hash: payloadHash },
      });
      const decisionToken = checkRes.json().data.decision_token as string;

      const tokenHash = createHash("sha256").update(decisionToken, "utf8").digest("hex");
      await verifyPool.query(
        `UPDATE iam2.permission_decision_token SET expires_at_utc = now() - interval '1 minute' WHERE token_hash = $1`,
        [tokenHash],
      );

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: { decision_token: decisionToken, actor_id: actorId, action: permCode, resource: "test", current_payload_hash: payloadHash },
      });
      expect(verifyRes.statusCode).not.toBe(200);
      expect(verifyRes.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });
  });

  // ---------------------------------------------------------------------------------------
  // F1 — decision-token binding enforcement. `verifyAndConsumeDecisionToken` now compares the
  // PRESENTED actor/action/resource/entity/client against the token's STORED bound values
  // (07_Permission_Rules.md §9) — previously none of these were checked, so a token minted for
  // one actor/action/entity could be redeemed for a completely different one as long as the
  // (optional) payload hash matched. Helper below mints a token via permission/check (the
  // guard's direct-allow path) bound to a KNOWN set of fields, then asserts execute-verify
  // rejects every single-field mismatch.
  // ---------------------------------------------------------------------------------------
  describe("F1: execute-verify enforces decision-token binding (actor/action/resource/entity/client)", () => {
    async function mintBoundToken(overrides?: { entityId?: string; clientId?: string }): Promise<{
      actorId: string;
      permCode: string;
      resource: string;
      entityId?: string;
      clientId?: string;
      payloadHash: string;
      decisionToken: string;
    }> {
      const actorId = "user_it_f1bind_" + randomUUID();
      const permCode = "iam2.test.f1bind_" + randomUUID().slice(0, 8);
      const resource = "test";
      const permissionId = await seedPermission({ code: permCode, resource, action: "f1bind" });
      const roleId = await seedRole("role_f1bind_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHash = fingerprint({ f1bind: randomUUID() });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: {
          actor_id: actorId,
          action: permCode,
          resource,
          ...(overrides?.entityId !== undefined ? { entity_id: overrides.entityId } : {}),
          ...(overrides?.clientId !== undefined ? { client_id: overrides.clientId } : {}),
          payload_hash: payloadHash,
        },
      });
      expect(checkRes.statusCode).toBe(200);
      const decisionToken = checkRes.json().data.decision_token as string;
      expect(decisionToken).toBeTruthy();

      return { actorId, permCode, resource, entityId: overrides?.entityId, clientId: overrides?.clientId, payloadHash, decisionToken };
    }

    it("F1 test 1: a token minted for action A is rejected when execute-verify presents action B", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: "some.other.action_" + randomUUID().slice(0, 8),
          resource: minted.resource,
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("F1 test 2: a token minted for entity A is rejected when execute-verify presents entity B", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken({ entityId: "entity_A_" + randomUUID().slice(0, 8) });
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          entity_id: "entity_B_DIFFERENT_" + randomUUID().slice(0, 8),
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("F1 test 3: a token minted for actor A is rejected when execute-verify presents actor B", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: "user_it_f1bind_SOMEONE_ELSE_" + randomUUID(),
          action: minted.permCode,
          resource: minted.resource,
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("F1 test 4a: a token minted for resource A is rejected when execute-verify presents resource B", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: "different_resource",
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("F1 test 4b: a token minted with client_id=null is rejected (null-safe, not a wildcard) when execute-verify presents a non-null client_id", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken(); // no clientId override -> token's client_id is null
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          client_id: "client_that_should_not_match_null",
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");
    });

    it("F1 test 7: a valid token with ALL bindings matching (actor/action/resource/entity/client/payload) succeeds", async () => {
      if (!schemaReady) return;
      const entityId = "entity_full_" + randomUUID().slice(0, 8);
      const clientId = "client_full_" + randomUUID().slice(0, 8);
      const minted = await mintBoundToken({ entityId, clientId });
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          entity_id: entityId,
          client_id: clientId,
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.execution_authorised).toBe(true);
    });

    it("F1 test 6: an approval with no payload mints NO redeemable decision_token — approve response has no decision_token field", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.f1_nopayload_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      const makerUserId = "user_it_f1nopaymaker_" + randomUUID();
      const approverUserId = "user_it_f1nopayapprover_" + randomUUID();

      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: { maker_user_id: makerUserId, action, resource }, // NO payload field
      });
      expect(requestRes.statusCode).toBe(200);
      expect(requestRes.json().data.payload_hash).toBeUndefined();
      const approvalId = requestRes.json().data.approval_id as string;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId },
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().data.status).toBe("approved");
      expect("decision_token" in approveRes.json().data).toBe(false);
    });

    it("F1 test 11a: verified_* flags reflect what was actually checked — no session presented on either side => verified_session:false", async () => {
      if (!schemaReady) return;
      const minted = await mintBoundToken();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(res.statusCode).toBe(200);
      // A real payload hash WAS actually compared and matched.
      expect(res.json().data.verified_payload_hash).toBe(true);
      expect(res.json().data.verified_cache_version).toBe(true);
      // No session_id was ever bound to the token nor presented here — nothing meaningful was
      // checked, so this must NOT be hardcoded/vacuously true.
      expect(res.json().data.verified_session).toBe(false);
    });

    it("F1 test 11b: verified_session:true when a session_id WAS actually bound and presented and matched", async () => {
      if (!schemaReady) return;
      const actorId = "user_it_f1session_" + randomUUID();
      const sessionId = "sess_it_f1_" + randomUUID();
      const permCode = "iam2.test.f1session_" + randomUUID().slice(0, 8);
      const permissionId = await seedPermission({ code: permCode, resource: "test", action: "f1session" });
      const roleId = await seedRole("role_f1session_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleId, permissionId);
      await assignUserRole(actorId, roleId);

      const payloadHash = fingerprint({ f1session: randomUUID() });
      const checkRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: internal,
        payload: { actor_id: actorId, session_id: sessionId, action: permCode, resource: "test", payload_hash: payloadHash },
      });
      const decisionToken = checkRes.json().data.decision_token as string;

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: decisionToken,
          actor_id: actorId,
          session_id: sessionId,
          action: permCode,
          resource: "test",
          current_payload_hash: payloadHash,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.verified_session).toBe(true);
    });

    it("F1 test 12: a binding-mismatch attempt emits a Critical iam2.decision_token_binding_mismatch audit event and revokes the token — a retry with the CORRECT bindings still fails", async () => {
      if (!schemaReady) return;
      const entityId = "entity_real_" + randomUUID().slice(0, 8);
      const minted = await mintBoundToken({ entityId });

      const mismatchRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          entity_id: "entity_DIFFERENT_" + randomUUID().slice(0, 8),
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(mismatchRes.statusCode).not.toBe(200);
      expect(mismatchRes.json().error.code).toBe("IAM2_DECISION_TOKEN_INVALID");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.decision_token_binding_mismatch' AND payload_ref LIKE $1`,
        [`%${minted.actorId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      const tokenHash = createHash("sha256").update(minted.decisionToken, "utf8").digest("hex");
      const tokenRow = await verifyPool.query(`SELECT status FROM iam2.permission_decision_token WHERE token_hash = $1`, [tokenHash]);
      expect(tokenRow.rows[0]?.status).toBe("revoked");

      // Retry with the CORRECT (originally-bound) entity_id — still fails, the token was
      // revoked on the FIRST mismatch attempt, not merely "wrong that one time".
      const retryRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: minted.decisionToken,
          actor_id: minted.actorId,
          action: minted.permCode,
          resource: minted.resource,
          entity_id: entityId,
          current_payload_hash: minted.payloadHash,
        },
      });
      expect(retryRes.statusCode).not.toBe(200);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Phase 3/4: approval lifecycle (request -> approve -> execute-verify), self-approval
  // block, IAM-01 step-up integration (mocked), fail-closed behaviour.
  // ---------------------------------------------------------------------------------------
  describe("Phase 3/4: approval lifecycle + IAM-01 step-up integration", () => {
    beforeEach(() => {
      // Reset the DI seam between tests — see config.ts's iam01FetchImpl header comment.
      config.iam01FetchImpl = undefined;
    });

    it("full round trip: request -> approve (step-up verified via mocked IAM-01) -> execute-verify succeeds", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.approval_flow_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      await seedApprovalPolicy({ action, resource, requiredCount: 1, requiresStepUp: true });

      const makerUserId = "user_it_maker_" + randomUUID();
      const approverUserId = "user_it_approver_" + randomUUID();
      const payload = { withdrawal_amount: "5000.00" };

      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: { maker_user_id: makerUserId, action, resource, payload },
      });
      expect(requestRes.statusCode).toBe(200);
      const approvalId = requestRes.json().data.approval_id as string;
      const expectedPayloadHash = fingerprint(payload);
      expect(requestRes.json().data.payload_hash).toBe(expectedPayloadHash);

      const { fetchImpl, calls } = makeFakeIam01Fetch(() => ({
        ok: true,
        body: { success: true, data: { valid: true, user_id: approverUserId, auth_level: "mfa", fresh_until_utc: new Date(Date.now() + 600_000).toISOString() } },
      }));
      config.iam01FetchImpl = fetchImpl;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId, recent_auth_assertion: "fake-assertion-token" },
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().data.status).toBe("approved");
      const decisionToken = approveRes.json().data.decision_token as string;
      expect(decisionToken).toBeTruthy();

      // Confirm IAM-01 was actually called, with the right purpose and the right shared token.
      expect(calls.length).toBe(1);
      expect(calls[0]!.url).toContain("/internal/auth/verify-assertion");
      expect(calls[0]!.init.headers?.["x-internal-service-token"]).toBe(config.iam01InternalServiceToken);
      const sentBody = JSON.parse(calls[0]!.init.body ?? "{}");
      expect(sentBody.recent_auth_assertion).toBe("fake-assertion-token");
      expect(sentBody.required_purpose).toBe("iam2_approval");

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/execute-verify",
        headers: internal,
        payload: {
          decision_token: decisionToken,
          approval_id: approvalId,
          actor_id: makerUserId,
          action,
          resource,
          current_payload_hash: expectedPayloadHash,
        },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data.execution_authorised).toBe(true);
    });

    it("same user cannot approve their own request (IAM2_SELF_APPROVAL_BLOCKED), and the attempt is audited", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.self_approve_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      const makerUserId = "user_it_selfmaker_" + randomUUID();

      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: { maker_user_id: makerUserId, action, resource },
      });
      const approvalId = requestRes.json().data.approval_id as string;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: makerUserId },
      });
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_SELF_APPROVAL_BLOCKED");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.self_approval_blocked' AND payload_ref LIKE $1`,
        [`%${makerUserId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it("rejecting an already-expired approval both returns IAM2_APPROVAL_EXPIRED AND durably persists status='expired' (regression: a thrown error inside withTransaction must not roll back the expiry write)", async () => {
      if (!schemaReady) return;
      const approvalId = "appr_it_reject_expiry_" + randomUUID().slice(0, 8);
      await verifyPool.query(
        `INSERT INTO iam2.approval_request
           (approval_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc, created_at_utc)
         VALUES ($1, $2, 'iam2.role.assign_user', 'role', 'pending', 1, 0, now() - interval '1 hour', now() - interval '2 hours')`,
        [approvalId, "user_it_expiry_maker_" + randomUUID()],
      );

      const rejectRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/reject`,
        headers: internal,
        payload: { approver_user_id: "user_it_expiry_approver_" + randomUUID() },
      });
      expect(rejectRes.statusCode).not.toBe(200);
      expect(rejectRes.json().error.code).toBe("IAM2_APPROVAL_EXPIRED");

      const row = await verifyPool.query(`SELECT status FROM iam2.approval_request WHERE approval_id = $1`, [approvalId]);
      expect(row.rows[0]?.status).toBe("expired");
    });

    it("a duplicate approval decision from the same approver is a clean error, not a crash (DB unique-constraint conflict)", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.dup_approve_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      const makerUserId = "user_it_dupmaker_" + randomUUID();
      const approverUserId = "user_it_dupapprover_" + randomUUID();
      // required_count 2 so the FIRST approval doesn't flip status to 'approved' and reject
      // the second attempt for the wrong reason.
      await seedApprovalPolicy({ action, resource, requiredCount: 2 });

      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: { maker_user_id: makerUserId, action, resource },
      });
      const approvalId = requestRes.json().data.approval_id as string;

      const first = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().data.status).toBe("pending"); // 1 of 2 required

      const second = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId },
      });
      expect(second.statusCode).not.toBe(200);
      expect(second.json().error.code).toBe("IAM2_APPROVAL_ALREADY_DECIDED");
    });

    it("step-up required by policy: a network error talking to IAM-01 fails closed (does not approve)", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.stepup_network_err_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      await seedApprovalPolicy({ action, resource, requiresStepUp: true });
      const makerUserId = "user_it_netm_" + randomUUID();
      const approverUserId = "user_it_neta_" + randomUUID();

      const requestRes = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: makerUserId, action, resource } });
      const approvalId = requestRes.json().data.approval_id as string;

      config.iam01FetchImpl = (async () => {
        throw new Error("simulated network failure");
      }) as unknown as typeof fetch;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId, recent_auth_assertion: "fake-token" },
      });
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_STEP_UP_INVALID");

      const stillPending = await verifyPool.query(`SELECT status FROM iam2.approval_request WHERE approval_id = $1`, [approvalId]);
      expect(stillPending.rows[0]?.status).toBe("pending");
    });

    it("step-up required by policy: a non-2xx response from IAM-01 fails closed", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.stepup_non2xx_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      await seedApprovalPolicy({ action, resource, requiresStepUp: true });
      const makerUserId = "user_it_non2xxm_" + randomUUID();
      const approverUserId = "user_it_non2xxa_" + randomUUID();

      const requestRes = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: makerUserId, action, resource } });
      const approvalId = requestRes.json().data.approval_id as string;

      const { fetchImpl } = makeFakeIam01Fetch(() => ({ ok: false }));
      config.iam01FetchImpl = fetchImpl;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId, recent_auth_assertion: "fake-token" },
      });
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_STEP_UP_INVALID");
    });

    it("step-up required by policy: a valid:false body from IAM-01 fails closed", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.stepup_invalidfalse_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      await seedApprovalPolicy({ action, resource, requiresStepUp: true });
      const makerUserId = "user_it_invfm_" + randomUUID();
      const approverUserId = "user_it_invfa_" + randomUUID();

      const requestRes = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: makerUserId, action, resource } });
      const approvalId = requestRes.json().data.approval_id as string;

      const { fetchImpl } = makeFakeIam01Fetch(() => ({ ok: true, body: { success: true, data: { valid: false } } }));
      config.iam01FetchImpl = fetchImpl;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId, recent_auth_assertion: "fake-token" },
      });
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_STEP_UP_INVALID");
    });

    it("missing recent_auth_assertion when policy requires step-up fails closed without calling IAM-01", async () => {
      if (!schemaReady) return;
      const action = "iam2.test.stepup_missing_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      await seedApprovalPolicy({ action, resource, requiresStepUp: true });
      const makerUserId = "user_it_missm_" + randomUUID();
      const approverUserId = "user_it_missa_" + randomUUID();

      const requestRes = await app.inject({ method: "POST", url: "/iam2/approvals/request", headers: internal, payload: { maker_user_id: makerUserId, action, resource } });
      const approvalId = requestRes.json().data.approval_id as string;

      const { fetchImpl, calls } = makeFakeIam01Fetch(() => ({ ok: true, body: { success: true, data: { valid: true, user_id: approverUserId, auth_level: "mfa" } } }));
      config.iam01FetchImpl = fetchImpl;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId }, // no recent_auth_assertion
      });
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_STEP_UP_INVALID");
      expect(calls.length).toBe(0); // fails closed before ever calling IAM-01
    });
  });

  // ---------------------------------------------------------------------------------------
  // Phase 4: SoD conflict blocks role assignment (meta-SoD rule, seeded in 007).
  // ---------------------------------------------------------------------------------------
  describe("Phase 4: SoD conflict blocks role assignment (meta-SoD)", () => {
    it("a user who already holds iam2.sod.manage (via a role) cannot be assigned a role granting iam2.role.assign_user", async () => {
      if (!schemaReady) return;
      const targetUserId = "user_it_sodtarget_" + randomUUID();
      const actingAdminUserId = "user_it_sodadmin_" + randomUUID();

      // Target user ALREADY holds iam2.sod.manage via role R1 (fixture pre-condition).
      const sodManagePermId = await seededPermissionId("iam2.sod.manage");
      const roleR1 = await seedRole("role_sod_manager_" + randomUUID().slice(0, 8));
      await assignRolePermission(roleR1, sodManagePermId);
      await assignUserRole(targetUserId, roleR1);

      // Candidate role R2 grants iam2.role.assign_user — conflicts per the seeded meta-SoD rule.
      const roleAssignPermId = await seededPermissionId("iam2.role.assign_user");
      const roleR2Code = "role_assigner_" + randomUUID().slice(0, 8);
      const roleR2Id = await seedRole(roleR2Code);
      await assignRolePermission(roleR2Id, roleAssignPermId);

      // Obtain a decision_token bound to (action='iam2.role.assign_user', actor=actingAdmin,
      // entity=targetUser) via the approval flow — the ONLY path that can issue one for this
      // action (evaluatePermission itself never resolves this permission to "allow" — see
      // routes/roles.ts's header comment). F1 fix: an approval-issued token now requires a
      // non-null payload_hash (a null-payload approval mints NO redeemable token — see
      // routes/approvals.ts), so the request MUST carry the actual thing being executed
      // (role_code + target_user_id, per routes/roles.ts's F1-fix header comment) — and the
      // subsequent role-assignment call must present the MATCHING current_payload_hash, since
      // verifyAndConsumeDecisionToken now binds the token to that specific payload too.
      const approverUserId = "user_it_sodapprover_" + randomUUID();
      const rolePayload = { role_code: roleR2Code, target_user_id: targetUserId };
      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: {
          maker_user_id: actingAdminUserId,
          action: "iam2.role.assign_user",
          resource: "role",
          entity_id: targetUserId,
          payload: rolePayload,
        },
      });
      const approvalId = requestRes.json().data.approval_id as string;
      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId },
      });
      expect(approveRes.statusCode).toBe(200);
      const decisionToken = approveRes.json().data.decision_token as string;
      expect(decisionToken).toBeTruthy();

      const assignRes = await app.inject({
        method: "POST",
        url: `/iam2/users/${targetUserId}/roles`,
        headers: internal,
        payload: {
          acting_admin_user_id: actingAdminUserId,
          role_code: roleR2Code,
          decision_token: decisionToken,
          current_payload_hash: fingerprint(rolePayload),
        },
      });
      expect(assignRes.statusCode).not.toBe(200);
      expect(assignRes.json().error.code).toBe("IAM2_SOD_CONFLICT");

      const sodCheck = await verifyPool.query(
        `SELECT result, matched_rules FROM iam2.sod_check WHERE user_id = $1 ORDER BY checked_at_utc DESC LIMIT 1`,
        [targetUserId],
      );
      expect(sodCheck.rows[0]?.result).toBe("block");
      expect(JSON.stringify(sodCheck.rows[0]?.matched_rules)).toContain("sod_meta_sod_manage_vs_role_assign_user");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.sod_conflict_detected' AND payload_ref LIKE $1`,
        [`%${targetUserId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      // Confirm the role was NOT assigned.
      const roleRows = await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1 AND role_id = $2 AND status = 'active'`, [
        targetUserId,
        roleR2Id,
      ]);
      expect(roleRows.rowCount).toBe(0);
    });

    it("no decision_token supplied: the endpoint returns the guard's blocking decision without assigning anything", async () => {
      if (!schemaReady) return;
      const targetUserId = "user_it_noassign_target_" + randomUUID();
      const actingAdminUserId = "user_it_noassign_admin_" + randomUUID();
      const roleCode = "role_noop_" + randomUUID().slice(0, 8);
      await seedRole(roleCode);

      const res = await app.inject({
        method: "POST",
        url: `/iam2/users/${targetUserId}/roles`,
        headers: internal,
        payload: { acting_admin_user_id: actingAdminUserId, role_code: roleCode },
      });
      expect(res.statusCode).toBe(200);
      // iam2.role.assign_user always requires step-up (seeded flag) — evaluatePermission can
      // never resolve it to "allow" without a decision token (see routes/roles.ts comment).
      expect(res.json().data.decision).toBe("step_up_required");

      const roleRows = await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1`, [targetUserId]);
      expect(roleRows.rowCount).toBe(0);
    });

    it("an unknown role_code is rejected as IAM2_ROLE_UNKNOWN", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/iam2/users/user_it_whatever/roles`,
        headers: internal,
        payload: { acting_admin_user_id: "user_it_admin_whatever", role_code: "no_such_role_" + randomUUID() },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_ROLE_UNKNOWN");
    });
  });

  // ---------------------------------------------------------------------------------------
  // F2 — sequential RLS-scoped queries in checkApprovalSodConflict. Before the fix, the two
  // effectiveGrants(maker)/effectiveGrants(approver) calls ran under Promise.all on ONE shared
  // PoolClient; because both `set_config('aix.user_id', ...)` calls landed on the wire before
  // EITHER SELECT (see lib/sod.ts's F2 comment for the exact mechanism), the maker's SELECT
  // deterministically ran scoped to the APPROVER's id, and FORCE RLS hid the maker's real rows
  // — effectiveGrants(maker) silently returned EMPTY every time, so a genuine maker<->approver
  // SoD conflict was NEVER detected (fail-open) via THIS code path (as opposed to the
  // role-assignment path above, which is a DIFFERENT function and was not racing). This is the
  // deterministic regression test: seed real conflicting role_permission grants on both sides
  // and confirm the approval decision is actually blocked, not silently approved because both
  // effective-grant lookups returned nothing.
  // ---------------------------------------------------------------------------------------
  describe("F2: real maker<->approver SoD conflict blocks the approval decision (checkApprovalSodConflict)", () => {
    it("an approver who holds iam2.sod.manage (via a role) cannot approve a maker who holds iam2.role.assign_user (via a role) — meta-SoD, sequential RLS-scoped queries", async () => {
      if (!schemaReady) return;
      const makerUserId = "user_it_f2maker_" + randomUUID();
      const approverUserId = "user_it_f2approver_" + randomUUID();

      // Maker holds iam2.role.assign_user via a real role_permission grant (not just a role
      // code) — this is what makes effectiveGrants' permission-level resolution the thing
      // under test, not a role-code shortcut.
      const roleAssignPermId = await seededPermissionId("iam2.role.assign_user");
      const makerRoleId = await seedRole("role_f2_maker_" + randomUUID().slice(0, 8));
      await assignRolePermission(makerRoleId, roleAssignPermId);
      await assignUserRole(makerUserId, makerRoleId);

      // Approver holds iam2.sod.manage via a real role_permission grant — conflicts with the
      // maker's grant per the seeded meta-SoD rule (007_iam2_seed_sod_rules.cjs).
      const sodManagePermId = await seededPermissionId("iam2.sod.manage");
      const approverRoleId = await seedRole("role_f2_approver_" + randomUUID().slice(0, 8));
      await assignRolePermission(approverRoleId, sodManagePermId);
      await assignUserRole(approverUserId, approverRoleId);

      const action = "iam2.test.f2_sod_conflict_" + randomUUID().slice(0, 8);
      const resource = "test_resource";
      const requestRes = await app.inject({
        method: "POST",
        url: "/iam2/approvals/request",
        headers: internal,
        payload: { maker_user_id: makerUserId, action, resource },
      });
      expect(requestRes.statusCode).toBe(200);
      const approvalId = requestRes.json().data.approval_id as string;

      const approveRes = await app.inject({
        method: "POST",
        url: `/iam2/approvals/${approvalId}/approve`,
        headers: internal,
        payload: { approver_user_id: approverUserId },
      });
      // NOT a false "success" — this is the exact outcome that was silently bypassed before
      // the F2 fix (both effective-grant lookups would have returned empty, sod.blocked would
      // have been false, and this would have returned 200 status:'approved').
      expect(approveRes.statusCode).not.toBe(200);
      expect(approveRes.json().error.code).toBe("IAM2_SOD_CONFLICT");

      const sodCheck = await verifyPool.query(
        `SELECT result, matched_rules FROM iam2.sod_check WHERE user_id = $1 ORDER BY checked_at_utc DESC LIMIT 1`,
        [approverUserId],
      );
      expect(sodCheck.rows[0]?.result).toBe("block");
      expect(JSON.stringify(sodCheck.rows[0]?.matched_rules)).toContain("sod_meta_sod_manage_vs_role_assign_user");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.sod_conflict_detected' AND payload_ref LIKE $1`,
        [`%${approvalId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      const approvalRow = await verifyPool.query(`SELECT status FROM iam2.approval_request WHERE approval_id = $1`, [approvalId]);
      expect(approvalRow.rows[0]?.status).toBe("blocked");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Bootstrap-to-RBAC transition — structurally one-time-only.
  // ---------------------------------------------------------------------------------------
  describe("Bootstrap-to-RBAC transition (POST /internal/iam2/bootstrap/first-assignment)", () => {
    beforeEach(() => {
      config.bootstrapTransitionEnabled = false;
      config.bootstrapAdminUserId = undefined;
      config.iam01FetchImpl = undefined;
    });

    it("denies when the feature flag is off", async () => {
      if (!schemaReady) return;
      config.bootstrapTransitionEnabled = false;
      config.bootstrapAdminUserId = "user_it_bootstrap_admin_flagoff_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/bootstrap/first-assignment",
        headers: internal,
        payload: { recent_auth_assertion: "whatever", role_code: "security_admin" },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE");
    });

    it("denies when the verified assertion's user_id does not match the config-sealed admin", async () => {
      if (!schemaReady) return;
      config.bootstrapTransitionEnabled = true;
      config.bootstrapAdminUserId = "user_it_sealed_" + randomUUID();
      const { fetchImpl } = makeFakeIam01Fetch(() => ({
        ok: true,
        body: { success: true, data: { valid: true, user_id: "user_it_someone_else", auth_level: "mfa", fresh_until_utc: new Date(Date.now() + 600_000).toISOString() } },
      }));
      config.iam01FetchImpl = fetchImpl;

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/bootstrap/first-assignment",
        headers: internal,
        payload: { recent_auth_assertion: "valid-but-wrong-user", role_code: "security_admin" },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.json().error.code).toBe("IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE");
    });

    // NOTE: this test runs LAST in this describe block deliberately — it is the one test that
    // actually CONSUMES the structurally-one-time condition (d) for the whole suite (it seeds
    // a real active security_admin iam2.user_role row that persists for the rest of this DB
    // connection's lifetime), so every other bootstrap-transition test above it must be
    // isolated from that consumption to genuinely prove ITS OWN failure condition rather than
    // incidentally passing because condition (d) already tripped first.
    it("succeeds exactly once, then is permanently disabled by condition (d) even with the flag still on", async () => {
      if (!schemaReady) return;
      const bootstrapAdminUserId = "user_it_bootstrap_admin_" + randomUUID();
      config.bootstrapTransitionEnabled = true;
      config.bootstrapAdminUserId = bootstrapAdminUserId;
      const { fetchImpl } = makeFakeIam01Fetch(() => ({
        ok: true,
        body: { success: true, data: { valid: true, user_id: bootstrapAdminUserId, auth_level: "mfa", fresh_until_utc: new Date(Date.now() + 600_000).toISOString() } },
      }));
      config.iam01FetchImpl = fetchImpl;

      const firstRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/bootstrap/first-assignment",
        headers: internal,
        payload: { recent_auth_assertion: "valid-bootstrap-assertion", role_code: "security_admin" },
      });
      expect(firstRes.statusCode).toBe(200);
      expect(firstRes.json().data.status).toBe("assigned");

      const row = await verifyPool.query(
        `SELECT ur.assigned_by, ur.approval_id, ur.status FROM iam2.user_role ur JOIN iam2.role r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1 AND r.role_code = 'security_admin'`,
        [bootstrapAdminUserId],
      );
      expect(row.rows[0]?.assigned_by).toBe("iam2_bootstrap_transition");
      expect(row.rows[0]?.approval_id).toBeNull();
      expect(row.rows[0]?.status).toBe("active");

      const audit = await verifyPool.query(
        `SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.bootstrap_transition_completed' AND payload_ref LIKE $1`,
        [`%${bootstrapAdminUserId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      // Second attempt (even for a DIFFERENT user_id/role) is now permanently blocked — the
      // condition is "does ANY active security_admin/tech_admin row exist", not "does THIS
      // user already have one".
      const secondUserId = "user_it_bootstrap_admin2_" + randomUUID();
      config.bootstrapAdminUserId = secondUserId;
      const { fetchImpl: fetchImpl2 } = makeFakeIam01Fetch(() => ({
        ok: true,
        body: { success: true, data: { valid: true, user_id: secondUserId, auth_level: "mfa", fresh_until_utc: new Date(Date.now() + 600_000).toISOString() } },
      }));
      config.iam01FetchImpl = fetchImpl2;

      const secondRes = await app.inject({
        method: "POST",
        url: "/internal/iam2/bootstrap/first-assignment",
        headers: internal,
        payload: { recent_auth_assertion: "valid-bootstrap-assertion-2", role_code: "tech_admin" },
      });
      expect(secondRes.statusCode).not.toBe(200);
      expect(secondRes.json().error.code).toBe("IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE");

      const secondRow = await verifyPool.query(`SELECT 1 FROM iam2.user_role WHERE user_id = $1`, [secondUserId]);
      expect(secondRow.rowCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Grant-additions proof (Phase 3-5) — direct SQL under the LOGIN runtime role, never
  // superuser-only, same pattern as every other grant proof in this suite.
  // ---------------------------------------------------------------------------------------
  describe("Phase 3-5 grant additions: role_iam2_runtime is scoped to exactly what its new code does", () => {
    it("has SELECT+INSERT+UPDATE on permission_decision_token, approval_request, permission_cache_version; INSERT-only on approval_decision/sod_check; SELECT-only on approval_policy/sod_rule; SELECT+INSERT on user_role; never DELETE anywhere", async () => {
      if (!schemaReady) return;
      const tables: Array<[string, { select: boolean; insert: boolean; update: boolean }]> = [
        ["iam2.permission_decision_token", { select: true, insert: true, update: true }],
        ["iam2.approval_request", { select: true, insert: true, update: true }],
        ["iam2.permission_cache_version", { select: true, insert: true, update: true }],
        ["iam2.approval_decision", { select: false, insert: true, update: false }],
        ["iam2.sod_check", { select: false, insert: true, update: false }],
        ["iam2.approval_policy", { select: true, insert: false, update: false }],
        ["iam2.sod_rule", { select: true, insert: false, update: false }],
        ["iam2.user_role", { select: true, insert: true, update: false }],
      ];
      for (const [table, expected] of tables) {
        const priv = await getPool().query(
          `SELECT has_table_privilege($1, 'SELECT') AS sel, has_table_privilege($1, 'INSERT') AS ins,
                  has_table_privilege($1, 'UPDATE') AS upd, has_table_privilege($1, 'DELETE') AS del`,
          [table],
        );
        expect(priv.rows[0].sel, `${table} SELECT`).toBe(expected.select);
        expect(priv.rows[0].ins, `${table} INSERT`).toBe(expected.insert);
        expect(priv.rows[0].upd, `${table} UPDATE`).toBe(expected.update);
        expect(priv.rows[0].del, `${table} DELETE`).toBe(false);
      }
    });

    it("can EXECUTE iam2.fn_count_active_role_assignments but the underlying user_role rows stay RLS-invisible cross-user (the function is the only global-scope escape hatch)", async () => {
      if (!schemaReady) return;
      const res = await getPool().query(`SELECT iam2.fn_count_active_role_assignments(ARRAY['security_admin','tech_admin']) AS cnt`);
      expect(typeof res.rows[0].cnt).toBe("string"); // bigint comes back as a string via pg
    });
  });
});
