/* eslint-disable camelcase */

/**
 * 045_kyc1_manual_override_request — KYC-01 Phase 3B (maker-checker manual outcome override,
 * approved Phase 3B planning report). Creates `kyc1.manual_override_request` — the request/apply
 * binding table for the ONE permitted override target, the case-level `cdd_outcome` status. Same
 * shape every prior maker-checker table in this codebase uses (mirrors AML-01's own
 * `match_disposition_decision_request`, migration 035; CLT-01's own `duplicate_candidate_decision_
 * request`, migration 029): one row per override attempt, `payload_hash` snapshotted at request
 * time over a canonical object and recomputed from the STORED row at apply time,
 * `decision_token_hash` (never the raw token) written only on apply.
 *
 * Table name is deliberately `manual_override_request`, NOT `manual_review_request` — Phase 3B
 * does not implement a general review queue, only a single override-and-apply workflow (approved
 * Phase 3B D10).
 *
 * `target_type` carries exactly one reachable value (`'cdd_outcome'`) — kept as a CHECK-constrained
 * column anyway rather than hardcoded so a later phase could widen the CHECK without a table
 * redesign, mirroring migration 043's own D6 forward-compatibility posture on `outcome_publication.
 * status` (a schema value costs nothing to declare narrow-but-extensible; this is NOT the same
 * exception as the error-catalogue's reachable-code-path-only rule — see lib/errors.ts's own
 * header comment for why those two are treated differently).
 *
 * MED-3 FIX (independent Opus review of Phase 3B, applied HERE — migration 045 itself modified in
 * place, since Phase 3B was never accepted/deployed; no migration 047, head remains 046): the
 * ORIGINAL version of this table bound an override request/approval only to
 * `{override_id, case_id, target_type, target_outcome_status, reason_code, requested_by}` — never
 * to the case OUTCOME that existed at request time. Empirically demonstrated exploit: a request is
 * approved while the case is `remediation_required`; genuinely adverse evidence then arrives and
 * the case recomputes to `fail`; the STALE approval is applied anyway, silently masking the fail
 * finding, and D5's own recompute-lock then makes it unreassertable except by opening a new case.
 * `approved_against_outcome_id`/`approved_against_outcome_status` close this: EVERY override
 * request is now bound to the EXACT `cdd_outcome` row current at request time (captured from the
 * request route's own locked re-read, never the unlocked preflight read — see `routes/outcome-
 * override.ts`'s own header comment), and the apply route's final transaction refuses
 * (`KYC1_CASE_INVALID_STATE`, the override row transitions to `status='failed'`) unless the case's
 * CURRENT `current_outcome_id`/`current_outcome_status` still exactly match this snapshot.
 * `approved_against_outcome_id` is a genuine FK into `kyc1.cdd_outcome (outcome_id)` — that column
 * already carries a `UNIQUE` constraint (migration 042), so the FK is clean; comparing by ID (not
 * merely by status) is what catches a same-status-different-version drift a status-only comparison
 * would miss (e.g. a corrective re-verification that recomputes to the identical `fail` status via
 * a NEW `cdd_outcome` row). Both columns are NOT NULL — a request can only ever be created for a
 * case that already has a current outcome (`caseIsOverridable`'s own existing precondition), so
 * `current_outcome_id` is always non-null by the time the INSERT runs (the write-together
 * invariant between `current_outcome_status`/`current_outcome_id`, INFO-8, already guarantees
 * this). Neither column is ever UPDATE-granted to `role_kyc1_runtime` — both are set ONCE at
 * INSERT time, exactly like every other request-time-only column on this table.
 *
 * `status` lifecycle: `requested` and `applied` were the only LIVE values before this patch.
 * `failed` is now ALSO reachable — the apply route's final transaction writes it when (and only
 * when) the case-state-drift check above fires, atomically with the `kyc1.manual_override_refused`
 * audit (`reason_code: "case_state_changed"`) in the SAME transaction — this is a NEW reachable
 * code path added by the MED-3 fix, not merely a forward-compatible placeholder. `cancelled`
 * remains schema-present and UNREACHABLE — no cancel route exists. No new error code was
 * registered for either transition (`failed` reuses the EXISTING `KYC1_CASE_INVALID_STATE`) — the
 * same reachable-code-path-only discipline `lib/errors.ts` has applied to itself since Phase 0.
 * A row that transitions to `failed` permanently vacates the `one_open_per_case` partial unique
 * index (see below) — a fresh request for the same case, against its new current outcome, may be
 * created immediately afterward.
 *
 * `reason_code` is a BOUNDED ENUM, not free text — a deliberate divergence from AML-01's own
 * `match_disposition_decision_request.reason` (a free-text `varchar(128)`). KYC-01's own "no free
 * text in audit payloads" discipline (established by `cdd_outcome.outcome_reason` since migration
 * 042) is extended here to the override-request reason as well, making the property structural
 * rather than a redaction-discipline promise.
 *
 * Partial unique index `idx_kyc1_manual_override_request_one_open_per_case` enforces AT MOST ONE
 * `requested` row per case at a time — the same "at most one active row" idiom as
 * `idx_kyc1_kyc_case_one_active_per_anchor` (migration 042) and `idx_kyc1_outcome_publication_one_
 * active_per_application` (migration 043). Given MED-2 (Phase 2B), every code path that writes
 * `status` on this table has been reviewed against this index for the identical re-entry hazard —
 * see `routes/outcome-override.ts`'s own header comment. The MED-3 fix's own `failed` transition
 * WRITES `status='failed'` — reviewed against this exact index: `failed` is never the predicate
 * value (`WHERE status = 'requested'`), so a row leaving `requested` for `failed` vacates the index
 * exactly like the `applied` transition already does — no re-entry hazard, by the same reasoning
 * MED-2's own fix established for `outcome_publication.status`.
 *
 * No role created here — `role_kyc1_runtime`'s extended grants are applied separately by
 * `infra/grants/kyc1_runtime_grants.sql`, AFTER this migration (mirrors every prior KYC-01
 * migration's own convention). No seed data. No ALTER to `kyc_case`, `document_checklist_item`,
 * `verification_result`, `cdd_outcome`, or `outcome_publication` — none of Phase 1/2A/2B's tables
 * are touched by this migration.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE kyc1.manual_override_request (
      id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      override_id                      varchar(64) NOT NULL UNIQUE,
      case_id                          varchar(64) NOT NULL REFERENCES kyc1.kyc_case (case_id),
      target_type                      varchar(24) NOT NULL
                                          CHECK (target_type IN ('cdd_outcome')),
      target_outcome_status            varchar(24) NOT NULL
                                          CHECK (target_outcome_status IN ('pass','fail','remediation_required')),
      reason_code                      varchar(48) NOT NULL
                                          CHECK (reason_code IN ('system_derived_outcome_incorrect','manual_evidence_review','documented_compliance_exception')),
      -- MED-3 fix — the exact cdd_outcome row/status current at REQUEST time (captured from the
      -- request route's own locked re-read). The apply route's final transaction refuses unless
      -- both still match the case's CURRENT values — see this file's own header comment.
      approved_against_outcome_id      varchar(64) NOT NULL REFERENCES kyc1.cdd_outcome (outcome_id),
      approved_against_outcome_status  varchar(24) NOT NULL
                                          CHECK (approved_against_outcome_status IN ('pass','fail','remediation_required')),
      requested_by                     varchar(64) NOT NULL,
      approval_id                      varchar(64),
      decision_token_hash              varchar(128),
      status                           varchar(16) NOT NULL DEFAULT 'requested'
                                          CHECK (status IN ('requested','applied','cancelled','failed')),
      payload_hash                     varchar(128) NOT NULL,
      applied_outcome_id               varchar(64),
      request_id                       varchar(128),
      correlation_id                   varchar(128),
      created_at_utc                   timestamptz NOT NULL DEFAULT now(),
      applied_at_utc                   timestamptz
    );

    CREATE UNIQUE INDEX idx_kyc1_manual_override_request_override_id ON kyc1.manual_override_request (override_id);
    CREATE INDEX idx_kyc1_manual_override_request_case_id ON kyc1.manual_override_request (case_id);
    CREATE INDEX idx_kyc1_manual_override_request_status ON kyc1.manual_override_request (status);

    -- At most one OPEN (status='requested') override per case — see header comment.
    CREATE UNIQUE INDEX idx_kyc1_manual_override_request_one_open_per_case
      ON kyc1.manual_override_request (case_id)
      WHERE status = 'requested';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS kyc1.manual_override_request;
  `);
};
