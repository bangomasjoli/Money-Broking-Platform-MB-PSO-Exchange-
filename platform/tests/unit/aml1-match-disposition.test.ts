/**
 * AML-01 Phase 2B — unit tests for lib/match-disposition.ts. Pure logic, no DB/HTTP.
 */
import { describe, expect, it } from "vitest";
import { Aml1Error } from "../../services/aml1/src/lib/errors.js";
import {
  checkSelfDispositionBlocked,
  decisionPayload,
  targetMatchStatusFor,
  validateMatchTransition,
} from "../../services/aml1/src/lib/match-disposition.js";

describe("targetMatchStatusFor", () => {
  it("confirm -> confirmed_hit", () => expect(targetMatchStatusFor("confirm")).toBe("confirmed_hit"));
  it("dismiss -> dismissed", () => expect(targetMatchStatusFor("dismiss")).toBe("dismissed"));
});

describe("validateMatchTransition", () => {
  it("allows a potential_match to proceed (does not throw)", () => {
    expect(() => validateMatchTransition("potential_match")).not.toThrow();
  });

  it("rejects an already-confirmed_hit match with AML1_MATCH_INVALID_STATE", () => {
    try {
      validateMatchTransition("confirmed_hit");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Aml1Error);
      expect((e as Aml1Error).code).toBe("AML1_MATCH_INVALID_STATE");
    }
  });

  it("rejects an already-dismissed match with AML1_MATCH_INVALID_STATE (both terminal, no re-open)", () => {
    expect(() => validateMatchTransition("dismissed")).toThrowError(Aml1Error);
  });
});

describe("checkSelfDispositionBlocked — strict SoD", () => {
  it("blocks when the disposition requester equals the original screener", () => {
    try {
      checkSelfDispositionBlocked("staff_1", "staff_1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Aml1Error);
      expect((e as Aml1Error).code).toBe("AML1_SELF_DISPOSITION_BLOCKED");
    }
  });

  it("allows when the disposition requester differs from the original screener", () => {
    expect(() => checkSelfDispositionBlocked("staff_2", "staff_1")).not.toThrow();
  });
});

describe("decisionPayload — canonical shape for fingerprint()", () => {
  it("returns exactly the five bound fields, nothing extra", () => {
    const payload = decisionPayload({ decision_id: "d1", screening_match_id: "m1", decision_type: "confirm", reason: "test", requested_by: "staff_2" });
    expect(payload).toEqual({ decision_id: "d1", screening_match_id: "m1", decision_type: "confirm", reason: "test", requested_by: "staff_2" });
  });

  it("preserves a null reason (optional field) rather than omitting it — required for exact recomputation at apply time", () => {
    const payload = decisionPayload({ decision_id: "d1", screening_match_id: "m1", decision_type: "dismiss", reason: null, requested_by: "staff_2" });
    expect(payload.reason).toBeNull();
    expect(Object.keys(payload)).toHaveLength(5);
  });
});
