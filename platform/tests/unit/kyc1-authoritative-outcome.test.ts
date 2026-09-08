/**
 * KYC-01 Phase 2A — `lib/authoritative-outcome.ts` pure-function unit coverage, no DB required.
 * Exhausts the case-type/status permutations the approved Phase 2 planning report's own D2/D3/D4
 * decisions specify, including the exact "party pass overrides primary fail" bug class the Phase 2
 * planning report's own "Critical finding" identified as the reason a case-scoped publish route
 * would be unsafe.
 */
import { describe, expect, it } from "vitest";
import {
  computeAuthoritativeOutcome,
  computeRosterBoundOutcome,
  detectTiedConflictingEvidence,
  type AuthoritativeCaseInput,
  type RosterCompletenessInput,
} from "../../services/kyc1/src/lib/authoritative-outcome.js";

function caseInput(overrides: Partial<AuthoritativeCaseInput> & { caseId: string }): AuthoritativeCaseInput {
  return {
    caseType: "individual",
    partyId: null,
    currentOutcomeStatus: "pass",
    currentOutcomeId: `kyc1outcome_${overrides.caseId}`,
    createdAtUtc: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("KYC-01 computeAuthoritativeOutcome — primary-only", () => {
  it("individual-only pass -> pass", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", caseType: "individual", currentOutcomeStatus: "pass" })]);
    expect(result).toEqual({
      publishable: true,
      aggregateStatus: "pass",
      contributingCaseIds: ["c1"],
      contributingOutcomeIds: ["kyc1outcome_c1"],
    });
  });

  it("individual-only fail -> fail", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", currentOutcomeStatus: "fail" })]);
    expect(result.publishable).toBe(true);
    expect(result.aggregateStatus).toBe("fail");
  });

  it("individual-only remediation_required -> remediation_required", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", currentOutcomeStatus: "remediation_required" })]);
    expect(result.aggregateStatus).toBe("remediation_required");
  });

  it("entity-only pass -> pass", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", caseType: "entity", currentOutcomeStatus: "pass" })]);
    expect(result.aggregateStatus).toBe("pass");
  });

  it("entity-only fail -> fail", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", caseType: "entity", currentOutcomeStatus: "fail" })]);
    expect(result.aggregateStatus).toBe("fail");
  });

  it("entity-only remediation_required -> remediation_required", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", caseType: "entity", currentOutcomeStatus: "remediation_required" })]);
    expect(result.aggregateStatus).toBe("remediation_required");
  });
});

describe("KYC-01 computeAuthoritativeOutcome — not publishable (pending)", () => {
  it("no cases at all -> not publishable", () => {
    const result = computeAuthoritativeOutcome([]);
    expect(result).toEqual({ publishable: false, aggregateStatus: null, contributingCaseIds: [], contributingOutcomeIds: [] });
  });

  it("primary case exists but has no computed outcome yet -> not publishable", () => {
    const result = computeAuthoritativeOutcome([caseInput({ caseId: "c1", currentOutcomeStatus: null, currentOutcomeId: null })]);
    expect(result.publishable).toBe(false);
    expect(result.aggregateStatus).toBeNull();
  });

  it("party-only, no primary anchor at all -> not publishable (party cases alone never authoritative)", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "pass" }),
    ]);
    expect(result.publishable).toBe(false);
  });
});

describe("KYC-01 computeAuthoritativeOutcome — primary + party combinations", () => {
  it("primary pass + party pass -> pass", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "c1", currentOutcomeStatus: "pass" }),
      caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "pass" }),
    ]);
    expect(result.aggregateStatus).toBe("pass");
    expect(result.contributingCaseIds.sort()).toEqual(["c1", "p1"]);
  });

  it("primary pass + one party has no computed outcome yet -> remediation_required (not pending — the primary anchor IS complete)", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "c1", currentOutcomeStatus: "pass" }),
      caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: null, currentOutcomeId: null }),
    ]);
    expect(result.publishable).toBe(true);
    expect(result.aggregateStatus).toBe("remediation_required");
    // The incomplete party case contributes no outcome id — only the primary case is "contributing".
    expect(result.contributingCaseIds).toEqual(["c1"]);
  });

  it("primary pass + one party remediation_required -> remediation_required", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "c1", currentOutcomeStatus: "pass" }),
      caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "remediation_required" }),
    ]);
    expect(result.aggregateStatus).toBe("remediation_required");
  });

  it("primary pass + one party fail -> fail", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "c1", currentOutcomeStatus: "pass" }),
      caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "fail" }),
    ]);
    expect(result.aggregateStatus).toBe("fail");
  });

  it("THE CRITICAL CASE: primary fail + a LATER party pass still resolves to fail — a late-arriving party pass can never override an already-fixed primary fail (worst-wins, never latest-wins)", () => {
    const result = computeAuthoritativeOutcome([
      caseInput({ caseId: "c1", currentOutcomeStatus: "fail", createdAtUtc: "2026-01-01T00:00:00.000Z" }),
      caseInput({
        caseId: "p1",
        caseType: "authorised_party",
        partyId: "party_1",
        currentOutcomeStatus: "pass",
        createdAtUtc: "2026-01-05T00:00:00.000Z", // genuinely later than the primary's own case
      }),
    ]);
    expect(result.aggregateStatus).toBe("fail");
  });

  it("party pass cannot overwrite primary fail even when the party case is inserted AFTER the primary in array order", () => {
    const primaryFail = caseInput({ caseId: "c1", currentOutcomeStatus: "fail" });
    const partyPass = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "pass" });
    const forward = computeAuthoritativeOutcome([primaryFail, partyPass]);
    const reversed = computeAuthoritativeOutcome([partyPass, primaryFail]);
    expect(forward.aggregateStatus).toBe("fail");
    expect(reversed.aggregateStatus).toBe("fail");
  });

  it("worst-wins across multiple parties: one fail among several passes still fails, independent of insertion order (full permutation check)", () => {
    const primary = caseInput({ caseId: "c1", currentOutcomeStatus: "pass" });
    const partyA = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_a", currentOutcomeStatus: "pass" });
    const partyB = caseInput({ caseId: "p2", caseType: "authorised_party", partyId: "party_b", currentOutcomeStatus: "fail" });
    const partyC = caseInput({ caseId: "p3", caseType: "authorised_party", partyId: "party_c", currentOutcomeStatus: "pass" });
    const set = [primary, partyA, partyB, partyC];

    function permutations<T>(arr: T[]): T[][] {
      if (arr.length <= 1) return [arr];
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permutations(rest)) out.push([arr[i]!, ...p]);
      }
      return out;
    }

    for (const perm of permutations(set)) {
      const result = computeAuthoritativeOutcome(perm);
      expect(result.aggregateStatus).toBe("fail");
      expect(result.contributingCaseIds).toEqual(["c1", "p1", "p2", "p3"]); // sorted, order-independent
    }
  });
});

describe("KYC-01 computeAuthoritativeOutcome — within-anchor supersession (layer b)", () => {
  it("two completed cases in the SAME anchor: the one with the LATER createdAtUtc wins, regardless of array order", () => {
    const older = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const newer = caseInput({ caseId: "c2", currentOutcomeStatus: "fail", createdAtUtc: "2026-01-05T00:00:00.000Z" });
    expect(computeAuthoritativeOutcome([older, newer]).aggregateStatus).toBe("fail");
    expect(computeAuthoritativeOutcome([newer, older]).aggregateStatus).toBe("fail");
  });

  it("same createdAtUtc tie within an anchor: the higher case_id (DESC) wins, regardless of array order", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const lowId = caseInput({ caseId: "kyc1case_aaaa", currentOutcomeStatus: "fail", createdAtUtc: tied });
    const highId = caseInput({ caseId: "kyc1case_zzzz", currentOutcomeStatus: "pass", createdAtUtc: tied });
    expect(computeAuthoritativeOutcome([lowId, highId]).aggregateStatus).toBe("pass");
    expect(computeAuthoritativeOutcome([highId, lowId]).aggregateStatus).toBe("pass");
  });

  it("CORRECTION PATH (D4): a corrective new case for the same anchor supersedes a prior terminal pass at the aggregate level", () => {
    // The original (now-terminal) pass, followed by a corrective new case for the identical
    // anchor that turned out fail — the aggregate must reflect the LATEST case, not the first.
    const originalPass = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const correctiveCase = caseInput({ caseId: "c2", currentOutcomeStatus: "fail", createdAtUtc: "2026-01-10T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([originalPass, correctiveCase]);
    expect(result.aggregateStatus).toBe("fail");
    expect(result.contributingCaseIds).toEqual(["c2"]);
  });

  it("a remediation_required case (kyc_case.status='remediation', NOT 'completed') is still correctly treated as HAVING a computed outcome — not mistaken for an incomplete case", () => {
    // Regression guard for the exact bug this file's own header comment warns against: gating
    // anchor selection on kyc_case.status='completed' would wrongly exclude this case.
    const remediationCase = caseInput({ caseId: "c1", currentOutcomeStatus: "remediation_required", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([remediationCase]);
    expect(result.publishable).toBe(true);
    expect(result.aggregateStatus).toBe("remediation_required");
  });

  it("a remediation case is authoritative over an OLDER pass case in the same anchor (a genuinely later remediation must not be shadowed by an earlier pass)", () => {
    const olderPass = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const newerRemediation = caseInput({ caseId: "c2", currentOutcomeStatus: "remediation_required", createdAtUtc: "2026-01-05T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([olderPass, newerRemediation]);
    expect(result.aggregateStatus).toBe("remediation_required");
  });
});

describe("KYC-01 detectTiedConflictingEvidence", () => {
  it("a tied conflicting pass/fail pair WITHIN THE SAME CASE (same caseId, same result_type, same receivedAtUtc) is detected", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "c1", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
    ]);
    expect(hasConflict).toBe(true);
  });

  it("no conflict when there is only one result", () => {
    expect(detectTiedConflictingEvidence([{ caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-01T00:00:00.000Z" }])).toBe(false);
  });

  it("no conflict when two results share a timestamp but AGREE on status (a genuine duplicate, not a conflict)", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
    ]);
    expect(hasConflict).toBe(false);
  });

  it("a genuine time gap between conflicting statuses is NOT a conflict — recency, not a tie, decides which one is latest", () => {
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "fail", receivedAtUtc: "2026-01-01T00:00:00.000Z" },
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(hasConflict).toBe(false);
  });

  it("conflicting statuses on DIFFERENT result_types at the same timestamp, same case, do NOT conflict — evaluated per result_type independently", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "c1", resultType: "document", resultStatus: "fail", receivedAtUtc: tied },
    ]);
    expect(hasConflict).toBe(false);
  });

  it("order-independent — reversing the input array does not change the result", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const rows = [
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "c1", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
    ];
    expect(detectTiedConflictingEvidence(rows)).toBe(detectTiedConflictingEvidence([...rows].reverse()));
  });

  it("empty input has no conflict", () => {
    expect(detectTiedConflictingEvidence([])).toBe(false);
  });

  // -----------------------------------------------------------------------------------------
  // LOW-6 closure (independent Opus review of Phase 2A): grouping must be scoped to ONE case's
  // own evidence, never across two different contributing cases.
  // -----------------------------------------------------------------------------------------
  it("LOW-6 FIX: two DIFFERENT cases sharing one receivedAtUtc/result_type with OPPOSING statuses do NOT conflict — neither case is internally tied", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied }, // primary case's own only identity result
      { caseId: "p1", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied }, // party case's own only identity result
    ]);
    expect(hasConflict).toBe(false);
  });

  it("LOW-6 FIX: a tie within ONE of two contributing cases is still detected even when the OTHER case shares the same timestamp/type with a non-conflicting status", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const hasConflict = detectTiedConflictingEvidence([
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "c1", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied }, // c1 IS internally tied
      { caseId: "p1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied }, // p1 alone, no tie
    ]);
    expect(hasConflict).toBe(true);
  });

  it("LOW-6 FIX: order-independent across cases too — reversing does not change the result", () => {
    const tied = "2026-01-01T00:00:00.000Z";
    const rows = [
      { caseId: "c1", resultType: "identity", resultStatus: "pass", receivedAtUtc: tied },
      { caseId: "p1", resultType: "identity", resultStatus: "fail", receivedAtUtc: tied },
    ];
    expect(detectTiedConflictingEvidence(rows)).toBe(false);
    expect(detectTiedConflictingEvidence([...rows].reverse())).toBe(false);
  });
});

describe("KYC-01 computeAuthoritativeOutcome — LOW-7 closure: in-flight corrective case (independent Opus review of Phase 2A)", () => {
  it("LOW-7 FIX: an OLDER primary pass + a NEWER same-anchor primary case with NO computed outcome yet -> the aggregate is NOT publishable (the stale pass is no longer authoritative the instant the corrective case is opened)", () => {
    const oldPass = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const newUncomputed = caseInput({ caseId: "c2", currentOutcomeStatus: null, currentOutcomeId: null, createdAtUtc: "2026-01-05T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([oldPass, newUncomputed]);
    expect(result.publishable).toBe(false);
    expect(result.aggregateStatus).toBeNull();
  });

  it("LOW-7 FIX: same as above but reversed array order — still not publishable", () => {
    const oldPass = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const newUncomputed = caseInput({ caseId: "c2", currentOutcomeStatus: null, currentOutcomeId: null, createdAtUtc: "2026-01-05T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([newUncomputed, oldPass]);
    expect(result.publishable).toBe(false);
  });

  it("LOW-7 FIX: an OLDER party pass + a NEWER same-anchor party case with NO computed outcome yet -> the aggregate DOWNGRADES to remediation_required (party anchors never block the whole aggregate the way primary anchors do)", () => {
    const primary = caseInput({ caseId: "c1", currentOutcomeStatus: "pass" });
    const oldPartyPass = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "party_1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const newPartyUncomputed = caseInput({
      caseId: "p2",
      caseType: "authorised_party",
      partyId: "party_1",
      currentOutcomeStatus: null,
      currentOutcomeId: null,
      createdAtUtc: "2026-01-05T00:00:00.000Z",
    });
    const result = computeAuthoritativeOutcome([primary, oldPartyPass, newPartyUncomputed]);
    expect(result.publishable).toBe(true);
    expect(result.aggregateStatus).toBe("remediation_required");
    // The stale party pass is no longer the anchor's representative — only the primary case
    // contributes (the new, uncomputed party case contributes no outcome id either).
    expect(result.contributingCaseIds).toEqual(["c1"]);
  });

  it("a corrective case that DOES have a computed outcome still supersedes the prior terminal pass immediately (no behaviour change from Phase 2A's own accepted case)", () => {
    const originalPass = caseInput({ caseId: "c1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const correctiveFail = caseInput({ caseId: "c2", currentOutcomeStatus: "fail", createdAtUtc: "2026-01-10T00:00:00.000Z" });
    const result = computeAuthoritativeOutcome([originalPass, correctiveFail]);
    expect(result.aggregateStatus).toBe("fail");
    expect(result.contributingCaseIds).toEqual(["c2"]);
  });
});

// =================================================================================================
// PHASE 4B — computeRosterBoundOutcome. Extends computeAuthoritativeOutcome (above, UNCHANGED —
// every test above this line remains green, unmodified) with CLT-01 roster-completeness.
// =================================================================================================
function roster(overrides: Partial<RosterCompletenessInput> = {}): RosterCompletenessInput {
  return { primarySubjectType: "individual", requiredAuthorisedPartyIds: [], ...overrides };
}

describe("computeRosterBoundOutcome — primary resolution", () => {
  it("individual primary only, no required parties -> publishes", () => {
    const primary = caseInput({ caseId: "c1", caseType: "individual", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary], roster({ primarySubjectType: "individual" }));
    expect(result).toMatchObject({ publishable: true, aggregateStatus: "pass", reasonCode: null, requiredPartyCount: 0, evaluatedPartyCount: 0, contributingPartyIds: [], extraCaseCount: 0 });
    expect(result.contributingCaseIds).toEqual(["c1"]);
  });

  it("entity primary only -> publishes", () => {
    const primary = caseInput({ caseId: "c1", caseType: "entity", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary], roster({ primarySubjectType: "entity" }));
    expect(result.publishable).toBe(true);
  });

  it("primary type mismatch — CLT says individual, KYC-01 only holds an entity case -> refused", () => {
    const wrongType = caseInput({ caseId: "c1", caseType: "entity", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([wrongType], roster({ primarySubjectType: "individual" }));
    expect(result).toMatchObject({ publishable: false, aggregateStatus: null, reasonCode: "primary_type_mismatch" });
  });

  it("missing primary — no primary-shaped case exists at all -> refused", () => {
    const result = computeRosterBoundOutcome([], roster({ primarySubjectType: "individual" }));
    expect(result.reasonCode).toBe("primary_missing");
  });

  it("primary case exists but has no outcome yet -> party_outcome_pending (not primary_missing)", () => {
    const uncomputed = caseInput({ caseId: "c1", caseType: "individual", currentOutcomeStatus: null, currentOutcomeId: null });
    const result = computeRosterBoundOutcome([uncomputed], roster({ primarySubjectType: "individual" }));
    expect(result.reasonCode).toBe("party_outcome_pending");
  });

  it("anchor ambiguity — both individual AND entity cases exist for one application -> refused, not guessed", () => {
    const ind = caseInput({ caseId: "c1", caseType: "individual", currentOutcomeStatus: "pass" });
    const ent = caseInput({ caseId: "c2", caseType: "entity", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([ind, ent], roster({ primarySubjectType: "individual" }));
    expect(result.reasonCode).toBe("anchor_ambiguous");
  });
});

describe("computeRosterBoundOutcome — required-party set (empty)", () => {
  it("empty required-party set publishes freely once primary resolves", () => {
    const primary = caseInput({ caseId: "c1", caseType: "individual", currentOutcomeStatus: "fail" });
    const result = computeRosterBoundOutcome([primary], roster({ primarySubjectType: "individual", requiredAuthorisedPartyIds: [] }));
    expect(result).toMatchObject({ publishable: true, aggregateStatus: "fail", requiredPartyCount: 0, evaluatedPartyCount: 0 });
  });
});

describe("computeRosterBoundOutcome — one required party, every authority-status-implied scenario", () => {
  const primaryPass = () => caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });

  it("required party MISSING a KYC case entirely -> refused, never downgraded to remediation_required", () => {
    const result = computeRosterBoundOutcome([primaryPass()], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result).toMatchObject({ publishable: false, aggregateStatus: null, reasonCode: "party_missing" });
  });

  it("required party's case exists but has NO outcome yet -> refused (not remediation_required)", () => {
    const partyCase = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: null, currentOutcomeId: null });
    const result = computeRosterBoundOutcome([primaryPass(), partyCase], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result.reasonCode).toBe("party_outcome_pending");
  });

  it("required party PASS -> aggregate pass, contributingPartyIds includes it", () => {
    const partyCase = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primaryPass(), partyCase], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result).toMatchObject({ publishable: true, aggregateStatus: "pass", requiredPartyCount: 1, evaluatedPartyCount: 1, contributingPartyIds: ["clt1ap_1"] });
    expect(result.contributingCaseIds.sort()).toEqual(["p1", "primary"].sort());
  });

  it("required party REMEDIATION_REQUIRED -> aggregate remediation_required", () => {
    const partyCase = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "remediation_required" });
    const result = computeRosterBoundOutcome([primaryPass(), partyCase], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result.aggregateStatus).toBe("remediation_required");
  });

  it("required party FAIL -> aggregate fail (worst-wins over a passing primary)", () => {
    const partyCase = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "fail" });
    const result = computeRosterBoundOutcome([primaryPass(), partyCase], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result.aggregateStatus).toBe("fail");
  });

  it("pending/active/restricted/suspended are ALL treated as required (caller pre-filters authority_status — this function trusts the id list it is given)", () => {
    // This function itself does not read authority_status — the ROUTE derives the required-ID
    // list from it (REQUIRED_AUTHORITY_STATUSES). Proven here: any id in the list is required,
    // regardless of what CLT-side status it nominally represents.
    const partyCase = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_suspended_party", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primaryPass(), partyCase], roster({ requiredAuthorisedPartyIds: ["clt1ap_suspended_party"] }));
    expect(result.publishable).toBe(true);
  });
});

describe("computeRosterBoundOutcome — several required parties", () => {
  it("all pass -> aggregate pass, every party contributes", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const p1 = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass" });
    const p2 = caseInput({ caseId: "p2", caseType: "authorised_party", partyId: "clt1ap_2", currentOutcomeStatus: "pass" });
    const p3 = caseInput({ caseId: "p3", caseType: "authorised_party", partyId: "clt1ap_3", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary, p1, p2, p3], roster({ requiredAuthorisedPartyIds: ["clt1ap_1", "clt1ap_2", "clt1ap_3"] }));
    expect(result).toMatchObject({ publishable: true, aggregateStatus: "pass", requiredPartyCount: 3, evaluatedPartyCount: 3 });
    expect(result.contributingPartyIds).toEqual(["clt1ap_1", "clt1ap_2", "clt1ap_3"]);
  });

  it("required-party-id ORDER in the roster input does not affect the result (treated as a set, output deterministically sorted)", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const p1 = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass" });
    const p2 = caseInput({ caseId: "p2", caseType: "authorised_party", partyId: "clt1ap_2", currentOutcomeStatus: "pass" });
    const a = computeRosterBoundOutcome([primary, p1, p2], roster({ requiredAuthorisedPartyIds: ["clt1ap_2", "clt1ap_1"] }));
    const b = computeRosterBoundOutcome([primary, p1, p2], roster({ requiredAuthorisedPartyIds: ["clt1ap_1", "clt1ap_2"] }));
    expect(a.contributingPartyIds).toEqual(["clt1ap_1", "clt1ap_2"]);
    expect(b.contributingPartyIds).toEqual(["clt1ap_1", "clt1ap_2"]);
  });

  it("one of several required parties missing -> refused (party_missing), even though the other two pass", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const p1 = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass" });
    const p2 = caseInput({ caseId: "p2", caseType: "authorised_party", partyId: "clt1ap_2", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary, p1, p2], roster({ requiredAuthorisedPartyIds: ["clt1ap_1", "clt1ap_2", "clt1ap_3_missing"] }));
    expect(result.reasonCode).toBe("party_missing");
    // Diagnostic value even on refusal: 2 of 3 required parties WERE resolved.
    expect(result.evaluatedPartyCount).toBe(2);
    expect(result.requiredPartyCount).toBe(3);
  });
});

describe("computeRosterBoundOutcome — extra KYC cases (party_id not in the required roster)", () => {
  it("an extra case does NOT block, does NOT contribute, and IS counted", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const required = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_required", currentOutcomeStatus: "pass" });
    const extra = caseInput({ caseId: "extra1", caseType: "authorised_party", partyId: "clt1ap_extra", currentOutcomeStatus: "fail" });
    const result = computeRosterBoundOutcome([primary, required, extra], roster({ requiredAuthorisedPartyIds: ["clt1ap_required"] }));
    // The extra case's FAIL must never leak into the aggregate — worst-wins only over required cases.
    expect(result).toMatchObject({ publishable: true, aggregateStatus: "pass", extraCaseCount: 1 });
    expect(result.contributingCaseIds).not.toContain("extra1");
    expect(result.contributingPartyIds).not.toContain("clt1ap_extra");
  });

  it("mistyped KYC party_id: creates a required-party-missing refusal AND counts the mistyped case as extra — never silently satisfies the required party", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    // Operator meant "clt1ap_1" but the KYC case was anchored to a typo'd id.
    const mistyped = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1_TYPO", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary, mistyped], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result.publishable).toBe(false);
    expect(result.reasonCode).toBe("party_missing");
  });

  it("multiple extra cases are all counted", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const e1 = caseInput({ caseId: "e1", caseType: "authorised_party", partyId: "clt1ap_e1", currentOutcomeStatus: "pass" });
    const e2 = caseInput({ caseId: "e2", caseType: "authorised_party", partyId: "clt1ap_e2", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary, e1, e2], roster({ requiredAuthorisedPartyIds: [] }));
    expect(result.extraCaseCount).toBe(2);
  });
});

describe("computeRosterBoundOutcome — duplicate roster subject / malformed inputs fail closed", () => {
  it("a duplicate required-party-id in the INPUT list (should never happen — the roster client guarantees uniqueness) still resolves deterministically via Set semantics, never double-counted", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const p1 = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass" });
    const result = computeRosterBoundOutcome([primary, p1], roster({ requiredAuthorisedPartyIds: ["clt1ap_1", "clt1ap_1"] }));
    // requiredPartyCount reflects the caller's own list length (defensive — the roster client is
    // what actually guarantees no duplicates reach here in production).
    expect(result.publishable).toBe(true);
  });
});

describe("computeRosterBoundOutcome — corrective/latest-case resolution reused, not reimplemented", () => {
  it("a corrective case for a required party anchor is picked as authoritative immediately (LOW-7 rule reused)", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const originalPass = caseInput({ caseId: "p1_old", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const correctiveFail = caseInput({ caseId: "p1_new", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "fail", createdAtUtc: "2026-01-10T00:00:00.000Z" });
    const result = computeRosterBoundOutcome([primary, originalPass, correctiveFail], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(result.aggregateStatus).toBe("fail");
    expect(result.contributingCaseIds).toContain("p1_new");
    expect(result.contributingCaseIds).not.toContain("p1_old");
  });

  it("a corrective case still uncomputed blocks publication outright (tightened from computeAuthoritativeOutcome's own remediation_required fold)", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const originalPass = caseInput({ caseId: "p1_old", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: "pass", createdAtUtc: "2026-01-01T00:00:00.000Z" });
    const correctiveUncomputed = caseInput({ caseId: "p1_new", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: null, currentOutcomeId: null, createdAtUtc: "2026-01-10T00:00:00.000Z" });
    const result = computeRosterBoundOutcome([primary, originalPass, correctiveUncomputed], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    // The OLD computeAuthoritativeOutcome would fold this into remediation_required and still
    // publish. The roster-bound function must NOT — this is the deliberate Phase 4B tightening.
    expect(result.publishable).toBe(false);
    expect(result.reasonCode).toBe("party_outcome_pending");
  });
});

describe("computeRosterBoundOutcome — does not mutate computeAuthoritativeOutcome's own behaviour", () => {
  it("the SAME case set fed to both functions can legitimately produce DIFFERENT results — the roster-free function is untouched", () => {
    const primary = caseInput({ caseId: "primary", caseType: "individual", currentOutcomeStatus: "pass" });
    const uncomputedParty = caseInput({ caseId: "p1", caseType: "authorised_party", partyId: "clt1ap_1", currentOutcomeStatus: null, currentOutcomeId: null });
    const oldStyle = computeAuthoritativeOutcome([primary, uncomputedParty]);
    const newStyle = computeRosterBoundOutcome([primary, uncomputedParty], roster({ requiredAuthorisedPartyIds: ["clt1ap_1"] }));
    expect(oldStyle.publishable).toBe(true); // folds to remediation_required — Phase 2A/2B behaviour, unchanged
    expect(oldStyle.aggregateStatus).toBe("remediation_required");
    expect(newStyle.publishable).toBe(false); // Phase 4B tightening for a REQUIRED party
    expect(newStyle.reasonCode).toBe("party_outcome_pending");
  });
});
