/**
 * F3(c) module-import-boundary static check, extended to CLT-01 (mirrors
 * tests/unit/iam2-import-boundary.test.ts / tests/unit/sec1-import-boundary.test.ts /
 * tests/unit/cfg1-import-boundary.test.ts; reuses the generic scanner rather than redefining
 * one).
 *
 * Asserts `services/clt1/src/**` never imports `services/iam/src/**`, `services/iam2/src/**`,
 * `services/sec1/src/**`, or `services/cfg1/src/**` directly (services/fnd too, per the same
 * convention every prior module's own boundary test enforces), and only ever imports
 * `@aix/foundation` via its bare public specifier (never a subpath).
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): CLT-01 module-import-boundary", () => {
  it("services/clt1/src never imports services/iam, services/iam2, services/sec1, services/cfg1, or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "clt1", "src"),
      otherServiceDirNames: ["iam", "iam2", "sec1", "cfg1", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
