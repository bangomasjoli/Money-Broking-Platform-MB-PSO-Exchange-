/**
 * Unit tests for services/clt1/src/lib/mandates.ts — pure rules-validation/response-projection
 * logic, no DB required. Complements tests/integration/clt1-db.test.ts, which proves the same
 * rules end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@aix/foundation";
import { mandateNotFound, safeMandateResponse, validateMandateRules, type ClientMandateRow } from "../../services/clt1/src/lib/mandates.js";
import { Clt1Error } from "../../services/clt1/src/lib/errors.js";

describe("validateMandateRules", () => {
  it("accepts an empty rules object", () => {
    expect(() => validateMandateRules({})).not.toThrow();
  });

  it("accepts all six allowed keys with valid values", () => {
    expect(() =>
      validateMandateRules({
        max_transaction_amount: 100000,
        max_daily_amount: 500000,
        currency: "USD",
        requires_dual_signature: true,
        approved_action_types: ["wallet_registration", "withdrawal_request"],
      }),
    ).not.toThrow();
  });

  it("rejects an unknown key (no arbitrary JSON)", () => {
    expect(() => validateMandateRules({ max_transaction_amount: 100, not_a_real_key: "x" })).toThrowError(AppError);
  });

  it("rejects a wrong-typed value for a known key", () => {
    expect(() => validateMandateRules({ max_transaction_amount: "not a number" })).toThrowError(AppError);
  });

  it("rejects a currency string that isn't exactly 3 characters", () => {
    expect(() => validateMandateRules({ currency: "US" })).toThrowError(AppError);
    expect(() => validateMandateRules({ currency: "USDD" })).toThrowError(AppError);
  });

  it("rejects an approved_action_types entry outside the fixed literal set", () => {
    expect(() => validateMandateRules({ approved_action_types: ["not_a_real_action"] })).toThrowError(AppError);
  });

  it("throws the shared foundation VALIDATION_ERROR code, not a new CLT-01 code", () => {
    try {
      validateMandateRules({ bogus: true });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects a non-object rules value", () => {
    expect(() => validateMandateRules("not an object")).toThrowError(AppError);
    expect(() => validateMandateRules(null)).toThrowError(AppError);
    expect(() => validateMandateRules([1, 2, 3])).toThrowError(AppError);
  });
});

describe("mandateNotFound", () => {
  it("throws CLT1_MANDATE_NOT_FOUND", () => {
    try {
      mandateNotFound();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Clt1Error);
      expect((e as Clt1Error).code).toBe("CLT1_MANDATE_NOT_FOUND");
    }
  });
});

describe("safeMandateResponse", () => {
  const row: ClientMandateRow = {
    mandate_id: "clt1mnd_1",
    client_id: "clt1client_1",
    mandate_type: "institutional",
    rules: { max_transaction_amount: 100000, currency: "USD" },
    mandate_schema_version: "v1",
    iam2_dual_auth_policy_ref: null,
    status: "active",
    effective_from_utc: "2026-01-01T00:00:00Z",
    expires_at_utc: null,
    approval_id: "iam2appr_1",
    requested_by: "staff_1",
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
  };

  it("includes rules — business configuration, not PII", () => {
    const safe = safeMandateResponse(row);
    expect(safe).toMatchObject({
      mandate_id: "clt1mnd_1",
      client_id: "clt1client_1",
      mandate_type: "institutional",
      status: "active",
      rules: { max_transaction_amount: 100000, currency: "USD" },
    });
  });

  it("does not include iam2_dual_auth_policy_ref as a load-bearing field beyond passthrough (it is always null this phase)", () => {
    const safe = safeMandateResponse(row);
    expect(safe).not.toHaveProperty("iam2_dual_auth_policy_ref");
  });
});
