/**
 * SEC-01 Phase 5 threshold/count-window security monitoring rule engine
 * (`05_Database_Design.md` §2.5; `docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md`
 * §6).
 *
 * TRIGGER POINT — after commit, never inside the ingest transaction. `evaluateRulesForEvent` is
 * called from `routes/internal.ts` AFTER the transaction wrapping ingestion has already
 * committed (never from inside `lib/ingest.ts::ingestAuditEvent`, never inside the per-stream
 * `FOR UPDATE` lock) — a hard design constraint: monitoring must never be able to slow down,
 * block, or roll back the hash-chain write path Phases 0-3 already proved race-safe. A
 * monitoring evaluation failure is structurally incapable of affecting the audit event that was
 * just durably persisted.
 *
 * FAIL-OPEN FOR MONITORING, FAIL-CLOSED FOR INGESTION — this function is designed to
 * STRUCTURALLY NEVER THROW. Every failure mode (an unparseable rule, a transient DB error, a
 * dead-letter write itself failing) is caught and, where possible, recorded to
 * `sec1.monitoring_dead_letter`; nothing here ever propagates back to the ingest route's
 * response, per `09_Error_Handling.md`'s own posture (monitoring/alerting failure is not in the
 * fail-closed-for-ingestion list — only sensitive AUDIT persistence is).
 *
 * ANTI-RECURSION — resolved structurally, not by a runtime guard: this file only ever issues
 * plain `SELECT`/direct SQL against `sec1.audit_event`/`sec1.security_monitoring_rule` and
 * writes via `lib/alerts.ts::createSystemAlert` / `lib/monitoring-dead-letter.ts`, NEVER by
 * calling SEC-01's own `POST /internal/sec1/audit-events` ingestion endpoint (which SEC-01 has
 * no ingestion token for itself anyway — `config.ts`'s `ingestTokens` covers only
 * FND-01/IAM-01/IAM-02). There is therefore no code path where evaluating rules could itself
 * produce a new `sec1.audit_event` row requiring another evaluation pass.
 */
import type { PoolClient } from "pg";
import { withTransaction } from "@aix/foundation";
import {
  createSystemAlert,
  findOpenAlertByRuleScope,
  type CreateSystemAlertInput,
} from "./alerts.js";
import {
  writeMonitoringDeadLetter,
  fetchDeadLetterForUpdate,
  listEligibleDeadLetters,
  markDeadLetterReplayed,
  recordDeadLetterReplayFailure,
  assertDeadLetterFound,
  type MonitoringDeadLetterRow,
  type MonitoringSeverity,
} from "./monitoring-dead-letter.js";

/** Only "actor_user_id"/"client_id" are supported — the two columns `sec1.security_alert`
 * itself can store, so an alert created by this engine can always be de-duplicated by the same
 * column a rule groups its count by (see migration 012's own column-choice comment). */
const SCOPE_COLUMNS = ["actor_user_id", "client_id"] as const;
type ScopeColumn = (typeof SCOPE_COLUMNS)[number];

export interface RuleCondition {
  scope_column?: ScopeColumn;
  /** Optional exact-match filter on `sec1.audit_event.action` — see this file's header/
   * migration 012's own comment for why action/result narrowing exists on top of
   * event_type_filter. */
  action?: string;
  /** Optional exact-match filter on `sec1.audit_event.result`. */
  result?: string;
}

export interface RuleThreshold {
  count: number;
  window_seconds: number;
}

export interface MonitoringRuleRow {
  ruleId: string;
  ruleName: string;
  eventTypeFilter: string[];
  condition: RuleCondition;
  threshold: RuleThreshold;
  severity: MonitoringSeverity;
}

interface RawRuleRow {
  rule_id: string;
  rule_name: string;
  event_type_filter: string[];
  condition: unknown;
  threshold: unknown;
  severity: MonitoringSeverity;
}

/** Deliberately throws a plain `Error` (not a `Sec1Error`) on a malformed rule row — this is
 * exactly the "rule evaluation failure" case that must be caught per-rule and dead-lettered,
 * never allowed to abort evaluation of the OTHER rules or reach the ingest route. */
function parseCondition(raw: unknown): RuleCondition {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const scopeColumn = obj.scope_column;
  if (scopeColumn !== undefined && !(SCOPE_COLUMNS as readonly string[]).includes(scopeColumn as string)) {
    throw new Error(`security_monitoring_rule.condition.scope_column must be one of ${SCOPE_COLUMNS.join(", ")}`);
  }
  const action = obj.action;
  const result = obj.result;
  if (action !== undefined && typeof action !== "string") {
    throw new Error("security_monitoring_rule.condition.action must be a string");
  }
  if (result !== undefined && typeof result !== "string") {
    throw new Error("security_monitoring_rule.condition.result must be a string");
  }
  return {
    ...(typeof scopeColumn === "string" ? { scope_column: scopeColumn as ScopeColumn } : {}),
    ...(typeof action === "string" ? { action } : {}),
    ...(typeof result === "string" ? { result } : {}),
  };
}

function parseThreshold(raw: unknown): RuleThreshold {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const count = obj.count;
  const windowSeconds = obj.window_seconds;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) {
    throw new Error("security_monitoring_rule.threshold.count must be a number >= 1");
  }
  if (typeof windowSeconds !== "number" || !Number.isFinite(windowSeconds) || windowSeconds < 1) {
    throw new Error("security_monitoring_rule.threshold.window_seconds must be a number >= 1");
  }
  return { count, window_seconds: windowSeconds };
}

function toRuleRow(raw: RawRuleRow): MonitoringRuleRow {
  return {
    ruleId: raw.rule_id,
    ruleName: raw.rule_name,
    eventTypeFilter: raw.event_type_filter,
    condition: parseCondition(raw.condition),
    threshold: parseThreshold(raw.threshold),
    severity: raw.severity,
  };
}

async function fetchActiveRulesForEventType(client: PoolClient, eventType: string): Promise<RawRuleRow[]> {
  const res = await client.query<RawRuleRow>(
    `SELECT rule_id, rule_name, event_type_filter, condition, threshold, severity
       FROM sec1.security_monitoring_rule
      WHERE status = 'active' AND event_type_filter @> to_jsonb($1::text)`,
    [eventType],
  );
  return res.rows;
}

async function fetchActiveRuleById(client: PoolClient, ruleId: string): Promise<RawRuleRow | null> {
  const res = await client.query<RawRuleRow>(
    `SELECT rule_id, rule_name, event_type_filter, condition, threshold, severity
       FROM sec1.security_monitoring_rule
      WHERE rule_id = $1 AND status = 'active'`,
    [ruleId],
  );
  return res.rows[0] ?? null;
}

export interface JustIngestedEvent {
  auditEventRef: string;
  eventType: string;
  sourceModule: string;
  actorUserId: string | null;
  clientId: string | null;
  entityType: string | null;
  entityId: string | null;
  action: string;
  result: string;
  /** Threaded through ONLY so a last-resort dead-letter-write failure (§59/LOW-1) can log
   * "correlation/request id where available" — never used for evaluation logic itself. */
  requestId: string;
  correlationId: string;
}

interface RawAuditEventForReplay {
  audit_event_ref: string;
  event_type: string;
  source_module: string;
  actor_user_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  result: string;
  request_id: string;
  correlation_id: string;
}

async function fetchAuditEventAsJustIngestedEvent(client: PoolClient, auditEventRef: string): Promise<JustIngestedEvent | null> {
  const res = await client.query<RawAuditEventForReplay>(
    `SELECT audit_event_ref, event_type, source_module, actor_user_id, client_id, entity_type, entity_id, action, result,
            request_id, correlation_id
       FROM sec1.audit_event
      WHERE audit_event_ref = $1`,
    [auditEventRef],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    auditEventRef: row.audit_event_ref,
    eventType: row.event_type,
    sourceModule: row.source_module,
    actorUserId: row.actor_user_id,
    clientId: row.client_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    result: row.result,
    requestId: row.request_id,
    correlationId: row.correlation_id,
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * LOW-1 (Opus review, §59/§60 of the implementation notes): the last-resort log for when
 * `sec1.monitoring_dead_letter`'s own write ALSO fails — this is the one failure mode this
 * codebase's fail-open-for-monitoring design cannot record anywhere durable, so it must at
 * least be observable. Deliberately NO sensitive payload, NO tokens, NO raw metadata — only
 * stable identifiers (rule_id/audit_event_ref/severity/request_id/correlation_id) and the two
 * (already-safe, code-generated) failure-reason strings. Uses `console.warn` — no shared
 * logger utility exists in `@aix/foundation` or this codebase for code that runs outside a
 * Fastify request context (this function is called from post-commit background work, not a
 * request handler); introducing one is out of scope for this minor-condition patch.
 */
function logDeadLetterWriteFailure(context: {
  ruleId: string | null;
  auditEventRef: string | null;
  severity: MonitoringSeverity;
  requestId?: string;
  correlationId?: string;
  originalFailureReason: string;
  writeFailureReason: string;
}): void {
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      level: "warn",
      code: "SEC1_MONITORING_DEAD_LETTER_WRITE_FAILED",
      msg: "sec1.monitoring_dead_letter write itself failed; the original rule-evaluation/alert-creation failure was NOT recorded anywhere durable.",
      rule_id: context.ruleId,
      audit_event_ref: context.auditEventRef,
      severity: context.severity,
      ...(context.requestId ? { request_id: context.requestId } : {}),
      ...(context.correlationId ? { correlation_id: context.correlationId } : {}),
      original_failure_reason: context.originalFailureReason,
      write_failure_reason: context.writeFailureReason,
    }),
  );
}

/** Builds the shared `WHERE` clause for both the threshold COUNT and the linked-refs SELECT —
 * parameterized SQL only; `rule.condition.scope_column` is interpolated directly into the SQL
 * TEXT (not a bound parameter, since Postgres does not allow a bound parameter as a column
 * name), but is validated against the fixed `SCOPE_COLUMNS` allow-list by `parseCondition`
 * BEFORE this function ever sees it — never a caller/DB-row-controlled arbitrary string. */
function buildMatchWhere(rule: MonitoringRuleRow, scopeValue: string | null, params: unknown[]): string {
  params.push(rule.eventTypeFilter);
  const eventTypeIdx = params.length;
  params.push(rule.threshold.window_seconds);
  const windowIdx = params.length;
  let sql = `event_type = ANY($${eventTypeIdx}) AND occurred_at_utc >= now() - ($${windowIdx} || ' seconds')::interval`;
  if (rule.condition.action) {
    params.push(rule.condition.action);
    sql += ` AND action = $${params.length}`;
  }
  if (rule.condition.result) {
    params.push(rule.condition.result);
    sql += ` AND result = $${params.length}`;
  }
  if (rule.condition.scope_column && scopeValue !== null) {
    params.push(scopeValue);
    sql += ` AND ${rule.condition.scope_column} = $${params.length}`;
  }
  return sql;
}

const MAX_LINKED_AUDIT_EVENTS = 20;

/**
 * Evaluates ONE rule against ONE event — may throw (malformed rule row, transient DB error);
 * the caller (`evaluateRulesForEvent`/`replayDeadLetterRow`) is responsible for catching and
 * dead-lettering. Exported for reuse by the dead-letter replay path (`replayDeadLetterItem`/
 * `replayEligibleDeadLetters`), which re-runs this exact function against the same rule+event
 * rather than duplicating the evaluation logic.
 */
export async function evaluateOneRule(client: PoolClient, rawRule: RawRuleRow, event: JustIngestedEvent): Promise<void> {
  const rule = toRuleRow(rawRule);

  if (rule.condition.action && rule.condition.action !== event.action) return;
  if (rule.condition.result && rule.condition.result !== event.result) return;

  let scopeValue: string | null = null;
  if (rule.condition.scope_column) {
    scopeValue = rule.condition.scope_column === "actor_user_id" ? event.actorUserId : event.clientId;
    // Nothing to scope by for this event — documented judgment call: skip rather than group
    // every scope-less event into one undifferentiated bucket.
    if (scopeValue === null) return;
  }

  // Self-review finding: the threshold-count check, the open-alert de-dup check, and the
  // eventual alert INSERT are three separate statements with no row to lock (the alert doesn't
  // exist yet) — under READ COMMITTED, two concurrent evaluations of the SAME rule+scope (e.g.
  // two events crossing the threshold in the same window via concurrent HTTP requests) could
  // each see "no open alert yet" before either commits its INSERT, producing two duplicate
  // alerts. A Postgres advisory transaction lock, scoped to this (rule_id, scope value) pair
  // and automatically released when this rule's own `withTransaction` commits/rolls back,
  // serializes concurrent evaluations for the SAME key — the second waiter's count/de-dup
  // check then correctly sees the first's already-committed alert. Same class of fix as
  // `lib/stream.ts`'s `SELECT ... FOR UPDATE` sequencing, applied via an advisory lock here
  // because there is no existing row for this specific rule+scope to lock.
  const lockKey = `sec1.monitoring_rule:${rule.ruleId}:${rule.condition.scope_column ?? ""}:${scopeValue ?? ""}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

  const countParams: unknown[] = [];
  const countWhere = buildMatchWhere(rule, scopeValue, countParams);
  const countRes = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM sec1.audit_event WHERE ${countWhere}`, countParams);
  const count = Number(countRes.rows[0]?.n ?? "0");
  if (count < rule.threshold.count) return;

  const alreadyOpen = await findOpenAlertByRuleScope(client, rule.ruleId, rule.condition.scope_column ?? null, scopeValue);
  if (alreadyOpen) return;

  const linkedParams: unknown[] = [];
  const linkedWhere = buildMatchWhere(rule, scopeValue, linkedParams);
  linkedParams.push(MAX_LINKED_AUDIT_EVENTS);
  const linkedRes = await client.query<{ audit_event_ref: string }>(
    `SELECT audit_event_ref FROM sec1.audit_event WHERE ${linkedWhere} ORDER BY ingested_at_utc DESC LIMIT $${linkedParams.length}`,
    linkedParams,
  );

  const input: CreateSystemAlertInput = {
    ruleId: rule.ruleId,
    severity: rule.severity,
    title: `Threshold exceeded: ${rule.ruleName}`,
    description: `${count} matching event(s) within the last ${rule.threshold.window_seconds}s (threshold ${rule.threshold.count}).`,
    actorUserId: event.actorUserId,
    clientId: event.clientId,
    entityType: event.entityType,
    entityId: event.entityId,
    linkedAuditEvents: linkedRes.rows.map((r) => r.audit_event_ref),
  };
  await createSystemAlert(client, input);
}

async function safeDeadLetter(input: {
  auditEventRef: string | null;
  ruleId: string | null;
  failureReason: string;
  severity: MonitoringSeverity;
  requestId?: string;
  correlationId?: string;
}): Promise<void> {
  try {
    await withTransaction((client) => writeMonitoringDeadLetter(client, input));
  } catch (err) {
    // Monitoring-of-monitoring failure — this must never propagate to the ingest/verification
    // response path (this file's own hard design constraint, see header comment). LOW-1
    // (Opus review): this is otherwise a SILENT failure with zero observability — log it.
    logDeadLetterWriteFailure({
      ruleId: input.ruleId,
      auditEventRef: input.auditEventRef,
      severity: input.severity,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      originalFailureReason: input.failureReason,
      writeFailureReason: describeError(err),
    });
  }
}

/**
 * Post-ingest hook. Called by `routes/internal.ts` AFTER the ingest transaction has committed —
 * see this file's header comment for why. Structurally never throws.
 */
export async function evaluateRulesForEvent(event: JustIngestedEvent): Promise<void> {
  let rawRules: RawRuleRow[];
  try {
    rawRules = await withTransaction((client) => fetchActiveRulesForEventType(client, event.eventType));
  } catch (err) {
    await safeDeadLetter({
      auditEventRef: event.auditEventRef,
      ruleId: null,
      failureReason: describeError(err),
      severity: "critical",
      requestId: event.requestId,
      correlationId: event.correlationId,
    });
    return;
  }

  for (const rawRule of rawRules) {
    try {
      await withTransaction((client) => evaluateOneRule(client, rawRule, event));
    } catch (err) {
      await safeDeadLetter({
        auditEventRef: event.auditEventRef,
        ruleId: rawRule.rule_id,
        failureReason: describeError(err),
        requestId: event.requestId,
        correlationId: event.correlationId,
        severity: rawRule.severity,
      });
    }
  }
}

// =============================================================================================
// Dead-letter replay (`routes/alerts.ts`'s `POST /internal/sec1/monitoring-dead-letter/replay`).
// Route-triggered only this phase — no scheduler/cron (Phase 5 plan §8).
// =============================================================================================

export interface ReplayDeadLetterResult {
  deadLetterId: string;
  status: "replayed" | "failed" | "escalated";
  retryCount: number;
}

/**
 * Replays ONE already-locked dead-letter row using the CALLER's own transaction/client — the
 * building block both the convenience wrappers below AND `routes/alerts.ts`'s replay route use
 * directly (the route wraps its own idempotency-begin/complete + row fetch + this call in a
 * SINGLE `withTransaction`, never nesting a second one — `withTransaction` checks out a fresh
 * pool connection per call, so calling it again from inside an already-open transaction would
 * silently run on a SECOND connection, defeating the point of one atomic operation).
 */
export async function replayDeadLetterRow(client: PoolClient, row: MonitoringDeadLetterRow): Promise<ReplayDeadLetterResult> {
  if (row.status === "replayed") {
    return { deadLetterId: row.dead_letter_id, status: "replayed", retryCount: row.retry_count };
  }
  if (!row.rule_id || !row.audit_event_ref) {
    const outcome = await recordDeadLetterReplayFailure(
      client,
      row,
      "Cannot be automatically replayed: no rule_id/audit_event_ref recorded (a pipeline-level or verification-hook failure, not a per-rule one).",
    );
    return { deadLetterId: row.dead_letter_id, ...outcome };
  }

  const rawRule = await fetchActiveRuleById(client, row.rule_id);
  const event = await fetchAuditEventAsJustIngestedEvent(client, row.audit_event_ref);
  if (!rawRule || !event) {
    const outcome = await recordDeadLetterReplayFailure(
      client,
      row,
      "Cannot be automatically replayed: the referenced rule is no longer active or the referenced audit event no longer exists.",
    );
    return { deadLetterId: row.dead_letter_id, ...outcome };
  }

  try {
    await evaluateOneRule(client, rawRule, event);
    await markDeadLetterReplayed(client, row.dead_letter_id);
    return { deadLetterId: row.dead_letter_id, status: "replayed", retryCount: row.retry_count };
  } catch (err) {
    const outcome = await recordDeadLetterReplayFailure(client, row, describeError(err));
    return { deadLetterId: row.dead_letter_id, ...outcome };
  }
}

/** Replays exactly one dead-letter item by ID. Throws (via `assertDeadLetterFound`) if it does
 * not exist — the route translates that into a 404. */
export async function replayDeadLetterItem(deadLetterId: string): Promise<ReplayDeadLetterResult> {
  return withTransaction(async (client) => {
    const row = await fetchDeadLetterForUpdate(client, deadLetterId);
    assertDeadLetterFound(row);
    return replayDeadLetterRow(client, row);
  });
}

/** Replays up to `limit` currently-eligible dead-letter items (oldest first). Never throws for
 * an individual item's replay failure — each item's outcome is reported in the returned array;
 * the route decides whether the OVERALL backlog (§`countEligibleDeadLetters`) warrants
 * `SEC1_ALERT_PIPELINE_BACKLOG`. */
export async function replayEligibleDeadLetters(limit: number): Promise<ReplayDeadLetterResult[]> {
  return withTransaction(async (client) => {
    const rows = await listEligibleDeadLetters(client, limit);
    const results: ReplayDeadLetterResult[] = [];
    for (const row of rows) {
      results.push(await replayDeadLetterRow(client, row));
    }
    return results;
  });
}
