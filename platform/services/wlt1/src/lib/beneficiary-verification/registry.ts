/**
 * WLT-01 Fiat Payout Destinations (APAC) — the ONE place a `WLT1_BENEFICIARY_VERIFICATION_PROVIDER`
 * string is resolved into a concrete `BeneficiaryVerificationProvider`. Deny-by-default: only
 * `stub-beneficiary-verification-v1` is known this phase; an unconfigured/unknown id fails startup
 * closed (`config.ts`), never falls back to the stub or any other provider. Mirrors
 * `lib/providers/registry.ts`'s own deny-by-default/call-timeout discipline, structural convention
 * only — own copy, F3(c). No version-addressing (no asynchronous receipt path exists for this
 * provider this phase — every call is synchronous, at transaction depth 0).
 */
import { STUB_PROVIDER_ID, stubBeneficiaryVerificationProvider } from "./stub-provider.js";
import type { BeneficiaryVerificationInput, BeneficiaryVerificationOutcome, BeneficiaryVerificationProvider } from "./types.js";

/** Bounded so a hung/slow provider can never block a fiat registration/assess request
 * indefinitely. Module constant, not environment configuration — mirrors
 * `lib/providers/registry.ts`'s own `PROVIDER_CALL_TIMEOUT_MS`. */
const PROVIDER_CALL_TIMEOUT_MS = 5000;

const KNOWN_PROVIDERS: Readonly<Record<string, BeneficiaryVerificationProvider>> = Object.freeze({
  [STUB_PROVIDER_ID]: stubBeneficiaryVerificationProvider,
});

export const KNOWN_BENEFICIARY_VERIFICATION_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(KNOWN_PROVIDERS));

export function isKnownBeneficiaryVerificationProviderId(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(KNOWN_PROVIDERS, providerId);
}

export function isStubBeneficiaryVerificationProviderId(providerId: string): boolean {
  return providerId === STUB_PROVIDER_ID;
}

/** Resolves the configured provider. Throws (never returns undefined) on an unknown id —
 * `config.ts`'s own boot-time validation is what makes an unknown id unreachable here in
 * practice; this is a defensive second layer. Own-property check guards against a caller-
 * influenced key resolving to an inherited `Object.prototype` member (mirrors
 * `lib/providers/registry.ts`'s own M-D0-1 remediation discipline). */
export function resolveBeneficiaryVerificationProvider(providerId: string): BeneficiaryVerificationProvider {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_PROVIDERS, providerId)) {
    throw new Error(`Unknown WLT-01 beneficiary-verification provider id: ${providerId}`);
  }
  return KNOWN_PROVIDERS[providerId]!;
}

const PROVIDER_TIMEOUT_REASON_CODE = "provider_timeout";

export async function verifyViaProvider(provider: BeneficiaryVerificationProvider, input: BeneficiaryVerificationInput): Promise<BeneficiaryVerificationOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BeneficiaryVerificationOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "unavailable", reasonCode: PROVIDER_TIMEOUT_REASON_CODE }), PROVIDER_CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([provider.verify(input), timeout]);
  } catch {
    return { kind: "unavailable", reasonCode: "provider_error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
