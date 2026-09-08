/**
 * Unit tests for services/clt1/src/lib/client-profiles.ts — pure lifecycle transition/reason
 * validation logic, no DB required. Complements tests/integration/clt1-db.test.ts, which proves
 * the full request/apply + IAM-02 execute-verify workflow end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import {
  lifecycleDecisionPayload,
  safeLifecycleResponse,
  targetStatusForAction,
  validateClientProfileTransition,
  validateLifecycleReason,
  type ClientProfileLifecycleAction,
} from "../../services/clt1/src/lib/client-profiles.js";
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

describe("targetStatusForAction", () => {
  it("maps suspend -> suspended, reactivate -> active_limited, close -> closed", () => {
    expect(targetStatusForAction("suspend")).toBe("suspended");
    expect(targetStatusForAction("reactivate")).toBe("active_limited");
    expect(targetStatusForAction("close")).toBe("closed");
  });
});

describe("validateClientProfileTransition", () => {
  it("allows active_limited -> suspended", () => {
    expect(() => validateClientProfileTransition("active_limited", "suspend")).not.toThrow();
  });

  it("allows suspended -> active_limited", () => {
    expect(() => validateClientProfileTransition("suspended", "reactivate")).not.toThrow();
  });

  it("allows active_limited -> closed", () => {
    expect(() => validateClientProfileTransition("active_limited", "close")).not.toThrow();
  });

  it("allows suspended -> closed", () => {
    expect(() => validateClientProfileTransition("suspended", "close")).not.toThrow();
  });

  it("blocks reactivate from active_limited (already active)", () => {
    expectClt1Error(() => validateClientProfileTransition("active_limited", "reactivate"), "CLT1_CLIENT_PROFILE_INVALID_STATE");
  });

  it("blocks suspend from suspended (already suspended)", () => {
    expectClt1Error(() => validateClientProfileTransition("suspended", "suspend"), "CLT1_CLIENT_PROFILE_INVALID_STATE");
  });

  it("closed is terminal — suspend/reactivate/close all blocked from closed", () => {
    for (const action of ["suspend", "reactivate", "close"] as const) {
      expectClt1Error(() => validateClientProfileTransition("closed", action), "CLT1_CLIENT_PROFILE_INVALID_STATE");
    }
  });

  it("blocks every action from statuses this phase never targets (active/restricted/pending)", () => {
    for (const status of ["active", "restricted", "pending"]) {
      for (const action of ["suspend", "reactivate", "close"] as const) {
        expectClt1Error(() => validateClientProfileTransition(status, action), "CLT1_CLIENT_PROFILE_INVALID_STATE");
      }
    }
  });

  it("reports the status and action in details, with no PII", () => {
    try {
      validateClientProfileTransition("closed", "suspend");
      throw new Error("should have thrown");
    } catch (e) {
      const details = (e as Clt1Error).details;
      expect(details).toHaveLength(1);
      const detail = JSON.stringify(details[0]);
      expect(detail).toContain("closed");
      expect(detail).toContain("suspend");
      expect(detail).not.toMatch(/legal_name|applicant_email|registration_number/);
    }
  });
});

describe("validateLifecycleReason", () => {
  it("requires a reason for suspend", () => {
    expectClt1Error(() => validateLifecycleReason("suspend", undefined), "CLT1_CLIENT_PROFILE_INVALID_STATE");
    expectClt1Error(() => validateLifecycleReason("suspend", ""), "CLT1_CLIENT_PROFILE_INVALID_STATE");
    expectClt1Error(() => validateLifecycleReason("suspend", "   "), "CLT1_CLIENT_PROFILE_INVALID_STATE");
    expect(() => validateLifecycleReason("suspend", "compliance hold")).not.toThrow();
  });

  it("requires a reason for close", () => {
    expectClt1Error(() => validateLifecycleReason("close", undefined), "CLT1_CLIENT_PROFILE_INVALID_STATE");
    expect(() => validateLifecycleReason("close", "client requested closure")).not.toThrow();
  });

  it("reason is optional for reactivate", () => {
    expect(() => validateLifecycleReason("reactivate", undefined)).not.toThrow();
    expect(() => validateLifecycleReason("reactivate", "hold lifted")).not.toThrow();
  });
});

describe("lifecycleDecisionPayload", () => {
  it("includes decision_id/client_id/decision_type/requested_by only — no reason/evidence_ref", () => {
    const action: ClientProfileLifecycleAction = "suspend";
    const payload = lifecycleDecisionPayload({ decision_id: "d1", client_id: "c1", decision_type: action, requested_by: "staff_1" });
    expect(payload).toEqual({ decision_id: "d1", client_id: "c1", decision_type: "suspend", requested_by: "staff_1" });
    expect(payload).not.toHaveProperty("reason");
    expect(payload).not.toHaveProperty("evidence_ref");
  });
});

describe("safeLifecycleResponse", () => {
  it("includes only client_id/status/decision_id — never requested_by/approval_id/decision_token_hash/reason/evidence_ref", () => {
    const safe = safeLifecycleResponse({ client_id: "c1", status: "suspended", decision_id: "d1" });
    expect(safe).toEqual({ client_id: "c1", status: "suspended", decision_id: "d1" });
    expect(safe).not.toHaveProperty("requested_by");
    expect(safe).not.toHaveProperty("approval_id");
    expect(safe).not.toHaveProperty("decision_token_hash");
    expect(safe).not.toHaveProperty("reason");
    expect(safe).not.toHaveProperty("evidence_ref");
  });
});
