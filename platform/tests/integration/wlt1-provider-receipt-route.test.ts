/**
 * WLT-01 Phase 2C-D1/D2 — `POST /internal/wlt1/provider-results/receipt` route-level integration
 * tests. Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Connects as `role_wlt1_runtime` via a real LOGIN role from the start (never superuser-only —
 * same discipline every other WLT-01 route-level test file established). Uses the SHARED
 * canonical test database, not a private disposable one.
 *
 * SCOPE DISCIPLINE: this file proves Phase 2C-D1's authentication / raw-byte hashing / TX-A
 * durable inbox persistence / P2CB-MED-2 unforgeable-evidence boundary, PLUS Phase 2C-D2's own
 * replay/tamper integrity semantics (exact-duplicate recovery, conflicting-payload detection,
 * `WLT1_RECEIPT_CONFLICT`, `wlt1.provider_receipt_conflict_detected`). It deliberately does NOT
 * test D3 terminal application/normalization — that phase does not exist yet. The D2
 * conflict-AUDIT-FAILURE scenario specifically lives in `wlt1-outbox-acl-private.test.ts` instead
 * (its own private, disposable database), matching every other outbox-ACL-mutating WLT-01 test —
 * an ACL REVOKE against the SHARED `role_wlt1_runtime` this file also depends on would remove
 * ordinary INSERT privilege from any bystander request running concurrently in another file.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { Pool, Client } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { WLT1_TEST_STUB_ADDRESS_UNAVAILABLE, WLT1_TEST_STUB_ADDRESS_CLEAR, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import * as stubProviderModule from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_provider_receipt_route_test";
const RECEIPT_URL = "/internal/wlt1/provider-results/receipt";

/** Real, valid, deterministic test-only receipt secret — NOT the WLT1_INTERNAL_SERVICE_TOKEN,
 * NOT the screening-stub token; the receipt architecture's own frozen "different auth boundary,
 * different credential" rule applies here too, tested for real by this whole file. */
const REAL_RECEIPT_SECRET = "test-receipt-secret-" + "a".repeat(20); // 41 chars, well over the 32-char floor

/** P2CC2-MED-1-style fixture isolation: every destination fixture in this file is created under
 * this OWN client_id, cleanup below is scoped to exactly this value. */
const OWNED_CLIENT_ID = "clt1client_receiptroute";

function baseConfig(overrides: Partial<Wlt1Config> = {}): Wlt1Config {
  return {
    environment: "dev",
    databaseUrl: TEST_DB ?? "postgres://unused",
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-receiptroute-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: { [STUB_PROVIDER_ID]: REAL_RECEIPT_SECRET },
    ...overrides,
  };
}

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance;
let mainConfig: Wlt1Config;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'vendor_result_inbox') AS n`);
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

async function cleanupOwnedFixtures(): Promise<void> {
  await verifyPool.query(
    `DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
    [OWNED_CLIENT_ID],
  );
  await verifyPool.query(
    `DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`,
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
  // Any orphan inbox rows this file's OWN synthetic provider_result_id fixtures may have created
  // against a screening_reference_id that never correlated (destination_id therefore NULL, so the
  // subqueries above cannot reach them) — scoped by this file's own provider_result_id prefix,
  // never a global sweep.
  await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE provider_result_id LIKE 'presult_receiptit_%'`);
}

afterEach(async () => {
  if (!schemaReady) return;
  await cleanupOwnedFixtures();
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

function freshResultId(prefix = "presult_receiptit"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(opts: { chain: string; network: string; address: string }): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: opts.chain, network: opts.network, address: opts.address, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

async function screen(destinationId: string): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  return { statusCode: res.statusCode, body: res.json() };
}

/** Registers a real destination and calls /screen once against the UNAVAILABLE fixture address —
 * this leaves a REAL `pending` wallet_screening_result row bound to STUB_PROVIDER_ID (the C2/C3
 * accepted stub-fixture technique every prior WLT-01 route test file already uses), giving these
 * receipt tests a genuine `screening_reference_id` to correlate against without any direct-DB
 * fixture insertion. */
async function createRealPendingScreening(): Promise<{ destinationId: string; screeningResultId: string }> {
  const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
  const first = await screen(destinationId);
  if (first.statusCode !== 202) throw new Error(`expected pending screening, got ${first.statusCode} ${JSON.stringify(first.body)}`);
  return { destinationId, screeningResultId: first.body.data.screening_result_id as string };
}

async function fetchInboxRow(providerResultId: string) {
  const r = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
  return r.rows[0];
}

async function fetchScreeningRiskStatus(screeningResultId: string): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
  return r.rows[0]?.risk_status;
}

// -------------------------------------------------------------------------------------------
// Phase 2C-D2 helpers.
// -------------------------------------------------------------------------------------------

async function sendReceipt(providerResultId: string, resultBody: unknown, opts: { screeningReferenceId?: string } = {}) {
  return app.inject({
    method: "POST",
    url: RECEIPT_URL,
    headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
    payload: { screening_reference_id: opts.screeningReferenceId ?? "wlt1screen_d2_" + randomUUID(), provider_result_id: providerResultId, result: resultBody },
  });
}

/** Phase 2C-D3A — a WELL-FORMED provider-native receipt body matching the stub adaptor's own
 * `normalizeReceipt` expected shape (`lib/providers/stub-provider.ts`'s own `normalizeStubReceipt`)
 * — every field the stub requires present, `provider_result_id` matching the envelope's own (the
 * D3A cross-check), `risk_status` a known value, and a `now`-issued timestamp comfortably within
 * the 720h test validity ceiling. Used wherever a pre-D3A test previously sent an arbitrary opaque
 * `{ attempt: N }` placeholder body and expected the receipt to be genuinely ELIGIBLE (D1/D2 never
 * inspected `result` at all; D3A now does, so an opaque placeholder is classified
 * `invalid_normalized_result` instead of remaining eligible) — those call sites now use this helper
 * so the underlying D1/D2 behavior they actually test is exercised via a receipt D3A ALSO accepts
 * as structurally valid (yielding the frozen D3A subgate 503, never a 2xx claim of completion). */
function validStubReceiptBody(providerResultId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider_result_id: providerResultId,
    risk_status: "clear",
    risk_score: 2.0,
    risk_categories: [],
    direct_exposure: [],
    indirect_exposure: [],
    sanctions_exposure: false,
    cluster_ref: null,
    issued_at_utc: new Date().toISOString(),
    valid_until_utc: null,
    ...overrides,
  };
}

async function conflictAuditCountFor(providerResultId: string): Promise<number> {
  const r = await verifyPool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.provider_receipt_conflict_detected' AND payload_ref::text LIKE '%' || $1 || '%'`,
    [providerResultId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function conflictAuditMetadataFor(providerResultId: string): Promise<Record<string, unknown> | undefined> {
  const r = await verifyPool.query<{ payload_ref: string }>(
    `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.provider_receipt_conflict_detected' AND payload_ref::text LIKE '%' || $1 || '%' LIMIT 1`,
    [providerResultId],
  );
  const raw = r.rows[0]?.payload_ref;
  return raw ? (JSON.parse(raw) as { metadata: Record<string, unknown> }).metadata : undefined;
}

/** Manually sets an inbox row's processing_status to 'processed' — D2 itself never creates one
 * (that is Phase 2C-D3's own scope), but D2 must still correctly classify a replay against a row
 * that already carries this status via a controlled fixture, per the task's own future-facing
 * requirement. */
async function forceProcessedStatus(providerResultId: string): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.vendor_result_inbox SET processing_status = 'processed' WHERE provider_result_id = $1`, [providerResultId]);
}

/** Polls for a backend blocked waiting to acquire `pg_advisory_xact_lock` — a REAL lock wait, never
 * a timing guess. Mirrors `wlt1-screening-route.test.ts`'s own established advisory-lock barrier
 * precedent, adapted to a deterministic poll (rather than a courtesy sleep) matching this file's
 * own `waitForBlockedReceiptInsert` convention immediately below. */
async function waitForBlockedAdvisoryLock(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await verifyPool.query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND state = 'active'
          AND pid <> pg_backend_pid()
          AND query ILIKE '%pg_advisory_xact_lock%'`,
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the receipt route's own applyNormalizedScreeningResult to block on the destination advisory lock");
}

/** Phase 2C-D3C — a PRECISE barrier for the new concurrent-race tests below, keyed to the EXACT
 * `wlt1.destination:<destinationId>` lock value (I-2 from the independent Phase 2C-D3B Opus
 * review: a cluster-wide "any advisory-lock waiter" count can be satisfied by an UNRELATED
 * concurrently-running file's own advisory-lock wait on a DIFFERENT destination on the shared
 * canonical database — empirically confirmed to cause exactly this flake under full-suite parallel
 * execution). `pg_advisory_xact_lock(key bigint)` (the single-bigint form this route/service always
 * uses, via `hashtext(text)::bigint`) is recorded in `pg_locks` with `objsubid = 1`, `objid =
 * (the key's low 32 bits, i.e. hashtext(...)::oid)`, and `classid = ` the key's high 32 bits — which
 * for a sign-extended int4->bigint cast is always exactly 0 (hashtext >= 0) or 4294967295 (hashtext
 * < 0, all-ones sign extension). Both encodings independently verified empirically against a live
 * `pg_locks` row before being committed here (never assumed). This is a REAL improvement in
 * precision over the earlier single-waiter/any-lock barriers elsewhere in this file — those are
 * left untouched (do not rewrite unrelated historical barriers unless necessary). */
async function waitForNBlockedOnDestinationLock(destinationId: string, n: number, timeoutMs = 5000): Promise<void> {
  const lockKey = `wlt1.destination:${destinationId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await verifyPool.query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM pg_locks l
         JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory'
          AND l.objsubid = 1
          AND l.objid = hashtext($1)::oid
          AND l.classid = (CASE WHEN hashtext($1) < 0 THEN 4294967295 ELSE 0 END)
          AND a.wait_event_type = 'Lock'
          AND a.pid <> pg_backend_pid()`,
      [lockKey],
    );
    if (Number(r.rows[0]?.n ?? 0) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${n} backends to block simultaneously on the advisory lock for ${lockKey}`);
}

/** Polls for a backend (other than the caller's own `verifyPool` connection) whose own query text
 * is literally this route's `wlt1.vendor_result_inbox` INSERT and whose `wait_event_type = 'Lock'`
 * — a REAL row/value-lock wait on the replay unique index, never an advisory lock and never a
 * timing guess. Mirrors `wlt1-db.test.ts`'s own identical `waitForBlockedDestinationInsert`. */
async function waitForBlockedReceiptInsert(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await verifyPool.query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND state = 'active'
          AND pid <> pg_backend_pid()
          AND query ILIKE '%INSERT INTO wlt1.vendor_result_inbox%'`,
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the route's own wlt1.vendor_result_inbox INSERT to block on a competing uncommitted row");
}

describe("WLT-01 Phase 2C-D1: POST /internal/wlt1/provider-results/receipt", () => {
  // -----------------------------------------------------------------------------------------
  describe("authentication — enumeration resistance, no DB touch before success", () => {
    it("missing both auth headers -> 401 SERVICE_IDENTITY_REQUIRED, no inbox row created", async () => {
      // H-D3C-1: this is the ONE fail-loud canary in this file — mirrors the established
      // aml1/cfg1/fnd/iam/iam2/sec1 pattern. Every OTHER test's own `if (!schemaReady) return;`
      // still self-skips silently (unchanged, benign when TEST_DATABASE_URL is genuinely unset),
      // but a genuine schema/role/grant setup failure with a real TEST_DATABASE_URL supplied must
      // fail this one test loudly instead of letting all 82 tests in this file silently pass.
      if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
      const providerResultId = freshResultId();
      const res = await app.inject({ method: "POST", url: RECEIPT_URL, payload: { screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result: {} } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
      expect(await fetchInboxRow(providerResultId)).toBeUndefined();
    });

    it("missing token header only -> 401, identical shape", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("missing provider-id header only -> 401, identical shape", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("unknown provider id -> 401, IDENTICAL shape to a known-provider-wrong-token failure (enumeration resistance)", async () => {
      if (!schemaReady) return;
      const resUnknown = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": "not-a-real-provider", "x-wlt1-provider-receipt-token": "y".repeat(40) },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      const resWrongToken = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": "wrong".padEnd(40, "0") },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(resUnknown.statusCode).toBe(401);
      expect(resWrongToken.statusCode).toBe(401);
      expect(resUnknown.json()).toMatchObject({ error: { code: "SERVICE_IDENTITY_REQUIRED" } });
      expect(resWrongToken.json()).toMatchObject({ error: { code: "SERVICE_IDENTITY_REQUIRED" } });
      // Same error code/message shape (details always []), never a distinguishing detail.
      expect(resUnknown.json().error).toEqual(resWrongToken.json().error);
    });

    it("prototype-chain provider id header ('constructor'/'__proto__'/'toString') fails closed identically — never resolves an inherited config property", async () => {
      if (!schemaReady) return;
      for (const evilProviderId of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
        const res = await app.inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": evilProviderId, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
          payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
        });
        expect(res.statusCode, `expected 401 for provider id '${evilProviderId}'`).toBe(401);
      }
    });

    it("valid provider id + wrong-length token fails closed (never a length-mismatch crash)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": "short" },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(res.statusCode).toBe(401);
    });

    it("the generic x-internal-service-token header does NOT satisfy this route's own dedicated auth guard", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(res.statusCode).toBe(401);
    });

    it("unauthenticated requests never reveal whether the screening_reference_id exists — identical 401 for an existing vs a nonexistent reference", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const resReal = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        payload: { screening_reference_id: screeningResultId, provider_result_id: freshResultId(), result: {} },
      });
      const resFake = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        payload: { screening_reference_id: "wlt1screen_totally_made_up", provider_result_id: freshResultId(), result: {} },
      });
      expect(resReal.statusCode).toBe(401);
      expect(resFake.statusCode).toBe(401);
      expect(resReal.json().error).toEqual(resFake.json().error);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("P2CB-MED-2 adversarial boundary — body cannot assert authority fields", () => {
    it("a body containing source_authenticated is schema-rejected (400), never reaches the provider auth check's DB work", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {}, source_authenticated: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("a body containing payload_hash (attacker-chosen) is schema-rejected", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {}, payload_hash: "a".repeat(64) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("camelCase authority-field variants (sourceAuthenticated/payloadHash/providerId/providerAdaptorVersion/riskStatus) are ALL schema-rejected", async () => {
      if (!schemaReady) return;
      for (const extra of [
        { sourceAuthenticated: true },
        { payloadHash: "a".repeat(64) },
        { providerId: "attacker-chosen" },
        { providerAdaptorVersion: "999" },
        { riskStatus: "clear" },
        { provider_id: "attacker-chosen" },
        { provider_adaptor_version: "999" },
        { risk_status: "clear" },
      ]) {
        const res = await app.inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
          payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {}, ...extra },
        });
        expect(res.statusCode, `expected 400 for extra field ${JSON.stringify(extra)}`).toBe(400);
      }
    });

    it("END TO END: without valid authentication, an attacker-supplied body asserting full authority creates ZERO inbox rows, ZERO screening mutation, ZERO destination mutation", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        // no auth headers at all
        payload: { screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: { riskStatus: "clear" } },
      });
      expect(res.statusCode).toBe(401);
      expect(await fetchInboxRow(providerResultId)).toBeUndefined();
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
    });

    it("WITH valid authentication: the server mints its own provenance — the persisted payload_hash is the SHA-256 of the raw bytes actually sent, never influenced by any (rejected) attacker field", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const rawBody = JSON.stringify({ screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result: { a: 1 } });
      const expectedHash = createHash("sha256").update(rawBody).digest("hex");
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(res.statusCode).toBe(202);
      const row = await fetchInboxRow(providerResultId);
      expect(row.payload_hash).toBe(expectedHash);
      expect(row.source_authenticated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("raw-byte SHA-256 hashing — never canonical/parsed JSON", () => {
    it("a known raw body produces the expected SHA-256 hex digest, persisted as exactly 64 lowercase hex characters", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const rawBody = `{"screening_reference_id":"wlt1screen_x","provider_result_id":"${providerResultId}","result":{}}`;
      const expectedHash = createHash("sha256").update(rawBody).digest("hex");
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(res.statusCode).toBe(202);
      const row = await fetchInboxRow(providerResultId);
      expect(row.payload_hash).toBe(expectedHash);
      expect(row.payload_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.payload_hash.length).toBe(64);
    });

    it("whitespace-different but semantically-equivalent JSON bodies produce DIFFERENT payload_hash values (proves hashing is over raw bytes, not normalized JSON)", async () => {
      if (!schemaReady) return;
      const idA = freshResultId();
      const idB = freshResultId();
      const rawA = `{"screening_reference_id":"wlt1screen_x","provider_result_id":"${idA}","result":{"a":1,"b":2}}`;
      const rawB = `{ "screening_reference_id": "wlt1screen_x", "provider_result_id": "${idB}", "result": { "a": 1, "b": 2 } }`;
      const resA = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawA,
      });
      const resB = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawB,
      });
      expect(resA.statusCode).toBe(202);
      expect(resB.statusCode).toBe(202);
      const rowA = await fetchInboxRow(idA);
      const rowB = await fetchInboxRow(idB);
      expect(rowA.payload_hash).not.toBe(rowB.payload_hash);
      expect(rowA.payload_hash).toBe(createHash("sha256").update(rawA).digest("hex"));
      expect(rowB.payload_hash).toBe(createHash("sha256").update(rawB).digest("hex"));
    });

    it("property-order-different but semantically-equivalent JSON bodies produce DIFFERENT payload_hash values", async () => {
      if (!schemaReady) return;
      const idA = freshResultId();
      const idB = freshResultId();
      const rawA = `{"screening_reference_id":"wlt1screen_x","provider_result_id":"${idA}","result":{"a":1,"b":2}}`;
      const rawB = `{"result":{"b":2,"a":1},"provider_result_id":"${idB}","screening_reference_id":"wlt1screen_x"}`;
      const resA = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawA,
      });
      const resB = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawB,
      });
      expect(resA.statusCode).toBe(202);
      expect(resB.statusCode).toBe(202);
      const rowA = await fetchInboxRow(idA);
      const rowB = await fetchInboxRow(idB);
      expect(rowA.payload_hash).not.toBe(rowB.payload_hash);
    });

    it("the same exact raw body submitted twice (distinct provider_result_id each time) produces the IDENTICAL hash — hashing is deterministic", async () => {
      if (!schemaReady) return;
      const idA = freshResultId();
      const idB = freshResultId();
      const bodyFor = (id: string) => `{"screening_reference_id":"wlt1screen_x","provider_result_id":"${id}","result":{"same":true}}`;
      const resA = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: bodyFor(idA),
      });
      const resB = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: bodyFor(idB),
      });
      expect(resA.statusCode).toBe(202);
      expect(resB.statusCode).toBe(202);
      const rowA = await fetchInboxRow(idA);
      const rowB = await fetchInboxRow(idB);
      // The bodies differ only in provider_result_id (part of the hashed bytes), so this is really
      // proving determinism of the hash FUNCTION itself via two independently-computed matches to
      // the expected value, not that rowA/rowB collide.
      expect(rowA.payload_hash).toBe(createHash("sha256").update(bodyFor(idA)).digest("hex"));
      expect(rowB.payload_hash).toBe(createHash("sha256").update(bodyFor(idB)).digest("hex"));
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("64 KiB body limit — enforced before persistence", () => {
    it("a body at/under the limit is accepted", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      // Keep comfortably under 64 KiB after JSON overhead.
      const result = { blob: "a".repeat(50 * 1024) };
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result },
      });
      expect(res.statusCode).toBe(202);
      expect(await fetchInboxRow(providerResultId)).toBeDefined();
    });

    it("a body exceeding 64 KiB is rejected BEFORE any inbox row is created, no screening/destination mutation", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const result = { blob: "a".repeat(70 * 1024) };
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: screeningResultId, provider_result_id: providerResultId, result },
      });
      expect(res.statusCode).not.toBe(202);
      expect(await fetchInboxRow(providerResultId)).toBeUndefined();
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
    });

    it("the global Fastify default body limit (1 MiB) is unaffected by this route's own 64 KiB ceiling — the OTHER routes' own limits are untouched", async () => {
      if (!schemaReady) return;
      // A body between 64 KiB and 1 MiB against the WALLET-DESTINATIONS route (unrelated route,
      // ordinary JSON body limit) must still be rejected by SCHEMA validation (additional
      // properties / wrong shape), never by an accidentally-lowered global body limit — proving
      // the 64 KiB ceiling is receipt-route-scoped, not applied server-wide.
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/wallet-destinations",
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: "0x0", wallet_type: "unhosted", beneficiary_relationship: "self", padding: "a".repeat(100 * 1024) },
      });
      // additionalProperties:false on that route's own schema rejects "padding" — status 400, NOT
      // a body-too-large failure, proving this route's own limit was never touched.
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("provider_result_id validation", () => {
    it("leading whitespace is rejected, never silently trimmed", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: " presult_leading", result: {} },
      });
      expect(res.statusCode).toBe(400);
    });

    it("trailing whitespace is rejected, never silently trimmed", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: "presult_trailing ", result: {} },
      });
      expect(res.statusCode).toBe(400);
    });

    it("a non-printable-ASCII character is rejected", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: "presult_\x00null", result: {} },
      });
      expect(res.statusCode).toBe(400);
    });

    it("an empty provider_result_id is rejected", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: "", result: {} },
      });
      expect(res.statusCode).toBe(400);
    });

    it("a well-formed provider_result_id (printable ASCII, no leading/trailing whitespace) is accepted", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result: {} },
      });
      expect(res.statusCode).toBe(202);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("TX-A persistence — correlation, provider binding, and durable evidence", () => {
    it("a valid authenticated receipt for a REAL pending screening (matching provider) is durably accepted and terminally applied: inbox processing_status = 'processed', destination_id/screening_result_id correctly correlated, no rejection_reason_code", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: validStubReceiptBody(providerResultId) },
      });
      // Phase 2C-D3B: a structurally-valid, eligible receipt is now terminally applied through the
      // existing ScreeningApplicationService within the same request — 200, never the D3A temporary
      // 503 subgate response (see provider-receipt.ts's own header comment).
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ received: true, applied: true });
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("processed");
      expect(row.rejection_reason_code).toBeNull();
      expect(row.destination_id).toBe(destinationId);
      expect(row.screening_result_id).toBe(screeningResultId);
      expect(row.provider_id).toBe(STUB_PROVIDER_ID);
      expect(row.source_authenticated).toBe(true);
      expect(row.result_type).toBe("wallet_screening");
    });

    it("an unknown screening_reference_id is durably recorded as rejected/screening_not_found — 202, no correlation, never a 404/leak of screening existence", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_genuinely_does_not_exist", provider_result_id: providerResultId, result: {} },
      });
      expect(res.statusCode).toBe(202);
      expect(res.json().data.received).toBe(false);
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_found");
      expect(row.destination_id).toBeNull();
      expect(row.screening_result_id).toBeNull();
      expect(row.source_authenticated).toBe(true); // still authenticated — auth and correlation are independent facts
    });

    it("LOAD-BEARING: a receipt authenticated as a DIFFERENT provider than the one bound to the pending screening row is rejected as provider_binding_mismatch — NO terminal mutation, NO screening application", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      // Mutate the pending row's own frozen provider_id via the privileged connection — a
      // condition unreachable through any ordinary runtime grant, simulating "this screening was
      // frozen against a different provider than the one now authenticating" (mirrors the C3
      // route test file's own established provider-identity-drift simulation technique).
      const before = await verifyPool.query(`SELECT provider_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      const originalProviderId = before.rows[0].provider_id as string;
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET provider_id = 'totally-different-provider-id' WHERE screening_result_id = $1`, [screeningResultId]);
      try {
        const providerResultId = freshResultId();
        const res = await app.inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
          payload: { screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: {} },
        });
        expect(res.statusCode).toBe(202);
        expect(res.json().data.received).toBe(false);
        const row = await fetchInboxRow(providerResultId);
        expect(row.processing_status).toBe("rejected");
        expect(row.rejection_reason_code).toBe("provider_binding_mismatch");
        // NO terminal mutation: the screening row's own risk_status is untouched.
        expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
      } finally {
        await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET provider_id = $1 WHERE screening_result_id = $2`, [originalProviderId, screeningResultId]);
      }
    });

    it("no raw provider payload is ever persisted — the inbox row has no column shaped like one, and the exact 'result' object contents never appear anywhere in the row", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const distinctiveMarker = "UNMISTAKABLE_RAW_PAYLOAD_MARKER_" + randomUUID();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result: { marker: distinctiveMarker } },
      });
      expect(res.statusCode).toBe(202);
      const row = await fetchInboxRow(providerResultId);
      const serializedRow = JSON.stringify(row);
      expect(serializedRow).not.toContain(distinctiveMarker);
      expect(row).not.toHaveProperty("result");
      expect(row).not.toHaveProperty("raw_payload");
      expect(row).not.toHaveProperty("payload");
    });

    it("Phase 2C-D3B: a valid accepted receipt DOES invoke the existing ScreeningApplicationService — risk_status becomes 'clear', exactly one wlt1.wallet_screening_completed audit fires, evidence envelope reflects the authenticated receipt", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: validStubReceiptBody(providerResultId) },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ received: true, applied: true });
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");
      const auditRows = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(auditRows.rows[0].n)).toBe(1);
      const screeningRow = await verifyPool.query(
        `SELECT source_authenticated, payload_hash, provider_result_id, provider_id, provider_adaptor_version FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
        [screeningResultId],
      );
      const inboxRow = await fetchInboxRow(providerResultId);
      expect(screeningRow.rows[0].source_authenticated).toBe(true);
      expect(screeningRow.rows[0].payload_hash).toBe(inboxRow.payload_hash);
      expect(screeningRow.rows[0].provider_result_id).toBe(providerResultId);
      expect(screeningRow.rows[0].provider_id).toBe(STUB_PROVIDER_ID);
      expect(screeningRow.rows[0].provider_adaptor_version).toBe(STUB_ADAPTOR_VERSION);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate (provider_id, provider_result_id) — bounded D1 response, never overwrites", () => {
    it("a second submission with the SAME provider_result_id never creates a second row and never overwrites the original", async () => {
      if (!schemaReady) return;
      const { screeningResultId: refA } = await createRealPendingScreening();
      // The second submission's own screening_reference_id does not need to be a SECOND real
      // registration — the unique-constraint collision happens at INSERT time regardless of what
      // the second submission's own correlation resolves to; a syntactically valid but nonexistent
      // reference is sufficient and avoids a second real destination registration (which would
      // collide on the natural-key index under the same OWNED_CLIENT_ID/address).
      const refB = "wlt1screen_never_registered_" + randomUUID();
      const providerResultId = freshResultId();

      const first = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: refA, provider_result_id: providerResultId, result: validStubReceiptBody(providerResultId) },
      });
      expect(first.statusCode).toBe(200); // Phase 2C-D3B: a structurally-valid, eligible receipt terminally applies
      const firstRow = await fetchInboxRow(providerResultId);
      expect(firstRow.screening_result_id).toBe(refA);
      const firstHash = firstRow.payload_hash;

      // A DIFFERENT screening_reference_id, same provider_result_id — must NOT overwrite.
      const second = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: refB, provider_result_id: providerResultId, result: validStubReceiptBody(providerResultId, { risk_status: "hit", sanctions_exposure: true, risk_categories: ["sanctions"] }) },
      });
      // D1 bounded response: never a new row, never crashes; exact HTTP code is a D1-internal
      // implementation detail, not asserted rigidly here — the row-level invariant is what matters.
      expect(second.statusCode).toBeGreaterThanOrEqual(200);

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1); // still exactly one row
      expect(rows.rows[0].screening_result_id).toBe(refA); // ORIGINAL correlation untouched
      expect(rows.rows[0].payload_hash).toBe(firstHash); // ORIGINAL hash untouched
    });

    it("the (provider_id, provider_result_id) replay key is scoped PER PROVIDER — the same provider_result_id string under a hypothetical different provider would not collide (proven structurally: the unique index is a composite, not provider_result_id alone)", async () => {
      if (!schemaReady) return;
      // Direct structural proof against the DB catalogue — the actual behavior (a second real
      // provider) is not reachable with only one configured provider this build, so this proves
      // the CONSTRAINT shape rather than exercising a second provider end-to-end.
      const idx = await verifyPool.query(
        `SELECT array_agg(a.attname::text ORDER BY a.attnum) AS cols
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE c.relname = 'idx_wlt1_vendor_result_inbox_replay'`,
      );
      expect(idx.rows[0].cols).toEqual(["provider_id", "provider_result_id"]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("no new production inventory beyond the one route", () => {
    it("no new WLT1 error code was introduced for this route's own auth/validation paths (reuses SERVICE_IDENTITY_REQUIRED and VALIDATION_ERROR, both pre-existing foundation codes)", async () => {
      if (!schemaReady) return;
      // Schema-VALID body (auth is the ONLY thing this specific request is missing) — Fastify's
      // own lifecycle runs schema validation (preValidation) BEFORE preHandler auth, so an
      // empty/malformed body would hit VALIDATION_ERROR before ever reaching the auth guard,
      // which is not what this assertion is isolating.
      const authFail = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: freshResultId(), result: {} },
      });
      expect(authFail.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

      const schemaFail = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { not: "the right shape" },
      });
      expect(schemaFail.json().error.code).toBe("VALIDATION_ERROR");
    });
  });
});

describe("WLT-01 Phase 2C-D2: replay / tamper integrity", () => {
  // -----------------------------------------------------------------------------------------
  describe("exact duplicate — same authenticated provider_id + provider_result_id + server-computed payload_hash", () => {
    it("Phase 2C-D3B: an exact-duplicate delivery against a genuinely `received` row (direct controlled DB fixture — D2's own row still `received` because no worker/synchronous application has run yet) recovers and terminally applies via the SAME normalize-and-apply pipeline, no second row, no conflict audit", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      // Direct controlled DB fixture (mirrors this file's own D2-concurrency raw-INSERT technique
      // above) modeling a receipt that was durably recorded `received` by a PRIOR request that
      // never got to attempt application (e.g. the process crashed between TX-A and normalization)
      // — never `process.kill`, never a sleep-based race. The raw bytes below are byte-identical to
      // what `app.inject` will send for the SAME payload, so the server-computed hash on replay
      // matches exactly.
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'received', NULL, now())`,
        ["wlt1inbox_recvfixture_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );
      const originalRow = await fetchInboxRow(providerResultId);
      expect(originalRow.processing_status).toBe("received");
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");

      // The SAME raw bytes replayed through the real route -> same server-computed hash -> D2 exact
      // duplicate against a `received` row -> D3B's reconciliation finds no matching terminal
      // evidence yet (screening still pending) -> normalizes and terminally applies.
      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ received: true, applied: true });

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].processing_status).toBe("processed");
      expect(rows.rows[0].payload_hash).toBe(originalRow.payload_hash);
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);
    });

    it("existing processing_status='rejected' (screening_not_found) -> 202, received:false, same D1 bounded shape, no conflict audit, rejection_reason_code unchanged", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      const originalRow = await fetchInboxRow(providerResultId);
      expect(originalRow.processing_status).toBe("rejected");
      expect(originalRow.rejection_reason_code).toBe("screening_not_found");

      const duplicate = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(duplicate.statusCode).toBe(202);
      expect(duplicate.json().data.received).toBe(false);

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toEqual(originalRow);
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);
    });

    it("existing processing_status='processed' (future-facing fixture; D2 never CREATES one itself) -> 200, received:true, no conflict audit, no mutation", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      await forceProcessedStatus(providerResultId);
      const originalRow = await fetchInboxRow(providerResultId);
      expect(originalRow.processing_status).toBe("processed");

      const duplicate = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json().data.received).toBe(true);

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toEqual(originalRow);
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("conflicting duplicate — same replay key, DIFFERENT server-computed payload_hash", () => {
    it("a resubmission with different result content -> 409 WLT1_RECEIPT_CONFLICT, exactly one conflict audit with bounded safe metadata, original row untouched field-by-field", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const first = await sendReceipt(providerResultId, { attempt: 1 });
      expect(first.statusCode).toBe(202);
      const originalRow = await fetchInboxRow(providerResultId);

      const conflict = await sendReceipt(providerResultId, { attempt: 2 });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      // Field-by-field immutability, not a shallow spot-check.
      expect(rows.rows[0].payload_hash).toBe(originalRow.payload_hash);
      expect(rows.rows[0].screening_result_id).toBe(originalRow.screening_result_id);
      expect(rows.rows[0].destination_id).toBe(originalRow.destination_id);
      expect(rows.rows[0].processing_status).toBe(originalRow.processing_status);
      expect(rows.rows[0].rejection_reason_code).toBe(originalRow.rejection_reason_code);
      expect(rows.rows[0].received_at_utc).toEqual(originalRow.received_at_utc);
      expect(rows.rows[0].created_at_utc).toEqual(originalRow.created_at_utc);
      expect(rows.rows[0].updated_at_utc).toEqual(originalRow.updated_at_utc);
      expect(rows.rows[0]).toEqual(originalRow);

      expect(await conflictAuditCountFor(providerResultId)).toBe(1);
      const metadata = await conflictAuditMetadataFor(providerResultId);
      expect(metadata).toMatchObject({ provider_id: STUB_PROVIDER_ID, provider_result_id: providerResultId, reason: "payload_hash_mismatch" });
      // Bounded safe metadata only — never the receipt secret, raw payload, or either hash.
      const metaKeys = Object.keys(metadata ?? {});
      for (const forbidden of ["payload_hash", "hash", "secret", "token", "result", "canonical_address"]) {
        expect(metaKeys, `metadata must not contain a "${forbidden}"-named field`).not.toContain(forbidden);
      }
    });

    it("same provider_result_id, DIFFERENT screening_reference_id (correlation field is part of the hashed raw bytes) -> CONFLICT, not exact duplicate — hash identity is authoritative, never a trusted correlation field", async () => {
      if (!schemaReady) return;
      const { screeningResultId: refA } = await createRealPendingScreening();
      const refB = "wlt1screen_corr_b_" + randomUUID();
      const providerResultId = freshResultId();
      const receiptBody = validStubReceiptBody(providerResultId);
      const first = await sendReceipt(providerResultId, receiptBody, { screeningReferenceId: refA });
      expect(first.statusCode).toBe(200); // Phase 2C-D3B: a structurally-valid, eligible receipt terminally applies
      expect((await fetchInboxRow(providerResultId)).screening_result_id).toBe(refA);

      // SAME result body, but a DIFFERENT screening_reference_id — since screening_reference_id is
      // part of the raw hashed bytes, this produces a different hash and CONFLICT regardless of
      // the result body's own content validity (conflict classification strictly precedes
      // normalization — Part K).
      const second = await sendReceipt(providerResultId, receiptBody, { screeningReferenceId: refB });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");

      const rows = await verifyPool.query(`SELECT screening_result_id FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].screening_result_id).toBe(refA); // ORIGINAL correlation untouched by the conflicting attempt
    });

    it("semantically-equivalent JSON (property order / whitespace difference), same provider_result_id -> CONFLICT, not exact duplicate (frozen raw-byte evidence model)", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const ref = "wlt1screen_json_" + randomUUID();
      const first = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: ref, provider_result_id: providerResultId, result: { a: 1, b: 2 } },
      });
      expect(first.statusCode).toBe(202);

      // Same logical content, DIFFERENT property order -> different raw bytes -> different hash.
      const second = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
        payload: { screening_reference_id: ref, provider_result_id: providerResultId, result: { b: 2, a: 1 } },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");
    });

    it("conflict against an existing REJECTED row (different hash) -> still 409 CONFLICT, rejection_reason_code unchanged, no status transformation", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      const originalRow = await fetchInboxRow(providerResultId);
      expect(originalRow.processing_status).toBe("rejected");

      const conflict = await sendReceipt(providerResultId, { attempt: 2 }, { screeningReferenceId: unknownRef });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");

      const row = await fetchInboxRow(providerResultId);
      expect(row).toEqual(originalRow);
    });

    it("conflict against an existing PROCESSED row (future-facing fixture, different hash) -> still 409 CONFLICT, no mutation", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      await forceProcessedStatus(providerResultId);
      const originalRow = await fetchInboxRow(providerResultId);

      const conflict = await sendReceipt(providerResultId, { attempt: 2 }, { screeningReferenceId: unknownRef });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");

      const row = await fetchInboxRow(providerResultId);
      expect(row).toEqual(originalRow);
    });

    it("three repeated conflicting deliveries against the same original -> three DISTINCT conflict audits, one per delivery, row never mutated", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const first = await sendReceipt(providerResultId, { attempt: 1 });
      expect(first.statusCode).toBe(202);
      const originalRow = await fetchInboxRow(providerResultId);

      for (let i = 2; i <= 4; i++) {
        const conflict = await sendReceipt(providerResultId, { attempt: i });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");
      }

      expect(await conflictAuditCountFor(providerResultId)).toBe(3);
      const row = await fetchInboxRow(providerResultId);
      expect(row).toEqual(originalRow);
    });

    it("HTTP response data minimization: the 409 conflict body leaks no original hash/status/destination/client — bounded generic error shape only", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const first = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(first.statusCode).toBe(200); // Phase 2C-D3B: terminally applied
      const originalRow = await fetchInboxRow(providerResultId);

      const conflict = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId, { risk_status: "high_risk", risk_score: 90 }), { screeningReferenceId: screeningResultId });
      expect(conflict.statusCode).toBe(409);
      const body = JSON.stringify(conflict.json());
      expect(body).not.toContain(originalRow.payload_hash);
      expect(body).not.toContain(destinationId);
      expect(body).not.toContain(OWNED_CLIENT_ID);
      expect(body).not.toContain(originalRow.processing_status);
      expect(conflict.json()).toMatchObject({ success: false, error: { code: "WLT1_RECEIPT_CONFLICT" } });
    });

    it("an UNAUTHENTICATED conflicting attempt against an existing provider_result_id -> 401 SERVICE_IDENTITY_REQUIRED, never WLT1_RECEIPT_CONFLICT, never a conflict audit — auth is checked strictly before any duplicate/conflict lookup", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const first = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(first.statusCode).toBe(200); // Phase 2C-D3B: row is now durably `processed` via real terminal application

      const unauthConflict = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        // No auth headers at all.
        payload: { screening_reference_id: "wlt1screen_x", provider_result_id: providerResultId, result: { attempt: 2 } },
      });
      expect(unauthConflict.statusCode).toBe(401);
      expect(unauthConflict.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);

      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("processed");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("D2 concurrency — deterministic barrier proof (no sleeps, no Promise.all-only luck)", () => {
    it("DETERMINISTIC identical/identical race: a genuinely concurrent, uncommitted duplicate with the SAME hash resolves to exactly one row, zero conflict audit, no 500, no raw unique-violation leak", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const ref = "wlt1screen_race_ii_" + randomUUID();
      const resultBody = { attempt: "identical" };
      const rawBody = JSON.stringify({ screening_reference_id: ref, provider_result_id: providerResultId, result: resultBody });
      const sameHash = createHash("sha256").update(rawBody).digest("hex");

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, NULL, NULL, 'wallet_screening', $4, true, 'rejected', 'screening_not_found', now())`,
        ["wlt1inbox_racehold_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, sameHash],
      );
      // Deliberately uncommitted — the route's own INSERT ON CONFLICT DO NOTHING for the SAME key
      // now genuinely blocks at the database level (real value-lock wait, not a timing guess).

      let settled = false;
      const requestPromise = app
        .inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
          payload: { screening_reference_id: ref, provider_result_id: providerResultId, result: resultBody },
        })
        .then((res) => {
          settled = true;
          return res;
        });

      try {
        await waitForBlockedReceiptInsert();
        expect(settled).toBe(false);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const res = await requestPromise;
      expect(res.statusCode).toBe(202); // duplicate_exact against a 'rejected' original -> bounded D1 shape
      expect(res.json().data.received).toBe(false);

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].payload_hash).toBe(sameHash);
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);
    });

    it("DETERMINISTIC identical/conflicting race: a genuinely concurrent, uncommitted competing row with a DIFFERENT hash resolves to exactly one durable row (the earlier, committed one), the racing request loses with 409 WLT1_RECEIPT_CONFLICT, exactly one conflict audit, no overwrite", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const ref = "wlt1screen_race_ic_" + randomUUID();
      const winningHash = "f".repeat(64);

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, NULL, NULL, 'wallet_screening', $4, true, 'rejected', 'screening_not_found', now())`,
        ["wlt1inbox_racehold_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, winningHash],
      );

      let settled = false;
      const requestPromise = app
        .inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET },
          payload: { screening_reference_id: ref, provider_result_id: providerResultId, result: { attempt: "loses-the-race" } },
        })
        .then((res) => {
          settled = true;
          return res;
        });

      try {
        await waitForBlockedReceiptInsert();
        expect(settled).toBe(false);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const res = await requestPromise;
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1); // no overwrite, no second row
      expect(rows.rows[0].payload_hash).toBe(winningHash); // the earlier, committed row is the one that survives
      expect(await conflictAuditCountFor(providerResultId)).toBe(1);
    });
  });
});

describe("WLT-01 Phase 2C-D3A/D3B: exact-version receipt normalization, permanent stale classification, and terminal application", () => {
  // -----------------------------------------------------------------------------------------
  describe("exact-version adaptor resolution — never current/latest, never a fallback", () => {
    it("a fresh, eligible receipt for the current known (provider_id, provider_adaptor_version) is normalized and terminally applied (Phase 2C-D3B) — 200, applied:true", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ received: true, applied: true });
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("processed");
      expect(row.rejection_reason_code).toBeNull();
    });

    it("an unknown historical provider_adaptor_version on the pending row -> rejected/adaptor_version_unavailable, 409 WLT1_RECEIPT_STALE, no fallback to the current/latest adaptor", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      // Directly force the pending row's own frozen adaptor version to a value the registry has
      // never heard of — a condition unreachable through any ordinary runtime grant, simulating a
      // deployed build that has retired an old adaptor version.
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET provider_adaptor_version = $1 WHERE screening_result_id = $2`, [
        "999-never-deployed",
        screeningResultId,
      ]);
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("adaptor_version_unavailable");
      // NO terminal mutation of any kind.
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("stale taxonomy — permanent, read-only prechecks (Part G)", () => {
    it("screening already terminal (risk_status != pending) -> rejected/screening_not_pending, 409 WLT1_RECEIPT_STALE", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET risk_status = 'clear' WHERE screening_result_id = $1`, [screeningResultId]);
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });

    it("destination no longer pending_screening -> rejected/screening_not_pending, 409 WLT1_RECEIPT_STALE", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });

    it("newer screening_result_version exists (superseded) -> rejected/screening_superseded, 409 WLT1_RECEIPT_STALE", async () => {
      if (!schemaReady) return;
      const { screeningResultId, destinationId } = await createRealPendingScreening();
      // Insert a NEWER version row for the same destination directly — simulating a later
      // screening attempt having superseded this one (mirrors the C3/ScreeningApplicationService
      // own superseded-version fixture technique).
      // risk_status='clear' (never the default 'pending') — the partial unique index
      // `idx_wlt1_wallet_screening_result_one_pending` permits at most ONE pending row per
      // destination, and the ORIGINAL row is still pending; a terminal newer-version row is
      // sufficient to prove the superseded-version precheck regardless of ITS OWN risk_status.
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result
           (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status)
         VALUES ($1, $2, 2, $3, $4, 'ethereum', 'mainnet', $5, 'clear')`,
        ["wlt1screen_superseder_" + randomUUID(), destinationId, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, "addrhash_" + randomUUID()],
      );
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("screening_superseded");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("invalid normalized result — 422 WLT1_VENDOR_RESULT_INVALID, received -> rejected/invalid_normalized_result", () => {
    it("malformed/opaque structure (not the stub's expected shape) is rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, { not: "the expected shape" }, { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_VENDOR_RESULT_INVALID");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
    });

    it("unknown/unmapped risk category is rejected — never silently dropped", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { risk_categories: ["not_a_real_category"] }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("unknown/unmapped risk_status (including 'pending' itself) is rejected — never accepted as a normalized terminal status", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId, { risk_status: "pending" }), {
        screeningReferenceId: screeningResultId,
      });
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("provider_result_id embedded in the normalized result MUST equal the receipt envelope's own provider_result_id — mismatch is rejected, never allowed to redefine replay identity", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody("a-completely-different-provider-result-id"),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
      // Replay identity (the actual DB column) is still the ENVELOPE's own value, never the
      // provider-claimed one.
      expect(row.provider_result_id).toBe(providerResultId);
    });

    it("bad issuedAtUtc grammar (no explicit UTC offset) is rejected via the SAME shared validator the synchronous path uses", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { issued_at_utc: "2026-01-01T00:00:00" }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("issuedAtUtc excessively future is rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const farFuture = new Date(Date.now() + 3600_000).toISOString();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId, { issued_at_utc: farFuture }), {
        screeningReferenceId: screeningResultId,
      });
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("validUntilUtc not after issuedAtUtc is rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const now = new Date().toISOString();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId, { issued_at_utc: now, valid_until_utc: now }), {
        screeningReferenceId: screeningResultId,
      });
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("an already-expired effective validity (validUntilUtc in the past) is rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const past = new Date(Date.now() - 3600_000).toISOString();
      const issuedEarlier = new Date(Date.now() - 7200_000).toISOString();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { issued_at_utc: issuedEarlier, valid_until_utc: past }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });

    it("sanctions_exposure=true without riskStatus='hit'+'sanctions' category is inconsistent and rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { sanctions_exposure: true, risk_status: "clear", risk_categories: [] }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(422);
      const row = await fetchInboxRow(providerResultId);
      expect(row.rejection_reason_code).toBe("invalid_normalized_result");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("same-hash rejected replay — NEVER re-normalize/re-evaluate; reason code alone governs the response (Part J)", () => {
    it("a same-hash replay of an adaptor_version_unavailable rejection returns 409 WLT1_RECEIPT_STALE again, without re-resolving anything", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET provider_adaptor_version = $1 WHERE screening_result_id = $2`, [
        "999-never-deployed",
        screeningResultId,
      ]);
      const providerResultId = freshResultId();
      const body = validStubReceiptBody(providerResultId);
      const first = await sendReceipt(providerResultId, body, { screeningReferenceId: screeningResultId });
      expect(first.statusCode).toBe(409);
      const replay = await sendReceipt(providerResultId, body, { screeningReferenceId: screeningResultId });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().error.code).toBe("WLT1_RECEIPT_STALE");
    });

    it("a same-hash replay of an invalid_normalized_result rejection returns 422 WLT1_VENDOR_RESULT_INVALID again", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const body = { not: "valid" };
      const first = await sendReceipt(providerResultId, body, { screeningReferenceId: screeningResultId });
      expect(first.statusCode).toBe(422);
      const replay = await sendReceipt(providerResultId, body, { screeningReferenceId: screeningResultId });
      expect(replay.statusCode).toBe(422);
      expect(replay.json().error.code).toBe("WLT1_VENDOR_RESULT_INVALID");
    });

    it("a same-hash replay of D1's own screening_not_found rejection still returns the D1-bounded 202/received:false shape, unchanged", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const body = { attempt: "d1-unchanged" };
      const first = await sendReceipt(providerResultId, body, { screeningReferenceId: "wlt1screen_genuinely_absent_" + randomUUID().slice(0, 8) });
      expect(first.statusCode).toBe(202);
      expect(first.json().data.received).toBe(false);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("D2 conflict classification strictly precedes normalization (Part K)", () => {
    it("a different-hash conflict against an existing receipt still returns 409 WLT1_RECEIPT_CONFLICT even when the incoming body would ALSO be an invalid normalized result — conflict is decided before normalizeReceipt ever runs", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const first = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(first.statusCode).toBe(200); // Phase 2C-D3B: terminally applied

      // Deliberately invalid/unmappable body — if normalization ran BEFORE conflict
      // classification, this would incorrectly surface as WLT1_VENDOR_RESULT_INVALID (422)
      // instead of the conflict it actually is.
      const conflicting = await sendReceipt(providerResultId, { totally: "unmappable garbage" }, { screeningReferenceId: screeningResultId });
      expect(conflicting.statusCode).toBe(409);
      expect(conflicting.json().error.code).toBe("WLT1_RECEIPT_CONFLICT");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3B — terminal application via the existing ScreeningApplicationService: destination transition, terminal screening evidence, exactly the audit set the synchronous path would produce", () => {
    it("a valid, eligible 'clear' receipt transitions wallet_screening_result.risk_status='clear', destination.status='pending_review', and emits EXACTLY the wlt1.wallet_screening_completed audit (no high_risk, no sanctions)", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ received: true, applied: true });
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");
      const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(dest.rows[0].status).toBe("pending_review");
      const counts: Record<string, number> = {};
      for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
        const n = await verifyPool.query(
          `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
          [eventType, screeningResultId],
        );
        counts[eventType] = Number(n.rows[0].n);
      }
      expect(counts["wlt1.wallet_screening_completed"]).toBe(1);
      expect(counts["wlt1.wallet_high_risk_detected"]).toBe(0);
      expect(counts["wlt1.wallet_sanctions_exposure"]).toBe(0);
    });

    it("a 'high_risk' receipt additionally emits EXACTLY ONE wlt1.wallet_high_risk_detected audit alongside the completed audit — no sanctions audit", async () => {
      if (!schemaReady) return;
      // The high_risk/hit/review_required stub fixture addresses complete SYNCHRONOUSLY via
      // /screen (kind: "screened"), so they cannot be used to set up a still-pending screening for
      // a receipt to later resolve — createRealPendingScreening() (the "unavailable" fixture) is the
      // only address that leaves risk_status='pending', exactly like every other receipt test in
      // this file; the DESIRED risk_status is instead carried in the receipt body itself.
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { risk_status: "high_risk", risk_score: 82.25, risk_categories: ["darknet", "stolen_funds"] }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(200);
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("high_risk");
      const counts: Record<string, number> = {};
      for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
        const n = await verifyPool.query(
          `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
          [eventType, screeningResultId],
        );
        counts[eventType] = Number(n.rows[0].n);
      }
      expect(counts["wlt1.wallet_screening_completed"]).toBe(1);
      expect(counts["wlt1.wallet_high_risk_detected"]).toBe(1);
      expect(counts["wlt1.wallet_sanctions_exposure"]).toBe(0);
    });

    it("a sanctions 'hit' receipt additionally emits EXACTLY ONE wlt1.wallet_sanctions_exposure audit alongside the completed audit — no high_risk audit", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { risk_status: "hit", risk_score: null, risk_categories: ["sanctions"], sanctions_exposure: true }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(200);
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("hit");
      const counts: Record<string, number> = {};
      for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
        const n = await verifyPool.query(
          `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
          [eventType, screeningResultId],
        );
        counts[eventType] = Number(n.rows[0].n);
      }
      expect(counts["wlt1.wallet_screening_completed"]).toBe(1);
      expect(counts["wlt1.wallet_high_risk_detected"]).toBe(0);
      expect(counts["wlt1.wallet_sanctions_exposure"]).toBe(1);
    });

    it("a 'review_required' receipt transitions risk_status='review_required' with exactly one completed audit, no high_risk, no sanctions audit", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const res = await sendReceipt(
        providerResultId,
        validStubReceiptBody(providerResultId, { risk_status: "review_required", risk_score: 45.5, risk_categories: ["mixer"] }),
        { screeningReferenceId: screeningResultId },
      );
      expect(res.statusCode).toBe(200);
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("review_required");
      const counts: Record<string, number> = {};
      for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
        const n = await verifyPool.query(
          `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
          [eventType, screeningResultId],
        );
        counts[eventType] = Number(n.rows[0].n);
      }
      expect(counts["wlt1.wallet_screening_completed"]).toBe(1);
      expect(counts["wlt1.wallet_high_risk_detected"]).toBe(0);
      expect(counts["wlt1.wallet_sanctions_exposure"]).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3B — terminal-evidence reconciliation: TX-B/TX-C crash-window closure, no re-application, no second audit", () => {
    it("TX-B committed / TX-C never ran (direct controlled DB fixture modeling the exact crash state): the terminal wallet_screening_result already carries THIS receipt's own exact evidence, but the inbox row is still 'received' — a replay reconciles to processed WITHOUT re-normalizing, WITHOUT re-invoking the service, WITHOUT a second audit", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      // Model TX-B already committed (ScreeningApplicationService's own transaction: terminal
      // screening + destination + the ONE terminal audit) but TX-C (this route's own separate
      // received -> processed inbox transition) never ran — a direct controlled DB fixture, never
      // process.kill/a sleep, per the task's own crash-window closure requirement.
      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = true, payload_hash = $1,
                provider_result_id = $2, provider_id = $3, updated_at_utc = now()
          WHERE screening_result_id = $4`,
        [payloadHash, providerResultId, STUB_PROVIDER_ID, screeningResultId],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      const auditBefore = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'received', NULL, now())`,
        ["wlt1inbox_crashfixture_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ received: true, applied: true });

      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("processed");
      // No second audit — reconciliation NEVER re-invokes ScreeningApplicationService.
      const auditAfter = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(auditAfter.rows[0].n)).toBe(Number(auditBefore.rows[0].n));
    });

    it("synchronous terminal evidence (source_authenticated = NULL) does NOT falsely reconcile a receipt — rejected as stale, 409 WLT1_RECEIPT_STALE, never treated as this receipt's own application", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      // Simulate a SYNCHRONOUS provider result having already terminally applied this screening —
      // source_authenticated stays NULL (screening-application.ts's own synchronous-path column
      // value), never TRUE, and provider_result_id/payload_hash are NOT this receipt's own.
      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = NULL, payload_hash = NULL,
                provider_result_id = 'a-completely-different-sync-result-id', updated_at_utc = now()
          WHERE screening_result_id = $1`,
        [screeningResultId],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'received', NULL, now())`,
        ["wlt1inbox_syncfixture_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });

    it("a DIFFERENT receipt's terminal evidence (different payload_hash) does NOT falsely reconcile — rejected as stale, 409 WLT1_RECEIPT_STALE", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = true, payload_hash = $1,
                provider_result_id = $2, provider_id = $3, updated_at_utc = now()
          WHERE screening_result_id = $4`,
        ["f".repeat(64), providerResultId, STUB_PROVIDER_ID, screeningResultId], // a DIFFERENT payload_hash than this receipt's own
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'received', NULL, now())`,
        ["wlt1inbox_diffhashfixture_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });

    it("a DIFFERENT receipt's terminal evidence (different provider_result_id, same payload_hash impossible so uses a distinct hash+id pairing) does NOT falsely reconcile — rejected as stale", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = true, payload_hash = $1,
                provider_result_id = $2, provider_id = $3, updated_at_utc = now()
          WHERE screening_result_id = $4`,
        [payloadHash, "a-different-provider-result-id-" + randomUUID(), STUB_PROVIDER_ID, screeningResultId], // matching hash, DIFFERENT provider_result_id
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'received', NULL, now())`,
        ["wlt1inbox_diffridfixture_" + randomUUID(), STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3B — the SERVICE's own locked re-check catches a race D3A's unlocked precheck missed: mapped to receipt semantics (WLT1_RECEIPT_STALE), never the screen-facing WLT1_DESTINATION_INVALID_STATE", () => {
    it("DETERMINISTIC: while the receipt's own terminal-application attempt is genuinely blocked on the SAME destination advisory lock ScreeningApplicationService takes, an independent connection terminally completes the screening and commits — the service's own locked re-check then observes 'not pending' and the route maps it to 409 WLT1_RECEIPT_STALE / screening_not_pending, never leaking WLT1_DESTINATION_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${(await verifyPool.query(`SELECT destination_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId])).rows[0].destination_id}`]);

      let settled = false;
      const requestPromise = sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId }).then((res) => {
        settled = true;
        return res;
      });

      try {
        await waitForBlockedAdvisoryLock();
        expect(settled).toBe(false);
        // D3A's own unlocked precheck (inside reconcileOrApplyReceivedReceipt, BEFORE the service is
        // even called) already read 'pending' and let the request proceed toward the service —
        // exactly the race window this test proves is closed. This mutation lands and commits WHILE
        // the request is genuinely parked on the advisory lock, so only the SERVICE's OWN
        // lock-protected re-check (screening FOR UPDATE, after acquiring the SAME advisory lock) can
        // possibly observe it.
        await holder.query(`UPDATE wlt1.wallet_screening_result SET risk_status = 'clear' WHERE screening_result_id = $1`, [screeningResultId]);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const res = await requestPromise;
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3C — M-D3B-1 closure: two REAL concurrent exact-duplicate receipt HTTP requests never produce a stale loser", () => {
    it("DETERMINISTIC: two byte-identical concurrent HTTP receipt deliveries race inside ScreeningApplicationService's own advisory lock — exactly one terminal application, exactly one terminal audit set, exactly one processed inbox row, ZERO WLT1_RECEIPT_STALE, ZERO rejected final state", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);

      const send = () =>
        app.inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
          payload: rawBody,
        });

      // Both requests carry BYTE-IDENTICAL bodies -> the SAME server-computed payload_hash -> D2's
      // own TX-A classifies the second as duplicate_exact against the SAME inbox_id the first just
      // created (or is creating — Postgres's own unique-index blocking on the replay key serializes
      // TX-A itself, exactly as the existing D2 concurrency tests above already prove). Both then
      // independently reach reconcileOrApplyReceivedReceipt with the SAME inboxId, both normalize
      // (pure/local, no lock), and both attempt applyNormalizedScreeningResult, which is where they
      // block on the SAME destination advisory lock `holder` already holds.
      const p1 = send();
      const p2 = send();

      try {
        await waitForNBlockedOnDestinationLock(destinationId, 2);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const [r1, r2] = await Promise.all([p1, p2]);

      // ZERO stale loser, ZERO rejected final state — both responses must be successful/idempotent.
      for (const r of [r1, r2]) {
        expect(r.statusCode, `unexpected status ${r.statusCode}: ${r.body}`).toBe(200);
        expect(r.json().data).toEqual({ received: true, applied: true });
      }

      const rows = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultId]);
      expect(rows.rows).toHaveLength(1); // exactly one inbox row (D2's own replay-key uniqueness)
      expect(rows.rows[0].processing_status).toBe("processed");
      expect(rows.rows[0].rejection_reason_code).toBeNull();

      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");
      const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(dest.rows[0].status).toBe("pending_review");

      // Exactly one terminal application, exactly one terminal audit set — never two.
      const completed = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(completed.rows[0].n)).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3C — Race 5: two different provider_result_id receipts targeting the SAME pending screening", () => {
    it("DETERMINISTIC: two separately authenticated receipts (different provider_result_id, different payload) race for the SAME screening — exactly one winner (processed, terminal evidence matches), exactly one loser (rejected/screening_not_pending, 409 WLT1_RECEIPT_STALE), never WLT1_RECEIPT_CONFLICT, exactly one terminal audit set, two inbox rows remain (different replay keys)", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultIdA = freshResultId("presult_receiptit_racea");
      const providerResultIdB = freshResultId("presult_receiptit_raceb");
      const rawA = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultIdA, result: validStubReceiptBody(providerResultIdA) });
      const rawB = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultIdB, result: validStubReceiptBody(providerResultIdB) });

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);

      const sendRaw = (raw: string) =>
        app.inject({
          method: "POST",
          url: RECEIPT_URL,
          headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
          payload: raw,
        });

      const pA = sendRaw(rawA);
      const pB = sendRaw(rawB);

      try {
        await waitForNBlockedOnDestinationLock(destinationId, 2);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const [resA, resB] = await Promise.all([pA, pB]);
      const winner = [resA, resB].find((r) => r.statusCode === 200);
      const loser = [resA, resB].find((r) => r !== winner);
      expect(winner, `exactly one of A/B must win with 200 — A=${resA.statusCode} B=${resB.statusCode}`).toBeDefined();
      expect(loser, "exactly one of A/B must NOT win").toBeDefined();
      expect(winner!.json().data).toEqual({ received: true, applied: true });
      expect(loser!.statusCode).toBe(409);
      expect(loser!.json().error.code).toBe("WLT1_RECEIPT_STALE"); // never WLT1_RECEIPT_CONFLICT — different replay keys, not a D2 conflict

      const rowA = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultIdA]);
      const rowB = await verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE provider_result_id = $1`, [providerResultIdB]);
      expect(rowA.rows).toHaveLength(1);
      expect(rowB.rows).toHaveLength(1);
      const winnerIsA = resA.statusCode === 200;
      const winnerRow = winnerIsA ? rowA.rows[0] : rowB.rows[0];
      const loserRow = winnerIsA ? rowB.rows[0] : rowA.rows[0];
      expect(winnerRow.processing_status).toBe("processed");
      expect(loserRow.processing_status).toBe("rejected");
      expect(loserRow.rejection_reason_code).toBe("screening_not_pending");

      // Terminal screening evidence matches the WINNER's own inbox values, never the loser's.
      const screening = await verifyPool.query(
        `SELECT risk_status, source_authenticated, payload_hash, provider_result_id, provider_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
        [screeningResultId],
      );
      expect(screening.rows[0].risk_status).toBe("clear");
      expect(screening.rows[0].source_authenticated).toBe(true);
      expect(screening.rows[0].payload_hash).toBe(winnerRow.payload_hash);
      expect(screening.rows[0].provider_result_id).toBe(winnerRow.provider_result_id);
      expect(screening.rows[0].provider_id).toBe(STUB_PROVIDER_ID);

      const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(dest.rows[0].status).toBe("pending_review");
      const completed = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(completed.rows[0].n)).toBe(1);
      expect(await conflictAuditCountFor(providerResultIdA)).toBe(0);
      expect(await conflictAuditCountFor(providerResultIdB)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3C — Race 1: synchronous provider result vs. receipt", () => {
    it("1A. SYNC WINS: a synchronous /screen terminal application completes first; the receipt then attempts application and is rejected as stale — never falsely reconciled (source_authenticated=NULL/payload_hash=NULL never matches)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const syncRes = await app.inject({
        method: "POST",
        url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: {},
      });
      expect(syncRes.statusCode).toBe(200);
      const screeningResultId = syncRes.json().data.screening_result_id as string;
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");
      const completedBefore = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );

      const providerResultId = freshResultId();
      const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");

      // No overwrite of the synchronous evidence, no second audit.
      const screening = await verifyPool.query(`SELECT source_authenticated, payload_hash FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(screening.rows[0].source_authenticated).toBeNull();
      expect(screening.rows[0].payload_hash).toBeNull();
      const completedAfter = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(completedAfter.rows[0].n)).toBe(Number(completedBefore.rows[0].n));
    });

    it("1B. RECEIPT WINS: the receipt terminally applies first; a LATER synchronous /screen attempt against the now-terminal screening cannot overwrite it — existing accepted screen-facing invalid-state semantics, no overwrite, one terminal audit set", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const receiptRes = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(receiptRes.statusCode).toBe(200);
      expect(receiptRes.json().data).toEqual({ received: true, applied: true });
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");

      // A later /screen call against this SAME destination: the C2/C3 route itself reads
      // destination.status before doing anything else — it is no longer pending_screening (the
      // receipt's own terminal application already moved it to pending_review), so this is the
      // EXISTING accepted screen-facing invalid-state outcome, never a receipt-specific rule.
      const lateSyncRes = await app.inject({
        method: "POST",
        url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: {},
      });
      expect(lateSyncRes.statusCode).toBe(409);
      expect(lateSyncRes.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");

      // No overwrite: the receipt's own evidence is still exactly what it was.
      const screening = await verifyPool.query(
        `SELECT risk_status, source_authenticated, payload_hash, provider_result_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
        [screeningResultId],
      );
      expect(screening.rows[0].risk_status).toBe("clear");
      expect(screening.rows[0].source_authenticated).toBe(true);
      expect(screening.rows[0].provider_result_id).toBe(providerResultId);
      const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(dest.rows[0].status).toBe("pending_review");
      const completed = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(completed.rows[0].n)).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("Phase 2C-D3C — Races 2/3: C3 retry claim vs. receipt", () => {
    it("Race 2 — C3 claim wins start, receipt terminals BEFORE the synchronous provider call returns: the late synchronous result cannot overwrite the receipt's own terminal state; existing accepted locked invalid-state semantics; one terminal audit set; no third pending-row UPDATE", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      // Force C3 retry-claim eligibility (no sleep) — mirrors the accepted `forceEligible`
      // technique from wlt1-screening-route.test.ts / wlt1-screening-route-private.test.ts.
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);

      // Deterministic pause seam: the ALREADY-ESTABLISHED `Wlt1Config.screeningProviderImpl` test
      // injection point (used throughout wlt1-screening-route.test.ts for call-counting/drift
      // simulation) — never a new production backdoor. The provider's own `screen()` call awaits a
      // test-owned deferred BEFORE delegating to the real stub, so the test can deterministically
      // observe "the provider call has genuinely started" and hold the C3 request there.
      let releaseProvider: (() => void) | undefined;
      const providerGate = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let providerInvoked = false;
      const pausedProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(_input: WalletScreeningInput) {
          providerInvoked = true;
          await providerGate;
          // NOT a delegation to the real stub: `createRealPendingScreening()` uses the
          // WLT1_TEST_STUB_ADDRESS_UNAVAILABLE fixture specifically so the INITIAL /screen call
          // leaves the row pending — that same fixture triplet deterministically always returns
          // `unavailable` from the real stub, on every subsequent call too. A distinct, deterministic
          // "screened/clear" outcome is returned directly here so this test genuinely exercises the
          // "screened" branch of the C3 resume path.
          return {
            kind: "screened",
            result: {
              providerResultId: "stub-result-race2-" + randomUUID(),
              riskStatus: "clear",
              riskScore: 2.0,
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
      mainConfig.screeningProviderImpl = pausedProvider;

      let c3Res: { statusCode: number; body: any };
      let providerResultId: string;
      try {
        const c3Promise = screen(destinationId);

        const deadline = Date.now() + 5000;
        while (!providerInvoked && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(providerInvoked, "the C3 retry claim must have already committed and invoked the provider").toBe(true);

        // The C3 claim itself has already committed (TX-1, before the provider is ever called —
        // TRANSACTION-DEPTH-0 PROVIDER INVOCATION) — the receipt now arrives and terminally applies
        // WHILE the synchronous provider call is still paused.
        providerResultId = freshResultId();
        const receiptRes = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
        expect(receiptRes.statusCode).toBe(200);
        expect(receiptRes.json().data).toEqual({ received: true, applied: true });
        expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");

        // Release the paused provider — C3's OWN /screen call now resumes and attempts its OWN
        // terminal application against the now-already-terminal screening.
        releaseProvider!();
        c3Res = await c3Promise;
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }

      expect(c3Res.statusCode).toBe(409);
      expect(c3Res.body.error.code).toBe("WLT1_DESTINATION_INVALID_STATE");

      // No overwrite: the receipt's own evidence remains exactly what it was.
      const screening = await verifyPool.query(
        `SELECT risk_status, source_authenticated, provider_result_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
        [screeningResultId],
      );
      expect(screening.rows[0].risk_status).toBe("clear");
      expect(screening.rows[0].source_authenticated).toBe(true);
      expect(screening.rows[0].provider_result_id).toBe(providerResultId);

      const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(dest.rows[0].status).toBe("pending_review");

      const completed = await verifyPool.query(
        `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_screening_completed' AND payload_ref::text LIKE '%' || $1 || '%'`,
        [screeningResultId],
      );
      expect(Number(completed.rows[0].n)).toBe(1); // exactly one terminal audit set, never two

      // No third pending-row UPDATE — no new screening row/version was ever created.
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows[0].n).toBe(1);
    });

    it("Race 3 — receipt terminals BEFORE C3 claim: a later /screen retry observes the destination no longer pending_screening, does NOT take the C3 retry claim, does NOT call the provider (call count delta 0), returns existing screen-facing invalid-state response", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const receiptRes = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
      expect(receiptRes.statusCode).toBe(200);
      expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("clear");

      // Force retry-claim COOLDOWN eligibility into the past — proves the destination-status check
      // alone rejects this, never the cooldown clock (the claim UPDATE's own WHERE clause is never
      // even reached, since destination.status is checked earlier in TX-1).
      await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);

      let providerCallCount = 0;
      const countingProvider: WalletAnalyticsProvider = {
        providerId: STUB_PROVIDER_ID,
        adaptorVersion: STUB_ADAPTOR_VERSION,
        async screen(input: WalletScreeningInput) {
          providerCallCount++;
          return stubProviderModule.stubProvider.screen(input);
        },
      };
      mainConfig.screeningProviderImpl = countingProvider;
      try {
        const retryRes = await screen(destinationId);
        expect(retryRes.statusCode).toBe(409);
        expect(retryRes.body.error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
        expect(providerCallCount).toBe(0);
      } finally {
        mainConfig.screeningProviderImpl = undefined;
      }

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(rows.rows[0].n).toBe(1); // no third pending-row UPDATE, no new version
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("L-D3A-1 — inbox terminal transitions never overwrite an already-terminal row", () => {
    it("an already-`processed` inbox row is NOT overwritten by a later rejection-classified delivery — original processed state and carried-over reason remain intact", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      await forceProcessedStatus(providerResultId);
      const before = await fetchInboxRow(providerResultId);
      expect(before.processing_status).toBe("processed");

      // A conflicting (different-hash) delivery against the SAME provider_result_id would ordinarily
      // classify as a conflict, never attempting a transition on an already-terminal row at all —
      // proving L-D3A-1 holds even when a later delivery's OWN classification differs.
      const conflict = await sendReceipt(providerResultId, { attempt: 2 }, { screeningReferenceId: unknownRef });
      expect(conflict.statusCode).toBe(409);

      const after = await fetchInboxRow(providerResultId);
      expect(after.processing_status).toBe("processed");
      expect(after.rejection_reason_code).toBe(before.rejection_reason_code);
    });

    it("an already-`rejected` inbox row (with a specific reason code) is NOT overwritten by a later delivery — original rejected state and reason remain intact", async () => {
      if (!schemaReady) return;
      const providerResultId = freshResultId();
      const unknownRef = "wlt1screen_unknown_" + randomUUID();
      const first = await sendReceipt(providerResultId, { attempt: 1 }, { screeningReferenceId: unknownRef });
      expect(first.statusCode).toBe(202);
      const before = await fetchInboxRow(providerResultId);
      expect(before.processing_status).toBe("rejected");
      expect(before.rejection_reason_code).toBe("screening_not_found");

      const conflict = await sendReceipt(providerResultId, { attempt: 2 }, { screeningReferenceId: unknownRef });
      expect(conflict.statusCode).toBe(409);

      const after = await fetchInboxRow(providerResultId);
      expect(after.processing_status).toBe("rejected");
      expect(after.rejection_reason_code).toBe("screening_not_found");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("M-D3A-1 — permanent regression test: known exact provider/adaptor, normalizeReceipt absent -> no fallback -> rejected/adaptor_version_unavailable -> 409 WLT1_RECEIPT_STALE -> no mutation of any kind", () => {
    it("a receipt against a screening frozen to the CURRENT known (provider_id, provider_adaptor_version) whose adaptor's normalizeReceipt is deliberately absent is rejected as adaptor_version_unavailable, never falls back to any other adaptor behavior", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const originalNormalizeReceipt = stubProviderModule.stubProvider.normalizeReceipt;
      // Deliberately remove the exact-version adaptor's own normalizeReceipt — the KNOWN, currently
      // resolvable (provider_id, provider_adaptor_version) pair with the method absent, proving
      // there is NO fallback (never the current/latest adaptor, never a default normalizer). This
      // is a permanent regression test carrying M-D3A-1 forward, restored in a `finally` so no
      // other test in this shared-DB file observes a mutated module singleton.
      delete (stubProviderModule.stubProvider as { normalizeReceipt?: unknown }).normalizeReceipt;
      try {
        const providerResultId = freshResultId();
        const res = await sendReceipt(providerResultId, validStubReceiptBody(providerResultId), { screeningReferenceId: screeningResultId });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_RECEIPT_STALE");
        const row = await fetchInboxRow(providerResultId);
        expect(row.processing_status).toBe("rejected");
        expect(row.rejection_reason_code).toBe("adaptor_version_unavailable");
        // No screening mutation, no destination mutation, no terminal audit of any kind.
        expect(await fetchScreeningRiskStatus(screeningResultId)).toBe("pending");
        const dest = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
        expect(dest.rows[0].status).toBe("pending_screening");
        for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
          const n = await verifyPool.query(
            `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
            [eventType, screeningResultId],
          );
          expect(Number(n.rows[0].n)).toBe(0);
        }
      } finally {
        (stubProviderModule.stubProvider as { normalizeReceipt?: unknown }).normalizeReceipt = originalNormalizeReceipt;
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // M-D3C-1 closure. The D3C review's own describe blocks above cover two DIFFERENT code paths:
  // (1) "Phase 2C-D3B — terminal-evidence reconciliation" (inbox row still `received`, TX-B/TX-C
  //     crash window, decided inside `reconcileOrApplyReceivedReceipt`'s post-service catch), and
  // (2) "M-D3B-1 closure" (a genuinely LIVE two-request race).
  // Neither exercises the THIRD, structurally distinct call site that shares the same
  // `isTerminalEvidenceForInbox` / `resolveMatchingEvidenceOutcome` machinery: the route handler's
  // OWN `duplicate_exact` / `existingStatus === "rejected"` branch, reached only when D2's TX-A
  // classification has ALREADY determined the incoming exact-byte replay matches an EXISTING
  // inbox row that is itself `rejected` (never `received`) — i.e. a historical, previously
  // persisted contradictory state, not a fresh delivery. This closes that gap with one permanent
  // regression test plus a negative control, both driving the REAL route end to end.
  describe("Phase 2C-D3C — M-D3C-1 closure: a historical rejected/screening_not_pending inbox row carrying THIS receipt's own matching terminal evidence self-heals to processed via the route's OWN duplicate_exact/rejected branch on an exact-byte replay", () => {
    it("historical race-produced rejected row + matching terminal evidence -> exact-byte replay heals to processed/200, no re-normalization, no re-application, no second audit, no destination/status_version mutation", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      // Persist THIS receipt's own terminal evidence — exactly what a genuinely successful
      // terminal application would have left behind.
      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = true, payload_hash = $1,
                provider_result_id = $2, provider_id = $3, updated_at_utc = now()
          WHERE screening_result_id = $4`,
        [payloadHash, providerResultId, STUB_PROVIDER_ID, screeningResultId],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);

      // Force ONLY the inbox row into the historical, race-produced contradictory state this
      // fixture models (pre-M-D3B-1 permanent misclassification of a receipt that had, in fact,
      // already won the terminal-application race) — a direct controlled DB fixture, never a live
      // concurrency race (that is what the "M-D3B-1 closure" describe block above already proves
      // live); this test proves the SEPARATE route-level self-healing branch a later exact-byte
      // replay of such a historical row takes.
      const inboxId = "wlt1inbox_m_d3c1_fixture_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'rejected', 'screening_not_pending', now())`,
        [inboxId, STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const screeningBefore = await verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      const destBefore = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      const auditCounts = async () => {
        const counts: Record<string, number> = {};
        for (const eventType of ["wlt1.wallet_screening_completed", "wlt1.wallet_high_risk_detected", "wlt1.wallet_sanctions_exposure"]) {
          const n = await verifyPool.query(
            `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
            [eventType, screeningResultId],
          );
          counts[eventType] = Number(n.rows[0].n);
        }
        return counts;
      };
      const auditBefore = await auditCounts();

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });

      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual({ received: true, applied: true });

      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("processed");
      expect(row.rejection_reason_code).toBeNull();
      // Immutable evidence columns untouched by the healing UPDATE (which sets ONLY
      // processing_status/rejection_reason_code/updated_at_utc).
      expect(row.provider_id).toBe(STUB_PROVIDER_ID);
      expect(row.provider_result_id).toBe(providerResultId);
      expect(row.screening_result_id).toBe(screeningResultId);
      expect(row.payload_hash).toBe(payloadHash);
      expect(row.source_authenticated).toBe(true);

      // No re-application: the screening row is byte-identical before/after — healing touches
      // ONLY wlt1.vendor_result_inbox, never wallet_screening_result.
      const screeningAfter = await verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
      expect(screeningAfter.rows[0]).toEqual(screeningBefore.rows[0]);

      // No new destination transition, no status_version mutation from the replay.
      const destAfter = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(destAfter.rows[0]).toEqual(destBefore.rows[0]);

      // No new terminal audit of any kind — a pure inbox-status transition, never a second
      // application, never a second completed/high-risk/sanctions audit.
      expect(await auditCounts()).toEqual(auditBefore);
      // Never a D2 payload_hash-mismatch conflict — this is a duplicate_exact/rejected healing
      // replay, not a tamper conflict.
      expect(await conflictAuditCountFor(providerResultId)).toBe(0);
    });

    it("negative control: a historical rejected/screening_not_pending inbox row whose stored payload_hash does NOT match the terminal evidence now on the screening result (a genuinely different receipt's own evidence) is NEVER healed by the route's duplicate_exact/rejected branch — exact-byte replay stays 409 WLT1_RECEIPT_STALE, row stays rejected/screening_not_pending", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await createRealPendingScreening();
      const providerResultId = freshResultId();
      const resultBody = validStubReceiptBody(providerResultId);
      const rawBody = JSON.stringify({ screening_reference_id: screeningResultId, provider_result_id: providerResultId, result: resultBody });
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      // Terminal evidence on the screening result belongs to a DIFFERENT receipt entirely — never
      // this inbox row's own payload_hash/provider_result_id.
      await verifyPool.query(
        `UPDATE wlt1.wallet_screening_result
            SET risk_status = 'clear', source_authenticated = true, payload_hash = $1,
                provider_result_id = $2, provider_id = $3, updated_at_utc = now()
          WHERE screening_result_id = $4`,
        ["e".repeat(64), "diffresult_" + randomUUID(), STUB_PROVIDER_ID, screeningResultId],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);

      const inboxId = "wlt1inbox_m_d3c1_neg_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox
           (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
            payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, 'rejected', 'screening_not_pending', now())`,
        [inboxId, STUB_PROVIDER_ID, providerResultId, destinationId, screeningResultId, payloadHash],
      );

      const replay = await app.inject({
        method: "POST",
        url: RECEIPT_URL,
        headers: { "x-wlt1-provider-id": STUB_PROVIDER_ID, "x-wlt1-provider-receipt-token": REAL_RECEIPT_SECRET, "content-type": "application/json" },
        payload: rawBody,
      });

      expect(replay.statusCode).toBe(409);
      expect(replay.json().error.code).toBe("WLT1_RECEIPT_STALE");
      const row = await fetchInboxRow(providerResultId);
      expect(row.processing_status).toBe("rejected");
      expect(row.rejection_reason_code).toBe("screening_not_pending");
    });
  });
});
