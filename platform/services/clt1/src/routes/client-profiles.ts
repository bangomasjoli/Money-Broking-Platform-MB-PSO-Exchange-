/**
 * CLT-01 Phase 8 — client_profile lifecycle routes (suspend/reactivate/close). Each action is
 * request/apply with mandatory IAM-02 execute-verify — approved Phase 8 design decision 6/7: ALL
 * three lifecycle mutations are maker-checker, no single-step lifecycle mutation exists. The three
 * actions share an identical structural shape (fetch profile -> validate transition -> validate
 * reason -> checkPermission -> insert decision-request row, then at apply: re-validate ->
 * checkPermission -> execute-verify -> locked transaction -> UPDATE client_profile.status), so
 * this file builds all six routes from one parameterised `registerLifecycleRoutes` rather than
 * tripling ~150 lines of otherwise-identical code across three near-copies.
 *
 * `GET /internal/clt1/clients/:client_id/status` (routes/clients.ts) is UNCHANGED by this phase —
 * it already `SELECT`s and returns `client_profile.status` verbatim, so it naturally reports
 * `suspended`/`closed` with no code change (approved Phase 8 design decision 15).
 *
 * No `clt1.client_profile.read` permission and no lifecycle-history route exist (approved Phase 8
 * design decisions 10/16) — this file registers exactly 6 routes, all mutation request/apply
 * pairs.
 *
 * No close cascade (approved Phase 8 design decision 18) — `close/apply` updates ONLY
 * `client_profile.status`; it does not touch `authorised_user`/`client_mandate`/`authorised_party`
 * rows. Every mutation route on those tables already requires `client_profile.status =
 * 'active_limited'` (Phase 3/4's own precondition, `lib/mandates.ts`'s
 * `fetchActiveClientOrThrow` / `lib/authorised-parties.ts`'s equivalent) — a suspended or closed
 * client is therefore automatically rejected with `CLT1_CLIENT_NOT_ACTIVE` on every such mutation,
 * with no retrofit needed this phase (approved Phase 8 design decision 16).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  lifecycleDecisionPayload,
  safeLifecycleResponse,
  targetStatusForAction,
  validateClientProfileTransition,
  validateLifecycleReason,
  type ClientProfileLifecycleAction,
} from "../lib/client-profiles.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const RequestBody = Type.Object(
  {
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    evidence_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

const ApplyBody = Type.Object(
  {
    decision_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

interface ClientProfileRow {
  client_id: string;
  status: string;
}

interface LifecycleDecisionRow {
  decision_id: string;
  client_id: string;
  decision_type: ClientProfileLifecycleAction;
  requested_by: string;
  status: string;
}

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Clt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

async function fetchClientProfileOrThrow(clientId: string): Promise<ClientProfileRow> {
  const rows = await query<ClientProfileRow>(getPool(), `SELECT client_id, status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
  const row = rows[0];
  if (!row) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
  return row;
}

interface LifecycleActionSpec {
  action: ClientProfileLifecycleAction;
  permissionCode: string;
  requestedEvent: string;
  appliedEvent: string;
  decisionIdPrefix: string;
}

const LIFECYCLE_ACTIONS: readonly LifecycleActionSpec[] = [
  { action: "suspend", permissionCode: "clt1.client_profile.suspend", requestedEvent: "clt1.client_profile_suspend_requested", appliedEvent: "clt1.client_profile_suspended", decisionIdPrefix: "clt1cpldec_susp_" },
  { action: "reactivate", permissionCode: "clt1.client_profile.reactivate", requestedEvent: "clt1.client_profile_reactivate_requested", appliedEvent: "clt1.client_profile_reactivated", decisionIdPrefix: "clt1cpldec_react_" },
  { action: "close", permissionCode: "clt1.client_profile.close", requestedEvent: "clt1.client_profile_close_requested", appliedEvent: "clt1.client_profile_closed", decisionIdPrefix: "clt1cpldec_close_" },
];

function registerLifecycleRoutes(app: FastifyInstance, requireInternal: ReturnType<typeof makeClt1InternalIdentityGuard>, spec: LifecycleActionSpec): void {
  const { action, permissionCode, requestedEvent, appliedEvent, decisionIdPrefix } = spec;

  // -----------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/{suspend|reactivate|close}/request
  // -----------------------------------------------------------------------------------------
  app.post(
    `/internal/clt1/clients/:client_id/${action}/request`,
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: RequestBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof RequestBody>;
      assertPoolAvailable();

      const current = await fetchClientProfileOrThrow(client_id);
      validateClientProfileTransition(current.status, action);
      validateLifecycleReason(action, body.reason);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: permissionCode, resource: "client_profile", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = decisionIdPrefix + randomUUID();
      const payloadHash = fingerprint(lifecycleDecisionPayload({ decision_id: decisionId, client_id, decision_type: action, requested_by: body.requested_by }));

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.client_profile_lifecycle_decision_request
               (decision_id, client_id, decision_type, reason, evidence_ref, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9)`,
            [decisionId, client_id, action, body.reason ?? null, body.evidence_ref ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(client, {
            event_type: requestedEvent,
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "medium",
            action: `client_profile.${action}_request`,
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, client_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -----------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/{suspend|reactivate|close}/apply
  // -----------------------------------------------------------------------------------------
  app.post(
    `/internal/clt1/clients/:client_id/${action}/apply`,
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<LifecycleDecisionRow>(
        getPool(),
        `SELECT decision_id, client_id, decision_type, requested_by, status
           FROM clt1.client_profile_lifecycle_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.client_id !== client_id || decisionRow.decision_type !== action) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      // Pre-check (cheap, local) before spending IAM-02 network round-trips — avoids consuming a
      // single-use decision token on an apply that would fail anyway. Re-checked again inside the
      // locked transaction below as defense in depth.
      const current = await fetchClientProfileOrThrow(client_id);
      validateClientProfileTransition(current.status, action);

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: permissionCode, resource: "client_profile", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(lifecycleDecisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: permissionCode,
        resource: "client_profile",
        entityId: client_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(reasonCode: string): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.client_profile_lifecycle_denied",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "high",
            action: `client_profile.${action}_apply`,
            result: "failure",
            reason_code: reasonCode,
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only — see file header comment / decisions.ts precedent.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "gate_failed"; error: Clt1Error } | { kind: "applied"; status: string };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          const lockedDecision = await client.query<{ status: string }>(
            `SELECT status FROM clt1.client_profile_lifecycle_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }

          // client_profile now carries a real UPDATE grant (Phase 8) — FOR UPDATE locking is
          // both permitted and appropriate, since this route is about to mutate the row.
          const lockedProfile = await client.query<ClientProfileRow>(`SELECT client_id, status FROM clt1.client_profile WHERE client_id = $1 FOR UPDATE`, [client_id]);
          const profileRow = lockedProfile.rows[0];
          if (!profileRow) return { kind: "raced", error: new Clt1Error("CLT1_CLIENT_NOT_FOUND") };

          try {
            validateClientProfileTransition(profileRow.status, action);
          } catch (gateErr) {
            if (gateErr instanceof Clt1Error) return { kind: "gate_failed", error: gateErr };
            throw gateErr;
          }

          const targetStatus = targetStatusForAction(action);
          await client.query(
            `UPDATE clt1.client_profile SET status = $2, version = version + 1, updated_at_utc = now() WHERE client_id = $1`,
            [client_id, targetStatus],
          );
          await client.query(
            `UPDATE clt1.client_profile_lifecycle_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(client, {
            event_type: appliedEvent,
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "high",
            action: `client_profile.${action}`,
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id },
          });
          return { kind: "applied", status: targetStatus };
        });
      } catch (err) {
        await recordFailureAudit("apply_transaction_failed");
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced" || outcome.kind === "gate_failed") {
        await recordFailureAudit(outcome.error.code);
        throw outcome.error;
      }

      return reply.send(successEnvelope(safeLifecycleResponse({ client_id, status: outcome.status, decision_id: body.decision_id }), meta(request)));
    },
  );
}

export async function registerClientProfileLifecycleRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);
  for (const spec of LIFECYCLE_ACTIONS) {
    registerLifecycleRoutes(app, requireInternal, spec);
  }
}
