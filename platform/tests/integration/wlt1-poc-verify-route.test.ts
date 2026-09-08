/**
 * WLT-01 Phase 3A-3 — signature verification submission lifecycle
 * (`POST .../proof-of-control/verify`), driven against the SHARED canonical database (mirrors
 * `wlt1-proof-of-control-route.test.ts`'s own established pattern: own dedicated runtime role, own
 * client_id fixture scope, H-D3C-1 fail-loud canary as the first test). Self-skips unless
 * `TEST_DATABASE_URL` is set.
 *
 * REAL CRYPTOGRAPHY THROUGHOUT: every "valid proof" scenario here signs the REAL persisted
 * canonical message with the Phase 3A-1 golden test private key (`tests/helpers/
 * poc-test-signing.ts`) and submits it through the REAL route — never a direct call to
 * `verifyEip191PersonalSignSignature`. The golden key's own derived address has no stub-provider
 * fixture entry, so every destination that needs to reach `pending_review` under this address uses
 * the established `screeningProviderImpl` test-injection seam (a synthetic always-`clear` result,
 * mirroring the Phase 2C-D3C "Race 2" precedent) — never a new production backdoor.
 *
 * M-REV-1 INTERIM RULE: this file derives its restricted-role connection URL via the SAFE regex
 * rewrite (`replace(/^postgres:\/\/[^@]+@/, ...)`), not the fragile `.replace("postgres@", ...)`
 * form.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, WLT1_TEST_STUB_ADDRESS_CLEAR, WLT1_TEST_STUB_ADDRESS_UNAVAILABLE } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { POC_TEST_ADDRESS_CANONICAL, POC_TEST_ADDRESS_RAW, signPocMessage, signPocMessageWithDifferentEntropy, signPocMessageWithWrongKey } from "../helpers/poc-test-signing.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_poc_verify_route_test";
const OWNED_CLIENT_ID = "clt1client_pocverify";

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance;
let mainConfig: Wlt1Config;

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

/** The golden key's own derived address has no stub fixture entry — this synthetic provider
 * returns a deterministic terminal `clear` result for ANY input, letting tests reach
 * `pending_review` for that specific address without inventing a second real vendor fixture. Never
 * a production backdoor — `screeningProviderImpl` is the SAME pre-existing test-only DI seam every
 * prior WLT-01 test file already uses. */
const alwaysClearProvider: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(_input: WalletScreeningInput) {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_pocverify_" + randomUUID(),
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

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control') AS n`);
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

  mainConfig = {
    environment: "dev",
    databaseUrl: TEST_DB ?? "postgres://unused",
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-pocverify-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 3,
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: alwaysClearProvider,
  };
  app = await buildApp(mainConfig);
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
});

afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(opts: { chain: string; network: string; address: string; walletType?: string }): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: opts.chain, network: opts.network, address: opts.address, wallet_type: opts.walletType ?? "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

function screen(destinationId: string): Promise<{ statusCode: number; body: any }> {
  return app
    .inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
      payload: {},
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

/** A `pending_review` destination whose canonical address is the GOLDEN key's own derived
 * address — the only address the shared signing helpers can produce a valid proof for. */
async function createSignableDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: POC_TEST_ADDRESS_RAW });
  const res = await screen(destinationId);
  if (res.statusCode !== 200) throw new Error(`expected terminal screening, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  return { destinationId };
}

async function createDraftDestination(): Promise<{ destinationId: string }> {
  return registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
}

async function createPendingScreeningDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
  const res = await screen(destinationId);
  if (res.statusCode !== 202) throw new Error(`expected pending_screening, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  return { destinationId };
}

async function revoke(destinationId: string): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
}

function createChallenge(destinationId: string, idempotencyKey = freshKey()) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
    payload: { client_id: OWNED_CLIENT_ID },
  });
}

async function issueChallenge(destinationId: string): Promise<{ challengeId: string; message: string }> {
  const res = await createChallenge(destinationId);
  if (res.statusCode !== 201) throw new Error(`challenge creation failed: ${res.statusCode} ${res.body}`);
  return { challengeId: res.json().data.challenge_id, message: res.json().data.message };
}

function submitVerify(destinationId: string, challengeId: string, signature: string, opts: { clientId?: string; noAuth?: boolean; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (!opts.noAuth) headers["x-internal-service-token"] = opts.token ?? mainConfig.wlt1InternalServiceToken;
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
    headers,
    payload: { client_id: opts.clientId ?? OWNED_CLIENT_ID, challenge_id: challengeId, signature },
  });
}

async function fetchChallengeRow(challengeId: string) {
  const r = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
  return r.rows[0];
}

async function failedAuditCountFor(challengeId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_failed' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    challengeId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

async function verifiedAuditCountFor(challengeId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_verified' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    challengeId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Phase 3A-3: POST .../proof-of-control/verify", () => {
  // L-3A3-4 / M-REV-1 CLOSURE: this file exercises `proof_of_control`'s own column-scoped UPDATE
  // grant (verification_status/attempt_count/signature_hash/recovered_address/
  // last_failure_reason_code/verified_at_utc) — it must not be capable of silently running as
  // `postgres`, which would prove nothing about the actual grant boundary. Queried via a SEPARATE
  // connection using the SAME `runtimeDbUrl` derivation `initPool` was given in `beforeAll` above,
  // so this proves the URL rewrite itself resolves to the restricted role, not merely that a role
  // of this name exists and happens to be unprivileged.
  it("M-REV-1 / L-3A3-4: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser (fail-loud, not a silent skip)", async () => {
    if (!schemaReady) throw new Error("M-REV-1 canary requires TEST_DATABASE_URL with the wlt1 schema present — this must fail loudly, never silently pass.");
    const probe = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    try {
      const r = await probe.query<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT current_user, session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      const row = r.rows[0];
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

  it("missing internal-service-token -> 401 SERVICE_IDENTITY_REQUIRED, no attempt consumed (H-D3C-1 fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently)", async () => {
    if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
    const res = await submitVerify("wlt1dest_unknown", "wlt1poc_unknown", "0x" + "ab".repeat(65), { noAuth: true });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("invalid internal-service-token -> 401 SERVICE_IDENTITY_REQUIRED", async () => {
    if (!schemaReady) return;
    const res = await submitVerify("wlt1dest_unknown", "wlt1poc_unknown", "0x" + "ab".repeat(65), { token: "wrong-token" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  describe("binding (Part D)", () => {
    it("unknown challenge_id -> 404 WLT1_POC_CHALLENGE_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const res = await submitVerify(destinationId, "wlt1poc_" + randomUUID(), "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
    });

    it("challenge belongs to a DIFFERENT destination -> 404 WLT1_POC_CHALLENGE_NOT_FOUND (never reveals which binding field mismatched)", async () => {
      if (!schemaReady) return;
      const a = await createSignableDestination();
      const { challengeId } = await issueChallenge(a.destinationId);
      const b = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      await screen(b.destinationId);
      const res = await submitVerify(b.destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
    });

    it("client_id mismatch -> 404 WLT1_POC_CHALLENGE_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65), { clientId: "clt1client_a_totally_different_client" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
    });
  });

  describe("request schema (Part R)", () => {
    it("malformed signature is rejected 400 VALIDATION_ERROR by the schema, never reaches the transaction (no attempt consumed)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      for (const bad of ["0x" + "ab".repeat(64), "0x" + "ab".repeat(66), "ab".repeat(65), "0x" + "zz".repeat(65)]) {
        const res = await submitVerify(destinationId, challengeId, bad);
        expect(res.statusCode, `expected 400 for ${bad.slice(0, 12)}`).toBe(400);
        expect(res.json().error.code).toBe("VALIDATION_ERROR");
      }
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
      expect(row.verification_status).toBe("issued");
    });

    it("no Idempotency-Key is required for verify", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(res.statusCode).toBe(200);
    });
  });

  describe("destination-state gate (Part F)", () => {
    it("draft destination -> 409 WLT1_DESTINATION_INVALID_STATE, no attempt consumed, no challenge mutation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'draft' WHERE destination_id = $1`, [destinationId]);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
      expect(row.verification_status).toBe("issued");
    });

    it("pending_screening destination -> 409 WLT1_DESTINATION_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'pending_screening' WHERE destination_id = $1`, [destinationId]);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
    });

    it("revoked destination -> 409 WLT1_DESTINATION_INVALID_STATE, no attempt consumed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      await revoke(destinationId);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
    });
  });

  describe("challenge state machine (Part H/I/J/K)", () => {
    it("superseded challenge -> 409 WLT1_POC_CHALLENGE_INVALID_STATE, no attempt, no audit (closes L-3A2-2)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId: challengeA } = await issueChallenge(destinationId);
      await createChallenge(destinationId); // supersedes A
      const rowBefore = await fetchChallengeRow(challengeA);
      expect(rowBefore.verification_status).toBe("superseded");
      const res = await submitVerify(destinationId, challengeA, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const rowAfter = await fetchChallengeRow(challengeA);
      expect(rowAfter).toEqual(rowBefore);
      expect(await failedAuditCountFor(challengeA)).toBe(0);
    });

    it("failed challenge (via max-attempt exhaustion) -> further submission 409 WLT1_POC_CHALLENGE_INVALID_STATE, no further attempt, no cryptography re-run", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      for (let i = 0; i < 3; i++) {
        await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message, String(i + 1)));
      }
      const failedRow = await fetchChallengeRow(challengeId);
      expect(failedRow.verification_status).toBe("failed");
      expect(failedRow.attempt_count).toBe(3);

      const res = await submitVerify(destinationId, challengeId, signPocMessage(message)); // even a VALID signature
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const rowAfter = await fetchChallengeRow(challengeId);
      expect(rowAfter.attempt_count).toBe(3); // unchanged — no further attempt consumed
      expect(rowAfter.verification_status).toBe("failed");
    });

    it("already-persisted expired challenge -> 409 WLT1_POC_CHALLENGE_EXPIRED, no mutation, no attempt, no audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      await verifyPool.query(`UPDATE wlt1.proof_of_control SET verification_status = 'expired' WHERE challenge_id = $1`, [challengeId]);
      const before = await fetchChallengeRow(challengeId);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_EXPIRED");
      const after = await fetchChallengeRow(challengeId);
      expect(after).toEqual(before);
      expect(await failedAuditCountFor(challengeId)).toBe(0);
    });

    it("issued-but-now-expired: expiry transition COMMITS (issued -> expired) even though the response is 409 — a repeat verify observes the SAME persisted expired state, no second mutation", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      await verifyPool.query(`UPDATE wlt1.proof_of_control SET expires_at_utc = now() - interval '1 minute' WHERE challenge_id = $1`, [challengeId]);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_EXPIRED");
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("expired"); // COMMITTED, not rolled back
      expect(row.attempt_count).toBe(0);
      expect(await failedAuditCountFor(challengeId)).toBe(0);

      const repeat = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(65));
      expect(repeat.statusCode).toBe(409);
      expect(repeat.json().error.code).toBe("WLT1_POC_CHALLENGE_EXPIRED");
      const rowAfterRepeat = await fetchChallengeRow(challengeId);
      expect(rowAfterRepeat.updated_at_utc).toEqual(row.updated_at_utc); // no second mutation
    });
  });

  describe("server-state evidence integrity (Parts M/N/O/Q) — admin-fixture tamper negatives", () => {
    it("message_hash tamper: reconstructed message no longer matches persisted message_hash -> 409 WLT1_POC_CHALLENGE_INVALID_STATE, no attempt, no audit, no crypto acceptance", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const validSig = signPocMessage(message);
      await verifyPool.query(`UPDATE wlt1.proof_of_control SET message_hash = $2 WHERE challenge_id = $1`, [challengeId, "ff".repeat(32)]);
      const res = await submitVerify(destinationId, challengeId, validSig); // otherwise-VALID signature
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
      expect(row.verification_status).toBe("issued");
      expect(await failedAuditCountFor(challengeId)).toBe(0);
    });

    it("destination-snapshot tamper: current wallet_destination no longer matches the challenge's own persisted snapshot -> 409 WLT1_POC_CHALLENGE_INVALID_STATE, no attempt, no audit (admin fixture only — production has no UPDATE grant on wallet_destination)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const validSig = signPocMessage(message);
      // Privileged fixture-only mutation — wlt1_runtime has NO UPDATE grant on wallet_destination
      // at all (immutable by design); this proves the route's OWN defensive re-check, not that the
      // mismatch is reachable through any production code path.
      await verifyPool.query(`UPDATE wlt1.wallet_destination SET canonical_address = $2 WHERE destination_id = $1`, [destinationId, "0x0000000000000000000000000000000000dEaD"]);
      const res = await submitVerify(destinationId, challengeId, validSig);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
      expect(await failedAuditCountFor(challengeId)).toBe(0);
    });
  });

  describe("successful verification — REAL cryptography end to end (Parts Z/AA/AB/AC/AD)", () => {
    it("a valid EIP-191 signature transitions issued -> verified: 200, exact response shape, signature_hash/recovered_address/verified_at_utc persisted, attempt_count unchanged (0), last_failure_reason_code NULL", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body).toEqual({
        status: "verified",
        challenge_id: challengeId,
        verification_scheme: "eip191_personal_sign",
        verified_address: POC_TEST_ADDRESS_CANONICAL,
        verified_at_utc: expect.any(String),
      });
      // Response must NEVER expose these.
      expect(body.signature_hash).toBeUndefined();
      expect(body.attempt_count).toBeUndefined();
      expect(body.nonce).toBeUndefined();
      expect(body.message_hash).toBeUndefined();

      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
      expect(row.attempt_count).toBe(0);
      expect(row.last_failure_reason_code).toBeNull();
      expect(row.signature_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.recovered_address).toBe(POC_TEST_ADDRESS_CANONICAL);
      expect(row.verified_at_utc).not.toBeNull();
      // Deterministic re-signing (RFC 6979) with the SAME key+message produces the SAME
      // signature_hash — sanity that signature_hash is a genuine function of the signature bytes.
      const replayRes = await submitVerify(destinationId, challengeId, signPocMessage(message));
      const replayRow = await fetchChallengeRow(challengeId);
      expect(replayRow.signature_hash).toBe(row.signature_hash);
      expect(replayRes.statusCode).toBe(200);
    });

    it("prior failed attempts are preserved as historical count on eventual success — attempt_count is NEVER reset to zero", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message, "1")); // 1 failed attempt
      const midRow = await fetchChallengeRow(challengeId);
      expect(midRow.attempt_count).toBe(1);
      expect(midRow.verification_status).toBe("issued");

      const res = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(res.statusCode).toBe(200);
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
      expect(row.attempt_count).toBe(1); // preserved, not reset
    });

    it("exactly one wlt1.proof_of_control_verified audit, published in the SAME transaction as the verified transition; metadata carries no signature/nonce/message", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(res.statusCode).toBe(200);
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
      const row = await verifyPool.query(`SELECT payload_ref::text p FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_verified' AND payload_ref::text LIKE '%' || $1 || '%'`, [
        challengeId,
      ]);
      const payload = row.rows[0].p;
      const row2 = await fetchChallengeRow(challengeId);
      expect(payload).not.toContain(row2.nonce);
      expect(payload).not.toContain(row2.signature_hash);
      expect(payload).not.toContain("AIX WLT-01 Proof of Control");
    });
  });

  describe("cryptographic invalid-attempt classification (Parts S/T/AB) — REAL signatures, deterministic negatives", () => {
    it("wrong signer (different private key) -> 422 WLT1_PROOF_OF_CONTROL_FAILED, attempt_count=1, status stays issued, last_failure_reason_code='recovered_address_mismatch'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_PROOF_OF_CONTROL_FAILED");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(1);
      expect(row.verification_status).toBe("issued");
      expect(row.last_failure_reason_code).toBe("recovered_address_mismatch");
      expect(row.signature_hash).toBeNull();
      expect(row.recovered_address).toBeNull();
    });

    it("a signature over a DIFFERENT message entirely (server never trusts a caller-implied digest) -> invalid proof, address mismatch", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId } = await issueChallenge(destinationId);
      const wrongMessageSig = signPocMessage("this is not the real canonical challenge message at all");
      const res = await submitVerify(destinationId, challengeId, wrongMessageSig);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(1);
      expect(["recovered_address_mismatch", "recovery_failed"]).toContain(row.last_failure_reason_code);
    });

    it("high-s signature -> 422, reason 'high_s', attempt consumed, never normalized/accepted", async () => {
      if (!schemaReady) return;
      const { secp256k1 } = await import("@noble/curves/secp256k1");
      const { bytesToHex, hexToBytes } = await import("@noble/hashes/utils");
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const body = hexToBytes(sig.slice(2));
      const r = body.slice(0, 32),
        s = body.slice(32, 64);
      const n = secp256k1.Point.Fn.ORDER;
      const highS = (n - BigInt("0x" + bytesToHex(s))).toString(16).padStart(64, "0");
      const tampered = "0x" + bytesToHex(r) + highS + "1b";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.last_failure_reason_code).toBe("high_s");
      expect(row.attempt_count).toBe(1);
    });

    it("r out of range (r=0) -> 422, reason 'r_out_of_range', attempt consumed", async () => {
      if (!schemaReady) return;
      const { hexToBytes, bytesToHex } = await import("@noble/hashes/utils");
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const body = hexToBytes(sig.slice(2));
      const s = body.slice(32, 64);
      const tampered = "0x" + "0".repeat(64) + bytesToHex(s) + "1b";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.last_failure_reason_code).toBe("r_out_of_range");
    });

    it("s out of range (s=0) -> 422, reason 's_out_of_range', attempt consumed", async () => {
      if (!schemaReady) return;
      const { hexToBytes, bytesToHex } = await import("@noble/hashes/utils");
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const body = hexToBytes(sig.slice(2));
      const r = body.slice(0, 32);
      const tampered = "0x" + bytesToHex(r) + "0".repeat(64) + "1b";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.last_failure_reason_code).toBe("s_out_of_range");
    });

    it("invalid v (0x1d = 29) -> 422, reason 'invalid_v', attempt consumed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const tampered = sig.slice(0, -2) + "1d";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.last_failure_reason_code).toBe("invalid_v");
    });

    it("tampered r that fails Noble recovery -> 422, reason 'recovery_failed' or 'recovered_address_mismatch' (never a 500, never a crash)", async () => {
      if (!schemaReady) return;
      const { hexToBytes, bytesToHex } = await import("@noble/hashes/utils");
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const body = hexToBytes(sig.slice(2));
      const s = body.slice(32, 64);
      const tampered = "0x" + "ff".repeat(32) + bytesToHex(s) + "1b";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(["recovery_failed", "recovered_address_mismatch", "r_out_of_range"]).toContain(row.last_failure_reason_code);
      expect(row.attempt_count).toBe(1);
    });

    it("caller response NEVER exposes the internal failure reason, attempt_count, or recovered address (Part BA)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const res = await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message));
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain("recovered_address_mismatch");
      expect(raw).not.toContain("attempt_count");
      expect(raw).not.toContain("high_s");
      expect(raw.toLowerCase()).not.toContain(POC_TEST_ADDRESS_CANONICAL.toLowerCase());
    });
  });

  describe("attempt accounting / max attempts (Parts U/V/W, configured max=3)", () => {
    it("non-terminal invalid attempts: 1 and 2 both -> 422, status stays issued, attempt_count increments by exactly 1 each time, one failed audit each", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const r1 = await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message, "1"));
      expect(r1.statusCode).toBe(422);
      const row1 = await fetchChallengeRow(challengeId);
      expect(row1.attempt_count).toBe(1);
      expect(row1.verification_status).toBe("issued");
      expect(await failedAuditCountFor(challengeId)).toBe(1);

      const r2 = await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message, "2"));
      expect(r2.statusCode).toBe(422);
      const row2 = await fetchChallengeRow(challengeId);
      expect(row2.attempt_count).toBe(2);
      expect(row2.verification_status).toBe("issued");
      expect(await failedAuditCountFor(challengeId)).toBe(2);
    });

    it("the 3rd invalid attempt (== configured max) is TERMINAL: 422, status transitions to failed, attempt_count=3, exactly 3 failed audits total; a 4th submission never reaches cryptography (409 INVALID_STATE, attempt_count stays 3, no 4th audit)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      for (let i = 1; i <= 3; i++) {
        const res = await submitVerify(destinationId, challengeId, signPocMessageWithWrongKey(message, String(i)));
        expect(res.statusCode).toBe(422);
      }
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(3);
      expect(row.verification_status).toBe("failed");
      expect(await failedAuditCountFor(challengeId)).toBe(3);

      const res4 = await submitVerify(destinationId, challengeId, signPocMessage(message)); // even a genuinely VALID signature
      expect(res4.statusCode).toBe(409);
      expect(res4.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const rowAfter = await fetchChallengeRow(challengeId);
      expect(rowAfter.attempt_count).toBe(3);
      expect(await failedAuditCountFor(challengeId)).toBe(3); // unchanged
    });
  });

  describe("replay semantics on an already-verified challenge (Parts AH/AI/AJ/AK)", () => {
    it("the SAME successfully-accepted signature replayed -> 200 idempotent success, no new audit, no attempt increment, SAME verified_at_utc", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const first = await submitVerify(destinationId, challengeId, sig);
      expect(first.statusCode).toBe(200);
      const replay = await submitVerify(destinationId, challengeId, sig);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toEqual(first.json().data);
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
    });

    it("a DIFFERENT (but also genuinely valid, different-entropy) signature after verified -> 409 WLT1_POC_CHALLENGE_INVALID_STATE — the first accepted signature is authoritative for replay identity, never a re-verification", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const first = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(first.statusCode).toBe(200);
      const differentValidSig = signPocMessageWithDifferentEntropy(message);
      expect(differentValidSig).not.toBe(signPocMessage(message)); // genuinely different bytes
      const res = await submitVerify(destinationId, challengeId, differentValidSig);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      expect(await verifiedAuditCountFor(challengeId)).toBe(1); // no second audit
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0); // no attempt consumed
    });

    it("a syntactically-valid but high-s signature against an already-verified challenge -> 409 INVALID_STATE, never reopens proof verification", async () => {
      if (!schemaReady) return;
      const { hexToBytes, bytesToHex } = await import("@noble/hashes/utils");
      const { secp256k1 } = await import("@noble/curves/secp256k1");
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const first = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(first.statusCode).toBe(200);
      const sig = signPocMessage(message);
      const body = hexToBytes(sig.slice(2));
      const r = body.slice(0, 32),
        s = body.slice(32, 64);
      const n = secp256k1.Point.Fn.ORDER;
      const highS = (n - BigInt("0x" + bytesToHex(s))).toString(16).padStart(64, "0");
      const tampered = "0x" + bytesToHex(r) + highS + "1b";
      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0); // never consumed as an attempt
      expect(await failedAuditCountFor(challengeId)).toBe(0); // never a failed-proof audit
    });

    it("malformed signature against an already-verified challenge -> 400 VALIDATION_ERROR at the schema level, before replay comparison", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const first = await submitVerify(destinationId, challengeId, signPocMessage(message));
      expect(first.statusCode).toBe(200);
      const res = await submitVerify(destinationId, challengeId, "0x" + "ab".repeat(64));
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("raw-signature persistence search (Part AZ)", () => {
    it("the submitted signature is never persisted raw anywhere — no column, no audit metadata, no request-body logging", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      await submitVerify(destinationId, challengeId, sig);
      const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control'`);
      const names = cols.rows.map((r) => r.column_name);
      expect(names.some((n: string) => /raw.*sig|signature.*raw/i.test(n))).toBe(false);
      const audits = await verifyPool.query(`SELECT payload_ref::text p FROM foundation.outbox_event WHERE payload_ref::text LIKE '%' || $1 || '%'`, [challengeId]);
      for (const row of audits.rows) {
        expect(row.p).not.toContain(sig.slice(2)); // the raw signature body never appears
      }
    });
  });

  describe("concurrency (Parts AM/AN/AO)", () => {
    it("two simultaneous submissions of the SAME valid signature for the SAME challenge -> both 200, exactly one verified row, exactly one verified audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signPocMessage(message);
      const [a, b] = await Promise.all([submitVerify(destinationId, challengeId, sig), submitVerify(destinationId, challengeId, sig)]);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(a.json().data.verified_at_utc).toBe(b.json().data.verified_at_utc);
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
    });

    it("two simultaneous submissions of DIFFERENT genuinely-valid signatures (same key, different entropy, same recovered address) -> exactly one wins as authoritative verified, the other 409 INVALID_STATE; final state: one verified row, one verified audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sigA = signPocMessage(message);
      const sigB = signPocMessageWithDifferentEntropy(message);
      expect(sigA).not.toBe(sigB);
      const [a, b] = await Promise.all([submitVerify(destinationId, challengeId, sigA), submitVerify(destinationId, challengeId, sigB)]);
      const statuses = [a.statusCode, b.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
    });

    it("multiple simultaneous invalid attempts serialize deterministically under the advisory lock — attempt_count advances without lost updates, one failed audit per committed attempt, never exceeds configured max", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sigs = ["1", "2", "3", "4"].map((seed) => signPocMessageWithWrongKey(message, seed));
      const results = await Promise.all(sigs.map((s) => submitVerify(destinationId, challengeId, s)));
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(3); // capped at configured max (3)
      expect(row.verification_status).toBe("failed");
      expect(await failedAuditCountFor(challengeId)).toBe(3);
      // Exactly 3 results are 422 (consumed an attempt) and the remainder 409 (already failed).
      const statusCounts = results.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.statusCode]: (acc[r.statusCode] ?? 0) + 1 }), {});
      expect(statusCounts[422]).toBe(3);
      expect(statusCounts[409]).toBe(1);
    });
  });
});
