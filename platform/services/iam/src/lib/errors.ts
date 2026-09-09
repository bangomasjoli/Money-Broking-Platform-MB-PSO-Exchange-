/**
 * IAM-01 domain error catalogue (blueprint §04.4 / §09.2).
 *
 * `@aix/foundation`'s `AppError` is intentionally closed over `FndErrorCode` (a union of
 * the FND platform-generic codes) and we must not modify `packages/foundation/src` to widen
 * it. Generic/shared codes (VALIDATION_ERROR, IDEMPOTENCY_KEY_REQUIRED, SERVICE_IDENTITY_
 * REQUIRED, NOT_FOUND, INTERNAL_ERROR, CONFIGURATION_INVALID, ...) are still constructed via
 * the real foundation `AppError` — that plumbing is fully reused. IAM-specific auth/session/
 * MFA codes that are NOT in the foundation catalogue get their own small parallel error type
 * here, carrying the exact same on-wire shape (`{code, message, details}` + `http`), so the
 * request-context error handler can treat both uniformly.
 *
 * HTTP status choices below are not specified by the blueprint (it lists codes + severity,
 * not transport status) — these are sensible defaults, noted here rather than invented as
 * "regulated" behaviour.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface IamErrorSpec {
  http: number;
  message: string;
}

export const IAM_ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: { http: 401, message: "Invalid login details or additional verification required." },
  AUTH_MFA_REQUIRED: { http: 401, message: "Additional verification required." },
  AUTH_MFA_FAILED: { http: 401, message: "Verification failed." },
  AUTH_MFA_ENROLMENT_REQUIRED: { http: 401, message: "MFA setup required before this account can be used." },
  AUTH_SESSION_EXPIRED: { http: 401, message: "Please sign in again." },
  AUTH_SESSION_REVOKED: { http: 401, message: "Please sign in again." },
  // Distinct from AUTH_SESSION_EXPIRED/REVOKED: no usable bearer session was presented at all
  // (missing/malformed Authorization header) — the F3(b) fail-closed-on-missing-scope case.
  AUTH_SESSION_REQUIRED: { http: 401, message: "Authentication required." },
  AUTH_REFRESH_REUSE_DETECTED: { http: 401, message: "Please sign in again." },
  AUTH_ACCOUNT_LOCKED: { http: 423, message: "Account cannot be accessed at this time." },
  AUTH_RATE_LIMITED: { http: 429, message: "Too many attempts. Try again later." },
  AUTH_PASSWORD_POLICY_FAILED: { http: 400, message: "Password does not meet policy requirements." },
  AUTH_RESET_TOKEN_INVALID: { http: 400, message: "This link is no longer valid." },
  // S2 gap-closing patch: the out-of-band MFA-enrolment-during-login session (opaque,
  // hash-only, single-use, bound to the user who just authenticated with a password) is
  // missing/expired/already-used/revoked. Deliberately the SAME generic style as
  // AUTH_RESET_TOKEN_INVALID (§09 Error Handling: "Generic" user message style) — no detail
  // about which specific reason applies.
  AUTH_ENROLMENT_SESSION_INVALID: { http: 400, message: "This enrolment session is no longer valid." },
  AUTH_PRIVILEGED_MFA_REQUIRED: { http: 401, message: "Additional verification required." },
  AUTH_SERVICE_ACCOUNT_INVALID: { http: 401, message: "Service credential invalid." },
  AUTH_AUDIT_REQUIRED: { http: 503, message: "Service temporarily unavailable." },
  AUTH_STEP_UP_REQUIRED: { http: 401, message: "Additional verification required." },
  AUTH_STEP_UP_FAILED: { http: 401, message: "Verification failed." },
  AUTH_RECENT_AUTH_INVALID: { http: 401, message: "Please verify your identity again." },
  AUTH_MFA_RESET_APPROVAL_REQUIRED: { http: 403, message: "This action requires approval." },
  AUTH_ACCOUNT_FROZEN: { http: 403, message: "Account cannot be accessed at this time." },
  AUTH_SESSION_ANOMALY: { http: 401, message: "Please verify your identity again." },
  AUTH_CONCURRENT_SESSION_LIMIT: { http: 409, message: "Session limit reached." },
  AUTH_BREACHED_PASSWORD: { http: 400, message: "Choose a different password." },
  AUTH_PASSWORD_REUSE_BLOCKED: { http: 400, message: "Choose a different password." },
  // Defensive addition (not in blueprint's code list): session policy is required to issue
  // any session and must fail closed if unresolved (§09 Error Handling §4 rule 12).
  AUTH_SESSION_POLICY_UNAVAILABLE: { http: 503, message: "Service temporarily unavailable." },
  // Internal Session Introspection seam (WLT-01 BLOCKER-1 prerequisite, Opus architecture
  // "IAM-01 SESSION INTROSPECTION: ACCEPTED FOR IMPLEMENTATION"): infrastructure/query failure
  // while resolving `POST /internal/auth/session/validate` — never returned for a genuinely
  // invalid session (that collapses to AUTH_SESSION_REQUIRED/401 instead, see
  // SESSION_VALIDATION_NEGATIVE_CODES below). Keeping this a distinct 503 code is what lets a
  // downstream caller (WLT-01) fail closed on IAM unavailability without confusing it for an
  // invalid identity.
  AUTH_SESSION_INTROSPECTION_UNAVAILABLE: { http: 503, message: "Service temporarily unavailable." },
} as const satisfies Record<string, IamErrorSpec>;

export type IamErrorCode = keyof typeof IAM_ERROR_CODES;

export class IamError extends Error {
  readonly code: IamErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: IamErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = IAM_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "IamError";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
