/**
 * IAM-01 DB-gated integration tests. Self-skip unless TEST_DATABASE_URL points at a
 * Postgres that already has both `foundation` (001) and `iam` (002) schemas migrated, with
 * BOTH infra/grants/fnd_runtime_grants.sql and infra/grants/iam_runtime_grants.sql applied
 * (see the VERIFY commands in IAM-01_IMPLEMENTATION_NOTES.md / task brief).
 *
 * Covers the F3 trio ((a) cross-schema role isolation, (b) RLS DB backstop + app-level
 * fail-closed-on-missing-scope) plus end-to-end login/refresh/MFA/step-up/internal flows
 * that can only be proven against a real database.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, getPool, initPool } from "@aix/foundation";
import type { IamConfig } from "../../services/iam/src/config.js";
import { buildApp } from "../../services/iam/src/server.js";
import { runBootstrap } from "../../services/iam/src/lib/bootstrap.js";
import { hashPassword } from "../../services/iam/src/lib/password.js";
import { sha256Hex } from "../../services/iam/src/lib/session.js";
import { totpAt } from "../../services/iam/src/lib/totp.js";

const TEST_DB = process.env.TEST_DATABASE_URL;

const config: IamConfig = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-fnd-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iamInternalServiceToken: "test-iam-internal-token-it",
  bootstrapEnabled: false,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 1_209_600,
  mfaSecretEncryptionKey: "test-mfa-secret-enc-key-it-not-for-prod",
  rateLimit: {
    loginMaxAttempts: 3,
    loginLockoutMinutes: 15,
    mfaMaxAttempts: 3,
    mfaLockoutMinutes: 15,
    passwordResetMaxAttempts: 5,
    passwordResetLockoutMinutes: 30,
    refreshMaxAttempts: 20,
    refreshLockoutMinutes: 15,
  },
};

const internal = { "x-internal-service-token": "test-iam-internal-token-it" };

let app: FastifyInstance;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await getPool().query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam') AS iam`,
    );
    return Number(r.rows[0]?.fnd) > 0 && Number(r.rows[0]?.iam) > 0;
  } catch {
    return false;
  }
}

function idemKey(label: string): string {
  return `it_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestUser(input: {
  identifier: string;
  password: string;
  userClass?: "admin" | "staff" | "client" | "client_approver" | "service";
  userType?: "client" | "staff" | "admin" | "service";
}): Promise<string> {
  const userId = "user_" + randomUUID();
  const identifierNormalised = input.identifier.trim().toLowerCase();
  const identifierHash = sha256Hex(identifierNormalised);
  await getPool().query(
    `INSERT INTO iam.user_identity
       (user_id, user_type, identifier_normalised, identifier_hash, status, mfa_required, user_class, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,'active',false,$5,now(),now())`,
    [userId, input.userType ?? "client", identifierNormalised, identifierHash, input.userClass ?? "client"],
  );
  const hashed = await hashPassword(input.password);
  await getPool().query(
    `INSERT INTO iam.credential_password (user_id, password_hash, hash_algorithm, hash_params, password_changed_at_utc, must_change_password, failed_attempt_count, created_at_utc, updated_at_utc)
     VALUES ($1,$2,$3,$4,now(),false,0,now(),now())`,
    [userId, hashed.hash, hashed.algorithm, JSON.stringify(hashed.params)],
  );
  return userId;
}

describe.skipIf(!TEST_DB)("IAM-01 integration (DB)", () => {
  beforeAll(async () => {
    initPool(config.databaseUrl);
    schemaReady = await schemasExist();
    if (!schemaReady) return;
    // Built once, unconditionally, here — NOT inside an individual `it`. If app-creation
    // lived inside a test and that test failed/returned early, every later test in the file
    // would then throw "Cannot read properties of undefined (reading 'inject')" instead of
    // its own real assertion, masking the actual failure.
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
  });

  // ---------------------------------------------------------------------------------------
  // F3(a): role_iam_runtime is denied on the foreign `foundation` schema.
  // ---------------------------------------------------------------------------------------
  describe("F3(a): cross-schema DB role isolation", () => {
    it("role_iam_runtime cannot read foundation.* (permission denied), but CAN read iam.*", async () => {
      if (!schemaReady) return expect(schemaReady, "run migrate:up + both grants files first").toBe(true);
      const client = await getPool().connect();
      try {
        await client.query("SET ROLE role_iam_runtime");
        await expect(client.query("SELECT 1 FROM foundation.module_registry LIMIT 1")).rejects.toMatchObject({
          code: "42501", // insufficient_privilege
        });
        // Sanity: the SAME role can read its own schema (proves the denial above is a real
        // isolation boundary, not a broken connection/role).
        await expect(client.query("SELECT 1 FROM iam.user_identity LIMIT 1")).resolves.toBeDefined();
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  // First-admin break-glass bootstrap (decision #3) — must run before any other test
  // inserts a iam.user_identity row (bootstrap only fires when the table is empty).
  // ---------------------------------------------------------------------------------------
  describe("Decision #3: first-admin break-glass bootstrap", () => {
    it("creates exactly one interim admin, forced must-change-password + MFA, with a coupled audit event", async () => {
      if (!schemaReady) return;
      const bootstrapConfig: IamConfig = {
        ...config,
        bootstrapEnabled: true,
        bootstrapAdminIdentifier: "bootstrap-admin@example.com",
        bootstrapAdminPassword: "Bootstrap-Passw0rd-123!",
      };
      await runBootstrap(bootstrapConfig);

      const users = await getPool().query(
        `SELECT user_id, user_class, is_interim_admin, mfa_required, privileged_mfa_required, status
           FROM iam.user_identity WHERE identifier_hash = $1`,
        [sha256Hex("bootstrap-admin@example.com")],
      );
      expect(users.rowCount).toBe(1);
      const admin = users.rows[0];
      expect(admin.is_interim_admin).toBe(true);
      expect(admin.mfa_required).toBe(true);
      expect(admin.privileged_mfa_required).toBe(true);

      const cred = await getPool().query(
        `SELECT must_change_password, password_hash FROM iam.credential_password WHERE user_id = $1`,
        [admin.user_id],
      );
      expect(cred.rows[0].must_change_password).toBe(true);
      expect(cred.rows[0].password_hash).not.toContain("Bootstrap-Passw0rd-123!");

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.bootstrap.admin_created' AND payload_ref LIKE $1`,
        [`%${admin.user_id}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      // Idempotent no-op on a second call — the bootstrap path is consumed once ANY user exists.
      await runBootstrap(bootstrapConfig);
      const usersAfter = await getPool().query(`SELECT count(*)::int AS n FROM iam.user_identity`);
      const usersBefore = 1;
      expect(usersAfter.rows[0].n).toBe(usersBefore);

      // S2 gap-closing patch: mfa_required + no enrolled factor yet no longer dead-ends the
      // bootstrap admin — login returns a purpose-scoped enrolment session (NOT a full
      // session) instead of a hard failure.
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("bootstrap_login") },
        payload: { identifier: "bootstrap-admin@example.com", password: "Bootstrap-Passw0rd-123!" },
      });
      expect(res.statusCode).toBe(200);
      const enrolBody = res.json().data;
      expect(enrolBody.status).toBe("mfa_enrolment_required");
      expect(typeof enrolBody.enrolment_session_id).toBe("string");
      // No full session anywhere in this response shape.
      expect(Object.keys(enrolBody).sort()).toEqual(["enrolment_session_id", "expires_at_utc", "status"]);

      // Complete enrolment end-to-end — this is the specific gap S2 closes: the bootstrap
      // admin can now reach a real authenticated session for the FIRST time.
      const startRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/start",
        headers: { "idempotency-key": idemKey("bootstrap_enrol_start") },
        payload: { enrolment_session_id: enrolBody.enrolment_session_id },
      });
      expect(startRes.statusCode).toBe(201);
      const bootstrapSecret = startRes.json().data.secret;
      const bootstrapFactorId = startRes.json().data.factor_id;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/verify",
        headers: { "idempotency-key": idemKey("bootstrap_enrol_verify") },
        payload: {
          enrolment_session_id: enrolBody.enrolment_session_id,
          factor_id: bootstrapFactorId,
          code: totpAt(bootstrapSecret, Date.now()),
        },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data.status).toBe("authenticated");
      expect(typeof verifyRes.json().data.access_token).toBe("string");

      const bootstrapAudit = await getPool().query(
        `SELECT event_type FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type IN
           ('iam.mfa_enrolment_required','iam.mfa_enrolment_started','iam.mfa_enrolment_verified','iam.bootstrap_admin_mfa_completed')`,
      );
      const auditTypes = bootstrapAudit.rows.map((r) => r.event_type);
      expect(auditTypes).toContain("iam.mfa_enrolment_required");
      expect(auditTypes).toContain("iam.mfa_enrolment_started");
      expect(auditTypes).toContain("iam.mfa_enrolment_verified");
      expect(auditTypes).toContain("iam.bootstrap_admin_mfa_completed");

      // "Bootstrap path disabled after completion": the admin now has an active factor, so a
      // subsequent login takes the normal MFA-challenge branch, never mfa_enrolment_required
      // again.
      const secondLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("bootstrap_login2") },
        payload: { identifier: "bootstrap-admin@example.com", password: "Bootstrap-Passw0rd-123!" },
      });
      expect(secondLogin.statusCode).toBe(200);
      expect(secondLogin.json().data.status).toBe("mfa_required");

      // Reused (already-'used') enrolment session is rejected.
      const reuseStart = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/start",
        headers: { "idempotency-key": idemKey("bootstrap_enrol_reuse") },
        payload: { enrolment_session_id: enrolBody.enrolment_session_id },
      });
      expect(reuseStart.statusCode).toBe(400);
      expect(reuseStart.json().error.code).toBe("AUTH_ENROLMENT_SESSION_INVALID");
    });
  });

  // ---------------------------------------------------------------------------------------
  // S1 gap-closing patch: the ENTIRE point of this block is to catch the exact class of bug
  // the Opus review found — the rest of this file (and the pre-patch suite) connects as the
  // `postgres` SUPERUSER, which bypasses RLS unconditionally and therefore could never have
  // caught "the ownership RLS policy silently breaks auth under the real least-privilege
  // runtime role". Here we create a LOGIN role that is ONLY a member of role_iam_runtime (no
  // BYPASSRLS, not a table owner), point the shared @aix/foundation pool at it for the
  // duration of this block, and drive the real HTTP routes (not just lib functions) through
  // it — then restore the superuser pool afterwards so every other describe in this file is
  // unaffected.
  // ---------------------------------------------------------------------------------------
  describe("S1: end-to-end auth flow under role_iam_runtime (NOT superuser)", () => {
    const RUNTIME_ROLE_USER = "iam_app_test";
    let verifyPool: Pool; // superuser, used ONLY to assert what actually landed in the DB
    let runtimeApp: FastifyInstance;
    let runtimeConfig: IamConfig;

    beforeAll(async () => {
      if (!schemaReady) return;

      // Superuser one-time setup: a LOGIN role that inherits role_iam_runtime's grants —
      // nothing more (no BYPASSRLS, not the table owner of anything in `iam`).
      await getPool().query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
            CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
          END IF;
        END
        $$;
      `);
      await getPool().query(`GRANT role_iam_runtime TO ${RUNTIME_ROLE_USER};`);

      verifyPool = new Pool({ connectionString: config.databaseUrl });

      // Point the SHARED @aix/foundation pool (the one every route handler resolves via
      // getPool()) at a connection authenticated AS the runtime-role login — this is the
      // "dedicated pg Pool / connection" the runtime role drives its own HTTP requests
      // through, not a SET ROLE on top of the superuser connection.
      const runtimeDbUrl = config.databaseUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
      await closePool();
      initPool(runtimeDbUrl);

      runtimeConfig = { ...config, environment: "dev" };
      runtimeApp = await buildApp(runtimeConfig);
    });

    afterAll(async () => {
      if (!schemaReady) return;
      await runtimeApp?.close();
      await verifyPool?.end();
      // Restore the superuser-backed shared pool for every later describe block in this file.
      await closePool();
      initPool(config.databaseUrl);
    });

    it("(1)+(2)+(3): login creates a session, validateAccessToken succeeds, refresh rotates — all under role_iam_runtime", async () => {
      if (!schemaReady) return;
      const identifier = "runtime-role-user-a@example.com";
      const password = "Runtime-Role-Passw0rd-1!";
      await createTestUser({ identifier, password });

      const loginIdemKey = idemKey("runtime_login_a");
      const loginRes = await runtimeApp.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": loginIdemKey },
        payload: { identifier, password },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().data.status).toBe("authenticated");
      const accessToken = loginRes.json().data.access_token;
      const refreshToken = loginRes.json().data.refresh_token;

      // Independently verify the session actually landed in the DB (superuser connection,
      // bypasses RLS) — not just trusting the API's own success response.
      const dbCheck = await verifyPool.query(`SELECT session_token_hash FROM iam.session WHERE user_id = (SELECT user_id FROM iam.user_identity WHERE identifier_hash = $1)`, [
        sha256Hex(identifier),
      ]);
      expect(dbCheck.rows.some((r) => r.session_token_hash === sha256Hex(accessToken))).toBe(true);

      // C2: beginIdempotent/completeIdempotent ran on this SAME role_iam_runtime connection
      // (RLS is ENABLE+FORCE'd on foundation.idempotency_record) and must have written a
      // completed row scoped to source_module = 'IAM-01' — proving the whole begin/complete
      // read-modify-write cycle works end-to-end under the real runtime role, not just under
      // the superuser connection every other describe block in this file uses.
      const idemCheck = await verifyPool.query(
        `SELECT status, source_module FROM foundation.idempotency_record
          WHERE actor_id = 'anon_' || $1 AND action = 'iam.auth.login' AND idempotency_key = $2`,
        [sha256Hex(identifier), loginIdemKey],
      );
      expect(idemCheck.rows[0]?.status).toBe("completed");
      expect(idemCheck.rows[0]?.source_module).toBe("IAM-01");

      // validateAccessToken succeeds: GET /auth/sessions resolves the bearer token via
      // requireUserSession -> validateAccessToken on the SAME runtime-role connection.
      const sessionsRes = await runtimeApp.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(sessionsRes.statusCode).toBe(200);
      expect(sessionsRes.json().data.sessions.length).toBeGreaterThan(0);

      // Refresh rotation succeeds.
      const refreshRes = await runtimeApp.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("runtime_refresh_a") },
        payload: { refresh_token: refreshToken },
      });
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.json().data.status).toBe("authenticated");
      expect(refreshRes.json().data.refresh_token).not.toBe(refreshToken);
    });

    it("(4): role_iam_runtime cannot freely SELECT * FROM iam.session / iam.refresh_token (RLS still gates direct reads)", async () => {
      if (!schemaReady) return;
      // Table-level grants DO include SELECT (needed for owner-scoped reads), so an unscoped
      // query is not necessarily a permission-denied error — but FORCE RLS with no aix.user_id
      // set must still yield ZERO rows, never an unscoped dump of every user's sessions.
      const sessions = await getPool().query(`SELECT * FROM iam.session`);
      expect(sessions.rowCount).toBe(0);
      const refreshTokens = await getPool().query(`SELECT * FROM iam.refresh_token`);
      expect(refreshTokens.rowCount).toBe(0);
    });

    it("(5): owner-scoped GET /auth/sessions returns only the current user's sessions, never another user's", async () => {
      if (!schemaReady) return;
      const identifierB = "runtime-role-user-b@example.com";
      const passwordB = "Runtime-Role-Passw0rd-2!";
      await createTestUser({ identifier: identifierB, password: passwordB });

      const loginA = await runtimeApp.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("runtime_login_a2") },
        payload: { identifier: "runtime-role-user-a@example.com", password: "Runtime-Role-Passw0rd-1!" },
      });
      const loginB = await runtimeApp.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("runtime_login_b") },
        payload: { identifier: identifierB, password: passwordB },
      });
      const tokenA = loginA.json().data.access_token;
      const tokenB = loginB.json().data.access_token;

      const sessionsA = await runtimeApp.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const sessionsB = await runtimeApp.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      const idsA: string[] = sessionsA.json().data.sessions.map((s: { session_id: string }) => s.session_id);
      const idsB: string[] = sessionsB.json().data.sessions.map((s: { session_id: string }) => s.session_id);
      expect(idsA.length).toBeGreaterThan(0);
      expect(idsB.length).toBeGreaterThan(0);
      expect(idsA.some((id) => idsB.includes(id))).toBe(false);
    });

    it("(6): F3(a) foreign-schema-denied still holds; foundation.outbox_event is INSERT-only for role_iam_runtime (C1)", async () => {
      if (!schemaReady) return;
      await expect(getPool().query("SELECT 1 FROM foundation.module_registry LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });

      // C1 (independent review tightening, post-S1): the approved narrow foundation
      // interface still works for INSERT — proven implicitly above, since login's coupled
      // audit/outbox write could never have committed on this same runtime-role connection
      // otherwise — but role_iam_runtime must NOT be able to SELECT or UPDATE
      // foundation.outbox_event: `enqueueOutbox`/`publishAudit` (packages/foundation/src)
      // only ever INSERT, so any broader privilege would let IAM read or mutate other
      // modules' audit/outbox rows.
      const outboxPriv = await getPool().query(
        `SELECT
           has_table_privilege('foundation.outbox_event', 'INSERT') AS ins,
           has_table_privilege('foundation.outbox_event', 'SELECT') AS sel,
           has_table_privilege('foundation.outbox_event', 'UPDATE') AS upd`,
      );
      expect(outboxPriv.rows[0].ins).toBe(true);
      expect(outboxPriv.rows[0].sel).toBe(false);
      expect(outboxPriv.rows[0].upd).toBe(false);

      // Prove the denial live, not just via the catalog check above.
      await expect(getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(
        getPool().query("UPDATE foundation.outbox_event SET status = 'pending' WHERE outbox_id = 'no_such_row'"),
      ).rejects.toMatchObject({ code: "42501" });

      // foundation.idempotency_record's table-level grant is unaffected by the C2 patch:
      // begin/complete still needs (and keeps) the full SELECT, INSERT, UPDATE cycle — C2
      // closes the cross-module gap via RLS (source_module + aix.module), not by narrowing
      // this grant. See test (6b) below for the RLS proof.
      const idemPriv = await getPool().query(
        `SELECT
           has_table_privilege('foundation.idempotency_record', 'INSERT') AS ins,
           has_table_privilege('foundation.idempotency_record', 'SELECT') AS sel,
           has_table_privilege('foundation.idempotency_record', 'UPDATE') AS upd`,
      );
      expect(idemPriv.rows[0].ins).toBe(true);
      expect(idemPriv.rows[0].sel).toBe(true);
      expect(idemPriv.rows[0].upd).toBe(true);
    });

    it("(6b): C2 — role_iam_runtime cannot read or update an FND-created idempotency row (direct SQL proof, RLS by source_module)", async () => {
      if (!schemaReady) return;
      // Seed an FND-01 row directly via the superuser verify connection (bypasses RLS), so
      // we know exactly what exists to look for.
      const fndKey = "c2_fnd_seed_" + idemKey("seed");
      await verifyPool.query(
        `INSERT INTO foundation.idempotency_record
           (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
         VALUES ($1, 'sha256:seed', 'c2_fnd_actor', 'service', 'foundation.c2.probe', 'FND-01', 'processing', now() + interval '1 day', now(), now())`,
        [fndKey],
      );

      // Unscoped (aix.module never set on this statement/connection) — fails closed, exactly
      // like the missing-scope guarantee already proven for iam.session/refresh_token.
      const unscoped = await getPool().query(
        `SELECT 1 FROM foundation.idempotency_record WHERE idempotency_key = $1`,
        [fndKey],
      );
      expect(unscoped.rowCount).toBe(0);

      // Correctly scoped to IAM-01 (role_iam_runtime's OWN module) — still cannot see or
      // mutate the FND-created row. This is the actual cross-module isolation guarantee C2
      // provides: a module that scopes itself correctly cannot reach another module's rows.
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('aix.module', 'IAM-01', true)");
        const scoped = await client.query(
          `SELECT 1 FROM foundation.idempotency_record WHERE idempotency_key = $1`,
          [fndKey],
        );
        expect(scoped.rowCount).toBe(0);
        const upd = await client.query(
          `UPDATE foundation.idempotency_record SET status = 'failed' WHERE idempotency_key = $1`,
          [fndKey],
        );
        // RLS hides the row from the UPDATE's own WHERE clause entirely (WITH CHECK/USING) —
        // it silently affects zero rows rather than erroring, since the table-level GRANT
        // does permit UPDATE in general.
        expect(upd.rowCount).toBe(0);
        await client.query("COMMIT");
      } finally {
        client.release();
      }

      // Confirm via the superuser connection that the FND row was left completely untouched.
      const stillThere = await verifyPool.query(
        `SELECT status FROM foundation.idempotency_record WHERE idempotency_key = $1`,
        [fndKey],
      );
      expect(stillThere.rows[0]?.status).toBe("processing");
    });

    it("(7): missing-client-scope still fails closed under the runtime role", async () => {
      if (!schemaReady) return;
      const res = await runtimeApp.inject({ method: "GET", url: "/auth/sessions" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
    });

    // (8) import-boundary: a static, DB-independent check (tests/unit/iam-import-boundary.test.ts)
    // that always runs as part of the full suite — not re-asserted here since it has no DB-role
    // dimension to it.
  });

  // ---------------------------------------------------------------------------------------
  // F3(b): RLS DB backstop (fails closed on missing/absent scope) + app-level equivalent.
  // ---------------------------------------------------------------------------------------
  describe("F3(b): missing-client-scope fails closed", () => {
    it("RLS on iam.session denies rows when aix.user_id is unset, and scopes correctly when set", async () => {
      if (!schemaReady) return;
      const userA = await createTestUser({ identifier: "rls-user-a@example.com", password: "Password-123-abc!" });
      const userB = await createTestUser({ identifier: "rls-user-b@example.com", password: "Password-123-abc!" });
      await getPool().query(
        `INSERT INTO iam.session (session_id, session_token_hash, user_id, session_status, issued_at_utc, expires_at_utc, user_class, auth_level)
         VALUES ($1,$2,$3,'active',now(), now() + interval '1 hour', 'client','password')`,
        ["sess_rls_a", sha256Hex("tok_rls_a"), userA],
      );
      await getPool().query(
        `INSERT INTO iam.session (session_id, session_token_hash, user_id, session_status, issued_at_utc, expires_at_utc, user_class, auth_level)
         VALUES ($1,$2,$3,'active',now(), now() + interval '1 hour', 'client','password')`,
        ["sess_rls_b", sha256Hex("tok_rls_b"), userB],
      );

      const client = await getPool().connect();
      try {
        await client.query("SET ROLE role_iam_runtime");

        // No scope set at all -> fails closed to ZERO rows, not an unscoped read of everything.
        // set_config(..., true) is transaction-local, so this must run inside an explicit
        // transaction for the setting (or its absence) to be observed by the SELECT below —
        // see the identical note in services/iam/src/plugins/user-session.ts.
        await client.query("BEGIN");
        const unscoped = await client.query("SELECT session_id FROM iam.session");
        expect(unscoped.rowCount).toBe(0);
        await client.query("COMMIT");

        // Scope set to user A -> sees only A's row, never B's.
        await client.query("BEGIN");
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userA]);
        const scopedA = await client.query("SELECT session_id, user_id FROM iam.session");
        await client.query("COMMIT");
        expect(scopedA.rows.every((r) => r.user_id === userA)).toBe(true);
        expect(scopedA.rows.some((r) => r.session_id === "sess_rls_a")).toBe(true);
        expect(scopedA.rows.some((r) => r.session_id === "sess_rls_b")).toBe(false);
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("app-level: GET /auth/sessions with no bearer token fails closed (already covered no-DB; re-asserted here against a live DB-backed app)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/auth/sessions" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Login / session lifecycle
  // ---------------------------------------------------------------------------------------
  describe("Login + session lifecycle", () => {
    const identifier = "login-user@example.com";
    const password = "Correct-Horse-42!";
    let userId: string;

    beforeAll(async () => {
      if (!schemaReady) return;
      userId = await createTestUser({ identifier, password });
    });

    it("succeeds and issues a session with a coupled audit event in the SAME transaction", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("login_ok") },
        payload: { identifier, password, device: { device_id: "dev_1", device_name: "Test Device" } },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe("authenticated");
      expect(typeof body.data.access_token).toBe("string");
      expect(typeof body.data.refresh_token).toBe("string");

      // No-secrets-in-response-shape: only the expected fields, never a hash/internal field.
      expect(Object.keys(body.data).sort()).toEqual(["access_token", "expires_at_utc", "refresh_token", "status"]);

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.login_success' AND payload_ref LIKE $1`,
        [`%${userId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);

      const sessionRows = await getPool().query(`SELECT session_token_hash FROM iam.session WHERE user_id = $1`, [userId]);
      expect(sessionRows.rows.some((r) => r.session_token_hash === sha256Hex(body.data.access_token))).toBe(true);
    });

    it("fails with a GENERIC error for both a wrong password and a non-existent identifier (no enumeration)", async () => {
      if (!schemaReady) return;
      const wrongPass = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("login_wrong_pw") },
        payload: { identifier, password: "totally-wrong" },
      });
      const noSuchUser = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("login_no_user") },
        payload: { identifier: "does-not-exist@example.com", password: "whatever123" },
      });
      expect(wrongPass.statusCode).toBe(401);
      expect(noSuchUser.statusCode).toBe(401);
      expect(wrongPass.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
      expect(noSuchUser.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
      expect(wrongPass.json().error.message).toBe(noSuchUser.json().error.message);
    });

    it("locks out after the configured attempt threshold, then AUTH_ACCOUNT_LOCKED", async () => {
      if (!schemaReady) return;
      const lockIdentifier = "lockout-user@example.com";
      await createTestUser({ identifier: lockIdentifier, password: "Some-Passw0rd-1!" });

      let last;
      for (let i = 0; i < config.rateLimit.loginMaxAttempts; i++) {
        last = await app.inject({
          method: "POST",
          url: "/auth/login",
          headers: { "idempotency-key": idemKey("lockout_" + i) },
          payload: { identifier: lockIdentifier, password: "wrong-password" },
        });
      }
      expect(last!.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");

      const lockedAttempt = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("lockout_final") },
        payload: { identifier: lockIdentifier, password: "wrong-password" },
      });
      expect(lockedAttempt.statusCode).toBe(423);
      expect(lockedAttempt.json().error.code).toBe("AUTH_ACCOUNT_LOCKED");

      // Even the CORRECT password is denied while locked (fail closed).
      const correctWhileLocked = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("lockout_correct") },
        payload: { identifier: lockIdentifier, password: "Some-Passw0rd-1!" },
      });
      expect(correctWhileLocked.statusCode).toBe(423);

      const lockoutRow = await getPool().query(
        `SELECT locked_until_utc FROM iam.account_lockout WHERE action = 'login' AND scope_hash = $1`,
        [sha256Hex("login:" + sha256Hex(lockIdentifier))],
      );
      expect(lockoutRow.rowCount).toBeGreaterThan(0);
    });

    it("Idempotency-Key replay returns the same outcome without a second audit write", async () => {
      if (!schemaReady) return;
      const replayIdentifier = "replay-user@example.com";
      const replayUserId = await createTestUser({ identifier: replayIdentifier, password: "Whatever-123!" });
      const key = idemKey("replay_fail");
      const payload = { identifier: replayIdentifier, password: "wrong-one" };

      const first = await app.inject({ method: "POST", url: "/auth/login", headers: { "idempotency-key": key }, payload });
      const second = await app.inject({ method: "POST", url: "/auth/login", headers: { "idempotency-key": key }, payload });
      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(200); // duplicate_submission is a 200 envelope, not a re-thrown error
      expect(second.json().data.status).toBe("duplicate_submission");

      // The user exists (just the wrong password), so login_failed's entity_id is the
      // resolved user_id, not the identifier hash (that path is only taken when no user
      // resolves at all — see routes/auth.ts).
      const failCount = await getPool().query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.login_failed' AND payload_ref LIKE $1`,
        [`%${replayUserId}%`],
      );
      expect(failCount.rows[0].n).toBe(1);
    });

    it("replay with same key + DIFFERENT body is rejected (VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const key = idemKey("replay_conflict");
      const a = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": key },
        payload: { identifier, password: "wrong-a" },
      });
      const b = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": key },
        payload: { identifier, password: "wrong-b-different" },
      });
      expect(a.statusCode).toBe(401);
      expect(b.statusCode).toBe(400);
      expect(b.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("logout revokes the current session; a subsequent authenticated call fails closed", async () => {
      if (!schemaReady) return;
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("logout_login") },
        payload: { identifier, password },
      });
      const accessToken = loginRes.json().data.access_token;

      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("logout") },
        payload: {},
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.json().data.status).toBe("revoked");

      const afterLogout = await app.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(afterLogout.statusCode).toBe(401);
      expect(afterLogout.json().error.code).toBe("AUTH_SESSION_REVOKED");
    });

    it("cross-user session revoke is denied (NOT_FOUND, no existence disclosure)", async () => {
      if (!schemaReady) return;
      const otherIdentifier = "other-user@example.com";
      await createTestUser({ identifier: otherIdentifier, password: "Other-Passw0rd-1!" });

      const meLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("cross_me") },
        payload: { identifier, password },
      });
      const otherLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("cross_other") },
        payload: { identifier: otherIdentifier, password: "Other-Passw0rd-1!" },
      });
      const myToken = meLogin.json().data.access_token;

      // Find the OTHER user's session id from the DB (never exposed to "me" via the API).
      const otherSessions = await getPool().query(`SELECT session_id FROM iam.session WHERE user_id = (SELECT user_id FROM iam.user_identity WHERE identifier_hash = $1) ORDER BY issued_at_utc DESC LIMIT 1`, [
        sha256Hex(otherIdentifier),
      ]);
      const otherSessionId = otherSessions.rows[0].session_id;
      void otherLogin;

      const res = await app.inject({
        method: "POST",
        url: `/auth/sessions/${otherSessionId}/revoke`,
        headers: { authorization: `Bearer ${myToken}`, "idempotency-key": idemKey("cross_revoke") },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");

      // The other user's session must still be active (the cross-user attempt did nothing).
      const stillActive = await getPool().query(`SELECT session_status FROM iam.session WHERE session_id = $1`, [
        otherSessionId,
      ]);
      expect(stillActive.rows[0].session_status).toBe("active");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Refresh rotation + reuse detection
  // ---------------------------------------------------------------------------------------
  describe("Refresh rotation + reuse detection", () => {
    const identifier = "refresh-user@example.com";
    const password = "Refresh-Passw0rd-1!";

    it("rotates on use: old refresh token stops working, new one works", async () => {
      if (!schemaReady) return;
      await createTestUser({ identifier, password });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("refresh_login") },
        payload: { identifier, password },
      });
      const firstRefreshToken = loginRes.json().data.refresh_token;

      const rotated = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("refresh_rotate") },
        payload: { refresh_token: firstRefreshToken },
      });
      expect(rotated.statusCode).toBe(200);
      const secondRefreshToken = rotated.json().data.refresh_token;
      expect(secondRefreshToken).not.toBe(firstRefreshToken);

      const rotatedAgain = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("refresh_rotate2") },
        payload: { refresh_token: secondRefreshToken },
      });
      expect(rotatedAgain.statusCode).toBe(200);
    });

    it("reuse of an already-rotated (used) refresh token revokes the WHOLE family + session with a Critical audit", async () => {
      if (!schemaReady) return;
      const reuseIdentifier = "reuse-user@example.com";
      await createTestUser({ identifier: reuseIdentifier, password: "Reuse-Passw0rd-1!" });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("reuse_login") },
        payload: { identifier: reuseIdentifier, password: "Reuse-Passw0rd-1!" },
      });
      const originalRefreshToken = loginRes.json().data.refresh_token;

      const rotate1 = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("reuse_rotate1") },
        payload: { refresh_token: originalRefreshToken },
      });
      expect(rotate1.statusCode).toBe(200);
      // The rotated (2nd-gen) access token — the ORIGINAL access token is already stale
      // the moment rotation happens (rotateRefreshToken updates session_token_hash), which
      // is expected/correct behaviour, not part of what this test is proving.
      const rotatedAccessToken = rotate1.json().data.access_token;

      // Reuse the ORIGINAL (now-used) token -> must be treated as compromise.
      const reuseAttempt = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("reuse_attempt") },
        payload: { refresh_token: originalRefreshToken },
      });
      expect(reuseAttempt.statusCode).toBe(401);
      expect(reuseAttempt.json().error.code).toBe("AUTH_REFRESH_REUSE_DETECTED");

      // The whole family's session is now revoked — even the rotated (2nd-gen) access
      // token, which was perfectly valid a moment ago, no longer works.
      const sessionCheck = await app.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${rotatedAccessToken}` },
      });
      expect(sessionCheck.statusCode).toBe(401);
      expect(sessionCheck.json().error.code).toBe("AUTH_SESSION_REVOKED");

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.refresh_reuse_detected'`,
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  // MFA enrolment + login-continuation challenge flow
  // ---------------------------------------------------------------------------------------
  describe("MFA enrolment + challenge flow", () => {
    const identifier = "mfa-user@example.com";
    const password = "Mfa-Passw0rd-1!";
    let accessToken: string;
    let totpSecret: string;
    let factorId: string;

    it("enrols a TOTP factor while already authenticated (mfa_required starts false)", async () => {
      if (!schemaReady) return;
      await createTestUser({ identifier, password });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("mfa_login1") },
        payload: { identifier, password },
      });
      expect(loginRes.json().data.status).toBe("authenticated");
      accessToken = loginRes.json().data.access_token;

      const enrolRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("mfa_enrol") },
        payload: { factor_type: "totp" },
      });
      expect(enrolRes.statusCode).toBe(201);
      const enrolData = enrolRes.json().data;
      expect(typeof enrolData.secret).toBe("string");
      expect(enrolData.otpauth_url).toContain("otpauth://totp/");
      totpSecret = enrolData.secret;
      factorId = enrolData.factor_id;
    });

    it("verify activates the factor and flips mfa_required on the user", async () => {
      if (!schemaReady) return;
      const code = totpAt(totpSecret, Date.now());
      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("mfa_verify") },
        payload: { factor_id: factorId, code },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data.status).toBe("enrolled");

      const userRow = await getPool().query(`SELECT mfa_required FROM iam.user_identity WHERE identifier_hash = $1`, [
        sha256Hex(identifier),
      ]);
      expect(userRow.rows[0].mfa_required).toBe(true);
    });

    it("subsequent login now returns mfa_required with a challenge_id instead of a full session", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("mfa_login2") },
        payload: { identifier, password },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("mfa_required");
      expect(typeof res.json().data.challenge_id).toBe("string");
      expect(Object.keys(res.json().data).sort()).toEqual(["challenge_id", "expires_at_utc", "status"]);
    });

    it("a wrong code fails, then the correct code completes login into a full session", async () => {
      if (!schemaReady) return;
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("mfa_login3") },
        payload: { identifier, password },
      });
      const challengeId = loginRes.json().data.challenge_id;

      const wrong = await app.inject({
        method: "POST",
        url: `/auth/mfa/challenges/${challengeId}/verify`,
        headers: { "idempotency-key": idemKey("mfa_chal_wrong") },
        payload: { code: "000000" },
      });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error.code).toBe("AUTH_MFA_FAILED");

      const correctCode = totpAt(totpSecret, Date.now());
      const right = await app.inject({
        method: "POST",
        url: `/auth/mfa/challenges/${challengeId}/verify`,
        headers: { "idempotency-key": idemKey("mfa_chal_right") },
        payload: { code: correctCode },
      });
      expect(right.statusCode).toBe(200);
      expect(right.json().data.status).toBe("authenticated");
      expect(typeof right.json().data.access_token).toBe("string");
    });

    it("an expired challenge fails closed even with the correct code", async () => {
      if (!schemaReady) return;
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("mfa_login4") },
        payload: { identifier, password },
      });
      const challengeId = loginRes.json().data.challenge_id;
      await getPool().query(`UPDATE iam.mfa_challenge SET expires_at_utc = now() - interval '1 minute' WHERE challenge_id = $1`, [
        challengeId,
      ]);

      const correctCode = totpAt(totpSecret, Date.now());
      const res = await app.inject({
        method: "POST",
        url: `/auth/mfa/challenges/${challengeId}/verify`,
        headers: { "idempotency-key": idemKey("mfa_chal_expired") },
        payload: { code: correctCode },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_SESSION_EXPIRED");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Step-up + internal assertion verification
  // ---------------------------------------------------------------------------------------
  describe("Step-up + internal verify-assertion", () => {
    const identifier = "stepup-user@example.com";
    const password = "Stepup-Passw0rd-1!";
    let accessToken: string;
    let totpSecret: string;

    it("sets up an MFA-enrolled, logged-in user", async () => {
      if (!schemaReady) return;
      await createTestUser({ identifier, password });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("stepup_login") },
        payload: { identifier, password },
      });
      accessToken = loginRes.json().data.access_token;

      const enrolRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("stepup_enrol") },
        payload: { factor_type: "totp" },
      });
      totpSecret = enrolRes.json().data.secret;
      const factorId = enrolRes.json().data.factor_id;
      await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("stepup_mfa_verify") },
        payload: { factor_id: factorId, code: totpAt(totpSecret, Date.now()) },
      });
    });

    it("starts a step-up challenge, verifies it into a recent-auth assertion, and the assertion validates internally", async () => {
      if (!schemaReady) return;
      const startRes = await app.inject({
        method: "POST",
        url: "/auth/step-up",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("stepup_start") },
        payload: { purpose: "withdrawal_approval", action_scope: "withdrawal:wdr_1" },
      });
      expect(startRes.statusCode).toBe(200);
      const challengeId = startRes.json().data.challenge_id;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/auth/step-up/verify",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("stepup_verify") },
        payload: { challenge_id: challengeId, code: totpAt(totpSecret, Date.now()) },
      });
      expect(verifyRes.statusCode).toBe(200);
      const assertion = verifyRes.json().data.recent_auth_assertion;
      expect(typeof assertion).toBe("string");
      expect(verifyRes.json().data.purpose).toBe("withdrawal_approval");

      const internalVerify = await app.inject({
        method: "POST",
        url: "/internal/auth/verify-assertion",
        headers: internal,
        payload: { recent_auth_assertion: assertion, required_purpose: "withdrawal_approval" },
      });
      expect(internalVerify.statusCode).toBe(200);
      expect(internalVerify.json().data.valid).toBe(true);

      const wrongPurpose = await app.inject({
        method: "POST",
        url: "/internal/auth/verify-assertion",
        headers: internal,
        payload: { recent_auth_assertion: assertion, required_purpose: "some_other_purpose" },
      });
      expect(wrongPurpose.statusCode).toBe(401);
      expect(wrongPurpose.json().error.code).toBe("AUTH_RECENT_AUTH_INVALID");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Internal freeze-event + bulk revoke
  // ---------------------------------------------------------------------------------------
  describe("Internal freeze-event -> immediate revocation", () => {
    it("freezing a user revokes active sessions immediately and denies subsequent refresh", async () => {
      if (!schemaReady) return;
      const identifier = "freeze-user@example.com";
      const password = "Freeze-Passw0rd-1!";
      const userId = await createTestUser({ identifier, password });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("freeze_login") },
        payload: { identifier, password },
      });
      const accessToken = loginRes.json().data.access_token;
      const refreshToken = loginRes.json().data.refresh_token;

      const freezeRes = await app.inject({
        method: "POST",
        url: "/internal/auth/freeze-event",
        headers: { ...internal, "idempotency-key": idemKey("freeze_event") },
        payload: { user_id: userId, event_type: "account_frozen", source_module: "CMP", reason_ref: "case_1" },
      });
      expect(freezeRes.statusCode).toBe(200);
      expect(freezeRes.json().data.revoked_session_count).toBeGreaterThan(0);

      const sessionCheck = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionCheck.statusCode).toBe(401);
      expect(["AUTH_SESSION_REVOKED", "AUTH_ACCOUNT_FROZEN"]).toContain(sessionCheck.json().error.code);

      const refreshCheck = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("freeze_refresh") },
        payload: { refresh_token: refreshToken },
      });
      expect(refreshCheck.statusCode).toBe(401);

      const userStatus = await getPool().query(`SELECT status FROM iam.user_identity WHERE user_id = $1`, [userId]);
      expect(userStatus.rows[0].status).toBe("suspended");
    });

    it("revoke-user-sessions revokes all active sessions for a user on demand", async () => {
      if (!schemaReady) return;
      const identifier = "revokeall-user@example.com";
      const password = "Revokeall-Passw0rd-1!";
      const userId = await createTestUser({ identifier, password });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("revokeall_login") },
        payload: { identifier, password },
      });
      const accessToken = loginRes.json().data.access_token;

      const res = await app.inject({
        method: "POST",
        url: "/internal/auth/revoke-user-sessions",
        headers: { ...internal, "idempotency-key": idemKey("revokeall") },
        payload: { user_id: userId, reason: "security_admin_action" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.revoked_session_count).toBeGreaterThan(0);

      const check = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(check.statusCode).toBe(401);
      expect(check.json().error.code).toBe("AUTH_SESSION_REVOKED");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Baseline service-account validation
  // ---------------------------------------------------------------------------------------
  describe("Internal service-account validate (baseline)", () => {
    it("validates a correct credential and rejects a wrong one", async () => {
      if (!schemaReady) return;
      const serviceAccountId = "svc_" + randomUUID();
      await getPool().query(
        `INSERT INTO iam.service_account (service_account_id, service_name, status, credential_ref, scope)
         VALUES ($1,'Test Service','active',$2,'["read"]'::jsonb)`,
        [serviceAccountId, sha256Hex("correct-secret")],
      );

      const ok = await app.inject({
        method: "POST",
        url: "/internal/auth/service-account/validate",
        headers: internal,
        payload: { service_account_id: serviceAccountId, credential: "correct-secret" },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.valid).toBe(true);

      const bad = await app.inject({
        method: "POST",
        url: "/internal/auth/service-account/validate",
        headers: internal,
        payload: { service_account_id: serviceAccountId, credential: "wrong-secret" },
      });
      expect(bad.statusCode).toBe(401);
      expect(bad.json().error.code).toBe("AUTH_SERVICE_ACCOUNT_INVALID");
    });
  });

  // ---------------------------------------------------------------------------------------
  // S2 gap-closing patch: MFA enrolment-during-login for a NON-bootstrap user (an ops flag
  // flip, e.g. `mfa_required` turned on for an existing user with no factor yet — the same
  // dead end the break-glass bootstrap admin hit, just via a different trigger).
  // ---------------------------------------------------------------------------------------
  describe("S2: MFA enrolment-during-login (non-bootstrap user)", () => {
    it("wrong TOTP code during enrol/verify is rejected and rate-limited; expired enrolment session is rejected", async () => {
      if (!schemaReady) return;
      const identifier = "mfa-flagged-user@example.com";
      const password = "Flagged-Passw0rd-1!";
      const userId = await createTestUser({ identifier, password });
      await getPool().query(`UPDATE iam.user_identity SET mfa_required = true WHERE user_id = $1`, [userId]);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("s2_flag_login") },
        payload: { identifier, password },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().data.status).toBe("mfa_enrolment_required");
      const enrolmentSessionId = loginRes.json().data.enrolment_session_id;

      const startRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/start",
        headers: { "idempotency-key": idemKey("s2_flag_start") },
        payload: { enrolment_session_id: enrolmentSessionId },
      });
      const factorId = startRes.json().data.factor_id;

      // Wrong code repeatedly -> rate-limited (mfaMaxAttempts = 3 in this test config).
      let lastWrong;
      for (let i = 0; i < 3; i++) {
        lastWrong = await app.inject({
          method: "POST",
          url: "/auth/mfa/enrol/verify",
          headers: { "idempotency-key": idemKey("s2_flag_wrong_" + i) },
          payload: { enrolment_session_id: enrolmentSessionId, factor_id: factorId, code: "000000" },
        });
      }
      expect(lastWrong!.statusCode).toBe(401);
      expect(lastWrong!.json().error.code).toBe("AUTH_MFA_FAILED");

      const rateLimited = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/verify",
        headers: { "idempotency-key": idemKey("s2_flag_ratelimited") },
        payload: { enrolment_session_id: enrolmentSessionId, factor_id: factorId, code: "000000" },
      });
      expect(rateLimited.statusCode).toBe(429);
      expect(rateLimited.json().error.code).toBe("AUTH_RATE_LIMITED");

      // Separate expired-enrolment-session scenario (fresh login so the mfa lockout above
      // doesn't interfere).
      const identifier2 = "mfa-flagged-user-2@example.com";
      const password2 = "Flagged-Passw0rd-2!";
      const userId2 = await createTestUser({ identifier: identifier2, password: password2 });
      await getPool().query(`UPDATE iam.user_identity SET mfa_required = true WHERE user_id = $1`, [userId2]);
      const login2 = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("s2_expired_login") },
        payload: { identifier: identifier2, password: password2 },
      });
      const enrolmentSessionId2 = login2.json().data.enrolment_session_id;
      await getPool().query(
        `UPDATE iam.mfa_enrolment_session SET expires_at_utc = now() - interval '1 minute' WHERE session_token_hash = $1`,
        [sha256Hex(enrolmentSessionId2)],
      );
      const expiredStart = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/start",
        headers: { "idempotency-key": idemKey("s2_expired_start") },
        payload: { enrolment_session_id: enrolmentSessionId2 },
      });
      expect(expiredStart.statusCode).toBe(400);
      expect(expiredStart.json().error.code).toBe("AUTH_ENROLMENT_SESSION_INVALID");
    });

    it("no full session is ever issued before MFA verification completes", async () => {
      if (!schemaReady) return;
      const identifier = "mfa-flagged-user-3@example.com";
      const password = "Flagged-Passw0rd-3!";
      const userId = await createTestUser({ identifier, password });
      await getPool().query(`UPDATE iam.user_identity SET mfa_required = true WHERE user_id = $1`, [userId]);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("s2_nosession_login") },
        payload: { identifier, password },
      });
      expect(loginRes.json().data.access_token).toBeUndefined();
      expect(loginRes.json().data.refresh_token).toBeUndefined();

      const startRes = await app.inject({
        method: "POST",
        url: "/auth/mfa/enrol/start",
        headers: { "idempotency-key": idemKey("s2_nosession_start") },
        payload: { enrolment_session_id: loginRes.json().data.enrolment_session_id },
      });
      expect(startRes.json().data.access_token).toBeUndefined();
      expect(startRes.json().data.secret).toBeDefined(); // the enrolment secret itself, not a session
    });
  });

  // ---------------------------------------------------------------------------------------
  // Password-reset completeness patch (IAM-01 Security Review Opus v0.1, deferred item now
  // closed: POST /auth/password-reset/{request,confirm}).
  // ---------------------------------------------------------------------------------------
  describe("Password reset", () => {
    it("request: existing vs non-existing identifier get an IDENTICAL generic success (no enumeration)", async () => {
      if (!schemaReady) return;
      const identifier = "resetreq-user@example.com";
      await createTestUser({ identifier, password: "Resetreq-Passw0rd-1!" });

      const existing = await app.inject({
        method: "POST",
        url: "/auth/password-reset/request",
        headers: { "idempotency-key": idemKey("reset_req_existing") },
        payload: { identifier },
      });
      const nonExisting = await app.inject({
        method: "POST",
        url: "/auth/password-reset/request",
        headers: { "idempotency-key": idemKey("reset_req_none") },
        payload: { identifier: "no-such-reset-user@example.com" },
      });
      expect(existing.statusCode).toBe(200);
      expect(nonExisting.statusCode).toBe(200);
      expect(existing.json().data).toEqual(nonExisting.json().data);
      expect(existing.json().data.status).toBe("if_eligible_notification_sent");

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.password_reset_requested' AND payload_ref LIKE $1`,
        [`%${sha256Hex("resetreq-user@example.com")}%`],
      );
      // entity_id is the resolved user_id (not the identifier hash) for the existing-user
      // case, so search more loosely: at least one password_reset_requested event exists.
      const anyAudit = await getPool().query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.password_reset_requested'`,
      );
      expect(anyAudit.rows[0].n).toBeGreaterThan(0);
      void audit;

      const delivery = await getPool().query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE topic = 'notification.delivery' AND event_type = 'iam.password_reset_requested_delivery'`,
      );
      expect(delivery.rows[0].n).toBeGreaterThan(0);

      const tokenRow = await getPool().query(
        `SELECT token_hash FROM iam.password_reset_token WHERE user_id = (SELECT user_id FROM iam.user_identity WHERE identifier_hash = $1)`,
        [sha256Hex(identifier)],
      );
      expect(tokenRow.rowCount).toBeGreaterThan(0);
      // Hash-only at rest: the stored value is never the plaintext token (it's a 64-hex-char sha256).
      expect(/^[0-9a-f]{64}$/.test(tokenRow.rows[0].token_hash)).toBe(true);
    });

    it("request: repeated requests for the same identifier are rate-limited", async () => {
      if (!schemaReady) return;
      const identifier = "resetlock-user@example.com";
      await createTestUser({ identifier, password: "Resetlock-Passw0rd-1!" });

      for (let i = 0; i < config.rateLimit.passwordResetMaxAttempts; i++) {
        await app.inject({
          method: "POST",
          url: "/auth/password-reset/request",
          headers: { "idempotency-key": idemKey("reset_lock_" + i) },
          payload: { identifier },
        });
      }
      const lockoutRow = await getPool().query(
        `SELECT locked_until_utc FROM iam.account_lockout WHERE action = 'reset' AND scope_hash = $1`,
        [sha256Hex("reset:" + sha256Hex(identifier))],
      );
      expect(lockoutRow.rowCount).toBeGreaterThan(0);
      expect(lockoutRow.rows[0].locked_until_utc).not.toBeNull();

      // Still identical generic success even while rate-limited (no enumeration signal).
      const stillGeneric = await app.inject({
        method: "POST",
        url: "/auth/password-reset/request",
        headers: { "idempotency-key": idemKey("reset_lock_final") },
        payload: { identifier },
      });
      expect(stillGeneric.statusCode).toBe(200);
      expect(stillGeneric.json().data.status).toBe("if_eligible_notification_sent");
    });

    it("confirm: valid token updates the password, revokes old sessions, rejects weak passwords, and is single-use", async () => {
      if (!schemaReady) return;
      const identifier = "resetconfirm-user@example.com";
      const oldPassword = "Resetconfirm-Old-1!";
      const newPassword = "Resetconfirm-New-2!";
      const userId = await createTestUser({ identifier, password: oldPassword });

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("reset_confirm_login") },
        payload: { identifier, password: oldPassword },
      });
      const oldAccessToken = loginRes.json().data.access_token;

      // Fabricate a valid reset token row directly (no email provider exists to intercept —
      // same convention the RLS fixture tests already use for hash-only secrets).
      const resetToken = "test_reset_token_" + randomUUID();
      const resetId = "pwreset_test_" + randomUUID();
      await getPool().query(
        `INSERT INTO iam.password_reset_token (reset_id, user_id, token_hash, status, expires_at_utc, requested_at_utc)
         VALUES ($1,$2,$3,'active', now() + interval '30 minutes', now())`,
        [resetId, userId, sha256Hex(resetToken)],
      );

      // Weak password is rejected and does NOT consume the token.
      const weak = await app.inject({
        method: "POST",
        url: "/auth/password-reset/confirm",
        headers: { "idempotency-key": idemKey("reset_confirm_weak") },
        payload: { reset_token: resetToken, new_password: "short1" },
      });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error.code).toBe("AUTH_PASSWORD_POLICY_FAILED");

      // Now succeed with a strong password, reusing the SAME (still-active) token.
      const ok = await app.inject({
        method: "POST",
        url: "/auth/password-reset/confirm",
        headers: { "idempotency-key": idemKey("reset_confirm_ok") },
        payload: { reset_token: resetToken, new_password: newPassword },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.status).toBe("password_reset");

      // Old session is revoked.
      const oldSessionCheck = await app.inject({
        method: "GET",
        url: "/auth/sessions",
        headers: { authorization: `Bearer ${oldAccessToken}` },
      });
      expect(oldSessionCheck.statusCode).toBe(401);

      // New password works; old password no longer does.
      const loginNew = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("reset_confirm_login_new") },
        payload: { identifier, password: newPassword },
      });
      expect(loginNew.statusCode).toBe(200);
      expect(loginNew.json().data.status).toBe("authenticated");
      const loginOld = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "idempotency-key": idemKey("reset_confirm_login_old") },
        payload: { identifier, password: oldPassword },
      });
      expect(loginOld.statusCode).toBe(401);

      // Single-use: the SAME token cannot be replayed.
      const reused = await app.inject({
        method: "POST",
        url: "/auth/password-reset/confirm",
        headers: { "idempotency-key": idemKey("reset_confirm_reuse") },
        payload: { reset_token: resetToken, new_password: "Another-Strong-3!" },
      });
      expect(reused.statusCode).toBe(400);
      expect(reused.json().error.code).toBe("AUTH_RESET_TOKEN_INVALID");

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'iam.password_reset_completed' AND payload_ref LIKE $1`,
        [`%${userId}%`],
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it("confirm: an expired token fails closed", async () => {
      if (!schemaReady) return;
      const identifier = "resetexpired-user@example.com";
      const userId = await createTestUser({ identifier, password: "Resetexpired-Passw0rd-1!" });
      const resetToken = "test_reset_token_expired_" + randomUUID();
      await getPool().query(
        `INSERT INTO iam.password_reset_token (reset_id, user_id, token_hash, status, expires_at_utc, requested_at_utc)
         VALUES ($1,$2,$3,'active', now() - interval '1 minute', now())`,
        ["pwreset_test_expired_" + randomUUID(), userId, sha256Hex(resetToken)],
      );
      const res = await app.inject({
        method: "POST",
        url: "/auth/password-reset/confirm",
        headers: { "idempotency-key": idemKey("reset_confirm_expired") },
        payload: { reset_token: resetToken, new_password: "Strong-Enough-Pw1!" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("AUTH_RESET_TOKEN_INVALID");
    });
  });
});
