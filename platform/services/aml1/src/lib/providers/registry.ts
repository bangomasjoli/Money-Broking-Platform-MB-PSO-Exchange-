/**
 * AML-01 Phase 3B — the ONE place a `screening_provider_id` string is resolved into a concrete
 * `ScreeningProvider`, and the ONE place a provider is actually invoked. `routes/screening.ts`
 * imports only from this file (plus `./types.js` for the type shapes) — never `./stub-provider.js`
 * directly, and never a real vendor SDK — so the route handler stays provider-agnostic and a future
 * real-vendor adaptor is a registry entry, not a route rewrite.
 *
 * `screenViaProvider` is TIMEOUT-BOUNDED regardless of which provider is behind it (5s, mirrors
 * `lib/iam2-client.ts`/`lib/clt1-client.ts`'s own `AbortSignal.timeout`-bounded HTTP clients) — a
 * hung provider can never hang an AML-01 screening request indefinitely. The in-process
 * deterministic stub resolves instantly today, but the wrapper is provider-agnostic: a future real
 * HTTP-backed adaptor gets the same bound for free. A timeout is reported as `kind: "unavailable"`
 * (never `clear`) — no always-clear fallback, in production or otherwise.
 */
import { STUB_PROVIDER_ID, stubProvider } from "./stub-provider.js";
import type { ProviderScreeningOutcome, ProviderScreeningPayload, ScreeningProvider } from "./types.js";

/** Bounded so a hung/slow provider can never block an AML-01 screening request indefinitely. */
const PROVIDER_CALL_TIMEOUT_MS = 5000;

const SCREENING_PROVIDER_REGISTRY: Readonly<Record<string, ScreeningProvider>> = {
  [STUB_PROVIDER_ID]: stubProvider,
};

/** Every provider id this build of AML-01 knows how to resolve — `config.ts` validates
 * `AML1_SCREENING_PROVIDER` against this set at boot, fail-closed on an unknown id. */
export const KNOWN_SCREENING_PROVIDER_IDS: readonly string[] = Object.keys(SCREENING_PROVIDER_REGISTRY);

export function isKnownScreeningProviderId(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCREENING_PROVIDER_REGISTRY, providerId);
}

/** Throws (never returns undefined) — `config.ts`'s own boot-time validation is what makes an
 * unknown id unreachable here in practice; this is a defensive second layer, not the primary gate. */
export function resolveScreeningProvider(providerId: string): ScreeningProvider {
  const provider = SCREENING_PROVIDER_REGISTRY[providerId];
  if (!provider) {
    throw new Error(`Unknown AML-01 screening provider id: ${providerId}`);
  }
  return provider;
}

const PROVIDER_TIMEOUT_REASON_CODE = "provider_timeout";

export async function screenViaProvider(provider: ScreeningProvider, payload: ProviderScreeningPayload): Promise<ProviderScreeningOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProviderScreeningOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "unavailable", reasonCode: PROVIDER_TIMEOUT_REASON_CODE }), PROVIDER_CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([provider.screen(payload), timeout]);
  } catch {
    // A provider implementation that itself throws (e.g. a real HTTP adaptor's own network-error
    // catch re-throwing instead of returning `unavailable`) is fail-closed here too — never treated
    // as a completed screen.
    return { kind: "unavailable", reasonCode: "provider_error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
