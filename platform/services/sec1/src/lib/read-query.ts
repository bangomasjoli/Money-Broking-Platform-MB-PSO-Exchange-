/**
 * SEC-01 Phase 4 audit search/detail query logic (`04_API_Specification.md` §4;
 * docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md §7).
 *
 * Rules enforced here (per the Phase 4 task brief):
 *   - Parameterized SQL only — every filter value is bound as a query parameter, never
 *     string-interpolated into the SQL text. Even the WHERE-clause SHAPE is built from a fixed,
 *     whitelisted set of columns (no caller-supplied column/operator names reach the query).
 *   - Strict date parsing — `occurred_at_from/to` / `ingested_at_from/to` are parsed with
 *     `new Date(...)` and rejected (fail closed, `VALIDATION_ERROR`) if unparseable, same
 *     discipline `lib/ingest.ts`'s P3-F1 fix already applies to `occurred_at_utc` on the write
 *     side.
 *   - Capped, deterministic pagination — `limit` is capped at `MAX_LIMIT`; ordering is always
 *     `ingested_at_utc DESC, audit_event_ref DESC` with a keyset cursor (never `OFFSET`, which
 *     would silently skip/duplicate rows under concurrent ingestion).
 *   - F-1 gap patch (Opus review): the cursor's `ingested_at_utc` boundary is carried as a
 *     FULL-MICROSECOND-PRECISION string rendered BY POSTGRES ITSELF (`to_char(...'US'...)`),
 *     never as a JS `Date`-derived ISO string. `ae.ingested_at_utc` is `timestamptz`
 *     (microsecond precision), but `Date.toISOString()` only carries millisecond precision —
 *     round-tripping the cursor boundary through a JS `Date` truncated same-millisecond,
 *     different-microsecond rows out of the comparison, silently DROPPING them from the result
 *     set across a page boundary (empirically reproduced by the Opus review: three rows at
 *     `.123000`/`.123400`/`.123800` in the same millisecond — after a page ending on `.123800`,
 *     the `.123400` row vanished; only `.123000` reappeared on the next page). The FIX: a
 *     dedicated `ingested_at_utc_cursor` text column (Postgres-rendered, never touching a JS
 *     `Date`) is selected alongside the normal Date-typed `ingested_at_utc` (still used,
 *     unchanged, for the RESPONSE body's display field — millisecond precision there is fine,
 *     this bug was ONLY ever in the pagination BOUNDARY) and is what `nextCursor` is built
 *     from. The boundary comparison casts it back to `timestamptz` explicitly
 *     (`$1::timestamptz`) — a lossless round-trip since Postgres itself stores no finer than
 *     microsecond precision, so this text form loses nothing the column could have held.
 *   - `sec1.event_schema.sensitive_read` is joined in on every row (INNER JOIN — safe because
 *     ingestion never accepts an `event_type` without a matching ACTIVE `event_schema` row at
 *     the time of ingestion, and schema rows are never deleted, only deactivated; a
 *     status-inactive schema row still joins here, deliberately, so an event ingested under a
 *     since-deactivated schema type remains readable).
 *   - Read-only — never mutates `sec1.audit_event` or `sec1.event_schema`.
 */
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";
import type { RedactableAuditEventRow } from "./read-redaction.js";

export const DEFAULT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 200;

export interface AuditEventSearchFilters {
  source_module?: string;
  event_type?: string;
  severity?: string;
  result?: string;
  actor_user_id?: string;
  client_id?: string;
  entity_type?: string;
  entity_id?: string;
  occurred_at_from?: string;
  occurred_at_to?: string;
  ingested_at_from?: string;
  ingested_at_to?: string;
  correlation_id?: string;
  request_id?: string;
}

export interface SearchCursor {
  /**
   * F-1 fix: a FULL-MICROSECOND-PRECISION timestamptz text representation rendered by
   * Postgres itself (`to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`), never a JS
   * `Date`-derived ISO string (which only carries millisecond precision) — see this file's
   * header comment for why that distinction is load-bearing.
   */
  ingested_at_utc: string;
  audit_event_ref: string;
}

export interface SearchAuditEventsInput {
  filters: AuditEventSearchFilters;
  limit: number;
  cursor?: SearchCursor;
}

export interface SearchAuditEventsResult {
  rows: RedactableAuditEventRow[];
  nextCursor: SearchCursor | null;
}

const SELECT_COLUMNS = `
  ae.audit_event_ref, ae.event_type, ae.event_category, ae.severity, ae.source_module,
  ae.actor_user_id, ae.actor_type, ae.session_id, ae.client_id, ae.entity_type, ae.entity_id,
  ae.action, ae.result, ae.reason_code, ae.request_id, ae.correlation_id, ae.occurred_at_utc,
  ae.ingested_at_utc, ae.metadata_redacted, ae.classification, ae.retention_class, ae.status,
  es.sensitive_read,
  to_char(ae.ingested_at_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ingested_at_utc_cursor
`;

const FROM_CLAUSE = `FROM sec1.audit_event ae JOIN sec1.event_schema es ON es.event_type = ae.event_type`;

function parseFilterDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field, issue: "not a parseable timestamp" }],
    });
  }
  return parsed;
}

/** Builds the WHERE clause from a fixed, whitelisted filter set. Every value is pushed onto
 * `params` and referenced positionally — no filter value is ever concatenated into SQL text. */
function buildWhereClause(filters: AuditEventSearchFilters, params: unknown[]): string {
  const clauses: string[] = [];

  const eq = (column: string, value: string | undefined) => {
    if (value === undefined) return;
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  };

  eq("ae.source_module", filters.source_module);
  eq("ae.event_type", filters.event_type);
  eq("ae.severity", filters.severity);
  eq("ae.result", filters.result);
  eq("ae.actor_user_id", filters.actor_user_id);
  eq("ae.client_id", filters.client_id);
  eq("ae.entity_type", filters.entity_type);
  eq("ae.entity_id", filters.entity_id);
  eq("ae.correlation_id", filters.correlation_id);
  eq("ae.request_id", filters.request_id);

  if (filters.occurred_at_from !== undefined) {
    params.push(parseFilterDate(filters.occurred_at_from, "occurred_at_from"));
    clauses.push(`ae.occurred_at_utc >= $${params.length}`);
  }
  if (filters.occurred_at_to !== undefined) {
    params.push(parseFilterDate(filters.occurred_at_to, "occurred_at_to"));
    clauses.push(`ae.occurred_at_utc <= $${params.length}`);
  }
  if (filters.ingested_at_from !== undefined) {
    params.push(parseFilterDate(filters.ingested_at_from, "ingested_at_from"));
    clauses.push(`ae.ingested_at_utc >= $${params.length}`);
  }
  if (filters.ingested_at_to !== undefined) {
    params.push(parseFilterDate(filters.ingested_at_to, "ingested_at_to"));
    clauses.push(`ae.ingested_at_utc <= $${params.length}`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): SearchCursor | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new AppError("VALIDATION_ERROR", { details: [{ field: "cursor", issue: "malformed cursor" }] });
  }
  const candidate = parsed as Partial<SearchCursor>;
  if (typeof candidate.ingested_at_utc !== "string" || typeof candidate.audit_event_ref !== "string") {
    throw new AppError("VALIDATION_ERROR", { details: [{ field: "cursor", issue: "malformed cursor" }] });
  }
  return { ingested_at_utc: candidate.ingested_at_utc, audit_event_ref: candidate.audit_event_ref };
}

export async function searchAuditEvents(
  client: PoolClient,
  input: SearchAuditEventsInput,
): Promise<SearchAuditEventsResult> {
  const limit = Math.min(Math.max(input.limit, 1), MAX_SEARCH_LIMIT);
  const params: unknown[] = [];
  const filterWhere = buildWhereClause(input.filters, params);

  let where = filterWhere;
  if (input.cursor) {
    // Keyset pagination: strictly "older than" the cursor row under the same
    // (ingested_at_utc DESC, audit_event_ref DESC) ordering — a row-value comparison, never
    // OFFSET, so results stay correct even as new rows are ingested concurrently.
    // F-1 fix: input.cursor.ingested_at_utc is now the full-microsecond-precision text Postgres
    // itself rendered (see SearchCursor's own doc comment) — cast back to timestamptz
    // explicitly so the comparison is against the exact same precision the column stores,
    // never round-tripped through a lossy JS Date.
    params.push(input.cursor.ingested_at_utc, input.cursor.audit_event_ref);
    const cursorClause = `(ae.ingested_at_utc, ae.audit_event_ref) < ($${params.length - 1}::timestamptz, $${params.length})`;
    where = where ? `${where} AND ${cursorClause}` : `WHERE ${cursorClause}`;
  }

  // Fetch one extra row to determine whether a next page exists, without a separate COUNT query.
  params.push(limit + 1);
  const sql = `
    SELECT ${SELECT_COLUMNS}
    ${FROM_CLAUSE}
    ${where}
    ORDER BY ae.ingested_at_utc DESC, ae.audit_event_ref DESC
    LIMIT $${params.length}
  `;

  const result = await client.query<RawRow>(sql, params);
  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;
  // F-1 fix: built from ingested_at_utc_cursor (Postgres-rendered text, full microsecond
  // precision) — NEVER from the Date-typed ingested_at_utc via toIso(), which is what
  // previously truncated the boundary and silently dropped same-millisecond rows.
  const nextCursor: SearchCursor | null =
    hasMore && pageRows.length > 0
      ? {
          ingested_at_utc: pageRows[pageRows.length - 1]!.ingested_at_utc_cursor,
          audit_event_ref: pageRows[pageRows.length - 1]!.audit_event_ref,
        }
      : null;

  return { rows: pageRows.map(toRedactableRow), nextCursor };
}

export interface GetAuditEventDetailInput {
  auditEventRef?: string;
  sourceModule?: string;
  eventId?: string;
}

export async function getAuditEventDetail(
  client: PoolClient,
  input: GetAuditEventDetailInput,
): Promise<RedactableAuditEventRow | null> {
  let sql: string;
  let params: unknown[];
  if (input.auditEventRef) {
    sql = `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE ae.audit_event_ref = $1`;
    params = [input.auditEventRef];
  } else if (input.sourceModule && input.eventId) {
    sql = `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE ae.source_module = $1 AND ae.event_id = $2`;
    params = [input.sourceModule, input.eventId];
  } else {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field: "audit_event_ref", issue: "either audit_event_ref or (source_module + event_id) is required" }],
    });
  }
  const result = await client.query<RawRow>(sql, params);
  const row = result.rows[0];
  return row ? toRedactableRow(row) : null;
}

interface RawRow {
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
  occurred_at_utc: Date;
  ingested_at_utc: Date;
  metadata_redacted: Record<string, unknown>;
  classification: string;
  retention_class: string;
  status: string;
  sensitive_read: boolean;
  /** F-1 fix: full-microsecond-precision text form of ingested_at_utc, Postgres-rendered —
   * used ONLY to build a lossless pagination cursor, never mapped into RedactableAuditEventRow. */
  ingested_at_utc_cursor: string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRedactableRow(row: RawRow): RedactableAuditEventRow {
  return {
    audit_event_ref: row.audit_event_ref,
    event_type: row.event_type,
    event_category: row.event_category,
    severity: row.severity,
    source_module: row.source_module,
    actor_user_id: row.actor_user_id,
    actor_type: row.actor_type,
    session_id: row.session_id,
    client_id: row.client_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    result: row.result,
    reason_code: row.reason_code,
    request_id: row.request_id,
    correlation_id: row.correlation_id,
    occurred_at_utc: toIso(row.occurred_at_utc),
    ingested_at_utc: toIso(row.ingested_at_utc),
    metadata_redacted: row.metadata_redacted,
    classification: row.classification,
    retention_class: row.retention_class,
    status: row.status,
    sensitive_read: row.sensitive_read,
  };
}
