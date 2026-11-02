/**
 * AIX-CI-001 — self-test (positive and negative controls) for verify-vitest-report.mjs.
 *
 * Run: node --test ci/verify-vitest-report.selftest.mjs   (from platform/)
 *
 * The reports are produced by REAL `vitest run --reporter=json` executions of throwaway test files
 * written to a temporary directory, so the controls track the installed Vitest's actual report
 * format. Nothing here touches a database or any repository test.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CI_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(CI_DIR, "..");
const VITEST = join(PLATFORM_DIR, "node_modules", ".bin", "vitest");
const VERIFIER = join(CI_DIR, "verify-vitest-report.mjs");

let work;
before(() => {
  assert.ok(existsSync(VITEST), `vitest binary not found at ${VITEST}; run npm ci in platform/ first`);
  work = mkdtempSync(join(tmpdir(), "aix-ci-verifier-"));
});
after(() => rmSync(work, { recursive: true, force: true }));

const cleanEnv = () => {
  const env = { ...process.env, CI: "true" };
  delete env.TEST_DATABASE_URL;
  return env;
};

/** Runs real Vitest over `source` (one test file) and returns { vitestExit, report }. */
function realVitestRun(name, source) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sample.test.ts"), source);
  const report = join(dir, "report.json");
  const r = spawnSync(VITEST, ["run", "--root", dir, "--globals", "--reporter=json", `--outputFile=${report}`], {
    cwd: dir,
    env: cleanEnv(),
    encoding: "utf8",
  });
  return { vitestExit: r.status, report };
}

function verify(reportPath, ...extra) {
  const r = spawnSync(process.execPath, [VERIFIER, "--report", reportPath, ...extra], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test("CONTROL 1 (positive): a real report with real passed tests is verified", () => {
  const { vitestExit, report } = realVitestRun("pass", `
    describe("sample", () => {
      it("adds", () => { expect(1 + 1).toBe(2); });
      it("concats", () => { expect("a" + "b").toBe("ab"); });
    });`);
  assert.equal(vitestExit, 0);
  const v = verify(report, "--expect-file", "sample.test.ts", "--min-passed", "2");
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /VERIFIED/);
  assert.match(v.out, /passed=2 failed=0 skipped=0/);
});

test("CONTROL 2 (negative): an all-skipped report is REJECTED even though Vitest itself exits 0", () => {
  const { vitestExit, report } = realVitestRun("skipped", `
    describe("sample", () => {
      it.skip("a database test that was skipped", () => {});
      it.skip("another skipped test", () => {});
    });`);
  assert.equal(vitestExit, 0, "premise: Vitest exits 0 for an all-skipped run, which is why the exit code alone is not trusted");
  const v = verify(report, "--expect-file", "sample.test.ts");
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /SKIPPED test|PENDING test/);
  assert.match(v.out, /only 0 passed/);
});

test("CONTROL 2b (negative): one skipped test among passing tests is REJECTED (no unexpected skips)", () => {
  const { vitestExit, report } = realVitestRun("mixed-skip", `
    it("passes", () => { expect(true).toBe(true); });
    it.skip("skipped", () => {});`);
  assert.equal(vitestExit, 0);
  assert.equal(verify(report).code, 1);
});

test("CONTROL 3 (negative): a report containing a failed test is REJECTED", () => {
  const { vitestExit, report } = realVitestRun("failed", `
    it("passes", () => { expect(true).toBe(true); });
    it("fails", () => { expect(1).toBe(2); });`);
  assert.notEqual(vitestExit, 0);
  const v = verify(report, "--expect-file", "sample.test.ts");
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /FAILED test/);
});

test("CONTROL 4a (negative): a missing report is REJECTED", () => {
  const v = verify(join(work, "does-not-exist.json"));
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /missing/);
});

test("CONTROL 4b (negative): an empty report is REJECTED", () => {
  const p = join(work, "empty.json");
  writeFileSync(p, "");
  const v = verify(p);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /empty/);
});

test("CONTROL 4c (negative): a malformed (non-JSON / truncated) report is REJECTED", () => {
  const p = join(work, "garbage.json");
  writeFileSync(p, '{"numTotalTests": 3, "testResults": [');
  const v = verify(p);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /not valid JSON/);
});

test("CONTROL 4d (negative): valid JSON that is not a Vitest report is REJECTED", () => {
  const p = join(work, "wrong-shape.json");
  writeFileSync(p, JSON.stringify({ success: true }));
  const v = verify(p);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /testResults/);
});

test("CONTROL 5 (negative): the intended test file being absent from an otherwise green report is REJECTED", () => {
  const { report } = realVitestRun("wrong-file", `it("passes", () => { expect(1).toBe(1); });`);
  const v = verify(report, "--expect-file", "tests/integration/iam2-migration-072.test.ts");
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /expected test file did not run/);
});

test("CONTROL 6 (negative): a report whose summary disagrees with its own test records is REJECTED", () => {
  const { report } = realVitestRun("tamper", `it("passes", () => { expect(1).toBe(1); });`);
  const j = JSON.parse(readFileSync(report, "utf8"));
  j.numPassedTests = 99;
  j.numTotalTests = 99;
  const p = join(work, "tampered.json");
  writeFileSync(p, JSON.stringify(j));
  const v = verify(p);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /summary disagrees/);
});

test("CONTROL 7 (negative): a file that collected zero tests is REJECTED", () => {
  const { report } = realVitestRun("zero-assertions", `it("passes", () => { expect(1).toBe(1); });`);
  const j = JSON.parse(readFileSync(report, "utf8"));
  j.testResults.push({ name: "/x/tests/unit/empty.test.ts", status: "passed", assertionResults: [] });
  const p = join(work, "zero.json");
  writeFileSync(p, JSON.stringify(j));
  const v = verify(p);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /contributed no tests/);
});

test("--only-under rejects a file from an unexpected directory", () => {
  const { report } = realVitestRun("outside", `it("passes", () => { expect(1).toBe(1); });`);
  const v = verify(report, "--only-under", "tests/unit");
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /outside \/tests\/unit\//);
});

test("--only-expected rejects an extra test file in the report and accepts the exact set", () => {
  const { report } = realVitestRun("only-expected", `it("passes", () => { expect(1).toBe(1); });`);
  const j = JSON.parse(readFileSync(report, "utf8"));
  const extra = JSON.parse(JSON.stringify(j.testResults[0]));
  extra.name = "/x/tests/integration/other.test.ts";
  j.testResults.push(extra);
  j.numTotalTests *= 2;
  j.numPassedTests *= 2;
  const p = join(work, "extra-file.json");
  writeFileSync(p, JSON.stringify(j));
  const bad = verify(p, "--expect-file", "sample.test.ts", "--only-expected");
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /unexpected test file ran/);
  const good = verify(report, "--expect-file", "sample.test.ts", "--only-expected");
  assert.equal(good.code, 0, good.out);
});

test("usage errors exit 2, not 0", () => {
  const r = spawnSync(process.execPath, [VERIFIER], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
