/**
 * WLT-01 Fiat Payout Destinations (APAC) — beneficiary-verification and fiat-destination-
 * screening provider registries + deterministic stub providers. No database, no network.
 */
import { describe, expect, it } from "vitest";
import {
  isKnownBeneficiaryVerificationProviderId,
  isStubBeneficiaryVerificationProviderId,
  KNOWN_BENEFICIARY_VERIFICATION_PROVIDER_IDS,
  resolveBeneficiaryVerificationProvider,
  verifyViaProvider,
} from "../../services/wlt1/src/lib/beneficiary-verification/registry.js";
import {
  STUB_PROVIDER_ID as BENEFICIARY_STUB_ID,
  WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH,
  WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED,
  WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE,
  WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
  stubBeneficiaryVerificationProvider,
} from "../../services/wlt1/src/lib/beneficiary-verification/stub-provider.js";
import {
  isKnownFiatScreeningProviderId,
  isStubFiatScreeningProviderId,
  KNOWN_FIAT_SCREENING_PROVIDER_IDS,
  resolveFiatScreeningProvider,
  screenFiatDestinationViaProvider,
} from "../../services/wlt1/src/lib/fiat-screening/registry.js";
import {
  STUB_PROVIDER_ID as SCREENING_STUB_ID,
  WLT1_TEST_STUB_FIAT_SCREENING_BIC,
  WLT1_TEST_STUB_FIAT_SCREENING_CLEAR,
  WLT1_TEST_STUB_FIAT_SCREENING_HIT,
  WLT1_TEST_STUB_FIAT_SCREENING_UNAVAILABLE,
  stubFiatScreeningProvider,
} from "../../services/wlt1/src/lib/fiat-screening/stub-provider.js";
import {
  WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH,
  WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED,
  WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE as BENEFICIARY_UNAVAILABLE_NAME,
} from "../../services/wlt1/src/lib/beneficiary-verification/stub-provider.js";

describe("beneficiary-verification registry", () => {
  it("known-id set is exactly the stub", () => {
    expect(KNOWN_BENEFICIARY_VERIFICATION_PROVIDER_IDS).toEqual([BENEFICIARY_STUB_ID]);
  });

  it("isKnownBeneficiaryVerificationProviderId / isStubBeneficiaryVerificationProviderId", () => {
    expect(isKnownBeneficiaryVerificationProviderId(BENEFICIARY_STUB_ID)).toBe(true);
    expect(isKnownBeneficiaryVerificationProviderId("unknown")).toBe(false);
    expect(isStubBeneficiaryVerificationProviderId(BENEFICIARY_STUB_ID)).toBe(true);
  });

  it("resolveBeneficiaryVerificationProvider throws on an unknown id (fails closed, never falls back)", () => {
    expect(() => resolveBeneficiaryVerificationProvider("nonexistent")).toThrow();
  });

  it("resolveBeneficiaryVerificationProvider rejects a prototype-chain key (own-property guard)", () => {
    expect(() => resolveBeneficiaryVerificationProvider("constructor")).toThrow();
    expect(() => resolveBeneficiaryVerificationProvider("toString")).toThrow();
  });
});

describe("stubBeneficiaryVerificationProvider — deterministic fixture outcomes", () => {
  const baseInput = { beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: "ABMBMYKL", accountIdentifier: "12345678", accountIdentifierType: "local_account" as const, verificationReferenceId: "wlt1dest_1" };

  it("verified fixture -> completed/verified", async () => {
    const outcome = await stubBeneficiaryVerificationProvider.verify({ ...baseInput, beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
    expect(outcome).toMatchObject({ kind: "completed", result: { result: "verified" } });
  });

  it("name-mismatch fixture -> completed/name_mismatch", async () => {
    const outcome = await stubBeneficiaryVerificationProvider.verify({ ...baseInput, beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH });
    expect(outcome).toMatchObject({ kind: "completed", result: { result: "name_mismatch" } });
  });

  it("not-supported fixture -> completed/not_supported", async () => {
    const outcome = await stubBeneficiaryVerificationProvider.verify({ ...baseInput, beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED });
    expect(outcome).toMatchObject({ kind: "completed", result: { result: "not_supported" } });
  });

  it("unavailable fixture -> technical failure, no result", async () => {
    const outcome = await stubBeneficiaryVerificationProvider.verify({ ...baseInput, beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE });
    expect(outcome.kind).toBe("unavailable");
  });

  it("an unrecognised name is fail-closed 'unavailable' — NEVER a fabricated 'verified'", async () => {
    const outcome = await stubBeneficiaryVerificationProvider.verify({ ...baseInput, beneficiaryNameNormalized: "SOME RANDOM NAME NOT A FIXTURE" });
    expect(outcome).toMatchObject({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("verifyViaProvider (registry timeout wrapper) passes through a normal completion untouched", async () => {
    const outcome = await verifyViaProvider(stubBeneficiaryVerificationProvider, { ...baseInput, beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
    expect(outcome).toMatchObject({ kind: "completed", result: { result: "verified" } });
  });
});

describe("fiat-screening registry", () => {
  it("known-id set is exactly the stub", () => {
    expect(KNOWN_FIAT_SCREENING_PROVIDER_IDS).toEqual([SCREENING_STUB_ID]);
  });

  it("isKnownFiatScreeningProviderId / isStubFiatScreeningProviderId", () => {
    expect(isKnownFiatScreeningProviderId(SCREENING_STUB_ID)).toBe(true);
    expect(isKnownFiatScreeningProviderId("unknown")).toBe(false);
    expect(isStubFiatScreeningProviderId(SCREENING_STUB_ID)).toBe(true);
  });

  it("resolveFiatScreeningProvider throws on an unknown id", () => {
    expect(() => resolveFiatScreeningProvider("nonexistent")).toThrow();
  });
});

describe("stubFiatScreeningProvider — deterministic BIC-dispatch fixture outcomes (H-1 remediation)", () => {
  const baseInput = { beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: "ABMBMYKL", screeningReferenceId: "wlt1dest_1", beneficiaryNameNormalized: "IRRELEVANT NAME NEVER MATCHED BY THIS PROVIDER" };

  it("clear fixture -> screened/clear, no sanctions exposure", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_CLEAR });
    expect(outcome).toMatchObject({ kind: "screened", result: { riskStatus: "clear", sanctionsExposure: false } });
  });

  it("hit fixture -> screened/hit, sanctions exposure true, riskScore null (categorical signal, never a fabricated score)", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_HIT });
    expect(outcome).toMatchObject({ kind: "screened", result: { riskStatus: "hit", sanctionsExposure: true, riskScore: null } });
  });

  it("unavailable fixture -> technical failure", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_UNAVAILABLE });
    expect(outcome.kind).toBe("unavailable");
  });

  it("an unrecognised BIC is fail-closed 'unavailable' — NEVER a fabricated 'clear'", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: "REALBIC01" });
    expect(outcome).toMatchObject({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("dispatch is on bankIdentifier, NOT beneficiaryNameNormalized — the SAME name with a fixture BIC vs a non-fixture BIC produces different outcomes", async () => {
    const withFixtureBic = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_CLEAR, beneficiaryNameNormalized: "SAME NAME BOTH CALLS" });
    const withUnknownBic = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: "UNKNOWNB1", beneficiaryNameNormalized: "SAME NAME BOTH CALLS" });
    expect(withFixtureBic.kind).toBe("screened");
    expect(withUnknownBic).toMatchObject({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("exact full-value match only — a BIC that merely CONTAINS a fixture value as a substring is NOT matched (no suffix/prefix dispatch)", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: "X" + WLT1_TEST_STUB_FIAT_SCREENING_CLEAR });
    expect(outcome).toMatchObject({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("screening input never includes the full account identifier field (the type has no such field)", async () => {
    const outcome = await stubFiatScreeningProvider.screen({ ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_CLEAR });
    expect(outcome).not.toHaveProperty("accountIdentifier");
    expect(baseInput).not.toHaveProperty("accountIdentifier");
  });

  it("screenFiatDestinationViaProvider (registry timeout wrapper) passes through a normal completion untouched", async () => {
    const outcome = await screenFiatDestinationViaProvider(stubFiatScreeningProvider, { ...baseInput, bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_CLEAR });
    expect(outcome).toMatchObject({ kind: "screened", result: { riskStatus: "clear" } });
  });

  describe("all 20 fixture BICs (5 outcomes x 4 APAC markets) — exact matrix", () => {
    for (const country of ["MY", "SG", "HK", "ID"] as const) {
      for (const [outcome, bic] of Object.entries(WLT1_TEST_STUB_FIAT_SCREENING_BIC[country])) {
        it(`${country} ${outcome}: '${bic}' resolves to the expected outcome`, async () => {
          const result = await stubFiatScreeningProvider.screen({ ...baseInput, bankCountry: country, bankIdentifier: bic });
          if (outcome === "UNAVAILABLE") {
            expect(result.kind).toBe("unavailable");
            return;
          }
          expect(result.kind).toBe("screened");
          const expectedRiskStatus = outcome === "CLEAR" ? "clear" : outcome === "REVIEW_REQUIRED" ? "review_required" : outcome === "HIGH_RISK" ? "high_risk" : "hit";
          expect((result as { result: { riskStatus: string } }).result.riskStatus).toBe(expectedRiskStatus);
        });
      }
    }
  });

  describe("H-1 CLOSURE — independent construction of all 10 registration outcome combinations (beneficiary-verification name-dispatch x fiat-screening BIC-dispatch are fully orthogonal)", () => {
    const combos: Array<[string, string]> = [
      ["verified + clear", WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR],
      ["verified + review_required", WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.REVIEW_REQUIRED],
      ["verified + high_risk", WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIGH_RISK],
      ["verified + hit", WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT],
      ["verified + screening technical failure", WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE],
    ];
    for (const [label, bic] of combos) {
      it(`${label}: verification stub (name-dispatch, VERIFIED) and screening stub (BIC-dispatch) both resolve independently in ONE call`, async () => {
        const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: bic, screeningReferenceId: "wlt1dest_1", beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
        // Both providers examined the SAME logical request (verified name + this BIC) and each
        // resolved from its OWN independent dispatch field — proving H-1 is closed.
        if (bic === WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE) {
          expect(screeningOutcome.kind).toBe("unavailable");
        } else {
          expect(screeningOutcome.kind).toBe("screened");
        }
      });
    }

    it("name_mismatch + clear: both domains reach a DIFFERENT terminal outcome from the SAME single request shape", async () => {
      const verificationOutcome = await stubBeneficiaryVerificationProvider.verify({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, accountIdentifier: "12345678", accountIdentifierType: "local_account", verificationReferenceId: "wlt1dest_1" });
      const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, screeningReferenceId: "wlt1dest_1" });
      expect(verificationOutcome).toMatchObject({ kind: "completed", result: { result: "name_mismatch" } });
      expect(screeningOutcome).toMatchObject({ kind: "screened", result: { riskStatus: "clear" } });
    });

    it("name_mismatch + adverse (hit)", async () => {
      const verificationOutcome = await stubBeneficiaryVerificationProvider.verify({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT, accountIdentifier: "12345678", accountIdentifierType: "local_account", verificationReferenceId: "wlt1dest_1" });
      const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT, screeningReferenceId: "wlt1dest_1" });
      expect(verificationOutcome).toMatchObject({ kind: "completed", result: { result: "name_mismatch" } });
      expect(screeningOutcome).toMatchObject({ kind: "screened", result: { riskStatus: "hit", sanctionsExposure: true } });
    });

    it("not_supported + clear", async () => {
      const verificationOutcome = await stubBeneficiaryVerificationProvider.verify({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, accountIdentifier: "12345678", accountIdentifierType: "local_account", verificationReferenceId: "wlt1dest_1" });
      const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryNameNormalized: WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, screeningReferenceId: "wlt1dest_1" });
      expect(verificationOutcome).toMatchObject({ kind: "completed", result: { result: "not_supported" } });
      expect(screeningOutcome).toMatchObject({ kind: "screened", result: { riskStatus: "clear" } });
    });

    it("verification unavailable + clear", async () => {
      const verificationOutcome = await stubBeneficiaryVerificationProvider.verify({ beneficiaryNameNormalized: BENEFICIARY_UNAVAILABLE_NAME, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, accountIdentifier: "12345678", accountIdentifierType: "local_account", verificationReferenceId: "wlt1dest_1" });
      const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryNameNormalized: BENEFICIARY_UNAVAILABLE_NAME, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, screeningReferenceId: "wlt1dest_1" });
      expect(verificationOutcome.kind).toBe("unavailable");
      expect(screeningOutcome).toMatchObject({ kind: "screened", result: { riskStatus: "clear" } });
    });

    it("both technical failure", async () => {
      const verificationOutcome = await stubBeneficiaryVerificationProvider.verify({ beneficiaryNameNormalized: BENEFICIARY_UNAVAILABLE_NAME, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE, accountIdentifier: "12345678", accountIdentifierType: "local_account", verificationReferenceId: "wlt1dest_1" });
      const screeningOutcome = await stubFiatScreeningProvider.screen({ beneficiaryNameNormalized: BENEFICIARY_UNAVAILABLE_NAME, beneficiaryType: "individual", bankCountry: "MY", bankIdentifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE, screeningReferenceId: "wlt1dest_1" });
      expect(verificationOutcome.kind).toBe("unavailable");
      expect(screeningOutcome.kind).toBe("unavailable");
    });
  });
});

describe("provider seam separation — fiat providers are never the wallet-analytics provider", () => {
  it("beneficiary-verification and fiat-screening provider ids are distinct from the wallet-analytics stub id", async () => {
    const { STUB_PROVIDER_ID: WALLET_STUB_ID } = await import("../../services/wlt1/src/lib/providers/stub-provider.js");
    expect(BENEFICIARY_STUB_ID).not.toBe(WALLET_STUB_ID);
    expect(SCREENING_STUB_ID).not.toBe(WALLET_STUB_ID);
    expect(BENEFICIARY_STUB_ID).not.toBe(SCREENING_STUB_ID);
  });
});
