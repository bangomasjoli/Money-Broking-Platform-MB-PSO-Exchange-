/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure —
 * fail-closed failure injection, PRIVATE disposable database. Mirrors
 * `wlt1-inbound-source-failclosed-private.test.ts` / `wlt1-evidence-export-failclosed-private.test.ts`'s
 * own established rationale exactly: this file's own mechanism is to REVOKE/GRANT
 * `role_wlt1_runtime`'s INSERT privilege on `foundation.outbox_event` — an ACL mutation against the
 * SHARED canonical database's shared role would remove ordinary INSERT privilege from any
 * bystander request another concurrently-running file's test might issue. This file provisions its
 * own PRIVATE, uniquely named, disposable database (migrated to head, with the real `fnd`/`wlt1`
 * runtime grant files applied) so its ACL mutation can never reach any other file's bystander
 * request. The shared canonical database's `role_wlt1_runtime` privilege state is never touched by
 * this file.
 *
 * REAL failure injection, not a mocked helper: the recovery audit INSERT is forced to fail for the
 * runtime role; the route is invoked; the assertion is that the outward HTTP response is 503
 * WLT1_AUDIT_REQUIRED, the screening row remains 'pending' (never 'failed'), the destination
 * remains 'pending_screening' with an UNCHANGED destination_status_version, no
 * `wlt1.screening_recovered` audit event exists, and idempotency completion never happened — the
 * `beginIdempotent` INSERT, the screening mutation, the destination mutation, the audit publish,
 * and `completeIdempotent` all live in the SAME transaction (the frozen "ONE mutation TX"
 * requirement — unlike Inbound-Source Screening's own deliberate split TX-A/TX-B design, where
 * `beginIdempotent` commits on its own before the domain mutation). A forced audit failure here
 * therefore rolls back the ENTIRE transaction, including the idempotency reservation itself — no
 * row survives for that key, so a same-key retry after ACL restoration is not "stuck" at
 * 'processing'; it is indistinguishable from a fresh request and succeeds directly.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_stuckfcp_private_test";

const PRIVATE_DB_NAME = `wlt1_stuckfcp_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_stuckfcp";
const STUCK_THRESHOLD_SECONDS = 300;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-stuckfcp-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-stuckfcp-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-stuckfcp-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-stuckfcp-it",
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
    stuckScreeningThresholdSeconds: STUCK_THRESHOLD_SECONDS,
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

async function seedStuckScreening(): Promise<{ destinationId: string; screeningResultId: string }> {
  const destinationId = "wlt1dest_stuckfcp_" + randomUUID();
  const screeningResultId = "wlt1screen_stuckfcp_" + randomUUID();
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'wallet',$3,'pending_screening')`, [
    destinationId,
    OWNED_CLIENT_ID,
    "hash_" + randomUUID(),
  ]);
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, issued_at_utc, created_at_utc, updated_at_utc)
     VALUES ($1,$2,1,'stub-wallet-analytics-v1','1','ethereum','mainnet',$3,'pending', now() - interval '600 seconds', now() - interval '600 seconds', now() - interval '600 seconds')`,
    [screeningResultId, destinationId, "addrhash_" + randomUUID()],
  );
  return { destinationId, screeningResultId };
}

function recover(screeningResultId: string, idemKey: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/stuck-screenings/${screeningResultId}/recover`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idemKey },
    payload: { actor_id: "staff_stuckfcp_it", reason_code: "provider_result_never_delivered" },
  });
}

describe("WLT-01 Stuck-Screening Recovery — fail-closed audit atomicity (private database)", () => {
  it("PRECONDITION: the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it("REAL failure injection: the recovery audit INSERT is forced to fail — the route returns 503 WLT1_AUDIT_REQUIRED; screening stays 'pending', destination stays 'pending_screening' with an UNCHANGED destination_status_version, zero wlt1.screening_recovered events, no idempotency row survives for that key (ONE mutation TX rolled back entirely); ACL restoration + the SAME Idempotency-Key then succeeds directly and mutates atomically", async () => {
    if (!schemaReady) return;
    const { destinationId, screeningResultId } = await seedStuckScreening();
    const idemKey = "idem-stuckfcp-" + randomUUID();

    const beforeDest = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    expect(beforeDest.rows[0]).toMatchObject({ status: "pending_screening", destination_status_version: 1 });

    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await recover(screeningResultId, idemKey);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    // ONE mutation TX invariant: the screening mutation, the destination mutation, the audit
    // publish, and the idempotency completion all live in the SAME transaction — a forced audit
    // failure must roll back ALL of them together, never leaving a partial mutation (e.g. the
    // screening row flipped to 'failed' while the destination stayed 'pending_screening', or vice
    // versa) behind.
    const screeningRow = await verifyPool.query(`SELECT risk_status, screening_result_version FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
    expect(screeningRow.rows[0]).toMatchObject({ risk_status: "pending", screening_result_version: 1 });

    const destRow = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    expect(destRow.rows[0]).toMatchObject({ status: "pending_screening", destination_status_version: 1 });

    const auditCount = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
    expect(Number(auditCount.rows[0].n)).toBe(0);

    const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE idempotency_key = $1 AND source_module = 'WLT-01' AND action = 'wlt1.stuck_screening.recover'`, [idemKey]);
    expect(idemRow.rows[0]).toBeUndefined();

    // ONE mutation TX: no idempotency row survived the rollback, so the SAME key is safe to
    // retry immediately after ACL restoration — it is indistinguishable from a fresh request and
    // succeeds directly (deliberately different from Inbound-Source Screening's own split
    // TX-A/TX-B design, where beginIdempotent commits independently and a same-key retry stays
    // stuck at 'processing' forever).
    const recovered = await recover(screeningResultId, idemKey);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().data.replay).toBe(false);

    const screeningAfter = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
    expect(screeningAfter.rows[0]?.risk_status).toBe("failed");
    const destAfter = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    expect(destAfter.rows[0]).toMatchObject({ status: "draft", destination_status_version: 2 });

    const recoveredAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.screening_recovered' AND payload_ref LIKE '%' || $1 || '%'`, [screeningResultId]);
    expect(Number(recoveredAudit.rows[0].n)).toBe(1);
  }, 30_000);
});
