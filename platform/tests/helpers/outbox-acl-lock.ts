/**
 * WLT-01 Phase 2A — test-only advisory-lock wrapper serializing temporary REVOKE/GRANT mutations
 * against `foundation.outbox_event`'s ACL.
 *
 * Multiple integration suites (cfg1/aml1/clt1/kyc1/wlt1) each temporarily REVOKE then GRANT INSERT
 * on this ONE shared table inside their own audit-failure tests. Vitest's default parallel
 * file-scheduling can occasionally interleave two files' ACL mutations on the same catalog row,
 * producing a rare, non-deterministic PostgreSQL "tuple concurrently updated" error — pre-existing
 * test-infrastructure flakiness (present before WLT-01 existed), not a logic defect in any module
 * (see the WLT-01 Phase 1B independent Opus review's residual-findings section).
 *
 * TEST-ONLY. Never referenced by any runtime `src/` file, never touches production grants or role
 * permissions. WLT-01 Phase 2A adopts it for its own two ACL-mutation sites only
 * (`tests/integration/wlt1-db.test.ts`) — the other four modules' equivalent sites remain a
 * documented platform carry-forward. A shared lock only closes the race once every mutating suite
 * holds it, so this partial adoption reduces, but does not yet eliminate, the collision window.
 */
import { Client } from "pg";

/**
 * Acquires a transaction-scoped Postgres advisory lock (`aix.test.outbox_acl`) on a DEDICATED
 * connection — never the shared `verifyPool` a caller might also be using for other queries, so
 * this lock can never be released early by an unrelated query sharing a pooled connection. `fn` is
 * expected to perform its own REVOKE/test-body/GRANT sequence, with its own `finally`-guaranteed
 * GRANT — this helper only guarantees the ADVISORY LOCK and its own connection are always released,
 * on both the success and failure path.
 *
 * `pg_advisory_xact_lock` is transaction-scoped and releases automatically on COMMIT/ROLLBACK —
 * there is no separate unlock call, and therefore no way for this helper to leak the lock past its
 * own return.
 */
export async function withOutboxAclLock<T>(connectionString: string, fn: () => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aix.test.outbox_acl'))");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure; the original error is the signal.
    }
    throw err;
  } finally {
    await client.end();
  }
}
