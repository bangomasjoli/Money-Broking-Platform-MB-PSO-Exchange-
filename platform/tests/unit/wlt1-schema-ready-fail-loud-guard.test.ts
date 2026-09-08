/**
 * H-D3C-1 remediation — defense-in-depth source guard, test-harness only.
 *
 * The actual fix for H-D3C-1 is the fail-loud canary assertion committed directly into each
 * affected WLT integration test file (`if (!schemaReady) return expect(schemaReady, "...")
 * .toBe(true);`, mirroring the established aml1/cfg1/fnd/iam/iam2/sec1 convention exactly). This
 * guard exists ONLY to catch a FUTURE regression — a new or edited WLT integration test file that
 * reintroduces the exact swallowing shape H-D3C-1 was about (a readiness-check function that
 * catches any setup/connectivity error and silently converts it to `false`) WITHOUT also carrying
 * a hard canary assertion for that same flag.
 *
 * Deliberately narrow and structural, not a general "detect any early return" scan (that would be
 * the "large new harness framework" this remediation was explicitly told not to build). The
 * discriminator is the SPECIFIC mechanism that makes a genuine setup failure indistinguishable from
 * "TEST_DATABASE_URL is simply unset": a function whose own `catch` block converts an error into
 * `false` rather than rethrowing. A WLT test file that does NOT have this shape (every private
 * disposable-database file — `wlt1-outbox-acl-private.test.ts`, `wlt1-screening-route-private.test.ts`,
 * the three `wlt1-migration-0*-regression.test.ts` files — none of which wrap their own
 * `CREATE DATABASE`/migration/grant setup in a swallowing `catch`) is correctly exempt: a genuine
 * setup failure in those files already propagates out of `beforeAll` unswallowed, which Vitest
 * itself already turns into a whole-file failure (independently verified empirically — see the
 * H-D3C-1 remediation report). This guard is intentionally silent about which flag name is used
 * (`schemaReady`, `ready`, or any future name) — it extracts the exact declared name per file and
 * requires a canary referencing that SAME name, so it cannot be satisfied by an unrelated
 * `expect(...)` call elsewhere in the file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const INTEGRATION_DIR = join(__dirname, "..", "integration");

/** Every `wlt1-*.test.ts` integration file — never filtered/curated by name, so a newly added file
 * is automatically covered without this guard needing to be told about it. */
function wltIntegrationTestFiles(): string[] {
  return readdirSync(INTEGRATION_DIR)
    .filter((name) => name.startsWith("wlt1-") && name.endsWith(".test.ts"))
    .sort();
}

/** The exact structural signature H-D3C-1 was about: a `catch` block whose body sets/returns a
 * readiness flag to `false` rather than rethrowing — i.e. "a setup-failure detector that silently
 * swallows the error." Matches `catch { ... false ... }` and `catch (e) { ... = false; ... }`
 * shapes, tolerant of whitespace/newlines, bounded to a single catch body (non-greedy up to the
 * next `}` at the same nesting depth is unnecessary here — a bounded lookahead is sufficient since
 * every real occurrence in this codebase is a short 1-3-line catch body). */
const SWALLOWING_CATCH_PATTERN = /catch\s*(?:\([^)]*\))?\s*\{[^}]*\bfalse\b[^}]*\}/;

/** Extracts every `let <name> = false;` / `let <name>: boolean = false;` declaration whose OWN
 * name reads as a readiness flag (case-insensitive substring `ready` — covers every actual name
 * this codebase uses today: `schemaReady`, `ready`, and would also catch a future `dbReady`/
 * `databaseReady`/`isReady`). Deliberately name-filtered, NOT every `= false` declaration in the
 * file — an unfiltered scan false-positives on ordinary call-counting/flag-tracking booleans (e.g.
 * `let called = false;`) that have nothing to do with setup readiness and were never the subject
 * of H-D3C-1. This is a known, accepted limitation (a hypothetical future flag named e.g.
 * `setupOk` would not be caught) — an exact match, not a heuristic guess, is what "do not invent a
 * complicated guard" calls for; the real fix (the committed canaries) does not depend on this
 * guard at all. */
function declaredReadinessFlags(source: string): string[] {
  const names = new Set<string>();
  const re = /\blet\s+(\w+)(?:\s*:\s*boolean)?\s*=\s*false\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (/ready/i.test(m[1]!)) names.add(m[1]!);
  }
  return [...names];
}

function hasCanaryFor(source: string, flagName: string): boolean {
  // Mirrors the committed fix's own exact shape: `expect(<flagName>, "...").toBe(true)` (or the
  // shorthand `expect(<flagName>).toBe(true)`), reachable from an `if (!<flagName>) return ...`
  // guard — never merely `expect(<flagName>)` appearing anywhere for an unrelated reason (this
  // repo's own committed canaries all use `.toBe(true)`, so requiring it keeps the guard specific).
  const canaryRe = new RegExp(`expect\\(\\s*${flagName}\\s*[,)][^;]*\\.toBe\\(true\\)`);
  return canaryRe.test(source);
}

describe("H-D3C-1 defense-in-depth — WLT integration test files with a swallowing readiness check must carry a fail-loud canary", () => {
  const files = wltIntegrationTestFiles();

  it("the WLT integration test directory is non-empty (guard is not vacuously trivial)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: every 'catch => false' swallowing readiness check has a matching expect(<flag>).toBe(true) canary`, () => {
      const source = readFileSync(join(INTEGRATION_DIR, file), "utf8");

      if (!SWALLOWING_CATCH_PATTERN.test(source)) {
        // No swallowing-catch shape at all in this file (e.g. every private disposable-database
        // file — CREATE DATABASE/migration/grant setup failures already propagate unswallowed and
        // fail the whole file via Vitest's own beforeAll-throw behaviour, independently verified).
        // Nothing for this guard to check.
        return;
      }

      const flags = declaredReadinessFlags(source);
      expect(
        flags.length,
        `${file} has a swallowing 'catch {...false...}' shape but no 'let <flag> = false;' readiness-flag declaration was found — inspect manually, this guard's pattern may need updating`,
      ).toBeGreaterThan(0);

      for (const flag of flags) {
        expect(
          hasCanaryFor(source, flag),
          `${file}: readiness flag '${flag}' is set via a swallowing catch (false on any setup error) but has no fail-loud 'expect(${flag}, "...").toBe(true)' canary anywhere in the file — a genuine setup failure would silently report every test in this file as passed (this is exactly H-D3C-1). Add one canary test mirroring the established aml1/cfg1/fnd/iam/iam2/sec1 pattern.`,
        ).toBe(true);
      }
    });
  }
});
