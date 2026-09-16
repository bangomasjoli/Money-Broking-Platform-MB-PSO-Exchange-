/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/capacity.ts`, the pure `C_iam` calculator.
 * Covers: `UNDETERMINED` without evidenced process count, homogeneous/heterogeneous arithmetic,
 * and that no production numeric constant is embedded anywhere in the module (a caller must
 * supply every number explicitly).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCIam } from "../../perf/src/capacity.js";

describe("computeCIam — UNDETERMINED without evidence", () => {
  it("returns UNDETERMINED when no input is supplied", () => {
    const result = computeCIam(undefined);
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED (never 0, never null) when iamProcessesTotal is missing/zero", () => {
    const result = computeCIam({ mode: "homogeneous", poolMax: 10, iamProcessesTotal: 0, source: "test" });
    expect(result.status).toBe("UNDETERMINED");
    if (result.status === "UNDETERMINED") {
      expect(result.reason).toMatch(/iamProcessesTotal/);
    }
  });

  it("returns UNDETERMINED when poolMax is not a positive integer", () => {
    const result = computeCIam({ mode: "homogeneous", poolMax: -5, iamProcessesTotal: 3, source: "test" });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED when the evidence source citation is missing", () => {
    const result = computeCIam({ mode: "homogeneous", poolMax: 10, iamProcessesTotal: 2, source: "" });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED for an empty heterogeneous process list", () => {
    const result = computeCIam({ mode: "heterogeneous", perProcessPoolMax: [], source: "test" });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED when any heterogeneous entry is not a positive integer", () => {
    const result = computeCIam({ mode: "heterogeneous", perProcessPoolMax: [10, -1, 5], source: "test" });
    expect(result.status).toBe("UNDETERMINED");
  });
});

describe("computeCIam — homogeneous arithmetic", () => {
  it("C_iam = poolMax x iamProcessesTotal", () => {
    const result = computeCIam({ mode: "homogeneous", poolMax: 5, iamProcessesTotal: 3, source: "test-evidence" });
    expect(result).toEqual({ status: "DETERMINED", value: 15, mode: "homogeneous" });
  });

  it("a single evidenced local process (the only current repository observation) yields C_iam = poolMax", () => {
    const result = computeCIam({ mode: "homogeneous", poolMax: 10, iamProcessesTotal: 1, source: "observed_local_process" });
    expect(result).toEqual({ status: "DETERMINED", value: 10, mode: "homogeneous" });
  });
});

describe("computeCIam — heterogeneous arithmetic", () => {
  it("C_iam = sum of each process's own effective pool max", () => {
    const result = computeCIam({ mode: "heterogeneous", perProcessPoolMax: [5, 7, 3], source: "test-evidence" });
    expect(result).toEqual({ status: "DETERMINED", value: 15, mode: "heterogeneous" });
  });
});

describe("capacity.ts — no embedded production numeric constants", () => {
  it("contains no integer literal of two or more digits outside comments (every number must be caller-supplied)", () => {
    const source = readFileSync(resolve(import.meta.dirname, "..", "..", "perf", "src", "capacity.ts"), "utf8");
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const twoPlusDigitIntegers = stripped.match(/\b\d{2,}\b/g) ?? [];
    expect(twoPlusDigitIntegers).toEqual([]);
  });
});
