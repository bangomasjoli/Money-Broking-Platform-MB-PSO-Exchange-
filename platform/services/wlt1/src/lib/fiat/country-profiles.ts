/**
 * WLT-01 Fiat Payout Destinations (APAC) — the ONE frozen country-profile registry. Implements
 * the FROZEN architecture (APAC-First Local-Account Architecture Pivot, CLOSED) exactly — no new
 * architectural decisions are made in this file.
 *
 * TECHNICAL validation belongs in code (this registry); OPERATIONAL activation belongs in
 * `wlt1.fiat_rail_coverage` (`lib/fiat/rail-coverage.ts`) — the two are deliberately independent.
 * A country profile is ALWAYS selected from the destination's own persisted `bank_country`
 * (never from any caller-supplied validator/profile identifier) — `resolveCountryProfile` is the
 * only lookup function, and it takes a country code, never a name.
 *
 * v1 technical scope is EXACTLY four APAC markets — no fifth market, no silent currency addition
 * (USD/EUR/CNY/CNH/JPY/AUD or any other). Internal rail identifiers are deliberately NEUTRAL
 * (`apac_local_*`) — never `duitnow`/`fast`/`fps`/`bifast`, which would imply AIX is a direct
 * participant in those national real-time payment schemes; AIX is not. The scheme mapping below
 * is documentation-only.
 *
 * Length bounds are DELIBERATELY permissive structural ranges, not authoritative per-bank rules —
 * no national standard fixes a single account-number length in any of these four markets, and
 * account length genuinely varies by institution. NO CHECKSUM ALGORITHM IS INVENTED for any
 * market — none is authoritatively known for MY/SG/HK/ID local bank accounts; inventing one would
 * be exactly the fabrication this architecture explicitly forbids.
 *
 *   MY (Malaysia)   -> MYR, apac_local_my,  8-20 digits, no branch.
 *   SG (Singapore)  -> SGD, apac_local_sg,  8-20 digits, no branch.
 *   HK (Hong Kong)  -> HKD, apac_local_hk,  6-12 digits, branch REQUIRED (exactly 3 digits) — HK
 *                      domestic routing genuinely has a separate branch component; MY/SG/ID do
 *                      not.
 *   ID (Indonesia)  -> IDR, apac_local_id,  8-20 digits, no branch.
 *
 * Scheme-compatibility note (documentation only, never asserted in code/audit/response): MY ~
 * DuitNow-compatible destination model, SG ~ FAST-compatible, HK ~ FPS-compatible, ID ~
 * BI-FAST-compatible. AIX does not claim direct participation in any of these schemes.
 */

export const APAC_BANK_COUNTRIES = ["MY", "SG", "HK", "ID"] as const;
export type ApacBankCountry = (typeof APAC_BANK_COUNTRIES)[number];

export const ACCOUNT_IDENTIFIER_TYPE = "local_account" as const;
export const BANK_IDENTIFIER_TYPE = "bic" as const;

export interface CountryProfile {
  readonly bankCountry: ApacBankCountry;
  readonly currency: string;
  readonly rail: string;
  readonly accountIdentifierType: typeof ACCOUNT_IDENTIFIER_TYPE;
  readonly bankIdentifierType: typeof BANK_IDENTIFIER_TYPE;
  readonly branchRequired: boolean;
  /** Exactly the digit-length the branch code must be when `branchRequired` is true. Unused when
   * `branchRequired` is false. */
  readonly branchLength: number;
  readonly accountMinLength: number;
  readonly accountMaxLength: number;
}

export const COUNTRY_PROFILES: Readonly<Record<ApacBankCountry, CountryProfile>> = Object.freeze({
  MY: Object.freeze({
    bankCountry: "MY",
    currency: "MYR",
    rail: "apac_local_my",
    accountIdentifierType: ACCOUNT_IDENTIFIER_TYPE,
    bankIdentifierType: BANK_IDENTIFIER_TYPE,
    branchRequired: false,
    branchLength: 0,
    accountMinLength: 8,
    accountMaxLength: 20,
  }),
  SG: Object.freeze({
    bankCountry: "SG",
    currency: "SGD",
    rail: "apac_local_sg",
    accountIdentifierType: ACCOUNT_IDENTIFIER_TYPE,
    bankIdentifierType: BANK_IDENTIFIER_TYPE,
    branchRequired: false,
    branchLength: 0,
    accountMinLength: 8,
    accountMaxLength: 20,
  }),
  HK: Object.freeze({
    bankCountry: "HK",
    currency: "HKD",
    rail: "apac_local_hk",
    accountIdentifierType: ACCOUNT_IDENTIFIER_TYPE,
    bankIdentifierType: BANK_IDENTIFIER_TYPE,
    branchRequired: true,
    branchLength: 3,
    accountMinLength: 6,
    accountMaxLength: 12,
  }),
  ID: Object.freeze({
    bankCountry: "ID",
    currency: "IDR",
    rail: "apac_local_id",
    accountIdentifierType: ACCOUNT_IDENTIFIER_TYPE,
    bankIdentifierType: BANK_IDENTIFIER_TYPE,
    branchRequired: false,
    branchLength: 0,
    accountMinLength: 8,
    accountMaxLength: 20,
  }),
});

export function isApacBankCountry(value: string): value is ApacBankCountry {
  return (APAC_BANK_COUNTRIES as readonly string[]).includes(value);
}

/** The ONE lookup function — always keyed by `bank_country`, never by rail/currency/a caller-
 * supplied validator name. Returns `undefined` for anything outside the frozen four-market set. */
export function resolveCountryProfile(bankCountry: string): CountryProfile | undefined {
  if (!isApacBankCountry(bankCountry)) return undefined;
  return COUNTRY_PROFILES[bankCountry];
}
