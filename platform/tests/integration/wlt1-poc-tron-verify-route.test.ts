/**
 * WLT-01 Phase 3B — TRON `signMessageV2`-compatible signature verification submission
 * (`POST .../proof-of-control/verify`), driven against the SHARED canonical database (mirrors
 * `wlt1-poc-verify-route.test.ts`'s own established pattern exactly: own dedicated runtime role,
 * own client_id fixture scope, H-D3C-1 fail-loud canary as the first test). Self-skips unless
 * `TEST_DATABASE_URL` is set.
 *
 * SCOPE (per Phase 3B task instructions): this file does NOT duplicate the complete EVM state-
 * machine/attempt-accounting/replay/concurrency matrix already committed in
 * `wlt1-poc-verify-route.test.ts` — the underlying route code is the SAME shared state machine
 * (Part L), only the digest/address-derivation strategy differs by dispatch. This file focuses on:
 * TRON-specific dispatch (does a TRON challenge actually verify via the TRON path, never silently
 * falling back to EVM), domain separation (an EVM-shaped signature never validates against a TRON
 * challenge and vice versa), and a representative shared-state regression slice (attempt
 * accounting, max attempts, replay, supersession/expiry, audit atomicity, concurrency) — enough to
 * prove the SAME shared machinery is genuinely exercised for TRON, not a full re-derivation of
 * every EVM-side edge case.
 *
 * REAL CRYPTOGRAPHY THROUGHOUT: every "valid proof" scenario here signs the REAL persisted
 * canonical message with the Phase 3B golden TRON test private key (`tests/helpers/
 * poc-tron-test-signing.ts`) via this repository's OWN accepted crypto primitives — independently
 * proven byte-compatible with the REAL external TronWeb reference implementation in
 * `tests/unit/wlt1-poc-tron-crypto.test.ts`'s own committed static vector (Part O).
 *
 * M-REV-1 INTERIM RULE: this file derives its restricted-role connection URL via the SAFE regex
 * rewrite (`replace(/^postgres:\/\/[^@]+@/, ...)`), not the fragile `.replace("postgres@", ...)`
 * form, and its own canary additionally asserts the runtime connection is not superuser.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, stubProvider } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { POC_TRON_TEST_ADDRESS, signTronPocMessage, signTronPocMessageWithDifferentEntropy, signTronPocMessageWithWrongKey } from "../helpers/poc-tron-test-signing.js";
import { signPocMessage } from "../helpers/poc-test-signing.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_poc_tron_verify_route_test";
const OWNED_CLIENT_ID = "clt1client_pocverifytron";

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance;
let mainConfig: Wlt1Config;

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

/** The golden TRON key's own derived address has no stub fixture entry — delegates every OTHER
 * input to the real `stubProvider` untouched (same technique as `wlt1-proof-of-control-route
 * .test.ts`'s own Phase 3B addition). */
const delegatingProviderWithTronGoldenClear: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(input: WalletScreeningInput) {
    if (input.chain === "tron" && input.canonicalAddress === POC_TRON_TEST_ADDRESS) {
      return {
        kind: "screened" as const,
        result: {
          providerResultId: "presult_pocverifytron_" + randomUUID(),
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
    }
    return stubProvider.screen(input);
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
    wlt1InternalServiceToken: "test-wlt1-internal-token-pocverifytron-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 3,
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: delegatingProviderWithTronGoldenClear,
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

async function createSignableTronDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination({ chain: "tron", network: "mainnet", address: POC_TRON_TEST_ADDRESS });
  const res = await screen(destinationId);
  if (res.statusCode !== 200) throw new Error(`expected terminal screening, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  return { destinationId };
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

function submitVerify(destinationId: string, challengeId: string, signature: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, challenge_id: challengeId, signature },
  });
}

async function fetchChallengeRow(challengeId: string) {
  const r = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
  return r.rows[0];
}

async function verifiedAuditCountFor(challengeId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_verified' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    challengeId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

async function failedAuditCountFor(challengeId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_failed' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    challengeId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Phase 3B: POST .../proof-of-control/verify — TRON dispatch", () => {
  it("H-D3C-1 fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently", async () => {
    if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("M-REV-1: the app's own runtime connection genuinely authenticates as the restricted role, never postgres superuser (fail-loud, not a silent skip)", async () => {
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
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
    } finally {
      await probe.end();
    }
  });

  describe("TRON dispatch — real cryptography end to end", () => {
    it("a valid TRON signMessageV2-compatible signature transitions issued -> verified: 200, verification_scheme tron_personal_sign, recovered_address is the canonical TRON address, attempt_count unchanged (0)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signTronPocMessage(message);

      const res = await submitVerify(destinationId, challengeId, sig);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("verified");
      expect(res.json().data.verification_scheme).toBe("tron_personal_sign");
      expect(res.json().data.verified_address).toBe(POC_TRON_TEST_ADDRESS);

      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
      expect(row.recovered_address).toBe(POC_TRON_TEST_ADDRESS);
      expect(row.attempt_count).toBe(0);
      expect(row.signature_hash).not.toBeNull();
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
    });

    it("wrong signer (different private key) -> 422 WLT1_PROOF_OF_CONTROL_FAILED, attempt_count=1, status stays issued, recovered address never leaked in the response", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const wrongSig = signTronPocMessageWithWrongKey(message);

      const res = await submitVerify(destinationId, challengeId, wrongSig);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_PROOF_OF_CONTROL_FAILED");
      expect(JSON.stringify(res.json())).not.toContain(POC_TRON_TEST_ADDRESS);

      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("issued");
      expect(row.attempt_count).toBe(1);
      expect(row.signature_hash).toBeNull();
      expect(await failedAuditCountFor(challengeId)).toBe(1);
    });

    it("high-s signature -> 422, attempt consumed, never normalized/accepted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signTronPocMessage(message);
      // Flip to high-s: s' = n - s (curve order minus s) — still 32 bytes, now > n/2.
      const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const sHex = sig.slice(66, 130);
      const highS = (CURVE_ORDER - BigInt("0x" + sHex)).toString(16).padStart(64, "0");
      const tampered = sig.slice(0, 66) + highS + sig.slice(130);

      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(1);
      expect(row.verification_status).toBe("issued");
    });

    it("invalid v (0x1d = 29) -> 422, attempt consumed", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signTronPocMessage(message);
      const tampered = sig.slice(0, -2) + "1d";

      const res = await submitVerify(destinationId, challengeId, tampered);
      expect(res.statusCode).toBe(422);
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(1);
    });
  });

  describe("attempt accounting / max attempts (configured max=3)", () => {
    it("the 3rd invalid attempt is TERMINAL: status transitions to failed, attempt_count=3; a 4th submission never reaches cryptography (409 INVALID_STATE, attempt_count stays 3)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const wrongSig = signTronPocMessageWithWrongKey(message);

      await submitVerify(destinationId, challengeId, wrongSig);
      await submitVerify(destinationId, challengeId, wrongSig);
      const third = await submitVerify(destinationId, challengeId, wrongSig);
      expect(third.statusCode).toBe(422);
      let row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("failed");
      expect(row.attempt_count).toBe(3);

      const fourth = await submitVerify(destinationId, challengeId, signTronPocMessage(message));
      expect(fourth.statusCode).toBe(409);
      expect(fourth.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(3);
    });
  });

  describe("replay semantics on an already-verified TRON challenge", () => {
    it("the SAME successfully-accepted signature replayed -> 200 idempotent success, no new audit, no attempt increment, SAME verified_at_utc", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signTronPocMessage(message);
      const first = await submitVerify(destinationId, challengeId, sig);
      expect(first.statusCode).toBe(200);
      const rowAfterFirst = await fetchChallengeRow(challengeId);

      const replay = await submitVerify(destinationId, challengeId, sig);
      expect(replay.statusCode).toBe(200);
      const rowAfterReplay = await fetchChallengeRow(challengeId);
      expect(rowAfterReplay.verified_at_utc.toISOString()).toBe(rowAfterFirst.verified_at_utc.toISOString());
      expect(rowAfterReplay.attempt_count).toBe(rowAfterFirst.attempt_count);
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
    });

    it("a DIFFERENT (but also genuinely valid, different-entropy) signature after verified -> 409 WLT1_POC_CHALLENGE_INVALID_STATE — the first accepted signature is authoritative, never reopened", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const first = await submitVerify(destinationId, challengeId, signTronPocMessage(message));
      expect(first.statusCode).toBe(200);

      const differentValid = signTronPocMessageWithDifferentEntropy(message);
      const res = await submitVerify(destinationId, challengeId, differentValid);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
    });
  });

  describe("supersession / expiry (shared state machine — TRON exercises the SAME code path)", () => {
    it("superseded TRON challenge -> 409 WLT1_POC_CHALLENGE_INVALID_STATE, no attempt, no audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const a = await issueChallenge(destinationId);
      const b = await issueChallenge(destinationId); // supersedes `a`
      const res = await submitVerify(destinationId, a.challengeId, signTronPocMessage(a.message));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_INVALID_STATE");
      const rowA = await fetchChallengeRow(a.challengeId);
      expect(rowA.attempt_count).toBe(0);
      expect(await failedAuditCountFor(a.challengeId)).toBe(0);
      void b;
    });

    it("already-persisted expired TRON challenge -> 409 WLT1_POC_CHALLENGE_EXPIRED, no attempt, no audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      await verifyPool.query(`UPDATE wlt1.proof_of_control SET verification_status = 'expired' WHERE challenge_id = $1`, [challengeId]);
      const res = await submitVerify(destinationId, challengeId, signTronPocMessage(message));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_EXPIRED");
      const row = await fetchChallengeRow(challengeId);
      expect(row.attempt_count).toBe(0);
    });
  });

  describe("domain separation (Part Q) — cross-scheme signatures never validate", () => {
    it("a real EVM (EIP-191) golden-key signature over the TRON canonical message is rejected as an invalid TRON proof (422), never accepted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      // signPocMessage uses the EIP-191 EVM digest internally — signing the SAME message text with
      // it produces a signature that is well-formed AIX hex but was never computed over the TRON
      // V2 digest this challenge's verifier expects.
      const evmStyleSig = signPocMessage(message);
      const res = await submitVerify(destinationId, challengeId, evmStyleSig);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_PROOF_OF_CONTROL_FAILED");
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("issued");
      expect(row.attempt_count).toBe(1);
    });
  });

  // NOTE (audit atomicity): forcing an outbox INSERT failure requires REVOKEing the SHARED
  // `role_wlt1_runtime`'s grant, which this file's own shared-canonical-database fixtures cannot
  // safely do (it would break every OTHER concurrently-running test file's use of that same
  // role — exactly why `wlt1-poc-audit-atomicity-private.test.ts` uses its own PRIVATE disposable
  // database instead). Audit-atomicity/rollback mechanics are entirely SCHEME-AGNOSTIC shared code
  // (the SAME `recordInvalidAttempt`/success-transition/`publishAudit` call sites TRON now also
  // dispatches through) — already committed and independently accepted for the verified-audit AND
  // failed-audit cases in `wlt1-poc-audit-atomicity-private.test.ts`. Re-proving it here would only
  // duplicate shared-code coverage the Phase 3B task explicitly asks this file NOT to duplicate.

  describe("concurrency", () => {
    it("two simultaneous submissions of the SAME valid TRON signature -> both 200, exactly one verified row, exactly one verified audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableTronDestination();
      const { challengeId, message } = await issueChallenge(destinationId);
      const sig = signTronPocMessage(message);

      const [a, b] = await Promise.all([submitVerify(destinationId, challengeId, sig), submitVerify(destinationId, challengeId, sig)]);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(await verifiedAuditCountFor(challengeId)).toBe(1);
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
    });
  });
});
