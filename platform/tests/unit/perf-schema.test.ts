/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/schema.ts` result-status model and
 * `MeasurementResult` envelope. Covers the load-bearing invariant: `PASS`/`FAIL` require a
 * non-empty `threshold_ref`; every other status forbids one. No governed threshold exists
 * anywhere in this repository yet, so every producer built to date legitimately emits only
 * `OBSERVED`/`INVALID` — these tests still prove the guard rejects a fabricated `threshold_ref`
 * rather than silently accepting one.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_MEASUREMENT_IDS,
  createMeasurementResult,
  MeasurementResultValidationError,
  validateStatusThresholdPairing,
  type EnvironmentManifestRef,
} from "../../perf/src/schema.js";

function validManifest(): EnvironmentManifestRef {
  return {
    provenance: { commit_sha: "deadbeef", run_id: "run-test", harness_version: "0.1.0" },
    host: { platform: "darwin", arch: "arm64", logical_cpu_count: 8 },
    runtime: { node_version: "v24.0.0" },
    database: { observed: false },
    service_topology: { observed: false },
    placement: { applicable: false },
    dataset: { applicable: false },
  };
}

describe("validateStatusThresholdPairing", () => {
  it("PASS without threshold_ref is rejected", () => {
    expect(() => validateStatusThresholdPairing("PASS", undefined)).toThrow(MeasurementResultValidationError);
  });

  it("FAIL without threshold_ref is rejected", () => {
    expect(() => validateStatusThresholdPairing("FAIL", undefined)).toThrow(MeasurementResultValidationError);
  });

  it("PASS with an empty-string threshold_ref is rejected (whitespace does not count as present)", () => {
    expect(() => validateStatusThresholdPairing("PASS", "   ")).toThrow(MeasurementResultValidationError);
  });

  it("OBSERVED with a threshold_ref is rejected", () => {
    expect(() => validateStatusThresholdPairing("OBSERVED", "some_governed_threshold")).toThrow(MeasurementResultValidationError);
  });

  it("INCONCLUSIVE with a threshold_ref is rejected", () => {
    expect(() => validateStatusThresholdPairing("INCONCLUSIVE", "some_governed_threshold")).toThrow(MeasurementResultValidationError);
  });

  it("INVALID with a threshold_ref is rejected", () => {
    expect(() => validateStatusThresholdPairing("INVALID", "some_governed_threshold")).toThrow(MeasurementResultValidationError);
  });

  it("PASS with a genuine non-empty threshold_ref is accepted", () => {
    expect(() => validateStatusThresholdPairing("PASS", "governed_threshold_id")).not.toThrow();
  });

  it("FAIL with a genuine non-empty threshold_ref is accepted", () => {
    expect(() => validateStatusThresholdPairing("FAIL", "governed_threshold_id")).not.toThrow();
  });

  it("OBSERVED without a threshold_ref is accepted", () => {
    expect(() => validateStatusThresholdPairing("OBSERVED", undefined)).not.toThrow();
  });
});

describe("createMeasurementResult — status default", () => {
  it("defaults to OBSERVED when status is omitted", () => {
    const result = createMeasurementResult({
      measurement_id: "M2a",
      run_id: "run-test",
      timestamp_utc_start: "2026-01-01T00:00:00.000Z",
      timestamp_utc_end: "2026-01-01T00:00:01.000Z",
      commit_sha: "deadbeef",
      working_tree_clean: true,
      environment: validManifest(),
      does_not_prove: ["does not establish anything"],
      details: {},
    });
    expect(result.status).toBe("OBSERVED");
    expect(result.threshold_ref).toBeUndefined();
  });
});

describe("createMeasurementResult — environment fingerprint requirement", () => {
  it("rejects a missing environment field", () => {
    expect(() =>
      createMeasurementResult({
        measurement_id: "M2a",
        run_id: "run-test",
        timestamp_utc_start: "2026-01-01T00:00:00.000Z",
        timestamp_utc_end: "2026-01-01T00:00:01.000Z",
        commit_sha: "deadbeef",
        working_tree_clean: true,
        // @ts-expect-error — deliberately omitted for this test
        environment: undefined,
        does_not_prove: ["x"],
        details: {},
      }),
    ).toThrow(MeasurementResultValidationError);
  });

  it("rejects an environment missing a required category (database)", () => {
    const manifest = validManifest();
    // @ts-expect-error — deliberately malformed for this test
    delete manifest.database;
    expect(() =>
      createMeasurementResult({
        measurement_id: "M2a",
        run_id: "run-test",
        timestamp_utc_start: "2026-01-01T00:00:00.000Z",
        timestamp_utc_end: "2026-01-01T00:00:01.000Z",
        commit_sha: "deadbeef",
        working_tree_clean: true,
        environment: manifest,
        does_not_prove: ["x"],
        details: {},
      }),
    ).toThrow(MeasurementResultValidationError);
  });

  it("rejects does_not_prove being empty", () => {
    expect(() =>
      createMeasurementResult({
        measurement_id: "M2a",
        run_id: "run-test",
        timestamp_utc_start: "2026-01-01T00:00:00.000Z",
        timestamp_utc_end: "2026-01-01T00:00:01.000Z",
        commit_sha: "deadbeef",
        working_tree_clean: true,
        environment: validManifest(),
        does_not_prove: [],
        details: {},
      }),
    ).toThrow(MeasurementResultValidationError);
  });
});

describe("MeasurementId model — M2 and M8b are deliberately absent", () => {
  it("does not include the bare identifier 'M2' — only its evidenced sub-parts M2a/M2b", () => {
    expect(ALL_MEASUREMENT_IDS).not.toContain("M2");
    expect(ALL_MEASUREMENT_IDS).toContain("M2a");
    expect(ALL_MEASUREMENT_IDS).toContain("M2b");
  });

  it("does not include 'M8b' — K_max/demographic sharing is a governance input, never an engineering measurement result", () => {
    expect(ALL_MEASUREMENT_IDS).not.toContain("M8b");
    expect(ALL_MEASUREMENT_IDS).toContain("M8a");
  });

  it("has exactly the ten controlled identifiers — no unexpected additions or omissions", () => {
    expect([...ALL_MEASUREMENT_IDS].sort()).toEqual(
      ["M1", "M2a", "M2b", "M3", "M4", "M5", "M6", "M7-PROD", "M7-UAT", "M8a"].sort(),
    );
  });
});
