/**
 * SEC-01 Phase 4 audit read/search routes (`04_API_Specification.md` §4;
 * docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md §8).
 *
 * INTERNAL routes this phase, not the blueprint's literal public `GET /sec1/audit-events` —
 * SEC-01 has no session/cookie authentication mechanism of its own anywhere in the accepted
 * codebase, and building one from scratch here would duplicate what PRT-01 (the presentation
 * layer, "owns no truth/state") is specifically designed to front. `actor_id`/`session_id` are
 * trusted request fields from an already-authenticated caller — EXACTLY the same trust boundary
 * IAM-02's own `POST /internal/iam2/permission/check` already uses for its own `actor_id`
 * field. Guarded by the GENERIC internal-identity guard (plugins/internal-identity.ts), the
 * same one Phase 3's seal-verify/integrity-verify-range routes use — not the ingestion-specific
 * source-identity guard, since these routes are not attributable to one external source module.
 *
 * AUTHORIZATION ORDER (fixed, never reordered per route):
 *   1. Schema validation (Fastify/TypeBox).
 *   2. Baseline IAM-02 permission check (`.search` or `.read`) — a non-allow is a HARD STOP,
 *      SEC1_UNAUTHORISED_AUDIT_READ (or SEC1_IAM02_REGISTRY_MISSING for a catalogue gap).
 *   3. ONLY THEN does the route query the database. A detail read's 404 (`NOT_FOUND`) is thus
 *      always AFTER authorization — an unauthorized caller never learns whether the referenced
 *      event exists (SEC1-TC-036 / the Phase 4 plan §10's own explicit test requirement).
 *   4. Sensitive-tier IAM-02 permission check (`.read_sensitive`) — this does NOT gate the
 *      request; a non-allow here simply means every row is redacted at normal tier.
 *   5. Row redaction (`lib/read-redaction.ts`), computed per row from the event's own
 *      `sensitive_read` flag AND the actor's tier.
 *   6. If any row was disclosed at sensitive tier, `lib/sensitive-read-log.ts` writes the log
 *      row INSIDE THE SAME TRANSACTION, BEFORE the response is returned — if that write fails,
 *      the whole transaction rolls back and the read fails closed (SEC1-TC-038).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeSec1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type CheckPermissionResult, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  decodeCursor,
  encodeCursor,
  getAuditEventDetail,
  searchAuditEvents,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  type AuditEventSearchFilters,
} from "../lib/read-query.js";
import { redactAuditEventRow } from "../lib/read-redaction.js";
import { writeSensitiveReadLog } from "../lib/sensitive-read-log.js";
import { canonicalJson, sha256Hex } from "../lib/canonical.js";
import { Sec1Error } from "../lib/errors.js";

const SearchFilters = Type.Object(
  {
    source_module: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
    event_type: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    severity: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
    result: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
    actor_user_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    client_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    entity_type: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    entity_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    occurred_at_from: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    occurred_at_to: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    ingested_at_from: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    ingested_at_to: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    correlation_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    request_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

const SearchBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    filters: Type.Optional(SearchFilters),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SEARCH_LIMIT })),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    reason: Type.Optional(Type.String({ maxLength: 256 })),
  },
  { additionalProperties: false },
);

const ReadBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    audit_event_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    source_module: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
    event_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    reason: Type.Optional(Type.String({ maxLength: 256 })),
  },
  { additionalProperties: false },
);

function iam2ClientConfig(app: FastifyInstance): Iam2ClientConfig {
  return {
    baseUrl: app.config.iam2BaseUrl,
    internalServiceToken: app.config.iam2InternalServiceToken,
    ...(app.config.iam2FetchImpl ? { fetchImpl: app.config.iam2FetchImpl } : {}),
  };
}

/** Hard stop for the baseline permission check — SEC1_IAM02_REGISTRY_MISSING is distinguished
 * from the generic deny so a catalogue-registration gap (migration 011 missing/stale) is
 * diagnosable rather than looking like an ordinary access denial (SEC1-TC-079). */
function denyUnlessAllowed(result: CheckPermissionResult): void {
  if (result.allowed) return;
  if (result.reason === "IAM2_PERMISSION_UNKNOWN") {
    throw new Sec1Error("SEC1_IAM02_REGISTRY_MISSING");
  }
  throw new Sec1Error("SEC1_UNAUTHORISED_AUDIT_READ");
}

export async function registerReadRoutes(app: FastifyInstance): Promise<void> {
  const requireInternalIdentity = makeSec1InternalIdentityGuard(app.config.sec1InternalServiceToken);

  app.post(
    "/internal/sec1/audit-events/search",
    { preHandler: requireInternalIdentity, schema: { body: SearchBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof SearchBody>;
      const filters: AuditEventSearchFilters = body.filters ?? {};
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.audit_event.search",
        resource: "audit_event",
        ...(filters.client_id ? { clientId: filters.client_id } : {}),
      });
      denyUnlessAllowed(baseline);

      // Does NOT gate the request — only decides the redaction tier of the response.
      const sensitive = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.audit_event.read_sensitive",
        resource: "audit_event",
        ...(filters.client_id ? { clientId: filters.client_id } : {}),
      });

      const limit = body.limit ?? DEFAULT_SEARCH_LIMIT;
      const cursor = decodeCursor(body.cursor);

      const result = await withTransaction(async (client) => {
        const { rows, nextCursor } = await searchAuditEvents(client, { filters, limit, cursor });

        const redactedEvents: Record<string, unknown>[] = [];
        let anyDisclosedSensitive = false;
        for (const row of rows) {
          const { redacted, disclosedSensitive } = redactAuditEventRow(row, sensitive.allowed, filters.client_id);
          redactedEvents.push(redacted);
          if (disclosedSensitive) anyDisclosedSensitive = true;
        }

        // Written INSIDE this same transaction, BEFORE returning — a failure here rolls back
        // the whole read (SEC1-TC-038), so no data below is ever returned without it.
        if (anyDisclosedSensitive) {
          await writeSensitiveReadLog(client, {
            userId: body.actor_id,
            action: "search",
            searchScopeHash: sha256Hex(canonicalJson(filters)),
            ...(body.reason ? { reason: body.reason } : {}),
            requestId: request.ctx.request_id,
            correlationId: request.ctx.correlation_id,
            metadata: { result_count: redactedEvents.length },
          });
        }

        return {
          events: redactedEvents,
          next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
        };
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );

  app.post(
    "/internal/sec1/audit-events/read",
    { preHandler: requireInternalIdentity, schema: { body: ReadBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ReadBody>;
      if (!body.audit_event_ref && !(body.source_module && body.event_id)) {
        throw new AppError("VALIDATION_ERROR", {
          details: [
            { field: "audit_event_ref", issue: "either audit_event_ref or (source_module + event_id) is required" },
          ],
        });
      }
      const iam2Config = iam2ClientConfig(app);

      // entityId is context-only for IAM-02's own decision log (never used for the allow/deny
      // decision itself this stage — guard.ts's own header comment), but should still reflect
      // whichever lookup key the caller actually used, not just audit_event_ref, so the
      // decision-log context is meaningful regardless of lookup path.
      const requestedEntityId = body.audit_event_ref ?? body.event_id;
      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.audit_event.read",
        resource: "audit_event",
        ...(requestedEntityId ? { entityId: requestedEntityId } : {}),
      });
      // Hard stop BEFORE any query runs — an unauthorized caller never learns whether the
      // referenced event exists (404-after-authz, not before).
      denyUnlessAllowed(baseline);

      const sensitive = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.audit_event.read_sensitive",
        resource: "audit_event",
      });

      const result = await withTransaction(async (client) => {
        const row = await getAuditEventDetail(client, {
          ...(body.audit_event_ref ? { auditEventRef: body.audit_event_ref } : {}),
          ...(body.source_module ? { sourceModule: body.source_module } : {}),
          ...(body.event_id ? { eventId: body.event_id } : {}),
        });
        if (!row) {
          throw new AppError("NOT_FOUND");
        }

        const { redacted, disclosedSensitive } = redactAuditEventRow(row, sensitive.allowed, undefined);

        if (disclosedSensitive) {
          await writeSensitiveReadLog(client, {
            userId: body.actor_id,
            action: "read",
            auditEventRef: row.audit_event_ref,
            ...(body.reason ? { reason: body.reason } : {}),
            requestId: request.ctx.request_id,
            correlationId: request.ctx.correlation_id,
          });
        }

        return redacted;
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );
}
