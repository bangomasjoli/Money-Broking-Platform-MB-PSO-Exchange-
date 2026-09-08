/**
 * CLT-01 Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 + Phase 8 — real IAM-02 guard regression
 * coverage. Mirrors `tests/integration/cfg1-iam2-guard-real.test.ts` exactly: every OTHER CLT-01
 * integration test stubs `config.iam2FetchImpl` (tests/integration/clt1-db.test.ts) — a
 * deliberate, documented choice — but that means nothing in this codebase's test suite would
 * otherwise exercise what IAM-02's REAL `services/iam2/src/lib/guard.ts` returns for a real,
 * migration-022/024/026/028/030/032-seeded `clt1.*` permission row. CFG-01 Phase 3A's own F-1
 * finding (`licence_locked = true` unconditionally denying six permissions against the real
 * guard) was hidden from both the implementing pass and the first review pass by exactly this
 * blind spot — every positive-path test used a stub that simply returned `{decision: "allow"}`
 * regardless of what the real guard would say. This file closes that gap for CLT-01's own IAM-02
 * integration from day one, for Phase 2's 5 permissions, Phase 3's 8, Phase 4's 8, Phase 5's 4,
 * Phase 6's 5, and Phase 8's 3 new ones (33 total).
 *
 * Builds and LISTENS a real IAM-02 app (`services/iam2/src/server.ts`'s `buildApp`,
 * `app.listen({port: 0})` on an ephemeral port) backed by the SAME disposable Postgres every
 * other integration test in this suite uses, and calls CLT-01's own `lib/iam2-client.ts`
 * `checkPermission` against it over REAL HTTP — the same client code CLT-01's routes actually use,
 * pointed at a REAL server instead of a stub. No `iam2FetchImpl` stub anywhere in this file.
 *
 * Self-skips (like every other integration test here) unless `TEST_DATABASE_URL` points at a
 * Postgres with `iam2` (006-007, 011, 013, 017, 019, 022, 024, 026, 028, 030, 032) already
 * migrated and `iam2_runtime_grants.sql` applied.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp as buildIam2App } from "../../services/iam2/src/server.js";
import { checkPermission, type Iam2ClientConfig } from "../../services/clt1/src/lib/iam2-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_app_test_clt1";

const iam2Config: Iam2Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-iam2-internal-token-clt1-real-guard-it",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: "test-iam2-internal-token-clt1-real-guard-it",
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-token-unused",
  bootstrapTransitionEnabled: false,
};

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;
let clt1ClientConfig: Iam2ClientConfig;

const CLT1_PERMISSIONS_SINGLE_STEP = [
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
];

const CLT1_PERMISSIONS_MAKER_CHECKER = [
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
];

function resourceForAction(action: string): string {
  if (action.startsWith("clt1.application")) return "application";
  if (action.startsWith("clt1.cdd_outcome")) return "cdd_outcome";
  if (action.startsWith("clt1.authorised_user")) return "authorised_user";
  if (action.startsWith("clt1.authorised_party")) return "authorised_party";
  if (action.startsWith("clt1.related_party")) return "related_party_edge";
  if (action.startsWith("clt1.duplicate_candidate")) return "duplicate_candidate";
  if (action.startsWith("clt1.client_profile")) return "client_profile";
  return "client_mandate";
}

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

describe("CLT-01 Phase 2 — real IAM-02 guard regression (no stub)", () => {
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
    // Real HTTP server on an ephemeral port — CLT-01's iam2-client.ts uses the global `fetch`,
    // not app.inject(), so it needs something real to connect to over the network.
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    clt1ClientConfig = { baseUrl: `http://127.0.0.1:${port}`, internalServiceToken: iam2Config.iam2InternalServiceToken };
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  describe("catalogue — direct inspection", () => {
    it("all 33 CLT-01 permissions (5 Phase 2 + 8 Phase 3 + 8 Phase 4 + 4 Phase 5 + 5 Phase 6 + 3 Phase 8) have licence_locked = false", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT permission_code, licence_locked FROM iam2.permission WHERE permission_code LIKE 'clt1.%' ORDER BY permission_code`,
      );
      expect(rows.rows).toHaveLength(33);
      for (const row of rows.rows) {
        expect(row.licence_locked, `${row.permission_code} must have licence_locked = false`).toBe(false);
      }
    });

    it("zero clt1.* role_permission seed rows", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(
        `SELECT count(*) FROM iam2.role_permission rp JOIN iam2.permission p ON p.permission_id = rp.permission_id WHERE p.permission_code LIKE 'clt1.%'`,
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  describe("real guard decision — unprovisioned actor (minimum required assertion)", () => {
    it("all 19 maker-checker permissions (Phase 2 approve + Phase 3 authorised_user.add/.remove + client_mandate.create/.update + Phase 4 authorised_party.add/.update/.remove/.activate + Phase 5 related_party.add/.update/.remove + Phase 6 duplicate_candidate.create/.update/.confirm/.dismiss + Phase 8 client_profile.suspend/.reactivate/.close) are never denied because of licence_locked (they are approval_required)", async () => {
      if (!schemaReady) return;
      for (const action of CLT1_PERMISSIONS_MAKER_CHECKER) {
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
        // requirement (which CLT-01's own route layer enforces separately via execute-verify).
        expect(decision, `${action} must be approval_required`).toBe("approval_required");
      }
    });

    it("the 14 single-step permissions (Phase 2 review/reject/hold/cdd_outcome.read + Phase 3 authorised_user.read/.suspend/.reactivate/client_mandate.read + Phase 4 authorised_party.read/.restrict/.reject/.suspend + Phase 5 related_party.read + Phase 6 duplicate_candidate.read) are never denied because of licence_locked — no role grant -> a real, ordinary deny, not a structural block", async () => {
      if (!schemaReady) return;
      for (const action of CLT1_PERMISSIONS_SINGLE_STEP) {
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
    const roleId = "role_clt1_it_" + randomUUID();
    const roleCode = "clt1_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting clt1.application.review reaches decision:allow under the real guard for a properly provisioned actor", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.application.review'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(
        `INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`,
        [roleId, roleCode, "CLT-01 IT test role"],
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
        payload: { actor_id: userId, action: "clt1.application.review", resource: "application" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true against the REAL IAM-02 server (no stub) for the same provisioned actor", async () => {
      if (!schemaReady) return;
      // The role/grant from the previous test is still in place (same describe block, same
      // afterAll teardown at the end) — this proves CLT-01's actual production client code
      // (services/clt1/src/lib/iam2-client.ts), not just IAM-02's raw HTTP response shape,
      // correctly interprets a real "allow" decision from a real, listening IAM-02 server.
      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.application.review", resource: "application" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.application.approve against the REAL server even for an UNPROVISIONED actor (approval_required, not a denial) — the direct regression proof this permission was registered correctly from day one", async () => {
      if (!schemaReady) return;
      const result = await checkPermission(clt1ClientConfig, {
        actorId: "user_no_grants_" + randomUUID(),
        action: "clt1.application.approve",
        resource: "application",
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.authorised_user.add and clt1.client_mandate.create against the REAL server even for UNPROVISIONED actors (Phase 3's own maker-checker permissions registered correctly from day one)", async () => {
      if (!schemaReady) return;
      const addResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.authorised_user.add", resource: "authorised_user" });
      expect(addResult.allowed).toBe(true);
      expect(addResult.reason).toBe("IAM2_APPROVAL_REQUIRED");

      const createResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.client_mandate.create", resource: "client_mandate" });
      expect(createResult.allowed).toBe(true);
      expect(createResult.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.authorised_party.add and .activate against the REAL server even for UNPROVISIONED actors (Phase 4's own maker-checker permissions registered correctly from day one)", async () => {
      if (!schemaReady) return;
      const addResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.authorised_party.add", resource: "authorised_party" });
      expect(addResult.allowed).toBe(true);
      expect(addResult.reason).toBe("IAM2_APPROVAL_REQUIRED");

      const activateResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.authorised_party.activate", resource: "authorised_party" });
      expect(activateResult.allowed).toBe(true);
      expect(activateResult.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.related_party.add against the REAL server even for an UNPROVISIONED actor (Phase 5's own maker-checker permission registered correctly from day one)", async () => {
      if (!schemaReady) return;
      const addResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.related_party.add", resource: "related_party_edge" });
      expect(addResult.allowed).toBe(true);
      expect(addResult.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.duplicate_candidate.create and .confirm against the REAL server even for UNPROVISIONED actors (Phase 6's own maker-checker permissions registered correctly from day one)", async () => {
      if (!schemaReady) return;
      const createResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.duplicate_candidate.create", resource: "duplicate_candidate" });
      expect(createResult.allowed).toBe(true);
      expect(createResult.reason).toBe("IAM2_APPROVAL_REQUIRED");

      const confirmResult = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action: "clt1.duplicate_candidate.confirm", resource: "duplicate_candidate" });
      expect(confirmResult.allowed).toBe(true);
      expect(confirmResult.reason).toBe("IAM2_APPROVAL_REQUIRED");
    });
  });

  describe("Phase 3 real guard decision — properly provisioned actor", () => {
    const roleId = "role_clt1_p3_it_" + randomUUID();
    const roleCode = "clt1_p3_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_p3_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting clt1.authorised_user.read reaches decision:allow under the real guard, and CLT-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.authorised_user.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId,
        roleCode,
        "CLT-01 Phase 3 IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "clt1.authorised_user.read", resource: "authorised_user" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");

      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.authorised_user.read", resource: "authorised_user" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });
  });

  describe("Phase 4 real guard decision — properly provisioned actor", () => {
    const roleId = "role_clt1_p4_it_" + randomUUID();
    const roleCode = "clt1_p4_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_p4_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting clt1.authorised_party.read reaches decision:allow under the real guard, and CLT-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.authorised_party.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId,
        roleCode,
        "CLT-01 Phase 4 IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "clt1.authorised_party.read", resource: "authorised_party" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");

      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.authorised_party.read", resource: "authorised_party" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });
  });

  describe("Phase 5 real guard decision — properly provisioned actor", () => {
    const roleId = "role_clt1_p5_it_" + randomUUID();
    const roleCode = "clt1_p5_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_p5_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting clt1.related_party.read reaches decision:allow under the real guard, and CLT-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.related_party.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId,
        roleCode,
        "CLT-01 Phase 5 IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "clt1.related_party.read", resource: "related_party_edge" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");

      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.related_party.read", resource: "related_party_edge" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });
  });

  describe("Phase 6 real guard decision — properly provisioned actor", () => {
    const roleId = "role_clt1_p6_it_" + randomUUID();
    const roleCode = "clt1_p6_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_p6_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("a real role granting clt1.duplicate_candidate.read reaches decision:allow under the real guard, and CLT-01's own client confirms it", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.duplicate_candidate.read'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId,
        roleCode,
        "CLT-01 Phase 6 IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "clt1.duplicate_candidate.read", resource: "duplicate_candidate" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");

      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.duplicate_candidate.read", resource: "duplicate_candidate" });
      expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    });
  });

  describe("Phase 8 real guard decision — provisioned + unprovisioned actors", () => {
    const roleId = "role_clt1_p8_it_" + randomUUID();
    const roleCode = "clt1_p8_it_test_role_" + randomUUID().slice(0, 8);
    const userId = "user_clt1_p8_it_" + randomUUID();

    afterAll(async () => {
      if (!schemaReady) return;
      await verifyPool.query(`DELETE FROM iam2.user_role WHERE user_id = $1`, [userId]);
      await verifyPool.query(`DELETE FROM iam2.role_permission WHERE role_id = $1`, [roleId]);
      await verifyPool.query(`DELETE FROM iam2.role WHERE role_id = $1`, [roleId]);
    });

    it("CLT-01's OWN checkPermission() client reaches allowed:true for clt1.client_profile.suspend/.reactivate/.close against the REAL server even for UNPROVISIONED actors (approval_required, not a denial) — all 3 Phase 8 maker-checker permissions registered correctly from day one", async () => {
      if (!schemaReady) return;
      for (const action of ["clt1.client_profile.suspend", "clt1.client_profile.reactivate", "clt1.client_profile.close"]) {
        const result = await checkPermission(clt1ClientConfig, { actorId: "user_no_grants_" + randomUUID(), action, resource: "client_profile" });
        expect(result.allowed, `${action} must be a baseline pass`).toBe(true);
        expect(result.reason, `${action} must be IAM2_APPROVAL_REQUIRED`).toBe("IAM2_APPROVAL_REQUIRED");
      }
    });

    it("a real role granting clt1.client_profile.suspend still reaches decision:approval_required under the real guard, even for a properly provisioned actor — unlike every prior phase's `.read`/`.review` single-step permission, all 3 Phase 8 permissions are requires_approval=true with no single-step sibling, so a role grant can never flip the baseline decision to `allow`; the real gate is execute-verify, not this baseline (same precedence documented in lib/iam2-client.ts's own header comment)", async () => {
      if (!schemaReady) return;
      const permRow = await verifyPool.query(`SELECT permission_id FROM iam2.permission WHERE permission_code = 'clt1.client_profile.suspend'`);
      const permissionId = permRow.rows[0].permission_id as string;

      await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, status) VALUES ($1,$2,$3,'staff','active')`, [
        roleId,
        roleCode,
        "CLT-01 Phase 8 IT test role",
      ]);
      await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status) VALUES ($1,$2,'active')`, [roleId, permissionId]);
      await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status) VALUES ($1,$2,'active')`, [userId, roleId]);

      const res = await app.inject({
        method: "POST",
        url: "/internal/iam2/permission/check",
        headers: { "x-internal-service-token": iam2Config.iam2InternalServiceToken },
        payload: { actor_id: userId, action: "clt1.client_profile.suspend", resource: "client_profile" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("approval_required");

      const result = await checkPermission(clt1ClientConfig, { actorId: userId, action: "clt1.client_profile.suspend", resource: "client_profile" });
      expect(result).toEqual({ allowed: true, reason: "IAM2_APPROVAL_REQUIRED" });
    });

    it("does not register clt1.client_profile.read — no baseline decision exists for it", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT count(*) FROM iam2.permission WHERE permission_code = 'clt1.client_profile.read'`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });
});
