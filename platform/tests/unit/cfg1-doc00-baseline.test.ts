/**
 * Vendored Doc00 baseline constant (services/cfg1/src/lib/doc00-baseline.ts) — no filesystem
 * dependency on aix-platform-docs, exact approved licence-profile facts and the full 30-code
 * prohibited-feature registry, deterministic hash computation.
 */
import { describe, expect, it } from "vitest";
import {
  DOC00_SOURCE_VERSION,
  DOC00_LICENCE_PROFILES,
  DOC00_PROHIBITED_FEATURES,
  computeDoc00BaselineHash,
} from "../../services/cfg1/src/lib/doc00-baseline.js";

describe("Doc00 baseline constant", () => {
  it("records doc00_source_version = v1.3", () => {
    expect(DOC00_SOURCE_VERSION).toBe("v1.3");
  });

  it("has exactly 3 licence profile facts: MB approved, PSO approved, EXCHANGE pending, all LFSA", () => {
    expect(DOC00_LICENCE_PROFILES).toHaveLength(3);
    const byCode = Object.fromEntries(DOC00_LICENCE_PROFILES.map((p) => [p.licence_code, p]));
    expect(byCode.MB).toEqual({ licence_code: "MB", licence_status: "approved", authority: "LFSA" });
    expect(byCode.PSO).toEqual({ licence_code: "PSO", licence_status: "approved", authority: "LFSA" });
    expect(byCode.EXCHANGE).toEqual({ licence_code: "EXCHANGE", licence_status: "pending", authority: "LFSA" });
  });

  it("has exactly 30 prohibited-feature codes, matching the approved list exactly", () => {
    const APPROVED_CODES = [
      "exchange.public_order_book",
      "exchange.matching_engine",
      "exchange.client_to_client_matching",
      "exchange.public_exchange_trading",
      "exchange.public_market_depth",
      "exchange.market_maker",
      "exchange.principal_dealing",
      "pricing.aix_spread_markup",
      "onboarding.retail_default",
      "audit.bypass",
      "permission.bypass",
      "kyc.bypass",
      "aml.bypass",
      "travel_rule.bypass",
      "ledger.direct_edit",
      "balance.direct_edit",
      "client_approval.bypass",
      "lp_settlement_approval.bypass",
      "break_glass_logging.bypass",
      "securities.token_trading",
      "advisory.investment_unlicensed",
      "custody.self_custody_wallet",
      "credit.lending_borrowing",
      "derivatives.trading",
      "trading.margin_leverage",
      "product.staking",
      "product.yield_earn",
      "pricing.internal_fallback",
      "inventory.internal_account",
      "liquidity.synthetic",
    ];
    expect(DOC00_PROHIBITED_FEATURES).toHaveLength(30);
    expect(APPROVED_CODES).toHaveLength(30);
    const actualCodes = DOC00_PROHIBITED_FEATURES.map((f) => f.feature_code).sort();
    expect(actualCodes).toEqual([...APPROVED_CODES].sort());
  });

  it("has no duplicate feature codes", () => {
    const codes = DOC00_PROHIBITED_FEATURES.map((f) => f.feature_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("marks exactly the 5 genuinely Exchange-pending-only codes as until_formal_exchange_licence_approval", () => {
    const pendingOnly = DOC00_PROHIBITED_FEATURES.filter((f) => f.applies_until === "until_formal_exchange_licence_approval").map(
      (f) => f.feature_code,
    );
    expect(pendingOnly.sort()).toEqual(
      [
        "exchange.public_order_book",
        "exchange.matching_engine",
        "exchange.client_to_client_matching",
        "exchange.public_exchange_trading",
        "exchange.public_market_depth",
      ].sort(),
    );
  });

  it("marks market_maker and principal_dealing as permanent, not Exchange-pending-only", () => {
    const marketMaker = DOC00_PROHIBITED_FEATURES.find((f) => f.feature_code === "exchange.market_maker");
    const principalDealing = DOC00_PROHIBITED_FEATURES.find((f) => f.feature_code === "exchange.principal_dealing");
    expect(marketMaker?.applies_until).toBe("permanent");
    expect(principalDealing?.applies_until).toBe("permanent");
  });

  it("computeDoc00BaselineHash is deterministic and sha256:-prefixed", () => {
    const h1 = computeDoc00BaselineHash();
    const h2 = computeDoc00BaselineHash();
    expect(h1).toBe(h2);
    expect(h1.startsWith("sha256:")).toBe(true);
  });
});
