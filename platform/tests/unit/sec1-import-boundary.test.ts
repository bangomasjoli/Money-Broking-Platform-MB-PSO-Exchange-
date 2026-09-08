/**
 * F3(c) module-import-boundary static check, extended to SEC-01 (mirrors
 * tests/unit/iam2-import-boundary.test.ts; reuses the generic scanner rather than redefining
 * one).
 *
 * Asserts `services/sec1/src/**` never imports `services/iam/src/**`, `services/iam2/src/**`,
 * or `services/fnd/src/**` directly, and only ever imports `@aix/foundation` via its bare
 * public specifier (never a subpath).
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): SEC-01 module-import-boundary", () => {
  it("services/sec1/src never imports services/iam, services/iam2, or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "sec1", "src"),
      otherServiceDirNames: ["iam", "iam2", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
