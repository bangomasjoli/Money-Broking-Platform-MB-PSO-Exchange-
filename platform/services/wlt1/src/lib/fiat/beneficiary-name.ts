/**
 * WLT-01 Fiat Payout Destinations (APAC) — beneficiary-name normalisation + deterministic hash.
 * Implements the FROZEN architecture exactly. Pure, no I/O.
 *
 * Normalisation is deliberately simple and total (never fails, never rejects a name): trim
 * leading/trailing whitespace, collapse internal whitespace runs to a single space, uppercase.
 * This is a MATCHING aid for verification/screening binding comparisons, never a validation gate
 * — an empty result after normalisation is caught by the route's own TypeBox `minLength` schema
 * check before this function ever runs.
 */
import { fingerprint } from "@aix/foundation";

const WHITESPACE_RUN_PATTERN = /\s+/gu;

export function normalizeBeneficiaryName(raw: string): string {
  return raw.trim().replace(WHITESPACE_RUN_PATTERN, " ").toUpperCase();
}

/** `fingerprint()` of the normalized name — used ONLY as a binding key for verification/screening
 * evidence rows (`beneficiary_name_hash`), never returned in any API response, never persisted in
 * any audit metadata. */
export function computeBeneficiaryNameHash(normalizedName: string): string {
  return fingerprint({ beneficiary_name_normalized: normalizedName });
}
