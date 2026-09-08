/**
 * WLT-01 Phase 3A-2/3A-3/3B — Proof-of-Control challenge lifecycle (issuance + EIP-191/TRON
 * signature verification submission) + current-proof read surface. This is the complete Phase 3
 * route surface (three routes, unchanged in count since 3A-3) — Phase 3B added TRON `tron_personal_
 * sign` support (`resolvePocVerificationScheme` now resolves `tron/mainnet` alongside `ethereum/
 * mainnet`; every other chain/network pair still fails closed at issuance) WITHOUT adding a
 * fourth route — the SAME challenge/verify routes dispatch by the persisted `verification_scheme`.
 *
 * Three routes:
 *   - `POST /internal/wlt1/wallet-destinations/:destination_id/proof-of-control/challenges` —
 *     issues a new PoC challenge (or short-circuits to the existing verified proof, or replays an
 *     idempotent duplicate). Chain-agnostic — `resolvePocVerificationScheme` is the ONLY place the
 *     EVM/TRON distinction is made at issuance time.
 *   - `POST /internal/wlt1/wallet-destinations/:destination_id/proof-of-control/verify` (Phase
 *     3A-3, TRON dispatch added Phase 3B) — submits an EIP-191 personal-sign OR TRON
 *     `signMessageV2`-compatible signature over a specific `challenge_id`, dispatched by the
 *     PERSISTED `verification_scheme` (never a fallback from one scheme to the other). NO
 *     Idempotency-Key — replay semantics are entirely CHALLENGE-STATE authoritative (an already-
 *     `verified` challenge's own persisted `signature_hash` is the idempotency key). Explicit
 *     per-state handling for every frozen state (`issued`/`verified`/`failed`/`expired`/
 *     `superseded`) — never a generic catch-all a later addition could silently fall into.
 *   - `GET /internal/wlt1/wallet-destinations/:destination_id/proof-of-control` — the current-
 *     proof read surface (Phase 4A's own future dependency), backed by `lib/proof-of-control/
 *     service.ts`'s `getCurrentProofOfControl`.
 *
 * CLIENT-BINDING CONSISTENCY, NOT END-USER AUTHORIZATION (Part H): both routes require the caller
 * to supply `client_id`, checked for equality against `destination.client_id`. This proves only
 * that the INTERNAL CALLER (already authenticated via `x-internal-service-token`) is operating in
 * the context of the client it claims — it does NOT authenticate or authorize any individual
 * end-user. A mismatch is treated identically to "destination not found"
 * (`WLT1_DESTINATION_NOT_FOUND`) — the same enumeration-resistance posture this codebase already
 * uses elsewhere, never leaking that a destination exists under a different client. End-user
 * authorization (proving THIS specific end-user is entitled to act on THIS destination) remains a
 * LOAD-BEARING UPSTREAM DEPENDENCY owned by the BFF/portal/client-session/IAM layer — WLT-01 never
 * assumes or checks a human session here.
 *
 * DESTINATION LOCK: the SAME `wlt1.destination:<destination_id>` advisory-lock namespace
 * `wallet-screening.ts`/`screening-application.ts` already use — challenge issuance therefore
 * always serializes against any concurrent screening-application mutation on the same destination
 * (no new lock namespace, no lock-ordering change).
 *
 * IDEMPOTENCY: the accepted `beginIdempotent`/`completeIdempotent` foundation seam, scoped to
 * `wlt1.proof_of_control.challenge.create`. `resultRef` is always a `challenge_id` — either a
 * freshly-minted one, or (verified short-circuit) the PRE-EXISTING verified row's own
 * `challenge_id`. Because `beginIdempotent`'s own INSERT runs inside this SAME transaction, a
 * rollback (e.g. the audit-publish failure below) undoes the idempotency reservation together with
 * everything else — a legitimate retry after a transient failure is never permanently blocked
 * (Part AD), with no extra code required beyond the existing transaction discipline.
 *
 * TIMESTAMP IDENTITY (Part D / M-3A1-1): `issued_at_utc`/`expires_at_utc` are read ONCE from
 * PostgreSQL's own `now()` inside the transaction, converted to canonical ISO strings in Node, and
 * those EXACT string values are both persisted AND rendered into the signed canonical message —
 * never two independently-generated timestamps. `message.ts`'s own hardened builder additionally
 * re-validates the exact grammar at its own boundary (defence in depth, not merely trusting this
 * route's own correctness).
 *
 * NO RAW MESSAGE PERSISTED: only `message_hash` is stored. A same-key idempotent replay of a still-
 * `issued` (or now `expired`/`superseded`) challenge REBUILDS the message deterministically from
 * the row's own persisted snapshot columns via the SAME `buildCanonicalPocMessage` — one code path,
 * never a second, divergent message-construction site.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { AppError, beginIdempotent, completeIdempotent, getPool, publishAudit, query, successEnvelope, withTransaction, type IdempotencyScope, type Sql } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { buildCanonicalPocMessage, computePocMessageHash, resolvePocVerificationScheme } from "../lib/proof-of-control/message.js";
import { canonicalizeAixSignature, verifyEip191PersonalSignSignature, verifyTronPersonalSignSignature } from "../lib/proof-of-control/crypto.js";
import { getCurrentProofOfControl, isPocSupportedWalletType, mintChallengeId, mintNonce } from "../lib/proof-of-control/service.js";
import {
  POC_MESSAGE_FORMAT_VERSION_1,
  POC_PROOF_METHOD_SIGNED_MESSAGE,
  POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN,
  POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN,
  type PocDomainEnvironment,
  type PocSignatureRejectionReasonCode,
  type PocSignatureVerificationResult,
} from "../lib/proof-of-control/types.js";
import { Wlt1Error } from "../lib/errors.js";
import { logSensitiveDestinationRead } from "../lib/sensitive-read.js";
import type { Wlt1Config } from "../config.js";

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ChallengeCreateBody = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
type ChallengeCreateBody = Static<typeof ChallengeCreateBody>;

const CurrentProofQuery = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
type CurrentProofQuery = Static<typeof CurrentProofQuery>;

/** Frozen AIX external signature grammar (Part R) — `0x` + exactly 130 hex chars. Fastify v5
 * validates the request body schema BEFORE the `preHandler` auth guard runs (documented lifecycle:
 * onRequest -> preParsing -> preValidation -> **validation** -> preHandler -> handler) — so a
 * malformed signature is rejected `400 VALIDATION_ERROR` before authentication, before the
 * transaction, before any attempt is ever consumed. */
const AIX_SIGNATURE_HEX_PATTERN = "^0x[0-9a-fA-F]{130}$";

const VerifyBody = Type.Object(
  { client_id: Type.String({ minLength: 1, maxLength: 64 }), challenge_id: Type.String({ minLength: 1, maxLength: 64 }), signature: Type.String({ pattern: AIX_SIGNATURE_HEX_PATTERN }) },
  { additionalProperties: false },
);
type VerifyBody = Static<typeof VerifyBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

interface DestinationLockRow {
  client_id: string;
  status: string;
}

interface WalletDestinationForChallengeRow {
  chain: string;
  network: string;
  canonical_address: string;
  address_hash: string;
  wallet_type: string;
}

async function fetchWalletDestinationForChallenge(sql: Sql, destinationId: string): Promise<WalletDestinationForChallengeRow | undefined> {
  const rows = await query<WalletDestinationForChallengeRow>(
    sql,
    `SELECT chain, network, canonical_address, address_hash, wallet_type FROM wlt1.wallet_destination WHERE destination_id = $1`,
    [destinationId],
  );
  return rows[0];
}

interface ProofOfControlRow {
  challenge_id: string;
  destination_id: string;
  client_id: string;
  chain: string;
  network: string;
  canonical_address: string;
  address_hash: string;
  proof_method: string;
  verification_scheme: string;
  message_format_version: number;
  domain_environment: string;
  nonce: string;
  message_hash: string;
  verification_status: string;
  attempt_count: number;
  signature_hash: string | null;
  recovered_address: string | null;
  issued_at_utc: Date;
  expires_at_utc: Date;
  verified_at_utc: Date | null;
}

const PROOF_OF_CONTROL_COLUMNS =
  "challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash, verification_status, attempt_count, signature_hash, recovered_address, issued_at_utc, expires_at_utc, verified_at_utc";

async function fetchProofOfControlByChallengeId(sql: Sql, challengeId: string): Promise<ProofOfControlRow | undefined> {
  const rows = await query<ProofOfControlRow>(sql, `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
  return rows[0];
}

function rebuildMessageForRow(row: ProofOfControlRow): string {
  return buildCanonicalPocMessage(row.message_format_version, {
    domainEnvironment: row.domain_environment as PocDomainEnvironment,
    challengeId: row.challenge_id,
    nonce: row.nonce,
    clientId: row.client_id,
    destinationId: row.destination_id,
    chain: row.chain,
    network: row.network,
    canonicalAddress: row.canonical_address,
    addressHash: row.address_hash,
    issuedAtUtc: row.issued_at_utc.toISOString(),
    expiresAtUtc: row.expires_at_utc.toISOString(),
  });
}

function verifiedResponseBody(row: Pick<ProofOfControlRow, "challenge_id" | "verification_scheme" | "recovered_address" | "verified_at_utc">) {
  return {
    status: "verified" as const,
    challenge_id: row.challenge_id,
    verification_scheme: row.verification_scheme,
    verified_address: row.recovered_address,
    verified_at_utc: (row.verified_at_utc as Date).toISOString(),
  };
}

type ChallengeOutcome =
  | { kind: "issued"; challengeId: string; message: string; verificationScheme: string; expiresAtUtc: string; chain: string; network: string; clientId: string }
  | { kind: "verified_shortcut"; row: ProofOfControlRow }
  | { kind: "duplicate"; row: ProofOfControlRow };

/**
 * Phase 3A-3 — verify-route outcomes. `expired_transition` and `invalid_attempt` both represent a
 * transaction that MUST COMMIT (the expiry transition, or the attempt-count/audit write) despite
 * mapping to a non-2xx HTTP response — mirrors `ChallengeOutcome`'s own established "return a
 * discriminated result, throw the caller-facing error AFTER commit" idiom (Part L: "do NOT throw
 * inside the transaction in a way that rolls back the expired transition"). Every OTHER rejection
 * (not-found/binding, destination state, failed/superseded, evidence-integrity failure, a
 * non-matching verified-replay) mutates NOTHING, so those throw `Wlt1Error` directly inside the
 * transaction — an ordinary rollback is already the correct outcome for a genuine no-op.
 */
type VerifyOutcome = { kind: "expired_transition" } | { kind: "invalid_attempt" } | { kind: "verified_replay_match"; row: ProofOfControlRow } | { kind: "verified"; row: ProofOfControlRow };

/** Attempt-accounting + failed-proof audit, atomic with the caller's own transaction (Part Y) — one
 * UPDATE (only `attempt_count`/`last_failure_reason_code`/`verification_status`/`updated_at_utc`,
 * exactly the mutable-column grant scope) plus exactly one `wlt1.proof_of_control_failed` audit per
 * cryptographically-evaluated invalid attempt, whether non-terminal (`issued` retained) or terminal
 * (`failed`, once `newAttemptCount >= maxAttempts`). Never called for a malformed-signature (schema
 * already rejected it), workflow-state, or evidence-integrity rejection — none of those consumes an
 * attempt. */
async function recordInvalidAttempt(
  client: PoolClient,
  challenge: ProofOfControlRow,
  reasonCode: PocSignatureRejectionReasonCode,
  maxAttempts: number,
  actorId: string,
  nowIso: string,
): Promise<VerifyOutcome> {
  const newAttemptCount = challenge.attempt_count + 1;
  const terminal = newAttemptCount >= maxAttempts;
  await query(
    client,
    `UPDATE wlt1.proof_of_control SET attempt_count = $2, last_failure_reason_code = $3, verification_status = $4, updated_at_utc = $5 WHERE challenge_id = $1`,
    [challenge.challenge_id, newAttemptCount, reasonCode, terminal ? "failed" : "issued", nowIso],
  );
  await publishAudit(client, {
    event_type: "wlt1.proof_of_control_failed",
    source_module: "WLT-01",
    actor_id: actorId,
    actor_type: "service",
    entity_type: "proof_of_control",
    entity_id: challenge.challenge_id,
    metadata: {
      destination_id: challenge.destination_id,
      client_id: challenge.client_id,
      chain: challenge.chain,
      network: challenge.network,
      verification_scheme: challenge.verification_scheme,
      attempt_number: newAttemptCount,
      failure_reason_code: reasonCode,
      resulting_verification_status: terminal ? "failed" : "issued",
    },
  });
  return { kind: "invalid_attempt" };
}

export async function registerProofOfControlRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard(app.config.wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/wallet-destinations/:destination_id/proof-of-control/challenges",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: ChallengeCreateBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as ChallengeCreateBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";
      const domainEnvironment = (app.config as Wlt1Config).environment as PocDomainEnvironment;
      const ttlMinutes = (app.config as Wlt1Config).pocChallengeTtlMinutes;

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "wlt1.proof_of_control.challenge.create",
        key: idempotencyKey,
        request: { destination_id, client_id: body.client_id },
        sourceModule: "WLT-01",
      };

      let outcome: ChallengeOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Destination advisory lock — SAME namespace screening/receipt already use.
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destination_id}`]);

          // Idempotency BEFORE the lifecycle branch — a same-key replay must rehydrate current
          // truth regardless of what has happened to the row since (mirrors wallet-screening.ts's
          // own established ordering).
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "duplicate") {
            const challengeId = idem.resultRef;
            if (!challengeId) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent PoC challenge replay has no result reference." });
            }
            const row = await fetchProofOfControlByChallengeId(client, challengeId);
            if (!row || row.destination_id !== destination_id) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent PoC challenge replay target could not be resolved for this destination." });
            }
            return { kind: "duplicate", row };
          }

          const destRows = await query<DestinationLockRow>(client, `SELECT client_id, status FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`, [destination_id]);
          const destination = destRows[0];
          // Client-binding consistency (Part H) — a mismatch is indistinguishable from "not found",
          // never revealing that a destination exists under a different client.
          if (!destination || destination.client_id !== body.client_id) {
            throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
          }

          // Destination precondition (Part F) — pending_review is the sole authoritative proof
          // that current terminal screening completed; no separate wallet_screening_result re-read.
          if (destination.status !== "pending_review") {
            throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE");
          }

          const wd = await fetchWalletDestinationForChallenge(client, destination_id);
          if (!wd) {
            throw new AppError("INTERNAL_ERROR", { message: "Destination has no associated wallet_destination row." });
          }

          // Supported-scheme / wallet-type gate (Part G) — checked BEFORE any nonce is minted or
          // row inserted; no challenge-issued audit for an unsupported destination.
          const scheme = resolvePocVerificationScheme(wd.chain, wd.network);
          if (!scheme.supported || !isPocSupportedWalletType(wd.wallet_type)) {
            throw new Wlt1Error("WLT1_POC_UNSUPPORTED");
          }

          // Verified-proof short-circuit (Part M, architecture Model A) — no nonce, no insert, no
          // supersession, no audit. Returns the CURRENT verified proof deterministically.
          const verifiedRows = await query<ProofOfControlRow>(
            client,
            `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE destination_id = $1 AND verification_status = 'verified' FOR UPDATE`,
            [destination_id],
          );
          if (verifiedRows.length > 0) {
            const verified = verifiedRows[0]!;
            await completeIdempotent(client, idemScope, verified.challenge_id);
            return { kind: "verified_shortcut", row: verified };
          }

          // Expire/supersede any existing OPEN challenge (Part N) — the partial unique
          // `idx_wlt1_proof_of_control_one_issued` index remains the DB-level backstop; this is the
          // application-level enforcement inside the SAME advisory lock.
          const issuedRows = await query<{ challenge_id: string; expires_at_utc: Date }>(
            client,
            `SELECT challenge_id, expires_at_utc FROM wlt1.proof_of_control WHERE destination_id = $1 AND verification_status = 'issued' FOR UPDATE`,
            [destination_id],
          );
          if (issuedRows.length > 0) {
            const prior = issuedRows[0]!;
            const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
            const nowUtc = nowRows[0]!.now_utc;
            const newStatus = prior.expires_at_utc <= nowUtc ? "expired" : "superseded";
            await query(client, `UPDATE wlt1.proof_of_control SET verification_status = $2, updated_at_utc = now() WHERE challenge_id = $1`, [prior.challenge_id, newStatus]);
          }

          // Mint the new challenge. ONE authoritative `now()` read; the exact resulting ISO strings
          // are both persisted AND rendered into the signed message — never two independent clocks.
          const nowRows2 = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const issuedAtUtc = nowRows2[0]!.now_utc;
          const issuedAtIso = issuedAtUtc.toISOString();
          const expiresAtIso = new Date(issuedAtUtc.getTime() + ttlMinutes * 60_000).toISOString();
          const challengeId = mintChallengeId();
          const nonce = mintNonce();

          const message = buildCanonicalPocMessage(POC_MESSAGE_FORMAT_VERSION_1, {
            domainEnvironment,
            challengeId,
            nonce,
            clientId: body.client_id,
            destinationId: destination_id,
            chain: wd.chain,
            network: wd.network,
            canonicalAddress: wd.canonical_address,
            addressHash: wd.address_hash,
            issuedAtUtc: issuedAtIso,
            expiresAtUtc: expiresAtIso,
          });
          const messageHash = computePocMessageHash(message);

          await query(
            client,
            `INSERT INTO wlt1.proof_of_control
               (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash,
                proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash,
                verification_status, attempt_count, issued_at_utc, expires_at_utc)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'issued',0,$14,$15)`,
            [
              challengeId,
              destination_id,
              body.client_id,
              wd.chain,
              wd.network,
              wd.canonical_address,
              wd.address_hash,
              POC_PROOF_METHOD_SIGNED_MESSAGE,
              scheme.verificationScheme,
              POC_MESSAGE_FORMAT_VERSION_1,
              domainEnvironment,
              nonce,
              messageHash,
              issuedAtIso,
              expiresAtIso,
            ],
          );

          await publishAudit(client, {
            event_type: "wlt1.proof_of_control_challenge_issued",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "proof_of_control",
            entity_id: challengeId,
            metadata: {
              destination_id,
              client_id: body.client_id,
              chain: wd.chain,
              network: wd.network,
              verification_scheme: scheme.verificationScheme,
              expires_at_utc: expiresAtIso,
            },
          });

          await completeIdempotent(client, idemScope, challengeId);

          return { kind: "issued", challengeId, message, verificationScheme: scheme.verificationScheme, expiresAtUtc: expiresAtIso, chain: wd.chain, network: wd.network, clientId: body.client_id };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        // Anything else reaching here inside an otherwise fully-validated transaction is an
        // unexpected failure — the realistic cause is the audit/outbox write above (mirrors every
        // other WLT-01 mutating route's identical catch-order precedent).
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      // ACCEPTANCE-SENSITIVE (FR-018): every branch below discloses either the full PoC message
      // (which embeds the canonical wallet address) or `verified_address` — this route ALWAYS
      // discloses on success. Sensitive-read evidence MUST commit before the response is sent
      // (response ordering §22 of the controlling addendum) — never after.
      if (outcome.kind === "verified_shortcut") {
        await logSensitiveDestinationRead({
          actorId,
          challengeId: outcome.row.challenge_id,
          destinationId: outcome.row.destination_id,
          clientId: outcome.row.client_id,
          chain: outcome.row.chain,
          network: outcome.row.network,
        });
        return reply.code(200).send(successEnvelope(verifiedResponseBody(outcome.row), meta(request)));
      }

      if (outcome.kind === "issued") {
        await logSensitiveDestinationRead({
          actorId,
          challengeId: outcome.challengeId,
          destinationId: destination_id,
          clientId: outcome.clientId,
          chain: outcome.chain,
          network: outcome.network,
        });
        return reply.code(201).send(
          successEnvelope(
            {
              status: "issued" as const,
              challenge_id: outcome.challengeId,
              message: outcome.message,
              verification_scheme: outcome.verificationScheme,
              expires_at_utc: outcome.expiresAtUtc,
            },
            meta(request),
          ),
        );
      }

      // duplicate (idempotent replay) — truthful current row state. LOAD-BEARING: idempotency of
      // the underlying challenge-create action must never suppress sensitive-read evidence — a
      // replay that discloses the SAME sensitive value again is a SECOND disclosure and therefore
      // logs a SECOND `wlt1.sensitive_destination_read` record (addendum Issue 32/33/34).
      const row = outcome.row;
      if (row.verification_status === "verified") {
        await logSensitiveDestinationRead({
          actorId,
          challengeId: row.challenge_id,
          destinationId: row.destination_id,
          clientId: row.client_id,
          chain: row.chain,
          network: row.network,
        });
        return reply.code(200).send(successEnvelope(verifiedResponseBody(row), meta(request)));
      }
      await logSensitiveDestinationRead({
        actorId,
        challengeId: row.challenge_id,
        destinationId: row.destination_id,
        clientId: row.client_id,
        chain: row.chain,
        network: row.network,
      });
      return reply.code(201).send(
        successEnvelope(
          {
            status: row.verification_status as "issued" | "expired" | "superseded",
            challenge_id: row.challenge_id,
            message: rebuildMessageForRow(row),
            verification_scheme: row.verification_scheme,
            expires_at_utc: row.expires_at_utc.toISOString(),
          },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/internal/wlt1/wallet-destinations/:destination_id/proof-of-control/verify",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: VerifyBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as VerifyBody;
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";
      const maxAttempts = (app.config as Wlt1Config).pocMaxAttempts;

      let outcome: VerifyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Destination advisory lock — SAME namespace screening/screening-application/challenge
          // issuance already use (Part E) — no new lock namespace, no ordering change.
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destination_id}`]);

          const destRows = await query<DestinationLockRow>(client, `SELECT client_id, status FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`, [destination_id]);
          const destination = destRows[0];

          const challengeRows = await query<ProofOfControlRow>(client, `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE challenge_id = $1 FOR UPDATE`, [
            body.challenge_id,
          ]);
          const challenge = challengeRows[0];

          // Binding (Part D) — collapsed into ONE enumeration-resistant not-found signal: unknown
          // destination, client mismatch, unknown challenge_id, or a challenge bound to a
          // DIFFERENT destination/client are all indistinguishable to the caller. No mutation.
          if (!destination || destination.client_id !== body.client_id || !challenge || challenge.destination_id !== destination_id || challenge.client_id !== body.client_id) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_NOT_FOUND");
          }

          // Destination state gate (Part F) — a workflow-state failure, never a cryptographic one:
          // no attempt consumed, no challenge mutation, no failed-proof audit.
          if (destination.status !== "pending_review") {
            throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE");
          }

          // Explicit per-state handling (Part H) — every frozen state named, no generic catch-all
          // a later addition could silently fall into.
          if (challenge.verification_status === "failed" || challenge.verification_status === "superseded") {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }
          if (challenge.verification_status === "expired") {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_EXPIRED");
          }
          if (challenge.verification_status === "verified") {
            // Replay identity (Parts AH/AI/AJ/AK) — canonicalize the SUBMITTED signature WITHOUT
            // ever re-running Noble recovery on an already-decided challenge. A signature that
            // fails to canonicalize (e.g. high-s) cannot be proven identical to the accepted one,
            // so it is treated the same as a genuinely different signature — never reopened.
            const canon = canonicalizeAixSignature(body.signature);
            if (!canon.ok || canon.signatureHash !== challenge.signature_hash) {
              throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
            }
            return { kind: "verified_replay_match", row: challenge };
          }

          // challenge.verification_status === "issued" from here on — the ONLY state a genuine
          // verification attempt can be evaluated against.
          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;
          const nowIso = nowUtc.toISOString();

          // Issued-but-now-expired (Part L) — the ONE case that must COMMIT a mutation despite
          // representing a caller-facing error: returned as a discriminated outcome, never thrown,
          // so the expiry transition is never rolled back.
          if (challenge.expires_at_utc <= nowUtc) {
            await query(client, `UPDATE wlt1.proof_of_control SET verification_status = 'expired', updated_at_utc = $2 WHERE challenge_id = $1`, [challenge.challenge_id, nowIso]);
            return { kind: "expired_transition" };
          }

          // Server-state evidence integrity (Parts M/N/O/P/Q) — checked BEFORE any cryptographic
          // attempt is evaluated or consumed. Every branch here is structurally unreachable under
          // accepted runtime behaviour (migration 053/054's own CHECK constraints already bound
          // version/scheme; wallet_destination is immutable with no UPDATE grant) — defensive
          // fail-closed, never a silent "repair" of persisted evidence.
          //
          // Phase 3B scheme/chain/network consistency (Part K) — EXACTLY the two frozen pairs are
          // consistent; any other combination (including a scheme persisted against a mismatched
          // chain/network, which should be structurally unreachable under migration 054's own
          // CHECK) fails closed. No fallback from one scheme to the other.
          const isConsistentEvmChallenge = challenge.verification_scheme === POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN && challenge.chain === "ethereum" && challenge.network === "mainnet";
          const isConsistentTronChallenge = challenge.verification_scheme === POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN && challenge.chain === "tron" && challenge.network === "mainnet";
          if (challenge.message_format_version !== POC_MESSAGE_FORMAT_VERSION_1 || !(isConsistentEvmChallenge || isConsistentTronChallenge)) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

          // Message reconstruction (Part M/N) — the SAME builder 3A-1/3A-2 use, from the persisted
          // snapshot, with the EXACT persisted timestamps' `.toISOString()` — never a re-derived
          // value. Message-hash revalidation (Part O) — server-state evidence integrity, never
          // silently overwritten on mismatch.
          const message = buildCanonicalPocMessage(challenge.message_format_version, {
            domainEnvironment: challenge.domain_environment as PocDomainEnvironment,
            challengeId: challenge.challenge_id,
            nonce: challenge.nonce,
            clientId: challenge.client_id,
            destinationId: challenge.destination_id,
            chain: challenge.chain,
            network: challenge.network,
            canonicalAddress: challenge.canonical_address,
            addressHash: challenge.address_hash,
            issuedAtUtc: challenge.issued_at_utc.toISOString(),
            expiresAtUtc: challenge.expires_at_utc.toISOString(),
          });
          if (computePocMessageHash(message) !== challenge.message_hash) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

          // Destination-snapshot revalidation (Part Q) — wallet_destination is immutable with no
          // UPDATE grant, so a mismatch here is structurally unreachable; checked anyway, fail
          // closed, never "repaired".
          const wd = await fetchWalletDestinationForChallenge(client, destination_id);
          if (!wd || wd.chain !== challenge.chain || wd.network !== challenge.network || wd.canonical_address !== challenge.canonical_address || wd.address_hash !== challenge.address_hash) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

          // Cryptographic evaluation (Parts Z/AA/AB) — the ONE point a genuinely NEW attempt can be
          // classified invalid (consumes an attempt) or valid. Dispatch by the PERSISTED scheme
          // (already proven consistent with chain/network above, Part K) — never a fallback from
          // one scheme to the other; an inconsistent/unrecognised scheme cannot reach this line
          // (the evidence-integrity gate above already threw).
          let verifyResult: PocSignatureVerificationResult;
          if (challenge.verification_scheme === POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN) {
            verifyResult = verifyEip191PersonalSignSignature(message, body.signature);
          } else if (challenge.verification_scheme === POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN) {
            verifyResult = verifyTronPersonalSignSignature(message, body.signature);
          } else {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }
          if (!verifyResult.ok) {
            return recordInvalidAttempt(client, challenge, verifyResult.reasonCode, maxAttempts, actorId, nowIso);
          }
          if (verifyResult.recoveredAddress !== challenge.canonical_address) {
            // A recovered address that does not match is an invalid proof, not a crypto exception —
            // Part AB: never leak the expected or recovered address in the response.
            return recordInvalidAttempt(client, challenge, "recovered_address_mismatch", maxAttempts, actorId, nowIso);
          }

          // Model A defensive safety net (Part AL) — structurally unreachable (the partial unique
          // `idx_wlt1_proof_of_control_one_verified` index already guarantees this), but a raw
          // 23505 must never reach the caller; checked explicitly before promoting to verified.
          const otherVerifiedRows = await query<{ n: number }>(
            client,
            `SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1 AND verification_status = 'verified' AND challenge_id <> $2`,
            [destination_id, challenge.challenge_id],
          );
          if (Number(otherVerifiedRows[0]!.n) > 0) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

          // Success transition (Part AC/AD) — attempt_count UNCHANGED (historical failed-attempt
          // count is preserved, never reset).
          await query(
            client,
            `UPDATE wlt1.proof_of_control
                SET verification_status = 'verified', signature_hash = $2, recovered_address = $3, verified_at_utc = $4, last_failure_reason_code = NULL, updated_at_utc = $4
              WHERE challenge_id = $1`,
            [challenge.challenge_id, verifyResult.signatureHash, verifyResult.recoveredAddress, nowIso],
          );

          await publishAudit(client, {
            event_type: "wlt1.proof_of_control_verified",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "proof_of_control",
            entity_id: challenge.challenge_id,
            metadata: {
              destination_id,
              client_id: challenge.client_id,
              chain: challenge.chain,
              network: challenge.network,
              verification_scheme: challenge.verification_scheme,
              verified_at_utc: nowIso,
            },
          });

          const updatedRows = await query<ProofOfControlRow>(client, `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challenge.challenge_id]);
          return { kind: "verified", row: updatedRows[0]! };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        // Anything else reaching here inside an otherwise fully-validated transaction is an
        // unexpected failure — the realistic cause is an audit/outbox write above (mirrors every
        // other WLT-01 mutating route's identical catch-order precedent). Rolls back attempt
        // accounting/the verified transition together with the failed audit — never a partial
        // commit (Part Y/AF).
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "expired_transition") throw new Wlt1Error("WLT1_POC_CHALLENGE_EXPIRED");
      if (outcome.kind === "invalid_attempt") throw new Wlt1Error("WLT1_PROOF_OF_CONTROL_FAILED");

      // ACCEPTANCE-SENSITIVE (FR-018): both remaining outcomes ("verified" — a genuinely fresh
      // transition, and "verified_replay_match" — a resubmission of the SAME already-accepted
      // signature) disclose `verified_address` and therefore both log — a replay-match is itself
      // a real second disclosure of the same sensitive value (addendum Issue 32/33/34).
      await logSensitiveDestinationRead({
        actorId,
        challengeId: outcome.row.challenge_id,
        destinationId: outcome.row.destination_id,
        clientId: outcome.row.client_id,
        chain: outcome.row.chain,
        network: outcome.row.network,
      });
      return reply.code(200).send(successEnvelope(verifiedResponseBody(outcome.row), meta(request)));
    },
  );

  app.get(
    "/internal/wlt1/wallet-destinations/:destination_id/proof-of-control",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, querystring: CurrentProofQuery } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const { client_id } = request.query as CurrentProofQuery;
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";

      const destRows = await query<DestinationLockRow>(getPool(), `SELECT client_id, status FROM wlt1.destination WHERE destination_id = $1`, [destination_id]);
      const destination = destRows[0];
      if (!destination || destination.client_id !== client_id) {
        throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
      }

      const current = await getCurrentProofOfControl(getPool(), destination_id);
      if (current.status === "none") {
        // Nothing disclosed — no sensitive-read evidence (addendum Issue 21).
        return reply.send(successEnvelope({ status: "none" as const }, meta(request)));
      }

      // ACCEPTANCE-SENSITIVE (FR-018): discloses `verified_address`. Sequential/concurrent reads
      // each produce their own independent record — never deduplicated (addendum Issue 32/37/38).
      await logSensitiveDestinationRead({
        actorId,
        challengeId: current.challengeId,
        destinationId: destination_id,
        clientId: client_id,
        chain: current.chain,
        network: current.network,
      });
      return reply.send(
        successEnvelope(
          {
            status: "verified" as const,
            challenge_id: current.challengeId,
            verification_scheme: current.verificationScheme,
            chain: current.chain,
            network: current.network,
            verified_address: current.verifiedAddress,
            verified_at_utc: current.verifiedAtUtc,
          },
          meta(request),
        ),
      );
    },
  );
}
