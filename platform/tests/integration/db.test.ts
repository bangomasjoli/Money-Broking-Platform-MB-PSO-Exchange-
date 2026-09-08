/**
 * DB-gated integration tests. Self-skip unless TEST_DATABASE_URL points at a Postgres
 * that already has the `foundation` schema (run `npm run migrate:up` against it first).
 * Verifies the controls that can only be proven end-to-end:
 *  - sensitive action + audit committed in ONE transaction (§5.5 coupling)
 *  - critical job forces missed-run detection (§3.9)
 *  - unregistered owner rejected (MODULE_NOT_REGISTERED)
 *  - idempotency new / duplicate-same / conflict-different (§3.7)
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import {
  beginIdempotent,
  completeIdempotent,
  closePool,
  getPool,
  initPool,
  withTransaction,
  type AppConfig,
} from "@aix/foundation";
import { buildApp } from "../../services/fnd/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;

const config: AppConfig = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-token-123",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
};

const internal = { "x-internal-service-token": "test-token-123" };
let app: FastifyInstance;
let schemaReady = false;

async function foundationSchemaExists(): Promise<boolean> {
  try {
    const r = await getPool().query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'foundation'",
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

describe.skipIf(!TEST_DB)("FND service integration (DB)", () => {
  beforeAll(async () => {
    initPool(config.databaseUrl);
    schemaReady = await foundationSchemaExists();
    if (!schemaReady) return;
    await getPool().query(
      `INSERT INTO foundation.module_registry (module_code, module_name, module_version, owner_team, go_live_status, runtime_enabled)
       VALUES ('FND-01','Platform Foundation','v1.2','Technology','active', true)
       ON CONFLICT (module_code) DO NOTHING`,
    );
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
  });

  it("registers a critical job, forces missed-run detection, and writes a coupled audit event", async () => {
    if (!schemaReady) return expect(schemaReady, "run migrate:up on TEST_DATABASE_URL first").toBe(true);
    const jobCode = "it_daily_" + Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { ...internal, "idempotency-key": "reg_" + jobCode },
      payload: {
        job_code: jobCode,
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "critical",
        max_lateness_minutes: 30,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.missed_run_detection).toBe(true);

    const job = await getPool().query(
      "SELECT missed_run_detection FROM foundation.scheduled_job WHERE job_code = $1",
      [jobCode],
    );
    expect(job.rows[0].missed_run_detection).toBe(true);

    // Transaction-coupling: the audit event landed in the outbox in the same tx.
    const audit = await getPool().query(
      "SELECT 1 FROM foundation.outbox_event WHERE topic = 'audit.event' AND event_type = 'foundation.scheduled_job.registered' AND payload_ref LIKE $1",
      [`%${jobCode}%`],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it("rejects an unregistered owner module", async () => {
    if (!schemaReady) return;
    const res = await app.inject({
      method: "POST",
      url: "/foundation/scheduler/jobs/register",
      headers: { ...internal, "idempotency-key": "reg_bad_" + Date.now() },
      payload: {
        job_code: "it_bad_" + Date.now(),
        owner_module: "ZZZ-99",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "low",
        max_lateness_minutes: 0,
        idempotency_strategy: "job_code_period",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MODULE_NOT_REGISTERED");
  });

  it("idempotency: new, duplicate-same, conflict-different", async () => {
    if (!schemaReady) return;
    const scope = {
      actorId: "svc_it",
      actorType: "service" as const,
      action: "foundation.test.op",
      key: "it_key_" + Date.now(),
      sourceModule: "FND-01",
    };
    const first = await withTransaction((c) => beginIdempotent(c, { ...scope, request: { a: 1 } }));
    expect(first.status).toBe("new");

    const dup = await withTransaction((c) => beginIdempotent(c, { ...scope, request: { a: 1 } }));
    expect(dup.status).toBe("duplicate");

    await expect(
      withTransaction((c) => beginIdempotent(c, { ...scope, request: { a: 999 } })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // ---------------------------------------------------------------------------------------
  // C2 gap-closing patch (IAM-02_Implementation_Plan_v1.0 §7): foundation.idempotency_record
  // now carries ENABLE+FORCE RLS keyed to source_module/aix.module. Every test above this
  // point runs on the superuser-backed shared pool (bypasses RLS unconditionally) — proving
  // NOTHING about whether the real least-privilege role_fnd_runtime can actually use the
  // begin/complete cycle, or whether cross-module rows are really hidden from it. This block
  // creates a genuine LOGIN role that is ONLY a member of role_fnd_runtime (no BYPASSRLS, not
  // a table owner) and drives beginIdempotent/completeIdempotent through a connection
  // authenticated as that role — mirroring tests/integration/iam-db.test.ts's S1 pattern.
  // ---------------------------------------------------------------------------------------
  describe("C2: idempotency module isolation under role_fnd_runtime (NOT superuser)", () => {
    const RUNTIME_ROLE_USER = "fnd_app_test";
    let verifyPool: Pool; // superuser, used ONLY to seed/independently verify DB state
    let runtimePool: Pool; // authenticated as RUNTIME_ROLE_USER (member of role_fnd_runtime only)

    beforeAll(async () => {
      if (!schemaReady) return;
      await getPool().query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
            CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
          END IF;
        END
        $$;
      `);
      await getPool().query(`GRANT role_fnd_runtime TO ${RUNTIME_ROLE_USER};`);

      verifyPool = new Pool({ connectionString: config.databaseUrl });
      const runtimeDbUrl = config.databaseUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
      runtimePool = new Pool({ connectionString: runtimeDbUrl });
    });

    afterAll(async () => {
      if (!schemaReady) return;
      await runtimePool?.end();
      await verifyPool?.end();
    });

    it("role_fnd_runtime can create/read/update its own (FND-01) idempotency row via beginIdempotent/completeIdempotent", async () => {
      if (!schemaReady) return;
      const key = "c2_fnd_own_" + Date.now();
      const scope = {
        actorId: "c2_fnd_actor",
        actorType: "service" as const,
        action: "foundation.c2.probe",
        key,
        request: { a: 1 },
        sourceModule: "FND-01",
      };
      const client = await runtimePool.connect();
      try {
        await client.query("BEGIN");
        const begun = await beginIdempotent(client, scope);
        expect(begun.status).toBe("new");
        await completeIdempotent(client, scope, "c2_result_ref");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // Independently verify via the superuser connection (bypasses RLS) what actually landed.
      const row = await verifyPool.query(
        `SELECT status, result_ref, source_module FROM foundation.idempotency_record
          WHERE source_module = 'FND-01' AND actor_id = 'c2_fnd_actor' AND action = 'foundation.c2.probe' AND idempotency_key = $1`,
        [key],
      );
      expect(row.rows[0]?.status).toBe("completed");
      expect(row.rows[0]?.result_ref).toBe("c2_result_ref");
    });

    it("role_fnd_runtime: idempotency replay/conflict semantics still hold under the real runtime role", async () => {
      if (!schemaReady) return;
      const key = "c2_fnd_replay_" + Date.now();
      const scope = {
        actorId: "c2_fnd_replay_actor",
        actorType: "service" as const,
        action: "foundation.c2.probe",
        key,
        sourceModule: "FND-01",
      };

      async function runInTx<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
        const client = await runtimePool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(client);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      const first = await runInTx((c) => beginIdempotent(c, { ...scope, request: { a: 1 } }));
      expect(first.status).toBe("new");

      const dup = await runInTx((c) => beginIdempotent(c, { ...scope, request: { a: 1 } }));
      expect(dup.status).toBe("duplicate");

      await expect(
        runInTx((c) => beginIdempotent(c, { ...scope, request: { a: 999 } })),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("role_fnd_runtime: missing aix.module fails closed — a raw SELECT returns zero rows even though rows exist", async () => {
      if (!schemaReady) return;
      // By this point in the suite, many FND-01 rows exist (this describe block's own tests,
      // plus every other idempotency-wired test above). With aix.module never set on this
      // connection, RLS must hide ALL of them, not just foreign ones — the fail-closed
      // guarantee is unconditional on the setting being present, not on whose rows they are.
      const res = await runtimePool.query(`SELECT * FROM foundation.idempotency_record`);
      expect(res.rowCount).toBe(0);
    });

    it("role_fnd_runtime, correctly scoped to its OWN module, cannot see an IAM-created idempotency row (direct SQL proof)", async () => {
      if (!schemaReady) return;
      // Seed an IAM-created row directly via the superuser connection (bypasses RLS).
      const iamKey = "c2_iam_seed_" + Date.now();
      await verifyPool.query(
        `INSERT INTO foundation.idempotency_record
           (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
         VALUES ($1, 'sha256:seed', 'c2_iam_actor', 'service', 'iam.c2.probe', 'IAM-01', 'completed', now() + interval '1 day', now(), now())`,
        [iamKey],
      );

      const client = await runtimePool.connect();
      try {
        await client.query("BEGIN");
        // Correctly scoped to FND-01 -- role_fnd_runtime's own module -- not unset, not the
        // foreign module. This is the real cross-module isolation guarantee: a module that
        // scopes itself correctly still cannot reach another module's rows.
        await client.query("SELECT set_config('aix.module', 'FND-01', true)");
        const res = await client.query(
          `SELECT * FROM foundation.idempotency_record WHERE idempotency_key = $1`,
          [iamKey],
        );
        expect(res.rowCount).toBe(0);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    });
  });

  describe("F1: idempotency baseline wired into scheduler/jobs/register", () => {
    it("first call succeeds and writes a completed foundation.idempotency_record row", async () => {
      if (!schemaReady) return;
      const jobCode = "it_idem_reg_" + Date.now();
      const key = "idem_key_reg_" + Date.now();
      const res = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_code: jobCode,
          owner_module: "FND-01",
          schedule: "RRULE:FREQ=DAILY",
          criticality: "medium",
          max_lateness_minutes: 15,
          idempotency_strategy: "job_code_period",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.replayed).toBe(false);

      const record = await getPool().query(
        `SELECT status, result_ref FROM foundation.idempotency_record
          WHERE actor_id = 'internal_service' AND action = 'foundation.scheduler.register' AND idempotency_key = $1`,
        [key],
      );
      expect(record.rows[0]?.status).toBe("completed");
      expect(record.rows[0]?.result_ref).toBe(jobCode);
    });

    it("replay with same key + same body returns the prior result without a duplicate audit row", async () => {
      if (!schemaReady) return;
      const jobCode = "it_idem_replay_" + Date.now();
      const key = "idem_key_replay_" + Date.now();
      const payload = {
        job_code: jobCode,
        owner_module: "FND-01",
        schedule: "RRULE:FREQ=DAILY",
        criticality: "low",
        max_lateness_minutes: 5,
        idempotency_strategy: "job_code_period",
      };

      const first = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: { ...internal, "idempotency-key": key },
        payload,
      });
      expect(first.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: { ...internal, "idempotency-key": key },
        payload,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.replayed).toBe(true);
      expect(replay.json().data.job_code).toBe(jobCode);

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event
          WHERE topic = 'audit.event' AND event_type = 'foundation.scheduled_job.registered' AND payload_ref LIKE $1`,
        [`%${jobCode}%`],
      );
      expect(audit.rowCount).toBe(1);
    });

    it("replay with same key + different body is rejected (VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const key = "idem_key_conflict_" + Date.now();
      const first = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_code: "it_idem_conflict_a_" + Date.now(),
          owner_module: "FND-01",
          schedule: "RRULE:FREQ=DAILY",
          criticality: "low",
          max_lateness_minutes: 5,
          idempotency_strategy: "job_code_period",
        },
      });
      expect(first.statusCode).toBe(201);

      const conflict = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_code: "it_idem_conflict_b_" + Date.now(), // different body -> different fingerprint
          owner_module: "FND-01",
          schedule: "RRULE:FREQ=DAILY",
          criticality: "low",
          max_lateness_minutes: 5,
          idempotency_strategy: "job_code_period",
        },
      });
      expect(conflict.statusCode).toBe(400);
      expect(conflict.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("missing Idempotency-Key fails closed (400)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/foundation/scheduler/jobs/register",
        headers: internal,
        payload: {
          job_code: "it_idem_missing_" + Date.now(),
          owner_module: "FND-01",
          schedule: "RRULE:FREQ=DAILY",
          criticality: "low",
          max_lateness_minutes: 5,
          idempotency_strategy: "job_code_period",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });
  });

  describe("F1: idempotency baseline wired into jobs/enqueue", () => {
    it("first call succeeds and writes a completed foundation.idempotency_record row", async () => {
      if (!schemaReady) return;
      const key = "idem_key_enq_" + Date.now();
      const res = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_type: "it_probe",
          owner_module: "FND-01",
          payload_ref: "ref_" + Date.now(),
          idempotency_key: "body_key_" + Date.now(),
        },
      });
      expect(res.statusCode).toBe(202);
      expect(res.json().data.replayed).toBe(false);
      const queueMessageId = res.json().data.queue_message_id;

      const record = await getPool().query(
        `SELECT status, result_ref FROM foundation.idempotency_record
          WHERE actor_id = 'internal_service' AND action = 'foundation.jobs.enqueue' AND idempotency_key = $1`,
        [key],
      );
      expect(record.rows[0]?.status).toBe("completed");
      expect(record.rows[0]?.result_ref).toBe(queueMessageId);
    });

    it("replay with same key + same body returns the prior result without a duplicate audit row", async () => {
      if (!schemaReady) return;
      const key = "idem_key_enq_replay_" + Date.now();
      const payload = {
        job_type: "it_probe",
        owner_module: "FND-01",
        payload_ref: "ref_replay_" + Date.now(),
        idempotency_key: "body_key_replay_" + Date.now(),
      };

      const first = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: { ...internal, "idempotency-key": key },
        payload,
      });
      expect(first.statusCode).toBe(202);
      const queueMessageId = first.json().data.queue_message_id;

      const replay = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: { ...internal, "idempotency-key": key },
        payload,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.replayed).toBe(true);
      expect(replay.json().data.queue_message_id).toBe(queueMessageId);

      const audit = await getPool().query(
        `SELECT 1 FROM foundation.outbox_event
          WHERE topic = 'audit.event' AND event_type = 'foundation.job.enqueued' AND payload_ref LIKE $1`,
        [`%${queueMessageId}%`],
      );
      expect(audit.rowCount).toBe(1);
    });

    it("replay with same key + different body is rejected (VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const key = "idem_key_enq_conflict_" + Date.now();
      const first = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_type: "it_probe",
          owner_module: "FND-01",
          payload_ref: "ref_a_" + Date.now(),
          idempotency_key: "body_key_a_" + Date.now(),
        },
      });
      expect(first.statusCode).toBe(202);

      const conflict = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: { ...internal, "idempotency-key": key },
        payload: {
          job_type: "it_probe",
          owner_module: "FND-01",
          payload_ref: "ref_b_" + Date.now(), // different body -> different fingerprint
          idempotency_key: "body_key_b_" + Date.now(),
        },
      });
      expect(conflict.statusCode).toBe(400);
      expect(conflict.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("missing Idempotency-Key fails closed (400)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/foundation/jobs/enqueue",
        headers: internal,
        payload: {
          job_type: "it_probe",
          owner_module: "FND-01",
          payload_ref: "ref_missing_" + Date.now(),
          idempotency_key: "body_key_missing_" + Date.now(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });
  });
});
