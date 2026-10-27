/**
 * IAM02-AUTHZ-REM-001 — REAL IAM-01 ↔ IAM-02 identity end-to-end (OD-1 Option A, AZ-16, AZ-19;
 * T-46 real leg, T-47 real leg, T-51).
 *
 * Both applications are the real code (`buildApp` of IAM-01 and IAM-02) on one disposable
 * Postgres; IAM-02's `iam01FetchImpl` DI seam is bridged to IAM-01's own `app.inject`, so every
 * byte IAM-02 trusts comes from IAM-01's real `POST /internal/auth/verify-assertion`. A real
 * login → TOTP enrolment → step-up flow mints each assertion. The shared pool is the SUPERUSER
 * (the foundation pool is process-global), so this file proves identity logic, NOT grants or
 * RLS — those are proved as the runtime role in iam2-authz-rem-db.test.ts and
 * iam-verify-assertion-runtime-role.test.ts.
 *
 * ISOLATION (D7-02): this file creates its OWN disposable database (`aix_e2e_<random>`), migrates
 * the repository's own chain into it with `node-pg-migrate`, applies the unchanged grant files,
 * and drops it afterwards. It therefore never writes identities into, nor counts audit events
 * across, the database other test files share (the IAM-01 `iam-db` bootstrap test counts ALL
 * identities in its database; this file used to add rows to it). Audit assertions are
 * additionally scoped to the test's own identity. Nothing touches TEST_DATABASE_URL's own database.
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (IMPL-02 convention): with TEST_DATABASE_URL unset the
 * suite is skipped explicitly with a named reason; with it set, an unavailable prerequisite (no
 * migration runner, a role that cannot CREATE ROLE / CREATE DATABASE, a failed migration or
 * grant) fails EVERY test with the underlying evidence — there is no early-return that passes.
 *
 * It reproduces the Opus-reported NF-1 (a `service`-class identity obtains a valid
 * `iam2_approval:<id>` assertion and could approve) and NF-2 (assertion stays valid after the
 * identity is suspended) and shows both are now blocked in IAM-02, while IAM-01's own accepted
 * behaviour (the assertion remains `valid:true`) is unchanged.
 *
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, fingerprint, getPool, initPool } from "@aix/foundation";
import type { IamConfig } from "../../services/iam/src/config.js";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp as buildIamApp } from "../../services/iam/src/server.js";
import { buildApp as buildIam2App } from "../../services/iam2/src/server.js";
import { hashPassword } from "../../services/iam/src/lib/password.js";
import { sha256Hex } from "../../services/iam/src/lib/session.js";
import { totpAt } from "../../services/iam/src/lib/totp.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const PLATFORM_DIR = resolve(__dirname, "..", "..");
const BIN = resolve(PLATFORM_DIR, "node_modules", ".bin", "node-pg-migrate");
const DB_NAME = "aix_e2e_" + randomUUID().replace(/-/g, "").slice(0, 12);
const IAM_INTERNAL = "test-iam-internal-token-authz-rem-e2e";
const IAM2_INTERNAL = "test-iam2-internal-token-authz-rem-e2e";

const iamConfig: IamConfig = {
  environment: "dev",
  databaseUrl: "postgres://unused", // replaced with the disposable database's URL in beforeAll
  internalServiceToken: "test-fnd-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iamInternalServiceToken: IAM_INTERNAL,
  iamIntrospectionServiceToken: "test-iam-introspection-token-authz-rem-e2e",
  bootstrapEnabled: false,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 1_209_600,
  mfaSecretEncryptionKey: "test-mfa-secret-enc-key-it-not-for-prod",
  rateLimit: {
    loginMaxAttempts: 50,
    loginLockoutMinutes: 15,
    mfaMaxAttempts: 50,
    mfaLockoutMinutes: 15,
    passwordResetMaxAttempts: 5,
    passwordResetLockoutMinutes: 30,
    refreshMaxAttempts: 20,
    refreshLockoutMinutes: 15,
  },
};
const iam2Config: Iam2Config = {
  environment: "dev",
  databaseUrl: "postgres://unused", // replaced with the disposable database's URL in beforeAll
  internalServiceToken: "test-iam2-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: IAM2_INTERNAL,
  iam01BaseUrl: "http://iam01.bridge.invalid",
  iam01InternalServiceToken: IAM_INTERNAL,
  bootstrapTransitionEnabled: false,
};
const iam2Headers = { "x-internal-service-token": IAM2_INTERNAL };
const iamHeaders = { "x-internal-service-token": IAM_INTERNAL };

function urlFor(db: string): string {
  const u = new URL(TEST_DB as string);
  u.pathname = "/" + db;
  return u.toString();
}

let iamApp: FastifyInstance;
let iam2App: FastifyInstance;
let admin: Pool; // maintenance DB, superuser: CREATE/DROP DATABASE and role bootstrap only
let verifyPool: Pool; // disposable DB, superuser: fixtures / verification
let databaseCreated = false;
/** Set when a prerequisite is unavailable; every test then FAILS with this evidence. */
let prerequisiteError: Error | undefined;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

/** CREATE ROLE is cluster-global, so concurrently running test files can race on it. Tolerate the
 * already-exists outcomes (42710 duplicate_object, 23505 unique violation on pg_authid, XX000
 * "tuple concurrently updated") — the role existing is all this needs. */
async function ensureRole(pool: Pool, name: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN CREATE ROLE ${name} NOLOGIN; END IF; END $$;`);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "42710" && code !== "23505" && code !== "XX000") throw err;
      const exists = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [name]);
      if ((exists.rowCount ?? 0) > 0) return;
    }
  }
  throw new Error(`could not ensure role ${name}`);
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the real IAM-01 <-> IAM-02 identity end-to-end tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL (a role that can CREATE ROLE and CREATE DATABASE) to run them.";

// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM02-AUTHZ-REM-001 — real IAM-01 identity evidence in the approval flow (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

const idem = (l: string) => `e2e_${l}_${randomUUID()}`;

interface Identity { userId: string; identifier: string; password: string; accessToken: string; totpSecret: string }

async function createIdentity(type: string, cls: string, status = "active"): Promise<Identity> {
  const userId = "user_e2e_" + randomUUID();
  const identifier = `e2e-${randomUUID()}@example.invalid`;
  const password = "E2e-Passw0rd-1!";
  await getPool().query(
    `INSERT INTO iam.user_identity (user_id, user_type, identifier_normalised, identifier_hash, status, mfa_required, user_class, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,$5,false,$6,now(),now())`,
    [userId, type, identifier, sha256Hex(identifier), status, cls],
  );
  const h = await hashPassword(password);
  await getPool().query(
    `INSERT INTO iam.credential_password (user_id, password_hash, hash_algorithm, hash_params, password_changed_at_utc, must_change_password, failed_attempt_count, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,now(),false,0,now(),now())`,
    [userId, h.hash, h.algorithm, JSON.stringify(h.params)],
  );
  const login = await iamApp.inject({ method: "POST", url: "/auth/login", headers: { "idempotency-key": idem("login") }, payload: { identifier, password } });
  expect(login.statusCode, JSON.stringify(login.json())).toBe(200);
  const accessToken = login.json().data.access_token as string;
  const enrol = await iamApp.inject({ method: "POST", url: "/auth/mfa/enrol", headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idem("enrol") }, payload: { factor_type: "totp" } });
  expect(enrol.statusCode, JSON.stringify(enrol.json())).toBe(201);
  const totpSecret = enrol.json().data.secret as string;
  const verify = await iamApp.inject({
    method: "POST",
    url: "/auth/mfa/verify",
    headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idem("mfaverify") },
    payload: { factor_id: enrol.json().data.factor_id, code: totpAt(totpSecret, Date.now()) },
  });
  expect(verify.statusCode, JSON.stringify(verify.json())).toBe(200);
  return { userId, identifier, password, accessToken, totpSecret };
}

async function stepUpAssertion(who: Identity, purpose: string): Promise<string> {
  const start = await iamApp.inject({ method: "POST", url: "/auth/step-up", headers: { authorization: `Bearer ${who.accessToken}`, "idempotency-key": idem("su") }, payload: { purpose } });
  expect(start.statusCode, JSON.stringify(start.json())).toBe(200);
  const fin = await iamApp.inject({
    method: "POST",
    url: "/auth/step-up/verify",
    headers: { authorization: `Bearer ${who.accessToken}`, "idempotency-key": idem("suv") },
    payload: { challenge_id: start.json().data.challenge_id, code: totpAt(who.totpSecret, Date.now()) },
  });
  expect(fin.statusCode, JSON.stringify(fin.json())).toBe(200);
  return fin.json().data.recent_auth_assertion as string;
}

async function seedPermission(code: string, resource: string): Promise<string> {
  const id = "perm_e2e_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.permission (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
     VALUES ($1,$2,$3,'e2e','normal',false,false,false,false,'active','TEST')`,
    [id, code, resource],
  );
  return id;
}
async function grant(userId: string, codes: Array<{ code: string; resource: string }>): Promise<void> {
  const roleId = "role_e2e_" + randomUUID();
  await verifyPool.query(`INSERT INTO iam2.role (role_id, role_code, role_name, role_type, sensitivity, status) VALUES ($1,$2,$2,'staff','normal','active')`, [roleId, "e2e_" + randomUUID().slice(0, 12)]);
  for (const c of codes) {
    const existing = await verifyPool.query<{ permission_id: string }>(`SELECT permission_id FROM iam2.permission WHERE permission_code = $1`, [c.code]);
    const pid = existing.rows[0]?.permission_id ?? (await seedPermission(c.code, c.resource));
    await verifyPool.query(`INSERT INTO iam2.role_permission (role_id, permission_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [roleId, pid]);
  }
  await verifyPool.query(`INSERT INTO iam2.user_role (user_id, role_id, status, effective_from_utc) VALUES ($1,$2,'active', now() - interval '1 minute')`, [userId, roleId]);
}

/** A pending IAM-02 approval whose approver will be the given real IAM-01 identity. */
async function pendingApprovalFor(approver: Identity): Promise<string> {
  const action = "iam2.e2e.act_" + randomUUID().slice(0, 8);
  const resource = "e2e_resource";
  const maker = "user_e2e_maker_" + randomUUID();
  await grant(maker, [{ code: "iam2.approval.create", resource: "approval" }, { code: action, resource }]);
  await grant(approver.userId, [{ code: "iam2.approval.approve", resource: "approval" }]);
  await verifyPool.query(
    `INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
     VALUES ($1,$2,$3,'count','[]'::jsonb,1,true,1440,'active')`,
    ["policy_e2e_" + randomUUID(), action, resource],
  );
  const req = await iam2App.inject({
    method: "POST",
    url: "/iam2/approvals/request",
    headers: iam2Headers,
    payload: { maker_user_id: maker, action, resource, entity_id: "ent_e2e", payload: { n: randomUUID() } },
  });
  expect(req.statusCode, JSON.stringify(req.json())).toBe(200);
  return req.json().data.approval_id as string;
}

const approveWith = (approvalId: string, who: Identity, assertion: string) =>
  iam2App.inject({ method: "POST", url: `/iam2/approvals/${approvalId}/approve`, headers: iam2Headers, payload: { approver_user_id: who.userId, recent_auth_assertion: assertion } });

describe.skipIf(!TEST_DB)("IAM02-AUTHZ-REM-001 — real IAM-01 identity evidence in the approval flow (OD-1 Option A)", () => {
  beforeAll(async () => {
    if (!existsSync(BIN)) {
      prerequisiteError = new Error(`PREREQUISITE UNAVAILABLE: the node-pg-migrate binary was not found at ${BIN}. Run \`npm install\` in platform/; this test refuses to pass without running.`);
      return;
    }
    admin = new Pool({ connectionString: urlFor("postgres") });
    try {
      for (const r of ["aml1", "cfg1", "clt1", "fnd", "iam2", "iam", "kyc1", "sec1", "wlt1"]) await ensureRole(admin, `role_${r}_runtime`);
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      databaseCreated = true;
      execFileSync(BIN, ["-m", "infra/migrations", "--no-check-order", "up"], {
        cwd: PLATFORM_DIR,
        env: {
          ...process.env,
          DATABASE_URL: urlFor(DB_NAME),
          SEC1_INGEST_TOKEN_FND01: "test-fnd01-ingest-token-it",
          SEC1_INGEST_TOKEN_IAM01: "test-iam01-ingest-token-it",
          SEC1_INGEST_TOKEN_IAM02: "test-iam02-ingest-token-it",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      verifyPool = new Pool({ connectionString: urlFor(DB_NAME) });
      for (const f of ["fnd_runtime_grants.sql", "iam_runtime_grants.sql", "iam2_runtime_grants.sql"]) {
        await verifyPool.query(readFileSync(resolve(PLATFORM_DIR, "infra", "grants", f), "utf8"));
      }
      initPool(urlFor(DB_NAME));
    } catch (err) {
      const e = err as { code?: string; message?: string; stderr?: Buffer | string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the disposable end-to-end environment could not be prepared ` +
          `(CREATE ROLE/DATABASE ${DB_NAME}, migrate, grants): [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)} ${e.stderr ? String(e.stderr).slice(0, 500) : ""}. ` +
          "Use a superuser (or CREATEROLE + CREATEDB) URL; this test refuses to pass without running.",
      );
      return;
    }
    iamConfig.databaseUrl = urlFor(DB_NAME);
    iam2Config.databaseUrl = urlFor(DB_NAME);
    iamApp = await buildIamApp(iamConfig);
    // Bridge IAM-02's IAM-01 client to the REAL IAM-01 application (no network, no stubbed body).
    iam2Config.iam01FetchImpl = (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      const res = await iamApp.inject({ method: "POST", url: new URL(String(url)).pathname, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, payload: init?.body ?? "{}" });
      return { ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => res.json() } as Response;
    }) as unknown as typeof fetch;
    iam2App = await buildIam2App(iam2Config);
  }, 240_000);
  afterAll(async () => {
    if (iam2App) await iam2App.close();
    if (iamApp) await iamApp.close();
    await closePool();
    if (verifyPool) await verifyPool.end();
    if (admin) {
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("control: a real staff/staff identity with an approval-specific assertion approves; IAM-01 reports the live identity fields", async () => {
    assertPrerequisites();
    const staff = await createIdentity("staff", "staff");
    const approvalId = await pendingApprovalFor(staff);
    const assertion = await stepUpAssertion(staff, `iam2_approval:${approvalId}`);
    const res = await approveWith(approvalId, staff, assertion);
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    expect(res.json().data.status).toBe("approved");
  });

  it("T-46 (NF-1 inverted, REAL IAM-01): a service-class identity that legitimately obtains a valid approval-purpose assertion is BLOCKED (Critical), no decision, no token", async () => {
    assertPrerequisites();
    const svc = await createIdentity("service", "service");
    const approvalId = await pendingApprovalFor(svc);
    const assertion = await stepUpAssertion(svc, `iam2_approval:${approvalId}`);
    // IAM-01's accepted contract: the assertion itself is valid for the service identity.
    const raw = await iamApp.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers: iamHeaders, payload: { recent_auth_assertion: assertion, required_purpose: `iam2_approval:${approvalId}` } });
    expect(raw.statusCode).toBe(200);
    expect(raw.json().data).toMatchObject({ valid: true, user_id: svc.userId, user_type: "service", user_class: "service", user_status: "active" });
    const res = await approveWith(approvalId, svc, assertion);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED");
    const decisions = await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId]);
    expect(decisions.rowCount).toBe(0);
    const tokens = await verifyPool.query(`SELECT 1 FROM iam2.permission_decision_token WHERE approval_id = $1`, [approvalId]);
    expect(tokens.rowCount).toBe(0);
    const audit = await verifyPool.query(`SELECT 1 FROM foundation.outbox_event WHERE event_type = 'iam2.service_account_approver_blocked' AND payload_ref LIKE $1`, [`%${approvalId}%`]);
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it("T-46: mixed service/staff pairs and client / client_approver identities are refused; staff/admin and admin/staff are eligible (owner clarification 2)", async () => {
    assertPrerequisites();
    const cases: Array<[string, string, string]> = [
      ["staff", "service", "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED"],
      ["service", "staff", "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED"],
      ["client", "client", "IAM2_APPROVER_NOT_ELIGIBLE"],
      ["client", "client_approver", "IAM2_APPROVER_NOT_ELIGIBLE"],
      ["admin", "client", "IAM2_APPROVER_NOT_ELIGIBLE"],
      ["staff", "admin", "OK"],
      ["admin", "staff", "OK"],
      ["admin", "admin", "OK"],
    ];
    for (const [type, cls, expected] of cases) {
      const who = await createIdentity(type, cls);
      const approvalId = await pendingApprovalFor(who);
      const res = await approveWith(approvalId, who, await stepUpAssertion(who, `iam2_approval:${approvalId}`));
      if (expected === "OK") expect(res.statusCode, `${type}/${cls}: ${JSON.stringify(res.json())}`).toBe(200);
      else {
        expect(res.statusCode, `${type}/${cls}`).toBe(403);
        expect(res.json().error.code, `${type}/${cls}`).toBe(expected);
      }
    }
  });

  it("T-47 / T-51 (NF-2 inverted, REAL IAM-01): an assertion issued while ACTIVE is still `valid:true` at IAM-01 after the identity is suspended (accepted contract unchanged) but reports the LIVE status, and IAM-02 refuses it", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const approvalId = await pendingApprovalFor(who);
    const purpose = `iam2_approval:${approvalId}`;
    const assertion = await stepUpAssertion(who, purpose);
    const verify = () => iamApp.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers: iamHeaders, payload: { recent_auth_assertion: assertion, required_purpose: purpose } });

    const before = await verify();
    expect(before.json().data.user_status).toBe("active");
    await getPool().query(`UPDATE iam.user_identity SET status = 'suspended' WHERE user_id = $1`, [who.userId]);
    const after = await verify();
    expect(after.statusCode).toBe(200);
    expect(after.json().data).toMatchObject({ valid: true, user_id: who.userId, user_status: "suspended" });

    const res = await approveWith(approvalId, who, assertion);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
    expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId])).rowCount).toBe(0);
  });

  it("T-51: the existing verify-assertion contract is unchanged — same fields and values, same 200/401, no identity leakage on the 401, one audit and one auth event per call", async () => {
    assertPrerequisites();
    const who = await createIdentity("admin", "staff");
    const purpose = "withdrawal_approval";
    const assertion = await stepUpAssertion(who, purpose);
    // D7-02: both counts are scoped to THIS test's identity (the audit event's `actor_id` is the
    // assertion owner), so no other activity on the database can change them.
    const countEvents = async () => ({
      outbox: Number((await verifyPool.query(`SELECT count(*) AS n FROM foundation.outbox_event WHERE event_type = 'iam.recent_auth_assertion_verified' AND strpos(payload_ref, $1) > 0`, [`"actor_id":"${who.userId}"`])).rows[0]!.n),
      auth: Number((await verifyPool.query(`SELECT count(*) AS n FROM iam.auth_event WHERE event_type = 'iam.recent_auth_assertion_verified' AND user_id = $1`, [who.userId])).rows[0]!.n),
    });

    const c0 = await countEvents();
    const okRes = await iamApp.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers: iamHeaders, payload: { recent_auth_assertion: assertion, required_purpose: purpose } });
    expect(okRes.statusCode).toBe(200);
    const data = okRes.json().data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["auth_level", "fresh_until_utc", "user_class", "user_id", "user_status", "user_type", "valid"]);
    expect(data).toMatchObject({ valid: true, user_id: who.userId, auth_level: "mfa", user_type: "admin", user_class: "staff", user_status: "active" });
    expect(Number.isNaN(Date.parse(data.fresh_until_utc as string))).toBe(false);
    const c1 = await countEvents();
    expect(c1.outbox - c0.outbox).toBe(1);
    expect(c1.auth - c0.auth).toBe(1);

    const bad = await iamApp.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers: iamHeaders, payload: { recent_auth_assertion: assertion, required_purpose: "some_other_purpose" } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe("AUTH_RECENT_AUTH_INVALID");
    const raw = JSON.stringify(bad.json());
    for (const leaked of ["user_type", "user_class", "user_status", who.userId]) expect(raw).not.toContain(leaked);
    const c2 = await countEvents();
    expect(c2.outbox - c1.outbox).toBe(1);
    expect(c2.auth - c1.auth).toBe(1);

    const noAuth = await iamApp.inject({ method: "POST", url: "/internal/auth/verify-assertion", payload: { recent_auth_assertion: assertion, required_purpose: purpose } });
    expect([401, 403]).toContain(noAuth.statusCode);
  });

  it("T-50: an older IAM-01 (no identity fields) makes every approval fail closed — an availability cost, never a bypass", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const approvalId = await pendingApprovalFor(who);
    const assertion = await stepUpAssertion(who, `iam2_approval:${approvalId}`);
    const bridged = iam2Config.iam01FetchImpl!;
    iam2Config.iam01FetchImpl = (async (url: unknown, init?: unknown) => {
      const res = (await (bridged as unknown as (u: unknown, i?: unknown) => Promise<Response>)(url, init)) as Response;
      const body = (await res.json()) as { data?: Record<string, unknown> };
      if (body.data) for (const k of ["user_type", "user_class", "user_status"]) delete body.data[k];
      return { ok: res.ok, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    const res = await approveWith(approvalId, who, assertion);
    iam2Config.iam01FetchImpl = bridged;
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("IAM2_APPROVER_NOT_ELIGIBLE");
    expect(fingerprint({})).toBeTruthy();
  });
});
