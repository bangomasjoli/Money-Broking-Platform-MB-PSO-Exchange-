/**
 * AML-01 Phase 3B — the deterministic stub provider, now behind the `ScreeningProvider` adaptor
 * boundary (Phase 1 through Phase 3A had this same fixture-driven lookup inlined directly into
 * `lib/screening.ts`'s own `screen()` — moved here verbatim, byte-identical fixture names/scores/
 * list sources, so every pre-Phase-3B test that screens `"AML1 TEST SANCTIONED ENTITY"` etc. keeps
 * passing unmodified). Still no external network call, no real watchlist/sanctions/PEP/
 * adverse-media list data, no fuzzy matching, no entity-resolution engine, no scoring engine —
 * replacing this with a real vendor adaptor is explicitly out of scope for every phase until a
 * real-vendor phase is planned.
 *
 * Three NEW deterministic fixtures added this phase, each proving a distinct Phase 3B fail-closed
 * path that could not be exercised before the provider boundary existed:
 *   - `"AML1 TEST PROVIDER MALFORMED"` -> `kind: "invalid_response"` — simulates an ADAPTOR-level
 *     malformed/untrustworthy response (distinct from `unavailable` — the provider DID answer, but
 *     its answer cannot be trusted).
 *   - `"AML1 TEST UNKNOWN CATEGORY"` -> `kind: "screened"` with a raw category string outside
 *     AML-01's closed `sanctions`/`pep`/`adverse_media` set — proves the NORMALIZATION-level
 *     fail-closed path (`lib/screening.ts`'s `normalizeProviderMatches`), never silently bucketed
 *     into `adverse_media` and never silently dropped.
 *   - `"AML1 TEST NO SCORE MATCH"` -> a single sanctions match with `score: null` — proves a
 *     provider may legitimately supply no confidence score (Phase 3B decision D3) without that
 *     being treated as a malformed response.
 */
import type { ProviderScreeningOutcome, ProviderScreeningPayload, ProviderRawMatch, ScreeningProvider } from "./types.js";

export const STUB_PROVIDER_ID = "stub-v1";
export const STUB_ADAPTOR_VERSION = "1";
const STUB_LIST_VERSION = "stub-list-v1";

function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Synthetic, clearly-labeled TEST fixtures only — never real sanctions/PEP/adverse-media list
 * data. Names are deliberately unmistakable ("AML1 TEST ...") so no real-world name could ever
 * collide with one. Byte-identical to the pre-Phase-3B fixtures in shape/values. */
const SYNTHETIC_TEST_FIXTURES: Record<string, ProviderRawMatch[]> = {
  "AML1 TEST SANCTIONED ENTITY": [
    { category: "sanctions", score: 0.95, list_source: "STUB_SANCTIONS", matched_name: "AML1 TEST SANCTIONED ENTITY", match_detail: null },
  ],
  "AML1 TEST PEP": [{ category: "pep", score: 0.85, list_source: "STUB_PEP", matched_name: "AML1 TEST PEP", match_detail: null }],
  "AML1 TEST ADVERSE MEDIA": [
    {
      category: "adverse_media",
      score: 0.7,
      list_source: "STUB_ADVERSE_MEDIA",
      matched_name: "AML1 TEST ADVERSE MEDIA",
      match_detail: "Synthetic test fixture — adverse-media snippet placeholder, not a real report.",
    },
  ],
  "AML1 TEST NO SCORE MATCH": [
    { category: "sanctions", score: null, list_source: "STUB_SANCTIONS", matched_name: "AML1 TEST NO SCORE MATCH", match_detail: null },
  ],
  "AML1 TEST UNKNOWN CATEGORY": [
    { category: "unknown_category_the_stub_never_emits_normally", score: 0.5, list_source: "STUB_UNKNOWN", matched_name: "AML1 TEST UNKNOWN CATEGORY", match_detail: null },
  ],
};

const PROVIDER_DOWN_FIXTURE_NAME = "AML1 TEST PROVIDER DOWN";
const PROVIDER_MALFORMED_FIXTURE_NAME = "AML1 TEST PROVIDER MALFORMED";

export const stubProvider: ScreeningProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(payload: ProviderScreeningPayload): Promise<ProviderScreeningOutcome> {
    const normalized = normalizeName(payload.name);

    if (normalized === PROVIDER_DOWN_FIXTURE_NAME) {
      return { kind: "unavailable", reasonCode: "provider_unavailable" };
    }
    if (normalized === PROVIDER_MALFORMED_FIXTURE_NAME) {
      return { kind: "invalid_response", reasonCode: "provider_malformed_response" };
    }

    const rawMatches = SYNTHETIC_TEST_FIXTURES[normalized] ?? [];
    return {
      kind: "screened",
      listVersion: STUB_LIST_VERSION,
      providerReferenceId: rawMatches.length > 0 ? "stub-ref-" + normalized.toLowerCase().replace(/\s+/g, "-") : null,
      rawMatches,
    };
  },
};
