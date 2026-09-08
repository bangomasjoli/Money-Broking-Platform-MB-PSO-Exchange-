/**
 * SEC-01 Phase 4 tier-based READ redaction (`07_Permission_Rules.md` §6 "Read Redaction
 * Rules"). A DIFFERENT concern from `lib/redaction.ts` (which strips secret-looking keys out
 * of `metadata` at INGEST time, before anything is ever hashed/stored) — this module shapes an
 * ALREADY-SAFE stored row into a response, based on the REQUESTER's permission tier. The two
 * never substitute for one another: even a sensitive-tier response only ever returns the
 * ingest-time-redacted `metadata_redacted` value, never a raw pre-redaction payload (SEC-01
 * never persists one).
 *
 * ---------------------------------------------------------------------------------------
 * TIER MODEL — resolved per §6/§7 of docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md:
 * ---------------------------------------------------------------------------------------
 * A row's tier is NOT a single global decision for the whole response. It is computed
 * PER ROW as `actorHasSensitiveTier && row.sensitive_read` (the event's OWN
 * `sec1.event_schema.sensitive_read` flag, joined in by lib/read-query.ts) — a search result
 * mixing sensitive and non-sensitive event types redacts each row according to its own event
 * type, gated by the one actor-level `sec1.audit_event.read_sensitive` permission check made
 * once per request (permission is not per-row scoped this phase).
 *
 * Hash-chain/integrity internals (`event_hash`, `previous_hash`, `sequence_no`, `stream_id`,
 * `ingest_payload_hash`, `canonical_format_version`, `seal_batch_id`, `external_anchor_ref`,
 * `trusted_timestamp_ref`, `clock_skew_seconds`, `clock_skew_status`, `backfilled`,
 * `integrity_from`) are OMITTED at BOTH tiers — `lib/read-query.ts` never even SELECTs them, so
 * there is no field here to accidentally leak. That surface belongs to the separate, deferred
 * `sec1.audit_event.verify_integrity` permission/route (see the Phase 4 plan §1/§8).
 *
 * `client_id`: redacted at normal tier UNLESS the request's own search was already SCOPED to
 * that exact `client_id` (the caller explicitly asked "show me this one client's trail," so
 * redacting it back out of the response would just be noise, not a real safeguard) — always
 * visible at sensitive tier.
 *
 * `actor_user_id`: visible at BOTH tiers this phase — flagged explicitly (see the Phase 4 plan
 * §7/§9 risk item 3) because the blueprint's own table says "visible if permitted" and this
 * codebase has no finer per-actor-ownership/scoping model for SEC-01 reads yet than the tier
 * itself. Revisit if/when such a model exists.
 */
export interface RedactableAuditEventRow {
  audit_event_ref: string;
  event_type: string;
  event_category: string | null;
  severity: string;
  source_module: string;
  actor_user_id: string | null;
  actor_type: string;
  session_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  result: string;
  reason_code: string | null;
  request_id: string;
  correlation_id: string;
  occurred_at_utc: string;
  ingested_at_utc: string;
  metadata_redacted: Record<string, unknown>;
  classification: string;
  retention_class: string;
  status: string;
  /** Joined from sec1.event_schema.sensitive_read — a property of the EVENT, not the reader. */
  sensitive_read: boolean;
}

export interface RedactAuditEventRowResult {
  redacted: Record<string, unknown>;
  /** True only when this row was actually disclosed at sensitive tier (drives sensitive-read logging). */
  disclosedSensitive: boolean;
}

export function redactAuditEventRow(
  row: RedactableAuditEventRow,
  actorHasSensitiveTier: boolean,
  /** The single client_id the CURRENT request was scoped to, if any (search filter or detail lookup). */
  requestedClientId: string | undefined,
): RedactAuditEventRowResult {
  const disclosedSensitive = actorHasSensitiveTier && row.sensitive_read;

  const base = {
    audit_event_ref: row.audit_event_ref,
    event_type: row.event_type,
    event_category: row.event_category,
    severity: row.severity,
    source_module: row.source_module,
    actor_user_id: row.actor_user_id,
    actor_type: row.actor_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    result: row.result,
    reason_code: row.reason_code,
    occurred_at_utc: row.occurred_at_utc,
    ingested_at_utc: row.ingested_at_utc,
    classification: row.classification,
    retention_class: row.retention_class,
    status: row.status,
  };

  if (disclosedSensitive) {
    return {
      redacted: {
        ...base,
        session_id: row.session_id,
        client_id: row.client_id,
        request_id: row.request_id,
        correlation_id: row.correlation_id,
        metadata_redacted: row.metadata_redacted,
      },
      disclosedSensitive: true,
    };
  }

  const clientIdVisible = requestedClientId !== undefined && row.client_id === requestedClientId;
  return {
    redacted: {
      ...base,
      client_id: clientIdVisible ? row.client_id : null,
      // session_id, request_id, correlation_id, metadata_redacted are OMITTED (not present as
      // keys at all) at normal tier — never sent as null/placeholder, so a caller cannot
      // distinguish "redacted" from "genuinely absent" and infer anything from the shape.
    },
    disclosedSensitive: false,
  };
}
