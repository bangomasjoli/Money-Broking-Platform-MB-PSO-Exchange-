/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/m2a-observe.ts` dirty-tree refusal. No
 * database is required for this test: it proves the refusal happens BEFORE any connection is
 * attempted, by supplying a deliberately unroutable `databaseUrl` and confirming the call still
 * resolves quickly with `status: "INVALID"` rather than hanging or throwing a connection error —
 * which would be the observable symptom if the dirty-tree check were ever bypassed and a real
 * connection attempt were made. The `OBSERVED` path (against a real database, with accurate
 * runtime pool values) is covered separately by `tests/integration/perf-m2a-observe.test.ts`,
 * which self-skips unless `TEST_DATABASE_URL` is set.
 */
import { describe, expect, it } from "vitest";
import { observeM2a } from "../../perf/src/m2a-observe.js";

const UNROUTABLE_DATABASE_URL = "postgres://user:pass@203.0.113.1:5999/does-not-exist"; // TEST-NET-3 (RFC 5737)

describe("observeM2a — dirty-tree refusal", () => {
  it(
    "returns status INVALID without ever attempting a database connection when the working tree is dirty",
    async () => {
      const result = await observeM2a({
        runId: "run-dirty-tree-test",
        databaseUrl: UNROUTABLE_DATABASE_URL,
        gitInfoProvider: () => ({ commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", workingTreeClean: false }),
      });
      expect(result.status).toBe("INVALID");
      expect(result.environment.database).toEqual({ observed: false });
      expect(result.details.effective.poolMax).toBeUndefined();
      expect(result.details.effective.connectionTimeoutMillis).toBeUndefined();
    },
    2000,
  );

  it("measurement_id is always exactly 'M2a', never 'M2', even on the INVALID path", async () => {
    const result = await observeM2a({
      runId: "run-dirty-tree-test-2",
      databaseUrl: UNROUTABLE_DATABASE_URL,
      gitInfoProvider: () => ({ commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", workingTreeClean: false }),
    });
    expect(result.measurement_id).toBe("M2a");
  });

  it("does_not_prove is present and non-empty even on the INVALID path", async () => {
    const result = await observeM2a({
      runId: "run-dirty-tree-test-3",
      databaseUrl: UNROUTABLE_DATABASE_URL,
      gitInfoProvider: () => ({ commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", workingTreeClean: false }),
    });
    expect(result.does_not_prove.length).toBeGreaterThan(0);
    expect(result.does_not_prove.some((s) => /production IAM process count/.test(s))).toBe(true);
    expect(result.does_not_prove.some((s) => /production C_iam/.test(s))).toBe(true);
    expect(result.does_not_prove.some((s) => /approve IAM_DB_POOL_MAX/.test(s))).toBe(true);
    expect(result.does_not_prove.some((s) => /complete M2\b/.test(s))).toBe(true);
    expect(result.does_not_prove.some((s) => /throughput capacity/.test(s))).toBe(true);
  });

  it("rejects a missing databaseUrl outright (caller error, not a silent no-op)", async () => {
    await expect(
      // @ts-expect-error — deliberately omitted for this test
      observeM2a({ runId: "run-test", gitInfoProvider: () => ({ commitSha: "abc", workingTreeClean: true }) }),
    ).rejects.toThrow(/databaseUrl is required/);
  });
});
