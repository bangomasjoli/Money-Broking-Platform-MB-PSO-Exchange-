/**
 * IMP-02 UAT trusted edge (DEC-010 Layer L1) — Tier 1 static config assertions.
 *
 * Pure text/structure checks on the committed HAProxy config files under platform/edge/. Runs
 * everywhere, with no HAProxy binary required (unlike Tier 2 — platform/edge/validate.mjs / `npm
 * run edge:validate` — and Tier 3 — tests/integration/imp02-edge-live.test.ts). The load-bearing
 * SYNTAX/BEHAVIOUR claims these files encode were verified live against a real HAProxy 3.0.27
 * binary during IMP-02's Phase 0 capability-verification gate; this suite only guards against
 * regression of the committed TEXT — it cannot and does not re-prove HAProxy's own runtime
 * behaviour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const EDGE_ROOT = join(__dirname, "../../edge");
const BASE_CFG_PATH = join(EDGE_ROOT, "haproxy.base.cfg");
const LIMITS_CFG_PATH = join(EDGE_ROOT, "uat", "haproxy.limits.cfg");
const VERSION_PATH = join(EDGE_ROOT, "VERSION");
const PRODUCTION_DIR = join(EDGE_ROOT, "production");
const ENV_EXAMPLE_PATH = join(EDGE_ROOT, "uat", ".env.example");

const baseCfg = readFileSync(BASE_CFG_PATH, "utf8");
const limitsCfg = readFileSync(LIMITS_CFG_PATH, "utf8");
const version = readFileSync(VERSION_PATH, "utf8").trim();

/**
 * Strips full-line and trailing '#' comments so assertions about actual DIRECTIVE usage are not
 * confused by this same file's own explanatory prose (e.g. a comment noting "no path_beg is used
 * for admission" would otherwise make a naive substring search for "path_beg" find a match).
 */
function stripComments(cfgText: string): string {
  return cfgText
    .split("\n")
    .map((line) => {
      const hashIdx = line.indexOf("#");
      return hashIdx === -1 ? line : line.slice(0, hashIdx);
    })
    .join("\n");
}

const baseCfgCode = stripComments(baseCfg);
const limitsCfgCode = stripComments(limitsCfg);

const GOVERNED_ROUTES = [
  { method: "GET", path: "/wlt1/destinations" },
  { method: "GET", path: "/wlt1/destinations/:destination_id" },
  { method: "POST", path: "/wlt1/wallet-destinations" },
  { method: "POST", path: "/wlt1/payout-destinations" },
  { method: "POST", path: "/wlt1/wallet-destinations/:destination_id/proof-of-control/challenges" },
  { method: "POST", path: "/wlt1/wallet-destinations/:destination_id/proof-of-control/verify" },
];

describe("IMP-02 edge — VERSION", () => {
  it("is exactly semver 3.0.27", () => {
    expect(version).toBe("3.0.27");
  });

  it("reconciles with the version referenced in haproxy.base.cfg's own comment", () => {
    expect(baseCfg).toMatch(/HAProxy 3\.0\.27/);
  });

  it("reconciles with the version referenced in README.md", () => {
    const readme = readFileSync(join(EDGE_ROOT, "README.md"), "utf8");
    expect(readme).toContain("3.0.27");
  });
});

describe("IMP-02 edge — six-path allowlist shape (base config)", () => {
  it("declares exactly six exact-or-anchored path ACLs, matching the governed contract", () => {
    // Exact-match ACLs (no parameter)
    expect(baseCfg).toMatch(/acl p_read_list\s+path \/wlt1\/destinations\s*$/m);
    expect(baseCfg).toMatch(/acl p_reg_wallet\s+path \/wlt1\/wallet-destinations\s*$/m);
    expect(baseCfg).toMatch(/acl p_reg_payout\s+path \/wlt1\/payout-destinations\s*$/m);

    // Anchored single-segment parameter ACLs — exact regex text, not just substring presence
    expect(baseCfg).toContain(
      "acl p_read_item  path_reg ^/wlt1/destinations/[^/]{1,64}$",
    );
    expect(baseCfg).toContain(
      "acl p_poc_chal   path_reg ^/wlt1/wallet-destinations/[^/]{1,64}/proof-of-control/challenges$",
    );
    expect(baseCfg).toContain(
      "acl p_poc_verify path_reg ^/wlt1/wallet-destinations/[^/]{1,64}/proof-of-control/verify$",
    );
  });

  it("admission rule references exactly the six governed method+path ACL pairs, no more, no fewer", () => {
    const admissionLine = baseCfg
      .split("\n")
      .find((l) => l.includes("http-request deny deny_status 404 unless"));
    expect(admissionLine, "admission rule not found").toBeDefined();
    const pairs = [
      "m_get p_read_list",
      "m_get p_read_item",
      "m_post p_reg_wallet",
      "m_post p_reg_payout",
      "m_post p_poc_chal",
      "m_post p_poc_verify",
    ];
    for (const pair of pairs) {
      expect(admissionLine).toContain(pair);
    }
    // exactly six "acl-pair" occurrences — count "_" prefixed acl name tokens after m_get/m_post
    const matchCount = (admissionLine!.match(/m_(get|post) p_\w+/g) ?? []).length;
    expect(matchCount).toBe(6);
  });

  it("does not use path_beg for public route admission (only for the /internal/ deny)", () => {
    const pathBegLines = baseCfgCode.split("\n").filter((l) => l.includes("path_beg"));
    expect(pathBegLines.length).toBe(1);
    expect(pathBegLines[0]).toContain("/internal/");
  });

  it("does not use case-insensitive ACL matching anywhere (no '-i' flag)", () => {
    expect(baseCfgCode).not.toMatch(/\s-i\s/);
  });

  it("does not accept a trailing-slash form for any of the six route-matching regexes (anchored with '$')", () => {
    // Restricted to the three route-parameter ACLs (p_read_item / p_poc_chal / p_poc_verify) —
    // the path-confusion detectors (has_dslash / has_enc_slash) are deliberately unanchored
    // substring checks, not route matchers, and must not be swept into this assertion.
    const routeAcls = ["p_read_item", "p_poc_chal", "p_poc_verify"];
    for (const aclName of routeAcls) {
      const line = baseCfgCode.split("\n").find((l) => l.trim().startsWith(`acl ${aclName}`));
      expect(line, `ACL '${aclName}' not found`).toBeDefined();
      expect(line!.trim().endsWith("$")).toBe(true);
    }
  });

  it("represents the destination_id contract as a single segment, 1-64 characters (not a UUID pattern)", () => {
    expect(baseCfg).toContain("[^/]{1,64}");
    expect(baseCfg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // no UUID literal pattern
  });

  it("documents the governed six-route contract matches GOVERNED_ROUTES (test-file cross-check)", () => {
    expect(GOVERNED_ROUTES).toHaveLength(6);
  });
});

describe("IMP-02 edge — /internal/* denial", () => {
  it("explicitly denies the /internal/ path prefix before any routing logic", () => {
    expect(baseCfg).toMatch(/acl p_internal\s+path_beg \/internal\//);
    expect(baseCfg).toMatch(/http-request deny deny_status 404 if p_internal/);
  });
});

describe("IMP-02 edge — path-confusion defence", () => {
  it("rejects double-slash, dot-dot, and encoded-slash forms before allowlist evaluation", () => {
    expect(baseCfg).toContain("acl has_dslash    path_reg //");
    expect(baseCfg).toContain(String.raw`acl has_dotdot    path_reg \.\.`);
    expect(baseCfg).toContain("acl has_enc_slash path_reg %2[fF]");
    expect(baseCfg).toMatch(
      /http-request deny deny_status 404 if has_dslash \|\| has_dotdot \|\| has_enc_slash/,
    );
  });

  it("never invokes normalize-uri (raw path is used for confusion detection, never silently normalized)", () => {
    expect(baseCfgCode).not.toContain("normalize-uri");
  });
});

describe("IMP-02 edge — header strip / inject", () => {
  it("strips ALL inbound x-aix-* headers via wildcard prefix match, not an enumerated list", () => {
    expect(baseCfg).toContain("http-request del-header x-aix- -m beg");
  });

  it("strips every untrusted forwarding-claim header", () => {
    for (const h of [
      "X-Forwarded-For",
      "X-Forwarded-Proto",
      "X-Forwarded-Host",
      "X-Real-IP",
      "Forwarded",
    ]) {
      expect(baseCfg).toContain(`http-request del-header ${h}`);
    }
  });

  it("injects the trusted perimeter token AFTER the strip directives (never before)", () => {
    const stripIdx = baseCfg.indexOf("http-request del-header x-aix- -m beg");
    const injectIdx = baseCfg.indexOf("http-request set-header x-aix-perimeter-token");
    expect(stripIdx).toBeGreaterThan(-1);
    expect(injectIdx).toBeGreaterThan(-1);
    expect(injectIdx).toBeGreaterThan(stripIdx);
  });

  it("never injects x-internal-service-token or any internal-service credential", () => {
    expect(baseCfg).not.toContain("x-internal-service-token");
    expect(baseCfg).not.toContain("x-wlt1-provider-receipt-token");
  });

  it("injects the perimeter token from an environment variable, never a literal value", () => {
    expect(baseCfg).toContain('set-header x-aix-perimeter-token "$WLT1_PUBLIC_PERIMETER_TOKEN"');
  });
});

describe("IMP-02 edge — response security headers", () => {
  it("sets Cache-Control: no-store on proxied public responses", () => {
    expect(baseCfg).toMatch(/http-response set-header Cache-Control\s+"no-store"/);
  });

  it("sets no wildcard (or any) Access-Control-Allow-Origin anywhere", () => {
    expect(baseCfgCode).not.toMatch(/Access-Control-Allow-Origin/i);
    expect(limitsCfgCode).not.toMatch(/Access-Control-Allow-Origin/i);
  });
});

describe("IMP-02 edge — bounded, evicting stick-table state", () => {
  const tableBlocks = [...limitsCfg.matchAll(/stick-table[^\n]*/g)].map((m) => m[0]);

  it("declares at least seven stick-tables (one per tracked counter class)", () => {
    expect(tableBlocks.length).toBeGreaterThanOrEqual(7);
  });

  it("every stick-table declares an explicit size", () => {
    for (const line of tableBlocks) {
      expect(line).toMatch(/\bsize\s+\S+/);
    }
  });

  it("every stick-table declares an explicit expire (evicting, not permanent)", () => {
    for (const line of tableBlocks) {
      expect(line).toMatch(/\bexpire\s+\S+/);
    }
  });

  it("no stick-table or rate-limit state depends on PostgreSQL or the FND rate-limit counter", () => {
    for (const text of [baseCfg, limitsCfg]) {
      expect(text).not.toMatch(/postgres/i);
      expect(text).not.toContain("foundation.rate_limit_counter");
      expect(text).not.toMatch(/DATABASE_URL/);
    }
  });
});

describe("IMP-02 edge — UAT numeric policy isolation", () => {
  const GOVERNED_NUMBERS = ["120", "20", "100", "10", "960", "160", "50"];

  it("base config contains none of the governed UAT numeric thresholds as literals", () => {
    // Base legitimately contains small structural numbers (404, 413, 429, timeouts-as-env-refs,
    // stick-counters 8) — assert specifically that none of the seven governed threshold VALUES
    // appear as a bare token on a line mentioning a rate/connection concept.
    const suspectLines = baseCfg
      .split("\n")
      .filter((l) => /gt|ge|http_req_rate|conn_cur/.test(l));
    for (const line of suspectLines) {
      for (const n of GOVERNED_NUMBERS) {
        expect(
          new RegExp(`\\b${n}\\b`).test(line),
          `base.cfg line unexpectedly contains governed threshold ${n}: "${line}"`,
        ).toBe(false);
      }
    }
  });

  it("uat/haproxy.limits.cfg carries the governed numeric thresholds", () => {
    expect(limitsCfg).toMatch(/gt 120\b/); // TOTAL 60s
    expect(limitsCfg).toMatch(/gt 20\b/); // TOTAL 1s burst
    expect(limitsCfg).toMatch(/gt 100\b/); // READ 60s
    expect(limitsCfg).toMatch(/gt 10\b/); // MUTATE 60s
    expect(limitsCfg).toMatch(/gt 960\b/); // aggregate 60s (8x120)
    expect(limitsCfg).toMatch(/gt 160\b/); // aggregate 1s (8x20)
  });

  it("every threshold comparison uses 'gt', never 'ge' (verified: 'ge <N>' under-admits by one)", () => {
    expect(limitsCfg).not.toMatch(/\bge\s+\d/);
    expect(baseCfg).not.toMatch(/\bge\s+\d/);
  });

  it("uat/.env.example labels every provisional numeric value as non-production", () => {
    const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf8");
    expect(envExample).toContain("PROVISIONAL — UAT ONLY — NOT APPROVED FOR PRODUCTION");
  });

  it("uat/haproxy.limits.cfg labels every threshold-bearing backend as provisional", () => {
    const backendBlocks = limitsCfg.split(/^backend /m).slice(1);
    for (const block of backendBlocks) {
      if (/gt \d|conn_cur|http_req_rate/.test(block)) {
        expect(block).toContain("PROVISIONAL — UAT ONLY — NOT APPROVED FOR PRODUCTION");
      }
    }
  });
});

describe("IMP-02 edge — production directory contains no configuration", () => {
  it("platform/edge/production/ contains no .cfg file", () => {
    expect(existsSync(PRODUCTION_DIR)).toBe(true);
    const files = readdirSync(PRODUCTION_DIR);
    const cfgFiles = files.filter((f) => f.endsWith(".cfg"));
    expect(cfgFiles).toEqual([]);
  });

  it("production/README.md states no production numeric policy is approved", () => {
    const readme = readFileSync(join(PRODUCTION_DIR, "README.md"), "utf8");
    expect(readme).toContain("NO PRODUCTION PRE-AUTH NUMERIC POLICY IS APPROVED");
  });
});

describe("IMP-02 edge — no committed secret", () => {
  it("no real-looking perimeter token literal is committed anywhere under platform/edge/", () => {
    for (const text of [baseCfg, limitsCfg]) {
      // the token must only ever appear as an environment-variable reference
      const literalAssignments = [...text.matchAll(/perimeter-token\s+"([^$][^"]*)"/g)];
      expect(literalAssignments).toEqual([]);
    }
    const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf8");
    expect(envExample).toContain("CHANGE_ME_EDGE_PERIMETER_TOKEN_PLACEHOLDER");
    expect(envExample).not.toMatch(/PERIMETER_TOKEN=(?!CHANGE_ME)\S{16,}/);
  });
});

describe("IMP-02 edge — fail-closed required-value guards", () => {
  it("base config guards every required env var with a fatal .if !defined() / .alert pair", () => {
    for (const varName of [
      "WLT1_PUBLIC_PERIMETER_TOKEN",
      "EDGE_BODY_LIMIT_BYTES",
      "EDGE_HEADER_TIMEOUT",
      "EDGE_IDLE_TIMEOUT",
      "EDGE_CONN_LIMIT_PER_BUCKET",
      "EDGE_BIND_ADDR",
      "EDGE_BIND_PORT",
    ]) {
      expect(baseCfg).toContain(`.if !defined(${varName})`);
    }
  });

  it("uat/haproxy.limits.cfg guards the upstream address with a fatal .if !defined() / .alert pair", () => {
    expect(limitsCfg).toContain(".if !defined(EDGE_WLT1_UPSTREAM_ADDR)");
    expect(limitsCfg).toMatch(/\.alert/);
  });

  it("every .if !defined() guard is paired with an .alert (fatal, not a warning)", () => {
    for (const text of [baseCfg, limitsCfg]) {
      const guardCount = (text.match(/\.if !defined\(/g) ?? []).length;
      const alertCount = (text.match(/\.alert/g) ?? []).length;
      expect(alertCount).toBeGreaterThanOrEqual(guardCount);
    }
  });
});

describe("IMP-02 edge — one-node UAT limitation documented", () => {
  it("README documents that L2 is not implemented and multi-node exactness is not claimed", () => {
    const readme = readFileSync(join(EDGE_ROOT, "README.md"), "utf8");
    expect(readme).toMatch(/L2.*NOT implemented|NOT implemented.*L2/is);
  });

  it("limits config does not reference HAProxy 'peers' (no multi-node claim in this UAT reference)", () => {
    expect(limitsCfg).not.toMatch(/\bpeers\b/);
    expect(baseCfg).not.toMatch(/\bpeers\b/);
  });
});

describe("IMP-02 edge — structural separation (base cannot run standalone)", () => {
  it("base config references stick-tables and a backend it never declares itself", () => {
    const referencedTables = [...baseCfg.matchAll(/table (b_\w+)/g)].map((m) => m[1]);
    expect(referencedTables.length).toBeGreaterThan(0);
    for (const table of referencedTables) {
      expect(baseCfg).not.toMatch(new RegExp(`^backend ${table}\\b`, "m"));
      expect(limitsCfg).toMatch(new RegExp(`^backend ${table}\\b`, "m"));
    }
    expect(baseCfg).toContain("use_backend b_gate");
    expect(baseCfg).not.toMatch(/^backend b_gate\b/m);
    expect(limitsCfg).toMatch(/^backend b_gate\b/m);
  });
});

describe("IMP-02 edge — E1: non-admitted traffic cannot reach request-rate tracking", () => {
  // Regression coverage for a finding raised during independent acceptance review: the six-pair
  // admission deny rule previously sat AFTER the track-sc1..sc6 directives, so any request that
  // was neither /internal/*, nor path-confusion, but simply not one of the six governed pairs
  // (an unknown path, a wrong method on a known path, etc.) still consumed a governed
  // TOTAL/READ/MUTATE/aggregate counter before being denied. Live-proven fixed: 300x unknown-path
  // and 300x wrong-method/path-confusion requests now produce zero counter movement on every
  // request-rate table, while genuine admitted traffic still tracks and still enforces (including
  // the /24-/48 aggregate reaching its own 960/60s threshold from admitted traffic alone).
  //
  // These assertions use the comment-stripped baseCfgCode exclusively — a comment claiming the
  // correct order cannot satisfy them; only the actual directive ordering can.

  const trackScLines = [1, 2, 3, 4, 5, 6].map((n) => `track-sc${n} `);

  function firstIndexOfAny(text: string, needles: string[]): number {
    const indices = needles
      .map((n) => text.indexOf(n))
      .filter((i) => i !== -1);
    expect(indices.length, `none of [${needles.join(", ")}] found in config`).toBeGreaterThan(0);
    return Math.min(...indices);
  }

  it("the six-pair admission deny rule appears strictly before every track-sc* directive", () => {
    const admissionIdx = baseCfgCode.indexOf(
      "http-request deny deny_status 404 unless m_get p_read_list",
    );
    expect(admissionIdx, "admission deny rule not found").toBeGreaterThan(-1);

    const firstTrackScIdx = firstIndexOfAny(baseCfgCode, trackScLines);
    expect(admissionIdx).toBeLessThan(firstTrackScIdx);
  });

  it("the internal-path and path-confusion deny rules also precede every track-sc* directive", () => {
    const internalDenyIdx = baseCfgCode.indexOf("http-request deny deny_status 404 if p_internal");
    const confusionDenyIdx = baseCfgCode.indexOf(
      "http-request deny deny_status 404 if has_dslash",
    );
    expect(internalDenyIdx).toBeGreaterThan(-1);
    expect(confusionDenyIdx).toBeGreaterThan(-1);

    const firstTrackScIdx = firstIndexOfAny(baseCfgCode, trackScLines);
    expect(internalDenyIdx).toBeLessThan(firstTrackScIdx);
    expect(confusionDenyIdx).toBeLessThan(firstTrackScIdx);
  });

  it("every track-sc* directive appears strictly after ALL three deny gates (internal, confusion, admission)", () => {
    const denyGateIndices = [
      baseCfgCode.indexOf("http-request deny deny_status 404 if p_internal"),
      baseCfgCode.indexOf("http-request deny deny_status 404 if has_dslash"),
      baseCfgCode.indexOf("http-request deny deny_status 404 unless m_get p_read_list"),
    ];
    expect(denyGateIndices.every((i) => i > -1)).toBe(true);
    const lastDenyGateIdx = Math.max(...denyGateIndices);

    for (const marker of trackScLines) {
      const idx = baseCfgCode.indexOf(marker);
      expect(idx, `${marker.trim()} not found`).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastDenyGateIdx);
    }
  });

  it("the TCP-layer connection ceiling remains unconditional (E1 does not touch sc0/connection tracking)", () => {
    // The connection-concurrency ceiling is a distinct, pre-HTTP control and is explicitly NOT
    // part of E1's remediation scope — it must remain unaffected by, and precede, the HTTP-layer
    // admission gate (tcp-request connection rules execute before HTTP parsing regardless of
    // textual position, but this repository's convention keeps them textually first for clarity).
    const connTrackIdx = baseCfgCode.indexOf("tcp-request connection track-sc0");
    const connRejectIdx = baseCfgCode.indexOf("tcp-request connection reject");
    const admissionIdx = baseCfgCode.indexOf(
      "http-request deny deny_status 404 unless m_get p_read_list",
    );
    expect(connTrackIdx).toBeGreaterThan(-1);
    expect(connRejectIdx).toBeGreaterThan(-1);
    expect(connTrackIdx).toBeLessThan(admissionIdx);
    expect(connRejectIdx).toBeLessThan(admissionIdx);
  });
});

describe("IMP-02 edge — E2: pinned HAProxy version is enforced, not merely documented", () => {
  it("validate.mjs reads VERSION from disk and compares against a variable, never a hard-coded literal", async () => {
    const validateSrc = readFileSync(join(EDGE_ROOT, "validate.mjs"), "utf8");
    expect(validateSrc).toContain('join(here, "VERSION")');
    // The comparison itself must be variable-to-variable (reported.version !== pinned), never a
    // literal version string compared directly — "3.0.27" may still appear in comments/example
    // error-message text, which is legitimate and not what this assertion targets.
    expect(validateSrc).toContain("reported.version !== pinned");
    expect(validateSrc).not.toMatch(/===\s*["']3\.\d+\.\d+["']/);
    expect(validateSrc).not.toMatch(/["']3\.\d+\.\d+["']\s*===/);
  });

  it("readPinnedVersion() returns the exact committed VERSION content", async () => {
    const { readPinnedVersion } = await import("../../edge/validate.mjs");
    expect(readPinnedVersion()).toBe(version);
  });

  it("the HAProxy version-line regex is anchored to a literal 'HAProxy version' prefix (never a bare substring match)", async () => {
    const { HAPROXY_VERSION_LINE_RE } = await import("../../edge/validate.mjs");
    expect(HAPROXY_VERSION_LINE_RE.test("HAProxy version 3.0.27-a2b09cd 2026/08/27")).toBe(true);
    expect(HAPROXY_VERSION_LINE_RE.test("HAProxy version 3.0.27 2026/08/27")).toBe(true);
    expect(HAPROXY_VERSION_LINE_RE.test("not-haproxy 3.0.27")).toBe(false);
    expect(HAPROXY_VERSION_LINE_RE.test("some text mentioning HAProxy version 3.0.27 in passing")).toBe(
      false,
    ); // not at line start
  });

  it("the version regex captures only the core X.Y.Z, excluding any build/pre-release suffix", async () => {
    const { HAPROXY_VERSION_LINE_RE } = await import("../../edge/validate.mjs");
    const m = "HAProxy version 3.0.27-a2b09cd 2026/08/27 - https://haproxy.org/".match(
      HAPROXY_VERSION_LINE_RE,
    );
    expect(m?.[1]).toBe("3.0.27");
  });

  it("SEMVER_RE rejects a 'v'-prefixed, suffixed, or otherwise non-bare VERSION value", async () => {
    const { SEMVER_RE } = await import("../../edge/validate.mjs");
    expect(SEMVER_RE.test("3.0.27")).toBe(true);
    expect(SEMVER_RE.test("v3.0.27")).toBe(false);
    expect(SEMVER_RE.test("3.0.27 (LTS)")).toBe(false);
    expect(SEMVER_RE.test("3.0")).toBe(false);
  });
});
