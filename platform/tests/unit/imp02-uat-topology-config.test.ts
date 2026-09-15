/**
 * IMP-02 Turn B — L2 UAT isolation topology — Tier 1 static config assertions.
 *
 * Pure text/structure checks on the committed topology harness under
 * platform/edge/uat-topology/. Runs everywhere, with no Lima/VM required (unlike Tier 3 —
 * tests/integration/imp02-uat-topology-live.test.ts). These assertions guard the committed
 * TEXT against regression — the actual namespace/veth/isolation BEHAVIOUR was verified live
 * against a real Lima guest during IMP-02 Turn B implementation (see the acceptance record for
 * the full evidence trail); this suite cannot and does not re-prove that live behaviour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOPOLOGY_ROOT = join(__dirname, "../../edge/uat-topology");
const LIMA_YAML_PATH = join(TOPOLOGY_ROOT, "lima.yaml");
const TOPOLOGY_SH_PATH = join(TOPOLOGY_ROOT, "topology.sh");
const RUN_A3_SH_PATH = join(TOPOLOGY_ROOT, "run-a3.sh");
const README_PATH = join(TOPOLOGY_ROOT, "README.md");
const EDGE_ROOT = join(__dirname, "../../edge");

const limaYaml = readFileSync(LIMA_YAML_PATH, "utf8");
const topologySh = readFileSync(TOPOLOGY_SH_PATH, "utf8");
const runA3Sh = readFileSync(RUN_A3_SH_PATH, "utf8");
const readme = readFileSync(README_PATH, "utf8");

/** Strips '#'-prefixed comment lines (shell/YAML share this comment syntax). */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("#");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const topologyShCode = stripComments(topologySh);

describe("IMP-02 Turn B — exactly three namespaces, correct membership", () => {
  it("declares exactly ns_client, ns_edge, ns_backend (no more, no fewer)", () => {
    const addCalls = [...topologyShCode.matchAll(/ip netns add (\S+)/g)].map((m) => m[1]);
    expect(addCalls.sort()).toEqual(["ns_backend", "ns_client", "ns_edge"]);
  });

  it("ns_client has an interface on net_public only (never net_backend)", () => {
    // The client-side veth (v-pub-cli) is placed only in ns_client; no backend-side veth
    // (v-bck-*) is ever assigned to ns_client anywhere in the script.
    expect(topologyShCode).toMatch(/ip link set v-pub-cli netns ns_client/);
    expect(topologyShCode).not.toMatch(/ip link set v-bck-\S+ netns ns_client/);
  });

  it("ns_backend has an interface on net_backend only (never net_public)", () => {
    expect(topologyShCode).toMatch(/ip link set v-bck-be netns ns_backend/);
    expect(topologyShCode).not.toMatch(/ip link set v-pub-\S+ netns ns_backend/);
  });

  it("ns_edge is the ONLY namespace assigned an interface on both networks", () => {
    const edgeAssignments = [...topologyShCode.matchAll(/ip link set (\S+) netns ns_edge/g)].map(
      (m) => m[1],
    );
    expect(edgeAssignments.sort()).toEqual(["v-bck-edg", "v-pub-edg"]);
  });
});

describe("IMP-02 Turn B — no IP forwarding through ns_edge", () => {
  it("explicitly sets (not merely reads) IPv4 and IPv6 forwarding to 0 inside ns_edge", () => {
    expect(topologyShCode).toMatch(
      /ip netns exec ns_edge sysctl -w net\.ipv4\.ip_forward=0/,
    );
    expect(topologyShCode).toMatch(
      /ip netns exec ns_edge sysctl -w net\.ipv6\.conf\.all\.forwarding=0/,
    );
  });

  it("run-a3.sh captures the forwarding state as evidence, not merely assumes it", () => {
    expect(runA3Sh).toMatch(/ip netns exec ns_edge sysctl net\.ipv4\.ip_forward/);
  });
});

describe("IMP-02 Turn B — Turn-A config consumed unmodified, never duplicated", () => {
  it("topology.sh references Turn-A's real config files by relative path, not by embedding their content", () => {
    expect(topologyShCode).toMatch(/haproxy\.base\.cfg/);
    expect(topologyShCode).toMatch(/uat\/haproxy\.limits\.cfg/);
    // Never re-declares the six-path allowlist, stick-tables, or any governed threshold —
    // those strings belong only to the real committed Turn-A files, never to this harness.
    expect(topologySh).not.toMatch(/acl p_read_list/);
    expect(topologySh).not.toMatch(/stick-table/);
    expect(topologySh).not.toMatch(/sc_http_req_rate/);
  });

  it("copies the CURRENT working-tree platform/ at run time rather than embedding a stale copy", () => {
    expect(topologyShCode).toMatch(/tar czf .* platform/);
    expect(topologyShCode).toMatch(/--exclude=node_modules/);
    expect(topologyShCode).toMatch(/--exclude=\.git/);
  });

  it("does not reference or create any production edge configuration", () => {
    for (const text of [topologySh, limaYaml, runA3Sh]) {
      expect(text).not.toMatch(/edge\/production\/\S*\.cfg/);
    }
  });
});

describe("IMP-02 Turn B — no TLS claim", () => {
  it("neither topology.sh, lima.yaml, run-a3.sh, nor README.md claims TLS is implemented", () => {
    for (const [name, text] of [
      ["topology.sh", topologySh],
      ["lima.yaml", limaYaml],
      ["run-a3.sh", runA3Sh],
      ["README.md", readme],
    ] as const) {
      expect(text, `${name} must not claim TLS/HTTPS implemented`).not.toMatch(
        /TLS (is )?implemented|HTTPS production.ready/i,
      );
    }
  });

  it("README explicitly states TLS remains out of scope for this harness", () => {
    expect(readme).toMatch(/TLS-neutral/i);
  });
});

describe("IMP-02 Turn B — no container/cloud tooling committed", () => {
  it("lima.yaml disables containerd provisioning", () => {
    expect(limaYaml).toMatch(/containerd:/);
    expect(limaYaml).toMatch(/system:\s*false/);
    expect(limaYaml).toMatch(/user:\s*false/);
  });

  it("no Dockerfile, docker-compose, or Kubernetes manifest exists under uat-topology/", () => {
    for (const f of ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml"]) {
      expect(existsSync(join(TOPOLOGY_ROOT, f))).toBe(false);
    }
  });

  it("no committed file references docker, podman, colima, or a cloud provider", () => {
    for (const [name, text] of [
      ["topology.sh", topologySh],
      ["lima.yaml", limaYaml],
      ["run-a3.sh", runA3Sh],
    ] as const) {
      expect(text, `${name} must not reference a container runtime`).not.toMatch(
        /\bdocker\b|\bpodman\b|\bcolima\b/i,
      );
      expect(text, `${name} must not reference a cloud provider`).not.toMatch(
        /\baws\b|\bgcp\b|\bazure\b/i,
      );
    }
  });

  it("README explicitly labels this a UAT-harness-only, non-production artifact", () => {
    expect(readme).toMatch(/UAT TOPOLOGY HARNESS ONLY/);
    expect(readme).toMatch(/NOT PRODUCTION/);
    expect(readme).toMatch(/NO CLOUD-PROVIDER COMMITMENT/i);
    expect(readme).toMatch(/NO CONTAINER-PLATFORM\s+COMMITMENT/i);
  });
});

describe("IMP-02 Turn B — governed HAProxy identity reused, not re-pinned independently", () => {
  it("topology.sh pins the SAME HAProxy version and digest as Turn A's VERSION/README", () => {
    const version = readFileSync(join(EDGE_ROOT, "VERSION"), "utf8").trim();
    expect(topologySh).toContain(`HAPROXY_VERSION="${version}"`);
    expect(topologySh).toContain(
      "c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1",
    );
  });

  it("verifies the digest inside the guest before building (never trusts an unverified download)", () => {
    expect(topologyShCode).toMatch(/sha256sum -c -/);
  });
});

describe("IMP-02 Turn B — evidence handling", () => {
  it("evidence/ is git-ignored except its own .gitignore", () => {
    const gitignorePath = join(TOPOLOGY_ROOT, "evidence", ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf8");
    expect(content).toMatch(/^\*$/m);
    expect(content).toMatch(/^!\.gitignore$/m);
  });

  it("run-a3.sh writes evidence under evidence/, never into a tracked location", () => {
    expect(runA3Sh).toMatch(/EVIDENCE_DIR="\$HERE\/evidence\//);
  });

  it("the dummy perimeter token is explicitly labelled non-secret and distinct from a wrong-token variant", () => {
    expect(topologySh).toMatch(/NOT-A-REAL-SECRET/);
    expect(topologySh).toMatch(/VALID_TOKEN=/);
    expect(topologySh).toMatch(/WRONG_TOKEN=/);
  });
});

describe("IMP-02 Turn B — A3/A4 acceptance criteria frozen correctly", () => {
  it("A3 passes only on transport failure (curl reporting 000), never on any HTTP status", () => {
    expect(runA3Sh).toMatch(/a3_status.*=.*000/);
    expect(runA3Sh).toMatch(/A3: PASS/);
  });

  it("A3 is never reported PASS unless the positive control also passed", () => {
    expect(runA3Sh).toMatch(/A3 verdict WITHHELD/);
  });

  it("the positive control requires exactly 401 WLT1_AUTH_REQUIRED, not merely 'not 404'", () => {
    expect(runA3Sh).toContain('"$pos_raw" = "401"');
    expect(runA3Sh).toContain("WLT1_AUTH_REQUIRED");
  });

  it("A4 requires exactly 404 and restores the valid token afterward", () => {
    expect(runA3Sh).toContain('"$a4_raw" = "404"');
    expect(runA3Sh).toMatch(/edge-valid-token/);
  });
});
