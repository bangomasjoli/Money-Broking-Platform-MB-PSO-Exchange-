/**
 * WLT-01 Inbound-Source Screening — fail-closed failure injection, PRIVATE disposable database.
 * Mirrors `wlt1-evidence-export-failclosed-private.test.ts`'s own established rationale exactly:
 * this file's own mechanism is to REVOKE/GRANT `role_wlt1_runtime`'s INSERT privilege on
 * `foundation.outbox_event` — an ACL mutation against the SHARED canonical database's shared role
 * would remove ordinary INSERT privilege from any bystander request another concurrently-running
 * file's test might issue. This file provisions its own PRIVATE, uniquely named, disposable
 * database (migrated to head, with the real `fnd`/`wlt1` runtime grant files applied) so its ACL
 * mutation can never reach any other file's bystander request. The shared canonical database's
 * `role_wlt1_runtime` privilege state is never touched by this file.
 *
 * REAL failure injection, not a mocked helper: the generated-audit INSERT is forced to fail for
 * the runtime role; the route is invoked; the assertion is that the outward HTTP response is 503
 * `WLT1_AUDIT_REQUIRED`, ZERO durable evidence rows, and ZERO `wlt1.inbound_source_screened`
 * events — evidence + audit + idempotency completion commit atomically in TX-B, so a forced audit
 * failure must roll back the whole transaction, never leaving a screening result behind without
 * its accompanying domain audit.
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
import { WLT1_TEST_STUB_ADDRESS_CLEAR } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_inbsrc_failclosed_private_test";

const PRIVATE_DB_NAME = `wlt1_inbsrcfcp_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_inbsrcfcp";

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-inbsrcfcp-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-inbsrcfcp-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-inbsrcfcp-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-inbsrcfcp-it",
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

function screen(idemKey: string, transactionRef: string) {
  return app.inject({
    method: "POST",
    url: "/internal/wlt1/inbound-source-screenings",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idemKey },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", source_address: WLT1_TEST_STUB_ADDRESS_CLEAR, transaction_ref: transactionRef },
  });
}

describe("WLT-01 Inbound-Source Screening — fail-closed audit atomicity (private database)", () => {
  it("PRECONDITION: the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it("REAL failure injection: the generated-audit INSERT is forced to fail — the route returns 503 WLT1_AUDIT_REQUIRED, zero durable evidence rows, zero wlt1.inbound_source_screened events; the SAME Idempotency-Key stays stuck at 'processing' forever; ACL restoration + a genuinely NEW Idempotency-Key then succeeds", async () => {
    if (!schemaReady) return;
    const transactionRef = "tx-inbsrcfcp-" + randomUUID();
    const idemKey = "idem-inbsrcfcp-" + randomUUID();

    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await screen(idemKey, transactionRef);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    // No evidence row and no generated-audit event survived the forced failure — the INSERT and
    // the audit publish were inside the SAME transaction as the failure, so both rolled back
    // together.
    const rowCount = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1`, [OWNED_CLIENT_ID]);
    expect(Number(rowCount.rows[0].n)).toBe(0);
    const auditCount = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [transactionRef]);
    expect(Number(auditCount.rows[0].n)).toBe(0);

    // The Idempotency-Key stays stuck at 'processing' — same-key, same-body retry never silently
    // succeeds later (foundation has no lease/reclaim mechanism; this is the deliberate recovery
    // contract, not a bug).
    const staleRetry = await screen(idemKey, transactionRef);
    expect(staleRetry.statusCode).toBe(503);

    // Recovery requires a genuinely NEW Idempotency-Key.
    const recovered = await screen("idem-inbsrcfcp-retry-" + randomUUID(), transactionRef);
    expect(recovered.statusCode).toBe(201);
    expect(recovered.json().data.replay).toBe(false);

    const recoveredAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [
      transactionRef,
    ]);
    expect(Number(recoveredAudit.rows[0].n)).toBe(1);
  }, 30_000);
});
