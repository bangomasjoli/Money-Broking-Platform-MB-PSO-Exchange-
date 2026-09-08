/**
 * WLT-01 Phase 4A-2 — `POST /internal/wlt1/destinations/:destination_id/evaluate-use`, PRIVATE
 * disposable database.
 *
 * Mirrors `wlt1-destination-approval-route.test.ts`'s own established rationale: this file
 * provisions its own PRIVATE, uniquely named database (migrated through head, currently
 * `057_wlt1_destination_decision` — with the real `fnd`/`wlt1` runtime grant files applied), so its
 * own forced-audit-failure ACL mutation against `foundation.outbox_event` can never reach any other
 * file's bystander request on the shared canonical database.
 *
 * P-ROSTER (CLT-01) and AML-01 are BOTH stubbed via `config.clt1FetchImpl`/`config.aml1FetchImpl`
 * (test-only DI seams) — no live CLT-01/AML-01 service is started. This file proves WLT-01's OWN
 * gate/sequencing/atomicity/token-issuance logic; CLT-01's and AML-01's own internal correctness is
 * each module's own accepted test suite's responsibility, not re-proven here.
 *
 * Admin fixtures write `wlt1.wallet_screening_result`/`wlt1.proof_of_control` rows and mutate
 * `wlt1.destination.status`/`wlt1.wallet_destination.chain` directly via the superuser `verifyPool`
 * — bypassing the app's own screening/PoC/approval write paths entirely, since this file's own test
 * matrix requires exact, independently-controlled state combinations no single HTTP flow chain
 * could produce deterministically. Destination/wallet_destination rows themselves ARE created via
 * the real `POST /internal/wlt1/wallet-destinations` + `.../screen` routes (never hand-inserted) so
 * natural-key hashing, wallet_type, and the screening result row are always genuine, accepted-
 * write-path values.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import { RAW_TOKEN_REGEX, DECISION_ID_REGEX } from "../../services/wlt1/src/lib/decision-token.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_evaluate_use_route_test";

const PRIVATE_DB_NAME = `wlt1_evaluse_it_${randomBytes(6).toString("hex")}`;

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

const OWNED_CLIENT_ID = "clt1client_evaluseprivate";
const AML_VALID_MINUTES_DEFAULT = 10;
const DECISION_TOKEN_TTL_MINUTES = 5;

// -------------------------------------------------------------------------------------------
// P-ROSTER (CLT-01) fake fetch — own copy, F3(c). Dispatches on URL suffix because the SAME
// `clt1FetchImpl` config field is reused for BOTH the registration route's client-active check
// AND evaluate-use's P-ROSTER call (frozen — no new CLT-01 config this phase).
// -------------------------------------------------------------------------------------------
type RosterMode =
  | { kind: "ok"; refs: string[] }
  | { kind: "unavailable" }
  | { kind: "network_error" }
  | { kind: "malformed" }
  | { kind: "mismatch" }
  | { kind: "unreachable_should_not_be_called" };

function makeClt1Fetch(rosterMode: () => RosterMode | Promise<RosterMode>): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      const mode = await rosterMode();
      if (mode.kind === "unreachable_should_not_be_called") {
        throw new Error("TEST ASSERTION FAILURE: P-ROSTER must not be called for this scenario");
      }
      if (mode.kind === "network_error") {
        throw new Error("network down");
      }
      if (mode.kind === "unavailable") {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      if (mode.kind === "malformed") {
        return {
          ok: true,
          json: async () => {
            throw new Error("not json");
          },
        } as Response;
      }
      if (mode.kind === "mismatch") {
        return { ok: true, json: async () => ({ success: true, data: { client_id: "clt1client_WRONG", authorised_party_refs: ["ap_1"] } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, authorised_party_refs: mode.refs } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }) } as Response;
  }) as typeof fetch;
}

function clt1RosterOk(refs: string[] = ["ap_1"]): typeof fetch {
  return makeClt1Fetch(() => ({ kind: "ok", refs }));
}
function clt1RosterMustNotBeCalled(): typeof fetch {
  return makeClt1Fetch(() => ({ kind: "unreachable_should_not_be_called" }));
}

// -------------------------------------------------------------------------------------------
// AML-01 fake fetch — own copy, F3(c).
// -------------------------------------------------------------------------------------------
type AmlMode =
  | { kind: "allow"; overrides?: Record<string, unknown> }
  | { kind: "review" }
  | { kind: "deny" }
  | { kind: "unavailable" }
  | { kind: "network_error" }
  | { kind: "malformed" }
  | { kind: "unreachable_should_not_be_called" };

function makeAml1Fetch(mode: () => AmlMode | Promise<AmlMode>): typeof fetch {
  return (async () => {
    const m = await mode();
    if (m.kind === "unreachable_should_not_be_called") {
      throw new Error("TEST ASSERTION FAILURE: AML-01 must not be called for this scenario");
    }
    if (m.kind === "network_error") {
      throw new Error("network down");
    }
    if (m.kind === "unavailable") {
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }
    if (m.kind === "malformed") {
      return {
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      } as Response;
    }
    const now = new Date();
    if (m.kind === "review" || m.kind === "deny") {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            decision: m.kind,
            decision_id: "aml1ptd_" + randomUUID(),
            reason_code: m.kind === "review" ? "evidence_review_required" : "evidence_sanctioned",
            evaluated_at_utc: now.toISOString(),
            valid_until_utc: new Date(now.getTime() + AML_VALID_MINUTES_DEFAULT * 60_000).toISOString(),
            evidence_provider_ids: ["stub-v1"],
            client_id: OWNED_CLIENT_ID,
            requested_action: "destination_use",
          },
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          decision: "allow",
          decision_id: "aml1ptd_" + randomUUID(),
          reason_code: "evidence_clear",
          evaluated_at_utc: now.toISOString(),
          valid_until_utc: new Date(now.getTime() + AML_VALID_MINUTES_DEFAULT * 60_000).toISOString(),
          evidence_provider_ids: ["stub-v1"],
          client_id: OWNED_CLIENT_ID,
          requested_action: "destination_use",
          ...m.overrides,
        },
      }),
    } as Response;
  }) as typeof fetch;
}

function aml1Allow(overrides: Record<string, unknown> = {}): typeof fetch {
  return makeAml1Fetch(() => ({ kind: "allow", overrides }));
}
function aml1MustNotBeCalled(): typeof fetch {
  return makeAml1Fetch(() => ({ kind: "unreachable_should_not_be_called" }));
}

const alwaysClearProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen() {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_evaluseprivate_" + randomUUID(),
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

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-evaluse-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-evaluse-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-evaluse-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-evaluseprivate-it",
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
    decisionTokenTtlMinutes: DECISION_TOKEN_TTL_MINUTES,
    aml1BaseUrl: "http://127.0.0.1:0",
    aml1InternalServiceToken: "test-aml1-internal-token-evaluseprivate-it",
    clt1FetchImpl: clt1RosterOk(),
    screeningProviderImpl: alwaysClearProvider,
    iam2FetchImpl: (async () => ({ ok: true, json: async () => ({ success: true, data: { decision: "allow" } }) })) as unknown as typeof fetch,
    aml1FetchImpl: aml1Allow(),
  };
  app = await buildApp(mainConfig);
  await seedPermissiveClientPolicy();

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
  mainConfig.clt1FetchImpl = clt1RosterOk();
  mainConfig.aml1FetchImpl = aml1Allow();
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

/** Drives a destination to `pending_review` via the REAL screen route (terminal on first call). */
async function screenToPendingReview(destinationId: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (res.statusCode !== 200) throw new Error(`expected terminal screening, got ${res.statusCode} ${res.body}`);
}

async function setLatestScreening(destinationId: string, riskStatus: string, validUntilUtc: string | null): Promise<void> {
  await verifyPool.query(
    `UPDATE wlt1.wallet_screening_result SET risk_status = $1, valid_until_utc = $2
      WHERE destination_id = $3 AND screening_result_version = (SELECT max(screening_result_version) FROM wlt1.wallet_screening_result WHERE destination_id = $3)`,
    [riskStatus, validUntilUtc, destinationId],
  );
}

async function insertVerifiedPoc(destinationId: string): Promise<string> {
  const challengeId = "wlt1pocchal_evaluse_" + randomUUID();
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

async function destinationRow(destinationId: string): Promise<{
  status: string;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
  cooling_off_until_utc: string | null;
  updated_at_utc: string;
}> {
  const r = await verifyPool.query(
    `SELECT status, destination_status_version, whitelist_version, revocation_epoch, cooling_off_until_utc, updated_at_utc FROM wlt1.destination WHERE destination_id = $1`,
    [destinationId],
  );
  return r.rows[0];
}

async function decisionRows(destinationId: string): Promise<Array<Record<string, unknown>>> {
  const r = await verifyPool.query(`SELECT * FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
  return r.rows;
}

async function latestScreeningResultId(destinationId: string): Promise<string> {
  const r = await verifyPool.query(`SELECT screening_result_id FROM wlt1.wallet_screening_result WHERE destination_id = $1 ORDER BY screening_result_version DESC LIMIT 1`, [destinationId]);
  return r.rows[0].screening_result_id;
}

/** Fixture: registers + screens (clear) + PoC-if-required, then directly sets the destination row
 * to the requested usable status via admin SQL (mirrors the established precedent in
 * `wlt1-destination-approval-route.test.ts` of directly mutating `status` rather than driving the
 * full maker-checker chain, since only the RESULTING state matters for evaluate-use's own gates). */
async function usableDestination(opts: { walletType?: string; status?: "active" | "approved_pending_cooling"; coolingOffUntilUtc?: Date | null } = {}): Promise<{ destinationId: string }> {
  const walletType = opts.walletType ?? "unhosted";
  const status = opts.status ?? "active";
  const { destinationId } = await registerDestination({ wallet_type: walletType });
  await screenToPendingReview(destinationId);
  if (walletType !== "hosted") {
    await insertVerifiedPoc(destinationId);
  }
  const coolingOffUntilUtc = status === "approved_pending_cooling" ? (opts.coolingOffUntilUtc ?? new Date(Date.now() - 3600_000)) : null;
  await verifyPool.query(`UPDATE wlt1.destination SET status = $1, cooling_off_until_utc = $2 WHERE destination_id = $3`, [status, coolingOffUntilUtc, destinationId]);
  return { destinationId };
}

function evaluateUse(destinationId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "WLT1-TEST-CALLER", amount: "40", asset_or_currency: "ETH", ...body },
  });
}

/** Limits / Velocity / Concentration / First-Use — a permissive client-default policy for the
 * wallet/ETH/ethereum/mainnet dimension this file's own `evaluateUse` default requests, so every
 * pre-existing ALLOW-path assertion in this file (none of which are about limit enforcement
 * itself — that is this control's OWN dedicated `wlt1-limits-route.test.ts`) continues to reach
 * `decision: "allow"` unchanged. High enough thresholds to never interfere with this file's own
 * scenarios. Schema-owner provisioning fixture (superuser `verifyPool`, never through a runtime
 * route — this phase implements no policy-mutation API). */
async function seedPermissiveClientPolicy(): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination_limit_profile
       (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network,
        per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
     VALUES ($1,1,$2,'wallet','ETH','ethereum','mainnet','1000000','1000000','1000000',24,'500000','active','test-approved')
     ON CONFLICT DO NOTHING`,
    ["wlt1lp_evaluse_permissive_" + randomUUID(), OWNED_CLIENT_ID],
  );
}

async function auditRows(destinationId: string): Promise<Array<{ payload: Record<string, unknown> }>> {
  const r = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_use_evaluated' AND payload_ref LIKE $1 ORDER BY created_at_utc ASC`, [
    `%${destinationId}%`,
  ]);
  return r.rows.map((row) => ({ payload: JSON.parse(row.payload_ref) }));
}

describe("WLT-01 Phase 4A-2: evaluate-use", () => {
  it("H-fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "private DB setup (migrate + fnd/wlt1 grants) must have succeeded").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  describe("auth + schema", () => {
    it("1. missing internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destinations/wlt1dest_x/evaluate-use`,
        payload: { client_id: "c", requested_action: "destination_use", caller_module: "X", amount: "40", asset_or_currency: "ETH" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("2. invalid internal-service token -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destinations/wlt1dest_x/evaluate-use`,
        headers: { "x-internal-service-token": "wrong-token" },
        payload: { client_id: "c", requested_action: "destination_use", caller_module: "X", amount: "40", asset_or_currency: "ETH" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("3. requested_action other than 'destination_use' -> 400 (schema-level Type.Literal)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { requested_action: "something_else" });
      expect(res.statusCode).toBe(400);
    });

    it("4. extra body field -> 400 (additionalProperties: false)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { extra_field: "nope" });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("existence + binding", () => {
    it("5. unknown destination -> 404 WLT1_DESTINATION_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await evaluateUse("wlt1dest_never_existed_" + randomUUID());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("6. foreign client -> 404, identical to unknown destination (no enumeration oracle)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const foreignRes = await evaluateUse(destinationId, { client_id: "clt1client_evaluseforeign" });
      const unknownRes = await evaluateUse("wlt1dest_never_existed_" + randomUUID(), { client_id: "clt1client_evaluseforeign" });
      expect(foreignRes.statusCode).toBe(404);
      expect(foreignRes.json().error.code).toBe(unknownRes.json().error.code);
    });
  });

  describe("local gate deny matrix (G3-G9) — P-ROSTER/AML must NEVER be called", () => {
    beforeEach(() => {
      if (!schemaReady) return;
      mainConfig.clt1FetchImpl = clt1RosterMustNotBeCalled();
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
    });

    afterEach(() => {
      if (!schemaReady) return;
      mainConfig.clt1FetchImpl = clt1RosterOk();
      mainConfig.aml1FetchImpl = aml1Allow();
    });

    it("7. revoked -> destination_revoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "destination_revoked" });
    });

    it("8. chain not covered -> chain_not_supported", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await verifyPool.query(`UPDATE wlt1.wallet_destination SET chain = 'solana' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "chain_not_supported" });
    });

    it("9. screening adverse (review_required) -> screening_not_clear", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await setLatestScreening(destinationId, "review_required", new Date(Date.now() + 3600_000).toISOString());
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "screening_not_clear" });
    });

    it("10. screening stale (expired) -> screening_stale", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await setLatestScreening(destinationId, "clear", new Date(Date.now() - 1000).toISOString());
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "screening_stale" });
    });

    it("11. missing PoC for unhosted -> proof_of_control_missing", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ wallet_type: "unhosted" });
      await screenToPendingReview(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "proof_of_control_missing" });
    });

    it("12. missing PoC for unknown -> proof_of_control_missing", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ wallet_type: "unknown" });
      await screenToPendingReview(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "proof_of_control_missing" });
    });

    it("13. pending_review (not yet whitelisted) -> destination_not_whitelisted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination();
      await screenToPendingReview(destinationId);
      await insertVerifiedPoc(destinationId);
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "destination_not_whitelisted" });
    });

    it("14. approved_pending_cooling, cooling not yet elapsed -> cooling_off_active", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(Date.now() + 3600_000) });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "cooling_off_active" });
    });

    it("15. a local-gate deny still emits exactly one wlt1.destination_use_evaluated audit row with the correct reason_code", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      await evaluateUse(destinationId);
      const rows = await auditRows(destinationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.metadata).toMatchObject({ decision: "deny", reason_code: "destination_revoked" });
    });
  });

  describe("P-ROSTER", () => {
    it("16. empty roster -> deny aml_subjects_unavailable, AML never called", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = clt1RosterOk([]);
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subjects_unavailable" });
    });

    it("17. >20 refs -> deny aml_subject_limit_exceeded, AML never called", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = clt1RosterOk(Array.from({ length: 21 }, (_, i) => `ap_${i}`));
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subject_limit_exceeded" });
    });

    it("17b. exactly 20 refs -> proceeds to AML (boundary is inclusive)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = clt1RosterOk(Array.from({ length: 20 }, (_, i) => `ap_${i}`));
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
    });

    it("18. non-2xx -> deny aml_subjects_unavailable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = makeClt1Fetch(() => ({ kind: "unavailable" }));
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subjects_unavailable" });
    });

    it("19. network error -> deny aml_subjects_unavailable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = makeClt1Fetch(() => ({ kind: "network_error" }));
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subjects_unavailable" });
    });

    it("20. malformed JSON -> deny aml_subjects_unavailable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = makeClt1Fetch(() => ({ kind: "malformed" }));
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subjects_unavailable" });
    });

    it("21. binding mismatch (wrong client_id echoed) -> deny aml_subjects_unavailable", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = makeClt1Fetch(() => ({ kind: "mismatch" }));
      mainConfig.aml1FetchImpl = aml1MustNotBeCalled();
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_subjects_unavailable" });
    });
  });

  describe("AML-01", () => {
    it("22. allow -> 200, decision allow, response shape exact", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.decision).toBe("allow");
      expect(data.destination_id).toBe(destinationId);
      expect(data.client_id).toBe(OWNED_CLIENT_ID);
      expect(data.requested_action).toBe("destination_use");
      expect(data.decision_id).toMatch(DECISION_ID_REGEX);
      expect(data.decision_token).toMatch(RAW_TOKEN_REGEX);
      expect(data.aml_decision_id).toMatch(/^aml1ptd_[0-9a-f-]{36}$/);
      expect(Date.parse(data.issued_at_utc)).not.toBeNaN();
      expect(Date.parse(data.expires_at_utc)).not.toBeNaN();
    });

    it("23. review -> deny aml_not_allowed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "review" }));
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_not_allowed" });
    });

    it("24. deny -> deny aml_not_allowed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "deny" }));
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_not_allowed" });
    });

    it("25. non-2xx -> 503 WLT1_AML_GATE_UNAVAILABLE, no decision row inserted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "unavailable" }));
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_AML_GATE_UNAVAILABLE");
      expect(await decisionRows(destinationId)).toHaveLength(0);
    });

    it("26. network error -> 503 WLT1_AML_GATE_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "network_error" }));
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_AML_GATE_UNAVAILABLE");
    });

    it("27. malformed JSON -> 503 WLT1_AML_GATE_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "malformed" }));
      const res = await evaluateUse(destinationId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_AML_GATE_UNAVAILABLE");
    });
  });

  describe("decision token + decision row persistence", () => {
    it("28. token_hash in the DB equals sha256(raw token); the raw token itself is never stored", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId);
      const rawToken = res.json().data.decision_token;
      const rows = await decisionRows(destinationId);
      expect(rows).toHaveLength(1);
      const { createHash } = await import("node:crypto");
      expect(rows[0]!.token_hash).toBe(createHash("sha256").update(rawToken, "utf8").digest("hex"));
      const allColumnsJson = JSON.stringify(rows[0]);
      expect(allColumnsJson).not.toContain(rawToken);
    });

    it("29. the raw decision_token never appears in any audit payload", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId);
      const rawToken = res.json().data.decision_token;
      const rows = await auditRows(destinationId);
      for (const row of rows) {
        expect(JSON.stringify(row.payload)).not.toContain(rawToken);
      }
    });

    it("30. decision row binding fields are exact (destination_id, client_id, requested_action, decision, status, chain, network, aml_decision_id, screening_result_id)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const expectedScreeningResultId = await latestScreeningResultId(destinationId);
      const res = await evaluateUse(destinationId);
      const data = res.json().data;
      const rows = await decisionRows(destinationId);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.decision_id).toBe(data.decision_id);
      expect(row.destination_id).toBe(destinationId);
      expect(row.client_id).toBe(OWNED_CLIENT_ID);
      expect(row.requested_action).toBe("destination_use");
      expect(row.decision).toBe("allow");
      expect(row.status).toBe("issued");
      expect(row.chain).toBe("ethereum");
      expect(row.network).toBe("mainnet");
      expect(row.aml_decision_id).toBe(data.aml_decision_id);
      expect(row.screening_result_id).toBe(expectedScreeningResultId);
    });
  });

  describe("PoC Evidence-ID Addendum", () => {
    it("31. hosted wallet, ZERO wlt1.proof_of_control rows ever -> allow succeeds, poc_challenge_id persisted as NULL", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      const pocCountBefore = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
      expect(pocCountBefore.rows[0].n).toBe(0);
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const rows = await decisionRows(destinationId);
      expect(rows[0]!.poc_challenge_id).toBeNull();
    });

    it("32. unhosted wallet with verified PoC -> allow succeeds, poc_challenge_id persisted as the GENUINE verified challenge_id", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ wallet_type: "unhosted" });
      await screenToPendingReview(destinationId);
      const challengeId = await insertVerifiedPoc(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const rows = await decisionRows(destinationId);
      expect(rows[0]!.poc_challenge_id).toBe(challengeId);
    });

    it("33. unknown wallet with verified PoC -> allow succeeds, poc_challenge_id persisted as the GENUINE verified challenge_id", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ wallet_type: "unknown" });
      await screenToPendingReview(destinationId);
      const challengeId = await insertVerifiedPoc(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const rows = await decisionRows(destinationId);
      expect(rows[0]!.poc_challenge_id).toBe(challengeId);
    });

    it("34. no synthetic/placeholder poc_challenge_id ever appears — the hosted-wallet NULL is a genuine SQL NULL, never a string", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ walletType: "hosted" });
      await evaluateUse(destinationId);
      const rows = await decisionRows(destinationId);
      for (const placeholder of ["not_applicable", "hosted", "00000000-0000-0000-0000-000000000000", "n/a", "none"]) {
        expect(rows[0]!.poc_challenge_id).not.toBe(placeholder);
      }
      expect(rows[0]!.poc_challenge_id).toBeNull();
    });
  });

  describe("TTL/expiry formula", () => {
    it("35. expires_at_utc = issued_at_utc + configured TTL when TTL is the binding minimum", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId);
      const data = res.json().data;
      const issuedAt = Date.parse(data.issued_at_utc);
      const expiresAt = Date.parse(data.expires_at_utc);
      expect(expiresAt - issuedAt).toBe(DECISION_TOKEN_TTL_MINUTES * 60_000);
    });

    it("36. expires_at_utc = aml.valid_until_utc when AML validity is the binding (sooner) minimum", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const shortAmlValidUntil = new Date(Date.now() + 60_000); // 1 minute — sooner than the 5-minute TTL
      mainConfig.aml1FetchImpl = makeAml1Fetch(() => ({ kind: "allow", overrides: { valid_until_utc: shortAmlValidUntil.toISOString() } }));
      const res = await evaluateUse(destinationId);
      const data = res.json().data;
      expect(Math.abs(Date.parse(data.expires_at_utc) - shortAmlValidUntil.getTime())).toBeLessThan(1000);
    });

    it("37. expires_at_utc = screening.valid_until_utc when screening validity is the binding (sooner) minimum", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const shortScreeningValidUntil = new Date(Date.now() + 30_000); // 30s — sooner than TTL and AML validity
      await setLatestScreening(destinationId, "clear", shortScreeningValidUntil.toISOString());
      const res = await evaluateUse(destinationId);
      const data = res.json().data;
      expect(Math.abs(Date.parse(data.expires_at_utc) - shortScreeningValidUntil.getTime())).toBeLessThan(1000);
    });

    it("38. AML valid_until_utc genuinely still in the future when AML validated it (nowA) but already at/before TX-B's own nowB -> deny evidence_expiring, NO decision row inserted, NO promotion performed", async () => {
      if (!schemaReady) return;
      // The AML client's OWN validation (`lib/aml1-client.ts`) checks `valid_until_utc > nowA` — the
      // authoritative instant captured at the START of TX-A, before P-ROSTER/AML are even called.
      // `valid_until_utc` is pinned to the database's own clock read INSIDE the AML stub callback
      // (never the test process's `Date.now()`, and never an untested millisecond-scale guess — a
      // bare "a moment after nowA" value is NOT reliably later than nowA at millisecond resolution
      // on a fast local stub round trip, which was observed to intermittently tie exactly with nowA
      // and flip this test's outcome). An explicit sleep is inserted in the P-ROSTER callback BEFORE
      // that clock read (guaranteeing it is comfortably later than nowA) and a second explicit sleep
      // is inserted in the AML callback AFTER that clock read but BEFORE returning (guaranteeing
      // TX-B's own later `SELECT now()` — nowB — is comfortably later still). This makes the ordering
      // deterministic rather than dependent on how fast the surrounding stub round trips happen to
      // run. Never reachable by tightening screening's own valid_until_utc instead — TX-B's own
      // local-gate re-check would catch that as `screening_stale` -> `state_changed_during_evaluation`
      // before the expiry-formula code is ever reached.
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const { destinationId } = await usableDestination({ status: "approved_pending_cooling" });
      const before = await destinationRow(destinationId);
      mainConfig.clt1FetchImpl = makeClt1Fetch(async () => {
        await sleep(75);
        return { kind: "ok", refs: ["ap_1"] };
      });
      mainConfig.aml1FetchImpl = makeAml1Fetch(async () => {
        const dbNow = await verifyPool.query<{ now_utc: string }>(`SELECT now() AS now_utc`);
        const dbNowMs = new Date(dbNow.rows[0]!.now_utc).getTime();
        await sleep(75);
        return { kind: "allow", overrides: { evaluated_at_utc: new Date(dbNowMs - 1000).toISOString(), valid_until_utc: new Date(dbNowMs).toISOString() } };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "evidence_expiring" });
      expect(await decisionRows(destinationId)).toHaveLength(0);
      const after = await destinationRow(destinationId);
      expect(after.status).toBe(before.status);
      expect(after.destination_status_version).toBe(before.destination_status_version);
      expect(after.whitelist_version).toBe(before.whitelist_version);
    });
  });

  describe("lazy active promotion", () => {
    it("39. approved_pending_cooling + cooling elapsed -> promotes to active; destination_status_version +1, whitelist_version +1, revocation_epoch unchanged", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ status: "approved_pending_cooling" });
      const before = await destinationRow(destinationId);
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const after = await destinationRow(destinationId);
      expect(after.status).toBe("active");
      expect(after.destination_status_version).toBe(before.destination_status_version + 1);
      expect(after.whitelist_version).toBe(before.whitelist_version + 1);
      expect(after.revocation_epoch).toBe(before.revocation_epoch);
    });

    it("40. the persisted decision row's version fields reflect the POST-promotion versions, not the pre-promotion snapshot", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ status: "approved_pending_cooling" });
      const before = await destinationRow(destinationId);
      await evaluateUse(destinationId);
      const rows = await decisionRows(destinationId);
      expect(rows[0]!.destination_status_version).toBe(before.destination_status_version + 1);
      expect(rows[0]!.whitelist_version).toBe(before.whitelist_version + 1);
    });

    it("41. already active -> destination row is completely unchanged (no promotion write at all)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ status: "active" });
      const before = await destinationRow(destinationId);
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const after = await destinationRow(destinationId);
      expect(after).toEqual(before);
    });

    it("42. forced audit failure rolls back the ENTIRE TX-B — no promotion, no decision row; retry succeeds once ACL is restored", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination({ status: "approved_pending_cooling" });
      const before = await destinationRow(destinationId);
      await withOutboxAclLock(privateDbUrl, async () => {
        await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
        try {
          const res = await evaluateUse(destinationId);
          expect(res.statusCode).toBe(503);
          expect(res.json().error.code).toBe("WLT1_AUDIT_REQUIRED");
        } finally {
          await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
        }
      });
      const afterFailedAttempt = await destinationRow(destinationId);
      expect(afterFailedAttempt).toEqual(before);
      expect(await decisionRows(destinationId)).toHaveLength(0);

      const retry = await evaluateUse(destinationId);
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.decision).toBe("allow");
      expect(await decisionRows(destinationId)).toHaveLength(1);
    }, 30_000);

    it("43. allow audit (wlt1.destination_use_evaluated) is emitted atomically with the decision row insert — both present after 200", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId);
      expect(res.json().data.decision).toBe("allow");
      const rows = await auditRows(destinationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.metadata).toMatchObject({ decision: "allow", decision_id: res.json().data.decision_id });
      expect(await decisionRows(destinationId)).toHaveLength(1);
    });
  });

  describe("TOCTOU — mutation injected strictly BETWEEN TX-A's read and TX-B's locked re-check (inside the P-ROSTER/AML stub callback)", () => {
    it("44. destination revoked strictly between TX-A and TX-B (injected inside the P-ROSTER callback) -> deny state_changed_during_evaluation, no decision row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.clt1FetchImpl = makeClt1Fetch(async () => {
        await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
        return { kind: "ok", refs: ["ap_1"] };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "state_changed_during_evaluation" });
      expect(await decisionRows(destinationId)).toHaveLength(0);
    });

    it("45. screening becomes adverse strictly between TX-A and TX-B (injected inside the AML callback) -> deny state_changed_during_evaluation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(async () => {
        await setLatestScreening(destinationId, "high_risk", new Date(Date.now() + 3600_000).toISOString());
        return { kind: "allow" };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "state_changed_during_evaluation" });
      expect(await decisionRows(destinationId)).toHaveLength(0);
    });

    it("46. destination_status_version drifts (unrelated concurrent mutation) strictly between TX-A and TX-B -> deny state_changed_during_evaluation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(async () => {
        await verifyPool.query(`UPDATE wlt1.destination SET destination_status_version = destination_status_version + 1 WHERE destination_id = $1`, [destinationId]);
        return { kind: "allow" };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "state_changed_during_evaluation" });
    });

    it("47. required PoC becomes unavailable strictly between TX-A and TX-B (unhosted) -> deny state_changed_during_evaluation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ wallet_type: "unhosted" });
      await screenToPendingReview(destinationId);
      await insertVerifiedPoc(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'active' WHERE destination_id = $1`, [destinationId]);
      mainConfig.aml1FetchImpl = makeAml1Fetch(async () => {
        await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
        return { kind: "allow" };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "state_changed_during_evaluation" });
    });

    it("48. a NEWER (but still clear) screening result strictly between TX-A and TX-B is ALSO drift, never silently re-approved", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      mainConfig.aml1FetchImpl = makeAml1Fetch(async () => {
        await verifyPool.query(
          `INSERT INTO wlt1.wallet_screening_result
             (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, provider_result_id, chain, network, address_hash,
              risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref, issued_at_utc, valid_until_utc)
           SELECT 'wlt1screen_toctou48_' || gen_random_uuid(), destination_id, screening_result_version + 1, provider_id, provider_adaptor_version, 'presult_toctou48_' || gen_random_uuid(),
                  chain, network, address_hash, 'clear', risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref, now(), now() + interval '1 hour'
             FROM wlt1.wallet_screening_result WHERE destination_id = $1 ORDER BY screening_result_version DESC LIMIT 1`,
          [destinationId],
        );
        return { kind: "allow" };
      });
      const res = await evaluateUse(destinationId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "state_changed_during_evaluation" });
    });
  });

  describe("audit content — no PII/token leakage", () => {
    it("49. deny audit payload contains no internal-service token of any module", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      await evaluateUse(destinationId);
      const rows = await auditRows(destinationId);
      for (const row of rows) {
        const json = JSON.stringify(row.payload);
        expect(json).not.toContain(mainConfig.wlt1InternalServiceToken);
        expect(json).not.toContain(mainConfig.aml1InternalServiceToken);
        expect(json).not.toContain(mainConfig.clt1InternalServiceToken);
      }
    });
  });

  describe("L-1 remediation: amount MUST be a JSON string — a JSON number is rejected before Ajv coercion can alter its precision", () => {
    it("50. amount as a JSON number (40) -> 400 VALIDATION_ERROR, never coerced/accepted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: 40 });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("51. high-precision amount as a JSON number (1.123456789012345678) -> 400, and the decision is NEVER bound to the IEEE-754-corrupted value '1.123456789012345700'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: 1.123456789012345678 });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
      // No decision was ever issued for this destination carrying the corrupted value.
      const rows = await verifyPool.query(`SELECT amount::text AS a FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows.map((r) => r.a)).not.toContain("1.123456789012345700");
      expect(rows.rows).toHaveLength(0);
    });

    it("52. amount as a JSON string \"40\" -> accepted, reaches normal validation/business logic unaffected", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: "40" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
    });

    it("53. amount as a JSON string \"1.123456789012345678\" (full 18dp) -> accepted and bound EXACTLY, no precision loss", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: "1.123456789012345678" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      const row = await verifyPool.query(`SELECT amount::text AS a FROM wlt1.destination_decision WHERE decision_id = $1`, [res.json().data.decision_id]);
      expect(row.rows[0].a).toBe("1.123456789012345678");
    });

    it("54. a 19-decimal STRING amount remains rejected (grammar, unaffected by this remediation)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: "1.1234567890123456789" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("55. exponent-notation numeric amount (1e21) remains rejected — String(1e21) = '1e+21' fails the amount grammar even after coercion", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const res = await evaluateUse(destinationId, { amount: 1e21 });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("56. a JSON number amount writes NO destination_decision row, NO limit_evaluation row, and NO audit — rejected before any business logic runs", async () => {
      if (!schemaReady) return;
      const { destinationId } = await usableDestination();
      const beforeDecisions = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
      const beforeEval = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE destination_id = $1`, [destinationId]);
      const beforeAudit = await auditRows(destinationId);

      const res = await evaluateUse(destinationId, { amount: 40 });
      expect(res.statusCode).toBe(400);

      const afterDecisions = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
      const afterEval = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation WHERE destination_id = $1`, [destinationId]);
      const afterAudit = await auditRows(destinationId);

      expect(Number(afterDecisions.rows[0].n)).toBe(Number(beforeDecisions.rows[0].n));
      expect(Number(afterEval.rows[0].n)).toBe(Number(beforeEval.rows[0].n));
      expect(afterAudit.length).toBe(beforeAudit.length);
    });
  });
});
