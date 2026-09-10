/**
 * WLT-01 Phase 2C-B/2C-C1 — `createScreeningApplication(...).applyNormalizedScreeningResult`
 * (`services/wlt1/src/lib/screening-application.ts`) service-level tests. No route reaches this
 * function yet — every test here calls the CONFIGURED service directly (never a raw exported
 * primitive — none exists), against real `wlt1.destination`/`wlt1.wallet_screening_result` rows
 * created via direct SQL (there is no `/screen` route to create them organically until Phase
 * 2C-C2), under the real least-privilege `role_wlt1_runtime` (never superuser-only — same
 * discipline `tests/integration/wlt1-db.test.ts` established).
 *
 * P2CB-MED-1 closure (Phase 2C-C1): `screeningApplication` (module-level, above) is built ONCE via
 * `createScreeningApplication(testWlt1Config())`, where `testWlt1Config()` calls the REAL
 * `loadWlt1Config` — never a hand-assembled object, never a bare number. Every test in this file
 * therefore proves the configured composition genuinely governs persisted validity; a dedicated
 * "P2CB-MED-1 closure" describe block below additionally proves the ceiling is load-bearing (two
 * differently-configured services persist different ceilings) and that an invalid override cannot
 * reach a service at all (rejected by `loadWlt1Config` itself, before any service exists).
 *
 * Self-skips unless `TEST_DATABASE_URL` is set. Uses the SHARED canonical test database (like
 * `wlt1-db.test.ts` itself), not a private disposable one — this function has no migration-runner
 * concerns of its own.
 *
 * AUDIT-INVENTORY SCOPING NOTE: this file proves each of the three Phase 2C-B audit event types
 * (`wlt1.wallet_screening_completed`/`wlt1.wallet_high_risk_detected`/`wlt1.wallet_sanctions_
 * exposure`) is genuinely reachable via a query SCOPED to the specific `screening_result_id` each
 * test creates (`WHERE entity_id = $1`), never via a database-wide "exactly N types anywhere in
 * the outbox" sweep — that global invariant lives in `wlt1-db.test.ts`'s own final audit-inventory
 * block, run only after every test IN THAT FILE (Vitest guarantees in-file order, never cross-file
 * order under default parallelism, so a global sweep split across two files would be a real race).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { closePool, getPool, initPool, query as rawQuery } from "@aix/foundation";
import { createScreeningApplication, RFC3339_UTC_OFFSET_PATTERN } from "../../services/wlt1/src/lib/screening-application.js";
import { Wlt1Error } from "../../services/wlt1/src/lib/errors.js";
import { loadWlt1Config } from "../../services/wlt1/src/config.js";
import type { NormalizedScreeningResult, ScreeningEvidenceEnvelope } from "../../services/wlt1/src/lib/providers/types.js";
import { createWlt1ProviderReceiptAuthenticator } from "../../services/wlt1/src/plugins/receipt-auth.js";

/** H-D2-1: there is no exported unbound authentication function anymore — a fixture must obtain a
 * capability the SAME way production code does, through a config-bound
 * `Wlt1ProviderReceiptAuthenticator` built from a REAL, validated `Wlt1Config` (via `testWlt1Config`
 * below, itself built through the real `loadWlt1Config` — never a hand-assembled secrets map). */
const FIXTURE_RECEIPT_PROVIDER_ID = "stub-wallet-analytics-v1";
const FIXTURE_RECEIPT_SECRET = "integration-test-fixture-receipt-secret-01";
function mintTestProvenance(payloadHash: string) {
  const authenticator = createWlt1ProviderReceiptAuthenticator(
    testWlt1Config({ WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ [FIXTURE_RECEIPT_PROVIDER_ID]: FIXTURE_RECEIPT_SECRET }) }),
  );
  const capability = authenticator.authenticate(FIXTURE_RECEIPT_PROVIDER_ID, FIXTURE_RECEIPT_SECRET);
  if (!capability) throw new Error("test fixture authentication unexpectedly failed");
  return capability.mintProvenance(payloadHash);
}

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_screening_app_test";
const SCREENING_MAX_VALIDITY_HOURS = 720;

/**
 * P2CB-MED-1 closure — a minimal-but-genuinely-validated `Wlt1Config`, built through the real
 * `loadWlt1Config` (never hand-assembled), exactly the way Phase 2C-C server composition will
 * build one from `app.config`. Every test below drives the configured
 * `screeningApplication.applyNormalizedScreeningResult` — there is no other way to reach the
 * persistence core from outside this file; the raw internal function is not exported.
 */
function testWlt1Config(overrides: Record<string, string | undefined> = {}) {
  return loadWlt1Config({
    ENVIRONMENT: "dev",
    DATABASE_URL: "postgres://unused@localhost:5432/unused",
    PORT: "8090",
    WLT1_INTERNAL_SERVICE_TOKEN: "a".repeat(40),
    CLT1_BASE_URL: "http://localhost:8085",
    CLT1_INTERNAL_SERVICE_TOKEN: "b".repeat(40),
    IAM2_BASE_URL: "http://localhost:8082",
    IAM2_INTERNAL_SERVICE_TOKEN: "c".repeat(40),
    AML1_BASE_URL: "http://localhost:8087",
    AML1_INTERNAL_SERVICE_TOKEN: "d".repeat(40),
    WLT1_FIAT_ENC_KEY: "e".repeat(40),
    WLT1_SCREENING_MAX_VALIDITY_HOURS: String(SCREENING_MAX_VALIDITY_HOURS),
    IAM_BASE_URL: "http://localhost:8081",
    IAM_INTROSPECTION_SERVICE_TOKEN: "f".repeat(40),
    FND_BASE_URL: "http://localhost:8080",
    FND_RATE_LIMIT_CONSUMER_TOKEN: "g".repeat(40),
    WLT1_PUBLIC_DESTINATION_LIST_MAX: "100",
    ...overrides,
  });
}

const screeningApplication = createScreeningApplication(testWlt1Config());

let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(
      `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result') AS n`,
    );
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
});

afterAll(async () => {
  await closePool();
  await verifyPool?.end();
});

/** Issue B remediation: every destination fixture in this file is created under this SAME
 * `client_id` (confirmed absent from `wlt1-db.test.ts`'s own client_id vocabulary — see that
 * file's own `FOREIGN_CLIENT_IDS` exclusion list, which already names this exact value) — cleanup
 * below is scoped to exactly this value, never a global table-wide DELETE, so this file can never
 * destroy another file's concurrently-created fixtures when Vitest schedules multiple WLT-01 test
 * files in parallel against the shared canonical database. Pre-dates Phase 2C-C2; this specific
 * unscoped-DELETE defect was discovered during acceptance-harness stabilization, reproduced via a
 * full-canonical-suite FK-violation failure, and is fixed here — never a redesign of this file's
 * own production-facing test behaviour. */
const OWNED_CLIENT_ID = "clt1client_screenapp";

/** FK-safe, OWNED_CLIENT_ID-scoped cleanup — every DELETE below carries a `WHERE` clause that can
 * only ever touch rows this file itself created, never another concurrently-running file's
 * fixtures on the same shared database. Factored into its own function (not inlined in `afterEach`)
 * so the sentinel proof below can invoke the EXACT SAME cleanup logic the real `afterEach` runs. */
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
}

afterEach(async () => {
  if (!schemaReady) return;
  await cleanupOwnedFixtures();
});

function freshId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertPendingDestination(destinationId: string, status: "pending_screening" | "draft" = "pending_screening"): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`,
    [destinationId, OWNED_CLIENT_ID, "hash_" + randomUUID(), status],
  );
}

async function insertPendingScreening(opts: {
  screeningResultId: string;
  destinationId: string;
  version?: number;
  providerId?: string;
  providerAdaptorVersion?: string;
}): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
     VALUES ($1, $2, $3, $4, $5, 'ethereum', 'mainnet', $6)`,
    [
      opts.screeningResultId,
      opts.destinationId,
      opts.version ?? 1,
      opts.providerId ?? "stub-wallet-analytics-v1",
      opts.providerAdaptorVersion ?? "1",
      "addrhash_" + randomUUID(),
    ],
  );
}

function baseResult(overrides: Partial<NormalizedScreeningResult> = {}): NormalizedScreeningResult {
  return {
    providerResultId: "presult_" + randomUUID(),
    riskStatus: "clear",
    riskScore: 2.0,
    riskCategories: [],
    directExposure: [],
    indirectExposure: [],
    sanctionsExposure: false,
    clusterRef: null,
    issuedAtUtc: new Date().toISOString(),
    validUntilUtc: null,
    ...overrides,
  };
}

const SYNCHRONOUS_ENVELOPE: ScreeningEvidenceEnvelope = {
  sourceKind: "synchronous_provider",
  providerId: "stub-wallet-analytics-v1",
  providerAdaptorVersion: "1",
};

async function setupPending(overrides: { destinationStatus?: "pending_screening" | "draft" } = {}): Promise<{ destinationId: string; screeningResultId: string }> {
  const destinationId = freshId("wlt1dest_screenapp");
  const screeningResultId = freshId("wlt1screen_screenapp");
  await insertPendingDestination(destinationId, overrides.destinationStatus ?? "pending_screening");
  await insertPendingScreening({ screeningResultId, destinationId });
  return { destinationId, screeningResultId };
}

async function fetchScreeningRow(screeningResultId: string) {
  const r = await verifyPool.query(
    `SELECT risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref,
            provider_result_id, source_authenticated, payload_hash, issued_at_utc, valid_until_utc
       FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
    [screeningResultId],
  );
  return r.rows[0];
}

async function fetchDestinationRow(destinationId: string) {
  const r = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  return r.rows[0];
}

async function auditCountFor(screeningResultId: string, eventType: string): Promise<number> {
  // `entity_id` is not a real column on foundation.outbox_event — it lives only inside the
  // `payload_ref` JSON text (mirrors the exact scoping pattern already established in
  // tests/integration/wlt1-db.test.ts's own P1B-LOW-1/P1B-LOW-2 audit-count assertions).
  const r = await verifyPool.query(
    `SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = $1 AND payload_ref::text LIKE '%' || $2 || '%'`,
    [eventType, screeningResultId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Phase 2C-B: applyNormalizedScreeningResult", () => {
  // -----------------------------------------------------------------------------------------
  describe("outcome application", () => {
    it("pending -> clear: screening terminal, destination pending_review, version+1, completed audit only", async () => {
      // H-D3C-1: this is the ONE fail-loud canary in this file — mirrors the established
      // aml1/cfg1/fnd/iam/iam2/sec1 pattern. Every OTHER test's own `if (!schemaReady) return;`
      // still self-skips silently (unchanged, benign when TEST_DATABASE_URL is genuinely unset),
      // but a genuine schema/role/grant setup failure with a real TEST_DATABASE_URL supplied must
      // fail this one test loudly instead of letting the whole file silently pass.
      if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
      const { destinationId, screeningResultId } = await setupPending();
      const before = await fetchDestinationRow(destinationId);

      const output = await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear" }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      expect(output.riskStatus).toBe("clear");
      expect(output.destinationStatus).toBe("pending_review");

      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("clear");
      const destination = await fetchDestinationRow(destinationId);
      expect(destination.status).toBe("pending_review");
      expect(destination.destination_status_version).toBe(Number(before.destination_status_version) + 1);

      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_high_risk_detected")).toBe(0);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_sanctions_exposure")).toBe(0);
    });

    it("pending -> review_required: destination pending_review, completed audit only", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();

      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "review_required", riskCategories: ["mixer"], directExposure: [{ category: "mixer" }] }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("review_required");
      const destination = await fetchDestinationRow(destinationId);
      expect(destination.status).toBe("pending_review");
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_high_risk_detected")).toBe(0);
    });

    it("pending -> high_risk: destination pending_review, completed + high_risk_detected audits", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();

      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "high_risk", riskScore: 82, riskCategories: ["darknet"], directExposure: [{ category: "darknet" }] }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const destination = await fetchDestinationRow(destinationId);
      expect(destination.status).toBe("pending_review");
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_high_risk_detected")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_sanctions_exposure")).toBe(0);
    });

    it("pending -> hit WITH sanctions exposure: completed + sanctions_exposure audits, riskScore may be null", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();

      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "hit", riskScore: null, riskCategories: ["sanctions"], sanctionsExposure: true, directExposure: [{ category: "sanctions" }] }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("hit");
      expect(screening.risk_score).toBeNull();
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_sanctions_exposure")).toBe(1);
    });

    it("pending -> hit WITHOUT sanctions exposure: completed audit ONLY, no sanctions audit invented", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();

      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "hit", riskScore: 91, riskCategories: ["darknet"], sanctionsExposure: false, directExposure: [{ category: "darknet" }] }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      expect(await auditCountFor(screeningResultId, "wlt1.wallet_screening_completed")).toBe(1);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_sanctions_exposure")).toBe(0);
      expect(await auditCountFor(screeningResultId, "wlt1.wallet_high_risk_detected")).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("P2B-LOW-1 one-way guard", () => {
    it("a second application against an already-terminal (clear) row is rejected, never re-applied", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear" }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "hit", sanctionsExposure: true, riskCategories: ["sanctions"] }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE" });

      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("clear"); // unchanged — clear -> hit rejected
    });

    it("terminal -> pending is impossible through this function (no code path ever writes 'pending' back)", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "hit", sanctionsExposure: true, riskCategories: ["sanctions"] }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE" });
      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.risk_status).toBe("hit"); // unchanged — hit -> clear rejected
    });

    it("destination not in pending_screening (e.g. still draft) is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending({ destinationStatus: "draft" });
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE" });
    });

    it("missing destination returns the existing WLT1_DESTINATION_NOT_FOUND, never disguised as invalid state", async () => {
      if (!schemaReady) return;
      const screeningResultId = freshId("wlt1screen_orphan");
      // No destination row exists at all for this call.
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId: freshId("wlt1dest_missing"),
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_NOT_FOUND" });
    });

    it("screening row not found is rejected as invalid state", async () => {
      if (!schemaReady) return;
      const destinationId = freshId("wlt1dest_screenapp");
      await insertPendingDestination(destinationId, "pending_screening");
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId: freshId("wlt1screen_nonexistent"),
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE" });
    });

    it("screening row belonging to a DIFFERENT destination is rejected", async () => {
      if (!schemaReady) return;
      const { screeningResultId } = await setupPending();
      const otherDestinationId = freshId("wlt1dest_other");
      await insertPendingDestination(otherDestinationId, "pending_screening");
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId: otherDestinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE" });
    });

    // L2 closure (Phase 2C-C1): the Phase 2C-B implementation report claimed a row that is
    // simultaneously `pending` AND non-current was structurally unreachable, reasoning from
    // migration 050's own partial unique index (`idx_wlt1_wallet_screening_result_one_pending
    // WHERE risk_status='pending'`). Independent Opus review proved that rationale WRONG: the
    // index only constrains PENDING rows to be unique per destination — it says nothing about a
    // TERMINAL higher-version row coexisting with a pending lower-version one. See the dedicated
    // "L2 — superseded-version committed coverage" describe block below for the real committed
    // construction and proof.
  });

  // -----------------------------------------------------------------------------------------
  describe("provider-evidence binding", () => {
    it("providerId mismatch is rejected as WLT1_VENDOR_RESULT_INVALID", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: { sourceKind: "synchronous_provider", providerId: "not-the-real-provider", providerAdaptorVersion: "1" },
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });

    it("providerAdaptorVersion mismatch is rejected as WLT1_VENDOR_RESULT_INVALID", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear" }),
          evidence: { sourceKind: "synchronous_provider", providerId: "stub-wallet-analytics-v1", providerAdaptorVersion: "99" },
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("P2CA-MED-1: source_authenticated / payload_hash derivation", () => {
    it("synchronous_provider envelope persists source_authenticated NULL and payload_hash NULL", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear" }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.source_authenticated).toBeNull();
      expect(screening.payload_hash).toBeNull();
    });

    it("provider_receipt envelope persists source_authenticated TRUE and the server-minted payload_hash — without any receipt route existing (Phase 2C-D1: provenance must be the branded AuthenticatedReceiptProvenance, a bare payloadHash string is no longer a legal shape)", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const testPayloadHash = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
      const receiptEnvelope: ScreeningEvidenceEnvelope = {
        sourceKind: "provider_receipt",
        providerId: "stub-wallet-analytics-v1",
        providerAdaptorVersion: "1",
        provenance: mintTestProvenance(testPayloadHash),
      };
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear" }),
        evidence: receiptEnvelope,
      });
      const screening = await fetchScreeningRow(screeningResultId);
      expect(screening.source_authenticated).toBe(true);
      expect(screening.payload_hash).toBe(testPayloadHash);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe("temporal / validity enforcement", () => {
    it("a valid issuedAtUtc with no provider expiry uses the local ceiling", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date();
      const output = await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: null }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      const expected = new Date(issuedAt.getTime() + SCREENING_MAX_VALIDITY_HOURS * 3600_000);
      expect(new Date(output.validUntilUtc).getTime()).toBe(expected.getTime());
    });

    it("provider expiry BEFORE the local ceiling is used as-is", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date();
      const providerExpiry = new Date(issuedAt.getTime() + 3600_000); // 1 hour, well under the 720h ceiling
      const output = await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: providerExpiry.toISOString() }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      expect(new Date(output.validUntilUtc).getTime()).toBe(providerExpiry.getTime());
    });

    it("provider expiry AFTER the local ceiling is clipped to the ceiling, not rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date();
      const farFutureExpiry = new Date(issuedAt.getTime() + 20000 * 3600_000); // way beyond 720h
      const output = await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: farFutureExpiry.toISOString() }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      const ceiling = new Date(issuedAt.getTime() + SCREENING_MAX_VALIDITY_HOURS * 3600_000);
      expect(new Date(output.validUntilUtc).getTime()).toBe(ceiling.getTime());
    });

    it("issuedAtUtc up to 120s in the future is accepted", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date(Date.now() + 100_000); // 100s future, under the 120s skew allowance
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString() }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).resolves.toBeDefined();
    });

    it("issuedAtUtc beyond 120s in the future is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date(Date.now() + 200_000); // 200s future, beyond the 120s skew allowance
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString() }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });

    it("validUntilUtc at or before issuedAtUtc is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: issuedAt.toISOString() }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });

    it("an already-expired effective validity (issuedAtUtc far enough in the past) is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date(Date.now() - (SCREENING_MAX_VALIDITY_HOURS + 10) * 3600_000); // older than the ceiling itself
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: null }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });

    it("an unparseable issuedAtUtc is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "not-a-timestamp" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });

    it("an unparseable validUntilUtc is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", validUntilUtc: "not-a-timestamp" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID" });
    });
  });

  // -----------------------------------------------------------------------------------------
  // The single outbox-ACL-REVOKE audit-failure test that used to live here ("an audit publish
  // failure rolls back everything...") was MOVED to
  // tests/integration/wlt1-outbox-acl-private.test.ts's own "terminal-application audit atomicity"
  // describe block — `role_wlt1_runtime` is the SAME runtime role shared by this file,
  // `wlt1-db.test.ts`, and `wlt1-screening-route.test.ts`, all running concurrently against this
  // SAME shared canonical database; the REVOKE this test performed could (and, once observed
  // empirically, did) starve an ordinary bystander request from one of those sibling files during
  // the revoke window, even with every ACL MUTATOR correctly serialized behind the shared advisory
  // lock. Moving it onto its own private, disposable database removes that exposure entirely
  // without weakening the test's assertions. See wlt1-outbox-acl-private.test.ts's own file header
  // for the full rationale.

  // -----------------------------------------------------------------------------------------
  // Phase 2C-C1, P2CB-MED-1 closure — the validity ceiling must come ONLY from a validated
  // Wlt1Config, captured once by closure, never from a caller-facing parameter (which no longer
  // exists on ApplyNormalizedScreeningResultInput at all).
  // -----------------------------------------------------------------------------------------
  describe("P2CB-MED-1 closure — authoritative validity-ceiling composition", () => {
    it("ApplyNormalizedScreeningResultInput has no screeningMaxValidityHours field — passing one is a compile-time error, and the extra property is ignored at runtime regardless", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      // Runtime proof: the exact key set of a legal call has no ceiling key at all.
      const legalInput = { destinationId, screeningResultId, result: baseResult({ riskStatus: "clear" }), evidence: SYNCHRONOUS_ENVELOPE };
      expect(Object.keys(legalInput).sort()).toEqual(["destinationId", "evidence", "result", "screeningResultId"]);

      // @ts-expect-error — screeningMaxValidityHours is NOT part of ApplyNormalizedScreeningResultInput.
      // Passing this object literal DIRECTLY as the call argument triggers TypeScript's own
      // excess-property check; if this field is ever accidentally re-added to the type, this
      // directive becomes unused and `npx tsc -b --force` fails on it — a genuine compile-time
      // proof, not merely a runtime assertion.
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear" }),
        evidence: SYNCHRONOUS_ENVELOPE,
        screeningMaxValidityHours: 876000,
      });

      const screening = await fetchScreeningRow(screeningResultId);
      // Even though the extra property was present on the literal, it was never read — the
      // persisted ceiling still comes from the 720h test config, not 876000.
      const expected = new Date(new Date(screening.issued_at_utc).getTime() + SCREENING_MAX_VALIDITY_HOURS * 3600_000);
      expect(new Date(screening.valid_until_utc).getTime()).toBe(expected.getTime());
    });

    it("a service built from config=720 persists a 30-day local ceiling when the provider supplies no expiry", async () => {
      if (!schemaReady) return;
      const service720 = createScreeningApplication(testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "720" }));
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date();
      const output = await service720.applyNormalizedScreeningResult({
        destinationId,
        screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: null }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      const days = (new Date(output.validUntilUtc).getTime() - issuedAt.getTime()) / 86_400_000;
      expect(days).toBeCloseTo(30, 5);
    });

    it("LOAD-BEARING PROOF: two services built from DIFFERENT validated configs persist DIFFERENT ceilings — the config is genuinely consulted, not ignored", async () => {
      if (!schemaReady) return;
      const shortService = createScreeningApplication(testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "24" }));
      const longService = createScreeningApplication(testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "8760" }));

      const short = await setupPending();
      const issuedAtShort = new Date();
      const outputShort = await shortService.applyNormalizedScreeningResult({
        destinationId: short.destinationId,
        screeningResultId: short.screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAtShort.toISOString(), validUntilUtc: null }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const long = await setupPending();
      const issuedAtLong = new Date();
      const outputLong = await longService.applyNormalizedScreeningResult({
        destinationId: long.destinationId,
        screeningResultId: long.screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAtLong.toISOString(), validUntilUtc: null }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const hoursShort = (new Date(outputShort.validUntilUtc).getTime() - issuedAtShort.getTime()) / 3_600_000;
      const hoursLong = (new Date(outputLong.validUntilUtc).getTime() - issuedAtLong.getTime()) / 3_600_000;
      expect(hoursShort).toBeCloseTo(24, 3);
      expect(hoursLong).toBeCloseTo(8760, 3);
      expect(hoursLong).toBeGreaterThan(hoursShort * 300); // unambiguously different, not coincidentally close
    });

    it("an out-of-range override (8761) cannot even produce a Wlt1Config — no service composition is reachable", () => {
      expect(() => testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "8761" })).toThrow();
      try {
        testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "8761" });
      } catch (err) {
        expect((err as { code?: string }).code).toBe("CONFIGURATION_INVALID");
      }
    });

    it("a non-integer override (1.5) cannot produce a Wlt1Config", () => {
      expect(() => testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: "1.5" })).toThrow();
    });

    it("NaN/Infinity/0 overrides cannot produce a Wlt1Config — none can reach createScreeningApplication through the runtime config path", () => {
      for (const bogus of ["NaN", "Infinity", "0"]) {
        expect(() => testWlt1Config({ WLT1_SCREENING_MAX_VALIDITY_HOURS: bogus })).toThrow();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-C1, L1 closure — strict RFC-3339 UTC provider-timestamp contract. A WLT-LOCAL
  // screening-result persistence rule, not a platform-wide/SEC-01 change.
  // -----------------------------------------------------------------------------------------
  describe("L1 closure — strict RFC3339 UTC provider-timestamp contract", () => {
    it("issuedAtUtc with an explicit Z offset is accepted", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const iso = new Date().toISOString(); // already Z-suffixed
      expect(RFC3339_UTC_OFFSET_PATTERN.test(iso)).toBe(true);
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: iso }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).resolves.toBeDefined();
    });

    it("issuedAtUtc with an explicit numeric offset (+08:00) is accepted", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const nowUtc = new Date();
      const plus8 = new Date(nowUtc.getTime() + 8 * 3_600_000);
      const explicitOffset = `${plus8.toISOString().slice(0, 19)}+08:00`;
      expect(RFC3339_UTC_OFFSET_PATTERN.test(explicitOffset)).toBe(true);
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: explicitOffset }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).resolves.toBeDefined();
    });

    it("NORMALIZATION PROOF: a Z timestamp and its equivalent +08:00 explicit-offset form persist the IDENTICAL UTC instant — never a server-timezone reinterpretation", async () => {
      if (!schemaReady) return;
      // Whole-second precision on both forms — comparing a millisecond-precision Z form against a
      // seconds-only +08:00 literal would (correctly) diverge and prove nothing about normalization.
      const nowUtc = new Date(Math.floor(Date.now() / 1000) * 1000);
      const plus8 = new Date(nowUtc.getTime() + 8 * 3_600_000);
      const zForm = nowUtc.toISOString();
      const offsetForm = `${plus8.toISOString().slice(0, 19)}+08:00`;

      const a = await setupPending();
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId: a.destinationId,
        screeningResultId: a.screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: zForm }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });
      const b = await setupPending();
      await screeningApplication.applyNormalizedScreeningResult({
        destinationId: b.destinationId,
        screeningResultId: b.screeningResultId,
        result: baseResult({ riskStatus: "clear", issuedAtUtc: offsetForm }),
        evidence: SYNCHRONOUS_ENVELOPE,
      });

      const rowA = await fetchScreeningRow(a.screeningResultId);
      const rowB = await fetchScreeningRow(b.screeningResultId);
      expect(new Date(rowA.issued_at_utc).getTime()).toBe(new Date(rowB.issued_at_utc).getTime());
    });

    it("a timezone-naive date-only string (YYYY-MM-DD) is rejected — syntax invalid, never silently interpreted", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "2026-08-11" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_syntax_invalid" }] });
    });

    it("a textual local-format date ('Aug 11 2026') is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "Aug 11 2026" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_syntax_invalid" }] });
    });

    it("a no-offset datetime (missing Z or numeric offset entirely) is rejected", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "2026-08-11T10:00:00" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_syntax_invalid" }] });
    });

    it("a malformed string is rejected at the syntax stage", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "not-a-timestamp-at-all" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_syntax_invalid" }] });
    });

    it("a syntactically valid but calendar-impossible timestamp (month 13) is rejected AFTER the syntax stage, with the existing _unparseable reason", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      expect(RFC3339_UTC_OFFSET_PATTERN.test("2026-13-45T00:00:00Z")).toBe(true); // passes syntax...
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: "2026-13-45T00:00:00Z" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_unparseable" }] }); // ...but fails calendar validity
    });

    it("validUntilUtc is held to the SAME strict grammar as issuedAtUtc", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", validUntilUtc: "2026-08-11T10:00:00" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "valid_until_utc_syntax_invalid" }] });
    });

    it("REGRESSION: the existing future-skew (120s) rule is preserved unchanged under the strict grammar", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date(Date.now() + 200_000);
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString() }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "issued_at_utc_excessively_future" }] });
    });

    it("REGRESSION: the existing already-expired-effective-validity rule is preserved unchanged under the strict grammar", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId } = await setupPending();
      const issuedAt = new Date(Date.now() - (SCREENING_MAX_VALIDITY_HOURS + 10) * 3_600_000);
      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId,
          result: baseResult({ riskStatus: "clear", issuedAtUtc: issuedAt.toISOString(), validUntilUtc: null }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_VENDOR_RESULT_INVALID", details: [{ issue: "effective_valid_until_already_expired" }] });
    });
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-C1, L2 closure — the "superseded by a newer screening_result_version" guard,
  // committed and reachable. Constructed exactly as independent Opus review proved possible: a
  // TERMINAL higher-version row inserted alongside a PENDING lower-version one — migration 050's
  // own partial unique index only constrains PENDING rows, never terminal ones, so this violates
  // no constraint and requires no unsafe schema bypass.
  // -----------------------------------------------------------------------------------------
  describe("L2 closure — superseded-version committed coverage", () => {
    it("pending v1 + terminal v2 (inserted via the real runtime INSERT grant): applying v1 is rejected as superseded, v1/v2/destination all unchanged, no audit produced", async () => {
      if (!schemaReady) return;
      const { destinationId, screeningResultId: v1Id } = await setupPending();
      const v2Id = freshId("wlt1screen_v2");

      // Inserted through the SAME runtime pool `screeningApplication` itself uses — `initPool`
      // was already pointed at role_wlt1_runtime in beforeAll, and this table carries a
      // table-level INSERT grant for that role (confirmed in wlt1-db.test.ts's own grant suite).
      await rawQuery(
        getPool(),
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status)
         VALUES ($1, $2, 2, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3, 'clear')`,
        [v2Id, destinationId, "addrhash_" + randomUUID()],
      );

      const destinationBefore = await fetchDestinationRow(destinationId);

      await expect(
        screeningApplication.applyNormalizedScreeningResult({
          destinationId,
          screeningResultId: v1Id,
          result: baseResult({ riskStatus: "clear" }),
          evidence: SYNCHRONOUS_ENVELOPE,
        }),
      ).rejects.toMatchObject({ code: "WLT1_DESTINATION_INVALID_STATE", details: [{ issue: "screening_result_superseded_by_newer_version" }] });

      const v1Row = await fetchScreeningRow(v1Id);
      expect(v1Row.risk_status).toBe("pending");
      expect(v1Row.issued_at_utc).toBeNull(); // no terminal evidence written to v1

      const v2Row = await verifyPool.query(`SELECT risk_status, screening_result_version FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [v2Id]);
      expect(v2Row.rows[0]).toEqual({ risk_status: "clear", screening_result_version: 2 });

      const destinationAfter = await fetchDestinationRow(destinationId);
      expect(destinationAfter).toEqual(destinationBefore); // destination state fully unchanged

      expect(await auditCountFor(v1Id, "wlt1.wallet_screening_completed")).toBe(0); // rejected application produced no audit
    });
  });

  // -----------------------------------------------------------------------------------------
  // Issue B deterministic fixture-isolation proof — does NOT rely on "all co-scheduled runs must
  // be green" (the shared canonical database's own cross-file scheduling can vary run to run).
  // Instead this proves the exact production cleanup control directly and deterministically:
  // creates a real owner-A fixture (this file's own OWNED_CLIENT_ID) alongside a hand-inserted,
  // byte-snapshotted owner-B "foreign" fixture under a DIFFERENT client_id, invokes the SAME
  // `cleanupOwnedFixtures()` function the real `afterEach` uses (not a re-typed copy of the SQL),
  // and asserts A is fully gone while B survives unchanged in every column across all five tables.
  // No global DELETE, no mocked SQL string, no sleep-based timing.
  // -----------------------------------------------------------------------------------------
  describe("Issue B deterministic fixture-isolation proof (sentinel ownership)", () => {
    const FOREIGN_SENTINEL_CLIENT_ID = "clt1client_screenapp_sentinel_foreign";

    it("cleanupOwnedFixtures() removes every OWNED_CLIENT_ID row and leaves a foreign owner's rows byte-for-byte untouched", async () => {
      if (!schemaReady) return;

      // --- Owner A: real fixture, created through this file's own established fixture helpers. ---
      const aDestinationId = freshId("wlt1dest_sapp_sa");
      const aScreeningResultId = freshId("wlt1scrn_sapp_sa");
      await insertPendingDestination(aDestinationId);
      await insertPendingScreening({ screeningResultId: aScreeningResultId, destinationId: aDestinationId });
      const aInboxId = freshId("wlt1inbx_sapp_sa");
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
         VALUES ($1, 'stub-wallet-analytics-v1', $2, $3, $4, 'wallet_screening', $5, true, now())`,
        [aInboxId, freshId("presult_sentinel_a"), aDestinationId, aScreeningResultId, freshId("sha256:sentinel_a")],
      );
      // insertPendingDestination() never creates a wallet_destination/address_integrity_check row
      // (this file's own destinations are hand-inserted directly into wlt1.destination only, never
      // through the real registration route) — insert both here so cleanupOwnedFixtures()'s DELETE
      // branches for those two tables are genuinely exercised, not vacuously no-ops.
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unknown', 'self')`,
        [aDestinationId, "0x3333333333333333333333333333333333333C", freshId("addrhash_sentinel_a")],
      );
      const aCheckId = freshId("wlt1chk_sapp_sa");
      await verifyPool.query(
        `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
         VALUES ($1, $2, $3, 'ethereum', 'mainnet', $4, $4, 'ethereum-eip55-v1', true, 'pass', 'canonicalisation_succeeded')`,
        [aCheckId, aDestinationId, OWNED_CLIENT_ID, freshId("hash_sentinel_a")],
      );

      // --- Owner B: hand-inserted foreign sentinel, a DIFFERENT client_id never used by this
      // file's own fixtures or by `OWNED_CLIENT_ID`-scoped cleanup. ---
      const bDestinationId = freshId("wlt1dest_sapp_sb");
      const bAddressHash = freshId("addrhash_sentinel_b");
      const bScreeningResultId = freshId("wlt1scrn_sapp_sb");
      const bInboxId = freshId("wlt1inbx_sapp_sb");
      const bCheckId = freshId("wlt1chk_sapp_sb");
      await verifyPool.query(
        `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, $2, 'wallet', $3)`,
        [bDestinationId, FOREIGN_SENTINEL_CLIENT_ID, freshId("nkhash_sentinel_b")],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship)
         VALUES ($1, 'ethereum', 'mainnet', $2, $3, 'ethereum-eip55-v1', 'unknown', 'self')`,
        [bDestinationId, "0x4444444444444444444444444444444444444D", bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.address_integrity_check (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
         VALUES ($1, $2, $3, 'ethereum', 'mainnet', $4, $4, 'ethereum-eip55-v1', true, 'pass', 'canonicalisation_succeeded')`,
        [bCheckId, bDestinationId, FOREIGN_SENTINEL_CLIENT_ID, bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
         VALUES ($1, $2, 1, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3)`,
        [bScreeningResultId, bDestinationId, bAddressHash],
      );
      await verifyPool.query(
        `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
         VALUES ($1, 'stub-wallet-analytics-v1', $2, $3, $4, 'wallet_screening', $5, true, now())`,
        [bInboxId, freshId("presult_sentinel_b"), bDestinationId, bScreeningResultId, freshId("sha256:sentinel_b")],
      );

      try {
        // Byte-for-byte snapshot of every owner-B row BEFORE the real cleanup path runs.
        const snapshotBefore = await Promise.all([
          verifyPool.query(`SELECT * FROM wlt1.destination WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestinationId]),
        ]);
        for (const r of snapshotBefore) expect(r.rows.length).toBe(1);

        // Invoke the EXACT SAME function the real `afterEach` calls — not a re-typed copy.
        await cleanupOwnedFixtures();

        // Owner A: every row gone.
        const aAfter = await Promise.all([
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE destination_id = $1`, [aDestinationId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_destination WHERE destination_id = $1`, [aDestinationId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.address_integrity_check WHERE destination_id = $1`, [aDestinationId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [aDestinationId]),
          verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [aDestinationId]),
        ]);
        for (const r of aAfter) expect(r.rows[0].n).toBe(0);

        // Owner B: every row still present, and byte-for-byte identical to the pre-cleanup snapshot.
        const snapshotAfter = await Promise.all([
          verifyPool.query(`SELECT * FROM wlt1.destination WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestinationId]),
          verifyPool.query(`SELECT * FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestinationId]),
        ]);
        for (let i = 0; i < snapshotBefore.length; i++) {
          expect(snapshotAfter[i].rows).toEqual(snapshotBefore[i].rows);
        }
      } finally {
        // This test's own foreign sentinel is intentionally OUTSIDE OWNED_CLIENT_ID scope, so
        // `cleanupOwnedFixtures()` will never remove it (that is exactly what was just proven) —
        // it must be cleaned up here, manually, in FK-safe order, so it never leaks into another
        // test in this file or another file's own run.
        await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id = $1`, [bDestinationId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [bDestinationId]);
        await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id = $1`, [bDestinationId]);
        await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [bDestinationId]);
        await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [bDestinationId]);
      }
    });
  });
});
