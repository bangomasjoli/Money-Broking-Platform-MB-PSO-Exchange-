/**
 * WLT-01 Evidence Export — DB-gated integration tests for the 4 routes in
 * `services/wlt1/src/routes/evidence-export.ts` (request/apply/status/download) against the SHARED
 * canonical `aix_platform_test` database — mirrors `tests/integration/wlt1-fiat-approval-route.test.ts`'s
 * own established harness exactly (own copy per file, F3(c)). IAM-02 is stubbed via
 * `config.iam2FetchImpl` using the SAME fake-fetch shape already established for the other
 * maker-checker routes — no live IAM-02 process is started.
 *
 * Individual evidence-type fixtures are seeded DIRECTLY via SQL (superuser `verifyPool`) — this
 * file's own concern is the route's scope/IAM/idempotency/disclosure mechanics, NOT the upstream
 * registration/screening/verification/decision flows that produce this data in production (already
 * covered in their own dedicated route test files) — mirrors the identical, already-accepted
 * privileged-fixture convention `wlt1-fiat-approval-route.test.ts` uses for its own gate matrix.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";
const OWNED_CLIENT_PREFIX = "clt1client_evexp_";

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
};

const INTERNAL_HEADERS = { "x-internal-service-token": config.wlt1InternalServiceToken };
const DEFAULT_MAX_RECORDS = config.evidenceExportMaxRecords;

// -------------------------------------------------------------------------------------------
// Fake IAM-02 fetch stub — own copy, mirrors wlt1-fiat-approval-route.test.ts's own identical shape.
// -------------------------------------------------------------------------------------------
interface Iam2FakeOptions {
  checkDecision?: () => { decision: string; reason: string };
  verify?: () => { ok: boolean; execution_authorised?: boolean; errorCode?: string } | Promise<{ ok: boolean; execution_authorised?: boolean; errorCode?: string }>;
  onCheck?: () => void;
  onVerify?: () => void;
}

function makeFakeIam2Fetch(opts: Iam2FakeOptions): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      opts.onCheck?.();
      const result = opts.checkDecision ? opts.checkDecision() : { decision: "allow", reason: "permission_granted" };
      return { ok: true, json: async () => ({ success: true, data: result }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      opts.onVerify?.();
      const result = opts.verify ? await opts.verify() : { ok: true, execution_authorised: true };
      if (!result.ok) {
        return { ok: false, json: async () => ({ success: false, error: { code: result.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: result.execution_authorised ?? true } }) } as Response;
    }
    throw new Error(`Unexpected URL in WLT-01 evidence-export IT IAM-02 test fake: ${urlStr}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({});
}
function denyBaselineIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }) });
}
function denyExecuteVerifyIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_SOD_VIOLATION" }) });
}
function iam2Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'evidence_export'`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

function freshClientId(): string {
  return OWNED_CLIENT_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16);
}

function hashTokenLocal(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

interface FullFixture {
  clientId: string;
  walletDestinationId: string;
  fiatDestinationId: string;
}

/** Seeds ALL 10 evidence types for one client — one wallet-type destination (wallet_destination,
 * address_integrity_check, wallet_screening_result, proof_of_control, destination_decision,
 * destination_revocation) and one fiat_payout-type destination (fiat_payout_destination,
 * fiat_screening_result, beneficiary_verification). destination_current_state is trivially present
 * for both from wlt1.destination itself. */
async function seedFullEvidenceClient(clientId: string): Promise<FullFixture> {
  const walletDestinationId = "wlt1dest_evexp_w_" + randomUUID();
  const fiatDestinationId = "wlt1dest_evexp_f_" + randomUUID();

  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'wallet',$3,'revoked')`, [
    walletDestinationId,
    clientId,
    "hash_" + randomUUID(),
  ]);
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'fiat_payout',$3,'active')`, [
    fiatDestinationId,
    clientId,
    "hash_" + randomUUID(),
  ]);

  await verifyPool.query(
    `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
     VALUES ($1,'ethereum','mainnet',$2,$3,'ethereum-eip55-v1','unhosted','self')`,
    [walletDestinationId, "0x" + "1".repeat(40), "addrhash_" + randomUUID()],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
     VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678',$2,'ciphertext','MYR','apac_local_my')`,
    [fiatDestinationId, "hash_acct_" + fiatDestinationId],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$4,'ethereum-eip55-v1',true,'pass','canonicalisation_succeeded')`,
    ["wlt1chk_evexp_" + randomUUID(), walletDestinationId, clientId, "hash_" + randomUUID()],
  );

  const walletScreeningResultId = "wlt1screen_evexp_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, issued_at_utc, valid_until_utc)
     VALUES ($1,$2,1,'stub-wallet-analytics-v1','1','ethereum','mainnet',$3,'clear', now(), now() + interval '1 hour')`,
    [walletScreeningResultId, walletDestinationId, "hash_" + randomUUID()],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, matched_name_normalized, issued_at_utc, valid_until_utc)
     VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual','clear','JOHN TAN', now(), now() + interval '1 hour')`,
    ["wlt1fscr_evexp_" + randomUUID(), fiatDestinationId],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.beneficiary_verification (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc)
     VALUES ($1,$2,1,'stub-beneficiary-verification-v1','1','verified','hash_name',$3, now(), now() + interval '1 hour')`,
    ["wlt1bv_evexp_" + randomUUID(), fiatDestinationId, "hash_acct_" + fiatDestinationId],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control
       (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme,
        message_format_version, domain_environment, nonce, message_hash, verification_status, signature_hash, recovered_address,
        issued_at_utc, expires_at_utc, verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now() + interval '15 minutes', now())`,
    [
      "wlt1pocchal_evexp_" + randomUUID(),
      walletDestinationId,
      clientId,
      "0x" + "1".repeat(40),
      "sha256:" + "ab".repeat(32),
      "cd".repeat(32),
      "ef".repeat(32),
      "12".repeat(32),
      "0x" + "1".repeat(40),
    ],
  );

  const decisionId = "wlt1dec_evexp_" + randomUUID();
  const rawToken = "wlt1dt_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision,
        aml_decision_id, aml_valid_until_utc, screening_result_id,
        destination_status_version, whitelist_version, revocation_epoch, chain, network,
        destination_type, issued_at_utc, expires_at_utc, status)
     VALUES ($1,$2,$3,$4,'destination_use','allow',$5, now() + interval '1 hour', $6, 0,0,0,'ethereum','mainnet','wallet', now(), now() + interval '1 hour', 'issued')`,
    [decisionId, hashTokenLocal(rawToken), walletDestinationId, clientId, "aml1ptd_" + randomUUID(), walletScreeningResultId],
  );

  await verifyPool.query(
    `INSERT INTO wlt1.destination_revocation
       (revocation_id, destination_id, client_id, source, reason_code, actor_id, signal_ref, signal_type,
        destination_status_version_after, revocation_epoch_after)
     VALUES ($1,$2,$3,'operator','compromise','staff_evexp_it',NULL,NULL,1,1)`,
    ["wlt1rev_evexp_" + randomUUID(), walletDestinationId, clientId],
  );

  return { clientId, walletDestinationId, fiatDestinationId };
}

function requestExport(body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/internal/wlt1/evidence-exports/request", headers: INTERNAL_HEADERS, payload: body });
}

function applyExport(exportId: string, body: Record<string, unknown>, idemKey: string) {
  return app.inject({ method: "POST", url: `/internal/wlt1/evidence-exports/${exportId}/apply`, headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

function statusExport(exportId: string, actorId: string, clientId: string) {
  return app.inject({ method: "GET", url: `/internal/wlt1/evidence-exports/${exportId}?actor_id=${actorId}&client_id=${clientId}`, headers: INTERNAL_HEADERS });
}

function downloadExport(exportId: string, actorId: string, clientId: string) {
  return app.inject({ method: "GET", url: `/internal/wlt1/evidence-exports/${exportId}/download?actor_id=${actorId}&client_id=${clientId}`, headers: INTERNAL_HEADERS });
}

function applyBody(clientId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actor_id: "staff_evexp_it",
    client_id: clientId,
    evidence_types: ["wallet_destination", "destination_current_state"],
    approval_id: "iam2appr_" + randomUUID(),
    decision_token: "wlt1dt_" + "x".repeat(43),
    ...overrides,
  };
}

describe("WLT-01 Evidence Export — request/apply/status/download route integration", () => {
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
    config.iam2FetchImpl = allowAllIam2Fetch();
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  it("fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql (migration 062/063 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    config.iam2FetchImpl = allowAllIam2Fetch();
    config.evidenceExportMaxRecords = DEFAULT_MAX_RECORDS;
    await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.evidence_export.apply'`);
  });

  // -------------------------------------------------------------------------------------------
  describe("POST .../request", () => {
    it("mints export_id, builds approval_payload + hash, persists NOTHING (no row exists after request)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: clientId, evidence_types: ["wallet_destination"] });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.export_id).toMatch(/^wlt1exp_[0-9a-f-]{36}$/);
      expect(data.eligible).toBe(true);
      expect(data.iam2_action).toBe("wlt1.evidence_export.apply");
      expect(data.iam2_resource).toBe("evidence_export");
      expect(data.iam2_entity_id).toBe(data.export_id);
      expect(typeof data.approval_payload_hash).toBe("string");
      expect(data.approval_payload).toMatchObject({ export_id: data.export_id, client_id: clientId, evidence_types: ["wallet_destination"], destination_id: null, reason: null });
      expect(data).not.toHaveProperty("approved_by");

      const row = await verifyPool.query(`SELECT 1 FROM wlt1.evidence_export WHERE export_id = $1`, [data.export_id]);
      expect(row.rows).toHaveLength(0);
    });

    it("invalid scope (unknown evidence type) -> 422 WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", async () => {
      if (!schemaReady) return;
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: freshClientId(), evidence_types: ["not_a_real_type"] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID");
    });

    it("duplicate evidence type -> 422 WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", async () => {
      if (!schemaReady) return;
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: freshClientId(), evidence_types: ["wallet_destination", "wallet_destination"] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID");
    });

    it("from_utc >= to_utc -> 422 WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", async () => {
      if (!schemaReady) return;
      const res = await requestExport({
        actor_id: "staff_evexp_it",
        client_id: freshClientId(),
        evidence_types: ["wallet_destination"],
        from_utc: "2026-06-02T00:00:00Z",
        to_utc: "2026-06-01T00:00:00Z",
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID");
    });

    it("different scopes mint different approval_payload_hash for the SAME client", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const a = await requestExport({ actor_id: "staff_evexp_it", client_id: clientId, evidence_types: ["wallet_destination"] });
      const b = await requestExport({ actor_id: "staff_evexp_it", client_id: clientId, evidence_types: ["proof_of_control"] });
      expect(a.json().data.approval_payload_hash).not.toBe(b.json().data.approval_payload_hash);
    });

    it("IAM-02 baseline check denies -> 403 WLT1_APPROVAL_REQUIRED", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = denyBaselineIam2Fetch();
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: freshClientId(), evidence_types: ["wallet_destination"] });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
    });

    it("IAM-02 unreachable -> 503 WLT1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      config.iam2FetchImpl = iam2Unreachable();
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: freshClientId(), evidence_types: ["wallet_destination"] });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
    });

    it("no auth header -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/evidence-exports/request", payload: { actor_id: "x", client_id: "y", evidence_types: ["wallet_destination"] } });
      expect(res.statusCode).toBe(401);
    });

    it("unknown body field (e.g. approved_by) -> 400 rejected (additionalProperties:false)", async () => {
      if (!schemaReady) return;
      const res = await requestExport({ actor_id: "staff_evexp_it", client_id: freshClientId(), evidence_types: ["wallet_destination"], approved_by: "someone" });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("POST .../apply — full evidence collection across all 10 types", () => {
    it("happy path: 201, exact manifest fields via status route, all 10 evidence types present with correct record_counts, NO content in the apply response, destination_id links every projection back to a real destination, no approved_by anywhere", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { walletDestinationId, fiatDestinationId } = await seedFullEvidenceClient(clientId);
      const exportId = "wlt1exp_" + randomUUID();
      const idemKey = "idem-evexp-happy-" + randomUUID();

      const res = await applyExport(
        exportId,
        applyBody(clientId, {
          evidence_types: [
            "destination_current_state",
            "wallet_destination",
            "fiat_payout_destination",
            "address_integrity_check",
            "wallet_screening_result",
            "fiat_screening_result",
            "beneficiary_verification",
            "proof_of_control",
            "destination_decision",
            "destination_revocation",
          ],
        }),
        idemKey,
      );
      expect(res.statusCode).toBe(201);
      const applyData = res.json().data;
      expect(applyData).toMatchObject({ export_id: exportId, client_id: clientId, download_available: true });
      expect(applyData).not.toHaveProperty("content");
      expect(applyData).not.toHaveProperty("evidence");
      expect(applyData).not.toHaveProperty("approved_by");
      expect(applyData.record_counts).toMatchObject({
        destination_current_state: 2,
        wallet_destination: 1,
        fiat_payout_destination: 1,
        address_integrity_check: 1,
        wallet_screening_result: 1,
        fiat_screening_result: 1,
        beneficiary_verification: 1,
        proof_of_control: 1,
        destination_decision: 1,
        destination_revocation: 1,
      });
      expect(applyData.record_count).toBe(Object.values(applyData.record_counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0));

      const statusRes = await statusExport(exportId, "staff_evexp_it", clientId);
      expect(statusRes.statusCode).toBe(200);
      const manifest = statusRes.json().data;
      expect(manifest).not.toHaveProperty("content");
      expect(manifest).not.toHaveProperty("evidence");
      expect(manifest).not.toHaveProperty("approved_by");
      expect(manifest.record_counts).toEqual(applyData.record_counts);
      expect(manifest.excluded_evidence_note).toBe("SEC-01-owned audit events and sensitive-read access records are outside WLT-01 Evidence Export v1 scope.");

      const downloadRes = await downloadExport(exportId, "staff_evexp_it", clientId);
      expect(downloadRes.statusCode).toBe(200);
      const body = JSON.parse(downloadRes.body);
      expect(body).not.toHaveProperty("approved_by");
      const walletDestIds = (body.evidence.wallet_destination as Array<{ destination_id: string }>).map((r) => r.destination_id);
      expect(walletDestIds).toEqual([walletDestinationId]);
      const fiatDestIds = (body.evidence.fiat_payout_destination as Array<{ destination_id: string }>).map((r) => r.destination_id);
      expect(fiatDestIds).toEqual([fiatDestinationId]);
      expect(downloadRes.headers["x-wlt1-content-hash"]).toBe(applyData.content_hash);
      expect(downloadRes.headers["content-disposition"]).toContain(exportId);

      const genAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_export_generated' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(genAudit.rows[0]?.n)).toBe(1);
      const expAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(expAudit.rows[0]?.n)).toBe(1);
    });

    it("destination_id scope filters to exactly one destination's evidence", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { walletDestinationId } = await seedFullEvidenceClient(clientId);
      const exportId = "wlt1exp_" + randomUUID();
      const res = await applyExport(exportId, applyBody(clientId, { evidence_types: ["destination_current_state"], destination_id: walletDestinationId }), "idem-evexp-scoped-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.record_counts).toMatchObject({ destination_current_state: 1 });
    });

    it("a foreign/nonexistent destination_id scope yields a VALID, EMPTY export — never a 404 (anti-enumeration)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["destination_current_state"], destination_id: "wlt1dest_doesnotexist_" + randomUUID() }),
        "idem-evexp-foreign-dest-" + randomUUID(),
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.record_count).toBe(0);
      expect(res.json().data.record_counts).toEqual({ destination_current_state: 0 });
    });

    it("tenant isolation: client A's evidence never appears in client B's export, even with no destination_id filter", async () => {
      if (!schemaReady) return;
      const clientA = freshClientId();
      const clientB = freshClientId();
      await seedFullEvidenceClient(clientA);
      const res = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientB, { evidence_types: ["destination_current_state", "wallet_destination"] }), "idem-evexp-tenant-b-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.record_count).toBe(0);
    });

    it("date-range filter: half-open [from, to) — a record at exactly `to` is excluded, a record at exactly `from` is included", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { walletDestinationId } = await seedFullEvidenceClient(clientId);
      const boundary = await verifyPool.query(`SELECT revoked_at_utc FROM wlt1.destination_revocation WHERE destination_id = $1`, [walletDestinationId]);
      const at = (boundary.rows[0].revoked_at_utc as Date).toISOString();

      const includesFrom = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["destination_revocation"], destination_id: walletDestinationId, from_utc: at }),
        "idem-evexp-date-from-" + randomUUID(),
      );
      expect(includesFrom.json().data.record_counts).toEqual({ destination_revocation: 1 });

      const excludesTo = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["destination_revocation"], destination_id: walletDestinationId, to_utc: at }),
        "idem-evexp-date-to-" + randomUUID(),
      );
      expect(excludesTo.json().data.record_counts).toEqual({ destination_revocation: 0 });
    });

    it("max_records exceeded -> 422 WLT1_EVIDENCE_EXPORT_SCOPE_INVALID, NO export row persisted (no truncation)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await seedFullEvidenceClient(clientId);
      config.evidenceExportMaxRecords = 1;
      const exportId = "wlt1exp_" + randomUUID();
      const res = await applyExport(exportId, applyBody(clientId, { evidence_types: ["destination_current_state", "wallet_destination"] }), "idem-evexp-maxrec-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID");
      const row = await verifyPool.query(`SELECT 1 FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
      expect(row.rows).toHaveLength(0);
    });

    it("IAM-02 execute-verify denies -> 403 WLT1_APPROVAL_REQUIRED, no export row, no generated audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      config.iam2FetchImpl = denyExecuteVerifyIam2Fetch();
      const exportId = "wlt1exp_" + randomUUID();
      const res = await applyExport(exportId, applyBody(clientId), "idem-evexp-deny-verify-" + randomUUID());
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
      const row = await verifyPool.query(`SELECT 1 FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
      expect(row.rows).toHaveLength(0);
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_export_generated' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(audit.rows[0]?.n)).toBe(0);
    });

    it("IAM-02 unreachable at execute-verify -> 503 WLT1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      config.iam2FetchImpl = iam2Unreachable();
      const res = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId), "idem-evexp-iam-down-" + randomUUID());
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
    });

    it("no auth header -> 401 (before any idempotency/pool check)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/evidence-exports/wlt1exp_x/apply`, payload: applyBody(freshClientId()) });
      expect(res.statusCode).toBe(401);
    });

    it("unknown body field approved_by -> 400 rejected (additionalProperties:false, proves approved_by can never be submitted)", async () => {
      if (!schemaReady) return;
      const res = await applyExport("wlt1exp_" + randomUUID(), { ...applyBody(freshClientId()), approved_by: "someone" }, "idem-evexp-approvedby-" + randomUUID());
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("apply idempotency — NEW / COMPLETED-replay / PROCESSING / mismatched-body", () => {
    it("COMPLETED replay: same export_id + same Idempotency-Key + identical body -> 201 identical response, IAM execute-verify NOT called a second time, no second generated audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await seedFullEvidenceClient(clientId);
      const exportId = "wlt1exp_" + randomUUID();
      const idemKey = "idem-evexp-replay-" + randomUUID();
      const body = applyBody(clientId, { evidence_types: ["destination_current_state"] });

      let verifyCalls = 0;
      config.iam2FetchImpl = makeFakeIam2Fetch({ onVerify: () => verifyCalls++ });

      const first = await applyExport(exportId, body, idemKey);
      expect(first.statusCode).toBe(201);
      expect(verifyCalls).toBe(1);

      const second = await applyExport(exportId, body, idemKey);
      expect(second.statusCode).toBe(201);
      expect(second.json().data).toEqual(first.json().data);
      expect(verifyCalls).toBe(1);

      const genAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_export_generated' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(genAudit.rows[0]?.n)).toBe(1);
    });

    it("a DIFFERENT body under the SAME Idempotency-Key is rejected (foundation's own fingerprint-mismatch contract), never silently re-executed", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const exportId = "wlt1exp_" + randomUUID();
      const idemKey = "idem-evexp-mismatch-" + randomUUID();
      const first = await applyExport(exportId, applyBody(clientId, { evidence_types: ["destination_current_state"] }), idemKey);
      expect(first.statusCode).toBe(201);

      const second = await applyExport(exportId, applyBody(clientId, { evidence_types: ["wallet_destination"] }), idemKey);
      expect(second.statusCode).not.toBe(201);
      expect([409, 422, 400]).toContain(second.statusCode);
    });

    it("a NEW Idempotency-Key with a different export_id/approval_ref succeeds independently (not blocked by an unrelated prior key)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const a = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-indep-a-" + randomUUID());
      const b = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-indep-b-" + randomUUID());
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect(a.json().data.export_id).not.toBe(b.json().data.export_id);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("UNIQUE(approval_ref) — WLT-side IAM-02 double-consume defensive backstop (NOT a fix to IAM-02 itself)", () => {
    it("two DIFFERENT export attempts (different export_id, different Idempotency-Key) sharing the SAME approval_ref: at most one export row survives, the second gets 403 WLT1_APPROVAL_REQUIRED via the 23505 backstop", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const sharedApprovalId = "iam2appr_shared_" + randomUUID();

      const first = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["destination_current_state"], approval_id: sharedApprovalId }),
        "idem-evexp-dup-approval-1-" + randomUUID(),
      );
      expect(first.statusCode).toBe(201);

      const second = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["destination_current_state"], approval_id: sharedApprovalId }),
        "idem-evexp-dup-approval-2-" + randomUUID(),
      );
      expect(second.statusCode).toBe(403);
      expect(second.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.evidence_export WHERE approval_ref = $1`, [sharedApprovalId]);
      expect(Number(rows.rows[0]?.n)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("GET .../status — manifest only, never content", () => {
    it("requires permission (IAM-02 deny -> 403), lookup never reached", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-status-perm-" + randomUUID());
      config.iam2FetchImpl = denyBaselineIam2Fetch();
      const res = await statusExport(applied.json().data.export_id, "staff_evexp_it", clientId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
    });

    it("unknown export_id -> 404 WLT1_EVIDENCE_EXPORT_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await statusExport("wlt1exp_" + randomUUID(), "staff_evexp_it", freshClientId());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_NOT_FOUND");
    });

    it("right export_id, WRONG client_id -> the SAME 404 (no cross-tenant enumeration oracle)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-status-wrongclient-" + randomUUID());
      const res = await statusExport(applied.json().data.export_id, "staff_evexp_it", freshClientId());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_NOT_FOUND");
    });

    it("status response never carries content/evidence and never triggers a disclosure audit event", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-status-noaudit-" + randomUUID());
      const exportId = applied.json().data.export_id;
      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      const res = await statusExport(exportId, "staff_evexp_it", clientId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).not.toHaveProperty("content");
      expect(res.json().data).not.toHaveProperty("evidence");
      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("GET .../download — the one route that may return content; every success is a real disclosure", () => {
    it("requires permission (IAM-02 deny -> 403), no bytes released", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-dl-perm-" + randomUUID());
      config.iam2FetchImpl = denyBaselineIam2Fetch();
      const res = await downloadExport(applied.json().data.export_id, "staff_evexp_it", clientId);
      expect(res.statusCode).toBe(403);
    });

    it("unknown export_id -> 404", async () => {
      if (!schemaReady) return;
      const res = await downloadExport("wlt1exp_" + randomUUID(), "staff_evexp_it", freshClientId());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_EVIDENCE_EXPORT_NOT_FOUND");
    });

    it("exact stored bytes are returned, with x-wlt1-content-hash and content-disposition headers, and exactly ONE disclosure audit event is written", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-dl-exact-" + randomUUID());
      const exportId = applied.json().data.export_id;

      const stored = await verifyPool.query(`SELECT content, content_hash FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
      const res = await downloadExport(exportId, "staff_evexp_it", clientId);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(stored.rows[0].content);
      expect(res.headers["x-wlt1-content-hash"]).toBe(stored.rows[0].content_hash);
      expect(res.headers["content-disposition"]).toContain(`wlt1-evidence-export-${exportId}.json`);

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("repeated downloads of the SAME export each write their own disclosure audit event (2 downloads -> 2 events)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-dl-repeat-" + randomUUID());
      const exportId = applied.json().data.export_id;

      const first = await downloadExport(exportId, "staff_evexp_it", clientId);
      const second = await downloadExport(exportId, "staff_evexp_it", clientId);
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(audit.rows[0]?.n)).toBe(2);
    });

    it("concurrent downloads of the SAME export each get their own independent request_id and their own disclosure audit event", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const applied = await applyExport("wlt1exp_" + randomUUID(), applyBody(clientId, { evidence_types: ["destination_current_state"] }), "idem-evexp-dl-concurrent-" + randomUUID());
      const exportId = applied.json().data.export_id;

      const [a, b] = await Promise.all([downloadExport(exportId, "staff_evexp_it", clientId), downloadExport(exportId, "staff_evexp_it", clientId)]);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%'`, [exportId]);
      expect(Number(audit.rows[0]?.n)).toBe(2);
    });

    it("disclosed_data_class reflects the evidence actually present: a wallet_destination-only export discloses wallet_canonical_address", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const { walletDestinationId } = await seedFullEvidenceClient(clientId);
      const applied = await applyExport(
        "wlt1exp_" + randomUUID(),
        applyBody(clientId, { evidence_types: ["wallet_destination"], destination_id: walletDestinationId }),
        "idem-evexp-dl-dataclass-" + randomUUID(),
      );
      await downloadExport(applied.json().data.export_id, "staff_evexp_it", clientId);
      const audit = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.evidence_exported' AND payload_ref LIKE '%' || $1 || '%' ORDER BY created_at_utc DESC LIMIT 1`,
        [applied.json().data.export_id],
      );
      const parsed = JSON.parse(audit.rows[0].payload_ref);
      expect(parsed.metadata.disclosed_data_class).toContain("wallet_canonical_address");
      expect(parsed.metadata).not.toHaveProperty("approved_by");
    });
  });
});
