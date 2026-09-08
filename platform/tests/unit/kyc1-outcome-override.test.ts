/**
 * KYC-01 Phase 3B — pure manual-override domain-helper unit coverage
 * (services/kyc1/src/lib/outcome-override.ts), no DB required: reason-code/manual-override-reason
 * mapping, the self-override SoD boolean guard, and canonical payload construction.
 */
import { describe, expect, it } from "vitest";
import {
  MANUAL_OVERRIDE_REASON_CODES,
  OVERRIDE_REASON_CODES,
  OVERRIDE_TARGET_OUTCOME_STATUSES,
  checkSelfOverrideBlocked,
  isDuplicateOpenOverrideViolation,
  manualOverrideOutcomeReason,
  overridePayload,
  safeOverrideRequestResponse,
} from "../../services/kyc1/src/lib/outcome-override.js";
import { Kyc1Error } from "../../services/kyc1/src/lib/errors.js";

describe("manualOverrideOutcomeReason", () => {
  it("maps each target status to its own manual_override_* reason code", () => {
    expect(manualOverrideOutcomeReason("pass")).toBe("manual_override_pass");
    expect(manualOverrideOutcomeReason("fail")).toBe("manual_override_fail");
    expect(manualOverrideOutcomeReason("remediation_required")).toBe("manual_override_remediation_required");
  });

  it("every produced reason code is a member of MANUAL_OVERRIDE_REASON_CODES (single source of truth with the recompute-lock)", () => {
    for (const status of OVERRIDE_TARGET_OUTCOME_STATUSES) {
      expect(MANUAL_OVERRIDE_REASON_CODES.has(manualOverrideOutcomeReason(status))).toBe(true);
    }
  });
});

describe("MANUAL_OVERRIDE_REASON_CODES", () => {
  it("contains exactly the three reachable values, no more", () => {
    expect(MANUAL_OVERRIDE_REASON_CODES).toEqual(new Set(["manual_override_pass", "manual_override_fail", "manual_override_remediation_required"]));
  });

  it("does not contain an ordinary engine-generated reason code (recompute-lock must not fire on a normal computed outcome)", () => {
    expect(MANUAL_OVERRIDE_REASON_CODES.has("all_required_checks_passed")).toBe(false);
    expect(MANUAL_OVERRIDE_REASON_CODES.has("required_evidence_incomplete")).toBe(false);
  });
});

describe("checkSelfOverrideBlocked", () => {
  it("does not throw when the requester did not self-provide manual evidence on this case", () => {
    expect(() => checkSelfOverrideBlocked(false)).not.toThrow();
  });

  it("throws KYC1_SELF_OVERRIDE_BLOCKED when the requester DID self-provide manual evidence on this case", () => {
    expect(() => checkSelfOverrideBlocked(true)).toThrowError(Kyc1Error);
    try {
      checkSelfOverrideBlocked(true);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Kyc1Error).code).toBe("KYC1_SELF_OVERRIDE_BLOCKED");
    }
  });
});

describe("overridePayload", () => {
  it("produces exactly the eight approved canonical fields, no more, no less (MED-3: includes approved_against_outcome_id/status)", () => {
    const payload = overridePayload({
      override_id: "kyc1ovr_1",
      case_id: "kyc1case_1",
      target_type: "cdd_outcome",
      target_outcome_status: "fail",
      reason_code: "manual_evidence_review",
      approved_against_outcome_id: "kyc1outcome_1",
      approved_against_outcome_status: "remediation_required",
      requested_by: "staff_1",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["case_id", "override_id", "reason_code", "approved_against_outcome_id", "approved_against_outcome_status", "requested_by", "target_outcome_status", "target_type"].sort(),
    );
  });

  it("is a pure function of its input — same row, same payload, field-for-field", () => {
    const row = {
      override_id: "kyc1ovr_2",
      case_id: "kyc1case_2",
      target_type: "cdd_outcome",
      target_outcome_status: "pass",
      reason_code: "system_derived_outcome_incorrect",
      approved_against_outcome_id: "kyc1outcome_2",
      approved_against_outcome_status: "fail",
      requested_by: "staff_2",
    };
    expect(overridePayload(row)).toEqual(overridePayload({ ...row }));
  });

  it("changes when any one field changes (no field is silently ignored)", () => {
    const base = {
      override_id: "kyc1ovr_3",
      case_id: "kyc1case_3",
      target_type: "cdd_outcome",
      target_outcome_status: "pass",
      reason_code: "documented_compliance_exception",
      approved_against_outcome_id: "kyc1outcome_3",
      approved_against_outcome_status: "fail",
      requested_by: "staff_3",
    };
    const changedRequester = { ...base, requested_by: "staff_4" };
    expect(overridePayload(base)).not.toEqual(overridePayload(changedRequester));
  });

  it("MED-3: changes when approved_against_outcome_id changes, even if approved_against_outcome_status stays the same", () => {
    const base = {
      override_id: "kyc1ovr_5",
      case_id: "kyc1case_5",
      target_type: "cdd_outcome",
      target_outcome_status: "pass",
      reason_code: "manual_evidence_review",
      approved_against_outcome_id: "kyc1outcome_5a",
      approved_against_outcome_status: "fail",
      requested_by: "staff_5",
    };
    const differentOutcomeIdSameStatus = { ...base, approved_against_outcome_id: "kyc1outcome_5b" };
    expect(overridePayload(base)).not.toEqual(overridePayload(differentOutcomeIdSameStatus));
  });

  it("MED-3: changes when approved_against_outcome_status changes", () => {
    const base = {
      override_id: "kyc1ovr_6",
      case_id: "kyc1case_6",
      target_type: "cdd_outcome",
      target_outcome_status: "pass",
      reason_code: "manual_evidence_review",
      approved_against_outcome_id: "kyc1outcome_6",
      approved_against_outcome_status: "remediation_required",
      requested_by: "staff_6",
    };
    const differentStatus = { ...base, approved_against_outcome_status: "fail" };
    expect(overridePayload(base)).not.toEqual(overridePayload(differentStatus));
  });
});

describe("safeOverrideRequestResponse", () => {
  it("returns exactly the five approved fields — never requested_by/reason_code/approval_id/timestamps", () => {
    const row = {
      override_id: "kyc1ovr_1",
      case_id: "kyc1case_1",
      target_type: "cdd_outcome",
      target_outcome_status: "fail",
      reason_code: "manual_evidence_review",
      requested_by: "staff_1",
      approval_id: null,
      status: "requested",
      payload_hash: "sha256:abc",
      applied_outcome_id: null,
      created_at_utc: "2026-01-01T00:00:00.000Z",
      applied_at_utc: null,
    };
    const projected = safeOverrideRequestResponse(row);
    expect(Object.keys(projected).sort()).toEqual(["case_id", "override_id", "payload_hash", "status", "target_outcome_status"].sort());
    expect(projected).toEqual({
      override_id: "kyc1ovr_1",
      case_id: "kyc1case_1",
      target_outcome_status: "fail",
      status: "requested",
      payload_hash: "sha256:abc",
    });
  });
});

describe("isDuplicateOpenOverrideViolation", () => {
  it("recognises the exact partial-unique-index violation", () => {
    expect(isDuplicateOpenOverrideViolation({ code: "23505", constraint: "idx_kyc1_manual_override_request_one_open_per_case" })).toBe(true);
  });

  it("does not misclassify an unrelated 23505 (a different constraint)", () => {
    expect(isDuplicateOpenOverrideViolation({ code: "23505", constraint: "idx_kyc1_manual_override_request_override_id" })).toBe(false);
  });

  it("does not misclassify a non-23505 error", () => {
    expect(isDuplicateOpenOverrideViolation({ code: "42501", constraint: "idx_kyc1_manual_override_request_one_open_per_case" })).toBe(false);
  });

  it("does not throw on a malformed/non-object error value", () => {
    expect(isDuplicateOpenOverrideViolation(undefined)).toBe(false);
    expect(isDuplicateOpenOverrideViolation("plain string error")).toBe(false);
  });
});

describe("OVERRIDE_REASON_CODES / OVERRIDE_TARGET_OUTCOME_STATUSES (D9/D2 bounded enums)", () => {
  it("has exactly the three approved reason codes, no free-text escape hatch", () => {
    expect(OVERRIDE_REASON_CODES).toEqual(["system_derived_outcome_incorrect", "manual_evidence_review", "documented_compliance_exception"]);
  });

  it("has exactly the three approved target outcome statuses", () => {
    expect(OVERRIDE_TARGET_OUTCOME_STATUSES).toEqual(["pass", "fail", "remediation_required"]);
  });
});
