/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/db-budget.ts`, the pure PostgreSQL
 * global-capacity budget calculator (architecture §17). Covers: requires explicit inputs (no
 * "all services = 10" assumption embedded anywhere), never emits a recommended pool value, and
 * has no embedded production numeric constant.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateDbBudget } from "../../perf/src/db-budget.js";

describe("evaluateDbBudget — requires explicit inputs", () => {
  it("returns UNDETERMINED when no input is supplied", () => {
    expect(evaluateDbBudget(undefined).status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED when maxConnections is missing/invalid", () => {
    const result = evaluateDbBudget({
      maxConnections: 0,
      reservedConnections: 3,
      adminAllowance: 5,
      serviceDemands: [{ service: "iam", poolMax: 10, processCount: 1 }],
    });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED when serviceDemands is empty (no service demand assumed)", () => {
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 3,
      adminAllowance: 5,
      serviceDemands: [],
    });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("returns UNDETERMINED when a service entry omits processCount", () => {
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 3,
      adminAllowance: 5,
      // @ts-expect-error — deliberately malformed for this test
      serviceDemands: [{ service: "iam", poolMax: 10 }],
    });
    expect(result.status).toBe("UNDETERMINED");
  });

  it("does NOT assume a default pool max for any service — an explicit demand list is always required", () => {
    // There is no code path by which evaluateDbBudget can produce a DETERMINED result from
    // maxConnections/reservedConnections/adminAllowance alone; serviceDemands is mandatory and
    // non-defaultable. This test documents that property directly.
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 3,
      adminAllowance: 5,
      serviceDemands: [],
    });
    expect(result.status).toBe("UNDETERMINED");
  });
});

describe("evaluateDbBudget — arithmetic", () => {
  it("computes total demand, slack, and withinBudget correctly for a determined case", () => {
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 3,
      adminAllowance: 7,
      serviceDemands: [
        { service: "iam", poolMax: 10, processCount: 1 },
        { service: "wlt1", poolMax: 10, processCount: 1 },
        { service: "fnd", poolMax: 10, processCount: 1 },
      ],
    });
    expect(result.status).toBe("DETERMINED");
    if (result.status === "DETERMINED") {
      expect(result.totalDeclaredDemand).toBe(30);
      expect(result.slack).toBe(100 - 3 - 7 - 30);
      expect(result.withinBudget).toBe(true);
      expect(result.perServiceDemand).toEqual([
        { service: "iam", demand: 10 },
        { service: "wlt1", demand: 10 },
        { service: "fnd", demand: 10 },
      ]);
    }
  });

  it("reports withinBudget: false and a negative slack when declared demand exceeds the ceiling", () => {
    const result = evaluateDbBudget({
      maxConnections: 20,
      reservedConnections: 3,
      adminAllowance: 2,
      serviceDemands: [{ service: "iam", poolMax: 40, processCount: 1 }],
    });
    expect(result.status).toBe("DETERMINED");
    if (result.status === "DETERMINED") {
      expect(result.withinBudget).toBe(false);
      expect(result.slack).toBeLessThan(0);
    }
  });

  it("multiplies poolMax by processCount per service, not merely sums pool maxes", () => {
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 0,
      adminAllowance: 0,
      serviceDemands: [{ service: "iam", poolMax: 10, processCount: 4 }],
    });
    expect(result.status).toBe("DETERMINED");
    if (result.status === "DETERMINED") {
      expect(result.totalDeclaredDemand).toBe(40);
    }
  });
});

describe("evaluateDbBudget — never emits a recommended pool value", () => {
  it("the DETERMINED result shape contains no field whose name suggests a recommendation", () => {
    const result = evaluateDbBudget({
      maxConnections: 100,
      reservedConnections: 3,
      adminAllowance: 5,
      serviceDemands: [{ service: "iam", poolMax: 10, processCount: 1 }],
    });
    expect(result.status).toBe("DETERMINED");
    const keys = Object.keys(result);
    expect(keys.some((k) => /recommend/i.test(k))).toBe(false);
  });
});

describe("db-budget.ts — no embedded production numeric constants", () => {
  it("contains no integer literal of two or more digits outside comments (every number must be caller-supplied)", () => {
    const source = readFileSync(resolve(import.meta.dirname, "..", "..", "perf", "src", "db-budget.ts"), "utf8");
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const twoPlusDigitIntegers = stripped.match(/\b\d{2,}\b/g) ?? [];
    expect(twoPlusDigitIntegers).toEqual([]);
  });
});
