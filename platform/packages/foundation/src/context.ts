/**
 * FND-01 §5.6 / FND-FR-002 request context + async correlation propagation.
 * A request context is created at the edge and propagated through async work
 * (jobs, outbox, audit) so request -> job -> outbox -> audit can be reconstructed.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { systemTime, type TimeService } from "./time.js";

export type ActorType = "user" | "system" | "service";

export interface RequestContext {
  request_id: string;
  correlation_id: string;
  /** Set for async work spawned from a request; carried into jobs/outbox/audit. */
  causation_id?: string;
  origin_correlation_id?: string;
  actor_id?: string;
  actor_type: ActorType;
  role_context?: string;
  client_id?: string;
  source_ip?: string;
  server_time_utc: string;
}

const PREFIX = { request: "req_", correlation: "corr_" } as const;

export function newRequestId(): string {
  return PREFIX.request + randomUUID();
}
export function newCorrelationId(): string {
  return PREFIX.correlation + randomUUID();
}

/**
 * Build a request context from inbound headers. Correlation/request IDs are accepted
 * from the caller when present, otherwise generated server-side (§04.2.1). Client scope
 * is NEVER trusted from the client (X-Client-Scope is server-derived only).
 */
export function createRequestContext(input: {
  headerRequestId?: string | undefined;
  headerCorrelationId?: string | undefined;
  actorId?: string | undefined;
  actorType?: ActorType | undefined;
  sourceIp?: string | undefined;
  time?: TimeService;
}): RequestContext {
  const time = input.time ?? systemTime;
  return {
    request_id: sanitizeId(input.headerRequestId) ?? newRequestId(),
    correlation_id: sanitizeId(input.headerCorrelationId) ?? newCorrelationId(),
    actor_type: input.actorType ?? "system",
    ...(input.actorId ? { actor_id: input.actorId } : {}),
    ...(input.sourceIp ? { source_ip: input.sourceIp } : {}),
    server_time_utc: time.nowUtc(),
  };
}

/** Reject malformed/oversized inbound IDs; fall back to server-generated (fail safe, not open). */
function sanitizeId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v.length === 0 || v.length > 128) return undefined;
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) return undefined;
  return v;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/**
 * Bind `ctx` to the current async execution for the remainder of the request.
 * Used by the Fastify onRequest hook so getContext() resolves in later hooks/handlers
 * (and in audit/outbox writes) without wrapping every handler.
 */
export function enterContext(ctx: RequestContext): void {
  als.enterWith(ctx);
}

/** Current context or undefined (do not throw in logging paths). */
export function getContext(): RequestContext | undefined {
  return als.getStore();
}

/** Current context or fail closed — for sensitive/async actions that REQUIRE traceability. */
export function requireContext(): RequestContext {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error("REQUEST_CONTEXT_INVALID: no active request context");
  }
  return ctx;
}

/**
 * Derive a child context for async work (scheduler run, queued job): a fresh correlation
 * chain that preserves origin + causation (§5.6 rules 2–3).
 */
export function deriveAsyncContext(
  parent: RequestContext | undefined,
  opts: { causationId: string; actorId?: string },
): RequestContext {
  const correlation = parent?.correlation_id ?? newCorrelationId();
  return {
    request_id: newRequestId(),
    correlation_id: correlation,
    causation_id: opts.causationId,
    origin_correlation_id: parent?.origin_correlation_id ?? correlation,
    actor_type: "system",
    ...(opts.actorId ? { actor_id: opts.actorId } : {}),
    server_time_utc: systemTime.nowUtc(),
  };
}
