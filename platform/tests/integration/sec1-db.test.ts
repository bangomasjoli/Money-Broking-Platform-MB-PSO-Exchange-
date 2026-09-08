/**
 * SEC-01 DB-gated integration tests. Self-skip unless TEST_DATABASE_URL points at a Postgres
 * that already has `foundation` (001, 005), `iam` (002-004), `iam2` (006-007), and `sec1` (008)
 * migrated, with ALL FOUR grant files applied (fnd/iam/iam2/sec1).
 *
 * Connects as `role_sec1_runtime` via a real LOGIN role from the START (S1 lesson applied from
 * day one, per the task brief — never superuser-only), exactly like tests/integration/
 * iam2-db.test.ts. A separate superuser `pg.Pool` (`verifyPool`) is used for fixture
 * setup/independent verification, never to drive the app itself.
 *
 * The three per-module ingestion bearer tokens below MUST be the SAME values migration 008 was
 * run with (`SEC1_INGEST_TOKEN_FND01`/`_IAM01`/`_IAM02`) — see the SEC-01 implementation notes
 * "Commands run" section for the exact env vars used for this regression pass.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool, publishAudit, withTransaction } from "@aix/foundation";
import type { Sec1Config } from "../../services/sec1/src/config.js";
import { buildApp } from "../../services/sec1/src/server.js";
import { verifyChainSegment, runIntegrityVerification, type ChainRow } from "../../services/sec1/src/lib/integrity.js";
import {
  canonicalJson,
  computeEventHash,
  CANONICAL_FORMAT_VERSION_V1,
  CANONICAL_FORMAT_VERSION_V2,
  type CanonicalEventFields,
} from "../../services/sec1/src/lib/canonical.js";
import { sealBatch, verifySealBatch } from "../../services/sec1/src/lib/seal.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "sec1_app_test";

const TOKENS = {
  "FND-01": "test-fnd01-ingest-token-it",
  "IAM-01": "test-iam01-ingest-token-it",
  "IAM-02": "test-iam02-ingest-token-it",
} as const;

const config: Sec1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-sec1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  sec1InternalServiceToken: "test-sec1-internal-token-it",
  ingestTokens: { ...TOKENS },
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-sec1-iam2-token-it",
};

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

function idemKey(label: string): string {
  return `it_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ingestHeaders(sourceModule: keyof typeof TOKENS, key: string) {
  return {
    "x-internal-service-token": TOKENS[sourceModule],
    "idempotency-key": key,
  };
}

/** Phase 3: the GENERIC internal-identity guard's own secret — distinct from the per-module
 * ingestion tokens above (plugins/internal-identity.ts vs plugins/source-identity.ts). */
function internalHeaders(key: string) {
  return {
    "x-internal-service-token": config.sec1InternalServiceToken,
    "idempotency-key": key,
  };
}

function sampleEvent(overrides: Record<string, unknown> = {}) {
  const uniq = randomUUID();
  return {
    event_id: `evt_${uniq}`,
    event_type: "fnd01.generic_event",
    event_category: "system",
    severity: "medium",
    source_module: "FND-01",
    actor_type: "service",
    action: "test.action",
    result: "success",
    request_id: `req_${uniq}`,
    correlation_id: `corr_${uniq}`,
    occurred_at_utc: new Date().toISOString(),
    idempotency_key: `evtkey_${uniq}`,
    metadata: { note: "integration test event" },
    ...overrides,
  };
}

/**
 * Phase 3 (L1): manually inserts a GENUINE v1 row directly (bypassing the real ingest route,
 * which always writes v2 rows) — simulates a pre-Phase-3-ingested event whose hash was
 * genuinely computed WITHOUT classification/retention_class bound in, and whose
 * canonical_format_version column is 1. Uses the superuser `verifyPool` (out-of-band, same
 * convention this file already uses for direct DB manipulation), never the app's own
 * role_sec1_runtime pool. Also keeps `sec1.audit_stream`'s pointer in sync so a SUBSEQUENT
 * real ingest into the SAME stream correctly chains onto this row (previous_hash linkage).
 */
async function insertV1Row(input: {
  streamId: string;
  sourceModule: string;
  sequenceNo: number;
  previousHash: string | null;
}): Promise<{ fields: CanonicalEventFields; eventHash: string; eventId: string }> {
  const uniq = randomUUID();
  const fields: CanonicalEventFields = {
    event_id: `evt_v1_${uniq}`,
    source_module: input.sourceModule,
    event_type: "fnd01.generic_event",
    event_category: "system",
    severity: "medium",
    actor_user_id: null,
    actor_type: "service",
    session_id: null,
    client_id: null,
    entity_type: null,
    entity_id: null,
    action: "legacy.action",
    result: "success",
    reason_code: null,
    request_id: `req_v1_${uniq}`,
    correlation_id: `corr_v1_${uniq}`,
    occurred_at_utc: new Date().toISOString(),
    source_emission_sequence: null,
    source_emission_stream: null,
    idempotency_key: `idem_v1_${uniq}`,
    metadata_redacted: {},
    // classification/retention_class DELIBERATELY OMITTED — a genuine v1 row never had these
    // bound into its hash. The COLUMN values are still populated below (NOT NULL columns),
    // just never fed into computeEventHash.
  };
  const eventHash = computeEventHash(fields, input.previousHash);
  const auditEventRef = `audit_v1_${uniq}`;

  await verifyPool.query(
    `INSERT INTO sec1.audit_event
       (audit_event_ref, event_id, idempotency_key, event_type, event_category, severity, source_module,
        actor_type, action, result, request_id, correlation_id, occurred_at_utc, metadata_redacted,
        classification, retention_class, stream_id, sequence_no, previous_hash, event_hash,
        ingest_payload_hash, canonical_format_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      auditEventRef,
      fields.event_id,
      fields.idempotency_key,
      fields.event_type,
      fields.event_category,
      fields.severity,
      fields.source_module,
      fields.actor_type,
      fields.action,
      fields.result,
      fields.request_id,
      fields.correlation_id,
      fields.occurred_at_utc,
      JSON.stringify(fields.metadata_redacted),
      "restricted",
      "standard",
      input.streamId,
      input.sequenceNo,
      input.previousHash,
      eventHash,
      `unused_ingest_payload_hash_${uniq}`,
      CANONICAL_FORMAT_VERSION_V1,
    ],
  );

  // Keep the stream pointer in sync so a subsequent REAL ingest into the same stream chains
  // its previous_hash onto this row, exactly as a real historical stream would have.
  await verifyPool.query(
    `INSERT INTO sec1.audit_stream (stream_id, stream_type, source_module, latest_sequence_no, latest_hash, status, updated_at_utc)
     VALUES ($1, 'module', $2, $3, $4, 'active', now())
     ON CONFLICT (stream_id) DO UPDATE SET latest_sequence_no = EXCLUDED.latest_sequence_no, latest_hash = EXCLUDED.latest_hash, updated_at_utc = now()`,
    [input.streamId, input.sourceModule, input.sequenceNo, eventHash],
  );

  return { fields, eventHash, eventId: fields.event_id };
}

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam') AS iam,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'iam2') AS iam2,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'sec1') AS sec1`,
    );
    const row = r.rows[0];
    return (
      Number(row?.fnd) > 0 &&
      Number(row?.iam) > 0 &&
      Number(row?.iam2) > 0 &&
      Number(row?.sec1) > 0
    );
  } catch {
    return false;
  }
}

describe("SEC-01 Phase 0-2 integration", () => {
  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    schemaReady = await schemasExist();
    if (!schemaReady) return;

    // Real LOGIN role, member of role_sec1_runtime ONLY — no BYPASSRLS, not a table owner —
    // from the start of this suite, per the S1 lesson.
    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_sec1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  // ---------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_sec1_runtime", () => {
    it("app builds successfully under the least-privilege runtime role (assertNoExchangeRuntime passed)", () => {
      if (!schemaReady) return expect(schemaReady, "run migrate:up + all four grants files first").toBe(true);
      expect(app).toBeDefined();
      const routePaths = app
        .printRoutes({ commonPrefix: false })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(routePaths.some((p) => p.toLowerCase().includes("exchange"))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------------------
  // F3(a)-equivalent: role_sec1_runtime is denied on iam.*/iam2.*, but can read sec1 tables.
  // ---------------------------------------------------------------------------------------
  describe("F3(a)-equivalent: cross-schema DB role isolation", () => {
    it("role_sec1_runtime cannot read iam.* or iam2.*, but CAN read sec1.event_schema", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM iam.user_identity LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("SELECT 1 FROM iam2.permission LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(getPool().query("SELECT 1 FROM sec1.event_schema LIMIT 1")).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------------------
  // Append-only enforcement: no UPDATE/DELETE grant on sec1.audit_event, ever.
  // ---------------------------------------------------------------------------------------
  describe("append-only enforcement", () => {
    it("role_sec1_runtime cannot UPDATE sec1.audit_event", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(
        getPool().query("UPDATE sec1.audit_event SET status = 'archived' WHERE 1=0"),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("role_sec1_runtime cannot DELETE FROM sec1.audit_event", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("DELETE FROM sec1.audit_event WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  // ---------------------------------------------------------------------------------------
  // SEC exception: role_sec1_runtime CAN SELECT+UPDATE foundation.outbox_event, but NOT
  // INSERT/DELETE. Other module runtime roles must NOT have gained this exception.
  // ---------------------------------------------------------------------------------------
  describe("foundation.outbox_event SEC-01 grant exception", () => {
    it("role_sec1_runtime can SELECT and UPDATE, but cannot INSERT or DELETE, foundation.outbox_event", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1")).resolves.toBeDefined();
      await expect(
        getPool().query("UPDATE foundation.outbox_event SET status = status WHERE 1=0"),
      ).resolves.toBeDefined();
      await expect(
        getPool().query(
          `INSERT INTO foundation.outbox_event (outbox_id, topic, event_type, payload_ref, status, retry_count, correlation_id, created_at_utc)
           VALUES ('should_fail','x','x','{}','pending',0,'corr_x', now())`,
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("DELETE FROM foundation.outbox_event WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
    });

    it("the foreign INSERT-only consumer roles (iam/iam2) did NOT gain the SEC-01 SELECT/UPDATE exception", async () => {
      if (!schemaReady) return;
      // role_fnd_runtime is deliberately EXCLUDED from this check: `foundation` is FND-01's
      // OWN schema, and infra/grants/fnd_runtime_grants.sql has always granted
      // `SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA foundation` to role_fnd_runtime (it is
      // the schema owner's runtime role, not a foreign consumer) — that pre-dates SEC-01
      // entirely and is unrelated to the new SEC-01 exception. The C1-tightened INSERT-only
      // contract (infra/grants/iam_runtime_grants.sql / iam2_runtime_grants.sql) applies only
      // to the two FOREIGN consumer roles below; THOSE are what must not have silently gained
      // SELECT/UPDATE from this pass.
      for (const role of ["role_iam_runtime", "role_iam2_runtime"]) {
        const selectAllowed = await verifyPool.query(
          `SELECT has_table_privilege($1, 'foundation.outbox_event', 'SELECT') AS allowed`,
          [role],
        );
        const updateAllowed = await verifyPool.query(
          `SELECT has_table_privilege($1, 'foundation.outbox_event', 'UPDATE') AS allowed`,
          [role],
        );
        const insertAllowed = await verifyPool.query(
          `SELECT has_table_privilege($1, 'foundation.outbox_event', 'INSERT') AS allowed`,
          [role],
        );
        expect(selectAllowed.rows[0]?.allowed, `${role} SELECT`).toBe(false);
        expect(updateAllowed.rows[0]?.allowed, `${role} UPDATE`).toBe(false);
        expect(insertAllowed.rows[0]?.allowed, `${role} INSERT`).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  // Source identity binding.
  // ---------------------------------------------------------------------------------------
  describe("source identity binding", () => {
    it("rejects ingestion with no ingestion token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: { "idempotency-key": idemKey("no-token") },
        payload: sampleEvent(),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("rejects ingestion with an unknown ingestion token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: { "x-internal-service-token": "not-a-real-token", "idempotency-key": idemKey("bad-token") },
        payload: sampleEvent(),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("rejects ingestion when the declared source_module does not match the authenticated identity", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("mismatch")),
        payload: sampleEvent({ source_module: "IAM-01", event_type: "iam01.generic_event" }),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("SEC1_SOURCE_MODULE_IDENTITY_MISMATCH");
    });

    it("IAM-01's own token cannot be used to ingest an event declaring IAM-02 as source_module", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("IAM-01", idemKey("cross-module")),
        payload: sampleEvent({ source_module: "IAM-02", event_type: "iam02.generic_event" }),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("SEC1_SOURCE_MODULE_IDENTITY_MISMATCH");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Schema validation.
  // ---------------------------------------------------------------------------------------
  describe("schema registry validation", () => {
    it("rejects an unregistered event_type", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("unknown-type")),
        payload: sampleEvent({ event_type: "fnd01.totally_unregistered_event_type" }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("SEC1_EVENT_TYPE_UNKNOWN");
    });

    it("rejects a request missing a wire-required mandatory field via VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      const event = sampleEvent() as Record<string, unknown>;
      delete event.action;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("missing-action")),
        payload: event,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Core ingestion + hash-chain.
  // ---------------------------------------------------------------------------------------
  describe("audit ingestion + hash-chain", () => {
    it("ingests a valid event and returns a genesis hash-chain entry for a fresh stream", async () => {
      if (!schemaReady) return;
      const streamTag = "genesis_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("genesis")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.audit_event_ref).toMatch(/^audit_/);
      expect(data.sequence_no).toBe(1);
      expect(data.previous_hash).toBeNull();
      expect(typeof data.event_hash).toBe("string");
      expect(data.event_hash.length).toBeGreaterThan(0);
      expect(data.seal_batch_id).toBeNull();
      expect(data.external_anchor_ref).toBeNull();
      expect(data.trusted_timestamp_ref).toBeNull();
    });

    it("sequence_no is monotonic per stream and previous_hash links to the prior event's event_hash", async () => {
      if (!schemaReady) return;
      const streamTag = "monotonic_" + randomUUID();
      const first = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("mono1")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      const second = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("mono2")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      const firstData = first.json().data;
      const secondData = second.json().data;
      expect(secondData.sequence_no).toBe(firstData.sequence_no + 1);
      expect(secondData.previous_hash).toBe(firstData.event_hash);
    });

    it("rejects a second event on the same idempotency-key + different (source_module,event_id) payload only if fingerprints truly differ; a fresh key with a new event_id ingests independently", async () => {
      if (!schemaReady) return;
      const streamTag = "indep_" + randomUUID();
      const eventA = sampleEvent({ source_emission_stream: streamTag });
      const eventB = sampleEvent({ source_emission_stream: streamTag });
      const resA = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("indep-a")),
        payload: eventA,
      });
      const resB = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("indep-b")),
        payload: eventB,
      });
      expect(resA.statusCode).toBe(200);
      expect(resB.statusCode).toBe(200);
      expect(resA.json().data.audit_event_ref).not.toBe(resB.json().data.audit_event_ref);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Duplicate (source_module, event_id) handling.
  // ---------------------------------------------------------------------------------------
  describe("duplicate event handling", () => {
    it("same source_module + event_id + SAME payload -> idempotent replay, no second row", async () => {
      if (!schemaReady) return;
      const event = sampleEvent();
      const res1 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("dup-same-1")),
        payload: event,
      });
      const res2 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        // Different Idempotency-Key header on purpose — proves the (source_module, event_id)
        // dedup is independent of the HTTP-level Idempotency-Key mechanism.
        headers: ingestHeaders("FND-01", idemKey("dup-same-2")),
        payload: event,
      });
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      const d1 = res1.json().data;
      const d2 = res2.json().data;
      expect(d2.audit_event_ref).toBe(d1.audit_event_ref);
      expect(d2.sequence_no).toBe(d1.sequence_no);
      expect(d2.event_hash).toBe(d1.event_hash);

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.audit_event WHERE event_id = $1`, [
        event.event_id,
      ]);
      expect(rows.rows[0]?.n).toBe(1);
    });

    it("same source_module + event_id + DIFFERENT payload -> SEC1_IDEMPOTENCY_CONFLICT, no second row", async () => {
      if (!schemaReady) return;
      const event = sampleEvent();
      const res1 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("dup-diff-1")),
        payload: event,
      });
      expect(res1.statusCode).toBe(200);

      const res2 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("dup-diff-2")),
        payload: { ...event, action: "a_completely_different_action" },
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json().error.code).toBe("SEC1_IDEMPOTENCY_CONFLICT");

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.audit_event WHERE event_id = $1`, [
        event.event_id,
      ]);
      expect(rows.rows[0]?.n).toBe(1);
    });

    it("replaying the SAME Idempotency-Key + SAME body returns the same result (HTTP-level idempotency layer)", async () => {
      if (!schemaReady) return;
      const event = sampleEvent();
      const key = idemKey("http-replay");
      const res1 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", key),
        payload: event,
      });
      const res2 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", key),
        payload: event,
      });
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res2.json().data.audit_event_ref).toBe(res1.json().data.audit_event_ref);
    });

    it("fails closed with 400 when the Idempotency-Key header is missing", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: { "x-internal-service-token": TOKENS["FND-01"] },
        payload: sampleEvent(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });
  });

  // ---------------------------------------------------------------------------------------
  // Concurrency (IAM-02 F2-class race) — fire concurrent ingest calls at the SAME stream.
  // ---------------------------------------------------------------------------------------
  describe("concurrent ingestion into the same stream", () => {
    it("no two rows share a sequence_no, the chain is genuinely linked end-to-end, and no request loses its row", async () => {
      if (!schemaReady) return;
      const streamTag = "concurrent_" + randomUUID();
      const N = 8;
      const events = Array.from({ length: N }, (_, i) =>
        sampleEvent({ source_emission_stream: streamTag, action: `concurrent.action.${i}` }),
      );

      const responses = await Promise.all(
        events.map((event, i) =>
          app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`concurrent-${i}`)),
            payload: event,
          }),
        ),
      );

      // No request silently lost its row.
      for (const res of responses) {
        expect(res.statusCode).toBe(200);
      }

      const streamId = `FND-01:${streamTag}`;
      const rows = await verifyPool.query<{ sequence_no: string; previous_hash: string | null; event_hash: string }>(
        `SELECT sequence_no, previous_hash, event_hash FROM sec1.audit_event WHERE stream_id = $1 ORDER BY sequence_no ASC`,
        [streamId],
      );
      expect(rows.rows.length).toBe(N);

      // No two rows share a sequence_no (UNIQUE constraint already guarantees this at the DB
      // level, but assert it explicitly here too — a set of N distinct sequential integers).
      const seqNumbers = rows.rows.map((r) => Number(r.sequence_no));
      expect(new Set(seqNumbers).size).toBe(N);
      expect(seqNumbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));

      // The chain is genuinely linked end-to-end: each row's previous_hash equals the prior
      // row's event_hash, and the first row is a true genesis (previous_hash = null).
      expect(rows.rows[0]?.previous_hash).toBeNull();
      for (let i = 1; i < rows.rows.length; i++) {
        expect(rows.rows[i]?.previous_hash).toBe(rows.rows[i - 1]?.event_hash);
      }

      // The audit_stream pointer reflects the LAST event, not a stale/overwritten value.
      const streamRow = await verifyPool.query(
        `SELECT latest_sequence_no, latest_hash FROM sec1.audit_stream WHERE stream_id = $1`,
        [streamId],
      );
      expect(Number(streamRow.rows[0]?.latest_sequence_no)).toBe(N);
      expect(streamRow.rows[0]?.latest_hash).toBe(rows.rows[N - 1]?.event_hash);
    });

    it("concurrent duplicate submissions of the SAME (source_module, event_id) never burn a sequence number", async () => {
      if (!schemaReady) return;
      const streamTag = "concurrent_dup_" + randomUUID();
      const event = sampleEvent({ source_emission_stream: streamTag });

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`concurrent-dup-${i}`)),
            payload: event,
          }),
        ),
      );
      for (const res of responses) {
        expect(res.statusCode).toBe(200);
      }
      const refs = new Set(responses.map((r) => r.json().data.audit_event_ref));
      expect(refs.size).toBe(1); // all 5 resolved to the SAME row

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.audit_event WHERE event_id = $1`, [
        event.event_id,
      ]);
      expect(rows.rows[0]?.n).toBe(1); // exactly one row was ever created

      const streamId = `FND-01:${streamTag}`;
      const streamRow = await verifyPool.query(
        `SELECT latest_sequence_no FROM sec1.audit_stream WHERE stream_id = $1`,
        [streamId],
      );
      expect(Number(streamRow.rows[0]?.latest_sequence_no)).toBe(1); // no burned sequence numbers
    });
  });

  // ---------------------------------------------------------------------------------------
  // Batch ingestion — explicit per-event partial success.
  // ---------------------------------------------------------------------------------------
  describe("batch ingestion", () => {
    it("partial success: one valid event ingests while a sibling with an unknown event_type is rejected, independently", async () => {
      if (!schemaReady) return;
      const streamTag = "batch_" + randomUUID();
      const goodEvent = sampleEvent({ source_emission_stream: streamTag });
      const badEvent = sampleEvent({ source_emission_stream: streamTag, event_type: "fnd01.not_a_real_type" });

      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events/batch",
        headers: ingestHeaders("FND-01", idemKey("batch-partial")),
        payload: { events: [goodEvent, badEvent] },
      });
      expect(res.statusCode).toBe(200);
      const results = res.json().data.results as Array<Record<string, unknown>>;
      expect(results).toHaveLength(2);
      const goodResult = results.find((r) => r.event_id === goodEvent.event_id);
      const badResult = results.find((r) => r.event_id === badEvent.event_id);
      expect(goodResult?.status).toBe("ingested");
      expect(badResult?.status).toBe("rejected");
      expect((badResult?.error as Record<string, unknown>)?.code).toBe("SEC1_EVENT_TYPE_UNKNOWN");

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.audit_event WHERE event_id = $1`, [
        goodEvent.event_id,
      ]);
      expect(rows.rows[0]?.n).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Tamper + sequence-gap detection (DB-backed, using the real integrity helper).
  // ---------------------------------------------------------------------------------------
  describe("tamper + sequence-gap detection", () => {
    it("detects tampering: a recomputed hash mismatching a stored one after a direct DB row edit", async () => {
      if (!schemaReady) return;
      const streamTag = "tamper_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("tamper")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);

      const streamId = `FND-01:${streamTag}`;
      // Simulate an out-of-band tamper attempt directly against the row (never possible
      // through the runtime role's own grant — this uses the superuser verifyPool precisely
      // to prove the DETECTOR catches a tamper that bypassed the append-only grant, e.g. a
      // DBA-level rewrite).
      await verifyPool.query(`UPDATE sec1.audit_event SET result = 'blocked' WHERE stream_id = $1`, [streamId]);

      const row = await verifyPool.query(
        `SELECT event_id, source_module, event_type, event_category, severity, actor_user_id, actor_type,
                session_id, client_id, entity_type, entity_id, action, result, reason_code, request_id,
                correlation_id, occurred_at_utc, source_emission_sequence, source_emission_stream,
                idempotency_key, metadata_redacted, classification, retention_class,
                canonical_format_version, sequence_no, previous_hash, event_hash
           FROM sec1.audit_event WHERE stream_id = $1`,
        [streamId],
      );
      const r = row.rows[0];
      const canonicalFields: CanonicalEventFields = {
        event_id: r.event_id,
        source_module: r.source_module,
        event_type: r.event_type,
        event_category: r.event_category,
        severity: r.severity,
        actor_user_id: r.actor_user_id,
        actor_type: r.actor_type,
        session_id: r.session_id,
        client_id: r.client_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        action: r.action,
        result: r.result,
        reason_code: r.reason_code,
        request_id: r.request_id,
        correlation_id: r.correlation_id,
        occurred_at_utc: r.occurred_at_utc.toISOString(),
        source_emission_sequence: r.source_emission_sequence === null ? null : Number(r.source_emission_sequence),
        source_emission_stream: r.source_emission_stream,
        idempotency_key: r.idempotency_key,
        metadata_redacted: r.metadata_redacted,
        // Phase 3 (L1): reconstruct using the ROW'S OWN canonical_format_version — every real
        // ingest is v2, so classification/retention_class are populated here (omitting them
        // would itself cause a false hashMismatch, exactly the failure mode this versioning
        // model exists to prevent).
        ...(Number(r.canonical_format_version) >= CANONICAL_FORMAT_VERSION_V2
          ? { classification: r.classification, retention_class: r.retention_class }
          : {}),
      };
      const chainRow: ChainRow = {
        sequence_no: Number(r.sequence_no),
        previous_hash: r.previous_hash,
        event_hash: r.event_hash,
        canonicalFields,
      };
      const result = verifyChainSegment([chainRow]);
      expect(result.pass).toBe(false);
      expect(result.hashMismatchAt).toContain(Number(r.sequence_no));
    });

    it("detects a sequence gap after a row is removed out-of-band", async () => {
      if (!schemaReady) return;
      const streamTag = "gap_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`gap-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;

      // Remove the middle row out-of-band (superuser only — role_sec1_runtime has no DELETE
      // grant on this table at all, proven separately above).
      await verifyPool.query(`DELETE FROM sec1.audit_event WHERE stream_id = $1 AND sequence_no = 2`, [streamId]);

      const rows = await verifyPool.query<{ sequence_no: string; previous_hash: string | null; event_hash: string }>(
        `SELECT sequence_no, previous_hash, event_hash FROM sec1.audit_event WHERE stream_id = $1 ORDER BY sequence_no ASC`,
        [streamId],
      );
      const chainRows: ChainRow[] = rows.rows.map((r) => ({
        sequence_no: Number(r.sequence_no),
        previous_hash: r.previous_hash,
        event_hash: r.event_hash,
      }));
      const result = verifyChainSegment(chainRows);
      expect(result.pass).toBe(false);
      expect(result.gapAt).toContain(3);
    });
  });

  // ---------------------------------------------------------------------------------------
  // F1 regression (Opus review, docs/SEC-01_Security_Review_Opus_v0.1.md): the canonical hash
  // and the stored `event_category` column must be resolved from the SAME value. Before the
  // fix, an event that OMITTED `event_category` hashed against `null` but stored the
  // schema-defaulted category — reconstructing canonical fields from the stored row (exactly
  // what tamper verification does) then recomputed a DIFFERENT hash and falsely reported
  // `hashMismatch` on an untampered event.
  // ---------------------------------------------------------------------------------------
  describe("F1 fix: event_category hash/column consistency", () => {
    async function ingestAndReconstruct(streamTag: string, includeCategory: boolean) {
      const overrides: Record<string, unknown> = { source_emission_stream: streamTag };
      const base = sampleEvent(overrides);
      if (!includeCategory) delete (base as Record<string, unknown>).event_category;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey(`f1-${streamTag}`)),
        payload: base,
      });
      expect(res.statusCode).toBe(200);

      const streamId = `FND-01:${streamTag}`;
      const row = (
        await verifyPool.query(
          `SELECT event_id, source_module, event_type, event_category, severity, actor_user_id, actor_type,
                  session_id, client_id, entity_type, entity_id, action, result, reason_code, request_id,
                  correlation_id, occurred_at_utc, source_emission_sequence, source_emission_stream,
                  idempotency_key, metadata_redacted, classification, retention_class,
                  canonical_format_version, sequence_no, previous_hash, event_hash
             FROM sec1.audit_event WHERE stream_id = $1`,
          [streamId],
        )
      ).rows[0];
      const canonicalFields: CanonicalEventFields = {
        event_id: row.event_id,
        source_module: row.source_module,
        event_type: row.event_type,
        event_category: row.event_category,
        severity: row.severity,
        actor_user_id: row.actor_user_id,
        actor_type: row.actor_type,
        session_id: row.session_id,
        client_id: row.client_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        result: row.result,
        reason_code: row.reason_code,
        request_id: row.request_id,
        correlation_id: row.correlation_id,
        occurred_at_utc: row.occurred_at_utc.toISOString(),
        source_emission_sequence: row.source_emission_sequence === null ? null : Number(row.source_emission_sequence),
        source_emission_stream: row.source_emission_stream,
        idempotency_key: row.idempotency_key,
        metadata_redacted: row.metadata_redacted,
        // Phase 3 (L1): version-aware reconstruction — every real ingest is v2 (see
        // ingest.ts), so classification/retention_class are populated here.
        ...(Number(row.canonical_format_version) >= CANONICAL_FORMAT_VERSION_V2
          ? { classification: row.classification, retention_class: row.retention_class }
          : {}),
      };
      return { row, chainRow: { sequence_no: Number(row.sequence_no), previous_hash: row.previous_hash, event_hash: row.event_hash, canonicalFields } as ChainRow };
    }

    it("1. ingests an event WITH explicit event_category and verifies clean", async () => {
      if (!schemaReady) return;
      const { chainRow } = await ingestAndReconstruct("f1_with_cat_" + randomUUID(), true);
      const result = verifyChainSegment([chainRow]);
      expect(result.pass).toBe(true);
      expect(result.hashMismatchAt).toHaveLength(0);
    });

    it("2+3+4. ingests an event OMITTING event_category: stores the schema-defaulted category, recomputed hash equals stored event_hash, and verifies clean (no false hashMismatch)", async () => {
      if (!schemaReady) return;
      const { row, chainRow } = await ingestAndReconstruct("f1_omit_cat_" + randomUUID(), false);
      // The stored column is the schema default (never null-vs-default divergence).
      expect(row.event_category).toBe("system"); // fnd01.generic_event's seeded default_severity category
      const result = verifyChainSegment([chainRow]);
      expect(result.pass).toBe(true);
      expect(result.hashMismatchAt).toHaveLength(0); // F1 regression: this used to be [sequence_no]
    });

    it("5. tampering an event that OMITTED event_category is still correctly detected as a hashMismatch (the fix did not disable tamper detection)", async () => {
      if (!schemaReady) return;
      const { row } = await ingestAndReconstruct("f1_tamper_omit_cat_" + randomUUID(), false);
      await verifyPool.query(`UPDATE sec1.audit_event SET result = 'blocked' WHERE event_id = $1`, [row.event_id]);
      const tampered = (
        await verifyPool.query(
          `SELECT event_id, source_module, event_type, event_category, severity, actor_user_id, actor_type,
                  session_id, client_id, entity_type, entity_id, action, result, reason_code, request_id,
                  correlation_id, occurred_at_utc, source_emission_sequence, source_emission_stream,
                  idempotency_key, metadata_redacted, classification, retention_class,
                  canonical_format_version, sequence_no, previous_hash, event_hash
             FROM sec1.audit_event WHERE event_id = $1`,
          [row.event_id],
        )
      ).rows[0];
      const canonicalFields: CanonicalEventFields = {
        event_id: tampered.event_id,
        source_module: tampered.source_module,
        event_type: tampered.event_type,
        event_category: tampered.event_category,
        severity: tampered.severity,
        actor_user_id: tampered.actor_user_id,
        actor_type: tampered.actor_type,
        session_id: tampered.session_id,
        client_id: tampered.client_id,
        entity_type: tampered.entity_type,
        entity_id: tampered.entity_id,
        action: tampered.action,
        result: tampered.result,
        reason_code: tampered.reason_code,
        request_id: tampered.request_id,
        correlation_id: tampered.correlation_id,
        occurred_at_utc: tampered.occurred_at_utc.toISOString(),
        source_emission_sequence: tampered.source_emission_sequence === null ? null : Number(tampered.source_emission_sequence),
        source_emission_stream: tampered.source_emission_stream,
        idempotency_key: tampered.idempotency_key,
        metadata_redacted: tampered.metadata_redacted,
        ...(Number(tampered.canonical_format_version) >= CANONICAL_FORMAT_VERSION_V2
          ? { classification: tampered.classification, retention_class: tampered.retention_class }
          : {}),
      };
      const chainRow: ChainRow = {
        sequence_no: Number(tampered.sequence_no),
        previous_hash: tampered.previous_hash,
        event_hash: tampered.event_hash,
        canonicalFields,
      };
      const result = verifyChainSegment([chainRow]);
      expect(result.pass).toBe(false);
      expect(result.hashMismatchAt).toContain(Number(tampered.sequence_no));
    });
  });

  // ---------------------------------------------------------------------------------------
  // Internal seal stub.
  // ---------------------------------------------------------------------------------------
  describe("internal seal stub", () => {
    it("seals a batch with seal_method='internal' and null external anchor/timestamp refs", async () => {
      if (!schemaReady) return;
      const streamTag = "seal_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`seal-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      const { getPool } = await import("@aix/foundation");
      const { sealBatch } = await import("../../services/sec1/src/lib/seal.js");
      const result = await withTransaction((client) =>
        sealBatch(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3, sealControllerId: "it_seal_controller" }),
      );
      expect(result.sealMethod).toBe("internal");
      expect(result.externalAnchorRef).toBeNull();
      expect(result.trustedTimestampRef).toBeNull();
      expect(result.verificationStatus).toBe("pending");

      const row = await getPool().query(
        `SELECT seal_method, external_anchor_ref, trusted_timestamp_ref, verification_status
           FROM sec1.audit_seal_batch WHERE seal_batch_id = $1`,
        [result.sealBatchId],
      );
      expect(row.rows[0]?.seal_method).toBe("internal");
      expect(row.rows[0]?.external_anchor_ref).toBeNull();
      expect(row.rows[0]?.trusted_timestamp_ref).toBeNull();
      expect(row.rows[0]?.verification_status).toBe("pending");
    });
  });

  // ---------------------------------------------------------------------------------------
  // FND-01 audit publisher — real end-to-end proof (not just the unit-level fake-client test)
  // that publishAudit's enhanced outbox payload lands in a real foundation.outbox_event row.
  // ---------------------------------------------------------------------------------------
  describe("FND audit publisher produces the enhanced outbox payload (real DB)", () => {
    it("a real publishAudit call with source_module='FND-01' persists a payload_ref carrying it", async () => {
      if (!schemaReady) return;
      // Deliberately NOT using @aix/foundation's process-wide getPool()/withTransaction() here
      // — this test file's beforeAll already initialised that singleton pool scoped to
      // role_sec1_runtime (SELECT+UPDATE-only on foundation.outbox_event, by design — SEC-01
      // is a CONSUMER, not a producer, of this table). Proving the FND-01 audit publisher
      // still works end-to-end needs a connection that's actually allowed to INSERT; a raw
      // client off the superuser verifyPool (already used for fixture/verification queries
      // throughout this file) exercises the REAL publishAudit/enqueueOutbox code path without
      // being entangled in role-grant enforcement, which is what this specific test is about.
      const entityId = "it_entity_" + randomUUID();
      const rawClient = await verifyPool.connect();
      try {
        await rawClient.query("BEGIN");
        await publishAudit(rawClient, {
          event_type: "foundation.job.enqueued",
          source_module: "FND-01",
          actor_id: "it_actor",
          actor_type: "service",
          entity_type: "job_queue_message",
          entity_id: entityId,
          severity: "medium",
          action: "job.enqueue",
          result: "success",
        });
        await rawClient.query("COMMIT");
      } catch (err) {
        await rawClient.query("ROLLBACK");
        throw err;
      } finally {
        rawClient.release();
      }
      const row = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'foundation.job.enqueued' AND payload_ref LIKE $1`,
        [`%${entityId}%`],
      );
      expect(row.rowCount).toBeGreaterThan(0);
      const payload = JSON.parse(row.rows[0].payload_ref);
      expect(payload.source_module).toBe("FND-01");
      expect(payload.severity).toBe("medium");
      expect(payload.action).toBe("job.enqueue");
      expect(payload.result).toBe("success");
    });
  });

  // Sanity: canonicalJson is exercised by the real ingest path too (not JUST the unit test) —
  // confirm the exported helper is deterministic against a real ingested row's own fields.
  describe("canonical JSON sanity (real DB row)", () => {
    it("recomputing canonical JSON for the same fields twice yields identical output", async () => {
      if (!schemaReady) return;
      const fields = { a: 1, b: { z: 1, a: 2 }, c: [3, 2, 1] };
      expect(canonicalJson(fields)).toBe(canonicalJson({ c: [3, 2, 1], b: { a: 2, z: 1 }, a: 1 }));
    });
  });

  // =========================================================================================
  // PHASE 3 — canonical_format_version (L1) versioning, real DB.
  // =========================================================================================
  describe("Phase 3: canonical_format_version (L1) versioning (real DB)", () => {
    it("a new event ingested through the real route gets canonical_format_version = 2, with classification/retention_class populated in the stored row", async () => {
      if (!schemaReady) return;
      const streamTag = "l1_v2_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-v2")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const row = (
        await verifyPool.query(
          `SELECT canonical_format_version, classification, retention_class FROM sec1.audit_event WHERE stream_id = $1`,
          [streamId],
        )
      ).rows[0];
      expect(Number(row.canonical_format_version)).toBe(2);
      expect(row.classification).toBeTruthy();
      expect(row.retention_class).toBeTruthy();
    });

    it("tampering classification on a v2 row is detected as a hashMismatch via the real runIntegrityVerification wrapper", async () => {
      if (!schemaReady) return;
      const streamTag = "l1_tamper_cls_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-tamper-cls")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;

      await verifyPool.query(`UPDATE sec1.audit_event SET classification = 'public' WHERE stream_id = $1`, [
        streamId,
      ]);

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1 }),
      );
      expect(result.result).toBe("fail");
      expect(result.mismatch_count).toBeGreaterThan(0);
      expect(result.findings.hashMismatchAt).toContain(1);
    });

    it("tampering retention_class on a v2 row is detected as a hashMismatch via the real runIntegrityVerification wrapper", async () => {
      if (!schemaReady) return;
      const streamTag = "l1_tamper_ret_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-tamper-ret")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;

      await verifyPool.query(`UPDATE sec1.audit_event SET retention_class = 'extended' WHERE stream_id = $1`, [
        streamId,
      ]);

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1 }),
      );
      expect(result.result).toBe("fail");
      expect(result.mismatch_count).toBeGreaterThan(0);
      expect(result.findings.hashMismatchAt).toContain(1);
    });

    it("a genuine v1 row (canonical_format_version=1, hash computed WITHOUT classification/retention_class) verifies clean and is NOT falsely mismatched by v2 code existing in the codebase", async () => {
      if (!schemaReady) return;
      const streamId = "FND-01:l1_v1_row_" + randomUUID();
      await insertV1Row({ streamId, sourceModule: "FND-01", sequenceNo: 1, previousHash: null });

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1 }),
      );
      expect(result.result).toBe("pass");
      expect(result.mismatch_count).toBe(0);
      expect(result.gap_count).toBe(0);
    });

    it("a MIXED-version range (a v1 legacy row followed by real v2-ingested rows in the SAME stream) verifies clean end-to-end", async () => {
      if (!schemaReady) return;
      const streamTag = "l1_mixed_" + randomUUID();
      const streamId = `FND-01:${streamTag}`;

      // sequence_no 1: a genuine v1 row, inserted directly (simulating pre-Phase-3 history).
      const v1 = await insertV1Row({ streamId, sourceModule: "FND-01", sequenceNo: 1, previousHash: null });

      // sequence_no 2 and 3: REAL ingests through the actual route — always v2 — chaining
      // their previous_hash onto the v1 row via the stream pointer insertV1Row synced.
      const res2 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-mixed-2")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().data.sequence_no).toBe(2);
      expect(res2.json().data.previous_hash).toBe(v1.eventHash);

      const res3 = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-mixed-3")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res3.statusCode).toBe(200);
      expect(res3.json().data.sequence_no).toBe(3);

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3 }),
      );
      expect(result.result).toBe("pass");
      expect(result.gap_count).toBe(0);
      expect(result.mismatch_count).toBe(0);
      expect(result.findings.gapAt).toEqual([]);
      expect(result.findings.hashMismatchAt).toEqual([]);
    });

    it("omitted event_category still verifies clean (F1 regression unaffected by Phase 3's classification/retention_class additions)", async () => {
      if (!schemaReady) return;
      const streamTag = "l1_f1_regress_" + randomUUID();
      const payload = sampleEvent({ source_emission_stream: streamTag }) as Record<string, unknown>;
      delete payload.event_category;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("l1-f1-regress")),
        payload,
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1 }),
      );
      expect(result.result).toBe("pass");
      expect(result.mismatch_count).toBe(0);
    });
  });

  // =========================================================================================
  // PHASE 3 — DB-backed integrity verification run (lib/integrity.ts runIntegrityVerification).
  // =========================================================================================
  describe("Phase 3: integrity verification run (runIntegrityVerification, real DB)", () => {
    it("a clean range persists result='pass' with zero gap/mismatch counts", async () => {
      if (!schemaReady) return;
      const streamTag = "iv_clean_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`iv-clean-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3 }),
      );
      expect(result.result).toBe("pass");
      expect(result.gap_count).toBe(0);
      expect(result.mismatch_count).toBe(0);
      expect(result.verification_id).toMatch(/^iv_/);
      expect(result.stream_id).toBe(streamId);

      // Persisted row is really there (not just returned from memory).
      const persisted = await verifyPool.query(
        `SELECT result, gap_count, mismatch_count, findings FROM sec1.integrity_verification_run WHERE verification_id = $1`,
        [result.verification_id],
      );
      expect(persisted.rows[0]?.result).toBe("pass");
      expect(Number(persisted.rows[0]?.gap_count)).toBe(0);
      expect(Number(persisted.rows[0]?.mismatch_count)).toBe(0);
    });

    it("a range with a deleted row (out-of-band) persists gap_count > 0 and result='fail', with the exact sequence number in findings", async () => {
      if (!schemaReady) return;
      const streamTag = "iv_gap_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`iv-gap-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      await verifyPool.query(`DELETE FROM sec1.audit_event WHERE stream_id = $1 AND sequence_no = 2`, [streamId]);

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3 }),
      );
      expect(result.result).toBe("fail");
      expect(result.gap_count).toBeGreaterThan(0);
      expect(result.findings.gapAt).toContain(3);
    });

    it("a range with a tampered row (event_hash recompute mismatch) persists mismatch_count > 0 and result='fail', with the exact sequence number in findings", async () => {
      if (!schemaReady) return;
      const streamTag = "iv_mismatch_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("iv-mismatch")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      await verifyPool.query(`UPDATE sec1.audit_event SET result = 'blocked' WHERE stream_id = $1`, [streamId]);

      const result = await withTransaction((client) =>
        runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1 }),
      );
      expect(result.result).toBe("fail");
      expect(result.mismatch_count).toBeGreaterThan(0);
      expect(result.findings.hashMismatchAt).toContain(1);
    });

    it("sec1.audit_event is provably UNCHANGED by running verification (read before/after, compare)", async () => {
      if (!schemaReady) return;
      const streamTag = "iv_readonly_" + randomUUID();
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`iv-readonly-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      const before = await verifyPool.query(
        `SELECT sequence_no, event_hash, previous_hash, classification, retention_class, canonical_format_version
           FROM sec1.audit_event WHERE stream_id = $1 ORDER BY sequence_no ASC`,
        [streamId],
      );

      await withTransaction((client) => runIntegrityVerification(client, { streamId, fromSequenceNo: 1, toSequenceNo: 2 }));

      const after = await verifyPool.query(
        `SELECT sequence_no, event_hash, previous_hash, classification, retention_class, canonical_format_version
           FROM sec1.audit_event WHERE stream_id = $1 ORDER BY sequence_no ASC`,
        [streamId],
      );
      expect(after.rows).toEqual(before.rows);
    });
  });

  // =========================================================================================
  // PHASE 3 — seal verification (lib/seal.ts verifySealBatch).
  // =========================================================================================
  describe("Phase 3: seal verification (verifySealBatch, real DB)", () => {
    it("a clean sealed range verifies as 'valid' with production_authoritative: false", async () => {
      if (!schemaReady) return;
      const streamTag = "sealv_clean_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`sealv-clean-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      const sealed = await withTransaction((client) =>
        sealBatch(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3, sealControllerId: "it_seal_controller" }),
      );
      const verified = await withTransaction((client) => verifySealBatch(client, sealed.sealBatchId));
      expect(verified.verification_status).toBe("valid");
      expect(verified.recomputed_batch_hash).toBe(sealed.batchHash);
      expect(verified.stored_batch_hash).toBe(sealed.batchHash);
      expect(verified.production_authoritative).toBe(false);
    });

    it("a tampered range (an out-of-band event_hash edit within the sealed range) verifies as 'failed'", async () => {
      if (!schemaReady) return;
      const streamTag = "sealv_tamper_" + randomUUID();
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`sealv-tamper-${i}`)),
          payload: sampleEvent({ source_emission_stream: streamTag }),
        });
        expect(res.statusCode).toBe(200);
      }
      const streamId = `FND-01:${streamTag}`;
      const sealed = await withTransaction((client) =>
        sealBatch(client, { streamId, fromSequenceNo: 1, toSequenceNo: 3, sealControllerId: "it_seal_controller" }),
      );

      // Out-of-band tamper of one row's event_hash WITHIN the sealed range — never possible
      // through role_sec1_runtime's own grant (no UPDATE on audit_event at all); uses the
      // superuser verifyPool precisely to simulate a DBA-level rewrite the detector must catch.
      await verifyPool.query(
        `UPDATE sec1.audit_event SET event_hash = 'tampered_hash_value' WHERE stream_id = $1 AND sequence_no = 2`,
        [streamId],
      );

      const verified = await withTransaction((client) => verifySealBatch(client, sealed.sealBatchId));
      expect(verified.verification_status).toBe("failed");
      expect(verified.recomputed_batch_hash).not.toBe(verified.stored_batch_hash);
      expect(verified.production_authoritative).toBe(false);
    });

    it("verification updates ONLY verification_status — seal_method/external_anchor_ref/trusted_timestamp_ref are unchanged from what sealBatch originally wrote", async () => {
      if (!schemaReady) return;
      const streamTag = "sealv_writeset_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("sealv-writeset")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(res.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const sealed = await withTransaction((client) =>
        sealBatch(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1, sealControllerId: "it_seal_controller" }),
      );

      const beforeRow = await verifyPool.query(
        `SELECT seal_method, external_anchor_ref, trusted_timestamp_ref, verification_status
           FROM sec1.audit_seal_batch WHERE seal_batch_id = $1`,
        [sealed.sealBatchId],
      );
      expect(beforeRow.rows[0]?.verification_status).toBe("pending");

      await withTransaction((client) => verifySealBatch(client, sealed.sealBatchId));

      const afterRow = await verifyPool.query(
        `SELECT seal_method, external_anchor_ref, trusted_timestamp_ref, verification_status
           FROM sec1.audit_seal_batch WHERE seal_batch_id = $1`,
        [sealed.sealBatchId],
      );
      expect(afterRow.rows[0]?.seal_method).toBe(beforeRow.rows[0]?.seal_method);
      expect(afterRow.rows[0]?.external_anchor_ref).toBe(beforeRow.rows[0]?.external_anchor_ref);
      expect(afterRow.rows[0]?.trusted_timestamp_ref).toBe(beforeRow.rows[0]?.trusted_timestamp_ref);
      expect(afterRow.rows[0]?.seal_method).toBe("internal");
      expect(afterRow.rows[0]?.external_anchor_ref).toBeNull();
      expect(afterRow.rows[0]?.trusted_timestamp_ref).toBeNull();
      expect(afterRow.rows[0]?.verification_status).toBe("valid");
    });
  });

  // =========================================================================================
  // PHASE 3 — internal routes (generic internal-identity guard; not source-identity).
  // =========================================================================================
  describe("Phase 3: internal routes — seal-batch verify + integrity verify-range", () => {
    it("POST /internal/sec1/seal-batches/:seal_batch_id/verify rejects with no internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/seal-batches/seal_does_not_matter/verify",
        headers: { "idempotency-key": idemKey("seal-route-no-token") },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("POST /internal/sec1/seal-batches/:seal_batch_id/verify rejects a per-module INGEST token (wrong guard's secret)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/seal-batches/seal_does_not_matter/verify",
        headers: { "x-internal-service-token": TOKENS["FND-01"], "idempotency-key": idemKey("seal-route-wrong-token") },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("POST /internal/sec1/seal-batches/:seal_batch_id/verify fails closed with 400 when Idempotency-Key is missing", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/seal-batches/seal_does_not_matter/verify",
        headers: { "x-internal-service-token": config.sec1InternalServiceToken },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("POST /internal/sec1/seal-batches/:seal_batch_id/verify returns 404 NOT_FOUND for an unknown seal_batch_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/seal-batches/seal_totally_unknown_id/verify",
        headers: internalHeaders(idemKey("seal-route-unknown")),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });

    it("POST /internal/sec1/seal-batches/:seal_batch_id/verify succeeds end-to-end via HTTP with the generic internal-identity token", async () => {
      if (!schemaReady) return;
      const streamTag = "seal_route_ok_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("seal-route-ok-ingest")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const sealed = await withTransaction((client) =>
        sealBatch(client, { streamId, fromSequenceNo: 1, toSequenceNo: 1, sealControllerId: "it_seal_controller" }),
      );

      const res = await app.inject({
        method: "POST",
        url: `/internal/sec1/seal-batches/${sealed.sealBatchId}/verify`,
        headers: internalHeaders(idemKey("seal-route-ok")),
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.verification_status).toBe("valid");
      expect(data.production_authoritative).toBe(false);
    });

    it("POST /internal/sec1/integrity/verify-range rejects with no internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: { "idempotency-key": idemKey("iv-route-no-token") },
        payload: { stream_id: "FND-01", from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("POST /internal/sec1/integrity/verify-range fails closed with 400 when Idempotency-Key is missing", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: { "x-internal-service-token": config.sec1InternalServiceToken },
        payload: { stream_id: "FND-01", from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("POST /internal/sec1/integrity/verify-range rejects from_sequence_no > to_sequence_no with VALIDATION_ERROR", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("iv-route-bad-range")),
        payload: { stream_id: "FND-01", from_sequence_no: 5, to_sequence_no: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /internal/sec1/integrity/verify-range rejects an unknown extra body field (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("iv-route-extra-field")),
        payload: { stream_id: "FND-01", from_sequence_no: 1, to_sequence_no: 1, unexpected_field: "x" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("POST /internal/sec1/integrity/verify-range succeeds end-to-end via HTTP with the generic internal-identity token", async () => {
      if (!schemaReady) return;
      const streamTag = "iv_route_ok_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("iv-route-ok-ingest")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;

      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("iv-route-ok")),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.result).toBe("pass");
      expect(data.gap_count).toBe(0);
      expect(data.mismatch_count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  // P3-F1 gap patch regression (Opus review, docs/SEC-01_Phase3_Security_Review_Opus_v0.1.md):
  // occurred_at_utc is now normalized ONCE at ingest (new Date(input).toISOString()) and that
  // SAME normalized string is used for both the hash and the INSERT, so the hashed
  // representation and what Postgres's timestamptz round-trips back agree by construction.
  // Before the fix, every one of these non-`toISOString`-shaped inputs falsely reported
  // hashMismatch even though the event was never tampered with.
  // ---------------------------------------------------------------------------------------
  describe("P3-F1 gap patch: occurred_at_utc hash/reconstruction normalization", () => {
    async function ingestAndVerify(streamTag: string, occurredAtUtc: string) {
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey(`p3f1-${streamTag}`)),
        payload: sampleEvent({ source_emission_stream: streamTag, occurred_at_utc: occurredAtUtc }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey(`p3f1-verify-${streamTag}`)),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      return { streamId, verifyRes };
    }

    it("1. ingests with the blueprint's own API-sample format ('...T00:00:00Z', no millis) and verify-range passes (previously a FALSE hashMismatch)", async () => {
      if (!schemaReady) return;
      const { verifyRes } = await ingestAndVerify("p3f1_blueprint_sample_" + randomUUID(), "2026-01-01T00:00:00Z");
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("pass");
      expect(data.mismatch_count).toBe(0);
    });

    it("2. ingests with a '+00:00' offset form and verify-range passes (previously a FALSE hashMismatch)", async () => {
      if (!schemaReady) return;
      const { verifyRes } = await ingestAndVerify("p3f1_offset_form_" + randomUUID(), "2026-01-01T00:00:00+00:00");
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("pass");
      expect(data.mismatch_count).toBe(0);
    });

    it("3. ingests with Postgres-native microsecond precision and verify-range passes (previously a FALSE hashMismatch)", async () => {
      if (!schemaReady) return;
      const { verifyRes } = await ingestAndVerify("p3f1_microsecond_" + randomUUID(), "2026-01-01T00:00:00.123456Z");
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("pass");
      expect(data.mismatch_count).toBe(0);
    });

    it("4. a genuinely tampered row (post-normalization) STILL fails verify-range — the fix did not weaken tamper detection", async () => {
      if (!schemaReady) return;
      const streamTag = "p3f1_tamper_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey(`p3f1-tamper-ingest`)),
        payload: sampleEvent({ source_emission_stream: streamTag, occurred_at_utc: "2026-01-01T00:00:00Z" }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;

      // Out-of-band tamper (superuser pool — role_sec1_runtime has no UPDATE grant on
      // audit_event at all), same technique as the existing "tamper + sequence-gap detection"
      // suite above.
      await verifyPool.query(`UPDATE sec1.audit_event SET result = 'blocked' WHERE stream_id = $1`, [streamId]);

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("p3f1-tamper-verify")),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("fail");
      expect(data.mismatch_count).toBe(1);
    });

    it("4b. tampering occurred_at_utc ITSELF (the exact field this patch normalizes) after insert still causes a hashMismatch", async () => {
      if (!schemaReady) return;
      const streamTag = "p3f1_tamper_occurred_at_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("p3f1-tamper-occurred-at-ingest")),
        payload: sampleEvent({ source_emission_stream: streamTag, occurred_at_utc: "2026-01-01T00:00:00Z" }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;

      // Out-of-band tamper of the occurred_at_utc column itself (superuser pool — no other
      // way to write it; role_sec1_runtime has no UPDATE grant on audit_event at all).
      await verifyPool.query(
        `UPDATE sec1.audit_event SET occurred_at_utc = occurred_at_utc + interval '1 hour' WHERE stream_id = $1`,
        [streamId],
      );

      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("p3f1-tamper-occurred-at-verify")),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("fail");
      expect(data.mismatch_count).toBe(1);
    });

    it("5. rejects an unparseable occurred_at_utc with SEC1_AUDIT_EVENT_INVALID (fail closed rather than hashing/storing garbage)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("p3f1-invalid-timestamp")),
        payload: sampleEvent({ occurred_at_utc: "not-a-real-timestamp" }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("SEC1_AUDIT_EVENT_INVALID");
    });
  });

  // ---------------------------------------------------------------------------------------
  // P3-L1 gap patch regression: a verify-range retry with the SAME Idempotency-Key + SAME body
  // must return the ORIGINAL recorded run, not insert a second integrity_verification_run row.
  // ---------------------------------------------------------------------------------------
  describe("P3-L1 gap patch: verify-range idempotent replay does not duplicate the run row", () => {
    it("6. replaying the SAME Idempotency-Key + SAME body returns the same verification_id and inserts only ONE run row", async () => {
      if (!schemaReady) return;
      const streamTag = "p3l1_replay_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("p3l1-ingest")),
        payload: sampleEvent({ source_emission_stream: streamTag }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const body = { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 };
      const replayKey = idemKey("p3l1-verify-range-replay");

      const first = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(replayKey),
        payload: body,
      });
      expect(first.statusCode).toBe(200);
      const firstId = first.json().data.verification_id;

      const second = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(replayKey),
        payload: body,
      });
      expect(second.statusCode).toBe(200);
      const secondId = second.json().data.verification_id;
      expect(secondId).toBe(firstId);

      const rows = await verifyPool.query(
        `SELECT count(*)::int AS n FROM sec1.integrity_verification_run WHERE verification_id = $1`,
        [firstId],
      );
      expect(rows.rows[0].n).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------
  // Similar-field review (P3-F1 gap patch follow-up, per the Opus review's own suggestion):
  // `metadata_redacted` and `source_emission_sequence` are the other two fields bound into the
  // hash whose STORED representation could, in principle, diverge from what was hashed on a
  // DB round-trip (the same failure class as P3-F1's occurred_at_utc). Both were analyzed and
  // found NOT to carry the same risk:
  //   - metadata_redacted: the hash binds canonicalJson() over the in-memory, ALREADY-PARSED
  //     JS object (never the caller's raw JSON text), and reconstruction re-parses the stored
  //     jsonb back into a JS object and runs it through the SAME canonicalJson(). Both paths
  //     always go through JS's own number/string canonicalization, so jsonb's internal
  //     re-formatting of the stored text (key order, numeric literal spelling) cannot cause a
  //     divergence — unlike occurred_at_utc, there was never a "raw string vs DB-normalized
  //     string" mismatch here to begin with.
  //   - source_emission_sequence: stored as `bigint`; node-postgres returns bigint columns as
  //     strings specifically to avoid JS float precision loss, and `lib/integrity.ts` converts
  //     via `Number(...)`. Within Number.MAX_SAFE_INTEGER, this round-trips exactly. Beyond it,
  //     precision is already lost at the JSON-wire-parsing step (Fastify/TypeBox parse the
  //     caller's JSON body into a JS number BEFORE this code ever sees it) — a pre-existing,
  //     systemic JSON/JS-number ceiling that applies to any JSON API accepting large integers,
  //     not a divergence this patch introduces or could introduce by normalizing differently on
  //     one side vs the other. Out of scope to change (would require a wire-format change to
  //     accept the field as a string), per the task brief's "do not expand scope unless you
  //     find the same hash/store divergence risk" — no such risk was found.
  // These two tests are a concrete proof of the above, not evidence of a bug.
  // ---------------------------------------------------------------------------------------
  describe("Similar-field review: metadata_redacted / source_emission_sequence hash/reconstruction stability", () => {
    it("metadata_redacted with nested objects/arrays and numeric values round-trips through jsonb and verifies clean", async () => {
      if (!schemaReady) return;
      const streamTag = "similarfield_metadata_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("similarfield-metadata-ingest")),
        payload: sampleEvent({
          source_emission_stream: streamTag,
          metadata: {
            nested: { z: 1, a: 2.5, list: [3, 1, 2] },
            count: 100,
            trailingZeroFloat: 1.5,
            note: "similar-field review",
          },
        }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("similarfield-metadata-verify")),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("pass");
      expect(data.mismatch_count).toBe(0);
    });

    it("source_emission_sequence at Number.MAX_SAFE_INTEGER round-trips through bigint and verifies clean", async () => {
      if (!schemaReady) return;
      const streamTag = "similarfield_seq_" + randomUUID();
      const ingestRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("similarfield-seq-ingest")),
        payload: sampleEvent({
          source_emission_stream: streamTag,
          source_emission_sequence: Number.MAX_SAFE_INTEGER,
        }),
      });
      expect(ingestRes.statusCode).toBe(200);
      const streamId = `FND-01:${streamTag}`;
      const verifyRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/integrity/verify-range",
        headers: internalHeaders(idemKey("similarfield-seq-verify")),
        payload: { stream_id: streamId, from_sequence_no: 1, to_sequence_no: 1 },
      });
      expect(verifyRes.statusCode).toBe(200);
      const data = verifyRes.json().data;
      expect(data.result).toBe("pass");
      expect(data.mismatch_count).toBe(0);
    });
  });

  // =========================================================================================
  // PHASE 3 — grants (migration 009_sec1_integrity_verification.cjs).
  // =========================================================================================
  describe("Phase 3: grants (migration 009)", () => {
    it("role_sec1_runtime can SELECT and INSERT sec1.integrity_verification_run", async () => {
      if (!schemaReady) return;
      const selectAllowed = await verifyPool.query(
        `SELECT has_table_privilege('role_sec1_runtime', 'sec1.integrity_verification_run', 'SELECT') AS allowed`,
      );
      const insertAllowed = await verifyPool.query(
        `SELECT has_table_privilege('role_sec1_runtime', 'sec1.integrity_verification_run', 'INSERT') AS allowed`,
      );
      expect(selectAllowed.rows[0]?.allowed).toBe(true);
      expect(insertAllowed.rows[0]?.allowed).toBe(true);
    });

    it("role_sec1_runtime can UPDATE sec1.audit_seal_batch.verification_status specifically (column-level grant works)", async () => {
      if (!schemaReady) return;
      const columnAllowed = await verifyPool.query(
        `SELECT has_column_privilege('role_sec1_runtime', 'sec1.audit_seal_batch', 'verification_status', 'UPDATE') AS allowed`,
      );
      expect(columnAllowed.rows[0]?.allowed).toBe(true);

      // Prove it PRACTICALLY works too (not just catalog metadata) — done above by
      // verifySealBatch's own successful UPDATE in the seal-verification describe block; this
      // test is the direct catalog-level confirmation the brief asks for explicitly.
      const { getPool } = await import("@aix/foundation");
      await expect(
        getPool().query(`UPDATE sec1.audit_seal_batch SET verification_status = verification_status WHERE 1=0`),
      ).resolves.toBeDefined();
    });

    it("role_sec1_runtime still CANNOT UPDATE/DELETE sec1.audit_event (append-only posture unchanged by migration 009)", async () => {
      if (!schemaReady) return;
      const { getPool } = await import("@aix/foundation");
      await expect(
        getPool().query("UPDATE sec1.audit_event SET status = 'archived' WHERE 1=0"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(getPool().query("DELETE FROM sec1.audit_event WHERE 1=0")).rejects.toMatchObject({
        code: "42501",
      });
    });

    it("other module runtime roles (fnd/iam/iam2) did NOT gain any new SEC-01 privileges from migration 009", async () => {
      if (!schemaReady) return;
      for (const role of ["role_fnd_runtime", "role_iam_runtime", "role_iam2_runtime"]) {
        const selectIv = await verifyPool.query(
          `SELECT has_table_privilege($1, 'sec1.integrity_verification_run', 'SELECT') AS allowed`,
          [role],
        );
        const insertIv = await verifyPool.query(
          `SELECT has_table_privilege($1, 'sec1.integrity_verification_run', 'INSERT') AS allowed`,
          [role],
        );
        const updateSealCol = await verifyPool.query(
          `SELECT has_column_privilege($1, 'sec1.audit_seal_batch', 'verification_status', 'UPDATE') AS allowed`,
          [role],
        );
        expect(selectIv.rows[0]?.allowed, `${role} SELECT integrity_verification_run`).toBe(false);
        expect(insertIv.rows[0]?.allowed, `${role} INSERT integrity_verification_run`).toBe(false);
        expect(updateSealCol.rows[0]?.allowed, `${role} UPDATE audit_seal_batch.verification_status`).toBe(false);
      }
    });
  });

  // =========================================================================================
  // PHASE 4 — audit read/search, sensitive-read logging, IAM-02 permission guard integration.
  // =========================================================================================
  //
  // config.iam2FetchImpl (Sec1Config's Phase 4 DI seam, mirroring Iam2Config.iam01FetchImpl and
  // this file's own existing use of it via config.sec1InternalServiceToken) is stubbed for
  // EVERY test below — no live IAM-02 service is started, exactly the same precedent
  // tests/integration/iam2-db.test.ts already set for its own IAM-01 dependency
  // (makeFakeIam01Fetch). What IS real: the sec1 DB, role_sec1_runtime, the actual HTTP routes,
  // the actual redaction/query/logging code, and (in the "grants"/"permission registration"
  // describe block below) the real iam2.permission catalogue rows migration 011 inserted.
  const SENSITIVE_TEST_EVENT_TYPE = "fnd01.sensitive_test_event";

  interface FakeIam2Decision {
    decision: "allow" | "deny" | "step_up_required" | "approval_required" | "licence_locked";
    reason: string;
  }

  /** `decide` receives the requested permission `action` string and returns what IAM-02 would
   * have decided — lets each test control the baseline (.search/.read) and sensitive-tier
   * (.read_sensitive) checks independently, exactly mirroring the real two-check flow. */
  function makeFakeIam2Fetch(decide: (action: string) => FakeIam2Decision): typeof fetch {
    return (async (_url: unknown, init?: unknown) => {
      const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as { action: string };
      const { decision, reason } = decide(body.action);
      return { ok: true, json: async () => ({ success: true, data: { decision, reason } }) } as Response;
    }) as typeof fetch;
  }

  function allowAll(): typeof fetch {
    return makeFakeIam2Fetch(() => ({ decision: "allow", reason: "permission_granted" }));
  }

  /** Baseline (.search/.read) allowed; sensitive tier (.read_sensitive) denied. */
  function allowBaselineOnly(): typeof fetch {
    return makeFakeIam2Fetch((action) =>
      action === "sec1.audit_event.read_sensitive"
        ? { decision: "deny", reason: "IAM2_PERMISSION_DENIED" }
        : { decision: "allow", reason: "permission_granted" },
    );
  }

  function denyAll(): typeof fetch {
    return makeFakeIam2Fetch(() => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }));
  }

  describe("Phase 4: audit read/search + sensitive-read logging + IAM-02 permission guard", () => {
    let normalEventRef: string;
    let normalEventId: string;
    let sensitiveEventRef: string;
    let sensitiveEventId: string;

    beforeAll(async () => {
      if (!schemaReady) return;
      // Additive fixture: a sensitive_read=true event_schema row usable through the REAL
      // ingestion API. The one pre-seeded sensitive_read=true row (sec1.self_audit_event, from
      // migration 008) has no ingestion token — source_identity_binding only covers
      // FND-01/IAM-01/IAM-02 — so a dedicated FND-01-attributed test type is used instead.
      await verifyPool.query(
        `INSERT INTO sec1.event_schema
           (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
         VALUES ($1, 'FND-01', 'system', 'medium',
           '["event_id","event_type","source_module","severity","occurred_at_utc","request_id","correlation_id","actor_type","action","result","idempotency_key"]'::jsonb,
           'restricted', 'standard', true, 'active', 1)
         ON CONFLICT (event_type) DO NOTHING`,
        [SENSITIVE_TEST_EVENT_TYPE],
      );

      const normalPayload = sampleEvent({ metadata: { note: "p4 normal fixture", password: "must-never-leak-raw" } });
      const normalRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("p4-normal-fixture")),
        payload: normalPayload,
      });
      normalEventRef = normalRes.json().data.audit_event_ref;
      normalEventId = normalPayload.event_id as string;

      const sensitivePayload = sampleEvent({
        event_type: SENSITIVE_TEST_EVENT_TYPE,
        metadata: { note: "p4 sensitive fixture", password: "must-never-leak-raw-2" },
      });
      const sensitiveRes = await app.inject({
        method: "POST",
        url: "/internal/sec1/audit-events",
        headers: ingestHeaders("FND-01", idemKey("p4-sensitive-fixture")),
        payload: sensitivePayload,
      });
      sensitiveEventRef = sensitiveRes.json().data.audit_event_ref;
      sensitiveEventId = sensitivePayload.event_id as string;
    });

    // -------------------------------------------------------------------------------------
    // Permission guard integration.
    // -------------------------------------------------------------------------------------
    describe("IAM-02 permission guard integration", () => {
      it("baseline allow -> search returns results", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-search-allow")),
          payload: { actor_id: "user_1", filters: { event_type: "fnd01.generic_event" } },
        });
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.json().data.events)).toBe(true);
        expect(res.json().data.events.length).toBeGreaterThan(0);
      });

      it("baseline deny -> search fails closed with SEC1_UNAUTHORISED_AUDIT_READ", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = denyAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-search-deny")),
          payload: { actor_id: "user_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_UNAUTHORISED_AUDIT_READ");
      });

      it("IAM-02 unavailable (network error) -> fails closed, never a 200", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = (async () => {
          throw new Error("ECONNREFUSED");
        }) as typeof fetch;
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-search-unavailable")),
          payload: { actor_id: "user_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_UNAUTHORISED_AUDIT_READ");
      });

      it("IAM-02 malformed response -> fails closed", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = (async () => ({ ok: true, json: async () => ({ nonsense: true }) })) as unknown as typeof fetch;
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-search-malformed")),
          payload: { actor_id: "user_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_UNAUTHORISED_AUDIT_READ");
      });

      it("sensitive-tier denied -> baseline-allowed search still succeeds, but every row is normal-tier redacted", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowBaselineOnly();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-search-sensitive-denied")),
          payload: { actor_id: "user_1", filters: { event_type: SENSITIVE_TEST_EVENT_TYPE } },
        });
        expect(res.statusCode).toBe(200);
        const events = res.json().data.events as Array<Record<string, unknown>>;
        expect(events.length).toBeGreaterThan(0);
        for (const ev of events) {
          expect(ev).not.toHaveProperty("metadata_redacted");
          expect(ev).not.toHaveProperty("session_id");
        }
      });

      it("sensitive-tier allowed -> a sensitive event's detail read returns sensitive-tier fields", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-read-sensitive-allowed")),
          payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toHaveProperty("metadata_redacted");
        expect(res.json().data.audit_event_ref).toBe(sensitiveEventRef);
      });

      it("SEC1-TC-079: an action string not yet registered in iam2.permission fails closed with SEC1_IAM02_REGISTRY_MISSING, distinct from an ordinary deny", async () => {
        if (!schemaReady) return;
        // Simulates the real IAM-02 response for an unregistered permission_code
        // (guard.ts's own step-0 fail-closed check: finish("deny", "IAM2_PERMISSION_UNKNOWN", ...)) —
        // proves the ROUTE layer's denyUnlessAllowed distinguishes this from an ordinary deny,
        // not just that the client surfaces the raw reason string (already covered at the unit
        // level in sec1-iam2-client.test.ts).
        config.iam2FetchImpl = makeFakeIam2Fetch(() => ({ decision: "deny", reason: "IAM2_PERMISSION_UNKNOWN" }));
        const searchRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-tc079-search")),
          payload: { actor_id: "user_1" },
        });
        expect(searchRes.statusCode).toBe(503);
        expect(searchRes.json().error.code).toBe("SEC1_IAM02_REGISTRY_MISSING");

        const readRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-tc079-read")),
          payload: { actor_id: "user_1", audit_event_ref: normalEventRef },
        });
        expect(readRes.statusCode).toBe(503);
        expect(readRes.json().error.code).toBe("SEC1_IAM02_REGISTRY_MISSING");
      });
    });

    // -------------------------------------------------------------------------------------
    // Authorization ordering — 404-after-authz, never before.
    // -------------------------------------------------------------------------------------
    describe("authorization ordering", () => {
      it("an unauthorized detail-read gets the SAME denial for a real ref and a nonexistent ref (existence never leaked)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = denyAll();
        const realRefRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-authz-order-real")),
          payload: { actor_id: "user_1", audit_event_ref: normalEventRef },
        });
        const fakeRefRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-authz-order-fake")),
          payload: { actor_id: "user_1", audit_event_ref: "audit_does_not_exist_at_all" },
        });
        expect(realRefRes.statusCode).toBe(403);
        expect(fakeRefRes.statusCode).toBe(403);
        expect(realRefRes.json().error.code).toBe(fakeRefRes.json().error.code);
        expect(realRefRes.statusCode).toBe(fakeRefRes.statusCode);
      });

      it("an authorized detail-read on a nonexistent ref gets 404 NOT_FOUND (only reachable after authorization)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-authz-order-404")),
          payload: { actor_id: "user_1", audit_event_ref: "audit_does_not_exist_at_all" },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe("NOT_FOUND");
      });
    });

    // -------------------------------------------------------------------------------------
    // Sensitive-read logging.
    // -------------------------------------------------------------------------------------
    describe("sensitive-read logging", () => {
      it("a sensitive detail read writes sensitive_read_log before returning", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const before = await verifyPool.query(
          `SELECT count(*) FROM sec1.sensitive_read_log WHERE audit_event_ref = $1`,
          [sensitiveEventRef],
        );
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-log-sensitive-read")),
          payload: { actor_id: "user_log_1", audit_event_ref: sensitiveEventRef, reason: "test read" },
        });
        expect(res.statusCode).toBe(200);
        const after = await verifyPool.query(
          `SELECT count(*), max(user_id) AS user_id, max(action) AS action, max(reason) AS reason
             FROM sec1.sensitive_read_log WHERE audit_event_ref = $1`,
          [sensitiveEventRef],
        );
        expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
        expect(after.rows[0].action).toBe("read");
      });

      it("a normal (non-sensitive) event read does NOT write sensitive_read_log", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const before = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log`);
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-log-normal-read")),
          payload: { actor_id: "user_1", audit_event_ref: normalEventRef },
        });
        expect(res.statusCode).toBe(200);
        const after = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log`);
        expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
      });

      it("a sensitive event read reading is denied at sensitive tier does NOT write sensitive_read_log (nothing sensitive was disclosed)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowBaselineOnly();
        const before = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log`);
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-log-sensitive-denied")),
          payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
        });
        expect(res.statusCode).toBe(200);
        const after = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log`);
        expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
      });

      it("a search whose results include a sensitive event writes exactly ONE log row for the whole request, not one per row", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const before = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log WHERE action = 'search'`);
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-log-search-sensitive")),
          payload: { actor_id: "user_1", filters: { event_type: SENSITIVE_TEST_EVENT_TYPE } },
        });
        expect(res.statusCode).toBe(200);
        const after = await verifyPool.query(`SELECT count(*) FROM sec1.sensitive_read_log WHERE action = 'search'`);
        expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
      });

      it("sensitive_read_log write failure fails the WHOLE read closed (SEC1_SENSITIVE_READ_LOG_FAILED), no data returned", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        // Force a real DB-level write failure by revoking INSERT for the duration of this one
        // test only — always restored in `finally`, even if an assertion throws.
        await verifyPool.query(`REVOKE INSERT ON sec1.sensitive_read_log FROM role_sec1_runtime`);
        try {
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events/read",
            headers: internalHeaders(idemKey("p4-log-write-fails")),
            payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("SEC1_SENSITIVE_READ_LOG_FAILED");
          expect(res.json().data).toBeUndefined();
        } finally {
          await verifyPool.query(`GRANT SELECT, INSERT ON sec1.sensitive_read_log TO role_sec1_runtime`);
        }
      });

      it("sensitive_read_log write failure fails a SEARCH closed too (same shared writer, same transaction), no events returned", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        await verifyPool.query(`REVOKE INSERT ON sec1.sensitive_read_log FROM role_sec1_runtime`);
        try {
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events/search",
            headers: internalHeaders(idemKey("p4-log-write-fails-search")),
            payload: { actor_id: "user_1", filters: { event_type: SENSITIVE_TEST_EVENT_TYPE } },
          });
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("SEC1_SENSITIVE_READ_LOG_FAILED");
          expect(res.json().data).toBeUndefined();
        } finally {
          await verifyPool.query(`GRANT SELECT, INSERT ON sec1.sensitive_read_log TO role_sec1_runtime`);
        }
      });

      it("no recursive audit ingestion — a sensitive read never creates a new sec1.audit_event row", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const before = await verifyPool.query(`SELECT count(*) FROM sec1.audit_event`);
        await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-no-recursion")),
          payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
        });
        const after = await verifyPool.query(`SELECT count(*) FROM sec1.audit_event`);
        expect(after.rows[0].count).toBe(before.rows[0].count);
      });
    });

    // -------------------------------------------------------------------------------------
    // Redaction.
    // -------------------------------------------------------------------------------------
    describe("redaction", () => {
      it("normal tier omits session_id/request_id/correlation_id/metadata_redacted and redacts client_id", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowBaselineOnly();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-redact-normal")),
          payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
        });
        const data = res.json().data;
        expect(data).not.toHaveProperty("session_id");
        expect(data).not.toHaveProperty("request_id");
        expect(data).not.toHaveProperty("correlation_id");
        expect(data).not.toHaveProperty("metadata_redacted");
        expect(data.client_id).toBeNull();
      });

      it("sensitive tier returns metadata_redacted (the ingest-time-safe form), never a raw secret value", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-redact-sensitive")),
          payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
        });
        const data = res.json().data;
        expect(data.metadata_redacted.password).toBe("[REDACTED]");
        expect(JSON.stringify(data)).not.toContain("must-never-leak-raw-2");
      });

      it("hash-chain/integrity fields are omitted at BOTH tiers", async () => {
        if (!schemaReady) return;
        for (const fetchImpl of [allowAll(), allowBaselineOnly()]) {
          config.iam2FetchImpl = fetchImpl;
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events/read",
            headers: internalHeaders(idemKey("p4-redact-hashchain-" + Math.random())),
            payload: { actor_id: "user_1", audit_event_ref: sensitiveEventRef },
          });
          const data = res.json().data;
          for (const forbidden of [
            "event_hash",
            "previous_hash",
            "sequence_no",
            "stream_id",
            "ingest_payload_hash",
            "canonical_format_version",
            "seal_batch_id",
          ]) {
            expect(data).not.toHaveProperty(forbidden);
          }
        }
      });
    });

    // -------------------------------------------------------------------------------------
    // Query: filters, dates, pagination, injection-safety.
    // -------------------------------------------------------------------------------------
    describe("query", () => {
      it("event_type filter narrows results to matching rows only", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-filter")),
          payload: { actor_id: "user_1", filters: { event_type: SENSITIVE_TEST_EVENT_TYPE } },
        });
        const events = res.json().data.events as Array<Record<string, unknown>>;
        expect(events.length).toBeGreaterThan(0);
        for (const ev of events) expect(ev.event_type).toBe(SENSITIVE_TEST_EVENT_TYPE);
      });

      it("occurred_at date-range filters narrow results", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-date-range")),
          payload: { actor_id: "user_1", filters: { occurred_at_from: farFuture } },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.events).toEqual([]);
      });

      it("an unparseable date filter fails closed with VALIDATION_ERROR", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-bad-date")),
          payload: { actor_id: "user_1", filters: { occurred_at_from: "not-a-real-date" } },
        });
        expect(res.statusCode).toBe(400);
      });

      it("limit is capped even when a caller requests more than the maximum", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-limit-cap")),
          payload: { actor_id: "user_1", limit: 999 },
        });
        // TypeBox's own schema max (200) rejects an out-of-range limit outright.
        expect(res.statusCode).toBe(400);
      });

      it("pagination is stable: a cursor from page 1 fetches a disjoint page 2", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const page1 = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-page1")),
          payload: { actor_id: "user_1", limit: 1 },
        });
        const page1Body = page1.json().data;
        expect(page1Body.events.length).toBe(1);
        if (!page1Body.next_cursor) return; // fewer than 2 rows exist in this fresh DB; nothing more to prove
        const page2 = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-page2")),
          payload: { actor_id: "user_1", limit: 1, cursor: page1Body.next_cursor },
        });
        const page2Body = page2.json().data;
        expect(page2Body.events.length).toBeGreaterThan(0);
        expect(page2Body.events[0].audit_event_ref).not.toBe(page1Body.events[0].audit_event_ref);
      });

      it("F-1 gap patch: same-millisecond, different-microsecond rows are ALL returned across paginated pages, none skipped", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        // Exact reproduction shape from the Opus review's empirical finding: three rows in the
        // SAME millisecond bucket (.123) but distinct microseconds, inserted directly (bypassing
        // ingestion, which is irrelevant to this pagination-boundary bug) via the superuser
        // connection — mirrors how tamper/gap-detection tests in this file already fabricate
        // out-of-band rows for a specific scenario. A distinct, far-future ingested_at_utc
        // (well past any other fixture in this suite, which all use `now()`) guarantees these
        // 3 rows sort at the very top of the DESC ordering, so a scoped `entity_type` filter
        // (unique to this test) plus `limit: 1` pages land on exactly them — no dependency on
        // how many other rows earlier tests in this file have already inserted.
        const streamId = "f1_test_stream_" + randomUUID();
        const base = "audit_f1_" + randomUUID().slice(0, 8);
        const entityType = "f1_probe_" + randomUUID();
        const rows = [
          { ref: `${base}_hi`, seq: 901, us: "2031-01-01 08:00:00.123800+00" }, // newest (highest microseconds)
          { ref: `${base}_mid`, seq: 902, us: "2031-01-01 08:00:00.123400+00" }, // the row F-1 silently dropped
          { ref: `${base}_lo`, seq: 903, us: "2031-01-01 08:00:00.123000+00" }, // oldest
        ];
        for (const r of rows) {
          await verifyPool.query(
            `INSERT INTO sec1.audit_event
               (audit_event_ref, event_id, idempotency_key, event_type, severity, source_module,
                actor_type, action, result, request_id, correlation_id, entity_type,
                occurred_at_utc, ingested_at_utc, classification, retention_class, stream_id,
                sequence_no, event_hash, ingest_payload_hash)
             VALUES ($1, $1, $1, 'fnd01.generic_event', 'medium', 'FND-01', 'service', 'a',
                     'success', $1, $1, $2, now(), $3::timestamptz, 'restricted', 'standard',
                     $4, $5, $1, $1)`,
            [r.ref, entityType, r.us, streamId, r.seq],
          );
        }
        // Walk pages of size 1, scoped to this test's unique entity_type — page 1 must be
        // "_hi", page 2 must be "_mid" (the row F-1 dropped), page 3 must be "_lo", page 4 empty.
        let cursor: string | null = null;
        const seen: string[] = [];
        for (let i = 0; i < rows.length; i++) {
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events/search",
            headers: internalHeaders(idemKey(`p4-f1-page-${i}`)),
            payload: {
              actor_id: "user_1",
              filters: { entity_type: entityType },
              limit: 1,
              ...(cursor ? { cursor } : {}),
            },
          });
          const body = res.json().data;
          expect(body.events).toHaveLength(1);
          seen.push(body.events[0].audit_event_ref);
          cursor = body.next_cursor;
        }
        // All three fixture rows, exactly once each, in newest-to-oldest order — the exact
        // defect the Opus review reproduced (the "_mid" / .123400 row silently vanishing) is
        // now closed.
        expect(seen).toEqual([`${base}_hi`, `${base}_mid`, `${base}_lo`]);
        // After the 3rd (last) row, next_cursor must already be null — no phantom 4th page,
        // no duplicates.
        expect(cursor).toBeNull();
      });

      it("F-1 gap patch: cursor stability when two rows share the exact same ingested_at_utc (tiebreaker is audit_event_ref)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const streamId = "f1_tie_stream_" + randomUUID();
        const base = "audit_f1tie_" + randomUUID().slice(0, 8);
        const entityType = "f1_tie_probe_" + randomUUID();
        const sameTimestamp = "2031-01-02 09:00:00.500000+00";
        const rows = [
          { ref: `${base}_b`, seq: 1 },
          { ref: `${base}_a`, seq: 2 },
        ];
        for (const r of rows) {
          await verifyPool.query(
            `INSERT INTO sec1.audit_event
               (audit_event_ref, event_id, idempotency_key, event_type, severity, source_module,
                actor_type, action, result, request_id, correlation_id, entity_type,
                occurred_at_utc, ingested_at_utc, classification, retention_class, stream_id,
                sequence_no, event_hash, ingest_payload_hash)
             VALUES ($1, $1, $1, 'fnd01.generic_event', 'medium', 'FND-01', 'service', 'a',
                     'success', $1, $1, $2, now(), $3::timestamptz, 'restricted', 'standard',
                     $4, $5, $1, $1)`,
            [r.ref, entityType, sameTimestamp, streamId, r.seq],
          );
        }
        const page1 = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-f1-tie-page1")),
          payload: { actor_id: "user_1", filters: { entity_type: entityType }, limit: 10 },
        });
        const events = page1.json().data.events as Array<{ audit_event_ref: string }>;
        // Both rows returned (identical ingested_at_utc did not collapse/hide either), ordered
        // by the audit_event_ref DESC tiebreaker: "_b" sorts after "_a" lexicographically.
        expect(events.map((e) => e.audit_event_ref)).toEqual([`${base}_b`, `${base}_a`]);
      });

      it("a SQL-injection-shaped filter value is treated as an inert literal (zero matches, table intact)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        // event_type has a generous maxLength (128) so the malicious string reaches the query
        // layer intact rather than being rejected by wire-schema validation first (source_module's
        // maxLength of 16 would reject this string before it ever got there — a real defense in
        // depth, but not what THIS test needs to prove: that the QUERY layer itself is safe).
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/search",
          headers: internalHeaders(idemKey("p4-query-injection")),
          payload: { actor_id: "user_1", filters: { event_type: "fnd01.generic_event'; DROP TABLE sec1.audit_event; --" } },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.events).toEqual([]);
        // Table still exists and still holds the fixture rows inserted in beforeAll.
        const stillThere = await verifyPool.query(`SELECT count(*) FROM sec1.audit_event WHERE audit_event_ref = $1`, [
          normalEventRef,
        ]);
        expect(Number(stillThere.rows[0].count)).toBe(1);
      });

      it("detail read also accepts (source_module, event_id) as an alternative lookup key", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAll();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events/read",
          headers: internalHeaders(idemKey("p4-query-by-source-event-id")),
          payload: { actor_id: "user_1", source_module: "FND-01", event_id: normalEventId },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.audit_event_ref).toBe(normalEventRef);
      });
    });

    // -------------------------------------------------------------------------------------
    // Grants (migration 010).
    // -------------------------------------------------------------------------------------
    describe("grants (migration 010)", () => {
      it("role_sec1_runtime can SELECT and INSERT sec1.sensitive_read_log", async () => {
        if (!schemaReady) return;
        const selectAllowed = await verifyPool.query(
          `SELECT has_table_privilege('role_sec1_runtime', 'sec1.sensitive_read_log', 'SELECT') AS allowed`,
        );
        const insertAllowed = await verifyPool.query(
          `SELECT has_table_privilege('role_sec1_runtime', 'sec1.sensitive_read_log', 'INSERT') AS allowed`,
        );
        expect(selectAllowed.rows[0]?.allowed).toBe(true);
        expect(insertAllowed.rows[0]?.allowed).toBe(true);
      });

      it("role_sec1_runtime cannot UPDATE or DELETE sec1.sensitive_read_log", async () => {
        if (!schemaReady) return;
        const { getPool } = await import("@aix/foundation");
        await expect(
          getPool().query(`UPDATE sec1.sensitive_read_log SET reason = 'x' WHERE 1=0`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(getPool().query(`DELETE FROM sec1.sensitive_read_log WHERE 1=0`)).rejects.toMatchObject({
          code: "42501",
        });
      });

      it("other module runtime roles (fnd/iam/iam2) gained NO privilege on sec1.sensitive_read_log", async () => {
        if (!schemaReady) return;
        for (const role of ["role_fnd_runtime", "role_iam_runtime", "role_iam2_runtime"]) {
          const selectAllowed = await verifyPool.query(
            `SELECT has_table_privilege($1, 'sec1.sensitive_read_log', 'SELECT') AS allowed`,
            [role],
          );
          const insertAllowed = await verifyPool.query(
            `SELECT has_table_privilege($1, 'sec1.sensitive_read_log', 'INSERT') AS allowed`,
            [role],
          );
          expect(selectAllowed.rows[0]?.allowed, `${role} SELECT`).toBe(false);
          expect(insertAllowed.rows[0]?.allowed, `${role} INSERT`).toBe(false);
        }
      });

      it("role_sec1_runtime still cannot UPDATE/DELETE sec1.audit_event (append-only posture unchanged by Phase 4)", async () => {
        if (!schemaReady) return;
        const { getPool } = await import("@aix/foundation");
        await expect(
          getPool().query("UPDATE sec1.audit_event SET status = 'archived' WHERE 1=0"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(getPool().query("DELETE FROM sec1.audit_event WHERE 1=0")).rejects.toMatchObject({
          code: "42501",
        });
      });

      it("role_sec1_runtime still has NO grant into iam2.* (Phase 4 talks to IAM-02 over HTTP only)", async () => {
        if (!schemaReady) return;
        const { getPool } = await import("@aix/foundation");
        await expect(getPool().query("SELECT 1 FROM iam2.permission LIMIT 1")).rejects.toMatchObject({
          code: "42501",
        });
      });
    });

    // -------------------------------------------------------------------------------------
    // IAM-02 permission catalogue registration (migration 011) — the ONE piece of this phase
    // verified against the REAL iam2.permission table, not a fake fetch.
    // -------------------------------------------------------------------------------------
    describe("IAM-02 permission catalogue registration (migration 011)", () => {
      it("registers exactly the three Phase 4 permission codes, additive, correctly shaped", async () => {
        if (!schemaReady) return;
        const res = await verifyPool.query(
          `SELECT permission_code, resource, action, sensitivity, licence_locked, prohibited,
                  requires_step_up, requires_approval, status, owner_module
             FROM iam2.permission
            WHERE permission_code IN ('sec1.audit_event.search','sec1.audit_event.read','sec1.audit_event.read_sensitive')
            ORDER BY permission_code`,
        );
        expect(res.rows).toHaveLength(3);
        for (const row of res.rows) {
          expect(row.resource).toBe("audit_event");
          expect(row.licence_locked).toBe(false);
          expect(row.prohibited).toBe(false);
          expect(row.requires_step_up).toBe(false);
          expect(row.requires_approval).toBe(false);
          expect(row.status).toBe("active");
          expect(row.owner_module).toBe("SEC-01");
        }
        const bySensitivity = Object.fromEntries(res.rows.map((r) => [r.permission_code, r.sensitivity]));
        expect(bySensitivity["sec1.audit_event.search"]).toBe("normal");
        expect(bySensitivity["sec1.audit_event.read"]).toBe("normal");
        expect(bySensitivity["sec1.audit_event.read_sensitive"]).toBe("sensitive");
      });

      it("seeded NO iam2.role_permission rows for the new permissions (approved-workflow-only assignment, same rule migration 006 documented)", async () => {
        if (!schemaReady) return;
        const res = await verifyPool.query(
          `SELECT count(*) FROM iam2.role_permission rp
             JOIN iam2.permission p ON p.permission_id = rp.permission_id
            WHERE p.permission_code IN ('sec1.audit_event.search','sec1.audit_event.read','sec1.audit_event.read_sensitive')`,
        );
        expect(Number(res.rows[0].count)).toBe(0);
      });

      it("did not modify any pre-existing iam2.permission row (additive only)", async () => {
        if (!schemaReady) return;
        const res = await verifyPool.query(
          `SELECT count(*) FROM iam2.permission WHERE permission_code = 'exchange.orderbook.enable' AND licence_locked = true AND prohibited = true`,
        );
        expect(Number(res.rows[0].count)).toBe(1);
      });
    });
  });

  // =========================================================================================
  // PHASE 5 — security monitoring rule engine, alert lifecycle, monitoring dead-letter,
  // Phase 3 integrity/seal verification-failure alert hooks.
  // =========================================================================================
  //
  // config.iam2FetchImpl is stubbed for every test below, same Phase 4 precedent (no live
  // IAM-02 service). The 3 seeded P0 rules (migration 012) key off IAM-01/IAM-02 generic
  // events narrowed by action/result — see that migration's own header comment.
  interface FakeIam2Decision {
    decision: "allow" | "deny" | "step_up_required" | "approval_required" | "licence_locked";
    reason: string;
  }
  interface ExecuteVerifyOutcome {
    ok: boolean;
    errorCode?: string;
  }

  function makeFakeIam2FetchFull(
    decidePermission: (action: string) => FakeIam2Decision,
    decideExecuteVerify: (body: Record<string, unknown>) => ExecuteVerifyOutcome,
  ): typeof fetch {
    return (async (url: unknown, init?: unknown) => {
      const urlStr = String(url);
      const body = JSON.parse(((init as { body?: string } | undefined)?.body) ?? "{}") as Record<string, unknown>;
      if (urlStr.endsWith("/internal/iam2/permission/check")) {
        const { decision, reason } = decidePermission(body.action as string);
        return { ok: true, json: async () => ({ success: true, data: { decision, reason } }) } as Response;
      }
      if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
        const outcome = decideExecuteVerify(body);
        if (!outcome.ok) {
          return {
            ok: false,
            json: async () => ({ success: false, error: { code: outcome.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }),
          } as Response;
        }
        return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
      }
      throw new Error(`Unexpected URL in Phase 5 test fake: ${urlStr}`);
    }) as typeof fetch;
  }

  function allowAllAlerts(): typeof fetch {
    return makeFakeIam2FetchFull(
      () => ({ decision: "allow", reason: "permission_granted" }),
      () => ({ ok: true }),
    );
  }

  function denyAllAlerts(): typeof fetch {
    return makeFakeIam2FetchFull(
      () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }),
      () => ({ ok: false }),
    );
  }

  function allowAlertsButExecuteVerifyFails(errorCode: string): typeof fetch {
    return makeFakeIam2FetchFull(
      () => ({ decision: "allow", reason: "permission_granted" }),
      () => ({ ok: false, errorCode }),
    );
  }

  describe("Phase 5: security monitoring rule engine + alert lifecycle + dead-letter", () => {
    // -----------------------------------------------------------------------------------
    // Rule engine — real HTTP ingestion, real DB, the 3 migration-012-seeded P0 rules.
    // -----------------------------------------------------------------------------------
    describe("threshold/count-window rule engine", () => {
      it("fires exactly once when the failed-login-spike threshold (5 in 300s) is met, and does not duplicate on a 6th matching event", async () => {
        if (!schemaReady) return;
        const actor = "p5_actor_spike_" + randomUUID();
        for (let i = 0; i < 5; i++) {
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-spike-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
          expect(res.statusCode).toBe(200);
        }
        const alerts = await verifyPool.query(
          `SELECT alert_id, status FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        expect(alerts.rows).toHaveLength(1);
        expect(alerts.rows[0].status).toBe("open");

        // A 6th matching event must NOT create a second alert while the first is still open.
        await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("IAM-01", idemKey(`p5-spike-6th-${actor}`)),
          payload: sampleEvent({
            event_type: "iam01.generic_event",
            source_module: "IAM-01",
            action: "login",
            result: "failure",
            actor_user_id: actor,
          }),
        });
        const alertsAfter = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        expect(alertsAfter.rows).toHaveLength(1);
      });

      it("does NOT fire when the count stays below the threshold (2 of 5 required)", async () => {
        if (!schemaReady) return;
        const actor = "p5_actor_below_" + randomUUID();
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-below-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
        }
        const alerts = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        expect(alerts.rows).toHaveLength(0);
      });

      it("self-review regression: concurrent threshold-crossing evaluations for the same rule+scope never create duplicate alerts (pg_advisory_xact_lock serialization)", async () => {
        if (!schemaReady) return;
        const actor = "p5_actor_concurrent_" + randomUUID();
        // 4 sequential events first (below threshold, no lock contention risk yet).
        for (let i = 0; i < 4; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-concurrent-pre-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
        }
        // The 5th and 6th events, fired CONCURRENTLY, each independently cross the threshold
        // (5) once both are committed — without the advisory-lock fix, both evaluations could
        // see "no open alert yet" before either commits its INSERT.
        await Promise.all(
          [0, 1].map((i) =>
            app.inject({
              method: "POST",
              url: "/internal/sec1/audit-events",
              headers: ingestHeaders("IAM-01", idemKey(`p5-concurrent-race-${i}-${actor}`)),
              payload: sampleEvent({
                event_type: "iam01.generic_event",
                source_module: "IAM-01",
                action: "login",
                result: "failure",
                actor_user_id: actor,
              }),
            }),
          ),
        );
        const alerts = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        expect(alerts.rows).toHaveLength(1);
      });

      it("fires the count=1 SoD-conflict rule on a single matching event, and prevents monitoring recursion (no extra audit_event row)", async () => {
        if (!schemaReady) return;
        const actor = "p5_actor_sod_" + randomUUID();
        const payload = sampleEvent({
          event_type: "iam02.generic_event",
          source_module: "IAM-02",
          action: "sod_conflict",
          actor_user_id: actor,
        });
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("IAM-02", idemKey(`p5-sod-${actor}`)),
          payload,
        });
        expect(res.statusCode).toBe(200);

        const alerts = await verifyPool.query(
          `SELECT alert_id, severity FROM sec1.security_alert WHERE rule_id = 'rule_sod_conflict_approval_abuse' AND actor_user_id = $1`,
          [actor],
        );
        expect(alerts.rows).toHaveLength(1);
        expect(alerts.rows[0].severity).toBe("critical");

        // Anti-recursion: evaluating rules / creating an alert must not itself create a NEW
        // sec1.audit_event row — exactly one row exists for this event_id.
        const auditRows = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.audit_event WHERE event_id = $1`, [
          payload.event_id,
        ]);
        expect(auditRows.rows[0].n).toBe(1);
      });

      it("a disabled (status='inactive') rule never fires", async () => {
        if (!schemaReady) return;
        const eventType = "p5_disabled_rule_probe_" + randomUUID();
        const ruleId = "p5_rule_disabled_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO sec1.event_schema (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
           VALUES ($1, 'FND-01', 'system', 'medium', '[]'::jsonb, 'restricted', 'standard', false, 'active', 1)`,
          [eventType],
        );
        await verifyPool.query(
          `INSERT INTO sec1.security_monitoring_rule (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
           VALUES ($1, 'disabled test rule', $2::jsonb, '{}'::jsonb, '{"count":1,"window_seconds":60}'::jsonb, 'high', '{}'::jsonb, 'inactive', NULL)`,
          [ruleId, JSON.stringify([eventType])],
        );
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`p5-disabled-${ruleId}`)),
          payload: sampleEvent({ event_type: eventType }),
        });
        expect(res.statusCode).toBe(200);
        const alerts = await verifyPool.query(`SELECT alert_id FROM sec1.security_alert WHERE rule_id = $1`, [ruleId]);
        expect(alerts.rows).toHaveLength(0);
      });

      it("a malformed rule (invalid threshold shape) writes to monitoring_dead_letter, and ingestion still succeeds", async () => {
        if (!schemaReady) return;
        const eventType = "p5_malformed_rule_probe_" + randomUUID();
        const ruleId = "p5_rule_malformed_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO sec1.event_schema (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
           VALUES ($1, 'FND-01', 'system', 'medium', '[]'::jsonb, 'restricted', 'standard', false, 'active', 1)`,
          [eventType],
        );
        // threshold.count is a STRING, not a number — evaluateOneRule's parseThreshold throws.
        await verifyPool.query(
          `INSERT INTO sec1.security_monitoring_rule (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
           VALUES ($1, 'malformed test rule', $2::jsonb, '{}'::jsonb, '{"count":"not-a-number","window_seconds":60}'::jsonb, 'critical', '{}'::jsonb, 'active', NULL)`,
          [ruleId, JSON.stringify([eventType])],
        );
        const payload = sampleEvent({ event_type: eventType });
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`p5-malformed-${ruleId}`)),
          payload,
        });
        // Ingestion (the authoritative action) succeeds regardless of the monitoring failure.
        expect(res.statusCode).toBe(200);
        const auditRow = await verifyPool.query(`SELECT audit_event_ref FROM sec1.audit_event WHERE event_id = $1`, [
          payload.event_id,
        ]);
        expect(auditRow.rows).toHaveLength(1);

        const deadLetters = await verifyPool.query(
          `SELECT dead_letter_id, audit_event_ref, severity, status, retry_count FROM sec1.monitoring_dead_letter WHERE rule_id = $1`,
          [ruleId],
        );
        expect(deadLetters.rows).toHaveLength(1);
        expect(deadLetters.rows[0].audit_event_ref).toBe(auditRow.rows[0].audit_event_ref);
        expect(deadLetters.rows[0].severity).toBe("critical"); // inherited from the rule's own severity
        expect(deadLetters.rows[0].status).toBe("pending");
        expect(deadLetters.rows[0].retry_count).toBe(0);
      });

      it("LOW-1 (Opus review): when the dead-letter write ITSELF also fails, a warning is logged but ingestion still succeeds — no sensitive payload/token in the log", async () => {
        if (!schemaReady) return;
        const eventType = "p5_dlq_write_fail_probe_" + randomUUID();
        const ruleId = "p5_rule_dlq_write_fail_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO sec1.event_schema (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
           VALUES ($1, 'FND-01', 'system', 'medium', '[]'::jsonb, 'restricted', 'standard', false, 'active', 1)`,
          [eventType],
        );
        // Same malformed-threshold shape as the test above — evaluateOneRule throws.
        await verifyPool.query(
          `INSERT INTO sec1.security_monitoring_rule (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
           VALUES ($1, 'dlq-write-fail test rule', $2::jsonb, '{}'::jsonb, '{"count":"not-a-number","window_seconds":60}'::jsonb, 'critical', '{}'::jsonb, 'active', NULL)`,
          [ruleId, JSON.stringify([eventType])],
        );

        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const secretMetadataValue = "must-never-leak-into-dlq-failure-log-" + randomUUID();
        try {
          // Revoke INSERT on monitoring_dead_letter so writeMonitoringDeadLetter itself fails —
          // same REVOKE/GRANT-in-finally convention Phase 4's sensitive_read_log fail-closed
          // test already established for this codebase.
          await verifyPool.query(`REVOKE INSERT ON sec1.monitoring_dead_letter FROM role_sec1_runtime`);

          const payload = sampleEvent({ event_type: eventType, metadata: { password: secretMetadataValue } });
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`p5-dlq-write-fail-${ruleId}`)),
            payload,
          });

          // Ingestion is STILL authoritative and unaffected by this doubly-failed monitoring path.
          expect(res.statusCode).toBe(200);
          const auditRow = await verifyPool.query(`SELECT audit_event_ref FROM sec1.audit_event WHERE event_id = $1`, [
            payload.event_id,
          ]);
          expect(auditRow.rows).toHaveLength(1);

          // No dead-letter row exists (the INSERT was denied) — the failure is genuinely
          // unrecorded anywhere durable, which is exactly why it must be logged.
          const deadLetters = await verifyPool.query(`SELECT dead_letter_id FROM sec1.monitoring_dead_letter WHERE rule_id = $1`, [
            ruleId,
          ]);
          expect(deadLetters.rows).toHaveLength(0);

          // The warning was logged, structured, and safe.
          expect(consoleWarnSpy).toHaveBeenCalled();
          const loggedLines = consoleWarnSpy.mock.calls.map((call) => String(call[0]));
          const matching = loggedLines.filter((line) => line.includes("SEC1_MONITORING_DEAD_LETTER_WRITE_FAILED"));
          expect(matching.length).toBeGreaterThan(0);
          const logged = JSON.parse(matching[matching.length - 1]!);
          expect(logged.rule_id).toBe(ruleId);
          expect(logged.severity).toBe("critical");
          expect(logged.request_id).toBeDefined();
          expect(logged.correlation_id).toBeDefined();
          // No sensitive payload, no raw metadata, no token — only stable identifiers and the
          // two (already-safe, code-generated) failure-reason strings.
          for (const line of loggedLines) {
            expect(line).not.toContain(secretMetadataValue);
            expect(line).not.toContain("decision_token");
          }
        } finally {
          consoleWarnSpy.mockRestore();
          await verifyPool.query(`GRANT INSERT ON sec1.monitoring_dead_letter TO role_sec1_runtime`);
        }
      });
    });

    // -----------------------------------------------------------------------------------
    // Phase 3 integrity/seal verification-failure alert hooks — closes the
    // `failed -> alert_created` state-machine transition (06_State_Machine.md §4).
    // -----------------------------------------------------------------------------------
    describe("integrity/seal verification-failure alert hooks", () => {
      it("a FAILED integrity verification (tampered row) creates a Critical security_alert referencing the verification_id", async () => {
        if (!schemaReady) return;
        const streamId = "p5_integrity_fail_stream_" + randomUUID();
        const ingested: string[] = [];
        for (let i = 0; i < 3; i++) {
          const payload = sampleEvent({ source_emission_stream: streamId });
          const res = await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`p5-integrity-fail-${i}-${streamId}`)),
            payload,
          });
          ingested.push(res.json().data.audit_event_ref);
        }
        // Tamper one row out-of-band (superuser connection), exactly like Phase 3's own
        // tamper-detection tests.
        await verifyPool.query(`UPDATE sec1.audit_event SET result = 'blocked' WHERE audit_event_ref = $1`, [
          ingested[1],
        ]);

        const derivedStreamId = `FND-01:${streamId}`;
        const verifyRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/integrity/verify-range",
          headers: internalHeaders(idemKey(`p5-integrity-fail-verify-${streamId}`)),
          payload: { stream_id: derivedStreamId, from_sequence_no: 1, to_sequence_no: 3 },
        });
        expect(verifyRes.statusCode).toBe(200);
        expect(verifyRes.json().data.result).toBe("fail");
        const verificationId = verifyRes.json().data.verification_id as string;

        const alerts = await verifyPool.query(
          `SELECT alert_id, severity, rule_id FROM sec1.security_alert WHERE entity_type = 'integrity_verification_run' AND entity_id = $1`,
          [verificationId],
        );
        expect(alerts.rows).toHaveLength(1);
        expect(alerts.rows[0].severity).toBe("critical");
        expect(alerts.rows[0].rule_id).toBeNull();
      });

      it("a PASSED integrity verification does NOT create an alert", async () => {
        if (!schemaReady) return;
        const streamId = "p5_integrity_pass_stream_" + randomUUID();
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`p5-integrity-pass-${i}-${streamId}`)),
            payload: sampleEvent({ source_emission_stream: streamId }),
          });
        }
        const derivedStreamId = `FND-01:${streamId}`;
        const verifyRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/integrity/verify-range",
          headers: internalHeaders(idemKey(`p5-integrity-pass-verify-${streamId}`)),
          payload: { stream_id: derivedStreamId, from_sequence_no: 1, to_sequence_no: 2 },
        });
        expect(verifyRes.json().data.result).toBe("pass");
        const verificationId = verifyRes.json().data.verification_id as string;
        const alerts = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE entity_type = 'integrity_verification_run' AND entity_id = $1`,
          [verificationId],
        );
        expect(alerts.rows).toHaveLength(0);
      });

      it("a FAILED seal verification (tampered event_hash) creates a Critical security_alert referencing the seal_batch_id", async () => {
        if (!schemaReady) return;
        const streamId = "p5_seal_fail_stream_" + randomUUID();
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`p5-seal-fail-${i}-${streamId}`)),
            payload: sampleEvent({ source_emission_stream: streamId }),
          });
        }
        const derivedStreamId = `FND-01:${streamId}`;
        const sealResult = await withTransaction((client) =>
          sealBatch(client, { streamId: derivedStreamId, fromSequenceNo: 1, toSequenceNo: 2, sealControllerId: "p5_test_controller" }),
        );
        await verifyPool.query(`UPDATE sec1.audit_event SET event_hash = 'tampered' WHERE stream_id = $1 AND sequence_no = 1`, [
          derivedStreamId,
        ]);
        const verifyRes = await app.inject({
          method: "POST",
          url: `/internal/sec1/seal-batches/${sealResult.sealBatchId}/verify`,
          headers: internalHeaders(idemKey(`p5-seal-fail-verify-${streamId}`)),
        });
        expect(verifyRes.json().data.verification_status).toBe("failed");

        const alerts = await verifyPool.query(
          `SELECT alert_id, severity FROM sec1.security_alert WHERE entity_type = 'audit_seal_batch' AND entity_id = $1`,
          [sealResult.sealBatchId],
        );
        expect(alerts.rows).toHaveLength(1);
        expect(alerts.rows[0].severity).toBe("critical");
      });

      it("self-review regression: concurrent failed-seal-verification calls on the SAME batch never create duplicate alerts (pg_advisory_xact_lock serialization)", async () => {
        if (!schemaReady) return;
        const streamId = "p5_seal_concurrent_stream_" + randomUUID();
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("FND-01", idemKey(`p5-seal-concurrent-${i}-${streamId}`)),
            payload: sampleEvent({ source_emission_stream: streamId }),
          });
        }
        const derivedStreamId = `FND-01:${streamId}`;
        const sealResult = await withTransaction((client) =>
          sealBatch(client, {
            streamId: derivedStreamId,
            fromSequenceNo: 1,
            toSequenceNo: 2,
            sealControllerId: "p5_test_controller_concurrent",
          }),
        );
        await verifyPool.query(`UPDATE sec1.audit_event SET event_hash = 'tampered' WHERE stream_id = $1 AND sequence_no = 1`, [
          derivedStreamId,
        ]);
        // routes/seals.ts re-runs verifySealBatch unconditionally on every call (no idempotent
        // short-circuit) — fire two concurrent verify calls against the SAME seal_batch_id.
        // Without the advisory lock, both could observe "no open alert yet" before either
        // commits its INSERT.
        await Promise.all(
          [0, 1].map((i) =>
            app.inject({
              method: "POST",
              url: `/internal/sec1/seal-batches/${sealResult.sealBatchId}/verify`,
              headers: internalHeaders(idemKey(`p5-seal-concurrent-verify-${i}-${streamId}`)),
            }),
          ),
        );
        const alerts = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE entity_type = 'audit_seal_batch' AND entity_id = $1`,
          [sealResult.sealBatchId],
        );
        expect(alerts.rows).toHaveLength(1);
      });
    });

    // -----------------------------------------------------------------------------------
    // Alert lifecycle routes.
    // -----------------------------------------------------------------------------------
    describe("alert lifecycle routes", () => {
      async function fireASoDAlert(): Promise<string> {
        const actor = "p5_lifecycle_actor_" + randomUUID();
        await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("IAM-02", idemKey(`p5-lifecycle-fixture-${actor}`)),
          payload: sampleEvent({
            event_type: "iam02.generic_event",
            source_module: "IAM-02",
            action: "sod_conflict",
            actor_user_id: actor,
          }),
        });
        const row = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_sod_conflict_approval_abuse' AND actor_user_id = $1`,
          [actor],
        );
        return row.rows[0].alert_id as string;
      }

      it("search requires IAM-02 read allow", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = denyAllAlerts();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/search",
          headers: internalHeaders(idemKey("p5-alert-search-deny")),
          payload: { actor_id: "user_1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_UNAUTHORISED_ALERT_ACTION");
      });

      it("search succeeds and returns alerts when allowed", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAllAlerts();
        const alertId = await fireASoDAlert();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/search",
          headers: internalHeaders(idemKey("p5-alert-search-allow")),
          payload: { actor_id: "user_1", filters: { rule_id: "rule_sod_conflict_approval_abuse" } },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.alerts.some((a: { alert_id: string }) => a.alert_id === alertId)).toBe(true);
      });

      it("read: unauthorized requester cannot learn whether the alert exists (identical outcome for a real vs. fabricated alert_id)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = denyAllAlerts();
        const alertId = await fireASoDAlert();
        const realRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/read",
          headers: internalHeaders(idemKey("p5-alert-read-deny-real")),
          payload: { actor_id: "user_1", alert_id: alertId },
        });
        const fakeRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/read",
          headers: internalHeaders(idemKey("p5-alert-read-deny-fake")),
          payload: { actor_id: "user_1", alert_id: "alert_does_not_exist_" + randomUUID() },
        });
        expect(realRes.statusCode).toBe(fakeRes.statusCode);
        expect(realRes.json().error.code).toBe(fakeRes.json().error.code);
        expect(realRes.json().error.code).toBe("SEC1_UNAUTHORISED_ALERT_ACTION");
      });

      it("assign/triage require IAM-02 triage allow", async () => {
        if (!schemaReady) return;
        const alertId = await fireASoDAlert();
        config.iam2FetchImpl = denyAllAlerts();
        const assignRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-assign-deny-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        expect(assignRes.statusCode).toBe(403);
        expect(assignRes.json().error.code).toBe("SEC1_UNAUTHORISED_ALERT_ACTION");

        const triageRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-triage-deny-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, triage_status: "true_positive" },
        });
        expect(triageRes.statusCode).toBe(403);
      });

      it("close requires IAM-02 close allow", async () => {
        if (!schemaReady) return;
        const alertId = await fireASoDAlert();
        config.iam2FetchImpl = allowAllAlerts();
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-close-deny-assign-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-close-deny-triage-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, triage_status: "true_positive" },
        });
        config.iam2FetchImpl = denyAllAlerts();
        const closeRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-close-deny-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, closure_reason: "x", closure_evidence_ref: "y" },
        });
        expect(closeRes.statusCode).toBe(403);
        expect(closeRes.json().error.code).toBe("SEC1_UNAUTHORISED_ALERT_ACTION");
      });

      it("full happy-path lifecycle: open -> assigned -> triaged -> closed (non-critical severity)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAllAlerts();
        // rule_failed_login_spike fires at 'high' severity, not 'critical' — no decision token needed.
        const actor = "p5_lifecycle_happy_" + randomUUID();
        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-happy-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
        }
        const row = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        const alertId = row.rows[0].alert_id as string;

        const assignRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-happy-assign-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        expect(assignRes.json().data.status).toBe("assigned");

        const triageRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-happy-triage-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, triage_status: "true_positive", note: "confirmed" },
        });
        expect(triageRes.json().data.status).toBe("triaged");

        const noteCount = await verifyPool.query(`SELECT count(*)::int AS n FROM sec1.alert_triage_note WHERE alert_id = $1`, [
          alertId,
        ]);
        expect(noteCount.rows[0].n).toBe(1);

        const closeRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-happy-close-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, closure_reason: "resolved", closure_evidence_ref: "evidence_ref_1" },
        });
        expect(closeRes.statusCode).toBe(200);
        expect(closeRes.json().data.status).toBe("closed");
        expect(closeRes.json().data.closure_reason).toBe("resolved");
      });

      it("invalid transition rejected: closing an 'open' alert directly (never assigned/triaged)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAllAlerts();
        // Deliberately a NON-critical ('high') alert — rule_sod_conflict_approval_abuse fires at
        // 'critical', which would hit SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED first (no
        // decision token supplied here); this test isolates the transition-validation check on
        // its own, using rule_failed_login_spike's 'high' severity instead.
        const actor = "p5_invalid_transition_" + randomUUID();
        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-invalid-transition-fixture-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
        }
        const row = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        const alertId = row.rows[0].alert_id as string;
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-invalid-transition-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, closure_reason: "x", closure_evidence_ref: "y" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("SEC1_ALERT_INVALID_TRANSITION");
      });

      it("close reason/evidence required, even when otherwise authorised", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAllAlerts();
        const alertId = await fireASoDAlert();
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-evidence-assign-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-evidence-triage-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, triage_status: "true_positive" },
        });
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-evidence-close-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED");
      });
    });

    // -----------------------------------------------------------------------------------
    // Critical alert closure — conditional IAM-02 approval/decision-token verification.
    // -----------------------------------------------------------------------------------
    describe("Critical alert closure — decision-token binding", () => {
      async function fireACriticalAlertTriaged(): Promise<string> {
        config.iam2FetchImpl = allowAllAlerts();
        const actor = "p5_critical_actor_" + randomUUID();
        // rule_mfa_reset_abuse fires at 'critical' severity (threshold 3 in 3600s).
        for (let i = 0; i < 3; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-critical-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "mfa_reset",
              actor_user_id: actor,
            }),
          });
        }
        const row = await verifyPool.query(
          `SELECT alert_id, severity FROM sec1.security_alert WHERE rule_id = 'rule_mfa_reset_abuse' AND actor_user_id = $1`,
          [actor],
        );
        const alertId = row.rows[0].alert_id as string;
        expect(row.rows[0].severity).toBe("critical");
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-critical-assign-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-critical-triage-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, triage_status: "true_positive" },
        });
        return alertId;
      }

      it("rejected when no decision_token/approval_id is presented", async () => {
        if (!schemaReady) return;
        const alertId = await fireACriticalAlertTriaged();
        config.iam2FetchImpl = allowAllAlerts();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-critical-no-token-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, closure_reason: "resolved", closure_evidence_ref: "ev1" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");
      });

      it("self-review regression: retrying the SAME Idempotency-Key + IDENTICAL (still-incomplete) close body reproduces the SAME error, never a misleading 200 with the alert still open", async () => {
        if (!schemaReady) return;
        const alertId = await fireACriticalAlertTriaged();
        config.iam2FetchImpl = allowAllAlerts();
        const payload = { actor_id: "user_2", alert_id: alertId, closure_reason: "resolved", closure_evidence_ref: "ev1" };
        const key = idemKey(`p5-critical-stuck-processing-${alertId}`);

        const first = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(key),
          payload,
        });
        expect(first.statusCode).toBe(403);
        expect(first.json().error.code).toBe("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");

        // Retry with the EXACT SAME Idempotency-Key and body (no token added) — before the
        // fix, beginIdempotent's "duplicate" branch returned the alert's current (still
        // 'triaged', unclosed) state with a 200, misleadingly implying success/no-op-replay.
        const retry = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(key),
          payload,
        });
        expect(retry.statusCode).toBe(403);
        expect(retry.json().error.code).toBe("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");

        // The alert itself must still be 'triaged', never silently marked closed.
        const alert = await verifyPool.query(`SELECT status FROM sec1.security_alert WHERE alert_id = $1`, [alertId]);
        expect(alert.rows[0].status).toBe("triaged");

        // A genuinely fixed retry (token added) under a NEW Idempotency-Key succeeds normally.
        const fixed = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-critical-stuck-processing-fixed-${alertId}`)),
          payload: { ...payload, approval_id: "appr_real", decision_token: "tok_valid" },
        });
        expect(fixed.statusCode).toBe(200);
        expect(fixed.json().data.status).toBe("closed");
      });

      it("rejected when IAM-02 execute-verify reports an invalid token", async () => {
        if (!schemaReady) return;
        const alertId = await fireACriticalAlertTriaged();
        config.iam2FetchImpl = allowAlertsButExecuteVerifyFails("IAM2_DECISION_TOKEN_INVALID");
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-critical-invalid-token-${alertId}`)),
          payload: {
            actor_id: "user_2",
            alert_id: alertId,
            closure_reason: "resolved",
            closure_evidence_ref: "ev1",
            approval_id: "appr_fake",
            decision_token: "tok_invalid",
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");
      });

      it("rejected when IAM-02 execute-verify reports a payload-hash mismatch (mismatched token)", async () => {
        if (!schemaReady) return;
        const alertId = await fireACriticalAlertTriaged();
        config.iam2FetchImpl = allowAlertsButExecuteVerifyFails("IAM2_PAYLOAD_HASH_MISMATCH");
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-critical-mismatch-token-${alertId}`)),
          payload: {
            actor_id: "user_2",
            alert_id: alertId,
            closure_reason: "resolved",
            closure_evidence_ref: "ev1",
            approval_id: "appr_fake",
            decision_token: "tok_mismatched",
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");
      });

      it("succeeds when IAM-02 execute-verify confirms a validly-bound token", async () => {
        if (!schemaReady) return;
        const alertId = await fireACriticalAlertTriaged();
        config.iam2FetchImpl = allowAllAlerts(); // allowAllAlerts' execute-verify branch returns ok:true
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-critical-valid-token-${alertId}`)),
          payload: {
            actor_id: "user_2",
            alert_id: alertId,
            closure_reason: "resolved",
            closure_evidence_ref: "ev1",
            approval_id: "appr_real",
            decision_token: "tok_valid",
          },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.status).toBe("closed");
      });

      it("non-critical closure does NOT require a decision token (rule_failed_login_spike is 'high', not 'critical')", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = allowAllAlerts();
        const actor = "p5_noncritical_" + randomUUID();
        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: "POST",
            url: "/internal/sec1/audit-events",
            headers: ingestHeaders("IAM-01", idemKey(`p5-noncrit-${i}-${actor}`)),
            payload: sampleEvent({
              event_type: "iam01.generic_event",
              source_module: "IAM-01",
              action: "login",
              result: "failure",
              actor_user_id: actor,
            }),
          });
        }
        const row = await verifyPool.query(
          `SELECT alert_id FROM sec1.security_alert WHERE rule_id = 'rule_failed_login_spike' AND actor_user_id = $1`,
          [actor],
        );
        const alertId = row.rows[0].alert_id as string;
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/assign",
          headers: internalHeaders(idemKey(`p5-noncrit-assign-${alertId}`)),
          payload: { actor_id: "user_1", alert_id: alertId, assigned_to: "user_2" },
        });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/triage",
          headers: internalHeaders(idemKey(`p5-noncrit-triage-${alertId}`)),
          payload: { actor_id: "user_2", alert_id: alertId, triage_status: "true_positive" },
        });
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/security-alerts/close",
          headers: internalHeaders(idemKey(`p5-noncrit-close-${alertId}`)),
          // No approval_id/decision_token supplied at all.
          payload: { actor_id: "user_2", alert_id: alertId, closure_reason: "resolved", closure_evidence_ref: "ev1" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.status).toBe("closed");
      });
    });

    // -----------------------------------------------------------------------------------
    // Dead-letter replay.
    // -----------------------------------------------------------------------------------
    describe("monitoring dead-letter replay", () => {
      it("replays a specific dead-letter item by ID; a subsequently-fixed rule now succeeds and the row transitions to 'replayed'", async () => {
        if (!schemaReady) return;
        const eventType = "p5_replay_probe_" + randomUUID();
        const ruleId = "p5_rule_replay_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO sec1.event_schema (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
           VALUES ($1, 'FND-01', 'system', 'medium', '[]'::jsonb, 'restricted', 'standard', false, 'active', 1)`,
          [eventType],
        );
        await verifyPool.query(
          `INSERT INTO sec1.security_monitoring_rule (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
           VALUES ($1, 'replay test rule', $2::jsonb, '{}'::jsonb, '{"count":"bad","window_seconds":60}'::jsonb, 'high', '{}'::jsonb, 'active', NULL)`,
          [ruleId, JSON.stringify([eventType])],
        );
        const payload = sampleEvent({ event_type: eventType });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`p5-replay-ingest-${ruleId}`)),
          payload,
        });
        const dl = await verifyPool.query(`SELECT dead_letter_id FROM sec1.monitoring_dead_letter WHERE rule_id = $1`, [
          ruleId,
        ]);
        expect(dl.rows).toHaveLength(1);
        const deadLetterId = dl.rows[0].dead_letter_id as string;

        // Fix the rule's threshold shape out-of-band, then replay.
        await verifyPool.query(
          `UPDATE sec1.security_monitoring_rule SET threshold = '{"count":1,"window_seconds":60}'::jsonb WHERE rule_id = $1`,
          [ruleId],
        );

        config.iam2FetchImpl = allowAllAlerts();
        const replayRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/monitoring-dead-letter/replay",
          headers: internalHeaders(idemKey(`p5-replay-${deadLetterId}`)),
          payload: { actor_id: "user_1", dead_letter_id: deadLetterId },
        });
        expect(replayRes.statusCode).toBe(200);
        expect(replayRes.json().data.replayed[0].status).toBe("replayed");

        const dlAfter = await verifyPool.query(`SELECT status FROM sec1.monitoring_dead_letter WHERE dead_letter_id = $1`, [
          deadLetterId,
        ]);
        expect(dlAfter.rows[0].status).toBe("replayed");
        const alerts = await verifyPool.query(`SELECT alert_id FROM sec1.security_alert WHERE rule_id = $1`, [ruleId]);
        expect(alerts.rows).toHaveLength(1);
      });

      it("a replay failure increments retry_count and records the latest failure reason; never deletes the row", async () => {
        if (!schemaReady) return;
        const eventType = "p5_replay_fail_probe_" + randomUUID();
        const ruleId = "p5_rule_replay_fail_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO sec1.event_schema (event_type, source_module, category, default_severity, mandatory_fields, classification, retention_class, sensitive_read, status, version)
           VALUES ($1, 'FND-01', 'system', 'medium', '[]'::jsonb, 'restricted', 'standard', false, 'active', 1)`,
          [eventType],
        );
        await verifyPool.query(
          `INSERT INTO sec1.security_monitoring_rule (rule_id, rule_name, event_type_filter, condition, threshold, severity, recipient_policy, status, approval_id)
           VALUES ($1, 'replay-fail test rule', $2::jsonb, '{}'::jsonb, '{"count":"still-bad","window_seconds":60}'::jsonb, 'medium', '{}'::jsonb, 'active', NULL)`,
          [ruleId, JSON.stringify([eventType])],
        );
        const payload = sampleEvent({ event_type: eventType });
        await app.inject({
          method: "POST",
          url: "/internal/sec1/audit-events",
          headers: ingestHeaders("FND-01", idemKey(`p5-replayfail-ingest-${ruleId}`)),
          payload,
        });
        const dl = await verifyPool.query(`SELECT dead_letter_id FROM sec1.monitoring_dead_letter WHERE rule_id = $1`, [
          ruleId,
        ]);
        const deadLetterId = dl.rows[0].dead_letter_id as string;

        // Rule is STILL malformed — replay must fail again.
        config.iam2FetchImpl = allowAllAlerts();
        const replayRes = await app.inject({
          method: "POST",
          url: "/internal/sec1/monitoring-dead-letter/replay",
          headers: internalHeaders(idemKey(`p5-replayfail-${deadLetterId}`)),
          payload: { actor_id: "user_1", dead_letter_id: deadLetterId },
        });
        expect(replayRes.statusCode).toBe(200);
        expect(replayRes.json().data.replayed[0].status).toBe("failed");
        expect(replayRes.json().data.replayed[0].retryCount).toBe(1);

        const dlAfter = await verifyPool.query(
          `SELECT status, retry_count, failure_reason FROM sec1.monitoring_dead_letter WHERE dead_letter_id = $1`,
          [deadLetterId],
        );
        expect(dlAfter.rows[0].status).toBe("failed");
        expect(dlAfter.rows[0].retry_count).toBe(1);
        expect(dlAfter.rows[0].failure_reason).toContain("threshold.count");
      });

      it("replay is IAM-02 gated (sec1.security_alert.triage)", async () => {
        if (!schemaReady) return;
        config.iam2FetchImpl = denyAllAlerts();
        const res = await app.inject({
          method: "POST",
          url: "/internal/sec1/monitoring-dead-letter/replay",
          headers: internalHeaders(idemKey("p5-replay-deny")),
          payload: { actor_id: "user_1", limit: 5 },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("SEC1_UNAUTHORISED_ALERT_ACTION");
      });
    });

    // -----------------------------------------------------------------------------------
    // Grants (migration 012) — the 4 new tables' exact grant posture.
    // -----------------------------------------------------------------------------------
    describe("grants (migration 012)", () => {
      it("security_monitoring_rule: SELECT only (no INSERT/UPDATE/DELETE)", async () => {
        if (!schemaReady) return;
        for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
          const res = await verifyPool.query(
            `SELECT has_table_privilege('role_sec1_runtime', 'sec1.security_monitoring_rule', $1) AS allowed`,
            [priv],
          );
          expect(res.rows[0]?.allowed, priv).toBe(false);
        }
        const selectRes = await verifyPool.query(
          `SELECT has_table_privilege('role_sec1_runtime', 'sec1.security_monitoring_rule', 'SELECT') AS allowed`,
        );
        expect(selectRes.rows[0]?.allowed).toBe(true);
      });

      it("monitoring_dead_letter: SELECT/INSERT/UPDATE, no DELETE", async () => {
        if (!schemaReady) return;
        for (const priv of ["SELECT", "INSERT", "UPDATE"]) {
          const res = await verifyPool.query(
            `SELECT has_table_privilege('role_sec1_runtime', 'sec1.monitoring_dead_letter', $1) AS allowed`,
            [priv],
          );
          expect(res.rows[0]?.allowed, priv).toBe(true);
        }
        const del = await verifyPool.query(
          `SELECT has_table_privilege('role_sec1_runtime', 'sec1.monitoring_dead_letter', 'DELETE') AS allowed`,
        );
        expect(del.rows[0]?.allowed).toBe(false);
      });

      it("security_alert: SELECT/INSERT/UPDATE, no DELETE (the one deliberately mutable table)", async () => {
        if (!schemaReady) return;
        for (const priv of ["SELECT", "INSERT", "UPDATE"]) {
          const res = await verifyPool.query(
            `SELECT has_table_privilege('role_sec1_runtime', 'sec1.security_alert', $1) AS allowed`,
            [priv],
          );
          expect(res.rows[0]?.allowed, priv).toBe(true);
        }
        const del = await verifyPool.query(
          `SELECT has_table_privilege('role_sec1_runtime', 'sec1.security_alert', 'DELETE') AS allowed`,
        );
        expect(del.rows[0]?.allowed).toBe(false);
      });

      it("alert_triage_note: SELECT/INSERT only, no UPDATE/DELETE (append-only)", async () => {
        if (!schemaReady) return;
        for (const priv of ["SELECT", "INSERT"]) {
          const res = await verifyPool.query(
            `SELECT has_table_privilege('role_sec1_runtime', 'sec1.alert_triage_note', $1) AS allowed`,
            [priv],
          );
          expect(res.rows[0]?.allowed, priv).toBe(true);
        }
        for (const priv of ["UPDATE", "DELETE"]) {
          const res = await verifyPool.query(
            `SELECT has_table_privilege('role_sec1_runtime', 'sec1.alert_triage_note', $1) AS allowed`,
            [priv],
          );
          expect(res.rows[0]?.allowed, priv).toBe(false);
        }
      });

      it("other module runtime roles (fnd/iam/iam2) gained NO privilege on any of the 4 new Phase 5 tables", async () => {
        if (!schemaReady) return;
        for (const role of ["role_fnd_runtime", "role_iam_runtime", "role_iam2_runtime"]) {
          for (const table of [
            "sec1.security_monitoring_rule",
            "sec1.monitoring_dead_letter",
            "sec1.security_alert",
            "sec1.alert_triage_note",
          ]) {
            const res = await verifyPool.query(`SELECT has_table_privilege($1, $2, 'SELECT') AS allowed`, [role, table]);
            expect(res.rows[0]?.allowed, `${role} SELECT ${table}`).toBe(false);
          }
        }
      });

      it("role_sec1_runtime still has NO grant into iam2.* (Phase 5 talks to IAM-02 over HTTP only)", async () => {
        if (!schemaReady) return;
        const { getPool } = await import("@aix/foundation");
        await expect(getPool().query("SELECT 1 FROM iam2.permission LIMIT 1")).rejects.toMatchObject({
          code: "42501",
        });
      });

      it("append-only posture on audit_event/sensitive_read_log/integrity_verification_run is unchanged by Phase 5", async () => {
        if (!schemaReady) return;
        const { getPool } = await import("@aix/foundation");
        await expect(getPool().query("UPDATE sec1.audit_event SET status = 'archived' WHERE 1=0")).rejects.toMatchObject({
          code: "42501",
        });
        await expect(getPool().query("UPDATE sec1.sensitive_read_log SET reason = 'x' WHERE 1=0")).rejects.toMatchObject({
          code: "42501",
        });
        await expect(getPool().query("UPDATE sec1.integrity_verification_run SET result = 'pass' WHERE 1=0")).rejects.toMatchObject({
          code: "42501",
        });
      });
    });

    // -----------------------------------------------------------------------------------
    // IAM-02 permission catalogue registration (migration 013).
    // -----------------------------------------------------------------------------------
    describe("IAM-02 permission catalogue registration (migration 013)", () => {
      it("registers exactly the three Phase 5 alert permission codes, additive, correctly shaped", async () => {
        if (!schemaReady) return;
        const res = await verifyPool.query(
          `SELECT permission_code, resource, action, sensitivity, licence_locked, prohibited,
                  requires_step_up, requires_approval, status, owner_module
             FROM iam2.permission
            WHERE permission_code IN ('sec1.security_alert.read','sec1.security_alert.triage','sec1.security_alert.close')
            ORDER BY permission_code`,
        );
        expect(res.rows).toHaveLength(3);
        for (const row of res.rows) {
          expect(row.resource).toBe("security_alert");
          expect(row.licence_locked).toBe(false);
          expect(row.prohibited).toBe(false);
          expect(row.requires_step_up).toBe(false);
          // requires_approval is false at the CATALOGUE level for all three — the Critical-
          // only requirement is enforced at the SEC-01 route layer (see routes/alerts.ts).
          expect(row.requires_approval).toBe(false);
          expect(row.status).toBe("active");
          expect(row.owner_module).toBe("SEC-01");
        }
      });

      it("seeded NO iam2.role_permission rows for the new permissions", async () => {
        if (!schemaReady) return;
        const res = await verifyPool.query(
          `SELECT count(*) FROM iam2.role_permission rp
             JOIN iam2.permission p ON p.permission_id = rp.permission_id
            WHERE p.permission_code IN ('sec1.security_alert.read','sec1.security_alert.triage','sec1.security_alert.close')`,
        );
        expect(Number(res.rows[0].count)).toBe(0);
      });
    });
  });
});
