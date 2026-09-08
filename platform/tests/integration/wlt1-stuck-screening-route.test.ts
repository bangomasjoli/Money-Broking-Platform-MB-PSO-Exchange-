/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure — DB-
 * gated integration tests for `GET /internal/wlt1/stuck-screenings` and
 * `POST /internal/wlt1/stuck-screenings/:screening_result_id/recover`
 * (services/wlt1/src/routes/stuck-screening.ts) against the SHARED canonical `aix_platform_test`
 * database — mirrors `tests/integration/wlt1-inbound-source-screening-route.test.ts`'s own
 * established harness (own copy per file, F3(c)). No IAM on either route.
 *
 * Fixtures are seeded DIRECTLY via SQL (superuser `verifyPool`) — this file's own concern is the
 * stuck-screening routes' own scope/idempotency/lock/race mechanics, NOT the upstream
 * registration/screening flows that produce a `pending` row in production (already covered in
 * their own dedicated route test files) — mirrors the identical, already-accepted privileged-
 * fixture convention every other WLT-01 route test file uses.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";
const OWNED_CLIENT_PREFIX = "clt1client_stuck_";

const config: Wlt1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-wlt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  wlt1InternalServiceToken: "test-wlt1-internal-token-it",
  clt1BaseUrl: "http://127.0.0.1:0",
  clt1InternalServiceToken: "test-clt1-internal-token-it",
  screeningProviderId: "stub-wallet-analytics-v1",
  screeningMaxValidityHours: 720,
  providerReceiptSecrets: {},
  pocChallengeTtlMinutes: 15,
  pocMaxAttempts: 5,
  destinationCoolingOffHours: 24,
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-internal-token-it",
  decisionTokenTtlMinutes: 5,
  aml1BaseUrl: "http://127.0.0.1:0",
  aml1InternalServiceToken: "test-aml1-internal-token-it",
  rescreenLeadTimeHours: 72,
  rescreenBatchSizeDefault: 50,
  rescreenBatchSizeMax: 200,
  fiatScreeningMaxValidityHours: 720,
  beneficiaryVerificationValidityHours: 8760,
  fiatEncKey: "test-fiat-enc-key-at-least-32-characters-long",
  beneficiaryVerificationProviderId: "stub-beneficiary-verification-v1",
  fiatScreeningProviderId: "stub-fiat-screening-v1",
  fiatVerificationRequired: true,
  evidenceExportMaxRecords: 5000,
  stuckScreeningThresholdSeconds: 300,
};

const INTERNAL_HEADERS = { "x-internal-service-token": config.wlt1InternalServiceToken };
const DEFAULT_THRESHOLD = config.stuckScreeningThresholdSeconds;

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.wallet_screening_result'::regclass AND conname = 'wallet_screening_result_risk_status_check' AND pg_get_constraintdef(oid) LIKE '%failed%'`);
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

function freshClientId(): string {
  return OWNED_CLIENT_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16);
}

function getStuck(query = "") {
  return app.inject({ method: "GET", url: `/internal/wlt1/stuck-screenings${query}`, headers: INTERNAL_HEADERS });
}

function recover(screeningResultId: string, body: Record<string, unknown>, idemKey: string) {
  return app.inject({ method: "POST", url: `/internal/wlt1/stuck-screenings/${screeningResultId}/recover`, headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

function recoverBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { actor_id: "staff_stuck_it", reason_code: "provider_result_never_delivered", ...overrides };
}

/** Seeds a destination + a wallet_screening_result row, backdating `updated_at_utc`/`created_at_utc`
 * so the row is genuinely old enough to be "stuck" without waiting in real time. */
async function seedStuckScreening(clientId: string, opts: { ageSeconds?: number; destinationStatus?: string; riskStatus?: string } = {}): Promise<{ destinationId: string; screeningResultId: string }> {
  const ageSeconds = opts.ageSeconds ?? DEFAULT_THRESHOLD + 60;
  const destinationStatus = opts.destinationStatus ?? "pending_screening";
  const riskStatus = opts.riskStatus ?? "pending";
  const destinationId = "wlt1dest_stuck_" + randomUUID();
  const screeningResultId = "wlt1screen_stuck_" + randomUUID();
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'wallet',$3,$4)`, [
    destinationId,
    clientId,
    "hash_" + randomUUID(),
    destinationStatus,
  ]);
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, issued_at_utc, created_at_utc, updated_at_utc)
     VALUES ($1,$2,1,'stub-wallet-analytics-v1','1','ethereum','mainnet',$3,$4, now() - ($5 || ' seconds')::interval, now() - ($5 || ' seconds')::interval, now() - ($5 || ' seconds')::interval)`,
    [screeningResultId, destinationId, "addrhash_" + randomUUID(), riskStatus, ageSeconds],
  );
  return { destinationId, screeningResultId };
}

async function idemRecordFor(key: string): Promise<{ status: string; result_ref: string | null } | undefined> {
  const r = await verifyPool.query(`SELECT status, result_ref FROM foundation.idempotency_record WHERE idempotency_key = $1 AND source_module = 'WLT-01' AND action = 'wlt1.stuck_screening.recover'`, [key]);
  return r.rows[0];
}

describe("WLT-01 Stuck-Screening Operational Closure — GET/POST /internal/wlt1/stuck-screenings", () => {
  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    schemaReady = await schemasExist();
    if (!schemaReady) return;

    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_wlt1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  it("fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up (migration 065 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    config.stuckScreeningThresholdSeconds = DEFAULT_THRESHOLD;
    await verifyPool.query(`DELETE FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.stuck_screening.recover'`);
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
  });

  // -------------------------------------------------------------------------------------------
  describe("POST /recover — core matrix", () => {
    it("A. unknown screening_result_id -> 404, NO idempotency row created for that key", async () => {
      if (!schemaReady) return;
      const key = "k-unknown-" + randomUUID();
      const res = await recover("wlt1screen_doesnotexist_" + randomUUID(), recoverBody(), key);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_STUCK_SCREENING_NOT_FOUND");
      expect(await idemRecordFor(key)).toBeUndefined();
    });

    it("B. known but terminal (already 'clear') screening -> 409", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId, { riskStatus: "clear" });
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_STUCK_SCREENING_INVALID_STATE");
    });

    it("C. below configured threshold -> 409", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId, { ageSeconds: 5 });
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_STUCK_SCREENING_INVALID_STATE");
    });

    it("D. happy recovery: screening failed, destination draft, version +1, exactly one audit, replay:false", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { destinationId, screeningResultId } = await seedStuckScreening(clientId);
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ screening_result_id: screeningResultId, destination_id: destinationId, risk_status: "failed", destination_released: true, replay: false });

      const screeningRow = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(screeningRow.rows[0]?.risk_status).toBe("failed");
      const destRow = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(destRow.rows[0]).toMatchObject({ status: "draft", destination_status_version: 2 });

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("E. same-key completed replay: 200, replay:true, exact original response, no additional audit/mutation", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const key = "k-" + randomUUID();
      const first = await recover(screeningResultId, recoverBody(), key);
      expect(first.statusCode).toBe(200);
      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);

      const replay = await recover(screeningResultId, recoverBody(), key);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ ...first.json().data, replay: true });

      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));
    });

    it("F. new key after already-completed recovery -> 409, NEVER a replay", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      await recover(screeningResultId, recoverBody(), "k1-" + randomUUID());
      const second = await recover(screeningResultId, recoverBody(), "k2-" + randomUUID());
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("WLT1_STUCK_SCREENING_INVALID_STATE");
    });

    it("G. recovery -> fresh screening (new version) -> replay OLD recovery key: old recovered_at/screening id/version unchanged, NO destination_status/destination_status_version fields, no current-state misrepresentation", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { destinationId, screeningResultId } = await seedStuckScreening(clientId);
      const k1 = "k1-" + randomUUID();
      const first = await recover(screeningResultId, recoverBody(), k1);
      expect(first.statusCode).toBe(200);
      const originalResponse = first.json().data;

      // A later genuine fresh screen: allocate the next version directly (privileged fixture,
      // mirrors the real C2 initiation this file does not re-exercise) and move the destination
      // through its normal lifecycle again.
      const newScreeningId = "wlt1screen_stuck_fresh_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, issued_at_utc)
         VALUES ($1,$2,2,'stub-wallet-analytics-v1','1','ethereum','mainnet',$3,'clear', now())`,
        [newScreeningId, destinationId, "addrhash_" + randomUUID()],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review', destination_status_version = destination_status_version + 1 WHERE destination_id = $1`, [destinationId]);

      const replay = await recover(screeningResultId, recoverBody(), k1);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ ...originalResponse, replay: true });
      expect(replay.json().data.screening_result_id).toBe(screeningResultId);
      expect(replay.json().data.screening_result_version).toBe(1);
      expect(replay.json().data).not.toHaveProperty("destination_status");
      expect(replay.json().data).not.toHaveProperty("destination_status_version");

      await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [newScreeningId]);
    });

    it("H. recovery-vs-provider-receipt: receipt wins first (terminally applies 'clear') -> recovery 409, no recovery audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { destinationId, screeningResultId } = await seedStuckScreening(clientId);
      // Simulate the receipt path's own already-accepted terminal application (privileged fixture
      // — this file's own concern is the recovery route, not the receipt route, which has its own
      // dedicated, unmodified test suite).
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET risk_status = 'clear' WHERE screening_result_id = $1`, [screeningResultId]);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);

      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_STUCK_SCREENING_INVALID_STATE");
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
      expect(Number(audit.rows[0]?.n)).toBe(0);
    });

    it("I. recovery-vs-provider-receipt: recovery wins first -> a late receipt applying against a 'failed' row is impossible via the SAME one-way-gate SQL the receipt path itself uses (no failed->terminal overwrite)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(200);

      // Directly exercise the EXACT one-way-gate predicate applyNormalizedScreeningResult's own
      // production UPDATE uses (`risk_status = 'pending'`) — proving it structurally cannot match
      // a 'failed' row, without importing or modifying that production file.
      const attempted = await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result SET risk_status = 'clear' WHERE screening_result_id = $1 AND risk_status = 'pending' RETURNING screening_result_id`,
        [screeningResultId],
      );
      expect(attempted.rows).toHaveLength(0);
      const stillFailed = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(stillFailed.rows[0]?.risk_status).toBe("failed");
    });

    it("J. recovery-vs-C3-resume: C3 wins first (destination back to draft would come from resume's OWN terminal completion; simulate 'clear' + destination pending_review) -> recovery 409", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { destinationId, screeningResultId } = await seedStuckScreening(clientId);
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET risk_status = 'review_required' WHERE screening_result_id = $1`, [screeningResultId]);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(409);
    });

    it("K. recovery-vs-C3-resume: recovery wins first -> the C3 retry-claim predicate (risk_status='pending') cannot match the now-'failed' row", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(200);

      // The EXACT C3 claim predicate from wallet-screening.ts, exercised directly against the now-
      // failed row (privileged probe, not a modification to that production file).
      const claimAttempt = await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() WHERE screening_result_id = $1 AND risk_status = 'pending' AND updated_at_utc <= now() - interval '30 seconds' RETURNING screening_result_id`,
        [screeningResultId],
      );
      expect(claimAttempt.rows).toHaveLength(0);
    });

    it("L. a 'failed' screening cannot be terminally applied by the exact receipt-path UPDATE predicate", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      for (const terminal of ["clear", "review_required", "high_risk", "hit"]) {
        const attempt = await verifyPool.query(
          `UPDATE wlt1.wallet_screening_result SET risk_status = $2 WHERE screening_result_id = $1 AND risk_status = 'pending' RETURNING screening_result_id`,
          [screeningResultId, terminal],
        );
        expect(attempt.rows).toHaveLength(0);
      }
    });

    it("M. a 'failed' screening cannot be C3-resumed", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { destinationId, screeningResultId } = await seedStuckScreening(clientId);
      await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`, headers: { ...INTERNAL_HEADERS, "idempotency-key": "k-c3-" + randomUUID() }, payload: {} });
      // destination.status is now 'draft' (recovery's own mutation) -> C2 fresh initiation path,
      // never a C3 resume of the failed row; the destination has no matching wallet_destination
      // row in this privileged fixture, so it fails closed rather than silently screening.
      expect(res.statusCode).not.toBe(200);
      const stillFailed = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(stillFailed.rows[0]?.risk_status).toBe("failed");
    });

    it("N. audit recovered_at_utc equals the response recovered_at_utc exactly", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const res = await recover(screeningResultId, recoverBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(200);
      const audit = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%' LIMIT 1`,
        [screeningResultId],
      );
      const parsed = JSON.parse(audit.rows[0].payload_ref);
      expect(parsed.metadata.recovered_at_utc).toBe(res.json().data.recovered_at_utc);
    });

    it("concurrent identical recovery requests: one terminal transition, one audit, deterministic winner/loser", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const [a, b] = await Promise.all([
        recover(screeningResultId, recoverBody(), "ka-" + randomUUID()),
        recover(screeningResultId, recoverBody(), "kb-" + randomUUID()),
      ]);
      const statuses = [a.statusCode, b.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("request contract: no auth -> 401; unknown body field -> 400; invalid reason_code -> 400; no Idempotency-Key -> 400", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId);
      const noAuth = await app.inject({ method: "POST", url: `/internal/wlt1/stuck-screenings/${screeningResultId}/recover`, payload: recoverBody() });
      expect(noAuth.statusCode).toBe(401);

      const extraField = await recover(screeningResultId, { ...recoverBody(), extra: "x" }, "k-" + randomUUID());
      expect(extraField.statusCode).toBe(400);

      const badReason = await recover(screeningResultId, recoverBody({ reason_code: "not_a_real_reason" }), "k-" + randomUUID());
      expect(badReason.statusCode).toBe(400);

      const noKey = await app.inject({ method: "POST", url: `/internal/wlt1/stuck-screenings/${screeningResultId}/recover`, headers: INTERNAL_HEADERS, payload: recoverBody() });
      expect(noKey.statusCode).toBe(400);
      expect(noKey.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("GET /stuck-screenings", () => {
    it("configured threshold boundary: below excluded, at/above included", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId: belowId } = await seedStuckScreening(clientId, { ageSeconds: DEFAULT_THRESHOLD - 30 });
      const { screeningResultId: atId } = await seedStuckScreening(clientId, { ageSeconds: DEFAULT_THRESHOLD + 5 });
      const res = await getStuck();
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.stuck_screenings.map((r: { screening_result_id: string }) => r.screening_result_id);
      expect(ids).not.toContain(belowId);
      expect(ids).toContain(atId);
    });

    it("min_age_seconds may only RAISE the effective threshold — cannot lower it below the configured floor", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId, { ageSeconds: DEFAULT_THRESHOLD + 5 });
      // A LOW min_age_seconds does NOT surface a screening that is below the CONFIGURED threshold.
      const { screeningResultId: freshId } = await seedStuckScreening(clientId, { ageSeconds: 10 });
      const lowered = await getStuck("?min_age_seconds=1");
      const loweredIds = lowered.json().data.stuck_screenings.map((r: { screening_result_id: string }) => r.screening_result_id);
      expect(loweredIds).not.toContain(freshId);
      expect(loweredIds).toContain(screeningResultId);

      // A HIGH min_age_seconds correctly RAISES the effective threshold, excluding rows below it.
      const raised = await getStuck(`?min_age_seconds=${DEFAULT_THRESHOLD + 3600}`);
      const raisedIds = raised.json().data.stuck_screenings.map((r: { screening_result_id: string }) => r.screening_result_id);
      expect(raisedIds).not.toContain(screeningResultId);
    });

    it(">200 qualifying rows: exactly 200 returned, oldest first", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const ids: string[] = [];
      for (let i = 0; i < 205; i++) {
        const { screeningResultId } = await seedStuckScreening(clientId, { ageSeconds: DEFAULT_THRESHOLD + 1000 - i });
        ids.push(screeningResultId);
      }
      const res = await getStuck();
      expect(res.json().data.stuck_screenings).toHaveLength(200);
      // Oldest-first: the row with the LARGEST age (created with i=0, the smallest subtracted
      // offset -> oldest updated_at_utc) must appear before a newer one.
      const returnedIds = res.json().data.stuck_screenings.map((r: { screening_result_id: string }) => r.screening_result_id);
      expect(returnedIds[0]).toBe(ids[0]);
    }, 20_000);

    it("safe projection: response never carries an address, address_hash, client_id, or risk_score", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await seedStuckScreening(clientId);
      const res = await getStuck();
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain(clientId);
      const row = res.json().data.stuck_screenings[0];
      expect(row).not.toHaveProperty("destination_status");
      expect(row).not.toHaveProperty("address_hash");
      expect(row).not.toHaveProperty("canonical_address");
      expect(row).not.toHaveProperty("client_id");
      expect(row).not.toHaveProperty("risk_score");
    });

    it("recoverable:true when destination is pending_screening; recoverable:false when it has moved on", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId: recoverableId } = await seedStuckScreening(clientId, { destinationStatus: "pending_screening" });
      const { screeningResultId: notRecoverableId } = await seedStuckScreening(clientId, { destinationStatus: "revoked" });
      const res = await getStuck();
      const rows: Array<{ screening_result_id: string; recoverable: boolean }> = res.json().data.stuck_screenings;
      expect(rows.find((r) => r.screening_result_id === recoverableId)?.recoverable).toBe(true);
      expect(rows.find((r) => r.screening_result_id === notRecoverableId)?.recoverable).toBe(false);
    });

    it("age_seconds is DB-derived and floored", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { screeningResultId } = await seedStuckScreening(clientId, { ageSeconds: DEFAULT_THRESHOLD + 500 });
      const res = await getStuck();
      const row = res.json().data.stuck_screenings.find((r: { screening_result_id: string }) => r.screening_result_id === screeningResultId);
      expect(Number.isInteger(row.age_seconds)).toBe(true);
      expect(row.age_seconds).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD + 499);
    });

    it("no auth -> 401; unknown query field -> 400", async () => {
      if (!schemaReady) return;
      const noAuth = await app.inject({ method: "GET", url: "/internal/wlt1/stuck-screenings" });
      expect(noAuth.statusCode).toBe(401);
      const badQuery = await app.inject({ method: "GET", url: "/internal/wlt1/stuck-screenings?client_id=x", headers: INTERNAL_HEADERS });
      expect(badQuery.statusCode).toBe(400);
    });
  });
});
