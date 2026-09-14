#!/usr/bin/env node
/**
 * IMP-02 UAT trusted edge — Tier 2 validation. Runs the ACTUAL `haproxy -c` config validator
 * (never a syntax re-implementation) against this directory's base+UAT config, proving both the
 * positive case (valid, fully-configured) and the required negative cases (deliberately
 * incomplete configurations must fail closed).
 *
 * Before any config check runs, this script ALSO verifies that HAPROXY_BIN genuinely reports the
 * exact governed core version recorded in platform/edge/VERSION (E2 remediation). Every C1-C10
 * capability this repository's config relies on was verified against that exact pinned version
 * (see platform/edge/README.md) — a green `haproxy -c` against a DIFFERENT binary proves nothing
 * about the pinned reference, and silent capability drift would go unnoticed. VERSION is read
 * here, not duplicated as a second hard-coded constant, so the file remains the single source of
 * truth an implementation-turn edit to VERSION cannot silently desynchronize from.
 *
 * Process lifecycle only — no HTTP behaviour is exercised here (that is Tier 3,
 * tests/integration/imp02-edge-live.test.ts). Deliberately kept outside Vitest, matching this
 * repository's established convention of never spawning `child_process` from a test file.
 *
 * Requires a HAProxy binary reporting the exact version pinned in VERSION. Set HAPROXY_BIN to its
 * path, or have `haproxy` on PATH. No HAProxy is bundled with, or installed by, this repository
 * or this script.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "haproxy.base.cfg");
const limits = join(here, "uat", "haproxy.limits.cfg");
const versionFile = join(here, "VERSION");

const haproxyBin = process.env.HAPROXY_BIN || "haproxy";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
// Anchored, structured extraction of HAProxy's own self-reported core version — never a bare
// substring search. Matches "HAProxy version 3.0.27 ..." and "HAProxy version 3.0.27-a2b09cd ...";
// the build-hash/pre-release suffix after the core X.Y.Z is deliberately excluded from the
// captured/compared value. A line not starting with the literal "HAProxy version " prefix (e.g.
// "not-haproxy 3.0.27") never matches.
const HAPROXY_VERSION_LINE_RE = /^HAProxy version (\d+\.\d+\.\d+)(?:-\S+)?\s/m;

/**
 * Reads platform/edge/VERSION and validates it is a bare semver core (X.Y.Z). Fails closed (no
 * warning-only path) on a missing or malformed file — never returns an unusable value.
 */
function readPinnedVersion() {
  if (!existsSync(versionFile)) {
    console.error(`edge:validate: VERSION file not found at ${versionFile}`);
    return null;
  }
  const raw = readFileSync(versionFile, "utf8").trim();
  if (!SEMVER_RE.test(raw)) {
    console.error(
      `edge:validate: VERSION file content is malformed: "${raw}" (expected a bare ` +
        `semver core, e.g. "3.0.27", with no leading "v", build suffix, or extra text)`,
    );
    return null;
  }
  return raw;
}

/**
 * Runs `<haproxyBin> -v` and extracts the reported core version via the anchored regex above.
 * Returns { ok: true, version, rawOutput } or { ok: false, reason, rawOutput }.
 */
function getHaproxyReportedVersion() {
  const probe = spawnSync(haproxyBin, ["-v"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    return {
      ok: false,
      reason: `execution of "${haproxyBin} -v" failed (status=${probe.status}, error=${probe.error?.code ?? "none"})`,
      rawOutput: (probe.stdout ?? "") + (probe.stderr ?? ""),
    };
  }
  const output = (probe.stdout ?? "") + (probe.stderr ?? "");
  const match = output.match(HAPROXY_VERSION_LINE_RE);
  if (!match) {
    return {
      ok: false,
      reason: `could not parse a "HAProxy version X.Y.Z" line from "${haproxyBin} -v" output`,
      rawOutput: output,
    };
  }
  return { ok: true, version: match[1], rawOutput: output };
}

/**
 * Fail-closed version-pin gate (E2). Returns true only if HAPROXY_BIN genuinely reports the exact
 * core version recorded in VERSION. On any failure, prints a clear diagnostic and returns false —
 * callers must treat that as fatal and must NOT proceed to run config checks against the
 * unverified binary.
 */
function verifyPinnedVersion() {
  const pinned = readPinnedVersion();
  if (pinned === null) return false;

  const reported = getHaproxyReportedVersion();
  if (!reported.ok) {
    console.error(`edge:validate: version verification failed — ${reported.reason}`);
    if (reported.rawOutput.trim()) {
      console.error(
        "  --- raw output ---\n" +
          reported.rawOutput
            .trim()
            .split("\n")
            .map((l) => "  " + l)
            .join("\n"),
      );
    }
    return false;
  }

  if (reported.version !== pinned) {
    console.error(
      `edge:validate: HAProxy version mismatch — VERSION pins "${pinned}", but ` +
        `"${haproxyBin}" reports "${reported.version}". Every capability this config relies on ` +
        `was verified against exactly ${pinned}; a different binary is not an accepted ` +
        `substitute. Set HAPROXY_BIN to a binary reporting exactly ${pinned}, or update VERSION ` +
        `only via a controlled governance turn.`,
    );
    return false;
  }

  console.log(`[PASS] HAProxy version pin (VERSION=${pinned}, reported=${reported.version})`);
  return true;
}

// Dummy values for VALIDATION ONLY — never used to serve real traffic. Mirrors
// platform/edge/uat/.env.example's documented values; the perimeter token here is explicitly
// NOT a real secret.
const VALID_ENV = {
  WLT1_PUBLIC_PERIMETER_TOKEN: "validation-only-dummy-token-NOT-A-REAL-SECRET-0123456789",
  EDGE_BODY_LIMIT_BYTES: "65536",
  EDGE_HEADER_TIMEOUT: "5s",
  EDGE_IDLE_TIMEOUT: "30s",
  EDGE_CONN_LIMIT_PER_BUCKET: "50",
  EDGE_BIND_ADDR: "127.0.0.1",
  EDGE_BIND_PORT: "18080",
  EDGE_WLT1_UPSTREAM_ADDR: "127.0.0.1:8090",
};

function runCheck(name, files, env, expect) {
  const args = ["-c"];
  for (const f of files) args.push("-f", f);
  const result = spawnSync(haproxyBin, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const passed = expect === "pass" ? result.status === 0 : result.status !== 0;
  const status = passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${name} (expected ${expect}, exit=${result.status})`);
  if (!passed) {
    console.log("  --- haproxy output ---");
    console.log(
      (result.stdout + result.stderr)
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  }
  return passed;
}

function main() {
  if (!existsSync(base) || !existsSync(limits)) {
    console.error(`edge:validate: expected config files not found (${base}, ${limits})`);
    process.exit(1);
  }

  // E2 gate: verify the binary's identity BEFORE trusting anything else it reports. A `-c` PASS
  // from the wrong version would be a false signal, not a weaker one — so this is fatal, not a
  // warning, and no config check below runs if it fails.
  if (!verifyPinnedVersion()) {
    process.exit(1);
  }

  const checks = [
    // Positive: base + UAT limits, full required environment.
    () => runCheck("base + uat/limits, full env", [base, limits], VALID_ENV, "pass"),
    // Negative: base alone must fail (limits file not loaded).
    () => runCheck("base alone", [base], VALID_ENV, "fail"),
    // Negative: missing perimeter token must fail closed.
    () =>
      runCheck(
        "base + uat/limits, missing WLT1_PUBLIC_PERIMETER_TOKEN",
        [base, limits],
        { ...VALID_ENV, WLT1_PUBLIC_PERIMETER_TOKEN: undefined },
        "fail",
      ),
    // Negative: missing upstream address must fail closed.
    () =>
      runCheck(
        "base + uat/limits, missing EDGE_WLT1_UPSTREAM_ADDR",
        [base, limits],
        { ...VALID_ENV, EDGE_WLT1_UPSTREAM_ADDR: undefined },
        "fail",
      ),
    // Negative: missing body-limit value must fail closed (REQUIRED BUT UNAPPROVED guard).
    () =>
      runCheck(
        "base + uat/limits, missing EDGE_BODY_LIMIT_BYTES",
        [base, limits],
        { ...VALID_ENV, EDGE_BODY_LIMIT_BYTES: undefined },
        "fail",
      ),
  ];

  const results = checks.map((c) => c());
  const allPassed = results.every(Boolean);

  console.log(allPassed ? "\nedge:validate: ALL CHECKS PASSED" : "\nedge:validate: FAILED");
  process.exit(allPassed ? 0 : 1);
}

// Only run as a CLI entry point (`node edge/validate.mjs` / `npm run edge:validate`) — importing
// this module for its exported helpers (as the Tier-1 static test suite does) must not trigger a
// live haproxy invocation or a process.exit() as a side effect of import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { readPinnedVersion, getHaproxyReportedVersion, verifyPinnedVersion, SEMVER_RE, HAPROXY_VERSION_LINE_RE };
