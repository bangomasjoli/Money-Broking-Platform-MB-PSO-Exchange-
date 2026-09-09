/**
 * App-level tests via app.inject — no database required.
 * Covers the standard envelope, correlation propagation, the no-Exchange boot guard
 * (buildApp throws if it fails), and the fail-closed internal-identity guard.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { FndConfig } from "../../services/fnd/src/config.js";
import { buildApp } from "../../services/fnd/src/server.js";

const RATE_LIMIT_CONSUMER_TOKEN = "test-wlt1-rate-limit-consumer-secret-32ch";

const config: FndConfig = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-token-123",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  rateLimitConsumerSecrets: { "WLT-01": RATE_LIMIT_CONSUMER_TOKEN },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("FND service app (no DB)", () => {
  it("health returns standard success envelope + correlation header", async () => {
    const res = await app.inject({ method: "GET", url: "/foundation/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("alive");
    expect(body.correlation_id).toMatch(/^corr_/);
    expect(res.headers["x-correlation-id"]).toMatch(/^corr_/);
  });

  it("echoes a caller-supplied correlation id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/foundation/time",
      headers: { "x-correlation-id": "corr_caller-1" },
    });
    expect(res.json().correlation_id).toBe("corr_caller-1");
  });

  it("version reports release metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/foundation/version" });
    expect(res.json().data.release_version).toBe("v0.1.0-test");
    expect(res.json().data.environment).toBe("dev");
  });

  it("sensitive endpoint fails closed without internal identity", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      payload: {
        job_code: "daily_x",
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "critical",
        max_lateness_minutes: 30,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("rejects malformed body with VALIDATION_ERROR (backend validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { "x-internal-service-token": "test-token-123" },
      payload: { job_code: "x" }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("register fails closed without an Idempotency-Key header (F1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { "x-internal-service-token": "test-token-123" },
      payload: {
        job_code: "daily_x",
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "critical",
        max_lateness_minutes: 30,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("register fails closed on a blank Idempotency-Key header (F1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { "x-internal-service-token": "test-token-123", "idempotency-key": "   " },
      payload: {
        job_code: "daily_x",
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "critical",
        max_lateness_minutes: 30,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("enqueue fails closed without an Idempotency-Key header (F1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/jobs/enqueue",
      headers: { "x-internal-service-token": "test-token-123" },
      payload: {
        job_type: "smoke_probe",
        owner_module: "FND-01",
        payload_ref: "ref_1",
        idempotency_key: "body_key_1",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("returns error envelope for unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe("Shared Rate-Limit Engine — route/guard/schema (no DB required)", () => {
  const validBody = { bucket: "READ_LIST", subject_type: "client", subject_id: "clt1client_1" };

  it("the exact route exists at the exact path — no new alias", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: { "x-internal-service-token": RATE_LIMIT_CONSUMER_TOKEN },
      payload: validBody,
    });
    // No DB in this file — the guard passes, then the engine itself fails closed (no pool
    // initialised). Proves the route exists and the guard was reached, not a 404.
    expect(res.statusCode).not.toBe(404);
    expect(res.json().error?.code).not.toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("no /internal/... alias exists for the same capability", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/foundation/rate-limit/check", payload: validBody });
    expect(res.statusCode).toBe(404);
  });

  it("GET/PUT/DELETE on the path all 404", async () => {
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const res = await app.inject({ method, url: "/foundation/rate-limit/check" });
      expect(res.statusCode).toBe(404);
    }
  });

  it("no token -> 401 SERVICE_IDENTITY_REQUIRED, no DB work reached", async () => {
    const res = await app.inject({ method: "POST", url: "/foundation/rate-limit/check", payload: validBody });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("wrong token -> 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: { "x-internal-service-token": "totally-wrong-token-value" },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("the GENERAL INTERNAL_SERVICE_TOKEN does NOT open this route (dedicated capability token required)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: { "x-internal-service-token": "test-token-123" },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("the correct dedicated consumer token does NOT open other FND protected routes", async () => {
    // Body schema validation runs BEFORE preHandler (established platform convention), so a
    // SCHEMA-VALID body is required to actually reach the guard being tested here.
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { "x-internal-service-token": RATE_LIMIT_CONSUMER_TOKEN },
      payload: {
        job_code: "daily_x",
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "critical",
        max_lateness_minutes: 30,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  // ---------------------------------------------------------------------------------------
  // Schema — every case below sends the correct consumer token so the guard passes and the
  // body-schema validation (which runs BEFORE preHandler in Fastify, so an EMPTY body under
  // the WRONG token would 400 before the guard ever ran — established platform convention)
  // is exercised cleanly on its own.
  // ---------------------------------------------------------------------------------------
  const authHeaders = { "x-internal-service-token": RATE_LIMIT_CONSUMER_TOKEN };

  it("rejects a missing bucket", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { subject_type: "client", subject_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid bucket (lowercase, violates pattern)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "read_list", subject_type: "client", subject_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing subject_type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "READ_LIST", subject_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an invalid subject_type (uppercase, violates pattern)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "READ_LIST", subject_type: "CLIENT", subject_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing subject_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "READ_LIST", subject_type: "client" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an empty subject_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "READ_LIST", subject_type: "client", subject_id: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a subject_id longer than 128 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { bucket: "READ_LIST", subject_type: "client", subject_id: "x".repeat(129) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an extra 'module' field — module is derived from the guard, never caller-supplied", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { ...validBody, module: "WLT-01" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an extra 'cost' field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { ...validBody, cost: 5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects any arbitrary additional field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/foundation/rate-limit/check",
      headers: authHeaders,
      payload: { ...validBody, not_a_real_field: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});
