/**
 * WLT-01 Fiat Payout Destinations (APAC) — the ONE place a `WLT1_FIAT_SCREENING_PROVIDER` string
 * is resolved into a concrete `FiatDestinationScreeningProvider`. Deny-by-default: only
 * `stub-fiat-screening-v1` is known this phase; an unconfigured/unknown id fails startup closed
 * (`config.ts`). Mirrors `lib/providers/registry.ts`'s own discipline, structural convention only
 * — own copy, F3(c). No version-addressing (synchronous-only this phase).
 */
import { STUB_PROVIDER_ID, stubFiatScreeningProvider } from "./stub-provider.js";
import type { FiatDestinationScreeningInput, FiatDestinationScreeningOutcome, FiatDestinationScreeningProvider } from "./types.js";

const PROVIDER_CALL_TIMEOUT_MS = 5000;

const KNOWN_PROVIDERS: Readonly<Record<string, FiatDestinationScreeningProvider>> = Object.freeze({
  [STUB_PROVIDER_ID]: stubFiatScreeningProvider,
});

export const KNOWN_FIAT_SCREENING_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(KNOWN_PROVIDERS));

export function isKnownFiatScreeningProviderId(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(KNOWN_PROVIDERS, providerId);
}

export function isStubFiatScreeningProviderId(providerId: string): boolean {
  return providerId === STUB_PROVIDER_ID;
}

export function resolveFiatScreeningProvider(providerId: string): FiatDestinationScreeningProvider {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_PROVIDERS, providerId)) {
    throw new Error(`Unknown WLT-01 fiat-screening provider id: ${providerId}`);
  }
  return KNOWN_PROVIDERS[providerId]!;
}

const PROVIDER_TIMEOUT_REASON_CODE = "provider_timeout";

export async function screenFiatDestinationViaProvider(provider: FiatDestinationScreeningProvider, input: FiatDestinationScreeningInput): Promise<FiatDestinationScreeningOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FiatDestinationScreeningOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "unavailable", reasonCode: PROVIDER_TIMEOUT_REASON_CODE }), PROVIDER_CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([provider.screen(input), timeout]);
  } catch {
    return { kind: "unavailable", reasonCode: "provider_error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
