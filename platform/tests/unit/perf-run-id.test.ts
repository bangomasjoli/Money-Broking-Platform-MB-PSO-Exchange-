/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/run-id.ts`. Covers shape, determinism given
 * injected time/nonce, and that no token/credential/host-secret-shaped material is required or
 * produced.
 */
import { describe, expect, it } from "vitest";
import { createRunId, isValidRunId } from "../../perf/src/run-id.js";

describe("createRunId", () => {
  it("produces a run ID matching the documented shape", () => {
    const id = createRunId({ commitSha: "6e063d4d761df0e7d8668a60b7649ddd5ea1ee68" });
    expect(isValidRunId(id)).toBe(true);
  });

  it("is deterministic given injected now/nonce (useful for reproducible test fixtures)", () => {
    const now = new Date("2026-09-16T16:45:00.000Z");
    const id = createRunId({ commitSha: "6e063d4d761df0e7d8668a60b7649ddd5ea1ee68", now, nonceHex: () => "a1b2c3d4" });
    expect(id).toBe("run-20260916T164500Z-a1b2c3d4-6e063d4");
  });

  it("throws when commitSha is missing", () => {
    // @ts-expect-error — deliberately omitted for this test
    expect(() => createRunId({})).toThrow();
  });

  it("two calls without injected nonce produce different run IDs (no fixed nonce reuse)", () => {
    const a = createRunId({ commitSha: "6e063d4d761df0e7d8668a60b7649ddd5ea1ee68" });
    const b = createRunId({ commitSha: "6e063d4d761df0e7d8668a60b7649ddd5ea1ee68" });
    expect(a).not.toBe(b);
  });
});

describe("isValidRunId", () => {
  it("rejects a string with no relation to the run-id shape", () => {
    expect(isValidRunId("not-a-run-id")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidRunId("")).toBe(false);
  });
});
