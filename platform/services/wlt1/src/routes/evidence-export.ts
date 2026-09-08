/**
 * WLT-01 Evidence Export. Implements the FROZEN architecture (WLT-01 Evidence Export
 * Implementation-Contract Architecture Addendum + Final Micro-Clarification + IAM/Idempotency +
 * Manifest Final Correction) exactly — no new architectural decisions are made in this file.
 *
 * Four routes:
 *   - `POST /internal/wlt1/evidence-exports/request` — read-only preflight. Mints `export_id`,
 *     builds/hashes the approval payload, runs IAM-02's baseline `checkPermission` (advisory
 *     only). Persists NOTHING.
 *   - `POST /internal/wlt1/evidence-exports/:export_id/apply` — the actual maker-checker
 *     execution: idempotency resolved BEFORE any IAM call (load-bearing — see below),
 *     `verifyDecisionToken` OUTSIDE any transaction, then a REPEATABLE READ generation
 *     transaction that collects bounded evidence, builds the canonical body, computes the
 *     content hash, INSERTs the export row, publishes `wlt1.evidence_export_generated`, and
 *     completes idempotency — all in ONE transaction.
 *   - `GET /internal/wlt1/evidence-exports/:export_id` — status/manifest only, NEVER `content`.
 *   - `GET /internal/wlt1/evidence-exports/:export_id/download` — the ONE route that may return
 *     `content`; a real disclosure, so `wlt1.evidence_exported` MUST commit before any byte is
 *     released.
 *
 * IAM-02 DECISION TOKENS ARE SINGLE-CONSUME AND IRREVERSIBLE (`services/iam2/src/lib/
 * decision-token.ts`'s own `verifyAndConsumeDecisionToken`: success -> `status='consumed'`,
 * mismatch -> `status='revoked'` — both terminal). This is why `beginIdempotent` MUST run BEFORE
 * `verifyDecisionToken`: a `processing`/`completed` duplicate must never reach IAM at all, or a
 * legitimate in-flight/already-satisfied request would burn (or attempt to re-burn) a single-use
 * token it never needed to touch. A `completed` replay therefore returns from the persisted
 * export row WITHOUT calling `verifyDecisionToken` again — the token is already consumed and a
 * second call would fail. If IAM denies/is-unavailable/generation-fails AFTER a `new`
 * `beginIdempotent`, the token is spent (or its state is unknown) and foundation has no
 * lease/reclaim mechanism — recovery requires a NEW IAM-02 approval + NEW decision token + NEW
 * Idempotency-Key; the old key is permanently `processing` and always 503s (never a Foundation
 * change, never invented here).
 *
 * `UNIQUE (approval_ref)` (migration 062) is the WLT-side defensive backstop against the
 * SEPARATELY-TRACKED IAM-02 decision-token double-consume race — NOT fixed here. Even if two
 * concurrent execute-verify calls against the SAME token both report success, at most one export
 * row survives; the second INSERT's `23505` maps to `403 WLT1_APPROVAL_REQUIRED`.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, beginIdempotent, completeIdempotent, getPool, publishAudit, query, successEnvelope, withTransaction, type IdempotencyScope } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  buildApprovalPayload,
  buildExportContent,
  buildManifest,
  canonicaliseEvidenceTypes,
  collectAllEvidence,
  computeApprovalPayloadHash,
  computeDisclosedDataClasses,
  computeScopeHash,
  isDuplicateApprovalRefViolation,
  normaliseDateRange,
  type EvidenceExportScopeInput,
  type EvidenceType,
} from "../lib/evidence-export.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const RESOURCE = "evidence_export";
const REQUEST_ACTION = "wlt1.evidence_export.request";
const APPLY_ACTION = "wlt1.evidence_export.apply";
const DOWNLOAD_ACTION = "wlt1.evidence_export.download";

const ExportIdParams = Type.Object({ export_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const EvidenceTypesArray = Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { minItems: 1 });

const RequestBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    evidence_types: EvidenceTypesArray,
    destination_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    from_utc: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    to_utc: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { additionalProperties: false },
);
type RequestBody = Static<typeof RequestBody>;

const ApplyBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    evidence_types: EvidenceTypesArray,
    destination_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    from_utc: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    to_utc: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);
type ApplyBody = Static<typeof ApplyBody>;

const GetQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }), client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
type GetQuery = Static<typeof GetQuery>;

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

/** Canonicalises evidence_types + date range, throwing WLT1_EVIDENCE_EXPORT_SCOPE_INVALID on any
 * violation — shared by BOTH /request and /apply so the two routes can never silently diverge on
 * what counts as a valid scope. */
function canonicaliseScope(body: { evidence_types: string[]; destination_id?: string; from_utc?: string; to_utc?: string }): EvidenceExportScopeInput {
  const typesResult = canonicaliseEvidenceTypes(body.evidence_types);
  if (!typesResult.ok) {
    throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", { details: [{ issue: typesResult.issue }] });
  }
  const dateResult = normaliseDateRange(body.from_utc, body.to_utc);
  if (!dateResult.ok) {
    throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", { details: [{ issue: dateResult.issue }] });
  }
  return { destinationId: body.destination_id ?? null, evidenceTypes: typesResult.types, fromUtc: dateResult.fromUtc, toUtc: dateResult.toUtc };
}

interface EvidenceExportRowNoContent {
  export_id: string;
  client_id: string;
  scope_destination_id: string | null;
  scope_evidence_types: EvidenceType[];
  scope_from_utc: Date | null;
  scope_to_utc: Date | null;
  scope_hash: string;
  requested_by: string;
  approval_ref: string;
  reason: string | null;
  schema_version: string;
  record_count: number;
  scope_record_counts: Record<string, number>;
  content_hash: string;
  request_id: string;
  correlation_id: string;
  generated_at_utc: Date;
}

const EXPORT_ROW_COLUMNS_NO_CONTENT =
  "export_id, client_id, scope_destination_id, scope_evidence_types, scope_from_utc, scope_to_utc, scope_hash, requested_by, approval_ref, reason, schema_version, record_count, scope_record_counts, content_hash, request_id, correlation_id, generated_at_utc";

function manifestFromRow(row: EvidenceExportRowNoContent) {
  return {
    schema_version: row.schema_version,
    source_module: "WLT-01" as const,
    export_id: row.export_id,
    client_id: row.client_id,
    generated_at_utc: row.generated_at_utc.toISOString(),
    scope: {
      destination_id: row.scope_destination_id,
      evidence_types: row.scope_evidence_types,
      from_utc: row.scope_from_utc ? row.scope_from_utc.toISOString() : null,
      to_utc: row.scope_to_utc ? row.scope_to_utc.toISOString() : null,
    },
    requested_by: row.requested_by,
    approval_ref: row.approval_ref,
    reason: row.reason,
    request_id: row.request_id,
    correlation_id: row.correlation_id,
    record_counts: row.scope_record_counts,
    record_count: row.record_count,
    excluded_evidence_note: "SEC-01-owned audit events and sensitive-read access records are outside WLT-01 Evidence Export v1 scope.",
  };
}

function applyResponseFromRow(row: EvidenceExportRowNoContent) {
  return {
    export_id: row.export_id,
    client_id: row.client_id,
    schema_version: row.schema_version,
    scope_hash: row.scope_hash,
    content_hash: row.content_hash,
    record_count: row.record_count,
    record_counts: row.scope_record_counts,
    generated_at_utc: row.generated_at_utc.toISOString(),
    requested_by: row.requested_by,
    approval_ref: row.approval_ref,
    download_available: true,
  };
}

export async function registerEvidenceExportRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/wlt1/evidence-exports/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/wlt1/evidence-exports/request",
    { preHandler: requireInternal, schema: { body: RequestBody } },
    async (request, reply) => {
      const body = request.body as RequestBody;
      assertPoolAvailable();

      const scope = canonicaliseScope(body);
      const exportId = "wlt1exp_" + randomUUID();

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.actor_id,
        action: REQUEST_ACTION,
        resource: RESOURCE,
        entityId: exportId,
        clientId: body.client_id,
      });
      if (!baseline.allowed) {
        throw new Wlt1Error(baseline.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      const payload = buildApprovalPayload({ exportId, clientId: body.client_id, requestedBy: body.actor_id, scope, reason: body.reason ?? null });
      const payloadHash = computeApprovalPayloadHash(payload);

      return reply.code(200).send(
        successEnvelope(
          {
            export_id: exportId,
            client_id: body.client_id,
            eligible: true,
            iam2_action: APPLY_ACTION,
            iam2_resource: RESOURCE,
            iam2_entity_id: exportId,
            approval_payload: payload,
            approval_payload_hash: payloadHash,
          },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/wlt1/evidence-exports/:export_id/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/wlt1/evidence-exports/:export_id/apply",
    { preHandler: requireInternal, schema: { params: ExportIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { export_id } = request.params as Static<typeof ExportIdParams>;
      const body = request.body as ApplyBody;
      assertPoolAvailable();
      const idempotencyKey = requireIdempotencyKey(request);
      const config = app.config as Wlt1Config;

      // Steps 4-6: canonicalise scope, rebuild approval_payload, compute both hashes. Pure, no I/O.
      const scope = canonicaliseScope(body);
      const payload = buildApprovalPayload({ exportId: export_id, clientId: body.client_id, requestedBy: body.actor_id, scope, reason: body.reason ?? null });
      const payloadHash = computeApprovalPayloadHash(payload);
      const scopeHash = computeScopeHash({ clientId: body.client_id, scope });

      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "service",
        action: "wlt1.evidence_export.apply",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      // Step 7: TX-A — beginIdempotent STRICTLY BEFORE any IAM call (load-bearing — see this
      // file's own header comment). COMMIT immediately; this is deliberately a separate, short
      // transaction from TX-B below.
      let isReplay = false;
      try {
        await withTransaction(async (client) => {
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "new") return;
          if (idem.recordStatus === "completed") {
            isReplay = true;
            return;
          }
          // processing (or the currently-unreachable failed) — fail closed BEFORE any IAM call,
          // zero generation, zero token consumption.
          throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      // Step 8 (completed replay): return from the persisted row — NEVER call verifyDecisionToken
      // again (the token is already consumed). No regeneration, no second generated audit.
      if (isReplay) {
        const rows = await query<EvidenceExportRowNoContent>(getPool(), `SELECT ${EXPORT_ROW_COLUMNS_NO_CONTENT} FROM wlt1.evidence_export WHERE export_id = $1 AND client_id = $2`, [export_id, body.client_id]);
        const row = rows[0];
        if (!row) throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_NOT_FOUND");
        return reply.code(201).send(successEnvelope(applyResponseFromRow(row), meta(request)));
      }

      // Step 9: IAM verify-and-consume — OUTSIDE any DB transaction. `actorId` is the MAKER
      // (the original requester), never the checker — see iam2-client.ts's own contract.
      const verify = await verifyDecisionToken(iam2Config(app), {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: body.actor_id,
        action: APPLY_ACTION,
        resource: RESOURCE,
        entityId: export_id,
        clientId: body.client_id,
        currentPayloadHash: payloadHash,
      });
      if (!verify.authorised) {
        // Old idempotency key remains 'processing' forever — recovery requires a NEW approval +
        // NEW decision token + NEW Idempotency-Key (never documented/tested as same-token retry).
        throw new Wlt1Error(verify.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      // Steps 10-18: TX-B — REPEATABLE READ generation transaction. Collection, INSERT, generated
      // audit, and completeIdempotent all commit or roll back together.
      let outcome: EvidenceExportRowNoContent;
      try {
        outcome = await withTransaction(async (client) => {
          await query(client, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", []);

          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const generatedAtUtc = nowRows[0]!.now_utc;

          const collected = await collectAllEvidence(client, { clientId: body.client_id, destinationId: scope.destinationId, evidenceTypes: scope.evidenceTypes, fromUtc: scope.fromUtc, toUtc: scope.toUtc }, config.evidenceExportMaxRecords);

          const manifest = buildManifest({
            exportId: export_id,
            clientId: body.client_id,
            generatedAtUtc: generatedAtUtc.toISOString(),
            scope,
            requestedBy: body.actor_id,
            approvalRef: body.approval_id,
            reason: body.reason ?? null,
            requestId: request.ctx.request_id ?? null,
            correlationId: request.ctx.correlation_id,
            recordCounts: collected.recordCounts,
            recordCount: collected.recordCount,
          });
          const { content, contentHash } = buildExportContent({ manifest, evidence: collected.evidence });

          try {
            await query(
              client,
              `INSERT INTO wlt1.evidence_export
                 (export_id, client_id, scope_destination_id, scope_evidence_types, scope_from_utc, scope_to_utc, scope_hash, requested_by, approval_ref, reason, schema_version, record_count, scope_record_counts, content_hash, content, request_id, correlation_id, generated_at_utc)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
              [
                export_id,
                body.client_id,
                scope.destinationId,
                JSON.stringify(scope.evidenceTypes),
                scope.fromUtc,
                scope.toUtc,
                scopeHash,
                body.actor_id,
                body.approval_id,
                body.reason ?? null,
                manifest.schema_version,
                collected.recordCount,
                JSON.stringify(collected.recordCounts),
                contentHash,
                content,
                request.ctx.request_id ?? null,
                request.ctx.correlation_id,
                generatedAtUtc.toISOString(),
              ],
            );
          } catch (err) {
            if (isDuplicateApprovalRefViolation(err)) {
              throw new Wlt1Error("WLT1_APPROVAL_REQUIRED");
            }
            throw err;
          }

          await publishAudit(client, {
            event_type: "wlt1.evidence_export_generated",
            source_module: "WLT-01",
            actor_id: body.actor_id,
            actor_type: "service",
            entity_type: "evidence_export",
            entity_id: export_id,
            metadata: {
              export_id,
              client_id: body.client_id,
              scope_hash: scopeHash,
              schema_version: manifest.schema_version,
              record_count: collected.recordCount,
              content_hash: contentHash,
              requested_by: body.actor_id,
              approval_ref: body.approval_id,
            },
          });

          await completeIdempotent(client, idemScope, export_id);

          const rows = await query<EvidenceExportRowNoContent>(client, `SELECT ${EXPORT_ROW_COLUMNS_NO_CONTENT} FROM wlt1.evidence_export WHERE export_id = $1`, [export_id]);
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      // Step 19: response — NO export bytes/content, ever, at apply.
      return reply.code(201).send(successEnvelope(applyResponseFromRow(outcome), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/wlt1/evidence-exports/:export_id — status/manifest ONLY, never `content`.
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/wlt1/evidence-exports/:export_id",
    { preHandler: requireInternal, schema: { params: ExportIdParams, querystring: GetQuery } },
    async (request, reply) => {
      const { export_id } = request.params as Static<typeof ExportIdParams>;
      const { actor_id, client_id } = request.query as GetQuery;
      assertPoolAvailable();

      // IAM before lookup — deliberate (see this file's own header + addendum §4): an
      // unauthorised caller gets 403 with no existence signal at all.
      const permission = await checkPermission(iam2Config(app), { actorId: actor_id, action: DOWNLOAD_ACTION, resource: RESOURCE, entityId: export_id, clientId: client_id });
      if (!permission.allowed) {
        throw new Wlt1Error(permission.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      const rows = await query<EvidenceExportRowNoContent>(getPool(), `SELECT ${EXPORT_ROW_COLUMNS_NO_CONTENT} FROM wlt1.evidence_export WHERE export_id = $1 AND client_id = $2`, [export_id, client_id]);
      const row = rows[0];
      if (!row) throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_NOT_FOUND");

      return reply.send(successEnvelope(manifestFromRow(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/wlt1/evidence-exports/:export_id/download — the ONE route that may return
  // `content`. Every successful download is a real disclosure.
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/wlt1/evidence-exports/:export_id/download",
    { preHandler: requireInternal, schema: { params: ExportIdParams, querystring: GetQuery } },
    async (request, reply) => {
      const { export_id } = request.params as Static<typeof ExportIdParams>;
      const { actor_id, client_id } = request.query as GetQuery;
      assertPoolAvailable();

      const permission = await checkPermission(iam2Config(app), { actorId: actor_id, action: DOWNLOAD_ACTION, resource: RESOURCE, entityId: export_id, clientId: client_id });
      if (!permission.allowed) {
        throw new Wlt1Error(permission.reason === "iam2_unavailable" ? "WLT1_IAM2_UNAVAILABLE" : "WLT1_APPROVAL_REQUIRED");
      }

      // The ONE place `content` is ever selected — no other route/helper in this file selects it.
      const rows = await query<{ export_id: string; client_id: string; content: string; content_hash: string }>(
        getPool(),
        `SELECT export_id, client_id, content, content_hash FROM wlt1.evidence_export WHERE export_id = $1 AND client_id = $2`,
        [export_id, client_id],
      );
      const row = rows[0];
      if (!row) throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_NOT_FOUND");

      const parsed = JSON.parse(row.content) as { evidence: Record<string, unknown[]>; manifest: { record_count: number } };
      const disclosedDataClass = computeDisclosedDataClasses(parsed.evidence);

      // Disclosure evidence MUST commit before any byte is released — fail closed, own short
      // transaction, mirrors lib/sensitive-read.ts's own identical contract.
      try {
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "wlt1.evidence_exported",
            source_module: "WLT-01",
            actor_id,
            actor_type: "service",
            entity_type: "evidence_export",
            entity_id: export_id,
            metadata: {
              export_id: row.export_id,
              client_id: row.client_id,
              resource_type: "evidence_export",
              access_action: "export",
              disclosed_data_class: disclosedDataClass,
              record_count: parsed.manifest.record_count,
              content_hash: row.content_hash,
            },
          });
        });
      } catch (err) {
        throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_LOG_REQUIRED", { cause: err });
      }

      return reply
        .code(200)
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="wlt1-evidence-export-${export_id}.json"`)
        .header("x-wlt1-content-hash", row.content_hash)
        .send(row.content);
    },
  );
}
