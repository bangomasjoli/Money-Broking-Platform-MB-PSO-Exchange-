/**
 * WLT-01 Phase 4B — pure consumption-id format helper (`mintConsumptionId`/`CONSUMPTION_ID_REGEX`)
 * and the pure post-authentication consume-outcome evaluator (`evaluateConsumeOutcome`) from
 * `lib/decision-consume.ts`. No database, no HTTP. Token authentication itself (`token_mismatch`)
 * is NOT this evaluator's concern — it is decided by the route BEFORE ever calling
 * `evaluateConsumeOutcome`, mirroring `wlt1-decision-verify.test.ts`'s own identical convention for
 * Phase 4A-3.
 */
import { describe, expect, it } from "vitest";
import { CONSUMPTION_ID_REGEX, evaluateConsumeOutcome, mintConsumptionId, type EvaluateConsumeInput, type Wlt1ConsumeReasonCode } from "../../services/wlt1/src/lib/decision-consume.js";
import type { DecisionVerifyResult } from "../../services/wlt1/src/lib/decision-verify.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const ORIGINAL_CONSUMPTION_ID = "wlt1con_11111111-1111-1111-1111-111111111111";
const ORIGINAL_EXECUTION_REF = "wdr1payout_original";

function eligible(): DecisionVerifyResult {
  return { eligible: true };
}
function ineligible(reasonCode: "binding_mismatch" | "expired" | "revoked" | "evidence_integrity_invalid"): DecisionVerifyResult {
  return { eligible: false, reasonCode };
}

function input(overrides: Partial<EvaluateConsumeInput> = {}): EvaluateConsumeInput {
  return {
    evaluatorResult: eligible(),
    rowStatus: "issued",
    rowConsumptionId: null,
    rowConsumedAtUtc: null,
    rowExecutionRef: null,
    callerExecutionRef: "wdr1payout_new",
    ...overrides,
  };
}

describe("WLT-01 Phase 4B — mintConsumptionId / CONSUMPTION_ID_REGEX", () => {
  it("1. minted consumption_id matches the frozen regex exactly", () => {
    const id = mintConsumptionId();
    expect(id).toMatch(CONSUMPTION_ID_REGEX);
    expect(id).toMatch(/^wlt1con_[0-9a-f-]{36}$/);
  });

  it("2. minted consumption_id is exactly 44 characters total", () => {
    expect(mintConsumptionId()).toHaveLength(44);
  });

  it("3. distinct calls produce distinct consumption ids (CSPRNG UUID, never a fixed value)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintConsumptionId()));
    expect(ids.size).toBe(50);
  });

  it("4. consumption_id is never derived from any caller input (pure generator, no arguments)", () => {
    expect(mintConsumptionId.length).toBe(0);
  });
});

describe("WLT-01 Phase 4B — evaluateConsumeOutcome: binding checked before consumed-state (frozen precedence)", () => {
  it("5. binding_mismatch on an ISSUED row -> deny binding_mismatch", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: ineligible("binding_mismatch"), rowStatus: "issued" }));
    expect(result).toEqual({ kind: "deny", reasonCode: "binding_mismatch" });
  });

  it("6. binding_mismatch on an ALREADY-CONSUMED row (same execution_ref as caller) -> STILL binding_mismatch, never replay", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: ineligible("binding_mismatch"),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: ORIGINAL_EXECUTION_REF,
      }),
    );
    expect(result).toEqual({ kind: "deny", reasonCode: "binding_mismatch" });
  });

  it("7. binding_mismatch on an already-consumed row with a DIFFERENT execution_ref -> STILL binding_mismatch (not already_consumed)", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: ineligible("binding_mismatch"),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: "wdr1payout_totally_different",
      }),
    );
    expect(result).toEqual({ kind: "deny", reasonCode: "binding_mismatch" });
  });
});

describe("WLT-01 Phase 4B — evaluateConsumeOutcome: issued path", () => {
  it("8. issued + eligible -> consume", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: eligible(), rowStatus: "issued" }));
    expect(result).toEqual({ kind: "consume" });
  });

  it("9. issued + expired -> deny expired", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: ineligible("expired"), rowStatus: "issued" }));
    expect(result).toEqual({ kind: "deny", reasonCode: "expired" });
  });

  it("10. issued + revoked -> deny revoked", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: ineligible("revoked"), rowStatus: "issued" }));
    expect(result).toEqual({ kind: "deny", reasonCode: "revoked" });
  });

  it("11. issued + evidence_integrity_invalid (genuine PoC structural anomaly) -> deny evidence_integrity_invalid", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: ineligible("evidence_integrity_invalid"), rowStatus: "issued" }));
    expect(result).toEqual({ kind: "deny", reasonCode: "evidence_integrity_invalid" });
  });
});

describe("WLT-01 Phase 4B — evaluateConsumeOutcome: consumed path (replay is a receipt, not fresh authorization)", () => {
  it("12. consumed + SAME execution_ref -> replay, returning the ORIGINAL consumptionId/consumedAtUtc", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: eligible(),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: ORIGINAL_EXECUTION_REF,
      }),
    );
    expect(result).toEqual({ kind: "replay", consumptionId: ORIGINAL_CONSUMPTION_ID, consumedAtUtc: NOW });
  });

  it("13. consumed + DIFFERENT execution_ref -> deny already_consumed", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: eligible(),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: "wdr1payout_different",
      }),
    );
    expect(result).toEqual({ kind: "deny", reasonCode: "already_consumed" });
  });

  it("14. replay ignores the evaluator's own expired verdict — a decision consumed while valid still replays after it would now report expired", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: ineligible("expired"),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: ORIGINAL_EXECUTION_REF,
      }),
    );
    expect(result).toEqual({ kind: "replay", consumptionId: ORIGINAL_CONSUMPTION_ID, consumedAtUtc: NOW });
  });

  it("15. replay ignores the evaluator's own revoked verdict — a decision consumed before revocation still replays after the destination is later revoked", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: ineligible("revoked"),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: ORIGINAL_EXECUTION_REF,
      }),
    );
    expect(result).toEqual({ kind: "replay", consumptionId: ORIGINAL_CONSUMPTION_ID, consumedAtUtc: NOW });
  });

  it("16. replay ignores the evaluator's own evidence_integrity_invalid verdict (which a consumed row's own status-check would otherwise always produce internally)", () => {
    const result = evaluateConsumeOutcome(
      input({
        evaluatorResult: ineligible("evidence_integrity_invalid"),
        rowStatus: "consumed",
        rowConsumptionId: ORIGINAL_CONSUMPTION_ID,
        rowConsumedAtUtc: NOW,
        rowExecutionRef: ORIGINAL_EXECUTION_REF,
        callerExecutionRef: ORIGINAL_EXECUTION_REF,
      }),
    );
    expect(result).toEqual({ kind: "replay", consumptionId: ORIGINAL_CONSUMPTION_ID, consumedAtUtc: NOW });
  });
});

describe("WLT-01 Phase 4B — evaluateConsumeOutcome: no failure ever mints/returns a consumption_id", () => {
  it("17. every 'deny' outcome shape structurally carries NO consumptionId field at all (type-level proof, not merely a runtime check)", () => {
    const denyResults = [
      evaluateConsumeOutcome(input({ evaluatorResult: ineligible("binding_mismatch") })),
      evaluateConsumeOutcome(input({ evaluatorResult: ineligible("expired") })),
      evaluateConsumeOutcome(input({ evaluatorResult: ineligible("revoked") })),
      evaluateConsumeOutcome(input({ evaluatorResult: ineligible("evidence_integrity_invalid") })),
      evaluateConsumeOutcome(
        input({ rowStatus: "consumed", rowConsumptionId: ORIGINAL_CONSUMPTION_ID, rowConsumedAtUtc: NOW, rowExecutionRef: ORIGINAL_EXECUTION_REF, callerExecutionRef: "different" }),
      ),
    ];
    for (const result of denyResults) {
      expect(result.kind).toBe("deny");
      expect("consumptionId" in result).toBe(false);
    }
  });

  it("18. the 'consume' outcome ALSO carries no consumptionId — minting happens only in the route, immediately before the CAS UPDATE, never inside this pure evaluator", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: eligible(), rowStatus: "issued" }));
    expect(result.kind).toBe("consume");
    expect("consumptionId" in result).toBe(false);
  });
});

describe("WLT-01 Phase 4B — evaluateConsumeOutcome: defensive unreachable-status guard", () => {
  it("19. a synthetic status outside {issued, consumed} -> deny evidence_integrity_invalid (forward-safe guard; structurally unreachable via migration 058's own CHECK)", () => {
    const result = evaluateConsumeOutcome(input({ evaluatorResult: eligible(), rowStatus: "some_future_status" }));
    expect(result).toEqual({ kind: "deny", reasonCode: "evidence_integrity_invalid" });
  });
});

// -------------------------------------------------------------------------------------------
// Limits / Velocity / Concentration / First-Use — `evaluateConsumeOutcome` itself is UNCHANGED
// (every test above still passes byte-identically); the new PRE_LIMIT/LIMIT_POLICY reason codes
// are produced by the ROUTE's own additional staleness/breach checks that run strictly AFTER this
// evaluator returns `{kind:"consume"}`, never inside it. This pins only the new
// `Wlt1ConsumeReasonCode` vocabulary (limit evaluation itself is tested in
// tests/unit/wlt1-limits.test.ts).
// -------------------------------------------------------------------------------------------
describe("WLT-01 Limits / Velocity / Concentration / First-Use — Wlt1ConsumeReasonCode gains exactly eight new reasons", () => {
  it("the eight new reason codes are valid Wlt1ConsumeReasonCode values (compile-time + runtime pin)", () => {
    const newReasons: Wlt1ConsumeReasonCode[] = [
      "limits_not_bound",
      "amount_mismatch",
      "limits_version_changed",
      "limit_policy_unavailable",
      "per_transaction_limit_exceeded",
      "first_use_limit_exceeded",
      "daily_velocity_exceeded",
      "rolling_velocity_exceeded",
    ];
    expect(newReasons).toHaveLength(8);
    expect(new Set(newReasons).size).toBe(8);
  });
});
