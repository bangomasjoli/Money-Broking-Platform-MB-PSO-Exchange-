/**
 * CLT-01 -> CFG-01 HTTP client (Phase 1). The ONLY way CLT-01 may consume CFG-01's runtime
 * onboarding-feature gate — never import `services/cfg1/src/**` (F3(c) module-import boundary).
 * This is CLT-01's own fresh copy of the same shape SEC-01/CFG-01 already use for their own
 * `lib/iam2-client.ts` (services/sec1/src/lib/iam2-client.ts, services/cfg1/src/lib/
 * iam2-client.ts) — not imported from either, F3(c) applies between every pair of service
 * directories.
 *
 * Wraps exactly ONE CFG-01 route: `POST /internal/cfg1/features/evaluate`. Never calls
 * `verify-decision` — approved Phase 1 design decision #10: every Phase 1 gate check is actioned
 * in the SAME request it is checked in (class-claim time, submit time), so there is no window
 * between decision and use for a bounded-reuse token to protect. No raw CFG-01 decision token is
 * ever requested, returned, or stored by this client.
 *
 * FAIL-CLOSED, always: a network error, a non-2xx response, a malformed/unexpected response
 * body, or a genuine `deny` decision are ALL treated as "not allowed" — never treated as a grant.
 * Same discipline `services/cfg1/src/lib/iam2-client.ts`'s own `checkPermission` already applies
 * to its identical dependency shape.
 *
 * ---------------------------------------------------------------------------------------
 * `onboardingFeatureCodeForClass` — the structural retail/unknown-block mechanism.
 * ---------------------------------------------------------------------------------------
 * Approved Phase 1 design decision #8: retail and unknown map to `onboarding.retail_default`,
 * which CFG-01's own accepted Phase 1 seed data (migration 014) permanently prohibits (Doc00
 * §10.2A / MSR CLT-RULE-001). CLT-01 performs NO local special-casing of retail/unknown beyond
 * this mapping — the block is structural (CFG-01's prohibited registry), not a CLT-01-side
 * conditional, mirroring CFG-01's own "structural, not merely conventional" philosophy for the
 * `exchange.` prefix guard in `lib/decision.ts`'s `isFeatureMutationBlocked`.
 */
export type Clt1ClientClass = "institutional" | "hnwi" | "professional" | "retail" | "unknown";

export function onboardingFeatureCodeForClass(clientClass: Clt1ClientClass): string {
  switch (clientClass) {
    case "institutional":
      return "onboarding.institutional";
    case "hnwi":
      return "onboarding.hnwi";
    case "professional":
      return "onboarding.professional";
    case "retail":
    case "unknown":
    default:
      return "onboarding.retail_default";
  }
}

export interface Cfg1ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface EvaluateOnboardingGateInput {
  clientClass: Clt1ClientClass;
  /** CLT-01's own `client_application.application_id` — passed as CFG-01's `client_id` field. */
  applicationId: string;
  environment: string;
}

/**
 * Safe, storable decision evidence only — no raw decision token, no full CFG-01 response body.
 * `decisionId` is an opaque, non-secret audit reference (like CFG-01's own decision_id), safe to
 * persist and safe to surface in a non-PII read response.
 */
export interface OnboardingGateResult {
  allowed: boolean;
  featureCode: string;
  decisionId: string | null;
  reasonCode: string;
  evaluatedAtUtc: string;
}

interface Cfg1EvaluateResponseBody {
  success: boolean;
  data?: {
    decision?: string;
    reason_code?: string;
    decision_id?: string;
  };
}

/** Sentinel reason code used when CFG-01 could not be reached or returned something unparseable —
 * distinguishes "CFG-01 said no" from "CFG-01 was not reachable", though both fail closed
 * identically as `allowed: false` for authorization purposes. */
const UNAVAILABLE_REASON_CODE = "cfg1_unavailable";

export async function evaluateOnboardingGate(
  config: Cfg1ClientConfig,
  input: EvaluateOnboardingGateInput,
): Promise<OnboardingGateResult> {
  const featureCode = onboardingFeatureCodeForClass(input.clientClass);
  const evaluatedAtUtc = new Date().toISOString();
  const doFetch = config.fetchImpl ?? fetch;

  try {
    const res = await doFetch(`${config.baseUrl}/internal/cfg1/features/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        feature_code: featureCode,
        action: "onboard",
        environment: input.environment,
        client_id: input.applicationId,
        client_class: input.clientClass,
        caller_module: "CLT-01",
      }),
    });

    // Non-2xx -> fail closed. CFG-01's own evaluate() route always returns 200 with a decision
    // field for an ORDINARY deny (prohibited/unknown/stale/kill-switch) — a non-2xx here means
    // something is structurally wrong (e.g. CFG1_CONFIG_INTEGRITY_FAILED, CFG1_AUDIT_REQUIRED,
    // CFG1_DECISION_ENGINE_UNAVAILABLE), never a legitimate decision to interpret.
    if (!res.ok) {
      return { allowed: false, featureCode, decisionId: null, reasonCode: UNAVAILABLE_REASON_CODE, evaluatedAtUtc };
    }

    const body = (await res.json()) as Cfg1EvaluateResponseBody;
    if (!body?.success || !body.data?.decision) {
      return { allowed: false, featureCode, decisionId: null, reasonCode: UNAVAILABLE_REASON_CODE, evaluatedAtUtc };
    }

    return {
      allowed: body.data.decision === "allow",
      featureCode,
      decisionId: body.data.decision_id ?? null,
      reasonCode: body.data.reason_code ?? UNAVAILABLE_REASON_CODE,
      evaluatedAtUtc,
    };
  } catch {
    // Network error / timeout / malformed JSON -> fail closed, never treated as an allow.
    return { allowed: false, featureCode, decisionId: null, reasonCode: UNAVAILABLE_REASON_CODE, evaluatedAtUtc };
  }
}
