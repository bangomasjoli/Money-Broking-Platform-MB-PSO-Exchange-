/**
 * Wallet & Payout Destinations — data layer. UI Phase 2E.
 *
 * Every type/field below mirrors the ACTUAL governed WLT-01 public client contract, verified
 * directly against the backend source this turn — never invented:
 *
 * - `PublicWalletDestination` / `PublicFiatPayoutDestination` — field-for-field identical to
 *   `platform/services/wlt1/src/lib/public/dto.ts`'s own `publicWalletDestinationResponse`/
 *   `publicFiatDestinationResponse` (the SOLE safe-projection point for every public destination
 *   response — list, single-read, and registration all return exactly these shapes).
 * - `DESTINATION_STATUSES` — the exact `ALLOWED_STATUSES` tuple from
 *   `platform/services/wlt1/src/routes/public/destinations.ts`. No status invented, none omitted.
 * - `SUPPORTED_CHAIN_NETWORKS` — the exact (chain, network) pairs registered in
 *   `platform/services/wlt1/src/lib/address/index.ts` (`ETHEREUM_MAINNET`, `TRON_MAINNET`). No
 *   third chain exists in the backend registry — a future chain must not be added here first.
 * - `APAC_BANK_COUNTRIES`/currency/rail mapping — the exact frozen registry from
 *   `platform/services/wlt1/src/lib/fiat/country-profiles.ts` (MY/SG/HK/ID only, v1 scope is
 *   EXACTLY four APAC markets per that file's own header comment).
 *
 * Deliberately ABSENT, because the public contract does not return them (verified by reading
 * `dto.ts` directly — an explicit allowlist construction, not a spread of an internal row):
 * first-use state, limits/velocity/concentration thresholds, maker-checker approver/queue/SoD
 * detail, evidence/audit trail, current Proof-of-Control verification status (no public GET
 * exists for it — only `POST .../proof-of-control/challenges` and `.../verify`, both requiring a
 * live cryptographic wallet signature, out of scope for this UI-first turn), any balance/ledger/
 * custody/settlement figure (WLT-01 does not own any of those — `UI-04` §35.20's ownership
 * boundary), `beneficiary_name` for fiat destinations (submitted at registration but NOT echoed
 * back by the public read contract — `PublicFiatPayoutDestination` has no such field), and
 * `updated_at` (only `created_at_utc` exists — there is no "last updated" timestamp to show).
 */

// ---------------------------------------------------------------------------
// Governed backend contract — mirrors dto.ts exactly.
// ---------------------------------------------------------------------------

export const DESTINATION_STATUSES = [
  "draft",
  "pending_screening",
  "pending_review",
  "approved_pending_cooling",
  "active",
  "revoked",
] as const;
export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export interface PublicWalletDestination {
  destination_id: string;
  destination_type: "wallet";
  status: DestinationStatus;
  chain: string;
  network: string;
  address_masked: string;
  memo_tag_present: boolean;
  wallet_type: "hosted" | "unhosted" | "unknown";
  beneficiary_relationship: "self" | "related_party" | "third_party";
  created_at_utc: string;
}

export interface PublicFiatPayoutDestination {
  destination_id: string;
  destination_type: "fiat_payout";
  status: DestinationStatus;
  bank_country: "MY" | "SG" | "HK" | "ID";
  currency: "MYR" | "SGD" | "HKD" | "IDR";
  rail: "apac_local_my" | "apac_local_sg" | "apac_local_hk" | "apac_local_id";
  bank_identifier: string;
  branch_identifier: string | null;
  account_identifier_masked: string;
  beneficiary_type: "individual" | "corporate";
  created_at_utc: string;
}

export type PublicDestination = PublicWalletDestination | PublicFiatPayoutDestination;

// ---------------------------------------------------------------------------
// Governed registration inputs — mirrors the two public POST body schemas exactly.
// ---------------------------------------------------------------------------

/** Exact `(chain, network)` pairs the backend's address-canonicalisation registry supports. */
export const SUPPORTED_CHAIN_NETWORKS = [
  { chain: "ethereum", network: "mainnet", label: "Ethereum — Mainnet" },
  { chain: "tron", network: "mainnet", label: "Tron — Mainnet" },
] as const;

export const WALLET_TYPES = [
  { value: "hosted", label: "Hosted (exchange/custodian-held)" },
  { value: "unhosted", label: "Unhosted (self-custodied)" },
  { value: "unknown", label: "Unknown" },
] as const;

export const BENEFICIARY_RELATIONSHIPS = [
  { value: "self", label: "Self (client's own destination)" },
  { value: "related_party", label: "Related party" },
  { value: "third_party", label: "Third party" },
] as const;

/** The frozen v1 APAC country/currency/rail registry — MY/SG/HK/ID only, no fifth market. */
export const APAC_BANK_PROFILES = [
  { country: "MY", countryLabel: "Malaysia", currency: "MYR", rail: "apac_local_my", branchRequired: false },
  { country: "SG", countryLabel: "Singapore", currency: "SGD", rail: "apac_local_sg", branchRequired: false },
  { country: "HK", countryLabel: "Hong Kong", currency: "HKD", rail: "apac_local_hk", branchRequired: true },
  { country: "ID", countryLabel: "Indonesia", currency: "IDR", rail: "apac_local_id", branchRequired: false },
] as const;

export const BENEFICIARY_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "corporate", label: "Corporate" },
] as const;

// ---------------------------------------------------------------------------
// Human-readable label mapping — every value traces to a governed backend state; nothing invented
// (no "Verified"/"Trusted"/"Safe"/"Approved by AIX" — none of those is a governed status).
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<DestinationStatus, string> = {
  draft: "Draft",
  pending_screening: "Screening in Progress",
  pending_review: "Pending Review",
  approved_pending_cooling: "Approved — Cooling-Off",
  active: "Active",
  revoked: "Revoked",
};

/** Coarse semantic category per `UI-04` §21 — drives icon choice only, never a fill-color-only signal. */
export const STATUS_CATEGORY: Record<DestinationStatus, "neutral" | "pending" | "active" | "blocked"> = {
  draft: "neutral",
  pending_screening: "pending",
  pending_review: "pending",
  approved_pending_cooling: "pending",
  active: "active",
  revoked: "blocked",
};

export function destinationTypeLabel(type: PublicDestination["destination_type"]): string {
  return type === "wallet" ? "Wallet" : "Bank Payout";
}

export function walletTypeLabel(value: PublicWalletDestination["wallet_type"]): string {
  return WALLET_TYPES.find((w) => w.value === value)?.label ?? value;
}

export function beneficiaryRelationshipLabel(value: PublicWalletDestination["beneficiary_relationship"]): string {
  return BENEFICIARY_RELATIONSHIPS.find((b) => b.value === value)?.label ?? value;
}

export function beneficiaryTypeLabel(value: PublicFiatPayoutDestination["beneficiary_type"]): string {
  return BENEFICIARY_TYPES.find((b) => b.value === value)?.label ?? value;
}

export function chainLabel(chain: string): string {
  if (chain === "ethereum") return "Ethereum";
  if (chain === "tron") return "Tron";
  return chain;
}

export function networkLabel(network: string): string {
  return network === "mainnet" ? "Mainnet" : network;
}

export function countryLabel(country: PublicFiatPayoutDestination["bank_country"]): string {
  return APAC_BANK_PROFILES.find((p) => p.country === country)?.countryLabel ?? country;
}

/** Destination row's primary identifying line — masked address for wallets, masked account for payouts. */
export function primaryIdentifier(destination: PublicDestination): string {
  return destination.destination_type === "wallet" ? destination.address_masked : destination.account_identifier_masked;
}

/** Destination row's network/rail context line. */
export function networkContext(destination: PublicDestination): string {
  return destination.destination_type === "wallet"
    ? `${chainLabel(destination.chain)} · ${networkLabel(destination.network)}`
    : `${countryLabel(destination.bank_country)} · ${destination.currency}`;
}

export function formatRegisteredDate(createdAtUtc: string): string {
  const date = new Date(createdAtUtc);
  if (Number.isNaN(date.getTime())) return createdAtUtc;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

// ---------------------------------------------------------------------------
// Demo fixtures — UI-first, no backend/API integration this turn (`UI-04` §35's Phase 2E scope).
// Fictitious values only: obviously non-production addresses/account numbers, no real bank
// identifiers, no real client/company names. 5 rows, exercising 5 of the 6 governed statuses.
// ---------------------------------------------------------------------------

export const DEMO_DESTINATIONS: PublicDestination[] = [
  {
    destination_id: "demo-dest-001",
    destination_type: "wallet",
    status: "active",
    chain: "ethereum",
    network: "mainnet",
    address_masked: "0x71C7••••••••976F",
    memo_tag_present: false,
    wallet_type: "hosted",
    beneficiary_relationship: "self",
    created_at_utc: "2026-06-02T09:14:00Z",
  },
  {
    destination_id: "demo-dest-002",
    destination_type: "wallet",
    status: "pending_screening",
    chain: "tron",
    network: "mainnet",
    address_masked: "TLa2f6••••••••Zk9m",
    memo_tag_present: false,
    wallet_type: "unhosted",
    beneficiary_relationship: "self",
    created_at_utc: "2026-08-21T15:47:00Z",
  },
  {
    destination_id: "demo-dest-003",
    destination_type: "fiat_payout",
    status: "pending_review",
    bank_country: "MY",
    currency: "MYR",
    rail: "apac_local_my",
    bank_identifier: "DEMOMYK1",
    branch_identifier: null,
    account_identifier_masked: "••••4821",
    beneficiary_type: "individual",
    created_at_utc: "2026-08-30T04:02:00Z",
  },
  {
    destination_id: "demo-dest-004",
    destination_type: "fiat_payout",
    status: "approved_pending_cooling",
    bank_country: "SG",
    currency: "SGD",
    rail: "apac_local_sg",
    bank_identifier: "DEMOSGS1",
    branch_identifier: null,
    account_identifier_masked: "••••7790",
    beneficiary_type: "corporate",
    created_at_utc: "2026-09-05T11:30:00Z",
  },
  {
    destination_id: "demo-dest-005",
    destination_type: "wallet",
    status: "revoked",
    chain: "ethereum",
    network: "mainnet",
    address_masked: "0x9A2B••••••••11Fc",
    memo_tag_present: false,
    wallet_type: "unknown",
    beneficiary_relationship: "third_party",
    created_at_utc: "2026-03-11T08:55:00Z",
  },
];
