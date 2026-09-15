/**
 * FND-FIND-010 — functional fail-fast proof for a saturated, explicitly-timed-out pool.
 *
 * THIS IS A FUNCTIONAL TEST, NOT M5 CAPACITY CALIBRATION. It proves the mechanism (a positive
 * `connectionTimeoutMillis` converts pool exhaustion from "wait indefinitely" into a bounded,
 * observable failure) using a deliberately tiny test-only pool. No timing/performance figure
 * from this file may be cited as calibration evidence — M5 is a separate, later, production-
 * shape measurement exercise.
 *
 * Self-skips unless TEST_DATABASE_URL is set, mirroring tests/integration/iam-db.test.ts's own
 * gating convention. Requires only a reachable Postgres server — no AIX schema/migration is
 * needed, since `pool.connect()` merely needs a valid TCP+auth handshake.
 */
import { afterEach, describe, it, expect } from "vitest";
import { closePool, initPool } from "@aix/foundation";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("FND-FIND-010 — pool saturation is a bounded, fail-fast failure", () => {
  afterEach(async () => {
    await closePool();
  });

  it("with max=1 and a short connectionTimeoutMillis, a second concurrent acquisition fails closed within the configured bound — never hangs indefinitely", async () => {
    const TIMEOUT_MS = 400;
    const pool = initPool(TEST_DB as string, { max: 1, connectionTimeoutMillis: TIMEOUT_MS });

    // Exhaust the pool's single slot and hold it — this is what "saturation" means for max=1.
    const held = await pool.connect();
    try {
      const startedAt = Date.now();
      await expect(pool.connect()).rejects.toThrow(/timeout exceeded when trying to connect/i);
      const elapsedMs = Date.now() - startedAt;

      // Bounded, not indefinite: the rejection must land close to the configured timeout, not
      // near-instant (which would indicate a different failure) and not many multiples of it
      // (which would indicate the timeout was silently ignored and something else eventually
      // gave up). A generous band avoids CI-timing flakiness while still proving boundedness.
      expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_MS - 100);
      expect(elapsedMs).toBeLessThan(TIMEOUT_MS * 5);
    } finally {
      held.release();
    }
  });

  it("once the held connection is released, a subsequent acquisition succeeds immediately (the pool was never actually broken)", async () => {
    const pool = initPool(TEST_DB as string, { max: 1, connectionTimeoutMillis: 400 });
    const first = await pool.connect();
    first.release();

    const second = await pool.connect();
    try {
      const result = await second.query("SELECT 1 AS ok");
      expect(result.rows[0].ok).toBe(1);
    } finally {
      second.release();
    }
  });
});
