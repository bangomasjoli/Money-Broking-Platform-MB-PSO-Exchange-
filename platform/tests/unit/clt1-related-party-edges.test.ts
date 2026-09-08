/**
 * Unit tests for services/clt1/src/lib/related-party-edges.ts — pure self-reference/transition
 * validation logic, no DB required. Complements tests/integration/clt1-db.test.ts, which proves
 * node-existence validation and the full workflow end-to-end against a real Postgres.
 */
import { describe, expect, it } from "vitest";
import { AppError } from "@aix/foundation";
import {
  relatedPartyEdgeNotFound,
  relatedPartyNodeNotFound,
  safeRelatedPartyEdgeResponse,
  validateNotSelfReference,
  validateRelatedPartyEdgeTransition,
  type RelatedPartyEdgeRow,
} from "../../services/clt1/src/lib/related-party-edges.js";
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

describe("validateNotSelfReference", () => {
  it("passes when from and to reference different entities", () => {
    expect(() => validateNotSelfReference("client", "clt1client_1", "party", "clt1ap_1")).not.toThrow();
    expect(() => validateNotSelfReference("application", "clt1app_1", "application", "clt1app_2")).not.toThrow();
  });

  it("throws the shared foundation VALIDATION_ERROR (not a new CLT-01 code) when from and to are identical", () => {
    try {
      validateNotSelfReference("party", "clt1ap_1", "party", "clt1ap_1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("does not throw for the same entity_id across different entity_types (not a true self-reference)", () => {
    expect(() => validateNotSelfReference("client", "clt1x_1", "application", "clt1x_1")).not.toThrow();
  });
});

describe("validateRelatedPartyEdgeTransition", () => {
  it("allows update only from active", () => {
    expect(() => validateRelatedPartyEdgeTransition("active", "update")).not.toThrow();
    expectClt1Error(() => validateRelatedPartyEdgeTransition("inactive", "update"), "CLT1_RELATED_PARTY_EDGE_INVALID_STATE");
  });

  it("allows remove only from active", () => {
    expect(() => validateRelatedPartyEdgeTransition("active", "remove")).not.toThrow();
    expectClt1Error(() => validateRelatedPartyEdgeTransition("inactive", "remove"), "CLT1_RELATED_PARTY_EDGE_INVALID_STATE");
  });

  it("has no reactivation path — there is no 'activate' action at all, and inactive never allows update/remove", () => {
    for (const action of ["update", "remove"] as const) {
      expectClt1Error(() => validateRelatedPartyEdgeTransition("inactive", action), "CLT1_RELATED_PARTY_EDGE_INVALID_STATE");
    }
  });
});

describe("relatedPartyEdgeNotFound", () => {
  it("throws CLT1_RELATED_PARTY_EDGE_NOT_FOUND", () => {
    expectClt1Error(() => relatedPartyEdgeNotFound(), "CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
  });
});

describe("relatedPartyNodeNotFound", () => {
  it("throws CLT1_RELATED_PARTY_NODE_NOT_FOUND", () => {
    expectClt1Error(() => relatedPartyNodeNotFound(), "CLT1_RELATED_PARTY_NODE_NOT_FOUND");
  });
});

describe("safeRelatedPartyEdgeResponse", () => {
  const row: RelatedPartyEdgeRow = {
    related_party_edge_id: "clt1rpe_1",
    from_entity_type: "party",
    from_entity_id: "clt1ap_1",
    to_entity_type: "application",
    to_entity_id: "clt1app_1",
    relationship_type: "ubo",
    status: "active",
    evidence_ref: "evidence_ref_1",
    approval_id: "iam2appr_1",
    requested_by: "staff_1",
    version: 1,
    created_at_utc: "2026-01-01T00:00:00Z",
    updated_at_utc: "2026-01-01T00:00:00Z",
  };

  it("includes the internal-ID/enum fields — none of these are PII", () => {
    const safe = safeRelatedPartyEdgeResponse(row);
    expect(safe).toMatchObject({
      related_party_edge_id: "clt1rpe_1",
      from_entity_type: "party",
      from_entity_id: "clt1ap_1",
      to_entity_type: "application",
      to_entity_id: "clt1app_1",
      relationship_type: "ubo",
      status: "active",
      evidence_ref: "evidence_ref_1",
      version: 1,
    });
  });

  it("never includes requested_by or approval_id as a caller-facing field beyond what's explicitly projected", () => {
    const safe = safeRelatedPartyEdgeResponse(row);
    expect(safe).not.toHaveProperty("requested_by");
    expect(safe).not.toHaveProperty("approval_id");
  });
});
