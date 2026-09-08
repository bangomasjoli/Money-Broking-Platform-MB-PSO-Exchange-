/**
 * WLT-01 Limits / Velocity / Concentration / First-Use — pure/format-level unit tests for
 * `lib/limits.ts`'s amount parsing, dimension grammar, breach evaluation, reason-code mapping,
 * policy-drift detection, and audit-metadata builders. No database — DB-dependent behavior
 * (policy resolution, usage sums, first-use derivation, the advisory lock, evidence writes) is
 * exercised in `tests/integration/wlt1-limits-route.test.ts` and
 * `tests/integration/wlt1-limits-failclosed-private.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  ASSET_OR_CURRENCY_GRAMMAR,
  breachReasonCode,
  evaluateLimitBreach,
  hasLimitPolicyDrift,
  buildLimitDeniedAuditMetadata,
  isValidAssetOrCurrency,
  mintLimitEvaluationId,
  parseAmountString,
  toFixedPointBigInt,
  type LimitBreachType,
  type LimitDimension,
  type LimitProfileRow,
} from "../../services/wlt1/src/lib/limits.js";

// -------------------------------------------------------------------------------------------
// parseAmountString / toFixedPointBigInt — decimal string wire format, no JS Number.
// -------------------------------------------------------------------------------------------
describe("parseAmountString — grammar + strictly-greater-than-zero enforcement", () => {
  it("accepts 18 decimal places", () => {
    expect(parseAmountString("1.123456789012345678")).toBe("1.123456789012345678");
  });

  it("rejects 19 decimal places", () => {
    expect(parseAmountString("1.1234567890123456789")).toBeUndefined();
  });

  it("rejects literal '0'", () => {
    expect(parseAmountString("0")).toBeUndefined();
  });

  it("rejects '0.000000000000000000'", () => {
    expect(parseAmountString("0.000000000000000000")).toBeUndefined();
  });

  it("rejects negative amounts", () => {
    expect(parseAmountString("-1")).toBeUndefined();
    expect(parseAmountString("-0.1")).toBeUndefined();
  });

  it("accepts a 20-digit whole number", () => {
    expect(parseAmountString("99999999999999999999")).toBe("99999999999999999999");
  });

  it("rejects a 21-digit whole number", () => {
    expect(parseAmountString("100000000000000000000")).toBeUndefined();
  });

  it("rejects a leading-zero whole part (e.g. '01')", () => {
    expect(parseAmountString("01")).toBeUndefined();
    expect(parseAmountString("01.5")).toBeUndefined();
  });

  it("rejects a bare decimal point / trailing dot / empty string", () => {
    expect(parseAmountString(".")).toBeUndefined();
    expect(parseAmountString("1.")).toBeUndefined();
    expect(parseAmountString("")).toBeUndefined();
  });

  it("rejects scientific notation and other non-decimal forms", () => {
    expect(parseAmountString("1e10")).toBeUndefined();
    expect(parseAmountString("1,000")).toBeUndefined();
    expect(parseAmountString("$100")).toBeUndefined();
  });

  it("accepts a small fractional amount", () => {
    expect(parseAmountString("0.000000000000000001")).toBe("0.000000000000000001");
  });

  it("returns the ORIGINAL validated string, never a reformatted one", () => {
    expect(parseAmountString("1.50")).toBe("1.50");
  });
});

describe("toFixedPointBigInt — exact fixed-point scale-18 conversion, no floating point", () => {
  it("whole number", () => {
    expect(toFixedPointBigInt("100")).toBe(100n * 10n ** 18n);
  });

  it("fractional value", () => {
    expect(toFixedPointBigInt("1.5")).toBe(1_500_000_000_000_000_000n);
  });

  it("full 18-decimal precision preserved exactly", () => {
    expect(toFixedPointBigInt("1.123456789012345678")).toBe(1_123456789012345678n);
  });

  it("a DB-round-tripped zero-padded numeric(38,18) string parses identically to the caller's shorter form", () => {
    expect(toFixedPointBigInt("40.000000000000000000")).toBe(toFixedPointBigInt("40"));
  });

  it("zero", () => {
    expect(toFixedPointBigInt("0")).toBe(0n);
  });
});

// -------------------------------------------------------------------------------------------
// Asset/currency grammar.
// -------------------------------------------------------------------------------------------
describe("ASSET_OR_CURRENCY_GRAMMAR / isValidAssetOrCurrency", () => {
  it("accepts uppercase alphanumeric 2-16 chars", () => {
    expect(isValidAssetOrCurrency("ETH")).toBe(true);
    expect(isValidAssetOrCurrency("USDT")).toBe(true);
    expect(isValidAssetOrCurrency("AB")).toBe(true);
    expect(isValidAssetOrCurrency("A2345678901234B")).toBe(true);
  });

  it("rejects lowercase", () => {
    expect(isValidAssetOrCurrency("eth")).toBe(false);
  });

  it("rejects single character (below minimum)", () => {
    expect(isValidAssetOrCurrency("A")).toBe(false);
  });

  it("rejects 17+ characters (above maximum)", () => {
    expect(isValidAssetOrCurrency("A".repeat(17))).toBe(false);
  });

  it("rejects non-alphanumeric characters", () => {
    expect(isValidAssetOrCurrency("ET-H")).toBe(false);
    expect(isValidAssetOrCurrency("ET_H")).toBe(false);
  });

  it("ASSET_OR_CURRENCY_GRAMMAR is anchored (no partial match)", () => {
    expect("xETHx".match(ASSET_OR_CURRENCY_GRAMMAR)).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------
// evaluateLimitBreach — pure breach precedence, deterministic, no I/O.
// -------------------------------------------------------------------------------------------
function profile(overrides: Partial<LimitProfileRow> = {}): LimitProfileRow {
  return {
    limitProfileId: "wlt1lp_client",
    version: 1,
    perTransactionLimit: "100",
    dailyVelocityLimit: "500",
    rollingVelocityLimit: "1000",
    rollingWindowHours: 24,
    firstUseLimit: "50",
    status: "active",
    ...overrides,
  };
}

const ZERO_USAGE = { clientDailyUsage: 0n, destinationDailyUsage: 0n, clientRollingUsage: 0n, destinationRollingUsage: 0n };

describe("evaluateLimitBreach — per-transaction limit (client scope)", () => {
  it("amount exactly equal to the limit -> pass (inclusive boundary)", () => {
    const result = evaluateLimitBreach({ amount: "100", firstUse: false, clientProfile: profile(), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "pass" });
  });

  it("amount one atomic unit (1e-18) above the limit -> deny per_txn/client", () => {
    const result = evaluateLimitBreach({ amount: "100.000000000000000001", firstUse: false, clientProfile: profile(), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "deny", breachType: "per_txn", breachScope: "client" });
  });
});

describe("evaluateLimitBreach — per-transaction limit (destination scope, tighter than client)", () => {
  it("destination per_transaction_limit tighter than client -> denies at destination scope", () => {
    const result = evaluateLimitBreach({
      amount: "60",
      firstUse: false,
      clientProfile: profile({ perTransactionLimit: "100" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", perTransactionLimit: "50", dailyVelocityLimit: null, rollingVelocityLimit: null, rollingWindowHours: null, firstUseLimit: null }),
      ...ZERO_USAGE,
    });
    expect(result).toEqual({ kind: "deny", breachType: "per_txn", breachScope: "destination" });
  });

  it("no destination profile -> only client per_transaction_limit applies", () => {
    const result = evaluateLimitBreach({ amount: "80", firstUse: false, clientProfile: profile({ perTransactionLimit: "100" }), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "pass" });
  });
});

describe("evaluateLimitBreach — first-use (both scopes, strictly-lower cap)", () => {
  it("first_use=true, amount above client first_use_limit -> deny first_use/client", () => {
    const result = evaluateLimitBreach({ amount: "60", firstUse: true, clientProfile: profile({ firstUseLimit: "50" }), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "deny", breachType: "first_use", breachScope: "client" });
  });

  it("first_use=true, amount within first_use_limit -> pass", () => {
    const result = evaluateLimitBreach({ amount: "40", firstUse: true, clientProfile: profile({ firstUseLimit: "50" }), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "pass" });
  });

  it("first_use=false -> first_use_limit never evaluated even if amount would breach it", () => {
    const result = evaluateLimitBreach({ amount: "60", firstUse: false, clientProfile: profile({ firstUseLimit: "50" }), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "pass" });
  });

  it("first_use=true, destination profile defines a tighter first_use_limit -> deny first_use/destination", () => {
    const result = evaluateLimitBreach({
      amount: "45",
      firstUse: true,
      clientProfile: profile({ firstUseLimit: "50" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", dailyVelocityLimit: null, rollingVelocityLimit: null, rollingWindowHours: null, firstUseLimit: "30" }),
      ...ZERO_USAGE,
    });
    expect(result).toEqual({ kind: "deny", breachType: "first_use", breachScope: "destination" });
  });

  it("first_use=true, destination profile does NOT define first_use_limit -> only client's applies", () => {
    const result = evaluateLimitBreach({
      amount: "45",
      firstUse: true,
      clientProfile: profile({ firstUseLimit: "50" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", dailyVelocityLimit: null, rollingVelocityLimit: null, rollingWindowHours: null, firstUseLimit: null }),
      ...ZERO_USAGE,
    });
    expect(result).toEqual({ kind: "pass" });
  });
});

describe("evaluateLimitBreach — daily velocity (both scopes)", () => {
  it("client daily usage + amount exceeds client daily limit -> deny daily/client", () => {
    const result = evaluateLimitBreach({
      amount: "50",
      firstUse: false,
      clientProfile: profile({ dailyVelocityLimit: "500" }),
      destinationProfile: null,
      clientDailyUsage: 460n * 10n ** 18n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 0n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "daily", breachScope: "client" });
  });

  it("client daily usage + amount exactly equals the limit -> pass (inclusive boundary)", () => {
    const result = evaluateLimitBreach({
      amount: "40",
      firstUse: false,
      clientProfile: profile({ dailyVelocityLimit: "500" }),
      destinationProfile: null,
      clientDailyUsage: 460n * 10n ** 18n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 0n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "pass" });
  });

  it("destination daily usage + amount exceeds destination daily limit -> deny daily/destination", () => {
    const result = evaluateLimitBreach({
      amount: "50",
      firstUse: false,
      clientProfile: profile({ dailyVelocityLimit: "10000" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", dailyVelocityLimit: "200", rollingVelocityLimit: null, rollingWindowHours: null, firstUseLimit: null }),
      clientDailyUsage: 0n,
      destinationDailyUsage: 160n * 10n ** 18n,
      clientRollingUsage: 0n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "daily", breachScope: "destination" });
  });
});

describe("evaluateLimitBreach — rolling velocity (both scopes)", () => {
  it("client rolling usage + amount exceeds client rolling limit -> deny rolling/client", () => {
    const result = evaluateLimitBreach({
      amount: "50",
      firstUse: false,
      clientProfile: profile({ rollingVelocityLimit: "1000" }),
      destinationProfile: null,
      clientDailyUsage: 0n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 960n * 10n ** 18n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "rolling", breachScope: "client" });
  });

  it("destination rolling usage + amount exceeds destination rolling limit -> deny rolling/destination", () => {
    const result = evaluateLimitBreach({
      amount: "50",
      firstUse: false,
      clientProfile: profile({ rollingVelocityLimit: "10000" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", dailyVelocityLimit: null, rollingVelocityLimit: "500", rollingWindowHours: 24, firstUseLimit: null }),
      clientDailyUsage: 0n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 0n,
      destinationRollingUsage: 460n * 10n ** 18n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "rolling", breachScope: "destination" });
  });
});

describe("evaluateLimitBreach — deterministic breach precedence (stop at first breach)", () => {
  it("per_txn checked before first_use, daily, rolling", () => {
    const result = evaluateLimitBreach({
      amount: "200", // breaches per_txn(100), first_use(50), daily(500 w/ 400 used), rolling(1000 w/ 900 used) — ALL simultaneously
      firstUse: true,
      clientProfile: profile({ perTransactionLimit: "100", firstUseLimit: "50", dailyVelocityLimit: "500", rollingVelocityLimit: "1000" }),
      destinationProfile: null,
      clientDailyUsage: 400n * 10n ** 18n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 900n * 10n ** 18n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "per_txn", breachScope: "client" });
  });

  it("client scope checked before destination scope, at each breach type", () => {
    const result = evaluateLimitBreach({
      amount: "150",
      firstUse: false,
      clientProfile: profile({ perTransactionLimit: "100" }),
      destinationProfile: profile({ limitProfileId: "wlt1lp_dest", perTransactionLimit: "50", dailyVelocityLimit: null, rollingVelocityLimit: null, rollingWindowHours: null, firstUseLimit: null }),
      ...ZERO_USAGE,
    });
    // Both client (100) and destination (50) per_txn would breach at amount=150 — client wins.
    expect(result).toEqual({ kind: "deny", breachType: "per_txn", breachScope: "client" });
  });

  it("first_use checked before daily and rolling", () => {
    const result = evaluateLimitBreach({
      amount: "80",
      firstUse: true,
      clientProfile: profile({ perTransactionLimit: "1000", firstUseLimit: "50", dailyVelocityLimit: "100", rollingVelocityLimit: "100" }),
      destinationProfile: null,
      clientDailyUsage: 50n * 10n ** 18n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 50n * 10n ** 18n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "first_use", breachScope: "client" });
  });

  it("daily checked before rolling", () => {
    const result = evaluateLimitBreach({
      amount: "80",
      firstUse: false,
      clientProfile: profile({ perTransactionLimit: "1000", dailyVelocityLimit: "100", rollingVelocityLimit: "100" }),
      destinationProfile: null,
      clientDailyUsage: 50n * 10n ** 18n,
      destinationDailyUsage: 0n,
      clientRollingUsage: 50n * 10n ** 18n,
      destinationRollingUsage: 0n,
    });
    expect(result).toEqual({ kind: "deny", breachType: "daily", breachScope: "client" });
  });
});

describe("evaluateLimitBreach — cross-asset / cross-dimension isolation is structural (usage sums are caller-supplied per exact dimension)", () => {
  it("a zero usage input never breaches velocity regardless of a large amount within per-txn/first-use bounds", () => {
    const result = evaluateLimitBreach({ amount: "90", firstUse: false, clientProfile: profile({ perTransactionLimit: "100", dailyVelocityLimit: "95", rollingVelocityLimit: "95" }), destinationProfile: null, ...ZERO_USAGE });
    expect(result).toEqual({ kind: "pass" });
  });
});

// -------------------------------------------------------------------------------------------
// breachReasonCode — closed mapping, no new error codes.
// -------------------------------------------------------------------------------------------
describe("breachReasonCode", () => {
  it("maps each breach type to its exact frozen reason code", () => {
    const cases: Array<[LimitBreachType, string]> = [
      ["per_txn", "per_transaction_limit_exceeded"],
      ["first_use", "first_use_limit_exceeded"],
      ["daily", "daily_velocity_exceeded"],
      ["rolling", "rolling_velocity_exceeded"],
    ];
    for (const [breachType, expected] of cases) {
      expect(breachReasonCode(breachType)).toBe(expected);
    }
  });
});

// -------------------------------------------------------------------------------------------
// hasLimitPolicyDrift — profile-identity staleness detection.
// -------------------------------------------------------------------------------------------
describe("hasLimitPolicyDrift", () => {
  const bound = { boundClientLimitProfileId: "wlt1lp_c", boundClientLimitProfileVersion: 1, boundDestinationLimitProfileId: null, boundDestinationLimitProfileVersion: null };

  it("no drift: current client profile matches bound exactly, no destination profile either side", () => {
    expect(hasLimitPolicyDrift({ ...bound, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 1 }), currentDestinationProfile: null })).toBe(false);
  });

  it("drift: current client profile is now null (deactivated with no replacement)", () => {
    expect(hasLimitPolicyDrift({ ...bound, currentClientProfile: null, currentDestinationProfile: null })).toBe(true);
  });

  it("drift: current client profile version differs (new version activated)", () => {
    expect(hasLimitPolicyDrift({ ...bound, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 2 }), currentDestinationProfile: null })).toBe(true);
  });

  it("drift: current client profile id differs (different logical policy entirely)", () => {
    expect(hasLimitPolicyDrift({ ...bound, currentClientProfile: profile({ limitProfileId: "wlt1lp_other", version: 1 }), currentDestinationProfile: null })).toBe(true);
  });

  it("drift: a destination profile APPEARED when none was bound", () => {
    expect(hasLimitPolicyDrift({ ...bound, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 1 }), currentDestinationProfile: profile({ limitProfileId: "wlt1lp_d", version: 1 }) })).toBe(true);
  });

  it("drift: a bound destination profile DISAPPEARED", () => {
    const boundWithDest = { ...bound, boundDestinationLimitProfileId: "wlt1lp_d", boundDestinationLimitProfileVersion: 1 };
    expect(hasLimitPolicyDrift({ ...boundWithDest, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 1 }), currentDestinationProfile: null })).toBe(true);
  });

  it("drift: bound destination profile version changed", () => {
    const boundWithDest = { ...bound, boundDestinationLimitProfileId: "wlt1lp_d", boundDestinationLimitProfileVersion: 1 };
    expect(hasLimitPolicyDrift({ ...boundWithDest, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 1 }), currentDestinationProfile: profile({ limitProfileId: "wlt1lp_d", version: 2 }) })).toBe(true);
  });

  it("no drift: both client and destination profiles match bound exactly", () => {
    const boundWithDest = { ...bound, boundDestinationLimitProfileId: "wlt1lp_d", boundDestinationLimitProfileVersion: 1 };
    expect(
      hasLimitPolicyDrift({ ...boundWithDest, currentClientProfile: profile({ limitProfileId: "wlt1lp_c", version: 1 }), currentDestinationProfile: profile({ limitProfileId: "wlt1lp_d", version: 1 }) }),
    ).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// mintLimitEvaluationId — format + uniqueness.
// -------------------------------------------------------------------------------------------
describe("mintLimitEvaluationId", () => {
  it("has the frozen wlt1lev_ prefix", () => {
    expect(mintLimitEvaluationId()).toMatch(/^wlt1lev_[0-9a-f-]{36}$/);
  });

  it("distinct calls produce distinct ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintLimitEvaluationId()));
    expect(ids.size).toBe(50);
  });
});

// -------------------------------------------------------------------------------------------
// buildLimitDeniedAuditMetadata — exact frozen 17-key shape, no thresholds/PII.
// -------------------------------------------------------------------------------------------
describe("buildLimitDeniedAuditMetadata", () => {
  const dimension: LimitDimension = { destinationType: "wallet", assetOrCurrency: "ETH", chain: "ethereum", network: "mainnet", rail: null };
  const evaluatedAtUtc = new Date("2026-06-15T12:00:00.000Z");

  it("produces exactly the 17 frozen keys", () => {
    const metadata = buildLimitDeniedAuditMetadata({
      limitEvaluationId: "wlt1lev_1",
      decisionId: "wlt1dec_1",
      clientId: "clt1client_1",
      destinationId: "wlt1dest_1",
      destinationType: "wallet",
      dimension,
      amount: "40",
      breachType: "per_txn",
      breachScope: "client",
      firstUse: true,
      limitsVersion: 0,
      clientLimitProfileId: "wlt1lp_c",
      destinationLimitProfileId: null,
      evaluatedAtUtc,
    });
    expect(Object.keys(metadata).sort()).toEqual(
      [
        "limit_evaluation_id",
        "decision_id",
        "client_id",
        "destination_id",
        "destination_type",
        "asset_or_currency",
        "chain",
        "network",
        "rail",
        "amount",
        "breach_type",
        "breach_scope",
        "first_use",
        "limits_version",
        "client_limit_profile_id",
        "destination_limit_profile_id",
        "evaluated_at_utc",
      ].sort(),
    );
  });

  it("never carries an address, address_hash, beneficiary name, bank detail, or threshold value", () => {
    const metadata = buildLimitDeniedAuditMetadata({
      limitEvaluationId: "wlt1lev_1",
      decisionId: null,
      clientId: "clt1client_1",
      destinationId: "wlt1dest_1",
      destinationType: "wallet",
      dimension,
      amount: "40",
      breachType: "policy_unavailable",
      breachScope: "client",
      firstUse: false,
      limitsVersion: 0,
      clientLimitProfileId: null,
      destinationLimitProfileId: null,
      evaluatedAtUtc,
    });
    const raw = JSON.stringify(metadata);
    expect(raw).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(raw.toLowerCase()).not.toContain("address_hash");
    expect(raw.toLowerCase()).not.toContain("beneficiary");
    expect(raw.toLowerCase()).not.toContain("account_identifier");
    expect(raw).not.toContain("per_transaction_limit");
    expect(raw).not.toContain("daily_velocity_limit");
    expect(raw).not.toContain("rolling_velocity_limit");
  });

  it("decision_id and profile ids are null for a policy_unavailable denial", () => {
    const metadata = buildLimitDeniedAuditMetadata({
      limitEvaluationId: "wlt1lev_1",
      decisionId: null,
      clientId: "clt1client_1",
      destinationId: "wlt1dest_1",
      destinationType: "wallet",
      dimension,
      amount: "40",
      breachType: "policy_unavailable",
      breachScope: "client",
      firstUse: false,
      limitsVersion: 0,
      clientLimitProfileId: null,
      destinationLimitProfileId: null,
      evaluatedAtUtc,
    });
    expect(metadata.decision_id).toBeNull();
    expect(metadata.client_limit_profile_id).toBeNull();
    expect(metadata.destination_limit_profile_id).toBeNull();
    expect(metadata.breach_type).toBe("policy_unavailable");
  });
});

// -------------------------------------------------------------------------------------------
// Concentration deferral / no-FX source guards — production source, comment-stripped.
// -------------------------------------------------------------------------------------------
describe("acceptance-sensitive source guard — concentration is deferred, no FX/cross-asset conversion exists", () => {
  it("lib/limits.ts's real code never references a concentration threshold, denominator, or evaluation (only the schema-fidelity field name, which the file's own header comment explains is deferred)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "limits.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/concentration_limit/);
    expect(code.toLowerCase()).not.toMatch(/\bdenominator\b/);
  });

  it("lib/limits.ts's real code never references FX/exchange rate/USD-equivalent conversion machinery", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "limits.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.toLowerCase()).not.toMatch(/exchange_rate|fx_rate|usd_equivalent|price_feed|converttousd|reference_rate/);
  });

  it("lib/limits.ts's real code never reads a balance, writes a ledger, or claims settlement/execution", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "limits.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.toLowerCase()).not.toMatch(/\bbalance\b|\bledger\b|\bsettl(ed|ement)\b|\bexecuted\b/);
  });
});
