-- KYC-01 §05-equivalent Database-Level Isolation Baseline — Phase 1.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and runtime
-- role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql /
-- iam2_runtime_grants.sql / sec1_runtime_grants.sql / cfg1_runtime_grants.sql /
-- clt1_runtime_grants.sql / aml1_runtime_grants.sql convention). Must be applied AFTER
-- infra/migrations/042_kyc1_core.cjs (the tables must exist first). This role reaches only the
-- `kyc1` schema plus `foundation.outbox_event` (INSERT-only, for publishAudit) — it is granted
-- NOTHING in `iam`, `iam2`, `sec1`, `cfg1`, `clt1`, or `aml1`.
--
-- STALE-COMMENT FIX (Phase 3B, INFO-18 closure): as of Phase 2B, KYC-01 DOES have an HTTP
-- dependency on CLT-01 (`lib/clt1-client.ts`, outcome delivery); as of Phase 3A, it also has one on
-- IAM-02 (`lib/iam2-client.ts`, permission check + Phase 3B's own execute-verify). Both are reached
-- EXCLUSIVELY over HTTP, using their own internal-service-token shared secrets
-- (`CLT1_INTERNAL_SERVICE_TOKEN`/`IAM02_INTERNAL_SERVICE_TOKEN` in `services/kyc1/src/config.ts`)
-- — this grant file's own posture is UNCHANGED by either dependency: `role_kyc1_runtime` still has
-- ZERO direct SQL grant into `clt1`, `iam2`, or any other module's schema, and never will. "No
-- cross-module HTTP dependency" (the original Phase 1 claim) is corrected to "no cross-module
-- DIRECT SQL GRANT" — the actual, permanent invariant every module in this codebase maintains,
-- reached over HTTP only.
--
-- PHASE 1 GRANT RATIONALE — least privilege applied from day one, mirroring every prior module's
-- own Phase 1 grant-file precedent (grant exactly what THIS STAGE's code actually does):
--
--   kyc_case — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the fields the
--   deterministic Phase 1 lifecycle legitimately mutates after creation (status transitions
--   pending_documents -> completed/remediation, current_outcome_status/current_outcome_id updated
--   alongside each compute-outcome call, updated_at_utc bumped). `case_id`/`application_id`/
--   `client_id`/`party_id`/`case_type`/`created_from_handoff_id`/`created_at_utc` are all set ONCE
--   at INSERT time and are deliberately NOT included in the UPDATE grant.
--
--   document_checklist_item — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields the evidence/verification-result routes legitimately mutate after creation (status
--   transitions missing -> received -> verified/rejected -> expired; evidence_ref/evidence_hash/
--   expiry_date attached on receipt; verification_result_id attached on verification).
--   `checklist_item_id`/`case_id`/`document_type`/`required`/`created_at_utc` are all set ONCE at
--   INSERT time and are deliberately NOT included in the UPDATE grant.
--
--   verification_result — SELECT, INSERT ONLY. Append-only from Phase 1 code's perspective: a
--   verification result is a point-in-time finding, never edited after the fact (mirrors AML-01's
--   own `screening_result`/`screening_match` immutability posture) — no UPDATE grant, ever.
--
--   cdd_outcome — SELECT, INSERT ONLY. Append-VERSIONED (blueprint's own "CDD outcome is
--   append-versioned" rule) — a new compute-outcome call always INSERTs a new row with an
--   incremented `outcome_version`, never UPDATEs an existing one — no UPDATE grant, ever.
--
--   foundation.outbox_event — INSERT ONLY, the standard C1-tightened append-only audit/outbox
--   contract every audited module has. KYC-01's only cross-schema grant.
--
--   No `foundation.idempotency_record` grant — KYC-01 Phase 1 has no proven Idempotency-Key
--   pattern of its own yet (duplicate-case prevention is enforced by the partial unique index on
--   `kyc_case` instead — see migration 042's own header comment), same posture AML-01's own
--   Phase 1 screening-request POST took for the identical reason.
--
-- PHASE 2A GRANT EXTENSION — must be applied AFTER infra/migrations/043_kyc1_outcome_publication.cjs.
--
--   outcome_publication — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields the publish route's own supersede-then-insert lifecycle legitimately mutates after
--   creation (pending -> succeeded/failed in Phase 2B, or -> superseded when a later publish call
--   for the same application supersedes this row). `publication_id`/`application_id`/
--   `aggregate_status`/`contributing_case_ids`/`contributing_outcome_ids`/`payload_hash`/
--   `requested_by`/`request_id`/`correlation_id`/`created_at_utc` are all set ONCE at INSERT time
--   and are deliberately NOT included in the UPDATE grant — mirrors AML-01's own
--   `clt_outcome_delivery` grant shape exactly (`infra/grants/aml1_runtime_grants.sql`) for the
--   identical two-phase-delivery-evidence table pattern. Still no `foundation.idempotency_record`
--   grant — the partial unique index on `outcome_publication` (migration 043) plus the publish
--   route's own supersede-before-insert step are the duplicate-prevention mechanism, the same
--   posture the Phase 1 `kyc_case` grant already established for the identical reason.
--
-- PHASE 3B GRANT EXTENSION — must be applied AFTER infra/migrations/045_kyc1_manual_override_request.cjs.
--
--   manual_override_request — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   fields the apply route legitimately mutates after creation (`requested` -> `applied`/`failed`).
--   `override_id`/`case_id`/`target_type`/`target_outcome_status`/`reason_code`/
--   `approved_against_outcome_id`/`approved_against_outcome_status`/`requested_by`/`payload_hash`/
--   `request_id`/`correlation_id`/`created_at_utc` are all set ONCE at INSERT time and are
--   deliberately NOT included in the UPDATE grant — mirrors every prior maker-checker table's own
--   grant shape in this codebase (`aml1.match_disposition_decision_request`, `infra/grants/
--   aml1_runtime_grants.sql`). MED-3 fix (migration 045): `approved_against_outcome_id`/
--   `approved_against_outcome_status` are the exact case-outcome snapshot an override's approval
--   was granted against — immutable for the identical reason every other request-time-only column
--   on this table is: mutating them after INSERT would let the row's own approval-binding record be
--   rewritten out from under the very check that uses it. `status` now also reaches `failed`
--   (MED-3's own case-state-drift refusal path) — the UPDATE grant still covers `status`
--   generically rather than being narrowed further, since a future phase writing `cancelled` needs
--   no grant change to do so, the same D6-style forward-compatibility posture migration 043
--   established for `outcome_publication.status`.
--
--   cdd_outcome — UNCHANGED from Phase 1 (SELECT, INSERT ONLY, no UPDATE grant, ever). The
--   override apply route INSERTs a new row exactly like `compute-outcome` already does — it never
--   needs, and is never granted, UPDATE on this table. Append-VERSIONED, not append-then-mutate.
--
--   kyc_case — UNCHANGED from Phase 1's own UPDATE grant
--   (`status, current_outcome_status, current_outcome_id, updated_at_utc`). The override apply
--   route writes exactly the same four columns `compute-outcome` already writes, via the same
--   `caseStatusForOutcome` helper — no widening required.
--
--   Still no `foundation.idempotency_record` grant — the `one_open_per_case` partial unique index
--   on `manual_override_request` (migration 045) plus the request route's own
--   `pg_advisory_xact_lock`-serialized check-then-insert are the duplicate-prevention mechanism,
--   the same posture every prior "at most one active row" table in this schema already uses.
--
--   Still NO direct SQL grant into `iam2` — execute-verify (Phase 3B's own addition to
--   `lib/iam2-client.ts`) is reached over HTTP exactly like `permission/check` already was.
--
-- PHASE 4B ADDITION (infra/migrations/048_kyc1_publication_roster_binding.cjs) — NO grant
-- statement change on this file. The five new `outcome_publication` columns (`roster_hash`,
-- `required_party_count`, `evaluated_party_count`, `contributing_party_ids`,
-- `roster_fetched_at_utc`) are covered automatically by the EXISTING table-level, non-column-scoped
-- `GRANT ... INSERT ON kyc1.outcome_publication` below — Postgres does not require re-granting
-- INSERT when a table gains a new column. They are deliberately NOT added to the existing
-- column-scoped UPDATE grant on this table (`status, attempt_count, failure_reason_code,
-- response_ref, delivered_at_utc, version`) — all five are INSERT-once publication evidence,
-- immutable for the exact same reason `contributing_case_ids`/`contributing_outcome_ids`/
-- `payload_hash` already are on this table. Verified directly (not merely asserted) by the
-- grant-boundary tests in tests/integration/kyc1-db.test.ts: `role_kyc1_runtime` can INSERT a new
-- publication carrying all five fields, but every attempted UPDATE of any one of them is rejected.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_kyc1_runtime') THEN
    CREATE ROLE role_kyc1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the kyc1 schema only.
GRANT USAGE ON SCHEMA kyc1 TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.kyc_case TO role_kyc1_runtime;
GRANT UPDATE (status, current_outcome_status, current_outcome_id, updated_at_utc)
  ON kyc1.kyc_case TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.document_checklist_item TO role_kyc1_runtime;
GRANT UPDATE (status, evidence_ref, evidence_hash, expiry_date, verification_result_id, updated_at_utc)
  ON kyc1.document_checklist_item TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.verification_result TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.cdd_outcome TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.outcome_publication TO role_kyc1_runtime;
GRANT UPDATE (status, attempt_count, failure_reason_code, response_ref, delivered_at_utc, version)
  ON kyc1.outcome_publication TO role_kyc1_runtime;

GRANT SELECT, INSERT ON kyc1.manual_override_request TO role_kyc1_runtime;
GRANT UPDATE (status, approval_id, decision_token_hash, applied_outcome_id, applied_at_utc)
  ON kyc1.manual_override_request TO role_kyc1_runtime;

-- foundation.outbox_event — INSERT ONLY. KYC-01's first (and only) cross-schema grant, needed
-- because Phase 1 is the first phase that calls publishAudit (services/kyc1/src/lib/*.ts).
GRANT USAGE ON SCHEMA foundation TO role_kyc1_runtime;
GRANT INSERT ON foundation.outbox_event TO role_kyc1_runtime;

-- Explicit: NO DELETE/TRUNCATE grant on any kyc1 table, anywhere, ever. NO UPDATE grant on
-- verification_result or cdd_outcome — both stay immutable after insert, forever, even from the
-- Phase 3B override apply route (which INSERTs, never UPDATEs, `cdd_outcome`). kyc_case's own
-- UPDATE grant is column-scoped to status/current_outcome_status/current_outcome_id/updated_at_utc
-- only; document_checklist_item's own UPDATE grant is column-scoped to status/evidence_ref/
-- evidence_hash/expiry_date/verification_result_id/updated_at_utc only; outcome_publication's own
-- UPDATE grant is column-scoped to status/attempt_count/failure_reason_code/response_ref/
-- delivered_at_utc/version only; manual_override_request's own UPDATE grant is column-scoped to
-- status/approval_id/decision_token_hash/applied_outcome_id/applied_at_utc only — override_id/
-- case_id/target_type/target_outcome_status/reason_code/approved_against_outcome_id/
-- approved_against_outcome_status/requested_by/payload_hash/request_id/correlation_id/
-- created_at_utc are all set ONCE at INSERT time and are NOT UPDATE-granted (the MED-3 fix's own
-- approved_against_outcome_id/approved_against_outcome_status columns included). NO
-- `foundation.idempotency_record` grant. NO grant into `iam2`, `sec1`, `cfg1`, `clt1`, `aml1`, or
-- `iam` — KYC-01 reaches no other module by direct SQL grant, only ever over HTTP (Phase 2B's
-- CLT-01 client, Phase 3A/3B's IAM-02 client). Asserted by the grant-boundary tests in
-- tests/integration/kyc1-db.test.ts.
