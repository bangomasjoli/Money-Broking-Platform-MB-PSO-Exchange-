/**
 * IAM-01 — Internal Session Introspection seam acceptance suite (WLT-01 BLOCKER-1 prerequisite,
 * Opus architecture "IAM-01 SESSION INTROSPECTION: ACCEPTED FOR IMPLEMENTATION").
 *
 * Covers, in order: (1) a static source-text guard proving `routes/internal.ts`'s new route
 * reuses `validateAccessToken` verbatim rather than reimplementing hashing/lookup/status logic
 * (mirrors `tests/unit/wlt1-screening-composition-boundary.test.ts`'s own technique — a plain
 * comment-stripped substring scan, not an AST); (2) `loadIamConfig`'s
 * `IAM_INTROSPECTION_SERVICE_TOKEN` validation (pure function, no DB); (3) `IAM_LOG_REDACT_PATHS`
 * structural pin (mirrors `tests/unit/clt1-log-redaction.test.ts`'s own shape); (4) the full
 * DB-gated acceptance matrix.
 *
 * The DB-gated block self-skips unless `TEST_DATABASE_URL` points at a Postgres already migrated
 * with the `foundation`/`iam` schemas — mirrors `tests/integration/iam-db.test.ts`'s own
 * convention exactly (see that file's header for the VERIFY prerequisites).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppError, closePool, getPool, initPool, type RawEnv } from "@aix/foundation";
import { loadIamConfig, type IamConfig } from "../../services/iam/src/config.js";
import { buildApp, IAM_LOG_REDACT_PATHS } from "../../services/iam/src/server.js";
import { hashPassword } from "../../services/iam/src/lib/password.js";
import { sha256Hex } from "../../services/iam/src/lib/session.js";

const REPO_ROOT = join(__dirname, "..", "..");
const TEST_DB = process.env.TEST_DATABASE_URL;
const INTROSPECTION_ROUTE = "/internal/auth/session/validate";

// -------------------------------------------------------------------------------------------
// (1) Source-text reuse guard — no DB required. Proves the new route's OWN handler segment
// calls `validateAccessToken` and does not independently reimplement hashing, the pre-auth
// SQL resolver, the `last_seen` touch, or a hand-rolled status/expiry comparison. Scoped to the
// substring of `internal.ts` FROM the route's own path literal onward (the new route is
// registered last in the file) so this does not false-positive on `sha256Hex` — legitimately
// used by the pre-existing, unrelated `service-account/validate` route earlier in the same file.
// -------------------------------------------------------------------------------------------
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const internalRoutesContent = stripComments(
  readFileSync(join(REPO_ROOT, "services", "iam", "src", "routes", "internal.ts"), "utf8"),
);
const routeMarkerIdx = internalRoutesContent.indexOf(`"${INTROSPECTION_ROUTE}"`);
const handlerSegment = routeMarkerIdx > -1 ? internalRoutesContent.slice(routeMarkerIdx) : "";

describe("Internal Session Introspection — source reuse guard (no duplicated validation logic)", () => {
  it("the route registration exists in routes/internal.ts", () => {
    expect(routeMarkerIdx).toBeGreaterThan(-1);
  });

  it("calls validateAccessToken (proves reuse of the canonical session-validation function)", () => {
    expect(handlerSegment).toContain("validateAccessToken(");
  });

  it("does not independently hash the presented token (no sha256Hex call in the new route's own handler segment — the earlier occurrence belongs to the pre-existing service-account route)", () => {
    expect(handlerSegment).not.toContain("sha256Hex(");
  });

  it("does not independently call the pre-auth SQL resolver function", () => {
    expect(handlerSegment).not.toContain("fn_resolve_session_by_token_hash");
  });

  it("does not independently touch last_seen (stays validateAccessToken's own responsibility)", () => {
    expect(handlerSegment).not.toContain("fn_touch_session_last_seen");
  });

  it("does not independently re-implement a session_status/expiry comparison", () => {
    expect(/session_status\s*(===|!==|==)/.test(handlerSegment)).toBe(false);
    expect(/expires_at_utc[\s\S]{0,60}Date\.now\(\)/.test(handlerSegment)).toBe(false);
  });

  it("collapses via SESSION_VALIDATION_NEGATIVE_CODES rather than an independently re-derived code list", () => {
    expect(handlerSegment).toContain("SESSION_VALIDATION_NEGATIVE_CODES");
  });
});

// -------------------------------------------------------------------------------------------
// (2) loadIamConfig — IAM_INTROSPECTION_SERVICE_TOKEN validation. Pure function, no DB.
// -------------------------------------------------------------------------------------------
const validEnv: RawEnv = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
  IAM_INTERNAL_SERVICE_TOKEN: "test-internal-token-config-check",
  IAM_INTROSPECTION_SERVICE_TOKEN: "test-introspection-token-config-check",
};

function configErrorIssues(env: RawEnv): string[] {
  try {
    loadIamConfig(env);
    return [];
  } catch (err) {
    if (err instanceof AppError && err.code === "CONFIGURATION_INVALID") {
      return err.details.map((d) => d.issue ?? "");
    }
    throw err;
  }
}

describe("loadIamConfig — IAM_INTROSPECTION_SERVICE_TOKEN (K. CONFIG)", () => {
  it("a fully valid env loads without throwing, and the value is carried through", () => {
    const cfg = loadIamConfig(validEnv);
    expect(cfg.iamIntrospectionServiceToken).toBe("test-introspection-token-config-check");
  });

  it("missing IAM_INTROSPECTION_SERVICE_TOKEN -> CONFIGURATION_INVALID", () => {
    const { IAM_INTROSPECTION_SERVICE_TOKEN: _omit, ...env } = validEnv;
    const issues = configErrorIssues(env);
    expect(issues.some((i) => i.includes("IAM_INTROSPECTION_SERVICE_TOKEN"))).toBe(true);
  });

  it("empty IAM_INTROSPECTION_SERVICE_TOKEN -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, IAM_INTROSPECTION_SERVICE_TOKEN: "   " });
    expect(issues.some((i) => i.includes("IAM_INTROSPECTION_SERVICE_TOKEN"))).toBe(true);
  });

  it("IAM_INTROSPECTION_SERVICE_TOKEN identical to IAM_INTERNAL_SERVICE_TOKEN -> CONFIGURATION_INVALID (must differ)", () => {
    const issues = configErrorIssues({ ...validEnv, IAM_INTROSPECTION_SERVICE_TOKEN: validEnv.IAM_INTERNAL_SERVICE_TOKEN });
    expect(issues.some((i) => i.includes("must differ"))).toBe(true);
  });

  it("a distinct valid value succeeds with no default ever silently applied", () => {
    const cfg = loadIamConfig({ ...validEnv, IAM_INTROSPECTION_SERVICE_TOKEN: "another-distinct-valid-token-value" });
    expect(cfg.iamIntrospectionServiceToken).toBe("another-distinct-valid-token-value");
  });
});

// -------------------------------------------------------------------------------------------
// (3) IAM_LOG_REDACT_PATHS — structural pin, mirrors tests/unit/clt1-log-redaction.test.ts.
// -------------------------------------------------------------------------------------------
describe("IAM_LOG_REDACT_PATHS", () => {
  it("redacts req.body.access_token (the introspected client bearer token)", () => {
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.access_token");
  });

  it("every pre-existing redaction path is preserved", () => {
    expect(IAM_LOG_REDACT_PATHS).toContain("req.headers.authorization");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.password");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.new_password");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.refresh_token");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.code_or_assertion");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.code");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.recent_auth_assertion");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.credential");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.reset_token");
    expect(IAM_LOG_REDACT_PATHS).toContain("req.body.enrolment_session_id");
  });

  it("has exactly the expected entries — no unexpected additions or omissions", () => {
    expect(IAM_LOG_REDACT_PATHS).toEqual([
      "req.headers.authorization",
      "req.headers['x-internal-service-token']",
      "req.body.password",
      "req.body.new_password",
      "req.body.refresh_token",
      "req.body.code_or_assertion",
      "req.body.code",
      "req.body.recent_auth_assertion",
      "req.body.credential",
      "req.body.reset_token",
      "req.body.enrolment_session_id",
      "req.body.access_token",
    ]);
  });
});

// -------------------------------------------------------------------------------------------
// (4) Full DB-gated acceptance matrix.
// -------------------------------------------------------------------------------------------
const config: IamConfig = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-fnd-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-introspect-it",
  artifactHash: "sha256:introspect-it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iamInternalServiceToken: "test-iam-internal-token-introspect-it",
  iamIntrospectionServiceToken: "test-iam-introspection-token-introspect-it",
  bootstrapEnabled: false,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 1_209_600,
  mfaSecretEncryptionKey: "test-mfa-secret-enc-key-introspect-it-not-for-prod",
  rateLimit: {
    loginMaxAttempts: 5,
    loginLockoutMinutes: 15,
    mfaMaxAttempts: 5,
    mfaLockoutMinutes: 15,
    passwordResetMaxAttempts: 5,
    passwordResetLockoutMinutes: 30,
    refreshMaxAttempts: 20,
    refreshLockoutMinutes: 15,
  },
};

const internalHeaders = { "x-internal-service-token": config.iamInternalServiceToken };
const introspectionHeaders = { "x-internal-service-token": config.iamIntrospectionServiceToken };

function idemKey(label: string): string {
  return `it_intro_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Every test-created user identifier is suffixed uniquely so this suite is safely re-runnable
 * against a persistent (non-disposable) TEST_DATABASE_URL — `iam.user_identity.identifier_hash`
 * is UNIQUE, so a static literal re-run twice against the same DB would collide. */
function uniqueIdentifier(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Strips the per-request-unique envelope fields before a deep-equality comparison across
 * distinct negative-collapse cases — request_id/correlation_id/server_time_utc are intentionally
 * unique per request and must not make an otherwise-identical body compare unequal. */
function stripEnvelope(body: Record<string, unknown>): Record<string, unknown> {
  const { request_id: _r, correlation_id: _c, server_time_utc: _s, ...rest } = body;
  return rest;
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

/** `pg` returns `timestamptz` columns as `Date` objects (or `null`), not strings — despite the
 * `string | null` row typing used for convenience above. `.toBe()` (Object.is) fails on two
 * distinct Date instances even when they represent the identical instant, so every
 * timestamp-equality assertion below goes through this instead. */
function sameInstant(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a as string).getTime() === new Date(b as string).getTime();
}

async function loginAndGetTokens(
  fastify: FastifyInstance,
  identifier: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const res = await fastify.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "idempotency-key": idemKey("login") },
    payload: { identifier, password },
  });
  expect(res.statusCode).toBe(200);
  const accessToken = res.json().data.access_token as string;
  const refreshToken = res.json().data.refresh_token as string;
  const sessionRow = await getPool().query<{ session_id: string }>(
    `SELECT session_id FROM iam.session WHERE session_token_hash = $1`,
    [sha256Hex(accessToken)],
  );
  return { accessToken, refreshToken, sessionId: sessionRow.rows[0]!.session_id };
}

let schemaReady = false;
let app: FastifyInstance;

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

describe.skipIf(!TEST_DB)("IAM-01 Internal Session Introspection (DB)", () => {
  beforeAll(async () => {
    initPool(config.databaseUrl);
    schemaReady = await schemasExist();
    if (!schemaReady) return;
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
  });

  // -----------------------------------------------------------------------------------------
  // A. ROUTE INVENTORY
  // -----------------------------------------------------------------------------------------
  describe("A. route inventory", () => {
    it("POST /internal/auth/session/validate exists and is guarded (no header -> SERVICE_IDENTITY_REQUIRED, never 404)", async () => {
      // Fail-loud DB-readiness canary (H-D3C-1 convention — mirrors iam-db.test.ts/iam2-db.test.ts/
      // sec1-db.test.ts/cfg1-db.test.ts/aml1-db.test.ts/wlt1-db.test.ts's own first-test guard
      // exactly): every OTHER test in this file below uses a plain `if (!schemaReady) return;`
      // silent early-return, which would make the whole suite report a false green if the DB is
      // unmigrated. This ONE test — the first in the file — replaces that with a real failing
      // assertion instead, so an unmigrated/ungranted database makes the suite fail loudly rather
      // than silently reporting every DB-gated test as passed-by-skip.
      if (!schemaReady) return expect(schemaReady, "run migrate:up + iam_runtime_grants.sql first").toBe(true);
      // Body schema validation runs BEFORE preHandler (established platform convention — see
      // e.g. wlt1's proof-of-control/verify route comments), so a SCHEMA-VALID body is required
      // to actually reach the guard; an empty {} body would 400 before the guard ever runs.
      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, payload: { access_token: "schema-valid-placeholder" } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("GET/PUT/DELETE on the path all 404", async () => {
      if (!schemaReady) return;
      for (const method of ["GET", "PUT", "DELETE"] as const) {
        const res = await app.inject({ method, url: INTROSPECTION_ROUTE, headers: introspectionHeaders });
        expect(res.statusCode).toBe(404);
      }
    });

    it("no accidental public (non-/internal/) equivalent exists", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/auth/session/validate", payload: {} });
      expect(res.statusCode).toBe(404);
    });

    it("the three pre-existing internal routes remain reachable and guarded exactly as before", async () => {
      if (!schemaReady) return;
      // Schema-valid placeholder bodies — schema validation runs before preHandler, so an
      // empty {} would 400 before ever reaching the guard being tested here.
      const freeze = await app.inject({
        method: "POST",
        url: "/internal/auth/freeze-event",
        payload: { user_id: "u", event_type: "t", source_module: "TEST" },
      });
      expect(freeze.statusCode).toBe(401);
      expect(freeze.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
      const revokeAll = await app.inject({
        method: "POST",
        url: "/internal/auth/revoke-user-sessions",
        payload: { user_id: "u", reason: "r" },
      });
      expect(revokeAll.statusCode).toBe(401);
      const svcAcct = await app.inject({
        method: "POST",
        url: "/internal/auth/service-account/validate",
        payload: { service_account_id: "s", credential: "c" },
      });
      expect(svcAcct.statusCode).toBe(401);
      // The general internal token still opens these three exactly as before (unaffected by the
      // new dedicated introspection guard).
      const freezeWithToken = await app.inject({
        method: "POST",
        url: "/internal/auth/freeze-event",
        headers: { ...internalHeaders, "idempotency-key": idemKey("route_inv_freeze") },
        payload: { user_id: "user_nonexistent", event_type: "t", source_module: "TEST" },
      });
      expect(freezeWithToken.statusCode).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  // B. CALLER AUTHORITY
  // -----------------------------------------------------------------------------------------
  describe("B. caller authority", () => {
    it("blank x-internal-service-token -> SERVICE_IDENTITY_REQUIRED", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: { "x-internal-service-token": "" },
        payload: { access_token: "whatever" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("wrong x-internal-service-token -> SERVICE_IDENTITY_REQUIRED", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: { "x-internal-service-token": "totally-wrong-token" },
        payload: { access_token: "whatever" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("the GENERAL IAM_INTERNAL_SERVICE_TOKEN does NOT open this route (dedicated capability token required)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: internalHeaders,
        payload: { access_token: "whatever" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("the correct dedicated IAM_INTROSPECTION_SERVICE_TOKEN admits the caller (proceeds past the guard into validation, never SERVICE_IDENTITY_REQUIRED)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: "not-a-real-token-but-guard-should-pass" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED"); // not SERVICE_IDENTITY_REQUIRED
    });

    it("a client Authorization bearer cannot substitute for the service credential (guard reads only x-internal-service-token)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("caller-auth-user");
      const password = "Caller-Auth-Passw0rd-1!";
      await createTestUser({ identifier, password });
      const { accessToken } = await loginAndGetTokens(app, identifier, password);

      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: { authorization: `Bearer ${accessToken}` }, // no x-internal-service-token
        payload: { access_token: accessToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("a rejected caller causes no session resolution/touch (last_seen_at_utc unchanged)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("caller-auth-touch-user");
      const password = "Caller-Auth-Touch-1!";
      await createTestUser({ identifier, password });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, password);

      const before = await getPool().query<{ last_seen_at_utc: string | null }>(
        `SELECT last_seen_at_utc FROM iam.session WHERE session_id = $1`,
        [sessionId],
      );

      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: { "x-internal-service-token": "wrong-token" },
        payload: { access_token: accessToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

      const after = await getPool().query<{ last_seen_at_utc: string | null }>(
        `SELECT last_seen_at_utc FROM iam.session WHERE session_id = $1`,
        [sessionId],
      );
      expect(sameInstant(after.rows[0]?.last_seen_at_utc, before.rows[0]?.last_seen_at_utc)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  // C. POSITIVE
  // -----------------------------------------------------------------------------------------
  describe("C. positive", () => {
    it("valid active session -> 200, correct fields, exact allowlist (nothing else)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("positive-user");
      const password = "Positive-Passw0rd-1!";
      const userId = await createTestUser({ identifier, password, userClass: "client" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, password);

      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.valid).toBe(true);
      expect(body.data.user_id).toBe(userId);
      expect(body.data.session_id).toBe(sessionId);
      expect(body.data.user_class).toBe("client");
      expect(Object.keys(body.data).sort()).toEqual(["session_id", "user_class", "user_id", "valid"]);
      // Rejected fields, explicitly absent.
      expect(body.data.expires_at_utc).toBeUndefined();
      expect(body.data.email).toBeUndefined();
      expect(body.data.roles).toBeUndefined();
      expect(body.data.auth_level).toBeUndefined();
      expect(body.data.risk_status).toBeUndefined();
    });

    it("returns the correct user_class for a client_approver session too", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("positive-approver");
      const password = "Positive-Approver-1!";
      await createTestUser({ identifier, password, userClass: "client_approver" });
      const { accessToken } = await loginAndGetTokens(app, identifier, password);

      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.user_class).toBe("client_approver");
    });
  });

  // -----------------------------------------------------------------------------------------
  // D. NEGATIVE COLLAPSE — every negative state must be byte-identical (envelope fields aside).
  // -----------------------------------------------------------------------------------------
  describe("D. negative collapse", () => {
    async function introspect(token: string) {
      return app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: token },
      });
    }

    it("every negative state collapses to byte-identical 401 AUTH_SESSION_REQUIRED bodies", async () => {
      if (!schemaReady) return;

      const cases: Array<{ label: string; token: () => Promise<string> }> = [
        { label: "unknown token", token: async () => "unk_" + randomUUID() },
        { label: "malformed/garbage token", token: async () => "!!!not-base64url-shaped///" },
        {
          label: "expired by session_status",
          token: async () => {
            const identifier = uniqueIdentifier("neg-expired-status");
            await createTestUser({ identifier, password: "Neg-Expired-1!" });
            const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Neg-Expired-1!");
            await getPool().query(`UPDATE iam.session SET session_status = 'expired' WHERE session_id = $1`, [sessionId]);
            return accessToken;
          },
        },
        {
          label: "expired by expires_at_utc elapsed (status still active)",
          token: async () => {
            const identifier = uniqueIdentifier("neg-expired-ts");
            await createTestUser({ identifier, password: "Neg-Expired-Ts-1!" });
            const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Neg-Expired-Ts-1!");
            await getPool().query(`UPDATE iam.session SET expires_at_utc = now() - interval '1 second' WHERE session_id = $1`, [sessionId]);
            return accessToken;
          },
        },
        {
          label: "revoked session",
          token: async () => {
            const identifier = uniqueIdentifier("neg-revoked");
            await createTestUser({ identifier, password: "Neg-Revoked-1!" });
            const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Neg-Revoked-1!");
            await getPool().query(`UPDATE iam.session SET session_status = 'revoked' WHERE session_id = $1`, [sessionId]);
            return accessToken;
          },
        },
        {
          label: "locked user",
          token: async () => {
            const identifier = uniqueIdentifier("neg-locked");
            const userId = await createTestUser({ identifier, password: "Neg-Locked-1!" });
            const { accessToken } = await loginAndGetTokens(app, identifier, "Neg-Locked-1!");
            await getPool().query(`UPDATE iam.user_identity SET status = 'locked' WHERE user_id = $1`, [userId]);
            return accessToken;
          },
        },
        {
          label: "suspended user",
          token: async () => {
            const identifier = uniqueIdentifier("neg-suspended");
            const userId = await createTestUser({ identifier, password: "Neg-Suspended-1!" });
            const { accessToken } = await loginAndGetTokens(app, identifier, "Neg-Suspended-1!");
            await getPool().query(`UPDATE iam.user_identity SET status = 'suspended' WHERE user_id = $1`, [userId]);
            return accessToken;
          },
        },
        {
          label: "deactivated user",
          token: async () => {
            const identifier = uniqueIdentifier("neg-deactivated");
            const userId = await createTestUser({ identifier, password: "Neg-Deactivated-1!" });
            const { accessToken } = await loginAndGetTokens(app, identifier, "Neg-Deactivated-1!");
            await getPool().query(`UPDATE iam.user_identity SET status = 'deactivated' WHERE user_id = $1`, [userId]);
            return accessToken;
          },
        },
      ];

      const bodies: Record<string, unknown>[] = [];
      for (const c of cases) {
        const token = await c.token();
        const res = await introspect(token);
        expect(res.statusCode, `expected 401 for ${c.label}`).toBe(401);
        expect(res.json().error.code, `expected AUTH_SESSION_REQUIRED for ${c.label}`).toBe("AUTH_SESSION_REQUIRED");
        bodies.push(stripEnvelope(res.json()));
      }

      // Every stripped body must be deep-equal — no case leaks a distinguishing detail.
      const first = bodies[0];
      for (let i = 1; i < bodies.length; i++) {
        expect(bodies[i], `case ${i} (${cases[i]!.label}) differs from case 0 (${cases[0]!.label})`).toEqual(first);
      }
    });

    it("the 403 that AUTH_ACCOUNT_FROZEN would produce on /auth/sessions never appears via introspection for the same frozen user", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("neg-frozen-403-check");
      const userId = await createTestUser({ identifier, password: "Neg-Frozen-403-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Neg-Frozen-403-1!");
      await getPool().query(`UPDATE iam.user_identity SET status = 'suspended' WHERE user_id = $1`, [userId]);

      // Canonical path (requireUserSession) DOES surface 403 for a frozen account.
      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(403);
      expect(sessionsRes.json().error.code).toBe("AUTH_ACCOUNT_FROZEN");

      // Introspection collapses the SAME condition to 401, never 403.
      const introspectRes = await introspect(accessToken);
      expect(introspectRes.statusCode).toBe(401);
      expect(introspectRes.json().error.code).toBe("AUTH_SESSION_REQUIRED");
    });
  });

  // -----------------------------------------------------------------------------------------
  // E. VALIDATION
  // -----------------------------------------------------------------------------------------
  describe("E. validation", () => {
    it("absent access_token -> VALIDATION_ERROR (400)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("empty string access_token -> VALIDATION_ERROR (400)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: "" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it(">512 character access_token -> VALIDATION_ERROR (400), value never echoed", async () => {
      if (!schemaReady) return;
      const overlong = "a".repeat(513);
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: overlong },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.json())).not.toContain(overlong);
    });

    it("an additional/unknown field -> VALIDATION_ERROR (400) (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: "some-token", extra_field: "not-allowed" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  // -----------------------------------------------------------------------------------------
  // F. INFRASTRUCTURE FAIL-CLOSED
  // -----------------------------------------------------------------------------------------
  describe("F. infrastructure fail-closed", () => {
    it("a DB pool the app cannot reach -> 503 AUTH_SESSION_INTROSPECTION_UNAVAILABLE, never 200, never a negative-auth 401", async () => {
      if (!schemaReady) return;
      await closePool();
      // Port 1: nothing listens there, so connection fails fast (ECONNREFUSED) rather than
      // hanging on a timeout — this swap is local to THIS test file's own module registry
      // (vitest gives each test file its own fresh import of @aix/foundation), so it cannot
      // affect any other concurrently-running test file's shared pool.
      initPool("postgres://unused:unused@127.0.0.1:1/unreachable-for-test");
      try {
        const res = await app.inject({
          method: "POST",
          url: INTROSPECTION_ROUTE,
          headers: introspectionHeaders,
          payload: { access_token: "irrelevant-value-infra-failure-test" },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("AUTH_SESSION_INTROSPECTION_UNAVAILABLE");
      } finally {
        await closePool();
        initPool(config.databaseUrl);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // G. SECRET HANDLING
  // -----------------------------------------------------------------------------------------
  describe("G. secret handling", () => {
    it("no iam.auth_event row for a denied introspection ever stores the raw token or its SHA-256 hash", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("secret-handling-user");
      const userId = await createTestUser({ identifier, password: "Secret-Handling-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Secret-Handling-1!");
      await getPool().query(`UPDATE iam.user_identity SET status = 'locked' WHERE user_id = $1`, [userId]);

      const res = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(res.statusCode).toBe(401);

      const rows = await getPool().query<{ event_type: string; user_id: string | null }>(
        `SELECT event_type, user_id FROM iam.auth_event WHERE event_type = 'iam.session_introspection_denied' ORDER BY occurred_at_utc DESC LIMIT 5`,
      );
      expect(rows.rowCount).toBeGreaterThan(0);
      const dump = JSON.stringify(rows.rows);
      expect(dump).not.toContain(accessToken);
      expect(dump).not.toContain(sha256Hex(accessToken));
      // userId is deliberately null on this event (no identity is asserted for a denied check).
      expect(rows.rows.every((r) => r.user_id === null)).toBe(true);
    });

    it("no SEC-01/business audit event exists for this route at all (audit event delta: 0)", async () => {
      if (!schemaReady) return;
      const before = await getPool().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type LIKE 'iam.session_introspection%'`,
      );
      expect(before.rows[0]!.n).toBe("0");

      const identifier = uniqueIdentifier("no-business-audit-user");
      await createTestUser({ identifier, password: "No-Business-Audit-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "No-Business-Audit-1!");
      await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });

      const after = await getPool().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type LIKE 'iam.session_introspection%'`,
      );
      expect(after.rows[0]!.n).toBe("0");
    });

    it("no idempotency record is ever created (this route accepts no Idempotency-Key and calls no beginIdempotent)", async () => {
      if (!schemaReady) return;
      const before = await getPool().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM foundation.idempotency_record WHERE action LIKE 'iam.internal.session%'`,
      );
      expect(before.rows[0]!.n).toBe("0");

      const identifier = uniqueIdentifier("no-idempotency-user");
      await createTestUser({ identifier, password: "No-Idempotency-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "No-Idempotency-1!");
      await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });

      const after = await getPool().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM foundation.idempotency_record WHERE action LIKE 'iam.internal.session%'`,
      );
      expect(after.rows[0]!.n).toBe("0");
    });
  });

  // -----------------------------------------------------------------------------------------
  // H. SEMANTIC PARITY
  // -----------------------------------------------------------------------------------------
  describe("H. semantic parity with requireUserSession", () => {
    it("for the same session, introspection and GET /auth/sessions (requireUserSession) resolve the same user_id/session_id/user_class", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("parity-user");
      const password = "Parity-Passw0rd-1!";
      const userId = await createTestUser({ identifier, password, userClass: "client" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, password);

      const introspectRes = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(introspectRes.statusCode).toBe(200);
      expect(introspectRes.json().data.user_id).toBe(userId);
      expect(introspectRes.json().data.session_id).toBe(sessionId);
      expect(introspectRes.json().data.user_class).toBe("client");

      // requireUserSession's own resolution, proven indirectly: GET /auth/sessions only
      // succeeds and returns rows scoped to `userId` if requireUserSession resolved this exact
      // token to this exact user — the most recent row is this exact session.
      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(200);
      const mostRecent = sessionsRes.json().data.sessions[0];
      expect(mostRecent.session_id).toBe(sessionId);
      expect(mostRecent.user_class).toBe("client");
    });

    it("both reject a revoked session identically (401)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("parity-revoked");
      await createTestUser({ identifier, password: "Parity-Revoked-1!" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Parity-Revoked-1!");
      await getPool().query(`UPDATE iam.session SET session_status = 'revoked' WHERE session_id = $1`, [sessionId]);

      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(401);
      expect(sessionsRes.json().error.code).toBe("AUTH_SESSION_REVOKED");

      const introspectRes = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(introspectRes.statusCode).toBe(401);
      expect(introspectRes.json().error.code).toBe("AUTH_SESSION_REQUIRED"); // collapsed, but equally rejected
    });

    it("both reject an expired session identically (401)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("parity-expired");
      await createTestUser({ identifier, password: "Parity-Expired-1!" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Parity-Expired-1!");
      await getPool().query(`UPDATE iam.session SET expires_at_utc = now() - interval '1 second' WHERE session_id = $1`, [sessionId]);

      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(401);
      expect(sessionsRes.json().error.code).toBe("AUTH_SESSION_EXPIRED");

      const introspectRes = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(introspectRes.statusCode).toBe(401);
      expect(introspectRes.json().error.code).toBe("AUTH_SESSION_REQUIRED");
    });

    it("both reject an inactive user identically in effect (requireUserSession: 403; introspection: 401 collapsed)", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("parity-inactive");
      const userId = await createTestUser({ identifier, password: "Parity-Inactive-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Parity-Inactive-1!");
      await getPool().query(`UPDATE iam.user_identity SET status = 'deactivated' WHERE user_id = $1`, [userId]);

      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(403);

      const introspectRes = await app.inject({
        method: "POST",
        url: INTROSPECTION_ROUTE,
        headers: introspectionHeaders,
        payload: { access_token: accessToken },
      });
      expect(introspectRes.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------------------------
  // I. LIFECYCLE
  // -----------------------------------------------------------------------------------------
  describe("I. lifecycle", () => {
    it("revoke (single session) then introspect -> 401", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("lifecycle-revoke");
      await createTestUser({ identifier, password: "Lifecycle-Revoke-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Lifecycle-Revoke-1!");

      const logoutRes = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": idemKey("lifecycle_logout") },
        payload: {},
      });
      expect(logoutRes.statusCode).toBe(200);

      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });
      expect(res.statusCode).toBe(401);
    });

    it("revoke-all (internal) then introspect -> 401", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("lifecycle-revokeall");
      const userId = await createTestUser({ identifier, password: "Lifecycle-RevokeAll-1!" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Lifecycle-RevokeAll-1!");

      const revokeAllRes = await app.inject({
        method: "POST",
        url: "/internal/auth/revoke-user-sessions",
        headers: { ...internalHeaders, "idempotency-key": idemKey("lifecycle_revokeall") },
        payload: { user_id: userId, reason: "test_lifecycle" },
      });
      expect(revokeAllRes.statusCode).toBe(200);

      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });
      expect(res.statusCode).toBe(401);
    });

    it("expiry boundary: not-yet-expired -> 200, already-elapsed -> 401", async () => {
      if (!schemaReady) return;
      const idA = uniqueIdentifier("lifecycle-boundary-a");
      await createTestUser({ identifier: idA, password: "Lifecycle-Boundary-A-1!" });
      const tokensA = await loginAndGetTokens(app, idA, "Lifecycle-Boundary-A-1!");
      await getPool().query(`UPDATE iam.session SET expires_at_utc = now() + interval '1 hour' WHERE session_id = $1`, [tokensA.sessionId]);
      const resA = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: tokensA.accessToken } });
      expect(resA.statusCode).toBe(200);

      const idB = uniqueIdentifier("lifecycle-boundary-b");
      await createTestUser({ identifier: idB, password: "Lifecycle-Boundary-B-1!" });
      const tokensB = await loginAndGetTokens(app, idB, "Lifecycle-Boundary-B-1!");
      await getPool().query(`UPDATE iam.session SET expires_at_utc = now() - interval '1 second' WHERE session_id = $1`, [tokensB.sessionId]);
      const resB = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: tokensB.accessToken } });
      expect(resB.statusCode).toBe(401);
    });

    it("refresh rotation: old access token becomes invalid, new one is valid, same session_id, user_class carried forward", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("lifecycle-refresh");
      await createTestUser({ identifier, password: "Lifecycle-Refresh-1!", userClass: "client" });
      const { accessToken: oldToken, refreshToken, sessionId } = await loginAndGetTokens(app, identifier, "Lifecycle-Refresh-1!");

      const refreshRes = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { "idempotency-key": idemKey("lifecycle_refresh") },
        payload: { refresh_token: refreshToken },
      });
      expect(refreshRes.statusCode).toBe(200);
      const newToken = refreshRes.json().data.access_token as string;
      expect(newToken).not.toBe(oldToken);

      const oldRes = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: oldToken } });
      expect(oldRes.statusCode).toBe(401);

      const newRes = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: newToken } });
      expect(newRes.statusCode).toBe(200);
      expect(newRes.json().data.session_id).toBe(sessionId);
      expect(newRes.json().data.user_class).toBe("client");
    });

    it("last_seen_at_utc advances on a SUCCESSFUL introspection; expires_at_utc is NOT extended", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("lifecycle-lastseen");
      await createTestUser({ identifier, password: "Lifecycle-LastSeen-1!" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Lifecycle-LastSeen-1!");

      const before = await getPool().query<{ last_seen_at_utc: string | null; expires_at_utc: string }>(
        `SELECT last_seen_at_utc, expires_at_utc FROM iam.session WHERE session_id = $1`,
        [sessionId],
      );
      await new Promise((r) => setTimeout(r, 20));

      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });
      expect(res.statusCode).toBe(200);

      const after = await getPool().query<{ last_seen_at_utc: string | null; expires_at_utc: string }>(
        `SELECT last_seen_at_utc, expires_at_utc FROM iam.session WHERE session_id = $1`,
        [sessionId],
      );
      expect(new Date(after.rows[0]!.last_seen_at_utc!).getTime()).toBeGreaterThan(
        before.rows[0]!.last_seen_at_utc ? new Date(before.rows[0]!.last_seen_at_utc).getTime() : 0,
      );
      expect(sameInstant(after.rows[0]!.expires_at_utc, before.rows[0]!.expires_at_utc)).toBe(true);
    });

    it("a FAILED introspection does not touch last_seen_at_utc", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("lifecycle-lastseen-fail");
      await createTestUser({ identifier, password: "Lifecycle-LastSeen-Fail-1!" });
      const { accessToken, sessionId } = await loginAndGetTokens(app, identifier, "Lifecycle-LastSeen-Fail-1!");
      await getPool().query(`UPDATE iam.session SET session_status = 'revoked' WHERE session_id = $1`, [sessionId]);

      const before = await getPool().query<{ last_seen_at_utc: string | null }>(`SELECT last_seen_at_utc FROM iam.session WHERE session_id = $1`, [sessionId]);

      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });
      expect(res.statusCode).toBe(401);

      const after = await getPool().query<{ last_seen_at_utc: string | null }>(`SELECT last_seen_at_utc FROM iam.session WHERE session_id = $1`, [sessionId]);
      expect(sameInstant(after.rows[0]?.last_seen_at_utc, before.rows[0]?.last_seen_at_utc)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  // J. USERCLASS SNAPSHOT — pins FINDING-A. Regression pin, NOT approval of future class
  // mutation without session revocation.
  // -----------------------------------------------------------------------------------------
  describe("J. userClass snapshot (FINDING-A pin)", () => {
    it("introspection returns iam.session.user_class (the snapshot at session creation), not a live re-read of iam.user_identity.user_class", async () => {
      if (!schemaReady) return;
      const identifier = uniqueIdentifier("userclass-snapshot");
      const userId = await createTestUser({ identifier, password: "Userclass-Snapshot-1!", userClass: "client" });
      const { accessToken } = await loginAndGetTokens(app, identifier, "Userclass-Snapshot-1!");

      // Directly mutate the underlying user_identity row WITHOUT rebuilding the session — no
      // real IAM mutation path does this today (bootstrap-only write), this is test-only setup
      // to prove the existing snapshot semantic.
      await getPool().query(`UPDATE iam.user_identity SET user_class = 'staff' WHERE user_id = $1`, [userId]);

      const res = await app.inject({ method: "POST", url: INTROSPECTION_ROUTE, headers: introspectionHeaders, payload: { access_token: accessToken } });
      expect(res.statusCode).toBe(200);
      // Still 'client' — the session's own snapshot, proving parity with requireUserSession's
      // identical pre-existing behaviour (this is NOT new behaviour introduced by this seam).
      expect(res.json().data.user_class).toBe("client");

      // Cross-check against the canonical path for the same session — identical snapshot value.
      const sessionsRes = await app.inject({ method: "GET", url: "/auth/sessions", headers: { authorization: `Bearer ${accessToken}` } });
      expect(sessionsRes.statusCode).toBe(200);
      expect(sessionsRes.json().data.sessions[0].user_class).toBe("client");
    });
  });
});
