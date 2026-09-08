-- CLT-01 §05 Database Design Database-Level Isolation Baseline — Phase 1 + Phase 2 + Phase 3.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and runtime
-- role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql /
-- iam2_runtime_grants.sql / sec1_runtime_grants.sql / cfg1_runtime_grants.sql convention). This
-- role reaches only the `clt1` schema plus `foundation.outbox_event` (INSERT-only, for
-- publishAudit) — it is granted NOTHING in `iam`, `iam2`, `sec1`, or `cfg1`. CLT-01 reaches
-- CFG-01 and IAM-02 ONLY over HTTP (services/clt1/src/lib/cfg1-client.ts,
-- services/clt1/src/lib/iam2-client.ts), never via a direct SQL grant into either schema — same
-- posture CFG-01 itself uses toward IAM-02.
--
-- PHASE 2 additions (infra/migrations/021_clt1_cdd_final_approval.cjs's new tables/columns):
-- `client_application` UPDATE grant gains the CDD-rollup/decision columns; `client_profile` gains
-- INSERT (approve/apply is the only Phase 2 code path that ever inserts a row); `cdd_outcome` and
-- `handoff_status` get SELECT+INSERT only (both append-only from Phase 2 code's perspective);
-- `application_decision_request` gets SELECT+INSERT plus a column-scoped UPDATE mirroring
-- `cfg1.feature_state_change`'s own grant shape.
--
-- PHASE 3 additions (infra/migrations/023_clt1_authorised_users_mandates.cjs's new tables):
-- `authorised_user` gets SELECT+INSERT plus a column-scoped UPDATE limited to
-- `status`/`version`/`updated_at_utc` (add/apply is the only INSERT path; suspend/reactivate and
-- remove/apply are the only UPDATE paths — `user_reference`/`requested_by`/`created_at_utc` stay
-- immutable after creation). `client_mandate` gets SELECT+INSERT plus a column-scoped UPDATE
-- limited to `rules`/`mandate_type`/`mandate_schema_version`/`status`/`approval_id`/`version`/
-- `updated_at_utc` (create/apply is the only INSERT path; update/apply is the only UPDATE path —
-- `client_id`/`requested_by`/`created_at_utc` stay immutable). `authorised_user_decision_request`
-- and `client_mandate_decision_request` each get SELECT+INSERT plus a column-scoped UPDATE
-- limited to `status`/`approval_id`/`decision_token_hash`/`applied_at_utc`, mirroring
-- `application_decision_request`'s own grant shape exactly.
--
-- Idempotent: safe to re-run.
--
-- PHASE 1 GRANT RATIONALE — least privilege applied from day one, mirroring SEC-01's own C1
-- discipline and CFG-01's own Phase 1/2/3A grant-file precedent (grant exactly what THIS STAGE's
-- code actually does, not a blanket grant anticipating later phases):
--
--   client_application — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields Phase 1 routes legitimately mutate after creation (draft-time PATCH, class-change
--   gate re-check, submit/start-review/cancel transitions). `application_id`/`applicant_type`/
--   `created_by`/`created_at_utc` are never updated by any Phase 1 code path (applicant_type is
--   an identity-shaping field set once at creation, same class as cfg1.feature.feature_name) and
--   are deliberately NOT included in the UPDATE grant.
--
--   client_profile — SELECT only, no INSERT/UPDATE/DELETE. Zero Phase 1 code path reads or
--   writes this table at all (see infra/migrations/020_clt1_intake_baseline.cjs's header
--   comment) — SELECT is granted now purely for consistency with CFG-01's own precedent of
--   granting SELECT on an empty forward-compat table (cfg1.feature during CFG-01 Phase 1)
--   ahead of the phase that will actually use it.
--
--   client_classification_evidence / consent_record — SELECT, INSERT only. Append-only from the
--   application's perspective this phase (no verify/reject evidence route, no consent-revoke
--   route) — same posture as cfg1.feature_decision_log / cfg1.feature_version: no UPDATE/DELETE,
--   ever, enforced by simply never granting them.
--
--   foundation.outbox_event — INSERT ONLY, the standard C1-tightened append-only audit/outbox
--   contract every audited module has. CLT-01's only cross-schema grant.
--
--   No `foundation.idempotency_record` grant — no Idempotency-Key required on any Phase 1 route
--   (approved design decision: state-machine transition guards handle duplicate submit/cancel/
--   start-review attempts; a duplicate draft-application CREATE is an accepted, low-severity,
--   later-detectable-by-Phase-4-duplicate-detection risk). No `iam2.*`/`sec1.*`/`cfg1.*` grant —
--   no IAM-02 permission registration this phase, no direct SEC-01 ingestion HTTP call, CFG-01
--   reached only over HTTP.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_clt1_runtime') THEN
    CREATE ROLE role_clt1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the clt1 schema only.
GRANT USAGE ON SCHEMA clt1 TO role_clt1_runtime;

GRANT SELECT, INSERT ON clt1.client_application TO role_clt1_runtime;
-- Phase 4A.1 addition (infra/migrations/047_clt1_atomic_kyc_roster_binding.cjs):
-- `kyc_roster_hash` added to this column-scoped UPDATE list — written by the KYC/KYB outcome
-- receipt (routes/outcomes.ts) on an accepted receipt, and read (never written) by approve/apply's
-- new approval-gate roster-staleness recheck. `cdd_outcome.kyc_roster_hash` (the immutable
-- per-receipt historical twin of this column) deliberately gets NO UPDATE grant at all — see the
-- explicit no-UPDATE note near the bottom of this file.
GRANT UPDATE (
  legal_name, registration_number, country_of_incorporation, applicant_email,
  client_class_claimed, client_class_status, status,
  cfg_feature_code, cfg_decision_id, cfg_reason_code, cfg_evaluated_at_utc,
  assigned_reviewer, submitted_at_utc, under_review_at_utc, cancelled_at_utc,
  version, updated_at_utc,
  client_id, cdd_outcome_status, aml_sanctions_status, pep_adverse_media_status, risk_rating_status,
  approved_at_utc, rejected_at_utc, held_at_utc, approval_id, rejection_reason, hold_reason,
  kyc_roster_hash
) ON clt1.client_application TO role_clt1_runtime;

-- client_profile — Phase 2 addition: SELECT, INSERT (client_id/application_id/applicant_type/
-- legal_name/registration_number/country_of_incorporation/client_class/status/version are all
-- written ONCE, at INSERT time, by approve/apply — see infra/grants header rationale below). Phase
-- 2 through Phase 7 had no suspend/close/status-upgrade route, so client_profile.status stayed
-- 'active_limited' forever those phases; Phase 8 (below) adds the first-ever UPDATE grant.
GRANT SELECT, INSERT ON clt1.client_profile TO role_clt1_runtime;

GRANT SELECT, INSERT ON clt1.client_classification_evidence TO role_clt1_runtime;
GRANT SELECT, INSERT ON clt1.consent_record TO role_clt1_runtime;

-- Phase 2 additions — cdd_outcome / handoff_status: SELECT, INSERT only. Both append-only from
-- Phase 2 code's perspective (no route ever UPDATEs a cdd_outcome row; handoff_status rows are
-- created once at 'pending' and never revisited by Phase 2 code — outcome_status/delivery_status
-- transitions belong to whichever future phase adds real downstream connectivity).
GRANT SELECT, INSERT ON clt1.cdd_outcome TO role_clt1_runtime;
GRANT SELECT, INSERT ON clt1.handoff_status TO role_clt1_runtime;

-- application_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited to exactly
-- what approve/apply legitimately mutates on an already-created request row (mirrors
-- cfg1.feature_state_change's own grant shape). decision/application_id/client_class_claimed/
-- requested_by/payload_hash are set once at request time and are deliberately NOT included here.
GRANT SELECT, INSERT ON clt1.application_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.application_decision_request TO role_clt1_runtime;

-- Phase 3 additions — authorised_user / client_mandate: SELECT, INSERT, and a column-scoped
-- UPDATE limited to exactly what Phase 3 code legitimately mutates after creation.
-- user_reference/client_id/role/requested_by/created_at_utc on authorised_user, and
-- client_id/requested_by/created_at_utc on client_mandate, are never updated by any Phase 3 code
-- path and are deliberately NOT included.
GRANT SELECT, INSERT ON clt1.authorised_user TO role_clt1_runtime;
GRANT UPDATE (status, version, updated_at_utc) ON clt1.authorised_user TO role_clt1_runtime;

GRANT SELECT, INSERT ON clt1.client_mandate TO role_clt1_runtime;
GRANT UPDATE (rules, mandate_type, mandate_schema_version, status, approval_id, version, updated_at_utc) ON clt1.client_mandate TO role_clt1_runtime;

-- authorised_user_decision_request / client_mandate_decision_request — SELECT, INSERT, and a
-- column-scoped UPDATE limited to exactly what */apply legitimately mutates on an
-- already-created request row (mirrors application_decision_request's own grant shape).
-- decision_type/client_id/user_reference/role/rules/mandate_type/requested_by/payload_hash are
-- set once at request time and are deliberately NOT included here.
GRANT SELECT, INSERT ON clt1.authorised_user_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.authorised_user_decision_request TO role_clt1_runtime;

GRANT SELECT, INSERT ON clt1.client_mandate_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.client_mandate_decision_request TO role_clt1_runtime;

-- Phase 4 additions — authorised_party: SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what Phase 4 code legitimately mutates after creation. application_id/party_type/
-- party_reference/requested_by/created_at_utc are never updated by any Phase 4 code path and are
-- deliberately NOT included — party_reference in particular stays immutable after add/apply
-- (an update/apply may change ownership_percentage/sec_audit_ref, never the declared identity).
GRANT SELECT, INSERT ON clt1.authorised_party TO role_clt1_runtime;
GRANT UPDATE (
  identity_verification_status, sanctions_pep_status, authority_status, ownership_percentage,
  sec_audit_ref, last_screened_at_utc, screening_source_module, approval_id, version, updated_at_utc
) ON clt1.authorised_party TO role_clt1_runtime;

-- authorised_party_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what */apply legitimately mutates on an already-created request row (mirrors
-- authorised_user_decision_request's own grant shape exactly).
GRANT SELECT, INSERT ON clt1.authorised_party_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.authorised_party_decision_request TO role_clt1_runtime;

-- Phase 5 additions — related_party_edge: SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what Phase 5 code legitimately mutates after creation. from_entity_type/from_entity_id/
-- to_entity_type/to_entity_id/relationship_type/requested_by/created_at_utc are never updated by
-- any Phase 5 code path and are deliberately NOT included — node references and relationship_type
-- stay immutable after add/apply (update/apply may change only evidence_ref).
GRANT SELECT, INSERT ON clt1.related_party_edge TO role_clt1_runtime;
GRANT UPDATE (status, evidence_ref, approval_id, version, updated_at_utc) ON clt1.related_party_edge TO role_clt1_runtime;

-- related_party_edge_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what */apply legitimately mutates on an already-created request row (mirrors
-- authorised_party_decision_request's own grant shape exactly).
GRANT SELECT, INSERT ON clt1.related_party_edge_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.related_party_edge_decision_request TO role_clt1_runtime;

-- Phase 6 additions — duplicate_candidate: SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what Phase 6 code legitimately mutates after creation. subject_type/subject_ref/
-- matched_type/matched_ref/match_type/source_type/source_ref/match_score/requested_by/
-- created_at_utc are never updated by any Phase 6 code path and are deliberately NOT included —
-- node references and match_type stay immutable after create/apply (update/apply may change only
-- evidence_ref; confirm/dismiss apply may change only status/reviewed_by/reviewed_at_utc/
-- approval_id/version/updated_at_utc).
GRANT SELECT, INSERT ON clt1.duplicate_candidate TO role_clt1_runtime;
GRANT UPDATE (status, evidence_ref, reviewed_by, reviewed_at_utc, approval_id, version, updated_at_utc) ON clt1.duplicate_candidate TO role_clt1_runtime;

-- duplicate_candidate_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited to
-- exactly what */apply legitimately mutates on an already-created request row (mirrors
-- related_party_edge_decision_request's own grant shape exactly).
GRANT SELECT, INSERT ON clt1.duplicate_candidate_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.duplicate_candidate_decision_request TO role_clt1_runtime;

-- Phase 8 addition — client_profile gets its FIRST-EVER UPDATE grant, column-scoped to exactly
-- status/version/updated_at_utc (client_id/application_id/applicant_type/legal_name/
-- registration_number/country_of_incorporation/client_class/created_at_utc are all set once at
-- INSERT time by approve/apply and are deliberately NOT included). This also newly enables
-- `SELECT ... FOR UPDATE` locking on client_profile (Postgres requires the UPDATE privilege for
-- row locking even on a read-only lock) — Phase 8 is the first code that actually mutates this
-- table, so the lock is both permitted and appropriate here, unlike the Phase 3 precedent where a
-- lock-only read had to fall back to a plain SELECT.
GRANT UPDATE (status, version, updated_at_utc) ON clt1.client_profile TO role_clt1_runtime;

-- client_profile_lifecycle_decision_request — SELECT, INSERT, and a column-scoped UPDATE limited
-- to exactly what */apply legitimately mutates on an already-created request row (mirrors every
-- prior decision-request grant exactly). client_id/decision_type/reason/evidence_ref/
-- requested_by/payload_hash are set once at request time and are deliberately NOT included here.
GRANT SELECT, INSERT ON clt1.client_profile_lifecycle_decision_request TO role_clt1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_at_utc) ON clt1.client_profile_lifecycle_decision_request TO role_clt1_runtime;

-- foundation.outbox_event — INSERT ONLY. CLT-01's first (and only) cross-schema grant, needed
-- because Phase 1 was the first phase that calls publishAudit
-- (services/clt1/src/routes/applications.ts).
GRANT USAGE ON SCHEMA foundation TO role_clt1_runtime;
GRANT INSERT ON foundation.outbox_event TO role_clt1_runtime;

-- Explicit: NO DELETE/TRUNCATE grant on any clt1 table, anywhere, ever. NO UPDATE grant on
-- client_classification_evidence, consent_record, or cdd_outcome/handoff_status — INCLUDING
-- cdd_outcome.kyc_roster_hash (Phase 4A.1): it is INSERT-time-only immutable historical evidence,
-- exactly like every other cdd_outcome column; no UPDATE grant of any kind exists on this table,
-- and Phase 4A.1 does not add one. client_profile's own UPDATE grant (Phase 8) is column-scoped to
-- status/version/updated_at_utc only — no UPDATE on legal_name/registration_number/
-- country_of_incorporation/client_class anywhere. NO UPDATE on
-- user_reference/party_reference/requested_by/payload_hash/created_at_utc anywhere.
-- NO `foundation.idempotency_record` grant. NO grant into `iam2`, `sec1`, or `cfg1` — CLT-01
-- reaches CFG-01 and IAM-02 only over HTTP (services/clt1/src/lib/cfg1-client.ts, services/clt1/
-- src/lib/iam2-client.ts), never via a direct SQL grant into either schema. Asserted by the
-- grant-boundary tests in tests/integration/clt1-db.test.ts.
