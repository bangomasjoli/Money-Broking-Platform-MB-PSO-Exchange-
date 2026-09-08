/**
 * WLT-01 Limits / Velocity / Concentration / First-Use — `POST .../evaluate-use` and
 * `POST .../verify-and-consume` limit-enforcement behavior, PRIVATE disposable database.
 *
 * Mirrors `wlt1-evaluate-use-route.test.ts`'s own established rationale exactly: a PRIVATE,
 * uniquely-named database (migrated through head 066, real `fnd`/`wlt1` grants applied), so this
 * file's own real advisory-lock concurrency barriers and schema-owner policy-provisioning writes
 * (bypassing the runtime role's own SELECT-only grant, exactly the way real controlled
 * provisioning would) never interact with any other file's bystander request on the shared
 * canonical database.
 *
 * P-ROSTER (CLT-01) and AML-01 are stubbed via `config.clt1FetchImpl`/`config.aml1FetchImpl`.
 * Screening/PoC/destination-status fixtures are written directly via the superuser `verifyPool`
 * (the SAME established precedent every other WLT-01 route test file uses) — this file's own
 * concern is limit enforcement, not the upstream eligibility gates already covered by their own
 * accepted test suites.
 *
 * Limit policy rows are ALSO written via `verifyPool` (never through a runtime route — this phase
 * implements no policy-mutation API) — this mirrors the frozen "controlled schema-owner
 * provisioning" model exactly: production provisioning acquires the SAME
 * `wlt1.limit:<client_id>` advisory lock before mutating a policy row, which this file's own
 * `seedClientPolicy`/`replaceClientPolicy` helpers reproduce faithfully.
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
import { computeBeneficiaryNameHash, normalizeBeneficiaryName } from "../../services/wlt1/src/lib/fiat/beneficiary-name.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_limits_route_test";

const PRIVATE_DB_NAME = `wlt1_limitsrt_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_limitsroute";

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

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-limitsrt-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-limitsrt-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-limitsrt-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-limitsrt-it",
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
  await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE client_id LIKE $1`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.destination_limit_profile WHERE client_id LIKE $1`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id LIKE $1`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE client_id LIKE $1`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE $1)`, [`${OWNED_CLIENT_ID}%`]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE $1`, [`${OWNED_CLIENT_ID}%`]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(clientId = OWNED_CLIENT_ID, memoTag = ""): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: clientId, chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, wallet_type: "unhosted", beneficiary_relationship: "self", ...(memoTag ? { memo_tag: memoTag } : {}) },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return res.json().data.destination_id;
}

async function screenToPendingReview(destinationId: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (res.statusCode !== 200) throw new Error(`expected terminal screening, got ${res.statusCode} ${res.body}`);
}

async function insertVerifiedPoc(destinationId: string, clientId = OWNED_CLIENT_ID): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control (challenge_id,destination_id,client_id,chain,network,canonical_address,address_hash,proof_method,verification_scheme,message_format_version,domain_environment,nonce,message_hash,verification_status,signature_hash,recovered_address,issued_at_utc,expires_at_utc,verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now()+interval '15 minutes', now())`,
    ["wlt1pocchal_limitsrt_" + randomUUID(), destinationId, clientId, WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "ab".repeat(32), "cd".repeat(32), "ef".repeat(32), "12".repeat(32), WLT1_TEST_STUB_ADDRESS_CLEAR],
  );
}

async function usableDestination(clientId = OWNED_CLIENT_ID, addressSuffix = ""): Promise<string> {
  const id = await registerDestination(clientId, addressSuffix);
  await screenToPendingReview(id);
  await insertVerifiedPoc(id, clientId);
  await verifyPool.query(`UPDATE wlt1.destination SET status='active' WHERE destination_id=$1`, [id]);
  return id;
}

function evaluateUse(destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "WLT1-LIMITS-TEST", amount: "40", asset_or_currency: "ETH", ...body },
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
      caller_module: "WLT1-LIMITS-TEST",
      amount: "40",
      asset_or_currency: "ETH",
      ...body,
    },
  });
}

/** Schema-owner provisioning fixture — mirrors the FROZEN provisioning transaction sequence
 * exactly (acquire `wlt1.limit:<client_id>` -> INSERT the new immutable version -> COMMIT), on a
 * dedicated connection outside `app`'s own runtime pool (the runtime role has SELECT-only access
 * to this table — this genuinely proves provisioning is a distinct authority). */
async function seedProfile(overrides: Record<string, unknown> = {}): Promise<string> {
  const client = new Client({ connectionString: privateDbUrl });
  await client.connect();
  const clientId = (overrides.client_id as string) ?? OWNED_CLIENT_ID;
  const id = (overrides.limit_profile_id as string) ?? "wlt1lp_" + randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${clientId}`]);
    await client.query(
      `INSERT INTO wlt1.destination_limit_profile
         (limit_profile_id, version, client_id, destination_id, destination_type, asset_or_currency, chain, network, rail,
          per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active','test-approved')`,
      [
        id,
        overrides.version ?? 1,
        clientId,
        overrides.destination_id ?? null,
        overrides.destination_type ?? "wallet",
        overrides.asset_or_currency ?? "ETH",
        (overrides.destination_type ?? "wallet") === "wallet" ? (overrides.chain ?? "ethereum") : null,
        (overrides.destination_type ?? "wallet") === "wallet" ? (overrides.network ?? "mainnet") : null,
        (overrides.destination_type ?? "wallet") === "wallet" ? null : (overrides.rail ?? null),
        overrides.per_transaction_limit ?? "100",
        overrides.destination_id ? (overrides.daily_velocity_limit ?? null) : (overrides.daily_velocity_limit ?? "500"),
        overrides.destination_id ? (overrides.rolling_velocity_limit ?? null) : (overrides.rolling_velocity_limit ?? "1000"),
        overrides.destination_id ? (overrides.rolling_window_hours ?? null) : (overrides.rolling_window_hours ?? 24),
        overrides.destination_id
          ? (overrides.first_use_limit ?? null)
          : (overrides.first_use_limit ?? (BigInt(String(overrides.per_transaction_limit ?? "100")) / 2n).toString()),
      ],
    );
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
  return id;
}

/** Deactivates the currently-active profile for `limitProfileId` and activates `newVersion` — the
 * FROZEN provisioning replacement sequence (deactivate-then-insert, same advisory lock, one TX). */
async function replaceProfile(limitProfileId: string, clientId: string, oldVersion: number, newOverrides: Record<string, unknown>): Promise<void> {
  const client = new Client({ connectionString: privateDbUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${clientId}`]);
    await client.query(`UPDATE wlt1.destination_limit_profile SET status='inactive', updated_at_utc=now() WHERE limit_profile_id=$1 AND version=$2 AND status='active'`, [limitProfileId, oldVersion]);
    await client.query(
      `INSERT INTO wlt1.destination_limit_profile
         (limit_profile_id, version, client_id, destination_id, destination_type, asset_or_currency, chain, network, rail,
          per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
       VALUES ($1,$2,$3,NULL,'wallet','ETH','ethereum','mainnet',NULL,$4,$5,$6,$7,$8,'active','test-approved')`,
      [
        limitProfileId,
        oldVersion + 1,
        clientId,
        newOverrides.per_transaction_limit ?? "100",
        newOverrides.daily_velocity_limit ?? "500",
        newOverrides.rolling_velocity_limit ?? "1000",
        newOverrides.rolling_window_hours ?? 24,
        // first_use_limit must remain STRICTLY below per_transaction_limit — derive half of it by
        // default (via bigint arithmetic, never floating point) unless the caller overrides both.
        newOverrides.first_use_limit ?? (BigInt(String(newOverrides.per_transaction_limit ?? "100")) / 2n).toString(),
      ],
    );
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

async function limitEvaluationRows(clientId = OWNED_CLIENT_ID): Promise<Array<Record<string, unknown>>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.limit_evaluation WHERE client_id = $1 ORDER BY evaluated_at_utc`, [clientId]);
  return r.rows;
}

async function limitDeniedAuditCount(clientId = OWNED_CLIENT_ID): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.limit_denied' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Limits / Velocity / Concentration / First-Use — evaluate-use + verify-and-consume enforcement (private database)", () => {
  it("PRECONDITION: runtime role is genuinely restricted and cannot mutate policy", async () => {
    if (!schemaReady) return;
    const roleRow = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(roleRow.rows[0].rolsuper).toBe(false);
    const canInsert = await verifyPool.query(`SELECT has_table_privilege($1, 'wlt1.destination_limit_profile', 'INSERT') AS ok`, [RUNTIME_ROLE_USER]);
    expect(canInsert.rows[0].ok).toBe(false);
    const canUpdate = await verifyPool.query(`SELECT has_table_privilege($1, 'wlt1.destination_limit_profile', 'UPDATE') AS ok`, [RUNTIME_ROLE_USER]);
    expect(canUpdate.rows[0].ok).toBe(false);
    const canSelectProfile = await verifyPool.query(`SELECT has_table_privilege($1, 'wlt1.destination_limit_profile', 'SELECT') AS ok`, [RUNTIME_ROLE_USER]);
    expect(canSelectProfile.rows[0].ok).toBe(true);
    const canInsertEval = await verifyPool.query(`SELECT has_table_privilege($1, 'wlt1.limit_evaluation', 'INSERT') AS ok`, [RUNTIME_ROLE_USER]);
    expect(canInsertEval.rows[0].ok).toBe(true);
    const canUpdateEval = await verifyPool.query(`SELECT has_table_privilege($1, 'wlt1.limit_evaluation', 'UPDATE') AS ok`, [RUNTIME_ROLE_USER]);
    expect(canUpdateEval.rows[0].ok).toBe(false);
  });

  it("A. no client-default policy for the dimension -> deny limit_policy_unavailable; deny evidence written (decision_id null), no decision created, exactly one limit_denied audit", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const res = await evaluateUse(destId);
    const body = res.json().data;
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({ decision: "deny", reason_code: "limit_policy_unavailable" });
    const rows = await limitEvaluationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result_status: "deny", breach_type: "policy_unavailable", breach_scope: "client", decision_id: null });
    expect(await limitDeniedAuditCount()).toBe(1);
    const decisions = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_id = $1`, [destId]);
    expect(Number(decisions.rows[0].n)).toBe(0);
  });

  it("B. client per_transaction_limit breach -> deny per_transaction_limit_exceeded, breach_scope client", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "30" });
    const res = await evaluateUse(destId, { amount: "40" });
    expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "per_transaction_limit_exceeded" });
    const rows = await limitEvaluationRows();
    expect(rows[0]).toMatchObject({ breach_type: "per_txn", breach_scope: "client" });
  });

  it("C. destination-specific per_transaction_limit tighter than client -> deny at destination scope", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "100" });
    await seedProfile({ destination_id: destId, per_transaction_limit: "20" });
    const res = await evaluateUse(destId, { amount: "40" });
    expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "per_transaction_limit_exceeded" });
    const rows = await limitEvaluationRows();
    expect(rows[0]).toMatchObject({ breach_type: "per_txn", breach_scope: "destination" });
  });

  it("D. dual-scope: client passes, destination denies -> breach_scope destination", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000" });
    await seedProfile({ destination_id: destId, per_transaction_limit: "20", first_use_limit: null });
    const res = await evaluateUse(destId, { amount: "40" });
    expect(res.json().data.decision).toBe("deny");
    const rows = await limitEvaluationRows();
    expect(rows[0]).toMatchObject({ breach_scope: "destination" });
  });

  it("E. missing destination-specific policy -> NO fallback; client controls alone govern, request within client limits passes", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", first_use_limit: "500" });
    const res = await evaluateUse(destId, { amount: "40" });
    expect(res.json().data.decision).toBe("allow");
  });

  it("F. both client and destination profiles active and BOTH enforced (destination adds a stricter first_use_limit)", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", first_use_limit: "500" });
    await seedProfile({ destination_id: destId, per_transaction_limit: "1000", first_use_limit: "10" });
    const res = await evaluateUse(destId, { amount: "40" });
    expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "first_use_limit_exceeded" });
    const rows = await limitEvaluationRows();
    expect(rows[0]).toMatchObject({ breach_scope: "destination" });
  });

  it("G. breach precedence: per_txn checked before first_use even when both would breach", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "30", first_use_limit: "20" });
    const res = await evaluateUse(destId, { amount: "50" });
    expect(res.json().data.reason_code).toBe("per_transaction_limit_exceeded");
  });

  it("H. breach precedence: first_use checked before daily/rolling velocity", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", first_use_limit: "20", daily_velocity_limit: "25", rolling_velocity_limit: "25" });
    const res = await evaluateUse(destId, { amount: "30" });
    expect(res.json().data.reason_code).toBe("first_use_limit_exceeded");
  });

  it("I. happy path: evaluate-use ALLOW binds amount/asset_or_currency/limits_version/first_use into the decision; consume PASSES and records exactly one pass usage row", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile();
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    expect(evalBody).toMatchObject({ decision: "allow", first_use: true, limits_version: 0 });

    const decisionRow = await verifyPool.query(`SELECT amount, asset_or_currency, limits_version, client_limit_profile_id FROM wlt1.destination_decision WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(decisionRow.rows[0].amount).toBe("40.000000000000000000");
    expect(decisionRow.rows[0].asset_or_currency).toBe("ETH");
    expect(decisionRow.rows[0].client_limit_profile_id).not.toBeNull();

    const consumeRes = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    expect(consumeRes.json().data.consumed).toBe(true);

    const rows = await limitEvaluationRows();
    const passRows = rows.filter((r) => r.result_status === "pass");
    expect(passRows).toHaveLength(1);
    expect(passRows[0]).toMatchObject({ first_use: true, decision_id: evalBody.decision_id });
  });

  it("J. same execution_ref replay does NOT create a second pass usage row (no double debit)", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile();
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    const executionRef = "exec_" + randomUUID();
    const first = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40", execution_ref: executionRef });
    expect(first.json().data.consumed).toBe(true);
    const replay = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40", execution_ref: executionRef });
    expect(replay.json().data).toMatchObject({ consumed: true, replay: true, consumption_id: first.json().data.consumption_id });
    const rows = await limitEvaluationRows();
    expect(rows.filter((r) => r.result_status === "pass")).toHaveLength(1);
  });

  it("K. amount_mismatch at consume -> decision remains issued, no limit_evaluation row written (PRE_LIMIT)", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile();
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    const res = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "999" });
    expect(res.json().data).toMatchObject({ consumed: false, reason_code: "amount_mismatch" });
    const decisionRow = await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(decisionRow.rows[0].status).toBe("issued");
    const rows = await limitEvaluationRows();
    expect(rows).toHaveLength(0);
  });

  it("L. legacy decision with amount IS NULL -> limits_not_bound at consume (PRE_LIMIT)", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const pocRow = await verifyPool.query(`SELECT challenge_id FROM wlt1.proof_of_control WHERE destination_id = $1`, [destId]);
    const decisionId = "wlt1dec_legacy_" + randomUUID();
    const tokenRaw = "wlt1dt_" + randomBytes(32).toString("base64url");
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
    await verifyPool.query(
      `INSERT INTO wlt1.destination_decision
         (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
          screening_result_id, poc_challenge_id, destination_status_version, whitelist_version, revocation_epoch, chain, network, destination_type,
          issued_at_utc, expires_at_utc)
       VALUES ($1,$2,$3,$4,'destination_use','allow','aml1ptd_legacy', now() + interval '1 hour',
               'wlt1screen_legacy', $5, 1, 0, 0, 'ethereum', 'mainnet', 'wallet', now(), now() + interval '5 minutes')`,
      [decisionId, tokenHash, destId, OWNED_CLIENT_ID, pocRow.rows[0].challenge_id],
    );
    const res = await consume(decisionId, tokenRaw, destId, { amount: "40" });
    expect(res.json().data).toMatchObject({ consumed: false, reason_code: "limits_not_bound" });
    const rows = await limitEvaluationRows();
    expect(rows).toHaveLength(0);
  });

  it("M. policy drift: a new profile VERSION is activated after issuance -> consume fails closed limits_version_changed; decision stays issued, no limit_evaluation row", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const profileId = await seedProfile({ per_transaction_limit: "1000" });
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;

    await replaceProfile(profileId, OWNED_CLIENT_ID, 1, { per_transaction_limit: "10" });

    const res = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    expect(res.json().data).toMatchObject({ consumed: false, reason_code: "limits_version_changed" });
    const decisionRow = await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(decisionRow.rows[0].status).toBe("issued");
    const rows = await limitEvaluationRows();
    expect(rows).toHaveLength(0);
  });

  it("N. a decision consumed BEFORE a policy swap remains a valid historical authorization (swap after has no retroactive effect)", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const profileId = await seedProfile({ per_transaction_limit: "1000" });
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    const consumeRes = await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    expect(consumeRes.json().data.consumed).toBe(true);

    await replaceProfile(profileId, OWNED_CLIENT_ID, 1, { per_transaction_limit: "10" });

    const rows = await limitEvaluationRows();
    expect(rows.filter((r) => r.result_status === "pass")).toHaveLength(1);
  });

  it("O. fiat dimension: request asset_or_currency must equal server-owned destination currency, else asset_dimension_invalid (PRE_LIMIT)", async () => {
    if (!schemaReady) return;
    // Temporarily activate the (deliberately dormant) apac_local_my/MY/MYR rail on THIS PRIVATE
    // database only — mirrors wlt1-fiat-decision-route.test.ts's own established precedent
    // exactly; the shared canonical database's dormancy is never touched by this file.
    await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
    const destinationId = "wlt1dest_limitsrt_fiat_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'fiat_payout',$3,'active')`,
      [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID()],
    );
    await verifyPool.query(
      `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
       VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678',$2,'ciphertext','MYR','apac_local_my')`,
      [destinationId, "hash_acct_" + destinationId],
    );
    const beneficiaryNameHash = computeBeneficiaryNameHash(normalizeBeneficiaryName("Test User"));
    await verifyPool.query(
      `INSERT INTO wlt1.beneficiary_verification (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-beneficiary-verification-v1','1','verified',$3,$4, now(), now() + interval '1 year')`,
      ["wlt1bv_" + randomUUID(), destinationId, beneficiaryNameHash, "hash_acct_" + destinationId],
    );
    await verifyPool.query(
      `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual','clear', now(), now() + interval '1 hour')`,
      ["wlt1fscr_" + randomUUID(), destinationId],
    );

    const res = await evaluateUse(destinationId, { amount: "40", asset_or_currency: "USD" });
    expect(res.json().data.decision).toBe("deny");
    expect(res.json().data.reason_code).toBe("asset_dimension_invalid");
    const rows = await limitEvaluationRows();
    expect(rows).toHaveLength(0);
    expect(await limitDeniedAuditCount()).toBe(0);

    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
  });

  it("P. request contract: amount/asset_or_currency REQUIRED, decimal grammar, additionalProperties:false", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const noAuth = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/${destId}/evaluate-use`, payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "T", amount: "40", asset_or_currency: "ETH" } });
    expect(noAuth.statusCode).toBe(401);

    const missingAmount = await app.inject({
      method: "POST",
      url: `/internal/wlt1/destinations/${destId}/evaluate-use`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
      payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "T", asset_or_currency: "ETH" },
    });
    expect(missingAmount.statusCode).toBe(400);

    const zeroAmount = await evaluateUse(destId, { amount: "0" });
    expect(zeroAmount.statusCode).toBe(400);

    const tooManyDecimals = await evaluateUse(destId, { amount: "1.1234567890123456789" });
    expect(tooManyDecimals.statusCode).toBe(400);

    const lowercaseAsset = await evaluateUse(destId, { asset_or_currency: "eth" });
    expect(lowercaseAsset.statusCode).toBe(400);

    const extraField = await app.inject({
      method: "POST",
      url: `/internal/wlt1/destinations/${destId}/evaluate-use`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
      payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "T", amount: "40", asset_or_currency: "ETH", extra: "x" },
    });
    expect(extraField.statusCode).toBe(400);
  });

  it("Q. evaluate-use ALLOW response never discloses thresholds or remaining capacity — only first_use and limits_version", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", daily_velocity_limit: "5000" });
    const res = await evaluateUse(destId, { amount: "40" });
    const body = res.json().data;
    expect(body).not.toHaveProperty("per_transaction_limit");
    expect(body).not.toHaveProperty("remaining_capacity");
    expect(body).not.toHaveProperty("daily_velocity_limit");
    expect(Object.keys(body).sort()).toEqual(
      ["decision", "decision_id", "decision_token", "issued_at_utc", "expires_at_utc", "destination_id", "client_id", "requested_action", "aml_decision_id", "first_use", "limits_version"].sort(),
    );
  });

  it("R. UTC daily boundary is correct under a non-UTC session timezone", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", daily_velocity_limit: "50" });
    // Consume 40 "now" (today, real time).
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    // Force the persisted usage row's evaluated_at_utc to yesterday (still "today" under a naive
    // non-UTC-safe boundary in some timezones) — a correct UTC boundary must NOT count it.
    await verifyPool.query(`UPDATE wlt1.limit_evaluation SET evaluated_at_utc = now() - interval '25 hours' WHERE client_id = $1 AND result_status = 'pass'`, [OWNED_CLIENT_ID]);
    await verifyPool.query(`SET TimeZone = 'Asia/Kuala_Lumpur'`);
    const res2 = await evaluateUse(destId, { amount: "40" });
    await verifyPool.query(`SET TimeZone = 'UTC'`);
    // The 25-hours-old usage row must not count toward today's daily sum, so this second request
    // (which alone is within the 50 daily limit) must pass.
    expect(res2.json().data.decision).toBe("allow");
  });

  it("S. rolling window: usage inside the window counts, usage outside the window does not", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", rolling_velocity_limit: "50", rolling_window_hours: 1 });
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;
    await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    await verifyPool.query(`UPDATE wlt1.limit_evaluation SET evaluated_at_utc = now() - interval '2 hours' WHERE client_id = $1 AND result_status = 'pass'`, [OWNED_CLIENT_ID]);
    const res2 = await evaluateUse(destId, { amount: "40" });
    expect(res2.json().data.decision).toBe("allow");
  });

  it("T. cross-network isolation: usage on ethereum/mainnet does not affect a policy/usage check on a different network dimension", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ per_transaction_limit: "1000", daily_velocity_limit: "50" });
    const evalRes = await evaluateUse(destId, { amount: "45" });
    const evalBody = evalRes.json().data;
    await consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "45" });
    // A DIFFERENT dimension (different asset) for the SAME client/destination has its own
    // untouched policy — no client-default profile exists for BTC, so it correctly denies
    // policy_unavailable rather than inheriting the ETH dimension's near-exhausted daily usage.
    const res2 = await evaluateUse(destId, { amount: "40", asset_or_currency: "BTC" });
    expect(res2.json().data.reason_code).toBe("limit_policy_unavailable");
  });

  it("U. cross-asset first-use concurrency: same destination, same whitelist lineage, DIFFERENT assets racing first-use -> exactly ONE receives first_use:true at consume", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    await seedProfile({ asset_or_currency: "ETH", per_transaction_limit: "1000", first_use_limit: "500" });
    await seedProfile({ asset_or_currency: "BTC", per_transaction_limit: "1000", first_use_limit: "500" });

    const evalEth = await evaluateUse(destId, { amount: "10", asset_or_currency: "ETH" });
    const evalBtc = await evaluateUse(destId, { amount: "10", asset_or_currency: "BTC" });
    expect(evalEth.json().data.first_use).toBe(true);
    expect(evalBtc.json().data.first_use).toBe(true); // both advisory-predicted true at issuance — correct, non-binding.

    // Deterministic barrier: hold the SAME wlt1.limit:<client_id> advisory lock (per-client, not
    // per-asset) on a dedicated connection, forcing the two consumes to serialize.
    const barrier = new Client({ connectionString: privateDbUrl });
    await barrier.connect();
    await barrier.query("BEGIN");
    await barrier.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${OWNED_CLIENT_ID}`]);

    const ethConsumePromise = consume(evalEth.json().data.decision_id, evalEth.json().data.decision_token, destId, { amount: "10", asset_or_currency: "ETH" });
    await new Promise((r) => setTimeout(r, 300));
    // consume must be BLOCKED while the barrier holds the client lock.
    const passRowsDuringBarrier = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE client_id = $1 AND result_status = 'pass'`, [OWNED_CLIENT_ID]);
    expect(Number(passRowsDuringBarrier.rows[0].n)).toBe(0);
    await barrier.query("COMMIT");
    await barrier.end();

    const ethConsume = await ethConsumePromise;
    expect(ethConsume.json().data.consumed).toBe(true);
    const ethPassRow = await verifyPool.query(`SELECT first_use FROM wlt1.limit_evaluation WHERE decision_id = $1`, [evalEth.json().data.decision_id]);
    expect(ethPassRow.rows[0].first_use).toBe(true);

    const btcConsume = await consume(evalBtc.json().data.decision_id, evalBtc.json().data.decision_token, destId, { amount: "10", asset_or_currency: "BTC" });
    expect(btcConsume.json().data.consumed).toBe(true);
    const btcPassRow = await verifyPool.query(`SELECT first_use FROM wlt1.limit_evaluation WHERE decision_id = $1`, [evalBtc.json().data.decision_id]);
    // BTC consumed SECOND, after ETH already claimed first-use for this (destination, whitelist_version) lineage.
    expect(btcPassRow.rows[0].first_use).toBe(false);

    const firstUseTrueCount = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE destination_id = $1 AND result_status = 'pass' AND first_use = true`, [destId]);
    expect(Number(firstUseTrueCount.rows[0].n)).toBe(1);
  }, 20_000);

  it("V. concurrent consume for the last remaining daily capacity: exactly one succeeds, one denies, SUM never exceeds the threshold", async () => {
    if (!schemaReady) return;
    await seedProfile({ per_transaction_limit: "1000", daily_velocity_limit: "60" });
    const destId = await usableDestination();
    // Two separately-issued decisions against the SAME destination — each individually within the
    // per-transaction/first-use bounds, but their SUM (80) exceeds the daily capacity (60).
    const evalA = await evaluateUse(destId, { amount: "40" });
    const evalB = await evaluateUse(destId, { amount: "40" });
    expect(evalA.json().data.decision).toBe("allow");
    expect(evalB.json().data.decision).toBe("allow");

    const [resA, resB] = await Promise.all([
      consume(evalA.json().data.decision_id, evalA.json().data.decision_token, destId, { amount: "40" }),
      consume(evalB.json().data.decision_id, evalB.json().data.decision_token, destId, { amount: "40" }),
    ]);
    const outcomes = [resA.json().data.consumed, resB.json().data.consumed].sort();
    expect(outcomes).toEqual([false, true]);

    const passSum = await verifyPool.query(`SELECT COALESCE(SUM(amount),0)::text AS total FROM wlt1.limit_evaluation WHERE client_id = $1 AND result_status = 'pass'`, [OWNED_CLIENT_ID]);
    expect(Number(passSum.rows[0].total)).toBeLessThanOrEqual(60);
  }, 20_000);

  it("W. provisioning lock: a policy replacement holding the client lock BLOCKS a concurrent consume until it commits, then the consume observes the NEW policy", async () => {
    if (!schemaReady) return;
    const destId = await usableDestination();
    const profileId = await seedProfile({ per_transaction_limit: "1000" });
    const evalRes = await evaluateUse(destId, { amount: "40" });
    const evalBody = evalRes.json().data;

    const barrier = new Client({ connectionString: privateDbUrl });
    await barrier.connect();
    await barrier.query("BEGIN");
    await barrier.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${OWNED_CLIENT_ID}`]);
    await barrier.query(`UPDATE wlt1.destination_limit_profile SET status='inactive' WHERE limit_profile_id=$1 AND version=1 AND status='active'`, [profileId]);
    await barrier.query(
      `INSERT INTO wlt1.destination_limit_profile (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network, per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
       VALUES ($1,2,$2,'wallet','ETH','ethereum','mainnet','1000','500','1000',24,'50','active','test-approved')`,
      [profileId, OWNED_CLIENT_ID],
    );

    const consumePromise = consume(evalBody.decision_id, evalBody.decision_token, destId, { amount: "40" });
    await new Promise((r) => setTimeout(r, 300));
    const stillIssued = await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [evalBody.decision_id]);
    expect(stillIssued.rows[0].status).toBe("issued"); // blocked, not yet consumed.

    await barrier.query("COMMIT");
    await barrier.end();

    const consumeRes = await consumePromise;
    // The decision was bound to version 1; version 2 is now active -> stale, fails closed.
    expect(consumeRes.json().data).toMatchObject({ consumed: false, reason_code: "limits_version_changed" });
  }, 20_000);
});
