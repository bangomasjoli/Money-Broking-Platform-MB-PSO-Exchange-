/**
 * WLT-01 Phase 4A-3 — `POST /internal/wlt1/destination-decisions/:decision_id/verify`. Implements
 * the FROZEN architecture (WLT-01 Phase 4A-3 addendum, CLOSED) exactly — no new architectural
 * decisions are made in this file.
 *
 * READ-ONLY (frozen, load-bearing): this route issues ZERO UPDATE/DELETE against
 * `wlt1.destination_decision` — the runtime role's own SELECT+INSERT-only grant (no UPDATE
 * privilege exists at all) is the structural enforcement, not merely a code-review convention.
 * This deliberately does NOT mirror CFG-01's own `verifyDecisionToken` precedent
 * (`services/cfg1/src/lib/decision-token.ts`), which revokes on binding mismatch and writes
 * `last_verified_at_utc` on success — WLT-01's decision-lifecycle table has no UPDATE grant at
 * all, and this phase must not introduce one. The only write this route ever issues is the
 * mandatory verification audit event, via `foundation.outbox_event` (an INSERT-only grant WLT-01
 * already holds) — an audit append is NOT a decision-lifecycle mutation.
 *
 * ANTI-ORACLE (frozen, load-bearing): an unknown `decision_id` and an existing decision presented
 * with the wrong token are DELIBERATELY INDISTINGUISHABLE — both return the identical
 * `200 { valid:false, reason_code:"token_mismatch" }` shape, and both run the IDENTICAL
 * hash+`timingSafeEqual` comparison shape (`lib/decision-token.ts`'s `tokenHashMatches`, against
 * either the real stored hash or the fixed `DUMMY_TOKEN_HASH`) so neither existence nor
 * correctness leaks via response shape or timing. This is the SAME discipline
 * `plugins/receipt-auth.ts` already established for provider-receipt authentication.
 *
 * PRECEDENCE (frozen, security-sensitive): token_mismatch -> binding_mismatch -> expired ->
 * revoked -> evidence_integrity_invalid. No post-token-auth reason is ever revealed until token
 * possession has been proven; the last four are `lib/decision-verify.ts`'s own pure evaluator.
 *
 * NO RE-EVALUATION (frozen phase boundary): no AML-01 call, no P-ROSTER call, no screening
 * freshness check, no chain-coverage check, no cooling-off check, no PoC cryptographic
 * verification, no `wlt1.proof_of_control` row-existence lookup. This route verifies the ISSUED
 * ARTIFACT, never re-runs eligibility. Phase 4B (not authorized) owns stronger revalidation.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { DUMMY_TOKEN_HASH, tokenHashMatches } from "../lib/decision-token.js";
import { loadDecisionByDecisionId, evaluateDecisionVerification, type Wlt1DecisionVerifyReasonCode } from "../lib/decision-verify.js";
import { loadDestinationEvalSnapshot } from "../lib/evaluate-use.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const DecisionIdParams = Type.Object({ decision_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const DecisionVerifyBody = Type.Object(
  {
    decision_token: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    destination_id: Type.String({ minLength: 1, maxLength: 64 }),
    requested_action: Type.Literal("destination_use"),
  },
  { additionalProperties: false },
);
type DecisionVerifyBody = Static<typeof DecisionVerifyBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

async function readAuthoritativeNow(): Promise<Date> {
  const rows = await query<{ now_utc: Date }>(getPool(), `SELECT now() AS now_utc`, []);
  return rows[0]!.now_utc;
}

function invalidBody(reasonCode: Wlt1DecisionVerifyReasonCode) {
  return { valid: false as const, reason_code: reasonCode };
}

export async function registerDecisionVerifyRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/destination-decisions/:decision_id/verify",
    { preHandler: requireInternal, schema: { params: DecisionIdParams, body: DecisionVerifyBody } },
    async (request, reply) => {
      const { decision_id } = request.params as Static<typeof DecisionIdParams>;
      const body = request.body as DecisionVerifyBody;
      assertPoolAvailable();

      const nowUtc = await readAuthoritativeNow();
      const decisionRow = await loadDecisionByDecisionId(getPool(), decision_id);

      // ANTI-ORACLE: whether or not a row exists, the SAME hash+timingSafeEqual comparison shape
      // runs before any branch is taken — against the real stored hash when a row exists, against
      // the fixed DUMMY_TOKEN_HASH when it does not. Neither existence nor a real-vs-dummy
      // distinction is ever observable in response shape or comparison shape.
      const tokenAuthenticated = tokenHashMatches(body.decision_token, decisionRow?.tokenHash ?? DUMMY_TOKEN_HASH);

      let reasonCode: Wlt1DecisionVerifyReasonCode | null = null;
      let auditEntityDestinationId: string | null = null;
      let auditEntityClientId: string | null = null;

      if (!decisionRow || !tokenAuthenticated) {
        reasonCode = "token_mismatch";
      } else {
        const currentDestination = await loadDestinationEvalSnapshot(getPool(), decisionRow.destinationId);
        // Structurally near-impossible (no DELETE grant exists on wlt1.destination, and
        // destination_id is immutable) but defended anyway — an unresolvable current destination
        // can never be treated as a valid artifact.
        const evaluation = currentDestination
          ? evaluateDecisionVerification({
              callerClientId: body.client_id,
              callerDestinationId: body.destination_id,
              callerRequestedAction: body.requested_action,
              decision: decisionRow,
              currentDestination:
                currentDestination.destinationType === "fiat_payout"
                  ? { status: currentDestination.status, revocationEpoch: currentDestination.revocationEpoch, destinationType: currentDestination.destinationType, rail: currentDestination.rail, currency: currentDestination.currency }
                  : { status: currentDestination.status, revocationEpoch: currentDestination.revocationEpoch, destinationType: currentDestination.destinationType, walletType: currentDestination.walletType },
              nowUtc,
            })
          : { eligible: false as const, reasonCode: "evidence_integrity_invalid" as const };

        reasonCode = evaluation.eligible ? null : evaluation.reasonCode;
        auditEntityDestinationId = decisionRow.destinationId;
        auditEntityClientId = decisionRow.clientId;
      }

      const valid = reasonCode === null;

      try {
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "wlt1.destination_decision_verified",
            source_module: "WLT-01",
            actor_id: "wlt1_internal_service",
            actor_type: "service",
            entity_type: "destination_decision",
            entity_id: decision_id,
            metadata: {
              decision_id: decision_id,
              valid,
              reason_code: reasonCode,
              client_id: auditEntityClientId ?? body.client_id,
              destination_id: auditEntityDestinationId ?? body.destination_id,
              requested_action: body.requested_action,
              verified_at_utc: nowUtc.toISOString(),
            },
          });
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (!valid) {
        return reply.code(200).send(successEnvelope(invalidBody(reasonCode as Wlt1DecisionVerifyReasonCode), meta(request)));
      }

      return reply.code(200).send(
        successEnvelope(
          {
            valid: true,
            decision_id: decisionRow!.decisionId,
            destination_id: decisionRow!.destinationId,
            client_id: decisionRow!.clientId,
            requested_action: decisionRow!.requestedAction,
            expires_at_utc: decisionRow!.expiresAtUtc.toISOString(),
          },
          meta(request),
        ),
      );
    },
  );
}
