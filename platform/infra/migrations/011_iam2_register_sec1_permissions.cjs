/* eslint-disable camelcase */

/**
 * 011_iam2_register_sec1_permissions — cross-module catalogue registration ONLY.
 *
 * SEC-01 Phase 4 (`docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md` §4/§9) needs
 * three new `iam2.permission` catalogue rows so its new read/search routes can call IAM-02's
 * already-accepted `POST /internal/iam2/permission/check` and get a real allow/deny decision
 * instead of `IAM2_PERMISSION_UNKNOWN` (services/iam2/src/lib/guard.ts's step-0 fail-closed
 * check). This migration inserts ONLY those catalogue rows — it does not touch
 * `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic, does not add/relax any
 * grant, and does not implement IAM-02 Phase 6/7 (delegation, temporary permissions,
 * steady-state break-glass, SoD risk acceptance).
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — why this is an IAM-02-scoped migration, not a SEC-01-scoped one, even though
 * it lands in this shared numbered sequence:
 * ---------------------------------------------------------------------------------------
 * Every migration to date touches exactly one module's own schema (008/009/010 touch `sec1`
 * only; 006/007 touch `iam2` only). `role_sec1_runtime` has — and keeps — ZERO grants into
 * `iam2.*` (infra/grants/sec1_runtime_grants.sql's own comment: "no blanket grant into iam,
 * iam2, or any other module schema"), so SEC-01 could never run a migration that writes into
 * `iam2.permission` in production even if one were authored there. This migration therefore
 * writes into `iam2.permission` using the SAME "insert hardcoded rows describing another
 * module" pattern migration 008 already used in the OPPOSITE direction (SEC-01 seeding
 * `sec1.event_schema` rows describing FND-01/IAM-01/IAM-02) — a catalogue owner seeding rows
 * ABOUT a consumer, at the consumer's request, never the consumer writing into the catalogue
 * itself.
 *
 * ---------------------------------------------------------------------------------------
 * PERMISSION CODE NAMING — resolved in favour of the already-accepted blueprint over the task
 * brief's own shorthand:
 * ---------------------------------------------------------------------------------------
 * `07_Permission_Rules.md` §2 (SEC-01's own accepted blueprint) names these exactly
 * `sec1.audit_event.read` / `sec1.audit_event.read_sensitive` / `sec1.audit_event.search` —
 * `resource = "audit_event"`, matching the actual table name and IAM-02's own existing
 * convention of resource names mapping to entities (`role`, `permission`, `approval`, ...).
 * The task brief's own shorthand (`sec1.audit.search` etc., `resource = "audit"`) is NOT used
 * here — it was explicitly marked "suggested" in the brief, and the blueprint is the
 * already-reviewed source of truth. Flagged explicitly per this codebase's own "document a
 * deviation, don't silently pick one" discipline (see IMPLEMENTATION_NOTES.md Phase 4 section).
 *
 * ---------------------------------------------------------------------------------------
 * requires_step_up / requires_approval — both false for all three rows:
 * ---------------------------------------------------------------------------------------
 * `07_Permission_Rules.md` §4's Maker-Checker/Step-Up list item 1 is scoped to "Sensitive audit
 * EXPORT" only, not sensitive READ. Export is explicitly deferred (out of Phase 4 scope), so no
 * export permission is registered by this migration at all — nothing here should be read as
 * "export is safe because step-up is false"; export simply does not exist as a callable
 * capability yet.
 *
 * ---------------------------------------------------------------------------------------
 * NO role_permission rows seeded — same rule migration 006 already documented for its own
 * bootstrap role catalogue: FR-003 requires role-permission assignment to happen "only through
 * approved workflow," so wiring these new permissions to any role via a raw seed INSERT here
 * would itself violate that rule. Test fixtures grant roles directly via SQL against the
 * already-seeded provisional roles (e.g. `role_auditor`), exactly as `tests/integration/
 * iam2-db.test.ts` already does for its own tests — this migration seeds ONLY the permission
 * catalogue rows, nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * No placeholder/reserved rows for later SEC-01 permissions (verify_integrity, evidence_export,
 * security_alert, monitoring_rule, ...) — even though `iam2.permission.status = 'inactive'`
 * would let them exist without being reachable by the guard (`lookupPermission` filters
 * `status = 'active'`), Phase 4 has no code path that would ever reference them yet. Adding
 * unused catalogue rows now would be exactly the kind of "design for a hypothetical future
 * requirement" this codebase's own conventions avoid — a later phase that needs them adds its
 * own additive migration, the same way this one does.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_sec1_audit_event_search',          'sec1.audit_event.search',          'audit_event', 'search',         'normal',    false, false, false, false, 'active', 'SEC-01'),
      ('perm_sec1_audit_event_read',             'sec1.audit_event.read',            'audit_event', 'read',           'normal',    false, false, false, false, 'active', 'SEC-01'),
      ('perm_sec1_audit_event_read_sensitive',   'sec1.audit_event.read_sensitive',  'audit_event', 'read_sensitive', 'sensitive', false, false, false, false, 'active', 'SEC-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_sec1_audit_event_search',
       'perm_sec1_audit_event_read',
       'perm_sec1_audit_event_read_sensitive'
     );
  `);
};
