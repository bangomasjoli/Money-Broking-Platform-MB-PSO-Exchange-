/**
 * WLT-01 Public Client Surface — `POST /wlt1/wallet-destinations/:destination_id/proof-of-
 * control/challenges` and `.../proof-of-control/verify`. Client-safe public projections of the
 * already-accepted internal Proof-of-Control lifecycle (`routes/proof-of-control.ts`) — same
 * underlying lib functions (message building/hashing, EIP-191/TRON signature verification,
 * challenge minting), same lock namespace, same lifecycle/state-machine rules, same response
 * shapes (the internal route's own challenge/verify response bodies never included `client_id` to
 * begin with — reused verbatim here). `client_id` is ALWAYS server-derived from the public-auth
 * chain — client-binding consistency (destination.client_id === derived client_id) is enforced
 * exactly the way the internal route enforces caller-supplied client_id, collapsing a mismatch
 * into the SAME enumeration-resistant `WLT1_DESTINATION_NOT_FOUND` /
 * `WLT1_POC_CHALLENGE_NOT_FOUND`.
 *
 * NO Idempotency-Key on verify (unchanged, frozen architecture — replay semantics are entirely
 * CHALLENGE-STATE authoritative, exactly as the internal route's own header comment states; this
 * public route does not loosen or add one).
 *
 * PoC challenge issuance is a SENSITIVE READ (the response embeds the canonical wallet address in
 * the signed message / the verified address) — `logSensitiveDestinationRead` is called on every
 * disclosing branch, including idempotent replay, exactly mirroring the internal route.
 *
 * ORDER (challenge): requirePublicClientAuthority -> FND-01 rate-limit check
 * (MUTATE_POC/user=iam_user_id) -> challenge transaction -> Sensitive Read evidence -> response.
 * ORDER (verify): requirePublicClientAuthority -> FND-01 rate-limit check (MUTATE_POC/user) ->
 * verify transaction -> Sensitive Read evidence (success only) -> response.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { AppError, beginIdempotent, completeIdempotent, getPool, publishAudit, query, successEnvelope, withTransaction, type IdempotencyScope, type Sql } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../../plugins/request-context.js";
import { makePublicClientAuthorityGuard, checkPublicRateLimit, publicIdempotencyActorId } from "../../plugins/public-auth.js";
import { buildCanonicalPocMessage, computePocMessageHash, resolvePocVerificationScheme } from "../../lib/proof-of-control/message.js";
import { canonicalizeAixSignature, verifyEip191PersonalSignSignature, verifyTronPersonalSignSignature } from "../../lib/proof-of-control/crypto.js";
import { isPocSupportedWalletType, mintChallengeId, mintNonce } from "../../lib/proof-of-control/service.js";
import {
  POC_MESSAGE_FORMAT_VERSION_1,
  POC_PROOF_METHOD_SIGNED_MESSAGE,
  POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN,
  POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN,
  type PocDomainEnvironment,
  type PocSignatureRejectionReasonCode,
  type PocSignatureVerificationResult,
} from "../../lib/proof-of-control/types.js";
import { Wlt1Error } from "../../lib/errors.js";
import { logSensitiveDestinationRead } from "../../lib/sensitive-read.js";
import type { Wlt1Config } from "../../config.js";

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ChallengeCreateBody = Type.Object({}, { additionalProperties: false });

const AIX_SIGNATURE_HEX_PATTERN = "^0x[0-9a-fA-F]{130}$";
const VerifyBody = Type.Object({ challenge_id: Type.String({ minLength: 1, maxLength: 64 }), signature: Type.String({ pattern: AIX_SIGNATURE_HEX_PATTERN }) }, { additionalProperties: false });
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

type VerifyOutcome = { kind: "expired_transition" } | { kind: "invalid_attempt" } | { kind: "verified_replay_match"; row: ProofOfControlRow } | { kind: "verified"; row: ProofOfControlRow };

async function recordInvalidAttempt(client: PoolClient, challenge: ProofOfControlRow, reasonCode: PocSignatureRejectionReasonCode, maxAttempts: number, actorId: string, nowIso: string): Promise<VerifyOutcome> {
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
    actor_type: "user",
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

export async function registerPublicProofOfControlRoutes(app: FastifyInstance): Promise<void> {
  const requireAuthority = makePublicClientAuthorityGuard();

  app.post(
    "/wlt1/wallet-destinations/:destination_id/proof-of-control/challenges",
    { preHandler: requireAuthority, schema: { params: DestinationIdParams, body: ChallengeCreateBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId, iamUserId } = request.publicAuth!;
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = iamUserId;
      const domainEnvironment = config.environment as PocDomainEnvironment;
      const ttlMinutes = config.pocChallengeTtlMinutes;

      // FND-01 rate-limit check — MUTATE_POC is user-scoped (per DEC-009's exact binding table),
      // never client-scoped, so a single compromised credential cannot exhaust an institution's
      // shared quota.
      await checkPublicRateLimit(config, { bucket: "MUTATE_POC", subjectType: "user", subjectId: iamUserId });

      const idemScope: IdempotencyScope = {
        // Binds actor + derived client authority — see `publicIdempotencyActorId`'s own header
        // comment (`plugins/public-auth.ts`). Without this, the idempotent-replay branch below
        // (which resolves and returns a cached challenge BEFORE the destination's own
        // `client_id` ownership check runs) could return a challenge minted for a DIFFERENT
        // client's destination to a caller who narrowed to a different membership on a replayed
        // key. `actor_id` here is an idempotency-uniqueness key only; audit attribution below
        // always uses the plain `actorId` (iamUserId).
        actorId: publicIdempotencyActorId(actorId, clientId),
        actorType: "user",
        action: "wlt1.public.proof_of_control.challenge.create",
        key: idempotencyKey,
        request: { destination_id },
        sourceModule: "WLT-01",
      };

      let outcome: ChallengeOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destination_id}`]);

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
          // Client-binding consistency — server-derived clientId, not caller-supplied. A mismatch
          // is indistinguishable from "not found", never revealing that a destination exists
          // under a different client.
          if (!destination || destination.client_id !== clientId) {
            throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
          }

          if (destination.status !== "pending_review") {
            throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE");
          }

          const wd = await fetchWalletDestinationForChallenge(client, destination_id);
          if (!wd) {
            throw new AppError("INTERNAL_ERROR", { message: "Destination has no associated wallet_destination row." });
          }

          const scheme = resolvePocVerificationScheme(wd.chain, wd.network);
          if (!scheme.supported || !isPocSupportedWalletType(wd.wallet_type)) {
            throw new Wlt1Error("WLT1_POC_UNSUPPORTED");
          }

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
            clientId,
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
            [challengeId, destination_id, clientId, wd.chain, wd.network, wd.canonical_address, wd.address_hash, POC_PROOF_METHOD_SIGNED_MESSAGE, scheme.verificationScheme, POC_MESSAGE_FORMAT_VERSION_1, domainEnvironment, nonce, messageHash, issuedAtIso, expiresAtIso],
          );

          await publishAudit(client, {
            event_type: "wlt1.proof_of_control_challenge_issued",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "user",
            entity_type: "proof_of_control",
            entity_id: challengeId,
            metadata: { destination_id, client_id: clientId, chain: wd.chain, network: wd.network, verification_scheme: scheme.verificationScheme, expires_at_utc: expiresAtIso },
          });

          await completeIdempotent(client, idemScope, challengeId);

          return { kind: "issued", challengeId, message, verificationScheme: scheme.verificationScheme, expiresAtUtc: expiresAtIso, chain: wd.chain, network: wd.network, clientId };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      // ACCEPTANCE-SENSITIVE: every branch below discloses either the full PoC message (which
      // embeds the canonical wallet address) or `verified_address` — always logs, including
      // idempotent replay (a replay that discloses the same sensitive value again is a SECOND
      // disclosure).
      if (outcome.kind === "verified_shortcut") {
        await logSensitiveDestinationRead({ actorId, challengeId: outcome.row.challenge_id, destinationId: outcome.row.destination_id, clientId: outcome.row.client_id, chain: outcome.row.chain, network: outcome.row.network });
        return reply.code(200).send(successEnvelope(verifiedResponseBody(outcome.row), meta(request)));
      }
      if (outcome.kind === "issued") {
        await logSensitiveDestinationRead({ actorId, challengeId: outcome.challengeId, destinationId: destination_id, clientId: outcome.clientId, chain: outcome.chain, network: outcome.network });
        return reply.code(201).send(successEnvelope({ status: "issued" as const, challenge_id: outcome.challengeId, message: outcome.message, verification_scheme: outcome.verificationScheme, expires_at_utc: outcome.expiresAtUtc }, meta(request)));
      }

      const row = outcome.row;
      if (row.verification_status === "verified") {
        await logSensitiveDestinationRead({ actorId, challengeId: row.challenge_id, destinationId: row.destination_id, clientId: row.client_id, chain: row.chain, network: row.network });
        return reply.code(200).send(successEnvelope(verifiedResponseBody(row), meta(request)));
      }
      await logSensitiveDestinationRead({ actorId, challengeId: row.challenge_id, destinationId: row.destination_id, clientId: row.client_id, chain: row.chain, network: row.network });
      return reply.code(201).send(
        successEnvelope({ status: row.verification_status as "issued" | "expired" | "superseded", challenge_id: row.challenge_id, message: rebuildMessageForRow(row), verification_scheme: row.verification_scheme, expires_at_utc: row.expires_at_utc.toISOString() }, meta(request)),
      );
    },
  );

  app.post(
    "/wlt1/wallet-destinations/:destination_id/proof-of-control/verify",
    { preHandler: requireAuthority, schema: { params: DestinationIdParams, body: VerifyBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId, iamUserId } = request.publicAuth!;
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as VerifyBody;
      const actorId = iamUserId;
      const maxAttempts = config.pocMaxAttempts;

      // No Idempotency-Key here — unchanged, frozen architecture (challenge-state-authoritative
      // replay semantics; see this file's own header comment).
      await checkPublicRateLimit(config, { bucket: "MUTATE_POC", subjectType: "user", subjectId: iamUserId });

      let outcome: VerifyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destination_id}`]);

          const destRows = await query<DestinationLockRow>(client, `SELECT client_id, status FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`, [destination_id]);
          const destination = destRows[0];

          const challengeRows = await query<ProofOfControlRow>(client, `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE challenge_id = $1 FOR UPDATE`, [body.challenge_id]);
          const challenge = challengeRows[0];

          if (!destination || destination.client_id !== clientId || !challenge || challenge.destination_id !== destination_id || challenge.client_id !== clientId) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_NOT_FOUND");
          }

          if (destination.status !== "pending_review") {
            throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE");
          }

          if (challenge.verification_status === "failed" || challenge.verification_status === "superseded") {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }
          if (challenge.verification_status === "expired") {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_EXPIRED");
          }
          if (challenge.verification_status === "verified") {
            const canon = canonicalizeAixSignature(body.signature);
            if (!canon.ok || canon.signatureHash !== challenge.signature_hash) {
              throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
            }
            return { kind: "verified_replay_match", row: challenge };
          }

          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;
          const nowIso = nowUtc.toISOString();

          if (challenge.expires_at_utc <= nowUtc) {
            await query(client, `UPDATE wlt1.proof_of_control SET verification_status = 'expired', updated_at_utc = $2 WHERE challenge_id = $1`, [challenge.challenge_id, nowIso]);
            return { kind: "expired_transition" };
          }

          const isConsistentEvmChallenge = challenge.verification_scheme === POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN && challenge.chain === "ethereum" && challenge.network === "mainnet";
          const isConsistentTronChallenge = challenge.verification_scheme === POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN && challenge.chain === "tron" && challenge.network === "mainnet";
          if (challenge.message_format_version !== POC_MESSAGE_FORMAT_VERSION_1 || !(isConsistentEvmChallenge || isConsistentTronChallenge)) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

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

          const wd = await fetchWalletDestinationForChallenge(client, destination_id);
          if (!wd || wd.chain !== challenge.chain || wd.network !== challenge.network || wd.canonical_address !== challenge.canonical_address || wd.address_hash !== challenge.address_hash) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

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
            return recordInvalidAttempt(client, challenge, "recovered_address_mismatch", maxAttempts, actorId, nowIso);
          }

          const otherVerifiedRows = await query<{ n: number }>(
            client,
            `SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1 AND verification_status = 'verified' AND challenge_id <> $2`,
            [destination_id, challenge.challenge_id],
          );
          if (Number(otherVerifiedRows[0]!.n) > 0) {
            throw new Wlt1Error("WLT1_POC_CHALLENGE_INVALID_STATE");
          }

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
            actor_type: "user",
            entity_type: "proof_of_control",
            entity_id: challenge.challenge_id,
            metadata: { destination_id, client_id: challenge.client_id, chain: challenge.chain, network: challenge.network, verification_scheme: challenge.verification_scheme, verified_at_utc: nowIso },
          });

          const updatedRows = await query<ProofOfControlRow>(client, `SELECT ${PROOF_OF_CONTROL_COLUMNS} FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challenge.challenge_id]);
          return { kind: "verified", row: updatedRows[0]! };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "expired_transition") throw new Wlt1Error("WLT1_POC_CHALLENGE_EXPIRED");
      if (outcome.kind === "invalid_attempt") throw new Wlt1Error("WLT1_PROOF_OF_CONTROL_FAILED");

      // Both remaining outcomes disclose `verified_address` — both log (a replay-match is itself
      // a real second disclosure).
      await logSensitiveDestinationRead({ actorId, challengeId: outcome.row.challenge_id, destinationId: outcome.row.destination_id, clientId: outcome.row.client_id, chain: outcome.row.chain, network: outcome.row.network });
      return reply.code(200).send(successEnvelope(verifiedResponseBody(outcome.row), meta(request)));
    },
  );
}
