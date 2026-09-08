/**
 * WLT-01 Limits / Velocity / Concentration / First-Use — fail-closed failure injection, PRIVATE
 * disposable database. Mirrors the established `*-failclosed-private` precedent exactly (most
 * recently `wlt1-stuck-screening-failclosed-private.test.ts`): a private, uniquely-named database
 * so this file's own REAL ACL mutations against shared tables can never reach any other file's
 * bystander request on the shared canonical database.
 *
 * Three real privilege-revocation scenarios, no mocks:
 *   A. `REVOKE INSERT ON foundation.outbox_event` — forces the `wlt1.limit_denied` audit publish
 *      to fail during a genuine LIMIT_POLICY denial. The deny `wlt1.limit_evaluation` row and the
 *      whole surrounding transaction must roll back together (ONE mutation TX) — never leaving
 *      durable deny evidence without its accompanying audit.
 *   B. `REVOKE INSERT ON wlt1.limit_evaluation` — forces the PASS usage-row insert to fail during
 *      an otherwise-successful consume. The decision's CAS UPDATE must roll back too — never
 *      leaving a decision `consumed` with no usage evidence.
 *   C. `REVOKE SELECT ON wlt1.destination_limit_profile` — forces policy resolution itself to
 *      fail. No authorization, no usage, fails closed.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client, Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_limitsfcp_private_test";

const PRIVATE_DB_NAME = `wlt1_limitsfcp_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}
function silentLog(): void {}
function ignoreExpectedDisconnect(): void {}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_limitsfcp";

function clt1RosterOk(): typeof fetch {
  return (async (url: unknown) => {
    const s = String(url);
    if (s.includes("/authorised-parties/active-refs")) {
      return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, authorised_party_refs: ["ap_1"] } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }) } as Response;
  }) as typeof fetch;
}
function aml1Allow(): typeof fetch {
  return (async () => {
    const now = new Date();
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          decision: "allow",
          decision_id: "aml1ptd_" + randomUUID(),
          reason_code: "evidence_clear",
          evaluated_at_utc: now.toISOString(),
          valid_until_utc: new Date(now.getTime() + 600_000).toISOString(),
          evidence_provider_ids: ["stub-v1"],
          client_id: OWNED_CLIENT_ID,
          requested_action: "destination_use",
        },
      }),
    } as Response;
  }) as typeof fetch;
}

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-limitsfcp-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-limitsfcp-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-limitsfcp-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-limitsfcp-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
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
    clt1FetchImpl: clt1RosterOk(),
    aml1FetchImpl: aml1Allow(),
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
  await verifyPool.query(`DELETE FROM foundation.outbox_event WHERE payload_ref LIKE $1`, [`%${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination_limit_profile WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function usableDestination(): Promise<string> {
  const reg = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (reg.statusCode !== 201) throw new Error(`registration failed: ${reg.statusCode} ${reg.body}`);
  const destinationId = reg.json().data.destination_id;

  const screen = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (screen.statusCode !== 200) throw new Error(`screen failed: ${screen.statusCode} ${screen.body}`);

  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control (challenge_id,destination_id,client_id,chain,network,canonical_address,address_hash,proof_method,verification_scheme,message_format_version,domain_environment,nonce,message_hash,verification_status,signature_hash,recovered_address,issued_at_utc,expires_at_utc,verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now()+interval '15 minutes', now())`,
    ["wlt1pocchal_limitsfcp_" + randomUUID(), destinationId, OWNED_CLIENT_ID, WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "ab".repeat(32), "cd".repeat(32), "ef".repeat(32), "12".repeat(32), WLT1_TEST_STUB_ADDRESS_CLEAR],
  );
  await verifyPool.query(`UPDATE wlt1.destination SET status='active' WHERE destination_id=$1`, [destinationId]);
  return destinationId;
}

async function seedProfile(overrides: Record<string, unknown> = {}): Promise<string> {
  const client = new Client({ connectionString: privateDbUrl });
  await client.connect();
  const id = "wlt1lp_" + randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${OWNED_CLIENT_ID}`]);
    await client.query(
      `INSERT INTO wlt1.destination_limit_profile
         (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network,
          per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
       VALUES ($1,1,$2,'wallet','ETH','ethereum','mainnet',$3,'500','1000',24,$4,'active','test-approved')`,
      [id, OWNED_CLIENT_ID, overrides.per_transaction_limit ?? "100", overrides.first_use_limit ?? "50"],
    );
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
  return id;
}

function evaluateUse(destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "WLT1-LIMITS-FCP-TEST", amount: "40", asset_or_currency: "ETH", ...body },
  });
}

function consume(decisionId: string, decisionToken: string, destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destination-decisions/${decisionId}/verify-and-consume`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: {
      decision_token: decisionToken,
      client_id: OWNED_CLIENT_ID,
      destination_id: destinationId,
      requested_action: "destination_use",
      execution_ref: "exec_" + randomUUID(),
      caller_module: "WLT1-LIMITS-FCP-TEST",
      amount: "40",
      asset_or_currency: "ETH",
      ...body,
    },
  });
}

describe("WLT-01 Limits / Velocity / Concentration / First-Use — fail-closed audit/evidence atomicity (private database)", () => {
  it("PRECONDITION: the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it("A. REAL failure injection: LIMIT_POLICY denial's wlt1.limit_denied audit publish fails — the whole transaction rolls back, ZERO deny limit_evaluation row survives, decision remains un-issued", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    // Deliberately no client-default policy for this dimension -> would be a LIMIT_POLICY
    // (`limit_policy_unavailable`) denial, which writes a deny evidence row + a limit_denied audit.
    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await evaluateUse(destId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    const evalRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE destination_id = $1`, [destId]);
    expect(Number(evalRows.rows[0].n)).toBe(0);
    const decisions = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_id = $1`, [destId]);
    expect(Number(decisions.rows[0].n)).toBe(0);
    const auditN = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.limit_denied' AND payload_ref LIKE '%' || $1 || '%'`, [destId]);
    expect(Number(auditN.rows[0].n)).toBe(0);

    // ACL restored — the same request now succeeds as a genuine deny (no residue, no leaked lock).
    const retry = await evaluateUse(destId);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toMatchObject({ decision: "deny", reason_code: "limit_policy_unavailable" });
    await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE destination_id = $1`, [destId]);
  }, 30_000);

  it("B. REAL failure injection: PASS usage-row INSERT fails during an otherwise-successful consume — the decision's CAS UPDATE rolls back too, decision remains 'issued', no consume audit", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile();
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    expect(evalBody.decision).toBe("allow");

    await verifyPool.query(`REVOKE INSERT ON wlt1.limit_evaluation FROM role_wlt1_runtime`);
    let res;
    try {
      res = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
    } finally {
      await verifyPool.query(`GRANT INSERT ON wlt1.limit_evaluation TO role_wlt1_runtime`);
    }

    const decisionRow = await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(decisionRow.rows[0].status).toBe("issued");
    const passRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(Number(passRows.rows[0].n)).toBe(0);
    const consumeAudit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_decision_consumed' AND payload_ref LIKE '%' || $1 || '%'`, [
      evalBody.decision_id,
    ]);
    expect(Number(consumeAudit.rows[0].n)).toBe(0);

    // ACL restored — the SAME decision now consumes successfully (it was never actually consumed).
    const retry = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    expect(retry.json().data.consumed).toBe(true);
  }, 30_000);

  it("C. REAL failure injection: SELECT on wlt1.destination_limit_profile is revoked — policy resolution itself fails, no authorization, no usage, decision remains un-issued", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile();

    await verifyPool.query(`REVOKE SELECT ON wlt1.destination_limit_profile FROM role_wlt1_runtime`);
    let res;
    try {
      res = await evaluateUse(destId);
    } finally {
      await verifyPool.query(`GRANT SELECT ON wlt1.destination_limit_profile TO role_wlt1_runtime`);
    }
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");

    const decisions = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_id = $1`, [destId]);
    expect(Number(decisions.rows[0].n)).toBe(0);
    const evalRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE destination_id = $1`, [destId]);
    expect(Number(evalRows.rows[0].n)).toBe(0);

    // ACL restored — the same request now succeeds normally.
    const retry = await evaluateUse(destId);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.decision).toBe("allow");
  }, 30_000);

  it("D. ACL fully restored after all injections — no residue on the runtime role", async () => {
    if (!schemaReady) return;
    const outboxOk = await verifyPool.query(`SELECT has_table_privilege('role_wlt1_runtime', 'foundation.outbox_event', 'INSERT') AS ok`);
    expect(outboxOk.rows[0].ok).toBe(true);
    const evalInsertOk = await verifyPool.query(`SELECT has_table_privilege('role_wlt1_runtime', 'wlt1.limit_evaluation', 'INSERT') AS ok`);
    expect(evalInsertOk.rows[0].ok).toBe(true);
    const profileSelectOk = await verifyPool.query(`SELECT has_table_privilege('role_wlt1_runtime', 'wlt1.destination_limit_profile', 'SELECT') AS ok`);
    expect(profileSelectOk.rows[0].ok).toBe(true);
  });
});
