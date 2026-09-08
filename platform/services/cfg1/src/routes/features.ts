/**
 * CFG-01 Phase 2 runtime decision engine routes (blueprint `04_API_Specification.md` §2.1/§2.2).
 * Both guarded by CFG-01's own interim internal-identity guard (approved decisions #7/#8:
 * `caller_module` in the request body is a DECLARED field, not cryptographically authenticated
 * — the shared internal-service-token only proves "some approved internal caller", never which
 * module. This is unchanged from every prior CFG-01 route, but is more load-bearing here than
 * it was for readiness: decision logs and audit trails now attribute real decisions to a
 * caller_module any holder of the shared token could spoof. Flagged, not solved, this phase.
 *
 * `evaluate` never throws for an ORDINARY deny outcome (prohibited/unknown/stale) — it returns
 * `200` with `{decision: "deny", reason_code: "..."}`, mirroring IAM-02's own `permission/check`
 * ("a decision is a legitimate answer, not a request failure"). It DOES throw
 * `CFG1_CONFIG_INTEGRITY_FAILED` (integrity check failed before any decision could be trusted),
 * `CFG1_AUDIT_REQUIRED` (the transaction-coupled decision-log+audit write itself failed), or
 * `CFG1_DECISION_ENGINE_UNAVAILABLE` (the DB pool was never reachable at all) — see
 * lib/errors.ts's header comment for the full reasoning.
 *
 * `verify-decision`, by contrast, throws on every non-success outcome (mirrors IAM-02's
 * `execute-verify`, not `permission/check` — this endpoint GATES something, "can I proceed
 * using this decision" is a binary question a non-2xx status answers more directly).
 *
 * Approved decisions #10/#11: the decision-log write and the transaction-coupled `publishAudit`
 * call happen on the SAME `withTransaction` as the decision logic itself — if that transaction
 * fails for ANY reason (including the audit write), the route throws `CFG1_AUDIT_REQUIRED`
 * AFTER the transaction has already rolled back, never returning a decision without its audit
 * trail durably committed first. Learning directly from IAM-02's own documented bug (`IAM-02_
 * IMPLEMENTATION_NOTES.md` §6): a thrown error INSIDE a `withTransaction` callback rolls back
 * that callback's own writes, so denial/failure paths must return a structured outcome and let
 * the ROUTE throw only AFTER the transaction has committed — never throw from inside the
 * callback itself.
 *
 * Phase 3B addition: `verify-decision` now also performs a live, fresh `cfg1.kill_switch` check
 * (`lib/kill-switch.ts`'s `isKillSwitchActiveForFeature`) for the presented `feature_code`, on
 * the SAME transaction, fed into `verifyDecisionToken` as an explicit argument — this route does
 * NOT re-run `evaluateFeature()`, so without this explicit check a token issued before a
 * kill-switch activation would keep verifying successfully. See `lib/decision-token.ts`'s own
 * header comment for why this is a plain live check rather than folded into the existing
 * version-comparison mechanism.
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeCfg1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { evaluateFeature, logFeatureEvaluation, type EvaluateFeatureInput, type EvaluateOutcome } from "../lib/decision.js";
import { issueDecisionToken, verifyDecisionToken, type IssuedDecisionToken } from "../lib/decision-token.js";
import { verifyDecisionTimeIntegrity } from "../lib/integrity-seal.js";
import { isKillSwitchActiveForFeature } from "../lib/kill-switch.js";
import { Cfg1Error } from "../lib/errors.js";

const ENVIRONMENTS = ["dev", "qa", "uat", "staging", "prod"] as const;
const EnvironmentSchema = Type.Union(ENVIRONMENTS.map((e) => Type.Literal(e)));

const EvaluateBody = Type.Object(
  {
    feature_code: Type.String({ minLength: 1, maxLength: 128 }),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    resource: Type.Optional(Type.String({ maxLength: 64 })),
    environment: EnvironmentSchema,
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_class: Type.Optional(Type.String({ maxLength: 32 })),
    caller_module: Type.String({ minLength: 1, maxLength: 64 }),
    requested_config_version: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

const VerifyDecisionBody = Type.Object(
  {
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
    decision_id: Type.String({ minLength: 1, maxLength: 64 }),
    feature_code: Type.String({ minLength: 1, maxLength: 128 }),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    resource: Type.Optional(Type.String({ maxLength: 64 })),
    caller_module: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_class: Type.Optional(Type.String({ maxLength: 32 })),
    environment: EnvironmentSchema,
  },
  { additionalProperties: false },
);

interface EvaluateBodyType {
  feature_code: string;
  action: string;
  resource?: string;
  environment: (typeof ENVIRONMENTS)[number];
  client_id?: string;
  client_class?: string;
  caller_module: string;
  requested_config_version?: number;
}

interface VerifyDecisionBodyType {
  decision_token: string;
  decision_id: string;
  feature_code: string;
  action: string;
  resource?: string;
  caller_module: string;
  client_id?: string;
  client_class?: string;
  environment: (typeof ENVIRONMENTS)[number];
}

/** Probe the pool eagerly so an unreachable/uninitialised DB is reported as
 * CFG1_DECISION_ENGINE_UNAVAILABLE rather than falling through to the generic
 * CFG1_AUDIT_REQUIRED catch around the transaction below. Exported (Phase 3A) for reuse by
 * routes/feature-changes.ts and routes/licence-changes.ts — same-service reuse, not a
 * cross-service import, so F3(c) does not apply. */
export function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Cfg1Error("CFG1_DECISION_ENGINE_UNAVAILABLE", { cause: err });
  }
}

export async function registerFeatureRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeCfg1InternalIdentityGuard(app.config.cfg1InternalServiceToken);

  app.post(
    "/internal/cfg1/features/evaluate",
    { preHandler: requireInternal, schema: { body: EvaluateBody } },
    async (request, reply) => {
      const body = request.body as EvaluateBodyType;
      assertPoolAvailable();

      const input: EvaluateFeatureInput = {
        featureCode: body.feature_code,
        action: body.action,
        resource: body.resource ?? null,
        environment: body.environment,
        clientId: body.client_id ?? null,
        clientClass: body.client_class ?? null,
        callerModule: body.caller_module,
        requestedConfigVersion: body.requested_config_version ?? null,
      };

      let outcome: EvaluateOutcome;
      let decisionId: string;
      let issuedToken: IssuedDecisionToken | null;
      try {
        ({ outcome, decisionId, issuedToken } = await withTransaction(async (client) => {
          const txOutcome = await evaluateFeature(client, input);
          const { decisionId: txDecisionId } = await logFeatureEvaluation(client, txOutcome, input, {
            requestId: request.ctx.request_id,
            correlationId: request.ctx.correlation_id,
            occurredAtUtc: request.ctx.server_time_utc,
          });

          let txIssuedToken: IssuedDecisionToken | null = null;
          if (txOutcome.kind === "decision" && txOutcome.result.decision === "allow") {
            txIssuedToken = await issueDecisionToken(client, {
              decisionId: txDecisionId,
              featureCode: input.featureCode,
              action: input.action,
              resource: input.resource,
              callerModule: input.callerModule,
              clientId: input.clientId,
              clientClass: input.clientClass,
              environment: input.environment,
              decision: txOutcome.result,
            });
          }

          return { outcome: txOutcome, decisionId: txDecisionId, issuedToken: txIssuedToken };
        }));
      } catch (err) {
        // Never a decision without its audit trail durably committed (approved decisions
        // #10/#11) — any failure inside the transaction (including the audit/outbox write
        // itself) collapses to this single fail-closed outcome.
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "integrity_failed") {
        throw new Cfg1Error("CFG1_CONFIG_INTEGRITY_FAILED");
      }

      const { result } = outcome;
      return reply.send(
        successEnvelope(
          {
            decision: result.decision,
            reason_code: result.reasonCode,
            feature_code: input.featureCode,
            feature_config_version: result.featureConfigVersion,
            licence_profile_version: result.licenceProfileVersion,
            prohibited_registry_version: result.prohibitedRegistryVersion,
            prohibited_registry_hash: result.prohibitedRegistryHash,
            doc00_source_version: result.doc00SourceVersion,
            integrity_status: "verified",
            decision_id: decisionId,
            decision_token: issuedToken?.rawToken ?? null,
            expires_at_utc: issuedToken?.expiresAtUtc ?? null,
          },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/internal/cfg1/features/verify-decision",
    { preHandler: requireInternal, schema: { body: VerifyDecisionBody } },
    async (request, reply) => {
      const body = request.body as VerifyDecisionBodyType;
      assertPoolAvailable();

      const bindingInput = {
        decisionId: body.decision_id,
        featureCode: body.feature_code,
        action: body.action,
        resource: body.resource ?? null,
        callerModule: body.caller_module,
        clientId: body.client_id ?? null,
        clientClass: body.client_class ?? null,
        environment: body.environment,
      };

      let txResult: { kind: "integrity_failed" } | { kind: "verified"; ok: boolean; reasonCode?: string; tokenId?: string; decisionId?: string; featureCode?: string };
      try {
        txResult = await withTransaction(async (client) => {
          const integrity = await verifyDecisionTimeIntegrity(client);
          if (integrity.status !== "verified") {
            return { kind: "integrity_failed" as const };
          }

          // Phase 3A (approved decision #8): CurrentIntegrityState now also carries the live
          // licence-profile version (already resolved by verifyDecisionTimeIntegrity above) and
          // the CURRENT cfg1.feature.version for this specific feature_code (freshly looked up
          // here, same transaction) — a licence-profile or feature-state mutation since
          // issuance now invalidates the token on this call, the same guarantee Phase 2 already
          // gave the prohibited registry.
          const currentFeatureRow = await query<{ version: number }>(
            client,
            `SELECT version FROM cfg1.feature WHERE feature_code = $1`,
            [body.feature_code],
          );
          // Phase 3B (approved decision #13): verify-decision does NOT re-run evaluateFeature(),
          // so an active kill-switch would otherwise go undetected here — a live, fresh,
          // unversioned check for the PRESENTED feature_code, computed on the same transaction,
          // fed into verifyDecisionToken as an explicit fourth argument (not folded into
          // CurrentIntegrityState — see lib/decision-token.ts's own header comment for why).
          const killSwitchActive = await isKillSwitchActiveForFeature(client, body.feature_code);
          const verifyResult = await verifyDecisionToken(
            client,
            { ...bindingInput, tokenRaw: body.decision_token },
            {
              prohibitedRegistryVersion: integrity.prohibitedRegistryVersion,
              prohibitedRegistryHash: integrity.prohibitedRegistryHash,
              licenceProfileVersion: integrity.licenceProfileVersion,
              featureConfigVersion: currentFeatureRow[0]?.version ?? null,
            },
            killSwitchActive,
          );

          await publishAudit(client, {
            event_type: verifyResult.ok ? "cfg1.feature_decision.verified" : "cfg1.feature_decision.rejected",
            source_module: "CFG-01",
            actor_id: body.caller_module,
            actor_type: "service",
            entity_type: "feature",
            entity_id: body.feature_code,
            severity: verifyResult.ok ? "medium" : "high",
            action: body.action,
            result: verifyResult.ok ? "success" : "failure",
            ...(body.client_id !== undefined ? { client_id: body.client_id } : {}),
            ...(!verifyResult.ok ? { reason_code: verifyResult.reasonCode } : {}),
            metadata: { decision_id: body.decision_id },
          });

          return verifyResult.ok
            ? { kind: "verified" as const, ok: true, tokenId: verifyResult.tokenId, decisionId: verifyResult.decisionId, featureCode: verifyResult.featureCode }
            : { kind: "verified" as const, ok: false, reasonCode: verifyResult.reasonCode };
        });
      } catch (err) {
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      }

      if (txResult.kind === "integrity_failed") {
        throw new Cfg1Error("CFG1_CONFIG_INTEGRITY_FAILED");
      }

      if (!txResult.ok) {
        throw new Cfg1Error(
          txResult.reasonCode as
            | "CFG1_DECISION_TOKEN_INVALID"
            | "CFG1_DECISION_TOKEN_EXPIRED"
            | "CFG1_DECISION_TOKEN_REVOKED"
            | "CFG1_DECISION_BINDING_MISMATCH"
            | "CFG1_TOKEN_REVOKED_BY_KILL_SWITCH",
        );
      }

      return reply.send(
        successEnvelope(
          {
            verified: true,
            decision_id: txResult.decisionId,
            feature_code: txResult.featureCode,
            token_id: txResult.tokenId,
          },
          meta(request),
        ),
      );
    },
  );
}
