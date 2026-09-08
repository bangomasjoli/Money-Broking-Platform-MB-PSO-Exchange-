/**
 * F3(c) module-import-boundary static check, extended to WLT-01 (mirrors tests/unit/
 * aml1-import-boundary.test.ts / tests/unit/clt1-import-boundary.test.ts / tests/unit/
 * kyc1-import-boundary.test.ts; reuses the generic scanner rather than redefining one).
 *
 * Asserts `services/wlt1/src/**` never imports `services/iam/src/**`, `services/iam2/src/**`,
 * `services/sec1/src/**`, `services/cfg1/src/**`, `services/clt1/src/**`, `services/kyc1/src/**`,
 * or `services/aml1/src/**` directly (services/fnd too, per the same convention every prior
 * module's own boundary test enforces), and only ever imports `@aix/foundation` via its bare
 * public specifier (never a subpath). All seven siblings are included from day one — WLT-01 will
 * eventually talk to five of them (CFG-01/CLT-01/KYC-01/AML-01/IAM-02) over HTTP, never an
 * import.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): WLT-01 module-import-boundary", () => {
  it("services/wlt1/src never imports services/iam, services/iam2, services/sec1, services/cfg1, services/clt1, services/kyc1, services/aml1, or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "wlt1", "src"),
      otherServiceDirNames: ["iam", "iam2", "sec1", "cfg1", "clt1", "kyc1", "aml1", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
