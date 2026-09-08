/**
 * FND-01 §04.4.1 / FND-FR-008 audit-event envelope + publisher.
 * FND-01 does NOT store the audit log or own the hash-chain (that is SEC-01). It defines
 * the envelope and publishes via the transaction-coupled outbox (topic "audit.event").
 * Sensitive actions fail closed if this write cannot be committed (§5.5).
 *
 * SEC-01 Phase 2 extension (approved Risk #1 option (a)): `source_module` is now a REQUIRED
 * field, plus a set of optional SEC-01-compatible fields, so SEC-01's audit ingestion API has
 * enough data to ingest the outbox's `audit.event` payload authoritatively (08_Audit_Log_
 * Events.md §3 mandatory-field list; 05_Database_Design.md §2.1 `sec1.audit_event` columns).
 *
 * NAMING-CONVENTION JUDGMENT CALL: the pre-existing `AuditEvent`/`AuditEnvelope` fields are
 * ALL snake_case (`event_type`, `actor_id`, `actor_type`, `entity_type`, `entity_id`,
 * `metadata`). Every field added here follows that SAME snake_case convention
 * (`source_module`, not `sourceModule`) rather than introducing a mixed-case interface — one
 * consistent convention for the whole type, matching what was already there. This mirrors
 * `IdempotencyScope.sourceModule`'s OWN rule in spirit (a compile-time literal in the calling
 * module's own code, never derived from request/user input) but keeps this interface's casing
 * internally consistent with itself rather than with `idempotency.ts` (a different file with
 * its own camelCase convention throughout).
 *
 * `source_module` is REQUIRED for every call site going forward — this is a deliberate
 * breaking change (same shape as the C2 patch's required `sourceModule` on
 * `IdempotencyScope`): every existing `publishAudit` call site in services/fnd, services/iam,
 * and services/iam2 was updated to pass its own hardcoded module literal ("FND-01" / "IAM-01"
 * / "IAM-02"). A caller can NEVER derive this value from request input — spoofing another
 * module's identity this way would defeat SEC-01's §5.5C ingestion-authenticity binding
 * entirely.
 */
import type { PoolClient } from "pg";
import { getContext } from "./context.js";
import { systemTime } from "./time.js";
import { enqueueOutbox } from "./outbox.js";

export interface AuditEvent {
  event_type: string;
  actor_id: string;
  actor_type: "user" | "system" | "service";
  entity_type: string;
  entity_id: string;
  /**
   * The CALLING module's own identity (e.g. "FND-01", "IAM-01", "IAM-02") — a compile-time
   * literal hardcoded at the call site, NEVER derived from request/user input. Required so
   * SEC-01 (the authoritative audit consumer) can bind every ingested event to a real,
   * spoof-proof source module (SEC-01 §5.5C ingestion authenticity / SEC1-FR-026).
   */
  source_module: string;
  /**
   * SEC-01-compatible optional fields (08_Audit_Log_Events.md §3's mandatory-field superset,
   * minus fields already carried by `AuditEnvelope`: request_id/correlation_id/entity_type/
   * entity_id/actor_id/actor_type/occurred_at_utc). Optional here because most existing FND-01/
   * IAM-01/IAM-02 call sites predate SEC-01 and have no meaningful value for several of these
   * yet; SEC-01's OWN ingestion schema validation (Phase 2) is what actually enforces
   * mandatory-field presence for events flowing through its ingestion API — this shared
   * publisher only needs to carry the data through when the caller has it.
   */
  severity?: "info" | "low" | "medium" | "high" | "critical";
  event_category?: "auth" | "permission" | "money" | "security" | "system";
  /** SEC-01's `action` column — distinct from `event_type` (e.g. event_type "iam2.permission_decision_allow", action "permission.check"). */
  action?: string;
  result?: "success" | "failure" | "blocked";
  session_id?: string;
  client_id?: string;
  /** Source-module-assigned emission sequence (SEC-01 §5.5B source completeness). */
  source_emission_sequence?: number;
  reason_code?: string;
  /** Non-sensitive metadata only — no secrets/OTP/tokens/full PII (§NFR log safety). */
  metadata?: Record<string, unknown>;
}

export interface AuditEnvelope extends AuditEvent {
  request_id?: string;
  correlation_id: string;
  causation_id?: string;
  origin_correlation_id?: string;
  occurred_at_utc: string;
}

export function buildAuditEnvelope(event: AuditEvent): AuditEnvelope {
  const ctx = getContext();
  return {
    ...event,
    metadata: event.metadata ?? {},
    ...(ctx?.request_id ? { request_id: ctx.request_id } : {}),
    correlation_id: ctx?.correlation_id ?? "corr_unknown",
    ...(ctx?.causation_id ? { causation_id: ctx.causation_id } : {}),
    ...(ctx?.origin_correlation_id ? { origin_correlation_id: ctx.origin_correlation_id } : {}),
    occurred_at_utc: systemTime.nowUtc(),
  };
}

/**
 * Publish an audit event on the caller's transaction. Because it routes through the
 * transaction-coupled outbox, an audit failure rolls back the whole action (fail closed).
 */
export async function publishAudit(client: PoolClient, event: AuditEvent): Promise<void> {
  const envelope = buildAuditEnvelope(event);
  await enqueueOutbox(client, {
    topic: "audit.event",
    event_type: envelope.event_type,
    // Safe inline reference: identifies the audited entity; full record persisted by SEC-01.
    // Every AuditEnvelope/AuditEvent field is included (not just a subset) so a future outbox
    // consumer (SEC-01) has full fidelity from the outbox row alone — see this file's header
    // comment. JSON.stringify drops keys whose value is undefined, so optional fields the
    // caller didn't supply are simply absent from the JSON rather than serialized as null,
    // keeping this payload byte-identical to the pre-extension shape for callers that don't
    // use the new fields.
    payload_ref: JSON.stringify({
      entity_type: envelope.entity_type,
      entity_id: envelope.entity_id,
      actor_id: envelope.actor_id,
      actor_type: envelope.actor_type,
      source_module: envelope.source_module,
      occurred_at_utc: envelope.occurred_at_utc,
      request_id: envelope.request_id,
      correlation_id: envelope.correlation_id,
      causation_id: envelope.causation_id,
      origin_correlation_id: envelope.origin_correlation_id,
      severity: envelope.severity,
      event_category: envelope.event_category,
      action: envelope.action,
      result: envelope.result,
      session_id: envelope.session_id,
      client_id: envelope.client_id,
      source_emission_sequence: envelope.source_emission_sequence,
      reason_code: envelope.reason_code,
      metadata: envelope.metadata,
    }),
    correlation_id: envelope.correlation_id,
    ...(envelope.causation_id ? { causation_id: envelope.causation_id } : {}),
  });
}
