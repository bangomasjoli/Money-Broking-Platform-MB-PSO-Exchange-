/**
 * Request-context plugin — KYC-01's OWN copy (mirrors services/aml1/src/plugins/request-
 * context.ts / services/clt1/src/plugins/request-context.ts / services/cfg1/src/plugins/
 * request-context.ts / services/sec1/src/plugins/request-context.ts / services/iam2/src/plugins/
 * request-context.ts; deliberately not imported from any of them — F3(c) module-import-boundary).
 * Builds a RequestContext at the edge, binds it to async storage, decorates the request, and
 * installs the standard error handler for both foundation `AppError` and KYC-01's own `Kyc1Error`
 * (see lib/errors.ts).
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
import { Kyc1Error } from "../lib/errors.js";

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
    return reply.code(unified.http).send(unifiedErrorEnvelope(unified, meta(request)));
  });

  app.setNotFoundHandler((request, reply) => {
    const err = new AppError("NOT_FOUND");
    return reply.code(err.http).send(unifiedErrorEnvelope(err, meta(request)));
  });
}

function normalize(err: unknown): UnifiedError {
  if (err instanceof Kyc1Error) return err;
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
