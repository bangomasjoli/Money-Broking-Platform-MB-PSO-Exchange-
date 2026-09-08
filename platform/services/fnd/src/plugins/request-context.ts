/**
 * Request-context plugin (FND-FR-002). Builds a RequestContext at the edge from headers,
 * binds it to async storage, decorates the request, and stamps response headers.
 * Also installs the standard error handler so every failure returns the error envelope.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AppError,
  createRequestContext,
  enterContext,
  errorEnvelope,
  toAppError,
  type EnvelopeMeta,
  type RequestContext,
} from "@aix/foundation";

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
 * §3.7 durable idempotency baseline: sensitive write endpoints require an Idempotency-Key
 * header. Missing/blank fails closed (IDEMPOTENCY_KEY_REQUIRED) before any DB work starts.
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

export async function registerRequestContext(app: FastifyInstance): Promise<void> {
  // ctx is set per-request in the onRequest hook (a fresh object per request — never a
  // shared decorated reference). The type is declared via module augmentation above.
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

  // Standard error envelope for everything, including Fastify schema validation errors.
  app.setErrorHandler((err, request, reply) => {
    const appErr = normalize(err);
    request.log.warn({ code: appErr.code, err_message: appErr.message }, "request_failed");
    return reply.code(appErr.http).send(errorEnvelope(appErr, meta(request)));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(errorEnvelope(new AppError("NOT_FOUND"), meta(request)));
  });
}

function normalize(err: unknown): AppError {
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
