/**
 * WLT-01 Fiat Payout Destinations (APAC) — beneficiary (Confirmation-of-Payee-style) account-name
 * verification provider boundary (types only). Implements the FROZEN architecture exactly. No
 * route/caller outside `lib/fiat-destination.ts` may reach past this boundary into a concrete
 * provider implementation — every provider is selected through `registry.ts`, never imported
 * directly.
 *
 * DELIBERATELY SEPARATE from `lib/providers/types.ts`'s `WalletAnalyticsProvider` — a beneficiary
 * verification provider examines a NAME against an ACCOUNT, an entirely different question from
 * wallet-analytics risk scoring, and the two are never conflated (F3(c)-adjacent discipline:
 * distinct concerns get distinct boundaries even within the same service).
 *
 * TERMINAL vs TECHNICAL (frozen, load-bearing): `verified`/`name_mismatch`/`not_supported` are
 * all TERMINAL business results — the provider answered, and evidence is persisted
 * (`wlt1.beneficiary_verification`). `unavailable` is a TECHNICAL failure — the provider could not
 * be reached or declined to answer; NO evidence row is ever persisted for this outcome (see
 * `lib/fiat-destination.ts`'s own registration/assess flow).
 */
export const VERIFICATION_RESULTS = ["verified", "name_mismatch", "not_supported"] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export function isKnownVerificationResult(value: string): value is VerificationResult {
  return (VERIFICATION_RESULTS as readonly string[]).includes(value);
}

/** The MINIMIZED input WLT-01 sends to a beneficiary-verification provider — no private key, seed
 * phrase, signing material, or auth secret of any kind. `accountIdentifier` here is the CANONICAL
 * (never masked, never encrypted) digit string — a beneficiary-verification provider genuinely
 * needs the real account number to confirm the name against it; this input is never logged, never
 * audited, and never persisted anywhere beyond this in-process call. */
export interface BeneficiaryVerificationInput {
  beneficiaryNameNormalized: string;
  beneficiaryType: string;
  bankCountry: string;
  bankIdentifier: string;
  branchIdentifier?: string;
  accountIdentifier: string;
  accountIdentifierType: "local_account";
  verificationReferenceId: string;
}

export interface NormalizedVerificationResult {
  result: VerificationResult;
  matchScore: number | null;
  issuedAtUtc: string;
  validUntilUtc: string | null;
}

export type BeneficiaryVerificationOutcome =
  | { kind: "completed"; result: NormalizedVerificationResult }
  | { kind: "unavailable"; reasonCode: string };

export interface BeneficiaryVerificationProvider {
  readonly providerId: string;
  readonly adaptorVersion: string;
  verify(input: BeneficiaryVerificationInput): Promise<BeneficiaryVerificationOutcome>;
}
