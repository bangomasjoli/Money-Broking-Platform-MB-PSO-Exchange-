/**
 * WLT-01 Fiat Payout Destinations (APAC) — local-account/BIC canonicalisation, branch-identifier
 * validation, masking, canonical account-identity construction, and the deterministic account
 * fingerprint. Implements the FROZEN architecture (APAC-First Local-Account Architecture Pivot,
 * CLOSED) exactly — no new architectural decisions are made in this file. Pure, no I/O — every
 * function here is independently unit-testable.
 *
 * CANONICALISATION (frozen): strip all Unicode whitespace and `-`; every remaining character must
 * be a digit; LEADING ZEROS ARE PRESERVED, never trimmed — `"00123456"` and `"123456"` are
 * different accounts with different canonical forms and therefore different hashes. No checksum
 * of any kind is computed or validated — none is authoritatively known for MY/SG/HK/ID local bank
 * accounts.
 *
 * BIC validates the real ISO 9362 STRUCTURAL shape only (4 letters bank code + 2 letters ISO
 * 3166-1 country code + 2 alphanumeric location code + optional 3 alphanumeric branch code = 8 or
 * 11 characters) — a real, public, non-fabricated standard, not an invented checksum. The
 * embedded country code must equal the destination's own `bank_country`.
 *
 * CANONICAL ACCOUNT IDENTITY OBJECT (frozen, load-bearing): a structured object, never an
 * ambiguous concatenated string — `branch_identifier` is a KEY IN ITS OWN RIGHT, present only for
 * HK and OMITTED ENTIRELY (never serialized as `null`) for MY/SG/ID, so a HK `branch_identifier`
 * of `"004"` + `account_identifier` `"123456"` can never canonicalise to the same JSON text as
 * branch `"00412"` + account `"3456"` — the component boundary is structural, not
 * string-positional. Hashed via `@aix/foundation`'s `fingerprint()` (sorted-key canonical-JSON
 * SHA-256) — the same primitive every other WLT-01 natural-key/fingerprint computation uses,
 * never a hand-rolled hash.
 */
import { fingerprint } from "@aix/foundation";
import { resolveCountryProfile, type ApacBankCountry, type CountryProfile } from "./country-profiles.js";

export type AccountCanonicaliseReasonCode =
  | "empty"
  | "non_digit_character"
  | "all_zeros"
  | "below_minimum_length"
  | "above_maximum_length";

export type AccountCanonicaliseResult = { ok: true; canonical: string } | { ok: false; reasonCode: AccountCanonicaliseReasonCode };

const WHITESPACE_OR_DASH_PATTERN = /[\s-]/gu;
const DIGITS_ONLY_PATTERN = /^[0-9]+$/;
const ALL_ZEROS_PATTERN = /^0+$/;

/** Canonicalises a raw account-identifier string against a specific country profile's length
 * bounds. Strips Unicode whitespace and `-` first; the remainder must be digits only, non-empty,
 * not all-zero, and within `[accountMinLength, accountMaxLength]`. Leading zeros are never
 * trimmed. */
export function canonicaliseAccountIdentifier(raw: string, profile: CountryProfile): AccountCanonicaliseResult {
  const stripped = raw.replace(WHITESPACE_OR_DASH_PATTERN, "");
  if (stripped.length === 0) return { ok: false, reasonCode: "empty" };
  if (!DIGITS_ONLY_PATTERN.test(stripped)) return { ok: false, reasonCode: "non_digit_character" };
  if (ALL_ZEROS_PATTERN.test(stripped)) return { ok: false, reasonCode: "all_zeros" };
  if (stripped.length < profile.accountMinLength) return { ok: false, reasonCode: "below_minimum_length" };
  if (stripped.length > profile.accountMaxLength) return { ok: false, reasonCode: "above_maximum_length" };
  return { ok: true, canonical: stripped };
}

export type BicCanonicaliseReasonCode = "empty" | "invalid_structure" | "country_mismatch";

export type BicCanonicaliseResult = { ok: true; canonical: string } | { ok: false; reasonCode: BicCanonicaliseReasonCode };

/** ISO 9362 structural shape only: 4 letters + 2-letter country + 2 alphanumeric + optional 3
 * alphanumeric. No checksum — BIC has none. */
const BIC_STRUCTURE_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** Canonicalises (uppercase) and structurally validates a raw BIC, then confirms its embedded
 * ISO 3166-1 country component equals the expected `bank_country` — a BIC that is structurally
 * valid but names a different country is rejected as `country_mismatch`, never silently accepted. */
export function canonicaliseBic(raw: string, expectedBankCountry: ApacBankCountry): BicCanonicaliseResult {
  const canonical = raw.trim().toUpperCase();
  if (canonical.length === 0) return { ok: false, reasonCode: "empty" };
  if (!BIC_STRUCTURE_PATTERN.test(canonical)) return { ok: false, reasonCode: "invalid_structure" };
  const countryComponent = canonical.slice(4, 6);
  if (countryComponent !== expectedBankCountry) return { ok: false, reasonCode: "country_mismatch" };
  return { ok: true, canonical };
}

export type BranchValidateReasonCode = "required_but_missing" | "forbidden_but_present" | "wrong_length" | "non_digit_character";

export type BranchValidateResult = { ok: true; canonical: string | undefined } | { ok: false; reasonCode: BranchValidateReasonCode };

/** Validates a raw (optional) branch-identifier string against a country profile's own
 * requirement. HK: required, exactly `profile.branchLength` digits. MY/SG/ID: forbidden — any
 * supplied value (including a blank string) is a validation error, never silently ignored. */
export function validateBranchIdentifier(raw: string | undefined, profile: CountryProfile): BranchValidateResult {
  if (!profile.branchRequired) {
    if (raw !== undefined) return { ok: false, reasonCode: "forbidden_but_present" };
    return { ok: true, canonical: undefined };
  }
  if (raw === undefined || raw.length === 0) return { ok: false, reasonCode: "required_but_missing" };
  if (!DIGITS_ONLY_PATTERN.test(raw)) return { ok: false, reasonCode: "non_digit_character" };
  if (raw.length !== profile.branchLength) return { ok: false, reasonCode: "wrong_length" };
  return { ok: true, canonical: raw };
}

const MASK_PREFIX = "••••";

/** `"••••"` + the last 4 canonical digits. Accounts shorter than 4 digits are structurally
 * unregisterable (every profile's own `accountMinLength` is >= 6), so this is total. Computed
 * once at registration and persisted — no response path ever decrypts to recompute it. */
export function maskAccountIdentifier(canonicalAccountIdentifier: string): string {
  return MASK_PREFIX + canonicalAccountIdentifier.slice(-4);
}

/**
 * The frozen canonical account identity object — the SOLE structure ever hashed or encrypted.
 * `branchIdentifier` MUST be `undefined` (a key that will be OMITTED, never a `null` value) for
 * every non-HK profile; the caller (registration flow) is responsible for only ever passing a
 * defined value when `profile.branchRequired` is true. This function does not itself re-validate
 * that invariant — `validateBranchIdentifier` above is the enforcement point.
 */
export interface CanonicalAccountIdentity {
  account_identifier: string;
  account_identifier_type: "local_account";
  bank_country: ApacBankCountry;
  bank_identifier: string;
  bank_identifier_type: "bic";
  branch_identifier?: string;
}

export function buildCanonicalAccountIdentity(input: {
  accountIdentifier: string;
  bankCountry: ApacBankCountry;
  bankIdentifier: string;
  branchIdentifier?: string;
}): CanonicalAccountIdentity {
  const identity: CanonicalAccountIdentity = {
    account_identifier: input.accountIdentifier,
    account_identifier_type: "local_account",
    bank_country: input.bankCountry,
    bank_identifier: input.bankIdentifier,
    bank_identifier_type: "bic",
  };
  if (input.branchIdentifier !== undefined) {
    identity.branch_identifier = input.branchIdentifier;
  }
  return identity;
}

/** Sorted-key canonical JSON serialization of the flat canonical account identity object — the
 * SAME serialization discipline `@aix/foundation`'s own `fingerprint()` uses internally (that
 * internal serializer is not exported), used here as the ENCRYPTION plaintext (`lib/fiat/
 * encryption.ts`) so ciphertext is derived from a deterministic, unambiguous representation
 * rather than raw `JSON.stringify` key-insertion-order accident. */
export function canonicalStringify(identity: CanonicalAccountIdentity): string {
  const keys = Object.keys(identity).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + JSON.stringify((identity as unknown as Record<string, unknown>)[k])).join(",") + "}";
}

/** `fingerprint()` of the canonical account identity object — `@aix/foundation`'s existing
 * sorted-key canonical-JSON SHA-256 primitive, never a hand-rolled hash. Two structurally
 * different identities (different country, different leading-zero form, different branch
 * boundary) always hash differently; two textually different-but-equivalent inputs that
 * canonicalise to the SAME identity object always hash identically. */
export function computeAccountIdentifierHash(identity: CanonicalAccountIdentity): string {
  return fingerprint(identity);
}

export { resolveCountryProfile };
