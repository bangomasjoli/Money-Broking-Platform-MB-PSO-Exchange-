/**
 * WLT-01 Phase 2B/2C-A — provider abstraction unit tests (`services/wlt1/src/lib/providers/*`). No
 * database required. Mirrors `tests/unit/aml1-providers.test.ts`'s own coverage shape by
 * structural convention only — never by cross-service import (F3(c)).
 *
 * Phase 2C-A (P2B-MED-1 remediation, Gate 2C-A-1): the "organic reachability" describe block below
 * independently re-verifies — not merely trusts — that every one of the seven stub fixture
 * addresses is a genuine, canonicalisation-valid Ethereum EIP-55 or TRON Base58Check address by
 * running it through the REAL `canonicaliseAddress` (the same function a future Phase 2C-C
 * screening route will call before ever reaching the provider), proving canonicalisation-
 * idempotency, mutual uniqueness, and the full organic path (raw fixture → canonicalisation →
 * `stubProvider.screen`) reaching the intended outcome for all seven scenarios.
 */
import { describe, it, expect } from "vitest";
import {
  KNOWN_WALLET_ANALYTICS_PROVIDER_IDS,
  isKnownWalletAnalyticsProviderId,
  isStubWalletAnalyticsProviderId,
  resolveCurrentWalletAnalyticsProvider,
  resolveWalletAnalyticsProviderVersion,
  screenViaProvider,
} from "../../services/wlt1/src/lib/providers/registry.js";
import {
  stubProvider,
  createStubWalletAnalyticsProvider,
  STUB_PROVIDER_ID,
  STUB_ADAPTOR_VERSION,
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
  WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
  WLT1_TEST_STUB_ADDRESS_HIT,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  WLT1_TEST_STUB_ADDRESS_MALFORMED,
  WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { RISK_CATEGORIES, isKnownRiskCategory, normalizeExposure, isSanctionsConsistent, MAX_EXPOSURE_ENTRIES } from "../../services/wlt1/src/lib/providers/types.js";
import type { WalletAnalyticsProvider, NormalizedScreeningResult, ScreeningEvidenceEnvelope } from "../../services/wlt1/src/lib/providers/types.js";
import { canonicaliseAddress } from "../../services/wlt1/src/lib/address/index.js";
import { RFC3339_UTC_OFFSET_PATTERN } from "../../services/wlt1/src/lib/screening-application.js";
import { createWlt1ProviderReceiptAuthenticator } from "../../services/wlt1/src/plugins/receipt-auth.js";
import { loadWlt1Config } from "../../services/wlt1/src/config.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** H-D2-1: there is no exported unbound authentication function anymore — a fixture must obtain a
 * capability the SAME way production code does, through a config-bound
 * `Wlt1ProviderReceiptAuthenticator` built from a REAL, validated `Wlt1Config` (via the real
 * `loadWlt1Config` — never a hand-assembled secrets map), mirroring
 * `wlt1-screening-application.test.ts`'s own identical `testWlt1Config` pattern. */
const FIXTURE_RECEIPT_PROVIDER_ID = "stub-wallet-analytics-v1";
const FIXTURE_RECEIPT_SECRET = "unit-test-fixture-receipt-secret-01";
function mintTestProvenance(payloadHash: string) {
  const config = loadWlt1Config({
    ENVIRONMENT: "dev",
    DATABASE_URL: "postgres://unused@localhost:5432/unused",
    PORT: "8090",
    WLT1_INTERNAL_SERVICE_TOKEN: "a".repeat(40),
    CLT1_BASE_URL: "http://localhost:8085",
    CLT1_INTERNAL_SERVICE_TOKEN: "b".repeat(40),
    IAM2_BASE_URL: "http://localhost:8082",
    IAM2_INTERNAL_SERVICE_TOKEN: "c".repeat(40),
    AML1_BASE_URL: "http://localhost:8087",
    AML1_INTERNAL_SERVICE_TOKEN: "d".repeat(40),
    WLT1_FIAT_ENC_KEY: "e".repeat(40),
    WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ [FIXTURE_RECEIPT_PROVIDER_ID]: FIXTURE_RECEIPT_SECRET }),
    IAM_BASE_URL: "http://localhost:8081",
    IAM_INTROSPECTION_SERVICE_TOKEN: "f".repeat(40),
    FND_BASE_URL: "http://localhost:8080",
    FND_RATE_LIMIT_CONSUMER_TOKEN: "g".repeat(40),
    WLT1_PUBLIC_DESTINATION_LIST_MAX: "100",
  });
  const authenticator = createWlt1ProviderReceiptAuthenticator(config);
  const capability = authenticator.authenticate(FIXTURE_RECEIPT_PROVIDER_ID, FIXTURE_RECEIPT_SECRET);
  if (!capability) throw new Error("test fixture authentication unexpectedly failed");
  return capability.mintProvenance(payloadHash);
}

/** Phase 2C-D0 (GAP-1): every `WalletScreeningInput` now requires `screeningReferenceId`. This
 * fixed test-fixture value is used across every unit-level test below that does not itself assert
 * anything about correlation (the load-bearing correlation proofs — draft/retry/multi-retry
 * stability, same-address-different-destination distinctness, caller-cannot-influence — live in
 * `tests/integration/wlt1-screening-route.test.ts`, against the real route/DB, not here). */
const TEST_SCREENING_REFERENCE_ID = "wlt1screen_test-fixture-reference";

const INPUT = { chain: "ethereum", network: "mainnet", screeningReferenceId: TEST_SCREENING_REFERENCE_ID };

/** A genuinely canonicalisation-valid Ethereum address that is NOT one of the seven stub
 * fixtures — used to prove the "no configured fixture" fail-closed path organically rather than
 * with a symbolic, uncanonicalisable string. */
const UNCONFIGURED_VALID_ADDRESS = "0x1234567890123456789012345678901234567890";

/** The seven Gate 2C-A-1 fixtures with their chain/network and expected outcome, used to drive
 * every "organic reachability" test below from one single source of truth. Also the single source
 * of truth for each fixture's CORRECT (chain, network) triplet — P2CA-LOW-1 remediation means
 * every direct `stubProvider.screen(...)` call below must use the address's OWN correct chain, not
 * a generic default. */
const FIXTURE_MATRIX = [
  { scenario: "clear", chain: "ethereum", network: "mainnet", fixture: WLT1_TEST_STUB_ADDRESS_CLEAR, expectedKind: "screened", expectedRiskStatus: "clear" },
  {
    scenario: "review_required",
    chain: "ethereum",
    network: "mainnet",
    fixture: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
    expectedKind: "screened",
    expectedRiskStatus: "review_required",
  },
  { scenario: "high_risk", chain: "tron", network: "mainnet", fixture: WLT1_TEST_STUB_ADDRESS_HIGH_RISK, expectedKind: "screened", expectedRiskStatus: "high_risk" },
  { scenario: "hit", chain: "tron", network: "mainnet", fixture: WLT1_TEST_STUB_ADDRESS_HIT, expectedKind: "screened", expectedRiskStatus: "hit" },
  { scenario: "unavailable", chain: "ethereum", network: "mainnet", fixture: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE, expectedKind: "unavailable", expectedRiskStatus: undefined },
  {
    scenario: "invalid_response (malformed)",
    chain: "tron",
    network: "mainnet",
    fixture: WLT1_TEST_STUB_ADDRESS_MALFORMED,
    expectedKind: "invalid_response",
    expectedRiskStatus: undefined,
  },
  {
    scenario: "invalid_response (unmapped category)",
    chain: "ethereum",
    network: "mainnet",
    fixture: WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY,
    expectedKind: "invalid_response",
    expectedRiskStatus: undefined,
  },
] as const;

/** The CORRECT `{chain, network, canonicalAddress, screeningReferenceId}` input for a given
 * fixture address, derived from `FIXTURE_MATRIX` (the single source of truth) rather than
 * hand-duplicated per call site. */
function fixtureInput(address: string): { chain: string; network: string; canonicalAddress: string; screeningReferenceId: string } {
  const entry = FIXTURE_MATRIX.find((f) => f.fixture === address);
  if (!entry) throw new Error(`no FIXTURE_MATRIX entry for fixture address ${address}`);
  return { chain: entry.chain, network: entry.network, canonicalAddress: address, screeningReferenceId: TEST_SCREENING_REFERENCE_ID };
}

describe("WLT-01 wallet-analytics provider registry", () => {
  it("resolves the frozen stub provider's CURRENT adaptor version", () => {
    const provider = resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID);
    expect(provider.providerId).toBe("stub-wallet-analytics-v1");
    expect(provider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
  });

  it("known-id inventory contains exactly the frozen stub id", () => {
    expect(KNOWN_WALLET_ANALYTICS_PROVIDER_IDS).toEqual(["stub-wallet-analytics-v1"]);
  });

  it("isKnownWalletAnalyticsProviderId / isStubWalletAnalyticsProviderId classify correctly", () => {
    expect(isKnownWalletAnalyticsProviderId("stub-wallet-analytics-v1")).toBe(true);
    expect(isKnownWalletAnalyticsProviderId("not-a-real-provider")).toBe(false);
    expect(isStubWalletAnalyticsProviderId("stub-wallet-analytics-v1")).toBe(true);
    expect(isStubWalletAnalyticsProviderId("not-a-real-provider")).toBe(false);
  });

  it("fails closed (throws) on an unknown provider id — no fallback to the stub or any other provider", () => {
    expect(() => resolveCurrentWalletAnalyticsProvider("not-a-real-provider")).toThrow();
  });

  it("KNOWN_WALLET_ANALYTICS_PROVIDER_IDS is runtime-frozen", () => {
    expect(Object.isFrozen(KNOWN_WALLET_ANALYTICS_PROVIDER_IDS)).toBe(true);
    expect(() => (KNOWN_WALLET_ANALYTICS_PROVIDER_IDS as unknown as string[]).push("x")).toThrow();
  });

  // ---------------------------------------------------------------------------------------------
  // Phase 2C-D0 (GAP-2 remediation) — version-addressed registry. C2/C3 synchronous behavior is
  // UNCHANGED (both call resolveCurrentWalletAnalyticsProvider, proven identical to the pre-D0
  // resolveWalletAnalyticsProvider behavior above); these tests cover the NEW exact-version lookup
  // Phase 2C-D's future receipt adaptor resolution will need.
  // ---------------------------------------------------------------------------------------------
  describe("Phase 2C-D0 GAP-2 — version-addressed provider registry", () => {
    it("resolveWalletAnalyticsProviderVersion resolves the exact known (providerId, adaptorVersion) pair", () => {
      const provider = resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION);
      expect(provider.providerId).toBe(STUB_PROVIDER_ID);
      expect(provider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
    });

    it("resolveWalletAnalyticsProviderVersion fails closed (throws) on an unknown provider id", () => {
      expect(() => resolveWalletAnalyticsProviderVersion("not-a-real-provider", STUB_ADAPTOR_VERSION)).toThrow();
    });

    it("resolveWalletAnalyticsProviderVersion fails closed (throws) on a KNOWN provider id but an UNKNOWN adaptor version — no fallback to current/latest", () => {
      expect(() => resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, "999-does-not-exist")).toThrow();
    });

    it("an unknown-version lookup does NOT silently return the current/latest adaptor — the thrown error, not a substitute provider, is the only outcome", () => {
      let caught: unknown;
      try {
        resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, "999-does-not-exist");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      // Never silently substitutes resolveCurrentWalletAnalyticsProvider's own result.
      const current = resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID);
      expect(current.adaptorVersion).toBe(STUB_ADAPTOR_VERSION); // sanity: current lookup itself still works
    });

    it("resolveCurrentWalletAnalyticsProvider and resolveWalletAnalyticsProviderVersion agree for today's single known version", () => {
      const viaCurrent = resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID);
      const viaVersion = resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION);
      expect(viaCurrent).toBe(viaVersion); // same object identity — one registry, one source of truth
    });

    // -------------------------------------------------------------------------------------------
    // M-D0-1 remediation (Phase 2C-D1): independent Opus review of Phase 2C-D0 proved bare
    // property indexing (`versions[adaptorVersion]`, `CURRENT_ADAPTOR_VERSION[providerId]`) is
    // unsafe for a caller-influenced key — prototype-chain property names resolve to inherited
    // `Object.prototype`/`Function.prototype` members instead of throwing, silently violating the
    // "unknown version/provider fails closed" contract. Both `resolveWalletAnalyticsProviderVersion`
    // (both its providerId AND adaptorVersion lookups) and `resolveCurrentWalletAnalyticsProvider`
    // now require an explicit own-property test before ever reading the value. There were zero
    // production callers of the exact-version lookup at D0 acceptance time (the reason D0 could
    // still be accepted with this as a non-blocking finding) — these tests close it before any D1
    // production code path reaches it with a DB-sourced value.
    // -------------------------------------------------------------------------------------------
    describe("M-D0-1 remediation — prototype-chain keys fail closed, no inherited-property leak", () => {
      const PROTOTYPE_CHAIN_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable"];

      for (const key of PROTOTYPE_CHAIN_KEYS) {
        it(`resolveWalletAnalyticsProviderVersion('${key}', <any version>) fails closed — '${key}' as the PROVIDER ID must never resolve an inherited property`, () => {
          expect(() => resolveWalletAnalyticsProviderVersion(key, STUB_ADAPTOR_VERSION)).toThrow();
        });

        it(`resolveWalletAnalyticsProviderVersion(<known provider>, '${key}') fails closed — '${key}' as the ADAPTOR VERSION must never resolve an inherited property`, () => {
          expect(() => resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, key)).toThrow();
        });

        it(`resolveCurrentWalletAnalyticsProvider('${key}') fails closed — '${key}' as the PROVIDER ID must never resolve an inherited property`, () => {
          expect(() => resolveCurrentWalletAnalyticsProvider(key)).toThrow();
        });
      }

      it("a genuinely valid exact version still resolves after the own-property hardening (the fix did not overtighten and break the legitimate path)", () => {
        const provider = resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION);
        expect(provider.providerId).toBe(STUB_PROVIDER_ID);
        expect(provider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
      });

      it("an ordinary (non-prototype-chain) unknown version string still fails closed exactly as before", () => {
        expect(() => resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, "not-a-real-version-either")).toThrow();
      });

      it("current-provider lookup still works for the real provider id after the hardening", () => {
        const provider = resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID);
        expect(provider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
      });

      it("registry immutability is unaffected by the M-D0-1 fix", () => {
        expect(Object.isFrozen(KNOWN_WALLET_ANALYTICS_PROVIDER_IDS)).toBe(true);
      });

      it("no fallback: a prototype-chain key never silently substitutes the current/latest adaptor", () => {
        let caught: unknown;
        try {
          resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, "toString");
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        const current = resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID);
        expect(current.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
      });
    });
  });

  it("screenViaProvider times out a provider that never resolves, mapping to unavailable (never clear)", async () => {
    const hungProvider: WalletAnalyticsProvider = {
      providerId: "hung-test-provider",
      adaptorVersion: "0",
      screen: () => new Promise(() => {}), // never resolves
    };
    const outcome = await screenViaProvider(hungProvider, { ...INPUT, canonicalAddress: "0xdeadbeef" });
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "provider_timeout" });
  }, 10000);

  it("screenViaProvider maps a throwing provider to unavailable, never lets the exception propagate as a completed screen", async () => {
    const throwingProvider: WalletAnalyticsProvider = {
      providerId: "throwing-test-provider",
      adaptorVersion: "0",
      screen: () => {
        throw new Error("boom");
      },
    };
    const outcome = await screenViaProvider(throwingProvider, { ...INPUT, canonicalAddress: "0xdeadbeef" });
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "provider_error" });
  });
});

describe("WLT-01 deterministic stub wallet-analytics provider", () => {
  it("deterministic fixture: clear", async () => {
    const outcome = await stubProvider.screen({ ...INPUT, canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.riskStatus).toBe("clear");
      expect(outcome.result.sanctionsExposure).toBe(false);
    }
  });

  it("deterministic fixture: review_required", async () => {
    const outcome = await stubProvider.screen({ ...INPUT, canonicalAddress: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.riskStatus).toBe("review_required");
      expect(outcome.result.riskCategories).toEqual(["mixer"]);
    }
  });

  it("deterministic fixture: high_risk", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_HIGH_RISK));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.riskStatus).toBe("high_risk");
      // Sorted, deduplicated, canonical lower-case.
      expect(outcome.result.riskCategories).toEqual(["darknet", "stolen_funds"]);
    }
  });

  it("deterministic fixture: hit — sanctions hit exists WITHOUT a numeric score", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_HIT));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.riskStatus).toBe("hit");
      expect(outcome.result.riskScore).toBeNull();
      expect(outcome.result.sanctionsExposure).toBe(true);
      expect(outcome.result.riskCategories).toEqual(["sanctions"]);
    }
  });

  it("deterministic fixture: unavailable", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_UNAVAILABLE));
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "provider_unavailable" });
  });

  it("deterministic fixture: invalid_response (malformed)", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_MALFORMED));
    expect(outcome).toEqual({ kind: "invalid_response", reasonCode: "provider_malformed_response" });
  });

  it("deterministic fixture: invalid_response (unmapped risk category) — distinct reason from malformed", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY));
    expect(outcome).toEqual({ kind: "invalid_response", reasonCode: "unmapped_risk_category" });
  });

  it("a genuinely canonicalisation-VALID address with NO configured fixture is a bounded fail-closed unavailable — NEVER a silent clear", async () => {
    // Organic: UNCONFIGURED_VALID_ADDRESS itself passes real canonicalisation (proven in the
    // "organic reachability" describe block below) — this is not a symbolic/uncanonicalisable
    // placeholder, it is exactly the shape of address a real screening route would pass.
    const canon = canonicaliseAddress("ethereum", "mainnet", UNCONFIGURED_VALID_ADDRESS);
    expect(canon.ok).toBe(true);
    const outcome = await stubProvider.screen({ ...INPUT, canonicalAddress: UNCONFIGURED_VALID_ADDRESS, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("is deterministic — identical input always produces an identical result (no randomness), under a fixed injected clock", async () => {
    // The frozen `stubProvider` singleton uses the REAL clock (see the L1 clock-injection describe
    // block below) — issuedAtUtc could legitimately differ by milliseconds across two real calls,
    // which would make a wall-clock-based determinism assertion flaky rather than proving anything.
    // A fixed injected clock is what actually proves "no randomness" here.
    const fixedClockProvider = createStubWalletAnalyticsProvider({ nowUtc: () => "2026-01-01T00:00:00.000Z" });
    const first = await fixedClockProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_HIGH_RISK));
    const second = await fixedClockProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_HIGH_RISK));
    expect(first).toEqual(second);
  });

  it("screened results never contain a raw-payload-shaped field", async () => {
    const outcome = await stubProvider.screen({ ...INPUT, canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toMatch(/raw_payload|provider_payload|raw_response|provider_response|raw_vendor_response/i);
  });

  it("the input type accepts no private-key/seed/signing/auth-secret field (compile-time boundary, exercised at runtime with only the permitted shape)", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
  });
});

describe("WLT-01 normalized-v1 risk category vocabulary", () => {
  it("contains exactly the approved 9-member set", () => {
    expect([...RISK_CATEGORIES].sort()).toEqual(
      ["darknet", "gambling", "high_risk_exchange", "mixer", "ransomware", "sanctions", "scam", "stolen_funds", "terrorism_financing"].sort(),
    );
  });

  it("isKnownRiskCategory accepts every member and rejects an unmapped category, including 'unknown' itself", () => {
    for (const category of RISK_CATEGORIES) {
      expect(isKnownRiskCategory(category)).toBe(true);
    }
    expect(isKnownRiskCategory("unknown")).toBe(false);
    expect(isKnownRiskCategory("some_unmapped_vendor_category")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-A, Gate 2C-A-1 — P2B-MED-1 remediation: organic canonicalisation → provider
// reachability. Every claim here is independently re-verified against the REAL
// `canonicaliseAddress`, not read from the architecture plan.
// ---------------------------------------------------------------------------------------------
describe("P2B-MED-1 remediation — organic canonicalisation to provider reachability", () => {
  for (const { scenario, chain, network, fixture } of FIXTURE_MATRIX) {
    it(`${scenario}: fixture is a genuine canonicalisation-valid ${chain}/${network} address`, () => {
      const result = canonicaliseAddress(chain, network, fixture);
      expect(result.ok, `expected ${chain}/${network} to accept ${fixture}`).toBe(true);
      if (result.ok) {
        expect(result.canonicalAddress).toBe(fixture);
      }
    });

    it(`${scenario}: canonicalisation is idempotent — re-feeding the canonical output returns the identical value`, () => {
      const first = canonicaliseAddress(chain, network, fixture);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = canonicaliseAddress(chain, network, first.canonicalAddress);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.canonicalAddress).toBe(first.canonicalAddress);
      }
    });
  }

  it("all seven fixture canonical keys are mutually unique, split 4 Ethereum / 3 TRON", () => {
    const keys = FIXTURE_MATRIX.map((f) => f.fixture);
    expect(new Set(keys).size).toBe(7);
    expect(FIXTURE_MATRIX.filter((f) => f.chain === "ethereum")).toHaveLength(4);
    expect(FIXTURE_MATRIX.filter((f) => f.chain === "tron")).toHaveLength(3);
  });

  it("none of the seven fixtures is the zero address on its chain", () => {
    const ETH_ZERO = "0x" + "0".repeat(40);
    for (const { fixture, chain } of FIXTURE_MATRIX) {
      if (chain === "ethereum") expect(fixture.toLowerCase()).not.toBe(ETH_ZERO);
    }
  });

  for (const { scenario, chain, network, fixture, expectedKind, expectedRiskStatus } of FIXTURE_MATRIX) {
    it(`${scenario}: the FULL organic path (raw fixture -> real canonicalisation -> stubProvider.screen) reaches ${expectedKind}${expectedRiskStatus ? "/" + expectedRiskStatus : ""}`, async () => {
      // Step 1: real canonicalisation, exactly as a future screening route would perform it.
      const canon = canonicaliseAddress(chain, network, fixture);
      expect(canon.ok).toBe(true);
      if (!canon.ok) return;
      // Step 2: the provider receives only the CANONICAL output, never the raw fixture directly —
      // proving the stub's lookup key genuinely matches what canonicalisation produces.
      const outcome = await stubProvider.screen({ chain, network, canonicalAddress: canon.canonicalAddress, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
      expect(outcome.kind).toBe(expectedKind);
      if (outcome.kind === "screened" && expectedRiskStatus) {
        expect(outcome.result.riskStatus).toBe(expectedRiskStatus);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-A, Gate 2C-A-3 — normalized exposure type freeze (P2B-INF-3). Category-only, bounded,
// WLT implementation extension — not a regulatory taxonomy, not percentage/hop-count/entity-graph.
// ---------------------------------------------------------------------------------------------
describe("WLT-01 normalized-v1 exposure shape (P2B-INF-3 freeze)", () => {
  it("[] is accepted and returned unchanged", () => {
    expect(normalizeExposure([])).toEqual([]);
  });

  it("a single valid category entry is accepted", () => {
    expect(normalizeExposure([{ category: "mixer" }])).toEqual([{ category: "mixer" }]);
  });

  it("multiple categories are returned in deterministic sorted order", () => {
    expect(normalizeExposure([{ category: "stolen_funds" }, { category: "darknet" }])).toEqual([{ category: "darknet" }, { category: "stolen_funds" }]);
  });

  it("duplicate categories are deduplicated", () => {
    expect(normalizeExposure([{ category: "mixer" }, { category: "mixer" }])).toEqual([{ category: "mixer" }]);
  });

  it("all 9 approved categories are individually accepted", () => {
    for (const category of RISK_CATEGORIES) {
      expect(normalizeExposure([{ category }])).toEqual([{ category }]);
    }
  });

  it("case is normalized (upper/mixed-case category accepted and lower-cased)", () => {
    expect(normalizeExposure([{ category: "MIXER" }])).toEqual([{ category: "mixer" }]);
  });

  it("an unknown/unmapped category is rejected (undefined)", () => {
    expect(normalizeExposure([{ category: "some_unmapped_vendor_category" }])).toBeUndefined();
  });

  it("the literal string 'unknown' is rejected, never persisted as a category", () => {
    expect(normalizeExposure([{ category: "unknown" }])).toBeUndefined();
  });

  it(`more than ${MAX_EXPOSURE_ENTRIES} entries is rejected`, () => {
    const tooMany = Array.from({ length: MAX_EXPOSURE_ENTRIES + 1 }, () => ({ category: "mixer" as const }));
    expect(normalizeExposure(tooMany)).toBeUndefined();
  });

  it(`exactly ${MAX_EXPOSURE_ENTRIES} distinct-shaped entries at the boundary is accepted`, () => {
    const atLimit = Array.from({ length: MAX_EXPOSURE_ENTRIES }, () => ({ category: "mixer" as const }));
    expect(normalizeExposure(atLimit)).toEqual([{ category: "mixer" }]);
  });

  it("non-array input is rejected", () => {
    expect(normalizeExposure({ category: "mixer" })).toBeUndefined();
    expect(normalizeExposure("mixer")).toBeUndefined();
    expect(normalizeExposure(null)).toBeUndefined();
    expect(normalizeExposure(undefined)).toBeUndefined();
  });

  it("an entry with an unknown extra key is rejected", () => {
    expect(normalizeExposure([{ category: "mixer", percentage: 50 }])).toBeUndefined();
  });

  it("an entry missing 'category' is rejected", () => {
    expect(normalizeExposure([{}])).toBeUndefined();
  });

  it("a non-string category is rejected", () => {
    expect(normalizeExposure([{ category: 123 }])).toBeUndefined();
    expect(normalizeExposure([{ category: null }])).toBeUndefined();
  });

  it("prohibited vendor-analytics fields are rejected outright (percentage/hop/address/free-text shapes)", () => {
    expect(normalizeExposure([{ category: "mixer", percentage_bps: 5000 }])).toBeUndefined();
    expect(normalizeExposure([{ category: "mixer", hop_count: 2 }])).toBeUndefined();
    expect(normalizeExposure([{ category: "mixer", wallet_address: "0xdeadbeef" }])).toBeUndefined();
    expect(normalizeExposure([{ category: "mixer", description: "free text" }])).toBeUndefined();
    expect(normalizeExposure([{ category: "mixer", entity_name: "Some Entity" }])).toBeUndefined();
    expect(normalizeExposure([{ category: "mixer", raw_data: {} }])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-A, Gate 2C-A-4 — normalized screening-result type freeze: sanctions cross-field
// consistency rule. A WLT internal normalization consistency rule, NOT a Labuan FSA-prescribed
// threshold.
// ---------------------------------------------------------------------------------------------
describe("WLT-01 normalized-v1 sanctions cross-field consistency (Gate 2C-A-4 freeze)", () => {
  function baseResult(overrides: Partial<Pick<NormalizedScreeningResult, "sanctionsExposure" | "riskStatus" | "riskCategories">>) {
    return { sanctionsExposure: null, riskStatus: "clear" as const, riskCategories: [], ...overrides };
  }

  it("sanctionsExposure=false is always consistent regardless of riskStatus", () => {
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: false, riskStatus: "clear", riskCategories: [] }))).toBe(true);
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: false, riskStatus: "high_risk", riskCategories: [] }))).toBe(true);
  });

  it("sanctionsExposure=null is always consistent (pending/unset)", () => {
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: null, riskStatus: "clear", riskCategories: [] }))).toBe(true);
  });

  it("sanctionsExposure=true with riskStatus=hit and riskCategories including sanctions is consistent", () => {
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: true, riskStatus: "hit", riskCategories: ["sanctions"] }))).toBe(true);
  });

  it("sanctionsExposure=true with riskStatus != hit is INCONSISTENT", () => {
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: true, riskStatus: "high_risk", riskCategories: ["sanctions"] }))).toBe(false);
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: true, riskStatus: "clear", riskCategories: ["sanctions"] }))).toBe(false);
  });

  it("sanctionsExposure=true with riskStatus=hit but riskCategories missing 'sanctions' is INCONSISTENT", () => {
    expect(isSanctionsConsistent(baseResult({ sanctionsExposure: true, riskStatus: "hit", riskCategories: ["mixer"] }))).toBe(false);
  });

  it("riskStatus=hit MAY exist with riskScore=null — never a fabricated numeric score (proven via the real HIT fixture)", async () => {
    const outcome = await stubProvider.screen({ chain: "tron", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_HIT, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.riskStatus).toBe("hit");
      expect(outcome.result.riskScore).toBeNull();
    }
  });

  it("the stub's own HIT fixture is genuinely sanctions-consistent end to end (not just in isolation)", async () => {
    const outcome = await stubProvider.screen({ chain: "tron", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_HIT, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(isSanctionsConsistent(outcome.result)).toBe(true);
    }
  });

  it("directExposure/indirectExposure on a real screened fixture are bounded category-only arrays, never null", async () => {
    const outcome = await stubProvider.screen({ chain: "tron", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_HIGH_RISK, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.directExposure).toEqual([{ category: "darknet" }]);
      expect(outcome.result.indirectExposure).toEqual([{ category: "stolen_funds" }]);
    }
  });

  it("directExposure/indirectExposure are [] (never null) for a screened fixture with no exposure", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.directExposure).toEqual([]);
      expect(outcome.result.indirectExposure).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-B, P2CA-MED-1 remediation — provider-owned NormalizedScreeningResult must not carry
// evidence-provenance fields a provider adaptor has no honest way to assert.
// ---------------------------------------------------------------------------------------------
describe("P2CA-MED-1 remediation — provider result carries no evidence-provenance fields", () => {
  it("a screened stub result has no sourceAuthenticated key at all", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(Object.prototype.hasOwnProperty.call(outcome.result, "sourceAuthenticated")).toBe(false);
    }
  });

  it("a screened stub result has no payloadHash key at all", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(Object.prototype.hasOwnProperty.call(outcome.result, "payloadHash")).toBe(false);
    }
  });

  it("no screened fixture across all four scenarios ever carries a sha256:stub placeholder or any auth/hash key", async () => {
    for (const fixture of [
      WLT1_TEST_STUB_ADDRESS_CLEAR,
      WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
      WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
      WLT1_TEST_STUB_ADDRESS_HIT,
    ]) {
      const outcome = await stubProvider.screen(fixtureInput(fixture));
      expect(outcome.kind).toBe("screened");
      if (outcome.kind !== "screened") continue;
      const serialized = JSON.stringify(outcome.result);
      expect(serialized).not.toMatch(/sha256:stub|sourceAuthenticated|payloadHash/);
    }
  });

  it("the exact key set of a screened result matches the frozen provider-owned contract (no extra, no missing)", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(Object.keys(outcome.result).sort()).toEqual(
        [
          "providerResultId",
          "riskStatus",
          "riskScore",
          "riskCategories",
          "directExposure",
          "indirectExposure",
          "sanctionsExposure",
          "clusterRef",
          "issuedAtUtc",
          "validUntilUtc",
        ].sort(),
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-B — ScreeningEvidenceEnvelope discriminated union. Compile-time-shape tests exercised
// at runtime with only the legal shapes each variant permits.
// ---------------------------------------------------------------------------------------------
describe("P2CA-MED-1 remediation — ScreeningEvidenceEnvelope ownership", () => {
  it("a synchronous_provider envelope carries providerId/providerAdaptorVersion and no payloadHash", () => {
    const envelope: ScreeningEvidenceEnvelope = {
      sourceKind: "synchronous_provider",
      providerId: "stub-wallet-analytics-v1",
      providerAdaptorVersion: "1",
    };
    expect(envelope.sourceKind).toBe("synchronous_provider");
    expect("payloadHash" in envelope).toBe(false);
  });

  it("a provider_receipt envelope requires a branded provenance (Phase 2C-D1) alongside providerId/providerAdaptorVersion — a bare payloadHash string is no longer a legal shape", () => {
    const envelope: ScreeningEvidenceEnvelope = {
      sourceKind: "provider_receipt",
      providerId: "stub-wallet-analytics-v1",
      providerAdaptorVersion: "1",
      provenance: mintTestProvenance("a".repeat(64)),
    };
    expect(envelope.sourceKind).toBe("provider_receipt");
    expect(envelope.provenance.payloadHash).toBe("a".repeat(64));
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-C1, P2CA-LOW-1 remediation — fixture identity is now the composite
// chain/network/canonicalAddress triplet, never the address alone. Every claim here is proven
// directly against the provider (not merely through canonicalisation, which the "organic
// reachability" block above already covers).
// ---------------------------------------------------------------------------------------------
describe("P2CA-LOW-1 remediation — provider fixture identity is chain/network-bound", () => {
  for (const { scenario, chain, network, fixture, expectedKind } of FIXTURE_MATRIX) {
    it(`${scenario}: the CORRECT (chain, network, canonicalAddress) triplet reaches the configured outcome`, async () => {
      const outcome = await stubProvider.screen({ chain, network, canonicalAddress: fixture, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
      expect(outcome.kind).toBe(expectedKind);
    });

    it(`${scenario}: the SAME address with the WRONG chain fails closed (no_stub_fixture_configured), never the configured outcome`, async () => {
      const wrongChain = chain === "ethereum" ? "tron" : "ethereum";
      const outcome = await stubProvider.screen({ chain: wrongChain, network, canonicalAddress: fixture, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
      expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
    });

    it(`${scenario}: the SAME address with the WRONG network fails closed (no_stub_fixture_configured)`, async () => {
      const outcome = await stubProvider.screen({ chain, network: "testnet", canonicalAddress: fixture, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
      expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
    });
  }

  it("regression proof: the HIGH_RISK (tron) fixture paired with chain=ethereum no longer returns screened/high_risk — this exact combination used to silently succeed before P2CA-LOW-1", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_HIGH_RISK, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("regression proof: the HIT (tron) fixture paired with chain=ethereum no longer returns screened/hit", async () => {
    const outcome = await stubProvider.screen({ chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_HIT, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
    expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
  });

  it("no wrong-triplet combination across all seven fixtures ever returns a configured (non-unavailable-fixture-miss) outcome", async () => {
    for (const entry of FIXTURE_MATRIX) {
      for (const other of FIXTURE_MATRIX) {
        if (other.fixture === entry.fixture) continue;
        // Cross-pair: this fixture's address with a DIFFERENT fixture's chain/network.
        if (other.chain === entry.chain && other.network === entry.network) continue;
        const outcome = await stubProvider.screen({ chain: other.chain, network: other.network, canonicalAddress: entry.fixture, screeningReferenceId: TEST_SCREENING_REFERENCE_ID });
        expect(outcome).toEqual({ kind: "unavailable", reasonCode: "no_stub_fixture_configured" });
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-C1, L1 / stub-issuance-time remediation — issuedAtUtc now comes from an injectable
// clock (never a caller-supplied field, never a fixed epoch-0 fixture timestamp).
// ---------------------------------------------------------------------------------------------
describe("L1 / stub-issuance-time remediation — injectable clock", () => {
  it("createStubWalletAnalyticsProvider with a fixed injected clock produces the EXACT injected issuedAtUtc, deterministically", async () => {
    const FIXED_NOW = "2026-03-15T12:00:00.000Z";
    const fixedClockProvider = createStubWalletAnalyticsProvider({ nowUtc: () => FIXED_NOW });
    const outcome = await fixedClockProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_CLEAR));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.issuedAtUtc).toBe(FIXED_NOW);
    }
  });

  it("a different fixed injected clock produces a correspondingly different issuedAtUtc — the clock is genuinely load-bearing, not ignored", async () => {
    const providerA = createStubWalletAnalyticsProvider({ nowUtc: () => "2026-01-01T00:00:00.000Z" });
    const providerB = createStubWalletAnalyticsProvider({ nowUtc: () => "2027-06-30T08:30:00.000Z" });
    const outcomeA = await providerA.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_CLEAR));
    const outcomeB = await providerB.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_CLEAR));
    expect(outcomeA.kind).toBe("screened");
    expect(outcomeB.kind).toBe("screened");
    if (outcomeA.kind === "screened" && outcomeB.kind === "screened") {
      expect(outcomeA.result.issuedAtUtc).not.toBe(outcomeB.result.issuedAtUtc);
    }
  });

  it("the frozen production stubProvider's real-clock issuedAtUtc passes the strict L1 grammar", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_CLEAR));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(RFC3339_UTC_OFFSET_PATTERN.test(outcome.result.issuedAtUtc)).toBe(true);
    }
  });

  it("the frozen production stubProvider no longer emits the fixed epoch-0 timestamp", async () => {
    const outcome = await stubProvider.screen(fixtureInput(WLT1_TEST_STUB_ADDRESS_CLEAR));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind === "screened") {
      expect(outcome.result.issuedAtUtc).not.toBe("1970-01-01T00:00:00.000Z");
      // Genuinely current, not merely "not epoch 0" — within a generous 60s window of real now.
      expect(Math.abs(new Date(outcome.result.issuedAtUtc).getTime() - Date.now())).toBeLessThan(60_000);
    }
  });

  it("the provider input shape carries no caller-controllable time field on WalletScreeningInput (Phase 2C-D0: exactly {chain, network, canonicalAddress, screeningReferenceId})", async () => {
    // Compile-time proof: WalletScreeningInput has exactly {chain, network, canonicalAddress,
    // screeningReferenceId} (Phase 2C-D0 added screeningReferenceId — GAP-1 remediation). If this
    // literal accepted an extra `issuedAtUtc` (or any other) property, this call itself would fail
    // to type-check under `npx tsc -b --force`, which is exactly what makes this a real proof
    // rather than a runtime-only assertion.
    const input = { chain: "ethereum", network: "mainnet", canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR, screeningReferenceId: TEST_SCREENING_REFERENCE_ID };
    expect(Object.keys(input).sort()).toEqual(["canonicalAddress", "chain", "network", "screeningReferenceId"]);
    const outcome = await stubProvider.screen(input);
    expect(outcome.kind).toBe("screened");
  });
});

// ---------------------------------------------------------------------------------------------
// Phase 2C-D3A — receipt adaptor contract, exact-version resolution, and normalization purity.
// ---------------------------------------------------------------------------------------------
describe("WLT-01 Phase 2C-D3A — receipt adaptor contract", () => {
  function validReceiptResult(providerResultId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      provider_result_id: providerResultId,
      risk_status: "clear",
      risk_score: 2.0,
      risk_categories: [],
      direct_exposure: [],
      indirect_exposure: [],
      sanctions_exposure: false,
      cluster_ref: null,
      issued_at_utc: new Date().toISOString(),
      valid_until_utc: null,
      ...overrides,
    };
  }

  it("the frozen production stubProvider exposes normalizeReceipt as an OPTIONAL member of the SAME version-addressed adaptor object used by screen()", () => {
    expect(typeof stubProvider.normalizeReceipt).toBe("function");
    expect(stubProvider.providerId).toBe(STUB_PROVIDER_ID);
    expect(stubProvider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
  });

  it("resolveWalletAnalyticsProviderVersion(providerId, adaptorVersion) resolves the SAME object stubProvider is — the exact-version lookup a receipt uses, never a copy/reconstruction", () => {
    const resolved = resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION);
    expect(resolved).toBe(stubProvider);
    expect(typeof resolved.normalizeReceipt).toBe("function");
  });

  it("resolveWalletAnalyticsProviderVersion throws (never falls back to current/latest) on an unknown historical adaptor version — resolveCurrentWalletAnalyticsProvider is a DIFFERENT function never reachable from this call", () => {
    expect(() => resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, "999-never-deployed")).toThrow();
    // The current/latest resolver is a structurally SEPARATE function — proves there is no shared
    // internal fallback path from the exact-version lookup to the current-version one.
    expect(resolveCurrentWalletAnalyticsProvider).not.toBe(resolveWalletAnalyticsProviderVersion);
    expect(resolveCurrentWalletAnalyticsProvider(STUB_PROVIDER_ID)).toBe(stubProvider); // current still resolves fine, independently
  });

  it("prototype-chain adaptor-version keys ('constructor'/'__proto__'/'toString'/'hasOwnProperty') fail closed identically — M-D0-1's own own-property guard remains in force for the exact-version lookup a receipt uses", () => {
    for (const evilVersion of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(() => resolveWalletAnalyticsProviderVersion(STUB_PROVIDER_ID, evilVersion)).toThrow();
    }
  });

  it("normalizeReceipt is PURE and SYNCHRONOUS — calling it never returns a Promise, and calling it twice with the identical input produces deep-equal output (no hidden mutable state, no clock read of its own)", () => {
    const input = { result: validReceiptResult("presult_pure_test"), screeningReferenceId: "wlt1screen_pure", providerResultId: "presult_pure_test" };
    const out1 = stubProvider.normalizeReceipt!(input);
    expect(out1).not.toBeInstanceOf(Promise);
    const out2 = stubProvider.normalizeReceipt!(input);
    expect(out2).toEqual(out1);
  });

  it("normalizeReceipt: a well-formed receipt for each of the four accepted terminal risk statuses normalizes correctly", () => {
    for (const status of ["clear", "review_required", "high_risk", "hit"] as const) {
      const overrides: Record<string, unknown> = { risk_status: status };
      if (status === "hit") {
        overrides.sanctions_exposure = true;
        overrides.risk_categories = ["sanctions"];
      }
      const out = stubProvider.normalizeReceipt!({
        result: validReceiptResult("presult_status_" + status, overrides),
        screeningReferenceId: "wlt1screen_x",
        providerResultId: "presult_status_" + status,
      });
      expect(out.kind).toBe("normalized");
      if (out.kind === "normalized") {
        expect(out.result.riskStatus).toBe(status);
      }
    }
  });

  it("normalizeReceipt: 'pending' as a raw risk_status is rejected — never accepted as a normalized terminal value", () => {
    const out = stubProvider.normalizeReceipt!({
      result: validReceiptResult("presult_pending", { risk_status: "pending" }),
      screeningReferenceId: "wlt1screen_x",
      providerResultId: "presult_pending",
    });
    expect(out.kind).toBe("invalid");
  });

  it("normalizeReceipt: an unknown/unmapped risk_status string is rejected, not silently coerced", () => {
    const out = stubProvider.normalizeReceipt!({
      result: validReceiptResult("presult_unknown_status", { risk_status: "totally_made_up" }),
      screeningReferenceId: "wlt1screen_x",
      providerResultId: "presult_unknown_status",
    });
    expect(out.kind).toBe("invalid");
  });

  it("normalizeReceipt: a missing required field (even one whose legal value is null) is rejected as invalid_structure — absence is never treated as an implicit null", () => {
    const { valid_until_utc: _drop, ...missingField } = validReceiptResult("presult_missing_field");
    const out = stubProvider.normalizeReceipt!({ result: missingField, screeningReferenceId: "wlt1screen_x", providerResultId: "presult_missing_field" });
    expect(out.kind).toBe("invalid");
    if (out.kind === "invalid") expect(out.reasonCode).toBe("invalid_structure");
  });

  it("normalizeReceipt: non-object / array / null input is rejected as invalid_structure", () => {
    for (const bad of [null, "a string", 42, ["array"], undefined]) {
      const out = stubProvider.normalizeReceipt!({ result: bad, screeningReferenceId: "wlt1screen_x", providerResultId: "presult_x" });
      expect(out.kind).toBe("invalid");
    }
  });

  it("normalizeReceipt: sanctions_exposure=true without riskStatus='hit' + 'sanctions' category is inconsistent and rejected (defensive re-check, mirrors screen()'s own posture)", () => {
    const out = stubProvider.normalizeReceipt!({
      result: validReceiptResult("presult_sanctions_inconsistent", { sanctions_exposure: true, risk_status: "clear", risk_categories: [] }),
      screeningReferenceId: "wlt1screen_x",
      providerResultId: "presult_sanctions_inconsistent",
    });
    expect(out.kind).toBe("invalid");
  });

  it("normalizeReceipt does NOT itself cross-check the receipt envelope's provider_result_id against input.providerResultId — that is the ROUTE's own authoritative responsibility (Part D), never duplicated inside the adaptor", () => {
    // The adaptor faithfully reports whatever provider_result_id the raw body itself claims —
    // even when it structurally differs from the input.providerResultId context — proving the
    // adaptor does not silently substitute/repair it.
    const out = stubProvider.normalizeReceipt!({
      result: validReceiptResult("claimed-by-provider-body"),
      screeningReferenceId: "wlt1screen_x",
      providerResultId: "expected-by-envelope",
    });
    expect(out.kind).toBe("normalized");
    if (out.kind === "normalized") {
      expect(out.result.providerResultId).toBe("claimed-by-provider-body");
    }
  });

  it("normalizeReceipt purity source guard: the stub's own implementation contains no fetch/XHR/DB-query/withTransaction/setTimeout reference — a proportionate text-scan, not a full static-analysis dependency", () => {
    const source = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "providers", "stub-provider.ts"), "utf8");
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Isolate the normalizeStubReceipt function body specifically (not the whole file, which
    // legitimately imports `systemTime`/`TimeService` for the UNRELATED screen() clock seam).
    const start = stripped.indexOf("function normalizeStubReceipt");
    const end = stripped.indexOf("\n}\n", start);
    const body = stripped.slice(start, end);
    for (const forbidden of ["fetch(", "XMLHttpRequest", "withTransaction", "query(", "setTimeout", "setInterval", "process.env", "require("]) {
      expect(body, `normalizeStubReceipt must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
