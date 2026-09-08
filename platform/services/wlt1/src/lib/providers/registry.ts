/**
 * WLT-01 Phase 2B — the ONE place a `WLT1_SCREENING_PROVIDER` string is resolved into a concrete
 * `WalletAnalyticsProvider`. A future Phase 2C route imports only from this file (plus `./types.js`
 * for the type shapes) — never `./stub-provider.js` directly, and never a real vendor SDK — so a
 * future real-vendor adaptor is a registry entry, not a route rewrite. Deny-by-default: only
 * `stub-wallet-analytics-v1` is known this phase; an unconfigured/unknown id fails startup closed
 * (`config.ts`), never falls back to the stub or to any other provider.
 *
 * `screenViaProvider` is a call-timeout wrapper prepared now, alongside the provider abstraction it
 * bounds, even though no Phase 2B/2C route calls it yet — the timeout boundary is a property of the
 * abstraction itself (mirrors AML-01's own `screenViaProvider`/`PROVIDER_CALL_TIMEOUT_MS`,
 * structural convention only, never cross-service import). A hung/slow provider can never hang a
 * future screening request indefinitely. Timeout resolves as `unavailable`, never `clear` — no
 * always-clear fallback, in production or otherwise.
 *
 * Phase 2C-D0 (GAP-2 remediation): the registry is now VERSION-ADDRESSED —
 * `providerId -> adaptorVersion -> WalletAnalyticsProvider` — instead of `providerId -> ONE
 * adaptor`. Independent Opus review proved a single-version registry cannot safely serve Phase
 * 2C-D's future asynchronous receipt processing: a receipt may arrive for a screening version
 * frozen against an OLD adaptor version after the deployed build has advanced to a NEW one, and
 * normalizing that old evidence with the new adaptor would silently corrupt the evidence trail.
 * `resolveCurrentWalletAnalyticsProvider(providerId)` — the SAME behavior C2/C3 have always had
 * (resolve the provider's current/latest configured adaptor) — is what `wallet-screening.ts` calls
 * for BOTH the draft-initiation path and the C3 resume path; neither path's behavior changes.
 * `resolveWalletAnalyticsProviderVersion(providerId, adaptorVersion)` resolves one EXACT historical
 * version and NEVER falls back to current/latest on a miss — the lookup Phase 2C-D's own receipt
 * adaptor resolution will need (`pending_row.provider_id` + `pending_row.provider_adaptor_version`)
 * but that receipt-processing caller does not exist yet; this file only prepares the registry SHAPE
 * that call will need. The registry remains fully static/frozen application-code data — no dynamic
 * plugin loading, no DB-backed adaptor definitions, no external service discovery. Today's build
 * legitimately contains exactly one provider at exactly one version (`stub-wallet-analytics-v1` @
 * `"1"`) — no fabricated historical version is invented merely to populate the map; the map SHAPE
 * is what changed, not its current contents.
 */
import { STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, stubProvider } from "./stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput, WalletScreeningOutcome } from "./types.js";

/** Bounded so a hung/slow provider can never block a future WLT-01 screening request indefinitely.
 * A module constant, not environment configuration — same precedent as AML-01's own
 * `PROVIDER_CALL_TIMEOUT_MS` and this service's own `lib/clt1-client.ts` 5s HTTP bound. */
const PROVIDER_CALL_TIMEOUT_MS = 5000;

/** `providerId -> adaptorVersion -> WalletAnalyticsProvider`. Both levels frozen — neither a new
 * provider id nor a new version for an existing provider id can be added at runtime. */
const WALLET_ANALYTICS_PROVIDER_VERSIONS: Readonly<Record<string, Readonly<Record<string, WalletAnalyticsProvider>>>> = Object.freeze({
  [STUB_PROVIDER_ID]: Object.freeze({
    [STUB_ADAPTOR_VERSION]: stubProvider,
  }),
});

/** `providerId -> the adaptorVersion C2/C3 synchronous calls resolve today`. A SEPARATE map from
 * `WALLET_ANALYTICS_PROVIDER_VERSIONS` (rather than, say, "the highest version key present") so
 * "current" is an explicit, frozen, independently-reviewable fact — never inferred by string/semver
 * sort order, which would be both fragile and an invented ordering policy this file has no mandate
 * to define. */
const CURRENT_ADAPTOR_VERSION: Readonly<Record<string, string>> = Object.freeze({
  [STUB_PROVIDER_ID]: STUB_ADAPTOR_VERSION,
});

/** Every provider id this build of WLT-01 knows how to resolve — `config.ts` validates
 * `WLT1_SCREENING_PROVIDER` against this set at boot, fail-closed on an unknown id. */
export const KNOWN_WALLET_ANALYTICS_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(WALLET_ANALYTICS_PROVIDER_VERSIONS));

export function isKnownWalletAnalyticsProviderId(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(WALLET_ANALYTICS_PROVIDER_VERSIONS, providerId);
}

export function isStubWalletAnalyticsProviderId(providerId: string): boolean {
  return providerId === STUB_PROVIDER_ID;
}

/** Resolves ONE EXACT `(providerId, adaptorVersion)` pair — throws (never returns undefined, never
 * falls back to current/latest) on an unknown provider id OR a provider id whose known-version set
 * does not contain the requested `adaptorVersion`. This is the lookup a future Phase 2C-D receipt
 * adaptor resolution will use against a pending row's own frozen `provider_id`/
 * `provider_adaptor_version` — if that exact version has been retired from the deployed registry,
 * the caller must fail closed, never silently normalize old evidence under a different adaptor.
 *
 * M-D0-1 remediation (Phase 2C-D1): independent Opus review of Phase 2C-D0 proved bare property
 * indexing (`versions[adaptorVersion]`) is unsafe for a caller-influenced key — `adaptorVersion`
 * values like `"constructor"`, `"__proto__"`, `"toString"`, `"hasOwnProperty"`, or `"valueOf"`
 * resolve to inherited `Object.prototype`/`Function.prototype` members instead of throwing,
 * silently violating this function's own "unknown version fails closed" contract. Both the
 * provider-id lookup (`versions`) AND the version lookup (`provider`) below now require an
 * explicit OWN-property test (`Object.prototype.hasOwnProperty.call`) before ever reading the
 * value — a bare truthiness check on the read result is not sufficient, since `versions.toString`
 * is itself a truthy inherited function. This closes the hole for BOTH lookups even though only
 * the version lookup was the reported reproduction, because the provider-id map is the identical
 * shape and the identical caller-influenced-key hazard applies to it too. No fallback, no string
 * normalization, no allowlist of "just these five dangerous names" — the rule is unconditional:
 * ONLY an own key of the frozen map is ever resolvable. */
export function resolveWalletAnalyticsProviderVersion(providerId: string, adaptorVersion: string): WalletAnalyticsProvider {
  if (!Object.prototype.hasOwnProperty.call(WALLET_ANALYTICS_PROVIDER_VERSIONS, providerId)) {
    throw new Error(`Unknown WLT-01 wallet-analytics provider id: ${providerId}`);
  }
  const versions = WALLET_ANALYTICS_PROVIDER_VERSIONS[providerId]!;
  if (!Object.prototype.hasOwnProperty.call(versions, adaptorVersion)) {
    throw new Error(`Unknown adaptor version '${adaptorVersion}' for WLT-01 wallet-analytics provider id: ${providerId}`);
  }
  return versions[adaptorVersion]!;
}

/** Resolves the provider's CURRENT/latest configured adaptor — the exact behavior `resolveWalletAnalyticsProvider`
 * (this function's Phase 2B/2C-C2/2C-C3 predecessor name) has always had; C2 draft-initiation and C3
 * resume both call this, so their behavior is unchanged by the Phase 2C-D0 registry refactor. Throws
 * (never returns undefined) on an unknown provider id — `config.ts`'s own boot-time validation is
 * what makes an unknown id unreachable here in practice; this is a defensive second layer, not the
 * primary gate. Delegates to `resolveWalletAnalyticsProviderVersion` so there is exactly ONE place
 * that ever indexes into `WALLET_ANALYTICS_PROVIDER_VERSIONS`. */
export function resolveCurrentWalletAnalyticsProvider(providerId: string): WalletAnalyticsProvider {
  // M-D0-1: own-property check for the identical prototype-chain-key reason documented on
  // resolveWalletAnalyticsProviderVersion above — defense in depth, not merely relying on the
  // delegation below to reject the same hazard a second time.
  if (!Object.prototype.hasOwnProperty.call(CURRENT_ADAPTOR_VERSION, providerId)) {
    throw new Error(`Unknown WLT-01 wallet-analytics provider id: ${providerId}`);
  }
  const currentVersion = CURRENT_ADAPTOR_VERSION[providerId]!;
  return resolveWalletAnalyticsProviderVersion(providerId, currentVersion);
}

const PROVIDER_TIMEOUT_REASON_CODE = "provider_timeout";

export async function screenViaProvider(provider: WalletAnalyticsProvider, input: WalletScreeningInput): Promise<WalletScreeningOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WalletScreeningOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "unavailable", reasonCode: PROVIDER_TIMEOUT_REASON_CODE }), PROVIDER_CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([provider.screen(input), timeout]);
  } catch {
    // A provider implementation that itself throws (e.g. a future real HTTP adaptor's own
    // network-error catch re-throwing instead of returning `unavailable`) is fail-closed here too
    // — never treated as a completed screen.
    return { kind: "unavailable", reasonCode: "provider_error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
