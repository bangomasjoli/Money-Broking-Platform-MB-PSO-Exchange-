/**
 * F3(c) module-import-boundary static check, extended to AML-01 (mirrors
 * tests/unit/clt1-import-boundary.test.ts / tests/unit/cfg1-import-boundary.test.ts /
 * tests/unit/sec1-import-boundary.test.ts / tests/unit/iam2-import-boundary.test.ts; reuses the
 * generic scanner rather than redefining one).
 *
 * Asserts `services/aml1/src/**` never imports `services/iam/src/**`, `services/iam2/src/**`,
 * `services/sec1/src/**`, `services/cfg1/src/**`, or `services/clt1/src/**` directly (services/
 * fnd too, per the same convention every prior module's own boundary test enforces), and only
 * ever imports `@aix/foundation` via its bare public specifier (never a subpath). `clt1` is
 * included from day one — AML-01's future CLT-01 wiring (deferred past Phase 0) will be HTTP-only
 * via its own `lib/clt1-client.ts`, never an import.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): AML-01 module-import-boundary", () => {
  it("services/aml1/src never imports services/iam, services/iam2, services/sec1, services/cfg1, services/clt1, or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "aml1", "src"),
      otherServiceDirNames: ["iam", "iam2", "sec1", "cfg1", "clt1", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
