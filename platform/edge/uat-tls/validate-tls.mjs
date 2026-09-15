#!/usr/bin/env node
/**
 * IMP-02 Turn C — UAT TLS termination — Tier 2 validation. Runs the ACTUAL `haproxy -c` config
 * validator (never a syntax re-implementation) against the base+UAT config in both TLS-disabled
 * and TLS-enabled modes, proving the guarded bind structure genuinely works and fails closed —
 * exactly as platform/edge/validate.mjs (Turn A) does for the HTTP-only config.
 *
 * Imports validate.mjs's exported helpers (readPinnedVersion, verifyPinnedVersion, etc.) rather
 * than duplicating the version-pin logic or the VERSION file's value — platform/edge/VERSION
 * remains the single source of truth. validate.mjs itself is NOT modified by this file.
 *
 * ADDITIONALLY verifies the binary reports genuine OpenSSL/TLS build capability via `haproxy -vv`
 * — a green `-c` from a binary built WITHOUT USE_OPENSSL would otherwise validate the TLS-mode
 * config's syntax while being structurally incapable of ever terminating a real TLS connection.
 *
 * Process lifecycle only — no live TLS handshake is exercised here (that is Tier 3, driven by
 * tls-verify.sh). Deliberately kept outside Vitest, matching this repository's established
 * convention (validate.mjs, edge:validate).
 *
 * Requires a HAProxy binary built with USE_OPENSSL=1, reporting the exact version pinned in
 * platform/edge/VERSION. Set HAPROXY_BIN to its path. No HAProxy is bundled with, or installed
 * by, this repository or this script.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { verifyPinnedVersion } from "../validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const edgeRoot = join(here, "..");
const base = join(edgeRoot, "haproxy.base.cfg");
const limits = join(edgeRoot, "uat", "haproxy.limits.cfg");
const productionDir = join(edgeRoot, "production");

const haproxyBin = process.env.HAPROXY_BIN || "haproxy";

const VALID_ENV = {
  WLT1_PUBLIC_PERIMETER_TOKEN: "validation-only-dummy-token-NOT-A-REAL-SECRET-0123456789",
  EDGE_BODY_LIMIT_BYTES: "65536",
  EDGE_HEADER_TIMEOUT: "5s",
  EDGE_IDLE_TIMEOUT: "30s",
  EDGE_CONN_LIMIT_PER_BUCKET: "50",
  EDGE_BIND_ADDR: "127.0.0.1",
  EDGE_BIND_PORT: "18443",
  EDGE_WLT1_UPSTREAM_ADDR: "127.0.0.1:8090",
};

/** Verifies -vv reports +OPENSSL — a binary without TLS capability must never pass this gate. */
function verifyOpenSslCapability() {
  const probe = spawnSync(haproxyBin, ["-vv"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    console.error(`validate-tls: "${haproxyBin} -vv" failed (status=${probe.status})`);
    return false;
  }
  const output = (probe.stdout ?? "") + (probe.stderr ?? "");
  if (!/\bFeature list[^\n]*\+OPENSSL\b/.test(output) && !/\+OPENSSL\b/.test(output)) {
    console.error(`validate-tls: "${haproxyBin} -vv" does not report +OPENSSL capability`);
    return false;
  }
  if (!/Built with OpenSSL version/i.test(output)) {
    console.error(`validate-tls: "${haproxyBin} -vv" does not report a built-against OpenSSL version`);
    return false;
  }
  console.log("[PASS] HAProxy binary reports genuine OpenSSL/TLS build capability (+OPENSSL)");
  return true;
}

/** Generates a throwaway, minimal self-signed cert for config-parse checks only (never used to
 * serve traffic) — validate-tls.mjs proves the CONFIG accepts a cert path, not TLS behaviour. */
function makeThrowawayCert(dir) {
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const combined = join(dir, "combined.pem");
  const r = spawnSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
      "-keyout", key, "-out", cert, "-days", "1", "-nodes", "-subj", "/CN=validate-tls-throwaway",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  writeFileSync(combined, readFileSync(cert, "utf8") + readFileSync(key, "utf8"));
  return combined;
}

function runCheck(name, files, env, expect) {
  const args = ["-c"];
  for (const f of files) args.push("-f", f);
  const result = spawnSync(haproxyBin, args, { encoding: "utf8", env: { ...process.env, ...env } });
  const passed = expect === "pass" ? result.status === 0 : result.status !== 0;
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} (expected ${expect}, exit=${result.status})`);
  if (!passed) {
    console.log(
      "  --- haproxy output ---\n" +
        (result.stdout + result.stderr).split("\n").map((l) => "  " + l).join("\n"),
    );
  }
  return passed;
}

function main() {
  if (!existsSync(base) || !existsSync(limits)) {
    console.error(`validate-tls: expected config files not found (${base}, ${limits})`);
    process.exit(1);
  }

  if (!verifyPinnedVersion()) process.exit(1);
  if (!verifyOpenSslCapability()) process.exit(1);

  // Production config absence is a frozen invariant of this pack — re-asserted here so a TLS
  // implementation turn cannot silently be the one that first lands a production .cfg.
  const productionCfgExists =
    existsSync(productionDir) && readdirSync(productionDir).some((f) => f.endsWith(".cfg"));
  console.log(
    productionCfgExists
      ? "[FAIL] no *.cfg file must exist under platform/edge/production/"
      : "[PASS] no *.cfg file exists under platform/edge/production/",
  );

  const tmpDir = mkdtempSync(join(tmpdir(), "imp02-tls-validate-"));
  const cert = makeThrowawayCert(tmpDir);
  if (!cert) {
    console.error("validate-tls: failed to generate a throwaway certificate for config checks");
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  const checks = [
    () => runCheck("TLS-disabled: base + uat/limits, EDGE_TLS_ENABLED unset", [base, limits], VALID_ENV, "pass"),
    () =>
      runCheck(
        "TLS-enabled: base + uat/limits, valid EDGE_TLS_CRT_PATH",
        [base, limits],
        { ...VALID_ENV, EDGE_TLS_ENABLED: "1", EDGE_TLS_CRT_PATH: cert },
        "pass",
      ),
    () =>
      runCheck(
        "TLS-enabled: base + uat/limits, EDGE_TLS_CRT_PATH missing (fail-closed)",
        [base, limits],
        { ...VALID_ENV, EDGE_TLS_ENABLED: "1" },
        "fail",
      ),
    () =>
      runCheck(
        "TLS-enabled: EDGE_TLS_ENABLED=false is STILL a presence flag (fail-closed without cert)",
        [base, limits],
        { ...VALID_ENV, EDGE_TLS_ENABLED: "false" },
        "fail",
      ),
  ];

  const results = checks.map((c) => c());
  rmSync(tmpDir, { recursive: true, force: true });

  const allPassed = results.every(Boolean) && !productionCfgExists;
  console.log(allPassed ? "\nvalidate-tls: ALL CHECKS PASSED" : "\nvalidate-tls: FAILED");
  process.exit(allPassed ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
