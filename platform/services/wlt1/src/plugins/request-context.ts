/**
 * Request-context plugin — WLT-01's OWN copy (mirrors services/aml1/src/plugins/request-
 * context.ts / services/clt1/src/plugins/request-context.ts / services/kyc1/src/plugins/
 * request-context.ts; deliberately not imported from any of them — F3(c) module-import-
 * boundary). Builds a RequestContext at the edge, binds it to async storage, decorates the
 * request, and installs the standard error handler for both foundation `AppError` and WLT-01's
 * own `Wlt1Error` (see lib/errors.ts — empty this phase, wired up now so later phases need no
 * request-context change).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AppError,
  createRequestContext,
  enterContext,
  toAppError,
  type EnvelopeMeta,
  type ErrorDetail,
  type RequestContext,
} from "@aix/foundation";
import { Wlt1Error } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export function meta(request: FastifyRequest): EnvelopeMeta {
  return {
    request_id: request.ctx.request_id,
    correlation_id: request.ctx.correlation_id,
    server_time_utc: request.ctx.server_time_utc,
  };
}

/**
 * §3.7 durable idempotency baseline (reused pattern from FND/IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/
 * AML-01): sensitive state-mutating POSTs require an Idempotency-Key header. Missing/blank fails
 * closed before any DB work. Not used by any Phase 0 route (the one route this phase registers,
 * `GET /internal/wlt1/health`, is a read, not a mutation) — kept available now so later phases'
 * mutating endpoints (destination registration, whitelist approval) need no plugin change.
 */
export function requireIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new AppError("IDEMPOTENCY_KEY_REQUIRED", {
      details: [{ field: "Idempotency-Key", issue: "header is required" }],
    });
  }
  return trimmed;
}

interface UnifiedError {
  code: string;
  http: number;
  message: string;
  details: ErrorDetail[];
}

function unifiedErrorEnvelope(err: UnifiedError, m: EnvelopeMeta) {
  return {
    success: false as const,
    ...m,
    error: { code: err.code, message: err.message, details: err.details },
  };
}

export async function registerRequestContext(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createRequestContext({
      headerRequestId: headerString(request.headers["x-request-id"]),
      headerCorrelationId: headerString(request.headers["x-correlation-id"]),
      sourceIp: request.ip,
      actorType: "service",
    });
    request.ctx = ctx;
    enterContext(ctx);
    void reply.header("x-request-id", ctx.request_id);
    void reply.header("x-correlation-id", ctx.correlation_id);
  });

  app.setErrorHandler((err, request, reply) => {
    const unified = normalize(err);
    // Never log request/response bodies here — only the stable code (no secrets).
    request.log.warn({ code: unified.code }, "request_failed");
    // Public Client Surface: a genuine FND-01 rate-limit exceed (`checkPublicRateLimit`) throws
    // the shared foundation RATE_LIMITED with `details: [{ field: "retry_after_seconds", issue:
    // "<n>" }]` — surface it as the standard Retry-After header too, mirroring FND-01's own
    // `/foundation/rate-limit/check` route's identical convention.
    if (unified.code === "RATE_LIMITED") {
      const retryAfter = unified.details.find((d) => d.field === "retry_after_seconds")?.issue;
      if (retryAfter) void reply.header("Retry-After", retryAfter);
    }
    return reply.code(unified.http).send(unifiedErrorEnvelope(unified, meta(request)));
  });

  app.setNotFoundHandler((request, reply) => {
    const err = new AppError("NOT_FOUND");
    return reply.code(err.http).send(unifiedErrorEnvelope(err, meta(request)));
  });
}

function normalize(err: unknown): UnifiedError {
  if (err instanceof Wlt1Error) return err;
  if (err instanceof AppError) return err;
  // Fastify schema validation errors carry a `validation` array — map to VALIDATION_ERROR (400).
  const maybe = err as { validation?: Array<{ message?: string }> };
  if (maybe && Array.isArray(maybe.validation)) {
    return new AppError("VALIDATION_ERROR", {
      details: maybe.validation.map((v) => ({ issue: v?.message ?? "invalid" })),
    });
  }
  return toAppError(err);
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
