/**
 * WLT-01 Phase 4A-3 — `POST /internal/wlt1/destination-decisions/:decision_id/verify`, PRIVATE
 * disposable database.
 *
 * Mirrors `wlt1-evaluate-use-route.test.ts`'s own established rationale: this file provisions its
 * own PRIVATE, uniquely named database (migrated through head 057, with the real `fnd`/`wlt1`
 * runtime grant files applied — the SAME grants Phase 4A-3 ships with, deliberately unmodified),
 * so its own forced-audit-failure ACL mutation against `foundation.outbox_event` can never reach
 * any other file's bystander request.
 *
 * Admin fixtures write `wlt1.destination_decision` rows directly via the superuser `verifyPool`
 * (same shape as `wlt1-migration-057-regression.test.ts`'s own established `insertDecision`
 * helper) — this file's own test matrix requires exact, independently-controlled combinations
 * (specific token/hash pairs, specific expiry/revocation/PoC-integrity states) no single HTTP flow
 * could produce deterministically. ONE test additionally drives the REAL end-to-end path (a
 * genuine `evaluate-use` allow, then verifying the genuinely-issued raw token) to prove the two
 * routes are actually wired together correctly, not merely individually self-consistent.
 *
 * P-ROSTER and AML-01 fetch stubs are configured to THROW IF CALLED for every test in this file
 * except the one genuine end-to-end setup — decision-verify itself must never make either network
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
import { WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { hashToken, mintDecisionId, mintDecisionToken } from "../../services/wlt1/src/lib/decision-token.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_decision_verify_route_test";

const PRIVATE_DB_NAME = `wlt1_decverify_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_decverifyprivate";

function mustNotBeCalledFetch(label: string): typeof fetch {
  return (async () => {
    throw new Error(`TEST ASSERTION FAILURE: ${label} must not be called by decision-verify`);
  }) as unknown as typeof fetch;
}

/** decision-verify itself must NEVER reach P-ROSTER (`/authorised-parties/active-refs`) — that
 * path always throws. But this file's OWN fixture setup (`registerDestination`, via the real
 * `wallet-destinations` route) legitimately needs CLT-01's UNRELATED client-status check
 * (`/internal/clt1/clients/:client_id/status`) to succeed — the same dispatch-aware stub shape
 * `wlt1-evaluate-use-route.test.ts` already established, reused here for the identical reason. */
function clt1FetchAllowStatusOnly(): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      throw new Error("TEST ASSERTION FAILURE: P-ROSTER (CLT-01) must not be called by decision-verify");
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
        providerResultId: "presult_decverifyprivate_" + randomUUID(),
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

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-decverify-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-decverify-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-decverify-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  // Only fnd + wlt1 grants — the EXACT, unmodified Phase 4A-2 grant file. Phase 4A-3 introduces no
  // grant change; this file's own M-REV-1 canary + no-UPDATE proof depend on that being true.
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
    wlt1InternalServiceToken: "test-wlt1-internal-token-decverifyprivate-it",
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
    aml1InternalServiceToken: "test-aml1-internal-token-decverifyprivate-it",
    clt1FetchImpl: clt1FetchAllowStatusOnly(),
    screeningProviderImpl: alwaysClearProvider,
    aml1FetchImpl: mustNotBeCalledFetch("AML-01"),
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
  mainConfig.clt1FetchImpl = clt1FetchAllowStatusOnly();
  mainConfig.aml1FetchImpl = mustNotBeCalledFetch("AML-01");
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
  const challengeId = "wlt1pocchal_decverify_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control
       (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme,
        message_format_version, domain_environment, nonce, message_hash, verification_status, signature_hash, recovered_address,
        issued_at_utc, expires_at_utc, verified_at_utc)
     VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now() + interval '15 minutes', now())`,
    [
      challengeId,
      destinationId,
      OWNED_CLIENT_ID,
      WLT1_TEST_STUB_ADDRESS_CLEAR,
      "sha256:" + "ab".repeat(32),
      "cd".repeat(32),
      "ef".repeat(32),
      "12".repeat(32),
      WLT1_TEST_STUB_ADDRESS_CLEAR,
    ],
  );
  return challengeId;
}

/** Fixture: registers + screens (clear) + PoC-if-required, then directly activates the
 * destination via admin SQL (established WLT-01 test-suite precedent). */
async function usableDestination(opts: { walletType?: string } = {}): Promise<{ destinationId: string }> {
  const walletType = opts.walletType ?? "unhosted";
  const { destinationId } = await registerDestination({ wallet_type: walletType });
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
  status?: string;
  revocationEpoch?: number;
  pocChallengeId?: string | null;
  issuedAtUtc?: Date;
  expiresAtUtc?: Date;
}

/** Admin fixture: inserts a `wlt1.destination_decision` row directly with a KNOWN raw token (so
 * tests can present either the correct token or a deliberately wrong one). `pocChallengeId`
 * defaults to a genuine non-null value when omitted (matching `usableDestination`'s own default
 * `unhosted` wallet type, which requires one) — PoC-specific tests override it explicitly. Mirrors
 * `wlt1-migration-057-regression.test.ts`'s own established `insertDecision` shape. */
async function insertDecisionFixture(opts: DecisionFixtureOverrides): Promise<{ decisionId: string; rawToken: string }> {
  const decisionId = opts.decisionId ?? mintDecisionId();
  const rawToken = opts.rawToken ?? mintDecisionToken();
  const now = new Date();
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision,
        aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
        destination_status_version, whitelist_version, revocation_epoch, chain, network,
        destination_type, issued_at_utc, expires_at_utc, status)
     VALUES ($1,$2,$3,$4,$5,'allow',$6,$7,$8,$9,$10,$11,$12,'ethereum','mainnet','wallet',$13,$14,$15)`,
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
    ],
  );
  return { decisionId, rawToken };
}

async function decisionRow(decisionId: string): Promise<Record<string, unknown>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
  return r.rows[0];
}

function verifyDecision(decisionId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destination-decisions/${decisionId}/verify`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: body,
  });
}

function verifyBody(destinationId: string, rawToken: string, overrides: Record<string, unknown> = {}) {
  return { decision_token: rawToken, client_id: OWNED_CLIENT_ID, destination_id: destinationId, requested_action: "destination_use", ...overrides };
}

async function auditRows(decisionId: string): Promise<Array<{ payload: Record<string, unknown> }>> {
  const r = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_decision_verified' AND payload_ref LIKE $1 ORDER BY created_at_utc ASC`, [
    `%${decisionId}%`,
  ]);
  return r.rows.map((row) => ({ payload: JSON.parse(row.payload_ref) }));
}

describe("WLT-01 Phase 4A-3: destination-decision verify", () => {
  it("H-fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/wlt1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL — must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const r = await probe.query<{ current_user: string; rolsuper: boolean }>(`SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user`);
      expect(r.rows[0]?.current_user).toBe(RUNTIME_ROLE_USER);
      expect(r.rows[0]?.rolsuper).toBe(false);
    } finally {
      await probe.end();
    }
  });

  it("NO-UPDATE-GRANT: the restricted runtime role genuinely has no UPDATE privilege on wlt1.destination_decision (structural proof, not merely a code-review convention)", async () => {
    if (!schemaReady) return;
    const grants = await verifyPool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
    );
    expect(grants.rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT"]);
  });

  describe("auth + schema", () => {
    it("1. missing internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/destination-decisions/wlt1dec_x/verify`, payload: verifyBody("wlt1dest_x", "wlt1dt_" + "a".repeat(43)) });
      expect(res.statusCode).toBe(401);
    });

    it("2. invalid internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/wlt1dec_x/verify`,
        headers: { "x-internal-service-token": "wrong-token" },
        payload: verifyBody("wlt1dest_x", "wlt1dt_" + "a".repeat(43)),
      });
      expect(res.statusCode).toBe(401);
    });

    it("3. valid internal token reaches the route (no IAM-02 required — no actor_id in the body at all)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.valid).toBe(true);
    });

    it("4. additionalProperties rejected (e.g. a caller-supplied actor_id) -> 400", async () => {
      if (!schemaReady) return;
      const res = await verifyDecision("wlt1dec_x", verifyBody("wlt1dest_x", "wlt1dt_" + "a".repeat(43), { actor_id: "staff_1" }));
      expect(res.statusCode).toBe(400);
    });

    it("5. requested_action other than 'destination_use' -> 400 (schema-level Type.Literal)", async () => {
      if (!schemaReady) return;
      const res = await verifyDecision("wlt1dec_x", verifyBody("wlt1dest_x", "wlt1dt_" + "a".repeat(43), { requested_action: "something_else" }));
      expect(res.statusCode).toBe(400);
    });

    it("6. a malformed/non-canonical decision_token STRING (still within the 1..64 schema bound) reaches the route and is treated as an ordinary token_mismatch, never a special format error", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, "not-a-real-token-format"));
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ valid: false, reason_code: "token_mismatch" });
    });
  });

  describe("valid path", () => {
    it("7. issued decision + correct token + exact bindings + unexpired + not revoked + structurally valid PoC -> valid:true with exact response shape", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.valid).toBe(true);
      expect(data.decision_id).toBe(decisionId);
      expect(data.destination_id).toBe(destinationId);
      expect(data.client_id).toBe(OWNED_CLIENT_ID);
      expect(data.requested_action).toBe("destination_use");
      expect(Date.parse(data.expires_at_utc)).not.toBeNaN();
      expect(Object.keys(data).sort()).toEqual(["valid", "decision_id", "destination_id", "client_id", "requested_action", "expires_at_utc"].sort());
    });

    it("8. REAL end-to-end: a genuine evaluate-use allow token is genuinely verifiable by decision-verify (proves the two routes are actually wired together, not merely individually self-consistent)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = (async (url: unknown) => {
        if (String(url).includes("/authorised-parties/active-refs")) {
          return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, authorised_party_refs: ["ap_1"] } }) } as Response;
        }
        return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }) } as Response;
      }) as unknown as typeof fetch;
      mainConfig.aml1FetchImpl = (async () => {
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
      }) as unknown as typeof fetch;

      // Limits / Velocity / Concentration / First-Use — a permissive client-default policy so this
      // genuine evaluate-use call reaches ALLOW; schema-owner provisioning fixture (superuser
      // `verifyPool`, never through a runtime route — this phase implements no policy-mutation API).
      await verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network,
            per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
         VALUES ($1,1,$2,'wallet','ETH','ethereum','mainnet','1000000','1000000','1000000',24,'500000','active','test-approved')
         ON CONFLICT DO NOTHING`,
        ["wlt1lp_decverify_permissive", OWNED_CLIENT_ID],
      );

      const evalRes = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "DECISION-VERIFY-TEST", amount: "40", asset_or_currency: "ETH" },
      });
      expect(evalRes.statusCode).toBe(200);
      const evalData = evalRes.json().data;
      expect(evalData.decision).toBe("allow");

      mainConfig.clt1FetchImpl = clt1FetchAllowStatusOnly();
      mainConfig.aml1FetchImpl = mustNotBeCalledFetch("AML-01");

      const verifyRes = await verifyDecision(evalData.decision_id, verifyBody(destinationId, evalData.decision_token));
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data).toMatchObject({ valid: true, decision_id: evalData.decision_id, destination_id: destinationId });
    });
  });

  describe("token / anti-oracle", () => {
    it("9. existing decision + wrong token -> token_mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, mintDecisionToken()));
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ valid: false, reason_code: "token_mismatch" });
    });

    it("10. unknown decision_id -> token_mismatch (never 404, never any other shape)", async () => {
      if (!schemaReady) return;
      const res = await verifyDecision("wlt1dec_" + randomUUID(), verifyBody("wlt1dest_never_existed", mintDecisionToken()));
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ valid: false, reason_code: "token_mismatch" });
    });

    it("11. unknown-decision and wrong-token responses are BYTE-IDENTICAL in shape and value (the load-bearing anti-oracle assertion)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId } = await insertDecisionFixture({ destinationId });
      const wrongTokenRes = await verifyDecision(decisionId, verifyBody(destinationId, mintDecisionToken()));
      const unknownRes = await verifyDecision("wlt1dec_" + randomUUID(), verifyBody("wlt1dest_never_existed", mintDecisionToken()));
      expect(wrongTokenRes.json().data).toEqual(unknownRes.json().data);
      expect(wrongTokenRes.statusCode).toBe(unknownRes.statusCode);
    });

    it("12. correct token hash is accepted (positive control for the timing-safe path)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("13. a same-length but incorrect token is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const tamperedToken = rawToken.slice(0, -1) + (rawToken.slice(-1) === "A" ? "B" : "A");
      const res = await verifyDecision(decisionId, verifyBody(destinationId, tamperedToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "token_mismatch" });
    });

    it("14. the raw token is never read back from persistence anywhere reachable — only token_hash is stored, and it never appears in the response", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(JSON.stringify(res.json())).not.toContain(rawToken);
      const row = await decisionRow(decisionId);
      expect(row.token_hash).toBe(hashToken(rawToken));
    });
  });

  describe("binding", () => {
    it("15. wrong client_id -> binding_mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken, { client_id: "clt1client_wrong" }));
      expect(res.json().data).toEqual({ valid: false, reason_code: "binding_mismatch" });
    });

    it("16. wrong destination_id -> binding_mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken, { destination_id: "wlt1dest_wrong" }));
      expect(res.json().data).toEqual({ valid: false, reason_code: "binding_mismatch" });
    });
  });

  describe("expiry", () => {
    it("17. an already-expired decision -> expired", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const past = new Date(Date.now() - 60_000);
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, issuedAtUtc: new Date(past.getTime() - 300_000), expiresAtUtc: past });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "expired" });
    });

    it("18. a not-yet-expired decision is not rejected on expiry grounds", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, expiresAtUtc: new Date(Date.now() + 300_000) });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });
  });

  describe("revocation", () => {
    it("19. destination.status = 'revoked' -> revoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "revoked" });
    });

    it("20. revocation_epoch drifted since issuance -> revoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, revocationEpoch: 0 });
      await verifyPool.query(`UPDATE wlt1.destination SET revocation_epoch = revocation_epoch + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "revoked" });
    });

    it("21. destination_status_version drift ALONE (no epoch change, not revoked) MUST NOT invalidate — an active promotion legitimately bumps this", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET destination_status_version = destination_status_version + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("22. whitelist_version drift ALONE MUST NOT invalidate", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET whitelist_version = whitelist_version + 1 WHERE destination_id = $1`, [destinationId]);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });
  });

  describe("PoC structural integrity", () => {
    it("23. hosted + poc_challenge_id NULL -> valid:true", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("24. hosted + poc_challenge_id NON-NULL -> evidence_integrity_invalid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_shouldnotexist" });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "evidence_integrity_invalid" });
    });

    it("25. unhosted + genuine non-null challenge -> valid:true (no live wlt1.proof_of_control lookup required — structural check only)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unhosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine_" + randomUUID() });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("26. unhosted + NULL -> evidence_integrity_invalid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unhosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "evidence_integrity_invalid" });
    });

    it("27. unknown + genuine non-null challenge -> valid:true", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unknown" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine_" + randomUUID() });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("28. unknown + NULL -> evidence_integrity_invalid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unknown" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data).toEqual({ valid: false, reason_code: "evidence_integrity_invalid" });
    });
  });

  describe("audit", () => {
    it("29. a valid verification is audited (wlt1.destination_decision_verified, valid:true)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.metadata).toMatchObject({ decision_id: decisionId, valid: true, reason_code: null });
    });

    it("30. binding_mismatch is audited", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken, { client_id: "clt1client_wrong" }));
      const rows = await auditRows(decisionId);
      expect(rows[0]!.payload.metadata).toMatchObject({ valid: false, reason_code: "binding_mismatch" });
    });

    it("31. expired is audited", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const past = new Date(Date.now() - 60_000);
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, issuedAtUtc: new Date(past.getTime() - 300_000), expiresAtUtc: past });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(rows[0]!.payload.metadata).toMatchObject({ valid: false, reason_code: "expired" });
    });

    it("32. revoked is audited", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(rows[0]!.payload.metadata).toMatchObject({ valid: false, reason_code: "revoked" });
    });

    it("33. evidence_integrity_invalid is audited", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unhosted" });
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: null });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(rows[0]!.payload.metadata).toMatchObject({ valid: false, reason_code: "evidence_integrity_invalid" });
    });

    it("34. unknown-decision / token_mismatch is ALSO audited (the only forensic record that a non-existent decision was probed)", async () => {
      if (!schemaReady) return;
      const probedDecisionId = "wlt1dec_" + randomUUID();
      await verifyDecision(probedDecisionId, verifyBody("wlt1dest_never_existed", mintDecisionToken()));
      const rows = await auditRows(probedDecisionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.metadata).toMatchObject({ valid: false, reason_code: "token_mismatch" });
    });

    it("35. audit metadata is exactly the frozen allowlist — no extra fields", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      expect(Object.keys(rows[0]!.payload.metadata).sort()).toEqual(["decision_id", "valid", "reason_code", "client_id", "destination_id", "requested_action", "verified_at_utc"].sort());
    });

    it("36. no raw decision_token appears in any audit payload", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      for (const row of rows) {
        expect(JSON.stringify(row.payload)).not.toContain(rawToken);
      }
    });

    it("37. no token_hash appears in any audit payload", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const rows = await auditRows(decisionId);
      const row = await decisionRow(decisionId);
      for (const auditRow of rows) {
        expect(JSON.stringify(auditRow.payload)).not.toContain(row.token_hash as string);
      }
    });

    it("38. forced audit-INSERT failure -> 503 WLT1_AUDIT_REQUIRED, never an unaudited result; retry succeeds once the ACL is restored", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      const retry = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.valid).toBe(true);
    }, 30_000);
  });

  describe("read-only boundary", () => {
    it("39. the decision row is BYTE-IDENTICAL before and after a valid verify", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      const before = await decisionRow(decisionId);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
      const after = await decisionRow(decisionId);
      expect(after).toEqual(before);
    });

    it("40. the decision row is BYTE-IDENTICAL before and after an INVALID verify of an existing row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId });
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      const before = await decisionRow(decisionId);
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      const after = await decisionRow(decisionId);
      expect(after).toEqual(before);
    });

    it("41. status remains 'issued' after any number of verify calls", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      await verifyDecision(decisionId, verifyBody(destinationId, mintDecisionToken()));
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("issued");
    });

    it("42. verify succeeds while the runtime role structurally lacks UPDATE on wlt1.destination_decision (proves no UPDATE is silently required)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      const grants = await verifyPool.query(
        `SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND grantee = 'role_wlt1_runtime' AND privilege_type = 'UPDATE'`,
      );
      expect(grants.rows).toHaveLength(0);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
      expect(res.json().data.valid).toBe(true);
    });
  });

  describe("phase boundary", () => {
    it("43. no P-ROSTER call and no AML-01 call are ever made by decision-verify (throwing stubs configured for the whole file; this test just re-confirms after the one exception test)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: "wlt1pocchal_genuine" });
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.statusCode).toBe(200);
    });

    it("44. no wlt1.proof_of_control row is ever queried to confirm a non-null poc_challenge_id still exists — a decision referencing a challenge_id that has since been deleted still verifies structurally valid", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "unhosted" });
      const dandlingChallengeId = "wlt1pocchal_since_deleted_" + randomUUID();
      const { decisionId, rawToken } = await insertDecisionFixture({ destinationId, pocChallengeId: dandlingChallengeId });
      // No row in wlt1.proof_of_control exists with this challenge_id at all (usableDestination's
      // own fixture PoC row has a DIFFERENT, unrelated challenge_id) — structural check only.
      const pocRows = await verifyPool.query(`SELECT 1 FROM wlt1.proof_of_control WHERE challenge_id = $1`, [dandlingChallengeId]);
      expect(pocRows.rows).toHaveLength(0);
      const res = await verifyDecision(decisionId, verifyBody(destinationId, rawToken));
      expect(res.json().data.valid).toBe(true);
    });

    it("45. this 4A-3 route/evaluator's own SOURCE never references the Phase 4B consumption columns (consumed_at_utc/execution_ref/consumption_id) — mechanical fallout from migration 058: those columns now genuinely exist on wlt1.destination_decision (Phase 4B, its own separately-accepted migration), so a schema-level absence check is no longer meaningful; a source-text scan proves this file's own code was never touched to read/write them, and the row-byte-identical assertions elsewhere in this file prove the route stays read-only in practice", async () => {
      if (!schemaReady) return;
      const routeSource = readFileSync(join(REPO_ROOT, "services", "wlt1", "src", "routes", "decision-verify.ts"), "utf8");
      const libSource = readFileSync(join(REPO_ROOT, "services", "wlt1", "src", "lib", "decision-verify.ts"), "utf8");
      for (const forbidden of ["consumed_at_utc", "execution_ref", "consumption_id"]) {
        expect(routeSource).not.toContain(forbidden);
        expect(libSource).not.toContain(forbidden);
      }
    });

    it("46. no led1 schema exists — no LED-01 side effect of any kind", async () => {
      if (!schemaReady) return;
      const ledSchema = await verifyPool.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'led1'`);
      expect(ledSchema.rows).toHaveLength(0);
    });
  });
});
