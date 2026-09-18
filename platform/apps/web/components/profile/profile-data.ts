import { DEMO_CLIENT_STATE, KYC_CASE_LABELS } from "@/components/client/client-demo-data";

/**
 * Client Profile / Organisation — data layer. UI Phase 2G.
 *
 * Field/capability map (full record: `UI-04` §42.1) — every field here traces to a real governed
 * `CLT-01` model, verified against backend source this turn:
 *
 * - `AuthorisedPartyType` — the exact `AUTHORISED_PARTY_TYPES` tuple from
 *   `platform/services/clt1/src/lib/authorised-parties.ts` (`signatory`/`director`/`controller`/
 *   `ubo`). `ubo` is deliberately EXCLUDED from `AuthorisedPartyType` here — beneficial ownership
 *   is handled only via `UBO_ON_FILE` below (a minimal boolean summary), never listed alongside
 *   ordinary representatives or with any `ownership_percentage` detail (the real
 *   `authorised_party` row carries one, but it is sensitive and not shown).
 * - No representative NAME is shown anywhere — the real `authorised_party` table has no name
 *   field at all (`party_reference`, `party_type`, `ownership_percentage` only), so omitting a
 *   name here is more accurate to the real model, not less complete.
 * - `PROFILE_COMPLETENESS_ITEMS`'s "Compliance information" row reuses `KYC_CASE_LABELS` from the
 *   shared `client-demo-data.ts` module directly — the exact same value `UI Phase 2F`'s Overview
 *   page shows, never a second, possibly-inconsistent phrase like "Review required."
 *
 * Deliberately NOT modeled here, because no field exists anywhere in the governed `CLT-01`
 * source (verified by direct search this turn, not assumed) — registered address (no address
 * column/table found anywhere in `clt1`) and a distinct "primary contact person" (only a bare,
 * optional `applicant_email` exists, and only on the pre-approval `client_application` record,
 * never copied to the persisted `client_profile` — presenting it as an ongoing contact would
 * misrepresent its real scope). Full reasoning: `UI-04` §42.1/§42.3.
 */

export type AuthorisedPartyType = "signatory" | "director" | "controller";

export const AUTHORISED_PARTY_TYPE_LABELS: Record<AuthorisedPartyType, string> = {
  signatory: "Authorised Signatory",
  director: "Director",
  controller: "Controller",
};

export interface DemoAuthorisedParty {
  id: string;
  partyType: AuthorisedPartyType;
}

/** 2 rows — this turn's own "keep 1–2 rows maximum" instruction. */
export const DEMO_AUTHORISED_PARTIES: DemoAuthorisedParty[] = [
  { id: "demo-party-1", partyType: "director" },
  { id: "demo-party-2", partyType: "signatory" },
];

/** Minimal boolean summary only — no ownership percentage, no party count, no identity detail. */
export const UBO_ON_FILE = true;

export interface ProfileCompletenessItem {
  label: string;
  state: string;
}

export const PROFILE_COMPLETENESS_ITEMS: ProfileCompletenessItem[] = [
  { label: "Organisation details", state: "On file" },
  { label: "Authorised representatives", state: "On file" },
  { label: "Compliance information", state: KYC_CASE_LABELS[DEMO_CLIENT_STATE.kycCaseStatus] },
];
