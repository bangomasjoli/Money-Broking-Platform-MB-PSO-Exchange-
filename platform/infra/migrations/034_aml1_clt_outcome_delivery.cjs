/* eslint-disable camelcase */

/**
 * 034_aml1_clt_outcome_delivery — AML-01 Phase 2A (CLT-01 outcome delivery, approved Phase 2A
 * scope). Two additive schema changes:
 *
 *   1. `aml1.screening_request` gains `subject_parent_ref` (nullable varchar(64)) — the parent
 *      `client_id` for an `authorised_party` subject, captured at screening-request creation time
 *      (INSERT-time only; NOT part of the runtime role's UPDATE grant — see
 *      aml1_runtime_grants.sql). AML-01 has no `clt1.*` grant and does not call CLT-01 to look this
 *      up — the caller supplies it once, at creation, so the delivery route can derive CLT-01's
 *      party-receipt URL (`/internal/clt1/clients/:client_id/authorised-parties/:authorised_
 *      party_id/screening-outcome`) from AML-01's OWN stored state, never re-asking the delivery
 *      caller for `client_id`. Optional for `client_application` subjects (the application-level
 *      CLT-01 route needs no parent ref).
 *
 *   2. `aml1.clt_outcome_delivery` — a new append-mostly delivery-evidence table implementing the
 *      two-phase (insert-pending -> HTTP outside any transaction -> update-terminal) delivery
 *      pattern approved in the AML-01 Phase 2 planning report §12. One row per delivery ATTEMPT
 *      TARGET: an application-level screen produces up to two rows (`aml_sanctions` +
 *      `pep_adverse_media` — CLT-01's own application-outcome endpoint takes exactly one
 *      `outcome_type` per call); an authorised-party-level screen produces exactly one row
 *      (`outcome_type` stays NULL — CLT-01's party-receipt endpoint has no outcome-type axis).
 *      `delivered_status` is the exact value sent to CLT-01 (CLT-01's own vocabulary — 'pass'/
 *      'pending'/'hit' for application-level, 'clear'/'review_required'/'hit' for party-level).
 *      `effective_status` is AML-01's own derived status ('clear'/'potential_match'/
 *      'confirmed_hit'/'clear_after_review' — see lib/clt1-outcome-mapping.ts; `dismissed` is a
 *      `screening_match.match_status` value, never a result/effective-level status) that produced
 *      the mapping — kept alongside the mapped value so a later read/audit can see BOTH without
 *      recomputing from `screening_match` history. `status` tracks the DELIVERY ATTEMPT's own
 *      lifecycle (`pending` -> `succeeded`/`failed`) — distinct from `delivered_status`/
 *      `effective_status`, which describe the AML-01 screening outcome being delivered, not
 *      whether delivery itself succeeded.
 *
 * `attempt_count` counts every HTTP attempt (initial + retries). At-least-once delivery is the
 * approved posture (Phase 2 planning report D10) — a duplicate successful CLT-01 receipt is
 * safe-but-noisy (CLT-01's own `cdd_outcome`/authorised-party screening-outcome writes are
 * append/COALESCE, never rejected as a duplicate), never engineered around by adding idempotency
 * to CLT-01 itself.
 *
 * No role created here — `role_aml1_runtime`'s extended grants are applied separately by
 * `infra/grants/aml1_runtime_grants.sql`, AFTER this migration (mirrors migration 033's own
 * convention). No seed data.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE aml1.screening_request
      ADD COLUMN subject_parent_ref varchar(64);

    CREATE TABLE aml1.clt_outcome_delivery (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      delivery_id           varchar(64) NOT NULL UNIQUE,
      screening_request_id  varchar(64) NOT NULL REFERENCES aml1.screening_request (screening_request_id),
      target                varchar(32) NOT NULL
                               CHECK (target IN ('application_outcome','authorised_party_screening')),
      outcome_type          varchar(24)
                               CHECK (outcome_type IS NULL OR outcome_type IN ('aml_sanctions','pep_adverse_media')),
      delivered_status      varchar(24) NOT NULL,
      effective_status      varchar(24) NOT NULL
                               CHECK (effective_status IN ('clear','potential_match','confirmed_hit','clear_after_review')),
      status                varchar(16) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','succeeded','failed')),
      attempt_count         int NOT NULL DEFAULT 0,
      failure_reason_code   varchar(64),
      response_ref          varchar(128),
      requested_by          varchar(64) NOT NULL,
      version               int NOT NULL DEFAULT 1,
      request_id            varchar(128),
      correlation_id        varchar(128),
      created_at_utc        timestamptz NOT NULL DEFAULT now(),
      delivered_at_utc      timestamptz
    );

    CREATE UNIQUE INDEX idx_aml1_clt_outcome_delivery_delivery_id ON aml1.clt_outcome_delivery (delivery_id);
    CREATE INDEX idx_aml1_clt_outcome_delivery_request_id ON aml1.clt_outcome_delivery (screening_request_id);
    CREATE INDEX idx_aml1_clt_outcome_delivery_status ON aml1.clt_outcome_delivery (status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS aml1.clt_outcome_delivery;
    ALTER TABLE aml1.screening_request DROP COLUMN IF EXISTS subject_parent_ref;
  `);
};
