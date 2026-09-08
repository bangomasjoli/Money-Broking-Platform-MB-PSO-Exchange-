/**
 * Unit tests for services/clt1/src/lib/outcomes.ts — pure CDD-outcome gate logic, no DB required.
 * Complements tests/integration/clt1-db.test.ts, which proves the same rules end-to-end against a
 * real Postgres.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCddGateForApproval,
  isCddGateReady,
  requireHandoffsForApproval,
  rollupColumnForOutcomeType,
  type CddGateColumns,
} from "../../services/clt1/src/lib/outcomes.js";
import { Clt1Error } from "../../services/clt1/src/lib/errors.js";

function expectClt1Error(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(Clt1Error);
    expect((e as Clt1Error).code).toBe(code);
  }
}

function allPass(overrides: Partial<CddGateColumns> = {}): CddGateColumns {
  return {
    cdd_outcome_status: "pass",
    aml_sanctions_status: "pass",
    pep_adverse_media_status: "pass",
    risk_rating_status: "pass",
    ...overrides,
  };
}

describe("rollupColumnForOutcomeType", () => {
  it("maps each of the 4 outcome types to its own rollup column", () => {
    expect(rollupColumnForOutcomeType("kyc_kyb")).toBe("cdd_outcome_status");
    expect(rollupColumnForOutcomeType("aml_sanctions")).toBe("aml_sanctions_status");
    expect(rollupColumnForOutcomeType("pep_adverse_media")).toBe("pep_adverse_media_status");
    expect(rollupColumnForOutcomeType("risk_rating")).toBe("risk_rating_status");
  });
});

describe("evaluateCddGateForApproval", () => {
  it("does not throw when all four rollup columns are 'pass'", () => {
    expect(() => evaluateCddGateForApproval(allPass())).not.toThrow();
  });

  it("throws CLT1_AML_SANCTIONS_HIT (sharpest code) when aml_sanctions_status is 'hit', regardless of other fields", () => {
    expectClt1Error(() => evaluateCddGateForApproval(allPass({ aml_sanctions_status: "hit", risk_rating_status: "pending" })), "CLT1_AML_SANCTIONS_HIT");
  });

  it("throws CLT1_RISK_REJECTED (sharpest code) when risk_rating_status is 'rejected'", () => {
    expectClt1Error(() => evaluateCddGateForApproval(allPass({ risk_rating_status: "rejected" })), "CLT1_RISK_REJECTED");
  });

  it("AML_SANCTIONS_HIT takes priority over RISK_REJECTED when both are present", () => {
    expectClt1Error(() => evaluateCddGateForApproval(allPass({ aml_sanctions_status: "hit", risk_rating_status: "rejected" })), "CLT1_AML_SANCTIONS_HIT");
  });

  for (const status of ["pending", "unavailable", "not_required"]) {
    it(`throws CLT1_CDD_OUTCOME_REQUIRED when a rollup column is '${status}' (not yet satisfied)`, () => {
      expectClt1Error(() => evaluateCddGateForApproval(allPass({ cdd_outcome_status: status })), "CLT1_CDD_OUTCOME_REQUIRED");
    });
  }

  for (const status of ["fail", "stale", "remediation_required"]) {
    it(`throws CLT1_CDD_OUTCOME_FAILED when a rollup column is '${status}' (asked, got a bad answer)`, () => {
      expectClt1Error(() => evaluateCddGateForApproval(allPass({ pep_adverse_media_status: status })), "CLT1_CDD_OUTCOME_FAILED");
    });
  }

  it("'rejected' on a non-risk-rating column falls through to the generic CLT1_CDD_OUTCOME_FAILED, not CLT1_RISK_REJECTED", () => {
    expectClt1Error(() => evaluateCddGateForApproval(allPass({ cdd_outcome_status: "rejected" })), "CLT1_CDD_OUTCOME_FAILED");
  });

  it("checks fields in a fixed order — cdd_outcome_status is reported first when multiple are bad", () => {
    expectClt1Error(() => evaluateCddGateForApproval(allPass({ cdd_outcome_status: "fail", pep_adverse_media_status: "fail" })), "CLT1_CDD_OUTCOME_FAILED");
  });
});

describe("isCddGateReady", () => {
  it("returns true when the gate passes", () => {
    expect(isCddGateReady(allPass())).toBe(true);
  });

  it("returns false (never throws) when the gate fails", () => {
    expect(isCddGateReady(allPass({ risk_rating_status: "pending" }))).toBe(false);
    expect(isCddGateReady(allPass({ aml_sanctions_status: "hit" }))).toBe(false);
  });
});

describe("requireHandoffsForApproval", () => {
  it("passes when both KYC and AML handoffs exist", () => {
    expect(() => requireHandoffsForApproval({ hasKyc: true, hasAml: true })).not.toThrow();
  });

  it("throws CLT1_KYC_HANDOFF_REQUIRED when the KYC handoff is missing (checked before AML)", () => {
    expectClt1Error(() => requireHandoffsForApproval({ hasKyc: false, hasAml: false }), "CLT1_KYC_HANDOFF_REQUIRED");
    expectClt1Error(() => requireHandoffsForApproval({ hasKyc: false, hasAml: true }), "CLT1_KYC_HANDOFF_REQUIRED");
  });

  it("throws CLT1_AML_HANDOFF_REQUIRED when only the AML handoff is missing", () => {
    expectClt1Error(() => requireHandoffsForApproval({ hasKyc: true, hasAml: false }), "CLT1_AML_HANDOFF_REQUIRED");
  });
});
