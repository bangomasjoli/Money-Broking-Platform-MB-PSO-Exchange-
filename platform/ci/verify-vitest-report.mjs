#!/usr/bin/env node
/**
 * AIX-CI-001 — fail-loud verifier for a Vitest JSON report.
 *
 * Vitest exiting 0 is NOT accepted as proof that tests ran: a suite that is skipped because its
 * environment is not configured, a filter that matches nothing, or a collected-but-empty file can
 * all exit 0. This script reads the report written by `vitest run --reporter=json` and exits
 * non-zero unless the report is present, well-formed, internally consistent and shows real,
 * passed tests.
 *
 *   node ci/verify-vitest-report.mjs --report <path>
 *        [--expect-file <repo path suffix>]...   file(s) that MUST appear, each with >=1 passed test
 *        [--only-expected]                       no file other than the --expect-file set may appear
 *        [--only-under <dir>]                    every file in the report must live under /<dir>/
 *        [--min-passed <n>]                      minimum number of passed tests (default 1)
 *
 * Exit codes: 0 verified, 1 verification failed, 2 usage error.
 * Node built-ins only; no repository dependency.
 */
import { readFileSync, appendFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PASSED = "passed";
const FAILED = "failed";
const SKIPPED_LIKE = new Set(["skipped", "pending", "todo", "disabled"]);

/** Reads and parses the report. Throws an Error whose message states exactly what is wrong. */
export function loadReport(path) {
  let st;
  try {
    st = statSync(path);
  } catch (err) {
    throw new Error(`test-result report is missing: ${path} (${err.code ?? err.message})`);
  }
  if (!st.isFile()) throw new Error(`test-result report path is not a file: ${path}`);
  if (st.size === 0) throw new Error(`test-result report is empty: ${path}`);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`test-result report is unreadable: ${path} (${err.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`test-result report is not valid JSON: ${path} (${err.message})`);
  }
}

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const norm = (p) => String(p).replace(/\\/g, "/");

/**
 * Verifies a parsed report. Never throws for a bad report; returns { ok, errors, stats }.
 * @param {unknown} report
 * @param {{ expectFiles?: string[], onlyExpected?: boolean, onlyUnder?: string, minPassed?: number }} [opts]
 */
export function verifyReport(report, opts = {}) {
  const errors = [];
  const stats = { files: 0, total: 0, passed: 0, failed: 0, skipped: 0 };
  const expectFiles = opts.expectFiles ?? [];
  const minPassed = Math.max(1, opts.minPassed ?? 1);

  // --- shape: reject anything that is not a Vitest/Jest-style JSON report ---------------------
  if (!isObj(report)) return { ok: false, errors: ["report is not a JSON object"], stats };
  if (!Array.isArray(report.testResults)) {
    return { ok: false, errors: ["report has no `testResults` array (malformed or not a Vitest JSON report)"], stats };
  }
  for (const k of ["numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests"]) {
    if (!Number.isInteger(report[k]) || report[k] < 0) errors.push(`report summary field ${k} is missing or not a non-negative integer`);
  }
  if (typeof report.success !== "boolean") errors.push("report summary field `success` is missing or not a boolean");
  if (errors.length > 0) return { ok: false, errors, stats };

  // --- per-file / per-test tally, recomputed from the individual records ---------------------
  const files = [];
  let todo = 0;
  report.testResults.forEach((f, i) => {
    if (!isObj(f) || typeof f.name !== "string" || !Array.isArray(f.assertionResults)) {
      errors.push(`testResults[${i}] is malformed (needs string \`name\` and array \`assertionResults\`)`);
      return;
    }
    const entry = { name: norm(f.name), status: f.status, passed: 0, failed: 0, skipped: 0 };
    f.assertionResults.forEach((a, j) => {
      if (!isObj(a) || typeof a.status !== "string") {
        errors.push(`${entry.name}: assertionResults[${j}] is malformed (no string \`status\`)`);
        return;
      }
      const label = a.fullName ?? a.title ?? `#${j}`;
      if (a.status === PASSED) entry.passed++;
      else if (a.status === FAILED) {
        entry.failed++;
        errors.push(`FAILED test: ${entry.name} :: ${label}`);
      } else if (SKIPPED_LIKE.has(a.status)) {
        entry.skipped++;
        if (a.status === "todo") todo++;
        errors.push(`${a.status.toUpperCase()} test (skips are not accepted): ${entry.name} :: ${label}`);
      } else {
        errors.push(`unrecognised test status "${a.status}": ${entry.name} :: ${label}`);
      }
    });
    if (f.status !== PASSED) errors.push(`test file did not pass (status "${f.status}"): ${entry.name}${f.message ? ` — ${String(f.message).slice(0, 300)}` : ""}`);
    if (f.assertionResults.length === 0) errors.push(`test file contributed no tests (failed to collect, or everything filtered out): ${entry.name}`);
    files.push(entry);
  });
  stats.files = files.length;
  stats.passed = files.reduce((n, f) => n + f.passed, 0);
  stats.failed = files.reduce((n, f) => n + f.failed, 0);
  stats.skipped = files.reduce((n, f) => n + f.skipped, 0);
  stats.total = stats.passed + stats.failed + stats.skipped;

  // --- the report's own summary must agree with the records (detects truncation / tampering) --
  const pending = stats.skipped - todo;
  const sums = [
    ["numTotalTests", report.numTotalTests, stats.total],
    ["numPassedTests", report.numPassedTests, stats.passed],
    ["numFailedTests", report.numFailedTests, stats.failed],
    ["numPendingTests", report.numPendingTests, pending],
  ];
  for (const [k, claimed, actual] of sums) {
    if (claimed !== actual) errors.push(`report summary disagrees with its own test records: ${k}=${claimed} but records give ${actual}`);
  }
  if (report.success !== true) errors.push("report says success=false");

  // --- the run must actually have executed tests ---------------------------------------------
  if (stats.files === 0) errors.push("report contains no test files");
  if (stats.passed < minPassed) errors.push(`only ${stats.passed} passed test(s); at least ${minPassed} required`);

  // --- the intended file(s) must have run ----------------------------------------------------
  for (const expected of expectFiles.map(norm)) {
    const hits = files.filter((f) => f.name === expected || f.name.endsWith("/" + expected));
    if (hits.length === 0) errors.push(`expected test file did not run (absent from report): ${expected}`);
    else if (hits.length > 1) errors.push(`expected test file is ambiguous (${hits.length} matches): ${expected}`);
    else if (hits[0].passed < 1) errors.push(`expected test file ran but no test passed in it: ${expected}`);
  }
  if (opts.onlyExpected) {
    if (expectFiles.length === 0) errors.push("--only-expected needs at least one --expect-file");
    const wanted = expectFiles.map(norm);
    for (const f of files) {
      if (!wanted.some((w) => f.name === w || f.name.endsWith("/" + w))) errors.push(`unexpected test file ran (only the --expect-file set is allowed): ${f.name}`);
    }
  }
  if (opts.onlyUnder) {
    const dir = "/" + norm(opts.onlyUnder).replace(/^\/+|\/+$/g, "") + "/";
    for (const f of files) if (!f.name.includes(dir)) errors.push(`unexpected test file outside ${dir}: ${f.name}`);
  }

  return { ok: errors.length === 0, errors, stats, files };
}

function parseArgs(argv) {
  const o = { expectFiles: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--report") o.report = v();
    else if (a === "--expect-file") o.expectFiles.push(v());
    else if (a === "--only-under") o.onlyUnder = v();
    else if (a === "--only-expected") o.onlyExpected = true;
    else if (a === "--min-passed") {
      const n = Number(v());
      if (!Number.isInteger(n) || n < 1) throw new Error("--min-passed must be an integer >= 1");
      o.minPassed = n;
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!o.report) throw new Error("--report <path> is required");
  return o;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`usage error: ${err.message}`);
    process.exit(2);
  }
  const lines = [];
  let ok = false;
  try {
    const result = verifyReport(loadReport(args.report), args);
    ok = result.ok;
    const s = result.stats;
    lines.push(`${ok ? "VERIFIED" : "VERIFICATION FAILED"}: ${args.report}`);
    lines.push(`files=${s.files} tests=${s.total} passed=${s.passed} failed=${s.failed} skipped=${s.skipped}`);
    for (const f of result.files ?? []) lines.push(`  ${f.passed}/${f.passed + f.failed + f.skipped} passed  ${f.name}`);
    for (const e of result.errors) lines.push(`  ERROR: ${e}`);
  } catch (err) {
    lines.push(`VERIFICATION FAILED: ${err.message}`);
  }
  const text = lines.length > 40 ? [...lines.slice(0, 3), `  … ${lines.length - 3} more line(s) truncated`, ...lines.filter((l) => l.includes("ERROR:")).slice(0, 30)].join("\n") : lines.join("\n");
  (ok ? console.log : console.error)(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${ok ? "✅" : "❌"} Test-result verification\n\n\`\`\`\n${text}\n\`\`\`\n`);
    } catch {
      /* the summary is a convenience; the exit code is the control */
    }
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
