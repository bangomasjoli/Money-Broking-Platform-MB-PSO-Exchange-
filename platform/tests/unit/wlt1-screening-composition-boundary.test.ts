/**
 * WLT-01 Phase 2C-C2 — P2CC1-MED-1 closure: a dedicated WLT-local production source-text guard
 * proving `server.ts` is the SOLE production call site allowed to construct the screening
 * application service. Independent Opus review's own §3 disposition: keep
 * `createScreeningApplication` exported (43 committed `wlt1-screening-application.test.ts` tests
 * legitimately construct it directly), and do NOT widen the shared cross-service
 * `findModuleImportBoundaryViolations` helper (its contract has no notion of forbidden NAMED
 * imports) — a small dedicated text scan is the smallest load-bearing control.
 *
 * Two independent guarantees, both proven by direct source-text inspection (not AST — a plain
 * substring/import-statement search is sufficient and proportionate for this narrow purpose):
 *   1. No file under `services/wlt1/src/**` other than `server.ts` (and
 *      `lib/screening-application.ts` itself, which must obviously reference its own export) may
 *      contain the identifier `createScreeningApplication`.
 *   2. No file under `services/wlt1/src/routes/**` may import `loadWlt1Config` — a route must
 *      never be able to construct its own `Wlt1Config`, let alone a screening service from one.
 *
 * `tests/**`, `dist/**`, and `node_modules/**` are out of scope — this guards PRODUCTION
 * composition authority only.
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

/** Strips `/* ... *\/` block comments and `// ...` line comments before scanning — a doc comment
 * legitimately explaining "the route never calls `createScreeningApplication`" must not itself
 * trip this guard; only real import/call-site source text matters. Not a full tokenizer (does not
 * special-case string literals containing `//`), which is fine here — no file in this scan ever
 * embeds either identifier inside a string literal. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("WLT-01 Phase 2C-C2, P2CC1-MED-1 closure: sole production screening-service construction site", () => {
  it("only server.ts (and screening-application.ts's own definition) references createScreeningApplication under services/wlt1/src/**", () => {
    const allowed = new Set(["src/server.ts", "src/lib/screening-application.ts"]);
    const offenders: string[] = [];
    for (const file of listTsFiles(WLT1_SRC)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      if (allowed.has(rel)) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes("createScreeningApplication")) offenders.push(rel);
    }
    expect(offenders, `unexpected reference(s) to createScreeningApplication outside server.ts: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("no file under services/wlt1/src/routes/** imports loadWlt1Config", () => {
    const routesDir = join(WLT1_SRC, "routes");
    const offenders: string[] = [];
    for (const file of listTsFiles(routesDir)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes("loadWlt1Config")) offenders.push(rel);
    }
    expect(offenders, `unexpected loadWlt1Config reference under routes/**: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("no file under services/wlt1/src/routes/** imports createScreeningApplication (redundant with the whole-service scan above, kept as an explicit route-scoped assertion)", () => {
    const routesDir = join(WLT1_SRC, "routes");
    const offenders: string[] = [];
    for (const file of listTsFiles(routesDir)) {
      const rel = relative(join(REPO_ROOT, "services", "wlt1"), file).split("\\").join("/");
      const content = stripComments(readFileSync(file, "utf8"));
      if (content.includes("createScreeningApplication")) offenders.push(rel);
    }
    expect(offenders, `unexpected createScreeningApplication reference under routes/**: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("services/wlt1/src/server.ts DOES reference createScreeningApplication in real source (import + call site) — proves the scan itself is meaningful, not vacuously passing", () => {
    const content = stripComments(readFileSync(join(WLT1_SRC, "server.ts"), "utf8"));
    const matches = content.match(/createScreeningApplication/g) ?? [];
    // Import statement + one call site = 2 real occurrences (comments already stripped).
    expect(matches.length).toBe(2);
  });
});
