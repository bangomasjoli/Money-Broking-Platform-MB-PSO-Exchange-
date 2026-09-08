/* eslint-disable camelcase */

/**
 * 039_aml1_rescreen_monitoring — AML-01 Phase 3C (re-screening triggers + route-triggered
 * monitoring runs + risk-signal emission, approved Phase 3C scope, confirmed decisions D1-D9).
 * Three additive schema changes:
 *
 *   1. `aml1.screening_request` gains `rescreen_of_request_id` (points at the SOURCE request a
 *      re-screen was derived from — NULL for an original, non-re-screen request) and
 *      `trigger_reason` (`manual`/`periodic_due`/`list_version_changed` — the two monitoring-route
 *      triggers plus the direct manual re-screen route; `kyc_profile_changed`/
 *      `transaction_triggered`/`remediation_check` are DELIBERATELY excluded — deferred to a phase
 *      after KYC-01/WLT-DEP-WDR-TRD/case-management exist respectively, per confirmed decision D2).
 *      Both columns are NULL for every pre-existing and every future ORIGINAL (non-re-screen) row —
 *      a re-screen NEVER mutates the original request (confirmed decision D1: history stays
 *      append-only, a re-screen is always a brand-new row).
 *
 *      A partial unique index enforces AT MOST ONE in-flight (`status='requested'`) screening
 *      request per `(subject_type, subject_ref)` at the database level — the authoritative
 *      loop-prevention/concurrent-duplicate backstop referenced by `AML1_RESCREEN_NOT_ALLOWED`
 *      (`lib/rescreen.ts` checks this proactively; the index is the race-safe backstop, the same
 *      "check first, let the constraint catch the race" discipline every prior maker-checker table
 *      in this codebase uses for its own partial unique index, e.g. CLT-01's
 *      `idx_clt1_duplicate_candidate_one_open_per_tuple` / `idx_clt1_related_party_edge_...`,
 *      CFG-01's `cfg1_kill_switch_one_active_per_feature`). Because AML-01's screening lifecycle is
 *      SYNCHRONOUS (a request transitions `requested` -> `completed`/`failed` within the same HTTP
 *      call, mirroring Phase 1-3B), this index also incidentally protects the ORIGINAL create route
 *      against a genuine concurrent-duplicate-create race for the same subject — a pre-existing race
 *      class this migration closes as a side effect, not a Phase 3C regression.
 *
 *   2. `aml1.monitoring_run` — one row per ROUTE-TRIGGERED monitoring batch (confirmed decision D3:
 *      no external scheduler, no cron, no queue scheduler; a run exists only because
 *      `POST /internal/aml1/monitoring-runs` was called). `trigger_reason` is narrower than
 *      `screening_request.trigger_reason` — `periodic_due`/`list_version_changed` ONLY, no
 *      `manual` (a manual re-screen is always a single direct
 *      `POST .../screening-requests/:id/rescreen` call, never a monitoring run). `status`
 *      `running` -> `completed`/`failed` (partial completion is still `completed` — confirmed
 *      decision: a monitoring run may complete partially, with failed subjects remaining due for a
 *      future run; no unbounded retry inside one run). No PII column of any kind — this table is
 *      itself the "safe monitoring run summary" `GET /internal/aml1/monitoring-runs/:run_id`
 *      returns.
 *
 *   3. `aml1.risk_signal` — AML-01's own signal-emission table (confirmed decision D4: AML-01
 *      EMITS signals only; it never freezes, blocks, debits, settles, trades, or mutates any
 *      downstream module — no grant of any kind exists into a downstream module's schema, and no
 *      code in this migration or the Phase 3C routes ever calls one). `signal_type` is the closed,
 *      blueprint-confirmed 3-value set (`confirmed_hit`/`potential_match_unresolved`/
 *      `rescreen_overdue`); `status` `open` -> `acknowledged`/`superseded` (`superseded` is
 *      schema-present but unreachable this phase — no code path this migration/phase ever writes
 *      it; reserved for a future phase where a fresh signal naturally supersedes an older open one
 *      for the same subject). `screening_request_id`/`screening_match_id` are OPTIONAL evidence
 *      pointers, not real FKs (mirrors every other AML-01 cross-reference column's own posture —
 *      `screening_request.subject_ref` etc. — no FK to a polymorphic/optional reference target).
 *      No PII column: `subject_ref`/`subject_parent_ref` are the same OPAQUE caller-supplied
 *      references every other AML-01 workflow table already carries, never a name/DOB/registration
 *      number.
 *
 * No role created here — `role_aml1_runtime`'s extended grants are applied separately by
 * `infra/grants/aml1_runtime_grants.sql`, AFTER this migration (mirrors every prior AML-01
 * migration's own convention). No seed data. No vendor credential table, no vendor evidence table,
 * no downstream-module table, no scheduler table beyond `monitoring_run` itself — all deliberately
 * out of Phase 3C scope (confirmed decisions D5/D6/D7 and the Phase 3C strict-exclusions list).
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE aml1.screening_request
      ADD COLUMN rescreen_of_request_id varchar(64),
      ADD COLUMN trigger_reason         varchar(32)
        CHECK (trigger_reason IN ('manual','periodic_due','list_version_changed'));

    CREATE INDEX idx_aml1_screening_request_rescreen_of_request_id
      ON aml1.screening_request (rescreen_of_request_id)
      WHERE rescreen_of_request_id IS NOT NULL;

    -- At most one IN-FLIGHT (status='requested') screening request per subject at a time — the
    -- authoritative loop-prevention/concurrent-duplicate backstop (see header comment).
    CREATE UNIQUE INDEX idx_aml1_screening_request_one_inflight_per_subject
      ON aml1.screening_request (subject_type, subject_ref)
      WHERE status = 'requested';

    CREATE TABLE aml1.monitoring_run (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id                varchar(64) NOT NULL UNIQUE,
      status                varchar(24) NOT NULL DEFAULT 'running'
                               CHECK (status IN ('running','completed','failed')),
      trigger_reason        varchar(32) NOT NULL
                               CHECK (trigger_reason IN ('periodic_due','list_version_changed')),
      candidates_selected   integer NOT NULL DEFAULT 0,
      rescreens_created     integer NOT NULL DEFAULT 0,
      failures              integer NOT NULL DEFAULT 0,
      requested_by          varchar(64) NOT NULL,
      request_id            varchar(128),
      correlation_id        varchar(128),
      started_at_utc        timestamptz NOT NULL DEFAULT now(),
      completed_at_utc      timestamptz
    );

    CREATE UNIQUE INDEX idx_aml1_monitoring_run_run_id ON aml1.monitoring_run (run_id);
    CREATE INDEX idx_aml1_monitoring_run_status ON aml1.monitoring_run (status);

    CREATE TABLE aml1.risk_signal (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      signal_id             varchar(64) NOT NULL UNIQUE,
      signal_type           varchar(48) NOT NULL
                               CHECK (signal_type IN ('confirmed_hit','potential_match_unresolved','rescreen_overdue')),
      subject_type          varchar(32) NOT NULL,
      subject_ref           varchar(64) NOT NULL,
      subject_parent_ref    varchar(64),
      screening_request_id  varchar(64),
      screening_match_id    varchar(64),
      severity              varchar(16) NOT NULL
                               CHECK (severity IN ('low','medium','high','critical')),
      status                varchar(24) NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','acknowledged','superseded')),
      acknowledged_by       varchar(64),
      acknowledged_at_utc   timestamptz,
      request_id            varchar(128),
      correlation_id        varchar(128),
      created_at_utc        timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_aml1_risk_signal_signal_id ON aml1.risk_signal (signal_id);
    CREATE INDEX idx_aml1_risk_signal_subject ON aml1.risk_signal (subject_type, subject_ref);
    CREATE INDEX idx_aml1_risk_signal_status ON aml1.risk_signal (status);
    CREATE INDEX idx_aml1_risk_signal_match_id ON aml1.risk_signal (screening_match_id) WHERE screening_match_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS aml1.risk_signal;
    DROP TABLE IF EXISTS aml1.monitoring_run;

    DROP INDEX IF EXISTS aml1.idx_aml1_screening_request_one_inflight_per_subject;
    DROP INDEX IF EXISTS aml1.idx_aml1_screening_request_rescreen_of_request_id;

    ALTER TABLE aml1.screening_request
      DROP COLUMN IF EXISTS trigger_reason,
      DROP COLUMN IF EXISTS rescreen_of_request_id;
  `);
};
