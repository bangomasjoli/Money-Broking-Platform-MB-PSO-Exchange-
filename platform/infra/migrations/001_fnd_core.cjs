/* eslint-disable camelcase */

/**
 * 001_fnd_core — FND-01 Platform Foundation schema.
 * Creates schema `foundation` and its baseline tables (blueprint §05).
 * Raw SQL is used deliberately for strict control over constraints, indexes and
 * (later) grants/RLS. Forward-only in production (IMP-01 §06).
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS foundation;

    -- §3.1 module_registry
    CREATE TABLE foundation.module_registry (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      module_code     varchar(32) NOT NULL UNIQUE,
      module_name     varchar(128) NOT NULL,
      module_version  varchar(32) NOT NULL,
      module_group    varchar(32),
      owner_team      varchar(64),
      runtime_enabled boolean NOT NULL DEFAULT false,
      go_live_status  varchar(32) NOT NULL DEFAULT 'draft'
                        CHECK (go_live_status IN ('draft','review','approved','active','retired')),
      dependencies    jsonb NOT NULL DEFAULT '[]'::jsonb,
      schema_owner    varchar(64),
      created_at_utc  timestamptz NOT NULL DEFAULT now(),
      updated_at_utc  timestamptz NOT NULL DEFAULT now()
    );

    -- §3.2 release_registry
    CREATE TABLE foundation.release_registry (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id        varchar(64) NOT NULL UNIQUE,
      artifact_hash     varchar(128) NOT NULL,
      build_version     varchar(64) NOT NULL,
      build_time_utc    timestamptz NOT NULL,
      environment       varchar(16) NOT NULL
                          CHECK (environment IN ('dev','qa','uat','staging','prod')),
      deployed_at_utc   timestamptz,
      deployed_by       varchar(128),
      deployment_status varchar(24) NOT NULL DEFAULT 'pending'
                          CHECK (deployment_status IN ('pending','deployed','failed','rolled_back')),
      evidence_ref      varchar(256)
    );

    -- §3.3 config_baseline
    CREATE TABLE foundation.config_baseline (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      config_key          varchar(128) NOT NULL,
      config_class        varchar(24) NOT NULL
                            CHECK (config_class IN ('feature','vendor','security','system')),
      approved_value_hash varchar(128),
      environment         varchar(16) NOT NULL,
      owner_team          varchar(64),
      approval_ref        varchar(128),
      effective_from_utc  timestamptz NOT NULL DEFAULT now(),
      status              varchar(16) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','retired')),
      UNIQUE (config_key, environment)
    );

    -- §3.4 config_drift_result
    CREATE TABLE foundation.config_drift_result (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id          varchar(64) NOT NULL,
      environment     varchar(16) NOT NULL,
      drift_level     varchar(16) NOT NULL CHECK (drift_level IN ('none','low','high','critical')),
      config_key      varchar(128) NOT NULL,
      expected_hash   varchar(128),
      actual_hash     varchar(128),
      detected_at_utc timestamptz NOT NULL DEFAULT now(),
      status          varchar(16) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','resolved','accepted')),
      resolved_at_utc timestamptz
    );

    -- §3.5 smoke_test_run
    CREATE TABLE foundation.smoke_test_run (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      smoke_test_id    varchar(64) NOT NULL UNIQUE,
      release_id       varchar(64),
      environment      varchar(16) NOT NULL,
      scope            varchar(16) NOT NULL CHECK (scope IN ('pre_deploy','post_deploy','manual')),
      status           varchar(16) NOT NULL CHECK (status IN ('running','passed','failed')),
      started_at_utc   timestamptz NOT NULL DEFAULT now(),
      completed_at_utc timestamptz,
      triggered_by     varchar(128),
      evidence_ref     varchar(256)
    );

    -- §3.6 smoke_test_check
    CREATE TABLE foundation.smoke_test_check (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      smoke_test_run_id  uuid NOT NULL REFERENCES foundation.smoke_test_run(id) ON DELETE CASCADE,
      check_name         varchar(128) NOT NULL,
      check_status       varchar(16) NOT NULL CHECK (check_status IN ('passed','failed','skipped')),
      severity           varchar(16) NOT NULL CHECK (severity IN ('critical','high','medium','low')),
      message            text,
      evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
      checked_at_utc     timestamptz NOT NULL DEFAULT now()
    );

    -- §3.7 idempotency_record
    CREATE TABLE foundation.idempotency_record (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key     varchar(128) NOT NULL,
      request_fingerprint varchar(128) NOT NULL,
      actor_id            varchar(128) NOT NULL,
      actor_type          varchar(16) NOT NULL CHECK (actor_type IN ('user','system','service')),
      action              varchar(128) NOT NULL,
      status              varchar(16) NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing','completed','failed')),
      result_ref          varchar(256),
      expires_at_utc      timestamptz,
      created_at_utc      timestamptz NOT NULL DEFAULT now(),
      updated_at_utc      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_id, action, idempotency_key)
    );

    -- §3.8 outbox_event (correlation/causation required by §5.6)
    CREATE TABLE foundation.outbox_event (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      outbox_id         varchar(64) NOT NULL UNIQUE,
      topic             varchar(64) NOT NULL,
      event_type        varchar(128) NOT NULL,
      payload_ref       text NOT NULL,
      status            varchar(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','published','failed','dead_letter')),
      retry_count       int NOT NULL DEFAULT 0,
      next_retry_at_utc timestamptz,
      correlation_id    varchar(128) NOT NULL,
      causation_id      varchar(128),
      created_at_utc    timestamptz NOT NULL DEFAULT now(),
      published_at_utc  timestamptz
    );

    -- §3.9 scheduled_job (critical/high require missed-run detection)
    CREATE TABLE foundation.scheduled_job (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_code             varchar(128) NOT NULL UNIQUE,
      owner_module         varchar(32) NOT NULL,
      schedule_expression  varchar(256) NOT NULL,
      criticality          varchar(16) NOT NULL CHECK (criticality IN ('critical','high','medium','low')),
      enabled              boolean NOT NULL DEFAULT true,
      max_lateness_minutes int NOT NULL DEFAULT 0,
      idempotency_strategy varchar(64) NOT NULL,
      missed_run_detection boolean NOT NULL DEFAULT false,
      next_due_at_utc      timestamptz,
      created_at_utc       timestamptz NOT NULL DEFAULT now(),
      updated_at_utc       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT scheduled_job_missed_run_required
        CHECK (criticality NOT IN ('critical','high') OR missed_run_detection = true)
    );

    -- §3.10 job_run
    CREATE TABLE foundation.job_run (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_run_id        varchar(64) NOT NULL UNIQUE,
      job_code          varchar(128) NOT NULL,
      owner_module      varchar(32) NOT NULL,
      scheduled_for_utc timestamptz,
      started_at_utc    timestamptz,
      completed_at_utc  timestamptz,
      status            varchar(24) NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','running','completed','failed','missed','dead_letter')),
      correlation_id    varchar(128),
      causation_id      varchar(128),
      idempotency_key   varchar(128),
      attempt_count     int NOT NULL DEFAULT 0,
      error_code        varchar(64),
      evidence_ref      varchar(256)
    );

    -- §3.11 job_queue_message (correlation_id required)
    CREATE TABLE foundation.job_queue_message (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      queue_message_id  varchar(64) NOT NULL UNIQUE,
      job_type          varchar(128) NOT NULL,
      owner_module      varchar(32) NOT NULL,
      payload_ref       text NOT NULL,
      status            varchar(24) NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','claimed','running','completed','retry_scheduled','dead_letter')),
      correlation_id    varchar(128) NOT NULL,
      causation_id      varchar(128),
      source_ref        varchar(128),
      idempotency_key   varchar(128) UNIQUE,
      available_at_utc  timestamptz NOT NULL DEFAULT now(),
      claimed_by        varchar(128),
      claimed_at_utc    timestamptz,
      attempt_count     int NOT NULL DEFAULT 0,
      max_attempts      int NOT NULL DEFAULT 5,
      last_error_code   varchar(64),
      created_at_utc    timestamptz NOT NULL DEFAULT now(),
      updated_at_utc    timestamptz NOT NULL DEFAULT now()
    );

    -- §3.12 rate_limit_decision_log
    CREATE TABLE foundation.rate_limit_decision_log (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id         varchar(64) NOT NULL UNIQUE,
      scope_hash          varchar(128) NOT NULL,
      action              varchar(128) NOT NULL,
      decision            varchar(16) NOT NULL CHECK (decision IN ('allow','throttle','block')),
      limit_ref           varchar(128),
      retry_after_seconds int,
      occurred_at_utc     timestamptz NOT NULL DEFAULT now(),
      correlation_id      varchar(128)
    );

    -- §4 indexes
    CREATE INDEX idx_release_registry_env ON foundation.release_registry (release_id, environment);
    CREATE INDEX idx_config_baseline_key ON foundation.config_baseline (config_key, environment, status);
    CREATE INDEX idx_config_drift_run ON foundation.config_drift_result (run_id, environment);
    CREATE INDEX idx_smoke_run_release ON foundation.smoke_test_run (release_id, environment, status);
    CREATE INDEX idx_outbox_pending ON foundation.outbox_event (status, next_retry_at_utc);
    CREATE INDEX idx_outbox_correlation ON foundation.outbox_event (correlation_id);
    CREATE INDEX idx_job_run_code ON foundation.job_run (job_code, scheduled_for_utc);
    CREATE INDEX idx_job_run_status ON foundation.job_run (status, scheduled_for_utc);
    CREATE INDEX idx_job_run_correlation ON foundation.job_run (correlation_id);
    CREATE INDEX idx_job_queue_available ON foundation.job_queue_message (status, available_at_utc);
    CREATE INDEX idx_rate_limit_scope ON foundation.rate_limit_decision_log (scope_hash, action);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS foundation CASCADE;`);
};
