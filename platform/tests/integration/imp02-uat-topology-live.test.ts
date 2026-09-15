/**
 * IMP-02 Turn B — L2 UAT isolation topology — live behavioural tests.
 *
 * Self-skips unless TEST_TOPOLOGY_LIVE is set, mirroring this repository's established
 * external-dependency-gated pattern (tests/integration/*-real.test.ts, and Turn A's own
 * edge:validate). Requires `./topology.sh up` to have already been run successfully — this file
 * does not manage the Lima guest's lifecycle (no VM/process lifecycle inside Vitest); it invokes
 * the already-committed, already-verified `run-a3.sh` orchestrator exactly the way Tier 2's
 * `edge:validate` invokes the real `haproxy -c` binary — a single synchronous external-process
 * check, not a long-running service managed from within a test.
 *
 * IMPORTANT — why this cannot be a raw HTTP/fetch test like Turn A's Tier 3: the topology's
 * internal networks (10.80.0.0/24, 10.90.0.0/24) exist ONLY inside Lima guest network namespaces
 * and are, by design, not reachable from the macOS host running Vitest — the host has no more
 * route into them than ns_client has into net_backend. The only place these addresses are
 * reachable from is inside the guest's own ns_client, which is exactly what run-a3.sh already
 * exercises via `limactl shell ... ip netns exec ns_client ...`. This test asserts on that
 * script's own machine-readable evidence output rather than reimplementing network calls this
 * process is structurally unable to make.
 *
 *   ./topology.sh up
 *   TEST_TOPOLOGY_LIVE=1 npm test -- imp02-uat-topology-live
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const RUN_LIVE = process.env.TEST_TOPOLOGY_LIVE;
const TOPOLOGY_ROOT = join(__dirname, "../../edge/uat-topology");
const EVIDENCE_ROOT = join(TOPOLOGY_ROOT, "evidence");

let latestEvidenceDir: string | undefined;
let runExitCode: number | undefined;

describe.skipIf(!RUN_LIVE)("IMP-02 Turn B — live L2 isolation proof (TEST_TOPOLOGY_LIVE)", () => {
  beforeAll(() => {
    try {
      execFileSync("bash", [join(TOPOLOGY_ROOT, "run-a3.sh")], {
        stdio: "pipe",
        timeout: 120_000,
      });
      runExitCode = 0;
    } catch (err: any) {
      // run-a3.sh exits non-zero on ANY failed criterion — capture the code, evaluate per-test
      // below against the evidence files it still writes even on failure.
      runExitCode = typeof err?.status === "number" ? err.status : 1;
    }

    // Fail-loud canary: prove run-a3.sh genuinely executed (produced a fresh evidence
    // directory) rather than this test silently passing because the harness never ran.
    if (!existsSync(EVIDENCE_ROOT)) {
      throw new Error(
        "IMP-02 Turn B fail-loud canary: evidence/ directory does not exist — run-a3.sh did " +
          "not run (or topology.sh up was never invoked). Refusing to silently skip assertions.",
      );
    }
    const dirs = readdirSync(EVIDENCE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (dirs.length === 0) {
      throw new Error(
        "IMP-02 Turn B fail-loud canary: no timestamped evidence directory was produced by " +
          "run-a3.sh. Refusing to silently skip assertions.",
      );
    }
    latestEvidenceDir = join(EVIDENCE_ROOT, dirs[dirs.length - 1]);
  });

  function readEvidence(filename: string): string {
    const path = join(latestEvidenceDir!, filename);
    if (!existsSync(path)) {
      throw new Error(`expected evidence file missing: ${filename} (run-a3.sh did not write it)`);
    }
    return readFileSync(path, "utf8");
  }

  it("[canary] run-a3.sh genuinely executed and produced namespace membership evidence", () => {
    const membership = readEvidence("namespace-membership.txt");
    expect(membership).toMatch(/ns_client/);
    expect(membership).toMatch(/ns_edge/);
    expect(membership).toMatch(/ns_backend/);
  });

  it("A3: direct client -> WLT backend fails at the transport layer (status=000)", () => {
    const a3 = readEvidence("a3-direct-bypass.txt");
    expect(a3).toMatch(/^000\b/);
  });

  it("A3 negative proof is corroborated by the captured route table (no 10.90.0.0/24 route in ns_client)", () => {
    const membership = readEvidence("namespace-membership.txt");
    const clientSection = membership.split("=== ns_edge addr ===")[0];
    expect(clientSection).not.toMatch(/10\.90\.0\.0\/24/);
  });

  it("positive control: client -> edge -> WLT returns exactly 401 WLT1_AUTH_REQUIRED", () => {
    const positive = readEvidence("positive-control.txt");
    expect(positive).toMatch(/status: 401/);
    expect(positive).toMatch(/WLT1_AUTH_REQUIRED/);
  });

  it("A4: edge injecting a wrong perimeter token yields WLT's own 404 (L3 unmodified, still fail-closed)", () => {
    const a4 = readEvidence("a4-l3-regression.txt");
    expect(a4).toMatch(/status: 404/);
  });

  it("ns_edge forwarding was explicitly verified disabled (IPv4 and IPv6), not merely assumed", () => {
    const membership = readEvidence("namespace-membership.txt");
    expect(membership).toMatch(/net\.ipv4\.ip_forward = 0/);
    expect(membership).toMatch(/net\.ipv6\.conf\.all\.forwarding = 0/);
  });

  it("overall verdict file reports PASS and the script exited 0", () => {
    const verdict = readEvidence("verdict.txt").trim();
    expect(verdict).toBe("PASS");
    expect(runExitCode).toBe(0);
  });

  it("version inventory was captured (Lima, guest kernel, HAProxy, Node) with no credentials present", () => {
    const versions = readEvidence("version-inventory.txt");
    expect(versions).toMatch(/limactl version/i);
    expect(versions).toMatch(/3\.0\.27/);
    expect(versions).not.toMatch(/NOT-A-REAL-SECRET/); // the dummy token itself must not leak here
  });
});
