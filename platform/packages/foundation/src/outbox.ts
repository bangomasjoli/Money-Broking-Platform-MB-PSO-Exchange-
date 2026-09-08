/**
 * FND-01 §3.8 / FND-FR-010 durable outbox baseline.
 * Writes MUST be transaction-coupled to the business action (§5.5). Callers pass the
 * same PoolClient used for the action so the outbox row commits atomically with it.
 * The async publisher/worker (not built here) drains `pending` rows after commit.
 */
import type { PoolClient } from "pg";
import { getContext } from "./context.js";
import { AppError } from "./errors.js";

export interface OutboxEventInput {
  topic: string;
  event_type: string;
  /** Reference to payload or a safe (non-sensitive) inline payload. */
  payload_ref: string;
  correlation_id?: string;
  causation_id?: string;
}

export interface OutboxRow {
  outbox_id: string;
  topic: string;
  event_type: string;
  status: string;
}

/**
 * Insert an outbox event on the caller's transaction. Correlation ID is mandatory
 * (from arg or active context); missing it fails closed rather than emitting an
 * untraceable event (§5.6).
 */
export async function enqueueOutbox(client: PoolClient, input: OutboxEventInput): Promise<OutboxRow> {
  const correlationId = input.correlation_id ?? getContext()?.correlation_id;
  if (!correlationId) {
    throw new AppError("ASYNC_CORRELATION_MISSING", {
      message: "Outbox event requires a correlation ID.",
    });
  }
  const outboxId = "out_" + cryptoRandom();
  const status = "pending";
  // No RETURNING clause: role_iam_runtime (and other module runtimes) hold INSERT-ONLY on
  // foundation.outbox_event by design (IAM-01 review C1 — append-only audit/outbox contract).
  // Postgres requires SELECT on any column named in a RETURNING list, so reading the row back
  // would force a broader grant that lets a module read other modules' outbox rows. Every
  // returned field is already known locally (surrogate id generated above, topic/event_type
  // from the caller, status is the literal inserted below), so we construct OutboxRow directly
  // instead of round-tripping it — the value is byte-identical to what RETURNING produced.
  const result = await client.query(
    `INSERT INTO foundation.outbox_event
       (outbox_id, topic, event_type, payload_ref, status, retry_count, correlation_id, causation_id, created_at_utc)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, now())`,
    [outboxId, input.topic, input.event_type, input.payload_ref, status, correlationId, input.causation_id ?? null],
  );
  if (result.rowCount !== 1) throw new AppError("AUDIT_OUTBOX_UNAVAILABLE");
  return { outbox_id: outboxId, topic: input.topic, event_type: input.event_type, status };
}

function cryptoRandom(): string {
  // Non-crypto id is fine for outbox surrogate keys; uniqueness enforced by unique index.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
