/**
 * AML-01 -> CLT-01 HTTP client (Phase 2A). The ONLY way AML-01 may deliver a screening outcome
 * into CLT-01 — never import `services/clt1/src/**` (F3(c) module-import boundary, forbidding
 * `clt1` since AML-01 Phase 0 day one for exactly this future wiring). This is AML-01's own fresh
 * copy of the same shape CLT-01/CFG-01/SEC-01 already use for their own dependency clients
 * (services/clt1/src/lib/cfg1-client.ts, services/clt1/src/lib/iam2-client.ts) — not imported from
 * any of them, F3(c) applies between every pair of service directories.
 *
 * Wraps CLT-01's TWO EXISTING receipt endpoints, never a new CLT-01 route:
 *   - `POST /internal/clt1/applications/:application_id/outcomes` — application-level CDD outcome
 *     receipt (`deliverApplicationOutcome`). CLT-01 requires `client_application.status =
 *     'under_review'`; a non-2xx here (including CLT1_APPLICATION_INVALID_STATE) is a real,
 *     expected failure mode this phase — recorded as a failed delivery, never silently retried as
 *     a success (Phase 2 planning report §17 risk 1).
 *   - `POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/
 *     screening-outcome` — authorised-party-level screening-outcome receipt
 *     (`deliverAuthorisedPartyOutcome`). CLT-01 requires `client_profile.status =
 *     'active_limited'`. Deliberately never sends `identity_verification_status` — that field
 *     belongs to KYC-01, not AML-01 (approved Phase 2A scope); CLT-01's own COALESCE semantics
 *     preserve whatever value is already there.
 *
 * FAIL-CLOSED, always: a network error, a request timeout, a non-2xx response, or a malformed/
 * unparseable response body are ALL treated as `succeeded: false` — never treated as a successful
 * delivery. Every call is TIMEOUT-BOUNDED via `AbortSignal.timeout` so a hung CLT-01 can never hang
 * an AML-01 delivery/retry route indefinitely.
 *
 * Never logs the CLT-01 internal-service-token (never placed in any log field) and never logs the
 * raw CLT-01 response body — only a single opaque, non-PII `response_ref` id is ever extracted and
 * returned (CLT-01's own `outcome_id` for application-level, `authorised_party_id` for
 * party-level), the same "safe evidence reference, never the full body" discipline CFG-01's own
 * `decisionId` / CLT-01's own `decisionId` already established for an identical dependency shape.
 */
export interface Clt1ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow CLT-01 can never block an AML-01 delivery/retry route indefinitely. */
const CLT1_CLIENT_TIMEOUT_MS = 5000;

export type Clt1DeliveryResult =
  | { succeeded: true; responseRef: string | null }
  | { succeeded: false; failureReasonCode: string };

export interface DeliverApplicationOutcomeInput {
  applicationId: string;
  outcomeType: "aml_sanctions" | "pep_adverse_media";
  outcomeStatus: "pass" | "pending" | "hit";
  sourceModule: string;
  createdBy: string;
}

export interface DeliverAuthorisedPartyOutcomeInput {
  clientId: string;
  authorisedPartyId: string;
  sanctionsPepStatus: "clear" | "review_required" | "hit";
  sourceModule: string;
  createdBy: string;
}

interface Clt1SuccessResponseBody {
  success: boolean;
  data?: { outcome_id?: string; authorised_party_id?: string };
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

/** `failure_reason_code` lands in `aml1.clt_outcome_delivery.failure_reason_code varchar(64)`
 * (Phase 2A carry-forward Low-2 fix) — clamp defensively before returning, since the value
 * originates from an untrusted upstream (`CLT-01`'s own `error.code`, or in principle any
 * intermediary/proxy that responds in CLT-01's shape). Every REAL CLT-01 code observed is well
 * under 64 chars (`CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED` is the longest at 40), so this never
 * fires today — but without it, an oversized value would fail the TX2 UPDATE with a raw Postgres
 * `22001` and surface as a misleading `AML1_AUDIT_REQUIRED` instead of a clean failed-delivery
 * record. */
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

async function postToClt1(
  config: Clt1ClientConfig,
  path: string,
  body: Record<string, unknown>,
  responseRefField: "outcome_id" | "authorised_party_id",
): Promise<Clt1DeliveryResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLT1_CLIENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Non-2xx -> fail closed. Includes the real, expected CLT1_APPLICATION_INVALID_STATE /
      // CLT1_CLIENT_NOT_ACTIVE cases (wrong lifecycle window) — recorded as a failed delivery,
      // never treated as delivered.
      return { succeeded: false, failureReasonCode: await extractErrorReasonCode(res) };
    }

    let parsed: Clt1SuccessResponseBody;
    try {
      parsed = (await res.json()) as Clt1SuccessResponseBody;
    } catch {
      return { succeeded: false, failureReasonCode: MALFORMED_RESPONSE_REASON_CODE };
    }
    if (!parsed?.success) {
      return { succeeded: false, failureReasonCode: MALFORMED_RESPONSE_REASON_CODE };
    }

    return { succeeded: true, responseRef: parsed.data?.[responseRefField] ?? null };
  } catch (err) {
    // Network error / connection refused / AbortSignal.timeout firing -> fail closed, never
    // treated as delivered.
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { succeeded: false, failureReasonCode: isTimeout ? TIMEOUT_REASON_CODE : UNAVAILABLE_REASON_CODE };
  }
}

export async function deliverApplicationOutcome(
  config: Clt1ClientConfig,
  input: DeliverApplicationOutcomeInput,
): Promise<Clt1DeliveryResult> {
  return postToClt1(
    config,
    `/internal/clt1/applications/${encodeURIComponent(input.applicationId)}/outcomes`,
    {
      outcome_type: input.outcomeType,
      outcome_status: input.outcomeStatus,
      source_module: input.sourceModule,
      created_by: input.createdBy,
    },
    "outcome_id",
  );
}

export async function deliverAuthorisedPartyOutcome(
  config: Clt1ClientConfig,
  input: DeliverAuthorisedPartyOutcomeInput,
): Promise<Clt1DeliveryResult> {
  return postToClt1(
    config,
    `/internal/clt1/clients/${encodeURIComponent(input.clientId)}/authorised-parties/${encodeURIComponent(input.authorisedPartyId)}/screening-outcome`,
    {
      sanctions_pep_status: input.sanctionsPepStatus,
      source_module: input.sourceModule,
      created_by: input.createdBy,
    },
    "authorised_party_id",
  );
}
