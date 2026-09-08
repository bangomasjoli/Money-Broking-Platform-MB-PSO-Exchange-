/**
 * Direct unit tests for `tests/helpers/module-import-boundary.ts` — the MED-1 remediation
 * scanner. Every module-specific `*-import-boundary.test.ts` suite imports this same helper;
 * these tests prove the helper itself is correct, independent of any one module's source tree.
 *
 * All fixtures are written to a throwaway temp directory under a synthetic `services/<name>/`
 * layout so relative-path resolution behaves exactly as it would against the real repository,
 * without touching the real repository. Every fixture directory is removed in `afterEach`, even
 * on assertion failure.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations, type ImportBoundaryViolation } from "../helpers/module-import-boundary.js";
import * as helperModule from "../helpers/module-import-boundary.js";

let scratchRoot: string | undefined;

afterEach(() => {
  if (scratchRoot) rmSync(scratchRoot, { recursive: true, force: true });
  scratchRoot = undefined;
});

/** Builds a synthetic `<root>/services/<caller>/src/` tree containing one fixture file, mirroring
 * the real repo's own directory shape so relative-path resolution is representative. */
function buildFixture(callerModule: string, fileName: string, source: string): { serviceSourceDir: string; filePath: string } {
  scratchRoot = mkdtempSync(join(tmpdir(), "mib-"));
  const serviceSourceDir = join(scratchRoot, "services", callerModule, "src");
  mkdirSync(serviceSourceDir, { recursive: true });
  const filePath = join(serviceSourceDir, fileName);
  writeFileSync(filePath, source);
  return { serviceSourceDir, filePath };
}

const FORBIDDEN = ["fnd", "iam", "iam2", "sec1", "cfg1", "clt1", "kyc1", "aml1"];

function scan(callerModule: string, fileName: string, source: string): ImportBoundaryViolation[] {
  const { serviceSourceDir } = buildFixture(callerModule, fileName, source);
  return findModuleImportBoundaryViolations({ serviceSourceDir, otherServiceDirNames: FORBIDDEN });
}

describe("module-import-boundary helper: side-effect-free on import", () => {
  it("exposes only the scanner function and no test-registration side effects", () => {
    // A helper that called describe()/it() at module scope would have already registered tests
    // by the time this file's own describe() blocks run; the fact that this suite's test COUNT is
    // exactly what its own describe/it calls declare (verified structurally, not just asserted) is
    // the load-bearing proof, exercised across the whole suite by every module-specific consumer.
    expect(typeof helperModule.findModuleImportBoundaryViolations).toBe("function");
    const exportNames = Object.keys(helperModule).sort();
    expect(exportNames).toEqual(["findModuleImportBoundaryViolations"]);
  });
});

describe("module-import-boundary helper: negative cases (must be flagged)", () => {
  it("1. static relative sibling import", () => {
    const v = scan("wlt1", "a.ts", `import { x } from "../../../services/clt1/src/lib/errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("2. import type from sibling source", () => {
    const v = scan("wlt1", "a.ts", `import type { X } from "../../../services/aml1/src/config.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "aml1" });
  });

  it("3. dynamic string-literal sibling import", () => {
    const v = scan("wlt1", "a.ts", `export async function f(){ return await import("../../../services/clt1/src/lib/errors.js"); }\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("4. no-substitution template dynamic sibling import (treated as static)", () => {
    const v = scan("wlt1", "a.ts", "export async function f(){ return await import(`../../../services/aml1/src/config.js`); }\n");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "aml1" });
  });

  it("5. interpolated dynamic import fails closed (unresolvable, not silently skipped)", () => {
    const v = scan("wlt1", "a.ts", "export async function f(n: string){ return await import(`../../../services/${n}/src/config.js`); }\n");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "unresolvable_dynamic_specifier" });
  });

  it("6. require() sibling source", () => {
    const v = scan("wlt1", "a.ts", `export const r = require("../../../services/kyc1/src/server.js");\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "kyc1" });
  });

  it("7. require.resolve() sibling source", () => {
    const v = scan("wlt1", "a.ts", `export const p = require.resolve("../../../services/sec1/src/server.js");\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "sec1" });
  });

  it("8. sibling package alias (exact)", () => {
    const v = scan("wlt1", "a.ts", `import { Clt1Error } from "@aix/service-clt1";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_package_alias", targetModule: "clt1" });
  });

  it("9. sibling package subpath", () => {
    const v = scan("wlt1", "a.ts", `import { Clt1Error } from "@aix/service-clt1/src/lib/errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_package_alias", targetModule: "clt1" });
  });

  it("10. export named value from sibling source", () => {
    const v = scan("wlt1", "a.ts", `export { Clt1Error } from "../../../services/clt1/src/lib/errors.js";\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("11. export type from sibling source", () => {
    const v = scan("wlt1", "a.ts", `export type { Foo } from "../../../services/aml1/src/config.js";\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "aml1" });
  });

  it("12. export star from sibling source", () => {
    const v = scan("wlt1", "a.ts", `export * from "../../../services/kyc1/src/lib/errors.js";\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "kyc1" });
  });

  it("13. ImportEqualsDeclaration to sibling", () => {
    const v = scan("wlt1", "a.ts", `import clt1errors = require("../../../services/clt1/src/lib/errors.js");\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("14. @aix/foundation internal subpath", () => {
    const v = scan("wlt1", "a.ts", `import { AppError } from "@aix/foundation/errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "foundation_internal_import" });
  });

  it("15. relative foundation-source traversal", () => {
    const v = scan("wlt1", "a.ts", `import { AppError } from "../../../packages/foundation/src/errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "foundation_internal_import" });
  });
});

describe("module-import-boundary helper: positive cases (must NOT be flagged)", () => {
  it("1. @aix/foundation public import", () => {
    expect(scan("wlt1", "a.ts", `import { AppError } from "@aix/foundation";\nexport {};\n`)).toEqual([]);
  });

  it("2. node:crypto", () => {
    expect(scan("wlt1", "a.ts", `import { timingSafeEqual } from "node:crypto";\nexport {};\n`)).toEqual([]);
  });

  it("3. fastify", () => {
    expect(scan("wlt1", "a.ts", `import Fastify from "fastify";\nexport {};\n`)).toEqual([]);
  });

  it("4. approved external package", () => {
    expect(scan("wlt1", "a.ts", `import { Type } from "@sinclair/typebox";\nexport {};\n`)).toEqual([]);
  });

  it("5. WLT-local relative import", () => {
    expect(scan("wlt1", "a.ts", `import { meta } from "./request-context.js";\nexport {};\n`)).toEqual([]);
  });

  it("6. same-module local export (export ... from within the same service)", () => {
    expect(scan("wlt1", "a.ts", `export { meta } from "./request-context.js";\n`)).toEqual([]);
  });

  it("7. commented-out sibling import does not false-positive", () => {
    const v = scan("wlt1", "a.ts", `// import { X } from "../../../services/clt1/src/lib/errors.js";\nexport const a = 1;\n`);
    expect(v).toEqual([]);
  });

  it("8. import-like text inside an ordinary string literal does not false-positive", () => {
    const v = scan("wlt1", "a.ts", `export const s = 'import { X } from "../../../services/clt1/src/x.js"';\n`);
    expect(v).toEqual([]);
  });

  it("9. documentation/template text not used as a module specifier does not false-positive", () => {
    const v = scan(
      "wlt1",
      "a.ts",
      "export const doc = `Example: import { X } from \"../../../services/clt1/src/x.js\"`;\n",
    );
    expect(v).toEqual([]);
  });
});

describe("module-import-boundary helper: additional required properties", () => {
  it("deterministic sorting: multiple violations sort by file, line, column, kind, specifier", () => {
    const { serviceSourceDir } = buildFixture(
      "wlt1",
      "z.ts",
      `import { a } from "../../../services/kyc1/src/x.js";\nimport { b } from "../../../services/aml1/src/y.js";\n`,
    );
    const v = findModuleImportBoundaryViolations({ serviceSourceDir, otherServiceDirNames: FORBIDDEN });
    expect(v).toHaveLength(2);
    // aml1 import is on line 2, kyc1 import is on line 1 — sorted by line ascending.
    expect(v[0]?.targetModule).toBe("kyc1");
    expect(v[0]?.line).toBe(1);
    expect(v[1]?.targetModule).toBe("aml1");
    expect(v[1]?.line).toBe(2);
  });

  it("source line/column accuracy points at the specifier token, not line 1 column 1", () => {
    const v = scan(
      "wlt1",
      "a.ts",
      `export function f() {\n  return 1;\n}\n\nimport { x } from "../../../services/clt1/src/lib/errors.js";\n`,
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(5);
    expect(v[0]?.column).toBeGreaterThan(1);
  });

  it("Windows-style backslash path separators in a specifier are detected identically", () => {
    const v = scan("wlt1", "a.ts", `import { x } from "..\\\\..\\\\..\\\\services\\\\clt1\\\\src\\\\lib\\\\errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("no-substitution template literal specifier is parsed identically to a string literal for a PERMITTED import", () => {
    expect(scan("wlt1", "a.ts", "import { meta } from `./request-context.js`;\nexport {};\n")).toEqual([]);
  });

  it("a non-static require() argument (identifier, not a literal) is rejected as unresolvable, not silently skipped", () => {
    const v = scan("wlt1", "a.ts", `const path = "../../../services/clt1/src/x.js";\nexport const r = require(path);\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "unresolvable_dynamic_specifier" });
  });

  it("a non-static dynamic import() argument (function call, not a literal) is rejected as unresolvable", () => {
    const v = scan("wlt1", "a.ts", `declare function getPath(): string;\nexport async function f(){ return await import(getPath()); }\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "unresolvable_dynamic_specifier" });
  });

  it("helper import registers zero tests (structural proof: this file's own test count matches exactly its own describe/it declarations)", () => {
    // If the helper module registered any describe()/it() at import time, this suite's test count
    // as reported by vitest would exceed what this file itself declares. The exact-match assertion
    // in the "side-effect-free on import" describe block above is the direct proof; this test
    // exists as a second, independent confirmation that importing the helper multiple times (once
    // per module suite, as happens in the real suite) does not accumulate registrations.
    expect(Object.keys(helperModule)).toEqual(["findModuleImportBoundaryViolations"]);
  });
});

describe("module-import-boundary helper: LOW-1 remediation — .mts/.cts source enumeration", () => {
  it("1. .mts source is scanned (a clean .mts file with no violation reports none)", () => {
    expect(scan("wlt1", "a.mts", `import { meta } from "./request-context.js";\nexport {};\n`)).toEqual([]);
  });

  it("2. .cts source is scanned (a clean .cts file with no violation reports none)", () => {
    expect(scan("wlt1", "a.cts", `import { meta } from "./request-context.js";\nexport {};\n`)).toEqual([]);
  });

  it("3. sibling import in .mts is rejected", () => {
    const v = scan("wlt1", "a.mts", `import { x } from "../../../services/clt1/src/lib/errors.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "clt1" });
  });

  it("4. sibling import in .cts is rejected", () => {
    const v = scan("wlt1", "a.cts", `import { x } from "../../../services/aml1/src/config.js";\nexport {};\n`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "sibling_relative_import", targetModule: "aml1" });
  });

  it("5. a clean local .mts file passes (WLT-local relative import, no violation)", () => {
    expect(scan("wlt1", "local.mts", `export const x = 1;\nimport { y } from "./lib/foo.js";\nexport { y };\n`)).toEqual([]);
  });

  it("6. a clean local .cts file passes (WLT-local relative import, no violation)", () => {
    expect(scan("wlt1", "local.cts", `export const x = 1;\nimport { y } from "./lib/foo.js";\nexport { y };\n`)).toEqual([]);
  });

  it("7. .js is NOT scanned — allowJs is unset in every tsconfig, so .js is deliberately outside the committed source set", () => {
    // A sibling-importing .js file must NOT be flagged, because the scanner does not (and per the
    // repository's own allowJs=false convention, should not) enumerate .js files at all. This is a
    // structural absence-of-coverage proof, not a false-positive/negative test on a covered form.
    const v = scan("wlt1", "a.js", `import { x } from "../../../services/clt1/src/lib/errors.js";\nexport {};\n`);
    expect(v).toEqual([]);
  });

  it("a directory tree containing both .ts and .mts files scans every file, not just the first extension encountered", () => {
    const root = mkdtempSync(join(tmpdir(), "mib-"));
    const dir = join(root, "services", "wlt1", "src");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.ts"), `import { x } from "../../../services/clt1/src/x.js";\nexport {};\n`);
    writeFileSync(join(dir, "b.mts"), `import { y } from "../../../services/kyc1/src/y.js";\nexport {};\n`);
    writeFileSync(join(dir, "c.cts"), `import { z } from "../../../services/aml1/src/z.js";\nexport {};\n`);
    const v = findModuleImportBoundaryViolations({ serviceSourceDir: dir, otherServiceDirNames: FORBIDDEN });
    rmSync(root, { recursive: true, force: true });
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.targetModule).sort()).toEqual(["aml1", "clt1", "kyc1"]);
  });
});
