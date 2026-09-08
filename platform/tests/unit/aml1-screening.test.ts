/**
 * AML-01 — pure screening logic (services/aml1/src/lib/screening.ts). No database, no HTTP —
 * proves subject validation, safe-response projection, and (Phase 3B) provider-payload
 * minimization/response normalization in isolation, same discipline tests/unit/
 * clt1-mandates.test.ts established for services/clt1/src/lib/mandates.ts.
 *
 * Phase 3B: the deterministic stub adaptor's own `screen()` moved to `lib/providers/
 * stub-provider.ts` — its coverage moved to tests/unit/aml1-stub-provider.test.ts unchanged in
 * substance (same fixture names/scores/list sources).
 */
import { describe, expect, it } from "vitest";
import { Aml1Error } from "../../services/aml1/src/lib/errors.js";
import {
  buildProviderScreeningPayload,
  clampFailureReasonCode,
  deriveOverallStatus,
  normalizeProviderMatches,
  safeScreeningResponse,
  validateScreeningSubject,
  type DeclaredIdentity,
} from "../../services/aml1/src/lib/screening.js";
import type { ProviderRawMatch } from "../../services/aml1/src/lib/providers/types.js";

function identity(name: string, extra: Partial<DeclaredIdentity> = {}): DeclaredIdentity {
  return { name, ...extra };
}

function rawMatch(overrides: Partial<ProviderRawMatch> = {}): ProviderRawMatch {
  return { category: "sanctions", score: 0.9, list_source: "SRC", matched_name: "Match Name", match_detail: null, ...overrides };
}

describe("AML-01 Phase 3B payload minimization — buildProviderScreeningPayload()", () => {
  it("always sends name and subject_nature", () => {
    const payload = buildProviderScreeningPayload("individual", identity("Jane Doe"));
    expect(payload.name).toBe("Jane Doe");
    expect(payload.subject_nature).toBe("individual");
  });

  it("sends country when present, omitted entirely when absent (not an empty string)", () => {
    const withCountry = buildProviderScreeningPayload("individual", identity("Jane Doe", { country: "MY" }));
    expect(withCountry.country).toBe("MY");
    const withoutCountry = buildProviderScreeningPayload("individual", identity("Jane Doe"));
    expect("country" in withoutCountry).toBe(false);
  });

  it("individual: sends date_of_birth/nationality, never registration_number even if supplied", () => {
    const payload = buildProviderScreeningPayload(
      "individual",
      identity("Jane Doe", { date_of_birth: "1990-01-01", nationality: "MY", registration_number: "SHOULD-NOT-BE-SENT" }),
    );
    expect(payload.date_of_birth).toBe("1990-01-01");
    expect(payload.nationality).toBe("MY");
    expect("registration_number" in payload).toBe(false);
  });

  it("entity: sends registration_number, never date_of_birth/nationality even if supplied", () => {
    const payload = buildProviderScreeningPayload(
      "entity",
      identity("Acme Corp", { registration_number: "REG-123", date_of_birth: "1990-01-01", nationality: "MY" }),
    );
    expect(payload.registration_number).toBe("REG-123");
    expect("date_of_birth" in payload).toBe(false);
    expect("nationality" in payload).toBe(false);
  });

  it("never includes subject_ref/screening_request_id/requested_by/provenance (they are not part of DeclaredIdentity at all — a structural guarantee, not just an omission)", () => {
    const payload = buildProviderScreeningPayload("individual", identity("Jane Doe"));
    const keys = Object.keys(payload);
    for (const forbidden of ["subject_ref", "screening_request_id", "requested_by", "provenance"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("AML-01 Phase 3B normalization — normalizeProviderMatches() / deriveOverallStatus()", () => {
  it("zero rawMatches normalizes to an empty array, deriving overall_status='clear'", () => {
    const normalized = normalizeProviderMatches([]);
    expect(normalized).toEqual([]);
    expect(deriveOverallStatus(normalized as never)).toBe("clear");
  });

  it("one or more valid rawMatches normalize successfully, deriving overall_status='potential_match'", () => {
    const normalized = normalizeProviderMatches([rawMatch({ category: "sanctions" }), rawMatch({ category: "pep" })]);
    expect(normalized).not.toBeNull();
    expect(normalized).toHaveLength(2);
    expect(deriveOverallStatus(normalized!)).toBe("potential_match");
  });

  it("an unknown category fails closed — returns null, never silently bucketed into adverse_media or dropped", () => {
    const normalized = normalizeProviderMatches([rawMatch({ category: "totally_unknown_category" })]);
    expect(normalized).toBeNull();
  });

  it("score is clamped into [0,1] and rounded to 3 decimals", () => {
    const normalized = normalizeProviderMatches([rawMatch({ score: 1.23456 }), rawMatch({ score: -0.5 })]);
    expect(normalized![0]?.score).toBe(1);
    expect(normalized![1]?.score).toBe(0);
  });

  it("score may be null — never coerced to a misleading 0.000 sentinel", () => {
    const normalized = normalizeProviderMatches([rawMatch({ score: null })]);
    expect(normalized![0]?.score).toBeNull();
  });

  it("matched_name/list_source/match_detail are clamped to their column widths", () => {
    const normalized = normalizeProviderMatches([
      rawMatch({ matched_name: "X".repeat(500), list_source: "Y".repeat(200), match_detail: "Z".repeat(10000) }),
    ]);
    expect(normalized![0]?.matched_name.length).toBe(256);
    expect(normalized![0]?.list_source.length).toBe(64);
    expect(normalized![0]?.match_detail?.length).toBe(4000);
  });

  it("normalization never produces confirmed_hit — deriveOverallStatus's return type is structurally limited to clear/potential_match", () => {
    const normalized = normalizeProviderMatches([rawMatch()]);
    const status = deriveOverallStatus(normalized!);
    expect(["clear", "potential_match"]).toContain(status);
  });
});

describe("AML-01 Phase 3B — clampFailureReasonCode()", () => {
  it("passes short codes through unchanged", () => {
    expect(clampFailureReasonCode("provider_unavailable")).toBe("provider_unavailable");
  });

  it("clamps an oversized code to 64 characters", () => {
    const oversized = "x".repeat(200);
    expect(clampFailureReasonCode(oversized)).toHaveLength(64);
  });
});

describe("AML-01 subject validation — validateScreeningSubject()", () => {
  it("accepts a valid client_application subject with declared_identity provenance", () => {
    expect(() => validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name") })).not.toThrow();
  });

  it("accepts a valid authorised_party subject", () => {
    expect(() => validateScreeningSubject({ subject_type: "authorised_party", provenance: "declared_identity", declared_identity: identity("Valid Name") })).not.toThrow();
  });

  it("rejects an unsupported subject_type", () => {
    expect(() => validateScreeningSubject({ subject_type: "wallet_address", provenance: "declared_identity", declared_identity: identity("Valid Name") })).toThrowError(Aml1Error);
  });

  it("rejects a provenance other than declared_identity (kyc_verified_identity is schema-present but not writable this phase)", () => {
    expect(() => validateScreeningSubject({ subject_type: "client_application", provenance: "kyc_verified_identity", declared_identity: identity("Valid Name") })).toThrowError(Aml1Error);
  });

  it("rejects a blank name", () => {
    expect(() => validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("") })).toThrowError(Aml1Error);
  });

  it("rejects a whitespace-only name", () => {
    expect(() => validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("   ") })).toThrowError(Aml1Error);
  });

  it("date_of_birth is optional — omitting it entirely is valid", () => {
    expect(() => validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name") })).not.toThrow();
  });

  it("accepts a well-formed, real calendar date_of_birth (including a leap-year Feb 29)", () => {
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "1990-06-15" }) }),
    ).not.toThrow();
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "2024-02-29" }) }),
    ).not.toThrow();
  });

  it("rejects a wrong-shape date_of_birth string", () => {
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "not-a-date" }) }),
    ).toThrowError(Aml1Error);
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "1990/06/15" }) }),
    ).toThrowError(Aml1Error);
  });

  it("rejects a syntactically-shaped but calendrically-impossible date_of_birth (Feb 30, month 13, a non-leap-year Feb 29)", () => {
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "2024-02-30" }) }),
    ).toThrowError(Aml1Error);
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "2024-13-01" }) }),
    ).toThrowError(Aml1Error);
    expect(() =>
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "2023-02-29" }) }),
    ).toThrowError(Aml1Error);
  });

  it("an invalid date_of_birth throws AML1_SCREENING_SUBJECT_INVALID (422) without echoing the bad value in error details", () => {
    try {
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("Valid Name", { date_of_birth: "2024-02-30" }) });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as Aml1Error;
      expect(err.code).toBe("AML1_SCREENING_SUBJECT_INVALID");
      expect(err.http).toBe(422);
      expect(JSON.stringify(err.details).includes("2024-02-30")).toBe(false);
    }
  });

  it("throws AML1_SCREENING_SUBJECT_INVALID (not a generic error)", () => {
    try {
      validateScreeningSubject({ subject_type: "client_application", provenance: "declared_identity", declared_identity: identity("") });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as Aml1Error;
      expect(err.code).toBe("AML1_SCREENING_SUBJECT_INVALID");
      expect(err.http).toBe(422);
    }
  });
});

describe("AML-01 safe-response projection — safeScreeningResponse()", () => {
  it("omits all declared-identity PII, matched_name, match_detail, and score — only the documented Phase 1 fields are present", () => {
    const response = safeScreeningResponse({
      screening_request_id: "aml1req_test",
      subject_type: "client_application",
      subject_ref: "clt1app_test",
      provenance: "declared_identity",
      status: "completed",
      result: { overall_status: "potential_match", screened_at_utc: "2026-01-01T00:00:00.000Z", matched_categories: ["sanctions"] },
    });

    expect(response).toEqual({
      screening_request_id: "aml1req_test",
      subject_type: "client_application",
      subject_ref: "clt1app_test",
      provenance: "declared_identity",
      status: "completed",
      result: { overall_status: "potential_match", matched_categories: ["sanctions"], screened_at_utc: "2026-01-01T00:00:00.000Z" },
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of ["name", "registration_number", "date_of_birth", "nationality", "matched_name", "match_detail", "score"]) {
      expect(serialized.includes(`"${forbidden}"`), `safe response must not contain field "${forbidden}"`).toBe(false);
    }
  });

  it("projects result: null for a request with no completed result yet", () => {
    const response = safeScreeningResponse({
      screening_request_id: "aml1req_test2",
      subject_type: "authorised_party",
      subject_ref: "clt1party_test",
      provenance: "declared_identity",
      status: "failed",
    });
    expect(response.result).toBeNull();
  });
});
