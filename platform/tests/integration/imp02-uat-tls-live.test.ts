/**
 * IMP-02 Turn C — UAT TLS termination — live behavioural tests.
 *
 * Self-skips unless TEST_TLS_LIVE is set, mirroring this repository's established
 * external-dependency-gated pattern. Requires `./tls-verify.sh` (or
 * `npm run edge:tls:verify`) to have already been run successfully — this file does NOT invoke
 * tls-verify.sh, does NOT manage the Lima guest, and does NOT restart any HAProxy process. It
 * only reads the evidence tls-verify.sh already wrote, exactly the lesson recorded as
 * IMP-02-FIND-007 (a live Vitest test must never own service/process lifecycle).
 *
 *   cd platform/edge/uat-topology && ./topology.sh up
 *   cd ../uat-tls && ./tls-verify.sh
 *   TEST_TLS_LIVE=1 npm test -- imp02-uat-tls-live
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const RUN_LIVE = process.env.TEST_TLS_LIVE;
const TLS_ROOT = join(__dirname, "../../edge/uat-tls");
const EVIDENCE_ROOT = join(TLS_ROOT, "evidence");

let latestEvidenceDir: string | undefined;

describe.skipIf(!RUN_LIVE)("IMP-02 Turn C — live UAT TLS termination proof (TEST_TLS_LIVE)", () => {
  beforeAll(() => {
    // Fail-loud canary: prove tls-verify.sh genuinely ran (produced a fresh evidence directory)
    // rather than this test silently passing because the harness never ran. This test process
    // never invokes tls-verify.sh itself.
    if (!existsSync(EVIDENCE_ROOT)) {
      throw new Error(
        "IMP-02 Turn C fail-loud canary: evidence/ directory does not exist — tls-verify.sh " +
          "did not run. Refusing to silently skip assertions.",
      );
    }
    const dirs = readdirSync(EVIDENCE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (dirs.length === 0) {
      throw new Error(
        "IMP-02 Turn C fail-loud canary: no timestamped evidence directory was produced by " +
          "tls-verify.sh. Refusing to silently skip assertions.",
      );
    }
    latestEvidenceDir = join(EVIDENCE_ROOT, dirs[dirs.length - 1]);
  });

  function readEvidence(filename: string): string {
    const path = join(latestEvidenceDir!, filename);
    if (!existsSync(path)) {
      throw new Error(`expected evidence file missing: ${filename} (tls-verify.sh did not write it)`);
    }
    return readFileSync(path, "utf8");
  }

  it("[canary] tls-verify.sh genuinely executed and built a TLS-capable HAProxy binary", () => {
    const vv = readEvidence("haproxy-vv.txt");
    expect(vv).toMatch(/HAProxy version 3\.0\.27/);
    expect(vv).toMatch(/\+OPENSSL/);
    expect(vv).toMatch(/Built with OpenSSL version/);
  });

  it("libssl-dev and runtime package identities were captured as evidence", () => {
    const devPkg = readEvidence("openssl-dev-package.txt");
    const runtimePkg = readEvidence("openssl-runtime-package.txt");
    expect(devPkg).toMatch(/libssl-dev/);
    expect(runtimePkg.trim().length).toBeGreaterThan(0);
  });

  it("T1: trusted CA + correct hostname yields 401 (TLS handshake succeeded)", () => {
    expect(readEvidence("t1-raw.txt").trim()).toBe("401");
  });

  it("T2: untrusted CA yields transport-layer failure (000), not any HTTP status", () => {
    expect(readEvidence("t2-raw.txt")).toMatch(/^000\b/);
  });

  it("T3: wrong-hostname certificate yields transport-layer failure (000)", () => {
    expect(readEvidence("t3-raw.txt")).toMatch(/^000\b/);
  });

  it("T4: expired certificate yields transport-layer failure (000)", () => {
    expect(readEvidence("t4-raw.txt")).toMatch(/^000\b/);
  });

  it("T5/T6 non-vacuity baseline: the client genuinely completed real TLS1.0 and TLS1.1 handshakes", () => {
    const t5Baseline = readEvidence("t5-baseline.txt");
    const t6Baseline = readEvidence("t6-baseline.txt");
    expect(t5Baseline).toMatch(/TLSv1\s*$/);
    expect(t6Baseline).toMatch(/TLSv1\.1/);
  });

  it("T5: the real governed edge rejects TLS1.0 with a protocol_version alert", () => {
    expect(readEvidence("t5-real.txt")).toMatch(/alert protocol version/);
  });

  it("T6: the real governed edge rejects TLS1.1 with a protocol_version alert", () => {
    expect(readEvidence("t6-real.txt")).toMatch(/alert protocol version/);
  });

  it("T7: TLS1.2 succeeds against the real governed edge", () => {
    expect(readEvidence("t7-real.txt")).toMatch(/Protocol\s*:\s*TLSv1\.2/);
  });

  it("T8: TLS1.3 succeeds against the real governed edge", () => {
    const t8 = readEvidence("t8-real.txt");
    expect(t8).toMatch(/TLSv1\.3/);
  });

  it("certificate public metadata was captured with no private-key marker present", () => {
    const meta = readEvidence("certificate-metadata.txt");
    expect(meta).toMatch(/uat-edge\.aix\.invalid/);
    expect(meta).toMatch(/wrong-host\.aix\.invalid/);
    expect(meta).not.toMatch(/-----BEGIN (EC |RSA )?PRIVATE KEY-----/);
  });

  it("HTTPS WLT positive control: 401 WLT1_AUTH_REQUIRED with full attribution", () => {
    const pos = readEvidence("https-positive-control.txt");
    expect(pos).toMatch(/^HTTP\/[12](\.1)? 401/m);
    expect(pos).toMatch(/WLT1_AUTH_REQUIRED/);
    expect(pos).toMatch(/x-request-id/);
    expect(pos).toMatch(/x-correlation-id/);
    expect(pos).toMatch(/cache-control: no-store/i);
    expect(pos).toMatch(/x-content-type-options: nosniff/i);
  });

  it("Invalid provenance over HTTPS: real WLT 404 NOT_FOUND, attributed (not edge-local)", () => {
    const inv = readEvidence("https-invalid-provenance.txt");
    expect(inv).toMatch(/^HTTP\/[12](\.1)? 404/m);
    expect(inv).toMatch(/NOT_FOUND/);
    expect(inv).toMatch(/x-request-id/);
    expect(inv).toMatch(/x-correlation-id/);
  });

  it("valid token was restored after the invalid-provenance test (401 again)", () => {
    expect(readEvidence("https-restoration-check.txt").trim()).toBe("401");
  });

  it("TLS-enabled perimeter regression: /internal/* still denied (404)", () => {
    expect(readEvidence("tls-internal-denied.txt").trim()).toBe("404");
  });

  it("TLS-enabled perimeter regression: path-confusion (..) still denied (404)", () => {
    expect(readEvidence("tls-dotdot-denied.txt").trim()).toBe("404");
  });

  it("TLS-enabled perimeter regression: client-spoofed perimeter token stripped (still 401)", () => {
    expect(readEvidence("tls-spoofed-header.txt").trim()).toBe("401");
  });

  it("TLS-enabled connection ceiling: 51st connection rejected pre-handshake", () => {
    expect(readEvidence("tls-conn-ceiling.txt")).toMatch(/rejected/i);
  });

  it("A3 regression: ns_client -> WLT backend directly remains a transport-layer failure (000)", () => {
    expect(readEvidence("a3-regression.txt")).toMatch(/^000\b/);
  });

  it("overall verdict file reports PASS", () => {
    expect(readEvidence("verdict.txt").trim()).toBe("PASS");
  });

  it("no private key or real operational credential leaked into any evidence file", () => {
    const dirEntries = readdirSync(latestEvidenceDir!, { withFileTypes: true }).filter((d) => d.isFile());
    for (const entry of dirEntries) {
      const content = readFileSync(join(latestEvidenceDir!, entry.name), "utf8");
      expect(content, `${entry.name} must not contain a private key`).not.toMatch(
        /-----BEGIN (EC |RSA )?PRIVATE KEY-----/,
      );
    }
  });
});
