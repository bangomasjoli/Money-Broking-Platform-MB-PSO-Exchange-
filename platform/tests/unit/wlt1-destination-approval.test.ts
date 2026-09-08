/**
 * WLT-01 Phase 4A-1 — pure evaluation logic (`lib/destination-approval.ts`): approval-gate
 * evaluation, approval-payload construction, fingerprint computation, version-drift detection. No
 * database, no HTTP.
 */
import { describe, expect, it } from "vitest";
import {
  APPROVAL_ELIGIBLE_STATUS,
  buildApprovalPayload,
  computeApprovalFingerprint,
  evaluateApprovalGates,
  hasVersionDrift,
  type DestinationSnapshot,
  type LatestScreeningSnapshot,
} from "../../services/wlt1/src/lib/destination-approval.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function screening(overrides: Partial<LatestScreeningSnapshot> = {}): LatestScreeningSnapshot {
  return { screeningResultId: "wlt1screen_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() + 3600_000), ...overrides };
}

function gateInput(overrides: Partial<{ status: string; walletType: string; screening: LatestScreeningSnapshot | null; pocVerified: boolean; nowUtc: Date }> = {}) {
  return { status: APPROVAL_ELIGIBLE_STATUS, walletType: "unhosted", screening: screening(), pocVerified: true, nowUtc: NOW, ...overrides };
}

describe("WLT-01 Phase 4A-1 — evaluateApprovalGates", () => {
  it("1. pending_review + clear + fresh screening + verified PoC (unhosted) -> eligible", () => {
    const result = evaluateApprovalGates(gateInput());
    expect(result).toMatchObject({ eligible: true, screeningResultId: "wlt1screen_1" });
  });

  it("2. hosted-equivalent wallet type not requiring PoC -> eligible without pocVerified", () => {
    // 'hosted' is the one wallet_type isPocSupportedWalletType() returns false for.
    const result = evaluateApprovalGates(gateInput({ walletType: "hosted", pocVerified: false }));
    expect(result).toMatchObject({ eligible: true });
  });

  for (const status of ["draft", "pending_screening", "approved_pending_cooling", "active", "revoked"]) {
    it(`3. destination status '${status}' -> not eligible / destination_not_pending_review`, () => {
      const result = evaluateApprovalGates(gateInput({ status }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "destination_not_pending_review" });
    });
  }

  it("4. no screening result at all -> not eligible / screening_missing", () => {
    const result = evaluateApprovalGates(gateInput({ screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_missing" });
  });

  for (const riskStatus of ["review_required", "high_risk", "hit", "pending"]) {
    it(`5. screening risk_status '${riskStatus}' -> not eligible / screening_not_clear (adverse screening can never be approved)`, () => {
      const result = evaluateApprovalGates(gateInput({ screening: screening({ riskStatus }) }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
    });
  }

  it("6. screening exactly expired (now === valid_until_utc) -> not eligible / screening_expired", () => {
    const result = evaluateApprovalGates(gateInput({ screening: screening({ validUntilUtc: NOW }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_expired" });
  });

  it("6b. screening one millisecond past valid_until_utc -> not eligible / screening_expired", () => {
    const result = evaluateApprovalGates(gateInput({ screening: screening({ validUntilUtc: new Date(NOW.getTime() - 1) }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_expired" });
  });

  it("6c. screening one millisecond BEFORE valid_until_utc -> still eligible (inclusive boundary)", () => {
    const result = evaluateApprovalGates(gateInput({ screening: screening({ validUntilUtc: new Date(NOW.getTime() + 1) }) }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("7. null valid_until_utc (never expires) -> eligible regardless of now", () => {
    const result = evaluateApprovalGates(gateInput({ screening: screening({ validUntilUtc: null }), nowUtc: new Date(NOW.getTime() + 999_999_999) }));
    expect(result).toMatchObject({ eligible: true });
  });

  it("8. missing PoC for unhosted wallet -> not eligible / proof_of_control_missing (C-4A1-1)", () => {
    const result = evaluateApprovalGates(gateInput({ walletType: "unhosted", pocVerified: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "proof_of_control_missing" });
  });

  it("9. missing PoC for unknown wallet -> not eligible / proof_of_control_missing", () => {
    const result = evaluateApprovalGates(gateInput({ walletType: "unknown", pocVerified: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "proof_of_control_missing" });
  });

  it("10. destination status is checked BEFORE screening (precedence: wrong status wins even with bad screening too)", () => {
    const result = evaluateApprovalGates(gateInput({ status: "draft", screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "destination_not_pending_review" });
  });

  it("11. no accidental eligible: every non-eligible input sweep returns eligible:false", () => {
    const inputs = [
      gateInput({ status: "draft" }),
      gateInput({ status: "revoked" }),
      gateInput({ screening: null }),
      gateInput({ screening: screening({ riskStatus: "hit" }) }),
      gateInput({ screening: screening({ validUntilUtc: new Date(0) }) }),
      gateInput({ walletType: "unknown", pocVerified: false }),
    ];
    for (const input of inputs) {
      expect(evaluateApprovalGates(input).eligible, JSON.stringify(input)).toBe(false);
    }
  });
});

describe("WLT-01 Phase 4A-1 — buildApprovalPayload / computeApprovalFingerprint", () => {
  const snapshot: DestinationSnapshot = {
    destinationId: "wlt1dest_1",
    clientId: "clt1client_1",
    status: "pending_review",
    destinationStatusVersion: 2,
    whitelistVersion: 0,
    naturalKeyHash: "hash_abc",
    walletType: "unhosted",
  };

  it("12. payload contains exactly the frozen five fields, no more, no less", () => {
    const payload = buildApprovalPayload(snapshot, "wlt1screen_1");
    expect(Object.keys(payload).sort()).toEqual(["client_id", "destination_id", "natural_key_hash", "screening_result_id", "whitelist_version"].sort());
  });

  it("13. payload values are sourced from the snapshot/screeningResultId exactly, never destination_status_version or PoC id", () => {
    const payload = buildApprovalPayload(snapshot, "wlt1screen_1");
    expect(payload).toEqual({
      destination_id: "wlt1dest_1",
      client_id: "clt1client_1",
      natural_key_hash: "hash_abc",
      screening_result_id: "wlt1screen_1",
      whitelist_version: 0,
    });
  });

  it("14. fingerprint is deterministic for the same payload", () => {
    const payload = buildApprovalPayload(snapshot, "wlt1screen_1");
    expect(computeApprovalFingerprint(payload)).toBe(computeApprovalFingerprint({ ...payload }));
  });

  it("15. fingerprint changes when whitelist_version changes (a later active-promotion bump invalidates a stale approval fingerprint)", () => {
    const a = computeApprovalFingerprint(buildApprovalPayload(snapshot, "wlt1screen_1"));
    const b = computeApprovalFingerprint(buildApprovalPayload({ ...snapshot, whitelistVersion: 1 }, "wlt1screen_1"));
    expect(a).not.toBe(b);
  });

  it("16. fingerprint changes when screening_result_id changes (a new screening invalidates a stale approval fingerprint)", () => {
    const a = computeApprovalFingerprint(buildApprovalPayload(snapshot, "wlt1screen_1"));
    const b = computeApprovalFingerprint(buildApprovalPayload(snapshot, "wlt1screen_2"));
    expect(a).not.toBe(b);
  });

  it("17. fingerprint is INDEPENDENT of destination_status_version (not a fingerprint field)", () => {
    const a = computeApprovalFingerprint(buildApprovalPayload(snapshot, "wlt1screen_1"));
    const b = computeApprovalFingerprint(buildApprovalPayload({ ...snapshot, destinationStatusVersion: 99 }, "wlt1screen_1"));
    expect(a).toBe(b);
  });

  it("18. fingerprint format: sha256:-prefixed hex digest (shared foundation fingerprint())", () => {
    const fp = computeApprovalFingerprint(buildApprovalPayload(snapshot, "wlt1screen_1"));
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("WLT-01 Phase 4A-1 — hasVersionDrift", () => {
  it("19. identical versions -> no drift", () => {
    expect(hasVersionDrift({ destinationStatusVersion: 2, whitelistVersion: 0 }, { destinationStatusVersion: 2, whitelistVersion: 0 })).toBe(false);
  });

  it("20. destination_status_version changed -> drift", () => {
    expect(hasVersionDrift({ destinationStatusVersion: 2, whitelistVersion: 0 }, { destinationStatusVersion: 3, whitelistVersion: 0 })).toBe(true);
  });

  it("21. whitelist_version changed -> drift", () => {
    expect(hasVersionDrift({ destinationStatusVersion: 2, whitelistVersion: 0 }, { destinationStatusVersion: 2, whitelistVersion: 1 })).toBe(true);
  });

  it("22. both changed -> drift", () => {
    expect(hasVersionDrift({ destinationStatusVersion: 2, whitelistVersion: 0 }, { destinationStatusVersion: 3, whitelistVersion: 1 })).toBe(true);
  });
});
