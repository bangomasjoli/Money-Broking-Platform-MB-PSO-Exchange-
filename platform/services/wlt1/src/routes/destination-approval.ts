/**
 * WLT-01 Phase 4A-1 — destination whitelist maker-checker approval (`pending_review ->
 * approved_pending_cooling` only). Implements the FROZEN architecture (WLT-01 Phase 4A freeze +
 * Phase 4A-1 implementation-contract addendum) exactly — no new architectural decisions are made
 * in this file.
 *
 * Two routes:
 *   - `POST /internal/wlt1/destinations/:destination_id/approve/request` — read-only preflight.
 *     Re-derives the canonical approval payload/fingerprint from live state, runs IAM-02's baseline
 *     `checkPermission` (advisory only), and writes ONE local audit event. NO destination mutation.
 *   - `POST /internal/wlt1/destinations/:destination_id/approve/apply` — the actual maker-checker
 *     execution. Requires a real IAM-02-issued decision token (`verifyDecisionToken`/
 *     execute-verify) bound to the CURRENT payload hash, re-checks every gate AND version equality
 *     under a row lock, then transitions the destination to `approved_pending_cooling` and sets
 *     `cooling_off_until_utc`/`whitelist_approval_ref` atomically with its own audit event.
 *
 * NO DB transaction is ever held open across an IAM-02 network call (addendum Issue 10/20). Both
 * IAM-02 calls happen entirely outside `withTransaction`.
 *
 * Both routes are internal-service-token-authenticated only (no separate route-level IAM-02
 * permission check beyond the explicit calls above) — machine-to-machine seams reached by an
 * external maker/checker workflow driver, not directly by an end-user session.
 *
 * WLT does NOT call `/iam2/approvals/request` and does NOT create IAM-02 approval rows (addendum
 * Issue 9) — an operator creates the IAM-02 approval OUTSIDE this module, using
 * `approve/request`'s own returned `approval_payload`/`approval_payload_hash` as the exact payload
 * to hash, exactly as CLT-01/CFG-01/SEC-01's own identical maker-checker precedent.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  APPROVAL_ELIGIBLE_STATUS,
  hasVersionDrift,
  loadDestinationForUpdate,
  resolveApprovalContext,
  type ApprovalGateFailureReason,
} from "../lib/destination-approval.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ApproveRequestBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { additionalProperties: false },
);

const ApproveApplyBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

const APPROVE_REQUEST_ACTION = "wlt1.destination.approve_request";
const APPROVE_APPLY_ACTION = "wlt1.destination.approve_apply";
const RESOURCE = "destination";

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Wlt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

/** Maps the pure gate-evaluation reason code onto the one WLT1_DESTINATION_APPROVAL_INVALID_STATE
 * error — the exact sub-reason is never distinguished on the wire (mirrors AML-01 Phase 3E's own
 * "business decision, not error taxonomy expansion" discipline: these are all one HTTP/error-code
 * outcome, the reason exists only for this file's own internal control flow and audit metadata). */
function throwGateFailure(_reasonCode: ApprovalGateFailureReason): never {
  throw new Wlt1Error("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
}

async function readAuthoritativeNow(): Promise<Date> {
  const rows = await query<{ now_utc: Date }>(getPool(), `SELECT now() AS now_utc`, []);
  return rows[0]!.now_utc;
}

export async function registerDestinationApprovalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/wlt1/destinations/:destination_id/approve/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/wlt1/destinations/:destination_id/approve/request",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: ApproveRequestBody } },
    async (request, reply) => {
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as Static<typeof ApproveRequestBody>;
      assertPoolAvailable();

      const nowUtc = await readAuthoritativeNow();
      const context = await resolveApprovalContext(getPool(), destination_id, body.client_id, nowUtc);
      if (!context.ok) {
        if (context.kind === "not_found") throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
        throwGateFailure(context.reasonCode);
      }

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.actor_id,
        action: APPROVE_REQUEST_ACTION,
        resource: RESOURCE,
        entityId: destination_id,
        clientId: body.client_id,
      });
      if (!baseline.allowed) {
        throw new Wlt1Error(baseline.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      try {
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "wlt1.destination_whitelist_approval_requested",
            source_module: "WLT-01",
            actor_id: body.actor_id,
            actor_type: "service",
            entity_type: "destination",
            entity_id: destination_id,
            metadata: {
              destination_id,
              client_id: body.client_id,
              actor_id: body.actor_id,
              approval_payload_hash: context.payloadHash,
              screening_result_id: context.screeningResultId,
              whitelist_version: context.snapshot.whitelistVersion,
              destination_status_version: context.snapshot.destinationStatusVersion,
              ...(body.reason !== undefined ? { reason: body.reason } : {}),
            },
          });
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(200).send(
        successEnvelope(
          {
            destination_id,
            client_id: body.client_id,
            eligible: true,
            iam2_action: APPROVE_APPLY_ACTION,
            iam2_resource: RESOURCE,
            iam2_entity_id: destination_id,
            approval_payload: context.payload,
            approval_payload_hash: context.payloadHash,
          },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/wlt1/destinations/:destination_id/approve/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/wlt1/destinations/:destination_id/approve/apply",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: ApproveApplyBody } },
    async (request, reply) => {
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as Static<typeof ApproveApplyBody>;
      assertPoolAvailable();

      // PHASE A — pre-IAM read. No transaction, no lock — a fast, disposable snapshot used only to
      // recompute the current fingerprint for execute-verify. NEVER trusted for the actual state
      // transition; Phase C re-reads and re-locks everything from scratch.
      const preNowUtc = await readAuthoritativeNow();
      const preContext = await resolveApprovalContext(getPool(), destination_id, body.client_id, preNowUtc);
      if (!preContext.ok) {
        if (preContext.kind === "not_found") throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
        throwGateFailure(preContext.reasonCode);
      }

      // PHASE B — IAM execute-verify. Entirely outside any WLT DB transaction.
      const verify = await verifyDecisionToken(iam2Config(app), {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: body.actor_id,
        action: APPROVE_APPLY_ACTION,
        resource: RESOURCE,
        entityId: destination_id,
        clientId: body.client_id,
        currentPayloadHash: preContext.payloadHash,
      });
      if (!verify.authorised) {
        throw new Wlt1Error(verify.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      // PHASE C — short local write transaction. Row-locked re-check of EVERY gate plus version
      // equality against the Phase A snapshot; any drift fails closed with no write (addendum
      // Issue 10 — never apply a stale, already-superseded approval).
      let outcome: { destinationStatusVersion: number; whitelistVersion: number; coolingOffUntilUtc: string; approvedAtUtc: string };
      try {
        outcome = await withTransaction(async (client) => {
          const locked = await loadDestinationForUpdate(client, destination_id);
          if (!locked) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");

          const nowUtc = await (async () => {
            const rows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
            return rows[0]!.now_utc;
          })();

          const postContext = await resolveApprovalContext(client, destination_id, body.client_id, nowUtc);
          if (!postContext.ok) {
            if (postContext.kind === "not_found") throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
            throw new Wlt1Error("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
          }
          if (hasVersionDrift(preContext.snapshot, postContext.snapshot)) {
            throw new Wlt1Error("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
          }
          // Defensive: the row-locked read must still agree with the re-resolved context (it always
          // will, since resolveApprovalContext's own SELECT runs against the SAME locked row inside
          // this transaction) — checked anyway per this codebase's own "never trust merely because
          // today's code happens to agree" discipline.
          if (locked.status !== APPROVAL_ELIGIBLE_STATUS) {
            throw new Wlt1Error("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
          }

          const newDestinationStatusVersion = locked.destinationStatusVersion + 1;
          const coolingOffUntilUtc = new Date(nowUtc.getTime() + (app.config as Wlt1Config).destinationCoolingOffHours * 60 * 60 * 1000);

          await query(
            client,
            `UPDATE wlt1.destination
                SET status = 'approved_pending_cooling',
                    destination_status_version = $1,
                    cooling_off_until_utc = $2,
                    whitelist_approval_ref = $3,
                    updated_at_utc = $4
              WHERE destination_id = $5`,
            [newDestinationStatusVersion, coolingOffUntilUtc.toISOString(), body.approval_id, nowUtc.toISOString(), destination_id],
          );

          await publishAudit(client, {
            event_type: "wlt1.destination_whitelist_approved",
            source_module: "WLT-01",
            actor_id: body.actor_id,
            actor_type: "service",
            entity_type: "destination",
            entity_id: destination_id,
            metadata: {
              destination_id,
              client_id: body.client_id,
              actor_id: body.actor_id,
              approval_id: body.approval_id,
              whitelist_version: locked.whitelistVersion,
              destination_status_version: newDestinationStatusVersion,
              cooling_off_until_utc: coolingOffUntilUtc.toISOString(),
              approved_at_utc: nowUtc.toISOString(),
              screening_result_id: postContext.screeningResultId,
            },
          });

          return {
            destinationStatusVersion: newDestinationStatusVersion,
            whitelistVersion: locked.whitelistVersion,
            coolingOffUntilUtc: coolingOffUntilUtc.toISOString(),
            approvedAtUtc: nowUtc.toISOString(),
          };
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(200).send(
        successEnvelope(
          {
            destination_id,
            client_id: body.client_id,
            status: "approved_pending_cooling",
            destination_status_version: outcome.destinationStatusVersion,
            whitelist_version: outcome.whitelistVersion,
            approved_at_utc: outcome.approvedAtUtc,
            cooling_off_until_utc: outcome.coolingOffUntilUtc,
            whitelist_approval_ref: body.approval_id,
          },
          meta(request),
        ),
      );
    },
  );
}
