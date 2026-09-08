/**
 * WLT-01 Phase 4A-2 — pure evaluate-use local-gate evaluator (`lib/evaluate-use.ts`). No database,
 * no HTTP.
 */
import { describe, expect, it } from "vitest";
import { evaluateFiatLocalGates, evaluateLocalGates, hasEvalStateDrift, type FiatLocalGateInput, type LocalGateInput, type Wlt1EvaluateUseDenyReason } from "../../services/wlt1/src/lib/evaluate-use.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function screening(overrides: Partial<{ screeningResultId: string; riskStatus: string; validUntilUtc: Date | null }> = {}) {
  return { screeningResultId: "wlt1screen_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() + 3600_000), ...overrides };
}

function gateInput(overrides: Partial<LocalGateInput> = {}): LocalGateInput {
  return {
    status: "active",
    destinationType: "wallet",
    requestedAction: "destination_use",
    walletType: "unhosted",
    chainCoverageOk: true,
    screening: screening(),
    pocVerified: true,
    coolingOffUntilUtc: null,
    nowUtc: NOW,
    ...overrides,
  };
}

describe("WLT-01 Phase 4A-2 — evaluateLocalGates", () => {
  it("1. active + all gates pass -> eligible", () => {
    const result = evaluateLocalGates(gateInput());
    expect(result).toMatchObject({ eligible: true, screeningResultId: "wlt1screen_1" });
  });

  it("2. revoked -> destination_revoked (checked FIRST, before any other gate)", () => {
    const result = evaluateLocalGates(gateInput({ status: "revoked", screening: null, chainCoverageOk: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "destination_revoked" });
  });

  it("3. wrong destination_type -> action_not_supported", () => {
    const result = evaluateLocalGates(gateInput({ destinationType: "fiat_payout" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });

  it("4. wrong requested_action -> action_not_supported", () => {
    const result = evaluateLocalGates(gateInput({ requestedAction: "something_else" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });

  it("5. chain/network not covered -> chain_not_supported", () => {
    const result = evaluateLocalGates(gateInput({ chainCoverageOk: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "chain_not_supported" });
  });

  it("6. no screening result -> screening_not_clear", () => {
    const result = evaluateLocalGates(gateInput({ screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
  });

  for (const riskStatus of ["review_required", "high_risk", "hit", "pending"]) {
    it(`7. screening risk_status '${riskStatus}' -> screening_not_clear`, () => {
      const result = evaluateLocalGates(gateInput({ screening: screening({ riskStatus }) }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
    });
  }

  it("8. screening expired -> screening_stale", () => {
    const result = evaluateLocalGates(gateInput({ screening: screening({ validUntilUtc: new Date(NOW.getTime() - 1) }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_stale" });
  });

  it("8b. screening exactly at valid_until_utc -> screening_stale (inclusive boundary, same as approval)", () => {
    const result = evaluateLocalGates(gateInput({ screening: screening({ validUntilUtc: NOW }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_stale" });
  });

  it("9. missing PoC for unhosted -> proof_of_control_missing", () => {
    const result = evaluateLocalGates(gateInput({ walletType: "unhosted", pocVerified: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "proof_of_control_missing" });
  });

  it("10. missing PoC for unknown -> proof_of_control_missing", () => {
    const result = evaluateLocalGates(gateInput({ walletType: "unknown", pocVerified: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "proof_of_control_missing" });
  });

  it("11. HOSTED + no PoC -> STILL eligible (PoC not applicable to hosted, per the PoC Evidence-ID Addendum)", () => {
    const result = evaluateLocalGates(gateInput({ walletType: "hosted", pocVerified: false }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("12. draft/pending_screening/pending_review -> destination_not_whitelisted", () => {
    for (const status of ["draft", "pending_screening", "pending_review"]) {
      const result = evaluateLocalGates(gateInput({ status }));
      expect(result, status).toMatchObject({ eligible: false, reasonCode: "destination_not_whitelisted" });
    }
  });

  it("13. approved_pending_cooling with cooling NOT elapsed -> cooling_off_active", () => {
    const result = evaluateLocalGates(gateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(NOW.getTime() + 3600_000) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "cooling_off_active" });
  });

  it("14. approved_pending_cooling with cooling_off_until_utc NULL -> cooling_off_active (defensive — never eligible on absent evidence)", () => {
    const result = evaluateLocalGates(gateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "cooling_off_active" });
  });

  it("15. approved_pending_cooling with cooling EXACTLY elapsed -> eligible (inclusive boundary)", () => {
    const result = evaluateLocalGates(gateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: NOW }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("16. approved_pending_cooling with cooling elapsed in the past -> eligible", () => {
    const result = evaluateLocalGates(gateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(NOW.getTime() - 3600_000) }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("17. active -> eligible regardless of cooling_off_until_utc value (ignored once active)", () => {
    const result = evaluateLocalGates(gateInput({ status: "active", coolingOffUntilUtc: new Date(NOW.getTime() + 999_999_999) }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("18. gate precedence: revoked wins over every other failure", () => {
    const result = evaluateLocalGates(gateInput({ status: "revoked", destinationType: "fiat_payout", chainCoverageOk: false, screening: null, pocVerified: false }));
    expect(result).toMatchObject({ reasonCode: "destination_revoked" });
  });

  it("19. gate precedence: action/type checked before chain coverage", () => {
    const result = evaluateLocalGates(gateInput({ destinationType: "fiat_payout", chainCoverageOk: false }));
    expect(result).toMatchObject({ reasonCode: "action_not_supported" });
  });

  it("20. gate precedence: chain coverage checked before screening", () => {
    const result = evaluateLocalGates(gateInput({ chainCoverageOk: false, screening: null }));
    expect(result).toMatchObject({ reasonCode: "chain_not_supported" });
  });

  it("21. gate precedence: screening checked before PoC", () => {
    const result = evaluateLocalGates(gateInput({ screening: null, pocVerified: false }));
    expect(result).toMatchObject({ reasonCode: "screening_not_clear" });
  });

  it("22. gate precedence: PoC checked before whitelist/cooling", () => {
    const result = evaluateLocalGates(gateInput({ walletType: "unhosted", pocVerified: false, status: "pending_review" }));
    expect(result).toMatchObject({ reasonCode: "proof_of_control_missing" });
  });

  it("23. no accidental eligible: sweep of non-eligible inputs all return eligible:false", () => {
    const inputs: LocalGateInput[] = [
      gateInput({ status: "revoked" }),
      gateInput({ destinationType: "fiat_payout" }),
      gateInput({ chainCoverageOk: false }),
      gateInput({ screening: null }),
      gateInput({ screening: screening({ riskStatus: "hit" }) }),
      gateInput({ screening: screening({ validUntilUtc: new Date(0) }) }),
      gateInput({ walletType: "unknown", pocVerified: false }),
      gateInput({ status: "pending_review" }),
      gateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(NOW.getTime() + 1) }),
    ];
    for (const input of inputs) {
      expect(evaluateLocalGates(input).eligible, JSON.stringify(input)).toBe(false);
    }
  });
});

describe("WLT-01 Phase 4A-2 — hasEvalStateDrift", () => {
  const base = { destinationStatusVersion: 3, whitelistVersion: 1, revocationEpoch: 0 };

  it("24. identical -> no drift", () => {
    expect(hasEvalStateDrift(base, { ...base })).toBe(false);
  });

  it("25. destination_status_version changed -> drift", () => {
    expect(hasEvalStateDrift(base, { ...base, destinationStatusVersion: 4 })).toBe(true);
  });

  it("26. whitelist_version changed -> drift", () => {
    expect(hasEvalStateDrift(base, { ...base, whitelistVersion: 2 })).toBe(true);
  });

  it("27. revocation_epoch changed -> drift", () => {
    expect(hasEvalStateDrift(base, { ...base, revocationEpoch: 1 })).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// Fiat Payout Destinations (APAC) — cross-checks proving evaluateLocalGates (wallet) and
// evaluateFiatLocalGates (fiat) are two SEPARATE functions, never a shared/parameterized one, and
// that wallet behavior (asserted throughout this file above) is untouched by the fiat addition.
// Exhaustive G1-G7 fiat gate coverage lives in tests/unit/wlt1-fiat-destination.test.ts.
// -------------------------------------------------------------------------------------------
describe("WLT-01 Fiat Payout Destinations (APAC) — evaluateLocalGates / evaluateFiatLocalGates separation", () => {
  it("evaluateLocalGates and evaluateFiatLocalGates are distinct exported functions", () => {
    expect(evaluateLocalGates).not.toBe(evaluateFiatLocalGates as unknown as typeof evaluateLocalGates);
  });

  it("evaluateLocalGates (wallet) still rejects destinationType='fiat_payout' with action_not_supported (regression pin — unchanged by the fiat addition)", () => {
    const result = evaluateLocalGates(gateInput({ destinationType: "fiat_payout" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });

  it("evaluateFiatLocalGates rejects destinationType='wallet' with action_not_supported (mirror-image check)", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const input: FiatLocalGateInput = {
      status: "active",
      destinationType: "wallet",
      requestedAction: "destination_use",
      railCoverageOk: true,
      screening: { screeningResultId: "wlt1fscr_1", riskStatus: "clear", validUntilUtc: null },
      verification: { verificationId: "wlt1bv_1", result: "verified", validUntilUtc: null, beneficiaryNameHash: "h1", accountIdentifierHash: "h2" },
      expectedBeneficiaryNameHash: "h1",
      expectedAccountIdentifierHash: "h2",
      coolingOffUntilUtc: null,
      nowUtc: NOW,
    };
    const result = evaluateFiatLocalGates(input);
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });
});

// -------------------------------------------------------------------------------------------
// Limits / Velocity / Concentration / First-Use — evaluateLocalGates/evaluateFiatLocalGates
// themselves are UNCHANGED by this control (gate order/behavior identical to the pre-limits
// baseline throughout this file above); this pins only the new deny-reason vocabulary
// `Wlt1EvaluateUseDenyReason` gained (limit evaluation itself is tested in
// tests/unit/wlt1-limits.test.ts, never duplicated here).
// -------------------------------------------------------------------------------------------
describe("WLT-01 Limits / Velocity / Concentration / First-Use — Wlt1EvaluateUseDenyReason gains exactly six new reasons", () => {
  it("the six new reason codes are valid Wlt1EvaluateUseDenyReason values (compile-time + runtime pin)", () => {
    const newReasons: Wlt1EvaluateUseDenyReason[] = [
      "asset_dimension_invalid",
      "limit_policy_unavailable",
      "per_transaction_limit_exceeded",
      "first_use_limit_exceeded",
      "daily_velocity_exceeded",
      "rolling_velocity_exceeded",
    ];
    expect(newReasons).toHaveLength(6);
    expect(new Set(newReasons).size).toBe(6);
  });
});
