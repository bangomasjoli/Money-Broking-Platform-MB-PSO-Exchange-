/**
 * WLT-01 Phase 2B/2C-A/2C-B/2C-C1 — the deterministic stub wallet-analytics provider. No external
 * network call, no real wallet-analytics vendor data, no clustering/exposure engine, no scoring
 * engine — replacing this with a real vendor adaptor is explicitly out of scope until a
 * real-vendor phase is planned (deferred until after WLT-01 Phase 6).
 *
 * Phase 2C-B (P2CA-MED-1 remediation): this stub no longer returns `sourceAuthenticated`/
 * `payloadHash` at all — both were removed from `NormalizedScreeningResult` itself. A provider
 * has no receipt to hash and no external caller to authenticate; the fixture placeholder hash
 * (`sha256:stub:...`) that previously appeared here is GONE, not replaced with a real one — see
 * `types.ts`'s `ScreeningEvidenceEnvelope` for where those facts now live, supplied by
 * `lib/screening-application.ts`'s `applyNormalizedScreeningResult`, never by any provider.
 *
 * Deterministic fixture-map design (mirrors AML-01's own `stub-provider.ts` "unmistakable TEST
 * fixture name" precedent, by structural convention only — never by cross-service import, F3(c)):
 * outcome selection is keyed by a STABLE COMPOSITE `chain:network:canonicalAddress` triplet
 * against a fixed, exported map (P2CA-LOW-1 remediation, below) — never by the address alone.
 * There is NO caller-controllable request field that selects an outcome — a future Phase 2C route
 * passes only the ALREADY-CANONICALISED address (the same value `lib/address/index.ts` produces),
 * never a raw "desired outcome" parameter.
 *
 * P2CA-LOW-1 remediation (Phase 2C-C1): prior to this phase, fixture lookup was keyed by
 * `canonicalAddress` ALONE — independent Opus review proved the Ethereum `clear` fixture still
 * returned `screened/clear` even when passed with `chain: "tron"`, and likewise for every other
 * fixture, because `chain`/`network` were never part of the lookup identity. Fixture identity is
 * now the composite `` `${chain}:${network}:${canonicalAddress}` `` triplet (`fixtureKey` below)
 * — ALL SEVEN scenarios (the four risk fixtures AND the three special-case outcomes) use the same
 * triplet discipline. A correct address paired with the WRONG chain or WRONG network no longer
 * reaches its configured outcome; it falls through to the same bounded fail-closed `unavailable`
 * (`no_stub_fixture_configured`) as any other unrecognised triplet — there is no secondary
 * address-only fallback anywhere in this file. The provider performs no canonicalisation,
 * case-folding, or alias repair of its own — `chain`/`network`/`canonicalAddress` are expected
 * already-canonical on input, exactly as `WalletScreeningInput` has always specified.
 *
 * P2B-MED-1 remediation (Phase 2C-A, Gate 2C-A-1): prior to this phase, every fixture key was a
 * symbolic label (e.g. `"WLT1_TEST_STUB_ADDRESS_CLEAR"`) that FAILED the real canonicalisation
 * layer on both supported chains — a future screening route passing a genuinely canonicalised
 * address could never organically reach any scenario but `no_stub_fixture_configured` →
 * `unavailable`. The seven exported `WLT1_TEST_STUB_ADDRESS_*` constant NAMES are retained (still
 * unmistakable, still test-only), but every constant's VALUE is now a real, synthetic-but-valid
 * canonical wallet address independently verified against `canonicaliseAddress` — genuine EIP-55
 * checksums (produced by the real Keccak-256 canonicaliser from lowercase input, never
 * hand-written) and genuine TRON Base58Check encodings. None is a real customer address; none is
 * the zero address. `tests/unit/wlt1-providers.test.ts` proves, for all seven, that
 * `canonicaliseAddress(chain, network, fixture)` returns `ok: true` with `canonicalAddress ===
 * fixture` (canonicalisation-idempotent), and that the full organic path
 * (canonicalisation → `stubProvider.screen`) reaches the intended outcome — not merely that the
 * stub's own internal map contains the key.
 *
 * NO ALWAYS-CLEAR FALLBACK: a triplet not present in `FIXTURE_RESULTS`/the three special cases
 * below returns a deterministic, bounded, fail-closed `unavailable` result (reason
 * `no_stub_fixture_configured`) — never `clear`. This is a permanent property of the stub, not a
 * Phase 2B/2C-A-only safeguard; a future real adaptor's OWN "vendor did not recognize this address"
 * case must be equally fail-closed.
 *
 * L1 / stub-issuance-time remediation (Phase 2C-C1): this stub previously emitted a fixed
 * `new Date(0).toISOString()` (`1970-01-01T00:00:00.000Z`) as `issuedAtUtc` — harmless while
 * nothing enforced temporal validity, but once L1's strict enforcement is reached (Gate 2C-B's
 * own 720h ceiling), an epoch-0 `issuedAtUtc` is already decades expired. `issuedAtUtc` is now
 * produced by an INJECTABLE clock (`Pick<TimeService, "nowUtc">`, `@aix/foundation`'s own accepted
 * time abstraction — no competing clock seam introduced): `createStubWalletAnalyticsProvider(time)`
 * accepts one, and the frozen `stubProvider` export below is constructed with the real
 * `systemTime` singleton, so RUNTIME issuance is always current UTC while TESTS can inject a fixed
 * `now` for full determinism. `WalletScreeningInput` is UNCHANGED — the caller can never supply an
 * `issuedAtUtc`; only the injected clock ever determines it.
 *
 * Stub risk scores/categories below are FIXTURES ONLY — they exist so a future Phase 2C test suite
 * has deterministic, reproducible outcomes to assert against. They encode no business-policy
 * threshold; nothing in this file or `registry.ts` ever compares a score against a cutoff.
 */
import { systemTime, type TimeService } from "@aix/foundation";
import type {
  WalletAnalyticsProvider,
  WalletScreeningInput,
  WalletScreeningOutcome,
  NormalizedScreeningResult,
  RiskCategory,
  ReceiptNormalizationInput,
  ReceiptNormalizationOutcome,
} from "./types.js";
import { isKnownRiskCategory, isKnownRiskStatus, normalizeExposure, isSanctionsConsistent } from "./types.js";

export const STUB_PROVIDER_ID = "stub-wallet-analytics-v1";
export const STUB_ADAPTOR_VERSION = "1";

// ---------------------------------------------------------------------------------------------
// P2B-MED-1 remediation: real, synthetic-but-canonicalisation-valid fixture addresses. Every value
// below independently passes the real `canonicaliseAddress` on its stated chain/network and is
// canonicalisation-idempotent (re-feeding the canonical output returns the same value) — verified
// directly, not merely trusted, in tests/unit/wlt1-providers.test.ts. None is a real customer
// address or the zero address. Exported constant names are retained as stable test-fixture
// identifiers; the constant NAME is not the lookup identity — the canonical address VALUE is.
// ---------------------------------------------------------------------------------------------
export const WLT1_TEST_STUB_ADDRESS_CLEAR = "0x56445b274e67797c7a0C151919085239322a31c5";
export const WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED = "0x56445B274E67797c6b16101919085239322A31d4";
export const WLT1_TEST_STUB_ADDRESS_HIGH_RISK = "TG1mwc48txnCWUGN3JK2ZxR54RpAHcuMeM";
export const WLT1_TEST_STUB_ADDRESS_HIT = "TG1mwc48txnCVqsHLDw1ZZGg3s3hMuJTTt";
export const WLT1_TEST_STUB_ADDRESS_UNAVAILABLE = "0x56445b274E67797C6c0E061919085239322a31D3";
export const WLT1_TEST_STUB_ADDRESS_MALFORMED = "TG1mwc48txnE7hj2sDDzdCgtQsmHY4MyDS";
/** Proves the fail-closed unmapped-category path distinctly from the "no fixture at all" path. */
export const WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY = "0x56445b274E67797C6C0e0a1919085239322A31D3";

interface RawFixtureResult {
  riskStatus: "clear" | "review_required" | "high_risk" | "hit";
  riskScore: number | null;
  rawCategories: string[];
  rawDirectExposure: unknown[];
  rawIndirectExposure: unknown[];
  sanctionsExposure: boolean | null;
  clusterRef: string | null;
}

/** P2CA-LOW-1 — the ONE fixture-identity key format: a stable composite of chain, network, and
 * canonical address. No aliasing, no case-folding — inputs are expected already canonical. */
function fixtureKey(chain: string, network: string, canonicalAddress: string): string {
  return `${chain}:${network}:${canonicalAddress}`;
}

const FIXTURE_RESULTS: Record<string, RawFixtureResult> = {
  [fixtureKey("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR)]: {
    riskStatus: "clear",
    riskScore: 2.0,
    rawCategories: [],
    rawDirectExposure: [],
    rawIndirectExposure: [],
    sanctionsExposure: false,
    clusterRef: null,
  },
  [fixtureKey("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED)]: {
    riskStatus: "review_required",
    riskScore: 45.5,
    rawCategories: ["mixer"],
    rawDirectExposure: [{ category: "mixer" }],
    rawIndirectExposure: [],
    sanctionsExposure: false,
    clusterRef: "stub-cluster-review",
  },
  [fixtureKey("tron", "mainnet", WLT1_TEST_STUB_ADDRESS_HIGH_RISK)]: {
    riskStatus: "high_risk",
    riskScore: 82.25,
    rawCategories: ["darknet", "stolen_funds"],
    rawDirectExposure: [{ category: "darknet" }],
    rawIndirectExposure: [{ category: "stolen_funds" }],
    sanctionsExposure: false,
    clusterRef: "stub-cluster-high-risk",
  },
  [fixtureKey("tron", "mainnet", WLT1_TEST_STUB_ADDRESS_HIT)]: {
    // A sanctions hit may legitimately carry no numeric score — sanctionsExposure is the
    // categorical signal, never a score threshold (Phase 2B planning §18/Locked Decision).
    riskStatus: "hit",
    riskScore: null,
    rawCategories: ["sanctions"],
    rawDirectExposure: [{ category: "sanctions" }],
    rawIndirectExposure: [],
    sanctionsExposure: true,
    clusterRef: "stub-cluster-hit",
  },
};

/** The three special-case outcomes, likewise triplet-bound — none is reachable by address alone. */
const SPECIAL_UNAVAILABLE_KEY = fixtureKey("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_UNAVAILABLE);
const SPECIAL_MALFORMED_KEY = fixtureKey("tron", "mainnet", WLT1_TEST_STUB_ADDRESS_MALFORMED);
const SPECIAL_UNMAPPED_CATEGORY_KEY = fixtureKey("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY);

function normalizeRiskCategories(rawCategories: readonly string[]): RiskCategory[] | undefined {
  const normalized = rawCategories.map((c) => c.trim().toLowerCase());
  for (const category of normalized) {
    if (!isKnownRiskCategory(category)) return undefined; // fail closed — caller maps this to invalid_response
  }
  return Array.from(new Set(normalized)).sort() as RiskCategory[];
}

function fingerprintFixture(fixtureIdentityKey: string, riskStatus: string): string {
  // Deterministic, bounded provider-result-id fixture — never random, never wall-clock-derived.
  return `stub-result-${riskStatus}-${fixtureIdentityKey.toLowerCase()}`;
}

/**
 * Phase 2C-D3A — deterministic TEST/DEVELOPMENT-ONLY stub receipt normalization. Pure, synchronous,
 * local: reads only `input.result`, never touches the network/DB/clock — matches the frozen
 * `normalizeReceipt` contract exactly (`types.ts`'s own header comment). This is NOT a real vendor
 * receipt schema and makes no claim about one; it exists solely so D3A's own normalization/
 * validation pipeline has a deterministic, reproducible fixture to exercise. The expected shape
 * (obviously synthetic, snake_case, mirrors the DB-column naming already used elsewhere in this
 * service's own receipt-adjacent code):
 *   { provider_result_id, risk_status, risk_score, risk_categories, direct_exposure,
 *     indirect_exposure, sanctions_exposure, cluster_ref, issued_at_utc, valid_until_utc }
 * Every field is REQUIRED (even when its legal value is `null`) — a field silently absent from the
 * provider-native body is `invalid_structure`, never treated as an implicit `null`. The
 * `provider_result_id` cross-check against the receipt envelope's OWN `provider_result_id` is
 * deliberately NOT performed here — that is the caller's (the receipt route's) own authoritative
 * responsibility, so replay identity is never redefined by provider-controlled output (see
 * `routes/provider-receipt.ts`).
 */
function normalizeStubReceipt(input: ReceiptNormalizationInput): ReceiptNormalizationOutcome {
  const raw = input.result;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }
  const r = raw as Record<string, unknown>;
  const REQUIRED_FIELDS = [
    "provider_result_id",
    "risk_status",
    "risk_score",
    "risk_categories",
    "direct_exposure",
    "indirect_exposure",
    "sanctions_exposure",
    "cluster_ref",
    "issued_at_utc",
    "valid_until_utc",
  ] as const;
  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(r, field)) {
      return { kind: "invalid", reasonCode: "invalid_structure" };
    }
  }

  const providerResultId = r.provider_result_id;
  if (typeof providerResultId !== "string" || providerResultId.length === 0) {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const rawRiskStatus = r.risk_status;
  if (typeof rawRiskStatus !== "string" || !isKnownRiskStatus(rawRiskStatus)) {
    return { kind: "invalid", reasonCode: "unmapped_risk_status" };
  }

  const riskScore = r.risk_score;
  if (riskScore !== null && typeof riskScore !== "number") {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const rawCategories = r.risk_categories;
  if (!Array.isArray(rawCategories) || !rawCategories.every((c) => typeof c === "string")) {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }
  const riskCategories = normalizeRiskCategories(rawCategories as string[]);
  if (riskCategories === undefined) {
    return { kind: "invalid", reasonCode: "unmapped_risk_category" };
  }

  const directExposure = normalizeExposure(r.direct_exposure);
  if (directExposure === undefined) {
    return { kind: "invalid", reasonCode: "invalid_direct_exposure" };
  }
  const indirectExposure = normalizeExposure(r.indirect_exposure);
  if (indirectExposure === undefined) {
    return { kind: "invalid", reasonCode: "invalid_indirect_exposure" };
  }

  const sanctionsExposure = r.sanctions_exposure;
  if (sanctionsExposure !== null && typeof sanctionsExposure !== "boolean") {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const clusterRef = r.cluster_ref;
  if (clusterRef !== null && typeof clusterRef !== "string") {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const issuedAtUtc = r.issued_at_utc;
  if (typeof issuedAtUtc !== "string") {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const validUntilUtc = r.valid_until_utc;
  if (validUntilUtc !== null && typeof validUntilUtc !== "string") {
    return { kind: "invalid", reasonCode: "invalid_structure" };
  }

  const result: NormalizedScreeningResult = {
    providerResultId,
    riskStatus: rawRiskStatus,
    riskScore,
    riskCategories,
    directExposure,
    indirectExposure,
    sanctionsExposure,
    clusterRef,
    issuedAtUtc,
    validUntilUtc,
  };

  // Defensive re-check, mirrors screen()'s own identical belt-and-suspenders posture — the
  // AUTHORITATIVE sanctions-consistency + temporal enforcement is the shared
  // `validateNormalizedScreeningResult` the CALLER (provider-receipt.ts) applies afterward; this is
  // a second, redundant layer here, not the primary gate.
  if (!isSanctionsConsistent(result)) {
    return { kind: "invalid", reasonCode: "sanctions_exposure_inconsistent" };
  }

  return { kind: "normalized", result };
}

/**
 * L1 / stub-issuance-time remediation — the ONE construction seam for the stub provider. `time`
 * supplies `issuedAtUtc` (`nowUtc()`, `@aix/foundation`'s own accepted `TimeService` shape,
 * narrowed to the one method actually used) — runtime composition (`stubProvider`, below) injects
 * the real `systemTime` singleton; tests inject a fixed `{ nowUtc: () => FIXED_ISO }` for full
 * determinism under a deterministic clock. `WalletScreeningInput` is unaffected — the caller can
 * never supply a time value of any kind.
 */
export function createStubWalletAnalyticsProvider(time: Pick<TimeService, "nowUtc">): WalletAnalyticsProvider {
  return {
    providerId: STUB_PROVIDER_ID,
    adaptorVersion: STUB_ADAPTOR_VERSION,
    normalizeReceipt: normalizeStubReceipt,
    async screen(input: WalletScreeningInput): Promise<WalletScreeningOutcome> {
      // P2CA-LOW-1 — the ONE lookup key: chain/network/canonicalAddress together. No
      // address-only fallback exists anywhere below this line.
      const key = fixtureKey(input.chain, input.network, input.canonicalAddress);

      if (key === SPECIAL_UNAVAILABLE_KEY) {
        return { kind: "unavailable", reasonCode: "provider_unavailable" };
      }
      if (key === SPECIAL_MALFORMED_KEY) {
        return { kind: "invalid_response", reasonCode: "provider_malformed_response" };
      }
      if (key === SPECIAL_UNMAPPED_CATEGORY_KEY) {
        return { kind: "invalid_response", reasonCode: "unmapped_risk_category" };
      }

      const fixture = FIXTURE_RESULTS[key];
      if (!fixture) {
        // NO ALWAYS-CLEAR FALLBACK, NO ADDRESS-ONLY FALLBACK — a triplet with no configured
        // fixture (including a real fixture address paired with the WRONG chain/network) is a
        // bounded fail-closed "unavailable", not a silent "clear" or a stale-scenario match.
        return { kind: "unavailable", reasonCode: "no_stub_fixture_configured" };
      }

      const riskCategories = normalizeRiskCategories(fixture.rawCategories);
      if (riskCategories === undefined) {
        // Defensive — no FIXTURE_RESULTS entry above actually contains an unmapped category, but a
        // future fixture edit is caught here rather than silently persisting an invalid category.
        return { kind: "invalid_response", reasonCode: "unmapped_risk_category" };
      }
      const directExposure = normalizeExposure(fixture.rawDirectExposure);
      if (directExposure === undefined) {
        return { kind: "invalid_response", reasonCode: "invalid_direct_exposure" };
      }
      const indirectExposure = normalizeExposure(fixture.rawIndirectExposure);
      if (indirectExposure === undefined) {
        return { kind: "invalid_response", reasonCode: "invalid_indirect_exposure" };
      }

      const providerResultId = fingerprintFixture(key, fixture.riskStatus);
      const issuedAtUtc = time.nowUtc(); // injected clock — real current UTC at runtime, fixed under test
      const result: NormalizedScreeningResult = {
        providerResultId,
        riskStatus: fixture.riskStatus,
        riskScore: fixture.riskScore,
        riskCategories,
        directExposure,
        indirectExposure,
        sanctionsExposure: fixture.sanctionsExposure,
        clusterRef: fixture.clusterRef,
        issuedAtUtc,
        validUntilUtc: null,
      };
      if (!isSanctionsConsistent(result)) {
        // Defensive — no FIXTURE_RESULTS entry above actually violates this rule, but a future
        // fixture edit is caught here rather than silently persisting an inconsistent result.
        return { kind: "invalid_response", reasonCode: "sanctions_exposure_inconsistent" };
      }
      return { kind: "screened", result };
    },
  };
}

/** The frozen production/registry instance — real current-UTC issuance via the real `systemTime`
 * singleton. `registry.ts` imports this SAME export name, so no registry/server change is needed. */
export const stubProvider: WalletAnalyticsProvider = createStubWalletAnalyticsProvider(systemTime);
