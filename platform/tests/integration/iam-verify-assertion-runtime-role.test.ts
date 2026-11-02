/**
 * IAM02-AUTHZ-REM-001 — IMPL-04 / T-51: the ADDITIVE live identity fields of IAM-01
 * `POST /internal/auth/verify-assertion` (`user_type`, `user_class`, `user_status`), proved under
 * the REAL `role_iam_runtime` grants and row-level security — not through a superuser harness.
 *
 * Isolation: this file creates its OWN disposable database (`aix_iam01rt_<random>`), migrates the
 * repository's own chain into it with `node-pg-migrate`, applies the unchanged fnd and iam grant
 * files, boots the real IAM-01 application on a LOGIN role that is a member of `role_iam_runtime`
 * ONLY (no superuser, no BYPASSRLS), and drops the database afterwards. A separate superuser pool
 * is used solely to create fixtures (identities) and to tamper with identity state / privileges
 * the way a privileged operator would. Nothing touches TEST_DATABASE_URL's own database.
 *
 * It also feeds the REAL IAM-01 response (in-process `app.inject`, no network) through IAM-02's
 * own `verifyApproverStepUp`, so the end-to-end decision under runtime grants is shown without
 * booting the IAM-02 application (which would put both services' Fastify type augmentations in
 * one program).
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (IMPL-02 convention): with TEST_DATABASE_URL unset the
 * suite is skipped explicitly with a named reason; with it set, any unavailable prerequisite
 * fails every test with the underlying evidence.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { IamConfig } from "../../services/iam/src/config.js";
import { buildApp } from "../../services/iam/src/server.js";
import { hashPassword } from "../../services/iam/src/lib/password.js";
import { sha256Hex } from "../../services/iam/src/lib/session.js";
import { totpAt } from "../../services/iam/src/lib/totp.js";
import { verifyApproverStepUp, verifyStepUpAssertion } from "../../services/iam2/src/lib/iam01-client.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const PLATFORM_DIR = resolve(__dirname, "..", "..");
const BIN = resolve(PLATFORM_DIR, "node_modules", ".bin", "node-pg-migrate");
const DB_NAME = "aix_iam01rt_" + randomUUID().replace(/-/g, "").slice(0, 12);
const RUNTIME_LOGIN = "iam_vae_runtime_it";
const IAM_INTERNAL = "test-iam-internal-token-vae-runtime";
const iamHeaders = { "x-internal-service-token": IAM_INTERNAL };

const iamConfig: IamConfig = {
  environment: "dev",
  databaseUrl: "postgres://unused",
  internalServiceToken: "test-fnd-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iamInternalServiceToken: IAM_INTERNAL,
  iamIntrospectionServiceToken: "test-iam-introspection-token-vae-runtime",
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

function urlFor(db: string, user?: string): string {
  const u = new URL(TEST_DB as string);
  u.pathname = "/" + db;
  if (user) {
    u.username = user;
    u.password = "";
  }
  return u.toString();
}

let admin: Pool; // maintenance DB, superuser: CREATE/DROP DATABASE only
let su: Pool; // disposable DB, superuser: fixtures / tampering
let rt: Pool; // disposable DB, role_iam_runtime LOGIN: what the application runs as
let app: FastifyInstance;
let databaseCreated = false;
let prerequisiteError: Error | undefined;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the IAM-01 verify-assertion runtime-role tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL (a role that can CREATE ROLE and CREATE DATABASE) to run them.";

// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM-01 verify-assertion under role_iam_runtime (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

const idem = (l: string) => `vae_${l}_${randomUUID()}`;

interface Identity { userId: string; accessToken: string; totpSecret: string }

async function createIdentity(type: string, cls: string): Promise<Identity> {
  const userId = "user_vae_" + randomUUID();
  const identifier = `vae-${randomUUID()}@example.invalid`;
  const password = "Vae-Passw0rd-1!";
  await su.query(
    `INSERT INTO iam.user_identity (user_id, user_type, identifier_normalised, identifier_hash, status, mfa_required, user_class, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,'active',false,$5,now(),now())`,
    [userId, type, identifier, sha256Hex(identifier), cls],
  );
  const h = await hashPassword(password);
  await su.query(
    `INSERT INTO iam.credential_password (user_id, password_hash, hash_algorithm, hash_params, password_changed_at_utc, must_change_password, failed_attempt_count, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,now(),false,0,now(),now())`,
    [userId, h.hash, h.algorithm, JSON.stringify(h.params)],
  );
  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { "idempotency-key": idem("login") }, payload: { identifier, password } });
  expect(login.statusCode, JSON.stringify(login.json())).toBe(200);
  const accessToken = login.json().data.access_token as string;
  const enrol = await app.inject({ method: "POST", url: "/auth/mfa/enrol", headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idem("enrol") }, payload: { factor_type: "totp" } });
  expect(enrol.statusCode, JSON.stringify(enrol.json())).toBe(201);
  const totpSecret = enrol.json().data.secret as string;
  const verify = await app.inject({
    method: "POST",
    url: "/auth/mfa/verify",
    headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idem("mfaverify") },
    payload: { factor_id: enrol.json().data.factor_id, code: totpAt(totpSecret, Date.now()) },
  });
  expect(verify.statusCode, JSON.stringify(verify.json())).toBe(200);
  return { userId, accessToken, totpSecret };
}

async function assertionFor(who: Identity, purpose: string): Promise<string> {
  const start = await app.inject({ method: "POST", url: "/auth/step-up", headers: { authorization: `Bearer ${who.accessToken}`, "idempotency-key": idem("su") }, payload: { purpose } });
  expect(start.statusCode, JSON.stringify(start.json())).toBe(200);
  const fin = await app.inject({
    method: "POST",
    url: "/auth/step-up/verify",
    headers: { authorization: `Bearer ${who.accessToken}`, "idempotency-key": idem("suv") },
    payload: { challenge_id: start.json().data.challenge_id, code: totpAt(who.totpSecret, Date.now()) },
  });
  expect(fin.statusCode, JSON.stringify(fin.json())).toBe(200);
  return fin.json().data.recent_auth_assertion as string;
}

const verifyAssertion = (assertion: string, purpose: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = iamHeaders) =>
  app.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers, payload: { recent_auth_assertion: assertion, required_purpose: purpose, ...extra } });

/** IAM-02's own client wired to the REAL IAM-01 application (in-process, no network). */
const bridgedConfig = () => ({
  baseUrl: "http://iam01.bridge.invalid",
  internalServiceToken: IAM_INTERNAL,
  fetchImpl: (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const res = await app.inject({ method: "POST", url: new URL(String(url)).pathname, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, payload: init?.body ?? "{}" });
    return { ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => res.json() } as Response;
  }) as unknown as typeof fetch,
});

describe.skipIf(!TEST_DB)("IAM-01 verify-assertion additive identity fields under role_iam_runtime (disposable database)", () => {
  beforeAll(async () => {
    if (!existsSync(BIN)) {
      prerequisiteError = new Error(`PREREQUISITE UNAVAILABLE: the node-pg-migrate binary was not found at ${BIN}. Run \`npm install\` in platform/; this test refuses to pass without running.`);
      return;
    }
    admin = new Pool({ connectionString: urlFor("postgres") });
    try {
      for (const r of ["aml1", "cfg1", "clt1", "fnd", "iam2", "iam", "kyc1", "sec1", "wlt1"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_${r}_runtime') THEN CREATE ROLE role_${r}_runtime NOLOGIN; END IF; END $$;`);
      }
      await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_LOGIN}') THEN CREATE ROLE ${RUNTIME_LOGIN} LOGIN; END IF; END $$;`);
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
      su = new Pool({ connectionString: urlFor(DB_NAME) });
      for (const f of ["fnd_runtime_grants.sql", "iam_runtime_grants.sql"]) {
        await su.query(readFileSync(resolve(PLATFORM_DIR, "infra", "grants", f), "utf8"));
      }
      await su.query(`GRANT role_iam_runtime TO ${RUNTIME_LOGIN}`);
      rt = new Pool({ connectionString: urlFor(DB_NAME, RUNTIME_LOGIN) });
      initPool(urlFor(DB_NAME, RUNTIME_LOGIN));
      app = await buildApp({ ...iamConfig, databaseUrl: urlFor(DB_NAME, RUNTIME_LOGIN) });
    } catch (err) {
      const e = err as { code?: string; message?: string; stderr?: Buffer | string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the disposable IAM-01 runtime-role environment could not be prepared ` +
          `(CREATE ROLE/DATABASE ${DB_NAME}, migrate, grants, boot): [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)} ${e.stderr ? String(e.stderr).slice(0, 500) : ""}. ` +
          "Use a superuser (or CREATEROLE + CREATEDB) URL; this test refuses to pass without running.",
      );
    }
  }, 240_000);
  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    if (rt) await rt.end();
    if (su) await su.end();
    if (admin) {
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("the application really runs as role_iam_runtime: not a superuser, no BYPASSRLS, SELECT on iam.user_identity (no scope needed), no DELETE", async () => {
    assertPrerequisites();
    const who = await rt.query(`SELECT rolsuper, rolbypassrls, current_user AS u FROM pg_roles WHERE rolname = current_user`);
    expect(who.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false, u: RUNTIME_LOGIN });
    const member = await rt.query(`SELECT pg_has_role(current_user, 'role_iam_runtime', 'MEMBER') AS m`);
    expect(member.rows[0]!.m).toBe(true);
    const priv = await rt.query(
      `SELECT has_table_privilege(current_user,'iam.user_identity','SELECT') AS sel, has_table_privilege(current_user,'iam.user_identity','DELETE') AS del,
              has_table_privilege(current_user,'iam.step_up_assertion','SELECT') AS asrt`,
    );
    expect(priv.rows[0]).toEqual({ sel: true, del: false, asrt: true });
  });

  it("RLS invariants are unchanged: user_identity is readable WITHOUT an aix.user_id scope (no RLS), while mfa_factor / session stay FORCE-RLS protected from the same login", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const flags = await su.query<{ relname: string; rls: boolean; force: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'iam' AND c.relname IN ('user_identity','mfa_factor','session','step_up_assertion') ORDER BY 1`,
    );
    const byName = Object.fromEntries(flags.rows.map((r) => [r.relname, r]));
    expect(byName.user_identity).toMatchObject({ rls: false, force: false });
    expect(byName.mfa_factor).toMatchObject({ rls: true, force: true });
    expect(byName.session).toMatchObject({ rls: true, force: true });
    expect(byName.step_up_assertion).toMatchObject({ rls: false });
    // Same login, no scope: identity visible; RLS-protected rows are not.
    const visibleIdentity = await rt.query(`SELECT 1 FROM iam.user_identity WHERE user_id = $1`, [who.userId]);
    expect(visibleIdentity.rowCount).toBe(1);
    expect((await su.query(`SELECT 1 FROM iam.mfa_factor WHERE user_id = $1`, [who.userId])).rowCount).toBeGreaterThan(0);
    expect((await rt.query(`SELECT 1 FROM iam.mfa_factor`)).rowCount).toBe(0);
    expect((await rt.query(`SELECT 1 FROM iam.session`)).rowCount).toBe(0);
  });

  it("T-51: returns the assertion owner's LIVE user_type / user_class / user_status alongside the unchanged fields — exact key set, correct values, per identity", async () => {
    assertPrerequisites();
    const cases: Array<[string, string]> = [["staff", "staff"], ["admin", "admin"], ["staff", "admin"], ["admin", "staff"], ["service", "service"], ["client", "client"], ["client", "client_approver"]];
    for (const [type, cls] of cases) {
      const who = await createIdentity(type, cls);
      const purpose = `iam2_approval:appr_${randomUUID()}`;
      const res = await verifyAssertion(await assertionFor(who, purpose), purpose);
      expect(res.statusCode, `${type}/${cls}`).toBe(200);
      const data = res.json().data as Record<string, unknown>;
      expect(Object.keys(data).sort(), `${type}/${cls}`).toEqual(["auth_level", "fresh_until_utc", "user_class", "user_id", "user_status", "user_type", "valid"]);
      expect(data, `${type}/${cls}`).toMatchObject({ valid: true, user_id: who.userId, auth_level: "mfa", user_type: type, user_class: cls, user_status: "active" });
      expect(Date.parse(data.fresh_until_utc as string)).toBeGreaterThan(Date.now());
    }
  });

  it("the fields are LIVE: a status or classification change after issuance is reflected on the next call, while `valid` (the accepted contract) is unchanged", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const purpose = `iam2_approval:appr_${randomUUID()}`;
    const assertion = await assertionFor(who, purpose);
    for (const status of ["suspended", "locked", "deactivated"]) {
      await su.query(`UPDATE iam.user_identity SET status = $2 WHERE user_id = $1`, [who.userId, status]);
      const res = await verifyAssertion(assertion, purpose);
      expect(res.statusCode, status).toBe(200);
      expect(res.json().data, status).toMatchObject({ valid: true, user_id: who.userId, user_status: status, user_type: "staff", user_class: "staff" });
    }
    await su.query(`UPDATE iam.user_identity SET status = 'active', user_type = 'service', user_class = 'service' WHERE user_id = $1`, [who.userId]);
    expect((await verifyAssertion(assertion, purpose)).json().data).toMatchObject({ valid: true, user_status: "active", user_type: "service", user_class: "service" });
  });

  it("identity and assertion BINDING: each assertion yields only its OWN owner's facts; wrong purpose / garbage / wrong session / missing credentials fail closed with NO identity fields", async () => {
    assertPrerequisites();
    const a = await createIdentity("staff", "staff");
    const b = await createIdentity("service", "service");
    const purpose = `iam2_approval:appr_${randomUUID()}`;
    const asrtA = await assertionFor(a, purpose);
    const asrtB = await assertionFor(b, purpose);
    expect((await verifyAssertion(asrtA, purpose)).json().data).toMatchObject({ user_id: a.userId, user_type: "staff" });
    expect((await verifyAssertion(asrtB, purpose)).json().data).toMatchObject({ user_id: b.userId, user_type: "service" });

    const leaks = (body: unknown) => ["user_type", "user_class", "user_status", a.userId, b.userId].filter((needle) => JSON.stringify(body).includes(needle));
    const wrongPurpose = await verifyAssertion(asrtA, "iam2_approval:appr_other");
    expect(wrongPurpose.statusCode).toBe(401);
    expect(wrongPurpose.json().error.code).toBe("AUTH_RECENT_AUTH_INVALID");
    expect(leaks(wrongPurpose.json())).toEqual([]);
    const garbage = await verifyAssertion("not-an-assertion", purpose);
    expect(garbage.statusCode).toBe(401);
    expect(leaks(garbage.json())).toEqual([]);
    const wrongSession = await verifyAssertion(asrtA, purpose, { session_id: "sess_not_this_one" });
    expect(wrongSession.statusCode).toBe(401);
    expect(leaks(wrongSession.json())).toEqual([]);
    const noCreds = await verifyAssertion(asrtA, purpose, {}, {});
    expect([401, 403]).toContain(noCreds.statusCode);
    expect(leaks(noCreds.json())).toEqual([]);
    const badCreds = await verifyAssertion(asrtA, purpose, {}, { "x-internal-service-token": "wrong" });
    expect([401, 403]).toContain(badCreds.statusCode);
    const malformed = await app.inject({ method: "POST", url: "/internal/auth/verify-assertion", headers: iamHeaders, payload: { required_purpose: purpose } });
    expect(malformed.statusCode).toBe(400);
    // An expired assertion is invalid even though the identity is active.
    await su.query(`UPDATE iam.step_up_assertion SET expires_at_utc = now() - interval '1 minute' WHERE user_id = $1`, [a.userId]);
    const expired = await verifyAssertion(asrtA, purpose);
    expect(expired.statusCode).toBe(401);
    expect(leaks(expired.json())).toEqual([]);
  });

  it("IAM-02's own client turns the REAL runtime-role response into the right decision: staff/admin mixed pairs eligible; service, client, non-active refused; wrong user / purpose invalid", async () => {
    assertPrerequisites();
    const decide = async (type: string, cls: string, mutate?: (userId: string) => Promise<void>) => {
      const who = await createIdentity(type, cls);
      const approvalId = "appr_" + randomUUID();
      const assertion = await assertionFor(who, `iam2_approval:${approvalId}`);
      if (mutate) await mutate(who.userId);
      return verifyApproverStepUp(bridgedConfig(), { recentAuthAssertion: assertion, approverUserId: who.userId, approvalId });
    };
    for (const [t, c] of [["staff", "staff"], ["admin", "admin"], ["staff", "admin"], ["admin", "staff"]] as const) {
      expect(await decide(t, c), `${t}/${c}`).toMatchObject({ ok: true });
    }
    expect(await decide("service", "service")).toMatchObject({ ok: false, code: "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED" });
    expect(await decide("staff", "service")).toMatchObject({ ok: false, code: "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED" });
    expect(await decide("client", "client")).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    expect(await decide("client", "client_approver")).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    for (const status of ["suspended", "locked", "deactivated"]) {
      expect(await decide("staff", "staff", (u) => su.query(`UPDATE iam.user_identity SET status = '${status}' WHERE user_id = $1`, [u]).then(() => undefined)), status).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    }
    // Wrong claimed approver / wrong approval purpose.
    const who = await createIdentity("staff", "staff");
    const approvalId = "appr_" + randomUUID();
    const assertion = await assertionFor(who, `iam2_approval:${approvalId}`);
    expect(await verifyApproverStepUp(bridgedConfig(), { recentAuthAssertion: assertion, approverUserId: "user_someone_else", approvalId })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    expect(await verifyApproverStepUp(bridgedConfig(), { recentAuthAssertion: assertion, approverUserId: who.userId, approvalId: "appr_" + randomUUID() })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    // The low-level client is backward compatible and returns the live facts unvalidated.
    expect(await verifyStepUpAssertion(bridgedConfig(), { recentAuthAssertion: assertion, requiredPurpose: `iam2_approval:${approvalId}` })).toMatchObject({ valid: true, userId: who.userId, userType: "staff", userClass: "staff", userStatus: "active" });
  });

  it("FAIL CLOSED on MISSING identity evidence: if the assertion owner's identity record is absent, IAM-01 reports null facts (never a default class/status) and IAM-02 refuses the approver", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const approvalId = "appr_" + randomUUID();
    const purpose = `iam2_approval:${approvalId}`;
    const assertion = await assertionFor(who, purpose);
    // Impossible through the application (FKs reference the identity); done by a privileged
    // operator on the disposable database with FK triggers disabled for this one transaction.
    const c = await su.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query(`DELETE FROM iam.user_identity WHERE user_id = $1`, [who.userId]);
      await c.query("COMMIT");
    } finally {
      c.release();
    }
    const res = await verifyAssertion(assertion, purpose);
    expect(res.statusCode).toBe(200); // the accepted contract: `valid` is about the assertion itself
    expect(res.json().data).toMatchObject({ valid: true, user_id: who.userId, user_type: null, user_class: null, user_status: null });
    expect(await verifyApproverStepUp(bridgedConfig(), { recentAuthAssertion: assertion, approverUserId: who.userId, approvalId })).toMatchObject({
      ok: false,
      code: "IAM2_APPROVER_NOT_ELIGIBLE",
    });
  });

  it("FAIL CLOSED when the identity record cannot be read under the runtime grants: verify-assertion yields a non-2xx with no valid:true, and IAM-02 refuses; the privilege is restored afterwards", async () => {
    assertPrerequisites();
    const who = await createIdentity("staff", "staff");
    const approvalId = "appr_" + randomUUID();
    const purpose = `iam2_approval:${approvalId}`;
    const assertion = await assertionFor(who, purpose);
    expect((await verifyAssertion(assertion, purpose)).statusCode).toBe(200);

    // Privileged tampering on the DISPOSABLE database only (the grants file in the repository is untouched).
    await su.query(`REVOKE SELECT ON iam.user_identity FROM role_iam_runtime`);
    try {
      const res = await verifyAssertion(assertion, purpose);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.json())).not.toContain('"valid":true');
      expect(JSON.stringify(res.json())).not.toContain("user_type");
      const decision = await verifyApproverStepUp(bridgedConfig(), { recentAuthAssertion: assertion, approverUserId: who.userId, approvalId });
      expect(decision).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    } finally {
      await su.query(`GRANT SELECT, INSERT, UPDATE ON iam.user_identity TO role_iam_runtime`);
    }
    expect((await verifyAssertion(assertion, purpose)).statusCode).toBe(200);
  });
});
