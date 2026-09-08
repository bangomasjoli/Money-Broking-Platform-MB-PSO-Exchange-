/**
 * F3(c) module-import-boundary scanner (blueprint FND-01 F3 finding, closed by IAM-01; extended
 * to every module since). SCANNER/HELPER CODE ONLY — no `describe`/`it`, no test registration, no
 * environment or database side effects. Every `*-import-boundary.test.ts` suite imports this file
 * directly and registers only its own tests.
 *
 * MED-1 remediation (WLT-01 Phase 0 review): the prior regex-based scanner
 * (`tests/unit/iam-import-boundary.test.ts`, now retired from this role) had 8 proven false
 * negatives (dynamic `import()`, template-literal dynamic `import()`, `require()`,
 * `require.resolve()`, `@aix/service-*` aliases and subpaths, `export ... from`, `export * from`)
 * and 2 proven false positives (commented-out import text, import-like text inside an ordinary
 * string literal). This version walks a real TypeScript AST (`ts.createSourceFile` +
 * `ts.forEachChild`) instead of matching text, which eliminates both false-positive classes
 * structurally (comments and unrelated string literals are never part of the syntax nodes this
 * scanner inspects) and lets every specifier-bearing form be handled as its own distinct,
 * enumerable node kind instead of one fragile regex.
 *
 * Forms inspected:
 *   - `ImportDeclaration`            — `import {x} from "s"`, `import type {X} from "s"`, `import "s"`
 *   - `ExportDeclaration`            — `export {x} from "s"`, `export type {X} from "s"`, `export * from "s"`
 *   - `ImportEqualsDeclaration`      — `import x = require("s")`
 *   - dynamic `import(...)`         — `await import("s")`, `await import(\`s\`)`
 *   - `require(...)` / `require.resolve(...)`
 *
 * Dynamic-specifier policy (fail closed): a string literal or a no-substitution template literal
 * argument is treated as a static specifier and resolved/inspected normally. ANY other argument
 * shape — an interpolated template literal, a variable, a function call, anything not a compile-
 * time-constant string — is a violation (`unresolvable_dynamic_specifier`). No module in this
 * codebase currently needs a genuinely dynamic module specifier; a legitimate future case is an
 * explicit exception to add here, not a silent pass-through.
 *
 * Sibling detection has two independent legs, both required:
 *   1. Relative-path traversal — the specifier is resolved to an absolute path against the
 *      IMPORTING FILE's own directory (not string-matched against the raw specifier text), then
 *      checked for a `services/<other>` path SEGMENT (exact segment equality, never substring —
 *      `services2` or `notservices/clt1` cannot false-positive). Backslashes are normalized to `/`
 *      before resolution so a Windows-style specifier is caught identically on any host OS.
 *   2. Package-alias traversal — `@aix/service-<other>` (exact) or `@aix/service-<other>/<subpath>`
 *      for any `other` in the caller-supplied forbidden set. The alias->package-name map is
 *      DERIVED from each sibling's own `services/<other>/package.json` `name` field (read once,
 *      relative to this file's own fixed location — two directories up is the repo root,
 *      independent of whatever `serviceSourceDir` the caller passes, so scratch/tmp-dir callers
 *      still resolve real sibling package names correctly) — never a hand-maintained duplicate
 *      list. A `services/<other>/package.json` that cannot be read falls back to the conventional
 *      `@aix/service-<other>` name (documented fallback for isolated/synthetic test fixtures that
 *      reference a real module name without a real file tree of their own).
 *
 * `@aix/foundation` is the one always-allowed cross-module specifier — but ONLY the bare
 * specifier. `packages/foundation/package.json`'s own `exports` map has a single public entry
 * (`"."`), so any subpath (`@aix/foundation/errors.js`) or relative traversal into
 * `packages/foundation/src/...` is `foundation_internal_import` — reaching past the package's own
 * declared public surface. The allowed public entry set is read from that `exports` map, not
 * hard-coded, so a future additional public export needs no change here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";

const HELPER_DIR = __dirname;
const REPO_ROOT = resolve(HELPER_DIR, "..", "..");
const SERVICES_DIR = join(REPO_ROOT, "services");
const FOUNDATION_PACKAGE_JSON = join(REPO_ROOT, "packages", "foundation", "package.json");
const FOUNDATION_PACKAGE_NAME = "@aix/foundation";

export type ViolationKind =
  | "sibling_relative_import"
  | "sibling_package_alias"
  | "foundation_internal_import"
  | "unresolvable_dynamic_specifier"
  | "malformed_module_specifier";

export interface ImportBoundaryViolation {
  /** Absolute path of the file containing the violation. */
  file: string;
  /** 1-indexed line of the specifier/argument token. */
  line: number;
  /** 1-indexed column of the specifier/argument token. */
  column: number;
  kind: ViolationKind;
  /** The normalized module specifier text (backslashes converted to `/`). Empty for a
   *  non-string-literal dynamic argument, where no specifier text exists to report. */
  specifier: string;
  /** The forbidden sibling module's directory name, when the violation resolved to one. */
  targetModule?: string;
}

export interface FindModuleImportBoundaryViolationsInput {
  /** Absolute path to the service's own source directory to scan (walked recursively). */
  serviceSourceDir: string;
  /** Sibling module directory names (e.g. "clt1", "fnd") this service must never import. */
  otherServiceDirNames: string[];
}

/** Reads `services/<dirName>/package.json`'s own `name` field; falls back to the platform-wide
 *  `@aix/service-<dirName>` convention when no such file exists (synthetic/scratch fixtures that
 *  reference a real module name without materializing a real package.json of their own). */
function resolveSiblingPackageName(dirName: string): string {
  try {
    const pkgPath = join(SERVICES_DIR, dirName, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
    if (typeof pkg.name === "string" && pkg.name.length > 0) return pkg.name;
  } catch {
    // Fall through to the conventional name.
  }
  return `@aix/service-${dirName}`;
}

/** Reads `packages/foundation/package.json`'s own `exports` map keys (public entries only) —
 *  never hard-coded, so a future additional public export needs no change here. Falls back to the
 *  known single entry (".") if the file is unreadable/malformed, which is always fail-closed
 *  (fewer allowed entries, not more). */
function resolveFoundationPublicEntries(): Set<string> {
  try {
    const pkg = JSON.parse(readFileSync(FOUNDATION_PACKAGE_JSON, "utf8")) as { exports?: Record<string, unknown> };
    const keys = pkg.exports ? Object.keys(pkg.exports) : ["."];
    return new Set(keys.length > 0 ? keys : ["."]);
  } catch {
    return new Set(["."]);
  }
}

/** LOW-1 remediation (WLT-01 Phase 1A follow-up): `.mts`/`.cts` are valid TypeScript source
 *  extensions the compiler treats identically to `.ts` (forced ESM/CJS module kind respectively)
 *  and could otherwise bypass this control entirely. `.js`/`.mjs`/`.cjs` are deliberately NOT
 *  included — `allowJs` is unset in every tsconfig in this repository, so JavaScript files are not
 *  part of the TypeScript program the platform actually builds; adding them would scan files this
 *  codebase does not compile. */
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** A single statically-determined (or explicitly failed-closed) specifier reference found in one
 *  source file, with its exact source position. */
interface SpecifierReference {
  /** Set when a compile-time-constant string specifier was found. */
  specifier?: string;
  /** Set (instead of `specifier`) when the argument could not be statically resolved — the
   *  dynamic-specifier fail-closed case. */
  unresolvable?: true;
  /** Set when a string-literal-shaped specifier was found but is empty/whitespace-only. */
  malformed?: true;
  line: number;
  column: number;
}

/** Extracts the literal text of a static specifier expression: a `StringLiteral` or a
 *  `NoSubstitutionTemplateLiteral` (per the accepted policy, a template literal with NO
 *  interpolation is treated as static — only an INTERPOLATED template or any other expression
 *  shape fails closed). Returns `undefined` for anything else. */
function staticSpecifierText(expr: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return undefined;
}

function positionOf(sourceFile: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function pushReferenceFromExpression(refs: SpecifierReference[], sourceFile: ts.SourceFile, expr: ts.Expression): void {
  const pos = positionOf(sourceFile, expr);
  const text = staticSpecifierText(expr);
  if (text !== undefined) {
    if (text.trim().length === 0) {
      refs.push({ malformed: true, ...pos });
    } else {
      refs.push({ specifier: text, ...pos });
    }
    return;
  }
  // Any other expression shape (interpolated template, identifier, call expression, ...) — the
  // module specifier cannot be determined at analysis time. Fail closed rather than skip it.
  refs.push({ unresolvable: true, ...pos });
}

/** Walks one parsed source file, collecting every specifier reference from every inspected
 *  syntax form (see file header). Pure AST traversal — comments and unrelated string literals are
 *  never visited because they are not part of these node shapes. */
function collectSpecifierReferences(sourceFile: ts.SourceFile): SpecifierReference[] {
  const refs: SpecifierReference[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      pushReferenceFromExpression(refs, sourceFile, node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      // Covers both `export {x} from "s"` / `export type {X} from "s"` and `export * from "s"`.
      pushReferenceFromExpression(refs, sourceFile, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      // `import x = require("s")`
      pushReferenceFromExpression(refs, sourceFile, node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      const isRequireResolve =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "require" &&
        callee.name.text === "resolve";
      if (isDynamicImport || isRequire || isRequireResolve) {
        const arg = node.arguments[0];
        if (arg) {
          pushReferenceFromExpression(refs, sourceFile, arg);
        } else {
          // require()/import() with no argument at all — nothing to resolve, not a violation
          // shape this scanner covers (a TypeScript type error in its own right).
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return refs;
}

function normalizeSeparators(specifier: string): string {
  return specifier.replace(/\\/g, "/");
}

/** Classifies one normalized, non-empty static specifier against the forbidden sibling set and
 *  the foundation public-entry set. Returns the violation kind + resolved target module, or
 *  `undefined` if the specifier is permitted. */
function classifySpecifier(
  importingFile: string,
  rawSpecifier: string,
  otherServiceDirNames: string[],
  foundationPublicEntries: Set<string>,
): { kind: ViolationKind; targetModule?: string } | undefined {
  const specifier = normalizeSeparators(rawSpecifier);

  // --- @aix/foundation: only the bare specifier (or a declared public export key) is allowed. ---
  if (specifier === FOUNDATION_PACKAGE_NAME || specifier.startsWith(`${FOUNDATION_PACKAGE_NAME}/`)) {
    const subpath = specifier === FOUNDATION_PACKAGE_NAME ? "." : `.${specifier.slice(FOUNDATION_PACKAGE_NAME.length)}`;
    if (foundationPublicEntries.has(subpath)) return undefined;
    return { kind: "foundation_internal_import" };
  }

  // --- @aix/service-<other> package alias, exact or subpath. ---
  for (const other of otherServiceDirNames) {
    const pkgName = resolveSiblingPackageName(other);
    if (specifier === pkgName || specifier.startsWith(`${pkgName}/`)) {
      return { kind: "sibling_package_alias", targetModule: other };
    }
  }

  // --- Relative traversal: resolve against the IMPORTING FILE's own directory, then check path
  //     segments (never substring matching against the raw specifier). ---
  if (specifier.startsWith(".")) {
    const resolved = resolve(dirname(importingFile), specifier).split(/[\\/]/);
    const servicesIdx = resolved.lastIndexOf("services");
    if (servicesIdx !== -1) {
      const siblingDir = resolved[servicesIdx + 1];
      if (siblingDir && otherServiceDirNames.includes(siblingDir)) {
        return { kind: "sibling_relative_import", targetModule: siblingDir };
      }
    }
    const packagesIdx = resolved.lastIndexOf("packages");
    if (packagesIdx !== -1 && resolved[packagesIdx + 1] === "foundation") {
      return { kind: "foundation_internal_import" };
    }
  }

  return undefined;
}

/**
 * Assert a service's own source tree never imports another service's internals — by relative
 * traversal or by package alias, statically or dynamically — and only imports `@aix/foundation`
 * via its declared public entry. Generic across modules — pass the module's own source dir + the
 * list of OTHER module directory names to forbid.
 */
export function findModuleImportBoundaryViolations(input: FindModuleImportBoundaryViolationsInput): ImportBoundaryViolation[] {
  const foundationPublicEntries = resolveFoundationPublicEntries();
  const violations: ImportBoundaryViolation[] = [];

  for (const file of listSourceFiles(input.serviceSourceDir)) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);

    for (const ref of collectSpecifierReferences(sourceFile)) {
      if (ref.unresolvable) {
        violations.push({ file, line: ref.line, column: ref.column, kind: "unresolvable_dynamic_specifier", specifier: "" });
        continue;
      }
      if (ref.malformed) {
        violations.push({ file, line: ref.line, column: ref.column, kind: "malformed_module_specifier", specifier: "" });
        continue;
      }
      const specifier = ref.specifier as string;
      const classified = classifySpecifier(file, specifier, input.otherServiceDirNames, foundationPublicEntries);
      if (classified) {
        violations.push({
          file,
          line: ref.line,
          column: ref.column,
          kind: classified.kind,
          specifier: normalizeSeparators(specifier),
          ...(classified.targetModule ? { targetModule: classified.targetModule } : {}),
        });
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.specifier !== b.specifier) return a.specifier < b.specifier ? -1 : 1;
    return 0;
  });
}
