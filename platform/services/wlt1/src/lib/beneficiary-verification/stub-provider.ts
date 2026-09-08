/**
 * WLT-01 Fiat Payout Destinations (APAC) — the deterministic stub beneficiary-verification
 * provider. No external network call, no real Confirmation-of-Payee vendor. Replacing this with a
 * real vendor adaptor is out of this phase's scope.
 *
 * Deterministic fixture-map design (mirrors `lib/providers/stub-provider.ts`'s own composite-key
 * discipline, by structural convention only — own copy, F3(c)): outcome selection is keyed by the
 * beneficiary NAME alone (the only field a verification fixture plausibly needs to vary on) — no
 * caller-controllable "desired outcome" parameter exists on `BeneficiaryVerificationInput`. A name
 * with no configured fixture returns a bounded fail-closed `unavailable` — NEVER a fabricated
 * `verified`.
 */
import { systemTime, type TimeService } from "@aix/foundation";
import type { BeneficiaryVerificationInput, BeneficiaryVerificationOutcome, BeneficiaryVerificationProvider, NormalizedVerificationResult } from "./types.js";

export const STUB_PROVIDER_ID = "stub-beneficiary-verification-v1";
export const STUB_ADAPTOR_VERSION = "1";

export const WLT1_TEST_STUB_BENEFICIARY_VERIFIED = "WLT1 TEST STUB VERIFIED BENEFICIARY";
export const WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH = "WLT1 TEST STUB NAME MISMATCH BENEFICIARY";
export const WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED = "WLT1 TEST STUB NOT SUPPORTED BENEFICIARY";
export const WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE = "WLT1 TEST STUB UNAVAILABLE BENEFICIARY";

const VALIDITY_HOURS_FIXTURE = 8760;

export function createStubBeneficiaryVerificationProvider(time: Pick<TimeService, "nowUtc">): BeneficiaryVerificationProvider {
  return {
    providerId: STUB_PROVIDER_ID,
    adaptorVersion: STUB_ADAPTOR_VERSION,
    async verify(input: BeneficiaryVerificationInput): Promise<BeneficiaryVerificationOutcome> {
      const issuedAtUtc = time.nowUtc();
      const validUntilUtc = new Date(new Date(issuedAtUtc).getTime() + VALIDITY_HOURS_FIXTURE * 60 * 60 * 1000).toISOString();

      if (input.beneficiaryNameNormalized === WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE) {
        return { kind: "unavailable", reasonCode: "provider_unavailable" };
      }

      let result: NormalizedVerificationResult | undefined;
      if (input.beneficiaryNameNormalized === WLT1_TEST_STUB_BENEFICIARY_VERIFIED) {
        result = { result: "verified", matchScore: 98.5, issuedAtUtc, validUntilUtc };
      } else if (input.beneficiaryNameNormalized === WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH) {
        result = { result: "name_mismatch", matchScore: 12.0, issuedAtUtc, validUntilUtc };
      } else if (input.beneficiaryNameNormalized === WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED) {
        result = { result: "not_supported", matchScore: null, issuedAtUtc, validUntilUtc };
      }

      if (!result) {
        // NO ALWAYS-VERIFIED FALLBACK — an unrecognised name is a bounded fail-closed
        // `unavailable`, never a silent `verified`.
        return { kind: "unavailable", reasonCode: "no_stub_fixture_configured" };
      }
      return { kind: "completed", result };
    },
  };
}

export const stubBeneficiaryVerificationProvider: BeneficiaryVerificationProvider = createStubBeneficiaryVerificationProvider(systemTime);
