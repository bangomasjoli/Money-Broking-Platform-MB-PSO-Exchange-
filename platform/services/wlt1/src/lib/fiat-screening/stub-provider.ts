/**
 * WLT-01 Fiat Payout Destinations (APAC) — the deterministic stub fiat-destination-screening
 * provider. No external network call, no real sanctions/PEP vendor. Replacing this with a real
 * vendor adaptor is out of this phase's scope.
 *
 * ACCEPTANCE REMEDIATION (H-1): dispatch is now keyed by `bankIdentifier` (the BIC), NOT
 * `beneficiaryNameNormalized`. Prior to this remediation, both the beneficiary-verification stub
 * and this stub dispatched on the SAME `beneficiaryNameNormalized` field with disjoint fixture
 * vocabularies — a single registration request could therefore reach a terminal outcome on at
 * most ONE of the two evidence domains, making 7 of the 10 mandated registration-outcome
 * combinations (including the primary `verified + clear` happy path) structurally unreachable
 * end-to-end. `bankIdentifier` is already a first-class field on the real
 * `FiatDestinationScreeningInput` contract (no contract change) and is fully independent of
 * `beneficiaryNameNormalized`, so the two stub providers can now be driven to any combination of
 * outcomes within a single request. This is a TEST-HARNESS fixture-dispatch change only — the real
 * `FiatDestinationScreeningProvider`/`FiatDestinationScreeningInput` contracts are unchanged, and
 * runtime production behaviour (deny-by-default registry, stub-in-prod boot guard) is unaffected.
 *
 * Deterministic fixture-map design, keyed by the FULL 8-character BIC value (never a suffix/prefix
 * match — a real customer BIC can never accidentally collide with a fixture). A BIC with no
 * configured fixture returns a bounded fail-closed `unavailable` — NEVER a fabricated `clear`.
 */
import { systemTime, type TimeService } from "@aix/foundation";
import type { FiatDestinationScreeningInput, FiatDestinationScreeningOutcome, FiatDestinationScreeningProvider, NormalizedFiatScreeningResult } from "./types.js";

export const STUB_PROVIDER_ID = "stub-fiat-screening-v1";
export const STUB_ADAPTOR_VERSION = "1";

/** The full frozen 20-BIC fixture matrix (5 outcomes x 4 APAC markets) — exact full-value match
 * only, never a suffix/prefix dispatch. */
export const WLT1_TEST_STUB_FIAT_SCREENING_BIC = {
  MY: { CLEAR: "STUBMYC1", REVIEW_REQUIRED: "STUBMYR1", HIGH_RISK: "STUBMYH1", HIT: "STUBMYX1", UNAVAILABLE: "STUBMYU1" },
  SG: { CLEAR: "STUBSGC1", REVIEW_REQUIRED: "STUBSGR1", HIGH_RISK: "STUBSGH1", HIT: "STUBSGX1", UNAVAILABLE: "STUBSGU1" },
  HK: { CLEAR: "STUBHKC1", REVIEW_REQUIRED: "STUBHKR1", HIGH_RISK: "STUBHKH1", HIT: "STUBHKX1", UNAVAILABLE: "STUBHKU1" },
  ID: { CLEAR: "STUBIDC1", REVIEW_REQUIRED: "STUBIDR1", HIGH_RISK: "STUBIDH1", HIT: "STUBIDX1", UNAVAILABLE: "STUBIDU1" },
} as const;

/** Backward-compatible top-level aliases for the MY corridor — the default test market used
 * throughout this suite. Equivalent to `WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.*`. */
export const WLT1_TEST_STUB_FIAT_SCREENING_CLEAR = WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR;
export const WLT1_TEST_STUB_FIAT_SCREENING_REVIEW_REQUIRED = WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.REVIEW_REQUIRED;
export const WLT1_TEST_STUB_FIAT_SCREENING_HIGH_RISK = WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIGH_RISK;
export const WLT1_TEST_STUB_FIAT_SCREENING_HIT = WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT;
export const WLT1_TEST_STUB_FIAT_SCREENING_UNAVAILABLE = WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE;

const VALIDITY_HOURS_FIXTURE = 720;

type FixtureOutcomeKind = "CLEAR" | "REVIEW_REQUIRED" | "HIGH_RISK" | "HIT" | "UNAVAILABLE";

/** Flat BIC -> outcome-kind lookup, built once from the matrix above — the ONE place a BIC string
 * is resolved to a fixture outcome. Full-value keys only. */
const BIC_TO_OUTCOME: Readonly<Record<string, FixtureOutcomeKind>> = Object.freeze(
  Object.fromEntries(Object.values(WLT1_TEST_STUB_FIAT_SCREENING_BIC).flatMap((byOutcome) => Object.entries(byOutcome).map(([outcome, bic]) => [bic, outcome as FixtureOutcomeKind]))),
);

function fixtureResultId(riskStatus: string, referenceId: string): string {
  return `stub-fiat-screening-result-${riskStatus}-${referenceId}`;
}

export function createStubFiatScreeningProvider(time: Pick<TimeService, "nowUtc">): FiatDestinationScreeningProvider {
  return {
    providerId: STUB_PROVIDER_ID,
    adaptorVersion: STUB_ADAPTOR_VERSION,
    async screen(input: FiatDestinationScreeningInput): Promise<FiatDestinationScreeningOutcome> {
      const issuedAtUtc = time.nowUtc();
      const validUntilUtc = new Date(new Date(issuedAtUtc).getTime() + VALIDITY_HOURS_FIXTURE * 60 * 60 * 1000).toISOString();

      const outcomeKind = Object.prototype.hasOwnProperty.call(BIC_TO_OUTCOME, input.bankIdentifier) ? BIC_TO_OUTCOME[input.bankIdentifier] : undefined;

      if (outcomeKind === undefined) {
        // NO ALWAYS-CLEAR FALLBACK — an unrecognised BIC is a bounded fail-closed `unavailable`,
        // never a silent `clear`.
        return { kind: "unavailable", reasonCode: "no_stub_fixture_configured" };
      }
      if (outcomeKind === "UNAVAILABLE") {
        return { kind: "unavailable", reasonCode: "provider_unavailable" };
      }

      let result: NormalizedFiatScreeningResult;
      if (outcomeKind === "CLEAR") {
        result = {
          providerResultId: fixtureResultId("clear", input.screeningReferenceId),
          riskStatus: "clear",
          riskScore: 1.5,
          riskCategories: [],
          sanctionsExposure: false,
          matchedNameNormalized: null,
          issuedAtUtc,
          validUntilUtc,
        };
      } else if (outcomeKind === "REVIEW_REQUIRED") {
        result = {
          providerResultId: fixtureResultId("review_required", input.screeningReferenceId),
          riskStatus: "review_required",
          riskScore: 48.0,
          riskCategories: ["pep_adjacent"],
          sanctionsExposure: false,
          matchedNameNormalized: input.beneficiaryNameNormalized,
          issuedAtUtc,
          validUntilUtc,
        };
      } else if (outcomeKind === "HIGH_RISK") {
        result = {
          providerResultId: fixtureResultId("high_risk", input.screeningReferenceId),
          riskStatus: "high_risk",
          riskScore: 81.0,
          riskCategories: ["adverse_media"],
          sanctionsExposure: false,
          matchedNameNormalized: input.beneficiaryNameNormalized,
          issuedAtUtc,
          validUntilUtc,
        };
      } else {
        // outcomeKind === "HIT"
        result = {
          providerResultId: fixtureResultId("hit", input.screeningReferenceId),
          riskStatus: "hit",
          riskScore: null,
          riskCategories: ["sanctions"],
          sanctionsExposure: true,
          matchedNameNormalized: input.beneficiaryNameNormalized,
          issuedAtUtc,
          validUntilUtc,
        };
      }

      return { kind: "screened", result };
    },
  };
}

export const stubFiatScreeningProvider: FiatDestinationScreeningProvider = createStubFiatScreeningProvider(systemTime);
