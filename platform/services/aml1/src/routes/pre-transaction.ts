/**
 * AML-01 Phase 3E — the single synchronous pre-transaction AML decision route. Implements the
 * FROZEN architecture (AML-01 Phase 3E freeze + addendum) exactly — internal-service-token guard
 * only (no IAM-02 permission, machine-to-machine only), evidence-based (never a live provider
 * call), one ordinary read-write transaction, one audit event per returned decision, audit-atomic
 * with the response (a forced audit-publish failure rolls back the whole decision — no successful
 * decision may ever be returned without its audit).
 *
 * HTTP vs business-decision semantics (frozen Part H): a legitimate AML outcome (`allow`/`review`/
 * `deny`) is HTTP 200 WITH a `decision` field — this route is answering the caller's question, not
 * failing. A technical/structural failure (invalid schema, DB unreachable, audit-publish failure)
 * is a non-2xx response with NO `decision` field — the caller must never receive `decision: review`
 * for a technical failure, and must never receive an affirmative decision on any non-2xx.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  PRE_TRANSACTION_REQUESTED_ACTIONS,
  PRE_TRANSACTION_SUBJECT_TYPES,
  canonicalizeSubjectRefs,
  resolveSubjectEvidence,
  evaluateSubjectEvidence,
  aggregateDecision,
} from "../lib/pre-transaction.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const SubjectRefSchema = Type.Object(
  {
    subject_type: Type.Union(PRE_TRANSACTION_SUBJECT_TYPES.map((t) => Type.Literal(t))),
    subject_ref: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const PreTransactionBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    subject_refs: Type.Array(SubjectRefSchema, { minItems: 1, maxItems: 20 }),
    requested_action: Type.Union(PRE_TRANSACTION_REQUESTED_ACTIONS.map((a) => Type.Literal(a))),
    caller_module: Type.String({ minLength: 1, maxLength: 64 }),
    destination_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    chain: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
    network: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
  },
  { additionalProperties: false },
);
type PreTransactionBody = Static<typeof PreTransactionBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function registerPreTransactionRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  app.post(
    "/internal/aml1/pre-transaction/screen",
    { preHandler: requireInternal, schema: { body: PreTransactionBody } },
    async (request, reply) => {
      const body = request.body as PreTransactionBody;
      assertPoolAvailable();
      const config = app.config as Aml1Config;

      const canonicalSubjects = canonicalizeSubjectRefs(body.subject_refs);

      let outcome: { decisionId: string; decision: string; reasonCode: string; evaluatedAtIso: string; validUntilIso: string; evidenceProviderIds: string[] };
      try {
        outcome = await withTransaction(async (client) => {
          // Authoritative time — read ONCE inside the transaction (frozen Part J / addendum item
          // 26). Used for evaluated_at_utc, valid_until_utc, and every freshness comparison below
          // (via evaluateSubjectEvidence's own nowUtc parameter) — never Date.now()/new Date().
          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;
          const evaluatedAtIso = nowUtc.toISOString();
          const validUntilIso = new Date(nowUtc.getTime() + config.pretransactionDecisionTtlMinutes * 60_000).toISOString();

          // Evidence resolution — ONE SQL statement for every canonical subject, sharing a single
          // consistent snapshot (frozen addendum item 24).
          const evidenceRows = await resolveSubjectEvidence(client, body.client_id, canonicalSubjects);
          const verdicts = evidenceRows.map((row) => evaluateSubjectEvidence(row, nowUtc, config.pretransactionEvidenceMaxAgeHours));
          const aggregated = aggregateDecision(verdicts);

          const decisionId = "aml1ptd_" + randomUUID();

          // Audit — exactly one event per returned decision (allow/review/deny alike), atomic with
          // the decision itself: a publish failure throws here, which withTransaction converts to a
          // rollback, and the catch below maps to 503 AML1_AUDIT_REQUIRED with NO decision field.
          await publishAudit(client, {
            event_type: "aml1.pre_transaction_evaluated",
            source_module: "AML-01",
            actor_id: "aml1_internal_service",
            actor_type: "service",
            entity_type: "pre_transaction_decision",
            entity_id: decisionId,
            metadata: {
              decision_id: decisionId,
              decision: aggregated.decision,
              reason_code: aggregated.reasonCode,
              client_id: body.client_id,
              requested_action: body.requested_action,
              caller_module: body.caller_module,
              subject_count: canonicalSubjects.length,
              evidence_provider_ids: aggregated.evidenceProviderIds,
              evaluated_at_utc: evaluatedAtIso,
              valid_until_utc: validUntilIso,
              ...(body.destination_ref !== undefined ? { destination_ref: body.destination_ref } : {}),
              ...(body.chain !== undefined ? { chain: body.chain } : {}),
              ...(body.network !== undefined ? { network: body.network } : {}),
            },
          });

          return {
            decisionId,
            decision: aggregated.decision,
            reasonCode: aggregated.reasonCode,
            evaluatedAtIso,
            validUntilIso,
            evidenceProviderIds: aggregated.evidenceProviderIds,
          };
        });
      } catch (err) {
        if (err instanceof Aml1Error) throw err;
        // Anything else reaching here inside an otherwise fully-validated transaction is an
        // unexpected failure — the realistic cause is the audit/outbox write above (mirrors every
        // other AML-01 mutating route's identical catch-order precedent, e.g. risk-signals.ts's
        // acknowledge route).
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(200).send(
        successEnvelope(
          {
            decision: outcome.decision,
            decision_id: outcome.decisionId,
            reason_code: outcome.reasonCode,
            evaluated_at_utc: outcome.evaluatedAtIso,
            valid_until_utc: outcome.validUntilIso,
            evidence_provider_ids: outcome.evidenceProviderIds,
            client_id: body.client_id,
            requested_action: body.requested_action,
          },
          meta(request),
        ),
      );
    },
  );
}
