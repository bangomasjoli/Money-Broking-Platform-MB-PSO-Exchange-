/**
 * Static proof that `services/sec1/src/lib/external-anchor.ts` (the documented
 * ExternalSealAnchorProvider seam for a LATER, infrastructure-dependent phase) has ZERO call
 * sites anywhere in `services/sec1/src/**` — mirrors this codebase's existing
 * import-boundary-style tests (tests/unit/iam-import-boundary.test.ts /
 * sec1-import-boundary.test.ts). No DB required; pure static analysis of the checked-in
 * source tree.
 *
 * This proves the "no call sites" claim in external-anchor.ts's own header comment
 * structurally, not just by absence of evidence in a manual read-through.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const SEC1_SRC_DIR = join(REPO_ROOT, "services", "sec1", "src");
const EXTERNAL_ANCHOR_FILE = join(SEC1_SRC_DIR, "lib", "external-anchor.ts");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importRe = /import\s+(?:type\s+)?(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source)) !== null) {
    const spec = match[1];
    if (spec) specifiers.push(spec);
  }
  return specifiers;
}

describe("external-anchor.ts — zero call sites (documented seam only)", () => {
  it("the interface file exists", () => {
    expect(() => readFileSync(EXTERNAL_ANCHOR_FILE, "utf8")).not.toThrow();
  });

  it("external-anchor.ts exports the interface only — no implementation, no NullAnchorProvider declaration, no default export", () => {
    const source = readFileSync(EXTERNAL_ANCHOR_FILE, "utf8");
    expect(source).toContain("export interface ExternalSealAnchorProvider");
    expect(source).not.toMatch(/export default/);
    // Check for an actual DECLARATION of a NullAnchorProvider/anchor-implementing
    // class/const/function — not just the word appearing in prose (the file's own header
    // comment legitimately explains WHY no such thing exists, so a bare word-match would
    // false-positive on its own documentation).
    expect(source).not.toMatch(/\b(class|const|function)\s+\w*NullAnchorProvider\b/);
    expect(source).not.toMatch(/class\s+\w*\s+implements\s+ExternalSealAnchorProvider/);
    expect(source).not.toMatch(/^\s*export\s+(class|const|function)\s+\w*AnchorProvider\b/m);
  });

  it("NOTHING in services/sec1/src/** imports external-anchor(.js/.ts), including external-anchor.ts's own file", () => {
    const files = listTsFiles(SEC1_SRC_DIR);
    const violations: Array<{ file: string; specifier: string }> = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractImportSpecifiers(source)) {
        if (specifier.includes("external-anchor")) {
          violations.push({ file, specifier });
        }
      }
    }

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
