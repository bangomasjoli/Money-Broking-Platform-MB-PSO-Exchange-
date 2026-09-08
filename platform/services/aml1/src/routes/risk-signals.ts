/**
 * AML-01 Phase 3C — risk-signal read + acknowledge routes (confirmed decision D4: AML-01 emits
 * signals only, never freezes or mutates downstream modules — acknowledging a signal records that a
 * human has SEEN it, nothing more; it never confirms/dismisses the underlying screening match
 * (`aml1.match.confirm`/`.dismiss` remain the sole, separately approval-gated, routes for that).
 *
 * `GET /internal/aml1/risk-signals` is SUBJECT-SCOPED, not a global dump — `subject_type` and
 * `subject_ref` are BOTH mandatory query parameters (structurally, not just a soft cap), `status`
 * is an optional additional filter. This mirrors CLT-01's own `duplicate-candidates.ts`/
 * `related-party-edges.ts` client/application-scoped read-route precedent, applied here without an
 * owning application/client column to key off of (a risk signal's own natural scope is the subject
 * it was raised against).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { RISK_SIGNAL_STATUSES, safeRiskSignalResponse, type RiskSignalRow } from "../lib/risk-signals.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const SignalIdParams = Type.Object({ signal_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const StatusSchema = Type.Union(RISK_SIGNAL_STATUSES.map((s) => Type.Literal(s)));

const ListQuery = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    subject_type: Type.String({ minLength: 1, maxLength: 32 }),
    subject_ref: Type.String({ minLength: 1, maxLength: 64 }),
    status: Type.Optional(StatusSchema),
  },
  { additionalProperties: false },
);

const AcknowledgeBody = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

/** Bounded, structural — never exceeded regardless of how many signals a subject accumulates. */
const RISK_SIGNAL_LIST_LIMIT = 200;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerRiskSignalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/risk-signals
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/risk-signals",
    { preHandler: requireInternal, schema: { querystring: ListQuery } },
    async (request, reply) => {
      const q = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();

      const baseline = await checkPermission(iam2Config(app), {
        actorId: q.actor_id,
        action: "aml1.risk_signal.read",
        resource: "risk_signal",
        entityId: `${q.subject_type}:${q.subject_ref}`,
      });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const rows = await query<RiskSignalRow>(
        getPool(),
        `SELECT signal_id, signal_type, subject_type, subject_ref, subject_parent_ref, screening_request_id, screening_match_id, severity, status, created_at_utc, acknowledged_at_utc
           FROM aml1.risk_signal
          WHERE subject_type = $1 AND subject_ref = $2 AND ($3::varchar IS NULL OR status = $3)
          ORDER BY created_at_utc DESC
          LIMIT $4`,
        [q.subject_type, q.subject_ref, q.status ?? null, RISK_SIGNAL_LIST_LIMIT],
      );

      return reply.send(
        successEnvelope({ subject_type: q.subject_type, subject_ref: q.subject_ref, risk_signals: rows.map(safeRiskSignalResponse) }, meta(request)),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/risk-signals/:signal_id/acknowledge
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/risk-signals/:signal_id/acknowledge",
    { preHandler: requireInternal, schema: { params: SignalIdParams, body: AcknowledgeBody } },
    async (request, reply) => {
      const { signal_id } = request.params as { signal_id: string };
      const body = request.body as Static<typeof AcknowledgeBody>;
      assertPoolAvailable();

      const baseline = await checkPermission(iam2Config(app), { actorId: body.actor_id, action: "aml1.risk_signal.acknowledge", resource: "risk_signal", entityId: signal_id });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const existingRows = await query<{ status: string }>(getPool(), `SELECT status FROM aml1.risk_signal WHERE signal_id = $1`, [signal_id]);
      if (!existingRows[0]) throw new Aml1Error("AML1_RISK_SIGNAL_NOT_FOUND");

      let acknowledgedAtUtc: string;
      try {
        acknowledgedAtUtc = await withTransaction(async (client) => {
          const updated = await client.query<{ acknowledged_at_utc: string }>(
            `UPDATE aml1.risk_signal SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at_utc = now()
             WHERE signal_id = $1 AND status = 'open'
             RETURNING acknowledged_at_utc`,
            [signal_id, body.actor_id],
          );
          if (updated.rows.length === 0) throw new Aml1Error("AML1_RISK_SIGNAL_INVALID_STATE");

          await publishAudit(client, {
            event_type: "aml1.risk_signal_acknowledged",
            source_module: "AML-01",
            actor_id: body.actor_id,
            actor_type: "user",
            entity_type: "risk_signal",
            entity_id: signal_id,
            severity: "medium",
            action: "risk_signal.acknowledge",
            result: "success",
            metadata: { signal_id, status: "acknowledged" },
          });

          return updated.rows[0]!.acknowledged_at_utc;
        });
      } catch (err) {
        if (err instanceof Aml1Error) throw err;
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ signal_id, status: "acknowledged", acknowledged_by: body.actor_id, acknowledged_at_utc: acknowledgedAtUtc }, meta(request)));
    },
  );
}
