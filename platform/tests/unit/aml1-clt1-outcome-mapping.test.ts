/**
 * AML-01 Phase 2A — unit tests for lib/clt1-outcome-mapping.ts. Pure logic, no DB/HTTP — proves
 * the effective-status derivation and both per-endpoint mapping tables the accepted Phase 2
 * planning report specified (§0 corrections C1/C2, §5).
 */
import { describe, expect, it } from "vitest";
import {
  deriveEffectiveStatus,
  mapEffectiveStatusToApplicationOutcome,
  mapEffectiveStatusToAuthorisedPartyOutcome,
  planApplicationDeliveries,
  planAuthorisedPartyDelivery,
  type ScreeningMatchSummary,
} from "../../services/aml1/src/lib/clt1-outcome-mapping.js";

describe("AML-01 Phase 2A: deriveEffectiveStatus", () => {
  it("zero matches -> clear", () => {
    expect(deriveEffectiveStatus([])).toBe("clear");
  });

  it("a confirmed_hit present -> confirmed_hit (outranks potential_match/dismissed)", () => {
    expect(deriveEffectiveStatus(["potential_match", "confirmed_hit", "dismissed"])).toBe("confirmed_hit");
  });

  it("a potential_match present (no confirmed_hit) -> potential_match", () => {
    expect(deriveEffectiveStatus(["dismissed", "potential_match"])).toBe("potential_match");
  });

  it("all matches dismissed -> clear_after_review (distinct from zero matches)", () => {
    expect(deriveEffectiveStatus(["dismissed", "dismissed"])).toBe("clear_after_review");
  });

  it("there is no result-level 'dismissed' — the function never RETURNS 'dismissed' itself, only consumes it as an input match_status", () => {
    const outputs = new Set([
      deriveEffectiveStatus([]),
      deriveEffectiveStatus(["confirmed_hit"]),
      deriveEffectiveStatus(["potential_match"]),
      deriveEffectiveStatus(["dismissed"]),
    ]);
    expect(outputs.has("dismissed" as never)).toBe(false);
  });
});

describe("AML-01 Phase 2A: mapEffectiveStatusToApplicationOutcome (CLT-01 application-level vocabulary)", () => {
  it("clear -> pass", () => expect(mapEffectiveStatusToApplicationOutcome("clear")).toBe("pass"));
  it("clear_after_review -> pass", () => expect(mapEffectiveStatusToApplicationOutcome("clear_after_review")).toBe("pass"));
  it("potential_match -> pending", () => expect(mapEffectiveStatusToApplicationOutcome("potential_match")).toBe("pending"));
  it("confirmed_hit -> hit", () => expect(mapEffectiveStatusToApplicationOutcome("confirmed_hit")).toBe("hit"));
});

describe("AML-01 Phase 2A: mapEffectiveStatusToAuthorisedPartyOutcome (CLT-01 party-level vocabulary)", () => {
  it("clear -> clear", () => expect(mapEffectiveStatusToAuthorisedPartyOutcome("clear")).toBe("clear"));
  it("clear_after_review -> clear", () => expect(mapEffectiveStatusToAuthorisedPartyOutcome("clear_after_review")).toBe("clear"));
  it("potential_match -> review_required", () => expect(mapEffectiveStatusToAuthorisedPartyOutcome("potential_match")).toBe("review_required"));
  it("confirmed_hit -> hit", () => expect(mapEffectiveStatusToAuthorisedPartyOutcome("confirmed_hit")).toBe("hit"));
});

describe("AML-01 Phase 2A: planApplicationDeliveries", () => {
  it("no matches -> both aml_sanctions and pep_adverse_media deliver pass", () => {
    const plan = planApplicationDeliveries([]);
    expect(plan).toEqual([
      { outcome_type: "aml_sanctions", effective_status: "clear", delivered_status: "pass" },
      { outcome_type: "pep_adverse_media", effective_status: "clear", delivered_status: "pass" },
    ]);
  });

  it("a sanctions match drives ONLY aml_sanctions — pep_adverse_media stays pass", () => {
    const matches: ScreeningMatchSummary[] = [{ category: "sanctions", match_status: "potential_match" }];
    const plan = planApplicationDeliveries(matches);
    expect(plan.find((p) => p.outcome_type === "aml_sanctions")).toEqual({ outcome_type: "aml_sanctions", effective_status: "potential_match", delivered_status: "pending" });
    expect(plan.find((p) => p.outcome_type === "pep_adverse_media")).toEqual({ outcome_type: "pep_adverse_media", effective_status: "clear", delivered_status: "pass" });
  });

  it("a pep match drives pep_adverse_media — sanctions stays pass", () => {
    const matches: ScreeningMatchSummary[] = [{ category: "pep", match_status: "confirmed_hit" }];
    const plan = planApplicationDeliveries(matches);
    expect(plan.find((p) => p.outcome_type === "pep_adverse_media")).toEqual({ outcome_type: "pep_adverse_media", effective_status: "confirmed_hit", delivered_status: "hit" });
    expect(plan.find((p) => p.outcome_type === "aml_sanctions")).toEqual({ outcome_type: "aml_sanctions", effective_status: "clear", delivered_status: "pass" });
  });

  it("an adverse_media match ALSO drives pep_adverse_media (CLT-01 fuses pep+adverse_media into one outcome type)", () => {
    const matches: ScreeningMatchSummary[] = [{ category: "adverse_media", match_status: "potential_match" }];
    const plan = planApplicationDeliveries(matches);
    expect(plan.find((p) => p.outcome_type === "pep_adverse_media")).toEqual({ outcome_type: "pep_adverse_media", effective_status: "potential_match", delivered_status: "pending" });
  });

  it("always produces exactly two entries, even with mixed sanctions+pep matches", () => {
    const matches: ScreeningMatchSummary[] = [
      { category: "sanctions", match_status: "confirmed_hit" },
      { category: "pep", match_status: "potential_match" },
      { category: "adverse_media", match_status: "dismissed" },
    ];
    const plan = planApplicationDeliveries(matches);
    expect(plan).toHaveLength(2);
    expect(plan.map((p) => p.outcome_type).sort()).toEqual(["aml_sanctions", "pep_adverse_media"]);
  });
});

describe("AML-01 Phase 2A: planAuthorisedPartyDelivery", () => {
  it("no matches -> clear", () => {
    expect(planAuthorisedPartyDelivery([])).toEqual({ effective_status: "clear", delivered_status: "clear" });
  });

  it("a potential_match of any category -> review_required", () => {
    const matches: ScreeningMatchSummary[] = [{ category: "pep", match_status: "potential_match" }];
    expect(planAuthorisedPartyDelivery(matches)).toEqual({ effective_status: "potential_match", delivered_status: "review_required" });
  });

  it("a confirmed_hit of any category -> hit, even alongside a lesser match", () => {
    const matches: ScreeningMatchSummary[] = [
      { category: "adverse_media", match_status: "potential_match" },
      { category: "sanctions", match_status: "confirmed_hit" },
    ];
    expect(planAuthorisedPartyDelivery(matches)).toEqual({ effective_status: "confirmed_hit", delivered_status: "hit" });
  });

  it("is NOT split by category (unlike application-level) — all matches feed one derivation", () => {
    const sanctionsOnly = planAuthorisedPartyDelivery([{ category: "sanctions", match_status: "potential_match" }]);
    const pepOnly = planAuthorisedPartyDelivery([{ category: "pep", match_status: "potential_match" }]);
    expect(sanctionsOnly).toEqual(pepOnly);
  });
});
