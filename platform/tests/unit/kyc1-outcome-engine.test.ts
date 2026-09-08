/**
 * KYC-01 Phase 1 — the deterministic CDD outcome engine (services/kyc1/src/lib/outcome-engine.ts),
 * pure-function unit coverage, no DB required. Every branch of `computeCddOutcome` is exercised
 * directly here; tests/integration/kyc1-db.test.ts separately proves the route wiring (that a real
 * `POST .../compute-outcome` call persists exactly what this function returns).
 *
 * MED-1 fix coverage (independent Opus review of Phase 0+1): every `verificationResults` fixture
 * now carries a `verificationResultId`, and a dedicated block below proves the "latest result of a
 * type" selection is a genuine total order — same input SET always produces the same outcome
 * regardless of array order, and a `receivedAtUtc` tie resolves deterministically by
 * `verificationResultId` rather than by unspecified sort/array order.
 */
import { describe, expect, it } from "vitest";
import { computeCddOutcome } from "../../services/kyc1/src/lib/outcome-engine.js";

describe("KYC-01 computeCddOutcome (pure, deterministic)", () => {
  it("individual: required doc verified + identity pass -> pass", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("pass");
    expect(result.outcomeReason).toBe("all_required_checks_passed");
    expect(result.verificationScope).toEqual({
      case_type: "individual",
      required_documents_complete: true,
      identity_verified: true,
      entity_verified: null,
    });
  });

  it("individual: identity verification failed -> fail, regardless of document status", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "fail", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("fail");
    expect(result.outcomeReason).toBe("identity_verification_failed");
  });

  it("entity: entity verification failed -> fail", () => {
    const result = computeCddOutcome({
      caseType: "entity",
      checklistItems: [
        { required: true, status: "verified" },
        { required: true, status: "verified" },
      ],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "entity", resultStatus: "fail", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("fail");
    expect(result.outcomeReason).toBe("entity_verification_failed");
  });

  it("entity: required doc verified + entity pass -> pass", () => {
    const result = computeCddOutcome({
      caseType: "entity",
      checklistItems: [
        { required: true, status: "verified" },
        { required: true, status: "verified" },
      ],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "entity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("pass");
    expect(result.verificationScope.entity_verified).toBe(true);
    expect(result.verificationScope.identity_verified).toBeNull();
  });

  it("a rejected required document -> fail, even if identity later passes", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "rejected" }],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("fail");
    expect(result.outcomeReason).toBe("required_document_invalid_or_expired");
  });

  it("an expired required document -> fail", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "expired" }],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("fail");
    expect(result.outcomeReason).toBe("required_document_invalid_or_expired");
  });

  it("missing required document, nothing failed yet -> remediation_required, never pass", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "missing" }],
      verificationResults: [],
    });
    expect(result.outcomeStatus).toBe("remediation_required");
    expect(result.outcomeReason).toBe("required_evidence_incomplete");
  });

  it("no identity result submitted yet -> remediation_required, never pass by omission", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [],
    });
    expect(result.outcomeStatus).toBe("remediation_required");
  });

  it("optional (non-required) missing document does not block pass", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [
        { required: true, status: "verified" },
        { required: false, status: "missing" },
      ],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("pass");
  });

  it("authorised_party: treated the same as individual for identity applicability", () => {
    const result = computeCddOutcome({
      caseType: "authorised_party",
      checklistItems: [
        { required: true, status: "verified" },
        { required: true, status: "verified" },
      ],
      verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
    });
    expect(result.outcomeStatus).toBe("pass");
    expect(result.verificationScope.identity_verified).toBe(true);
    expect(result.verificationScope.entity_verified).toBeNull();
  });

  it("the LATEST verification result wins when multiple exist for the same result_type (distinct timestamps)", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "fail", receivedAtUtc: "2026-01-01T00:00:00Z" },
        { verificationResultId: "kyc1vr_2", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-02T00:00:00Z" },
      ],
    });
    expect(result.outcomeStatus).toBe("pass");
  });

  it("never returns 'pending' — always resolves deterministically to pass/fail/remediation_required", () => {
    const outcomes = new Set<string>();
    outcomes.add(computeCddOutcome({ caseType: "individual", checklistItems: [], verificationResults: [] }).outcomeStatus);
    outcomes.add(
      computeCddOutcome({
        caseType: "individual",
        checklistItems: [{ required: true, status: "verified" }],
        verificationResults: [{ verificationResultId: "kyc1vr_1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00Z" }],
      }).outcomeStatus,
    );
    outcomes.add(
      computeCddOutcome({
        caseType: "individual",
        checklistItems: [{ required: true, status: "rejected" }],
        verificationResults: [],
      }).outcomeStatus,
    );
    for (const status of outcomes) {
      expect(["pass", "fail", "remediation_required"]).toContain(status);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// MED-1 — deterministic tie-break under a shared receivedAtUtc (independent Opus review finding).
// ---------------------------------------------------------------------------------------------
describe("KYC-01 computeCddOutcome — MED-1 deterministic tie-break", () => {
  it("a CONFLICTING pass/fail pair sharing the SAME receivedAtUtc resolves deterministically by verificationResultId DESC — never depends on array order", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const passWins = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      ],
    });
    // "zzzz" > "aaaa" lexicographically, so the pass row wins the DESC tie-break.
    expect(passWins.outcomeStatus).toBe("pass");

    // Same two rows, REVERSED array order — must produce the IDENTICAL outcome.
    const passWinsReversed = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
      ],
    });
    expect(passWinsReversed.outcomeStatus).toBe(passWins.outcomeStatus);
    expect(passWinsReversed.outcomeReason).toBe(passWins.outcomeReason);
  });

  it("swapping which ID has the lexicographically-higher value swaps the winner — proves the tie-break is genuinely ID-driven, not a fixed 'first pass wins' shortcut", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const failWins = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
      ],
    });
    // Now "zzzz" (fail) has the higher ID, so fail wins.
    expect(failWins.outcomeStatus).toBe("fail");
    expect(failWins.outcomeReason).toBe("identity_verification_failed");
  });

  it("same input SET in every permutation of array order produces the IDENTICAL outcome (order-independence, not just two fixed orderings)", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const a = { verificationResultId: "kyc1vr_m", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied };
    const b = { verificationResultId: "kyc1vr_q", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied };
    const c = { verificationResultId: "kyc1vr_a", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied };

    const permutations = [
      [a, b, c],
      [c, b, a],
      [b, a, c],
      [b, c, a],
      [a, c, b],
      [c, a, b],
    ];

    const outcomes = permutations.map(
      (verificationResults) =>
        computeCddOutcome({ caseType: "individual", checklistItems: [{ required: true, status: "verified" }], verificationResults }).outcomeStatus,
    );
    // "kyc1vr_q" is the lexicographically-highest ID among the tied trio, and it's the pass row.
    for (const outcome of outcomes) expect(outcome).toBe("pass");
  });

  it("identical receivedAtUtc AND identical verificationResultId (the same row appearing twice) does not throw and is treated as a true tie (comparator returns 0)", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const dupe = { verificationResultId: "kyc1vr_dup", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied };
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [dupe, { ...dupe }],
    });
    expect(result.outcomeStatus).toBe("pass");
  });

  it("a genuine time difference still wins over the tie-break — receivedAtUtc is compared FIRST, verificationResultId only breaks a true tie", () => {
    const result = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        // Lexicographically-lower ID, but genuinely LATER timestamp — must still win.
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-02T00:00:00.000Z" },
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "fail", receivedAtUtc: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(result.outcomeStatus).toBe("pass");
  });

  it("tie detection is correct with Date OBJECTS, not just strings — node-postgres returns Date for timestamptz at runtime, and two distinct Date instances at the identical value must still be treated as a tie", () => {
    // Regression test for a real bug caught by tests/integration/kyc1-db.test.ts: `!==` on two
    // Date objects is always true (reference inequality) even at the identical instant, so a
    // comparator that used `!==` to detect a tie silently never reached its own tie-break branch
    // against real DB-returned values. `<`/`>` alone are immune (both coerce Date -> number).
    const instant = "2026-01-01T00:00:00.000Z";
    // Two SEPARATE Date instances representing the exact same millisecond — never the same object
    // reference (mirrors what `pg` hands back for two rows sharing a timestamptz value).
    const dateA = new Date(instant) as unknown as string;
    const dateB = new Date(instant) as unknown as string;
    expect(dateA).not.toBe(dateB); // distinct references, same value — the exact runtime shape

    const passWins = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "fail", receivedAtUtc: dateA },
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "pass", receivedAtUtc: dateB },
      ],
    });
    expect(passWins.outcomeStatus).toBe("pass");

    const failWins = computeCddOutcome({
      caseType: "individual",
      checklistItems: [{ required: true, status: "verified" }],
      verificationResults: [
        { verificationResultId: "kyc1vr_aaaa", resultType: "identity", resultStatus: "pass", receivedAtUtc: new Date(instant) as unknown as string },
        { verificationResultId: "kyc1vr_zzzz", resultType: "identity", resultStatus: "fail", receivedAtUtc: new Date(instant) as unknown as string },
      ],
    });
    expect(failWins.outcomeStatus).toBe("fail");
  });
});
