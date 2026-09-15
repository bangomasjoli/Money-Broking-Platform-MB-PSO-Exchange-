/**
 * FND-FIND-010 — @aix/foundation's `initPool` capacity-options seam. Pure unit-level: never
 * connects to a real database (`pg.Pool` performs no I/O until `.connect()` is called), so this
 * suite inspects the constructed `Pool` instance's own resolved `.options` — the same object
 * node-postgres itself uses internally — rather than mocking `pg`.
 *
 * Load-bearing property: the eight non-IAM services call `initPool(url)` with ONE argument and
 * must remain completely unaffected by this change. That is proven here directly, not merely by
 * TypeScript's optional-parameter compatibility.
 */
import { afterEach, describe, it, expect } from "vitest";
import { initPool, closePool } from "@aix/foundation";

// A syntactically valid connection string that is never actually dialled — `pg.Pool`'s
// constructor performs no I/O, only option resolution.
const CONN = "postgres://unused:unused@localhost:1/unused";

describe("FND-FIND-010 — initPool capacity-options seam", () => {
  afterEach(async () => {
    // Reset the module-level singleton between tests — the same pattern tests/integration/
    // iam-db.test.ts already uses for test isolation. A never-connected Pool's `.end()`
    // resolves cleanly (independently verified: no hang, no error).
    await closePool();
  });

  it("initPool(url) with NO options constructs the pool exactly as before this change — no explicit max/connectionTimeoutMillis passed", () => {
    const pool = initPool(CONN);
    // node-postgres's own unconditional default (`this.options.max || this.options.poolSize || 10`)
    // — proves no AIX-specific value was injected; this is the untouched library default.
    expect(pool.options.max).toBe(10);
    // connectionTimeoutMillis is NEVER defaulted by pg-pool — undefined here proves nothing was
    // passed for it, preserving today's "wait indefinitely on acquisition" behaviour unchanged.
    expect(pool.options.connectionTimeoutMillis).toBeUndefined();
  });

  it("initPool(url, { max, connectionTimeoutMillis }) passes the EXACT configured values through to pg.Pool", () => {
    const pool = initPool(CONN, { max: 7, connectionTimeoutMillis: 3_000 });
    expect(pool.options.max).toBe(7);
    expect(pool.options.connectionTimeoutMillis).toBe(3_000);
  });

  it("initPool(url, { max }) alone — connectionTimeoutMillis stays unset (partial options are independent)", () => {
    const pool = initPool(CONN, { max: 25 });
    expect(pool.options.max).toBe(25);
    expect(pool.options.connectionTimeoutMillis).toBeUndefined();
  });

  it("initPool(url, { connectionTimeoutMillis }) alone — max stays at the library default", () => {
    const pool = initPool(CONN, { connectionTimeoutMillis: 5_000 });
    expect(pool.options.max).toBe(10);
    expect(pool.options.connectionTimeoutMillis).toBe(5_000);
  });

  it("initPool(url, {}) — an empty options object behaves identically to no options at all", () => {
    const pool = initPool(CONN, {});
    expect(pool.options.max).toBe(10);
    expect(pool.options.connectionTimeoutMillis).toBeUndefined();
  });

  it("first-call-wins: a second initPool() call — with different options — does NOT reconfigure the existing singleton", () => {
    const first = initPool(CONN, { max: 12, connectionTimeoutMillis: 4_000 });
    const second = initPool(CONN, { max: 99, connectionTimeoutMillis: 99_999 });
    expect(second).toBe(first); // same object identity — the singleton was never replaced
    expect(second.options.max).toBe(12); // still the FIRST call's value, not the second's
    expect(second.options.connectionTimeoutMillis).toBe(4_000);
  });

  it("application_name remains 'aix-fnd' regardless of capacity options (unchanged, out of scope for this remediation)", () => {
    const pool = initPool(CONN, { max: 5, connectionTimeoutMillis: 1_000 });
    expect(pool.options.application_name).toBe("aix-fnd");
  });
});
