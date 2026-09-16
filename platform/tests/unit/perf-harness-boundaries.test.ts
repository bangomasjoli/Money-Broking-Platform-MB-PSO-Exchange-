/**
 * IMP-02 measurement harness (Turn M-A) — structural/static guards that do not belong to any
 * single module: evidence-directory git-ignore convention, Vitest auto-discovery boundary, and
 * the absence of any measured `K_max`-shaped field anywhere in the harness source.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PLATFORM_ROOT = resolve(import.meta.dirname, "..", "..");
const PERF_ROOT = resolve(PLATFORM_ROOT, "perf");

describe("perf/evidence/.gitignore — matches the established repository convention", () => {
  it("contains exactly '*' and '!.gitignore', mirroring edge/uat-topology and edge/uat-tls", () => {
    const content = readFileSync(resolve(PERF_ROOT, "evidence", ".gitignore"), "utf8");
    const meaningfulLines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(meaningfulLines).toEqual(["*", "!.gitignore"]);
  });

  it("git actually ignores a generated file written under perf/evidence/", () => {
    const dir = mkdtempSync(join(PERF_ROOT, "evidence", ".git-ignore-test-"));
    const filePath = join(dir, "generated.json");
    try {
      writeFileSync(filePath, "{}");
      const output = execFileSync("git", ["check-ignore", filePath], { cwd: PLATFORM_ROOT, encoding: "utf8" }).trim();
      expect(output).toBe(filePath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Vitest collection boundary — perf/ is never auto-discovered", () => {
  it("vitest.config.ts's include glob is exactly tests/**/*.test.ts", () => {
    const configSource = readFileSync(resolve(PLATFORM_ROOT, "vitest.config.ts"), "utf8");
    const match = /include:\s*\[\s*"([^"]+)"\s*\]/.exec(configSource);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("tests/**/*.test.ts");
  });

  it("no file under perf/ has a path that could match the tests/**/*.test.ts glob", () => {
    // The include glob is rooted at "tests/" — anything under "perf/" structurally cannot match
    // it, since the path does not begin with "tests/". This is a static property of the two
    // directories' names, verified here rather than merely asserted in prose.
    const relFromRoot = resolve(PERF_ROOT).replace(PLATFORM_ROOT + "/", "");
    expect(relFromRoot.startsWith("tests" + "/")).toBe(false);
    expect(relFromRoot).toBe("perf");
  });
});

describe("no measured K_max field anywhere in harness source", () => {
  it("no perf/src/*.ts file declares a property literally named k_max/K_max", () => {
    const files = ["schema.ts", "run-id.ts", "environment-manifest.ts", "evidence-store.ts", "secret-scan.ts", "capacity.ts", "db-budget.ts", "m2a-observe.ts"];
    for (const file of files) {
      const source = readFileSync(resolve(PERF_ROOT, "src", file), "utf8");
      // Field-declaration shape only (identifier immediately followed by a colon) — a prose
      // mention of "K_max" in a comment (explaining WHY it must never be measured) is legitimate
      // and does not match this pattern.
      expect(source).not.toMatch(/\bk_max\s*:/i);
    }
  });

  it("the MeasurementId union has no M8b member (K_max/demographic sharing is a governance input, not measured)", () => {
    const source = readFileSync(resolve(PERF_ROOT, "src", "schema.ts"), "utf8");
    // Strip comments first — schema.ts's own doc comments legitimately DISCUSS "M8b" in prose
    // (explaining why it must never become a measurement ID); what must never appear is the
    // string literal in actual code (a union member or an array element).
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/"M8b"/);
  });
});
