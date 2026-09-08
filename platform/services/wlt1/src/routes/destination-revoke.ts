/**
 * WLT-01 — `POST /internal/wlt1/destinations/:destination_id/revoke`. Implements the FROZEN
 * architecture (WLT-01 Destination Revocation + AML Revocation Addendum, CLOSED + Response/
 * Revocation-ID Micro-Addendum, CLOSED) exactly — no new architectural decisions are made in this
 * file.
 *
 * DELIBERATE ASYMMETRY (frozen, security-reasoned): unlike whitelist approval
 * (`routes/destination-approval.ts`), this route has NO IAM-02 call and NO maker-checker.
 * Approval grants authority and requires a second approver; revocation REMOVES authority and must
 * support immediate operator containment — internal-service-token guard only, same as every other
 * WLT-01 machine-to-machine route.
 *
 * Frozen global lock order: this route takes ONLY the `wlt1.destination` row lock. It never reads
 * or writes `wlt1.destination_decision` — issued/unconsumed decisions become invalid automatically
 * via the EXISTING 4A-3/4B revocation_epoch/status checks; consumed decisions remain immutable
 * historical evidence, replayable even after revocation (Phase 4B's own accepted semantic).
 *
 * NO NETWORK CALLS anywhere in this route — one short locked transaction, nothing to race against.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  applyRevocationTransition,
  buildRevocationAuditMetadata,
  buildRevocationResponse,
  insertRevocationEvidence,
  loadDestinationForRevocationUpdate,
  OPERATOR_REASON_CODES,
  REVOKED_STATUS,
  type RevocationResponseBody,
} from "../lib/destination-revocation.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const RevokeBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason_code: Type.Union(OPERATOR_REASON_CODES.map((code) => Type.Literal(code))),
    reason_detail: Type.Optional(Type.String({ minLength: 1, maxLength: 280 })),
  },
  { additionalProperties: false },
);
type RevokeBody = Static<typeof RevokeBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

async function readAuthoritativeNow(client: PoolClient): Promise<Date> {
  const rows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
  return rows[0]!.now_utc;
}

export async function registerDestinationRevokeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/destinations/:destination_id/revoke",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: RevokeBody } },
    async (request, reply) => {
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as RevokeBody;
      assertPoolAvailable();

      let responseBody: RevocationResponseBody;

      try {
        responseBody = await withTransaction(async (client) => {
          const locked = await loadDestinationForRevocationUpdate(client, destination_id);
          // Unknown destination and a foreign-client destination collapse to the SAME 404 — no
          // cross-client existence oracle, no write.
          if (!locked || locked.clientId !== body.client_id) {
            throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
          }

          if (locked.status === REVOKED_STATUS) {
            // Idempotent repeat: NO destination write, NO evidence row, NO revocation_id minted.
            // Still mandatory-audited.
            await publishAudit(client, {
              event_type: "wlt1.destination_revoked",
              source_module: "WLT-01",
              actor_id: body.actor_id,
              actor_type: "service",
              entity_type: "destination",
              entity_id: destination_id,
              metadata: buildRevocationAuditMetadata({
                destinationId: destination_id,
                clientId: body.client_id,
                outcome: "already_revoked",
                source: "operator",
                reasonCode: body.reason_code,
                reasonDetail: body.reason_detail ?? null,
                actorId: body.actor_id,
                signalRef: null,
                evidence: null,
              }),
            });
            return buildRevocationResponse({
              outcome: "already_revoked",
              evidenceRecorded: false,
              evidence: null,
              destinationId: destination_id,
              clientId: body.client_id,
              revocationEpoch: locked.revocationEpoch,
              destinationStatusVersion: locked.destinationStatusVersion,
            });
          }

          const nowUtc = await readAuthoritativeNow(client);
          const transition = await applyRevocationTransition(client, locked, nowUtc);
          const evidence = await insertRevocationEvidence(client, {
            destinationId: destination_id,
            clientId: body.client_id,
            source: "operator",
            reasonCode: body.reason_code,
            reasonDetail: body.reason_detail ?? null,
            actorId: body.actor_id,
            signalRef: null,
            signalType: null,
            destinationStatusVersionAfter: transition.destination.destinationStatusVersion,
            revocationEpochAfter: transition.destination.revocationEpoch,
          });

          await publishAudit(client, {
            event_type: "wlt1.destination_revoked",
            source_module: "WLT-01",
            actor_id: body.actor_id,
            actor_type: "service",
            entity_type: "destination",
            entity_id: destination_id,
            metadata: buildRevocationAuditMetadata({
              destinationId: destination_id,
              clientId: body.client_id,
              outcome: "revoked",
              source: "operator",
              reasonCode: body.reason_code,
              reasonDetail: body.reason_detail ?? null,
              actorId: body.actor_id,
              signalRef: null,
              evidence,
            }),
          });

          return buildRevocationResponse({
            outcome: "revoked",
            evidenceRecorded: true,
            evidence,
            destinationId: destination_id,
            clientId: body.client_id,
            revocationEpoch: transition.destination.revocationEpoch,
            destinationStatusVersion: transition.destination.destinationStatusVersion,
          });
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(200).send(successEnvelope(responseBody, meta(request)));
    },
  );
}
