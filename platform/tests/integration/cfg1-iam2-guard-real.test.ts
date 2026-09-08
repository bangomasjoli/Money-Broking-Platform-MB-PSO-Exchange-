/**
 * CFG-01 Phase 3A — real IAM-02 guard regression coverage (Low-2 fix, independent Opus review
 * re-pass). Every OTHER CFG-01 integration test stubs `config.iam2FetchImpl` — a deliberate,
 * documented choice (mirrors `tests/integration/sec1-db.test.ts`'s own precedent for the
 * identical dependency shape), but it meant NOTHING in this codebase's test suite ever actually
 * exercised what IAM-02's REAL `services/iam2/src/lib/guard.ts` returns for a real, migration-
 * 017-seeded `cfg1.*` permission row. That blind spot is exactly what hid the original F-1
 * finding (`licence_locked = true` on six CFG-01 permissions, unconditionally denying them
 * against the real guard) from both the implementing pass and the first Opus review pass — every
 * positive-path test used a stub that simply returned `{decision: "allow"}` regardless of what
 * the real guard would say.
 *
 * This file builds and LISTENS a real IAM-02 app (`services/iam2/src/server.ts`'s `buildApp`,
 * `app.listen({port: 0})` on an ephemeral port) backed by the SAME disposable Postgres every
 * other integration test in this suite uses, and calls CFG-01's own `lib/iam2-client.ts`
 * `checkPermission` against it over REAL HTTP — the same client code CFG-01's mutation routes
 * actually use, pointed at a REAL server instead of a stub. No `iam2FetchImpl` stub anywhere in
 * this file.
 *
 * Self-skips (like every other integration test here) unless `TEST_DATABASE_URL` points at a
 * Postgres with `iam2` (006-007, 011, 013, 017) already migrated and `iam2_runtime_grants.sql`
 * applied.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp as buildIam2App } from "../../services/iam2/src/server.js";
import { checkPermission, type Iam2ClientConfig } from "../../services/cfg1/src/lib/iam2-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_app_test";

const iam2Config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-iam2-internal-token-real-guard-it",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: "test-iam2-internal-token-real-guard-it",
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-token-unused",
  bootstrapTransitionEnabled: false,
};

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;
let cfg1ClientConfig: Iam2ClientConfig;

const CFG1_PERMISSIONS_REQUIRES_APPROVAL_OR_STEP_UP = [
  "cfg1.feature.enable",
  "cfg1.feature.disable",
  "cfg1.licence_profile.activate",
  "cfg1.licence_profile.suspend",
  "cfg1.licence_profile.revoke",
];

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2') AS iam2`,
    );
    return Number(r.rows[0]?.iam2) > 0;
  } catch {
    return false;
  }
}

describe("CFG-01 Phase 3A — real IAM-02 guard regression (no stub)", () => {
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
    // Real HTTP server on an ephemeral port — CFG-01's iam2-client.ts uses the global `fetch`,
    // not app.inject(), so it needs something real to connect to over the network.
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    cfg1ClientConfig = { baseUrl: `http://127.0.0.1:${port}`, internalServiceToken: iam2Config.iam2InternalServiceToken };
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  describe("catalogue — direct inspection", () => {
    it("all 8 CFG-01 Phase 3A permissions have licence_locked = false", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT permission_code, licence_locked FROM iam2.permission WHERE permission_code LIKE 'cfg1.%' AND permission_code NOT LIKE 'cfg1.kill_switch.%' ORDER BY permission_code`,
      );
      expect(rows.rows).toHaveLength(8);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must have licence_locked = false`).toBe(false);
      }
    });

    it("all 3 Phase 3B cfg1.kill_switch.* permissions have licence_locked = false (approved decision #15 / F-1 regression proof)", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT permission_code, licence_locked FROM iam2.permission WHERE permission_code LIKE 'cfg1.kill_switch.%' ORDER BY permission_code`,
      );
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must have licence_locked = false`).toBe(false);
      }
    });
  });

  describe("real guard decision — unprovisioned actor (minimum required assertion)", () => {
    it("cfg1.feature.enable is never denied because of licence_locked (it is approval_required)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.feature.enable", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      // The real, expected decision for a requires_approval=true permission — proves the
      // ORIGINAL F-1 condition (unconditional licence_locked deny) is gone, and that the
      // permission is genuinely reachable, gated only by the approval requirement (which
      // CFG-01's own route layer enforces separately via execute-verify).
      expect(decision).toBe("approval_required");
    });

    it("cfg1.licence_profile.change_request is never denied because of licence_locked (it is a real deny — no role grant — not a structural block)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.licence_profile.change_request", resource: "licence_profile" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      // requires_approval=false and requires_step_up=false for this action — with no role
      // grant, the real guard correctly falls through to a genuine, ordinary deny (no
      // assignment), not a structural block. This is the CORRECT behaviour a real actor with
      // a real grant would NOT hit — see the "provisioned actor" block below for that proof.
      expect(decision).toBe("deny");
    });

    it("cfg1.licence_profile.activate is never denied because of licence_locked (it is step_up_required — requires_step_up fires before requires_approval)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.licence_profile.activate", resource: "licence_profile" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      expect(decision).toBe("step_up_required");
    });

    it("none of the 5 remaining requires_approval/requires_step_up permissions are ever denied because of licence_locked", async () => {
      if (!schemaReady) return;
      for (const action of CFG1_PERMISSIONS_REQUIRES_APPROVAL_OR_STEP_UP) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/iam2/permission/check",
          headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
          payload: { actor_id: "user_no_grants_" + randomUUID(), action, resource: action.startsWith("cfg1.feature") ? "feature" : "licence_profile" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.decision, `${action} must not be licence_locked`).not.toBe("licence_locked");
      }
    });
  });

  describe("real guard decision — properly provisioned actor (better assertion)", () => {
    const roleId = "role_cfg1_it_" + randomUUID();
    const roleCode = "cfg1_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_cfg1_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting cfg1.feature.change_request reaches decision:allow under the real guard for a properly provisioned actor", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'cfg1.feature.change_request'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(
        `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`,
        [roleId, roleCode, "CFG-01 IT test role"],
      );
      await verifyPool.query(
        `INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`,
        [roleId, permissionId],
      );
      await verifyPool.query(
        `INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`,
        [userId, roleId],
      );

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "cfg1.feature.change_request", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
    });

    it("CFG-01's OWN checkPermission() client reaches allowed:true against the REAL IAM-02 server (no stub) for the same provisioned actor", async () => {
      if (!schemaReady) return;
      // The role/grant from the previous test is still in place (same describe block, same
      // afterAll teardown at the end) — this proves CFG-01's actual production client code
      // (services/cfg1/src/lib/iam2-client.ts), not just IAM-02's raw HTTP response shape,
      // correctly interprets a real "allow" decision from a real, listening IAM-02 server.
      const result = await checkPermission(cfg1ClientConfig, { actorId: userId, action: "cfg1.feature.change_request", resource: "feature" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });

    it("CFG-01's OWN checkPermission() client reaches allowed:true for cfg1.feature.enable against the REAL server even for an UNPROVISIONED actor (approval_required, not a denial) — the direct F-1 regression proof", async () => {
      if (!schemaReady) return;
      const result = await checkPermission(cfg1ClientConfig, {
        actorId: "user_no_grants_" + randomUUID(),
        action: "cfg1.feature.enable",
        resource: "feature",
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });
  });

  // ===============================================================================================
  // PHASE 3B — cfg1.kill_switch.* real guard coverage (approved decision #16 / carried-forward
  // condition from the Phase 3A re-review: every new CFG-01 permission code must get the same
  // real-guard proof, not just a stub-based one).
  // ===============================================================================================
  describe("Phase 3B real guard decision — unprovisioned actor", () => {
    it("cfg1.kill_switch.activate is never denied because of licence_locked — no role grant -> a real, ordinary deny (requires_approval=false, requires_step_up=false)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.kill_switch.activate", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      // This is exactly why routes/kill-switches.ts's activation handler additionally asserts
      // `baseline.reason === "permission_granted"` — a bare `allowed` is never possible from the
      // real guard without a real grant, but the route's own defence-in-depth does not rely on
      // that fact alone.
      expect(decision).toBe("deny");
    });

    it("cfg1.kill_switch.deactivate_request is never denied because of licence_locked — no role grant -> a real, ordinary deny (requires_approval=false, requires_step_up=false)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.kill_switch.deactivate_request", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      expect(decision).toBe("deny");
    });

    it("cfg1.kill_switch.deactivate is never denied because of licence_locked (it is approval_required)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: "user_no_grants_" + randomUUID(), action: "cfg1.kill_switch.deactivate", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      const decision = res.json().data.decision;
      expect(decision).not.toBe("licence_locked");
      expect(decision).toBe("approval_required");
    });
  });

  describe("Phase 3B real guard decision — properly provisioned actor", () => {
    const roleId = "role_cfg1_ks_it_" + randomUUID();
    const roleCode = "cfg1_ks_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_cfg1_ks_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting cfg1.kill_switch.activate reaches decision:allow under the real guard for a properly provisioned actor", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'cfg1.kill_switch.activate'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(
        `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`,
        [roleId, roleCode, "CFG-01 kill-switch IT test role"],
      );
      await verifyPool.query(
        `INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`,
        [roleId, permissionId],
      );
      await verifyPool.query(
        `INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`,
        [userId, roleId],
      );

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "cfg1.kill_switch.activate", resource: "feature" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
    });

    it("CFG-01's OWN checkPermission() client reaches allowed:true + reason:'permission_granted' against the REAL IAM-02 server (no stub) for the same provisioned actor — this is the exact baseline routes/kill-switches.ts's activation handler requires, since activation has no execute-verify fallback", async () => {
      if (!schemaReady) return;
      const result = await checkPermission(cfg1ClientConfig, { actorId: userId, action: "cfg1.kill_switch.activate", resource: "feature" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });
  });
});
