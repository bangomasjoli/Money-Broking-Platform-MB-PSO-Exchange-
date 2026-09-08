-- CFG-01 §05.1 Database Design Database-Level Isolation Baseline — Phase 1.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and
-- runtime role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql /
-- iam2_runtime_grants.sql / sec1_runtime_grants.sql convention). This role reaches only the
-- `cfg1` schema; it is granted NOTHING in `foundation`, `iam`, `iam2`, or `sec1`.
--
-- Idempotent: safe to re-run.
--
-- PHASE 1 GRANT RATIONALE — SELECT-ONLY, EVERYWHERE, NO EXCEPTIONS:
--   Phase 1 has exactly one route that reads these tables (GET /internal/cfg1/readiness,
--   services/cfg1/src/routes/system.ts) and zero routes that write them — no feature/licence
--   change workflow, no kill-switch, no decision engine exists yet (all deferred to later
--   phases). role_cfg1_runtime therefore gets SELECT on all 5 Phase 1 tables and NOTHING else:
--   no INSERT, no UPDATE, no DELETE, no TRUNCATE. This is also the Phase 1 STRUCTURAL
--   immutability mechanism for cfg1.prohibited_feature (approved decision #15/design point 7):
--   a role_cfg1_runtime-connected caller cannot mutate the prohibited registry even if a future
--   bug introduced a code path that tried to — the DB itself refuses it, proven directly under
--   the real runtime role in tests/integration/cfg1-db.test.ts (INSERT/UPDATE/DELETE all
--   expected to fail with Postgres error code 42501, the same proof pattern every prior
--   module's own grant-boundary tests use).
--
--   No `foundation.outbox_event`/`foundation.idempotency_record` grant this phase — nothing in
--   Phase 1 calls publishAudit/beginIdempotent (no SEC-01 audit integration yet; readiness is a
--   pure read, not a sensitive action). No `iam2.*`/`sec1.*` grant — no IAM-02 permission
--   registration, no SEC-01 integration this phase, per the approved Phase 1 scope.
--
--   Least-privilege applied from day one, mirroring SEC-01's own C1 discipline (grant exactly
--   what THIS STAGE's code actually does, not a blanket grant anticipating later phases) —
--   later phases (mutation workflow, kill-switch, decision engine) will each add their own
--   narrowly-scoped INSERT/UPDATE grants when the code that needs them actually lands, the same
--   way SEC-01's own grants file grew phase by phase.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_cfg1_runtime') THEN
    CREATE ROLE role_cfg1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the cfg1 schema only.
GRANT USAGE ON SCHEMA cfg1 TO role_cfg1_runtime;

GRANT SELECT ON cfg1.licence_profile TO role_cfg1_runtime;
GRANT SELECT ON cfg1.feature TO role_cfg1_runtime;
GRANT SELECT ON cfg1.prohibited_feature TO role_cfg1_runtime;
GRANT SELECT ON cfg1.feature_version TO role_cfg1_runtime;
GRANT SELECT ON cfg1.config_integrity_seal TO role_cfg1_runtime;

-- ---------------------------------------------------------------------------------------
-- Phase 2 additions (migration 015_cfg1_decision_engine.cjs).
-- ---------------------------------------------------------------------------------------
-- All 5 Phase 1 tables above remain UNCHANGED (SELECT-only) — evaluate()/verify-decision()
-- only ever READ licence_profile/prohibited_feature/config_integrity_seal; still no mutation
-- workflow this phase.
--
-- cfg1.feature_decision_log — SELECT, INSERT only. One new row per evaluate() call
-- (services/cfg1/src/lib/decision.ts); append-only evidence, same posture as sec1.audit_event
-- — no UPDATE/DELETE, ever, enforced by simply never granting them.
GRANT SELECT, INSERT ON cfg1.feature_decision_log TO role_cfg1_runtime;

-- cfg1.feature_decision_token — SELECT, INSERT, UPDATE. INSERT on issuance (allow decisions
-- only); UPDATE is narrowly for the lifecycle columns a bounded-reuse token legitimately
-- changes over its lifetime (status -> 'revoked', revoked_at_utc, revoked_reason,
-- last_verified_at_utc on a successful verify) — same class of table as sec1.security_alert
-- (SELECT/INSERT/UPDATE, no DELETE), not the append-only class. No DELETE/TRUNCATE, ever.
GRANT SELECT, INSERT, UPDATE ON cfg1.feature_decision_token TO role_cfg1_runtime;

-- foundation.outbox_event — INSERT ONLY. The standard C1-tightened append-only audit/outbox
-- contract every audited module has (infra/grants/iam_runtime_grants.sql's own C1 precedent) —
-- CFG-01's first cross-schema grant, needed because Phase 2 is the first phase that calls
-- publishAudit (services/cfg1/src/routes/features.ts). No SELECT, no UPDATE — CFG-01 only ever
-- writes its own outbox rows, never reads or mutates another module's (or its own).
GRANT USAGE ON SCHEMA foundation TO role_cfg1_runtime;
GRANT INSERT ON foundation.outbox_event TO role_cfg1_runtime;

-- Explicit: NO `foundation.idempotency_record` grant — approved decision #4, neither
-- evaluate() nor verify-decision() requires an Idempotency-Key this phase (mirrors IAM-02's own
-- judgment call for `permission/check`: a decision is a legitimate answer, not a request
-- failure that needs replay protection). NO grant into `iam2` or `sec1` — no IAM-02 permission
-- registration, no direct SEC-01 ingestion HTTP call, per the approved Phase 2 scope. Asserted
-- by the F3(a)-equivalent test in tests/integration/cfg1-db.test.ts.

-- ---------------------------------------------------------------------------------------
-- Phase 3A additions (migration 016_cfg1_mutation_workflow.cjs) — CFG-01's FIRST write
-- capability on cfg1.licence_profile/cfg1.feature/cfg1.config_integrity_seal.
-- ---------------------------------------------------------------------------------------
-- cfg1.prohibited_feature explicitly UNCHANGED — SELECT only, still no INSERT/UPDATE/DELETE
-- grant of any kind (approved decisions #5/#6/#7: no route anywhere in Phase 3A mutates this
-- table, and no cfg1.prohibited_feature.manage permission is registered in IAM-02 either). This
-- is the primary structural enforcement mechanism, not merely documentation.

-- cfg1.feature_state_change — SELECT, INSERT, and a NARROWLY column-scoped UPDATE. Only the
-- lifecycle columns the apply route legitimately writes after row creation are grantable —
-- payload_hash/change_id/feature_code/to_state/feature_name/licence_code/requested_by/
-- change_reason (everything the change's payload_hash binds) remain structurally immutable
-- once inserted, even under this grant, mirroring sec1_runtime_grants.sql's own column-level
-- UPDATE precedent (`GRANT UPDATE (verification_status) ON sec1.audit_seal_batch`).
GRANT SELECT, INSERT ON cfg1.feature_state_change TO role_cfg1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, previous_version, new_version, applied_at_utc, effective_at_utc)
  ON cfg1.feature_state_change TO role_cfg1_runtime;

-- cfg1.licence_profile_change — same column-scoped shape as feature_state_change above.
GRANT SELECT, INSERT ON cfg1.licence_profile_change TO role_cfg1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, previous_version, new_version, applied_at_utc, effective_at_utc)
  ON cfg1.licence_profile_change TO role_cfg1_runtime;

-- cfg1.feature — SELECT (unchanged), INSERT (first-time creation on an approved 'enable' of a
-- feature_code with no existing row), and a column-scoped UPDATE limited to exactly what an
-- approved apply changes. feature_name/licence_profile_id/feature_code are never updated by any
-- Phase 3A code path (feature_name/licence_profile_id are only ever set at INSERT time) and are
-- deliberately NOT included in the UPDATE grant.
GRANT INSERT ON cfg1.feature TO role_cfg1_runtime;
GRANT UPDATE (current_state, version, updated_at_utc) ON cfg1.feature TO role_cfg1_runtime;

-- cfg1.feature_version — SELECT (unchanged), INSERT only. Append-only per-feature version
-- history, same posture as cfg1.feature_decision_log — no UPDATE/DELETE, ever.
GRANT INSERT ON cfg1.feature_version TO role_cfg1_runtime;

-- cfg1.licence_profile — SELECT (unchanged) plus a column-scoped UPDATE limited to exactly
-- what an approved apply changes. licence_code/authority/evidence_*/created_at_utc are never
-- updated by any Phase 3A code path and are deliberately NOT included.
GRANT UPDATE (licence_status, version, updated_at_utc) ON cfg1.licence_profile TO role_cfg1_runtime;

-- cfg1.config_integrity_seal — SELECT (unchanged), INSERT (new seal row on every successful
-- reseal), and a column-scoped UPDATE limited to `status` only (superseding the previous active
-- row — lib/integrity-seal.ts's resealScope). config_hash/doc00_baseline_hash/config_version of
-- an EXISTING seal row are never updated — a reseal always INSERTs a brand new row rather than
-- mutating history, so no other column ever needs an UPDATE grant.
GRANT INSERT ON cfg1.config_integrity_seal TO role_cfg1_runtime;
GRANT UPDATE (status) ON cfg1.config_integrity_seal TO role_cfg1_runtime;

-- Explicit: still NO DELETE/TRUNCATE grant on any cfg1 table, anywhere, ever. Still NO
-- `foundation.idempotency_record` grant (approved decision, carried from Phase 2 — no
-- Idempotency-Key on any Phase 3A route, same rationale IAM-02's own `/iam2/approvals/request`
-- already sets as precedent: reused directly, not re-litigated). Still NO grant into `iam2.*` or
-- `sec1.*` — CFG-01 reaches IAM-02 ONLY over HTTP (lib/iam2-client.ts), never via a direct SQL
-- grant into iam2's schema; `foundation.outbox_event` remains CFG-01's only cross-schema table
-- grant.

-- ---------------------------------------------------------------------------------------
-- Phase 3B additions (migration 018_cfg1_kill_switch.cjs) — feature-scoped kill-switch
-- workflow. Same column-scoped-UPDATE discipline as every Phase 3A grant above.
-- ---------------------------------------------------------------------------------------
-- cfg1.kill_switch — SELECT, INSERT (first activation for a feature_code), and a column-scoped
-- UPDATE limited to exactly what activate/deactivate change. feature_code/created_at_utc are
-- never updated by any Phase 3B code path and are deliberately NOT included.
GRANT SELECT, INSERT ON cfg1.kill_switch TO role_cfg1_runtime;
GRANT UPDATE (reason, evidence_ref, activated_by, status, activated_at_utc, deactivated_at_utc, version, updated_at_utc)
  ON cfg1.kill_switch TO role_cfg1_runtime;

-- cfg1.kill_switch_deactivation_request — same column-scoped shape as feature_state_change/
-- licence_profile_change above. payload_hash/change_id/kill_switch_id/feature_code/
-- change_reason/requested_by remain structurally immutable once inserted, even under this
-- grant.
GRANT SELECT, INSERT ON cfg1.kill_switch_deactivation_request TO role_cfg1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON cfg1.kill_switch_deactivation_request TO role_cfg1_runtime;

-- cfg1.kill_switch_event — SELECT, INSERT only. Append-only, same posture as
-- cfg1.feature_decision_log / cfg1.feature_version — no UPDATE/DELETE, ever.
GRANT INSERT ON cfg1.kill_switch_event TO role_cfg1_runtime;

-- Explicit: still no DELETE/TRUNCATE, still no widened cfg1.prohibited_feature grant, still no
-- `iam2.*`/`sec1.*` table grant, still no `foundation.idempotency_record` grant (no
-- Idempotency-Key on any Phase 3B route, same rationale as Phase 3A).
