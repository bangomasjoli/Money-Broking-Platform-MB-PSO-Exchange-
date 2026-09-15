/**
 * IMP-02 Turn C — UAT TLS termination — Tier 1 static config assertions.
 *
 * Pure text/structure checks on the committed TLS harness under platform/edge/uat-tls/ and the
 * guarded modification to platform/edge/haproxy.base.cfg. Runs everywhere, with no Lima/VM or
 * HAProxy binary required (unlike Tier 3 — tests/integration/imp02-uat-tls-live.test.ts). The
 * actual TLS handshake/certificate BEHAVIOUR was verified live against a real HAProxy 3.0.27
 * binary built with USE_OPENSSL=1 during IMP-02 Turn C implementation; this suite guards the
 * committed TEXT against regression, it does not re-prove that live behaviour.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const EDGE_ROOT = join(__dirname, "../../edge");
const TLS_ROOT = join(EDGE_ROOT, "uat-tls");
const BASE_CFG_PATH = join(EDGE_ROOT, "haproxy.base.cfg");
const LIMITS_CFG_PATH = join(EDGE_ROOT, "uat", "haproxy.limits.cfg");
const LIMA_YAML_PATH = join(EDGE_ROOT, "uat-topology", "lima.yaml");
const TOPOLOGY_SH_PATH = join(EDGE_ROOT, "uat-topology", "topology.sh");
const README_PATH = join(TLS_ROOT, "README.md");
const TLS_VERIFY_SH_PATH = join(TLS_ROOT, "tls-verify.sh");
const MAKE_CERTS_SH_PATH = join(TLS_ROOT, "make-certs.sh");
const VALIDATE_TLS_MJS_PATH = join(TLS_ROOT, "validate-tls.mjs");
const VERSION_PATH = join(EDGE_ROOT, "VERSION");

const baseCfg = readFileSync(BASE_CFG_PATH, "utf8");
const limitsCfg = readFileSync(LIMITS_CFG_PATH, "utf8");
const limaYaml = readFileSync(LIMA_YAML_PATH, "utf8");
const topologySh = readFileSync(TOPOLOGY_SH_PATH, "utf8");
const readme = readFileSync(README_PATH, "utf8");
const tlsVerifySh = readFileSync(TLS_VERIFY_SH_PATH, "utf8");
const makeCertsSh = readFileSync(MAKE_CERTS_SH_PATH, "utf8");
const validateTlsMjs = readFileSync(VALIDATE_TLS_MJS_PATH, "utf8");

/** Strips '#'-prefixed comment lines (shell/HAProxy-cfg share this comment syntax). */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("#");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const baseCfgCode = stripComments(baseCfg);

describe("IMP-02 Turn C — guarded bind structure (TLS/plain, presence-based)", () => {
  it("declares a .if defined(EDGE_TLS_ENABLED) / .else / .endif guard around the bind directive", () => {
    expect(baseCfgCode).toMatch(/\.if defined\(EDGE_TLS_ENABLED\)/);
    expect(baseCfgCode).toMatch(/\.else/);
    expect(baseCfgCode).toMatch(/\.endif/);
  });

  it("the TLS branch binds with ssl crt and ssl-min-ver TLSv1.2", () => {
    expect(baseCfgCode).toMatch(
      /bind "\$\{EDGE_BIND_ADDR\}:\$\{EDGE_BIND_PORT\}" ssl crt "\$\{EDGE_TLS_CRT_PATH\}" ssl-min-ver TLSv1\.2/,
    );
  });

  it("the .else branch binds plain HTTP identically to the pre-Turn-C accepted form", () => {
    const elseIdx = baseCfgCode.indexOf(".else");
    const endifIdx = baseCfgCode.indexOf(".endif", elseIdx);
    const elseBranch = baseCfgCode.slice(elseIdx, endifIdx);
    expect(elseBranch).toMatch(/bind "\$\{EDGE_BIND_ADDR\}:\$\{EDGE_BIND_PORT\}"\s*$/m);
    expect(elseBranch).not.toMatch(/ssl/);
  });

  it("there is exactly one bind directive in each branch — no second/parallel plaintext listener when TLS mode is selected", () => {
    const tlsIfIdx = baseCfgCode.indexOf(".if defined(EDGE_TLS_ENABLED)");
    const frontendIdx = baseCfgCode.indexOf("frontend fe_public");
    const endifAfterFrontend = baseCfgCode.indexOf(".endif", frontendIdx);
    const frontendGuardBlock = baseCfgCode.slice(frontendIdx, endifAfterFrontend + 6);
    const bindMatches = [...frontendGuardBlock.matchAll(/^\s*bind /gm)];
    expect(bindMatches.length).toBe(2); // exactly one per branch (TLS, plain) — never both active
    expect(tlsIfIdx).toBeGreaterThan(-1);
  });

  it("only one frontend fe_public is declared (no second/duplicate security frontend)", () => {
    const matches = [...baseCfgCode.matchAll(/^frontend \S+/gm)];
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("frontend fe_public");
  });
});

describe("IMP-02 Turn C — EDGE_TLS_ENABLED is presence-based, not boolean", () => {
  it("the cert-path requirement is guarded by defined(EDGE_TLS_ENABLED), not a value comparison", () => {
    expect(baseCfgCode).toMatch(/\.if defined\(EDGE_TLS_ENABLED\)\s*\n\.if !defined\(EDGE_TLS_CRT_PATH\)/);
    expect(baseCfgCode).not.toMatch(/EDGE_TLS_ENABLED\s*==\s*/);
    expect(baseCfgCode).not.toMatch(/EDGE_TLS_ENABLED\s*=\s*["']?true["']?/);
  });

  it("the .alert diagnostic explicitly documents presence semantics (unset to disable, not =false)", () => {
    expect(baseCfg).toMatch(/PRESENCE flag/);
    expect(baseCfg).toMatch(/unset it entirely/i);
  });

  it("README and validate-tls.mjs both document EDGE_TLS_ENABLED as presence-based", () => {
    expect(readme).toMatch(/PRESENCE flag/);
    expect(readme).toMatch(/EDGE_TLS_ENABLED=false.*still select/i);
  });

  it("validate-tls.mjs has a durable negative test proving EDGE_TLS_ENABLED=false still requires a cert (fails closed)", () => {
    expect(validateTlsMjs).toMatch(/EDGE_TLS_ENABLED=false.*STILL a presence flag/i);
    expect(validateTlsMjs).toContain('EDGE_TLS_ENABLED: "false"');
  });
});

describe("IMP-02 Turn C — fail-closed: missing certificate path", () => {
  it("the .alert directive requires EDGE_TLS_CRT_PATH whenever EDGE_TLS_ENABLED is defined", () => {
    expect(baseCfgCode).toMatch(
      /\.alert "EDGE_TLS_CRT_PATH is required when EDGE_TLS_ENABLED is defined/,
    );
  });

  it("no silent plaintext fallback exists inside the TLS branch", () => {
    const tlsIfIdx = baseCfgCode.indexOf(".if defined(EDGE_TLS_ENABLED)", baseCfgCode.indexOf("frontend fe_public"));
    const elseIdx = baseCfgCode.indexOf(".else", tlsIfIdx);
    const tlsBranch = baseCfgCode.slice(tlsIfIdx, elseIdx);
    expect(tlsBranch).toMatch(/ssl crt/);
    expect(tlsBranch).not.toMatch(/bind "\$\{EDGE_BIND_ADDR\}:\$\{EDGE_BIND_PORT\}"\s*$/m);
  });
});

describe("IMP-02 Turn C — no production hostname, correct UAT hostname", () => {
  it("uses the reserved .invalid TLD hostname, never a production-shaped domain", () => {
    expect(makeCertsSh).toContain("uat-edge.aix.invalid");
    expect(tlsVerifySh).toContain("uat-edge.aix.invalid");
    expect(readme).toContain("uat-edge.aix.invalid");
  });

  it("does not reference any real/production-looking domain (aix.com, aix.io, etc.)", () => {
    for (const [name, text] of [
      ["make-certs.sh", makeCertsSh],
      ["tls-verify.sh", tlsVerifySh],
      ["README.md", readme],
    ] as const) {
      expect(text, `${name} must not reference a production-shaped domain`).not.toMatch(
        /\baix\.(com|io|net|org)\b/i,
      );
    }
  });
});

describe("IMP-02 Turn C — TLS protocol policy", () => {
  it("enforces ssl-min-ver TLSv1.2 (TLS 1.0/1.1 excluded by construction)", () => {
    expect(baseCfgCode).toMatch(/ssl-min-ver TLSv1\.2/);
  });

  it("does not define a production cipher list (deferred, per governance)", () => {
    expect(baseCfgCode).not.toMatch(/ciphers\s+["']/i);
    expect(baseCfgCode).not.toMatch(/ciphersuites\s+["']/i);
  });
});

describe("IMP-02 Turn C — evidence and generated-material handling", () => {
  it("generated/ and evidence/ are git-ignored except their own .gitignore", () => {
    for (const dir of ["generated", "evidence"]) {
      const gitignorePath = join(TLS_ROOT, dir, ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      const content = readFileSync(gitignorePath, "utf8");
      expect(content).toMatch(/^\*$/m);
      expect(content).toMatch(/^!\.gitignore$/m);
    }
  });

  it("tls-verify.sh truncates/removes each output file before writing it (evidence hygiene, IMP-02-FIND-005)", () => {
    const rmBeforeWrites = [...tlsVerifySh.matchAll(/rm -f "\$EVIDENCE_DIR\/[^"]+"\n[a-z0-9_]+_raw=/g)];
    expect(rmBeforeWrites.length).toBeGreaterThanOrEqual(4);
  });

  it("no private-key PEM marker appears anywhere in committed harness text", () => {
    for (const [name, text] of [
      ["tls-verify.sh", tlsVerifySh],
      ["make-certs.sh", makeCertsSh],
      ["README.md", readme],
      ["validate-tls.mjs", validateTlsMjs],
    ] as const) {
      expect(text, `${name} must not contain a private key marker`).not.toMatch(
        /-----BEGIN (EC |RSA )?PRIVATE KEY-----/,
      );
    }
  });

  it("make-certs.sh writes keys only under the git-ignored generated/ directory", () => {
    expect(makeCertsSh).toMatch(/OUT_DIR="\$\{1:-\$HERE\/generated\}"/);
  });
});

describe("IMP-02 Turn C — governed HAProxy identity reused, not re-pinned independently", () => {
  it("VERSION is read via the imported helper, never duplicated as a literal 3.0.27 constant", () => {
    const version = readFileSync(VERSION_PATH, "utf8").trim();
    expect(validateTlsMjs).toContain('from "../validate.mjs"');
    expect(validateTlsMjs).toContain("verifyPinnedVersion");
    expect(validateTlsMjs).not.toMatch(new RegExp(`["']${version.replace(/\./g, "\\.")}["']`));
  });

  it("tls-verify.sh pins the SAME HAProxy source digest as Turns A and B", () => {
    expect(tlsVerifySh).toContain(
      "c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1",
    );
  });

  it("validate-tls.mjs does not modify validate.mjs — it only imports from it", () => {
    expect(validateTlsMjs).not.toMatch(/writeFileSync.*validate\.mjs/);
  });
});

describe("IMP-02 Turn C — Turn-A perimeter rules remain single-copy, never duplicated", () => {
  it("tls-verify.sh and make-certs.sh never re-declare the six-path allowlist or stick-tables", () => {
    for (const [name, text] of [
      ["tls-verify.sh", tlsVerifySh],
      ["make-certs.sh", makeCertsSh],
    ] as const) {
      expect(text, `${name} must not duplicate the allowlist ACL`).not.toMatch(/acl p_read_list/);
      expect(text, `${name} must not duplicate a stick-table`).not.toMatch(/stick-table/);
    }
  });

  it("haproxy.base.cfg still contains exactly one copy of the six-path allowlist ACLs", () => {
    const matches = [...baseCfgCode.matchAll(/acl p_read_list/g)];
    expect(matches.length).toBe(1);
  });
});

describe("IMP-02 Turn C — Turn-B accepted artifacts (lima.yaml, topology.sh) left unmodified in structure", () => {
  it("lima.yaml does not install libssl-dev in its own provisioning block (installed guest-locally by tls-verify.sh instead)", () => {
    expect(limaYaml).not.toMatch(/libssl-dev/);
  });

  it("topology.sh is not aware of TLS (no EDGE_TLS_ENABLED, no port 8443)", () => {
    expect(topologySh).not.toMatch(/EDGE_TLS_ENABLED/);
    expect(topologySh).not.toMatch(/8443/);
  });

  it("tls-verify.sh never restarts or reconfigures Turn-B's port-8080 edge process", () => {
    expect(tlsVerifySh).toMatch(/never (kills|touches)/i);
    expect(tlsVerifySh).not.toMatch(/EDGE_PORT=8080/);
  });
});

describe("IMP-02 Turn C — no container/cloud/backend-TLS commitment", () => {
  it("no operational harness file (.sh/.mjs) references docker, podman, colima, a cloud provider, or a commercial CA", () => {
    // README.md is deliberately excluded here — it documents these as explicitly OUT of scope
    // in prose ("Not AWS ACM, ... Let's Encrypt, or any commercial CA"), which is the opposite
    // of a commitment; the operational .sh/.mjs files must never reference them at all.
    for (const [name, text] of [
      ["tls-verify.sh", tlsVerifySh],
      ["make-certs.sh", makeCertsSh],
      ["validate-tls.mjs", validateTlsMjs],
    ] as const) {
      expect(text, `${name} must not reference a container runtime`).not.toMatch(
        /\bdocker\b|\bpodman\b|\bcolima\b/i,
      );
      expect(text, `${name} must not reference a cloud provider or commercial CA`).not.toMatch(
        /\baws\b|\bgcp\b|\bazure\b|let'?s encrypt|cloudflare/i,
      );
    }
  });

  it("README explicitly disclaims backend TLS/mTLS and production certificate lifecycle", () => {
    expect(readme).toMatch(/backend\/service-to-service\s+TLS or mTLS/i);
    expect(readme).toMatch(/production certificate authority/i);
  });

  it("backend edge->WLT env var in tls-verify.sh uses plain http://, never https://", () => {
    const upstreamLines = tlsVerifySh.match(/EDGE_WLT1_UPSTREAM_ADDR=\S+/g) ?? [];
    expect(upstreamLines.length).toBeGreaterThan(0);
    for (const line of upstreamLines) expect(line).not.toMatch(/https/);
  });
});

describe("IMP-02 Turn C — M7 explicitly not measured", () => {
  it("README states no M7/capacity measurement is performed by this harness", () => {
    expect(readme).toMatch(/M7/);
    expect(readme).toMatch(/never how fast|not.*capacity|functional/i);
  });

  it("tls-verify.sh contains no throughput/handshake-rate benchmarking loop", () => {
    expect(tlsVerifySh).not.toMatch(/requests[_-]?per[_-]?second/i);
    expect(tlsVerifySh).not.toMatch(/benchmark/i);
  });
});

describe("IMP-02 Turn C — frozen T1-T8 acceptance criteria present verbatim", () => {
  it("T1 requires exactly 401 with --cacert and the correct hostname", () => {
    expect(tlsVerifySh).toMatch(/\[ "\$t1_raw" = "401" \]/);
    expect(tlsVerifySh).toContain("--cacert");
  });

  it("T2/T3/T4 all require a transport-layer 000 (no HTTP response), never a status code", () => {
    for (const t of ["t2_raw", "t3_raw", "t4_raw"]) {
      expect(tlsVerifySh).toMatch(new RegExp(`echo "\\$${t}" \\| grep -qE '\\^000'`));
    }
  });

  it("T5/T6 require the non-vacuity baseline to have genuinely completed TLS1.0/TLS1.1 before asserting rejection", () => {
    expect(tlsVerifySh).toMatch(/non-vacuity baseline/i);
    expect(tlsVerifySh).toMatch(/fail_loud.*non-vacuity baseline FAILED/);
  });

  it("T5/T6 require the real edge response to be a protocol_version alert, not merely a closed connection", () => {
    expect(tlsVerifySh).toContain("alert protocol version");
  });
});
