/**
 * SEC-01 §04_API_Specification.md §3 / SEC1-FR-004 event schema registry — Phase 2 read-only
 * consumption. No schema-management API is built this pass (deferred); migration 008 seeds a
 * handful of baseline rows (one generic type per approved source module plus a sec1 self-audit
 * type) so ingestion has something real to validate against.
 */
import type { PoolClient } from "pg";
import { Sec1Error } from "./errors.js";

export interface EventSchemaRow {
  event_type: string;
  source_module: string;
  category: string;
  default_severity: string;
  mandatory_fields: string[];
  classification: string;
  retention_class: string;
  sensitive_read: boolean;
  status: string;
  version: number;
}

export async function lookupEventSchema(client: PoolClient, eventType: string): Promise<EventSchemaRow | undefined> {
  const res = await client.query<EventSchemaRow>(
    `SELECT event_type, source_module, category, default_severity, mandatory_fields,
            classification, retention_class, sensitive_read, status, version
       FROM sec1.event_schema
      WHERE event_type = $1 AND status = 'active'`,
    [eventType],
  );
  return res.rows[0];
}

/**
 * Validate that every field named in `schema.mandatory_fields` is present and non-blank on
 * `body` (08_Audit_Log_Events.md §3). Throws SEC1_REQUIRED_FIELD_MISSING listing every missing
 * field at once (not just the first), same "surface every problem together" discipline
 * `@aix/foundation`'s `loadConfig` uses.
 */
export function assertMandatoryFieldsPresent(schema: EventSchemaRow, body: Record<string, unknown>): void {
  const missing: string[] = [];
  for (const field of schema.mandatory_fields) {
    const value = body[field];
    const blank = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (blank) missing.push(field);
  }
  if (missing.length > 0) {
    throw new Sec1Error("SEC1_REQUIRED_FIELD_MISSING", {
      details: missing.map((field) => ({ field, issue: "mandatory field missing" })),
    });
  }
}

export function assertEventTypeKnown(schema: EventSchemaRow | undefined, eventType: string): asserts schema is EventSchemaRow {
  if (!schema) {
    throw new Sec1Error("SEC1_EVENT_TYPE_UNKNOWN", {
      details: [{ field: "event_type", issue: `unregistered event type: ${eventType}` }],
    });
  }
}
