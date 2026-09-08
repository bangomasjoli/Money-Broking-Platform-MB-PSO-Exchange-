/**
 * WLT-01 — Ongoing Rescreening, pure/format-level unit tests (no database). Implements the frozen
 * architecture exactly. DB-touching behavior (candidate selection, per-destination application,
 * the route itself) is covered by tests/integration/wlt1-rescreening-route.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  RUN_ID_REGEX,
  RESCREENING_STUCK_THRESHOLD_SECONDS,
  RESCREENING_ELIGIBLE_STATUSES,
  mintRescreeningRunId,
  mintRescreeningScreeningResultId,
  isRescreeningEligibleStatus,
  isRescreeningRunStuck,
  classifyRescreeningRunStatus,
  zeroRescreeningRunCounters,
  buildRescreeningRunAuditMetadata,
} from "../../services/wlt1/src/lib/rescreening.js";
import { RESCREENING_REASON_CODE, type Wlt1RevocationSource } from "../../services/wlt1/src/lib/destination-revocation.js";

describe("mintRescreeningRunId / RUN_ID_REGEX", () => {
  it("mints exactly the wlt1rsr_ + UUID shape, 44 characters total", () => {
    const id = mintRescreeningRunId();
    expect(id).toMatch(RUN_ID_REGEX);
    expect(id).toHaveLength(44);
    expect(id.startsWith("wlt1rsr_")).toBe(true);
  });

  it("mints a distinct id on every call (never reused/cached)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintRescreeningRunId()));
    expect(ids.size).toBe(50);
  });

  it("RUN_ID_REGEX rejects a decision_id/consumption_id/revocation_id-shaped value (wrong prefix)", () => {
    expect("wlt1dec_11111111-1111-1111-1111-111111111111").not.toMatch(RUN_ID_REGEX);
    expect("wlt1con_11111111-1111-1111-1111-111111111111").not.toMatch(RUN_ID_REGEX);
    expect("wlt1rev_11111111-1111-1111-1111-111111111111").not.toMatch(RUN_ID_REGEX);
  });
});

describe("mintRescreeningScreeningResultId — reuses the exact existing wlt1screen_ format", () => {
  const SCREENING_RESULT_ID_SHAPE = /^wlt1screen_[0-9a-f-]{36}$/;

  it("mints exactly the wlt1screen_ + UUID shape", () => {
    const id = mintRescreeningScreeningResultId();
    expect(id).toMatch(SCREENING_RESULT_ID_SHAPE);
    expect(id.startsWith("wlt1screen_")).toBe(true);
  });

  it("mints a distinct id on every call — abandoned ids are never reused across attempts", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintRescreeningScreeningResultId()));
    expect(ids.size).toBe(50);
  });

  it("does not invent a second/different format (no wlt1rescreen_ variant)", () => {
    const id = mintRescreeningScreeningResultId();
    expect(id.startsWith("wlt1rescreen_")).toBe(false);
  });
});

describe("RESCREENING_ELIGIBLE_STATUSES / isRescreeningEligibleStatus", () => {
  it("is exactly active + approved_pending_cooling", () => {
    expect(RESCREENING_ELIGIBLE_STATUSES).toEqual(["active", "approved_pending_cooling"]);
  });

  it("accepts only the two eligible statuses", () => {
    expect(isRescreeningEligibleStatus("active")).toBe(true);
    expect(isRescreeningEligibleStatus("approved_pending_cooling")).toBe(true);
  });

  it("rejects revoked, draft, pending_screening, pending_review, and any unknown value", () => {
    for (const status of ["revoked", "draft", "pending_screening", "pending_review", "not_a_real_status"]) {
      expect(isRescreeningEligibleStatus(status)).toBe(false);
    }
  });
});

describe("RESCREENING_STUCK_THRESHOLD_SECONDS / isRescreeningRunStuck", () => {
  it("threshold is exactly 3600 seconds (module constant, not config)", () => {
    expect(RESCREENING_STUCK_THRESHOLD_SECONDS).toBe(3600);
  });

  it("a run started exactly at the threshold boundary is NOT yet stuck (strict less-than)", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    const startedAt = new Date("2026-01-01T00:00:00.000Z"); // exactly 3600s earlier
    expect(isRescreeningRunStuck(startedAt, now)).toBe(false);
  });

  it("a run started one second past the threshold IS stuck", () => {
    const now = new Date("2026-01-01T01:00:01.000Z");
    const startedAt = new Date("2026-01-01T00:00:00.000Z"); // 3601s earlier
    expect(isRescreeningRunStuck(startedAt, now)).toBe(true);
  });

  it("a freshly-started run is never stuck", () => {
    const now = new Date("2026-01-01T00:00:05.000Z");
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(isRescreeningRunStuck(startedAt, now)).toBe(false);
  });
});

describe("classifyRescreeningRunStatus — the frozen terminal-status formula", () => {
  it("failures=0 -> completed, regardless of skipped/candidates_selected", () => {
    expect(classifyRescreeningRunStatus(0)).toBe("completed");
  });

  it("failures>0 -> completed_with_errors, even a single failure", () => {
    expect(classifyRescreeningRunStatus(1)).toBe("completed_with_errors");
  });

  it("all candidates failed -> completed_with_errors (never failed)", () => {
    expect(classifyRescreeningRunStatus(200)).toBe("completed_with_errors");
  });

  it("never returns 'failed' — that status is reserved for run-level/stuck-reclaim paths only, never derived from this formula", () => {
    for (const failures of [0, 1, 5, 50, 200]) {
      expect(classifyRescreeningRunStatus(failures)).not.toBe("failed");
      expect(classifyRescreeningRunStatus(failures)).not.toBe("running");
    }
  });
});

describe("zeroRescreeningRunCounters", () => {
  it("all six counters start at zero", () => {
    expect(zeroRescreeningRunCounters()).toEqual({
      candidatesSelected: 0,
      rescreenedClear: 0,
      rescreenedAdverse: 0,
      revocationsTriggered: 0,
      skipped: 0,
      failures: 0,
    });
  });
});

describe("buildRescreeningRunAuditMetadata — the frozen 12-key allowlist", () => {
  it("exactly 12 keys, no more, no less", () => {
    const metadata = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_11111111-1111-1111-1111-111111111111",
      scope: "periodic_due",
      status: "completed",
      completionReason: "normal",
      requestedBy: "staff_1",
      targetDestinationId: null,
      counters: { candidatesSelected: 10, rescreenedClear: 8, rescreenedAdverse: 1, revocationsTriggered: 1, skipped: 0, failures: 1 },
    });
    expect(Object.keys(metadata).sort()).toEqual(
      [
        "run_id",
        "scope",
        "status",
        "completion_reason",
        "requested_by",
        "target_destination_id",
        "candidates_selected",
        "rescreened_clear",
        "rescreened_adverse",
        "revocations_triggered",
        "skipped",
        "failures",
      ].sort(),
    );
  });

  it("never includes an 'outcome' key", () => {
    const metadata = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_1",
      scope: "destination",
      status: "failed",
      completionReason: "reclaimed_stuck",
      requestedBy: "staff_1",
      targetDestinationId: "wlt1dest_1",
      counters: zeroRescreeningRunCounters(),
    });
    expect(Object.keys(metadata)).not.toContain("outcome");
  });

  it("completion_reason vocabulary is exactly normal | reclaimed_stuck", () => {
    const normal = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_1",
      scope: "periodic_due",
      status: "completed",
      completionReason: "normal",
      requestedBy: "staff_1",
      targetDestinationId: null,
      counters: zeroRescreeningRunCounters(),
    });
    expect(normal.completion_reason).toBe("normal");

    const stuck = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_2",
      scope: "periodic_due",
      status: "failed",
      completionReason: "reclaimed_stuck",
      requestedBy: "staff_1",
      targetDestinationId: null,
      counters: zeroRescreeningRunCounters(),
    });
    expect(stuck.completion_reason).toBe("reclaimed_stuck");
    expect(stuck.status).toBe("failed");
  });

  it("target_destination_id is null for periodic_due, and the caller's own value for destination scope", () => {
    const periodic = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_1",
      scope: "periodic_due",
      status: "completed",
      completionReason: "normal",
      requestedBy: "staff_1",
      targetDestinationId: null,
      counters: zeroRescreeningRunCounters(),
    });
    expect(periodic.target_destination_id).toBeNull();

    const manual = buildRescreeningRunAuditMetadata({
      runId: "wlt1rsr_2",
      scope: "destination",
      status: "completed",
      completionReason: "normal",
      requestedBy: "staff_1",
      targetDestinationId: "wlt1dest_manual",
      counters: zeroRescreeningRunCounters(),
    });
    expect(manual.target_destination_id).toBe("wlt1dest_manual");
  });
});

describe("Revocation type widening (destination-revocation.ts) — Run-Lifecycle Micro-Addendum Issue 22/23", () => {
  it("RESCREENING_REASON_CODE is exactly 'rescreen_adverse'", () => {
    expect(RESCREENING_REASON_CODE).toBe("rescreen_adverse");
  });

  it("'rescreening' is now assignable as a Wlt1RevocationSource (type-level compile check — this line failing to compile IS the test)", () => {
    const source: Wlt1RevocationSource = "rescreening";
    expect(source).toBe("rescreening");
  });
});
