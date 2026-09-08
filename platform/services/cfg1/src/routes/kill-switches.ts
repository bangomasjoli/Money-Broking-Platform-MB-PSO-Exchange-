/**
 * CFG-01 Phase 3B — feature-scoped kill-switch workflow routes (blueprint
 * `05_Database_Design.md` §2.7, `07_Permission_Rules.md` §4 item 6, approved Phase 3B scope).
 *
 * Three routes. Activation is a SINGLE STEP (permission-gated, no execute-verify — approved
 * decision #4); deactivation is the SAME two-step request-then-apply, IAM-02-approval-bound
 * pattern `routes/feature-changes.ts`/`routes/licence-changes.ts` already established (approved
 * decision #5) — see those files' own header comments for the full design rationale (IAM-02
 * approval reuse, operational payload-hash contract, token-consumed-after-verify discipline,
 * "no separate unreliable failed-status write under an audit outage"); this file's comments only
 * note where kill-switch genuinely differs.
 *
 * ---------------------------------------------------------------------------------------
 * ACTIVATION'S BASELINE CHECK MUST BE A GENUINE `allow` — structurally, not by convention.
 * ---------------------------------------------------------------------------------------
 * Every other CFG-01 mutation permission accepts `checkPermission`'s baseline pass even when the
 * underlying IAM-02 decision was `approval_required`/`step_up_required` (see `lib/iam2-client.ts`'s
 * own header comment) because a MANDATORY `execute-verify` call always follows to provide the
 * real gate. Activation has no second step — there is nothing else standing between a baseline
 * pass and a real state change. `cfg1.kill_switch.activate` is registered with
 * `requires_approval = false` / `requires_step_up = false` specifically so the real guard can
 * only ever return `allow` or `deny` for it (never `approval_required`/`step_up_required` —
 * those decisions are only possible when the PERMISSION's own flags are true), but this route
 * additionally asserts `baseline.reason === "permission_granted"` as defence in depth: a
 * structural guarantee that a future accidental change to this permission's catalogue flags
 * cannot silently let a bare baseline pass authorise an emergency control action.
 *
 * ---------------------------------------------------------------------------------------
 * Partial SoD mitigation + documented residual gap (approved decisions #6/#7).
 * ---------------------------------------------------------------------------------------
 * `lib/kill-switch.ts`'s `requestKillSwitchDeactivation` rejects a deactivation-request PROPOSER
 * who is the SAME actor as the kill-switch's own `activated_by` — CFG-01 already owns that
 * comparison, cheaply and reliably. It CANNOT verify that the eventual IAM-02 APPROVER of a
 * (different) proposer's deactivation request is not the original activator — IAM-02's
 * `execute-verify` binds and returns the token's MAKER identity only, never the approver's
 * (`services/iam2/src/lib/decision-token.ts`), so that half of the SoD concern is a documented,
 * accepted residual gap, not silently ignored. No IAM-02 code, schema, or `sod_rule` change is
 * made here (approved decisions #8/#9).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeCfg1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { assertPoolAvailable } from "./features.js";
import {
  activateKillSwitch,
  applyKillSwitchDeactivation,
  computeKillSwitchDeactivationPayloadHash,
  requestKillSwitchDeactivation,
} from "../lib/kill-switch.js";
import { sha256Hex } from "../lib/canonical.js";
import { checkPermission, verifyDecisionToken as verifyIam2DecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Cfg1Error } from "../lib/errors.js";
import type { Cfg1Config } from "../config.js";

const ActivateBody = Type.Object(
  {
    feature_code: Type.String({ minLength: 1, maxLength: 128 }),
    reason: Type.String({ minLength: 1, maxLength: 1024 }),
    evidence_ref: Type.Optional(Type.String({ maxLength: 128 })),
    activated_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const DeactivationRequestBody = Type.Object(
  {
    feature_code: Type.String({ minLength: 1, maxLength: 128 }),
    change_reason: Type.String({ minLength: 1, maxLength: 1024 }),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const DeactivationApplyBody = Type.Object(
  {
    change_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Cfg1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerKillSwitchRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeCfg1InternalIdentityGuard(app.config.cfg1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/kill-switches/activate
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/kill-switches/activate",
    { preHandler: requireInternal, schema: { body: ActivateBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ActivateBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const baseline = await checkPermission(iam2, {
        actorId: body.activated_by,
        action: "cfg1.kill_switch.activate",
        resource: "feature",
        entityId: body.feature_code,
      });
      // See file header comment — activation has no execute-verify fallback, so the baseline
      // check IS the real gate here and must be a genuine role-granted allow.
      if (!baseline.allowed || baseline.reason !== "permission_granted") {
        throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");
      }

      const outcome = await withTransaction((client) =>
        activateKillSwitch(client, {
          featureCode: body.feature_code,
          reason: body.reason,
          evidenceRef: body.evidence_ref ?? null,
          activatedBy: body.activated_by,
          requestId: request.ctx.request_id,
          correlationId: request.ctx.correlation_id,
        }),
      ).catch((err) => {
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      });

      if (outcome.kind === "already_active") {
        throw new Cfg1Error("CFG1_KILL_SWITCH_ALREADY_ACTIVE");
      }

      return reply.send(
        successEnvelope(
          {
            kill_switch_id: outcome.killSwitchId,
            feature_code: body.feature_code,
            status: "active",
            version: outcome.version,
            activated_at_utc: outcome.activatedAtUtc,
          },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/kill-switch-deactivation-requests/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/kill-switch-deactivation-requests/request",
    { preHandler: requireInternal, schema: { body: DeactivationRequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof DeactivationRequestBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const baseline = await checkPermission(iam2, {
        actorId: body.requested_by,
        action: "cfg1.kill_switch.deactivate_request",
        resource: "feature",
        entityId: body.feature_code,
      });
      if (!baseline.allowed) throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");

      const outcome = await withTransaction((client) =>
        requestKillSwitchDeactivation(client, {
          featureCode: body.feature_code,
          changeReason: body.change_reason,
          requestedBy: body.requested_by,
          requestId: request.ctx.request_id,
          correlationId: request.ctx.correlation_id,
        }),
      ).catch((err) => {
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      });

      if (outcome.kind === "not_active") throw new Cfg1Error("CFG1_KILL_SWITCH_NOT_ACTIVE");
      if (outcome.kind === "self_deactivation_blocked") throw new Cfg1Error("CFG1_KILL_SWITCH_SELF_DEACTIVATION_BLOCKED");

      return reply.send(
        successEnvelope(
          { change_id: outcome.changeId, status: "requested", feature_code: body.feature_code, payload_hash: outcome.payloadHash },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/kill-switch-deactivation-requests/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/kill-switch-deactivation-requests/apply",
    { preHandler: requireInternal, schema: { body: DeactivationApplyBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof DeactivationApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      interface ChangeRow {
        change_id: string;
        kill_switch_id: string;
        feature_code: string;
        requested_by: string;
        status: string;
      }
      const changeRows = await withTransaction((client) =>
        query<ChangeRow>(
          client,
          `SELECT change_id, kill_switch_id, feature_code, requested_by, status FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1`,
          [body.change_id],
        ),
      );
      const changeRow = changeRows[0];
      if (!changeRow) throw new AppError("NOT_FOUND");
      if (changeRow.status !== "requested") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");

      const baseline = await checkPermission(iam2, {
        actorId: changeRow.requested_by,
        action: "cfg1.kill_switch.deactivate",
        resource: "feature",
        entityId: changeRow.feature_code,
      });
      if (!baseline.allowed) throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");

      // No DB lock held across this network call — see routes/feature-changes.ts's header
      // comment for the full rationale (identical here).
      const currentPayloadHash = computeKillSwitchDeactivationPayloadHash({
        changeId: changeRow.change_id,
        killSwitchId: changeRow.kill_switch_id,
        featureCode: changeRow.feature_code,
      });
      const verify = await verifyIam2DecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: changeRow.requested_by,
        action: "cfg1.kill_switch.deactivate",
        resource: "feature",
        entityId: changeRow.feature_code,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Cfg1Error("CFG1_MUTATION_APPROVAL_REQUIRED");

      // IAM-02's token is now CONSUMED — see routes/feature-changes.ts's header comment for the
      // full "token-consumed-after-verify" rationale, identical here: no separate "mark as
      // failed" write is attempted on a subsequent failure; the row simply stays 'requested',
      // retriable with a fresh IAM-02 approval.
      const decisionTokenHash = sha256Hex(body.decision_token);
      const requestedBy = changeRow.requested_by;
      const featureCode = changeRow.feature_code;
      async function recordFailureAudit(reasonCode: string): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "cfg1.kill_switch.failed",
            source_module: "CFG-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "feature",
            entity_id: featureCode,
            severity: "high",
            action: "kill_switch_deactivate",
            result: "failure",
            reason_code: reasonCode,
            metadata: { change_id: body.change_id },
          }),
        ).catch(() => {
          // Best-effort only — see routes/feature-changes.ts's identical rationale.
        });
      }

      let outcome;
      try {
        outcome = await withTransaction((client) =>
          applyKillSwitchDeactivation(client, {
            changeId: body.change_id,
            approvalId: body.approval_id,
            decisionTokenHash,
            requestedBy: changeRow.requested_by,
          }),
        );
      } catch (err) {
        await recordFailureAudit("apply_transaction_failed");
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");
      if (outcome.kind === "not_active") throw new Cfg1Error("CFG1_KILL_SWITCH_NOT_ACTIVE");

      return reply.send(
        successEnvelope(
          {
            change_id: body.change_id,
            status: "applied",
            feature_code: outcome.featureCode,
            kill_switch_id: outcome.killSwitchId,
            new_version: outcome.newVersion,
            deactivated_at_utc: outcome.deactivatedAtUtc,
          },
          meta(request),
        ),
      );
    },
  );
}
