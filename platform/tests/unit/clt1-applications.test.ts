/**
 * Unit tests for services/clt1/src/lib/applications.ts — pure state-transition/gate-
 * interpretation logic, no DB required. Complements tests/integration/clt1-db.test.ts, which
 * proves the same rules end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import {
  applicationNotFound,
  interpretCfgGate,
  requireCfgGateOnFile,
  requireConsentForSubmit,
  safeApplicationResponse,
  validateTransition,
  type ClientApplicationRow,
} from "../../services/clt1/src/lib/applications.js";
import { Clt1Error } from "../../services/clt1/src/lib/errors.js";
import type { OnboardingGateResult } from "../../services/clt1/src/lib/cfg1-client.js";

function expectClt1Error(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(Clt1Error);
    expect((e as Clt1Error).code).toBe(code);
  }
}

describe("validateTransition", () => {
  it("allows patch/classification-evidence/consent/cancel only from their documented statuses", () => {
    expect(() => validateTransition("draft", "patch")).not.toThrow();
    expect(() => validateTransition("draft", "classification-evidence")).not.toThrow();
    expect(() => validateTransition("submitted", "classification-evidence")).not.toThrow();
    expect(() => validateTransition("draft", "consent")).not.toThrow();
    expect(() => validateTransition("submitted", "consent")).not.toThrow();
    expect(() => validateTransition("draft", "cancel")).not.toThrow();
    expect(() => validateTransition("submitted", "cancel")).not.toThrow();
  });

  it("allows submit only from draft, start-review only from submitted", () => {
    expect(() => validateTransition("draft", "submit")).not.toThrow();
    expect(() => validateTransition("submitted", "start-review")).not.toThrow();
  });

  it("rejects patch on a non-draft application", () => {
    expectClt1Error(() => validateTransition("submitted", "patch"), "CLT1_APPLICATION_INVALID_STATE");
    expectClt1Error(() => validateTransition("under_review", "patch"), "CLT1_APPLICATION_INVALID_STATE");
    expectClt1Error(() => validateTransition("cancelled", "patch"), "CLT1_APPLICATION_INVALID_STATE");
  });

  it("rejects submit on a non-draft application", () => {
    expectClt1Error(() => validateTransition("submitted", "submit"), "CLT1_APPLICATION_INVALID_STATE");
    expectClt1Error(() => validateTransition("cancelled", "submit"), "CLT1_APPLICATION_INVALID_STATE");
  });

  it("rejects start-review on a non-submitted application", () => {
    expectClt1Error(() => validateTransition("draft", "start-review"), "CLT1_APPLICATION_INVALID_STATE");
    expectClt1Error(() => validateTransition("under_review", "start-review"), "CLT1_APPLICATION_INVALID_STATE");
  });

  it("rejects cancel on an under_review or already-cancelled application", () => {
    expectClt1Error(() => validateTransition("under_review", "cancel"), "CLT1_APPLICATION_INVALID_STATE");
    expectClt1Error(() => validateTransition("cancelled", "cancel"), "CLT1_APPLICATION_INVALID_STATE");
  });

  it("Phase 2: allows handoff/receive-outcome/approve-request/approve-apply/reject/hold only from under_review", () => {
    for (const action of ["handoff", "receive-outcome", "approve-request", "approve-apply", "reject", "hold"] as const) {
      expect(() => validateTransition("under_review", action)).not.toThrow();
      expectClt1Error(() => validateTransition("submitted", action), "CLT1_APPLICATION_INVALID_STATE");
      expectClt1Error(() => validateTransition("draft", action), "CLT1_APPLICATION_INVALID_STATE");
      expectClt1Error(() => validateTransition("approved", action), "CLT1_APPLICATION_INVALID_STATE");
    }
  });
});

describe("requireCfgGateOnFile", () => {
  it("passes when cfg_feature_code and cfg_reason_code are both present", () => {
    expect(() =>
      requireCfgGateOnFile({ cfg_feature_code: "onboarding.institutional", cfg_decision_id: "d1", cfg_reason_code: "feature_allowed", cfg_evaluated_at_utc: "2026-01-01T00:00:00Z" }),
    ).not.toThrow();
  });

  it("throws CLT1_CFG_GATE_REQUIRED when no gate check is on file", () => {
    expectClt1Error(
      () => requireCfgGateOnFile({ cfg_feature_code: null, cfg_decision_id: null, cfg_reason_code: null, cfg_evaluated_at_utc: null }),
      "CLT1_CFG_GATE_REQUIRED",
    );
  });
});

function gate(overrides: Partial<OnboardingGateResult>): OnboardingGateResult {
  return { allowed: true, featureCode: "onboarding.institutional", decisionId: "d1", reasonCode: "feature_allowed", evaluatedAtUtc: "2026-01-01T00:00:00Z", ...overrides };
}

describe("interpretCfgGate", () => {
  it("does not throw on an allow", () => {
    expect(() => interpretCfgGate(gate({ allowed: true }))).not.toThrow();
  });

  it("throws CLT1_RETAIL_ONBOARDING_BLOCKED for a denied onboarding.retail_default (structural, not conventional)", () => {
    expectClt1Error(
      () => interpretCfgGate(gate({ allowed: false, featureCode: "onboarding.retail_default", reasonCode: "prohibited" })),
      "CLT1_RETAIL_ONBOARDING_BLOCKED",
    );
  });

  it("throws CLT1_CFG_GATE_DENIED for a denied non-retail feature (e.g. unknown_fail_closed)", () => {
    expectClt1Error(
      () => interpretCfgGate(gate({ allowed: false, featureCode: "onboarding.institutional", reasonCode: "unknown_fail_closed" })),
      "CLT1_CFG_GATE_DENIED",
    );
  });

  it("throws CLT1_CFG_GATE_UNAVAILABLE when CFG-01 could not be reached, not a generic deny, and not CLT1_SERVICE_UNAVAILABLE (Phase 2 split — that code is reserved for CLT-01's own DB/service failure)", () => {
    expectClt1Error(
      () => interpretCfgGate(gate({ allowed: false, featureCode: "onboarding.institutional", reasonCode: "cfg1_unavailable" })),
      "CLT1_CFG_GATE_UNAVAILABLE",
    );
  });
});

describe("requireConsentForSubmit", () => {
  it("passes with at least one consent record", () => {
    expect(() => requireConsentForSubmit(1)).not.toThrow();
    expect(() => requireConsentForSubmit(3)).not.toThrow();
  });

  it("throws CLT1_CONSENT_REQUIRED with zero consent records", () => {
    expectClt1Error(() => requireConsentForSubmit(0), "CLT1_CONSENT_REQUIRED");
  });
});

describe("applicationNotFound", () => {
  it("throws CLT1_APPLICATION_NOT_FOUND", () => {
    expectClt1Error(() => applicationNotFound(), "CLT1_APPLICATION_NOT_FOUND");
  });
});

describe("safeApplicationResponse", () => {
  const row: ClientApplicationRow = {
    application_id: "clt1app_1",
    applicant_type: "corporate",
    legal_name: "Should Never Appear Ltd",
    registration_number: "REG-SECRET-123",
    country_of_incorporation: "SG",
    applicant_email: "secret@example.com",
    client_class_claimed: "institutional",
    client_class_status: "claimed",
    status: "draft",
    client_id: null,
    cfg_feature_code: "onboarding.institutional",
    cfg_decision_id: "d1",
    cfg_reason_code: "feature_allowed",
    cfg_evaluated_at_utc: "2026-01-01T00:00:00Z",
    assigned_reviewer: null,
    submitted_at_utc: null,
    under_review_at_utc: null,
    cancelled_at_utc: null,
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
    cdd_outcome_status: "pending",
    aml_sanctions_status: "pending",
    pep_adverse_media_status: "pending",
    risk_rating_status: "pending",
    approved_at_utc: null,
    rejected_at_utc: null,
    held_at_utc: null,
    approval_id: null,
    rejection_reason: null,
    hold_reason: null,
  };

  it("never includes legal_name, applicant_email, registration_number, or country_of_incorporation", () => {
    const safe = safeApplicationResponse(row);
    expect(safe).not.toHaveProperty("legal_name");
    expect(safe).not.toHaveProperty("applicant_email");
    expect(safe).not.toHaveProperty("registration_number");
    expect(safe).not.toHaveProperty("country_of_incorporation");
    expect(JSON.stringify(safe)).not.toContain("Should Never Appear");
    expect(JSON.stringify(safe)).not.toContain("secret@example.com");
    expect(JSON.stringify(safe)).not.toContain("REG-SECRET-123");
  });

  it("includes the non-PII operational fields", () => {
    const safe = safeApplicationResponse(row);
    expect(safe).toMatchObject({
      application_id: "clt1app_1",
      applicant_type: "corporate",
      client_class_claimed: "institutional",
      client_class_status: "claimed",
      status: "draft",
      cfg_feature_code: "onboarding.institutional",
      version: 1,
    });
  });
});
