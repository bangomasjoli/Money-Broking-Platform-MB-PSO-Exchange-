/**
 * F3(c) module-import-boundary static check, extended to KYC-01 (mirrors tests/unit/
 * aml1-import-boundary.test.ts / tests/unit/clt1-import-boundary.test.ts / etc.; reuses the
 * generic scanner rather than redefining one).
 *
 * Asserts `services/kyc1/src/**` never imports `services/iam/src/**`, `services/iam2/src/**`,
 * `services/sec1/src/**`, `services/cfg1/src/**`, `services/clt1/src/**`, or `services/aml1/src/**`
 * directly (services/fnd too, per the same convention every prior module's own boundary test
 * enforces), and only ever imports `@aix/foundation` via its bare public specifier (never a
 * subpath). `clt1`/`aml1` are included from day one — KYC-01's future CLT-01 delivery (Phase 2)
 * and any future AML-01 interaction (Phase 6+) will be HTTP-only via their own client libs, never
 * an import.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findModuleImportBoundaryViolations } from "../helpers/module-import-boundary.js";

const REPO_ROOT = join(__dirname, "..", "..");

describe("F3(c): KYC-01 module-import-boundary", () => {
  it("services/kyc1/src never imports services/iam, services/iam2, services/sec1, services/cfg1, services/clt1, services/aml1, or services/fnd internals, and never subpath-imports @aix/foundation", () => {
    const violations = findModuleImportBoundaryViolations({
      serviceSourceDir: join(REPO_ROOT, "services", "kyc1", "src"),
      otherServiceDirNames: ["iam", "iam2", "sec1", "cfg1", "clt1", "aml1", "fnd"],
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
