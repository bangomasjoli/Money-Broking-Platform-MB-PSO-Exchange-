-- WLT-01 §05-equivalent Database-Level Isolation Baseline — Phase 1B.
--
-- Applied by a PRIVILEGED role, separately from the table migration (migration role and runtime
-- role differ, mirroring infra/grants/fnd_runtime_grants.sql / iam_runtime_grants.sql /
-- iam2_runtime_grants.sql / sec1_runtime_grants.sql / cfg1_runtime_grants.sql /
-- clt1_runtime_grants.sql / aml1_runtime_grants.sql / kyc1_runtime_grants.sql convention). Must be
-- applied AFTER infra/migrations/049_wlt1_core.cjs (the tables must exist first). This role reaches
-- only the `wlt1` schema plus `foundation.outbox_event`/`foundation.idempotency_record` — it is
-- granted NOTHING in `iam`, `iam2`, `sec1`, `cfg1`, `clt1`, `kyc1`, or `aml1`. WLT-01's one
-- cross-module dependency this phase (CLT-01's client-status check) is reached EXCLUSIVELY over
-- HTTP (`services/wlt1/src/lib/clt1-client.ts`), never via direct SQL grant.
--
-- PHASE 1B GRANT RATIONALE — least privilege applied from day one, mirroring every prior module's
-- own Phase 1 grant-file precedent (grant exactly what THIS STAGE's code actually does):
--
--   destination — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the fields a
--   later lifecycle phase will legitimately mutate (status/version/epoch counters +
--   updated_at_utc). No Phase 1B code path actually reaches this UPDATE grant yet (no
--   revocation/whitelist/limit workflow exists) — granted now, exactly as AML-01/KYC-01/CLT-01
--   each granted a table's eventual UPDATE columns ahead of the phase that first uses them, so a
--   later phase needs no further grants-file patch for this table. `destination_id`/`client_id`/
--   `destination_type`/`natural_key_hash`/`created_at_utc` are all set ONCE at INSERT time and are
--   deliberately NOT included in the UPDATE grant — immutable identity, enforced at the grant
--   level, not merely by application discipline.
--
--   wallet_destination — SELECT, INSERT ONLY. Every column is set once at INSERT time (chain,
--   network, canonical_address, address_hash, memo_tag_identity, canonicalisation_version,
--   wallet_type, beneficiary_relationship) — no UPDATE grant, ever. Correction of any of these
--   fields is revoke-and-replace (a NEW destination_id), never an in-place edit.
--
--   address_integrity_check — SELECT, INSERT ONLY. Append-only evidence, including refused
--   registrations — a row is a point-in-time integrity finding, never edited after the fact
--   (mirrors AML-01's own screening_result/screening_match immutability posture).
--
--   chain_coverage — SELECT ONLY. Deny-by-default registry; the two Phase 1B seed rows are
--   written exclusively by migration 049 under the migration role, never by the runtime role. No
--   INSERT/UPDATE/DELETE grant — WLT-01 runtime code can read this table but can never widen its
--   own chain/network coverage. Migration 050 added `provider_id`, backfilled exclusively by that
--   migration under the migration role — runtime privilege on this table remains SELECT-only,
--   unchanged; the runtime role can never widen its own provider coverage either.
--
--   PHASE 2B ADDITIONS (persistence/configuration foundation only — no Phase 2B route reaches
--   either grant below yet; granted now, exactly as this file's own Phase 1B `destination` UPDATE
--   grant was granted ahead of the phase that first used it):
--
--   wallet_screening_result — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   terminal-evidence columns a future Phase 2C pending-to-terminal transition will fill.
--   Identity/correlation columns (id/screening_result_id/destination_id/screening_result_version/
--   provider_id/provider_adaptor_version/chain/network/address_hash/created_at_utc) are bound
--   ONCE at INSERT time and are deliberately NOT included in the UPDATE grant — immutable
--   identity, enforced at the grant level, mirroring `destination`'s own column-scoping
--   discipline.
--
--   vendor_result_inbox — SELECT, INSERT, and a column-scoped UPDATE limited to
--   processing_status/rejection_reason_code/updated_at_utc only. Every identity/receipt-evidence
--   column (id/inbox_id/provider_id/provider_result_id/destination_id/screening_result_id/
--   result_type/payload_hash/source_authenticated/received_at_utc) is set ONCE at INSERT time —
--   a receipt's own evidence must never be editable after the fact, only its processing outcome.
--
--   PHASE 3A-1 ADDITION (foundation only — no Phase 3A-2/3A-3 challenge/verify route reaches
--   either grant below yet; granted now, exactly as this file's own Phase 1B/2B additions were
--   granted ahead of the phase that first used them):
--
--   proof_of_control — SELECT, INSERT, and a column-scoped UPDATE limited to exactly the
--   verification-lifecycle columns a future Phase 3A-2/3A-3 challenge/verify route will
--   legitimately mutate (verification_status/attempt_count/signature_hash/recovered_address/
--   last_failure_reason_code/verified_at_utc/updated_at_utc). Every identity/snapshot column
--   (challenge_id/destination_id/client_id/chain/network/canonical_address/address_hash/
--   proof_method/verification_scheme/message_format_version/domain_environment/nonce/
--   message_hash/issued_at_utc/expires_at_utc/created_at_utc) is set ONCE at INSERT time and is
--   deliberately NOT included in the UPDATE grant — immutable identity/challenge evidence,
--   enforced at the grant level, mirroring `vendor_result_inbox`'s own column-scoping discipline.
--
--   foundation.outbox_event — INSERT ONLY, the standard C1-tightened append-only audit/outbox
--   contract every audited module has. WLT-01's audit publisher (`publishAudit`) needs no more.
--
--   foundation.idempotency_record — full SELECT/INSERT/UPDATE cycle (the accepted
--   `beginIdempotent`/`completeIdempotent` contract, same shape as every other module using this
--   shared helper — SEC-01/IAM-01/IAM/FND-01). `source_module` + FORCE RLS
--   (infra/migrations/005_fnd_idempotency_module_scope.cjs), not this table-level grant, is what
--   isolates WLT-01's own idempotency rows from every other module's — every
--   beginIdempotent/completeIdempotent call site in this service passes `sourceModule: "WLT-01"`.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_wlt1_runtime') THEN
    CREATE ROLE role_wlt1_runtime NOLOGIN;
  END IF;
END
$$;

-- Least privilege: usage on the wlt1 schema only.
GRANT USAGE ON SCHEMA wlt1 TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.destination TO role_wlt1_runtime;
-- Phase 4A-1 addition: cooling_off_until_utc/whitelist_approval_ref, set by approve/apply.
GRANT UPDATE (status, destination_status_version, whitelist_version, revocation_epoch, limits_version, client_status_ref, cooling_off_until_utc, whitelist_approval_ref, updated_at_utc)
  ON wlt1.destination TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.wallet_destination TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.address_integrity_check TO role_wlt1_runtime;

GRANT SELECT ON wlt1.chain_coverage TO role_wlt1_runtime;

-- Phase 2B additions.
GRANT SELECT, INSERT ON wlt1.wallet_screening_result TO role_wlt1_runtime;
GRANT UPDATE (risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref, payload_hash, provider_result_id, source_authenticated, issued_at_utc, valid_until_utc, updated_at_utc)
  ON wlt1.wallet_screening_result TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.vendor_result_inbox TO role_wlt1_runtime;
GRANT UPDATE (processing_status, rejection_reason_code, updated_at_utc)
  ON wlt1.vendor_result_inbox TO role_wlt1_runtime;

-- Phase 3A-1 addition.
GRANT SELECT, INSERT ON wlt1.proof_of_control TO role_wlt1_runtime;
GRANT UPDATE (verification_status, attempt_count, signature_hash, recovered_address, last_failure_reason_code, verified_at_utc, updated_at_utc)
  ON wlt1.proof_of_control TO role_wlt1_runtime;

-- Phase 4A-2 addition: destination_decision is SELECT+INSERT ONLY, deliberately no UPDATE grant.
-- Every column (including status) is set once at INSERT time; Phase 4A-3's future read-only verify
-- route is supportable by SELECT alone, and Phase 4B will later own whatever UPDATE grant a real
-- consume operation needs. No DELETE, ever.
GRANT SELECT, INSERT ON wlt1.destination_decision TO role_wlt1_runtime;

-- Phase 4B addition: verify-and-consume single-use consumption. Column-scoped UPDATE limited to
-- EXACTLY the four consumption-lifecycle columns migration 058 added (status/consumed_at_utc/
-- consumption_id/execution_ref) — every identity/evidence/binding column set at issuance
-- (decision_id, token_hash, client_id, destination_id, requested_action, decision,
-- aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
-- destination_status_version, whitelist_version, revocation_epoch, chain, network, issued_at_utc,
-- expires_at_utc, created_at_utc) remains NOT UPDATE-granted, immutable forever. Still no DELETE,
-- no TRUNCATE.
GRANT UPDATE (status, consumed_at_utc, consumption_id, execution_ref)
  ON wlt1.destination_decision TO role_wlt1_runtime;

-- Limits / Velocity / Concentration / First-Use addition: wlt1.destination_limit_profile is
-- SELECT-ONLY for the runtime role — Model A, load-bearing. Policy is IMMUTABLE VERSIONED
-- evidence, provisioned exclusively by controlled schema-owner activity; the runtime role can
-- never INSERT, UPDATE, DELETE, or TRUNCATE a policy row, structurally enforcing that runtime
-- limit evaluation can never itself author or mutate the policy it is evaluated against.
GRANT SELECT ON wlt1.destination_limit_profile TO role_wlt1_runtime;

-- wlt1.limit_evaluation is SELECT+INSERT ONLY, an append-only evidence journal that doubles as
-- the velocity accounting source (SUM(amount) WHERE result_status='pass') — no UPDATE grant,
-- ever (every column is set once at INSERT time), no DELETE, no TRUNCATE.
GRANT SELECT, INSERT ON wlt1.limit_evaluation TO role_wlt1_runtime;

-- Destination Revocation + AML Revocation Signal Ingestion addition: wlt1.destination_revocation
-- is SELECT+INSERT ONLY, an append-only evidence table — no UPDATE grant, ever (every column is
-- set once at INSERT time). No grant change on `wlt1.destination` itself — its own existing
-- column-scoped UPDATE grant above already covers status/revocation_epoch/
-- destination_status_version/updated_at_utc, the exact columns revocation mutates.
GRANT SELECT, INSERT ON wlt1.destination_revocation TO role_wlt1_runtime;

-- Ongoing Rescreening addition: rescreening_run is SELECT+INSERT+column-scoped-UPDATE. Identity/
-- provenance columns (run_id/scope/requested_by/target_destination_id/request_id/correlation_id/
-- started_at_utc) are set ONCE at INSERT time and are deliberately NOT UPDATE-granted — immutable
-- forever, same discipline as every other table in this file. UPDATE is limited to exactly the
-- lifecycle/counter columns Phase B and finalize legitimately mutate. No DELETE, no TRUNCATE.
GRANT SELECT, INSERT ON wlt1.rescreening_run TO role_wlt1_runtime;
GRANT UPDATE (status, candidates_selected, rescreened_clear, rescreened_adverse, revocations_triggered, skipped, failures, completed_at_utc)
  ON wlt1.rescreening_run TO role_wlt1_runtime;

-- Fiat Payout Destinations (APAC) addition.
--
-- fiat_payout_destination — SELECT, INSERT, and a column-scoped UPDATE limited to EXACTLY
-- verification_status/updated_at_utc — every beneficiary/account identity column (beneficiary_
-- name/beneficiary_name_normalized/beneficiary_type/bank_country/bank_identifier/
-- bank_identifier_type/branch_identifier/account_identifier_type/account_identifier_masked/
-- account_identifier_hash/account_identifier_encrypted/currency/rail) is set ONCE at INSERT time
-- and is deliberately NOT UPDATE-granted — a material beneficiary/account change is
-- revoke-and-register-new, never an in-place edit (mirrors wallet_destination's own immutability
-- discipline).
--
-- fiat_rail_coverage — SELECT ONLY. Deny-by-default registry; the four dormant seed rows are
-- written exclusively by migration 061 under the migration role. No INSERT/UPDATE/DELETE grant —
-- the runtime role can read corridor technical-support/activation state but can never activate a
-- corridor itself.
--
-- beneficiary_verification / fiat_screening_result — SELECT, INSERT ONLY. Append-only, versioned
-- evidence, same discipline as wallet_screening_result/proof_of_control's own identity columns —
-- no UPDATE grant on either table, ever.
GRANT SELECT, INSERT ON wlt1.fiat_payout_destination TO role_wlt1_runtime;
GRANT UPDATE (verification_status, updated_at_utc) ON wlt1.fiat_payout_destination TO role_wlt1_runtime;

GRANT SELECT ON wlt1.fiat_rail_coverage TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.beneficiary_verification TO role_wlt1_runtime;

GRANT SELECT, INSERT ON wlt1.fiat_screening_result TO role_wlt1_runtime;

-- destination_decision's own existing grants (SELECT+INSERT, plus the Phase 4B column-scoped
-- UPDATE on status/consumed_at_utc/consumption_id/execution_ref) are UNCHANGED — migration 061's
-- new destination_type/rail/currency/beneficiary_verification_id columns are INSERT-time
-- immutable, exactly like every other issuance-time column already covered above; no grant change
-- was needed merely because new columns exist.

-- Evidence Export addition: wlt1.evidence_export is SELECT+INSERT ONLY, an append-only,
-- integrity-hashed evidentiary export table — no UPDATE grant, ever (every column, including
-- `content`/`content_hash`, is set ONCE at INSERT time; row-exists <=> ready, there is no
-- lifecycle column to mutate). No DELETE, no TRUNCATE. This is the SAME append-only discipline
-- `destination_revocation`/`beneficiary_verification`/`fiat_screening_result` already apply.
GRANT SELECT, INSERT ON wlt1.evidence_export TO role_wlt1_runtime;

-- Inbound-Source Screening addition: wlt1.inbound_source_screening_result is SELECT+INSERT ONLY,
-- an append-only, versioned screening-evidence table — no UPDATE grant, ever (every column is set
-- ONCE at INSERT time; row-exists <=> terminal, there is no lifecycle column to mutate). No
-- DELETE, no TRUNCATE. Same append-only discipline as wallet_screening_result/evidence_export.
GRANT SELECT, INSERT ON wlt1.inbound_source_screening_result TO role_wlt1_runtime;

-- foundation.outbox_event / foundation.idempotency_record — WLT-01's only cross-schema grants,
-- needed because Phase 1B is the first phase that calls publishAudit/beginIdempotent/
-- completeIdempotent (services/wlt1/src/routes/wallet-destinations.ts).
GRANT USAGE ON SCHEMA foundation TO role_wlt1_runtime;
GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime;
GRANT SELECT, INSERT, UPDATE ON foundation.idempotency_record TO role_wlt1_runtime;

-- Explicit: NO DELETE/TRUNCATE grant on any wlt1 table, anywhere, ever. NO UPDATE grant on
-- wallet_destination, address_integrity_check, or chain_coverage — all three stay immutable/
-- runtime-read-only forever (chain_coverage.provider_id included — the runtime role can read it
-- but never write it, migration-only). destination's own UPDATE grant is column-scoped to
-- status/destination_status_version/whitelist_version/revocation_epoch/limits_version/
-- client_status_ref/cooling_off_until_utc/whitelist_approval_ref/updated_at_utc only —
-- destination_id/client_id/destination_type/natural_key_hash/created_at_utc are all set ONCE at
-- INSERT time and are NOT UPDATE-granted (this immutability is what makes Phase 4A-1's own
-- address/natural_key_hash mutation reset trigger structurally unreachable, not merely
-- application-discipline-unreachable — see wlt1-db.test.ts's own grant-boundary tests).
-- wallet_screening_result's/vendor_result_inbox's own UPDATE grants are likewise column-scoped to
-- terminal-evidence/processing-status columns only — every identity/receipt-evidence column on
-- both tables is set ONCE at INSERT time and is NOT UPDATE-granted. proof_of_control's own UPDATE
-- grant is likewise column-scoped to verification-lifecycle columns only — every identity/
-- challenge-evidence column is set ONCE at INSERT time and is NOT UPDATE-granted.
-- destination_decision's own UPDATE grant (Phase 4B) is column-scoped to EXACTLY the four
-- consumption-lifecycle columns (status/consumed_at_utc/consumption_id/execution_ref) — every
-- identity/evidence/binding column set at issuance (Phase 4A-2) is NOT UPDATE-granted and remains
-- immutable forever, same discipline as every other table in this file. NO grant into `iam`, `iam2`,
-- `sec1`, `cfg1`, `clt1`, `kyc1`, or `aml1` — WLT-01 reaches no other module by direct SQL grant,
-- only ever over HTTP (Phase 1B's CLT-01 client, Phase 4A-1's IAM-02 client, Phase 4A-2's
-- CLT-01 P-ROSTER seam and AML-01 client). Evidence Export's own IAM-02 dependency reuses these
-- SAME existing HTTP client seams — no new cross-schema grant, no SEC-01 grant (Evidence Export
-- exports only WLT-owned domain evidence; SEC-01-owned audit/sensitive-read evidence is
-- explicitly out of v1 scope). Asserted by the grant-boundary tests in
-- tests/integration/wlt1-db.test.ts.
