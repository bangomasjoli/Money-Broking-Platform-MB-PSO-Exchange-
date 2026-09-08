/**
 * Unit tests for services/clt1/src/lib/duplicate-candidates.ts — pure self-candidate/transition/SoD
 * validation logic, no DB required. Complements tests/integration/clt1-db.test.ts, which proves
 * node-existence validation and the full workflow end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@aix/foundation";
import {
  checkDuplicateSelfReviewBlocked,
  duplicateCandidateNodeNotFound,
  duplicateCandidateNotFound,
  evaluateDuplicateCandidateGateForApproval,
  safeDuplicateCandidateResponse,
  validateDuplicateCandidateTransition,
  validateNotSelfCandidate,
  type DuplicateCandidateGateRow,
  type DuplicateCandidateRow,
} from "../../services/clt1/src/lib/duplicate-candidates.js";
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

describe("validateNotSelfCandidate", () => {
  it("passes when subject and matched reference different entities", () => {
    expect(() => validateNotSelfCandidate("client", "clt1client_1", "party", "clt1ap_1")).not.toThrow();
    expect(() => validateNotSelfCandidate("application", "clt1app_1", "application", "clt1app_2")).not.toThrow();
  });

  it("throws the shared foundation VALIDATION_ERROR (not a new CLT-01 code) when subject and matched are identical", () => {
    try {
      validateNotSelfCandidate("party", "clt1ap_1", "party", "clt1ap_1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("does not throw for the same ref across different node types (not a true self-candidate)", () => {
    expect(() => validateNotSelfCandidate("client", "clt1x_1", "application", "clt1x_1")).not.toThrow();
  });
});

describe("validateDuplicateCandidateTransition", () => {
  it("allows update only from open", () => {
    expect(() => validateDuplicateCandidateTransition("open", "update")).not.toThrow();
    expectClt1Error(() => validateDuplicateCandidateTransition("duplicate", "update"), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
    expectClt1Error(() => validateDuplicateCandidateTransition("not_duplicate", "update"), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
  });

  it("allows confirm only from open", () => {
    expect(() => validateDuplicateCandidateTransition("open", "confirm")).not.toThrow();
    expectClt1Error(() => validateDuplicateCandidateTransition("duplicate", "confirm"), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
  });

  it("allows dismiss only from open", () => {
    expect(() => validateDuplicateCandidateTransition("open", "dismiss")).not.toThrow();
    expectClt1Error(() => validateDuplicateCandidateTransition("not_duplicate", "dismiss"), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
  });

  it("has no reachable transition from needs_more_info — schema-present but unreachable this phase", () => {
    for (const action of ["update", "confirm", "dismiss"] as const) {
      expectClt1Error(() => validateDuplicateCandidateTransition("needs_more_info", action), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
    }
  });

  it("has no reactivation path — a resolved candidate never allows update/confirm/dismiss again", () => {
    for (const status of ["duplicate", "not_duplicate"] as const) {
      for (const action of ["update", "confirm", "dismiss"] as const) {
        expectClt1Error(() => validateDuplicateCandidateTransition(status, action), "CLT1_DUPLICATE_CANDIDATE_INVALID_STATE");
      }
    }
  });
});

describe("duplicateCandidateNotFound", () => {
  it("throws CLT1_DUPLICATE_CANDIDATE_NOT_FOUND", () => {
    expectClt1Error(() => duplicateCandidateNotFound(), "CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
  });
});

describe("duplicateCandidateNodeNotFound", () => {
  it("throws CLT1_DUPLICATE_NODE_NOT_FOUND", () => {
    expectClt1Error(() => duplicateCandidateNodeNotFound(), "CLT1_DUPLICATE_NODE_NOT_FOUND");
  });
});

describe("checkDuplicateSelfReviewBlocked", () => {
  it("throws CLT1_DUPLICATE_SELF_REVIEW_BLOCKED when requested_by equals the (single) application's created_by", () => {
    expectClt1Error(() => checkDuplicateSelfReviewBlocked("staff_1", ["staff_1"]), "CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
  });

  it("does not throw when requested_by differs from the application's created_by", () => {
    expect(() => checkDuplicateSelfReviewBlocked("staff_2", ["staff_1"])).not.toThrow();
  });

  it("is a no-op (never throws) when neither side of the pair is application-typed — no created_by to compare against", () => {
    expect(() => checkDuplicateSelfReviewBlocked("staff_1", [])).not.toThrow();
  });

  it("throws when requested_by equals EITHER application-typed side's created_by (application-vs-application candidate)", () => {
    expectClt1Error(() => checkDuplicateSelfReviewBlocked("staff_matched_creator", ["staff_subject_creator", "staff_matched_creator"]), "CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
    expectClt1Error(() => checkDuplicateSelfReviewBlocked("staff_subject_creator", ["staff_subject_creator", "staff_matched_creator"]), "CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
  });

  it("does not throw for an application-vs-application candidate when requested_by created neither application", () => {
    expect(() => checkDuplicateSelfReviewBlocked("staff_reviewer", ["staff_subject_creator", "staff_matched_creator"])).not.toThrow();
  });
});

describe("safeDuplicateCandidateResponse", () => {
  const row: DuplicateCandidateRow = {
    duplicate_candidate_id: "clt1dc_1",
    subject_type: "application",
    subject_ref: "clt1app_1",
    matched_type: "client",
    matched_ref: "clt1client_1",
    match_type: "name",
    match_score: null,
    status: "open",
    source_type: "manual",
    source_ref: null,
    evidence_ref: "evidence_ref_1",
    reviewed_by: "staff_1",
    reviewed_at_utc: null,
    approval_id: "iam2appr_1",
    requested_by: "staff_1",
    sec_audit_ref: "sec1_ref_1",
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
  };

  it("includes the internal-ID/enum fields — none of these are PII", () => {
    const safe = safeDuplicateCandidateResponse(row);
    expect(safe).toMatchObject({
      duplicate_candidate_id: "clt1dc_1",
      subject_type: "application",
      subject_ref: "clt1app_1",
      matched_type: "client",
      matched_ref: "clt1client_1",
      match_type: "name",
      match_score: null,
      status: "open",
      source_type: "manual",
      source_ref: null,
      evidence_ref: "evidence_ref_1",
      version: 1,
    });
  });

  it("never includes reviewed_by, requested_by, approval_id, or sec_audit_ref as caller-facing fields", () => {
    const safe = safeDuplicateCandidateResponse(row);
    expect(safe).not.toHaveProperty("reviewed_by");
    expect(safe).not.toHaveProperty("requested_by");
    expect(safe).not.toHaveProperty("approval_id");
    expect(safe).not.toHaveProperty("sec_audit_ref");
  });
});

describe("evaluateDuplicateCandidateGateForApproval (Phase 7 — final approval compliance gate)", () => {
  function gateRow(status: DuplicateCandidateGateRow["status"], id = "clt1dc_1"): DuplicateCandidateGateRow {
    return { duplicate_candidate_id: id, status };
  }

  it("allows approval when the candidate list is empty", () => {
    expect(() => evaluateDuplicateCandidateGateForApproval([])).not.toThrow();
  });

  it("allows approval when every touching candidate is not_duplicate", () => {
    expect(() => evaluateDuplicateCandidateGateForApproval([gateRow("not_duplicate", "a"), gateRow("not_duplicate", "b")])).not.toThrow();
  });

  it("blocks with CLT1_DUPLICATE_REVIEW_REQUIRED when a candidate is open", () => {
    try {
      evaluateDuplicateCandidateGateForApproval([gateRow("open")]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Clt1Error);
      expect((e as Clt1Error).code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    }
  });

  it("blocks with CLT1_DUPLICATE_REVIEW_REQUIRED when a candidate is duplicate (confirmed adverse, not resolved-safe)", () => {
    try {
      evaluateDuplicateCandidateGateForApproval([gateRow("duplicate")]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Clt1Error);
      expect((e as Clt1Error).code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    }
  });

  it("blocks with CLT1_DUPLICATE_REVIEW_REQUIRED when a candidate is needs_more_info (defensive — no Phase 6 route can produce this status)", () => {
    try {
      evaluateDuplicateCandidateGateForApproval([gateRow("needs_more_info")]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Clt1Error);
      expect((e as Clt1Error).code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    }
  });

  it("blocks on the first blocking candidate even when mixed with not_duplicate candidates", () => {
    try {
      evaluateDuplicateCandidateGateForApproval([gateRow("not_duplicate", "safe_1"), gateRow("open", "blocking_1")]);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Clt1Error).code).toBe("CLT1_DUPLICATE_REVIEW_REQUIRED");
    }
  });

  it("reports duplicate_candidate_id and status in details, with no PII", () => {
    try {
      evaluateDuplicateCandidateGateForApproval([gateRow("open", "clt1dc_blocking_id")]);
      throw new Error("should have thrown");
    } catch (e) {
      const details = (e as Clt1Error).details;
      expect(details).toHaveLength(1);
      const detail = JSON.stringify(details[0]);
      expect(detail).toContain("clt1dc_blocking_id");
      expect(detail).toContain("open");
      expect(detail).not.toMatch(/legal_name|applicant_email|party_reference|user_reference/);
    }
  });
});
