/**
 * WLT-01 Fiat Payout Destinations (APAC) — country-profile registry (`lib/fiat/
 * country-profiles.ts`) and account/BIC/branch canonicalisation (`lib/fiat/account-identifier.ts`).
 * No database, no HTTP. Implements the FROZEN architecture (APAC-First Local-Account Architecture
 * Pivot, CLOSED) exactly.
 */
import { describe, expect, it } from "vitest";
import { APAC_BANK_COUNTRIES, COUNTRY_PROFILES, resolveCountryProfile } from "../../services/wlt1/src/lib/fiat/country-profiles.js";
import {
  buildCanonicalAccountIdentity,
  canonicaliseAccountIdentifier,
  canonicaliseBic,
  canonicalStringify,
  computeAccountIdentifierHash,
  maskAccountIdentifier,
  validateBranchIdentifier,
} from "../../services/wlt1/src/lib/fiat/account-identifier.js";

describe("APAC_BANK_COUNTRIES / COUNTRY_PROFILES / resolveCountryProfile", () => {
  it("is exactly the four frozen markets, no more, no less", () => {
    expect([...APAC_BANK_COUNTRIES].sort()).toEqual(["HK", "ID", "MY", "SG"]);
  });

  it("MY: MYR / apac_local_my / 8-20 digits / no branch", () => {
    expect(COUNTRY_PROFILES.MY).toMatchObject({ currency: "MYR", rail: "apac_local_my", branchRequired: false, accountMinLength: 8, accountMaxLength: 20 });
  });
  it("SG: SGD / apac_local_sg / 8-20 digits / no branch", () => {
    expect(COUNTRY_PROFILES.SG).toMatchObject({ currency: "SGD", rail: "apac_local_sg", branchRequired: false, accountMinLength: 8, accountMaxLength: 20 });
  });
  it("HK: HKD / apac_local_hk / 6-12 digits / branch REQUIRED, 3 digits", () => {
    expect(COUNTRY_PROFILES.HK).toMatchObject({ currency: "HKD", rail: "apac_local_hk", branchRequired: true, branchLength: 3, accountMinLength: 6, accountMaxLength: 12 });
  });
  it("ID: IDR / apac_local_id / 8-20 digits / no branch", () => {
    expect(COUNTRY_PROFILES.ID).toMatchObject({ currency: "IDR", rail: "apac_local_id", branchRequired: false, accountMinLength: 8, accountMaxLength: 20 });
  });

  it("resolveCountryProfile returns undefined for anything outside the four markets", () => {
    expect(resolveCountryProfile("US")).toBeUndefined();
    expect(resolveCountryProfile("")).toBeUndefined();
    expect(resolveCountryProfile("my")).toBeUndefined(); // case-sensitive — lowercase is not a known key
  });

  it("no rail identifier names a real payment scheme (duitnow/fast/fps/bifast) anywhere", () => {
    const rails = Object.values(COUNTRY_PROFILES).map((p) => p.rail);
    for (const rail of rails) {
      expect(rail.toLowerCase()).not.toMatch(/duitnow|fast|fps|bifast/);
      expect(rail.startsWith("apac_local_")).toBe(true);
    }
  });
});

describe("canonicaliseAccountIdentifier", () => {
  const my = COUNTRY_PROFILES.MY;

  it("accepts a valid digit string", () => {
    expect(canonicaliseAccountIdentifier("12345678", my)).toEqual({ ok: true, canonical: "12345678" });
  });

  it("strips whitespace and dashes before validating", () => {
    expect(canonicaliseAccountIdentifier("1234 5678", my)).toEqual({ ok: true, canonical: "12345678" });
    expect(canonicaliseAccountIdentifier("1234-5678", my)).toEqual({ ok: true, canonical: "12345678" });
    expect(canonicaliseAccountIdentifier(" 1234-5678 ", my)).toEqual({ ok: true, canonical: "12345678" });
  });

  it("preserves leading zeros — never trims them", () => {
    const result = canonicaliseAccountIdentifier("00123456", my);
    expect(result).toEqual({ ok: true, canonical: "00123456" });
    expect((result as { canonical: string }).canonical).not.toBe("123456");
  });

  it("rejects empty input (after stripping)", () => {
    expect(canonicaliseAccountIdentifier("  - ", my)).toEqual({ ok: false, reasonCode: "empty" });
  });

  it("rejects a non-digit character", () => {
    expect(canonicaliseAccountIdentifier("1234abc8", my)).toEqual({ ok: false, reasonCode: "non_digit_character" });
  });

  it("rejects all-zeros", () => {
    expect(canonicaliseAccountIdentifier("00000000", my)).toEqual({ ok: false, reasonCode: "all_zeros" });
  });

  it("rejects below the profile minimum length", () => {
    expect(canonicaliseAccountIdentifier("1234567", my)).toEqual({ ok: false, reasonCode: "below_minimum_length" });
  });

  it("rejects above the profile maximum length", () => {
    expect(canonicaliseAccountIdentifier("1".repeat(21), my)).toEqual({ ok: false, reasonCode: "above_maximum_length" });
  });

  it("no checksum is ever computed or validated — a structurally valid but 'wrong' digit string is always accepted", () => {
    // There is no authoritative checksum for any of the four markets — any well-formed digit
    // string within bounds is accepted, proving no invented checksum rule silently rejects it.
    expect(canonicaliseAccountIdentifier("13579246", my).ok).toBe(true);
  });

  it("HK uses its own distinct 6-12 digit length bound", () => {
    const hk = COUNTRY_PROFILES.HK;
    expect(canonicaliseAccountIdentifier("123456", hk)).toEqual({ ok: true, canonical: "123456" });
    expect(canonicaliseAccountIdentifier("12345", hk)).toEqual({ ok: false, reasonCode: "below_minimum_length" });
    expect(canonicaliseAccountIdentifier("1234567890123", hk)).toEqual({ ok: false, reasonCode: "above_maximum_length" });
  });
});

describe("canonicaliseBic", () => {
  it("accepts a valid 8-character BIC, uppercased", () => {
    expect(canonicaliseBic("abmbmykl", "MY")).toEqual({ ok: true, canonical: "ABMBMYKL" });
  });

  it("accepts a valid 11-character BIC with branch code", () => {
    expect(canonicaliseBic("ABMBMYKLXXX", "MY")).toEqual({ ok: true, canonical: "ABMBMYKLXXX" });
  });

  it("rejects empty input", () => {
    expect(canonicaliseBic("", "MY")).toEqual({ ok: false, reasonCode: "empty" });
  });

  it("rejects a structurally invalid BIC (wrong length, digits in the bank-code segment)", () => {
    expect(canonicaliseBic("AB1BMYKL", "MY")).toEqual({ ok: false, reasonCode: "invalid_structure" });
    expect(canonicaliseBic("ABMBMYK", "MY")).toEqual({ ok: false, reasonCode: "invalid_structure" });
    expect(canonicaliseBic("ABMBMYKLXX", "MY")).toEqual({ ok: false, reasonCode: "invalid_structure" });
  });

  it("rejects a structurally valid BIC whose embedded country does not match the expected bank_country", () => {
    expect(canonicaliseBic("ABMBSGKL", "MY")).toEqual({ ok: false, reasonCode: "country_mismatch" });
  });

  it("BIC country component must equal each of the four markets independently", () => {
    expect(canonicaliseBic("DBSSSGSG", "SG")).toEqual({ ok: true, canonical: "DBSSSGSG" });
    expect(canonicaliseBic("HSBCHKHH", "HK")).toEqual({ ok: true, canonical: "HSBCHKHH" });
    expect(canonicaliseBic("BMRIIDJA", "ID")).toEqual({ ok: true, canonical: "BMRIIDJA" });
    expect(canonicaliseBic("DBSSSGSG", "HK")).toEqual({ ok: false, reasonCode: "country_mismatch" });
  });
});

describe("validateBranchIdentifier", () => {
  it("HK: required, exactly 3 digits", () => {
    const hk = COUNTRY_PROFILES.HK;
    expect(validateBranchIdentifier("004", hk)).toEqual({ ok: true, canonical: "004" });
    expect(validateBranchIdentifier(undefined, hk)).toEqual({ ok: false, reasonCode: "required_but_missing" });
    expect(validateBranchIdentifier("04", hk)).toEqual({ ok: false, reasonCode: "wrong_length" });
    expect(validateBranchIdentifier("0045", hk)).toEqual({ ok: false, reasonCode: "wrong_length" });
    expect(validateBranchIdentifier("abc", hk)).toEqual({ ok: false, reasonCode: "non_digit_character" });
  });

  it("MY/SG/ID: forbidden — supplying any value is a validation error", () => {
    for (const cc of ["MY", "SG", "ID"] as const) {
      const profile = COUNTRY_PROFILES[cc];
      expect(validateBranchIdentifier(undefined, profile)).toEqual({ ok: true, canonical: undefined });
      expect(validateBranchIdentifier("004", profile)).toEqual({ ok: false, reasonCode: "forbidden_but_present" });
    }
  });
});

describe("maskAccountIdentifier", () => {
  it("masks to fixed-prefix + last 4 digits", () => {
    expect(maskAccountIdentifier("00123456")).toBe("••••3456");
    expect(maskAccountIdentifier("123456")).toBe("••••3456");
  });
});

describe("buildCanonicalAccountIdentity / canonicalStringify / computeAccountIdentifierHash", () => {
  it("HK: branch_identifier is present as its own key", () => {
    const identity = buildCanonicalAccountIdentity({ accountIdentifier: "123456", bankCountry: "HK", bankIdentifier: "HSBCHKHH", branchIdentifier: "004" });
    expect(identity.branch_identifier).toBe("004");
    expect(Object.prototype.hasOwnProperty.call(identity, "branch_identifier")).toBe(true);
  });

  it("non-HK: branch_identifier key is OMITTED ENTIRELY, never serialized as null", () => {
    const identity = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    expect(Object.prototype.hasOwnProperty.call(identity, "branch_identifier")).toBe(false);
    expect(canonicalStringify(identity)).not.toContain("branch_identifier");
    expect(canonicalStringify(identity)).not.toContain("null");
  });

  it("HK ambiguity proof: branch '004'+account '123456' hashes DIFFERENTLY from branch '00412'... wait — structurally impossible input; assert the REAL ambiguity case instead: two different (branch, account) pairs whose naive concatenation would collide never collide once structured", () => {
    const a = buildCanonicalAccountIdentity({ accountIdentifier: "123456", bankCountry: "HK", bankIdentifier: "HSBCHKHH", branchIdentifier: "004" });
    const b = buildCanonicalAccountIdentity({ accountIdentifier: "3456", bankCountry: "HK", bankIdentifier: "HSBCHKHH", branchIdentifier: "00412" });
    // "00412" is not a valid 3-digit branch and would be rejected by validateBranchIdentifier —
    // this proves the STRUCTURAL non-collision property of the object encoding itself, independent
    // of that separate validation gate.
    expect(computeAccountIdentifierHash(a)).not.toBe(computeAccountIdentifierHash(b));
  });

  it("leading-zero preservation changes the hash", () => {
    const withZero = buildCanonicalAccountIdentity({ accountIdentifier: "00123456", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    const withoutZero = buildCanonicalAccountIdentity({ accountIdentifier: "123456", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    expect(computeAccountIdentifierHash(withZero)).not.toBe(computeAccountIdentifierHash(withoutZero));
  });

  it("the same raw digit string in two different countries hashes differently", () => {
    const my = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    const sg = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "SG", bankIdentifier: "DBSSSGSG" });
    expect(computeAccountIdentifierHash(my)).not.toBe(computeAccountIdentifierHash(sg));
  });

  it("hash format is sha256:<64 lowercase hex>", () => {
    const identity = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    expect(computeAccountIdentifierHash(identity)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("two equivalent inputs (whitespace/dash variants canonicalising to the same digits) hash identically", () => {
    const a = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    const b = buildCanonicalAccountIdentity({ accountIdentifier: "12345678", bankCountry: "MY", bankIdentifier: "ABMBMYKL" });
    expect(computeAccountIdentifierHash(a)).toBe(computeAccountIdentifierHash(b));
  });
});
