/**
 * Unit tests for services/clt1/src/lib/authorised-parties.ts — pure state-transition/screening-
 * gate/self-action-detection logic, no DB required. Complements
 * tests/integration/clt1-db.test.ts, which proves the same rules end-to-end against a real
 * Postgres.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@aix/foundation";
import {
  authorisedPartyNotFound,
  requireNotSelfAction,
  requireScreeningPassForActivation,
  safeAuthorisedPartyResponse,
  validateAuthorisedPartyTransition,
  validateOwnershipPercentagePrecision,
  type AuthorisedPartyRow,
} from "../../services/clt1/src/lib/authorised-parties.js";
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

describe("requireNotSelfAction", () => {
  it("passes when requested_by differs from party_reference", () => {
    expect(() => requireNotSelfAction("staff_1", "jane@example.com")).not.toThrow();
  });

  it("throws CLT1_SELF_APPROVAL_BLOCKED when requested_by equals party_reference", () => {
    expectClt1Error(() => requireNotSelfAction("jane@example.com", "jane@example.com"), "CLT1_SELF_APPROVAL_BLOCKED");
  });
});

describe("requireScreeningPassForActivation", () => {
  it("passes when identity is pass and sanctions is clear", () => {
    expect(() => requireScreeningPassForActivation("pass", "clear")).not.toThrow();
  });

  it("passes when identity is pass and sanctions is review_required (locked design decision)", () => {
    expect(() => requireScreeningPassForActivation("pass", "review_required")).not.toThrow();
  });

  it("throws CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED when identity is not pass", () => {
    expectClt1Error(() => requireScreeningPassForActivation("pending", "clear"), "CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
    expectClt1Error(() => requireScreeningPassForActivation("fail", "clear"), "CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
    expectClt1Error(() => requireScreeningPassForActivation("stale", "clear"), "CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
  });

  it("throws CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED when sanctions is not clear/review_required", () => {
    expectClt1Error(() => requireScreeningPassForActivation("pass", "pending"), "CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
    expectClt1Error(() => requireScreeningPassForActivation("pass", "hit"), "CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED");
  });
});

describe("validateAuthorisedPartyTransition", () => {
  it("allows update only from pending or active", () => {
    expect(() => validateAuthorisedPartyTransition("pending", "update")).not.toThrow();
    expect(() => validateAuthorisedPartyTransition("active", "update")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("restricted", "update"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedPartyTransition("revoked", "update"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("allows remove from any non-revoked state", () => {
    expect(() => validateAuthorisedPartyTransition("pending", "remove")).not.toThrow();
    expect(() => validateAuthorisedPartyTransition("active", "remove")).not.toThrow();
    expect(() => validateAuthorisedPartyTransition("restricted", "remove")).not.toThrow();
    expect(() => validateAuthorisedPartyTransition("suspended", "remove")).not.toThrow();
    expect(() => validateAuthorisedPartyTransition("rejected", "remove")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("revoked", "remove"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("allows activate only from pending", () => {
    expect(() => validateAuthorisedPartyTransition("pending", "activate")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("active", "activate"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedPartyTransition("restricted", "activate"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("allows restrict only from pending", () => {
    expect(() => validateAuthorisedPartyTransition("pending", "restrict")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("active", "restrict"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("allows reject only from pending", () => {
    expect(() => validateAuthorisedPartyTransition("pending", "reject")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("active", "reject"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("allows suspend only from active", () => {
    expect(() => validateAuthorisedPartyTransition("active", "suspend")).not.toThrow();
    expectClt1Error(() => validateAuthorisedPartyTransition("pending", "suspend"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedPartyTransition("restricted", "suspend"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
  });

  it("has no reactivation path — restricted/rejected/revoked/suspended never allow activate", () => {
    for (const status of ["restricted", "rejected", "revoked", "suspended"] as const) {
      expectClt1Error(() => validateAuthorisedPartyTransition(status, "activate"), "CLT1_AUTHORISED_PARTY_INVALID_STATE");
    }
  });
});

describe("validateOwnershipPercentagePrecision", () => {
  it("accepts whole integers and ordinary 2-decimal-place values (the exact values TypeBox's own multipleOf keyword was empirically found to reject)", () => {
    for (const v of [0, 45, 10, 20, 100, 33.33, 66.67, 12.34, 0.01, 99.99, 25.5]) {
      expect(() => validateOwnershipPercentagePrecision(v), `${v} should be accepted`).not.toThrow();
    }
  });

  it("throws the shared foundation VALIDATION_ERROR (not a new CLT-01 code) for values with more than 2 decimal places", () => {
    for (const v of [33.333, 12.345, 0.001, 99.999]) {
      try {
        validateOwnershipPercentagePrecision(v);
        throw new Error(`should have thrown for ${v}`);
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe("VALIDATION_ERROR");
      }
    }
  });

  it("rejects a schema-valid sub-hundredths value whose JS String() representation would otherwise be exponential notation (the exact Opus L1 regression case)", () => {
    expect(() => validateOwnershipPercentagePrecision(0.0000001)).toThrowError(AppError);
  });
});

describe("authorisedPartyNotFound", () => {
  it("throws CLT1_AUTHORISED_PARTY_NOT_FOUND", () => {
    expectClt1Error(() => authorisedPartyNotFound(), "CLT1_AUTHORISED_PARTY_NOT_FOUND");
  });
});

describe("safeAuthorisedPartyResponse", () => {
  const row: AuthorisedPartyRow = {
    authorised_party_id: "clt1ap_1",
    application_id: "clt1app_1",
    party_type: "director",
    party_reference: "Must Never Appear jane@example.com",
    ownership_percentage: "25.5",
    identity_verification_status: "pending",
    sanctions_pep_status: "pending",
    authority_status: "pending",
    sec_audit_ref: "sec_ref_1",
    last_screened_at_utc: null,
    screening_source_module: null,
    approval_id: null,
    requested_by: "staff_1",
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
  };

  it("never includes party_reference", () => {
    const safe = safeAuthorisedPartyResponse(row);
    expect(safe).not.toHaveProperty("party_reference");
    expect(JSON.stringify(safe)).not.toContain("Must Never Appear");
  });

  it("includes the non-PII operational and business fields", () => {
    const safe = safeAuthorisedPartyResponse(row);
    expect(safe).toMatchObject({
      authorised_party_id: "clt1ap_1",
      application_id: "clt1app_1",
      party_type: "director",
      ownership_percentage: "25.5",
      identity_verification_status: "pending",
      sanctions_pep_status: "pending",
      authority_status: "pending",
      sec_audit_ref: "sec_ref_1",
      version: 1,
    });
  });

  it("never includes a client_id field — authorised_party is application-scoped only", () => {
    const safe = safeAuthorisedPartyResponse(row);
    expect(safe).not.toHaveProperty("client_id");
  });
});
