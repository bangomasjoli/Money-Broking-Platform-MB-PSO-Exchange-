/**
 * AML-01 Phase 2A — CLT-01 outcome delivery routes (approved Phase 2A scope, internal-only).
 *
 * Implements the two-phase delivery pattern (approved Phase 2 planning report §12): INSERT the
 * delivery row as `pending` inside ONE transaction and commit; call CLT-01 over HTTP OUTSIDE any
 * transaction, timeout-bounded (lib/clt1-client.ts); then UPDATE the delivery row to
 * `succeeded`/`failed` in a SECOND transaction. A crash between the two transactions leaves a
 * `pending` row that the retry route can re-attempt — at-least-once delivery is the approved
 * posture (Phase 2 planning report D10); a duplicate successful CLT-01 receipt is safe-but-noisy,
 * never engineered around by adding idempotency to CLT-01 itself.
 *
 * A CLT-01 delivery FAILURE (non-2xx — including the real, expected CLT1_APPLICATION_INVALID_STATE
 * / CLT1_CLIENT_NOT_ACTIVE lifecycle-window cases — timeout, network error, or malformed response)
 * is FIRST recorded as durable evidence (`clt_outcome_delivery.status = 'failed'`, TX2 committed,
 * `aml1.clt_outcome_delivery_failed` audited) exactly as before, and only THEN surfaced to the
 * caller as `AML1_CLT_DELIVERY_FAILED` (502) — the failed row is never lost or left unqueryable;
 * `GET .../clt-outcome-deliveries/:delivery_id` and the retry route both still work normally on it
 * after the throw. The error `details` carry only AML-01's own `delivery_id`/`failure_reason_code`
 * evidence (the CLT-01 error CODE when one was parseable, e.g. `CLT1_APPLICATION_INVALID_STATE` —
 * never the raw CLT-01 response body, and never PII). On `POST .../clt-outcome`, an application-
 * level screen plans TWO deliveries (`aml_sanctions` + `pep_adverse_media`) — BOTH attempts always
 * run to completion (each with its own committed TX2) before any throw, so a failure in one never
 * aborts or loses the other's outcome; the throw (if any) happens only after every planned
 * delivery for that call has already been durably recorded.
 *
 * No human match disposition, no IAM-02 permission check, no sensitive-read route — all Phase 2B
 * (approved Phase 2A exclusion list). Both routes are internal-identity-guarded only, mirroring
 * the Phase 1 screening-request routes exactly (no IAM-02 permission exists for AML-01 yet).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  planApplicationDeliveries,
  planAuthorisedPartyDelivery,
  type ApplicationDeliveryPlanItem,
  type AuthorisedPartyDeliveryPlan,
  type ScreeningMatchSummary,
} from "../lib/clt1-outcome-mapping.js";
import { deliverApplicationOutcome, deliverAuthorisedPartyOutcome, type Clt1ClientConfig, type Clt1DeliveryResult } from "../lib/clt1-client.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const ScreeningRequestIdParams = Type.Object({ screening_request_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const DeliveryIdParams = Type.Object({ delivery_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const DeliveryActionBody = Type.Object({ requested_by: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1Config(app: FastifyInstance): Clt1ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

interface ScreeningRequestRow {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  status: string;
}

interface ScreeningResultRow {
  screening_result_id: string;
}

interface ScreeningMatchRow {
  category: "sanctions" | "pep" | "adverse_media";
  match_status: "potential_match" | "confirmed_hit" | "dismissed";
}

interface DeliveryRow {
  delivery_id: string;
  screening_request_id: string;
  target: string;
  outcome_type: string | null;
  delivered_status: string;
  effective_status: string;
  status: string;
  attempt_count: number;
  failure_reason_code: string | null;
  response_ref: string | null;
  requested_by: string;
  created_at_utc: string;
  delivered_at_utc: string | null;
}

/** Single safe-response projection point — no CLT-01 response body, no PII (none of these columns
 * ever carry PII; `response_ref` is an opaque CLT-01-side id, not a name/DOB/etc). */
function safeDeliveryResponse(row: DeliveryRow) {
  return {
    delivery_id: row.delivery_id,
    screening_request_id: row.screening_request_id,
    target: row.target,
    outcome_type: row.outcome_type,
    delivered_status: row.delivered_status,
    effective_status: row.effective_status,
    status: row.status,
    attempt_count: row.attempt_count,
    failure_reason_code: row.failure_reason_code,
    response_ref: row.response_ref,
    requested_by: row.requested_by,
    created_at_utc: row.created_at_utc,
    delivered_at_utc: row.delivered_at_utc,
  };
}

async function fetchScreeningRequestOrThrow(screeningRequestId: string): Promise<ScreeningRequestRow> {
  const rows = await query<ScreeningRequestRow>(
    getPool(),
    `SELECT screening_request_id, subject_type, subject_ref, subject_parent_ref, status FROM aml1.screening_request WHERE screening_request_id = $1`,
    [screeningRequestId],
  );
  const row = rows[0];
  if (!row) throw new Aml1Error("AML1_SCREENING_REQUEST_NOT_FOUND");
  return row;
}

async function fetchDeliveryOrThrow(deliveryId: string): Promise<DeliveryRow> {
  const rows = await query<DeliveryRow>(getPool(), `SELECT * FROM aml1.clt_outcome_delivery WHERE delivery_id = $1`, [deliveryId]);
  const row = rows[0];
  if (!row) throw new Aml1Error("AML1_DELIVERY_NOT_FOUND");
  return row;
}

async function fetchMatchesForCompletedRequest(screeningRequestId: string): Promise<ScreeningMatchSummary[]> {
  const resultRows = await query<ScreeningResultRow>(getPool(), `SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1`, [screeningRequestId]);
  const resultRow = resultRows[0];
  if (!resultRow) {
    // Structural invariant violation (a 'completed' request always has exactly one result row) —
    // should never occur; guarded defensively, fails closed as not-deliverable.
    throw new Aml1Error("AML1_CLT_OUTCOME_NOT_DELIVERABLE", {
      details: [{ field: "screening_request_id", issue: "no screening_result exists for this completed request" }],
    });
  }
  const matchRows = await query<ScreeningMatchRow>(getPool(), `SELECT category, match_status FROM aml1.screening_match WHERE screening_result_id = $1`, [resultRow.screening_result_id]);
  return matchRows.map((m) => ({ category: m.category, match_status: m.match_status }));
}

interface DeliveryPlanItem {
  target: "application_outcome" | "authorised_party_screening";
  outcome_type: "aml_sanctions" | "pep_adverse_media" | null;
  delivered_status: string;
  effective_status: string;
}

/** Executes ONE HTTP delivery attempt for an already-inserted delivery row and applies the
 * terminal UPDATE in a fresh transaction — shared by the initial POST and the retry route, so both
 * call sites apply the identical two-phase (HTTP-outside-transaction) pattern. */
async function attemptDelivery(app: FastifyInstance, deliveryId: string, requestRow: ScreeningRequestRow, planItem: DeliveryPlanItem, createdBy: string): Promise<DeliveryRow> {
  let result: Clt1DeliveryResult;
  if (planItem.target === "application_outcome") {
    result = await deliverApplicationOutcome(clt1Config(app), {
      applicationId: requestRow.subject_ref,
      outcomeType: planItem.outcome_type as "aml_sanctions" | "pep_adverse_media",
      outcomeStatus: planItem.delivered_status as "pass" | "pending" | "hit",
      sourceModule: "AML-01",
      createdBy,
    });
  } else {
    // authorised_party_screening — subject_parent_ref presence is validated by the caller before
    // a delivery row is ever created for this target.
    result = await deliverAuthorisedPartyOutcome(clt1Config(app), {
      clientId: requestRow.subject_parent_ref as string,
      authorisedPartyId: requestRow.subject_ref,
      sanctionsPepStatus: planItem.delivered_status as "clear" | "review_required" | "hit",
      sourceModule: "AML-01",
      createdBy,
    });
  }

  try {
    return await withTransaction(async (client) => {
      const rows = await query<DeliveryRow>(
        client,
        `UPDATE aml1.clt_outcome_delivery SET
           status = $2,
           attempt_count = attempt_count + 1,
           response_ref = $3,
           failure_reason_code = $4,
           delivered_at_utc = now(),
           version = version + 1
         WHERE delivery_id = $1
         RETURNING *`,
        [deliveryId, result.succeeded ? "succeeded" : "failed", result.succeeded ? result.responseRef : null, result.succeeded ? null : result.failureReasonCode],
      );
      const updated = rows[0];
      if (!updated) throw new Aml1Error("AML1_DELIVERY_NOT_FOUND");

      await publishAudit(client, {
        event_type: result.succeeded ? "aml1.clt_outcome_delivery_succeeded" : "aml1.clt_outcome_delivery_failed",
        source_module: "AML-01",
        actor_id: createdBy,
        actor_type: "service",
        entity_type: "clt_outcome_delivery",
        entity_id: deliveryId,
        severity: result.succeeded ? "medium" : "high",
        action: "clt_outcome_delivery.deliver",
        result: result.succeeded ? "success" : "failure",
        reason_code: result.succeeded ? undefined : result.failureReasonCode,
        metadata: {
          screening_request_id: requestRow.screening_request_id,
          delivery_id: deliveryId,
          target: planItem.target,
          outcome_type: planItem.outcome_type,
          delivered_status: planItem.delivered_status,
          status: result.succeeded ? "succeeded" : "failed",
        },
      });

      return updated;
    });
  } catch (err) {
    if (err instanceof Aml1Error) throw err;
    throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
  }
}

export async function registerCltOutcomeDeliveryRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/screening-requests/:screening_request_id/clt-outcome
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/screening-requests/:screening_request_id/clt-outcome",
    { preHandler: requireInternal, schema: { params: ScreeningRequestIdParams, body: DeliveryActionBody } },
    async (request, reply) => {
      const { screening_request_id } = request.params as { screening_request_id: string };
      const body = request.body as Static<typeof DeliveryActionBody>;
      assertPoolAvailable();

      const requestRow = await fetchScreeningRequestOrThrow(screening_request_id);
      if (requestRow.status !== "completed") {
        throw new Aml1Error("AML1_SCREENING_REQUEST_INVALID_STATE", {
          details: [{ field: "status", issue: `must be 'completed', was '${requestRow.status}'` }],
        });
      }

      const matches = await fetchMatchesForCompletedRequest(screening_request_id);

      const planItems: DeliveryPlanItem[] = [];
      if (requestRow.subject_type === "client_application") {
        const appPlan: ApplicationDeliveryPlanItem[] = planApplicationDeliveries(matches);
        for (const item of appPlan) {
          planItems.push({ target: "application_outcome", outcome_type: item.outcome_type, delivered_status: item.delivered_status, effective_status: item.effective_status });
        }
      } else {
        if (!requestRow.subject_parent_ref) {
          throw new Aml1Error("AML1_CLT_OUTCOME_NOT_DELIVERABLE", {
            details: [{ field: "subject_parent_ref", issue: "no parent client_id was captured for this authorised_party screening request" }],
          });
        }
        const partyPlan: AuthorisedPartyDeliveryPlan = planAuthorisedPartyDelivery(matches);
        planItems.push({ target: "authorised_party_screening", outcome_type: null, delivered_status: partyPlan.delivered_status, effective_status: partyPlan.effective_status });
      }

      // TX1 — insert every planned delivery as 'pending', publish the attempt audit event, commit.
      let insertedIds: string[];
      try {
        insertedIds = await withTransaction(async (client) => {
          const ids: string[] = [];
          for (const item of planItems) {
            const deliveryId = "aml1delv_" + randomUUID();
            await client.query(
              `INSERT INTO aml1.clt_outcome_delivery
                 (delivery_id, screening_request_id, target, outcome_type, delivered_status, effective_status, status, requested_by, request_id, correlation_id)
               VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)`,
              [deliveryId, screening_request_id, item.target, item.outcome_type, item.delivered_status, item.effective_status, body.requested_by, request.ctx.request_id, request.ctx.correlation_id],
            );
            await publishAudit(client, {
              event_type: "aml1.clt_outcome_delivery_attempted",
              source_module: "AML-01",
              actor_id: body.requested_by,
              actor_type: "service",
              entity_type: "clt_outcome_delivery",
              entity_id: deliveryId,
              severity: "medium",
              action: "clt_outcome_delivery.attempt",
              result: "success",
              metadata: {
                screening_request_id,
                delivery_id: deliveryId,
                target: item.target,
                outcome_type: item.outcome_type,
                delivered_status: item.delivered_status,
                effective_status: item.effective_status,
                subject_type: requestRow.subject_type,
                subject_ref: requestRow.subject_ref,
                ...(item.target === "authorised_party_screening" ? { subject_parent_ref: requestRow.subject_parent_ref } : {}),
              },
            });
            ids.push(deliveryId);
          }
          return ids;
        });
      } catch (err) {
        if (err instanceof Aml1Error) throw err;
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      }

      // HTTP — outside any transaction, timeout-bounded — then TX2 per delivery. Every planned
      // delivery is attempted and its own TX2 committed BEFORE any throw decision is made below —
      // a failure in one delivery never aborts or loses another's already-durable outcome.
      const results: DeliveryRow[] = [];
      for (let i = 0; i < insertedIds.length; i++) {
        const updated = await attemptDelivery(app, insertedIds[i]!, requestRow, planItems[i]!, body.requested_by);
        results.push(updated);
      }

      const failed = results.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        throw new Aml1Error("AML1_CLT_DELIVERY_FAILED", {
          details: failed.map((d) => ({
            field: d.outcome_type ? `${d.target}:${d.outcome_type}` : d.target,
            issue: `delivery ${d.delivery_id} failed: ${d.failure_reason_code ?? "unknown"}`,
          })),
        });
      }

      return reply.code(201).send(successEnvelope({ screening_request_id, deliveries: results.map(safeDeliveryResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/clt-outcome-deliveries/:delivery_id/retry
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/clt-outcome-deliveries/:delivery_id/retry",
    { preHandler: requireInternal, schema: { params: DeliveryIdParams, body: DeliveryActionBody } },
    async (request, reply) => {
      const { delivery_id } = request.params as { delivery_id: string };
      const body = request.body as Static<typeof DeliveryActionBody>;
      assertPoolAvailable();

      const delivery = await fetchDeliveryOrThrow(delivery_id);
      if (delivery.status === "succeeded") {
        throw new Aml1Error("AML1_DELIVERY_INVALID_STATE");
      }

      const requestRow = await fetchScreeningRequestOrThrow(delivery.screening_request_id);

      const updated = await attemptDelivery(
        app,
        delivery.delivery_id,
        requestRow,
        {
          target: delivery.target as "application_outcome" | "authorised_party_screening",
          outcome_type: delivery.outcome_type as "aml_sanctions" | "pep_adverse_media" | null,
          delivered_status: delivery.delivered_status,
          effective_status: delivery.effective_status,
        },
        body.requested_by,
      );

      if (updated.status === "failed") {
        throw new Aml1Error("AML1_CLT_DELIVERY_FAILED", {
          details: [
            {
              field: updated.outcome_type ? `${updated.target}:${updated.outcome_type}` : updated.target,
              issue: `delivery ${updated.delivery_id} failed: ${updated.failure_reason_code ?? "unknown"}`,
            },
          ],
        });
      }

      return reply.send(successEnvelope(safeDeliveryResponse(updated), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/clt-outcome-deliveries/:delivery_id
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/clt-outcome-deliveries/:delivery_id",
    { preHandler: requireInternal, schema: { params: DeliveryIdParams } },
    async (request, reply) => {
      const { delivery_id } = request.params as { delivery_id: string };
      assertPoolAvailable();
      const delivery = await fetchDeliveryOrThrow(delivery_id);
      return reply.send(successEnvelope(safeDeliveryResponse(delivery), meta(request)));
    },
  );
}
