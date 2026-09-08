/**
 * F3(c) module-import-boundary static check, extended to IAM-02 (mirrors
 * tests/unit/iam-import-boundary.test.ts; reuses its generic scanner rather than
 * redefining one — see that file's header comment, which already anticipated later
 * modules reusing `findModuleImportBoundaryViolations`).
 *
 * Asserts `services/iam2/src/**` never imports `services/iam/src/**` or
 * `services/fnd/src/**` directly, and only ever imports `@aix/foundation` via its bare
 * public specifier (never a subpath) — the same F3(c) discipline IAM-01 proved, applied one
 * level further per the IAM-02 implementation plan ("this gives IAM-02 the same F3(c)
 * import-boundary test IAM-01 has, extended one level").
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): IAM-02 module-import-boundary", () => {
  it("services/iam2/src never imports services/iam or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "iam2", "src"),
      otherServiceDirNames: ["iam", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
