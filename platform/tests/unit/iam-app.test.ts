/**
 * IAM-01 app-level tests via app.inject — no database required.
 * Mirrors tests/unit/app.test.ts (FND): standard envelope, correlation propagation, the
 * no-Exchange boot guard (buildApp throws if it fails — proven implicitly by buildApp not
 * throwing here), the fail-closed internal-identity guard, fail-closed missing bearer
 * session, and the Idempotency-Key backend-validation baseline across several endpoints.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { IamConfig } from "../../services/iam/src/config.js";
import { buildApp } from "../../services/iam/src/server.js";

const config: IamConfig = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-fnd-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iamInternalServiceToken: "test-iam-internal-token-123",
  bootstrapEnabled: false,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 1_209_600,
  mfaSecretEncryptionKey: "test-mfa-secret-enc-key-not-for-prod",
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

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("IAM-01 service app (no DB)", () => {
  it("rejects malformed login body with VALIDATION_ERROR (backend validation) before any DB work", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "idempotency-key": "k1" },
      payload: { identifier: "" }, // missing password, blank identifier
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a login body with unexpected extra fields (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "idempotency-key": "k1" },
      payload: { identifier: "a@b.com", password: "x", extra_field: "nope" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("login fails closed without an Idempotency-Key header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "a@b.com", password: "correct-horse-battery-staple" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("login fails closed on a blank Idempotency-Key header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "idempotency-key": "   " },
      payload: { identifier: "a@b.com", password: "correct-horse-battery-staple" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("refresh fails closed without an Idempotency-Key header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refresh_token: "whatever" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("GET /auth/sessions fails closed without a bearer session (F3(b) app-level: no scope -> no unscoped read)", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/sessions" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("GET /auth/sessions fails closed on a malformed Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/sessions",
      headers: { authorization: "NotBearer abc" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("session revoke fails closed without a bearer session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/sessions/sess_whatever/revoke",
      headers: { "idempotency-key": "k1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("MFA enrol fails closed without a bearer session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/enrol",
      headers: { "idempotency-key": "k1" },
      payload: { factor_type: "totp" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("step-up start fails closed without a bearer session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/step-up",
      headers: { "idempotency-key": "k1" },
      payload: { purpose: "withdrawal_approval" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("internal freeze-event fails closed without internal identity (fail closed, no header)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/auth/freeze-event",
      headers: { "idempotency-key": "k1" },
      payload: { user_id: "user_x", event_type: "account_frozen", source_module: "CMP" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("internal freeze-event fails closed with the WRONG internal token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/auth/freeze-event",
      headers: { "idempotency-key": "k1", "x-internal-service-token": "totally-wrong" },
      payload: { user_id: "user_x", event_type: "account_frozen", source_module: "CMP" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("internal verify-assertion fails closed without internal identity", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/auth/verify-assertion",
      payload: { recent_auth_assertion: "x", required_purpose: "withdrawal_approval" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("internal service-account/validate fails closed without internal identity", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/auth/service-account/validate",
      payload: { service_account_id: "svc_x", credential: "secret" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("returns a standard error envelope + correlation propagation for an unknown route", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { "x-correlation-id": "corr_caller-iam-1" },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.correlation_id).toBe("corr_caller-iam-1");
    expect(res.headers["x-correlation-id"]).toBe("corr_caller-iam-1");
  });
});
