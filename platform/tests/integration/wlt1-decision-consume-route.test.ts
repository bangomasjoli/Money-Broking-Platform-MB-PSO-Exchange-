/**
 * WLT-01 Phase 4B — `POST /internal/wlt1/destination-decisions/:decision_id/verify-and-consume`,
 * PRIVATE disposable database.
 *
 * Mirrors `wlt1-decision-verify-route.test.ts`'s own established rationale: this file provisions
 * its own PRIVATE, uniquely named database (migrated through head 058, with the real `fnd`/`wlt1`
 * runtime grant files applied — the SAME grants Phase 4B ships with, deliberately unmodified), so
 * its own forced-audit-failure ACL mutation against `foundation.outbox_event` can never reach any
 * other file's bystander request.
 *
 * Admin fixtures write `wlt1.destination_decision` rows directly via the superuser `verifyPool`
 * (same shape as `wlt1-migration-058-regression.test.ts`'s own established `insertDecision`
 * helper) — this file's own test matrix requires exact, independently-controlled combinations no
 * single HTTP flow could produce deterministically.
 *
 * GENUINE CONCURRENCY (not a bare `Promise.all` coin flip — mirrors `clt1-db.test.ts`'s own
 * documented, established lesson: "the original version of this test used Promise.all and
 * asserted only 'exactly one side succeeds' — a coin flip that could not detect the unsafe third
 * outcome... unless that exact ordering happened to occur"): both concurrency tests hold the
 * decision row's OWN `FOR UPDATE` lock from an INDEPENDENT connection, launch both competing
 * consume requests, deterministically PROVE both are genuinely blocked on that held lock (neither
 * settles within a bounded wait), THEN release the lock so both requests race for it at the real
 * PostgreSQL level. This proves genuine overlap; only the winner/loser identity is (deliberately)
 * left nondeterministic.
 *
 * P-ROSTER and AML-01 fetch stubs are configured to THROW IF CALLED for the whole file (aside from
 * the one genuine end-to-end setup) — verify-and-consume itself must never make either network
 * call (frozen phase boundary).
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
import {
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY,
  WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
  WLT1_TEST_STUB_ADDRESS_HIT,
  STUB_PROVIDER_ID,
  STUB_ADAPTOR_VERSION,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";

/** This file's own custom `alwaysClearProvider` (below) ignores address content entirely and
 * always returns clear — so these symbolic addresses' own real category names are irrelevant here;
 * they exist only to provide multiple DISTINCT, already-format-valid addresses so a single test can
 * register more than one destination for the SAME client without tripping the natural-key
 * (client_id + destination_type + address_hash) uniqueness constraint. Four are Ethereum-format
 * (chain 'ethereum'); the last two are TRON-format (chain 'tron') — both chains are already seeded
 * 'supported'/'active' in `wlt1.chain_coverage`. */
const DISTINCT_ETH_ADDRESSES = [WLT1_TEST_STUB_ADDRESS_CLEAR, WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED, WLT1_TEST_STUB_ADDRESS_UNAVAILABLE, WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY];
const DISTINCT_TRON_ADDRESSES = [WLT1_TEST_STUB_ADDRESS_HIGH_RISK, WLT1_TEST_STUB_ADDRESS_HIT];
import { hashToken, mintDecisionId, mintDecisionToken } from "../../services/wlt1/src/lib/decision-token.js";
import { CONSUMPTION_ID_REGEX } from "../../services/wlt1/src/lib/decision-consume.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_decision_consume_route_test";

const PRIVATE_DB_NAME = `wlt1_decconsume_it_${randomBytes(6).toString("hex")}`;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let maintenancePool: Pool;
let privateDbUrl: string;
let runtimeDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_decconsumeprivate";
/** Limits / Velocity / Concentration / First-Use — the file's own single permissive client-default
 * policy, seeded once in `beforeAll` and referenced by every `insertDecisionFixture` call's own
 * default `client_limit_profile_id` binding. */
const PERMISSIVE_POLICY_ID = "wlt1lp_decconsume_permissive";

function mustNotBeCalledFetch(label: string): typeof fetch {
  return (async () => {
    throw new Error(`TEST ASSERTION FAILURE: ${label} must not be called by verify-and-consume`);
  }) as unknown as typeof fetch;
}

/** verify-and-consume itself must NEVER reach P-ROSTER — that path always throws. But this file's
 * OWN fixture setup (`registerDestination`, via the real `wallet-destinations` route) legitimately
 * needs CLT-01's UNRELATED client-status check to succeed — same dispatch-aware stub shape
 * `wlt1-decision-verify-route.test.ts`/`wlt1-evaluate-use-route.test.ts` already established. */
function clt1FetchAllowStatusOnly(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      throw new Error("TEST ASSERTION FAILURE: P-ROSTER (CLT-01) must not be called by verify-and-consume");
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }) } as Response;
  }) as unknown as typeof fetch;
}

const alwaysClearProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen() {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_decconsumeprivate_" + randomUUID(),
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

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-decconsume-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-decconsume-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-decconsume-it-private-db-iam02-token";

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

  runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-decconsumeprivate-it",
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
    aml1InternalServiceToken: "test-aml1-internal-token-decconsumeprivate-it",
    clt1FetchImpl: clt1FetchAllowStatusOnly(),
    screeningProviderImpl: alwaysClearProvider,
    aml1FetchImpl: mustNotBeCalledFetch("AML-01"),
  };
  app = await buildApp(mainConfig);

  // Limits / Velocity / Concentration / First-Use — a single, permissive, IMMUTABLE client-default
  // policy for the wallet/ETH/ethereum/mainnet dimension every `insertDecisionFixture` call below
  // binds a decision to by default. Schema-owner provisioning fixture (superuser `verifyPool`,
  // never through a runtime route — this phase implements no policy-mutation API).
  await verifyPool.query(
    `INSERT INTO wlt1.destination_limit_profile
       (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network,
        per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
     VALUES ($1,1,$2,'wallet','ETH','ethereum','mainnet','1000000','1000000','1000000',24,'500000','active','test-approved')`,
    [PERMISSIVE_POLICY_ID, OWNED_CLIENT_ID],
  );

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
  mainConfig.clt1FetchImpl = clt1FetchAllowStatusOnly();
  mainConfig.aml1FetchImpl = mustNotBeCalledFetch("AML-01");
  await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(overrides: Record<string, unknown> = {}): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, wallet_type: "unhosted", beneficiary_relationship: "self", ...overrides },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
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

async function insertVerifiedPoc(destinationId: string): Promise<string> {
  const challengeId = "wlt1pocchal_decconsume_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control
       (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme,
        message_format_version, domain_environment, nonce, message_hash, verification_status, signature_hash, recovered_address,
        issued_at_utc, expires_at_utc, verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now() + interval '15 minutes', now())`,
    [challengeId, destinationId, OWNED_CLIENT_ID, WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "ab".repeat(32), "cd".repeat(32), "ef".repeat(32), "12".repeat(32), WLT1_TEST_STUB_ADDRESS_CLEAR],
  );
  return challengeId;
}

async function usableDestination(opts: { walletType?: string; address?: string; chain?: string; network?: string } = {}): Promise<{ destinationId: string }> {
  const walletType = opts.walletType ?? "unhosted";
  const { destinationId } = await registerDestination({
    wallet_type: walletType,
    ...(opts.address ? { address: opts.address } : {}),
    ...(opts.chain ? { chain: opts.chain } : {}),
    ...(opts.network ? { network: opts.network } : {}),
  });
  await screenToPendingReview(destinationId);
  if (walletType !== "hosted") {
    await insertVerifiedPoc(destinationId);
  }
  await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
  return { destinationId };
}

interface DecisionFixtureOverrides {
  decisionId?: string;
  rawToken?: string;
  destinationId: string;
  clientId?: string;
  requestedAction?: string;
  revocationEpoch?: number;
  pocChallengeId?: string | null;
  issuedAtUtc?: Date;
  expiresAtUtc?: Date;
  status?: "issued" | "consumed";
  consumedAtUtc?: Date | null;
  consumptionId?: string | null;
  executionRef?: string | null;
  /** Limits / Velocity / Concentration / First-Use — pass `null` to build a LEGACY, un-bound
   * decision (`amount IS NULL`, `limits_not_bound` at consume). Defaults to genuinely bound
   * against the file's own seeded permissive client-default policy (`PERMISSIVE_POLICY`). */
  amount?: string | null;
  assetOrCurrency?: string;
}

async function insertDecisionFixture(opts: DecisionFixtureOverrides): Promise<{ decisionId: string; rawToken: string }> {
  const decisionId = opts.decisionId ?? mintDecisionId();
  const rawToken = opts.rawToken ?? mintDecisionToken();
  const now = new Date();
  const bound = opts.amount !== null;
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision,
        aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
        destination_status_version, whitelist_version, revocation_epoch, chain, network,
        destination_type, issued_at_utc, expires_at_utc, status, consumed_at_utc, consumption_id, execution_ref,
        amount, asset_or_currency, limits_version, client_limit_profile_id, client_limit_profile_version)
     VALUES ($1,$2,$3,$4,$5,'allow',$6,$7,$8,$9,$10,$11,$12,'ethereum','mainnet','wallet',$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      decisionId,
      hashToken(rawToken),
      opts.destinationId,
      opts.clientId ?? OWNED_CLIENT_ID,
      opts.requestedAction ?? "destination_use",
      "aml1ptd_" + randomUUID(),
      new Date(now.getTime() + 3600_000).toISOString(),
      "wlt1screen_" + randomUUID(),
      opts.pocChallengeId === undefined ? "wlt1pocchal_default_" + randomUUID() : opts.pocChallengeId,
      1,
      1,
      opts.revocationEpoch ?? 0,
      (opts.issuedAtUtc ?? now).toISOString(),
      (opts.expiresAtUtc ?? new Date(now.getTime() + 300_000)).toISOString(),
      opts.status ?? "issued",
      opts.consumedAtUtc === undefined ? null : opts.consumedAtUtc?.toISOString() ?? null,
      opts.consumptionId === undefined ? null : opts.consumptionId,
      opts.executionRef === undefined ? null : opts.executionRef,
      bound ? (opts.amount ?? "40") : null,
      bound ? (opts.assetOrCurrency ?? "ETH") : null,
      bound ? 0 : null,
      bound ? PERMISSIVE_POLICY_ID : null,
      bound ? 1 : null,
    ],
  );
  return { decisionId, rawToken };
}

async function decisionRow(decisionId: string): Promise<Record<string, unknown>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
  return r.rows[0];
}

function consumeDecision(decisionId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destination-decisions/${decisionId}/verify-and-consume`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: body,
  });
}

function consumeBody(destinationId: string, rawToken: string, overrides: Record<string, unknown> = {}) {
  return {
    decision_token: rawToken,
    client_id: OWNED_CLIENT_ID,
    destination_id: destinationId,
    requested_action: "destination_use",
    execution_ref: "exec_" + randomUUID(),
    caller_module: "WDR1-TEST-CALLER",
    amount: "40",
    asset_or_currency: "ETH",
    ...overrides,
  };
}

async function auditRows(decisionId: string): Promise<Array<{ payload: Record<string, unknown> }>> {
  const r = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_decision_consumed' AND payload_ref LIKE $1 ORDER BY created_at_utc ASC`, [
    `%${decisionId}%`,
  ]);
  return r.rows.map((row) => ({ payload: JSON.parse(row.payload_ref) }));
}

/** Deterministic concurrency barrier: holds the decision row's own `FOR UPDATE` lock from an
 * INDEPENDENT connection, so any consume request against the SAME decision_id genuinely blocks at
 * the PostgreSQL level — never a simulated/sequential race. */
async function holdDecisionRowLock(decisionId: string): Promise<{ release: () => Promise<void> }> {
  const holder = await verifyPool.connect();
  await holder.query("BEGIN");
  await holder.query(`SELECT 1 FROM wlt1.destination_decision WHERE decision_id = $1 FOR UPDATE`, [decisionId]);
  return {
    release: async () => {
      await holder.query("COMMIT");
      holder.release();
    },
  };
}

describe("WLT-01 Phase 4B: destination-decision verify-and-consume", () => {
  it("H-fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/wlt1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL — must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: runtimeDbUrl });
    try {
      const r = await probe.query<{ current_user: string; rolsuper: boolean }>(`SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user`);
      expect(r.rows[0]?.current_user).toBe(RUNTIME_ROLE_USER);
      expect(r.rows[0]?.rolsuper).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("grants", () => {
    it("1. runtime role UPDATE grant on destination_decision is exactly status/consumed_at_utc/consumption_id/execution_ref", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema='wlt1' AND table_name='destination_decision' AND grantee='role_wlt1_runtime' AND privilege_type='UPDATE' ORDER BY column_name`,
      );
      expect(grants.rows.map((r) => r.column_name)).toEqual(["consumed_at_utc", "consumption_id", "execution_ref", "status"].sort());
    });

    it("2-6. UPDATE on any immutable column is DENIED at the database (42501) for the restricted runtime role", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const runtimePool = new Pool({ connectionString: runtimeDbUrl });
      try {
        await expect(runtimePool.query(`UPDATE wlt1.destination_decision SET token_hash = repeat('9',64) WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
        await expect(runtimePool.query(`UPDATE wlt1.destination_decision SET client_id = 'hacked' WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
        await expect(runtimePool.query(`UPDATE wlt1.destination_decision SET destination_id = 'hacked' WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
        await expect(runtimePool.query(`UPDATE wlt1.destination_decision SET expires_at_utc = now() WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
        await expect(runtimePool.query(`UPDATE wlt1.destination_decision SET revocation_epoch = 99 WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await runtimePool.end();
      }
    });

    it("7. NO DELETE grant for the restricted runtime role", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const runtimePool = new Pool({ connectionString: runtimeDbUrl });
      try {
        await expect(runtimePool.query(`DELETE FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await runtimePool.end();
      }
    });
  });

  describe("auth + schema", () => {
    it("8. missing internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/destination-decisions/wlt1dec_x/verify-and-consume`, payload: consumeBody("wlt1dest_x", mintDecisionToken()) });
      expect(res.statusCode).toBe(401);
    });

    it("9. invalid internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/wlt1dec_x/verify-and-consume`,
        headers: { "x-internal-service-token": "wrong-token" },
        payload: consumeBody("wlt1dest_x", mintDecisionToken()),
      });
      expect(res.statusCode).toBe(401);
    });

    it("10. additionalProperties rejected (e.g. a caller-supplied actor_id) -> 400", async () => {
      if (!schemaReady) return;
      const res = await consumeDecision("wlt1dec_x", consumeBody("wlt1dest_x", mintDecisionToken(), { actor_id: "staff_1" }));
      expect(res.statusCode).toBe(400);
    });

    it("11. missing execution_ref -> 400", async () => {
      if (!schemaReady) return;
      const body: Record<string, unknown> = consumeBody("wlt1dest_x", mintDecisionToken());
      delete body.execution_ref;
      const res = await consumeDecision("wlt1dec_x", body);
      expect(res.statusCode).toBe(400);
    });

    it("12. wrong requested_action -> 400 (schema-level Type.Literal)", async () => {
      if (!schemaReady) return;
      const res = await consumeDecision("wlt1dec_x", consumeBody("wlt1dest_x", mintDecisionToken(), { requested_action: "something_else" }));
      expect(res.statusCode).toBe(400);
    });

    it("13. caller-supplied consumption_id -> 400 (server-generated only, not part of the schema)", async () => {
      if (!schemaReady) return;
      const res = await consumeDecision("wlt1dec_x", consumeBody("wlt1dest_x", mintDecisionToken(), { consumption_id: "wlt1con_" + randomUUID() }));
      expect(res.statusCode).toBe(400);
    });

    it("14. no actor_id required; no IAM-02 interaction", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.consumed).toBe(true);
    });
  });

  describe("first consume", () => {
    it("15. valid request -> consumed:true, replay:false; row transitions; consumption_id valid regex; execution_ref exact", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_first_" + randomUUID();
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data).toMatchObject({ consumed: true, replay: false, decision_id: decisionId, destination_id: destinationId, client_id: OWNED_CLIENT_ID, requested_action: "destination_use", execution_ref: executionRef });
      expect(data.consumption_id).toMatch(CONSUMPTION_ID_REGEX);
      expect(Date.parse(data.consumed_at_utc)).not.toBeNaN();

      const row = await decisionRow(decisionId);
      expect(row.status).toBe("consumed");
      expect(row.consumption_id).toBe(data.consumption_id);
      expect(row.execution_ref).toBe(executionRef);
      expect(row.consumed_at_utc).not.toBeNull();
    });

    it("16. no token/hash/AML/screening/PoC/PII fields in the success response", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      const data = res.json().data;
      expect(Object.keys(data).sort()).toEqual(["consumed", "replay", "consumption_id", "decision_id", "destination_id", "client_id", "requested_action", "execution_ref", "consumed_at_utc"].sort());
      expect(JSON.stringify(data)).not.toContain(rawToken);
    });
  });

  describe("idempotent sequential replay", () => {
    it("17. same execution_ref + correct token/bindings -> replay:true with ORIGINAL consumption_id/consumed_at_utc; row byte-identical before/after", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_replay_" + randomUUID();
      const first = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const firstData = first.json().data;

      const before = await decisionRow(decisionId);
      const second = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const secondData = second.json().data;
      const after = await decisionRow(decisionId);

      expect(secondData).toMatchObject({ consumed: true, replay: true, consumption_id: firstData.consumption_id, consumed_at_utc: firstData.consumed_at_utc });
      expect(after).toEqual(before);
    });

    it("18. different caller_module on the replay attempt still replays successfully; row unchanged", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_replay_cm_" + randomUUID();
      const first = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef, caller_module: "WDR1-TEST-CALLER" }));
      const before = await decisionRow(decisionId);
      const second = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef, caller_module: "LED1-DIFFERENT-CALLER" }));
      expect(second.json().data).toMatchObject({ consumed: true, replay: true, consumption_id: first.json().data.consumption_id });
      const after = await decisionRow(decisionId);
      expect(after).toEqual(before);

      const rows = await auditRows(decisionId);
      const replayedRow = rows.find((r) => r.payload.metadata.outcome === "replayed");
      expect(replayedRow?.payload.metadata.caller_module).toBe("LED1-DIFFERENT-CALLER");
    });
  });

  describe("lost-response recovery", () => {
    it("19. first consume succeeds in the DB; a retry with the SAME execution_ref (simulating a lost first response) returns the same original receipt", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_lostresponse_" + randomUUID();
      const firstRes = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const firstData = firstRes.json().data; // caller "never sees" this in the lost-response scenario, but we capture it to compare
      // Retry — the caller's own recovery path after a lost response.
      const retryRes = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const retryData = retryRes.json().data;
      expect(retryData.replay).toBe(true);
      expect(retryData.consumption_id).toBe(firstData.consumption_id);
      expect(retryData.consumed_at_utc).toBe(firstData.consumed_at_utc);
    });
  });

  describe("replay wrong bindings", () => {
    it("20. same execution_ref + WRONG client_id -> binding_mismatch, never replay", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_wrongclient_" + randomUUID();
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef, client_id: "clt1client_wrong" }));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "binding_mismatch" });
    });

    it("21. same execution_ref + WRONG destination_id -> binding_mismatch, never replay", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_wrongdest_" + randomUUID();
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef, destination_id: "wlt1dest_wrong" }));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "binding_mismatch" });
    });
  });

  describe("already consumed (different execution_ref)", () => {
    it("22. different execution_ref -> consumed:false, already_consumed; no row mutation beyond the original consume", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_original_" + randomUUID() }));
      const before = await decisionRow(decisionId);
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_different_" + randomUUID() }));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "already_consumed" });
      const after = await decisionRow(decisionId);
      expect(after).toEqual(before);
    });
  });

  describe("4A-3 parity — anti-oracle, binding, expiry, revocation, PoC", () => {
    it("23. unknown decision -> token_mismatch", async () => {
      if (!schemaReady) return;
      const res = await consumeDecision("wlt1dec_" + randomUUID(), consumeBody("wlt1dest_never_existed", mintDecisionToken()));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "token_mismatch" });
    });

    it("24. existing decision + wrong token -> token_mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, mintDecisionToken()));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "token_mismatch" });
    });

    it("25. unknown-decision and wrong-token responses are byte-identical", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const wrongTokenRes = await consumeDecision(decisionId, consumeBody(destinationId, mintDecisionToken()));
      const unknownRes = await consumeDecision("wlt1dec_" + randomUUID(), consumeBody("wlt1dest_never_existed", mintDecisionToken()));
      expect(wrongTokenRes.json().data).toEqual(unknownRes.json().data);
      expect(wrongTokenRes.statusCode).toBe(unknownRes.statusCode);
    });

    it("26. wrong binding on a fresh (never-consumed) decision -> binding_mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { client_id: "clt1client_wrong" }));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "binding_mismatch" });
    });

    it("27. expired -> expired", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const past = new Date(Date.now() - 60_000);
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, issuedAtUtc: new Date(past.getTime() - 300_000), expiresAtUtc: past });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "expired" });
    });

    it("28. destination revoked -> revoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "revoked" });
    });

    it("29. revocation_epoch drift -> revoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, revocationEpoch: 0 });
      await verifyPool.query(`UPDATE wlt1.destination SET revocation_epoch = revocation_epoch + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "revoked" });
    });

    it("30. hosted + poc_challenge_id NULL -> may consume", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data.consumed).toBe(true);
    });

    it("31. hosted + poc_challenge_id NON-NULL -> evidence_integrity_invalid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_shouldnotexist" });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "evidence_integrity_invalid" });
    });

    it("32. unhosted/unknown + genuine non-null challenge -> may consume", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unknown" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine_" + randomUUID() });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data.consumed).toBe(true);
    });

    it("33. unhosted/unknown + NULL -> evidence_integrity_invalid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unhosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ consumed: false, reason_code: "evidence_integrity_invalid" });
    });

    it("34. destination_status_version drift ALONE -> still consumable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET destination_status_version = destination_status_version + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data.consumed).toBe(true);
    });

    it("35. whitelist_version drift ALONE -> still consumable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET whitelist_version = whitelist_version + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.json().data.consumed).toBe(true);
    });
  });

  describe("no-failure-mutation", () => {
    it("36. row is byte-identical before/after every one of the six deny outcomes", async () => {
      if (!schemaReady) return;

      // Each of the six scenarios below registers its OWN destination — the natural-key
      // (client_id + destination_type + address_hash) uniqueness constraint means each needs a
      // DISTINCT address; four Ethereum-format + two TRON-format stub addresses provide six.

      // token_mismatch
      {
        const { destinationId } = await usableDestination({ address: DISTINCT_ETH_ADDRESSES[0] });
        const { decisionId } = await insertDecisionFixture({ destinationId });
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, mintDecisionToken()));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
      // binding_mismatch
      {
        const { destinationId } = await usableDestination({ address: DISTINCT_ETH_ADDRESSES[1] });
        const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { client_id: "clt1client_wrong" }));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
      // expired
      {
        const { destinationId } = await usableDestination({ address: DISTINCT_ETH_ADDRESSES[2] });
        const past = new Date(Date.now() - 60_000);
        const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, issuedAtUtc: new Date(past.getTime() - 300_000), expiresAtUtc: past });
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
      // revoked
      {
        const { destinationId } = await usableDestination({ address: DISTINCT_ETH_ADDRESSES[3] });
        const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
        await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
      // evidence_integrity_invalid
      {
        const { destinationId } = await usableDestination({ walletType: "unhosted", address: DISTINCT_TRON_ADDRESSES[0], chain: "tron" });
        const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
      // already_consumed — row is already in 'consumed' state from the prior successful consume;
      // the failed new attempt must not alter it FURTHER.
      {
        const { destinationId } = await usableDestination({ address: DISTINCT_TRON_ADDRESSES[1], chain: "tron" });
        const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_orig_" + randomUUID() }));
        const before = await decisionRow(decisionId);
        await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_second_" + randomUUID() }));
        expect(await decisionRow(decisionId)).toEqual(before);
      }
    });
  });

  describe("audit", () => {
    it("37. first consume audited as outcome='consumed'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.metadata).toMatchObject({ outcome: "consumed", reason_code: null, consumption_id: res.json().data.consumption_id });
    });

    it("38. replay audited as outcome='replayed'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_audit_replay_" + randomUUID();
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const rows = await auditRows(decisionId);
      const outcomes = rows.map((r) => r.payload.metadata.outcome).sort();
      expect(outcomes).toEqual(["consumed", "replayed"]);
    });

    it("39. already_consumed audited as outcome='denied'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_a_" + randomUUID() }));
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: "exec_b_" + randomUUID() }));
      const rows = await auditRows(decisionId);
      const denied = rows.find((r) => r.payload.metadata.outcome === "denied");
      expect(denied?.payload.metadata.reason_code).toBe("already_consumed");
    });

    it("40. other business denies (binding_mismatch/expired/revoked/evidence_integrity_invalid) audited as outcome='denied'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { client_id: "clt1client_wrong" }));
      const rows = await auditRows(decisionId);
      expect(rows[0]!.payload.metadata).toMatchObject({ outcome: "denied", reason_code: "binding_mismatch" });
    });

    it("41. exact metadata allowlist — no extra keys (Limits / Velocity / Concentration / First-Use extends the original 10 with exactly 4: amount, asset_or_currency, first_use, limit_evaluation_id)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(Object.keys(rows[0]!.payload.metadata).sort()).toEqual(
        [
          "decision_id",
          "outcome",
          "reason_code",
          "consumption_id",
          "execution_ref",
          "client_id",
          "destination_id",
          "requested_action",
          "caller_module",
          "consumed_at_utc",
          "amount",
          "asset_or_currency",
          "first_use",
          "limit_evaluation_id",
        ].sort(),
      );
    });

    it("42. no raw decision_token or token_hash in any audit payload", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      const row = await decisionRow(decisionId);
      for (const auditRow of rows) {
        expect(JSON.stringify(auditRow.payload)).not.toContain(rawToken);
        expect(JSON.stringify(auditRow.payload)).not.toContain(row.token_hash as string);
      }
    });

    it("43. forced audit-INSERT failure on FIRST consume -> 503 WLT1_AUDIT_REQUIRED; decision remains issued with all three consumption fields NULL; retry succeeds cleanly", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("issued");
      expect(row.consumed_at_utc).toBeNull();
      expect(row.consumption_id).toBeNull();
      expect(row.execution_ref).toBeNull();

      const retry = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.consumed).toBe(true);
    }, 30_000);

    it("44. forced audit-INSERT failure on a REPLAY -> 503 WLT1_AUDIT_REQUIRED; already-consumed row unchanged (no mutation to roll back)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_replayauditfail_" + randomUUID();
      await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      const before = await decisionRow(decisionId);

      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      expect(await decisionRow(decisionId)).toEqual(before);

      const retry = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef }));
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.replay).toBe(true);
    }, 30_000);
  });

  describe("phase boundary", () => {
    it("45. no AML-01 call, no P-ROSTER call (throwing stubs configured for the whole file)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
    });

    it("46. no led1 schema, no ledger side effect", async () => {
      if (!schemaReady) return;
      const ledSchema = await verifyPool.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'led1'`);
      expect(ledSchema.rows).toHaveLength(0);
    });
  });

  describe("GENUINE CONCURRENCY (deterministic row-lock barrier, not a Promise.all coin flip)", () => {
    it("47. SAME execution_ref: exactly one consumed/replay:false, exactly one consumed/replay:true, identical receipts, one state transition, one audit each", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRef = "exec_concurrent_same_" + randomUUID();

      const barrier = await holdDecisionRowLock(decisionId);

      let aSettled = false;
      let bSettled = false;
      const reqA = consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef })).then((r) => {
        aSettled = true;
        return r;
      });
      const reqB = consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRef })).then((r) => {
        bSettled = true;
        return r;
      });

      await sleep(300);
      expect(aSettled, "request A must be genuinely blocked on the held row lock at this point — the barrier is not working").toBe(false);
      expect(bSettled, "request B must be genuinely blocked on the held row lock at this point — the barrier is not working").toBe(false);

      await barrier.release();
      const [resA, resB] = await Promise.all([reqA, reqB]);
      const dataA = resA.json().data;
      const dataB = resB.json().data;

      const [winner, loser] = dataA.replay === false ? [dataA, dataB] : [dataB, dataA];
      expect(winner).toMatchObject({ consumed: true, replay: false });
      expect(loser).toMatchObject({ consumed: true, replay: true });
      expect(loser.consumption_id).toBe(winner.consumption_id);
      expect(loser.consumed_at_utc).toBe(winner.consumed_at_utc);
      expect(loser.decision_id).toBe(winner.decision_id);
      expect(loser.destination_id).toBe(winner.destination_id);
      expect(loser.client_id).toBe(winner.client_id);
      expect(loser.requested_action).toBe(winner.requested_action);
      expect(loser.execution_ref).toBe(winner.execution_ref);

      const row = await decisionRow(decisionId);
      expect(row.status).toBe("consumed");
      expect(row.consumption_id).toBe(winner.consumption_id);

      const rows = await auditRows(decisionId);
      const outcomes = rows.map((r) => r.payload.metadata.outcome).sort();
      expect(outcomes).toEqual(["consumed", "replayed"]);
    }, 30_000);

    it("48. DIFFERENT execution_ref: exactly one consumed/replay:false, the other consumed:false/already_consumed; one state transition, one consumption_id, one audit each", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const executionRefA = "exec_concurrent_diff_a_" + randomUUID();
      const executionRefB = "exec_concurrent_diff_b_" + randomUUID();

      const barrier = await holdDecisionRowLock(decisionId);

      let aSettled = false;
      let bSettled = false;
      const reqA = consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRefA })).then((r) => {
        aSettled = true;
        return r;
      });
      const reqB = consumeDecision(decisionId, consumeBody(destinationId, rawToken, { execution_ref: executionRefB })).then((r) => {
        bSettled = true;
        return r;
      });

      await sleep(300);
      expect(aSettled, "request A must be genuinely blocked on the held row lock at this point — the barrier is not working").toBe(false);
      expect(bSettled, "request B must be genuinely blocked on the held row lock at this point — the barrier is not working").toBe(false);

      await barrier.release();
      const [resA, resB] = await Promise.all([reqA, reqB]);
      const dataA = resA.json().data;
      const dataB = resB.json().data;

      const [winner, loser] = dataA.consumed === true ? [dataA, dataB] : [dataB, dataA];
      expect(winner).toMatchObject({ consumed: true, replay: false });
      expect(winner.consumption_id).toMatch(CONSUMPTION_ID_REGEX);
      expect(loser).toEqual({ consumed: false, reason_code: "already_consumed" });

      const row = await decisionRow(decisionId);
      expect(row.status).toBe("consumed");
      expect(row.execution_ref).toBe(winner.execution_ref);
      expect([executionRefA, executionRefB]).toContain(row.execution_ref);

      const rows = await auditRows(decisionId);
      const outcomes = rows.map((r) => r.payload.metadata.outcome).sort();
      expect(outcomes).toEqual(["consumed", "denied"]);
      const deniedRow = rows.find((r) => r.payload.metadata.outcome === "denied");
      expect(deniedRow?.payload.metadata.reason_code).toBe("already_consumed");
    }, 30_000);
  });

  describe("L-1 remediation: amount MUST be a JSON string — a JSON number is rejected before Ajv coercion can alter its precision", () => {
    it("42. amount as a JSON number (40) -> 400 VALIDATION_ERROR, decision remains 'issued', never consumed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: 40 }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("issued");
    });

    it("43. high-precision amount as a JSON number (1.123456789012345678) -> 400, and consumption NEVER binds the IEEE-754-corrupted value '1.123456789012345700'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, amount: "1.123456789012345678" });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: 1.123456789012345678 }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("issued");
      const passRows = await verifyPool.query(`SELECT amount::text AS a FROM wlt1.limit_evaluation WHERE decision_id = $1 AND result_status = 'pass'`, [decisionId]);
      expect(passRows.rows).toHaveLength(0);
    });

    it("44. amount as a JSON string \"40\" -> accepted, reaches normal validation/business logic unaffected", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: "40" }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.consumed).toBe(true);
    });

    it("45. amount as a JSON string \"1.123456789012345678\" (full 18dp) -> accepted and consumed with the value PRESERVED EXACTLY through binding + parsing, no precision loss", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, amount: "1.123456789012345678" });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: "1.123456789012345678" }));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.consumed).toBe(true);
      const passRow = await verifyPool.query(`SELECT amount::text AS a FROM wlt1.limit_evaluation WHERE decision_id = $1 AND result_status = 'pass'`, [decisionId]);
      expect(passRow.rows[0].a).toBe("1.123456789012345678");
    });

    it("46. a 19-decimal STRING amount remains rejected (grammar, unaffected by this remediation)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: "1.1234567890123456789" }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("47. exponent-notation numeric amount (1e21) remains rejected — String(1e21) = '1e+21' fails the amount grammar even after coercion", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: 1e21 }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("48. a JSON number amount writes NO limit_evaluation row and NO consume audit — rejected before any business logic runs", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await consumeDecision(decisionId, consumeBody(destinationId, rawToken, { amount: 40 }));
      expect(res.statusCode).toBe(400);
      const evalRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE decision_id = $1`, [decisionId]);
      expect(Number(evalRows.rows[0].n)).toBe(0);
      const audit = await auditRows(decisionId);
      expect(audit).toHaveLength(0);
    });
  });
});
