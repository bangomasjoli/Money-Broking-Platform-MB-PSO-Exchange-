/**
 * WLT-01 Phase 3A-2/3A-3 — challenge-issued / verified / failed-proof audit atomicity, PRIVATE
 * disposable database.
 *
 * Mirrors `wlt1-outbox-acl-private.test.ts`'s own established rationale exactly: this file's own
 * mechanism is to REVOKE/GRANT `role_wlt1_runtime`'s INSERT privilege on `foundation.outbox_event`
 * — an ACL mutation against the SHARED canonical database's shared role would remove ordinary
 * INSERT privilege from any bystander request another concurrently-running file's test might
 * issue. This file provisions its own PRIVATE, uniquely named, disposable database (migrated
 * through head 053, with the real `fnd`/`wlt1` runtime grant files applied) so its ACL mutation can
 * never reach any other file's bystander request. The shared canonical database's
 * `role_wlt1_runtime` privilege state is never touched by this file.
 *
 * Phase 3A-3 addition: two more forced-audit-failure scenarios, both using REAL cryptography (the
 * Phase 3A-1 golden test key, via `tests/helpers/poc-test-signing.ts`) — a verified-transition
 * audit failure, and a failed-proof-attempt audit failure. The golden key's own derived address has
 * no stub-provider fixture, so `screeningProviderImpl` (the established test-injection seam) is
 * used to reach `pending_review` for it.
 *
 * M-REV-1 INTERIM RULE: the restricted-role connection URL is derived via the SAME safe regex
 * rewrite `wlt1-outbox-acl-private.test.ts`/`wlt1-screening-route-private.test.ts` already use
 * (`replace(/^postgres:\/\/[^@]+@/, ...)`), and this file's own canary additionally asserts the
 * runtime connection is not superuser.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";
import { POC_TEST_ADDRESS_RAW, signPocMessage, signPocMessageWithWrongKey } from "../helpers/poc-test-signing.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_poc_audit_private_test";

const PRIVATE_DB_NAME = `wlt1_poc_audit_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

function ignoreExpectedDisconnect(): void {
  /* intentionally empty — expected during DROP DATABASE ... WITH (FORCE) teardown */
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_pocauditprivate";

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

/** The golden test key's own derived address has no stub-provider fixture entry — this synthetic
 * provider returns a deterministic terminal `clear` result for ANY input (the SAME established
 * `screeningProviderImpl` test-injection seam every prior WLT-01 test file already uses). */
const alwaysClearProvider: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(_input: WalletScreeningInput) {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_pocauditprivate_" + randomUUID(),
        riskStatus: "clear" as const,
        riskScore: 1.0,
        riskCategories: [],
        directExposure: [],
        indirectExposure: [],
        sanctionsExposure: false,
        clusterRef: null,
        issuedAtUtc: new Date().toISOString(),
        validUntilUtc: null,
      },
    };
  },
};

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-poc-audit-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-poc-audit-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-poc-audit-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "wlt1_runtime_grants.sql"), "utf8"));

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

  const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-pocauditprivate-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: alwaysClearProvider,
  };
  app = await buildApp(mainConfig);

  schemaReady = true;
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
  if (maintenancePool) {
    if (databaseCreated) {
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME} WITH (FORCE)`).catch(async () => {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME}`).catch(() => undefined);
      });
    }
    await maintenancePool.end();
  }
});

afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.proof_of_control.challenge.create'`);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

async function createPendingReviewDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination();
  const screenRes = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (screenRes.statusCode !== 200) throw new Error(`expected terminal screening, got ${screenRes.statusCode} ${screenRes.body}`);
  return { destinationId };
}

function createChallenge(destinationId: string, idempotencyKey: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
    payload: { client_id: OWNED_CLIENT_ID },
  });
}

async function issueChallenge(destinationId: string): Promise<{ challengeId: string; message: string }> {
  const res = await createChallenge(destinationId, freshKey());
  if (res.statusCode !== 201) throw new Error(`challenge creation failed: ${res.statusCode} ${res.body}`);
  return { challengeId: res.json().data.challenge_id, message: res.json().data.message };
}

/** A `pending_review` destination whose canonical address is the GOLDEN key's own derived
 * address — via `alwaysClearProvider` (registered on the app config above). */
async function createSignableDestination(): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: POC_TEST_ADDRESS_RAW, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  const destinationId = res.json().data.destination_id;
  const screenRes = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (screenRes.statusCode !== 200) throw new Error(`expected terminal screening, got ${screenRes.statusCode} ${screenRes.body}`);
  return { destinationId };
}

function submitVerify(destinationId: string, challengeId: string, signature: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, challenge_id: challengeId, signature },
  });
}

describe("WLT-01 Phase 3A-2 — challenge-issued audit atomicity (private database)", () => {
  it("PRECONDITION (M-REV-1 interim rule): the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it("a forced challenge-issued audit-publish failure rolls back the ENTIRE issuance transaction: 503 WLT1_AUDIT_REQUIRED, zero proof_of_control row delta, prior issued row (if any) unchanged, idempotency NOT falsely completed — and a retry with the SAME key after ACL restoration succeeds for real", async () => {
    if (!schemaReady) return;
    const { destinationId } = await createPendingReviewDestination();

    // Seed a PRIOR issued challenge first (via a real request) so we can prove it remains
    // completely untouched by the later failed attempt's own supersession logic.
    const priorKey = freshKey();
    const priorRes = await createChallenge(destinationId, priorKey);
    expect(priorRes.statusCode).toBe(201);
    const priorChallengeId = priorRes.json().data.challenge_id;
    const priorRowBefore = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [priorChallengeId]);

    const rowCountBefore = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);

    const failingKey = freshKey();
    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await createChallenge(destinationId, failingKey);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    // Zero row delta — the whole transaction (including the prior-issued supersession attempt
    // and the new INSERT) rolled back together with the failed audit publish.
    const rowCountAfter = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    expect(Number(rowCountAfter.rows[0].n)).toBe(Number(rowCountBefore.rows[0].n));

    // The PRIOR issued row is byte-for-byte unchanged — never partially superseded.
    const priorRowAfter = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [priorChallengeId]);
    expect(priorRowAfter.rows[0]).toEqual(priorRowBefore.rows[0]);
    expect(priorRowAfter.rows[0].verification_status).toBe("issued");

    // No audit was left behind by the failed attempt.
    const auditRows = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_challenge_issued'`);
    expect(Number(auditRows.rows[0].n)).toBe(1); // only the PRIOR successful issuance's own audit

    // Idempotency rollback (Part AD): the failed key was never durably bound to a
    // failed/nonexistent challenge — beginIdempotent's own INSERT rolled back with everything
    // else. A retry with the SAME key, after ACL restoration, must succeed for real.
    const idemRow = await verifyPool.query(
      `SELECT count(*)::int AS n FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.proof_of_control.challenge.create' AND idempotency_key = $1`,
      [failingKey],
    );
    expect(Number(idemRow.rows[0].n)).toBe(0);

    const retry = await createChallenge(destinationId, failingKey);
    expect(retry.statusCode).toBe(201);
    const retriedChallengeId = retry.json().data.challenge_id;
    expect(retriedChallengeId).not.toBe(priorChallengeId);

    // The retry's own success superseded the (still fully intact) prior issued challenge.
    const priorAfterRetry = await verifyPool.query(`SELECT verification_status FROM wlt1.proof_of_control WHERE challenge_id = $1`, [priorChallengeId]);
    expect(priorAfterRetry.rows[0].verification_status).toBe("superseded");
    const newRow = await verifyPool.query(`SELECT verification_status FROM wlt1.proof_of_control WHERE challenge_id = $1`, [retriedChallengeId]);
    expect(newRow.rows[0].verification_status).toBe("issued");
    const auditAfterRetry = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_challenge_issued'`);
    expect(Number(auditAfterRetry.rows[0].n)).toBe(2); // prior success + this retry's own success
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3A-3 — verified-transition and failed-proof-attempt audit atomicity. Both use REAL
  // cryptography (the golden test key) end to end through the real verify route.
  // -----------------------------------------------------------------------------------------
  it("Phase 3A-3: a forced wlt1.proof_of_control_verified audit-publish failure rolls back the ENTIRE verified transition: 503 WLT1_AUDIT_REQUIRED, challenge remains 'issued', signature_hash/recovered_address/verified_at_utc all remain NULL, attempt_count unchanged — a retry of the SAME valid signature after ACL restoration succeeds for real, exactly one verified audit after the successful retry", async () => {
    if (!schemaReady) return;
    const { destinationId } = await createSignableDestination();
    const { challengeId, message } = await issueChallenge(destinationId);
    const validSignature = signPocMessage(message);
    const before = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);

    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await submitVerify(destinationId, challengeId, validSignature);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    const after = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
    expect(after.rows[0]).toEqual(before.rows[0]); // byte-for-byte unchanged — full rollback
    expect(after.rows[0].verification_status).toBe("issued");
    expect(after.rows[0].signature_hash).toBeNull();
    expect(after.rows[0].recovered_address).toBeNull();
    expect(after.rows[0].verified_at_utc).toBeNull();
    expect(after.rows[0].attempt_count).toBe(0);

    const auditRows = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_verified'`);
    expect(Number(auditRows.rows[0].n)).toBe(0);

    // Retry the SAME valid signature after ACL restoration — succeeds for real.
    const retry = await submitVerify(destinationId, challengeId, validSignature);
    expect(retry.statusCode).toBe(200);
    const finalRow = await verifyPool.query(`SELECT verification_status, signature_hash, recovered_address, verified_at_utc FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
    expect(finalRow.rows[0].verification_status).toBe("verified");
    expect(finalRow.rows[0].signature_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(finalRow.rows[0].recovered_address).not.toBeNull();
    const auditAfterRetry = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_verified'`);
    expect(Number(auditAfterRetry.rows[0].n)).toBe(1);
  });

  it("Phase 3A-3: a forced wlt1.proof_of_control_failed audit-publish failure rolls back the ENTIRE attempt: 503 WLT1_AUDIT_REQUIRED, attempt_count NOT incremented, last_failure_reason_code unchanged, status unchanged — a retry (even with a genuinely invalid signature again) after ACL restoration correctly consumes exactly one attempt, never two", async () => {
    if (!schemaReady) return;
    const { destinationId } = await createSignableDestination();
    const { challengeId, message } = await issueChallenge(destinationId);
    const invalidSignature = signPocMessageWithWrongKey(message);
    const before = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);

    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await submitVerify(destinationId, challengeId, invalidSignature);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    const after = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
    expect(after.rows[0]).toEqual(before.rows[0]); // byte-for-byte unchanged — full rollback
    expect(after.rows[0].attempt_count).toBe(0); // the transient audit failure never consumed an attempt
    expect(after.rows[0].verification_status).toBe("issued");
    expect(after.rows[0].last_failure_reason_code).toBeNull();

    const auditRows = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_failed'`);
    expect(Number(auditRows.rows[0].n)).toBe(0);

    // Retry after ACL restoration — the SAME invalid signature now correctly consumes exactly ONE
    // attempt (not two, proving the failed transaction genuinely never partially committed).
    const retry = await submitVerify(destinationId, challengeId, invalidSignature);
    expect(retry.statusCode).toBe(422);
    const finalRow = await verifyPool.query(`SELECT attempt_count, verification_status FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
    expect(finalRow.rows[0].attempt_count).toBe(1);
    expect(finalRow.rows[0].verification_status).toBe("issued");
    const auditAfterRetry = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_failed'`);
    expect(Number(auditAfterRetry.rows[0].n)).toBe(1);
  });
});
