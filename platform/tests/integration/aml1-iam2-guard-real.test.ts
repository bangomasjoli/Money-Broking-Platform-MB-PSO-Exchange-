/**
 * AML-01 Phase 2B — real IAM-02 guard regression coverage. Mirrors
 * `tests/integration/clt1-iam2-guard-real.test.ts` (itself modelled on
 * `cfg1-iam2-guard-real.test.ts`) exactly: every OTHER AML-01 integration test stubs
 * `config.iam2FetchImpl` (tests/integration/aml1-db.test.ts) — a deliberate, documented choice —
 * but that means nothing in this codebase's test suite would otherwise exercise what IAM-02's REAL
 * `services/iam2/src/lib/guard.ts` returns for a real, migration-036-seeded `aml1.*` permission
 * row. CFG-01 Phase 3A's own F-1 finding (`licence_locked = true` unconditionally denying six
 * permissions against the real guard) was hidden from both the implementing pass and the first
 * review pass by exactly this blind spot — every positive-path test used a stub that simply
 * returned `{decision: "allow"}` regardless of what the real guard would say. This file closes
 * that gap for AML-01's own IAM-02 integration from day one, for all 4 Phase 2B permissions and
 * (extended here) all 4 Phase 3C permissions (`aml1.rescreen.request`/`aml1.monitoring.run`/
 * `aml1.risk_signal.read`/`aml1.risk_signal.acknowledge` — migration
 * `040_iam2_register_aml1_phase3c_permissions.cjs`), all `requires_approval=false` this phase.
 *
 * Builds and LISTENS a real IAM-02 app (`services/iam2/src/server.ts`'s `buildApp`,
 * `app.listen({port: 0})` on an ephemeral port) backed by the SAME disposable Postgres every other
 * integration test in this suite uses, and calls AML-01's own `lib/iam2-client.ts`
 * `checkPermission` against it over REAL HTTP — the same client code AML-01's routes actually use,
 * pointed at a REAL server instead of a stub. No `iam2FetchImpl` stub anywhere in this file.
 *
 * Self-skips (like every other integration test here) unless `TEST_DATABASE_URL` points at a
 * Postgres with `iam2` (006-007, ..., 036) already migrated and `iam2_runtime_grants.sql` applied.
 *
 * Phase 3D extension: the same coverage for the 2 new stuck-screening permissions
 * (`aml1.screening.stuck_read`/`aml1.screening.stuck_recover` — migration
 * `041_iam2_register_aml1_phase3d_permissions.cjs`), bringing AML-01's total to 11. Both
 * `requires_approval=false` — `aml1.screening.stuck_recover` in particular relies on a genuine
 * `decision:allow` (never `approval_required`/`step_up_required`) as the ONLY gate, per confirmed
 * Phase 3D decision D2 (`routes/stuck-screening.ts`'s own structural `permission_granted`
 * assertion).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp as buildIam2App } from "../../services/iam2/src/server.js";
import { checkPermission, type Iam2ClientConfig } from "../../services/aml1/src/lib/iam2-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_app_test_aml1";

const iam2Config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-iam2-internal-token-aml1-real-guard-it",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: "test-iam2-internal-token-aml1-real-guard-it",
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-token-unused",
  bootstrapTransitionEnabled: false,
};

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;
let aml1ClientConfig: Iam2ClientConfig;

const AML1_PERMISSIONS_SINGLE_STEP = [
  "aml1.screening.read",
  "aml1.screening.sensitive_read",
  "aml1.provider.read",
  "aml1.rescreen.request",
  "aml1.monitoring.run",
  "aml1.risk_signal.read",
  "aml1.risk_signal.acknowledge",
  "aml1.screening.stuck_read",
  "aml1.screening.stuck_recover",
];
const AML1_PERMISSIONS_MAKER_CHECKER = ["aml1.match.confirm", "aml1.match.dismiss"];

function resourceForAction(action: string): string {
  if (action === "aml1.rescreen.request") return "screening";
  if (action.startsWith("aml1.screening")) return "screening";
  if (action.startsWith("aml1.provider")) return "provider";
  if (action === "aml1.monitoring.run") return "monitoring_run";
  if (action.startsWith("aml1.risk_signal")) return "risk_signal";
  return "screening_match";
}

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2') AS iam2`);
    return Number(r.rows[0]?.iam2) > 0;
  } catch {
    return false;
  }
}

describe("AML-01 Phase 2B — real IAM-02 guard regression (no stub)", () => {
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
    await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildIam2App(iam2Config);
    // Real HTTP server on an ephemeral port — AML-01's iam2-client.ts uses the global `fetch`, not
    // app.inject(), so it needs something real to connect to over the network.
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    aml1ClientConfig = { baseUrl: `http://127.0.0.1:${port}`, internalServiceToken: iam2Config.iam2InternalServiceToken };
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  // M-REV-1 CLOSURE: a fail-loud canary proving the app's own runtime pool (`initPool(runtimeDbUrl)`
  // above) genuinely authenticates as the restricted `${RUNTIME_ROLE_USER}` role, never `postgres`
  // superuser — queried via a SEPARATE connection opened with the SAME `runtimeDbUrl` derivation, so
  // this proves the URL rewrite itself resolves correctly (not merely that a role of this name
  // exists and happens to be unprivileged). Guard-test semantics below are otherwise unchanged.
  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser (fail-loud, not a silent skip)", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL with the iam2 schema present — this must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const r = await probe.query<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT current_user, session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      const row = r.rows[0];
      expect(row, "runtime-role identity query returned no row").toBeTruthy();
      expect(row.current_user).toBe(RUNTIME_ROLE_USER);
      expect(row.current_user).not.toBe("postgres");
      expect(row.session_user).toBe(RUNTIME_ROLE_USER);
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("catalogue — direct inspection", () => {
    it("all 11 aml1.* permissions have licence_locked = false (5 from Phase 2B/3B + 4 from Phase 3C + 2 from Phase 3D)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code, licence_locked FROM iam2.permission WHERE permission_code LIKE 'aml1.%' ORDER BY permission_code`);
      expect(rows.rows).toHaveLength(11);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must have licence_locked = false`).toBe(false);
      }
    });

    it("zero aml1.* role_permission seed rows", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM iam2.role_permission rp JOIN iam2.permission p ON p.permission_id = rp.permission_id WHERE p.permission_code LIKE 'aml1.%'`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("aml1.match.confirm and aml1.match.dismiss are requires_approval=true; every other aml1.* permission (including all 4 Phase 3C codes and both Phase 3D codes) is requires_approval=false", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT permission_code, requires_approval FROM iam2.permission WHERE permission_code LIKE 'aml1.%' ORDER BY permission_code`);
      const byCode = Object.fromEntries(rows.rows.map((r) => [r.permission_code, r.requires_approval]));
      expect(byCode["aml1.match.confirm"]).toBe(true);
      expect(byCode["aml1.match.dismiss"]).toBe(true);
      expect(byCode["aml1.screening.read"]).toBe(false);
      expect(byCode["aml1.screening.sensitive_read"]).toBe(false);
      expect(byCode["aml1.provider.read"]).toBe(false);
      expect(byCode["aml1.rescreen.request"]).toBe(false);
      expect(byCode["aml1.monitoring.run"]).toBe(false);
      expect(byCode["aml1.risk_signal.read"]).toBe(false);
      expect(byCode["aml1.risk_signal.acknowledge"]).toBe(false);
      expect(byCode["aml1.screening.stuck_read"]).toBe(false);
      expect(byCode["aml1.screening.stuck_recover"]).toBe(false);
    });
  });

  describe("real guard decision — unprovisioned actor (minimum required assertion)", () => {
    it("both maker-checker permissions (aml1.match.confirm/.dismiss) are never denied because of licence_locked (they are approval_required)", async () => {
      if (!schemaReady) return;
      for (const action of AML1_PERMISSIONS_MAKER_CHECKER) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/iam2/permission/check",
          headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
          payload: { actor_id: "user_no_grants_" + randomUUID(), action, resource: resourceForAction(action) },
        });
        expect(res.statusCode).toBe(200);
        const decision = res.json().data.decision;
        expect(decision, `${action} must not be licence_locked`).not.toBe("licence_locked");
        // The real, expected decision for a requires_approval=true permission — proves the
        // CFG-01 Phase 3A F-1 condition (unconditional licence_locked deny) was never introduced
        // here, and that the permission is genuinely reachable, gated only by the approval
        // requirement (which AML-01's own route layer enforces separately via execute-verify).
        expect(decision, `${action} must be approval_required`).toBe("approval_required");
      }
    });

    it("both single-step permissions (aml1.screening.read/.sensitive_read) are never denied because of licence_locked — no role grant -> a real, ordinary deny, not a structural block", async () => {
      if (!schemaReady) return;
      for (const action of AML1_PERMISSIONS_SINGLE_STEP) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/iam2/permission/check",
          headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
          payload: { actor_id: "user_no_grants_" + randomUUID(), action, resource: resourceForAction(action) },
        });
        expect(res.statusCode).toBe(200);
        const decision = res.json().data.decision;
        expect(decision, `${action} must not be licence_locked`).not.toBe("licence_locked");
        expect(decision, `${action} with no grant must be a real deny (requires_approval=false, requires_step_up=false)`).toBe("deny");
      }
    });
  });

  describe("real guard decision — properly provisioned actor (better assertion)", () => {
    const roleId = "role_aml1_it_" + randomUUID();
    const roleCode = "aml1_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_aml1_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting aml1.screening.read reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.screening.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [roleId, roleCode, "AML-01 IT test role"]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "aml1.screening.read", resource: "screening" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");

      const result = await checkPermission(aml1ClientConfig, { actorId: userId, action: "aml1.screening.read", resource: "screening" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });

    it("a real role granting aml1.screening.sensitive_read reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.screening.sensitive_read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId2 = "role_aml1_sr_it_" + randomUUID();
      const userId2 = "user_aml1_sr_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId2,
        "aml1_sr_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 sensitive-read IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId2, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId2, roleId2]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId2, action: "aml1.screening.sensitive_read", resource: "screening_match" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId2]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId2]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId2]);
    });

    it("Phase 3B: a real role granting aml1.provider.read reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.provider.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId3 = "role_aml1_pr_it_" + randomUUID();
      const userId3 = "user_aml1_pr_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId3,
        "aml1_pr_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 provider-read IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId3, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId3, roleId3]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId3, action: "aml1.provider.read", resource: "provider" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId3]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId3]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId3]);
    });

    it("Phase 3C: a real role granting aml1.rescreen.request reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.rescreen.request'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId4 = "role_aml1_rescreen_it_" + randomUUID();
      const userId4 = "user_aml1_rescreen_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId4,
        "aml1_rescreen_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 rescreen IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId4, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId4, roleId4]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId4, action: "aml1.rescreen.request", resource: "screening" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId4]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId4]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId4]);
    });

    it("Phase 3C: a real role granting aml1.monitoring.run reaches decision:allow under the real guard, and AML-01's own client confirms it (permission_granted, the structural gate routes/monitoring.ts asserts since there is no execute-verify fallback)", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.monitoring.run'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId5 = "role_aml1_monitoring_it_" + randomUUID();
      const userId5 = "user_aml1_monitoring_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId5,
        "aml1_monitoring_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 monitoring-run IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId5, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId5, roleId5]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId5, action: "aml1.monitoring.run", resource: "monitoring_run" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId5]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId5]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId5]);
    });

    it("Phase 3C: a real role granting aml1.risk_signal.read reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.risk_signal.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId6 = "role_aml1_rsread_it_" + randomUUID();
      const userId6 = "user_aml1_rsread_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId6,
        "aml1_rsread_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 risk-signal-read IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId6, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId6, roleId6]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId6, action: "aml1.risk_signal.read", resource: "risk_signal" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId6]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId6]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId6]);
    });

    it("Phase 3C: a real role granting aml1.risk_signal.acknowledge reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.risk_signal.acknowledge'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId7 = "role_aml1_rsack_it_" + randomUUID();
      const userId7 = "user_aml1_rsack_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId7,
        "aml1_rsack_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 risk-signal-acknowledge IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId7, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId7, roleId7]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId7, action: "aml1.risk_signal.acknowledge", resource: "risk_signal" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId7]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId7]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId7]);
    });

    it("Phase 3D: a real role granting aml1.screening.stuck_read reaches decision:allow under the real guard, and AML-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.screening.stuck_read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId8 = "role_aml1_stuckread_it_" + randomUUID();
      const userId8 = "user_aml1_stuckread_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId8,
        "aml1_stuckread_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 stuck-screening-read IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId8, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId8, roleId8]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId8, action: "aml1.screening.stuck_read", resource: "screening" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId8]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId8]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId8]);
    });

    it("Phase 3D: a real role granting aml1.screening.stuck_recover reaches decision:allow under the real guard, and AML-01's own client confirms it (permission_granted, the structural gate routes/stuck-screening.ts asserts since there is no execute-verify fallback)", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.screening.stuck_recover'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId9 = "role_aml1_stuckrecover_it_" + randomUUID();
      const userId9 = "user_aml1_stuckrecover_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId9,
        "aml1_stuckrecover_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 stuck-screening-recover IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId9, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId9, roleId9]);

      const result = await checkPermission(aml1ClientConfig, { actorId: userId9, action: "aml1.screening.stuck_recover", resource: "screening" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId9]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId9]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId9]);
    });

    it("AML-01's OWN checkPermission() client reaches allowed:true for aml1.match.confirm/.dismiss against the REAL server even for UNPROVISIONED actors (approval_required, not a denial) — both maker-checker permissions registered correctly from day one", async () => {
      if (!schemaReady) return;
      for (const action of AML1_PERMISSIONS_MAKER_CHECKER) {
        const result = await checkPermission(aml1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action, resource: "screening_match" });
        expect(result.allowed, `${action} must be a baseline pass`).toBe(true);
        expect(result.reason, `${action} must be IAM2_APPROVAL_REQUIRED`).toBe("IAM2_APPROVAL_REQUIRED");
      }
    });

    it("a real role granting aml1.match.confirm still reaches decision:approval_required under the real guard, even for a properly provisioned actor — no single-step sibling exists, so a role grant can never flip the baseline decision to `allow`; the real gate is execute-verify, not this baseline (same precedence documented in lib/iam2-client.ts's own header comment)", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'aml1.match.confirm'`);
      const permissionId = permRow.rows[0].permission_id as string;

      const roleId3 = "role_aml1_confirm_it_" + randomUUID();
      const userId3 = "user_aml1_confirm_it_" + randomUUID();
      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId3,
        "aml1_confirm_it_test_role_" + randomUUID().slice(0, 8),
        "AML-01 confirm IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId3, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId3, roleId3]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId3, action: "aml1.match.confirm", resource: "screening_match" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("approval_required");

      const result = await checkPermission(aml1ClientConfig, { actorId: userId3, action: "aml1.match.confirm", resource: "screening_match" });
      expect(result).toEqual({ allowed: true, reason: "IAM2_APPROVAL_REQUIRED" });

      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId3]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId3]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId3]);
    });
  });
});
