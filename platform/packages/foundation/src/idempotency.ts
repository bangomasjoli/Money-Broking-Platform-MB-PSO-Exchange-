/**
 * FND-01 §3.7 / FND-FR-009 durable idempotency baseline.
 * Scope is (source_module, actor_id, action, idempotency_key). `action` MUST be namespaced
 * (module.endpoint.operation) so keys cannot collide across unrelated actions (§3.7 r4).
 * A replay with the SAME fingerprint returns the prior result; a DIFFERENT fingerprint
 * for the same key is rejected (§3.7 r2). Cross-actor replay is a different scope (r5).
 *
 * C2 gap-closing patch (IAM-02_Implementation_Plan_v1.0 §7): `foundation.idempotency_record`
 * is shared cross-module infrastructure — every module's runtime role has SELECT/INSERT/
 * UPDATE on it. `source_module` + RLS (infra/migrations/005_fnd_idempotency_module_scope.cjs)
 * is what actually stops one module from reading/mutating another's rows; the table-level
 * grant alone cannot. `beginIdempotent`/`completeIdempotent` set `aix.module` on the caller's
 * own already-open transaction before touching the table — the exact `aix.user_id` /
 * `withUserScope` pattern IAM-01's S1 patch proved (see
 * docs/implementation/IAM-01_IMPLEMENTATION_NOTES.md §11), applied here per-module.
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "./errors.js";

export interface IdempotencyScope {
  actorId: string;
  actorType: "user" | "system" | "service";
  action: string;
  key: string;
  /** Canonical request body used to detect conflicting reuse of a key. */
  request: unknown;
  /**
   * The CALLING module's own identity (e.g. "FND-01", "IAM-01") — a compile-time-supplied
   * literal in the calling module's own route code, NEVER derived from request/user input.
   * This is what makes the source_module column trustworthy as an RLS isolation key: a
   * caller cannot "spoof" another module's scope by sending a crafted request, because
   * nothing about this value is read off the HTTP request.
   */
  sourceModule: string;
}

export type IdempotencyOutcome =
  | { status: "new" }
  | { status: "duplicate"; resultRef: string | null; recordStatus: string };

export function fingerprint(request: unknown): string {
  return "sha256:" + createHash("sha256").update(canonical(request)).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

/**
 * Reserve an idempotency slot on the caller's transaction.
 * - first time -> { status: "new" } (row inserted as "processing")
 * - same key + same fingerprint -> { status: "duplicate", ... }
 * - same key + different fingerprint -> AppError VALIDATION_ERROR (conflict)
 */
export async function beginIdempotent(
  client: PoolClient,
  scope: IdempotencyScope,
): Promise<IdempotencyOutcome> {
  if (!scope.action.includes(".")) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Idempotency action must be namespaced as module.endpoint.operation.",
      details: [{ field: "action", issue: "missing namespace" }],
    });
  }
  const fp = fingerprint(scope.request);
  // Scope this (already-transactional) connection to the caller's own module BEFORE
  // touching the RLS-protected table — mirrors withUserScope's set_config(..., true)
  // pattern (IAM-01 S1). `true` = transaction-local: safe here because beginIdempotent /
  // completeIdempotent are always invoked with a PoolClient already inside the caller's
  // withTransaction callback (packages/foundation/src/db.ts wraps it in an explicit
  // BEGIN/COMMIT), never on a bare non-transactional connection.
  await client.query("SELECT set_config('aix.module', $1, true)", [scope.sourceModule]);
  const inserted = await client.query<{ idempotency_key: string }>(
    `INSERT INTO foundation.idempotency_record
       (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
     VALUES ($1, $2, $3, $4, $5, $6, 'processing', now() + interval '7 days', now(), now())
     ON CONFLICT (source_module, actor_id, action, idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [scope.key, fp, scope.actorId, scope.actorType, scope.action, scope.sourceModule],
  );
  if (inserted.rowCount && inserted.rowCount > 0) {
    return { status: "new" };
  }
  const existing = await client.query<{ request_fingerprint: string; status: string; result_ref: string | null }>(
    `SELECT request_fingerprint, status, result_ref
       FROM foundation.idempotency_record
      WHERE source_module = $1 AND actor_id = $2 AND action = $3 AND idempotency_key = $4`,
    [scope.sourceModule, scope.actorId, scope.action, scope.key],
  );
  const row = existing.rows[0];
  if (!row) {
    // Extremely rare race: row vanished between insert-conflict and select. Fail closed.
    throw new AppError("INTERNAL_ERROR", { message: "Idempotency record could not be resolved." });
  }
  if (row.request_fingerprint !== fp) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Idempotency key reused with a different request payload.",
      details: [{ field: "Idempotency-Key", issue: "fingerprint mismatch" }],
    });
  }
  return { status: "duplicate", resultRef: row.result_ref, recordStatus: row.status };
}

export async function completeIdempotent(
  client: PoolClient,
  scope: Pick<IdempotencyScope, "actorId" | "action" | "key" | "sourceModule">,
  resultRef: string,
): Promise<void> {
  // Same scoping as beginIdempotent — set on every call rather than assumed carried over
  // from an earlier beginIdempotent call on the same transaction, so this function is
  // correct standalone too.
  await client.query("SELECT set_config('aix.module', $1, true)", [scope.sourceModule]);
  await client.query(
    `UPDATE foundation.idempotency_record
        SET status = 'completed', result_ref = $5, updated_at_utc = now()
      WHERE source_module = $1 AND actor_id = $2 AND action = $3 AND idempotency_key = $4`,
    [scope.sourceModule, scope.actorId, scope.action, scope.key, resultRef],
  );
}
