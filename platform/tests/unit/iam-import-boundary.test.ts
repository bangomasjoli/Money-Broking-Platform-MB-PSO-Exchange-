/**
 * F3(c) module-import-boundary static check (blueprint FND-01 F3 finding, closed by IAM-01).
 *
 * The scanner itself lives in `tests/helpers/module-import-boundary.ts` — a plain helper module
 * with no test registration, imported directly by every module's own boundary suite (MED-1
 * remediation: this file previously WAS the scanner, and every other module-specific suite
 * imported it as a `.test.ts` file, which re-registered these very tests inside every consumer.
 * That inflation is now gone — this file registers only IAM-01's own two tests). The scanner's
 * own direct unit tests (including the self-test "control" cases previously nested in this file)
 * now live in `tests/unit/module-import-boundary.test.ts`.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): IAM-01 module-import-boundary", () => {
  it("services/iam/src never imports services/fnd internals and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "iam", "src"),
      otherServiceDirNames: ["fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it("services/fnd/src does not subpath-import @aix/foundation either (platform-wide convention)", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "fnd", "src"),
      otherServiceDirNames: ["iam"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
