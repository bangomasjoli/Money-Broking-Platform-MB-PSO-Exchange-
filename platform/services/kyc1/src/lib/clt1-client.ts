/**
 * KYC-01 -> CLT-01 HTTP client (Phase 2B). The ONLY way KYC-01 may deliver an outcome into CLT-01 —
 * never import `services/clt1/src/**` (F3(c) module-import boundary). This is KYC-01's own fresh
 * copy of the same shape AML-01/CLT-01/CFG-01/SEC-01 already use for their own dependency clients
 * (`services/aml1/src/lib/clt1-client.ts`, `services/clt1/src/lib/cfg1-client.ts`,
 * `services/clt1/src/lib/iam2-client.ts`) — not imported from any of them, F3(c) applies between
 * every pair of service directories.
 *
 * Wraps CLT-01's ONE EXISTING receipt endpoint KYC-01 needs, never a new CLT-01 route:
 *   - `POST /internal/clt1/applications/:application_id/outcomes` — application-level CDD outcome
 *     receipt (`deliverKycOutcome`). CLT-01 requires `client_application.status = 'under_review'`;
 *     a non-2xx here (including the real, expected `CLT1_APPLICATION_INVALID_STATE`) is a genuine,
 *     expected failure mode — recorded as a failed delivery, never silently retried as a success.
 *
 * PHASE 4B addition: every `kyc_kyb` delivery now sends `expected_roster_hash` — CLT-01 migration
 * `047_clt1_atomic_kyc_roster_binding.cjs`'s own atomic-receipt contract makes this field MANDATORY
 * for `outcome_type='kyc_kyb'`. The value comes from the caller (`routes/outcome-publication.ts`),
 * which sources it EXCLUSIVELY from the immutable `outcome_publication.roster_hash` column — this
 * file never computes, defaults, or falls back to any other value. A `CLT1_KYC_ROSTER_STALE` (409)
 * response is detected as its OWN discriminant (`kind: "stale"`, see `Clt1DeliveryResult` below),
 * never collapsed into the generic `"rejected"` bucket — the calling route maps it to
 * `KYC1_OUTCOME_PUBLICATION_STALE`, never `KYC1_CLT_DELIVERY_FAILED`/`KYC1_CLT_UNAVAILABLE`.
 *
 * FAIL-CLOSED, always: a network error, a request timeout, a non-2xx response, or a malformed/
 * unparseable response body are ALL treated as `succeeded: false` — never treated as a successful
 * delivery. Every call is TIMEOUT-BOUNDED via `AbortSignal.timeout` so a hung CLT-01 can never hang
 * a KYC-01 delivery route indefinitely.
 *
 * Never logs the CLT-01 internal-service-token and never logs the raw CLT-01 request or response
 * body — only a single opaque, non-PII `response_ref` id is ever extracted and returned (CLT-01's
 * own `outcome_id`), the same "safe evidence reference, never the full body" discipline AML-01's own
 * `clt1-client.ts` already established for the identical dependency shape.
 */
export interface Clt1ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow CLT-01 can never block a KYC-01 delivery route indefinitely. */
const CLT1_CLIENT_TIMEOUT_MS = 5000;

/**
 * `kind` distinguishes WHICH KYC-01 error code the route should surface (approved D5, extended by
 * Phase 4B): `"rejected"` — CLT-01 was reachable and responded with a real, parseable-or-not
 * non-2xx decision OTHER than a stale-roster refusal (e.g. the expected
 * `CLT1_APPLICATION_INVALID_STATE` wrong-lifecycle-window case) -> `KYC1_CLT_DELIVERY_FAILED`
 * (502). `"unavailable"` — no real CLT-01 decision was ever obtained: network error, timeout, or a
 * 2xx response that was malformed/unparseable/`success:false` -> `KYC1_CLT_UNAVAILABLE` (503).
 * `"stale"` (Phase 4B) — CLT-01's OWN atomic receipt (migration 047) recomputed the current roster
 * digest and it did not match the `expected_roster_hash` this call sent (`CLT1_KYC_ROSTER_STALE`,
 * 409) -> `KYC1_OUTCOME_PUBLICATION_STALE`, NEVER `KYC1_CLT_DELIVERY_FAILED`/`KYC1_CLT_UNAVAILABLE`
 * — a stale-roster refusal is a genuine, expected, retriable-after-republish outcome, not a generic
 * rejection or an unreachability signal. Kept as an explicit discriminant rather than
 * pattern-matching `failureReasonCode` strings at the route layer, which would be fragile if a real
 * CLT-01 error code ever happened to collide with one of this file's own sentinel strings.
 */
export type Clt1DeliveryResult =
  | { succeeded: true; responseRef: string | null }
  | { succeeded: false; kind: "rejected"; failureReasonCode: string }
  | { succeeded: false; kind: "unavailable"; failureReasonCode: string }
  | { succeeded: false; kind: "stale"; failureReasonCode: string };

/** KYC-01's own aggregate statuses map 1:1 onto CLT-01's `cdd_outcome_status` vocabulary — an
 * EXPLICIT map, never a pass-through, so a future KYC-01 status value can never silently leak into
 * CLT-01's own enum unnoticed. */
const OUTCOME_STATUS_MAP: Record<"pass" | "fail" | "remediation_required", "pass" | "fail" | "remediation_required"> = {
  pass: "pass",
  fail: "fail",
  remediation_required: "remediation_required",
};

export function mapAggregateStatusToClt1(aggregateStatus: "pass" | "fail" | "remediation_required"): "pass" | "fail" | "remediation_required" {
  return OUTCOME_STATUS_MAP[aggregateStatus];
}

export interface DeliverKycOutcomeInput {
  applicationId: string;
  aggregateStatus: "pass" | "fail" | "remediation_required";
  createdBy: string;
  /** Phase 4B — REQUIRED, sourced EXCLUSIVELY from the immutable `outcome_publication.roster_hash`
   * column by the caller (`routes/outcome-publication.ts`). Never the delivery request body, never
   * a freshly re-fetched roster, never caller/actor input — see this file's own header comment. */
  expectedRosterHash: string;
}

interface Clt1SuccessResponseBody {
  success: boolean;
  data?: { outcome_id?: string };
}

interface Clt1ErrorResponseBody {
  success?: boolean;
  error?: { code?: string };
}

/** Sentinel failure reason codes — distinguish HOW delivery failed, though all collapse to
 * `succeeded: false` for delivery-outcome purposes (fail-closed, no partial trust). */
const TIMEOUT_REASON_CODE = "clt1_timeout";
const UNAVAILABLE_REASON_CODE = "clt1_unavailable";
const MALFORMED_RESPONSE_REASON_CODE = "clt1_malformed_response";

/** `failure_reason_code` lands in `kyc1.outcome_publication.failure_reason_code varchar(64)` —
 * clamp defensively before returning, since the value originates from an untrusted upstream
 * (CLT-01's own `error.code`) — mirrors AML-01's own `clampFailureReasonCode` precedent
 * (`services/aml1/src/lib/clt1-client.ts`), added there after an independent review found an
 * unclamped upstream code could fail the terminal UPDATE with a raw Postgres `22001` and surface as
 * a misleading `KYC1_AUDIT_REQUIRED` instead of a clean failed-delivery record. */
const FAILURE_REASON_CODE_MAX_LENGTH = 64;

function clampFailureReasonCode(code: string): string {
  return code.slice(0, FAILURE_REASON_CODE_MAX_LENGTH);
}

async function extractErrorReasonCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Clt1ErrorResponseBody;
    return clampFailureReasonCode(body?.error?.code ?? UNAVAILABLE_REASON_CODE);
  } catch {
    // Non-JSON/unparseable error body — keep the generic sentinel.
    return UNAVAILABLE_REASON_CODE;
  }
}

export async function deliverKycOutcome(config: Clt1ClientConfig, input: DeliverKycOutcomeInput): Promise<Clt1DeliveryResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}/internal/clt1/applications/${encodeURIComponent(input.applicationId)}/outcomes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        outcome_type: "kyc_kyb",
        outcome_status: mapAggregateStatusToClt1(input.aggregateStatus),
        source_module: "KYC-01",
        created_by: input.createdBy,
        expected_roster_hash: input.expectedRosterHash,
      }),
      signal: AbortSignal.timeout(CLT1_CLIENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const failureReasonCode = await extractErrorReasonCode(res);
      // Phase 4B — CLT-01's own atomic-receipt stale-roster refusal (migration 047) is a DISTINCT,
      // expected outcome: the roster genuinely changed since this publication's evidence was
      // computed. Never collapsed into the generic "rejected" bucket — see this file's own header
      // comment and Clt1DeliveryResult's own doc comment.
      if (res.status === 409 && failureReasonCode === "CLT1_KYC_ROSTER_STALE") {
        return { succeeded: false, kind: "stale", failureReasonCode };
      }
      // Non-2xx -> fail closed, but CLT-01 WAS reachable and DID respond with a real decision.
      // Includes the real, expected CLT1_APPLICATION_INVALID_STATE case (wrong lifecycle window)
      // — recorded as a failed (rejected) delivery, never treated as delivered.
      return { succeeded: false, kind: "rejected", failureReasonCode };
    }

    let parsed: Clt1SuccessResponseBody;
    try {
      parsed = (await res.json()) as Clt1SuccessResponseBody;
    } catch {
      return { succeeded: false, kind: "unavailable", failureReasonCode: MALFORMED_RESPONSE_REASON_CODE };
    }
    if (!parsed?.success) {
      return { succeeded: false, kind: "unavailable", failureReasonCode: MALFORMED_RESPONSE_REASON_CODE };
    }

    return { succeeded: true, responseRef: parsed.data?.outcome_id ?? null };
  } catch (err) {
    // Network error / connection refused / AbortSignal.timeout firing -> no real CLT-01 decision
    // was ever obtained -> fail closed, never treated as delivered.
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { succeeded: false, kind: "unavailable", failureReasonCode: isTimeout ? TIMEOUT_REASON_CODE : UNAVAILABLE_REASON_CODE };
  }
}
