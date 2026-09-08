/**
 * KYC-01 Phase 1 — pure domain-helper unit coverage (services/kyc1/src/lib/kyc-case.ts), no DB
 * required: evidence-reference shape validation (KYC-01 never stores raw document content — this
 * is the structural refusal at the input boundary), case-type -> applicable-result-type mapping,
 * and the deterministic default checklist.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHECKLIST_BY_CASE_TYPE,
  KYC_CASE_TYPES,
  applicableResultTypesForCaseType,
  validateEvidenceRef,
} from "../../services/kyc1/src/lib/kyc-case.js";
import { Kyc1Error } from "../../services/kyc1/src/lib/errors.js";

describe("validateEvidenceRef", () => {
  it("accepts an ordinary opaque reference token", () => {
    expect(() => validateEvidenceRef("dms://client-docs/passport-scan-2026-01-01.ref")).not.toThrow();
  });

  it("rejects a blank reference", () => {
    expect(() => validateEvidenceRef("   ")).toThrowError(Kyc1Error);
  });

  it("rejects a reference exceeding the maximum length", () => {
    expect(() => validateEvidenceRef("x".repeat(300))).toThrowError(Kyc1Error);
  });

  it("rejects an inline data: URI (never stores raw document content)", () => {
    expect(() => validateEvidenceRef("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toThrowError(Kyc1Error);
  });

  it("rejects a base64-shaped blob masquerading as a reference, even under the max-length cap (never stores raw uploaded bytes)", () => {
    // 155 raw bytes -> 208 base64 chars: over SUSPECT_INLINE_CONTENT_LENGTH (200) but comfortably
    // under MAX_EVIDENCE_REF_LENGTH (256) — isolates the base64-shape check from the length cap.
    const base64Blob = Buffer.from("x".repeat(155)).toString("base64");
    expect(base64Blob.length).toBeLessThan(256);
    expect(() => validateEvidenceRef(base64Blob)).toThrowError(Kyc1Error);
  });

  it("throws with code KYC1_EVIDENCE_INVALID", () => {
    try {
      validateEvidenceRef("");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Kyc1Error).code).toBe("KYC1_EVIDENCE_INVALID");
    }
  });

  it("does not reject an ordinary short reference token even though it happens to look base64-ish (below the length threshold)", () => {
    expect(() => validateEvidenceRef("abc123XYZ==")).not.toThrow();
  });
});

describe("applicableResultTypesForCaseType", () => {
  it("individual: document + identity, never entity", () => {
    const types = applicableResultTypesForCaseType("individual");
    expect(types).toEqual(["document", "identity"]);
  });

  it("authorised_party: document + identity, never entity", () => {
    const types = applicableResultTypesForCaseType("authorised_party");
    expect(types).toEqual(["document", "identity"]);
  });

  it("entity: document + entity, never identity", () => {
    const types = applicableResultTypesForCaseType("entity");
    expect(types).toEqual(["document", "entity"]);
  });
});

describe("DEFAULT_CHECKLIST_BY_CASE_TYPE", () => {
  it("defines a non-empty, all-required deterministic baseline for every case type", () => {
    for (const caseType of KYC_CASE_TYPES) {
      const entries = DEFAULT_CHECKLIST_BY_CASE_TYPE[caseType];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.required).toBe(true);
        expect(entry.document_type.length).toBeGreaterThan(0);
      }
    }
  });

  it("individual gets exactly one baseline document (identity_document)", () => {
    expect(DEFAULT_CHECKLIST_BY_CASE_TYPE.individual).toEqual([{ document_type: "identity_document", required: true }]);
  });
});
