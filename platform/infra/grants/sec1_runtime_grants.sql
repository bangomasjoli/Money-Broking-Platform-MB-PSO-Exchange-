-- SEC-01 §05.1 Database Design Database-Level Isolation Baseline.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and
-- runtime role differ, mirroring infra/grants/fnd_runtime_grants.sql /
-- iam_runtime_grants.sql / iam2_runtime_grants.sql convention). This role reaches only the
-- `sec1` schema plus the narrow approved `foundation` interface; it is granted NOTHING in
-- `iam`, `iam2`, or any other module schema.
--
-- Idempotent: safe to re-run.
--
-- PER-TABLE GRANT RATIONALE (C1 lesson applied from day one — grant exactly what THIS STAGE's
-- Phase 2 ingestion code (services/sec1/src/lib/ingest.ts, lib/stream.ts, lib/schema-registry.ts)
-- actually does, not a blanket SELECT/INSERT/UPDATE on every table in the schema):
--   - sec1.audit_event — SELECT, INSERT ONLY. NO UPDATE, NO DELETE, EVER. This is THE
--     append-only-enforcement mechanism for SEC-01's authoritative audit store (05_Database_
--     Design.md §1 rule 4 / 09_Error_Handling.md's "audit deletion/modification prohibited"
--     blocking-failure gate) — enforced by simply never granting UPDATE/DELETE to the runtime
--     role, not by an application-only check that a bug or a future code change could bypass.
--     SELECT is needed for the duplicate-vs-conflict re-check under the (source_module,
--     event_id) unique constraint (lib/ingest.ts).
--   - sec1.event_schema — SELECT ONLY. Phase 2 only reads the registry to validate an
--     incoming event_type/mandatory fields; no schema-management API is built this pass.
--   - sec1.audit_stream — SELECT, INSERT, UPDATE. INSERT for the idempotent "create stream
--     row if it doesn't exist yet" step; UPDATE to advance latest_sequence_no/latest_hash
--     AFTER an audit_event insert is confirmed to have landed (lib/stream.ts). No DELETE —
--     a stream's pointer is never removed.
--   - sec1.audit_seal_batch — SELECT, INSERT. The internal seal stub (lib/seal.ts) reads a
--     stream's event_hash values over a sequence range (SELECT) and inserts exactly one new
--     seal-batch row (INSERT) per invocation. (P3-L3: Phase 0-2 had no UPDATE grant on this
--     table yet — the real verification job that flips verification_status is a Phase 3
--     addition; see the narrowly-scoped column-level UPDATE grant added further down this
--     file, under "Phase 3 additions".)
--   - sec1.source_identity_binding — SELECT ONLY. The source-identity guard
--     (plugins/source-identity.ts) resolves a presented bearer token against active bindings;
--     no binding-management API is built this pass (bindings are migration-seeded only).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_sec1_runtime') THEN
    CREATE ROLE role_sec1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the sec1 schema only.
GRANT USAGE ON SCHEMA sec1 TO role_sec1_runtime;

GRANT SELECT, INSERT ON sec1.audit_event TO role_sec1_runtime;
GRANT SELECT ON sec1.event_schema TO role_sec1_runtime;
GRANT SELECT, INSERT, UPDATE ON sec1.audit_stream TO role_sec1_runtime;
GRANT SELECT, INSERT ON sec1.audit_seal_batch TO role_sec1_runtime;
GRANT SELECT ON sec1.source_identity_binding TO role_sec1_runtime;

-- ---------------------------------------------------------------------------------------
-- SEC-01 GRANT EXCEPTION (explicit, documented, and — per the approved task brief — UNIQUE
-- to SEC-01; no other runtime role should ever receive this pattern): role_sec1_runtime is
-- the only runtime role in this codebase granted SELECT + UPDATE (NOT INSERT, NOT DELETE) on
-- `foundation.outbox_event`. Every OTHER module's runtime role has (and keeps) INSERT-ONLY on
-- this table (the C1-tightened append-only audit/outbox contract — see
-- infra/grants/iam_runtime_grants.sql's own C1 comment). SEC-01 is the sole EXCEPTION because
-- it is the authoritative audit CONSUMER: a future outbox consumer (documented as deferred
-- "Phase 2b" in docs/implementation/SEC-01_IMPLEMENTATION_NOTES.md — not built this pass) would
-- need to SELECT pending `topic='audit.event'` rows and UPDATE their status to mark them
-- consumed, exactly the same shape of narrow, purpose-built exception this codebase has
-- already used once before (IAM-02's `iam2.fn_count_active_role_assignments` SECURITY DEFINER
-- escape hatch is a different mechanism, but the SAME "one clearly-justified, narrowly-scoped
-- exception, never a blanket grant" discipline). This grant is added NOW (Phase 1) even though
-- the consumer itself is deferred, so a later phase that DOES build it needs no further
-- grants-file patch — mirrors IAM-02's own precedent of adding the idempotency_record grant a
-- phase before any code call site existed yet.
GRANT USAGE ON SCHEMA foundation TO role_sec1_runtime;
GRANT SELECT, UPDATE ON foundation.outbox_event TO role_sec1_runtime;

-- foundation.idempotency_record — SEC-01 is simply the next module using the existing C2
-- source_module-scoped RLS pattern (infra/migrations/005_fnd_idempotency_module_scope.cjs).
-- Full SELECT/INSERT/UPDATE cycle, identical shape to every other module's grant on this
-- table; `source_module` + FORCE RLS (not the grant) is what isolates SEC-01's own
-- idempotency rows from every other module's (sourceModule: "SEC-01" in every
-- beginIdempotent/completeIdempotent call site — services/sec1/src/routes/internal.ts).
GRANT SELECT, INSERT, UPDATE ON foundation.idempotency_record TO role_sec1_runtime;

-- Explicit: NO blanket grant into `iam`, `iam2`, or any other module schema. role_sec1_runtime
-- must never be able to read/write iam.*/iam2.* generically — SEC-01 ingests audit events
-- through its own ingestion API/outbox only, never via direct cross-schema SQL. Asserted by
-- the F3(a)-equivalent test in tests/integration/sec1-db.test.ts.

-- ---------------------------------------------------------------------------------------
-- Phase 3 additions (migration 009_sec1_integrity_verification.cjs).
-- ---------------------------------------------------------------------------------------
-- sec1.integrity_verification_run — SELECT, INSERT only. runIntegrityVerification
-- (lib/integrity.ts) reads a stream's audit_event rows (already covered by the audit_event
-- SELECT grant above) and inserts exactly one new run row per invocation. No UPDATE/DELETE —
-- a persisted verification run is itself an append-only record of what was checked and when.
GRANT SELECT, INSERT ON sec1.integrity_verification_run TO role_sec1_runtime;

-- sec1.audit_seal_batch — a narrowly-scoped COLUMN-LEVEL UPDATE grant, NOT a blanket
-- table-level UPDATE. verifySealBatch (lib/seal.ts) flips ONLY verification_status to
-- 'valid'/'failed' after recomputing and comparing the batch hash; it must never be able to
-- write seal_method/external_anchor_ref/trusted_timestamp_ref (that would let an internal
-- verification "promote" a seal to look externally anchored — exactly what this phase must
-- not do). Postgres supports column-level UPDATE grants; using one here is the narrowest
-- practical grant, matching the brief's own instruction, rather than granting UPDATE on the
-- whole table and relying on application code alone to restrict which columns it touches.
GRANT UPDATE (verification_status) ON sec1.audit_seal_batch TO role_sec1_runtime;

-- ---------------------------------------------------------------------------------------
-- Phase 4 additions (migration 010_sec1_sensitive_read_log.cjs).
-- ---------------------------------------------------------------------------------------
-- sec1.sensitive_read_log — SELECT, INSERT only. lib/sensitive-read-log.ts writes exactly one
-- row per request that discloses sensitive-tier audit data; no UPDATE/DELETE, ever — same
-- append-only posture as sec1.audit_event (05_Database_Design.md §1 rule 4), enforced by
-- simply never granting UPDATE/DELETE, not by an application-only check. SELECT is granted for
-- symmetry with every other append-only table in this file (audit_event, audit_seal_batch,
-- integrity_verification_run) even though Phase 4's own read routes do not currently query
-- this table back.
GRANT SELECT, INSERT ON sec1.sensitive_read_log TO role_sec1_runtime;

-- No grant changes into iam2.* — SEC-01's Phase 4 read/search routes reach IAM-02's permission
-- guard ONLY over HTTP (services/sec1/src/lib/iam2-client.ts calling the already-accepted
-- POST /internal/iam2/permission/check), never via direct SQL. role_sec1_runtime remains
-- exactly as isolated from iam2.* as it was before Phase 4 — re-verified by the same
-- F3(a)-equivalent test in tests/integration/sec1-db.test.ts.

-- ---------------------------------------------------------------------------------------
-- Phase 5 additions (migration 012_sec1_monitoring_alerts.cjs).
-- ---------------------------------------------------------------------------------------
-- sec1.security_monitoring_rule — SELECT ONLY. Migration-seeded catalogue; no rule-management
-- API is built this phase (see migration 012's own header comment), so the runtime role never
-- needs to write this table.
GRANT SELECT ON sec1.security_monitoring_rule TO role_sec1_runtime;

-- sec1.monitoring_dead_letter — SELECT, INSERT, UPDATE. INSERT on a rule-evaluation (or
-- verification-failure alert-creation) failure; UPDATE for retry_count/status/
-- next_retry_at_utc/failure_reason on a later replay attempt (lib/monitoring-dead-letter.ts).
-- No DELETE — a dead-letter row is never removed, only transitioned to 'replayed'/'escalated'.
GRANT SELECT, INSERT, UPDATE ON sec1.monitoring_dead_letter TO role_sec1_runtime;

-- sec1.security_alert — SELECT, INSERT, UPDATE. A DELIBERATE departure from the append-only
-- posture governing audit_event/sensitive_read_log/integrity_verification_run: an alert is a
-- LIVE lifecycle row (status/assigned_to/closed_at_utc/closure_reason/closure_evidence_ref
-- legitimately change over its open->assigned->triaged->{closed,escalated} lifecycle), the same
-- class of table as sec1.audit_stream (SELECT/INSERT/UPDATE, no DELETE), not the same class as
-- audit_event. The append-only EVIDENCE trail for what happened to an alert lives in
-- alert_triage_note (below), never in an edited security_alert row. No DELETE, ever.
GRANT SELECT, INSERT, UPDATE ON sec1.security_alert TO role_sec1_runtime;

-- sec1.alert_triage_note — SELECT, INSERT only. One new row per triage action
-- (lib/alerts.ts); append-only, same posture as sensitive_read_log/integrity_verification_run.
-- No UPDATE/DELETE, ever.
GRANT SELECT, INSERT ON sec1.alert_triage_note TO role_sec1_runtime;

-- No grant changes into iam2.* — SEC-01's Phase 5 alert-lifecycle routes reach IAM-02's
-- permission guard AND its approval/execute-verify endpoints ONLY over HTTP
-- (services/sec1/src/lib/iam2-client.ts, extended this phase with verifyDecisionToken;
-- services/iam2/src/routes/internal.ts and routes/approvals.ts are unchanged), never via direct
-- SQL. role_sec1_runtime remains exactly as isolated from iam2.* as it was before Phase 5 —
-- re-verified by the same F3(a)-equivalent test in tests/integration/sec1-db.test.ts.
