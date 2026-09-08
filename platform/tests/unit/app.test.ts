/**
 * App-level tests via app.inject — no database required.
 * Covers the standard envelope, correlation propagation, the no-Exchange boot guard
 * (buildApp throws if it fails), and the fail-closed internal-identity guard.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@aix/foundation";
import { buildApp } from "../../services/fnd/src/server.js";

const config: AppConfig = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-token-123",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
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
