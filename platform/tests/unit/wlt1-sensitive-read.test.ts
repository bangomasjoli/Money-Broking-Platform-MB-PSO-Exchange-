/**
 * WLT-01 Sensitive Read Logging (FR-018) — unit coverage for `lib/sensitive-read.ts` plus
 * acceptance-sensitive source guards (no decrypt, no direct SEC-01 access). The helper itself
 * performs real I/O (`withTransaction` -> `publishAudit` -> `foundation.outbox_event`), so the
 * exact audit-envelope SHAPE it produces is verified via live outbox rows in
 * `tests/integration/wlt1-sensitive-read-route.test.ts` — mirrors this codebase's own
 * established convention (every other WLT-01 audit event's exact shape is verified the same
 * way, never via a mocked `publishAudit`). What IS genuinely unit-testable without a database is
 * covered here: the frozen v1 vocabulary constants, the fail-closed mapping to
 * `WLT1_SENSITIVE_READ_LOG_REQUIRED` (exercised via the REAL code path with no pool initialised
 * — a genuine failure, not a mock), and source-level guards.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closePool } from "@aix/foundation";
import {
  logSensitiveDestinationRead,
  SENSITIVE_READ_ACCESS_ACTION_READ,
  SENSITIVE_READ_DATA_CLASS_WALLET_CANONICAL_ADDRESS,
  SENSITIVE_READ_RESOURCE_TYPE_PROOF_OF_CONTROL,
} from "../../services/wlt1/src/lib/sensitive-read.js";
import { Wlt1Error } from "../../services/wlt1/src/lib/errors.js";

describe("WLT-01 Sensitive Read Logging — lib/sensitive-read.ts", () => {
  it("v1 frozen vocabulary constants — exact literal values (addendum Issue 13/14)", () => {
    expect(SENSITIVE_READ_RESOURCE_TYPE_PROOF_OF_CONTROL).toBe("proof_of_control");
    expect(SENSITIVE_READ_ACCESS_ACTION_READ).toBe("read");
    expect(SENSITIVE_READ_DATA_CLASS_WALLET_CANONICAL_ADDRESS).toBe("wallet_canonical_address");
  });

  it("fail-closed: when the underlying audit-evidence transaction cannot even begin (no DB pool available), the helper throws Wlt1Error('WLT1_SENSITIVE_READ_LOG_REQUIRED') — never a raw/unwrapped error, never a silent success", async () => {
    // Genuine failure path, not a mock: this test file never calls `initPool()`, so
    // `withTransaction` -> `getPool()` throws for real ("database pool not initialised"),
    // exercising the SAME catch/wrap branch a real outbox-INSERT failure would take.
    await closePool(); // idempotent no-op if already unset — ensures a clean slate regardless of module/test execution order.
    let caught: unknown;
    try {
      await logSensitiveDestinationRead({
        actorId: "wlt1_internal_service",
        challengeId: "wlt1poc_test",
        destinationId: "wlt1dest_test",
        clientId: "clt1client_test",
        chain: "ethereum",
        network: "mainnet",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Wlt1Error);
    expect((caught as Wlt1Error).code).toBe("WLT1_SENSITIVE_READ_LOG_REQUIRED");
    expect((caught as Wlt1Error).http).toBe(503);
  });
});

describe("WLT-01 Sensitive Read Logging — acceptance-sensitive source guards", () => {
  const helperSource = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "sensitive-read.ts"), "utf8");
  const pocRouteSource = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "proof-of-control.ts"), "utf8");
  const wltServicesRoot = join(__dirname, "..", "..", "services", "wlt1", "src");

  function allWltSourceFiles(dir: string): string[] {
    const entries = readdirSync(dir);
    let files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files = files.concat(allWltSourceFiles(full));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push(full);
      }
    }
    return files;
  }

  it("the sensitive-read helper never writes sec1.* directly (no raw SQL against SEC-01's own schema)", () => {
    // Matches real SQL/code references (`sec1.sensitive_read_log`, `sec1.audit_event`, ...), not
    // this file's own prose mentioning "sec1.*" as a concept in a doc comment.
    expect(helperSource).not.toMatch(/\bsec1\.[a-z_]+\b/);
    expect(helperSource).not.toMatch(/INSERT INTO/i);
  });

  it("the sensitive-read helper never imports SEC-01's own writeSensitiveReadLog or any services/sec1 module (a doc-comment PRECEDENT REFERENCE to services/sec1/src/routes/read.ts's own optional-reason field is fine; an actual `from \"...sec1...\"` import statement is not)", () => {
    expect(helperSource).not.toContain("writeSensitiveReadLog");
    expect(helperSource).not.toMatch(/from\s+["'][^"']*sec1[^"']*["']/);
  });

  it("the sensitive-read helper never performs networking (no fetch, no http client construction)", () => {
    expect(helperSource).not.toMatch(/\bfetch\(/);
  });

  it("NO WLT production source file anywhere writes sec1.* tables or imports SEC-01's HTTP/SQL seams (whole-service sweep, not just the helper)", () => {
    const files = allWltSourceFiles(wltServicesRoot);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must not reference sec1.* SQL`).not.toMatch(/\bsec1\.[a-z_]+\s/);
      expect(src, `${file} must not import writeSensitiveReadLog`).not.toContain("writeSensitiveReadLog");
      expect(src, `${file} must not import a services/sec1 module`).not.toMatch(/from\s+["'][^"']*sec1[^"']*["']/);
    }
  });

  it("NO decrypt implementation exists anywhere in WLT production source (WDR hard gate preserved): no decryptFiatAccountIdentifier definition/call site, no createDecipheriv, no KMS SDK integration (a comment merely ACKNOWLEDGING the pending-KMS placeholder, e.g. 'Placeholder-KMS passphrase', is expected and is not itself an integration)", () => {
    const files = allWltSourceFiles(wltServicesRoot);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must not define or call decryptFiatAccountIdentifier`).not.toMatch(/decryptFiatAccountIdentifier/);
      expect(src, `${file} must not use createDecipheriv`).not.toContain("createDecipheriv");
      expect(src, `${file} must not import a KMS SDK`).not.toMatch(/@aws-sdk\/client-kms|KeyManagementServiceClient|kms\.(encrypt|decrypt)\(/);
    }
  });

  it("the sensitive-read event envelope metadata never carries a Restricted value literal by construction — the input type has no field capable of carrying one (structural, not just a runtime scan)", () => {
    // The exhaustive allowed-keys list this function ever writes into `metadata` — grep the
    // actual object literal, not a duplicated hand-maintained copy, so this test fails the
    // moment a forbidden key is ever added to the real implementation.
    const metadataBlockMatch = helperSource.match(/metadata:\s*\{([\s\S]*?)\},\s*\}\);/);
    expect(metadataBlockMatch, "could not locate the metadata object literal in lib/sensitive-read.ts").not.toBeNull();
    const metadataBlock = metadataBlockMatch![1]!;
    const forbidden = [
      "canonical_address",
      "canonicalAddress",
      "address_hash",
      "addressHash",
      "message:",
      "message_hash",
      "signature",
      "recovered_address",
      "recoveredAddress",
      "account_identifier",
      "accountIdentifier",
      "beneficiary_name",
      "beneficiaryName",
      "matched_name",
      "ciphertext",
      "private_key",
      "seed_phrase",
    ];
    for (const token of forbidden) {
      expect(metadataBlock, `forbidden token "${token}" must never appear in the sensitive-read metadata literal`).not.toContain(token);
    }
  });

  it("every disclosure point in proof-of-control.ts calls logSensitiveDestinationRead BEFORE its own reply...send(successEnvelope(...)) — never after, and the non-disclosing 'none' response is correctly excluded", () => {
    // Structural proof (not a runtime one — see the integration test file for the live-DB
    // proof): every response-sending call site in this route file that returns a
    // `successEnvelope(...)` is examined; the ONE that discloses nothing (`{ status: "none" }`)
    // is expected to be the ONLY one without a preceding log call.
    const sendSites = [...pocRouteSource.matchAll(/reply\.(?:code\(\d+\)\.send|send)\(\s*successEnvelope\(/g)];
    // 4 in POST .../challenges (issued, verified_shortcut, duplicate-verified, duplicate-other)
    // + 1 in POST .../verify (covers both "verified" and "verified_replay_match" outcomes)
    // + 2 in GET (the sensitive "verified" case AND the non-disclosing "none" case) = 7.
    expect(sendSites.length).toBe(7);
    let noneCaseCount = 0;
    let sensitiveCaseCount = 0;
    for (const match of sendSites) {
      const idx = match.index!;
      const lookahead = pocRouteSource.slice(idx, idx + 80);
      if (lookahead.includes('status: "none"')) {
        noneCaseCount += 1;
        continue;
      }
      sensitiveCaseCount += 1;
      const lookback = pocRouteSource.slice(Math.max(0, idx - 500), idx);
      expect(lookback, `disclosing reply...send( at offset ${idx} has no logSensitiveDestinationRead(...) call within its own preceding block`).toMatch(/await logSensitiveDestinationRead\(/);
    }
    expect(noneCaseCount).toBe(1);
    expect(sensitiveCaseCount).toBe(6); // matches the addendum's exact six disclosure points
  });

  it("the GET route's 'none' early return (nothing disclosed) does NOT call logSensitiveDestinationRead", () => {
    const noneReturnMatch = pocRouteSource.match(/if \(current\.status === "none"\) \{[\s\S]{0,200}?\}/);
    expect(noneReturnMatch).not.toBeNull();
    expect(noneReturnMatch![0]).not.toContain("logSensitiveDestinationRead");
  });
});
