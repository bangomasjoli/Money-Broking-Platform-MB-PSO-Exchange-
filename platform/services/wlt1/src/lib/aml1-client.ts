/**
 * WLT-01 -> AML-01 HTTP client (Phase 4A-2). The ONLY way WLT-01 may consume AML-01's synchronous
 * pre-transaction screening gate — never import services/aml1/src/** (F3(c) module-import
 * boundary). WLT-01's own fresh copy of the internal-client shape established by
 * `lib/clt1-client.ts`/`lib/iam2-client.ts` — not imported from either.
 *
 * Wraps exactly ONE AML-01 route: `POST /internal/aml1/pre-transaction/screen` (AML-01 Phase 3E,
 * accepted). Bounded by a 5s timeout (mirrors `lib/clt1-client.ts`'s own `CLT1_CLIENT_TIMEOUT_MS`)
 * so a hung AML-01 can never hang a WLT-01 evaluate-use call indefinitely. No retry.
 *
 * FAIL-CLOSED, always — collapsed into exactly two outcomes for the caller:
 *   - `"allow"` — every validation below passed AND AML-01's own decision was `allow`.
 *   - `"not_allow"` — a LEGITIMATE AML business outcome (`review`/`deny`, or an unrecognised
 *     decision value received on an otherwise-valid HTTP 200 response). WLT NEVER reinterprets
 *     AML's own `reason_code`; its own business-deny reason is always the single frozen
 *     `aml_not_allowed`, regardless of which AML reason produced the non-allow outcome.
 *   - `"unavailable"` — a TECHNICAL failure: network error, timeout, non-2xx, malformed/
 *     unparseable body, an invalid response shape, a binding mismatch (`client_id`/
 *     `requested_action` do not match what was sent), an unparseable/invalid `decision_id` or
 *     timestamp, `valid_until_utc` not after `evaluated_at_utc`, `valid_until_utc` already at or
 *     before the caller-supplied authoritative `nowUtc`, or (WLT's own defensive check) an empty
 *     `evidence_provider_ids` on an `allow`. This maps to `WLT1_AML_GATE_UNAVAILABLE` (503) at the
 *     route layer — never a decision, never a token.
 *
 * `nowUtc` is supplied by the CALLER (the route's own authoritative `SELECT now()` snapshot) —
 * this client never reads a clock itself, so "is this decision already stale" is judged against
 * the same authoritative instant the rest of evaluate-use's gates use.
 */
export interface Aml1ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow AML-01 can never block a WLT-01 evaluate-use call indefinitely. */
const AML1_CLIENT_TIMEOUT_MS = 5000;

const AML1_DECISION_ID_REGEX = /^aml1ptd_[0-9a-f-]{36}$/;

export interface ScreenPreTransactionInput {
  clientId: string;
  subjectRefs: readonly string[];
  destinationRef: string;
  /** OPTIONAL — omitted entirely (never sent as `null`) for a fiat destination, which has no
   * chain/network identity. AML-01's own pre-transaction route schema already treats both as
   * optional (`Type.Optional`) — this client's own request body simply omits the keys rather than
   * sending them as `undefined`/`null`, since `JSON.stringify` would otherwise drop an `undefined`
   * value silently anyway; the explicit conditional spread below makes that omission intentional
   * and visible rather than accidental. */
  chain?: string;
  network?: string;
  /** Authoritative "now" — see this file's own header comment. */
  nowUtc: Date;
}

export type ScreenPreTransactionResult =
  | { outcome: "allow"; decisionId: string; validUntilUtc: Date; evidenceProviderIds: readonly string[] }
  | { outcome: "not_allow" }
  | { outcome: "unavailable" };

interface Aml1ResponseBody {
  success?: boolean;
  data?: {
    decision?: string;
    decision_id?: string;
    reason_code?: string;
    evaluated_at_utc?: string;
    valid_until_utc?: string;
    evidence_provider_ids?: unknown;
    client_id?: string;
    requested_action?: string;
  };
}

function parseStrictUtcTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip check — reject a value that parses but isn't itself a valid ISO instant string
  // (e.g. a bare date with no time component would still be "wrong shape" for this contract).
  return parsed;
}

export async function screenPreTransaction(config: Aml1ClientConfig, input: ScreenPreTransactionInput): Promise<ScreenPreTransactionResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/internal/aml1/pre-transaction/screen`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        client_id: input.clientId,
        subject_refs: input.subjectRefs.map((subjectRef) => ({ subject_type: "authorised_party", subject_ref: subjectRef })),
        requested_action: "destination_use",
        caller_module: "WLT-01",
        destination_ref: input.destinationRef,
        ...(input.chain !== undefined ? { chain: input.chain } : {}),
        ...(input.network !== undefined ? { network: input.network } : {}),
      }),
      signal: AbortSignal.timeout(AML1_CLIENT_TIMEOUT_MS),
    });
  } catch {
    // Network error / timeout -> fail closed.
    return { outcome: "unavailable" };
  }

  if (!res.ok) {
    // AML-01 Phase 3E's own contract: legitimate outcomes (allow/review/deny) are ALWAYS 200 —
    // a non-2xx here means something is structurally wrong, never a legitimate decision.
    return { outcome: "unavailable" };
  }

  let body: Aml1ResponseBody;
  try {
    body = (await res.json()) as Aml1ResponseBody;
  } catch {
    return { outcome: "unavailable" };
  }

  if (!body?.success || !body.data || typeof body.data !== "object") {
    return { outcome: "unavailable" };
  }
  const data = body.data;

  // Binding — the response must echo back exactly what was requested.
  if (data.client_id !== input.clientId || data.requested_action !== "destination_use") {
    return { outcome: "unavailable" };
  }

  if (typeof data.decision !== "string") {
    return { outcome: "unavailable" };
  }
  if (data.decision === "review" || data.decision === "deny") {
    return { outcome: "not_allow" };
  }
  if (data.decision !== "allow") {
    // Unrecognised decision value — never a legitimate business outcome to interpret.
    return { outcome: "unavailable" };
  }

  // decision === "allow" from here — every field below MUST validate, or this is a technical
  // failure (never an allow escaping on a malformed affirmative response).
  if (typeof data.decision_id !== "string" || !AML1_DECISION_ID_REGEX.test(data.decision_id)) {
    return { outcome: "unavailable" };
  }
  const evaluatedAtUtc = parseStrictUtcTimestamp(data.evaluated_at_utc);
  const validUntilUtc = parseStrictUtcTimestamp(data.valid_until_utc);
  if (!evaluatedAtUtc || !validUntilUtc) {
    return { outcome: "unavailable" };
  }
  if (validUntilUtc.getTime() <= evaluatedAtUtc.getTime()) {
    return { outcome: "unavailable" };
  }
  if (validUntilUtc.getTime() <= input.nowUtc.getTime()) {
    // Already expired by the time WLT is evaluating it — an abnormal, technical condition, never
    // treated as "evidence_expiring" (that business reason is reserved for the TTL-formula case,
    // not for AML-01 itself returning a decision that is already stale).
    return { outcome: "unavailable" };
  }
  if (typeof data.reason_code !== "string" || data.reason_code.length === 0) {
    return { outcome: "unavailable" };
  }
  if (!Array.isArray(data.evidence_provider_ids) || data.evidence_provider_ids.length === 0 || !data.evidence_provider_ids.every((id) => typeof id === "string")) {
    // WLT's OWN defensive non-empty-provenance check (Part I of the freeze) — never trusts AML-01's
    // own internal invariant alone.
    return { outcome: "unavailable" };
  }

  return {
    outcome: "allow",
    decisionId: data.decision_id,
    validUntilUtc,
    evidenceProviderIds: data.evidence_provider_ids as readonly string[],
  };
}
