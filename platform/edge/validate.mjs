#!/usr/bin/env node
/**
 * IMP-02 UAT trusted edge — Tier 2 validation. Runs the ACTUAL `haproxy -c` config validator
 * (never a syntax re-implementation) against this directory's base+UAT config, proving both the
 * positive case (valid, fully-configured) and the required negative cases (deliberately
 * incomplete configurations must fail closed).
 *
 * Process lifecycle only — no HTTP behaviour is exercised here (that is Tier 3,
 * tests/integration/imp02-edge-live.test.ts). Deliberately kept outside Vitest, matching this
 * repository's established convention of never spawning `child_process` from a test file.
 *
 * Requires a HAProxy 3.0.27 binary. Set HAPROXY_BIN to its path, or have `haproxy` on PATH.
 * No HAProxy is bundled with, or installed by, this repository or this script.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "haproxy.base.cfg");
const limits = join(here, "uat", "haproxy.limits.cfg");

const haproxyBin = process.env.HAPROXY_BIN || "haproxy";

function haproxyAvailable() {
  const probe = spawnSync(haproxyBin, ["-v"], { encoding: "utf8" });
  return probe.status === 0;
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

  if (!haproxyAvailable()) {
    console.error(
      `edge:validate: no HAProxy binary found (tried "${haproxyBin}"). Set HAPROXY_BIN to an ` +
        `exact HAProxy 3.0.27 binary path, or install one on PATH. See platform/edge/README.md.`,
    );
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

main();
