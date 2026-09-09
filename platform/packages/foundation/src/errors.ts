/**
 * FND-01 §04.5 error-code catalogue + standard success/error envelope (§04.2).
 * Every module reuses these so error shape and codes are uniform platform-wide.
 */

export interface ErrorCodeSpec {
  http: number;
  message: string;
}

/** Canonical FND error codes (blueprint §04.5) plus the interim service-identity seam. */
export const FND_ERROR_CODES = {
  VALIDATION_ERROR: { http: 400, message: "The request is invalid." },
  NOT_FOUND: { http: 404, message: "Resource not found." },
  FOUNDATION_NOT_READY: { http: 503, message: "Foundation readiness check failed." },
  REQUEST_CONTEXT_INVALID: { http: 400, message: "Request context missing or invalid." },
  CORRELATION_ID_INVALID: { http: 400, message: "Correlation ID invalid." },
  MODULE_NOT_REGISTERED: { http: 403, message: "Module is not registered." },
  MODULE_DEPENDENCY_NOT_MET: { http: 409, message: "Module dependency not met." },
  FEATURE_FLAG_UNAVAILABLE: { http: 503, message: "Feature flag interface unavailable." },
  LICENCE_LOCK_UNAVAILABLE: { http: 503, message: "Licence lock interface unavailable." },
  TIME_SOURCE_UNHEALTHY: { http: 503, message: "Trusted time source unhealthy." },
  CONFIGURATION_INVALID: { http: 500, message: "Critical configuration invalid." },
  CONFIGURATION_DRIFT: { http: 409, message: "Runtime configuration drift detected." },
  SMOKE_TEST_FAILED: { http: 500, message: "Deployment smoke test failed." },
  MODULE_BOUNDARY_VIOLATION: { http: 500, message: "Cross-module boundary violation." },
  SCHEDULED_JOB_MISSED: { http: 500, message: "Scheduled job missed its run window." },
  JOB_QUEUE_DEAD_LETTER: { http: 500, message: "Job moved to dead-letter." },
  RATE_LIMITED: { http: 429, message: "Request throttled." },
  // Shared Rate-Limit Engine (WLT-01 BLOCKER-2 prerequisite, DEC-009): the enforcement engine
  // could not determine allow/deny — DB unavailable, missing/inactive/malformed policy row, or
  // any other enforcement-unavailable condition. Deliberately DISTINCT from RATE_LIMITED (429,
  // genuine quota exceeded) so a downstream caller can fail closed on unavailability without
  // confusing it for an invalid identity or a real deny.
  RATE_LIMIT_UNAVAILABLE: { http: 503, message: "Rate-limit enforcement unavailable." },
  DB_ISOLATION_VIOLATION: { http: 500, message: "Runtime DB grant/RLS violation." },
  ASYNC_CORRELATION_MISSING: { http: 500, message: "Async job missing correlation context." },
  AUDIT_OUTBOX_UNAVAILABLE: { http: 503, message: "Audit/outbox persistence unavailable; action failed closed." },
  // §3.7 durable idempotency baseline: sensitive writes require the header. Fail closed when absent/blank.
  IDEMPOTENCY_KEY_REQUIRED: { http: 400, message: "Idempotency-Key header is required." },
  // Interim IAM handoff seam — replaced when IAM-01/IAM-02 own auth. Fail closed when absent.
  SERVICE_IDENTITY_REQUIRED: { http: 401, message: "Internal service identity required." },
  INTERNAL_ERROR: { http: 500, message: "Internal error." },
} as const satisfies Record<string, ErrorCodeSpec>;

export type FndErrorCode = keyof typeof FND_ERROR_CODES;

export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * Typed application error. Carries a catalogue code; never leaks secrets or stack traces
 * across the API boundary (§04.2 rules 1–2).
 */
export class AppError extends Error {
  readonly code: FndErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: FndErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = FND_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "AppError";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export interface EnvelopeMeta {
  request_id: string;
  correlation_id: string;
  server_time_utc: string;
}

export interface SuccessEnvelope<T> extends EnvelopeMeta {
  success: true;
  data: T;
}

export interface ErrorEnvelope extends EnvelopeMeta {
  success: false;
  error: { code: string; message: string; details: ErrorDetail[] };
}

export function successEnvelope<T>(data: T, meta: EnvelopeMeta): SuccessEnvelope<T> {
  return { success: true, ...meta, data };
}

export function errorEnvelope(err: AppError, meta: EnvelopeMeta): ErrorEnvelope {
  return {
    success: false,
    ...meta,
    error: { code: err.code, message: err.message, details: err.details },
  };
}

/** Map any thrown value to an AppError without leaking internals. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("INTERNAL_ERROR", { cause: err });
}
