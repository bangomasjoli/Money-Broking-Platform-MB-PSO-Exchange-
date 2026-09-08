/**
 * WLT-01 Phase 2C-C2/2C-C3 — `POST /internal/wlt1/wallet-destinations/:destination_id/screen`
 * route-level integration tests. Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Connects as `role_wlt1_runtime` via a real LOGIN role from the start (never superuser-only —
 * same discipline `wlt1-db.test.ts` established). Uses the SHARED canonical test database, not a
 * private disposable one — this route has no migration-runner concerns of its own.
 *
 * WHERE POSSIBLE, THE REAL STUB PROVIDER IS USED, NOT INJECTED: the seven accepted Gate 2C-A-1
 * fixture addresses (`WLT1_TEST_STUB_ADDRESS_*`) are genuine canonicalisation-valid addresses on
 * their real chain/network — registering a destination with one of them and calling `/screen`
 * exercises the REAL server-side provider-resolution path (chain_coverage -> registry) end to
 * end, not a mocked shortcut. `config.screeningProviderImpl` injection is reserved for the small
 * number of tests that need call-counting, transaction-depth instrumentation, or
 * provider/adaptor-drift simulation, where a real network-bound provider cannot provide a
 * deterministic proof.
 *
 * GO-LIVE NOTE (Phase 2C-C3 update): the C2-era "C2 DEAD-END" describe block below has been
 * replaced by "Phase 2C-C3 — dead-end removed" — a destination stuck in `pending_screening` after
 * a provider `unavailable`/`invalid_response` outcome (or any process failure after TX-1 commit)
 * is now recoverable: a NEW `Idempotency-Key` submitted 30+ seconds after the pending row's last
 * claim timestamp reuses the SAME `screening_result_id`/`screening_result_version` and invokes the
 * provider again. The COOLDOWN BOUNDARY IS TESTED DETERMINISTICALLY by rewriting
 * `wallet_screening_result.updated_at_utc` directly via the privileged `verifyPool` connection —
 * never a real 30-second `sleep`. The only two exceptions (deliberately fail-closed, not bugs) are
 * provider-identity drift and adaptor-version drift since initiation — both tested explicitly
 * below. `/screen` therefore remains TEST-REACHABLE but is still explicitly NOT GO-LIVE READY for
 * reasons unrelated to the C2 dead-end (see the WLT-01 implementation notes for the current
 * go-live blocker list).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { closePool, initPool, getPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import {
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
  WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
  WLT1_TEST_STUB_ADDRESS_HIT,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  WLT1_TEST_STUB_ADDRESS_MALFORMED,
  WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY,
  stubProvider,
  STUB_PROVIDER_ID,
  STUB_ADAPTOR_VERSION,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput, WalletScreeningOutcome } from "../../services/wlt1/src/lib/providers/types.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_screening_route_test";

/** P2CC2-MED-1 remediation: every destination fixture in this file is created under this SAME
 * `client_id` (confirmed absent from `wlt1-db.test.ts`'s own client_id vocabulary) — cleanup
 * below is scoped to exactly this value, never a global table-wide DELETE, so this file can never
 * destroy another file's concurrently-created fixtures when Vitest schedules both files in
 * parallel against the shared canonical database. */
const OWNED_CLIENT_ID = "clt1client_screenroute";

/** Used only by the P2CC2-MED-1 deterministic sentinel proof below for a hand-inserted foreign
 * owner's `wallet_destination` row — never passed through canonicalisation (the row is inserted
 * directly, not through the registration route), so any well-formed-looking, distinct string is
 * sufficient; `canonical_address` carries no CHECK constraint (migration 049). */
const ETH_SENTINEL_ADDRESS = "0x1111111111111111111111111111111111111B";

function baseConfig(overrides: Partial<Wlt1Config> = {}): Wlt1Config {
  return {
    environment: "dev",
    databaseUrl: TEST_DB ?? "postgres://unused",
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-screenroute-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: "stub-wallet-analytics-v1",
    screeningMaxValidityHours: 720,
    ...overrides,
  };
}

/** CLT-01 client-status stub — own copy, F3(c), never imported from services/clt1/**. Always
 * reports the client as `active` (this file is not testing CLT-01 gating; that is `wlt1-db.test.ts`'s
 * own coverage). */
const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance; // main app, 720h ceiling, real stub provider
let mainConfig: Wlt1Config;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result') AS n`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

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

  mainConfig = baseConfig({ clt1FetchImpl: clt1ActiveFetch });
  app = await buildApp(mainConfig);
});

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
});

/** P2CC2-MED-1 remediation: FK-safe, OWNED_CLIENT_ID-scoped cleanup — every DELETE below carries
 * a `WHERE` clause that can only ever touch rows this file itself created, never another
 * concurrently-running file's fixtures on the same shared database. */
async function cleanupOwnedFixtures(): Promise<void> {
  await verifyPool.query(
    `DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
    [OWNED_CLIENT_ID],
  );
  await verifyPool.query(
    `DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
    [OWNED_CLIENT_ID],
  );
  await verifyPool.query(
    `DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
    [OWNED_CLIENT_ID],
  );
  await verifyPool.query(
    `DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
    [OWNED_CLIENT_ID],
  );
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
}

afterEach(async () => {
  if (!schemaReady) return;
  mainConfig.screeningProviderImpl = undefined;
  await cleanupOwnedFixtures();
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(
  targetApp: FastifyInstance,
  opts: { chain: string; network: string; address: string; walletType?: "hosted" | "unhosted" | "unknown" },
): Promise<{ destinationId: string }> {
  const res = await targetApp.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": (targetApp.config as Wlt1Config).wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: {
      client_id: OWNED_CLIENT_ID,
      chain: opts.chain,
      network: opts.network,
      address: opts.address,
      wallet_type: opts.walletType ?? "unhosted",
      beneficiary_relationship: "self",
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  }
  return { destinationId: res.json().data.destination_id };
}

/** Identical to `registerDestination` but under a CALLER-SUPPLIED `client_id` — used only by the
 * GAP-1 "same address, different destination" correlation proof below, which needs a genuinely
 * different client so the natural-key uniqueness backstop (which folds `client_id` in) does not
 * treat the second registration as a duplicate of the first. */
async function registerDestinationForClient(
  targetApp: FastifyInstance,
  clientId: string,
  opts: { chain: string; network: string; address: string; walletType?: "hosted" | "unhosted" | "unknown" },
): Promise<{ destinationId: string }> {
  const res = await targetApp.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": (targetApp.config as Wlt1Config).wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: {
      client_id: clientId,
      chain: opts.chain,
      network: opts.network,
      address: opts.address,
      wallet_type: opts.walletType ?? "unhosted",
      beneficiary_relationship: "self",
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  }
  return { destinationId: res.json().data.destination_id };
}

function screen(targetApp: FastifyInstance, destinationId: string, idempotencyKey: string): Promise<{ statusCode: number; body: any }> {
  return targetApp
    .inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
      headers: { "x-internal-service-token": (targetApp.config as Wlt1Config).wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
      payload: {},
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

async function fetchDestinationStatus(destinationId: string): Promise<{ status: string; destination_status_version: number }> {
  const r = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  return r.rows[0];
}

async function fetchScreeningRow(screeningResultId: string) {
  const r = await verifyPool.query(
    `SELECT risk_status, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, issued_at_utc, valid_until_utc
       FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
    [screeningResultId],
  );
  return r.rows[0];
}

async function realWalletDestinationAddressHash(destinationId: string): Promise<string> {
  const r = await verifyPool.query(`SELECT address_hash FROM wlt1.wallet_destination WHERE destination_id = $1`, [destinationId]);
  return r.rows[0]?.address_hash;
}

async function auditCountFor(screeningResultId: string, eventType: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`, [
    eventType,
    screeningResultId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Phase 2C-C2: POST /internal/wlt1/wallet-destinations/:destination_id/screen", () => {
  // -----------------------------------------------------------------------------------------
  describe("route surface / auth / body", () => {
    it("missing internal-service-token is rejected (401), never reaches idempotency/DB", async () => {
      // H-D3C-1: this is the ONE fail-loud canary in this file — mirrors the established
      // aml1/cfg1/fnd/iam/iam2/sec1 pattern. Every OTHER test's own `if (!schemaReady) return;`
      // still self-skips silently (unchanged, benign when TEST_DATABASE_URL is genuinely unset),
      // but a genuine schema/role/grant setup failure with a real TEST_DATABASE_URL supplied must
      // fail this one test loudly instead of letting the whole file silently pass.
      if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`, payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it("wrong internal-service-token is rejected (401)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
        headers: { "x-internal-service-token": "wrong-token", "idempotency-key": freshKey() },
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it("valid token + empty {} body + Idempotency-Key is accepted (200/202, never a validation error)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect([200, 202]).toContain(res.statusCode);
    });

    it("an unknown/extra body field is rejected (400 VALIDATION_ERROR, additionalProperties:false)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK });
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: { provider_id: "attacker-chosen-provider" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("every conceivable caller-supplied override field is rejected by the empty-body schema", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIT });
      for (const bogus of [
        { provider_id: "x" },
        { scenario: "clear" },
        { risk_status: "clear" },
        { screening_max_validity_hours: 876000 },
        { chain: "ethereum" },
        { network: "mainnet" },
        { address_hash: "sha256:forged" },
        { screening_result_version: 99 },
        { issued_at_utc: "2026-01-01T00:00:00Z" },
        { valid_until_utc: "2099-01-01T00:00:00Z" },
        { payload_hash: "sha256:forged" },
      ]) {
        const res = await app.inject({
          method: "POST",
          url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
          headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
          payload: bogus,
        });
        expect(res.statusCode, `expected 400 for ${JSON.stringify(bogus)}`).toBe(400);
      }
    });

    it("missing Idempotency-Key is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await app.inject({
        method: "POST",
        url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("a nonexistent destination_id returns WLT1_DESTINATION_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await screen(app, "wlt1dest_" + randomUUID(), freshKey());
      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("terminal outcomes (200) — real stub provider, all four risk statuses", () => {
    it("clear: 200, destination pending_review, safe response shape, requested audit exactly once", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toMatchObject({ destination_id: destinationId, destination_status: "pending_review", risk_status: "clear" });
      expect(res.body.data.screening_result_version).toBe(1);
      expect(typeof res.body.data.valid_until_utc).toBe("string");
      expect(Object.keys(res.body.data).sort()).toEqual(["destination_id", "destination_status", "risk_status", "screening_result_id", "screening_result_version", "valid_until_utc"].sort());

      const destStatus = await fetchDestinationStatus(destinationId);
      expect(destStatus.status).toBe("pending_review");
      expect(await auditCountFor(res.body.data.screening_result_id, "wlt1.wallet_screening_requested")).toBe(1);
      expect(await auditCountFor(res.body.data.screening_result_id, "wlt1.wallet_screening_completed")).toBe(1);
    });

    it("review_required: 200, pending_review", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.risk_status).toBe("review_required");
    });

    it("high_risk: 200, pending_review, high_risk_detected audit fired", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.risk_status).toBe("high_risk");
      expect(await auditCountFor(res.body.data.screening_result_id, "wlt1.wallet_high_risk_detected")).toBe(1);
    });

    it("hit (sanctions): 200, pending_review, sanctions_exposure audit fired", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIT });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.risk_status).toBe("hit");
      expect(await auditCountFor(res.body.data.screening_result_id, "wlt1.wallet_sanctions_exposure")).toBe(1);
    });

    it("200 response never contains canonical address, address_hash, provider_result_id, risk_score, exposure, cluster_ref, or sanctions detail", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIT });
      const res = await screen(app, destinationId, freshKey());
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(WLT1_TEST_STUB_ADDRESS_HIT);
      expect(serialized).not.toMatch(/risk_score|risk_categories|direct_exposure|indirect_exposure|cluster_ref|sanctions_exposure|provider_result_id|address_hash/);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("pending outcomes (202) — provider unavailable / invalid_response, real stub fixtures", () => {
    it("unavailable: 202, provider_attempt='unavailable', bounded reason, screening/destination remain pending", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data).toMatchObject({
        destination_id: destinationId,
        destination_status: "pending_screening",
        risk_status: "pending",
        provider_attempt: "unavailable",
        reason_code: "provider_unavailable",
        retryable: true,
      });
      const destStatus = await fetchDestinationStatus(destinationId);
      expect(destStatus.status).toBe("pending_screening");
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.risk_status).toBe("pending");
      expect(screening.issued_at_utc).toBeNull();
    });

    it("invalid_response (malformed): 202, provider_attempt='invalid_response', bounded reason", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_MALFORMED });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.provider_attempt).toBe("invalid_response");
      expect(res.body.data.reason_code).toBe("provider_malformed_response");
    });

    it("invalid_response (unmapped category): 202, distinct bounded reason from malformed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.provider_attempt).toBe("invalid_response");
      expect(res.body.data.reason_code).toBe("unmapped_risk_category");
    });

    it("202 response contains no canonical address, address_hash, or provider raw data", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const res = await screen(app, destinationId, freshKey());
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(WLT1_TEST_STUB_ADDRESS_UNAVAILABLE);
    });

    it("an unrecognised provider reason code collapses to the generic bounded provider_error (never echoed raw)", async () => {
      if (!schemaReady) return;
      const injected: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(): Promise<WalletScreeningOutcome> {
          return { kind: "unavailable", reasonCode: "some_arbitrary_vendor_text_never_seen_before_12345" };
        },
      };
      mainConfig.screeningProviderImpl = injected;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.reason_code).toBe("provider_error");
      expect(JSON.stringify(res.body)).not.toContain("some_arbitrary_vendor_text_never_seen_before_12345");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("state machine — draft-only initiation; C3 resume for pending_screening", () => {
    it("pending_screening + NEW key WITHIN the 30s cooldown -> throttled 202 (never WLT1_DESTINATION_INVALID_STATE), no provider call, no new row/version/audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);

      // Phase 2C-C3: a NEW key immediately after initiation is still WELL WITHIN the 30s cooldown
      // (the pending row's updated_at_utc was just set at initiation) -> throttled, never
      // WLT1_DESTINATION_INVALID_STATE (that C2-era behavior is gone).
      const second = await screen(app, destinationId, freshKey());
      expect(second.statusCode).toBe(202);
      expect(second.body.data.provider_attempt).toBe("throttled");
      expect(second.body.data.reason_code).toBe("retry_cooldown_active");
      expect(second.body.data.retryable).toBe(true);
      expect(second.body.data.screening_result_id).toBe(first.body.data.screening_result_id);
      expect(second.body.data.screening_result_version).toBe(first.body.data.screening_result_version);

      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
      expect(await auditCountFor(first.body.data.screening_result_id, "wlt1.wallet_screening_requested")).toBe(1);
    });

    it("pending_review + NEW key -> WLT1_DESTINATION_INVALID_STATE (no rescreening)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(200);
      const second = await screen(app, destinationId, freshKey());
      expect(second.statusCode).toBe(409);
      expect(second.body.error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
    });

    it("revoked destination + NEW key -> WLT1_DESTINATION_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.body.error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
    });

    it("screening_result_version is MAX+1 under lock, never caller-influenced (proven at 1 for a fresh destination)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect(res.body.data.screening_result_version).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-C3 — the C2-era permanent dead-end is REMOVED. A destination stuck in
  // `pending_screening` is now recoverable via a NEW Idempotency-Key once the fixed 30-second
  // cooldown has elapsed since the pending row's last claim. Cooldown boundary tests below
  // rewrite `updated_at_utc` directly via the privileged `verifyPool` connection — never a real
  // 30-second sleep.
  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-C3 — dead-end removed: durable resume after the fixed 30s cooldown", () => {
    /** Rewrites the pending row's own claim clock to force cooldown eligibility deterministically
     * — the same privileged-connection technique already established throughout this file (e.g.
     * the P2CC2-MED-1 sentinel proofs) for manipulating fixture state no ordinary runtime grant
     * could reach. */
    async function forceCooldownEligible(screeningResultId: string): Promise<void> {
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);
    }
    async function forceCooldownActive(screeningResultId: string, secondsRemaining: number): Promise<void> {
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '1 second' * $2 WHERE screening_result_id = $1`, [
        screeningResultId,
        30 - secondsRemaining,
      ]);
    }

    it("unavailable outcome -> same key still rehydrates with NO provider re-invocation; a NEW key WITHIN cooldown is throttled with NO provider call; the SAME NEW key's cooldown-eligible successor invokes the provider again on the SAME row/version", async () => {
      if (!schemaReady) return;
      let callCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          callCount++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;

      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const keyA = freshKey("dead-end-a");

      const first = await screen(app, destinationId, keyA);
      expect(first.statusCode).toBe(202);
      expect(first.body.data.destination_status).toBe("pending_screening");
      expect(callCount).toBe(1);
      const screeningResultId = first.body.data.screening_result_id as string;

      // Same key A again — MUST rehydrate, MUST NOT call the provider again.
      const sameKeyReplay = await screen(app, destinationId, keyA);
      expect(sameKeyReplay.statusCode).toBe(202);
      expect(callCount).toBe(1);

      // A NEW key WITHIN the cooldown — MUST be throttled, MUST NOT call the provider.
      const keyB = freshKey("dead-end-b");
      const throttled = await screen(app, destinationId, keyB);
      expect(throttled.statusCode).toBe(202);
      expect(throttled.body.data.provider_attempt).toBe("throttled");
      expect(callCount).toBe(1);

      // Force cooldown eligibility deterministically, then a NEW key — MUST invoke the provider
      // again, on the SAME row/version, and MUST clear the destination this time.
      await forceCooldownEligible(screeningResultId);
      const clearingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen() {
          callCount++;
          return { kind: "screened", result: { providerResultId: "presult_c3_recover_" + randomUUID(), riskStatus: "clear", riskScore: 1, riskCategories: [], directExposure: [], indirectExposure: [], sanctionsExposure: false, clusterRef: null, issuedAtUtc: new Date().toISOString(), validUntilUtc: null } };
        },
      };
      mainConfig.screeningProviderImpl = clearingProvider;
      const keyC = freshKey("dead-end-c");
      const recovered = await screen(app, destinationId, keyC);
      expect(recovered.statusCode).toBe(200);
      expect(recovered.body.data.risk_status).toBe("clear");
      expect(recovered.body.data.screening_result_id).toBe(screeningResultId);
      expect(callCount).toBe(2);

      const finalStatus = await fetchDestinationStatus(destinationId);
      expect(finalStatus.status).toBe("pending_review");
    });

    it("cooldown boundary: <30s remains throttled, >=30s becomes eligible (deterministic DB-timestamp manipulation, no sleep)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;

      // Just under 30s remaining since the (forced) claim timestamp -> still throttled.
      await forceCooldownActive(screeningResultId, 0.5);
      const stillThrottled = await screen(app, destinationId, freshKey());
      expect(stillThrottled.statusCode).toBe(202);
      expect(stillThrottled.body.data.provider_attempt).toBe("throttled");

      // >=30s elapsed -> eligible; the next NEW key wins the claim and invokes the provider.
      await forceCooldownEligible(screeningResultId);
      const eligible = await screen(app, destinationId, freshKey());
      expect(eligible.statusCode).toBe(202);
      expect(eligible.body.data.provider_attempt).toBe("unavailable");
    });
  });

  // -----------------------------------------------------------------------------------------
  // P2CC2-HIGH-1 remediation — the pending-replay branch must never fabricate a provider outcome
  // it did not itself observe. Independent Opus review proved the prior implementation hardcoded
  // provider_attempt="unavailable" on EVERY replay, which was false after invalid_response, false
  // while the provider was still in flight, and false when no attempt had completed at all.
  // -----------------------------------------------------------------------------------------
  describe("P2CC2-HIGH-1 remediation — truthful pending-replay response (never a fabricated provider outcome)", () => {
    it("A. initial unavailable: 202, provider_attempt='unavailable', bounded reason_code present", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.provider_attempt).toBe("unavailable");
      expect(res.body.data.reason_code).toBe("provider_unavailable");
    });

    it("B. same-key replay after unavailable: 202, provider_attempt ABSENT, reason_code ABSENT, retryable true, no provider re-invocation", async () => {
      if (!schemaReady) return;
      let calls = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          calls++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const key = freshKey();
      const first = await screen(app, destinationId, key);
      expect(first.statusCode).toBe(202);
      expect(calls).toBe(1);

      const replay = await screen(app, destinationId, key);
      expect(replay.statusCode).toBe(202);
      expect(replay.body.data.retryable).toBe(true);
      expect("provider_attempt" in replay.body.data).toBe(false);
      expect("reason_code" in replay.body.data).toBe(false);
      expect(calls).toBe(1);
    });

    it("C. initial invalid_response: 202, provider_attempt='invalid_response', bounded reason_code present", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_MALFORMED });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.provider_attempt).toBe("invalid_response");
      expect(res.body.data.reason_code).toBe("provider_malformed_response");
    });

    it("D. same-key replay after invalid_response: 202, provider_attempt ABSENT, reason_code ABSENT — MUST NOT report 'unavailable' (the prior, fabricating implementation always did)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_MALFORMED });
      const key = freshKey();
      const first = await screen(app, destinationId, key);
      expect(first.statusCode).toBe(202);
      expect(first.body.data.provider_attempt).toBe("invalid_response");

      const replay = await screen(app, destinationId, key);
      expect(replay.statusCode).toBe(202);
      expect("provider_attempt" in replay.body.data).toBe(false);
      expect("reason_code" in replay.body.data).toBe(false);
      // Explicitly falsify the old defect: neither fabricated value may appear anywhere in the body.
      expect(JSON.stringify(replay.body.data)).not.toContain("unavailable");
      expect(JSON.stringify(replay.body.data)).not.toContain("invalid_response");
    });

    it("E. same-key replay while the provider is still in flight (no outcome exists yet): 202, provider_attempt ABSENT, reason_code ABSENT, exactly one provider invocation total, the original request may later terminally succeed", async () => {
      if (!schemaReady) return;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const slowProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          calls++;
          await barrier;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = slowProvider;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();

      const firstPromise = screen(app, destinationId, key);
      await new Promise((r) => setTimeout(r, 100)); // let TX-1 commit and the provider call begin
      const inFlightReplay = await screen(app, destinationId, key);
      expect(inFlightReplay.statusCode).toBe(202);
      expect("provider_attempt" in inFlightReplay.body.data).toBe(false);
      expect("reason_code" in inFlightReplay.body.data).toBe(false);
      expect(calls).toBe(1);

      release();
      const first = await firstPromise;
      expect(first.statusCode).toBe(200);
      expect(first.body.data.risk_status).toBe("clear");
      expect(calls).toBe(1);
      mainConfig.screeningProviderImpl = undefined;
    });

    it("F. generic pending replay never invents an attempt disposition, regardless of which provider outcome actually preceded it", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNMAPPED_CATEGORY });
      const key = freshKey();
      await screen(app, destinationId, key);
      const replay = await screen(app, destinationId, key);
      expect(Object.keys(replay.body.data).sort()).toEqual(["destination_id", "destination_status", "retryable", "risk_status", "screening_result_id", "screening_result_version"].sort());
    });

    it("G. terminal same-key replay is unchanged — still returns the current HTTP 200 terminal representation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();
      const first = await screen(app, destinationId, key);
      expect(first.statusCode).toBe(200);
      const replay = await screen(app, destinationId, key);
      expect(replay.statusCode).toBe(200);
      expect(replay.body.data.risk_status).toBe("clear");
      expect(replay.body.data.destination_status).toBe("pending_review");
    });

    it("H. 'screening_still_pending' no longer appears anywhere — it was never a real provider reason code", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const key = freshKey();
      await screen(app, destinationId, key);
      const replay = await screen(app, destinationId, key);
      expect(JSON.stringify(replay.body)).not.toContain("screening_still_pending");
    });

    it("I. the two 202 shapes are structurally exact — the observed shape never omits provider_attempt/reason_code, the replay shape never includes them (no partial/hybrid object)", async () => {
      if (!schemaReady) return;
      const observedDest = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const observed = await screen(app, observedDest.destinationId, freshKey());
      expect(Object.keys(observed.body.data).sort()).toEqual(
        ["destination_id", "destination_status", "provider_attempt", "reason_code", "retryable", "risk_status", "screening_result_id", "screening_result_version"].sort(),
      );

      const replayDest = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_MALFORMED });
      const key = freshKey();
      await screen(app, replayDest.destinationId, key);
      const replay = await screen(app, replayDest.destinationId, key);
      expect(Object.keys(replay.body.data).sort()).toEqual(["destination_id", "destination_status", "retryable", "risk_status", "screening_result_id", "screening_result_version"].sort());
    });
  });

  // -----------------------------------------------------------------------------------------
  // P2CC2-LOW-2 remediation — a test-injected provider implementation must never be able to
  // replace the authoritative provider identity that chain_coverage.provider_id establishes.
  // -----------------------------------------------------------------------------------------
  describe("P2CC2-LOW-2 remediation — provider identity is always chain-coverage-authoritative, never test-seam-supplied", () => {
    it("N. an injected provider implementation whose OWN providerId differs from chain_coverage.provider_id does NOT override the persisted provider_id", async () => {
      if (!schemaReady) return;
      const oddIdentityProvider: WalletAnalyticsProvider = {
        providerId: "totally-different-provider-id-injected-by-a-test",
        adaptorVersion: "99",
        async screen(input: WalletScreeningInput) {
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = oddIdentityProvider;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);

      const coverage = await verifyPool.query(`SELECT provider_id FROM wlt1.chain_coverage WHERE chain = 'ethereum' AND network = 'mainnet'`);
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.provider_id).toBe(coverage.rows[0].provider_id);
      expect(screening.provider_id).not.toBe("totally-different-provider-id-injected-by-a-test");
      mainConfig.screeningProviderImpl = undefined;
    });

    it("O. terminal application succeeds with provider-binding evidence bound to the SAME authoritative provider_id as the pending row — no mismatch is hidden by the injected identity", async () => {
      if (!schemaReady) return;
      const oddIdentityProvider: WalletAnalyticsProvider = {
        providerId: "another-fake-provider-id",
        adaptorVersion: "7",
        async screen(input: WalletScreeningInput) {
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = oddIdentityProvider;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK });
      const res = await screen(app, destinationId, freshKey());
      // If the row's provider_id and the terminal-application evidence's providerId ever
      // diverged, applyNormalizedScreeningResult's own P2CB provider-binding guard (2C-B) would
      // reject with WLT1_VENDOR_RESULT_INVALID — a 200 here proves they stayed consistent.
      expect(res.statusCode).toBe(200);
      expect(res.body.data.risk_status).toBe("high_risk");

      const coverage = await verifyPool.query(`SELECT provider_id FROM wlt1.chain_coverage WHERE chain = 'tron' AND network = 'mainnet'`);
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.provider_id).toBe(coverage.rows[0].provider_id);
      expect(screening.provider_adaptor_version).toBe("7"); // the injected implementation's OWN adaptor version — the one actually used
      mainConfig.screeningProviderImpl = undefined;
    });

    it("normal production registry behavior (no injection) is unchanged — provider_id/adaptor_version come from the real registry entry", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
      const res = await screen(app, destinationId, freshKey());
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.provider_id).toBe(STUB_PROVIDER_ID);
      expect(screening.provider_adaptor_version).toBe(STUB_ADAPTOR_VERSION);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("idempotency — same-key replay, cross-destination mismatch, correlation check", () => {
    it("same key replays the CURRENT terminal (200) state after a different path already applied it — no second provider call, no new audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();
      const first = await screen(app, destinationId, key);
      expect(first.statusCode).toBe(200);
      const replay = await screen(app, destinationId, key);
      expect(replay.statusCode).toBe(200);
      expect(replay.body.data.screening_result_id).toBe(first.body.data.screening_result_id);
      expect(replay.body.data.risk_status).toBe("clear");
      expect(await auditCountFor(first.body.data.screening_result_id, "wlt1.wallet_screening_requested")).toBe(1);
    });

    it("same key + a DIFFERENT destination_id deterministically conflicts (fingerprint mismatch)", async () => {
      if (!schemaReady) return;
      const a = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const b = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
      const key = freshKey();
      const first = await screen(app, a.destinationId, key);
      expect(first.statusCode).toBe(200);
      const second = await screen(app, b.destinationId, key);
      expect(second.statusCode).toBe(400);
      expect(second.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("provider resolution", () => {
    it("unsupported/inactive chain coverage fails BEFORE any row is created (WLT1_UNSUPPORTED_CHAIN)", async () => {
      if (!schemaReady) return;
      // Ethereum testnet has no chain_coverage row at all (only ethereum/mainnet + tron/mainnet
      // are seeded) — insert a destination directly with an unsupported (chain,network) pair,
      // since the registration route itself would already refuse this organically.
      const destinationId = "wlt1dest_screenroute_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'draft')`, [
        destinationId,
        OWNED_CLIENT_ID,
        "hash_" + randomUUID(),
      ]);
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'testnet', $2, $3, 'v1', 'unhosted', 'self')`,
        [destinationId, WLT1_TEST_STUB_ADDRESS_CLEAR, "addrhash_" + randomUUID()],
      );
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.body.error.code).toBe("WLT1_UNSUPPORTED_CHAIN");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows[0].n).toBe(0);
      const destStatus = await fetchDestinationStatus(destinationId);
      expect(destStatus.status).toBe("draft");
      await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    // M-D3B-2 remediation (Phase 2C-D3C): the "unknown provider registry id named by
    // chain_coverage fails closed" test formerly here has MOVED to
    // `wlt1-screening-route-private.test.ts` — it mutated the globally shared
    // `wlt1.chain_coverage` (ethereum, mainnet) row on the SHARED canonical database, which a
    // concurrently-running bystander request (e.g. the provider-receipt route's own
    // `createRealPendingScreening()`) could observe mid-mutation, causally proven to intermittently
    // fail closed with `WLT1_SERVICE_UNAVAILABLE` under default file-parallel execution. Same
    // assertions, same control purpose, now against a private disposable database.

    it("the caller cannot choose a provider — the pending row's provider_id/adaptor_version are server-resolved from chain_coverage, matching the real stub", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK });
      const res = await screen(app, destinationId, freshKey());
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.provider_id).toBe(STUB_PROVIDER_ID);
      expect(screening.provider_adaptor_version).toBe(STUB_ADAPTOR_VERSION);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("real address_hash copy — through the actual registration route, byte-identical into the screening row", () => {
    it("registers via the real route, then /screen copies wallet_destination.address_hash byte-for-byte (71 characters)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const realHash = await realWalletDestinationAddressHash(destinationId);
      expect(realHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(realHash.length).toBe(71);

      const res = await screen(app, destinationId, freshKey());
      const screening = await fetchScreeningRow(res.body.data.screening_result_id);
      expect(screening.address_hash).toBe(realHash);
    });
  });

  // -----------------------------------------------------------------------------------------
  // The two outbox-ACL-REVOKE L3 audit-failure tests that used to live here ("forced outbox
  // INSERT denial during TX-1..." / "provider returns screened, but the terminal-application audit
  // fails...") were MOVED to tests/integration/wlt1-outbox-acl-private.test.ts's own "route-level
  // L3 audit atomicity" describe block — `role_wlt1_runtime` is the SAME runtime role shared by
  // this file, `wlt1-db.test.ts`, and `wlt1-screening-application.test.ts`, all running
  // concurrently against this SAME shared canonical database; the REVOKE these two tests performed
  // could (and, once observed empirically, did) starve an ordinary bystander request from one of
  // those sibling files during the revoke window, even with every ACL MUTATOR correctly serialized
  // behind the shared advisory lock. Moving both tests onto their own private, disposable database
  // removes that exposure entirely without weakening either test's assertions. See
  // wlt1-outbox-acl-private.test.ts's own file header for the full rationale.

  // -----------------------------------------------------------------------------------------
  describe("provider call transaction depth 0", () => {
    it("the provider is invoked only after TX-1's connection has been released back to the pool (zero checked-out connections at invocation time)", async () => {
      if (!schemaReady) return;
      let idleAtInvocation = -1;
      let totalAtInvocation = -1;
      const instrumentedProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          const pool = getPool();
          idleAtInvocation = pool.idleCount;
          totalAtInvocation = pool.totalCount;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = instrumentedProvider;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      // Every pool connection was idle (none checked out) at the instant the provider was
      // invoked — proving TX-1's own connection had already been committed and released.
      expect(idleAtInvocation).toBeGreaterThan(-1);
      expect(idleAtInvocation).toBe(totalAtInvocation);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("concurrency", () => {
    it("two concurrent FIRST-TIME requests (different keys) against the same draft destination: exactly one wins, exactly one pending row/version/requested-audit/provider-call", async () => {
      if (!schemaReady) return;
      let providerCallCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          providerCallCount++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });

      // Deterministic barrier: hold the SAME advisory lock namespace on an independent connection
      // first, launch both requests, then release — forcing them to serialize through the exact
      // lock `/screen` itself takes (mirrors CLT-01's own advisory-lock barrier precedent, never
      // sleep-based timing).
      const barrierClient = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      const barrierConn = await barrierClient.connect();
      await barrierConn.query("BEGIN");
      await barrierConn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);

      const keyA = freshKey("race-a");
      const keyB = freshKey("race-b");
      const p1 = screen(app, destinationId, keyA);
      const p2 = screen(app, destinationId, keyB);
      // Give both requests a moment to reach (and block on) the advisory lock before releasing it.
      await new Promise((r) => setTimeout(r, 50));
      await barrierConn.query("COMMIT");
      barrierConn.release();
      await barrierClient.end();

      const [r1, r2] = await Promise.all([p1, p2]);
      const winner = [r1, r2].find((r) => r.statusCode === 200);
      const loser = [r1, r2].find((r) => r !== winner);
      expect(winner, "exactly one request must win with 200").toBeDefined();
      // Phase 2C-C3 widened the loser's possible outcome: the SECOND request's own transaction
      // acquires the SAME destination advisory lock only after the FIRST request's TX-1 commits
      // (releasing it) — by then the destination is already `pending_screening`. Depending on
      // exactly how far the FIRST request's own async terminal-application step (which takes the
      // identical lock again, per screening-application.ts) has progressed by the time the SECOND
      // request's lock-wait resolves, the loser legitimately observes EITHER:
      //   - destination still `pending_screening` -> Phase 2C-C3 resume path -> throttled 202
      //     (the pending row's updated_at_utc was just set by the winner, well within the 30s
      //     cooldown); or
      //   - destination already `pending_review` (winner's terminal application finished first)
      //     -> WLT1_DESTINATION_INVALID_STATE 409 (unchanged C2 behaviour for a non-draft,
      //     non-pending_screening state).
      // Both are correct, non-amplifying outcomes of the SAME race — the invariants that actually
      // matter (exactly one screening row ever created, exactly one provider call ever made, no
      // second row/version) are asserted directly below regardless of which branch fired.
      expect(loser, "exactly one request must NOT win with 200").toBeDefined();
      if (loser!.statusCode === 202) {
        expect(loser!.body.data.provider_attempt).toBe("throttled");
      } else {
        expect(loser!.statusCode).toBe(409);
        expect(loser!.body.error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
      }
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows[0].n).toBe(1);
      expect(providerCallCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  // P2CC2-MED-1 deterministic fixture-isolation proof — does NOT rely on "all co-scheduled runs
  // must be green" (that oracle is contaminated by the pre-existing, unrelated outbox ACL
  // REVOKE/GRANT race documented elsewhere). Instead this proves the exact production cleanup
  // control directly and deterministically: creates a real owner-A fixture (this file's own
  // OWNED_CLIENT_ID, through the real route) alongside a hand-inserted, byte-snapshotted
  // owner-B "foreign" sentinel fixture under a DIFFERENT client_id, invokes the SAME
  // `cleanupOwnedFixtures()` function the real `afterEach` uses (not a re-typed copy of the SQL),
  // and asserts A is fully gone while B survives unchanged in every column. No global DELETE,
  // no mocked SQL string, no sleep-based timing.
  // -----------------------------------------------------------------------------------------
  describe("P2CC2-MED-1 deterministic fixture-isolation proof (sentinel ownership)", () => {
    const FOREIGN_SENTINEL_CLIENT_ID = "clt1client_screenroute_sentinel_foreign";

    it("cleanupOwnedFixtures() removes every OWNED_CLIENT_ID row and leaves a foreign owner's rows byte-for-byte untouched", async () => {
      if (!schemaReady) return;

      // --- Owner A: real fixture, created through the actual production route (registration +
      // a terminal /screen call), so this exercises the REAL insert shape this file's own
      // `afterEach` must clean up after every test. ---
      const { destinationId: aDestId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const aScreenRes = await screen(app, aDestId, freshKey("sentinel-a"));
      expect(aScreenRes.statusCode).toBe(200);
      const aScreeningResultId = aScreenRes.body.data.screening_result_id;
      // /screen never writes vendor_result_inbox itself (that route doesn't exist yet this
      // phase) — insert one directly under owner A so the inbox DELETE branch of
      // `cleanupOwnedFixtures()` is genuinely exercised, not vacuously a no-op on an empty table.
      const aInboxId = "wlt1inbox_sentinel_a_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, now())`,
        [aInboxId, STUB_PROVIDER_ID, "presult_sentinel_a_" + randomUUID(), aDestId, aScreeningResultId, "sha256:sentinel_a_" + randomUUID()],
      );

      // --- Owner B: hand-inserted foreign sentinel, a DIFFERENT client_id never used by this
      // file's own fixtures or by `OWNED_CLIENT_ID`-scoped cleanup. ---
      const bDestId = "wlt1dest_sentinel_foreign_" + randomUUID();
      const bAddressHash = "addrhash_sentinel_b_" + randomUUID();
      const bScreeningResultId = "wlt1screen_sentinel_b_" + randomUUID();
      const bInboxId = "wlt1inbox_sentinel_b_" + randomUUID();
      const bCheckId = "wlt1check_sentinel_b_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, $2, 'wallet', $3)`,
        [bDestId, FOREIGN_SENTINEL_CLIENT_ID, "nkhash_sentinel_b_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unknown', 'self')`,
        [bDestId, ETH_SENTINEL_ADDRESS, bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
         VALUES ($1, $2, $3, 'ethereum', 'mainnet', $4, $4, 'ethereum-eip55-v1', true, 'pass', 'canonicalisation_succeeded')`,
        [bCheckId, bDestId, FOREIGN_SENTINEL_CLIENT_ID, bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
         VALUES ($1, $2, 1, $3, $4, 'ethereum', 'mainnet', $5)`,
        [bScreeningResultId, bDestId, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, now())`,
        [bInboxId, STUB_PROVIDER_ID, "presult_sentinel_b_" + randomUUID(), bDestId, bScreeningResultId, "sha256:sentinel_b_" + randomUUID()],
      );

      try {
        // Byte-for-byte snapshot of every owner-B row BEFORE the real cleanup path runs.
        const snapshotBefore = await Promise.all([
          verifyPool.query(`SELECT * FROM wlt1.destination WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestId]),
        ]);
        for (const r of snapshotBefore) expect(r.rows.length).toBe(1);

        // Invoke the EXACT SAME function the real `afterEach` calls — not a re-typed copy.
        await cleanupOwnedFixtures();

        // Owner A: every row gone.
        const aAfter = await Promise.all([
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE destination_id = $1`, [aDestId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_destination WHERE destination_id = $1`, [aDestId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.address_integrity_check WHERE destination_id = $1`, [aDestId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [aDestId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [aDestId]),
        ]);
        for (const r of aAfter) expect(r.rows[0].n).toBe(0);

        // Owner B: every row still present, and byte-for-byte identical to the pre-cleanup snapshot.
        const snapshotAfter = await Promise.all([
          verifyPool.query(`SELECT * FROM wlt1.destination WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestId]),
          verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestId]),
        ]);
        for (let i = 0; i < snapshotBefore.length; i++) {
          expect(snapshotAfter[i].rows).toEqual(snapshotBefore[i].rows);
        }
      } finally {
        // This test's own foreign sentinel is intentionally OUTSIDE OWNED_CLIENT_ID scope, so
        // `cleanupOwnedFixtures()` will never remove it (that is exactly what was just proven) —
        // it must be cleaned up here, manually, in FK-safe order, so it never leaks into another
        // test in this file or another file's own run.
        await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestId]);
        await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [bDestId]);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-C3 — comprehensive resume/claim coverage: drift fail-closed rules, destination-data
  // correlation, multi-retry lifecycle, deterministic concurrency, and the audit/version
  // non-amplification invariants. Cooldown boundaries are always forced via direct
  // `updated_at_utc` rewrites on the privileged `verifyPool` connection — never a real sleep.
  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-C3 — provider/adaptor drift, correlation, multi-retry, concurrency", () => {
    async function forceEligible(screeningResultId: string): Promise<void> {
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);
    }

    // M-D3B-2 remediation (Phase 2C-D3C): the "provider-identity drift" test formerly here has
    // MOVED to `wlt1-screening-route-private.test.ts` — same reasoning as the provider-resolution
    // test moved above (it also mutates the shared `wlt1.chain_coverage` (ethereum, mainnet) row).
    // Same assertions, same control purpose, now against a private disposable database.

    it("adaptor-version drift: resolved adaptorVersion differs from the pending row's persisted provider_adaptor_version -> WLT1_SERVICE_UNAVAILABLE, NO provider call (never allowed through to a later WLT1_VENDOR_RESULT_INVALID)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;
      await forceEligible(screeningResultId);

      const persistedRow = await verifyPool.query(`SELECT provider_adaptor_version FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(persistedRow.rows[0].provider_adaptor_version).toBe(STUB_ADAPTOR_VERSION);

      let called = false;
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: "drifted-adaptor-version-2",
        async screen(input: WalletScreeningInput) {
          called = true;
          return stubProvider.screen(input);
        },
      };
      try {
        const retry = await screen(app, destinationId, freshKey());
        expect(retry.statusCode).toBe(503);
        expect(retry.body.error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
        expect(called).toBe(false);

        const row = await verifyPool.query(`SELECT screening_result_version, provider_adaptor_version, risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
        expect(row.rows[0].screening_result_version).toBe(1);
        expect(row.rows[0].provider_adaptor_version).toBe(STUB_ADAPTOR_VERSION); // never rewritten
        expect(row.rows[0].risk_status).toBe("pending");
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("destination-data correlation failure (address_hash divergence) -> AppError INTERNAL_ERROR, NO provider call", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;
      await forceEligible(screeningResultId);

      // Corrupt the pending row's own frozen address_hash so it no longer correlates with
      // wallet_destination — a data-integrity condition unreachable through any runtime grant
      // (this table has no ordinary UPDATE path for this column), simulated only via the
      // privileged verifyPool connection.
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET address_hash = 'corrupted_address_hash_for_test' WHERE screening_result_id = $1`, [screeningResultId]);
      try {
        let called = false;
        mainConfig.screeningProviderImpl = {
          providerId: STUB_PROVIDER_ID,
          adaptorVersion: STUB_ADAPTOR_VERSION,
          async screen(input: WalletScreeningInput) {
            called = true;
            return stubProvider.screen(input);
          },
        };
        const retry = await screen(app, destinationId, freshKey());
        expect(retry.statusCode).toBe(500);
        expect(retry.body.error.code).toBe("INTERNAL_ERROR");
        expect(called).toBe(false);
        // No raw DB details leaked.
        expect(JSON.stringify(retry.body)).not.toContain("corrupted_address_hash_for_test");
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("missing pending row integrity: destination pending_screening but zero pending rows -> AppError INTERNAL_ERROR, NO provider call, no new row created", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;

      // Directly force the row out of `pending` while leaving destination.status untouched at
      // `pending_screening` — an internal-consistency condition unreachable through any runtime
      // grant, simulated only via the privileged connection to prove the fail-closed guard.
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET risk_status = 'clear' WHERE screening_result_id = $1`, [screeningResultId]);
      try {
        let called = false;
        mainConfig.screeningProviderImpl = {
          providerId: STUB_PROVIDER_ID,
          adaptorVersion: STUB_ADAPTOR_VERSION,
          async screen(input: WalletScreeningInput) {
            called = true;
            return stubProvider.screen(input);
          },
        };
        const retry = await screen(app, destinationId, freshKey());
        expect(retry.statusCode).toBe(500);
        expect(retry.body.error.code).toBe("INTERNAL_ERROR");
        expect(called).toBe(false);
        const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(rows.rows[0].n).toBe(1); // no new row created
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("multi-retry lifecycle: A unavailable -> B unavailable -> C invalid_response -> D clear — SAME row/version throughout, exactly 4 provider calls, exactly ONE requested audit, destination transitions only at D", async () => {
      if (!schemaReady) return;
      let callCount = 0;
      let nextOutcome: WalletScreeningOutcome = { kind: "unavailable", reasonCode: "provider_unavailable" };
      const scriptedProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen() {
          callCount++;
          return nextOutcome;
        },
      };
      mainConfig.screeningProviderImpl = scriptedProvider;
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });

        const a = await screen(app, destinationId, freshKey());
        expect(a.statusCode).toBe(202);
        expect(a.body.data.provider_attempt).toBe("unavailable");
        const screeningResultId = a.body.data.screening_result_id as string;
        expect(callCount).toBe(1);

        await forceEligible(screeningResultId);
        const b = await screen(app, destinationId, freshKey());
        expect(b.statusCode).toBe(202);
        expect(b.body.data.provider_attempt).toBe("unavailable");
        expect(b.body.data.screening_result_id).toBe(screeningResultId);
        expect(b.body.data.screening_result_version).toBe(1);
        expect(callCount).toBe(2);

        nextOutcome = { kind: "invalid_response", reasonCode: "provider_malformed_response" };
        await forceEligible(screeningResultId);
        const c = await screen(app, destinationId, freshKey());
        expect(c.statusCode).toBe(202);
        expect(c.body.data.provider_attempt).toBe("invalid_response");
        expect(c.body.data.screening_result_id).toBe(screeningResultId);
        expect(c.body.data.screening_result_version).toBe(1);
        expect(callCount).toBe(3);

        nextOutcome = {
          kind: "screened",
          result: {
            providerResultId: "presult_multiretry_" + randomUUID(),
            riskStatus: "clear",
            riskScore: 1,
            riskCategories: [],
            directExposure: [],
            indirectExposure: [],
            sanctionsExposure: false,
            clusterRef: null,
            issuedAtUtc: new Date().toISOString(),
            validUntilUtc: null,
          },
        };
        await forceEligible(screeningResultId);
        const d = await screen(app, destinationId, freshKey());
        expect(d.statusCode).toBe(200);
        expect(d.body.data.risk_status).toBe("clear");
        expect(d.body.data.screening_result_id).toBe(screeningResultId);
        expect(callCount).toBe(4);

        // Same row/version throughout — no growth.
        const finalRows = await verifyPool.query(`SELECT screening_result_id, screening_result_version FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(finalRows.rows).toHaveLength(1);
        expect(finalRows.rows[0].screening_result_version).toBe(1);

        // Destination stayed pending_screening until D, then transitioned exactly once.
        const finalDest = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
        expect(finalDest.rows[0].status).toBe("pending_review");
        // destination_status_version starts at 1 (registration DEFAULT), +1 for draft->
        // pending_screening (C2 initiation at A), +1 for the terminal pending_screening->
        // pending_review transition at D = 3 total. The B/C retries (still leaving the
        // destination in pending_screening) must NOT have incremented it at all — proven by the
        // total landing on exactly 3, not higher.
        expect(finalDest.rows[0].destination_status_version).toBe(3);

        // Exactly ONE wlt1.wallet_screening_requested audit across the whole lifecycle — never
        // re-emitted on any retry.
        expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_requested")).toBe(1);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("different-key concurrency after cooldown: exactly one claim winner, one throttled loser, exactly one provider call, SAME row/version, no new requested audit", async () => {
      if (!schemaReady) return;
      let callCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          callCount++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
        const first = await screen(app, destinationId, freshKey());
        expect(first.statusCode).toBe(202);
        const screeningResultId = first.body.data.screening_result_id as string;
        await forceEligible(screeningResultId);

        // Deterministic barrier: hold the SAME destination advisory lock on an independent
        // connection, launch two NEW-key retry requests, then release — forcing both to serialize
        // through the exact lock the route itself takes (mirrors the existing draft-path
        // concurrency test's own established technique).
        const barrierClient = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
        const barrierConn = await barrierClient.connect();
        await barrierConn.query("BEGIN");
        await barrierConn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);

        const keyB = freshKey("c3-race-b");
        const keyC = freshKey("c3-race-c");
        const p1 = screen(app, destinationId, keyB);
        const p2 = screen(app, destinationId, keyC);
        await new Promise((r) => setTimeout(r, 50));
        await barrierConn.query("COMMIT");
        barrierConn.release();
        await barrierClient.end();

        const [r1, r2] = await Promise.all([p1, p2]);
        const throttledResponses = [r1, r2].filter((r) => r.body.data.provider_attempt === "throttled");
        const observedResponses = [r1, r2].filter((r) => r.body.data.provider_attempt === "unavailable");
        expect(throttledResponses).toHaveLength(1);
        expect(observedResponses).toHaveLength(1);
        expect(r1.statusCode).toBe(202);
        expect(r2.statusCode).toBe(202);
        // callCount already includes the ONE initial C2-initiation provider call (`first`, above,
        // also ran under this same counting provider) — the race itself must add EXACTLY one more
        // (the single claim winner), never two.
        expect(callCount).toBe(2);

        const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(rows.rows[0].n).toBe(1);
        const versionCheck = await verifyPool.query(`SELECT screening_result_version FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
        expect(versionCheck.rows[0].screening_result_version).toBe(1);
        expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_requested")).toBe(1);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("same-key concurrency for a retry: at most one claim attempt, at most one provider invocation", async () => {
      if (!schemaReady) return;
      let callCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          callCount++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
        const first = await screen(app, destinationId, freshKey());
        expect(first.statusCode).toBe(202);
        const screeningResultId = first.body.data.screening_result_id as string;
        await forceEligible(screeningResultId);

        const sameKey = freshKey("c3-same-key-race");
        const [r1, r2] = await Promise.all([screen(app, destinationId, sameKey), screen(app, destinationId, sameKey)]);
        expect(r1.statusCode).toBe(202);
        expect(r2.statusCode).toBe(202);
        // callCount already includes the ONE initial C2-initiation provider call (`first`, above)
        // — the same-key race itself must add AT MOST one more (foundation idempotency permits at
        // most one owner), regardless of exact timing.
        expect(callCount).toBeLessThanOrEqual(2);
        const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(rows.rows[0].n).toBe(1);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("original C2 initiation key never gains retry ownership even after the cooldown has long elapsed — it only ever rehydrates", async () => {
      if (!schemaReady) return;
      let callCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          callCount++;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
        const keyA = freshKey("c3-original-key");
        const first = await screen(app, destinationId, keyA);
        expect(first.statusCode).toBe(202);
        const screeningResultId = first.body.data.screening_result_id as string;
        expect(callCount).toBe(1);

        await forceEligible(screeningResultId);
        // The SAME original key A, replayed long after the cooldown window has passed — MUST
        // still only rehydrate (generic pending, no provider_attempt/reason_code), MUST NOT claim
        // ownership or invoke the provider a second time.
        const replay = await screen(app, destinationId, keyA);
        expect(replay.statusCode).toBe(202);
        expect("provider_attempt" in replay.body.data).toBe(false);
        expect("reason_code" in replay.body.data).toBe(false);
        expect(callCount).toBe(1);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("a throttled key's own same-key replay returns generic pending (never re-reports throttled — the disposition is not persisted)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);

      // A NEW key, immediately, well within the cooldown -> throttled.
      const keyB = freshKey("c3-throttled-replay");
      const throttled = await screen(app, destinationId, keyB);
      expect(throttled.statusCode).toBe(202);
      expect(throttled.body.data.provider_attempt).toBe("throttled");

      // The SAME key B, replayed again -> generic pending, NOT throttled.
      const replay = await screen(app, destinationId, keyB);
      expect(replay.statusCode).toBe(202);
      expect("provider_attempt" in replay.body.data).toBe(false);
      expect("reason_code" in replay.body.data).toBe(false);
    });

    it("throttled response is the exact frozen shape — 8 keys, retryable=true, reason_code='retry_cooldown_active', never leaking retry_after/timestamp fields", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const throttled = await screen(app, destinationId, freshKey());
      expect(throttled.statusCode).toBe(202);
      expect(Object.keys(throttled.body.data).sort()).toEqual(
        ["destination_id", "destination_status", "retryable", "risk_status", "screening_result_id", "screening_result_version", "provider_attempt", "reason_code"].sort(),
      );
      expect(throttled.body.data.provider_attempt).toBe("throttled");
      expect(throttled.body.data.reason_code).toBe("retry_cooldown_active");
      expect(throttled.body.data.retryable).toBe(true);
      expect(throttled.body.data.risk_status).toBe("pending");
      expect(throttled.body.data.destination_status).toBe("pending_screening");
      // No timing leakage of any kind.
      const raw = JSON.stringify(throttled.body.data);
      expect(raw).not.toContain("retry_after");
      expect(raw).not.toContain("updated_at");
      expect(raw).not.toContain("cooldown_expir");
    });

    it("'retry_cooldown_active' never appears as a provider-observed reason_code for a real unavailable/invalid_response outcome", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const res = await screen(app, destinationId, freshKey());
      expect(res.statusCode).toBe(202);
      expect(res.body.data.provider_attempt).toBe("unavailable");
      expect(res.body.data.reason_code).not.toBe("retry_cooldown_active");
    });

    it("a claim win does NOT increment destination_status_version (destination remains pending_screening; only terminal application performs its own accepted transition)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;
      const beforeVersion = (await verifyPool.query(`SELECT destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId])).rows[0].destination_status_version;

      await forceEligible(screeningResultId);
      const retry = await screen(app, destinationId, freshKey());
      expect(retry.statusCode).toBe(202);
      expect(retry.body.data.provider_attempt).toBe("unavailable");

      const afterVersion = (await verifyPool.query(`SELECT destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId])).rows[0].destination_status_version;
      expect(afterVersion).toBe(beforeVersion);
    });

    it("provider call depth zero on the C3 resume path: zero checked-out pool connections at the moment the provider is invoked", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(app, destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;
      await forceEligible(screeningResultId);

      const pool = getPool();
      let observedCheckedOut = -1;
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedCheckedOut = pool.totalCount - pool.idleCount;
          return stubProvider.screen(input);
        },
      };
      try {
        const retry = await screen(app, destinationId, freshKey());
        expect(retry.statusCode).toBe(202);
        expect(observedCheckedOut).toBe(0);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-D0 — GAP-1 remediation: `WalletScreeningInput.screeningReferenceId` is the
  // server-generated `screening_result_id` of the screening attempt a provider call belongs to.
  // Independent Opus review proved `{chain, network, canonicalAddress}` alone is an UNSAFE
  // correlation key for a future asynchronous provider receipt (Phase 2C-D), since a canonical
  // address is not unique across destinations. These tests prove the field is genuinely wired
  // end-to-end on BOTH the C2 draft-initiation path and the C3 resume path, is stable across
  // retries of the SAME screening row/version, is distinct across two destinations sharing one
  // address, and is never caller-influenceable.
  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D0 — GAP-1: provider screeningReferenceId correlation", () => {
    it("draft-path initiation: the provider receives screeningReferenceId === the newly created screening_result_id", async () => {
      if (!schemaReady) return;
      let observedInput: WalletScreeningInput | undefined;
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedInput = input;
          return stubProvider.screen(input);
        },
      };
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        const res = await screen(app, destinationId, freshKey());
        expect(res.statusCode).toBe(200);
        const screeningResultId = res.body.data.screening_result_id as string;
        expect(observedInput?.screeningReferenceId).toBe(screeningResultId);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("C3 retry (resume path): the provider receives screeningReferenceId === the EXISTING pending screening_result_id, not a new one", async () => {
      if (!schemaReady) return;
      let observedInput: WalletScreeningInput | undefined;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedInput = input;
          return stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
        const first = await screen(app, destinationId, freshKey());
        expect(first.statusCode).toBe(202);
        const screeningResultId = first.body.data.screening_result_id as string;
        expect(observedInput?.screeningReferenceId).toBe(screeningResultId); // draft-path call itself

        await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);
        observedInput = undefined;
        const retry = await screen(app, destinationId, freshKey());
        expect(retry.statusCode).toBe(202);
        expect(retry.body.data.screening_result_id).toBe(screeningResultId);
        expect(observedInput?.screeningReferenceId).toBe(screeningResultId); // C3 resume call — SAME reference
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("multi-retry stability: screeningReferenceId is IDENTICAL across three successive retries of the same screening row/version", async () => {
      if (!schemaReady) return;
      const observedReferences: string[] = [];
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedReferences.push(input.screeningReferenceId);
          return { kind: "unavailable", reasonCode: "provider_unavailable" };
        },
      };
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        const first = await screen(app, destinationId, freshKey());
        expect(first.statusCode).toBe(202);
        const screeningResultId = first.body.data.screening_result_id as string;

        for (let i = 0; i < 3; i++) {
          await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);
          const retry = await screen(app, destinationId, freshKey());
          expect(retry.statusCode).toBe(202);
        }

        expect(observedReferences).toHaveLength(4); // 1 draft-path call + 3 retries
        expect(new Set(observedReferences).size).toBe(1); // every single call used the SAME reference
        expect(observedReferences[0]).toBe(screeningResultId);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });

    it("LOAD-BEARING: two destinations sharing the SAME canonical wallet address receive DISTINCT screeningReferenceId values — correlation is screening-based, never address-based", async () => {
      if (!schemaReady) return;
      // The natural-key uniqueness backstop (`idx_wlt1_destination_natural_key`) folds
      // `client_id` in (`lib/destinations.ts`'s own header comment: natural key =
      // `(client_id, chain, network, canonical_address_hash, memo_tag_identity)`), so two
      // registrations of the IDENTICAL address under the SAME client_id are a real duplicate —
      // this test's premise ("two different destinations sharing one address") requires a SECOND,
      // genuinely different client_id. `clt1ActiveFetch` (this file's own CLT-01 status stub)
      // never inspects the requested client_id, so a second synthetic value is safe to use here.
      // Scoped and cleaned up manually (own try/finally DELETE), deliberately OUTSIDE
      // `OWNED_CLIENT_ID`/`cleanupOwnedFixtures()`'s scope — mirrors this file's own established
      // FOREIGN_SENTINEL_CLIENT_ID one-off-fixture pattern.
      const SECOND_CLIENT_ID = "clt1client_screenroute_gap1_" + randomUUID();
      const observedReferences: string[] = [];
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedReferences.push(input.screeningReferenceId);
          return stubProvider.screen(input);
        },
      };
      try {
        // Two SEPARATE registrations of the identical chain/network/address under two DIFFERENT
        // clients — two distinct destination_id/wallet_destination rows, hence two distinct
        // screening_result_id values, even though the wallet address (and therefore
        // address_hash) is byte-identical.
        const first = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        const second = await registerDestinationForClient(app, SECOND_CLIENT_ID, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        expect(first.destinationId).not.toBe(second.destinationId);

        const resA = await screen(app, first.destinationId, freshKey());
        const resB = await screen(app, second.destinationId, freshKey());
        expect(resA.statusCode).toBe(200);
        expect(resB.statusCode).toBe(200);

        const screeningIdA = resA.body.data.screening_result_id as string;
        const screeningIdB = resB.body.data.screening_result_id as string;
        expect(screeningIdA).not.toBe(screeningIdB); // distinct screening attempts
        expect(observedReferences).toHaveLength(2);
        expect(observedReferences).toContain(screeningIdA);
        expect(observedReferences).toContain(screeningIdB);
        expect(new Set(observedReferences).size).toBe(2); // NEVER collapsed to one shared address-derived value
      } finally {
        mainConfig.screeningProviderImpl = undefined;
        // Exact FK-safe order mirroring cleanupOwnedFixtures()'s own established sequence.
        await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [
          SECOND_CLIENT_ID,
        ]);
        await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [
          SECOND_CLIENT_ID,
        ]);
        await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [
          SECOND_CLIENT_ID,
        ]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [
          SECOND_CLIENT_ID,
        ]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [SECOND_CLIENT_ID]);
      }
    });

    it("caller cannot influence screeningReferenceId — the /screen request body remains {} (additionalProperties:false); no caller-supplied field of any name reaches the provider", async () => {
      if (!schemaReady) return;
      let observedInput: WalletScreeningInput | undefined;
      mainConfig.screeningProviderImpl = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          observedInput = input;
          return stubProvider.screen(input);
        },
      };
      try {
        const { destinationId } = await registerDestination(app, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        // Attempt to smuggle a caller-chosen correlation value through every plausible field name
        // — the route schema is additionalProperties:false, so this must be rejected outright,
        // never partially honoured.
        const res = await app.inject({
          method: "POST",
          url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
          headers: { "x-internal-service-token": (app.config as Wlt1Config).wlt1InternalServiceToken, "idempotency-key": freshKey() },
          payload: { screeningReferenceId: "attacker-chosen-value", screening_result_id: "attacker-chosen-value", provider_reference: "attacker-chosen-value" },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("VALIDATION_ERROR");
        expect(observedInput).toBeUndefined(); // never reached the provider at all

        // The real, well-formed request still produces a server-generated reference untouched by
        // the rejected attempt above.
        const real = await screen(app, destinationId, freshKey());
        expect(real.statusCode).toBe(200);
        expect(observedInput?.screeningReferenceId).toBe(real.body.data.screening_result_id);
        expect(observedInput?.screeningReferenceId).not.toBe("attacker-chosen-value");
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }
    });
  });
});

// =================================================================================================
// P2CC1-MED-1 behavioural closure proof — two INDEPENDENTLY configured apps, different validated
// ceilings, sharing the same underlying database. Proves: (a) the ceiling is genuinely per-app
// config-derived, not a global singleton; (b) no route/body/header path can override it.
// =================================================================================================
describe("WLT-01 Phase 2C-C2, P2CC1-MED-1 behavioural closure: per-app validated validity-ceiling authority", () => {
  let app24: FastifyInstance;
  let app720: FastifyInstance;
  let ready = false;

  beforeAll(async () => {
    if (!TEST_DB) return;
    const check = new Pool({ connectionString: TEST_DB });
    try {
      const r = await check.query(`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result') AS n`);
      ready = Number(r.rows[0]?.n) > 0;
    } catch {
      ready = false;
    } finally {
      await check.end();
    }
    if (!ready) return;

    const runtimeDbUrl = TEST_DB.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl); // idempotent — reuses the pool already initialised above if present

    app24 = await buildApp(baseConfig({ clt1FetchImpl: clt1ActiveFetch, screeningMaxValidityHours: 24 }));
    app720 = await buildApp(baseConfig({ clt1FetchImpl: clt1ActiveFetch, screeningMaxValidityHours: 720 }));
  });

  afterAll(async () => {
    if (app24) await app24.close();
    if (app720) await app720.close();
  });

  it("App A (config=24h) persists ~24h effective validity when the provider supplies no expiry; App B (config=720h) persists ~720h — same code, different validated per-app config", async () => {
    // H-D3C-1: this describe block owns a SEPARATE, independently-checked `ready` flag (its own
    // DB pool/schema check, distinct from the file-level `schemaReady`) — it needs its OWN
    // fail-loud canary for the identical reason: a genuine setup failure here must not silently
    // pass as if TEST_DATABASE_URL were simply unset.
    if (!ready) return expect(ready, "run migrate:up + wlt1_runtime_grants.sql first (P2CC1-MED-1 per-app closure setup)").toBe(true);
    const destA = await registerDestination(app24, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
    const resA = await screen(app24, destA.destinationId, freshKey());
    expect(resA.statusCode).toBe(200);
    const hoursA = (new Date(resA.body.data.valid_until_utc).getTime() - Date.now()) / 3_600_000;
    expect(hoursA).toBeGreaterThan(23);
    expect(hoursA).toBeLessThan(25);

    const destB = await registerDestination(app720, { chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
    const resB = await screen(app720, destB.destinationId, freshKey());
    expect(resB.statusCode).toBe(200);
    const hoursB = (new Date(resB.body.data.valid_until_utc).getTime() - Date.now()) / 3_600_000;
    expect(hoursB).toBeGreaterThan(719);
    expect(hoursB).toBeLessThan(721);

    // Unambiguously different — not coincidentally close.
    expect(hoursB).toBeGreaterThan(hoursA * 20);

    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN ($1, $2)`, [destA.destinationId, destB.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN ($1, $2)`, [destA.destinationId, destB.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN ($1, $2)`, [destA.destinationId, destB.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id IN ($1, $2)`, [destA.destinationId, destB.destinationId]);
  });

  it("no body/query/header field on /screen can influence the ceiling — the empty-body schema already proves this at the route-surface level (see 'every conceivable caller-supplied override field is rejected' above); this test re-confirms end to end on the 24h app", async () => {
    if (!ready) return;
    const dest = await registerDestination(app24, { chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK });
    const res = await app24.inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${dest.destinationId}/screen?screeningMaxValidityHours=876000`,
      headers: {
        "x-internal-service-token": (app24.config as Wlt1Config).wlt1InternalServiceToken,
        "idempotency-key": freshKey(),
        "x-screening-max-validity-hours": "876000",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const hours = (new Date(res.json().data.valid_until_utc).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeLessThan(25); // still ~24h — the query string and custom header were both ignored

    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [dest.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id = $1`, [dest.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [dest.destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [dest.destinationId]);
  });
});
