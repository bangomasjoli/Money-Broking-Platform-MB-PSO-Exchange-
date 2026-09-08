/* eslint-disable camelcase */

/**
 * 012_sec1_monitoring_alerts — SEC-01 Phase 5 slice (blueprint `05_Database_Design.md`
 * §2.5-2.8; `docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md`).
 *
 * Adds the 4 tables this phase targets: `security_monitoring_rule`, `monitoring_dead_letter`,
 * `security_alert`, `alert_triage_note`. Deliberately does NOT create `evidence_export`,
 * `interim_audit_handoff`, `audit_correction`, `expected_event_reconciliation`, or
 * `recovery_integrity_run` — all remain out of scope for Phase 5, mirroring 008/009/010's own
 * phasing discipline.
 *
 * ---------------------------------------------------------------------------------------
 * RLS DESIGN — none of these 4 tables have row-level security, same reasoning as every other
 * sec1 table: `security_monitoring_rule` is a global catalogue (no single-owner row, same class
 * as `event_schema`); `monitoring_dead_letter`/`security_alert`/`alert_triage_note` are
 * operational/evidence tables gated by the IAM-02 permission guard at the application layer,
 * not by DB-level row ownership (same posture as `audit_event`/`sensitive_read_log`).
 * ---------------------------------------------------------------------------------------
 *
 * GRANT POSTURE — a genuinely new posture vs. every other sec1 table so far. `audit_event` /
 * `sensitive_read_log` / `integrity_verification_run` are strictly append-only (no UPDATE grant
 * to role_sec1_runtime, ever). `security_alert` is different: it is a LIVE LIFECYCLE ROW whose
 * `status`/`assigned_to`/`closed_at_utc`/`closure_reason`/`closure_evidence_ref` legitimately
 * change over time — the same class of table as `sec1.audit_stream` (SELECT/INSERT/UPDATE, no
 * DELETE), not the same class as `audit_event`. The append-only EVIDENCE trail for what
 * happened to an alert lives in `alert_triage_note` (one new row per triage action, never
 * edited) and in the underlying `audit_event`/`sensitive_read_log` rows an alert references.
 * `monitoring_dead_letter` is similarly a live retry-bookkeeping row (retry_count/status/
 * next_retry_at_utc mutate on replay), so it also gets SELECT/INSERT/UPDATE, no DELETE.
 * `security_monitoring_rule` is SELECT ONLY this phase (migration-seeded; no management API —
 * see the seed-rule comment below and the Phase 5 plan §2).
 *
 * See infra/grants/sec1_runtime_grants.sql's own "Phase 5 additions" section for the exact
 * grants.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- §2.5 security_monitoring_rule — migration-seeded catalogue of threshold/count-window
    -- rules. No management API this phase (POST /sec1/monitoring-rules is its own
    -- approval-gated slice, deferred whole — see the Phase 5 plan §2).
    --
    -- event_type_filter: jsonb array of event_type strings this rule watches.
    -- condition: jsonb, e.g. { "scope_column": "actor_user_id", "action": "login",
    --   "result": "failure" } — scope_column groups the count per distinct value of that
    --   column (only "actor_user_id"/"client_id" are supported — the two columns
    --   security_alert itself can store, so a rule's alerts can be deduplicated by that same
    --   column); action/result are OPTIONAL exact-match filters layered on top of
    --   event_type_filter (still a plain count-window, not a general condition language) —
    --   needed because this codebase's only ingestible event types today are the 4 generic
    --   catch-all rows migration 008 seeded (fnd01.generic_event / iam01.generic_event /
    --   iam02.generic_event / sec1.self_audit_event), which carry no dedicated event_type per
    --   business meaning; action/result narrow a generic type down to a specific scenario
    --   (e.g. event_type=iam01.generic_event AND action='login' AND result='failure' = "failed
    --   login").
    -- threshold: jsonb, { "count": number, "window_seconds": number }.
    -- severity: the ALERT's severity if this rule fires (not the triggering event's severity).
    -- recipient_policy: jsonb, accepted/stored but NOT acted upon operationally this phase —
    --   no real notification provider exists (Phase 5 plan §10); this column is forward
    --   compatible with a later phase that does dispatch notifications.
    -- status: 'active'/'inactive' — the brief's "enabled flag" (mirrors event_schema's own
    --   active/inactive convention rather than inventing a separate boolean column).
    -- approval_id: NULL for every row this phase (no rule-management/approval workflow is
    --   built yet — this column exists per the blueprint's literal column list for
    --   shape-completeness, always NULL until a later phase's rule-management API is built).
    CREATE TABLE sec1.security_monitoring_rule (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id            varchar(64) NOT NULL UNIQUE,
      rule_name          varchar(128) NOT NULL,
      event_type_filter  jsonb NOT NULL,
      condition          jsonb NOT NULL DEFAULT '{}'::jsonb,
      threshold          jsonb NOT NULL,
      severity           varchar(16) NOT NULL
                           CHECK (severity IN ('info','low','medium','high','critical')),
      recipient_policy   jsonb NOT NULL DEFAULT '{}'::jsonb,
      status             varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      approval_id        varchar(64)
    );

    -- §2.6 monitoring_dead_letter — one row per (audit_event_ref, rule_id) evaluation failure,
    -- or a rule_id=NULL row for a pipeline-level failure (e.g. the rule-lookup query itself
    -- errored before any per-rule evaluation could even start). audit_event_ref is nullable
    -- too — a failed alert-creation attempt from the Phase 3 integrity/seal verification hooks
    -- (§10 of the approved implementation brief) has no single triggering audit_event, only a
    -- verification_id/seal_batch_id (recorded in failure_reason's own text, since this table
    -- has no dedicated column for those two identifiers — adding one would be scope creep for
    -- a table whose blueprint shape is ingestion-event-centric).
    --
    -- failure_reason doubles as the LATEST failure reason across retries (updated in place on
    -- each failed replay attempt, not a separate "last_error" column) — a documented judgment
    -- call: the blueprint's own column list has exactly one text reason column, and adding a
    -- second one purely to distinguish "first reason" from "latest reason" is not load-bearing
    -- for anything this phase's replay route needs to prove.
    CREATE TABLE sec1.monitoring_dead_letter (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dead_letter_id     varchar(64) NOT NULL UNIQUE,
      audit_event_ref    varchar(64),
      rule_id            varchar(64),
      failure_reason     text NOT NULL,
      severity           varchar(16) NOT NULL
                           CHECK (severity IN ('info','low','medium','high','critical')),
      retry_count        int NOT NULL DEFAULT 0,
      status             varchar(16) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','replayed','failed','escalated')),
      created_at_utc     timestamptz NOT NULL DEFAULT now(),
      next_retry_at_utc  timestamptz
    );

    -- §2.7 security_alert — the one deliberately MUTABLE lifecycle table in this schema (see
    -- migration header). rule_id is nullable: an alert created by the Phase 3 integrity/seal
    -- verification-failure hooks (§10 of the approved brief) did not come from the rule engine
    -- at all (entity_type/entity_id instead reference the verification_id/seal_batch_id).
    -- linked_audit_events: jsonb array of audit_event_ref strings (capped, see
    -- lib/monitoring-rules.ts). due_at_utc is left NULL for every alert this phase — "final
    -- alert SLA by severity" is an explicitly UNRESOLVED blueprint open item
    -- (01_Module_Blueprint.md's own open-items list, item 6), so this migration does not invent
    -- an authoritative SLA number; a later phase populates this once that open item is
    -- resolved.
    CREATE TABLE sec1.security_alert (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_id               varchar(64) NOT NULL UNIQUE,
      rule_id                varchar(64),
      severity               varchar(16) NOT NULL
                               CHECK (severity IN ('info','low','medium','high','critical')),
      status                 varchar(16) NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','assigned','triaged','escalated','closed')),
      title                  varchar(256) NOT NULL,
      description            text,
      actor_user_id          varchar(64),
      client_id              varchar(64),
      entity_type            varchar(64),
      entity_id              varchar(64),
      linked_audit_events    jsonb NOT NULL DEFAULT '[]'::jsonb,
      assigned_to            varchar(64),
      created_at_utc         timestamptz NOT NULL DEFAULT now(),
      due_at_utc             timestamptz,
      closed_at_utc          timestamptz,
      closure_reason         text,
      closure_evidence_ref   varchar(128)
    );

    -- §2.8 alert_triage_note — append-only, one row per triage action (same posture as
    -- sensitive_read_log/integrity_verification_run: SELECT+INSERT only, no UPDATE/DELETE).
    CREATE TABLE sec1.alert_triage_note (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id            varchar(64) NOT NULL UNIQUE,
      alert_id           varchar(64) NOT NULL,
      reviewer_user_id   varchar(64) NOT NULL,
      triage_status      varchar(24) NOT NULL
                           CHECK (triage_status IN ('true_positive','false_positive','duplicate','expected','escalated')),
      note               text,
      evidence_refs      jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at_utc     timestamptz NOT NULL DEFAULT now()
    );

    -- §3 indexes (the ones the approved brief specifically calls for).
    CREATE INDEX idx_sec1_security_alert_status_severity ON sec1.security_alert (status, severity);
    CREATE INDEX idx_sec1_security_alert_created ON sec1.security_alert (created_at_utc);
    CREATE INDEX idx_sec1_monitoring_dead_letter_status_retry ON sec1.monitoring_dead_letter (status, next_retry_at_utc);
    CREATE INDEX idx_sec1_alert_triage_note_alert ON sec1.alert_triage_note (alert_id);
    -- Supports the rule-matching lookup (event_type_filter @> to_jsonb($1)) and active-only
    -- filtering together.
    CREATE INDEX idx_sec1_security_monitoring_rule_status ON sec1.security_monitoring_rule (status);
  `);

  // ===========================================================================================
  // SEED DATA — a small (3-row), REPRESENTATIVE P0 rule set, not the full SEC1-TC-019..028
  // catalogue (Phase 5 plan §12 risk item 2: the full rule catalogue is follow-on
  // catalogue-content work, not a Phase 5 P0 blocker). All three key off the ONLY event types
  // this codebase can actually ingest today (the 4 generic catch-all rows from migration 008),
  // narrowed to a specific scenario via condition.action/condition.result — see the table
  // comment above for why that narrowing exists.
  // ===========================================================================================
  const rules = [
    {
      rule_id: "rule_failed_login_spike",
      rule_name: "Failed login spike (per actor)",
      event_type_filter: ["iam01.generic_event"],
      condition: { scope_column: "actor_user_id", action: "login", result: "failure" },
      threshold: { count: 5, window_seconds: 300 },
      severity: "high",
    },
    {
      rule_id: "rule_mfa_reset_abuse",
      rule_name: "MFA reset abuse (per actor)",
      event_type_filter: ["iam01.generic_event"],
      condition: { scope_column: "actor_user_id", action: "mfa_reset" },
      threshold: { count: 3, window_seconds: 3600 },
      severity: "critical",
    },
    {
      rule_id: "rule_sod_conflict_approval_abuse",
      rule_name: "SoD conflict / approval abuse (per actor)",
      event_type_filter: ["iam02.generic_event"],
      condition: { scope_column: "actor_user_id", action: "sod_conflict" },
      threshold: { count: 1, window_seconds: 60 },
      severity: "critical",
    },
  ];

  // `pgm.sql()` does `{name}` token substitution, NOT positional `$1` parameter binding like
  // `pg`'s own `client.query(sql, params)` — the same reason migration 008 embeds its seed
  // values via JS template-literal interpolation rather than a params array. `sqlString`/
  // `sqlJsonb` below apply the same single-quote-doubling escape 008 relies on implicitly
  // (its seeded strings simply never contained a quote); done explicitly here since this
  // seed data is JSON-shaped and worth being defensive about.
  const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const sqlJsonb = (value) => `${sqlString(JSON.stringify(value))}::jsonb`;

  for (const rule of rules) {
    pgm.sql(`
      INSERT INTO sec1.security_monitoring_rule
        (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
      VALUES
        (${sqlString(rule.rule_id)}, ${sqlString(rule.rule_name)}, ${sqlJsonb(rule.event_type_filter)},
         ${sqlJsonb(rule.condition)}, ${sqlJsonb(rule.threshold)}, ${sqlString(rule.severity)}, '{}'::jsonb, 'active', NULL);
    `);
  }
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS sec1.alert_triage_note;
    DROP TABLE IF EXISTS sec1.security_alert;
    DROP TABLE IF EXISTS sec1.monitoring_dead_letter;
    DROP TABLE IF EXISTS sec1.security_monitoring_rule;
  `);
};
