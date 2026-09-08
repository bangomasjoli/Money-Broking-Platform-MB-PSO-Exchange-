/**
 * WLT-01 Phase 2C-C3 — load-bearing invariant: `wallet_screening_result.updated_at_utc` is safe to
 * reuse as the C3 retry-claim/cooldown clock ONLY because exactly two production code paths ever
 * UPDATE this table, and only one of them (the C3 claim itself) can mutate `updated_at_utc` while a
 * row remains `pending`. This mirrors `wlt1-screening-composition-boundary.test.ts`'s own
 * comment-stripped source-text-scan technique (a small, WLT-local, load-bearing control — not a
 * platform-wide AST helper, per the same proportionality reasoning that guard's own header
 * documents).
 *
 * If a future phase (most plausibly Phase 2C-D's receipt/inbox processing) adds ANY other
 * production `UPDATE wlt1.wallet_screening_result` statement, this test fails loudly — forcing
 * that phase to explicitly revisit whether `updated_at_utc` can still safely double as the C3
 * retry-claim clock, or whether a dedicated `last_provider_attempt_at_utc` column (migration 053)
 * has become mandatory. See `services/wlt1/src/routes/wallet-screening.ts`'s own file header for
 * the full architecture rationale.
 *
 * M-A hardening (Phase 2C-D0): independent Opus review proved the ORIGINAL matcher — a bare
 * `indexOf` on the literal substring `"UPDATE wlt1.wallet_screening_result"` — was too narrow to be
 * genuinely load-bearing. Mutation-tested and confirmed to MISS: (a) an ordinary multiline/wrapped
 * UPDATE (`UPDATE\n  wlt1.wallet_screening_result\nSET ...`, a formatting style this very codebase
 * already uses elsewhere for long SQL), and (b) a schema-unqualified `UPDATE wallet_screening_result
 * ...` relying on `search_path`. The matcher below is now a case-insensitive regex tolerant of
 * arbitrary whitespace (including newlines) between `UPDATE` and the table name, an optional `ONLY`
 * keyword, and an optional `wlt1.` schema qualifier — still a source-text scan, never a SQL
 * parser/AST dependency (disproportionate for this file's narrow purpose; this codebase has no SQL
 * parser anywhere and Phase 2C-D0 does not introduce one).
 *
 * Stuck-Screening Operational Closure addition: a THIRD production UPDATE site against
 * `wlt1.wallet_screening_result` was added deliberately — `lib/stuck-screening.ts`'s own recovery
 * mutation, which flips a genuinely stuck `pending` row to the terminal `failed` status (migration
 * 065). This is not a violation of the two-site invariant this file was originally written to
 * protect; it is the Final Micro-Clarification's own explicitly load-bearing file-plan amendment
 * (this file's modification was itself part of that frozen plan). The allowed-site-set below is
 * expanded from two to exactly three, and a new structural assertion is added for the new site
 * mirroring the same guard discipline as the other two: it must only ever transition a `pending`
 * row, and it must only ever set `risk_status = 'failed'` — never back to `'pending'`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const WLT1_SRC = join(REPO_ROOT, "services", "wlt1", "src");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "dist" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Strips `/* ... *\/` block comments and `// ...` line comments before scanning — mirrors
 * `wlt1-screening-composition-boundary.test.ts`'s own identical helper exactly, so a doc comment
 * describing this exact SQL statement (as this test file's own header does) can never trip the
 * scan; only real SQL-statement source text counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

interface UpdateSite {
  relPath: string;
  /** A window of source text around (and including) the matched `UPDATE` keyword, wide enough to
   * contain the full SQL statement's SET/WHERE clauses for the secondary structural assertions
   * below — not a full SQL parse, proportionate to this file's narrow purpose. */
  window: string;
}

/** M-A hardening: case-insensitive, whitespace-tolerant (including newlines, via `\s+`), tolerant
 * of an optional `ONLY` keyword and an optional `wlt1.` schema qualifier. Matches `UPDATE
 * wlt1.wallet_screening_result`, `UPDATE\n  wlt1.wallet_screening_result`, `update
 * WALLET_SCREENING_RESULT`, and `UPDATE ONLY wallet_screening_result` alike — every variant
 * mutation-tested in `wlt1-screening-pending-row-mutation-boundary.test.ts`'s own review record.
 * Global flag so every occurrence in a file is found, not just the first. */
const UPDATE_SITE_PATTERN = /update\s+(only\s+)?(wlt1\.)?wallet_screening_result/gi;

function findWalletScreeningResultUpdateSites(): UpdateSite[] {
  const sites: UpdateSite[] = [];
  for (const file of listTsFiles(WLT1_SRC)) {
    const rel = relative(REPO_ROOT, file).split("\\").join("/");
    const content = stripComments(readFileSync(file, "utf8"));
    for (const match of content.matchAll(UPDATE_SITE_PATTERN)) {
      const idx = match.index ?? 0;
      sites.push({ relPath: rel, window: content.slice(idx, idx + 600) });
    }
  }
  return sites;
}

describe("WLT-01 Phase 2C-C3 — wallet_screening_result pending-row UPDATE ownership boundary", () => {
  it("exactly three production UPDATE sites exist against wlt1.wallet_screening_result, in exactly the expected three files", () => {
    const sites = findWalletScreeningResultUpdateSites();
    const relPaths = sites.map((s) => s.relPath).sort();
    expect(relPaths, `unexpected UPDATE site count/location(s) against wlt1.wallet_screening_result: ${JSON.stringify(relPaths)}`).toEqual(
      ["services/wlt1/src/lib/screening-application.ts", "services/wlt1/src/routes/wallet-screening.ts", "services/wlt1/src/lib/stuck-screening.ts"].sort(),
    );
  });

  it("the wallet-screening.ts site is structurally the guarded C3 retry-claim (risk_status='pending' AND the fixed cooldown predicate) — never an unconditional update", () => {
    const sites = findWalletScreeningResultUpdateSites().filter((s) => s.relPath === "services/wlt1/src/routes/wallet-screening.ts");
    expect(sites.length).toBe(1);
    const { window } = sites[0]!;
    expect(window, "the claim UPDATE must guard on risk_status = 'pending'").toContain("risk_status = 'pending'");
    expect(window, "the claim UPDATE must guard on the fixed cooldown interval predicate").toMatch(/updated_at_utc\s*<=\s*now\(\)\s*-\s*interval/);
    expect(window, "the claim UPDATE must set updated_at_utc = now()").toContain("SET updated_at_utc = now()");
  });

  it("the screening-application.ts site never sets a literal risk_status = 'pending' (it only ever transitions a row AWAY from pending, never back into it)", () => {
    const sites = findWalletScreeningResultUpdateSites().filter((s) => s.relPath === "services/wlt1/src/lib/screening-application.ts");
    expect(sites.length).toBe(1);
    const { window } = sites[0]!;
    expect(window).not.toContain("risk_status = 'pending'");
  });

  it("the stuck-screening.ts site (Stuck-Screening Operational Closure) is structurally the guarded recovery mutation: predicated on risk_status = 'pending', sets risk_status = 'failed', and never sets risk_status back to 'pending'", () => {
    const sites = findWalletScreeningResultUpdateSites().filter((s) => s.relPath === "services/wlt1/src/lib/stuck-screening.ts");
    expect(sites.length).toBe(1);
    const { window } = sites[0]!;
    expect(window, "the recovery UPDATE must guard on risk_status = 'pending'").toContain("risk_status = 'pending'");
    expect(window, "the recovery UPDATE must set risk_status = 'failed'").toContain("risk_status = 'failed'");
    // Isolate the SET clause specifically (not the WHERE predicate, which legitimately guards on
    // risk_status = 'pending' — see the assertion above) before checking it never re-sets pending.
    const setClauseMatch = window.match(/SET([\s\S]*?)WHERE/i);
    expect(setClauseMatch, "could not isolate the UPDATE's SET clause").toBeTruthy();
    expect(setClauseMatch![1], "the recovery UPDATE must never set risk_status back to 'pending'").not.toContain("risk_status = 'pending'");
  });

  it("NormalizedScreeningResult.riskStatus is structurally incapable of carrying 'pending' (RISK_STATUSES excludes it) — the terminal-application UPDATE can never persist 'pending' back onto a row via its own bound $1 parameter", () => {
    const content = stripComments(readFileSync(join(WLT1_SRC, "lib", "providers", "types.ts"), "utf8"));
    const match = content.match(/RISK_STATUSES\s*=\s*\[([^\]]+)\]/);
    expect(match, "RISK_STATUSES constant not found in providers/types.ts").toBeTruthy();
    const values = (match![1] ?? "").split(",").map((v) => v.trim().replace(/['"]/g, "")).filter(Boolean);
    expect(values).not.toContain("pending");
    expect(values.length).toBeGreaterThan(0);
  });

  it("services/wlt1/src/routes/wallet-screening.ts DOES contain the expected UPDATE — proves the scan itself is meaningful, not vacuously passing", () => {
    const sites = findWalletScreeningResultUpdateSites();
    expect(sites.some((s) => s.relPath === "services/wlt1/src/routes/wallet-screening.ts")).toBe(true);
  });

  // -----------------------------------------------------------------------------------------
  // M-A hardening (Phase 2C-D0) — committed permanent proof that UPDATE_SITE_PATTERN itself
  // (not merely today's two known-good production sites) genuinely catches the exact variants
  // independent Opus review proved the ORIGINAL literal-substring matcher missed. These run
  // against synthetic in-memory strings, not a live file mutation of production source — a
  // committed test cannot leave a permanent defect injected into services/wlt1/src/** as its own
  // evidence. A one-off live-file mutation probe (inject a third UPDATE site into a real
  // production file, confirm the FIRST test above fails, then revert byte-exact) was performed
  // out-of-band during review and is not itself committed here, by construction.
  // -----------------------------------------------------------------------------------------
  describe("M-A hardening — UPDATE_SITE_PATTERN catches every mutation-tested evasion form", () => {
    it("catches an ordinary multiline/wrapped UPDATE (a formatting style this codebase already uses for long SQL)", () => {
      const synthetic = `await query(client, \`UPDATE\n       wlt1.wallet_screening_result\n        SET updated_at_utc = now()\n      WHERE screening_result_id = $1\`, [id]);`;
      expect(synthetic.match(UPDATE_SITE_PATTERN) !== null).toBe(true);
    });

    it("catches a schema-unqualified UPDATE relying on search_path", () => {
      const synthetic = `await query(client, \`UPDATE wallet_screening_result SET updated_at_utc = now() WHERE screening_result_id = $1\`, [id]);`;
      expect(synthetic.match(UPDATE_SITE_PATTERN) !== null).toBe(true);
    });

    it("catches a mixed-case UPDATE (case-insensitivity is not incidental)", () => {
      const synthetic = `await query(client, \`Update Wlt1.Wallet_Screening_Result SET updated_at_utc = now() WHERE screening_result_id = $1\`, [id]);`;
      expect(synthetic.match(UPDATE_SITE_PATTERN) !== null).toBe(true);
    });

    it("catches an explicit ONLY-qualified UPDATE", () => {
      const synthetic = `await query(client, \`UPDATE ONLY wlt1.wallet_screening_result SET updated_at_utc = now() WHERE screening_result_id = $1\`, [id]);`;
      expect(synthetic.match(UPDATE_SITE_PATTERN) !== null).toBe(true);
    });

    it("KNOWN ACCEPTED OVER-MATCH: a table name that merely shares the prefix (e.g. a hypothetical wallet_screening_result_archive) also matches — documented deliberately, not an oversight", () => {
      const synthetic = `await query(client, \`UPDATE wlt1.wallet_screening_result_archive SET x = 1\`, [id]);`;
      // The pattern has no trailing word-boundary, so it DOES match a shared-prefix table name —
      // a strict superset scan is the safe direction for a security-load-bearing guard: a false
      // POSITIVE merely forces a human to look at an unrelated table; a false NEGATIVE would
      // silently break the C3 architecture invariant this guard exists to protect.
      expect(synthetic.match(UPDATE_SITE_PATTERN) !== null).toBe(true);
    });
  });
});
