/**
 * Shared Rate-Limit Engine — DB-gated behavior tests (WLT-01 BLOCKER-2 prerequisite, DEC-009).
 * Self-skips unless `TEST_DATABASE_URL` is set (H-D3C-1 fail-loud canary below proves the
 * schema is actually migrated to head, not just that the file was invoked).
 *
 * Runs against the SHARED `TEST_DATABASE_URL` (already migrated through 069) — mirrors
 * `tests/integration/db.test.ts`'s own convention, NOT the private-disposable-DB pattern used
 * by `fnd-migration-068-regression.test.ts` (that file owns migration mechanics; this file owns
 * engine BEHAVIOR against an already-migrated schema).
 *
 * Deliberately does NOT touch the real DEC-009 WLT-01 seed rows (migration 069) — a dedicated
 * synthetic test module `ZZ-99` with its own small-number policies is inserted directly and
 * removed in `afterAll`, so concurrency/window tests can use tight limits without perturbing
 * platform policy data or requiring real sleeps.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { closePool, getPool, initPool } from "@aix/foundation";
import { buildApp } from "../../services/fnd/src/server.js";
import { deriveSubjectHash } from "../../services/fnd/src/lib/rate-limit.js";
import type { FndConfig } from "../../services/fnd/src/config.js";

const TEST_DB = process.env.TEST_DATABASE_URL;

/** Synthetic, non-production test module — matches the platform's `^[A-Z]{2,4}-[0-9]{2}$`
 * module-id pattern but is not a real registered module. Isolated from WLT-01's real DEC-009
 * policy rows entirely. */
const TEST_MODULE = "ZZ-99";
const TEST_CONSUMER_TOKEN = "zz99-rate-limit-db-test-consumer-secret-key";

const config: FndConfig = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-token-123",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  rateLimitConsumerSecrets: { [TEST_MODULE]: TEST_CONSUMER_TOKEN },
};

const authHeaders = { "x-internal-service-token": TEST_CONSUMER_TOKEN };

/** Buckets used by this file. Each is its own isolated (module, bucket) namespace. */
const B_ALLOW_AT_LIMIT = "TEST_ALLOW_AT_LIMIT";
const B_BURST_DENY = "TEST_BURST_DENY";
const B_SUSTAINED_DENY = "TEST_SUSTAINED_DENY";
const B_BOTH_DENY = "TEST_BOTH_DENY";
const B_SUBSEQUENT_DENY = "TEST_SUBSEQUENT_DENY";
const B_CONCURRENCY = "TEST_CONCURRENCY";
const B_CONCURRENCY_2APP = "TEST_CONCURRENCY_2APP";
const B_ISOLATION_A = "TEST_ISOLATION_A";
const B_ISOLATION_B = "TEST_ISOLATION_B";
const B_ROLLOVER = "TEST_ROLLOVER";
const B_NO_ROLLOVER = "TEST_NO_ROLLOVER";
const B_SAME_ROW = "TEST_SAME_ROW";
const B_SECRET_HANDLING = "TEST_SECRET_HANDLING";
const B_IDEMPOTENCY = "TEST_IDEMPOTENCY";
const B_INACTIVE = "TEST_INACTIVE";
// B_MISSING intentionally has NO policy row at all — never inserted.
const B_MISSING = "TEST_MISSING_POLICY";

interface TestPolicy {
  policyId: string;
  bucket: string;
  burstLimit: number;
  burstWindowSeconds: number;
  sustainedLimit: number;
  sustainedWindowSeconds: number;
  status?: "active" | "inactive";
}

const TEST_POLICIES: TestPolicy[] = [
  { policyId: "zz_test_allow_at_limit", bucket: B_ALLOW_AT_LIMIT, burstLimit: 3, burstWindowSeconds: 60, sustainedLimit: 30, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_burst_deny", bucket: B_BURST_DENY, burstLimit: 3, burstWindowSeconds: 60, sustainedLimit: 30, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_sustained_deny", bucket: B_SUSTAINED_DENY, burstLimit: 5, burstWindowSeconds: 5, sustainedLimit: 8, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_both_deny", bucket: B_BOTH_DENY, burstLimit: 2, burstWindowSeconds: 5, sustainedLimit: 4, sustainedWindowSeconds: 20 },
  { policyId: "zz_test_subsequent_deny", bucket: B_SUBSEQUENT_DENY, burstLimit: 2, burstWindowSeconds: 60, sustainedLimit: 20, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_concurrency", bucket: B_CONCURRENCY, burstLimit: 10, burstWindowSeconds: 3600, sustainedLimit: 100, sustainedWindowSeconds: 7200 },
  { policyId: "zz_test_concurrency_2app", bucket: B_CONCURRENCY_2APP, burstLimit: 10, burstWindowSeconds: 3600, sustainedLimit: 100, sustainedWindowSeconds: 7200 },
  { policyId: "zz_test_isolation_a", bucket: B_ISOLATION_A, burstLimit: 2, burstWindowSeconds: 60, sustainedLimit: 20, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_isolation_b", bucket: B_ISOLATION_B, burstLimit: 2, burstWindowSeconds: 60, sustainedLimit: 20, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_rollover", bucket: B_ROLLOVER, burstLimit: 2, burstWindowSeconds: 5, sustainedLimit: 50, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_no_rollover", bucket: B_NO_ROLLOVER, burstLimit: 5, burstWindowSeconds: 3600, sustainedLimit: 50, sustainedWindowSeconds: 7200 },
  { policyId: "zz_test_same_row", bucket: B_SAME_ROW, burstLimit: 2, burstWindowSeconds: 5, sustainedLimit: 50, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_secret_handling", bucket: B_SECRET_HANDLING, burstLimit: 10, burstWindowSeconds: 60, sustainedLimit: 100, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_idempotency", bucket: B_IDEMPOTENCY, burstLimit: 10, burstWindowSeconds: 60, sustainedLimit: 100, sustainedWindowSeconds: 3600 },
  { policyId: "zz_test_inactive", bucket: B_INACTIVE, burstLimit: 5, burstWindowSeconds: 60, sustainedLimit: 50, sustainedWindowSeconds: 3600, status: "inactive" },
];

let app: FastifyInstance;
let app2: FastifyInstance;
let schemaReady = false;

async function foundationSchemaExists(): Promise<boolean> {
  try {
    const r = await getPool().query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy'",
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

function uniqueSubject(label: string): string {
  return `zz_subj_${label}_${randomUUID()}`;
}

async function check(target: FastifyInstance, bucket: string, subjectId: string, subjectType = "client") {
  return target.inject({
    method: "POST",
    url: "/foundation/rate-limit/check",
    headers: authHeaders,
    payload: { bucket, subject_type: subjectType, subject_id: subjectId },
  });
}

describe.skipIf(!TEST_DB)("Shared Rate-Limit Engine — DB-gated behavior", () => {
  beforeAll(async () => {
    initPool(config.databaseUrl);
    schemaReady = await foundationSchemaExists();
    if (!schemaReady) return;

    for (const p of TEST_POLICIES) {
      await getPool().query(
        `INSERT INTO foundation.rate_limit_policy
           (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds, status, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
         ON CONFLICT (policy_id) DO UPDATE SET
           burst_limit = EXCLUDED.burst_limit, burst_window_seconds = EXCLUDED.burst_window_seconds,
           sustained_limit = EXCLUDED.sustained_limit, sustained_window_seconds = EXCLUDED.sustained_window_seconds,
           status = EXCLUDED.status`,
        [p.policyId, TEST_MODULE, p.bucket, p.burstLimit, p.burstWindowSeconds, p.sustainedLimit, p.sustainedWindowSeconds, p.status ?? "active"],
      );
    }

    app = await buildApp(config);
    app2 = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (app2) await app2.close();
    if (schemaReady) {
      await getPool().query(`DELETE FROM foundation.rate_limit_decision_log WHERE action LIKE $1`, [`${TEST_MODULE}.%`]);
      await getPool().query(`DELETE FROM foundation.rate_limit_counter WHERE module = $1`, [TEST_MODULE]);
      await getPool().query(`DELETE FROM foundation.rate_limit_policy WHERE module = $1`, [TEST_MODULE]);
    }
    await closePool();
  });

  it("H-D3C-1 canary: fails loud if the schema is not migrated to head (never silently skips)", async () => {
    if (!schemaReady) {
      return expect(schemaReady, "TEST_DATABASE_URL must point at a Postgres migrated through 069_fnd_rate_limit_policy_seed (run npm run migrate:up first)").toBe(true);
    }
    expect(schemaReady).toBe(true);
  });

  it("allows every request up to and including the exact burst limit", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("allow_at_limit");
    for (let i = 0; i < 3; i++) {
      const res = await check(app, B_ALLOW_AT_LIMIT, subjectId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      expect(res.json().data.retry_after_seconds).toBeNull();
      expect(Object.keys(res.json().data).sort()).toEqual(["decision", "limit_ref", "retry_after_seconds"]);
      expect(res.json().data.limit_ref).toBe("zz_test_allow_at_limit:v1");
    }
  });

  it("burst-only deny at limit+1: exactly one transition-to-deny log row, Retry-After from the burst window", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("burst_deny");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_BURST_DENY, "client", subjectId);
    // Seed the counter directly AT the burst limit (previous state was allow: 3 <= 3) so the
    // very next call is provably the first crossing, without needing 3 real prior calls.
    await getPool().query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count)
       VALUES ($1, $2, $3, now(), 3, now(), 3)`,
      [TEST_MODULE, B_BURST_DENY, subjectHash],
    );

    const res = await check(app, B_BURST_DENY, subjectId);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(res.json().data).toBeUndefined();
    // The error envelope carries only the retry-after value — no thresholds/counts/policy/
    // bucket/subject/limit_ref.
    const details = res.json().error.details;
    expect(details).toEqual([{ field: "retry_after_seconds", issue: expect.any(String) }]);

    const log = await getPool().query(
      `SELECT decision, action, limit_ref, scope_hash, retry_after_seconds FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`,
      [subjectHash],
    );
    expect(log.rowCount).toBe(1);
    expect(log.rows[0].decision).toBe("throttle");
    expect(log.rows[0].action).toBe(`${TEST_MODULE}.${B_BURST_DENY}`);
    expect(log.rows[0].limit_ref).toBe("zz_test_burst_deny:v1");
    expect(log.rows[0].retry_after_seconds).toBeGreaterThanOrEqual(1);
  });

  it("sustained-only deny: burst stays within limit, sustained crosses — Retry-After from the sustained window", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("sustained_deny");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_SUSTAINED_DENY, "client", subjectId);
    // burst_limit=5, sustained_limit=8. Seed burst well under its limit (1) but sustained AT
    // its limit (8) — previous combined state was allow (1<=5 AND 8<=8); the next call keeps
    // burst allowed (2<=5) but pushes sustained to 9>8: a sustained-only deny.
    await getPool().query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count)
       VALUES ($1, $2, $3, now(), 1, now(), 8)`,
      [TEST_MODULE, B_SUSTAINED_DENY, subjectHash],
    );

    const res = await check(app, B_SUSTAINED_DENY, subjectId);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);

    const counter = await getPool().query(
      `SELECT burst_count, sustained_count FROM foundation.rate_limit_counter WHERE subject_hash = $1`,
      [subjectHash],
    );
    expect(counter.rows[0].burst_count).toBe(2);
    expect(counter.rows[0].sustained_count).toBe(9);

    const log = await getPool().query(`SELECT decision FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`, [subjectHash]);
    expect(log.rowCount).toBe(1);
  });

  it("both dimensions deny simultaneously: Retry-After reflects the LATER of the two resets", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("both_deny");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_BOTH_DENY, "client", subjectId);
    // burst_limit=2/5s, sustained_limit=4/20s. Seed both AT their limits with DIFFERENT window
    // starts so the two resets land at different times — sustained's window started later
    // (closer to now), so its reset is LATER than burst's (which started further in the past).
    await getPool().query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count)
       VALUES ($1, $2, $3, now() - interval '3 seconds', 2, now() - interval '1 seconds', 4)`,
      [TEST_MODULE, B_BOTH_DENY, subjectHash],
    );

    const res = await check(app, B_BOTH_DENY, subjectId);
    expect(res.statusCode).toBe(429);
    const retryAfter = Number(res.headers["retry-after"]);
    // Burst resets at (now-3s)+5s = now+2s -> ceil ~2. Sustained resets at (now-1s)+20s = now+19s
    // -> ceil ~19. The LATER (sustained) must win, not the earlier (burst).
    expect(retryAfter).toBeGreaterThanOrEqual(17);
    expect(retryAfter).toBeLessThanOrEqual(20);

    const log = await getPool().query(`SELECT decision FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`, [subjectHash]);
    expect(log.rowCount).toBe(1);
  });

  it("subsequent denies while already over quota produce ZERO additional log rows", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("subsequent_deny");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_SUBSEQUENT_DENY, "client", subjectId);
    await getPool().query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count)
       VALUES ($1, $2, $3, now(), 2, now(), 2)`,
      [TEST_MODULE, B_SUBSEQUENT_DENY, subjectHash],
    );

    const first = await check(app, B_SUBSEQUENT_DENY, subjectId); // transition: 3rd request, limit=2
    expect(first.statusCode).toBe(429);
    const second = await check(app, B_SUBSEQUENT_DENY, subjectId);
    const third = await check(app, B_SUBSEQUENT_DENY, subjectId);
    expect(second.statusCode).toBe(429);
    expect(third.statusCode).toBe(429);

    const log = await getPool().query(`SELECT count(*)::int AS n FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`, [subjectHash]);
    expect(log.rows[0].n).toBe(1);

    const counter = await getPool().query(`SELECT burst_count FROM foundation.rate_limit_counter WHERE subject_hash = $1`, [subjectHash]);
    // Denied requests remain counted — never refunded.
    expect(counter.rows[0].burst_count).toBe(5);
  });

  it("CONCURRENCY: N simultaneous over-threshold requests admit exactly the configured limit and produce exactly ONE transition log row (race-free)", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("concurrency");
    const N = 30; // policy burst_limit = 10
    const responses = await Promise.all(Array.from({ length: N }, () => check(app, B_CONCURRENCY, subjectId)));

    const allowed = responses.filter((r) => r.statusCode === 200);
    const denied = responses.filter((r) => r.statusCode === 429);
    expect(allowed.length).toBe(10);
    expect(denied.length).toBe(N - 10);
    expect(allowed.length + denied.length).toBe(N);

    const subjectHash = deriveSubjectHash(TEST_MODULE, B_CONCURRENCY, "client", subjectId);
    const counter = await getPool().query(`SELECT burst_count FROM foundation.rate_limit_counter WHERE subject_hash = $1`, [subjectHash]);
    expect(counter.rows[0].burst_count).toBe(N);

    const log = await getPool().query(`SELECT count(*)::int AS n FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`, [subjectHash]);
    expect(log.rows[0].n).toBe(1);
  }, 30_000);

  it("CONCURRENCY across two independent app instances sharing the same DB: admitted count is still exactly the limit, never limit+1", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("concurrency_2app");
    const N = 24; // policy burst_limit = 10
    const calls = Array.from({ length: N }, (_, i) => check(i % 2 === 0 ? app : app2, B_CONCURRENCY_2APP, subjectId));
    const responses = await Promise.all(calls);

    const allowed = responses.filter((r) => r.statusCode === 200);
    const denied = responses.filter((r) => r.statusCode === 429);
    expect(allowed.length).toBe(10);
    expect(denied.length).toBe(N - 10);

    const subjectHash = deriveSubjectHash(TEST_MODULE, B_CONCURRENCY_2APP, "client", subjectId);
    const log = await getPool().query(`SELECT count(*)::int AS n FROM foundation.rate_limit_decision_log WHERE scope_hash = $1`, [subjectHash]);
    expect(log.rows[0].n).toBe(1);
  }, 30_000);

  it("namespace isolation: different buckets for the same subject keep fully independent counters", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("isolation_bucket");
    const a1 = await check(app, B_ISOLATION_A, subjectId);
    const a2 = await check(app, B_ISOLATION_A, subjectId);
    const a3 = await check(app, B_ISOLATION_A, subjectId); // limit=2 -> 3rd denies
    expect([a1.statusCode, a2.statusCode]).toEqual([200, 200]);
    expect(a3.statusCode).toBe(429);

    // Bucket B is untouched — same subject, different bucket, still fresh.
    const b1 = await check(app, B_ISOLATION_B, subjectId);
    expect(b1.statusCode).toBe(200);
  });

  it("namespace isolation: different subject_id values for the same bucket keep fully independent counters", async () => {
    if (!schemaReady) return;
    const subjectX = uniqueSubject("isolation_subj_x");
    const subjectY = uniqueSubject("isolation_subj_y");
    await check(app, B_ISOLATION_A, subjectX);
    await check(app, B_ISOLATION_A, subjectX); // X now at its limit=2
    const resY = await check(app, B_ISOLATION_A, subjectY); // fresh subject, still fresh
    expect(resY.statusCode).toBe(200);
  });

  it("namespace isolation: different subject_type for the SAME subject_id string is a different subject_hash / independent counter", async () => {
    if (!schemaReady) return;
    const rawId = uniqueSubject("isolation_type");
    const client = await check(app, B_ISOLATION_A, rawId, "client");
    const user = await check(app, B_ISOLATION_A, rawId, "user");
    expect(client.statusCode).toBe(200);
    expect(user.statusCode).toBe(200); // independent counter, not sharing client's count

    const hashClient = deriveSubjectHash(TEST_MODULE, B_ISOLATION_A, "client", rawId);
    const hashUser = deriveSubjectHash(TEST_MODULE, B_ISOLATION_A, "user", rawId);
    expect(hashClient).not.toBe(hashUser);
    const rows = await getPool().query(
      `SELECT subject_hash FROM foundation.rate_limit_counter WHERE module = $1 AND bucket = $2 AND subject_hash IN ($3, $4)`,
      [TEST_MODULE, B_ISOLATION_A, hashClient, hashUser],
    );
    expect(rows.rowCount).toBe(2);
  });

  it("window rollover: burst_window_start_utc manipulated into the past resets on the next call; count returns to 1", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("rollover");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_ROLLOVER, "client", subjectId);
    // Seed a stale window (burst_window_seconds = 5) that already elapsed.
    await getPool().query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count)
       VALUES ($1, $2, $3, now() - interval '10 seconds', 2, now(), 2)`,
      [TEST_MODULE, B_ROLLOVER, subjectHash],
    );

    const res = await check(app, B_ROLLOVER, subjectId);
    expect(res.statusCode).toBe(200); // rollover reset -> 1, well under limit=2, not a deny

    const row = await getPool().query(
      `SELECT burst_count, burst_window_start_utc, now() AS server_now FROM foundation.rate_limit_counter WHERE subject_hash = $1`,
      [subjectHash],
    );
    expect(row.rows[0].burst_count).toBe(1);
    const windowStartMs = new Date(row.rows[0].burst_window_start_utc).getTime();
    const nowMs = new Date(row.rows[0].server_now).getTime();
    expect(nowMs - windowStartMs).toBeLessThan(2000); // window_start moved to ~now, not left stale
  });

  it("NO rollover when the window has not elapsed: window_start does not move, count increments normally", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("no_rollover");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_NO_ROLLOVER, "client", subjectId);
    const first = await check(app, B_NO_ROLLOVER, subjectId);
    expect(first.statusCode).toBe(200);
    const afterFirst = await getPool().query(`SELECT burst_window_start_utc FROM foundation.rate_limit_counter WHERE subject_hash = $1`, [subjectHash]);
    const windowStartAfterFirst = afterFirst.rows[0].burst_window_start_utc;

    const second = await check(app, B_NO_ROLLOVER, subjectId);
    expect(second.statusCode).toBe(200);
    const afterSecond = await getPool().query(
      `SELECT burst_count, burst_window_start_utc FROM foundation.rate_limit_counter WHERE subject_hash = $1`,
      [subjectHash],
    );
    expect(afterSecond.rows[0].burst_count).toBe(2);
    expect(new Date(afterSecond.rows[0].burst_window_start_utc).getTime()).toBe(new Date(windowStartAfterFirst).getTime());
  });

  it("the SAME (module,bucket,subject_hash) row is reused across multiple simulated window rollovers — no new row is ever created", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("same_row");
    const subjectHash = deriveSubjectHash(TEST_MODULE, B_SAME_ROW, "client", subjectId);

    await check(app, B_SAME_ROW, subjectId);
    // Force rollover, call again.
    await getPool().query(
      `UPDATE foundation.rate_limit_counter SET burst_window_start_utc = now() - interval '10 seconds' WHERE subject_hash = $1`,
      [subjectHash],
    );
    await check(app, B_SAME_ROW, subjectId);
    // Force rollover again, call a third time.
    await getPool().query(
      `UPDATE foundation.rate_limit_counter SET burst_window_start_utc = now() - interval '10 seconds' WHERE subject_hash = $1`,
      [subjectHash],
    );
    await check(app, B_SAME_ROW, subjectId);

    const rows = await getPool().query(`SELECT count(*)::int AS n FROM foundation.rate_limit_counter WHERE subject_hash = $1`, [subjectHash]);
    expect(rows.rows[0].n).toBe(1); // exactly one row, reused every time — never a new insert
  });

  it("failure: missing policy row -> 503 RATE_LIMIT_UNAVAILABLE, never 200 and never 429", async () => {
    if (!schemaReady) return;
    const res = await check(app, B_MISSING, uniqueSubject("missing_policy"));
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("failure: inactive policy row -> 503 RATE_LIMIT_UNAVAILABLE, never 200 and never 429", async () => {
    if (!schemaReady) return;
    const res = await check(app, B_INACTIVE, uniqueSubject("inactive_policy"));
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("secret/subject handling: the raw subject_id and the consumer token never appear anywhere in persisted rows or the HTTP response; only the derived hash is stored", async () => {
    if (!schemaReady) return;
    const rawSubjectId = "super_secret_client_id_" + randomUUID();
    const res = await check(app, B_SECRET_HANDLING, rawSubjectId);
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain(rawSubjectId);
    expect(JSON.stringify(res.json())).not.toContain(TEST_CONSUMER_TOKEN);

    const expectedHash = deriveSubjectHash(TEST_MODULE, B_SECRET_HANDLING, "client", rawSubjectId);
    const counter = await getPool().query(`SELECT * FROM foundation.rate_limit_counter WHERE module = $1 AND bucket = $2`, [TEST_MODULE, B_SECRET_HANDLING]);
    expect(counter.rows[0].subject_hash).toBe(expectedHash);
    expect(JSON.stringify(counter.rows)).not.toContain(rawSubjectId);
    expect(JSON.stringify(counter.rows)).not.toContain(TEST_CONSUMER_TOKEN);

    const policy = await getPool().query(`SELECT * FROM foundation.rate_limit_policy WHERE module = $1 AND bucket = $2`, [TEST_MODULE, B_SECRET_HANDLING]);
    expect(JSON.stringify(policy.rows)).not.toContain(rawSubjectId);
    expect(JSON.stringify(policy.rows)).not.toContain(TEST_CONSUMER_TOKEN);
  });

  it("idempotency non-interaction: repeated identical checks increment again (no dedupe), no Idempotency-Key required, and NO foundation.idempotency_record row is ever created for this action", async () => {
    if (!schemaReady) return;
    const subjectId = uniqueSubject("idempotency");
    const first = await check(app, B_IDEMPOTENCY, subjectId); // no Idempotency-Key header at all
    const second = await check(app, B_IDEMPOTENCY, subjectId);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200); // NOT replayed/deduped — a genuine second increment

    const subjectHash = deriveSubjectHash(TEST_MODULE, B_IDEMPOTENCY, "client", subjectId);
    const counter = await getPool().query(`SELECT burst_count FROM foundation.rate_limit_counter WHERE subject_hash = $1`, [subjectHash]);
    expect(counter.rows[0].burst_count).toBe(2);

    const idem = await getPool().query(`SELECT count(*)::int AS n FROM foundation.idempotency_record WHERE action LIKE '%rate_limit%'`);
    expect(idem.rows[0].n).toBe(0);
  });

  // Must remain LAST in this file — mirrors the established platform pattern
  // (tests/integration/clt1-principal-membership-route.test.ts's own "N. DB/service
  // unavailable" test): closes the shared pool to simulate unavailability, then restores it in
  // a finally so this file's own afterAll can still clean up its test rows.
  it("failure: DB pool unavailable -> 503 RATE_LIMIT_UNAVAILABLE, never 200 and never 429 (must remain LAST — restores the pool afterward)", async () => {
    if (!schemaReady) return;
    await closePool();
    try {
      const res = await check(app, B_ALLOW_AT_LIMIT, uniqueSubject("db_unavailable"));
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    } finally {
      initPool(config.databaseUrl);
    }
  });
});
