/**
 * WLT-01 Evidence Export — fail-closed failure injection, PRIVATE disposable database. Mirrors
 * `wlt1-sensitive-read-failclosed-private.test.ts`'s own established rationale exactly: this
 * file's own mechanism is to REVOKE/GRANT `role_wlt1_runtime`'s INSERT privilege on
 * `foundation.outbox_event` — an ACL mutation against the SHARED canonical database's shared role
 * would remove ordinary INSERT privilege from any bystander request another concurrently-running
 * file's test might issue. This file provisions its own PRIVATE, uniquely named, disposable
 * database (migrated to head, with the real `fnd`/`wlt1` runtime grant files applied) so its ACL
 * mutation can never reach any other file's bystander request. The shared canonical database's
 * `role_wlt1_runtime` privilege state is never touched by this file.
 *
 * Covers BOTH mandatory audit boundaries the IAM/Idempotency Final Correction requires real
 * (non-mocked) failure-injection coverage for:
 *   (A) apply's generated-audit failure -> 503 WLT1_AUDIT_REQUIRED, zero
 *       `wlt1.evidence_export` rows, zero `wlt1.evidence_export_generated` events; the old
 *       Idempotency-Key is permanently stuck (503 forever) — recovery requires a genuinely NEW
 *       IAM-02 approval + NEW decision token + NEW Idempotency-Key, never a same-token retry
 *       (the IAM-02 decision-token single-consume/irreversible contract this route's own header
 *       comment documents).
 *   (B) download's disclosure-audit failure -> 503 WLT1_EVIDENCE_EXPORT_LOG_REQUIRED, NO
 *       restricted export bytes in the response; a plain retry after ACL restoration succeeds (the
 *       download route holds no state to burn, unlike apply's IAM-02 token).
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
const RUNTIME_ROLE_USER = "wlt1_evexp_failclosed_private_test";

const PRIVATE_DB_NAME = `wlt1_evexpfcp_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_evexpfcp";

const allowAllIam2Fetch: typeof fetch = (async (url: unknown) => {
  const urlStr = String(url);
  if (urlStr.endsWith("/internal/iam2/permission/check")) {
    return { ok: true, json: async () => ({ success: true, data: { decision: "allow", reason: "permission_granted" } }) } as Response;
  }
  if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
    return { ok: true, json: async () => ({ success: true, data: { execution_authorised: true } }) } as Response;
  }
  throw new Error(`Unexpected URL in WLT-01 evidence-export fail-closed private IT IAM-02 test fake: ${urlStr}`);
}) as unknown as typeof fetch;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-evexpfcp-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-evexpfcp-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-evexpfcp-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-evexpfcp-it",
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
    iam2FetchImpl: allowAllIam2Fetch,
  };
  app = await buildApp(mainConfig);

  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'wallet',$3,'revoked')`, [
    "wlt1dest_evexpfcp_seed",
    OWNED_CLIENT_ID,
    "hash_" + randomUUID(),
  ]);

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

function applyExport(exportId: string, idemKey: string, approvalId: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/evidence-exports/${exportId}/apply`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idemKey },
    payload: {
      actor_id: "staff_evexpfcp_it",
      client_id: OWNED_CLIENT_ID,
      evidence_types: ["destination_current_state"],
      approval_id: approvalId,
      decision_token: "wlt1dt_" + "x".repeat(43),
    },
  });
}

function downloadExport(exportId: string) {
  return app.inject({
    method: "GET",
    url: `/internal/wlt1/evidence-exports/${exportId}/download?actor_id=staff_evexpfcp_it&client_id=${OWNED_CLIENT_ID}`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
  });
}

describe("WLT-01 Evidence Export — fail-closed audit atomicity (private database)", () => {
  it("PRECONDITION: the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  describe("(A) apply's generated-audit failure boundary", () => {
    it("REAL failure injection: the generated-audit INSERT is forced to fail — apply returns 503 WLT1_AUDIT_REQUIRED, zero evidence_export rows, zero generated-audit events; the SAME Idempotency-Key stays permanently stuck (never a silent success later); a genuinely NEW approval + NEW token + NEW Idempotency-Key succeeds after ACL restoration", async () => {
      if (!schemaReady) return;
      const exportId = "wlt1exp_evexpfcp_a_" + randomUUID();
      const idemKey = "idem-evexpfcp-a-" + randomUUID();
      const approvalId = "iam2appr_evexpfcp_a_" + randomUUID();

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await applyExport(exportId, idemKey, approvalId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      // No export row and no generated-audit event survived the forced failure — the INSERT and
      // the audit publish were inside the SAME transaction as the failure, so both rolled back
      // together.
      const rowCount = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
      expect(Number(rowCount.rows[0].n)).toBe(0);
      const auditCount = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_export_generated' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(auditCount.rows[0].n)).toBe(0);

      // The old Idempotency-Key is permanently stuck at 'processing' — a same-key, same-body retry
      // NEVER silently succeeds later (foundation has no lease/reclaim mechanism; this is the
      // documented, deliberate recovery contract, not a bug).
      const staleRetry = await applyExport(exportId, idemKey, approvalId);
      expect(staleRetry.statusCode).toBe(503);

      // Recovery requires a genuinely NEW export_id + NEW Idempotency-Key + NEW approval_id (the
      // WLT-side stand-in for "a new IAM-02 approval + a new decision token" — this fail-closed
      // fake IAM always allows, so the NEW-ness of the approval_id is what this test can actually
      // prove at the WLT layer; the real IAM-02 single-consume mechanics are IAM-02's own concern).
      const newExportId = "wlt1exp_evexpfcp_a_retry_" + randomUUID();
      const newIdemKey = "idem-evexpfcp-a-retry-" + randomUUID();
      const newApprovalId = "iam2appr_evexpfcp_a_retry_" + randomUUID();
      const recovered = await applyExport(newExportId, newIdemKey, newApprovalId);
      expect(recovered.statusCode).toBe(201);
      expect(recovered.json().data.export_id).toBe(newExportId);

      const recoveredAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_export_generated' AND payload_ref LIKE '%' || $1 || '%'`, [
        newExportId,
      ]);
      expect(Number(recoveredAudit.rows[0].n)).toBe(1);
    }, 30_000);
  });

  describe("(B) download's disclosure-audit failure boundary", () => {
    it("REAL failure injection: a genuine export exists (real content, would disclose real evidence bytes) — the disclosure-audit INSERT is forced to fail — download returns 503 WLT1_EVIDENCE_EXPORT_LOG_REQUIRED with NO export bytes in the response body; ACL is restored and a plain retry then succeeds and discloses correctly, writing exactly one disclosure event", async () => {
      if (!schemaReady) return;
      const exportId = "wlt1exp_evexpfcp_b_" + randomUUID();
      const created = await applyExport(exportId, "idem-evexpfcp-b-setup-" + randomUUID(), "iam2appr_evexpfcp_b_" + randomUUID());
      expect(created.statusCode).toBe(201);
      const expectedContentHash = created.json().data.content_hash;

      const beforeInjection = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(beforeInjection.rows[0].n)).toBe(0);

      await withOutboxAclLock(TEST_DB as string, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await downloadExport(exportId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_LOG_REQUIRED");
          // CRITICAL: no export bytes/content-hash ever escaped in the failure response.
          const raw = JSON.stringify(res.json());
          expect(raw).not.toContain(expectedContentHash);
          expect(res.json().data).toBeUndefined();
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });

      // No disclosure record was left behind by the forced failure.
      const afterInjection = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(afterInjection.rows[0].n)).toBe(0);

      // The underlying export row is completely untouched — the download route makes no mutation,
      // so there is nothing to roll back; the only effect of the forced failure was withholding
      // the bytes.
      const row = await verifyPool.query(`SELECT content_hash FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
      expect(row.rows[0].content_hash).toBe(expectedContentHash);

      // A genuine retry after ACL restoration succeeds for real and discloses correctly — no
      // idempotency key, no burned token; a download retry is always safe to repeat.
      const retry = await downloadExport(exportId);
      expect(retry.statusCode).toBe(200);
      expect(retry.headers["x-wlt1-content-hash"]).toBe(expectedContentHash);
      const afterRetry = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(afterRetry.rows[0].n)).toBe(1);
    }, 30_000);
  });
});
