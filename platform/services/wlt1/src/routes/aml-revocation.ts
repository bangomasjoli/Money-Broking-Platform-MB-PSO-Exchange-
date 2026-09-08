/**
 * WLT-01 — `POST /internal/wlt1/aml-revocations`. Implements the FROZEN architecture (WLT-01
 * Destination Revocation + AML Revocation Addendum, CLOSED + Response/Revocation-ID
 * Micro-Addendum, CLOSED) exactly — no new architectural decisions are made in this file.
 *
 * INGESTION SEAM, not a screening call: this route accepts an already-determined AML-01 risk
 * signal (`signal_id`/`signal_type`, reused verbatim from AML-01's own canonical
 * `aml1.risk_signal` identity — no new WLT-side identifier invented). NO AML-01 network call, NO
 * new inbound secret/config — internal-service-token guard only, same as every other WLT-01
 * machine-to-machine route.
 *
 * `reason_code` is ALWAYS the fixed `AML_REASON_CODE` ("aml_risk_signal") — the caller never
 * chooses it.
 *
 * MISBOUND signal_ref (frozen): the partial unique index on `signal_ref` is GLOBAL. A `signal_id`
 * already naming evidence for a DIFFERENT destination/client than the one addressed here is never
 * treated as a duplicate for the current target — it maps to the identical
 * `WLT1_DESTINATION_NOT_FOUND` shape an unknown/foreign destination produces (no oracle, no remap,
 * no fabricated evidence — see `lib/destination-revocation.ts`'s own header comment).
 *
 * Frozen global lock order: this route takes ONLY the `wlt1.destination` row lock, same as
 * `routes/destination-revoke.ts`. NO NETWORK CALLS anywhere in this route.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  AML_REASON_CODE,
  applyRevocationTransition,
  buildRevocationAuditMetadata,
  buildRevocationResponse,
  findRevocationBySignalRef,
  insertRevocationEvidence,
  loadDestinationForRevocationUpdate,
  type RevocationResponseBody,
} from "../lib/destination-revocation.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const AML_SIGNAL_TYPES = ["confirmed_hit", "potential_match_unresolved", "rescreen_overdue"] as const;

const AmlRevocationBody = Type.Object(
  {
    signal_id: Type.String({ minLength: 1, maxLength: 64 }),
    signal_type: Type.Union(AML_SIGNAL_TYPES.map((t) => Type.Literal(t))),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    destination_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason_detail: Type.Optional(Type.String({ minLength: 1, maxLength: 280 })),
  },
  { additionalProperties: false },
);
type AmlRevocationBody = Static<typeof AmlRevocationBody>;

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

export async function registerAmlRevocationRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/aml-revocations",
    { preHandler: requireInternal, schema: { body: AmlRevocationBody } },
    async (request, reply) => {
      const body = request.body as AmlRevocationBody;
      assertPoolAvailable();

      let responseBody: RevocationResponseBody;

      try {
        responseBody = await withTransaction(async (client) => {
          const locked = await loadDestinationForRevocationUpdate(client, body.destination_id);
          if (!locked || locked.clientId !== body.client_id) {
            throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
          }

          const existing = await findRevocationBySignalRef(client, body.signal_id);
          if (existing && (existing.destinationId !== body.destination_id || existing.clientId !== body.client_id)) {
            // Misbound: this signal_id already names evidence for a DIFFERENT destination/client —
            // never disclosed as anything other than the standard not-found shape.
            throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
          }

          if (existing) {
            // Exact durable duplicate — genuine idempotent replay by signal_ref. NO transition, NO
            // new evidence row, NO new revocation_id. Return the ORIGINAL persisted identity.
            await publishAudit(client, {
              event_type: "wlt1.destination_revoked",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination",
              entity_id: body.destination_id,
              metadata: buildRevocationAuditMetadata({
                destinationId: body.destination_id,
                clientId: body.client_id,
                outcome: "already_revoked",
                source: "aml",
                reasonCode: AML_REASON_CODE,
                reasonDetail: body.reason_detail ?? null,
                actorId: null,
                signalRef: body.signal_id,
                evidence: existing,
              }),
            });
            return buildRevocationResponse({
              outcome: "already_revoked",
              evidenceRecorded: false,
              evidence: existing,
              destinationId: body.destination_id,
              clientId: body.client_id,
              revocationEpoch: locked.revocationEpoch,
              destinationStatusVersion: locked.destinationStatusVersion,
            });
          }

          // Genuinely new signal_ref. Transition applies ONLY if not already revoked (absorbing
          // state); evidence is inserted EITHER WAY — new AML provenance is distinct from whether a
          // destination-state transition occurred this call.
          const nowUtc = await readAuthoritativeNow(client);
          const transition = await applyRevocationTransition(client, locked, nowUtc);
          const evidence = await insertRevocationEvidence(client, {
            destinationId: body.destination_id,
            clientId: body.client_id,
            source: "aml",
            reasonCode: AML_REASON_CODE,
            reasonDetail: body.reason_detail ?? null,
            actorId: null,
            signalRef: body.signal_id,
            signalType: body.signal_type,
            destinationStatusVersionAfter: transition.destination.destinationStatusVersion,
            revocationEpochAfter: transition.destination.revocationEpoch,
          });

          const outcome = transition.transitioned ? "revoked" : "already_revoked";

          await publishAudit(client, {
            event_type: "wlt1.destination_revoked",
            source_module: "WLT-01",
            actor_id: "wlt1_internal_service",
            actor_type: "service",
            entity_type: "destination",
            entity_id: body.destination_id,
            metadata: buildRevocationAuditMetadata({
              destinationId: body.destination_id,
              clientId: body.client_id,
              outcome,
              source: "aml",
              reasonCode: AML_REASON_CODE,
              reasonDetail: body.reason_detail ?? null,
              actorId: null,
              signalRef: body.signal_id,
              evidence,
            }),
          });

          return buildRevocationResponse({
            outcome,
            evidenceRecorded: true,
            evidence,
            destinationId: body.destination_id,
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
