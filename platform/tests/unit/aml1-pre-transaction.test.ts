/**
 * AML-01 Phase 3E — pure evaluation logic (`lib/pre-transaction.ts`): subject canonicalization,
 * per-subject evidence mapping, and decision/reason-code aggregation. No database, no HTTP.
 *
 * Every test here directly constructs a `SubjectEvidenceRow` (the exact shape
 * `resolveSubjectEvidence`'s own SQL statement returns) and feeds it to the pure
 * `evaluateSubjectEvidence`/`aggregateDecision` functions — proving the frozen decision table
 * (AML-01 Phase 3E architecture freeze + addendum) independent of any live evidence resolution.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalizeSubjectRefs,
  evaluateSubjectEvidence,
  aggregateDecision,
  PRE_TRANSACTION_REASON_CODES,
  type SubjectEvidenceRow,
  type SubjectVerdict,
} from "../../services/aml1/src/lib/pre-transaction.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const MAX_AGE_HOURS = 2160; // 90 days, the frozen default

function freshDate(hoursAgo: number): Date {
  return new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000);
}

function row(overrides: Partial<SubjectEvidenceRow> = {}): SubjectEvidenceRow {
  return {
    subjectRef: "party_1",
    requestStatus: null,
    overallStatus: null,
    screenedAtUtc: null,
    undismissedMatchCount: 0,
    providerIds: [],
    ...overrides,
  };
}

describe("AML-01 Phase 3E — canonicalizeSubjectRefs", () => {
  it("de-duplicates exact {subject_type, subject_ref} pairs", () => {
    const result = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_1" },
      { subject_type: "authorised_party", subject_ref: "party_1" },
      { subject_type: "authorised_party", subject_ref: "party_2" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("sorts deterministically by subject_ref", () => {
    const result = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_zeta" },
      { subject_type: "authorised_party", subject_ref: "party_alpha" },
    ]);
    expect(result.map((r) => r.subjectRef)).toEqual(["party_alpha", "party_zeta"]);
  });

  it("caller array order never affects the canonical output", () => {
    const a = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_c" },
      { subject_type: "authorised_party", subject_ref: "party_a" },
      { subject_type: "authorised_party", subject_ref: "party_b" },
    ]);
    const b = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_a" },
      { subject_type: "authorised_party", subject_ref: "party_b" },
      { subject_type: "authorised_party", subject_ref: "party_c" },
    ]);
    expect(a).toEqual(b);
  });

  it("does not trim, lowercase, or otherwise normalize subject_ref (exact comparison only)", () => {
    const result = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: " party_1" },
      { subject_type: "authorised_party", subject_ref: "party_1" },
    ]);
    // Deliberately NOT de-duplicated — these are different opaque identifiers.
    expect(result).toHaveLength(2);
  });
});

describe("AML-01 Phase 3E — evaluateSubjectEvidence (per-subject mapping)", () => {
  it("1. fresh clear + successful provider provenance -> allow / evidence_clear", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: ["stub-v1"] }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "allow", reasonCode: "evidence_clear" });
  });

  it("2. fresh potential_match with all matches dismissed + successful provider provenance -> allow / matches_dismissed", () => {
    const v = evaluateSubjectEvidence(
      row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 0, providerIds: ["stub-v1"] }),
      NOW,
      MAX_AGE_HOURS,
    );
    expect(v).toMatchObject({ decision: "allow", reasonCode: "matches_dismissed" });
  });

  it("3. undisposed potential_match -> review / undisposed_potential_match", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 1 }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "undisposed_potential_match" });
  });

  it("4. confirmed_hit -> deny / confirmed_hit", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "confirmed_hit", screenedAtUtc: freshDate(1) }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "deny", reasonCode: "confirmed_hit" });
  });

  it("5. confirmed_hit remains deny even when old/stale (NEVER rescued by staleness)", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "confirmed_hit", screenedAtUtc: freshDate(100_000) }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "deny", reasonCode: "confirmed_hit" });
  });

  it("6. screening result error -> review / screening_result_error", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "error", screenedAtUtc: freshDate(1) }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "screening_result_error" });
  });

  it("7. requested/in-flight -> review / screening_in_flight", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "requested" }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "screening_in_flight" });
  });

  it("8. failed screening -> review / screening_failed", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "failed" }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "screening_failed" });
  });

  it("9. stale evidence -> review / evidence_stale (clear but older than freshness bound)", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(MAX_AGE_HOURS + 1) }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "evidence_stale" });
  });

  it("21. freshness EXACT boundary: exactly at the max age is still fresh (inclusive)", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(MAX_AGE_HOURS), providerIds: ["stub-v1"] }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "allow", reasonCode: "evidence_clear" });
  });

  it("21b. freshness EXACT boundary: one millisecond past the max age is stale", () => {
    const justOverMs = MAX_AGE_HOURS * 60 * 60 * 1000 + 1;
    const screenedAtUtc = new Date(NOW.getTime() - justOverMs);
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "evidence_stale" });
  });

  it("10. no current evidence -> review / no_current_evidence (completed request, defensively-unreachable missing result)", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: null }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "no_current_evidence" });
  });

  it("11. binding unprovable -> review / subject_client_binding_unprovable (no bound screening_request row)", () => {
    const v = evaluateSubjectEvidence(row({ requestStatus: null }), NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "subject_client_binding_unprovable" });
  });

  it("12. unsupported state -> review / unsupported_evidence_state (synthetic out-of-vocabulary overall_status)", () => {
    // Structurally unreachable via any real INSERT (DB CHECK-constrained) — proven here only via a
    // synthetic value bypassing the DB entirely, exactly as the frozen architecture anticipates.
    const v = evaluateSubjectEvidence(
      row({ requestStatus: "completed", overallStatus: "some_future_status" as unknown as SubjectEvidenceRow["overallStatus"], screenedAtUtc: freshDate(1) }),
      NOW,
      MAX_AGE_HOURS,
    );
    expect(v).toMatchObject({ decision: "review", reasonCode: "unsupported_evidence_state" });
  });

  it("13. all eleven reason codes are independently reachable", () => {
    const reached = new Set<string>();
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: ["stub-v1"] }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(
      evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 0, providerIds: ["stub-v1"] }), NOW, MAX_AGE_HOURS)
        .reasonCode,
    );
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "confirmed_hit", screenedAtUtc: freshDate(1) }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 1 }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "error", screenedAtUtc: freshDate(1) }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "requested" }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "failed" }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(MAX_AGE_HOURS + 1) }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: null }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(evaluateSubjectEvidence(row({ requestStatus: null }), NOW, MAX_AGE_HOURS).reasonCode);
    reached.add(
      evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "bogus" as unknown as SubjectEvidenceRow["overallStatus"], screenedAtUtc: freshDate(1) }), NOW, MAX_AGE_HOURS)
        .reasonCode,
    );
    expect([...reached].sort()).toEqual([...PRE_TRANSACTION_REASON_CODES].sort());
  });

  describe("C-3E-1 remediation: missing provider provenance cannot support allow", () => {
    it("fresh clear + providerIds=[] -> review / unsupported_evidence_state (NOT allow)", () => {
      const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: [] }), NOW, MAX_AGE_HOURS);
      expect(v).toMatchObject({ decision: "review", reasonCode: "unsupported_evidence_state" });
    });

    it("fresh clear + providerIds=['stub'] -> allow / evidence_clear", () => {
      const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: ["stub"] }), NOW, MAX_AGE_HOURS);
      expect(v).toMatchObject({ decision: "allow", reasonCode: "evidence_clear" });
    });

    it("fresh all-dismissed potential_match + providerIds=[] -> review / unsupported_evidence_state (NOT allow)", () => {
      const v = evaluateSubjectEvidence(
        row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 0, providerIds: [] }),
        NOW,
        MAX_AGE_HOURS,
      );
      expect(v).toMatchObject({ decision: "review", reasonCode: "unsupported_evidence_state" });
    });

    it("fresh all-dismissed potential_match + providerIds=['stub'] -> allow / matches_dismissed", () => {
      const v = evaluateSubjectEvidence(
        row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 0, providerIds: ["stub"] }),
        NOW,
        MAX_AGE_HOURS,
      );
      expect(v).toMatchObject({ decision: "allow", reasonCode: "matches_dismissed" });
    });

    it("confirmed_hit + providerIds=[] -> STILL deny / confirmed_hit (a confirmed hit is never weakened by absent provenance)", () => {
      const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "confirmed_hit", screenedAtUtc: freshDate(1), providerIds: [] }), NOW, MAX_AGE_HOURS);
      expect(v).toMatchObject({ decision: "deny", reasonCode: "confirmed_hit" });
    });

    it("unsupported_evidence_state is now reachable through the missing-provenance path, not only the synthetic-state fallback", () => {
      const v = evaluateSubjectEvidence(row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: [] }), NOW, MAX_AGE_HOURS);
      expect(v.reasonCode).toBe("unsupported_evidence_state");
      // Distinct from the synthetic out-of-vocabulary trigger — this one uses a real, in-vocabulary
      // overallStatus with genuinely empty provenance, proving the branch fires independently of the
      // defensive fallback at the bottom of evaluateSubjectEvidence.
    });

    it("multi-subject aggregation: one subject's missing provenance forces the overall decision to review even though another subject would independently allow", () => {
      const subjectNoProvenance = evaluateSubjectEvidence(
        row({ subjectRef: "party_a", requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: [] }),
        NOW,
        MAX_AGE_HOURS,
      );
      const subjectWithProvenance = evaluateSubjectEvidence(
        row({ subjectRef: "party_b", requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: ["stub"] }),
        NOW,
        MAX_AGE_HOURS,
      );
      expect(subjectNoProvenance).toMatchObject({ decision: "review", reasonCode: "unsupported_evidence_state" });
      expect(subjectWithProvenance).toMatchObject({ decision: "allow", reasonCode: "evidence_clear" });

      const aggregated = aggregateDecision([subjectNoProvenance, subjectWithProvenance]);
      expect(aggregated).toMatchObject({ decision: "review", reasonCode: "unsupported_evidence_state" });
    });
  });

  it("L-3E-1: newest lifecycle wins over an older provenance-complete clear: T1 clear+provenance, T2 newer failed -> review/screening_failed (the older clear is never used)", () => {
    // resolveSubjectEvidence's own SQL returns only the NEWEST row per subject — this proves
    // evaluateSubjectEvidence correctly classifies that newest row (status='failed') rather than an
    // older, fully-provenanced completed/clear result, which by construction is never even passed to
    // this function once a newer lifecycle row exists.
    const newestRow = row({ requestStatus: "failed" });
    const v = evaluateSubjectEvidence(newestRow, NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "screening_failed" });
  });

  it("22. no input/state path can accidentally default to allow — every non-clear/non-dismissed path is review or deny", () => {
    const inputs: SubjectEvidenceRow[] = [
      row({ requestStatus: null }),
      row({ requestStatus: "requested" }),
      row({ requestStatus: "failed" }),
      row({ requestStatus: "completed", overallStatus: null }),
      row({ requestStatus: "completed", overallStatus: "error", screenedAtUtc: freshDate(1) }),
      row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 1 }),
      row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(MAX_AGE_HOURS + 1) }),
      row({ requestStatus: "completed", overallStatus: "confirmed_hit", screenedAtUtc: freshDate(1) }),
      row({ requestStatus: "completed", overallStatus: "weird" as unknown as SubjectEvidenceRow["overallStatus"], screenedAtUtc: freshDate(1) }),
      row({ requestStatus: "completed", overallStatus: "clear", screenedAtUtc: freshDate(1), providerIds: [] }),
      row({ requestStatus: "completed", overallStatus: "potential_match", screenedAtUtc: freshDate(1), undismissedMatchCount: 0, providerIds: [] }),
    ];
    for (const input of inputs) {
      const v = evaluateSubjectEvidence(input, NOW, MAX_AGE_HOURS);
      expect(v.decision, JSON.stringify(input)).not.toBe("allow");
    }
  });
});

describe("AML-01 Phase 3E — aggregateDecision (strictest-wins + reason precedence)", () => {
  it("14. strictest decision precedence: confirmed_hit + stale -> deny/confirmed_hit", () => {
    const verdicts: SubjectVerdict[] = [
      { subjectRef: "a", decision: "deny", reasonCode: "confirmed_hit", providerIds: ["stub-v1"] },
      { subjectRef: "b", decision: "review", reasonCode: "evidence_stale", providerIds: [] },
    ];
    expect(aggregateDecision(verdicts)).toMatchObject({ decision: "deny", reasonCode: "confirmed_hit" });
  });

  it("15. same-decision reason precedence: potential_match + no_evidence -> review/undisposed_potential_match", () => {
    const verdicts: SubjectVerdict[] = [
      { subjectRef: "a", decision: "review", reasonCode: "undisposed_potential_match", providerIds: [] },
      { subjectRef: "b", decision: "review", reasonCode: "no_current_evidence", providerIds: [] },
    ];
    expect(aggregateDecision(verdicts)).toMatchObject({ decision: "review", reasonCode: "undisposed_potential_match" });
  });

  it("binding failure outranks every other review reason", () => {
    const verdicts: SubjectVerdict[] = [
      { subjectRef: "a", decision: "review", reasonCode: "screening_in_flight", providerIds: [] },
      { subjectRef: "b", decision: "review", reasonCode: "subject_client_binding_unprovable", providerIds: [] },
    ];
    expect(aggregateDecision(verdicts)).toMatchObject({ decision: "review", reasonCode: "subject_client_binding_unprovable" });
  });

  it("allow precedence: matches_dismissed reported over evidence_clear when both present", () => {
    const verdicts: SubjectVerdict[] = [
      { subjectRef: "a", decision: "allow", reasonCode: "evidence_clear", providerIds: ["stub-v1"] },
      { subjectRef: "b", decision: "allow", reasonCode: "matches_dismissed", providerIds: ["stub-v1"] },
    ];
    expect(aggregateDecision(verdicts)).toMatchObject({ decision: "allow", reasonCode: "matches_dismissed" });
  });

  it("18/19. reason precedence and decision are independent of verdict array order", () => {
    const forward: SubjectVerdict[] = [
      { subjectRef: "a", decision: "deny", reasonCode: "confirmed_hit", providerIds: [] },
      { subjectRef: "b", decision: "review", reasonCode: "evidence_stale", providerIds: [] },
      { subjectRef: "c", decision: "allow", reasonCode: "evidence_clear", providerIds: ["stub-v1"] },
    ];
    const reversed = [...forward].reverse();
    expect(aggregateDecision(forward)).toEqual(aggregateDecision(reversed));
  });

  it("20. empty canonical subject set never returns allow", () => {
    const result = aggregateDecision([]);
    expect(result.decision).not.toBe("allow");
    expect(result).toMatchObject({ decision: "review", reasonCode: "no_current_evidence" });
  });

  it("evidence_provider_ids: distinct + sorted lexicographically across multiple allow subjects", () => {
    const verdicts: SubjectVerdict[] = [
      { subjectRef: "a", decision: "allow", reasonCode: "evidence_clear", providerIds: ["stub-v2"] },
      { subjectRef: "b", decision: "allow", reasonCode: "evidence_clear", providerIds: ["stub-v1", "stub-v2"] },
    ];
    expect(aggregateDecision(verdicts).evidenceProviderIds).toEqual(["stub-v1", "stub-v2"]);
  });

  it("evidence_provider_ids is empty for a review/deny aggregate result (review/deny never claim supporting provider evidence)", () => {
    const verdicts: SubjectVerdict[] = [{ subjectRef: "a", decision: "review", reasonCode: "screening_in_flight", providerIds: [] }];
    expect(aggregateDecision(verdicts).evidenceProviderIds).toEqual([]);
  });
});

describe("AML-01 Phase 3E — end-to-end pure scenarios (canonicalization -> evaluation -> aggregation)", () => {
  it("16. newest lifecycle wins: T1 clear completed, T2 requested newer -> review/screening_in_flight", () => {
    // resolveSubjectEvidence's own SQL ORDER BY created_at_utc DESC ... LIMIT 1 means only the
    // NEWEST row is ever returned per subject — this test proves evaluateSubjectEvidence correctly
    // classifies that newest row (status='requested') rather than an older completed result, which
    // by construction is never even passed to this function.
    const newestRow = row({ requestStatus: "requested" });
    const v = evaluateSubjectEvidence(newestRow, NOW, MAX_AGE_HOURS);
    expect(v).toMatchObject({ decision: "review", reasonCode: "screening_in_flight" });
  });

  it("19. caller array ordering does not affect decision/reason (canonicalization + aggregation combined)", () => {
    const orderA = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_b" },
      { subject_type: "authorised_party", subject_ref: "party_a" },
    ]);
    const orderB = canonicalizeSubjectRefs([
      { subject_type: "authorised_party", subject_ref: "party_a" },
      { subject_type: "authorised_party", subject_ref: "party_b" },
    ]);
    expect(orderA).toEqual(orderB);

    const verdictsA: SubjectVerdict[] = orderA.map((s) =>
      s.subjectRef === "party_a"
        ? { subjectRef: s.subjectRef, decision: "deny", reasonCode: "confirmed_hit", providerIds: [] }
        : { subjectRef: s.subjectRef, decision: "allow", reasonCode: "evidence_clear", providerIds: ["stub-v1"] },
    );
    const verdictsB = [...verdictsA].reverse();
    expect(aggregateDecision(verdictsA)).toEqual(aggregateDecision(verdictsB));
  });
});
