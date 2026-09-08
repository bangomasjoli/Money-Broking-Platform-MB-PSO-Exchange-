-- AML-01 §05-equivalent Database-Level Isolation Baseline — Phase 1.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and runtime
-- role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql /
-- iam2_runtime_grants.sql / sec1_runtime_grants.sql / cfg1_runtime_grants.sql /
-- clt1_runtime_grants.sql convention). Must be applied AFTER infra/migrations/033_aml1_core.cjs
-- (the tables must exist first). This role reaches only the `aml1` schema plus
-- `foundation.outbox_event` (INSERT-only, for publishAudit) — it is granted NOTHING in `iam`,
-- `iam2`, `sec1`, `cfg1`, or `clt1`. AML-01 has no CLT-01/IAM-02/CFG-01/SEC-01 HTTP dependency
-- yet either this phase (Phase 2+ concern) — same "reach other modules only over HTTP, never a
-- direct SQL grant" posture every module in this codebase maintains.
--
-- PHASE 1 GRANT RATIONALE — least privilege applied from day one, mirroring every prior module's
-- own Phase 1 grant-file precedent (grant exactly what THIS STAGE's code actually does):
--
--   screening_request — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the fields
--   the synchronous screening lifecycle legitimately mutates after creation (requested -> completed
--   or requested -> failed, in the SAME transaction as the INSERT). `screening_request_id`/
--   `subject_type`/`subject_ref`/`provenance`/`requested_by`/`created_at_utc` are all set ONCE at
--   INSERT time and are deliberately NOT included in the UPDATE grant.
--
--   screening_subject_snapshot / screening_result / screening_match — SELECT, INSERT ONLY.
--   Append-only from Phase 1 code's perspective: a re-screen writes a NEW snapshot/result/match
--   row, never edits an existing one (mirrors CLT-01's own `cdd_outcome`/`handoff_status` Phase 2
--   precedent — no UPDATE, no DELETE, ever, enforced by simply never granting them). These three
--   tables also carry AML-01's most sensitive PII columns (name/registration_number/
--   date_of_birth/nationality on the snapshot; matched_name/match_detail on the match) — NO
--   UPDATE grant on any of them, anywhere, ever.
--
--   foundation.outbox_event — INSERT ONLY, the standard C1-tightened append-only audit/outbox
--   contract every audited module has. AML-01's only cross-schema grant.
--
--   No `foundation.idempotency_record` grant — no Idempotency-Key required on the Phase 1
--   screening-request POST (approved design decision: a re-screen of the same subject is a
--   legitimately new, append-only row — there is no duplicate-mutation risk to dedupe against,
--   same posture CLT-01's own Phase 1 application-intake POST took). No `iam2.*`/`cfg1.*`/
--   `sec1.*`/`clt1.*` grant — no IAM-02 permission registration this phase, no CFG-01/SEC-01/
--   CLT-01 integration of any kind this phase.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_aml1_runtime') THEN
    CREATE ROLE role_aml1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the aml1 schema only.
GRANT USAGE ON SCHEMA aml1 TO role_aml1_runtime;

GRANT SELECT, INSERT ON aml1.screening_request TO role_aml1_runtime;
GRANT UPDATE (status, completed_at_utc, version) ON aml1.screening_request TO role_aml1_runtime;

GRANT SELECT, INSERT ON aml1.screening_subject_snapshot TO role_aml1_runtime;
GRANT SELECT, INSERT ON aml1.screening_result TO role_aml1_runtime;
GRANT SELECT, INSERT ON aml1.screening_match TO role_aml1_runtime;

-- foundation.outbox_event — INSERT ONLY. AML-01's first (and only) cross-schema grant, needed
-- because Phase 1 is the first phase that calls publishAudit (services/aml1/src/routes/
-- screening.ts).
GRANT USAGE ON SCHEMA foundation TO role_aml1_runtime;
GRANT INSERT ON foundation.outbox_event TO role_aml1_runtime;

-- Explicit: NO DELETE/TRUNCATE grant on any aml1 table, anywhere, ever. NO UPDATE grant on
-- screening_subject_snapshot, screening_result, or screening_match — every PII/match column
-- (name/registration_number/date_of_birth/nationality/matched_name/match_detail/score) stays
-- immutable after insert. screening_request's own UPDATE grant is column-scoped to
-- status/completed_at_utc/version only. NO `foundation.idempotency_record` grant. NO grant into
-- `iam2`, `sec1`, `cfg1`, or `clt1` — AML-01 reaches no other module by direct SQL grant.
-- Asserted by the grant-boundary tests in tests/integration/aml1-db.test.ts.

-- PHASE 2A EXTENSION (CLT-01 outcome delivery) — least privilege applied the same way Phase 1 was:
-- grant exactly what this stage's delivery/retry routes actually mutate.
--
--   clt_outcome_delivery — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields the two-phase delivery lifecycle legitimately mutates after creation (pending ->
--   succeeded/failed, on the initial delivery attempt or a later retry). `delivery_id`/
--   `screening_request_id`/`target`/`outcome_type`/`delivered_status`/`effective_status`/
--   `requested_by`/`created_at_utc` are all set ONCE at INSERT time and are deliberately NOT
--   included in the UPDATE grant.
--
--   screening_request.subject_parent_ref is INSERT-time only (set once when the screening request
--   is created) — deliberately NOT added to screening_request's existing UPDATE grant (still
--   column-scoped to status/completed_at_utc/version only, unchanged from Phase 1).
--
-- Still NO DELETE/TRUNCATE grant anywhere, NO `foundation.idempotency_record` grant (at-least-once
-- delivery is the approved posture — no dedupe key needed), and NO grant into `clt1` or any other
-- module's schema — AML-01 reaches CLT-01 only over HTTP via lib/clt1-client.ts, never a direct SQL
-- grant.

GRANT SELECT, INSERT ON aml1.clt_outcome_delivery TO role_aml1_runtime;
GRANT UPDATE (status, attempt_count, failure_reason_code, response_ref, delivered_at_utc, version)
  ON aml1.clt_outcome_delivery TO role_aml1_runtime;

-- PHASE 2B EXTENSION (human match disposition) — least privilege applied the same way Phase 1/2A
-- were: grant exactly what this stage's disposition routes actually mutate.
--
--   screening_match — its FIRST-EVER UPDATE grant, column-scoped to exactly the five review
--   columns the disposition apply route legitimately mutates (pending -> confirmed_hit/dismissed).
--   `matched_name`/`match_detail`/`score`/`category`/`list_source`/`screening_result_id`/
--   `screening_match_id`/`created_at_utc` are NOT included — every PII/evidence column stays
--   immutable after insert, forever. `match_status` itself IS included (it is the column the
--   disposition transition actually writes) — but it is reachable ONLY through the approved
--   confirm/dismiss apply route's own WHERE-clause + FOR-UPDATE-lock concurrency guard, never a
--   raw arbitrary UPDATE, since the runtime role's grant makes no distinction between "via the
--   approved code path" and "any UPDATE statement" — the application-layer guard is what
--   constrains legitimate use, the grant is what constrains the blast radius of a compromised
--   connection.
--
--   match_disposition_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited to
--   exactly the fields the apply step legitimately mutates after creation (requested -> applied).
--   `decision_id`/`screening_match_id`/`decision_type`/`reason`/`requested_by`/`payload_hash`/
--   `created_at_utc` are all set ONCE at INSERT time and are deliberately NOT included in the
--   UPDATE grant.
--
-- Still NO DELETE/TRUNCATE grant anywhere, and NO grant into `iam2` or any other module's schema —
-- AML-01 reaches IAM-02 only over HTTP via lib/iam2-client.ts, never a direct SQL grant.

GRANT UPDATE (match_status, reviewed_by, reviewed_at_utc, approval_id, version, updated_at_utc)
  ON aml1.screening_match TO role_aml1_runtime;

GRANT SELECT, INSERT ON aml1.match_disposition_decision_request TO role_aml1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc)
  ON aml1.match_disposition_decision_request TO role_aml1_runtime;

-- PHASE 3B EXTENSION (two-phase screening lifecycle + provider adaptor boundary) — least privilege
-- applied the same way every prior phase was: grant exactly what this stage's screening route
-- actually mutates.
--
--   screening_provider_attempt — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields TX2 legitimately mutates after TX1's INSERT (pending -> succeeded/failed).
--   `attempt_id`/`screening_request_id`/`provider_id`/`provider_adaptor_version`/
--   `request_payload_hash`/`created_at_utc` are all set ONCE at INSERT time and are deliberately
--   NOT included in the UPDATE grant. `attempt_count` IS included even though Phase 3B never
--   implements a retry route (no reachable throw site for a Phase 3B retry) — forward-compatible
--   with a future retry/resume phase, mirroring the same column already present (and unused by any
--   Phase 3B code path) on `clt_outcome_delivery`.
--
-- Still NO DELETE/TRUNCATE grant anywhere, and NO grant into `iam2`, `clt1`, `cfg1`, `sec1`, `iam`,
-- or any future `wlt`/`dep`/`wdr`/`trd` module's schema — AML-01's screening provider boundary is
-- entirely in-process this phase (the deterministic stub), never a direct SQL grant, and never a
-- stored vendor credential of any kind.

GRANT SELECT, INSERT ON aml1.screening_provider_attempt TO role_aml1_runtime;
GRANT UPDATE (status, failure_reason_code, response_payload_hash, provider_reference_id, provider_list_version, latency_ms, attempt_count, checked_at_utc)
  ON aml1.screening_provider_attempt TO role_aml1_runtime;

-- PHASE 3C EXTENSION (re-screening triggers + route-triggered monitoring runs + risk-signal
-- emission) — least privilege applied the same way every prior phase was: grant exactly what this
-- stage's rescreen/monitoring/risk-signal routes actually mutate.
--
--   screening_request.rescreen_of_request_id / .trigger_reason — INSERT-TIME ONLY (set once, at
--   the same INSERT the re-screen/monitoring-triggered-rescreen lifecycle already performs for
--   every screening_request row). The table's existing `GRANT SELECT, INSERT` already covers both
--   new columns at INSERT time; the existing column-scoped UPDATE grant (status, completed_at_utc,
--   version — Phase 1/2A) is DELIBERATELY left unchanged — neither new column is ever added to it,
--   so neither can ever be mutated after creation, on any row, by any Phase 3C code path.
--
--   monitoring_run — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the fields the
--   route-triggered monitoring-run lifecycle legitimately mutates after creation (running ->
--   completed/failed, accumulating candidates_selected/rescreens_created/failures as candidates are
--   processed). `run_id`/`trigger_reason`/`requested_by`/`request_id`/`correlation_id`/
--   `started_at_utc`/`id` are all set ONCE at INSERT time and are deliberately NOT included in the
--   UPDATE grant — no code path may ever rewrite which run this is, why it ran, or who ran it.
--
--   risk_signal — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the fields the
--   acknowledge route legitimately mutates (open -> acknowledged). `signal_id`/`signal_type`/
--   `subject_type`/`subject_ref`/`subject_parent_ref`/`screening_request_id`/`screening_match_id`/
--   `severity`/`request_id`/`correlation_id`/`created_at_utc`/`id` are all set ONCE at INSERT time
--   and are deliberately NOT included in the UPDATE grant — every evidence/classification column on
--   a risk signal stays immutable after emission, forever; only its own review-lifecycle state
--   (`status`/`acknowledged_by`/`acknowledged_at_utc`) may ever change.
--
-- Still NO DELETE/TRUNCATE grant anywhere, and NO grant into `iam2`, `clt1`, `cfg1`, `sec1`, `iam`,
-- or any `wlt`/`dep`/`wdr`/`trd` module's schema — AML-01 Phase 3C emits risk signals only
-- (confirmed decision D4); it never freezes, blocks, debits, settles, trades, or mutates any
-- downstream module, and this grant file proves that structurally, not just by code review.

GRANT SELECT, INSERT ON aml1.monitoring_run TO role_aml1_runtime;
GRANT UPDATE (status, candidates_selected, rescreens_created, failures, completed_at_utc)
  ON aml1.monitoring_run TO role_aml1_runtime;

GRANT SELECT, INSERT ON aml1.risk_signal TO role_aml1_runtime;
GRANT UPDATE (status, acknowledged_by, acknowledged_at_utc)
  ON aml1.risk_signal TO role_aml1_runtime;
