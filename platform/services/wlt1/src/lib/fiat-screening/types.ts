/**
 * WLT-01 Fiat Payout Destinations (APAC) — fiat destination screening provider boundary (types
 * only). Implements the FROZEN architecture exactly. No route/caller outside
 * `lib/fiat-destination.ts` may reach past this boundary into a concrete provider implementation
 * — every provider is selected through `registry.ts`, never imported directly.
 *
 * DELIBERATELY SEPARATE from `lib/providers/types.ts`'s `WalletAnalyticsProvider` — fiat
 * destination screening is beneficiary-name + bank-country based, never wallet-address based, and
 * the wallet-analytics provider is never invoked for a fiat destination. `RiskStatus` vocabulary
 * overlaps (`clear`/`review_required`/`high_risk`/`hit`) by convergent design, not by import — own
 * copy, F3(c).
 *
 * The screening provider does NOT receive the bank account number — it screens the beneficiary
 * and the bank, never the account (see `lib/fiat-destination.ts`'s own binding rationale:
 * `wlt1.fiat_screening_result` is bound to `(beneficiary_name_hash, bank_country,
 * beneficiary_type)`, never `account_identifier_hash`).
 */
export const FIAT_RISK_STATUSES = ["clear", "review_required", "high_risk", "hit"] as const;
export type FiatRiskStatus = (typeof FIAT_RISK_STATUSES)[number];

export function isKnownFiatRiskStatus(value: string): value is FiatRiskStatus {
  return (FIAT_RISK_STATUSES as readonly string[]).includes(value);
}

export interface FiatDestinationScreeningInput {
  beneficiaryNameNormalized: string;
  beneficiaryType: string;
  bankCountry: string;
  bankIdentifier: string;
  screeningReferenceId: string;
}

/** No raw-payload field of any kind — nothing downstream of a provider can ever be handed a raw
 * vendor body, mirroring the platform-wide raw-payload rule `lib/providers/types.ts` already
 * established for wallet-analytics results. */
export interface NormalizedFiatScreeningResult {
  providerResultId: string;
  riskStatus: FiatRiskStatus;
  riskScore: number | null;
  riskCategories: string[];
  sanctionsExposure: boolean | null;
  matchedNameNormalized: string | null;
  issuedAtUtc: string;
  validUntilUtc: string | null;
}

/**
 * `kind: "screened"` — the provider completed a screen; `result` is fully normalized. `kind:
 * "unavailable"` — the provider could not be reached or declined to answer. `kind:
 * "invalid_response"` — the provider responded but its response could not be normalized/trusted.
 * Both failure kinds fail closed identically (never `clear`) and persist NO evidence row (see
 * `lib/fiat-destination.ts`).
 */
export type FiatDestinationScreeningOutcome =
  | { kind: "screened"; result: NormalizedFiatScreeningResult }
  | { kind: "unavailable"; reasonCode: string }
  | { kind: "invalid_response"; reasonCode: string };

export interface FiatDestinationScreeningProvider {
  readonly providerId: string;
  readonly adaptorVersion: string;
  screen(input: FiatDestinationScreeningInput): Promise<FiatDestinationScreeningOutcome>;
}
