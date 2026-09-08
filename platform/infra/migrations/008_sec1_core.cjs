/* eslint-disable camelcase */

/**
 * 008_sec1_core — SEC-01 Audit Log / Security Monitoring schema (Phase 0-2 slice per the
 * approved SEC-01 implementation brief; blueprint `05_Database_Design.md`).
 *
 * Creates schema `sec1` and ONLY the 5 core tables the Phase 0-2 brief scopes:
 * `audit_event`, `event_schema`, `audit_stream`, `audit_seal_batch`, `source_identity_binding`.
 * Deliberately does NOT create `security_monitoring_rule`, `monitoring_dead_letter`,
 * `security_alert`, `alert_triage_note`, `evidence_export`, `sensitive_read_log`,
 * `integrity_verification_run`, `interim_audit_handoff`, `audit_correction`,
 * `expected_event_reconciliation`, or `recovery_integrity_run` — all of those belong to later,
 * explicitly deferred phases (security monitoring/alerting, evidence export, sensitive-read
 * logging, interim handoff, correction workflow, external anchoring/recovery), mirroring how
 * 006_iam2_core.cjs phased IAM-02's own schema.
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — two columns added beyond the blueprint's literal `05_Database_Design.md`
 * table definitions, both load-bearing for THIS implementation's correctness, not decoration:
 * ---------------------------------------------------------------------------------------
 *   - `sec1.audit_event.ingest_payload_hash` — sha256 of the FULL validated inbound ingestion
 *     payload (pre-redaction), used ONLY to distinguish a genuine replay (same
 *     (source_module, event_id), same payload -> idempotent) from a true conflict (same key,
 *     different payload -> SEC1_IDEMPOTENCY_CONFLICT). The blueprint's own `event_hash` column
 *     cannot serve this purpose because it hashes the ALREADY-REDACTED `metadata_redacted`
 *     form, not the raw inbound payload — two submissions that differ only in a
 *     since-redacted metadata key would otherwise be indistinguishable from a true conflict
 *     using only the chain hash. See services/sec1/src/lib/ingest.ts.
 *   - `sec1.source_identity_binding.token_hash` — the blueprint's own `ingestion_identity_id`
 *     column is documented as a human-readable "service account/client cert/key ref", not a
 *     cryptographic secret. The actual security mechanism (§5.5C ingestion authenticity —
 *     "source_module must be bound to authenticated ingestion credential") needs a real
 *     verifiable credential: a sha256 HASH of a per-module bearer token, NEVER the raw token,
 *     mirroring the hash-only-at-rest convention already used everywhere else in this codebase
 *     for bearer-style secrets (`iam.step_up_assertion.assertion_token_hash`,
 *     `iam2.permission_decision_token.token_hash`, `iam.session.session_token_hash`, ...).
 *     `ingestion_identity_id` is kept as the blueprint's own human-readable label field
 *     alongside it.
 *
 * ---------------------------------------------------------------------------------------
 * RLS DESIGN — NONE of these 5 tables have row-level security.
 * ---------------------------------------------------------------------------------------
 * All 5 are either global catalogues/state (`event_schema`, `audit_stream`,
 * `source_identity_binding` — no single "owner" row) or an append-only evidence/audit-trail
 * table (`audit_event`, `audit_seal_batch` — access control is an application-layer /
 * IAM-02-permission-guard concern for later phases, not a per-row DB ownership concept; this
 * mirrors `iam.auth_event` and `iam2.permission_decision_log`, neither of which carry RLS
 * either, for the identical reason).
 *
 * APPEND-ONLY ENFORCEMENT: `sec1.audit_event` has no UPDATE/DELETE grant for
 * `role_sec1_runtime` at all (see infra/grants/sec1_runtime_grants.sql) — enforced by simply
 * never granting it, exactly as the brief requires, not by an application-only check.
 *
 * SEED DATA: a handful of baseline `event_schema` rows (one generic catch-all type per
 * approved source module, plus a SEC-01 self-audit type) and 3 `source_identity_binding` rows
 * (one per FND-01/IAM-01/IAM-02), keyed to per-module bearer tokens supplied via
 * `SEC1_INGEST_TOKEN_FND01`/`SEC1_INGEST_TOKEN_IAM01`/`SEC1_INGEST_TOKEN_IAM02` at MIGRATION
 * RUN TIME (fail-closed: this migration throws if any is missing — whoever runs `migrate:up`
 * must have all three set, exactly as they must already have `DATABASE_URL` set). These MUST
 * be the SAME three values the deployed SEC-01 service's own `SEC1_INGEST_TOKEN_*` env vars
 * hold (services/sec1/src/config.ts) — no runtime discovery mechanism, same operator-managed
 * shared-secret-sync caveat IAM-02's `IAM01_INTERNAL_SERVICE_TOKEN` already carries.
 *
 * GRANTS: see infra/grants/sec1_runtime_grants.sql (separate file, applied by a privileged
 * role, same convention as fnd/iam/iam2).
 */

const crypto = require("node:crypto");

function requiredIngestToken(pgm, envVarName) {
  const value = process.env[envVarName];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `008_sec1_core migration requires ${envVarName} to be set (used to seed sec1.source_identity_binding.token_hash) — fail closed rather than seed an unusable binding.`,
    );
  }
  return value.trim();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

exports.up = (pgm) => {
  const tokenFnd01 = requiredIngestToken(pgm, "SEC1_INGEST_TOKEN_FND01");
  const tokenIam01 = requiredIngestToken(pgm, "SEC1_INGEST_TOKEN_IAM01");
  const tokenIam02 = requiredIngestToken(pgm, "SEC1_INGEST_TOKEN_IAM02");

  const hashFnd01 = sha256Hex(tokenFnd01);
  const hashIam01 = sha256Hex(tokenIam01);
  const hashIam02 = sha256Hex(tokenIam02);

  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS sec1;

    -- §2.1 audit_event — authoritative, append-only audit event store.
    CREATE TABLE sec1.audit_event (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_event_ref             varchar(64) NOT NULL UNIQUE,
      event_id                    varchar(128) NOT NULL,
      source_emission_stream      varchar(128),
      source_emission_sequence    bigint,
      idempotency_key             varchar(128) NOT NULL,
      event_type                  varchar(128) NOT NULL,
      event_category              varchar(16)
                                     CHECK (event_category IS NULL OR event_category IN ('auth','permission','money','security','system')),
      severity                    varchar(16) NOT NULL
                                     CHECK (severity IN ('info','low','medium','high','critical')),
      source_module               varchar(16) NOT NULL,
      actor_user_id                varchar(64),
      actor_type                  varchar(16) NOT NULL
                                     CHECK (actor_type IN ('client','staff','system','service')),
      session_id                  varchar(64),
      client_id                   varchar(64),
      entity_type                 varchar(64),
      entity_id                   varchar(64),
      action                      varchar(128) NOT NULL,
      result                      varchar(16) NOT NULL CHECK (result IN ('success','failure','blocked')),
      reason_code                 varchar(128),
      request_id                  varchar(128) NOT NULL,
      correlation_id               varchar(128) NOT NULL,
      occurred_at_utc              timestamptz NOT NULL,
      ingested_at_utc              timestamptz NOT NULL DEFAULT now(),
      metadata_redacted            jsonb NOT NULL DEFAULT '{}'::jsonb,
      classification               varchar(24) NOT NULL,
      retention_class              varchar(24) NOT NULL,
      stream_id                    varchar(160) NOT NULL,
      sequence_no                  bigint NOT NULL,
      previous_hash                varchar(128),
      event_hash                   varchar(128) NOT NULL,
      -- Load-bearing addition beyond the blueprint literal column list — see migration header.
      ingest_payload_hash          varchar(128) NOT NULL,
      seal_batch_id                varchar(64),
      external_anchor_ref           varchar(256),
      trusted_timestamp_ref         varchar(256),
      clock_skew_seconds            int,
      clock_skew_status             varchar(24),
      backfilled                    boolean NOT NULL DEFAULT false,
      integrity_from                varchar(24) NOT NULL DEFAULT 'ingestion_time'
                                       CHECK (integrity_from IN ('occurrence_time','ingestion_time')),
      status                        varchar(16) NOT NULL DEFAULT 'active'
                                       CHECK (status IN ('active','corrected','archived')),

      -- Constraints per 05_Database_Design.md §2.1.
      CONSTRAINT audit_event_source_module_event_id_key UNIQUE (source_module, event_id),
      CONSTRAINT audit_event_stream_id_sequence_no_key UNIQUE (stream_id, sequence_no)
    );

    -- §2.1 constraint 3: unique (source_module, source_emission_stream, source_emission_sequence)
    -- "where source sequence applies" -> partial unique index, only when the source actually
    -- supplied an emission sequence.
    CREATE UNIQUE INDEX audit_event_source_emission_seq_key
      ON sec1.audit_event (source_module, source_emission_stream, source_emission_sequence)
      WHERE source_emission_sequence IS NOT NULL;

    -- §2.2 event_schema — registry of event types / mandatory fields / classification.
    CREATE TABLE sec1.event_schema (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type             varchar(128) NOT NULL UNIQUE,
      source_module          varchar(16) NOT NULL,
      category               varchar(16) NOT NULL
                                CHECK (category IN ('auth','permission','money','security','system')),
      default_severity       varchar(16) NOT NULL
                                CHECK (default_severity IN ('info','low','medium','high','critical')),
      mandatory_fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
      allowed_metadata_keys   jsonb NOT NULL DEFAULT '[]'::jsonb,
      classification          varchar(24) NOT NULL,
      retention_class         varchar(24) NOT NULL,
      sensitive_read          boolean NOT NULL DEFAULT false,
      status                  varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      version                 int NOT NULL DEFAULT 1
    );

    -- §2.3 audit_stream — per-stream hash-chain pointer (F2-lesson: locked via SELECT ... FOR
    -- UPDATE, never a racy read-then-write — see services/sec1/src/lib/stream.ts).
    CREATE TABLE sec1.audit_stream (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      stream_id              varchar(160) NOT NULL UNIQUE,
      stream_type            varchar(16) NOT NULL DEFAULT 'module'
                                CHECK (stream_type IN ('global','module','client','entity')),
      source_module          varchar(16) NOT NULL,
      latest_sequence_no     bigint NOT NULL DEFAULT 0,
      latest_hash            varchar(128),
      status                 varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
      updated_at_utc          timestamptz NOT NULL DEFAULT now()
    );

    -- §2.4 audit_seal_batch — internal seal stub only this phase (seal_method='internal',
    -- external_anchor_ref/trusted_timestamp_ref always NULL until a later, infrastructure-
    -- dependent phase wires real WORM/TSA anchoring — see services/sec1/src/lib/seal.ts).
    CREATE TABLE sec1.audit_seal_batch (
      id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seal_batch_id                     varchar(64) NOT NULL UNIQUE,
      stream_id                         varchar(160) NOT NULL,
      from_sequence_no                  bigint NOT NULL,
      to_sequence_no                    bigint NOT NULL,
      batch_hash                        varchar(128) NOT NULL,
      seal_method                       varchar(16) NOT NULL DEFAULT 'internal'
                                           CHECK (seal_method IN ('internal','external')),
      sealed_at_utc                     timestamptz NOT NULL DEFAULT now(),
      external_anchor_ref                varchar(256),
      object_lock_retention_until_utc    timestamptz,
      trusted_timestamp_ref              varchar(256),
      trusted_timestamp_utc              timestamptz,
      verification_status                varchar(16) NOT NULL DEFAULT 'pending'
                                            CHECK (verification_status IN ('valid','failed','pending')),
      seal_controller_id                  varchar(64)
    );

    -- §2.14 source_identity_binding — maps an authenticated ingestion credential to a
    -- source_module (§5.5C ingestion authenticity). token_hash is the REAL security
    -- mechanism (sha256 of a bearer token, never the raw token — see migration header);
    -- ingestion_identity_id is the blueprint's own human-readable label.
    CREATE TABLE sec1.source_identity_binding (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      binding_id              varchar(64) NOT NULL UNIQUE,
      source_module           varchar(16) NOT NULL,
      ingestion_identity_id   varchar(128) NOT NULL,
      token_hash              varchar(128) NOT NULL UNIQUE,
      allowed_streams          jsonb NOT NULL DEFAULT '[]'::jsonb,
      status                   varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      approved_ref             varchar(128)
    );

    -- §3 indexes (subset applicable to the 5 tables built this phase).
    CREATE INDEX idx_sec1_audit_event_event_type_occurred ON sec1.audit_event (event_type, occurred_at_utc);
    CREATE INDEX idx_sec1_audit_event_actor_occurred ON sec1.audit_event (actor_user_id, occurred_at_utc);
    CREATE INDEX idx_sec1_audit_event_client_occurred ON sec1.audit_event (client_id, occurred_at_utc);
    CREATE INDEX idx_sec1_audit_event_entity ON sec1.audit_event (entity_type, entity_id);
    CREATE INDEX idx_sec1_audit_event_correlation ON sec1.audit_event (correlation_id);
    CREATE INDEX idx_sec1_audit_event_severity_occurred ON sec1.audit_event (severity, occurred_at_utc);
    CREATE INDEX idx_sec1_event_schema_type_status ON sec1.event_schema (event_type, status);
    CREATE INDEX idx_sec1_audit_event_source_emission ON sec1.audit_event (source_module, source_emission_stream, source_emission_sequence);
    CREATE INDEX idx_sec1_source_identity_binding_module_identity_status ON sec1.source_identity_binding (source_module, ingestion_identity_id, status);

    -- =====================================================================================
    -- SEED DATA (catalogue data, not business data — appropriate to seed in a migration).
    -- =====================================================================================

    -- Baseline event_schema rows: one generic catch-all type per approved source module, plus
    -- a SEC-01 self-audit type. mandatory_fields lists the 08_Audit_Log_Events.md §3
    -- always-mandatory fields NOT already structurally required at the wire-schema level
    -- redundantly enforced twice on purpose (TypeBox req'd + this list) is harmless; kept here
    -- so the schema-registry mandatory-field CHECK has real, non-empty data to validate
    -- against rather than an empty array that would trivially always pass.
    INSERT INTO sec1.event_schema
      (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
    VALUES
      ('fnd01.generic_event', 'FND-01', 'system',     'medium', '["event_id","event_type","source_module","severity","occurred_at_utc","request_id","correlation_id","actor_type","action","result","idempotency_key"]'::jsonb, 'restricted', 'standard', false, 'active', 1),
      ('iam01.generic_event', 'IAM-01', 'auth',       'medium', '["event_id","event_type","source_module","severity","occurred_at_utc","request_id","correlation_id","actor_type","action","result","idempotency_key"]'::jsonb, 'restricted', 'standard', false, 'active', 1),
      ('iam02.generic_event', 'IAM-02', 'permission', 'medium', '["event_id","event_type","source_module","severity","occurred_at_utc","request_id","correlation_id","actor_type","action","result","idempotency_key"]'::jsonb, 'restricted', 'standard', false, 'active', 1),
      ('sec1.self_audit_event', 'SEC-01', 'security',  'medium', '["event_id","event_type","source_module","severity","occurred_at_utc","request_id","correlation_id","actor_type","action","result","idempotency_key"]'::jsonb, 'restricted', 'standard', true,  'active', 1);

    -- source_identity_binding: one row per approved source module, token_hash computed at
    -- migration-run time from SEC1_INGEST_TOKEN_FND01/IAM01/IAM02 (never the raw token
    -- itself is stored).
    INSERT INTO sec1.source_identity_binding
      (binding_id, source_module, ingestion_identity_id, token_hash, allowed_streams, status, approved_ref)
    VALUES
      ('binding_fnd01_ingest', 'FND-01', 'svc_fnd01_audit_ingest', '${hashFnd01}', '[]'::jsonb, 'active', NULL),
      ('binding_iam01_ingest', 'IAM-01', 'svc_iam01_audit_ingest', '${hashIam01}', '[]'::jsonb, 'active', NULL),
      ('binding_iam02_ingest', 'IAM-02', 'svc_iam02_audit_ingest', '${hashIam02}', '[]'::jsonb, 'active', NULL);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS sec1 CASCADE;`);
};
