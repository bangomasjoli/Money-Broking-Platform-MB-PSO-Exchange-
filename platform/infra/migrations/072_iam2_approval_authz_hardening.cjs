/* eslint-disable camelcase */

/**
 * 072_iam2_approval_authz_hardening — IAM02-AUTHZ-REM-001 (schema only; AZ-13, AZ-17, AZ-18,
 * D-2, D-8; `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/01-plan.md` §7).
 *
 * SCHEMA ONLY. No policy row, role grant, seed or data of any kind is written, and no runtime
 * grant changes (`role_iam2_runtime` already holds SELECT on `approval_policy` and SELECT,
 * INSERT, UPDATE on `approval_request`; a trigger function needs no grant of its own).
 * Migration 073 (approval-policy configuration) is NOT part of this task and is not authored.
 *
 * WHAT THIS ADDS
 *   1. `approval_request` SNAPSHOT of the security requirements in force at creation:
 *      `snapshot_taken_at_utc`, `snapshot_requires_step_up`, `snapshot_required_approver_roles`,
 *      `snapshot_threshold_type`. All NULL together for a LEGACY (pre-072) request, which the
 *      application refuses to approve or redeem (fail closed). Count and expiry are already
 *      snapshotted by the existing `required_count` and `expires_at_utc` columns.
 *   2. An IMMUTABILITY trigger on `approval_request` (the runtime role holds table-wide UPDATE):
 *      every snapshot and approval-binding column is frozen after INSERT. Only `status`,
 *      `approved_count`, `completed_at_utc` and `correlation_id` may change.
 *   3. `approval_policy.status` gains `revoked` (emergency cutoff, D-2) distinct from `inactive`
 *      (retired, snapshot governs). `revoked` is TERMINAL (a trigger rejects any change out of
 *      it). Policy shape CHECKs (count >= 1, expiry > 0, roles = JSON array of strings) and a
 *      partial UNIQUE index so at most one `active` policy exists per (action, resource).
 *   4. Multi-approver gate (AZ-18): the policy keeps its TRUE `required_approval_count` (a
 *      two-person requirement stays representable and is never lowered). The REQUEST snapshot is
 *      limited to `required_count = 1` (`snapshot_taken_at_utc IS NULL OR required_count = 1`);
 *      the application refuses a policy whose count is greater than 1. Conditional on the
 *      snapshot so this migration cannot fail on, or rewrite, a legacy row.
 *
 * ROLLBACK (`down`) REFUSES, leaving schema and data untouched, if any `approval_policy` row is
 * `revoked`: reverting the status CHECK must never convert an emergency-revoked policy into a
 * merely `inactive` (retired) one, which would silently re-validate approvals the cutoff blocked
 * (NF-6a). Otherwise `down` removes everything above and restores the previous CHECK.
 *
 * Both directions run inside the migration transaction (node-pg-migrate default); the guard
 * raises, so a refused rollback is atomic.
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- ---- approval_policy ----------------------------------------------------------------
    ALTER TABLE iam2.approval_policy DROP CONSTRAINT approval_policy_status_check;
    ALTER TABLE iam2.approval_policy
      ADD CONSTRAINT approval_policy_status_check
        CHECK (status IN ('active','inactive','revoked')),
      ADD CONSTRAINT approval_policy_required_count_positive
        CHECK (required_approval_count >= 1),
      ADD CONSTRAINT approval_policy_expiry_positive
        CHECK (expiry_minutes > 0),
      ADD CONSTRAINT approval_policy_roles_string_array
        CHECK (jsonb_typeof(required_approver_roles) = 'array'
               AND NOT jsonb_path_exists(required_approver_roles, '$[*] ? (@.type() != "string")'));

    CREATE UNIQUE INDEX uq_iam2_approval_policy_active_action_resource
      ON iam2.approval_policy (action, resource)
      WHERE status = 'active';

    CREATE FUNCTION iam2.fn_approval_policy_revoked_is_terminal() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF OLD.status = 'revoked' AND NEW.status IS DISTINCT FROM 'revoked' THEN
        RAISE EXCEPTION 'iam2.approval_policy % is revoked; revoked is terminal', OLD.policy_id
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END
    $fn$;

    CREATE TRIGGER trg_iam2_approval_policy_revoked_is_terminal
      BEFORE UPDATE ON iam2.approval_policy
      FOR EACH ROW EXECUTE FUNCTION iam2.fn_approval_policy_revoked_is_terminal();

    -- ---- approval_request: snapshot -------------------------------------------------------
    ALTER TABLE iam2.approval_request
      ADD COLUMN snapshot_taken_at_utc            timestamptz,
      ADD COLUMN snapshot_requires_step_up        boolean,
      ADD COLUMN snapshot_required_approver_roles jsonb,
      ADD COLUMN snapshot_threshold_type          varchar(16);

    ALTER TABLE iam2.approval_request
      ADD CONSTRAINT approval_request_snapshot_all_or_none
        CHECK (
          (snapshot_taken_at_utc IS NULL
             AND snapshot_requires_step_up IS NULL
             AND snapshot_required_approver_roles IS NULL
             AND snapshot_threshold_type IS NULL)
          OR
          (snapshot_taken_at_utc IS NOT NULL
             AND snapshot_requires_step_up IS NOT NULL
             AND snapshot_required_approver_roles IS NOT NULL
             AND snapshot_threshold_type IS NOT NULL
             AND policy_id IS NOT NULL)
        ),
      ADD CONSTRAINT approval_request_snapshot_roles_string_array
        CHECK (snapshot_required_approver_roles IS NULL
               OR (jsonb_typeof(snapshot_required_approver_roles) = 'array'
                   AND NOT jsonb_path_exists(snapshot_required_approver_roles, '$[*] ? (@.type() != "string")'))),
      ADD CONSTRAINT approval_request_snapshot_threshold_type_check
        CHECK (snapshot_threshold_type IS NULL
               OR snapshot_threshold_type IN ('value','count','risk','action')),
      ADD CONSTRAINT approval_request_snapshot_single_approver
        CHECK (snapshot_taken_at_utc IS NULL OR required_count = 1);

    -- ---- approval_request: immutability ---------------------------------------------------
    CREATE FUNCTION iam2.fn_approval_request_binding_is_immutable() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.id                                IS DISTINCT FROM OLD.id
      OR NEW.approval_id                       IS DISTINCT FROM OLD.approval_id
      OR NEW.policy_id                         IS DISTINCT FROM OLD.policy_id
      OR NEW.maker_user_id                     IS DISTINCT FROM OLD.maker_user_id
      OR NEW.action                            IS DISTINCT FROM OLD.action
      OR NEW.resource                          IS DISTINCT FROM OLD.resource
      OR NEW.entity_id                         IS DISTINCT FROM OLD.entity_id
      OR NEW.client_id                         IS DISTINCT FROM OLD.client_id
      OR NEW.payload_ref                       IS DISTINCT FROM OLD.payload_ref
      OR NEW.payload_hash                      IS DISTINCT FROM OLD.payload_hash
      OR NEW.payload_canonicalisation_version  IS DISTINCT FROM OLD.payload_canonicalisation_version
      OR NEW.required_count                    IS DISTINCT FROM OLD.required_count
      OR NEW.expires_at_utc                    IS DISTINCT FROM OLD.expires_at_utc
      OR NEW.created_at_utc                    IS DISTINCT FROM OLD.created_at_utc
      OR NEW.snapshot_taken_at_utc             IS DISTINCT FROM OLD.snapshot_taken_at_utc
      OR NEW.snapshot_requires_step_up         IS DISTINCT FROM OLD.snapshot_requires_step_up
      OR NEW.snapshot_required_approver_roles  IS DISTINCT FROM OLD.snapshot_required_approver_roles
      OR NEW.snapshot_threshold_type           IS DISTINCT FROM OLD.snapshot_threshold_type
      THEN
        RAISE EXCEPTION 'iam2.approval_request % binding and snapshot columns are immutable', OLD.approval_id
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END
    $fn$;

    CREATE TRIGGER trg_iam2_approval_request_binding_is_immutable
      BEFORE UPDATE ON iam2.approval_request
      FOR EACH ROW EXECUTE FUNCTION iam2.fn_approval_request_binding_is_immutable();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $guard$
    BEGIN
      IF EXISTS (SELECT 1 FROM iam2.approval_policy WHERE status = 'revoked') THEN
        RAISE EXCEPTION '072 down refused: iam2.approval_policy contains revoked rows; rolling back would turn an emergency cutoff into a retirement'
          USING ERRCODE = 'check_violation';
      END IF;
    END
    $guard$;

    DROP TRIGGER trg_iam2_approval_request_binding_is_immutable ON iam2.approval_request;
    DROP FUNCTION iam2.fn_approval_request_binding_is_immutable();

    ALTER TABLE iam2.approval_request
      DROP CONSTRAINT approval_request_snapshot_single_approver,
      DROP CONSTRAINT approval_request_snapshot_threshold_type_check,
      DROP CONSTRAINT approval_request_snapshot_roles_string_array,
      DROP CONSTRAINT approval_request_snapshot_all_or_none,
      DROP COLUMN snapshot_threshold_type,
      DROP COLUMN snapshot_required_approver_roles,
      DROP COLUMN snapshot_requires_step_up,
      DROP COLUMN snapshot_taken_at_utc;

    DROP TRIGGER trg_iam2_approval_policy_revoked_is_terminal ON iam2.approval_policy;
    DROP FUNCTION iam2.fn_approval_policy_revoked_is_terminal();
    DROP INDEX iam2.uq_iam2_approval_policy_active_action_resource;

    ALTER TABLE iam2.approval_policy
      DROP CONSTRAINT approval_policy_roles_string_array,
      DROP CONSTRAINT approval_policy_expiry_positive,
      DROP CONSTRAINT approval_policy_required_count_positive,
      DROP CONSTRAINT approval_policy_status_check;
    ALTER TABLE iam2.approval_policy
      ADD CONSTRAINT approval_policy_status_check CHECK (status IN ('active','inactive'));
  `);
};
