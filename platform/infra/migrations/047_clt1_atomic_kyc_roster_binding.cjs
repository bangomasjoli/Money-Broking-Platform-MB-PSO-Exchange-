/* eslint-disable camelcase */

/**
 * 047_clt1_atomic_kyc_roster_binding — KYC-01 Phase 4A.1 prerequisite (CLT-01-side only).
 *
 * Closes a confirmed, empirically-reproduced TOCTOU: the accepted Phase 4A roster contract
 * (`GET /internal/clt1/applications/:application_id/kyc-roster`) lets KYC-01 read a roster digest,
 * but the existing KYC/KYB outcome receipt (`routes/outcomes.ts`) never re-checked it — it neither
 * reads `clt1.authorised_party` nor shares any lock with the nine transactions that can change the
 * roster's hashed content. A roster mutation landing between KYC-01's read and CLT-01's receipt (or
 * between receipt and final approval) was silently accepted. See the KYC-01 Phase 4 delivery-
 * atomicity planning amendment for the adversarial reproduction; this migration is the CLT-01-side
 * fix it recommended (Option A: shared application-scoped advisory lock + a persisted accepted-
 * roster binding), landing as its own prerequisite phase (4A.1) so the concurrency change is
 * independently reviewable before KYC-01 Phase 4B (migration 048) builds on top of it.
 *
 * Two nullable columns, no other schema change, no new table, no new index beyond what a nullable
 * column needs:
 *
 *   `clt1.client_application.kyc_roster_hash` — the roster digest the LATEST accepted `kyc_kyb`
 *   outcome was validated against. Read by `approve/apply`'s new approval-gate recheck (it must
 *   still equal the CURRENT roster digest at approval time, closing the second, larger window: a
 *   roster that changes AFTER a genuine pass was accepted but BEFORE final approval). Nullable
 *   because every pre-047 row and every non-`kyc_kyb`-outcome application has no such binding —
 *   NULL is a real state ("no accepted KYC roster binding exists"), not a migration artifact, and
 *   `approve/apply`'s recheck treats NULL as a hard refusal, never a bypass.
 *
 *   `clt1.cdd_outcome.kyc_roster_hash` — immutable, per-receipt historical evidence: the exact
 *   digest THIS `kyc_kyb` row was accepted against, set once at INSERT and never updated (append-
 *   only, matching the table's own existing posture — no UPDATE grant exists on this table and
 *   none is added here). NULL for every non-`kyc_kyb` outcome type (`aml_sanctions`/
 *   `pep_adverse_media`/`risk_rating` never touch the authorised-party roster) and for every
 *   pre-047 `kyc_kyb` row (no binding was ever computed for those).
 *
 * Both share one CHECK: NULL is always allowed; a non-NULL value must be exactly
 * `sha256:<64 lowercase hex>` — the format `@aix/foundation`'s `fingerprint()` produces and the
 * Phase 4A roster route already returns over the wire. This is a structural format guard, not a
 * content guard (Postgres cannot validate that the hash matches the roster; that is what the
 * advisory-lock-protected application code checks).
 *
 * No `roster_version` counter, no new table, no new IAM-02 permission, no new route, no
 * `role_permission` seed, no cross-schema grant. Locking discipline (the advisory lock every
 * roster-mutating transaction now acquires) is entirely application-code — this migration adds
 * nothing that enforces it at the database level, matching every prior CLT-01
 * `pg_advisory_xact_lock` precedent (there is none yet in CLT-01; CFG-01 Phase 3B is the platform
 * precedent this migration's application-code half follows).
 */

const SHA256_HASH_CHECK = `(kyc_roster_hash IS NULL OR kyc_roster_hash ~ '^sha256:[0-9a-f]{64}$')`;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE clt1.client_application
      ADD COLUMN kyc_roster_hash varchar(128),
      ADD CONSTRAINT chk_clt1_client_application_kyc_roster_hash_format
        CHECK ${SHA256_HASH_CHECK};

    ALTER TABLE clt1.cdd_outcome
      ADD COLUMN kyc_roster_hash varchar(128),
      ADD CONSTRAINT chk_clt1_cdd_outcome_kyc_roster_hash_format
        CHECK ${SHA256_HASH_CHECK};
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE clt1.cdd_outcome
      DROP CONSTRAINT IF EXISTS chk_clt1_cdd_outcome_kyc_roster_hash_format,
      DROP COLUMN IF EXISTS kyc_roster_hash;

    ALTER TABLE clt1.client_application
      DROP CONSTRAINT IF EXISTS chk_clt1_client_application_kyc_roster_hash_format,
      DROP COLUMN IF EXISTS kyc_roster_hash;
  `);
};
