/**
 * WLT-01 Phase 1B DB-gated integration tests. Self-skips unless `TEST_DATABASE_URL` points at a
 * Postgres that already has `foundation` (001, 005) and WLT-01's own `wlt1` schema (049) migrated,
 * with `fnd_runtime_grants.sql` and `wlt1_runtime_grants.sql` applied.
 *
 * Connects as `role_wlt1_runtime` via a real LOGIN role from the START (S1 lesson applied from day
 * one, per every prior module's own precedent — never superuser-only). A separate superuser
 * `pg.Pool` (`verifyPool`) is used for fixture setup/independent verification, never to drive the
 * app itself.
 *
 * WLT-01's first (and, this phase, only) cross-module HTTP dependency is CLT-01's client-status
 * route; `config.clt1FetchImpl` is stubbed per-test via `makeClt1StatusFetch` — this file proves
 * the ordinary happy/failure-path coverage against the stub; no live CLT-01 process is started.
 *
 * TRON test vectors are generated IN THIS FILE via the exact same `@noble/hashes`/`@scure/base`
 * primitives the implementation itself uses (`createBase58check(sha256)` over a fixed synthetic
 * 21-byte payload) rather than copied from an external, unverified source — this is a legitimate,
 * self-consistent construction: it tests that the implementation correctly validates the KNOWN
 * correct output of the standard Base58Check algorithm, built independently of
 * `canonicaliseTronAddress` itself. Ethereum test vectors are the canonical EIP-55 specification
 * examples, independently cross-validated (Phase 1B implementation notes) to converge to identical
 * canonical output whether supplied all-lowercase, all-uppercase, or correctly mixed-case.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { sha256 } from "@noble/hashes/sha2";
import { createBase58check } from "@scure/base";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { canonicaliseTronAddress } from "../../services/wlt1/src/lib/address/tron.js";
import {
  canonicaliseAddress,
  compareChainCoverageToDispatcher,
  CHAIN_DISPATCHER_INVENTORY,
  type ChainCoverageInventoryRow,
  type ChainDispatcherInventoryEntry,
} from "../../services/wlt1/src/lib/address/index.js";
import { computeAddressHash, computeNaturalKeyHash, isDuplicateNaturalKeyViolation, WALLET_DESTINATION_TYPE } from "../../services/wlt1/src/lib/destinations.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";

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
  stuckScreeningThresholdSeconds: 300,
};

const INTERNAL_HEADERS = { "x-internal-service-token": config.wlt1InternalServiceToken };

// ---------------------------------------------------------------------------------------------
// CLT-01 client-status fetch stub — own copy, F3(c), never imported from services/clt1/**.
// ---------------------------------------------------------------------------------------------
type CltOutcome = "active" | "active_limited" | "pending" | "suspended" | "restricted" | "closed" | "not_found" | "unreachable" | "malformed";

function makeClt1StatusFetch(statusByClientId: Record<string, CltOutcome>): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    const match = /\/internal\/clt1\/clients\/([^/]+)\/status$/.exec(urlStr);
    const clientId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    const outcome = clientId ? statusByClientId[clientId] : undefined;
    if (outcome === "unreachable") throw new Error("network down");
    if (outcome === "malformed") {
      return { ok: true, status: 200, json: async () => { throw new Error("not json"); } } as unknown as Response;
    }
    if (outcome === undefined || outcome === "not_found") {
      return { ok: false, status: 404, json: async () => ({ success: false }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: { client_id: clientId, status: outcome } }) } as Response;
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// Address test vectors.
// ---------------------------------------------------------------------------------------------
// Canonical EIP-55 specification examples.
const ETH_VALID_1 = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const ETH_VALID_2 = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";
const ETH_VALID_1_LOWER = "0x" + ETH_VALID_1.slice(2).toLowerCase();
const ETH_VALID_1_UPPER = "0x" + ETH_VALID_1.slice(2).toUpperCase();
const ETH_BAD_CHECKSUM = ETH_VALID_1.slice(0, -1) + (ETH_VALID_1.at(-1) === "d" ? "D" : "d"); // flips last char's case incorrectly
const ETH_ZERO = "0x" + "0".repeat(40);
const ETH_SHORT = ETH_VALID_1.slice(0, -2);
const ETH_INVALID_HEX = "0x" + "g".repeat(40);
const ETH_NO_PREFIX = ETH_VALID_1.slice(2);
const ETH_WITH_WHITESPACE = " " + ETH_VALID_1;
const ETH_WITH_ZERO_WIDTH = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe" + "\u200B" + "d";

const tronB58c = createBase58check(sha256);
function tronAddressFromPayload(bytes20: number[]): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(bytes20, 1);
  return tronB58c.encode(payload);
}
const TRON_VALID_1 = tronAddressFromPayload([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const TRON_VALID_2 = tronAddressFromPayload([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
const TRON_ZERO = tronAddressFromPayload(new Array(20).fill(0));
const TRON_WRONG_PREFIX = (() => {
  const p = new Uint8Array(21);
  p[0] = 0x00;
  for (let i = 1; i < 21; i++) p[i] = i;
  return tronB58c.encode(p);
})();
const TRON_BAD_CHECKSUM = TRON_VALID_1.slice(0, -1) + (TRON_VALID_1.at(-1) === "1" ? "2" : "1");
const TRON_BAD_ALPHABET = "T" + "0".repeat(33); // '0' is not a valid Base58 character
const TRON_WRONG_LENGTH = tronB58c.encode(new Uint8Array(20).fill(1)); // 20-byte payload, not 21

// P1B-LOW-3 (Phase 2A remediation): TRON_WRONG_PREFIX/TRON_WRONG_LENGTH above both Base58Check-
// encode to strings that do NOT start with "T" (see the vector-sanity test below), so they are
// caught by canonicaliseTronAddress's OWN `t_prefix_required` shape guard before the
// network-prefix/payload-length checks ever run — the Phase 1B tests using them were misnamed.
// These two vectors were independently found (and are independently re-verified below, not merely
// trusted) to genuinely reach `invalid_network_prefix`/`invalid_payload_length` because they DO
// start with a literal "T" while still failing the deeper check.
const TRON_INVALID_NETWORK_PREFIX = "Tn8EctySqJdn8YHp5tzb6Vz5NXyVdocoT";
const TRON_INVALID_PAYLOAD_LENGTH = "TjQg1dX";

function freshClientId(): string {
  return "clt1client_" + randomUUID();
}

function walletBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: freshClientId(),
    chain: "ethereum",
    network: "mainnet",
    address: ETH_VALID_1,
    wallet_type: "unknown",
    beneficiary_relationship: "self",
    ...overrides,
  };
}

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'foundation') AS fnd,
         (SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'wlt1') AS wlt1`,
    );
    const row = r.rows[0];
    return Number(row?.fnd) > 0 && Number(row?.wlt1) > 0;
  } catch {
    return false;
  }
}

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function register(body: Record<string, unknown>, idemKey: string, clt: CltOutcome = "active") {
  config.clt1FetchImpl = makeClt1StatusFetch({ [body.client_id as string]: clt });
  return app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey },
    payload: body,
  });
}

// ---------------------------------------------------------------------------------------------
// P1B-LOW-1 / P1B-LOW-2 (Phase 2A) — deterministic database-visible blocking proofs. Every helper
// below polls a REAL system view (never a plain sleep) for a REAL, precisely-scoped condition; the
// bounded poll loop is test SAFETY only (it fails loudly on timeout) — the evidence of blocking is
// the condition itself, observed to be true, not the passage of time.
// ---------------------------------------------------------------------------------------------

async function getBackendPid(client: Client): Promise<number> {
  const r = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return r.rows[0]!.pid;
}

/** Polls for at least `minWaiters` advisory-lock waiters BLOCKED SPECIFICALLY BY `holderPid`'s own
 * held advisory lock(s) — scoped by an exact (classid, objid, objsubid) join against the holder's
 * own granted lock row, never "any advisory lock anywhere", so this is immune to interference from
 * other integration test files' own unrelated advisory locks running concurrently against the same
 * shared TEST_DATABASE_URL. */
async function waitForAdvisoryLockWaiters(holderPid: number, minWaiters: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await verifyPool.query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM pg_locks waiting
         JOIN pg_locks holding
           ON holding.locktype = 'advisory'
          AND holding.granted = true
          AND holding.pid = $1
          AND waiting.locktype = 'advisory'
          AND waiting.granted = false
          AND waiting.classid = holding.classid
          AND waiting.objid = holding.objid
          AND waiting.objsubid = holding.objsubid`,
      [holderPid],
    );
    if (Number(r.rows[0]?.n ?? 0) >= minWaiters) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${minWaiters} advisory-lock waiter(s) blocked by backend pid ${holderPid}`);
}

/** Polls for a backend (other than the caller's own `verifyPool` connection) whose own query text
 * is literally the route's `wlt1.destination` INSERT and whose `wait_event_type = 'Lock'` — i.e. a
 * REAL row/value-lock wait on the destination table's own unique index, not an advisory lock and
 * not a guess based on elapsed time. */
async function waitForBlockedDestinationInsert(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await verifyPool.query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND state = 'active'
          AND pid <> pg_backend_pid()
          AND query ILIKE '%INSERT INTO wlt1.destination%'`,
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the route's own wlt1.destination INSERT to block on a competing uncommitted row");
}

describe("WLT-01 Phase 1B integration", () => {
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
    app = await buildApp(config);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  // M-REV-1 CLOSURE: a fail-loud canary proving the app's own runtime pool (`initPool(runtimeDbUrl)`
  // above) is GENUINELY connected as the restricted `${RUNTIME_ROLE_USER}` role, not `postgres` —
  // queried through the actual runtime pool's own connection identity (`current_user`/`session_user`
  // as PostgreSQL itself reports them for THIS session), never merely a catalogue lookup by role
  // name against a different (admin) connection. This is the exact failure mode the fragile
  // `.replace("postgres@", ...)` derivation could produce: a silently-unmatched rewrite leaves the
  // connection string's userinfo segment untouched, so the pool would keep authenticating as
  // `postgres` while every downstream "restricted role" assertion in this file passed vacuously.
  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser (fail-loud, not a silent skip)", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL with the wlt1 schema present — this must fail loudly, never silently pass.");
    const identityQuery = `SELECT current_user, session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    // NON-VACUITY (M-REV-1 CLOSURE BAR item 18): `verifyPool` is the ADMIN connection (the same
    // canonical `postgres` superuser every other WLT-01 test file's fixture setup already uses) —
    // proving IT resolves to `rolsuper: true, current_user: 'postgres'` demonstrates the assertion
    // pattern below is discriminating, not tautological: had the restricted-role probe below
    // suffered the exact M-REV-1 failure mode (URL rewrite silently no-op, connection stays
    // `postgres`), THIS SAME assertion shape would have failed loudly instead of passing.
    const adminIdentity = await verifyPool.query<{ current_user: string; rolsuper: boolean }>(identityQuery);
    expect(adminIdentity.rows[0]?.current_user).toBe("postgres");
    expect(adminIdentity.rows[0]?.rolsuper).toBe(true);

    // Deliberately queried via a SEPARATE connection opened with the SAME runtimeDbUrl derivation
    // the app pool above uses, so this proves the URL DERIVATION itself (not just the pre-existing
    // role's own catalogue attributes) resolves to the restricted role.
    const probe = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const probeResult = await probe.query<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean }>(identityQuery);
      const row = probeResult.rows[0];
      expect(row, "runtime-role identity query returned no row").toBeTruthy();
      expect(row.current_user).toBe(RUNTIME_ROLE_USER);
      expect(row.current_user).not.toBe("postgres");
      expect(row.session_user).toBe(RUNTIME_ROLE_USER);
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
    } finally {
      await probe.end();
    }
  });

  // P2CC2-MED-1 remediation: excludes the client_id namespaces owned by sibling test files that
  // share this SAME canonical database under Vitest's default cross-file parallelism
  // (`wlt1-screening-application.test.ts` uses `clt1client_screenapp`;
  // `wlt1-screening-route.test.ts` uses `clt1client_screenroute`) — this file's own cleanup was
  // previously a global, unscoped DELETE across every `wlt1.destination`/`wallet_destination`/
  // `address_integrity_check` row, which could (and, once a sibling file's tests started
  // spanning two sequential HTTP round-trips per test, empirically DID) delete another file's
  // in-flight fixture out from under it. This file's own fixtures never use either excluded
  // client_id, so the exclusion changes nothing about what this file itself cleans up.
  //
  // Acceptance-harness stabilization: also excludes the two sibling files' own deterministic
  // sentinel-proof "foreign owner" client_ids (`wlt1-screening-application.test.ts`'s Issue B
  // sentinel test, `wlt1-screening-route.test.ts`'s P2CC2-MED-1 sentinel test) — without this,
  // this file's own cleanup could delete a sentinel row mid-flight between that sentinel test's own
  // pre-cleanup snapshot and its post-cleanup assertion, corrupting an unrelated file's proof. This
  // was reproduced empirically (a FK violation here + a snapshot-mismatch failure in
  // wlt1-screening-application.test.ts's own sentinel test, in the SAME concurrent run) before this
  // fix.
  //
  // Phase 2C-D1: also excludes `wlt1-provider-receipt-route.test.ts`'s own `clt1client_
  // receiptroute` — that file registers/screens real destinations (via `createRealPendingScreening`)
  // exactly like this file and `wlt1-screening-route.test.ts` do, so it needs the identical
  // exclusion for the identical reason (reproduced empirically: an FK violation here on
  // `wallet_screening_result`/`wallet_destination` when both files ran concurrently before this
  // entry was added).
  const FOREIGN_CLIENT_IDS = [
    "clt1client_screenapp",
    "clt1client_screenroute",
    "clt1client_receiptroute",
    "clt1client_screenapp_sentinel_foreign",
    "clt1client_screenroute_sentinel_foreign",
    // Phase 3A-2: wlt1-proof-of-control-route.test.ts registers/screens real destinations against
    // the SAME shared canonical database, exactly like wlt1-provider-receipt-route.test.ts above —
    // same exclusion, same reason (an in-flight fixture race-deleted mid-test otherwise).
    "clt1client_pocroute",
    // Phase 3A-3: wlt1-poc-verify-route.test.ts, identical reason.
    "clt1client_pocverify",
    // Phase 3B: wlt1-poc-tron-verify-route.test.ts, identical reason.
    "clt1client_pocverifytron",
  ];

  // Factored out of `afterEach` (P2CC2-MED-1 validation) purely so a deterministic sentinel test
  // can invoke the EXACT SAME scoped cleanup logic the real `afterEach` runs, instead of a
  // re-typed copy of the SQL that could silently drift from the real implementation. Scoped to
  // this file's OWN idempotency action namespace ("wlt1.wallet_destination.register") — never the
  // shared "source_module = 'WLT-01'" superset, which would also delete
  // `wlt1-screening-route.test.ts`'s own "wlt1.wallet_destination.screen" idempotency records
  // mid-flight.
  async function cleanupOwnedIdempotencyRecords(): Promise<void> {
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.wallet_destination.register'`);
  }

  afterEach(async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id <> ALL($1))`, [FOREIGN_CLIENT_IDS]);
    await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id <> ALL($1))`, [FOREIGN_CLIENT_IDS]);
    // Fiat Payout Destinations (APAC) addition — this file's own fiat grant-boundary test
    // self-cleans (see its own `finally` block), but these three DELETEs are added defensively
    // for the SAME reason `wallet_destination`/`address_integrity_check` are pre-deleted above:
    // any future test in this file that leaves a fiat child row behind must never FK-block the
    // shared destination cleanup for every subsequent test.
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id <> ALL($1))`, [FOREIGN_CLIENT_IDS]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id <> ALL($1))`, [FOREIGN_CLIENT_IDS]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id <> ALL($1))`, [FOREIGN_CLIENT_IDS]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id <> ALL($1)`, [FOREIGN_CLIENT_IDS]);
    await cleanupOwnedIdempotencyRecords();
  });

  // -----------------------------------------------------------------------------------------
  describe("boot + no-Exchange-runtime under role_wlt1_runtime", () => {
    it("app boots and serves health under the least-privilege runtime role", async () => {
      // H-D3C-1: this is the ONE fail-loud canary in this file — mirrors the established
      // aml1/cfg1/fnd/iam/iam2/sec1 pattern exactly. Every OTHER test's own `if (!schemaReady)
      // return;` still self-skips silently (unchanged, benign when TEST_DATABASE_URL is genuinely
      // unset), but a schema/role/grant setup failure that happens WHILE a real TEST_DATABASE_URL
      // was supplied must never be indistinguishable from that benign skip — it must fail this one
      // test loudly instead of letting the whole file silently report all-green.
      if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
      expect(res.statusCode).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("migration inventory", () => {
    it("exactly 18 wlt1 tables exist (Fiat Payout Destinations APAC phase added fiat_payout_destination/fiat_rail_coverage/beneficiary_verification/fiat_screening_result; Evidence Export added evidence_export; Inbound-Source Screening added inbound_source_screening_result; Limits / Velocity / Concentration / First-Use added destination_limit_profile/limit_evaluation)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'wlt1' ORDER BY table_name`);
      expect(r.rows.map((row) => row.table_name)).toEqual([
        "address_integrity_check",
        "beneficiary_verification",
        "chain_coverage",
        "destination",
        "destination_decision",
        "destination_limit_profile",
        "destination_revocation",
        "evidence_export",
        "fiat_payout_destination",
        "fiat_rail_coverage",
        "fiat_screening_result",
        "inbound_source_screening_result",
        "limit_evaluation",
        "proof_of_control",
        "rescreening_run",
        "vendor_result_inbox",
        "wallet_destination",
        "wallet_screening_result",
      ]);
    });

    it("WLT-01's own migrations 055-066 are all present exactly once (066_wlt1_limits — Limits / Velocity / Concentration / First-Use — is WLT-01's latest owned migration); deliberately does NOT pin the platform-wide global migration head, since a later migration from another module (e.g. CLT-01) legitimately advances it without touching WLT-01", async () => {
      if (!schemaReady) return;
      for (const prefix of ["055", "056", "057", "058", "059", "060", "061", "062", "063", "064", "065", "066"]) {
        const r2 = await verifyPool.query(`SELECT count(*) FROM pgmigrations WHERE name LIKE $1`, [`${prefix}%`]);
        expect(Number(r2.rows[0]?.count), `migration ${prefix} missing`).toBe(1);
      }
    });

    it("wlt1.destination_revocation source-coherence CHECK widened to include rescreening; reason_code CHECK includes rescreen_adverse", async () => {
      if (!schemaReady) return;
      const coherence = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'chk_wlt1_destination_revocation_source_coherent'`,
      );
      expect(coherence.rows[0]?.def).toMatch(/rescreening/);
      const sourceCheck = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'destination_revocation_source_check'`,
      );
      expect(sourceCheck.rows[0]?.def).toMatch(/rescreening/);
      const reasonCheck = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'destination_revocation_reason_code_check'`,
      );
      expect(reasonCheck.rows[0]?.def).toMatch(/rescreen_adverse/);
    });

    it("wlt1.rescreening_run grants are SELECT+INSERT+column-scoped-UPDATE, no DELETE; identity/provenance columns not UPDATE-granted", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'rescreening_run' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const updateColumns = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'wlt1' AND table_name = 'rescreening_run' AND grantee = 'role_wlt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(updateColumns.rows.map((row) => row.column_name)).toEqual(
        ["candidates_selected", "completed_at_utc", "failures", "rescreened_adverse", "rescreened_clear", "revocations_triggered", "skipped", "status"].sort(),
      );
    });

    it("wlt1.rescreening_run scope/status/scope-coherence/terminal-coherence CHECKs and the status/started_at index all exist", async () => {
      if (!schemaReady) return;
      const scopeCheck = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.rescreening_run'::regclass AND conname = 'chk_wlt1_rescreening_run_scope_coherent'`,
      );
      expect(scopeCheck.rows).toHaveLength(1);
      const terminalCheck = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.rescreening_run'::regclass AND conname = 'chk_wlt1_rescreening_run_terminal_coherent'`,
      );
      expect(terminalCheck.rows).toHaveLength(1);
      const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'rescreening_run' AND indexname = 'idx_wlt1_rescreening_run_status_started'`);
      expect(idx.rows).toHaveLength(1);
      const fk = await verifyPool.query(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.rescreening_run'::regclass AND contype = 'f' AND confrelid = 'wlt1.destination'::regclass`,
      );
      expect(fk.rows).toHaveLength(1);
    });

    it("wlt1.destination_revocation grants are SELECT+INSERT only, no UPDATE/DELETE", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'destination_revocation' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
    });

    it("wlt1.destination_revocation source-coherence CHECK, partial unique signal_ref index, and destination index all exist", async () => {
      if (!schemaReady) return;
      const coherence = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'chk_wlt1_destination_revocation_source_coherent'`,
      );
      expect(coherence.rows).toHaveLength(1);
      expect(coherence.rows[0]?.def).toMatch(/operator/);
      expect(coherence.rows[0]?.def).toMatch(/aml/);
      const signalIdx = await verifyPool.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_revocation' AND indexname = 'idx_wlt1_destination_revocation_signal_ref'`,
      );
      expect(signalIdx.rows).toHaveLength(1);
      expect(signalIdx.rows[0]?.indexdef).toMatch(/UNIQUE/);
      expect(signalIdx.rows[0]?.indexdef).toMatch(/signal_ref IS NOT NULL/);
      const destIdx = await verifyPool.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_revocation' AND indexname = 'idx_wlt1_destination_revocation_destination'`,
      );
      expect(destIdx.rows).toHaveLength(1);
    });

    it("wlt1.destination_decision.poc_challenge_id is nullable (PoC Evidence-ID Addendum) and the table's grants are SELECT+INSERT+column-scoped-UPDATE, no DELETE (Phase 4B added UPDATE limited to exactly status/consumed_at_utc/consumption_id/execution_ref)", async () => {
      if (!schemaReady) return;
      const col = await verifyPool.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND column_name = 'poc_challenge_id'`,
      );
      expect(col.rows[0]?.is_nullable).toBe("YES");
      // Table-level grants (role_table_grants) surface only SELECT/INSERT — the Phase 4B UPDATE
      // grant is deliberately COLUMN-scoped, so it never appears in that view at all (same reason
      // `destination`'s/`wallet_screening_result`'s own column-scoped UPDATE grants don't either —
      // see this file's own established `column_privileges`-only precedent below).
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const updateColumns = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND grantee = 'role_wlt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(updateColumns.rows.map((row) => row.column_name)).toEqual(["consumed_at_utc", "consumption_id", "execution_ref", "status"]);
    });

    it("wlt1.destination_decision.status CHECK permits exactly issued/consumed (Phase 4B); consumption coherence CHECK and partial unique index on consumption_id both exist", async () => {
      if (!schemaReady) return;
      const def = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_decision'::regclass AND conname = 'destination_decision_status_check'`,
      );
      expect(def.rows[0]?.def).toMatch(/issued/);
      expect(def.rows[0]?.def).toMatch(/consumed/);
      const coherence = await verifyPool.query(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.destination_decision'::regclass AND conname = 'chk_wlt1_destination_decision_consumption_coherent'`,
      );
      expect(coherence.rows).toHaveLength(1);
      const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_decision' AND indexname = 'idx_wlt1_destination_decision_consumption_id'`);
      expect(idx.rows).toHaveLength(1);
      expect(idx.rows[0]?.indexdef).toMatch(/consumption_id/);
    });

    it("verification_scheme CHECK permits exactly eip191_personal_sign and tron_personal_sign after migration 054", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.proof_of_control'::regclass AND conname = 'proof_of_control_verification_scheme_check'`,
      );
      expect(r.rows[0]?.def).toMatch(/eip191_personal_sign/);
      expect(r.rows[0]?.def).toMatch(/tron_personal_sign/);
    });

    it("wallet_screening_result.address_hash is varchar(128) (Phase 2C-C1 compatibility correction, migration 052)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT character_maximum_length AS len FROM information_schema.columns
          WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result' AND column_name = 'address_hash'`,
      );
      expect(Number(r.rows[0]?.len)).toBe(128);
    });

    it("exactly 2 chain-coverage seed rows: ethereum/mainnet, tron/mainnet, both bound to the frozen stub provider id", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT chain, network, coverage_status, activation_status, provider_id FROM wlt1.chain_coverage ORDER BY chain`,
      );
      expect(r.rows).toEqual([
        { chain: "ethereum", network: "mainnet", coverage_status: "supported", activation_status: "active", provider_id: "stub-wallet-analytics-v1" },
        { chain: "tron", network: "mainnet", coverage_status: "supported", activation_status: "active", provider_id: "stub-wallet-analytics-v1" },
      ]);
    });

    it("Phase 4A-1: destination.status CHECK is widened under the explicit chk_wlt1_destination_status name to exactly draft/pending_screening/pending_review/approved_pending_cooling/active/revoked (the frozen six-state Phase 4A lifecycle enum)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination'::regclass AND contype = 'c' AND conname LIKE '%status%'`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].conname).toBe("chk_wlt1_destination_status");
      const def = r.rows[0].def as string;
      expect(def).toContain("'draft'");
      expect(def).toContain("'pending_screening'");
      expect(def).toContain("'pending_review'");
      expect(def).toContain("'approved_pending_cooling'");
      expect(def).toContain("'active'");
      expect(def).toContain("'revoked'");
      // No later-phase state (Phase 4A-2's own future consumption/verify states, or 'restricted' —
      // never adopted from the blueprint) exists.
      expect(def).not.toContain("'restricted'");
      expect(def).not.toContain("'consumed'");
    });

    it("Phase 2C-B: destination.status column was widened to varchar(32) to accommodate 'pending_screening' (17 chars, over the prior varchar(16) limit)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT character_maximum_length AS len FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination' AND column_name = 'status'`,
      );
      expect(Number(r.rows[0]?.len)).toBe(32);
    });

    it("P1B-LOW-5 / Phase 2B: exact index inventory covering ALL SIX current wlt1 tables — fails if an unreviewed index is later added or removed on any of them", async () => {
      if (!schemaReady) return;
      const indexesFor = async (table: string): Promise<string[]> => {
        const r = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = $1 ORDER BY indexname`, [table]);
        return r.rows.map((row) => row.indexname as string);
      };
      // "*_<column>_key" entries are Postgres's own auto-named indexes backing an inline `UNIQUE`
      // column constraint — harmless duplicates of the matching explicit `idx_wlt1_*` index, same
      // precedent KYC-01's own migration 042 established. Recorded explicitly here (P1B-LOW-5), not
      // silently hidden, across all four Phase 1B tables. Migration 050's two new tables
      // DELIBERATELY avoid this pattern — screening_result_id/inbox_id are plain (not inline
      // UNIQUE) columns, so each carries exactly ONE explicit named unique index, no duplicate pair.
      expect(await indexesFor("destination")).toEqual([
        "destination_destination_id_key",
        "destination_pkey",
        "idx_wlt1_destination_client_id_status",
        "idx_wlt1_destination_destination_id",
        "idx_wlt1_destination_natural_key",
        // Phase 4A-1 (migration 055) — partial index supporting the future Phase 4A-2 lazy
        // active-promotion lookup.
        "idx_wlt1_destination_status_cooling",
      ]);
      expect(await indexesFor("wallet_destination")).toEqual([
        "idx_wlt1_wallet_destination_chain_network_hash",
        "idx_wlt1_wallet_destination_destination_id",
        "wallet_destination_destination_id_key",
        "wallet_destination_pkey",
      ]);
      expect(await indexesFor("address_integrity_check")).toEqual([
        "address_integrity_check_address_check_id_key",
        "address_integrity_check_pkey",
        "idx_wlt1_address_integrity_check_client_created",
        "idx_wlt1_address_integrity_check_destination_id",
        "idx_wlt1_address_integrity_check_id",
      ]);
      expect(await indexesFor("chain_coverage")).toEqual([
        "chain_coverage_coverage_id_key",
        "chain_coverage_pkey",
        "idx_wlt1_chain_coverage_chain_network",
        "idx_wlt1_chain_coverage_id",
      ]);
      expect(await indexesFor("wallet_screening_result")).toEqual([
        "idx_wlt1_wallet_screening_result_destination_status",
        "idx_wlt1_wallet_screening_result_destination_version",
        "idx_wlt1_wallet_screening_result_id",
        "idx_wlt1_wallet_screening_result_one_pending",
        "wallet_screening_result_pkey",
      ]);
      expect(await indexesFor("vendor_result_inbox")).toEqual([
        "idx_wlt1_vendor_result_inbox_id",
        "idx_wlt1_vendor_result_inbox_provider_status",
        "idx_wlt1_vendor_result_inbox_replay",
        "vendor_result_inbox_pkey",
      ]);
    });

    // The Phase 2B/2C-A "exactly zero rows exist in wallet_screening_result and vendor_result_inbox
    // (no Phase 2C route has ever run)" assertion that previously lived here is REMOVED, not
    // weakened silently: Phase 2C-B's `tests/integration/wlt1-screening-application.test.ts` now
    // legitimately creates and cleans up rows in both tables (via direct SQL, exercising
    // `applyNormalizedScreeningResult`) against this SAME shared database, so a zero-rows
    // assertion in THIS file would race against that file's own test execution under Vitest's
    // default cross-file parallelism. No route in THIS file ever touches either table, so no
    // meaningful invariant about their contents can be asserted from here anymore.
  });

  // -----------------------------------------------------------------------------------------
  describe("Fiat Payout Destinations (APAC) — grant boundary + coverage schema (live probes, not static grep)", () => {
    it("wlt1.fiat_rail_coverage is SELECT-only for role_wlt1_runtime — no INSERT/UPDATE/DELETE/TRUNCATE, live 42501 probes", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'fiat_rail_coverage' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((row) => row.privilege_type)).toEqual(["SELECT"]);

      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(
          appPool.query(`INSERT INTO wlt1.fiat_rail_coverage (coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status) VALUES ('x','apac_local_my','MY','MYR','local_account','bic','supported','active')`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE coverage_id = 'wlt1cov_fiat_my_myr'`)).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`DELETE FROM wlt1.fiat_rail_coverage WHERE coverage_id = 'wlt1cov_fiat_my_myr'`)).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`TRUNCATE wlt1.fiat_rail_coverage`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });

    it("exactly four fiat_rail_coverage seed rows exist, all supported+inactive — no active corridor shipped", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT coverage_id, rail, bank_country, currency, coverage_status, activation_status FROM wlt1.fiat_rail_coverage ORDER BY coverage_id`);
      expect(rows.rows).toEqual([
        { coverage_id: "wlt1cov_fiat_hk_hkd", rail: "apac_local_hk", bank_country: "HK", currency: "HKD", coverage_status: "supported", activation_status: "inactive" },
        { coverage_id: "wlt1cov_fiat_id_idr", rail: "apac_local_id", bank_country: "ID", currency: "IDR", coverage_status: "supported", activation_status: "inactive" },
        { coverage_id: "wlt1cov_fiat_my_myr", rail: "apac_local_my", bank_country: "MY", currency: "MYR", coverage_status: "supported", activation_status: "inactive" },
        { coverage_id: "wlt1cov_fiat_sg_sgd", rail: "apac_local_sg", bank_country: "SG", currency: "SGD", coverage_status: "supported", activation_status: "inactive" },
      ]);
    });

    it("fiat_rail_coverage status CHECKs are TWO-valued (supported/unsupported, active/inactive) — NOT copied single-valued from chain_coverage", async () => {
      if (!schemaReady) return;
      const coverageDef = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.fiat_rail_coverage'::regclass AND conname = 'fiat_rail_coverage_coverage_status_check'`,
      );
      expect(coverageDef.rows[0]?.def).toMatch(/supported/);
      expect(coverageDef.rows[0]?.def).toMatch(/unsupported/);
      const activationDef = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.fiat_rail_coverage'::regclass AND conname = 'fiat_rail_coverage_activation_status_check'`,
      );
      expect(activationDef.rows[0]?.def).toMatch(/active/);
      expect(activationDef.rows[0]?.def).toMatch(/inactive/);
    });

    it("wlt1.fiat_payout_destination: UPDATE grant is column-scoped to EXACTLY verification_status/updated_at_utc — every identity column is immutable, live 42501 probes", async () => {
      if (!schemaReady) return;
      const grants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'fiat_payout_destination' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(grants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const updateColumns = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'wlt1' AND table_name = 'fiat_payout_destination' AND grantee = 'role_wlt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(updateColumns.rows.map((row) => row.column_name)).toEqual(["updated_at_utc", "verification_status"]);

      const destinationId = "wlt1dest_fiatgrant_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,'clt1client_fiatgrant','fiat_payout',$2,'draft')`, [destinationId, "hash_" + randomUUID()]);
      await verifyPool.query(
        `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
         VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678','hash_acct','ciphertext','MYR','apac_local_my')`,
        [destinationId],
      );

      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const column of ["account_identifier_hash", "account_identifier_encrypted", "account_identifier_masked", "bank_country", "bank_identifier", "currency", "rail", "beneficiary_name", "beneficiary_name_normalized"]) {
          // A single-character value fits every one of these columns' own varchar bound (the
          // narrowest is bank_country at varchar(2)) — the permission denial is what this probe
          // is testing, never a length-constraint distraction.
          await expect(appPool.query(`UPDATE wlt1.fiat_payout_destination SET ${column} = 'X' WHERE destination_id = $1`, [destinationId])).rejects.toMatchObject({ code: "42501" });
        }
        // verification_status IS mutable.
        await expect(appPool.query(`UPDATE wlt1.fiat_payout_destination SET verification_status = 'verified' WHERE destination_id = $1`, [destinationId])).resolves.toBeDefined();
        await expect(appPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
        // Self-clean the fiat child row BEFORE this file's shared `afterEach` deletes the parent
        // `wlt1.destination` row (its own DELETE list predates this table and does not know about
        // it) — never leaving a dangling FK violation for the next test in this file.
        await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      }
    });

    it("wlt1.fiat_payout_destination branch coherence CHECK: HK requires branch_identifier NOT NULL, non-HK requires it NULL", async () => {
      if (!schemaReady) return;
      const def = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.fiat_payout_destination'::regclass AND conname = 'chk_wlt1_fiat_payout_destination_branch_coherent'`,
      );
      expect(def.rows[0]?.def).toMatch(/HK/);
      expect(def.rows[0]?.def).toMatch(/branch_identifier/);
    });

    it("wlt1.beneficiary_verification and wlt1.fiat_screening_result are SELECT+INSERT ONLY — no UPDATE, no DELETE (append-only evidence)", async () => {
      if (!schemaReady) return;
      const verificationGrants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'beneficiary_verification' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(verificationGrants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
      const screeningGrants = await verifyPool.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'wlt1' AND table_name = 'fiat_screening_result' AND grantee = 'role_wlt1_runtime' ORDER BY privilege_type`,
      );
      expect(screeningGrants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
    });

    it("wlt1.fiat_screening_result.risk_status has NO DEFAULT and its CHECK excludes 'pending' — no pending screening row can ever exist", async () => {
      if (!schemaReady) return;
      const col = await verifyPool.query(
        `SELECT column_default FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'fiat_screening_result' AND column_name = 'risk_status'`,
      );
      expect(col.rows[0]?.column_default).toBeNull();
      const def = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.fiat_screening_result'::regclass AND conname = 'fiat_screening_result_risk_status_check'`,
      );
      expect(def.rows[0]?.def).not.toMatch(/pending/);
      expect(def.rows[0]?.def).toMatch(/clear/);
      expect(def.rows[0]?.def).toMatch(/hit/);
    });

    it("wlt1.destination_decision gained destination_type NOT NULL + rail/currency/beneficiary_verification_id, chain/network are now nullable, and pre-existing rows backfilled to 'wallet'", async () => {
      if (!schemaReady) return;
      const cols = await verifyPool.query(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND column_name IN ('destination_type','chain','network','rail','currency','beneficiary_verification_id') ORDER BY column_name`,
      );
      const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r.is_nullable]));
      expect(byName.destination_type).toBe("NO");
      expect(byName.chain).toBe("YES");
      expect(byName.network).toBe("YES");
      expect(byName.rail).toBe("YES");
      expect(byName.currency).toBe("YES");
      expect(byName.beneficiary_verification_id).toBe("YES");
    });

    it("no UPDATE grant was added to destination_decision merely because new issuance columns exist — Phase 4B's own column-scoped set is unchanged", async () => {
      if (!schemaReady) return;
      const updateColumns = await verifyPool.query(
        `SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND grantee = 'role_wlt1_runtime' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      expect(updateColumns.rows.map((row) => row.column_name)).toEqual(["consumed_at_utc", "consumption_id", "execution_ref", "status"]);
    });

    it("wlt1.destination_revocation is untouched by migration 061 — no new source/reason_code value", async () => {
      if (!schemaReady) return;
      const def = await verifyPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'destination_revocation_source_check'`,
      );
      expect(def.rows[0]?.def).toMatch(/operator/);
      expect(def.rows[0]?.def).toMatch(/aml/);
      expect(def.rows[0]?.def).toMatch(/rescreening/);
      expect(def.rows[0]?.def).not.toMatch(/fiat/);
    });
  });

  // -----------------------------------------------------------------------------------------
  // P1B-MED-1 remediation (Phase 2A) — the database's own supported/active wlt1.chain_coverage
  // rows and the runtime address dispatcher's own CHAIN_DISPATCHER_INVENTORY are now PROVEN
  // aligned, in both directions, on chain/network/address_format/canonicalisation_version — not
  // merely asserted identical by two independently hand-maintained lists. The AUTHORITATIVE test
  // below compares REAL rows from the real database against the REAL runtime registry (imported
  // directly from services/wlt1/src, never re-declared here); the DRIFT meta-tests exercise the
  // pure `compareChainCoverageToDispatcher` function with synthetic one-sided drift to prove the
  // control is actually CAPABLE of failing, not merely capable of passing on data that already
  // agrees. No database mutation is used for the drift tests — the comparison function is pure, so
  // synthetic in-memory inventories are sufficient and leave nothing to roll back.
  // -----------------------------------------------------------------------------------------
  describe("chain-coverage / dispatcher bidirectional sync (P1B-MED-1)", () => {
    it("AUTHORITATIVE: every supported/active wlt1.chain_coverage row matches the runtime dispatcher inventory in both directions, including address_format and canonicalisation_version", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query<ChainCoverageInventoryRow>(
        `SELECT chain, network, address_format, canonicalisation_version
           FROM wlt1.chain_coverage
          WHERE coverage_status = 'supported' AND activation_status = 'active'
          ORDER BY chain`,
      );
      const mismatches = compareChainCoverageToDispatcher(r.rows, CHAIN_DISPATCHER_INVENTORY);
      expect(mismatches, JSON.stringify(mismatches)).toEqual([]);
      // Non-vacuous: prove both sides actually contain the two approved pairs, not two empty sets
      // that would trivially "match".
      expect(r.rows.map((row) => `${row.chain}/${row.network}`).sort()).toEqual(["ethereum/mainnet", "tron/mainnet"]);
      expect(CHAIN_DISPATCHER_INVENTORY.map((e) => `${e.chain}/${e.network}`).sort()).toEqual(["ethereum/mainnet", "tron/mainnet"]);
    });

    it("DRIFT: a synthetic coverage-only pair (no matching dispatcher entry) is reported as coverage_without_dispatcher", () => {
      const coverage: ChainCoverageInventoryRow[] = [
        { chain: "ethereum", network: "mainnet", address_format: "eip55", canonicalisation_version: "ethereum-eip55-v1" },
        { chain: "tron", network: "mainnet", address_format: "base58check", canonicalisation_version: "tron-base58check-v1" },
        { chain: "bitcoin", network: "mainnet", address_format: "base58check", canonicalisation_version: "bitcoin-base58check-v1" },
      ];
      const mismatches = compareChainCoverageToDispatcher(coverage, CHAIN_DISPATCHER_INVENTORY);
      expect(mismatches).toEqual([{ kind: "coverage_without_dispatcher", chain: "bitcoin", network: "mainnet" }]);
    });

    it("DRIFT: a synthetic dispatcher-only pair (no matching coverage row) is reported as dispatcher_without_coverage", () => {
      const coverage: ChainCoverageInventoryRow[] = [
        { chain: "ethereum", network: "mainnet", address_format: "eip55", canonicalisation_version: "ethereum-eip55-v1" },
        { chain: "tron", network: "mainnet", address_format: "base58check", canonicalisation_version: "tron-base58check-v1" },
      ];
      const dispatcher: ChainDispatcherInventoryEntry[] = [
        ...CHAIN_DISPATCHER_INVENTORY,
        { chain: "bitcoin", network: "mainnet", addressFormat: "base58check", canonicalisationVersion: "bitcoin-base58check-v1" },
      ];
      const mismatches = compareChainCoverageToDispatcher(coverage, dispatcher);
      expect(mismatches).toEqual([{ kind: "dispatcher_without_coverage", chain: "bitcoin", network: "mainnet" }]);
    });

    it("DRIFT: a supported pair whose address_format disagrees between coverage and dispatcher is reported as address_format_mismatch", () => {
      const coverage: ChainCoverageInventoryRow[] = [
        { chain: "ethereum", network: "mainnet", address_format: "hex_no_checksum", canonicalisation_version: "ethereum-eip55-v1" },
        { chain: "tron", network: "mainnet", address_format: "base58check", canonicalisation_version: "tron-base58check-v1" },
      ];
      const mismatches = compareChainCoverageToDispatcher(coverage, CHAIN_DISPATCHER_INVENTORY);
      expect(mismatches).toEqual([
        {
          kind: "address_format_mismatch",
          chain: "ethereum",
          network: "mainnet",
          coverageAddressFormat: "hex_no_checksum",
          dispatcherAddressFormat: "eip55",
        },
      ]);
    });

    it("DRIFT: a supported pair whose canonicalisation_version disagrees between coverage and dispatcher is reported as canonicalisation_version_mismatch", () => {
      const coverage: ChainCoverageInventoryRow[] = [
        { chain: "ethereum", network: "mainnet", address_format: "eip55", canonicalisation_version: "ethereum-eip55-v2" },
        { chain: "tron", network: "mainnet", address_format: "base58check", canonicalisation_version: "tron-base58check-v1" },
      ];
      const mismatches = compareChainCoverageToDispatcher(coverage, CHAIN_DISPATCHER_INVENTORY);
      expect(mismatches).toEqual([
        {
          kind: "canonicalisation_version_mismatch",
          chain: "ethereum",
          network: "mainnet",
          coverageCanonicalisationVersion: "ethereum-eip55-v2",
          dispatcherCanonicalisationVersion: "ethereum-eip55-v1",
        },
      ]);
    });

    it("REGISTRY IS LOAD-BEARING: canonicaliseAddress for an unsupported chain returns unsupported_chain — no hard-coded chain-name branch bypasses the registry", () => {
      const result = canonicaliseAddress("bitcoin", "mainnet", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
      expect(result).toEqual({ ok: false, reasonCode: "unsupported_chain" });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("live runtime-role privilege matrix (attempted, not just catalogue-inspected)", () => {
    it("role_wlt1_runtime cannot read clt1.*, kyc1.*, aml1.*, iam.*, iam2.*, cfg1.*, sec1.*, or foundation.outbox_event, but CAN read wlt1.destination", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`SELECT 1 FROM wlt1.destination LIMIT 1`)).resolves.toBeDefined();
        for (const forbidden of [
          `SELECT 1 FROM foundation.outbox_event LIMIT 1`,
          `SELECT 1 FROM clt1.client_profile LIMIT 1`,
          `SELECT 1 FROM kyc1.kyc_case LIMIT 1`,
          `SELECT 1 FROM aml1.screening_request LIMIT 1`,
          `SELECT 1 FROM iam.user_account LIMIT 1`,
          `SELECT 1 FROM iam2.permission LIMIT 1`,
          `SELECT 1 FROM cfg1.feature LIMIT 1`,
          `SELECT 1 FROM sec1.audit_event LIMIT 1`,
        ]) {
          await expect(appPool.query(forbidden)).rejects.toThrow();
        }
      } finally {
        await appPool.end();
      }
    });

    it("allowed: INSERT on destination/wallet_destination/address_integrity_check; SELECT on chain_coverage; INSERT on outbox_event; SELECT/INSERT/UPDATE on idempotency_record", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      const destId = "wlt1dest_grant_" + randomUUID();
      // Declared here (not inside the try block below) so the outer `finally`'s scoped cleanup
      // can reference it — a `const` declared inside `try { }` is not visible in `finally { }`.
      const idemKey = "grant_test_" + randomUUID();
      try {
        await appPool.query(
          `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_grant', 'wallet', $2)`,
          [destId, "hash_" + randomUUID()],
        );
        await appPool.query(
          `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
           VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unknown', 'self')`,
          [destId, ETH_VALID_1, "addrhash_" + randomUUID()],
        );
        await appPool.query(
          `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
           VALUES ($1, $2, 'clt1client_grant', 'ethereum', 'mainnet', $3, $3, 'ethereum-eip55-v1', true, 'pass', 'canonicalisation_succeeded')`,
          ["wlt1check_grant_" + randomUUID(), destId, "hash_" + randomUUID()],
        );
        await expect(appPool.query(`SELECT chain FROM wlt1.chain_coverage WHERE chain = 'ethereum'`)).resolves.toBeDefined();
        await expect(appPool.query(`UPDATE wlt1.destination SET status = 'draft', updated_at_utc = now() WHERE destination_id = $1`, [destId])).resolves.toBeDefined();

        // foundation.idempotency_record is RLS-protected, scoped by `aix.module` (migration 005) —
        // the same `set_config` a real beginIdempotent/completeIdempotent call makes on the
        // caller's own connection. A raw INSERT/UPDATE without it is correctly rejected by RLS,
        // not by the grant — so this probe sets it explicitly on one held connection, exactly as
        // production code does.
        const idemClient = await appPool.connect();
        try {
          await idemClient.query("SELECT set_config('aix.module', 'WLT-01', false)");
          await idemClient.query(
            `INSERT INTO foundation.idempotency_record (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
             VALUES ($1, 'sha256:x', 'wlt1_internal_service', 'service', 'wlt1.wallet_destination.register', 'WLT-01', 'processing', now() + interval '1 day', now(), now())`,
            [idemKey],
          );
          await idemClient.query("SELECT set_config('aix.module', 'WLT-01', false)");
          await expect(
            idemClient.query(`UPDATE foundation.idempotency_record SET status = 'completed' WHERE idempotency_key = $1 AND source_module = 'WLT-01'`, [idemKey]),
          ).resolves.toBeDefined();
        } finally {
          idemClient.release();
        }
      } finally {
        // P2CC2-MED-1 remediation: scoped to THIS test's own specific idempotency_key — the
        // unscoped "source_module = 'WLT-01'" form would also delete
        // `wlt1-screening-route.test.ts`'s own concurrently-live idempotency reservations.
        await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE idempotency_key = $1 AND source_module = 'WLT-01'`, [idemKey]);
        await appPool.end();
      }
    });

    it("denied: DELETE and TRUNCATE on every wlt1 table", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const table of ["destination", "wallet_destination", "address_integrity_check", "chain_coverage"]) {
          await expect(appPool.query(`DELETE FROM wlt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(appPool.query(`TRUNCATE wlt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await appPool.end();
      }
    });

    it("denied: UPDATE on wallet_destination and address_integrity_check (both immutable forever)", async () => {
      if (!schemaReady) return;
      const destId = "wlt1dest_immut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_immut', 'wallet', $2)`,
        [destId, "hash_" + randomUUID()],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unknown', 'self')`,
        [destId, ETH_VALID_1, "addrhash_" + randomUUID()],
      );
      const checkId = "wlt1check_immut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
         VALUES ($1, $2, 'clt1client_immut', 'ethereum', 'mainnet', $3, $3, 'ethereum-eip55-v1', true, 'pass', 'canonicalisation_succeeded')`,
        [checkId, destId, "hash_" + randomUUID()],
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE wlt1.wallet_destination SET wallet_type = 'hosted' WHERE destination_id = $1`, [destId])).rejects.toMatchObject({
          code: "42501",
        });
        await expect(appPool.query(`UPDATE wlt1.address_integrity_check SET result_status = 'fail' WHERE address_check_id = $1`, [checkId])).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await appPool.end();
      }
    });

    it("denied: UPDATE of immutable destination columns (destination_id/client_id/destination_type/natural_key_hash/created_at_utc)", async () => {
      if (!schemaReady) return;
      const destId = "wlt1dest_colimmut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_colimmut', 'wallet', $2)`,
        [destId, "hash_" + randomUUID()],
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`UPDATE wlt1.destination SET client_id = 'hacked' WHERE destination_id = $1`, [destId])).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE wlt1.destination SET natural_key_hash = 'hacked' WHERE destination_id = $1`, [destId])).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE wlt1.destination SET destination_type = 'fiat_payout' WHERE destination_id = $1`, [destId])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });

    it("Phase 4A-1: allowed UPDATE of cooling_off_until_utc/whitelist_approval_ref — the only two new destination columns migration 055 added", async () => {
      if (!schemaReady) return;
      const destId = "wlt1dest_4a1cols_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, 'clt1client_4a1cols', 'wallet', $2, 'approved_pending_cooling')`, [
        destId,
        "hash_" + randomUUID(),
      ]);
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(
          appPool.query(`UPDATE wlt1.destination SET cooling_off_until_utc = now() + interval '24 hours', whitelist_approval_ref = 'iam2appr_grantcheck' WHERE destination_id = $1`, [destId]),
        ).resolves.toBeDefined();
      } finally {
        await appPool.end();
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
      }
    });

    // ---------------------------------------------------------------------------------------
    // Phase 4A-1 — structural-unreachability regression (the frozen "reset rule" carry-forward,
    // H-4A1-2). Proves the three reset triggers named in the Phase 4A-1 addendum remain genuinely
    // unreachable against an approved_pending_cooling/active destination: the existing screening
    // and PoC routes both refuse via their own pre-existing status guards, before any write. This
    // is what justifies Phase 4A-1 implementing NO reset hooks at all.
    // ---------------------------------------------------------------------------------------
    async function seed4A1Destination(status: string): Promise<string> {
      const destId = "wlt1dest_4a1unreach_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, 'clt1client_4a1unreach', 'wallet', $2, $3)`, [
        destId,
        "hash_" + randomUUID(),
        status,
      ]);
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unhosted', 'self')`,
        [destId, ETH_VALID_1, "addrhash_4a1unreach_" + randomUUID()],
      );
      return destId;
    }

    for (const status of ["approved_pending_cooling", "active"]) {
      it(`Phase 4A-1 structural unreachability: POST .../screen against status='${status}' -> WLT1_DESTINATION_INVALID_STATE, no write (H-4A1-2 reset trigger #1 remains unreachable)`, async () => {
        if (!schemaReady) return;
        const destId = await seed4A1Destination(status);
        const res = await app.inject({
          method: "POST",
          url: `/internal/wlt1/wallet-destinations/${destId}/screen`,
          headers: { ...INTERNAL_HEADERS, "idempotency-key": freshClientId() },
          payload: {},
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
        const row = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destId]);
        expect(row.rows[0].status).toBe(status);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [destId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
      });

      it(`Phase 4A-1 structural unreachability: POST .../proof-of-control/challenges against status='${status}' -> WLT1_DESTINATION_INVALID_STATE, no write (H-4A1-2 reset trigger #2 remains unreachable)`, async () => {
        if (!schemaReady) return;
        const destId = await seed4A1Destination(status);
        const res = await app.inject({
          method: "POST",
          url: `/internal/wlt1/wallet-destinations/${destId}/proof-of-control/challenges`,
          headers: { ...INTERNAL_HEADERS, "idempotency-key": freshClientId() },
          payload: { client_id: "clt1client_4a1unreach" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
        const pocRows = await verifyPool.query(`SELECT 1 FROM wlt1.proof_of_control WHERE destination_id = $1`, [destId]);
        expect(pocRows.rows).toHaveLength(0);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [destId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
      });

      it(`Phase 4A-1 structural unreachability: POST .../proof-of-control/verify against status='${status}' -> WLT1_DESTINATION_INVALID_STATE, no write (H-4A1-2 reset trigger #2 remains unreachable)`, async () => {
        if (!schemaReady) return;
        const destId = await seed4A1Destination(status);
        // The route's own binding check (challenge existence + destination/client match) runs
        // BEFORE the destination-status gate — a genuinely bound, still-'issued' challenge is
        // required here so the request actually reaches the status check this test targets,
        // rather than short-circuiting on WLT1_POC_CHALLENGE_NOT_FOUND for an unrelated reason.
        const challengeId = "wlt1pocchal_4a1unreach_" + randomUUID();
        await verifyPool.query(
          `INSERT INTO wlt1.proof_of_control
             (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme,
              message_format_version, domain_environment, nonce, message_hash, verification_status, issued_at_utc, expires_at_utc)
           VALUES ($1,$2,'clt1client_4a1unreach','ethereum','mainnet',$3,$4,'signed_message','eip191_personal_sign',1,'dev',$5,$6,'issued', now(), now() + interval '15 minutes')`,
          [challengeId, destId, ETH_VALID_1, "addrhash_4a1unreach_" + randomUUID(), "ab".repeat(32), "cd".repeat(32)],
        );
        const res = await app.inject({
          method: "POST",
          url: `/internal/wlt1/wallet-destinations/${destId}/proof-of-control/verify`,
          headers: { ...INTERNAL_HEADERS, "idempotency-key": freshClientId() },
          payload: { client_id: "clt1client_4a1unreach", challenge_id: challengeId, signature: "0x" + "1".repeat(130) },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
        const stillIssued = await verifyPool.query(`SELECT verification_status FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
        expect(stillIssued.rows[0].verification_status).toBe("issued");
        await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [destId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
      });
    }

    it("Phase 4A-1 structural unreachability: address/natural_key_hash mutation reset trigger #3 remains structurally unreachable — no UPDATE grant exists on wallet_destination at all, and destination.natural_key_hash is excluded from destination's own UPDATE grant (both already proven above; this test only confirms the grant surface is unchanged post-4A-1)", async () => {
      if (!schemaReady) return;
      // Grantee is the GROUP role 'role_wlt1_runtime' (which RUNTIME_ROLE_USER only inherits via
      // GRANT role_wlt1_runtime TO RUNTIME_ROLE_USER) — the actual privilege row lives on the
      // group role, not the login role.
      const grantCols = await verifyPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.column_privileges WHERE grantee = 'role_wlt1_runtime' AND table_schema = 'wlt1' AND table_name = 'destination' AND privilege_type = 'UPDATE' ORDER BY column_name`,
      );
      const cols = grantCols.rows.map((r) => r.column_name);
      expect(cols).toEqual(
        ["client_status_ref", "cooling_off_until_utc", "destination_status_version", "limits_version", "revocation_epoch", "status", "updated_at_utc", "whitelist_approval_ref", "whitelist_version"].sort(),
      );
      expect(cols).not.toContain("natural_key_hash");
      expect(cols).not.toContain("client_id");
      expect(cols).not.toContain("destination_type");

      const wdGrant = await verifyPool.query(
        `SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee = 'role_wlt1_runtime' AND table_schema = 'wlt1' AND table_name = 'wallet_destination' AND privilege_type = 'UPDATE'`,
      );
      expect(wdGrant.rows[0].n).toBe(0);
    });

    it("denied: INSERT/UPDATE/DELETE on chain_coverage (runtime is read-only) — provider_id included, Phase 2B", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(
          appPool.query(
            `INSERT INTO wlt1.chain_coverage (coverage_id, chain, network, address_format, canonicalisation_version, provider_id) VALUES ('x','bitcoin','mainnet','x','x','stub-wallet-analytics-v1')`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE wlt1.chain_coverage SET coverage_status = 'supported' WHERE chain = 'ethereum'`)).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`UPDATE wlt1.chain_coverage SET provider_id = 'someone-else' WHERE chain = 'ethereum'`)).rejects.toMatchObject({ code: "42501" });
        await expect(appPool.query(`DELETE FROM wlt1.chain_coverage WHERE chain = 'ethereum'`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });

    // ---------------------------------------------------------------------------------------
    // Phase 2B — wallet_screening_result / vendor_result_inbox live privilege matrix. No Phase 2B
    // route writes either table; these probes insert directly via the runtime role to prove the
    // GRANT itself (not any route) is what allows/denies each operation. Every inserted row is
    // deleted in `finally` — the "exactly zero rows" migration-inventory assertion above runs
    // earlier in file order and must remain true for the whole file.
    // ---------------------------------------------------------------------------------------
    it("allowed: SELECT/INSERT on wallet_screening_result and vendor_result_inbox; permitted terminal-evidence UPDATE on each", async () => {
      if (!schemaReady) return;
      const destId = "wlt1dest_screen_grant_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_screen_grant', 'wallet', $2)`,
        [destId, "hash_" + randomUUID()],
      );
      const screeningResultId = "wlt1screen_grant_" + randomUUID();
      const inboxId = "wlt1inbox_grant_" + randomUUID();
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await appPool.query(
          `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
           VALUES ($1, $2, 1, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3)`,
          [screeningResultId, destId, "addrhash_" + randomUUID()],
        );
        await expect(appPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId])).resolves.toBeDefined();
        await expect(
          appPool.query(
            `UPDATE wlt1.wallet_screening_result SET risk_status = 'clear', risk_score = 2.0, sanctions_exposure = false, updated_at_utc = now() WHERE screening_result_id = $1`,
            [screeningResultId],
          ),
        ).resolves.toBeDefined();

        await appPool.query(
          `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
           VALUES ($1, 'stub-wallet-analytics-v1', $2, $3, $4, 'wallet_screening', $5, true, now())`,
          [inboxId, "presult_" + randomUUID(), destId, screeningResultId, "sha256:x_" + randomUUID()],
        );
        await expect(appPool.query(`SELECT processing_status FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`, [inboxId])).resolves.toBeDefined();
        await expect(
          appPool.query(`UPDATE wlt1.vendor_result_inbox SET processing_status = 'processed', updated_at_utc = now() WHERE inbox_id = $1`, [inboxId]),
        ).resolves.toBeDefined();
      } finally {
        await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`, [inboxId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
        await appPool.end();
      }
    });

    it("denied: DELETE and TRUNCATE on wallet_screening_result and vendor_result_inbox", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const table of ["wallet_screening_result", "vendor_result_inbox"]) {
          await expect(appPool.query(`DELETE FROM wlt1.${table}`)).rejects.toMatchObject({ code: "42501" });
          await expect(appPool.query(`TRUNCATE wlt1.${table}`)).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await appPool.end();
      }
    });

    it("denied: UPDATE of immutable wallet_screening_result identity/correlation columns", async () => {
      if (!schemaReady) return;
      const destId = "wlt1dest_screen_immut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_screen_immut', 'wallet', $2)`,
        [destId, "hash_" + randomUUID()],
      );
      const screeningResultId = "wlt1screen_immut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
         VALUES ($1, $2, 1, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3)`,
        [screeningResultId, destId, "addrhash_" + randomUUID()],
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const [column, value] of [
          ["screening_result_id", "'hacked'"],
          ["destination_id", "'hacked'"],
          ["screening_result_version", "2"],
          ["provider_id", "'hacked'"],
          ["provider_adaptor_version", "'hacked'"],
          ["chain", "'hacked'"],
          ["network", "'hacked'"],
          ["address_hash", "'hacked'"],
          ["created_at_utc", "now()"],
        ]) {
          await expect(
            appPool.query(`UPDATE wlt1.wallet_screening_result SET ${column} = ${value} WHERE screening_result_id = $1`, [screeningResultId]),
          ).rejects.toMatchObject({ code: "42501" });
        }
      } finally {
        await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destId]);
        await appPool.end();
      }
    });

    it("denied: UPDATE of immutable vendor_result_inbox identity/receipt-evidence columns", async () => {
      if (!schemaReady) return;
      const inboxId = "wlt1inbox_immut_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
         VALUES ($1, 'stub-wallet-analytics-v1', $2, 'wallet_screening', $3, true, now())`,
        [inboxId, "presult_" + randomUUID(), "sha256:x_" + randomUUID()],
      );
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        for (const [column, value] of [
          ["inbox_id", "'hacked'"],
          ["provider_id", "'hacked'"],
          ["provider_result_id", "'hacked'"],
          ["destination_id", "'hacked'"],
          ["screening_result_id", "'hacked'"],
          ["result_type", "'wallet_screening'"],
          ["payload_hash", "'hacked'"],
          ["source_authenticated", "false"],
          ["received_at_utc", "now()"],
          ["created_at_utc", "now()"],
        ]) {
          await expect(appPool.query(`UPDATE wlt1.vendor_result_inbox SET ${column} = ${value} WHERE inbox_id = $1`, [inboxId])).rejects.toMatchObject({
            code: "42501",
          });
        }
      } finally {
        await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`, [inboxId]);
        await appPool.end();
      }
    });

    it("denied: schema CREATE under role_wlt1_runtime", async () => {
      if (!schemaReady) return;
      const appPool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      try {
        await expect(appPool.query(`CREATE TABLE wlt1.hacked_table (id int)`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await appPool.end();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("wallet-screening / vendor-result-inbox persistence — no Phase 2C route yet", () => {
    it("raw-payload absence sweep: no column named or shaped like a raw provider payload exists on either new table", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'wlt1' AND table_name IN ('wallet_screening_result', 'vendor_result_inbox')`,
      );
      const forbidden = /raw_payload|provider_payload|raw_response|provider_response|raw_vendor_response/i;
      for (const row of r.rows) {
        expect(row.column_name, `${row.table_name}.${row.column_name}`).not.toMatch(forbidden);
      }
    });

    it("no sec_audit_ref-shaped column exists on either new table (049 precedent — outbox_event is the real audit linkage)", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'wlt1' AND table_name IN ('wallet_screening_result', 'vendor_result_inbox') AND column_name = 'sec_audit_ref'`,
      );
      expect(r.rows).toEqual([]);
    });

    it("vendor_result_inbox carries no FK on destination_id/screening_result_id — a receipt referencing an invalid identifier must remain recordable", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'wlt1.vendor_result_inbox'::regclass AND contype = 'f'`,
      );
      expect(r.rows).toEqual([]);
    });

    it("wallet_screening_result.destination_id DOES carry a real FK into wlt1.destination", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(
        `SELECT confrelid::regclass::text AS ref FROM pg_constraint WHERE conrelid = 'wlt1.wallet_screening_result'::regclass AND contype = 'f'`,
      );
      expect(r.rows.map((row) => row.ref)).toEqual(["wlt1.destination"]);
    });

    it("no cross-schema FK exists on either new table", async () => {
      if (!schemaReady) return;
      for (const table of ["wallet_screening_result", "vendor_result_inbox"]) {
        const r = await verifyPool.query(
          `SELECT confrelid::regclass::text AS ref FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'f'`,
          [`wlt1.${table}`],
        );
        for (const row of r.rows) {
          expect(row.ref).toMatch(/^wlt1\./);
        }
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("readiness", () => {
    it("passes (200, ready) when the DB/wlt1 schema is reachable", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/readiness" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ready");
    });

    it("is unauthenticated (no internal-service-token header required)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/readiness" });
      expect(res.statusCode).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /wallet-destinations — Ethereum registration", () => {
    it("registers successfully with a valid EIP-55 mixed-case address; response is masked, status draft", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_VALID_1 }), "idem-" + randomUUID());
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      const data = res.json().data;
      expect(data.status).toBe("draft");
      expect(data.chain).toBe("ethereum");
      expect(data.address_masked).not.toContain(ETH_VALID_1);
      expect(data.address_masked.length).toBeLessThan(ETH_VALID_1.length);
      expect(data.memo_tag_present).toBe(false);
      expect(data.canonicalisation_version).toBe("ethereum-eip55-v1");
      expect(data.whitelist_version).toBe(0);
      expect(data.revocation_epoch).toBe(0);
      expect(data.destination_id).toMatch(/^wlt1dest_/);
    });

    it("all-lowercase and all-uppercase input are both accepted and canonicalise to the same stored address as the mixed-case form", async () => {
      if (!schemaReady) return;
      const c1 = freshClientId();
      const c2 = freshClientId();
      const r1 = await register(walletBody({ client_id: c1, address: ETH_VALID_1_LOWER }), "idem-" + randomUUID());
      const r2 = await register(walletBody({ client_id: c2, address: ETH_VALID_1_UPPER }), "idem-" + randomUUID());
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      const row1 = await verifyPool.query(`SELECT canonical_address FROM wlt1.wallet_destination WHERE destination_id = $1`, [r1.json().data.destination_id]);
      const row2 = await verifyPool.query(`SELECT canonical_address FROM wlt1.wallet_destination WHERE destination_id = $1`, [r2.json().data.destination_id]);
      expect(row1.rows[0].canonical_address).toBe(ETH_VALID_1);
      expect(row2.rows[0].canonical_address).toBe(ETH_VALID_1);
    });

    it("rejects an invalid mixed-case EIP-55 checksum with WLT1_ADDRESS_CANONICALISATION_FAILED (422)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_BAD_CHECKSUM }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ADDRESS_CANONICALISATION_FAILED");
    });

    it("rejects the zero address with WLT1_WALLET_ADDRESS_INVALID", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_ZERO }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects a short address", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_SHORT }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects invalid hex characters", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_INVALID_HEX }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects a missing 0x prefix", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_NO_PREFIX }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects leading whitespace", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_WITH_WHITESPACE }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects an embedded zero-width character", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_WITH_ZERO_WIDTH }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects a supplied memo_tag (Ethereum permits none)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_VALID_2, memo_tag: "123" }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects an alias-shaped input (dotted, ENS-style) with WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED — no network resolution attempted", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: "vitalik.eth" }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("POST /wallet-destinations — TRON registration", () => {
    it("P1B-LOW-3 vector sanity: TRON_INVALID_NETWORK_PREFIX and TRON_INVALID_PAYLOAD_LENGTH independently reach their claimed exact internal reason codes (re-verified here, not merely trusted from the Opus report)", () => {
      expect(canonicaliseTronAddress(TRON_INVALID_NETWORK_PREFIX)).toEqual({ ok: false, reasonCode: "invalid_network_prefix" });
      expect(canonicaliseTronAddress(TRON_INVALID_PAYLOAD_LENGTH)).toEqual({ ok: false, reasonCode: "invalid_payload_length" });
      // And the OLD Phase 1B vectors below are confirmed to reach a DIFFERENT branch entirely —
      // this is exactly why those two tests are renamed rather than left claiming what they don't
      // prove.
      expect(canonicaliseTronAddress(TRON_WRONG_PREFIX)).toEqual({ ok: false, reasonCode: "t_prefix_required" });
      expect(canonicaliseTronAddress(TRON_WRONG_LENGTH)).toEqual({ ok: false, reasonCode: "t_prefix_required" });
    });

    it("registers successfully with a valid mainnet Base58Check address", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_VALID_1 }), "idem-" + randomUUID());
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
      expect(res.json().data.chain).toBe("tron");
      expect(res.json().data.canonicalisation_version).toBe("tron-base58check-v1");
    });

    it("rejects an invalid Base58 alphabet character with WLT1_WALLET_ADDRESS_INVALID", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_BAD_ALPHABET }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects a valid-alphabet but invalid checksum with WLT1_ADDRESS_CANONICALISATION_FAILED", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_BAD_CHECKSUM }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ADDRESS_CANONICALISATION_FAILED");
    });

    it("P1B-LOW-3: rejects a Base58Check string with a non-mainnet-shaped prefix byte — reaches t_prefix_required (a shape guard before the network-prefix check), renamed from the Phase 1B title this test did not actually prove", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_WRONG_PREFIX }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("P1B-LOW-3: rejects a too-short Base58Check string — reaches t_prefix_required (a shape guard before the payload-length check), renamed from the Phase 1B title this test did not actually prove", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_WRONG_LENGTH }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("P1B-LOW-3: rejects a genuine invalid mainnet-prefix byte — reaches invalid_network_prefix, NOT t_prefix_required (direct branch vector, independently re-verified above)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_INVALID_NETWORK_PREFIX }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("P1B-LOW-3: rejects a genuine invalid payload length — reaches invalid_payload_length, NOT t_prefix_required (direct branch vector, independently re-verified above)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_INVALID_PAYLOAD_LENGTH }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects the zero (all-zero payload) address", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_ZERO }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects leading whitespace", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: " " + TRON_VALID_1 }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects an embedded zero-width character", async () => {
      if (!schemaReady) return;
      const injected = TRON_VALID_1.slice(0, 5) + "\u200B" + TRON_VALID_1.slice(5);
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: injected }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });

    it("rejects a supplied memo_tag (TRON permits none in Phase 1B)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "tron", network: "mainnet", address: TRON_VALID_2, memo_tag: "1" }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_WALLET_ADDRESS_INVALID");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("chain-coverage deny-by-default", () => {
    it("rejects an unsupported chain with WLT1_UNSUPPORTED_CHAIN (409)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "bitcoin", network: "mainnet", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_UNSUPPORTED_CHAIN");
    });

    it("rejects a supported chain on an unsupported network", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ chain: "ethereum", network: "sepolia" }), "idem-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_UNSUPPORTED_CHAIN");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("CLT-01 client-status gate", () => {
    it("rejects a suspended client with WLT1_CLIENT_STATUS_BLOCKED (409)", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody(), "idem-" + randomUUID(), "suspended");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_CLIENT_STATUS_BLOCKED");
    });

    it("rejects a not-found client with WLT1_CLIENT_STATUS_BLOCKED", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody(), "idem-" + randomUUID(), "not_found");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_CLIENT_STATUS_BLOCKED");
    });

    it("accepts 'active' and 'active_limited'", async () => {
      if (!schemaReady) return;
      const rActive = await register(walletBody({ address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      const rLimited = await register(walletBody({ address: ETH_VALID_2 }), "idem-" + randomUUID(), "active_limited");
      expect(rActive.statusCode).toBe(201);
      expect(rLimited.statusCode).toBe(201);
    });

    it("maps a CLT-01 network failure to WLT1_CLT1_UNAVAILABLE (503), never treated as eligible", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody(), "idem-" + randomUUID(), "unreachable");
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_CLT1_UNAVAILABLE");
    });

    it("maps a malformed CLT-01 response to WLT1_CLT1_UNAVAILABLE, never treated as eligible", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody(), "idem-" + randomUUID(), "malformed");
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_CLT1_UNAVAILABLE");
    });

    it("a CLT-01 status refusal does NOT create an address_integrity_check row (no address parsing was attempted)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await register(walletBody({ client_id: clientId }), "idem-" + randomUUID(), "suspended");
      const r = await verifyPool.query(`SELECT count(*) FROM wlt1.address_integrity_check WHERE client_id = $1`, [clientId]);
      expect(Number(r.rows[0].count)).toBe(0);
    });

    it("an address-stage refusal (after CLT passed) DOES create a durable address_integrity_check row with result_status='fail' and destination_id NULL", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await register(walletBody({ client_id: clientId, address: ETH_BAD_CHECKSUM }), "idem-" + randomUUID(), "active");
      const r = await verifyPool.query(`SELECT destination_id, result_status, reason_code FROM wlt1.address_integrity_check WHERE client_id = $1`, [clientId]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].destination_id).toBeNull();
      expect(r.rows[0].result_status).toBe("fail");
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("duplicate detection", () => {
    it("proactive natural-key duplicate re-check refuses a second registration of the same (client, chain, network, address) with WLT1_DESTINATION_DUPLICATE (409)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const r1 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      expect(r1.statusCode).toBe(201);
      const r2 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      expect(r2.statusCode).toBe(409);
      expect(r2.json().error.code).toBe("WLT1_DESTINATION_DUPLICATE");
      const count = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(count.rows[0].count)).toBe(1);
    });

    it("the SAME address for a DIFFERENT client is not a duplicate (natural key includes client_id)", async () => {
      if (!schemaReady) return;
      const clientA = freshClientId();
      const clientB = freshClientId();
      const r1 = await register(walletBody({ client_id: clientA, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      const r2 = await register(walletBody({ client_id: clientB, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
    });

    it("RAW DB-LEVEL: forced named-index 23505 mapping — a raw concurrent INSERT racing past the proactive check is caught by the partial unique index (proves the PostgreSQL-level backstop only; see the route-level test below for the route's own mapping)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      // Register organically first.
      const r1 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      expect(r1.statusCode).toBe(201);
      const naturalKeyHash = (await verifyPool.query(`SELECT natural_key_hash FROM wlt1.destination WHERE client_id = $1`, [clientId])).rows[0].natural_key_hash;
      // Force a raw 23505 directly against the same natural_key_hash — proves the DB-level backstop independent of route logic.
      await expect(
        verifyPool.query(
          `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, $2, 'wallet', $3)`,
          ["wlt1dest_forced_" + randomUUID(), clientId, naturalKeyHash],
        ),
      ).rejects.toMatchObject({ code: "23505", constraint: "idx_wlt1_destination_natural_key" });
    });

    it("P1B-LOW-2: DETERMINISTIC route-level natural-key 23505 — the route's OWN INSERT (not a raw test query) collides with a competing UNCOMMITTED transaction at idx_wlt1_destination_natural_key, mapped to WLT1_DESTINATION_DUPLICATE (409), full rollback, no orphan rows, no leaked idempotency state, no refusal audit for this race-loser path (mirrors KYC-01's/AML-01's own 23505-backstop precedent)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const addressHash = computeAddressHash("ethereum", "mainnet", ETH_VALID_1, "");
      const naturalKeyHash = computeNaturalKeyHash(clientId, WALLET_DESTINATION_TYPE, addressHash);

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, $2, 'wallet', $3)`,
        ["wlt1dest_racehold_" + randomUUID(), clientId, naturalKeyHash],
      );
      // Deliberately NOT committed yet — under READ COMMITTED the route's own proactive natural-key
      // SELECT cannot see this uncommitted row, so it proceeds to its own INSERT, which then
      // genuinely blocks on THIS row at the database level (a real value-lock wait on the unique
      // index, not an advisory lock and not a timing guess).

      const idemKey = "idem-route23505-" + randomUUID();
      let settled = false;
      const requestPromise = register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), idemKey, "active").then((res) => {
        settled = true;
        return res;
      });

      try {
        await waitForBlockedDestinationInsert();
        expect(settled).toBe(false);
        await holder.query("COMMIT"); // the competing row becomes visible; the route's own INSERT now genuinely collides with it
      } finally {
        await holder.end();
      }

      const res = await requestPromise;
      expect(res.statusCode, JSON.stringify(res.json())).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_DUPLICATE");

      // Full rollback: exactly the one forced row survives; no orphan wallet_destination/
      // address_integrity_check row from the loser's rolled-back attempt.
      const destCount = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(destCount.rows[0].count)).toBe(1);
      const walletCount = await verifyPool.query(
        `SELECT count(*) FROM wlt1.wallet_destination w JOIN wlt1.destination d ON d.destination_id = w.destination_id WHERE d.client_id = $1`,
        [clientId],
      );
      expect(Number(walletCount.rows[0].count)).toBe(0);
      const integrityCount = await verifyPool.query(`SELECT count(*) FROM wlt1.address_integrity_check WHERE client_id = $1`, [clientId]);
      expect(Number(integrityCount.rows[0].count)).toBe(0);

      // No leaked/incomplete idempotency state — the whole transaction (including its own
      // beginIdempotent insert) rolled back, so no "processing"-forever row survives.
      const idemCount = await verifyPool.query(
        `SELECT count(*) FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND idempotency_key = $1`,
        [idemKey],
      );
      expect(Number(idemCount.rows[0].count)).toBe(0);

      // No refusal audit for this specific race loss — this is the rare 23505-backstop throw
      // INSIDE the transaction (full rollback, no separate refusal evidence), distinct from the
      // proactive-duplicate path which DOES publish a refusal audit before its own commit.
      const auditCounts = await verifyPool.query(
        `SELECT event_type FROM foundation.outbox_event WHERE payload_ref::text LIKE '%' || $1 || '%'`,
        [clientId],
      );
      expect(auditCounts.rows).toEqual([]);
    });

    it("P1B-LOW-2 NEGATIVE: isDuplicateNaturalKeyViolation recognizes ONLY the accepted natural-key constraint, never an unrelated 23505 — exercised directly against the exported helper (forcing an unrelated 23505 through the LIVE route was assessed and is not safely reachable without either predicting a randomUUID()-derived identifier or a schema change made solely for this test — both correctly avoided per this phase's own instructions; see the implementation report)", () => {
      expect(isDuplicateNaturalKeyViolation({ code: "23505", constraint: "idx_wlt1_destination_natural_key" })).toBe(true);
      expect(isDuplicateNaturalKeyViolation({ code: "23505", constraint: "destination_destination_id_key" })).toBe(false);
      expect(isDuplicateNaturalKeyViolation({ code: "23505", constraint: "address_integrity_check_address_check_id_key" })).toBe(false);
      expect(isDuplicateNaturalKeyViolation({ code: "23505", constraint: "wallet_destination_destination_id_key" })).toBe(false);
      expect(isDuplicateNaturalKeyViolation({ code: "23505" })).toBe(false);
      expect(isDuplicateNaturalKeyViolation({ code: "23503", constraint: "idx_wlt1_destination_natural_key" })).toBe(false); // right constraint name, wrong SQLSTATE entirely
      expect(isDuplicateNaturalKeyViolation(new Error("unrelated"))).toBe(false);
      expect(isDuplicateNaturalKeyViolation(undefined)).toBe(false);
    });

    it("concurrent identical registration (Promise.all) — exactly one succeeds, no duplicate rows, no orphan wallet_destination/address_integrity_check row. NOTE: Promise.all alone is timing-dependent, not deterministic proof of blocking — see the two P1B-LOW-1 barrier tests below for genuine, database-observed proof that the advisory lock is what serializes this outcome", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const [r1, r2] = await Promise.all([
        register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active"),
        register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-" + randomUUID(), "active"),
      ]);
      const codes = [r1.statusCode, r2.statusCode].sort();
      expect(codes).toEqual([201, 409]);
      const destCount = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(destCount.rows[0].count)).toBe(1);
      const walletCount = await verifyPool.query(
        `SELECT count(*) FROM wlt1.wallet_destination w JOIN wlt1.destination d ON d.destination_id = w.destination_id WHERE d.client_id = $1`,
        [clientId],
      );
      expect(Number(walletCount.rows[0].count)).toBe(1);
    });

    it("P1B-LOW-1: DETERMINISTIC — registration genuinely BLOCKS on the held wlt1.destination_registration:<client_id> advisory lock, proven via pg_locks (not a sleep, not scheduler luck)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      config.clt1FetchImpl = makeClt1StatusFetch({ [clientId]: "active" });

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      const holderPid = await getBackendPid(holder);
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination_registration:${clientId}`]);

      let settled = false;
      const requestPromise = app
        .inject({
          method: "POST",
          url: "/internal/wlt1/wallet-destinations",
          headers: { ...INTERNAL_HEADERS, "idempotency-key": "idem-lockbarrier-" + randomUUID() },
          payload: walletBody({ client_id: clientId, address: ETH_VALID_1 }),
        })
        .then((res) => {
          settled = true;
          return res;
        });

      try {
        // Deterministic proof the request is actually waiting on THIS held advisory lock — a
        // bounded poll of pg_locks scoped to the holder's own (classid, objid, objsubid), never a
        // sleep used as evidence. The poll's own timeout is test safety only.
        await waitForAdvisoryLockWaiters(holderPid, 1);
        expect(settled).toBe(false);

        await holder.query("COMMIT"); // releases the transaction-scoped advisory lock
      } finally {
        await holder.end();
      }

      const res = await requestPromise;
      expect(res.statusCode, JSON.stringify(res.json())).toBe(201);
    });

    it("P1B-LOW-1: DETERMINISTIC — two competing identical registrations released from ONE real held barrier produce exactly one 201 and one 409 WLT1_DESTINATION_DUPLICATE, with exact row and audit counts, no deadlock", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      config.clt1FetchImpl = makeClt1StatusFetch({ [clientId]: "active" });
      const body = walletBody({ client_id: clientId, address: ETH_VALID_1 });

      const holder = new Client({ connectionString: TEST_DB as string });
      await holder.connect();
      const holderPid = await getBackendPid(holder);
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination_registration:${clientId}`]);

      const pA = app.inject({
        method: "POST",
        url: "/internal/wlt1/wallet-destinations",
        headers: { ...INTERNAL_HEADERS, "idempotency-key": "idem-race-a-" + randomUUID() },
        payload: body,
      });
      const pB = app.inject({
        method: "POST",
        url: "/internal/wlt1/wallet-destinations",
        headers: { ...INTERNAL_HEADERS, "idempotency-key": "idem-race-b-" + randomUUID() },
        payload: body,
      });

      try {
        // Wait for BOTH requests to be genuinely queued behind the held lock before releasing it,
        // so the release arbitrates a real two-way race rather than letting one request run to
        // completion before the second even reaches the lock.
        await waitForAdvisoryLockWaiters(holderPid, 2);
        await holder.query("COMMIT");
      } finally {
        await holder.end();
      }

      const [ra, rb] = await Promise.all([pA, pB]);
      const codes = [ra.statusCode, rb.statusCode].sort();
      expect(codes).toEqual([201, 409]);
      const loser = ra.statusCode === 409 ? ra : rb;
      expect(loser.json().error.code).toBe("WLT1_DESTINATION_DUPLICATE");

      const destCount = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(destCount.rows[0].count)).toBe(1);
      const walletCount = await verifyPool.query(
        `SELECT count(*) FROM wlt1.wallet_destination w JOIN wlt1.destination d ON d.destination_id = w.destination_id WHERE d.client_id = $1`,
        [clientId],
      );
      expect(Number(walletCount.rows[0].count)).toBe(1);
      const integrityCount = await verifyPool.query(`SELECT count(*) FROM wlt1.address_integrity_check WHERE client_id = $1`, [clientId]);
      expect(Number(integrityCount.rows[0].count)).toBe(1);
      const auditCounts = await verifyPool.query(
        `SELECT event_type, count(*)::int AS n FROM foundation.outbox_event WHERE payload_ref::text LIKE '%' || $1 || '%' GROUP BY event_type ORDER BY event_type`,
        [clientId],
      );
      expect(auditCounts.rows).toEqual([
        { event_type: "wlt1.address_integrity_checked", n: 1 },
        { event_type: "wlt1.destination_registration_refused", n: 1 },
        { event_type: "wlt1.wallet_registered", n: 1 },
      ]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("idempotency", () => {
    it("exact retry (same key, same body) returns the SAME original 201 result without creating a second destination or duplicate audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const body = walletBody({ client_id: clientId, address: ETH_VALID_1 });
      const idemKey = "idem-exact-" + randomUUID();
      const r1 = await register(body, idemKey, "active");
      const r2 = await register(body, idemKey, "active");
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      expect(r1.json().data.destination_id).toBe(r2.json().data.destination_id);
      const count = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(count.rows[0].count)).toBe(1);
      const auditCount = await verifyPool.query(
        `SELECT count(*) FROM foundation.outbox_event WHERE event_type = 'wlt1.wallet_registered' AND payload_ref LIKE '%' || $1 || '%'`,
        [r1.json().data.destination_id],
      );
      expect(Number(auditCount.rows[0].count)).toBe(1);
    });

    it("same key with a DIFFERENT request body returns the foundation idempotency-mismatch error (400 VALIDATION_ERROR), creates no destination", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const idemKey = "idem-mismatch-" + randomUUID();
      const r1 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), idemKey, "active");
      expect(r1.statusCode).toBe(201);
      const r2 = await register(walletBody({ client_id: clientId, address: ETH_VALID_2, wallet_type: "hosted" }), idemKey, "active");
      expect(r2.statusCode).toBe(400);
      expect(r2.json().error.code).toBe("VALIDATION_ERROR");
      const count = await verifyPool.query(`SELECT count(*) FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(count.rows[0].count)).toBe(1);
    });

    it("replaying the SAME idempotency key after a duplicate-natural-key refusal deterministically re-refuses (never fabricates a destination)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const r1 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-first-" + randomUUID(), "active");
      expect(r1.statusCode).toBe(201);
      const idemKeyForDup = "idem-dup-" + randomUUID();
      const r2 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), idemKeyForDup, "active");
      expect(r2.statusCode).toBe(409);
      const r3 = await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), idemKeyForDup, "active");
      expect(r3.statusCode).toBe(409);
      expect(r3.json().error.code).toBe("WLT1_DESTINATION_DUPLICATE");
    });

    it("requires the Idempotency-Key header (400 IDEMPOTENCY_KEY_REQUIRED without it)", async () => {
      if (!schemaReady) return;
      // P1B-INF-3 (Phase 2A remediation): restore the pre-test value in `finally` rather than
      // leaving the mutation to be silently overwritten by whichever test/register() call happens
      // to run next.
      const originalFetchImpl = config.clt1FetchImpl;
      config.clt1FetchImpl = makeClt1StatusFetch({});
      try {
        const res = await app.inject({
          method: "POST",
          url: "/internal/wlt1/wallet-destinations",
          headers: INTERNAL_HEADERS,
          payload: walletBody(),
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
      } finally {
        config.clt1FetchImpl = originalFetchImpl;
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("atomicity / rollback", () => {
    // The two outbox-ACL-REVOKE audit-failure tests that used to live here ("audit failure rolls
    // back the ENTIRE registration..." / "refusal-evidence audit failure rolls back the refusal
    // transaction too...") were MOVED to tests/integration/wlt1-outbox-acl-private.test.ts's own
    // "registration atomicity / rollback" describe block — `role_wlt1_runtime` is the SAME runtime
    // role shared by this file, `wlt1-screening-application.test.ts`, and
    // `wlt1-screening-route.test.ts`, all running concurrently against this SAME shared canonical
    // database; the REVOKE those two tests performed could (and, once observed empirically, did)
    // starve an ordinary bystander request from one of those sibling files during the revoke
    // window, even with every ACL MUTATOR correctly serialized behind the shared advisory lock —
    // the lock only protects mutators from each other, never a non-mutating bystander. Moving both
    // tests onto their own private, disposable database removes that exposure entirely without
    // weakening either test's assertions. See wlt1-outbox-acl-private.test.ts's own file header for
    // the full rationale.
    it("no HTTP call occurs while a WLT-01 transaction is open — a fetch-spy proves the CLT-01 call happens before any DB write, never interleaved", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const callOrder: string[] = [];
      const originalFetchImpl = config.clt1FetchImpl;
      config.clt1FetchImpl = (async (url: unknown) => {
        callOrder.push("fetch:" + String(url));
        return { ok: true, status: 200, json: async () => ({ success: true, data: { client_id: clientId, status: "active" } }) } as Response;
      }) as typeof fetch;
      try {
        const res = await app.inject({
          method: "POST",
          url: "/internal/wlt1/wallet-destinations",
          headers: { ...INTERNAL_HEADERS, "idempotency-key": "idem-" + randomUUID() },
          payload: walletBody({ client_id: clientId, address: ETH_VALID_1 }),
        });
        expect(res.statusCode).toBe(201);
        expect(callOrder).toHaveLength(1); // exactly one CLT-01 call, before the transaction (never retried mid-transaction)
      } finally {
        config.clt1FetchImpl = originalFetchImpl;
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("GET /wallet-destinations/:destination_id", () => {
    it("returns the safe projection for a registered destination", async () => {
      if (!schemaReady) return;
      const reg = await register(walletBody({ address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      const destinationId = reg.json().data.destination_id;
      const res = await app.inject({ method: "GET", url: `/internal/wlt1/wallet-destinations/${destinationId}`, headers: INTERNAL_HEADERS });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(reg.json().data);
    });

    it("returns WLT1_DESTINATION_NOT_FOUND (404) for an unknown destination_id", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown", headers: INTERNAL_HEADERS });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("requires the internal-service-token", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown" });
      expect(res.statusCode).toBe(401);
    });

    it("never returns the full canonical address, only the masked value", async () => {
      if (!schemaReady) return;
      const reg = await register(walletBody({ address: ETH_VALID_1 }), "idem-" + randomUUID(), "active");
      const destinationId = reg.json().data.destination_id;
      const res = await app.inject({ method: "GET", url: `/internal/wlt1/wallet-destinations/${destinationId}`, headers: INTERNAL_HEADERS });
      expect(JSON.stringify(res.json())).not.toContain(ETH_VALID_1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("PII / secret sweeps (real registration and refusal flows, not static grep)", () => {
    it("the outbox never contains the full raw address, memo/tag, service token, CLT token, or Idempotency-Key", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), "idem-pii-" + randomUUID(), "active");
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      const blob = rows.rows.map((r) => r.payload_ref).join("\n");
      expect(blob).not.toContain(ETH_VALID_1);
      expect(blob).not.toContain(config.wlt1InternalServiceToken);
      expect(blob).not.toContain(config.clt1InternalServiceToken);
    });

    it("a refusal's outbox metadata never contains the rejected raw address", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await register(walletBody({ client_id: clientId, address: ETH_BAD_CHECKSUM }), "idem-pii-refuse-" + randomUUID(), "active");
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      const blob = rows.rows.map((r) => r.payload_ref).join("\n");
      expect(blob).not.toContain(ETH_BAD_CHECKSUM);
    });

    it("the destination table stores only the canonical address / hashes, never the service token or idempotency key", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const idemKey = "idem-sweep-" + randomUUID();
      await register(walletBody({ client_id: clientId, address: ETH_VALID_1 }), idemKey, "active");
      const rows = await verifyPool.query(`SELECT client_status_ref FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      const blob = JSON.stringify(rows.rows);
      expect(blob).not.toContain(config.wlt1InternalServiceToken);
      expect(blob).not.toContain(idemKey);
    });

    it("a 401/422/409 error response body never echoes the rejected address or any token", async () => {
      if (!schemaReady) return;
      const res = await register(walletBody({ address: ETH_BAD_CHECKSUM }), "idem-" + randomUUID(), "active");
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain(ETH_BAD_CHECKSUM);
      expect(raw).not.toContain(config.wlt1InternalServiceToken);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("error inventory — every WLT1 code has a reachable, tested throw site (cross-check against this file's own tests)", () => {
    it("exactly 35 WLT1 error codes are catalogued (Phase 2C-B added WLT1_DESTINATION_INVALID_STATE, WLT1_VENDOR_RESULT_INVALID; Phase 2C-D2 added WLT1_RECEIPT_CONFLICT; Phase 2C-D3A added WLT1_RECEIPT_STALE; Phase 3A-2 added WLT1_POC_UNSUPPORTED; Phase 3A-3 added WLT1_POC_CHALLENGE_NOT_FOUND/WLT1_POC_CHALLENGE_EXPIRED/WLT1_POC_CHALLENGE_INVALID_STATE/WLT1_PROOF_OF_CONTROL_FAILED, all reachable from tests/integration/wlt1-poc-verify-route.test.ts's own state-machine/crypto-negative tests; TRON added none in Phase 3B; Phase 4A-1 added exactly THREE — WLT1_DESTINATION_APPROVAL_INVALID_STATE/WLT1_APPROVAL_REQUIRED/WLT1_IAM2_UNAVAILABLE, all reachable from tests/integration/wlt1-destination-approval-route.test.ts; Phase 4A-2 added exactly ONE — WLT1_AML_GATE_UNAVAILABLE, reachable from tests/integration/wlt1-evaluate-use-route.test.ts; Destination Revocation added none; Ongoing Rescreening added exactly ONE — WLT1_RESCREENING_RUN_ACTIVE, reachable from tests/integration/wlt1-rescreening-route.test.ts; Fiat Payout Destinations (APAC) added exactly THREE — WLT1_ACCOUNT_IDENTIFIER_INVALID/WLT1_FIAT_RAIL_NOT_SUPPORTED (both reachable from tests/integration/wlt1-payout-destination-route.test.ts) /WLT1_BENEFICIARY_VERIFICATION_UNAVAILABLE (catalogued, reserved — the assess route's own 'both domains failed' case reuses the existing WLT1_SERVICE_UNAVAILABLE per the frozen architecture, see lib/errors.ts's own header comment); Sensitive Read Logging added exactly ONE — WLT1_SENSITIVE_READ_LOG_REQUIRED, reachable from tests/integration/wlt1-sensitive-read-route.test.ts and tests/integration/wlt1-sensitive-read-failclosed-private.test.ts; Evidence Export added exactly THREE — WLT1_EVIDENCE_EXPORT_SCOPE_INVALID/WLT1_EVIDENCE_EXPORT_NOT_FOUND/WLT1_EVIDENCE_EXPORT_LOG_REQUIRED, reachable from tests/integration/wlt1-evidence-export-route.test.ts and tests/integration/wlt1-evidence-export-failclosed-private.test.ts; Inbound-Source Screening added exactly TWO — WLT1_INBOUND_SCREENING_UNAVAILABLE/WLT1_INBOUND_TRANSFER_CONFLICT, reachable from tests/integration/wlt1-inbound-source-screening-route.test.ts and tests/integration/wlt1-inbound-source-failclosed-private.test.ts; Stuck-Screening Operational Closure added exactly TWO — WLT1_STUCK_SCREENING_NOT_FOUND/WLT1_STUCK_SCREENING_INVALID_STATE, reachable from tests/integration/wlt1-stuck-screening-route.test.ts and tests/integration/wlt1-stuck-screening-failclosed-private.test.ts)", async () => {
      const { WLT1_ERROR_CODES } = await import("../../services/wlt1/src/lib/errors.js");
      expect(Object.keys(WLT1_ERROR_CODES).sort()).toEqual(
        [
          "WLT1_SERVICE_UNAVAILABLE",
          "WLT1_DESTINATION_NOT_FOUND",
          "WLT1_DESTINATION_DUPLICATE",
          "WLT1_WALLET_ADDRESS_INVALID",
          "WLT1_ADDRESS_CANONICALISATION_FAILED",
          "WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED",
          "WLT1_UNSUPPORTED_CHAIN",
          "WLT1_CLIENT_STATUS_BLOCKED",
          "WLT1_CLT1_UNAVAILABLE",
          "WLT1_AUDIT_REQUIRED",
          "WLT1_DESTINATION_INVALID_STATE",
          "WLT1_VENDOR_RESULT_INVALID",
          "WLT1_RECEIPT_CONFLICT",
          "WLT1_RECEIPT_STALE",
          "WLT1_POC_UNSUPPORTED",
          "WLT1_POC_CHALLENGE_NOT_FOUND",
          "WLT1_POC_CHALLENGE_EXPIRED",
          "WLT1_POC_CHALLENGE_INVALID_STATE",
          "WLT1_PROOF_OF_CONTROL_FAILED",
          "WLT1_DESTINATION_APPROVAL_INVALID_STATE",
          "WLT1_APPROVAL_REQUIRED",
          "WLT1_IAM2_UNAVAILABLE",
          "WLT1_AML_GATE_UNAVAILABLE",
          "WLT1_RESCREENING_RUN_ACTIVE",
          "WLT1_ACCOUNT_IDENTIFIER_INVALID",
          "WLT1_FIAT_RAIL_NOT_SUPPORTED",
          "WLT1_BENEFICIARY_VERIFICATION_UNAVAILABLE",
          "WLT1_SENSITIVE_READ_LOG_REQUIRED",
          "WLT1_EVIDENCE_EXPORT_SCOPE_INVALID",
          "WLT1_EVIDENCE_EXPORT_NOT_FOUND",
          "WLT1_EVIDENCE_EXPORT_LOG_REQUIRED",
          "WLT1_INBOUND_SCREENING_UNAVAILABLE",
          "WLT1_INBOUND_TRANSFER_CONFLICT",
          "WLT1_STUCK_SCREENING_NOT_FOUND",
          "WLT1_STUCK_SCREENING_INVALID_STATE",
        ].sort(),
      );
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("permission inventory", () => {
    it("exactly 5 wlt1.* rows in iam2.permission (Phase 4A-1: wlt1.destination.approve_request/approve_apply; Evidence Export: wlt1.evidence_export.request/apply/download), zero WLT role_permission rows (FR-003 — no raw seed INSERT)", async () => {
      if (!schemaReady) return;
      const perms = await verifyPool.query<{ permission_code: string; requires_approval: boolean; licence_locked: boolean; resource: string; action: string; owner_module: string; status: string }>(
        `SELECT permission_code, requires_approval, licence_locked, resource, action, owner_module, status FROM iam2.permission WHERE permission_code LIKE 'wlt1.%' ORDER BY permission_code`,
      );
      expect(perms.rows.map((r) => r.permission_code)).toEqual([
        "wlt1.destination.approve_apply",
        "wlt1.destination.approve_request",
        "wlt1.evidence_export.apply",
        "wlt1.evidence_export.download",
        "wlt1.evidence_export.request",
      ]);
      expect(perms.rows.find((r) => r.permission_code === "wlt1.destination.approve_apply")?.requires_approval).toBe(true);
      expect(perms.rows.find((r) => r.permission_code === "wlt1.destination.approve_request")?.requires_approval).toBe(false);
      expect(perms.rows.find((r) => r.permission_code === "wlt1.evidence_export.request")?.requires_approval).toBe(false);
      expect(perms.rows.find((r) => r.permission_code === "wlt1.evidence_export.apply")?.requires_approval).toBe(true);
      expect(perms.rows.find((r) => r.permission_code === "wlt1.evidence_export.download")?.requires_approval).toBe(false);
      expect(perms.rows.every((r) => r.licence_locked === false)).toBe(true);
      expect(perms.rows.every((r) => r.owner_module === "WLT-01")).toBe(true);
      expect(perms.rows.every((r) => r.status === "active")).toBe(true);
      const evidenceExportRows = perms.rows.filter((r) => r.permission_code.startsWith("wlt1.evidence_export."));
      expect(evidenceExportRows.every((r) => r.resource === "evidence_export")).toBe(true);
      expect(evidenceExportRows.map((r) => r.action).sort()).toEqual(["apply", "download", "request"]);
      const rolePerms = await verifyPool.query(
        `SELECT count(*) FROM iam2.role_permission rp JOIN iam2.permission p ON p.permission_id = rp.permission_id WHERE p.permission_code LIKE 'wlt1.%'`,
      );
      expect(Number(rolePerms.rows[0].count)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  // P2CC2-MED-1 deterministic idempotency-cleanup isolation proof — does not rely on "all
  // co-scheduled runs must be green" (contaminated by the pre-existing, unrelated outbox ACL
  // race documented elsewhere). Proves the exact scoped cleanup directly: a hand-inserted OWNED
  // sentinel record (this file's own action namespace) and a hand-inserted FOREIGN sentinel
  // record (a DIFFERENT action namespace under the SAME source_module='WLT-01', modelling
  // `wlt1-screening-route.test.ts`'s own concurrently-live "wlt1.wallet_destination.screen"
  // reservations) are both created, `cleanupOwnedIdempotencyRecords()` — the EXACT function the
  // real `afterEach` calls — is invoked directly, and the owned record must be gone while the
  // foreign record survives byte-for-byte.
  // -----------------------------------------------------------------------------------------
  describe("P2CC2-MED-1 deterministic idempotency-cleanup isolation proof (sentinel ownership)", () => {
    it("cleanupOwnedIdempotencyRecords() removes only this file's OWN action namespace, never a foreign action under the same source_module", async () => {
      if (!schemaReady) return;
      const ownedKey = "sentinel_owned_" + randomUUID();
      const foreignKey = "sentinel_foreign_" + randomUUID();

      await verifyPool.query(
        `INSERT INTO foundation.idempotency_record (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
         VALUES ($1, 'sha256:sentinel_owned', 'wlt1_internal_service', 'service', 'wlt1.wallet_destination.register', 'WLT-01', 'processing', now() + interval '1 day', now(), now())`,
        [ownedKey],
      );
      // A DIFFERENT action namespace ("wlt1.wallet_destination.screen") under the SAME
      // source_module — exactly the shape of a `wlt1-screening-route.test.ts` reservation that
      // must never be collaterally deleted by this file's own scoped cleanup.
      await verifyPool.query(
        `INSERT INTO foundation.idempotency_record (idempotency_key, request_fingerprint, actor_id, actor_type, action, source_module, status, expires_at_utc, created_at_utc, updated_at_utc)
         VALUES ($1, 'sha256:sentinel_foreign', 'wlt1_internal_service', 'service', 'wlt1.wallet_destination.screen', 'WLT-01', 'processing', now() + interval '1 day', now(), now())`,
        [foreignKey],
      );

      try {
        const foreignBefore = await verifyPool.query(`SELECT * FROM foundation.idempotency_record WHERE idempotency_key = $1`, [foreignKey]);
        expect(foreignBefore.rows.length).toBe(1);

        await cleanupOwnedIdempotencyRecords();

        const ownedAfter = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.idempotency_record WHERE idempotency_key = $1`, [ownedKey]);
        expect(ownedAfter.rows[0].n).toBe(0);

        const foreignAfter = await verifyPool.query(`SELECT * FROM foundation.idempotency_record WHERE idempotency_key = $1`, [foreignKey]);
        expect(foreignAfter.rows.length).toBe(1);
        expect(foreignAfter.rows).toEqual(foreignBefore.rows);
      } finally {
        // Neither `cleanupOwnedIdempotencyRecords()` nor the real `afterEach` will ever remove
        // this foreign-action sentinel (that is exactly what was just proven) — clean it up here.
        await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE idempotency_key = $1`, [foreignKey]);
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // FINAL AUDIT EVENT INVENTORY — deliberately declared LAST, after every event-emitting test
  // above, per the Phase 4A.2B fresh-vs-warm-database determinism lesson: an exact-inventory
  // assertion declared BEFORE the tests that populate it fails on a fresh database while a warm
  // one masks it.
  //
  // Phase 2C-B: this is a SUBSET check, not exact-set equality. Many other WLT-01 integration
  // files share this SAME database (TEST_DATABASE_URL) and write their own approved wlt1.%
  // event types into this SAME `foundation.outbox_event` table — but Vitest guarantees test
  // ORDER only WITHIN one file, never ACROSS files under default parallelism, so an
  // exact-equality assertion split across files would be a genuine race (this file's own check
  // might run before, after, or concurrently with another file's writes). The SECURITY-RELEVANT
  // property — no unapproved/unexpected wlt1.% event type ever appears — is fully enforced by
  // the subset check below; positive reachability of every OTHER event type is proven
  // independently, per-event, in each owning file's own scoped assertions (never a fragile
  // database-wide sweep there either).
  //
  // Sensitive Read Logging (FR-018) CORRECTION: `approved` below was stale — it carried only 11
  // of the 21 event types already accepted at the time this correction was made (missing every
  // Phase 4A-1/4A-2/4B/Destination-Revocation wallet-approval event and every Fiat Payout
  // Destinations (APAC) event), a pre-existing test-harness gap unrelated to any of those
  // features (independently confirmed: a Turn-1 fiat-only file, and separately a wallet-only
  // suite, each reproduced the identical stale-allowlist failure alone, on a fresh database).
  // Corrected then to the complete, current 22-entry accepted set as DIRECTLY-RELATED fallout of
  // that phase's own error/audit inventory changes (27→28, 21→22).
  //
  // Evidence Export addition: exactly TWO new event types — `wlt1.evidence_export_generated`
  // (emitted at successful `apply`) and `wlt1.evidence_exported` (emitted at every successful
  // `download` — a real disclosure, never deduplicated). DIRECTLY-RELATED fallout of this phase's
  // own error/audit inventory changes (28→31, 22→24) — this file is already necessarily touched
  // for those. No other unrelated debt in this file was touched.
  //
  // Stuck-Screening Operational Closure addition: exactly ONE new event type —
  // `wlt1.screening_recovered` (emitted at every successful deterministic recovery of a stuck
  // `pending` wallet screening — see lib/stuck-screening.ts's own audit envelope). DIRECTLY-RELATED
  // fallout of this phase's own error/audit inventory changes (33→35, 25→26).
  //
  // Limits / Velocity / Concentration / First-Use addition: exactly ONE new event type —
  // `wlt1.limit_denied` (emitted at every LIMIT_POLICY denial, at both evaluate-use and
  // verify-and-consume). Errors stay at 35 (no new error codes; business denial is expressed via
  // the existing closed reason_code enums, not new WLT1_ codes). DIRECTLY-RELATED fallout of this
  // phase's own audit inventory change (26→27).
  // -----------------------------------------------------------------------------------------
  describe("FINAL WLT AUDIT EVENT INVENTORY", () => {
    it("every wlt1.% event type ANYWHERE in the outbox is one of the approved set, and includes at least this file's own 3 registration-flow types", async () => {
      if (!schemaReady) return;
      const rows = await verifyPool.query(`SELECT DISTINCT event_type FROM foundation.outbox_event WHERE event_type LIKE 'wlt1.%' ORDER BY event_type`);
      const types = rows.rows.map((r) => r.event_type);
      const approved = [
        "wlt1.address_integrity_checked",
        "wlt1.destination_registration_refused",
        "wlt1.wallet_registered",
        "wlt1.wallet_screening_completed",
        "wlt1.wallet_high_risk_detected",
        "wlt1.wallet_sanctions_exposure",
        "wlt1.wallet_screening_requested",
        "wlt1.provider_receipt_conflict_detected",
        "wlt1.proof_of_control_challenge_issued",
        "wlt1.proof_of_control_verified",
        "wlt1.proof_of_control_failed",
        "wlt1.destination_whitelist_approval_requested",
        "wlt1.destination_whitelist_approved",
        "wlt1.destination_use_evaluated",
        "wlt1.destination_decision_verified",
        "wlt1.destination_decision_consumed",
        "wlt1.destination_revoked",
        "wlt1.rescreening_run_completed",
        "wlt1.fiat_payout_destination_registered",
        "wlt1.beneficiary_verification_completed",
        "wlt1.fiat_screening_completed",
        "wlt1.sensitive_destination_read",
        "wlt1.evidence_export_generated",
        "wlt1.evidence_exported",
        "wlt1.inbound_source_screened",
        "wlt1.screening_recovered",
        "wlt1.limit_denied",
      ].sort();
      for (const type of types) {
        expect(approved, `unapproved wlt1.% event type observed: ${type}`).toContain(type);
      }
      for (const type of ["wlt1.address_integrity_checked", "wlt1.destination_registration_refused", "wlt1.wallet_registered"]) {
        expect(types, `this file's own registration-flow tests should have produced ${type}`).toContain(type);
      }
    });
  });
});
