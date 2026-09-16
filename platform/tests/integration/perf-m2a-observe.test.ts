/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/m2a-observe.ts` live verification against a
 * real, reachable PostgreSQL server. Mirrors `tests/integration/iam-db-pool-saturation.test.ts`'s
 * own self-skip convention: self-skips unless `TEST_DATABASE_URL` is set. Requires only a
 * reachable Postgres server (no AIX schema/migration needed — `pool.connect()` only needs a
 * valid TCP+auth handshake, and `pg_settings` is queried directly with no schema dependency).
 *
 * THIS IS A FUNCTIONAL VERIFICATION OF THE M2a OBSERVER, NOT A CAPACITY MEASUREMENT. The pool
 * values used here (`max: 3`, `connectionTimeoutMillis: 1500`) are TEST-ONLY, chosen only to be
 * distinguishable from node-postgres's own defaults (`max: 10`, `connectionTimeoutMillis:
 * undefined`) — no figure from this file may be cited as calibration evidence.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { closePool } from "@aix/foundation";
import { afterEach, describe, expect, it } from "vitest";
import { observeM2a } from "../../perf/src/m2a-observe.js";
import { writeEvidenceAtomic } from "../../perf/src/evidence-store.js";
import { createRunId } from "../../perf/src/run-id.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const TEST_EVIDENCE_DIR = resolve(import.meta.dirname, "..", "..", "perf", "evidence", "perf-m2a-observe-test");

describe.skipIf(!TEST_DB)("observeM2a — live verification against a real PostgreSQL server", () => {
  afterEach(async () => {
    await closePool();
    if (existsSync(TEST_EVIDENCE_DIR)) {
      rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true });
    }
  });

  it("returns status OBSERVED with effective values equal to the requested TEST-ONLY pool options", async () => {
    const runId = createRunId({ commitSha: "0000000000000000000000000000000000000000" });
    const result = await observeM2a({
      runId,
      databaseUrl: TEST_DB as string,
      poolOptions: { max: 3, connectionTimeoutMillis: 1500 },
    });

    expect(result.status).toBe("OBSERVED");
    expect(result.measurement_id).toBe("M2a");
    expect(result.details.effective.poolMax).toBe(3);
    expect(result.details.effective.connectionTimeoutMillis).toBe(1500);
    expect(result.details.requested).toEqual({ poolMax: 3, connectionTimeoutMillis: 1500 });

    // No production process count, no production C_iam, no policy value claimed.
    expect(result.does_not_prove.length).toBeGreaterThan(0);

    // Database fingerprint was genuinely queried (not fabricated).
    expect(result.environment.database.observed).toBe(true);
    if (result.environment.database.observed) {
      expect(typeof result.environment.database.postgres_version).toBe("string");
      expect(result.environment.database.postgres_version.length).toBeGreaterThan(0);
      expect(result.environment.database.max_connections).toBeGreaterThan(0);
      expect(result.environment.database.superuser_reserved_connections).toBeGreaterThanOrEqual(0);
    }

    // Service topology is tagged as a single local observation, never production topology.
    expect(result.environment.service_topology.observed).toBe(true);
    if (result.environment.service_topology.observed) {
      expect(result.environment.service_topology.iam_processes_total).toBe(1);
      expect(result.environment.service_topology.source).toMatch(/observed_local_process/);
    }
  });

  it("effective pool.max falls back to node-postgres's own default (10) when no options are requested", async () => {
    const runId = createRunId({ commitSha: "0000000000000000000000000000000000000000" });
    const result = await observeM2a({ runId, databaseUrl: TEST_DB as string });
    expect(result.status).toBe("OBSERVED");
    expect(result.details.effective.poolMax).toBe(10);
    expect(result.details.effective.connectionTimeoutMillis).toBeUndefined();
  });

  it("the OBSERVED result passes the secret scanner and can be written to evidence with no secret leakage", async () => {
    const runId = createRunId({ commitSha: "0000000000000000000000000000000000000000" });
    const result = await observeM2a({
      runId,
      databaseUrl: TEST_DB as string,
      poolOptions: { max: 3, connectionTimeoutMillis: 1500 },
    });
    expect(result.status).toBe("OBSERVED");

    // TEST_DB itself is never passed as `data` — this proves the RESULT object (which is what a
    // real producer would actually write) contains no DATABASE_URL-shaped credential, since the
    // conservative environment-manifest design never records host/port/connection string.
    const path = writeEvidenceAtomic({
      relativePath: `perf-m2a-observe-test/${runId}.json`,
      data: result,
      knownSecrets: [TEST_DB],
    });
    expect(path).toContain("perf-m2a-observe-test");
  });
});
