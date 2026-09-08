/**
 * Unit tests for services/clt1/src/lib/authorised-users.ts — pure state-transition/self-add-
 * detection logic, no DB required. Complements tests/integration/clt1-db.test.ts, which proves
 * the same rules end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import {
  authorisedUserNotFound,
  isDuplicateActiveMembershipViolation,
  requireNotSelfAdd,
  safeAuthorisedUserResponse,
  safeMembershipResponse,
  validateAuthorisedUserTransition,
  type AuthorisedUserMembershipRow,
  type AuthorisedUserRow,
} from "../../services/clt1/src/lib/authorised-users.js";
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

describe("requireNotSelfAdd", () => {
  it("passes when requested_by differs from user_reference", () => {
    expect(() => requireNotSelfAdd("staff_1", "jane@example.com")).not.toThrow();
  });

  it("throws CLT1_SELF_APPROVAL_BLOCKED when requested_by equals user_reference", () => {
    expectClt1Error(() => requireNotSelfAdd("jane@example.com", "jane@example.com"), "CLT1_SELF_APPROVAL_BLOCKED");
  });
});

describe("validateAuthorisedUserTransition", () => {
  it("allows suspend only from active", () => {
    expect(() => validateAuthorisedUserTransition("active", "suspend")).not.toThrow();
    expectClt1Error(() => validateAuthorisedUserTransition("suspended", "suspend"), "CLT1_AUTHORISED_USER_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedUserTransition("revoked", "suspend"), "CLT1_AUTHORISED_USER_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedUserTransition("inactive", "suspend"), "CLT1_AUTHORISED_USER_INVALID_STATE");
  });

  it("allows reactivate only from suspended", () => {
    expect(() => validateAuthorisedUserTransition("suspended", "reactivate")).not.toThrow();
    expectClt1Error(() => validateAuthorisedUserTransition("active", "reactivate"), "CLT1_AUTHORISED_USER_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedUserTransition("revoked", "reactivate"), "CLT1_AUTHORISED_USER_INVALID_STATE");
  });

  it("allows remove only from active or suspended", () => {
    expect(() => validateAuthorisedUserTransition("active", "remove")).not.toThrow();
    expect(() => validateAuthorisedUserTransition("suspended", "remove")).not.toThrow();
    expectClt1Error(() => validateAuthorisedUserTransition("revoked", "remove"), "CLT1_AUTHORISED_USER_INVALID_STATE");
    expectClt1Error(() => validateAuthorisedUserTransition("inactive", "remove"), "CLT1_AUTHORISED_USER_INVALID_STATE");
  });
});

describe("authorisedUserNotFound", () => {
  it("throws CLT1_AUTHORISED_USER_NOT_FOUND", () => {
    expectClt1Error(() => authorisedUserNotFound(), "CLT1_AUTHORISED_USER_NOT_FOUND");
  });
});

describe("safeAuthorisedUserResponse", () => {
  const row: AuthorisedUserRow = {
    authorised_user_id: "clt1au_1",
    client_id: "clt1client_1",
    user_reference: "Must Never Appear jane@example.com",
    role: "client_maker",
    status: "active",
    approval_id: "iam2appr_1",
    requested_by: "staff_1",
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
    iam_user_id: "user_11111111-1111-1111-1111-111111111111",
  };

  it("never includes user_reference", () => {
    const safe = safeAuthorisedUserResponse(row);
    expect(safe).not.toHaveProperty("user_reference");
    expect(JSON.stringify(safe)).not.toContain("Must Never Appear");
  });

  it("includes the non-PII operational fields", () => {
    const safe = safeAuthorisedUserResponse(row);
    expect(safe).toMatchObject({
      authorised_user_id: "clt1au_1",
      client_id: "clt1client_1",
      role: "client_maker",
      status: "active",
      version: 1,
    });
  });

  it("never includes iam_user_id either — the list route's own established projection is unchanged by the membership authority addition", () => {
    const safe = safeAuthorisedUserResponse(row);
    expect(safe).not.toHaveProperty("iam_user_id");
  });
});

describe("Authenticated Principal -> Client Membership Authority — safeMembershipResponse", () => {
  const row: AuthorisedUserMembershipRow = {
    client_id: "clt1client_1",
    authorised_user_id: "clt1au_1",
    role: "client_admin",
    status: "active",
    version: 3,
    client_status: "active_limited",
  };

  it("projects exactly the six frozen keys", () => {
    const safe = safeMembershipResponse(row);
    expect(Object.keys(safe).sort()).toEqual(["authorised_user_id", "client_id", "client_status", "membership_status", "membership_version", "role"].sort());
  });

  it("maps status -> membership_status and version -> membership_version", () => {
    const safe = safeMembershipResponse(row);
    expect(safe).toMatchObject({
      client_id: "clt1client_1",
      authorised_user_id: "clt1au_1",
      role: "client_admin",
      membership_status: "active",
      membership_version: 3,
      client_status: "active_limited",
    });
  });

  it("never includes iam_user_id, user_reference, or any other identity/PII field", () => {
    const safe = safeMembershipResponse(row);
    expect(safe).not.toHaveProperty("iam_user_id");
    expect(safe).not.toHaveProperty("user_reference");
    expect(safe).not.toHaveProperty("email");
    expect(safe).not.toHaveProperty("name");
  });
});

describe("Authenticated Principal -> Client Membership Authority — isDuplicateActiveMembershipViolation", () => {
  it("returns true ONLY for the exact partial-unique-index violation", () => {
    expect(isDuplicateActiveMembershipViolation({ code: "23505", constraint: "idx_clt1_authorised_user_one_active_per_iam_client" })).toBe(true);
  });

  it("returns false for a 23505 on a DIFFERENT constraint", () => {
    expect(isDuplicateActiveMembershipViolation({ code: "23505", constraint: "idx_clt1_related_party_edge_one_active_per_tuple" })).toBe(false);
  });

  it("returns false for a different Postgres error code on the SAME constraint name", () => {
    expect(isDuplicateActiveMembershipViolation({ code: "23503", constraint: "idx_clt1_authorised_user_one_active_per_iam_client" })).toBe(false);
  });

  it("returns false for an unrelated error shape (never throws on malformed input)", () => {
    expect(isDuplicateActiveMembershipViolation(new Error("boom"))).toBe(false);
    expect(isDuplicateActiveMembershipViolation(null)).toBe(false);
    expect(isDuplicateActiveMembershipViolation(undefined)).toBe(false);
    expect(isDuplicateActiveMembershipViolation("not an error object")).toBe(false);
  });
});
