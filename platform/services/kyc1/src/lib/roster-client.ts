/**
 * KYC-01 -> CLT-01 roster HTTP client (Phase 4B). KYC-01's own copy — never imports
 * `services/clt1/src/**` (F3(c) module-import boundary), same posture `lib/clt1-client.ts`
 * already established for the outcome-delivery dependency. Wraps CLT-01's ONE EXISTING Phase 4A
 * roster route, never a new CLT-01 route:
 *
 *   `GET /internal/clt1/applications/:application_id/kyc-roster` — the accepted, PII-free,
 *   application-keyed roster contract (`services/clt1/src/routes/kyc-roster.ts`). Internal
 *   service-token authentication ONLY — no `actor_id`, no IAM-02 permission — mirrors this file's
 *   own call shape exactly (a bare GET, one header, one timeout).
 *
 * CLT-01 REMAINS THE OWNER OF `roster_hash` — this client format-validates it
 * (`^sha256:[0-9a-f]{64}$`) but never recomputes it as the authoritative value. Independent
 * recomputation (proving CLT-01's own digest is genuinely a function of the roster content it
 * returned) is a TEST-ONLY defensive check, never production logic — see this module's own test
 * file.
 *
 * FAIL-CLOSED, always: a network error, a request timeout, a non-2xx response (including CLT-01's
 * own `CLT1_APPLICATION_NOT_FOUND`/404 and `CLT1_KYC_ROSTER_TOO_LARGE`/409 — a roster too large to
 * serve safely is exactly as unusable to KYC-01 as an unreachable CLT-01), a malformed/unparseable
 * response body, or a response that parses as JSON but fails ANY of this file's own strict shape
 * validation are ALL treated identically as `ok: false` — never partially trusted, never given a
 * best-effort roster. One discriminant is deliberately sufficient (no "was it a 404 vs a 409 vs
 * malformed JSON" distinction reaches the caller) — `routes/outcome-publication.ts` fails closed
 * with the SAME `KYC1_CLT_UNAVAILABLE`/not-publishable behaviour regardless of which sub-cause fired,
 * per the approved Phase 4B scope (no decorative per-cause error code).
 *
 * Every call is TIMEOUT-BOUNDED via `AbortSignal.timeout`, the identical convention
 * `lib/clt1-client.ts` already uses, so a hung CLT-01 can never hang a KYC-01 publish/deliver route
 * indefinitely. Never logs the CLT-01 internal-service-token and never logs the raw CLT-01 response
 * body.
 */
import type { Clt1ClientConfig } from "./clt1-client.js";

/** CLT-01's own `client_application.status` enum (`services/clt1/src/lib/applications.ts`'s
 * `ApplicationStatus`) — mirrored, not imported (F3(c)). Used only to validate the roster
 * response's `application_status` field is a genuine, known CLT-01 lifecycle value; KYC-01 itself
 * only ever treats `under_review` as eligible (see `isApplicationEligibleForKycReceipt` in
 * `routes/outcome-publication.ts`). */
const CLT1_APPLICATION_STATUSES = new Set(["draft", "submitted", "duplicate_review", "pending_kyc", "pending_aml", "under_review", "approved", "rejected", "held", "cancelled"]);

/** CLT-01's own `authorised_party.party_type`/`authority_status` enums (migration
 * `025_clt1_authorised_parties.cjs`) — mirrored, not imported. */
const CLT1_PARTY_TYPES = new Set(["signatory", "director", "controller", "ubo"]);
const CLT1_AUTHORITY_STATUSES = new Set(["pending", "active", "restricted", "rejected", "revoked", "suspended"]);

const ROSTER_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
/** Matches CLT-01 Phase 4A's own `KYC_ROSTER_MAX_PARTIES` — the roster contract is complete-or-
 * error, never paginated, so KYC-01 validates the SAME upper bound CLT-01 itself enforces. */
const MAX_ROSTER_PARTIES = 500;
/** Same bound `lib/clt1-client.ts` uses for the outcome-delivery call — a hung/slow CLT-01 can
 * never block a KYC-01 route indefinitely. */
const CLT1_ROSTER_CLIENT_TIMEOUT_MS = 5000;

export type Clt1PrimarySubjectType = "individual" | "entity";

export interface Clt1RosterParty {
  authorisedPartyId: string;
  partyType: string;
  authorityStatus: string;
  version: number;
}

export interface Clt1RosterResponse {
  applicationId: string;
  applicationStatus: string;
  primarySubjectType: Clt1PrimarySubjectType;
  /** Canonically ordered exactly as CLT-01 returned it (`authorised_party_id` ASC, codepoint) —
   * re-validated here, never re-sorted; a response that is NOT already correctly sorted is treated
   * as malformed (see `validateRosterShape`), not silently corrected. */
  authorisedParties: Clt1RosterParty[];
  partyCount: number;
  /** CLT-owned. Format-validated only — see this file's own header comment. */
  rosterHash: string;
}

/** One discriminant, deliberately — see this file's own header comment for why no sub-cause
 * (timeout vs 404 vs malformed JSON vs shape-invalid) is distinguished at this boundary. */
export type Clt1RosterFetchResult = { ok: true; roster: Clt1RosterResponse } | { ok: false; reasonCode: string };

/**
 * Strict shape validation — every rule the approved Phase 4B scope names, checked explicitly, in
 * order, returning `null` (never throwing) on the FIRST violation. `applicationId` is the
 * KYC-01-side value the caller requested the roster FOR — the response's own `application_id`
 * must echo it exactly, or the response is rejected as malformed (defends against a
 * misconfigured/misrouted CLT-01 base URL silently returning an unrelated application's roster).
 */
function validateRosterShape(requestedApplicationId: string, body: unknown): Clt1RosterResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.application_id !== "string" || b.application_id !== requestedApplicationId) return null;
  if (typeof b.application_status !== "string" || !CLT1_APPLICATION_STATUSES.has(b.application_status)) return null;
  if (b.primary_subject_type !== "individual" && b.primary_subject_type !== "entity") return null;
  if (!Array.isArray(b.authorised_parties)) return null;
  if (typeof b.party_count !== "number" || !Number.isInteger(b.party_count) || b.party_count < 0 || b.party_count > MAX_ROSTER_PARTIES) return null;
  if (b.party_count !== b.authorised_parties.length) return null;
  if (typeof b.roster_hash !== "string" || !ROSTER_HASH_PATTERN.test(b.roster_hash)) return null;

  const seenIds = new Set<string>();
  const parties: Clt1RosterParty[] = [];
  let previousId: string | null = null;
  for (const raw of b.authorised_parties) {
    if (typeof raw !== "object" || raw === null) return null;
    const p = raw as Record<string, unknown>;

    if (typeof p.authorised_party_id !== "string" || p.authorised_party_id.length === 0) return null;
    if (seenIds.has(p.authorised_party_id)) return null; // duplicate roster subject — malformed.
    seenIds.add(p.authorised_party_id);
    // Codepoint-ordering check — plain `<`, never `localeCompare` (the CFG-01 F-1 / CLT-01 Phase
    // 4A lesson applied on the READING side too, not only when CLT-01 itself computes the order).
    if (previousId !== null && !(previousId < p.authorised_party_id)) return null;
    previousId = p.authorised_party_id;

    if (typeof p.party_type !== "string" || !CLT1_PARTY_TYPES.has(p.party_type)) return null;
    if (typeof p.authority_status !== "string" || !CLT1_AUTHORITY_STATUSES.has(p.authority_status)) return null;
    if (typeof p.version !== "number" || !Number.isInteger(p.version) || p.version < 1) return null;

    parties.push({ authorisedPartyId: p.authorised_party_id, partyType: p.party_type, authorityStatus: p.authority_status, version: p.version });
  }

  return {
    applicationId: b.application_id,
    applicationStatus: b.application_status,
    primarySubjectType: b.primary_subject_type,
    authorisedParties: parties,
    partyCount: b.party_count,
    rosterHash: b.roster_hash,
  };
}

export async function fetchClt1KycRoster(config: Clt1ClientConfig, applicationId: string): Promise<Clt1RosterFetchResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}/internal/clt1/applications/${encodeURIComponent(applicationId)}/kyc-roster`, {
      method: "GET",
      headers: { "x-internal-service-token": config.internalServiceToken },
      signal: AbortSignal.timeout(CLT1_ROSTER_CLIENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Includes CLT1_APPLICATION_NOT_FOUND (404) and CLT1_KYC_ROSTER_TOO_LARGE (409) — both fail
      // closed identically to any other non-2xx, per this file's own header comment.
      return { ok: false, reasonCode: "clt1_roster_unavailable" };
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { ok: false, reasonCode: "clt1_roster_malformed_response" };
    }

    const envelope = parsed as { success?: boolean; data?: unknown } | null;
    if (!envelope || typeof envelope !== "object" || envelope.success !== true || envelope.data === undefined) {
      return { ok: false, reasonCode: "clt1_roster_malformed_response" };
    }

    const roster = validateRosterShape(applicationId, envelope.data);
    if (!roster) {
      return { ok: false, reasonCode: "clt1_roster_malformed_response" };
    }

    return { ok: true, roster };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, reasonCode: isTimeout ? "clt1_roster_timeout" : "clt1_roster_unreachable" };
  }
}
