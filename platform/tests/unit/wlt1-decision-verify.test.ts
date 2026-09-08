/**
 * WLT-01 Phase 4A-3 — pure post-token-auth decision-verification evaluator
 * (`lib/decision-verify.ts`'s `evaluateDecisionVerification`). No database, no HTTP. Token
 * authentication itself (`token_mismatch`) is NOT this evaluator's concern — see
 * `wlt1-decision-token.test.ts`'s own `tokenHashMatches` coverage; this file starts from the
 * assumption that token authentication has already succeeded.
 */
import { describe, expect, it } from "vitest";
import { evaluateDecisionVerification, type CurrentDestinationState, type DecisionVerifyInput, type StoredDecisionRow } from "../../services/wlt1/src/lib/decision-verify.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function decision(overrides: Partial<StoredDecisionRow> = {}): StoredDecisionRow {
  return {
    decisionId: "wlt1dec_1",
    tokenHash: "a".repeat(64),
    destinationId: "wlt1dest_1",
    clientId: "clt1client_1",
    requestedAction: "destination_use",
    status: "issued",
    expiresAtUtc: new Date(NOW.getTime() + 300_000),
    revocationEpoch: 0,
    pocChallengeId: "wlt1pocchal_1",
    ...overrides,
  };
}

function currentDestination(overrides: Partial<CurrentDestinationState> = {}): CurrentDestinationState {
  return {
    status: "active",
    revocationEpoch: 0,
    walletType: "unhosted",
    ...overrides,
  };
}

function input(overrides: Partial<DecisionVerifyInput> = {}): DecisionVerifyInput {
  return {
    callerClientId: "clt1client_1",
    callerDestinationId: "wlt1dest_1",
    callerRequestedAction: "destination_use",
    decision: decision(),
    currentDestination: currentDestination(),
    nowUtc: NOW,
    ...overrides,
  };
}

describe("WLT-01 Phase 4A-3 — evaluateDecisionVerification: happy path", () => {
  it("1. exact bindings, unexpired, not revoked, unhosted with genuine PoC -> eligible", () => {
    expect(evaluateDecisionVerification(input())).toEqual({ eligible: true });
  });

  it("2. hosted wallet with NULL poc_challenge_id -> eligible", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: null }), currentDestination: currentDestination({ walletType: "hosted" }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it("3. unknown wallet with genuine non-null PoC -> eligible", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: currentDestination({ walletType: "unknown" }) }));
    expect(result).toEqual({ eligible: true });
  });
});

describe("WLT-01 Phase 4A-3 — binding", () => {
  it("4. wrong client_id -> binding_mismatch", () => {
    const result = evaluateDecisionVerification(input({ callerClientId: "clt1client_WRONG" }));
    expect(result).toEqual({ eligible: false, reasonCode: "binding_mismatch" });
  });

  it("5. wrong destination_id -> binding_mismatch", () => {
    const result = evaluateDecisionVerification(input({ callerDestinationId: "wlt1dest_WRONG" }));
    expect(result).toEqual({ eligible: false, reasonCode: "binding_mismatch" });
  });

  it("6. wrong requested_action -> binding_mismatch", () => {
    const result = evaluateDecisionVerification(input({ callerRequestedAction: "something_else" }));
    expect(result).toEqual({ eligible: false, reasonCode: "binding_mismatch" });
  });
});

describe("WLT-01 Phase 4A-3 — expiry", () => {
  it("7. now < expires_at_utc -> not expired (falls through to other checks)", () => {
    const result = evaluateDecisionVerification(input({ decision: decision({ expiresAtUtc: new Date(NOW.getTime() + 1) }) }));
    expect(result).toEqual({ eligible: true });
  });

  it("8. now === expires_at_utc -> expired (inclusive boundary)", () => {
    const result = evaluateDecisionVerification(input({ decision: decision({ expiresAtUtc: NOW }) }));
    expect(result).toEqual({ eligible: false, reasonCode: "expired" });
  });

  it("9. now > expires_at_utc -> expired", () => {
    const result = evaluateDecisionVerification(input({ decision: decision({ expiresAtUtc: new Date(NOW.getTime() - 1) }) }));
    expect(result).toEqual({ eligible: false, reasonCode: "expired" });
  });
});

describe("WLT-01 Phase 4A-3 — revocation", () => {
  it("10. destination.status = 'revoked' -> revoked", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: currentDestination({ status: "revoked" }) }));
    expect(result).toEqual({ eligible: false, reasonCode: "revoked" });
  });

  it("11. revocation_epoch drifted from the decision's own bound epoch -> revoked", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ revocationEpoch: 0 }), currentDestination: currentDestination({ revocationEpoch: 1 }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "revoked" });
  });

  it("12. destination_status_version has no field in this evaluator's input at all — drift cannot possibly invalidate (structural proof, not merely a passing test)", () => {
    const keys = Object.keys(currentDestination());
    expect(keys).not.toContain("destinationStatusVersion");
    expect(keys).not.toContain("whitelistVersion");
  });

  it("13. only revocation_epoch drift invalidates — an active, non-revoked destination with the SAME epoch remains eligible even after a hypothetical version-bumping promotion (nothing in this evaluator reads version fields)", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: currentDestination({ status: "active", revocationEpoch: 0 }) }));
    expect(result).toEqual({ eligible: true });
  });
});

describe("WLT-01 Phase 4A-3 — status structural integrity", () => {
  it("14. status = 'issued' -> not rejected on this ground", () => {
    const result = evaluateDecisionVerification(input({ decision: decision({ status: "issued" }) }));
    expect(result).toEqual({ eligible: true });
  });

  it("15. a synthetic non-'issued' status (e.g. a future Phase 4B 'consumed') -> evidence_integrity_invalid (forward-safe guard; structurally unreachable via migration 057's own CHECK today)", () => {
    const result = evaluateDecisionVerification(input({ decision: decision({ status: "consumed" }) }));
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });
});

describe("WLT-01 Phase 4A-3 — PoC structural integrity (the addendum's frozen biconditional)", () => {
  it("16. hosted + poc_challenge_id NULL -> eligible (PoC not applicable)", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: null }), currentDestination: currentDestination({ walletType: "hosted" }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it("17. hosted + poc_challenge_id NON-NULL -> evidence_integrity_invalid (PoC structurally impossible for hosted)", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: "wlt1pocchal_shouldnotexist" }), currentDestination: currentDestination({ walletType: "hosted" }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("18. unhosted + genuine non-null challenge -> eligible", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: "wlt1pocchal_genuine" }), currentDestination: currentDestination({ walletType: "unhosted" }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it("19. unhosted + NULL -> evidence_integrity_invalid (PoC required but absent)", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: null }), currentDestination: currentDestination({ walletType: "unhosted" }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("20. unknown + genuine non-null challenge -> eligible", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: "wlt1pocchal_genuine" }), currentDestination: currentDestination({ walletType: "unknown" }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it("21. unknown + NULL -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: null }), currentDestination: currentDestination({ walletType: "unknown" }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });
});

describe("WLT-01 Phase 4A-3 — precedence (security-sensitive ordering: binding -> expiry -> revocation -> status/evidence-integrity)", () => {
  it("22. wrong binding AND expired -> binding_mismatch wins", () => {
    const result = evaluateDecisionVerification(
      input({ callerClientId: "clt1client_WRONG", decision: decision({ expiresAtUtc: new Date(NOW.getTime() - 1) }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "binding_mismatch" });
  });

  it("23. correct binding, expired AND revoked -> expired wins (expiry checked before revocation)", () => {
    const result = evaluateDecisionVerification(
      input({
        decision: decision({ expiresAtUtc: new Date(NOW.getTime() - 1), revocationEpoch: 0 }),
        currentDestination: currentDestination({ status: "revoked", revocationEpoch: 5 }),
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "expired" });
  });

  it("24. not expired, revoked AND evidence-integrity invalid -> revoked wins (revocation checked before status/PoC integrity)", () => {
    const result = evaluateDecisionVerification(
      input({
        decision: decision({ status: "issued", pocChallengeId: null }),
        currentDestination: currentDestination({ status: "revoked", walletType: "unhosted" }),
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "revoked" });
  });

  it("25. not expired, not revoked, only evidence-integrity invalid -> evidence_integrity_invalid (last in precedence, still correctly reached)", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ pocChallengeId: null }), currentDestination: currentDestination({ walletType: "unhosted", status: "active" }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("26. status-invalid AND PoC-invalid simultaneously -> still evidence_integrity_invalid (both collapse to the same reason code, no fifth code invented)", () => {
    const result = evaluateDecisionVerification(
      input({ decision: decision({ status: "consumed", pocChallengeId: null }), currentDestination: currentDestination({ walletType: "unhosted" }) }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });
});
