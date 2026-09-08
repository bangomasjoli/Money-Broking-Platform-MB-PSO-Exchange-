/**
 * SEC-01 §04_API_Specification.md §2 audit ingestion API — Phase 2.
 *
 * `POST /internal/sec1/audit-events` and `POST /internal/sec1/audit-events/batch` are BOTH
 * guarded by the source-identity-binding guard (plugins/source-identity.ts), NOT the generic
 * internal-identity guard (see that plugin's header comment for why). Both require the
 * standard `Idempotency-Key` header (fail closed 400 if missing, same as every other mutating
 * endpoint in this codebase) IN ADDITION TO the business-level (source_module, event_id)
 * duplicate handling `lib/ingest.ts` performs — two independent, composable layers of
 * idempotency, not a substitute for one another.
 *
 * Batch partial success is EXPLICIT per event (04_API_Specification.md §2.2 rule 2): each
 * event is ingested in its OWN transaction so one event's rejection never rolls back another
 * event's already-committed row.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  successEnvelope,
  toAppError,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeRequireSourceIdentity } from "../plugins/source-identity.js";
import { ingestAuditEvent, type IngestAuditEventInput } from "../lib/ingest.js";
import { Sec1Error } from "../lib/errors.js";
import { evaluateRulesForEvent, type JustIngestedEvent } from "../lib/monitoring-rules.js";

const AuditEventBody = Type.Object(
  {
    event_id: Type.String({ minLength: 1, maxLength: 128 }),
    event_type: Type.String({ minLength: 1, maxLength: 128 }),
    event_category: Type.Optional(
      Type.Union([
        Type.Literal("auth"),
        Type.Literal("permission"),
        Type.Literal("money"),
        Type.Literal("security"),
        Type.Literal("system"),
      ]),
    ),
    severity: Type.Union([
      Type.Literal("info"),
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("critical"),
    ]),
    source_module: Type.String({ minLength: 1, maxLength: 32 }),
    source_emission_sequence: Type.Optional(Type.Integer({ minimum: 0 })),
    source_emission_stream: Type.Optional(Type.String({ maxLength: 128 })),
    actor_user_id: Type.Optional(Type.String({ maxLength: 64 })),
    actor_type: Type.Union([
      Type.Literal("client"),
      Type.Literal("staff"),
      Type.Literal("system"),
      Type.Literal("service"),
    ]),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    entity_type: Type.Optional(Type.String({ maxLength: 64 })),
    entity_id: Type.Optional(Type.String({ maxLength: 64 })),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    result: Type.Union([Type.Literal("success"), Type.Literal("failure"), Type.Literal("blocked")]),
    reason_code: Type.Optional(Type.String({ maxLength: 128 })),
    request_id: Type.String({ minLength: 1, maxLength: 128 }),
    correlation_id: Type.String({ minLength: 1, maxLength: 128 }),
    occurred_at_utc: Type.String({ minLength: 1, maxLength: 64 }),
    source_clock_id: Type.Optional(Type.String({ maxLength: 64 })),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

const SingleIngestBody = AuditEventBody;
const BatchIngestBody = Type.Object(
  { events: Type.Array(AuditEventBody, { minItems: 1, maxItems: 200 }) },
  { additionalProperties: false },
);

type AuditEventBodyType = Static<typeof AuditEventBody>;

function toIngestInput(body: AuditEventBodyType): IngestAuditEventInput {
  // source_clock_id is accepted on the wire (04_API_Specification.md §2.1 sample) but not
  // used by Phase 0-2 (clock-skew detection/quarantine is a deferred SEC1-FR-028 item) — not
  // forwarded into IngestAuditEventInput or persisted; explicitly dropped, not silently lost
  // in a way that would surprise a future implementer (documented here).
  const { source_clock_id: _sourceClockId, ...rest } = body;
  return rest;
}

/**
 * Phase 5: builds the rule-engine's input shape directly from the ALREADY-VALIDATED ingest
 * input + the confirmed `audit_event_ref` — no re-fetch from the DB needed, since every field
 * the rule engine needs was already present on the request that was just durably persisted.
 */
function toJustIngestedEvent(input: IngestAuditEventInput, auditEventRef: string): JustIngestedEvent {
  return {
    auditEventRef,
    eventType: input.event_type,
    sourceModule: input.source_module,
    actorUserId: input.actor_user_id ?? null,
    clientId: input.client_id ?? null,
    entityType: input.entity_type ?? null,
    entityId: input.entity_id ?? null,
    action: input.action,
    result: input.result,
    requestId: input.request_id,
    correlationId: input.correlation_id,
  };
}

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  const requireSourceIdentity = makeRequireSourceIdentity();

  app.post(
    "/internal/sec1/audit-events",
    { preHandler: requireSourceIdentity, schema: { body: SingleIngestBody } },
    async (request, reply) => {
      const body = toIngestInput(request.body as AuditEventBodyType);
      const idempotencyKey = requireIdempotencyKey(request);
      const resolvedSourceModule = request.resolvedSourceModule as string;
      const actorId = request.ctx.actor_id ?? `sec1_ingest_${resolvedSourceModule}`;

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "sec1.audit_events.ingest",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        await beginIdempotent(client, idemScope);
        const ingestResult = await ingestAuditEvent(client, resolvedSourceModule, body);
        await completeIdempotent(client, idemScope, ingestResult.audit_event_ref);
        return ingestResult;
      });

      // Phase 5: post-ingest rule evaluation — AFTER the ingest transaction has committed,
      // NEVER inside it (lib/monitoring-rules.ts's own header comment). Structurally cannot
      // throw, so this never affects the response below. Skipped on a replay (`replayed:
      // true`) — the FIRST, non-replay ingest of this exact event already evaluated it; a
      // replay creates no new audit_event row for a threshold/count-window rule to newly
      // count (a harmless no-op if re-run, but skipped as a deliberate efficiency choice, not
      // a correctness requirement).
      if (!result.replayed) {
        await evaluateRulesForEvent(toJustIngestedEvent(body, result.audit_event_ref));
      }

      return reply.send(successEnvelope(result, meta(request)));
    },
  );

  app.post(
    "/internal/sec1/audit-events/batch",
    { preHandler: requireSourceIdentity, schema: { body: BatchIngestBody } },
    async (request, reply) => {
      const body = request.body as { events: AuditEventBodyType[] };
      const idempotencyKey = requireIdempotencyKey(request);
      const resolvedSourceModule = request.resolvedSourceModule as string;
      const actorId = request.ctx.actor_id ?? `sec1_ingest_${resolvedSourceModule}`;

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "sec1.audit_events.batch_ingest",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      // Reserve/replay-detect the WHOLE batch call once (fails closed on a conflicting
      // fingerprint under the same header key) — does not itself process any event.
      await withTransaction((client) => beginIdempotent(client, idemScope));

      const results: Array<Record<string, unknown>> = [];
      for (const rawEvent of body.events) {
        const event = toIngestInput(rawEvent);
        try {
          // Each event ingests in its OWN transaction — partial success is explicit; one
          // event's rejection never rolls back another event's already-committed row.
          const ingestResult = await withTransaction((client) =>
            ingestAuditEvent(client, resolvedSourceModule, event),
          );
          // Phase 5: same post-commit, non-throwing rule evaluation as the single-ingest
          // route above — per event, after its OWN transaction has committed.
          if (!ingestResult.replayed) {
            await evaluateRulesForEvent(toJustIngestedEvent(event, ingestResult.audit_event_ref));
          }
          results.push({ event_id: event.event_id, status: "ingested", ...ingestResult });
        } catch (err) {
          const appErr =
            err instanceof Sec1Error || err instanceof AppError ? err : toAppError(err);
          results.push({
            event_id: event.event_id,
            status: "rejected",
            error: { code: appErr.code, message: appErr.message },
          });
        }
      }

      await withTransaction((client) =>
        completeIdempotent(client, idemScope, `batch:${results.length}`),
      );

      return reply.send(successEnvelope({ results }, meta(request)));
    },
  );
}
