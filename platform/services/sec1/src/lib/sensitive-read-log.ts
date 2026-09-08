/**
 * SEC-01 Phase 4 sensitive-read logging (`05_Database_Design.md` §2.10; SEC1-TC-037/038;
 * docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md §6).
 *
 * Called by routes/read.ts ONLY when a response is about to disclose at least one row at
 * sensitive tier (`lib/read-redaction.ts`'s `disclosedSensitive === true`), and ALWAYS from
 * inside the SAME transaction as the read itself, BEFORE the route returns its response — see
 * routes/read.ts's own header comment for the exact ordering. If this INSERT fails, the caller
 * must let the error propagate so the whole transaction rolls back and the read fails closed
 * with SEC1_SENSITIVE_READ_LOG_FAILED (SEC1-TC-038) — no audit data is ever returned without
 * its accompanying log entry having successfully committed.
 *
 * Writes via a PLAIN, DIRECT SQL INSERT — never by calling SEC-01's own
 * `POST /internal/sec1/audit-events` ingestion endpoint. This is the anti-recursion design: a
 * sensitive read of the audit store can never itself trigger a new hash-chained `audit_event`
 * row (which would in turn need its own schema lookup, redaction, and read-authorization
 * check), because `sec1.sensitive_read_log` is a separate, non-hash-chained table entirely —
 * see migration 010's own header comment.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Sec1Error } from "./errors.js";

export type SensitiveReadLogAction = "search" | "read";

export interface WriteSensitiveReadLogInput {
  userId: string;
  action: SensitiveReadLogAction;
  /** Populated for a detail read; omitted for a search. */
  auditEventRef?: string;
  /** Populated for a search (sha256 of the normalized filter set — see routes/read.ts). */
  searchScopeHash?: string;
  reason?: string;
  requestId: string;
  correlationId: string;
  /** Safe, non-sensitive context only (e.g. result_count) — never the disclosed data itself. */
  metadata?: Record<string, unknown>;
}

export async function writeSensitiveReadLog(client: PoolClient, input: WriteSensitiveReadLogInput): Promise<void> {
  const readId = "read_" + randomUUID();
  try {
    await client.query(
      `INSERT INTO sec1.sensitive_read_log
         (read_id, user_id, action, audit_event_ref, export_id, search_scope_hash, reason,
          request_id, correlation_id, occurred_at_utc, metadata)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8, now(), $9)`,
      [
        readId,
        input.userId,
        input.action,
        input.auditEventRef ?? null,
        input.searchScopeHash ?? null,
        input.reason ?? null,
        input.requestId,
        input.correlationId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (err) {
    // Wrap, never swallow — the caller (routes/read.ts) lets this propagate out of its
    // withTransaction callback so the whole read rolls back and fails closed (SEC1-TC-038).
    throw new Sec1Error("SEC1_SENSITIVE_READ_LOG_FAILED", { cause: err });
  }
}
