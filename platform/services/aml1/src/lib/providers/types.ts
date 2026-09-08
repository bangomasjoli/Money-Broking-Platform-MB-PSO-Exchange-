/**
 * AML-01 Phase 3B — screening provider adaptor boundary (types only). No route handler and no
 * caller outside `routes/screening.ts` may reach past this boundary into a concrete provider
 * implementation — every provider is selected through `registry.ts`, never imported directly.
 *
 * `ScreeningProvider` is the ONLY shape a screening provider (stub or, in a future phase, a real
 * vendor adaptor) may implement. `screen()` returns a Promise so a real HTTP-backed adaptor fits
 * the same interface as the in-process deterministic stub — the route calls `screenViaProvider`
 * (registry.ts), which is timeout-bounded regardless of which provider is behind it.
 */

export const SUBJECT_NATURES = ["individual", "entity"] as const;
export type SubjectNature = (typeof SUBJECT_NATURES)[number];

/**
 * The MINIMIZED payload AML-01 sends to a provider — never `subject_ref`/`screening_request_id`/
 * `requested_by`/`provenance` (internal identifiers, no screening value, needless correlation
 * surface for a real vendor). `registration_number` is entity-only; `date_of_birth`/`nationality`
 * are individual-only — enforced by `lib/screening.ts`'s `buildProviderScreeningPayload`, never by
 * this type alone (a provider implementation must not assume the caller enforced it).
 */
export interface ProviderScreeningPayload {
  name: string;
  subject_nature: SubjectNature;
  country?: string;
  registration_number?: string;
  date_of_birth?: string;
  nationality?: string;
}

/** A single UN-normalized match as reported by the provider. `category` is the provider's OWN raw
 * category string — `lib/screening.ts`'s `normalizeProviderMatches` maps it onto AML-01's closed
 * `sanctions`/`pep`/`adverse_media` set, or fails closed if it cannot. */
export interface ProviderRawMatch {
  category: string;
  score: number | null;
  list_source: string;
  matched_name: string;
  match_detail: string | null;
}

/**
 * `kind: "screened"` — the provider completed a screen (zero-or-more raw matches; normalization
 * happens downstream, never here). `kind: "unavailable"` — the provider could not be reached or
 * declined to answer (network error, timeout, 5xx-equivalent). `kind: "invalid_response"` — the
 * provider responded but its response could not be parsed/trusted (malformed body) — DISTINCT from
 * `unavailable` so a later operator can tell "vendor down" from "vendor answered something we
 * cannot trust" apart, though both map to the same fail-closed screening outcome (never `clear`).
 */
export type ProviderScreeningOutcome =
  | { kind: "screened"; listVersion: string | null; providerReferenceId: string | null; rawMatches: ProviderRawMatch[] }
  | { kind: "unavailable"; reasonCode: string }
  | { kind: "invalid_response"; reasonCode: string };

export interface ScreeningProvider {
  /** Stable identity stored in `screening_result.provider_ref` / `screening_provider_attempt.provider_id`. */
  readonly providerId: string;
  /** This adaptor's own version, stored in `screening_provider_attempt.provider_adaptor_version` — distinct from `listVersion` (the provider's list/data version, reported per-call). */
  readonly adaptorVersion: string;
  screen(payload: ProviderScreeningPayload): Promise<ProviderScreeningOutcome>;
}
