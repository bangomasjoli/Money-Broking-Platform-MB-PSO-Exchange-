/**
 * CLT-01 Phase 5 — related-party-edge add/update/remove routes (blueprint
 * `04_API_Specification.md` §6.3 names only a read route — `add`/`update`/`remove` are entirely
 * documented extensions, since the blueprint documents no mutation route for this table at all).
 *
 * Structural difference from every Phase 3/4 route file: `clt1.related_party_edge` has NO single
 * owning scope (no `client_id`/`application_id` column — see lib/related-party-edges.ts header
 * comment), so mutation routes are TOP-LEVEL (`/internal/clt1/related-party-edges/...`), not
 * nested under `/clients/:client_id/...` the way Phase 3/4 routes are. The one client-scoped read
 * route (`GET /internal/clt1/clients/:client_id/related-parties`, the blueprint's own literal
 * route) lives in routes/clients.ts instead, since it genuinely is a client-centric query even
 * though edges themselves aren't client-owned.
 *
 * `add`/`update`/`remove` are request/apply with mandatory IAM-02 execute-verify — the same
 * pattern every prior Phase 2/3/4 mutation route uses: `payload_hash` computed over the
 * decision-request row's own snapshotted fields at request time, recomputed from the STORED row
 * at apply time; `execute-verify`'s `actor_id` bound to the stored row's own `requested_by`;
 * token-consumed-after-verify discipline. No blueprint "Maker-Checker Required" item names
 * related-party edges at all (07_Permission_Rules.md §3 has exactly 10 items, none covering it) —
 * this is a documented, reasoned extension, the same abuse-prone-in-both-directions reasoning
 * already applied to `authorised_party.add`/`.update`/`.remove`.
 *
 * `add/request`'s `entityId` for `checkPermission`/`execute-verify` has no natural single target
 * (no edge exists yet, and there is no owning scope to fall back on the way Phase 4's `add`
 * fell back to `client.application_id`) — a synthetic composite `${from_entity_type}:
 * ${from_entity_id}` (the source node) is used instead, an explicit design choice with no direct
 * precedent in this codebase.
 *
 * Node existence validation (does the referenced `client`/`application`/`party` entity actually
 * exist) happens entirely here, at the application layer — no real Postgres FK is possible on the
 * polymorphic `from_entity_type`/`from_entity_id` (or `to_`) columns.
 *
 * `add/apply`'s duplicate-active-edge case is deliberately mapped to a real 409
 * `CLT1_RELATED_PARTY_EDGE_DUPLICATE`, not collapsed into the generic `CLT1_AUDIT_REQUIRED` (503)
 * catch — applying the lesson from Phase 4's own carried-forward F1 finding (an identically-shaped
 * unique-violation on `client_mandate` was left collapsed into a misleading 503 there).
 * `withTransaction` (packages/foundation/src/db.ts) rolls back and rethrows the RAW, unwrapped pg
 * error on any failure — so the outer catch here can inspect `err.code`/`err.constraint` directly
 * to detect this specific violation before falling back to the generic conversion.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  RELATED_PARTY_ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  relatedPartyEdgeNotFound,
  relatedPartyNodeNotFound,
  safeRelatedPartyEdgeResponse,
  validateNotSelfReference,
  validateRelatedPartyEdgeTransition,
  type RelatedPartyEdgeRow,
  type RelatedPartyEntityType,
  type RelationshipType,
} from "../lib/related-party-edges.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const RelatedPartyEdgeIdParams = Type.Object({ related_party_edge_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const EntityTypeSchema = Type.Union(RELATED_PARTY_ENTITY_TYPES.map((t) => Type.Literal(t)));
const RelationshipTypeSchema = Type.Union(RELATIONSHIP_TYPES.map((t) => Type.Literal(t)));

const AddRequestBody = Type.Object(
  {
    from_entity_type: EntityTypeSchema,
    from_entity_id: Type.String({ minLength: 1, maxLength: 64 }),
    to_entity_type: EntityTypeSchema,
    to_entity_id: Type.String({ minLength: 1, maxLength: 64 }),
    relationship_type: RelationshipTypeSchema,
    evidence_ref: Type.Optional(Type.String({ maxLength: 256 })),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

// LOCKED DESIGN DECISION 12: update/apply updates evidence_ref only — required here (not
// optional) since it is the sole mutable field this route exists to change.
const UpdateRequestBody = Type.Object(
  {
    evidence_ref: Type.String({ maxLength: 256 }),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const RemoveRequestBody = Type.Object(
  { requested_by: Type.String({ minLength: 1, maxLength: 64 }), reason: Type.Optional(Type.String({ maxLength: 128 })) },
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

interface RelatedPartyEdgeDecisionRow {
  decision_id: string;
  decision_type: "add" | "update" | "remove";
  target_related_party_edge_id: string | null;
  from_entity_type: RelatedPartyEntityType | null;
  from_entity_id: string | null;
  to_entity_type: RelatedPartyEntityType | null;
  to_entity_id: string | null;
  relationship_type: RelationshipType | null;
  evidence_ref: string | null;
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

/** Node existence validation — no real Postgres FK is possible on the polymorphic
 * from_entity_type/from_entity_id (or to_) columns, so this check lives entirely here. */
async function validateNodeExists(entityType: RelatedPartyEntityType, entityId: string): Promise<void> {
  const tableAndColumn: Record<RelatedPartyEntityType, { table: string; column: string }> = {
    client: { table: "clt1.client_profile", column: "client_id" },
    application: { table: "clt1.client_application", column: "application_id" },
    party: { table: "clt1.authorised_party", column: "authorised_party_id" },
  };
  const { table, column } = tableAndColumn[entityType];
  const rows = await query<{ exists: number }>(getPool(), `SELECT 1 AS exists FROM ${table} WHERE ${column} = $1`, [entityId]);
  if (rows.length === 0) relatedPartyNodeNotFound();
}

function decisionPayload(row: {
  decision_id: string;
  decision_type: string;
  target_related_party_edge_id: string | null;
  from_entity_type: string | null;
  from_entity_id: string | null;
  to_entity_type: string | null;
  to_entity_id: string | null;
  relationship_type: string | null;
  evidence_ref: string | null;
  requested_by: string;
}): Record<string, unknown> {
  return {
    decision_id: row.decision_id,
    decision_type: row.decision_type,
    target_related_party_edge_id: row.target_related_party_edge_id,
    from_entity_type: row.from_entity_type,
    from_entity_id: row.from_entity_id,
    to_entity_type: row.to_entity_type,
    to_entity_id: row.to_entity_id,
    relationship_type: row.relationship_type,
    evidence_ref: row.evidence_ref,
    requested_by: row.requested_by,
  };
}

/** Detects the specific partial-unique-index violation this table can raise (migration 027's
 * `idx_clt1_related_party_edge_one_active_per_tuple`) so it can be mapped to a real 409, not the
 * generic CLT1_AUDIT_REQUIRED (503) — see file header comment for why. */
function isDuplicateEdgeViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_clt1_related_party_edge_one_active_per_tuple";
}

const ADD_ACTION = "clt1.related_party.add";
const UPDATE_ACTION = "clt1.related_party.update";
const REMOVE_ACTION = "clt1.related_party.remove";

export async function registerRelatedPartyEdgeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/add/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/add/request",
    { preHandler: requireInternal, schema: { body: AddRequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof AddRequestBody>;
      assertPoolAvailable();

      validateNotSelfReference(body.from_entity_type, body.from_entity_id, body.to_entity_type, body.to_entity_id);
      await validateNodeExists(body.from_entity_type, body.from_entity_id);
      await validateNodeExists(body.to_entity_type, body.to_entity_id);

      const entityId = `${body.from_entity_type}:${body.from_entity_id}`;
      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: ADD_ACTION, resource: "related_party_edge", entityId });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1rped_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          decision_type: "add",
          target_related_party_edge_id: null,
          from_entity_type: body.from_entity_type,
          from_entity_id: body.from_entity_id,
          to_entity_type: body.to_entity_type,
          to_entity_id: body.to_entity_id,
          relationship_type: body.relationship_type,
          evidence_ref: body.evidence_ref ?? null,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.related_party_edge_decision_request
               (decision_id, decision_type, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, evidence_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,'add',$2,$3,$4,$5,$6,$7,$8,$9,'requested',$10,$11,$12)`,
            [
              decisionId,
              body.from_entity_type,
              body.from_entity_id,
              body.to_entity_type,
              body.to_entity_id,
              body.relationship_type,
              body.evidence_ref ?? null,
              body.reason ?? null,
              body.requested_by,
              payloadHash,
              request.ctx.request_id,
              request.ctx.correlation_id,
            ],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_add_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: decisionId,
            severity: "medium",
            action: "related_party_edge.add_request",
            result: "success",
            metadata: { decision_id: decisionId, from_entity_type: body.from_entity_type, to_entity_type: body.to_entity_type },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/add/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/add/apply",
    { preHandler: requireInternal, schema: { body: ApplyBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<RelatedPartyEdgeDecisionRow>(
        getPool(),
        `SELECT decision_id, decision_type, target_related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, evidence_ref, requested_by, status
           FROM clt1.related_party_edge_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.decision_type !== "add") throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      // Defensive re-validation — a referenced node could have been removed between request and
      // apply (e.g. the authorised_party it names was later removed).
      await validateNodeExists(decisionRow.from_entity_type!, decisionRow.from_entity_id!);
      await validateNodeExists(decisionRow.to_entity_type!, decisionRow.to_entity_id!);

      const entityId = `${decisionRow.from_entity_type}:${decisionRow.from_entity_id}`;
      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: ADD_ACTION, resource: "related_party_edge", entityId });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: ADD_ACTION,
        resource: "related_party_edge",
        entityId,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.related_party_edge_add_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: body.decision_id,
            severity: "high",
            action: "related_party_edge.add_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied"; relatedPartyEdgeId: string };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (txClient) => {
          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.related_party_edge_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }

          const relatedPartyEdgeId = "clt1rpe_" + randomUUID();
          // May throw a 23505 unique-violation on idx_clt1_related_party_edge_one_active_per_tuple
          // — deliberately NOT caught here (see file header comment on why the outer catch, after
          // withTransaction's own rollback, is the correct place to inspect and map it).
          await txClient.query(
            `INSERT INTO clt1.related_party_edge
               (related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, evidence_ref, requested_by, approval_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              relatedPartyEdgeId,
              decisionRow.from_entity_type,
              decisionRow.from_entity_id,
              decisionRow.to_entity_type,
              decisionRow.to_entity_id,
              decisionRow.relationship_type,
              decisionRow.evidence_ref,
              decisionRow.requested_by,
              body.approval_id,
            ],
          );
          await txClient.query(
            `UPDATE clt1.related_party_edge_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_created",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: relatedPartyEdgeId,
            severity: "high",
            action: "related_party_edge.add",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id, relationship_type: decisionRow.relationship_type },
          });
          return { kind: "applied", relatedPartyEdgeId };
        });
      } catch (err) {
        await recordFailureAudit();
        if (isDuplicateEdgeViolation(err)) throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_DUPLICATE", { cause: err });
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, status: "applied", related_party_edge_id: outcome.relatedPartyEdgeId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/:related_party_edge_id/update/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/:related_party_edge_id/update/request",
    { preHandler: requireInternal, schema: { params: RelatedPartyEdgeIdParams, body: UpdateRequestBody } },
    async (request, reply) => {
      const { related_party_edge_id } = request.params as { related_party_edge_id: string };
      const body = request.body as Static<typeof UpdateRequestBody>;
      assertPoolAvailable();

      const targetRows = await query<RelatedPartyEdgeRow>(getPool(), `SELECT * FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      const target = targetRows[0];
      if (!target) relatedPartyEdgeNotFound();
      validateRelatedPartyEdgeTransition(target.status, "update");

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: UPDATE_ACTION, resource: "related_party_edge", entityId: related_party_edge_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1rped_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          decision_type: "update",
          target_related_party_edge_id: related_party_edge_id,
          from_entity_type: null,
          from_entity_id: null,
          to_entity_type: null,
          to_entity_id: null,
          relationship_type: null,
          evidence_ref: body.evidence_ref,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.related_party_edge_decision_request
               (decision_id, decision_type, target_related_party_edge_id, evidence_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,'update',$2,$3,$4,$5,'requested',$6,$7,$8)`,
            [decisionId, related_party_edge_id, body.evidence_ref, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_update_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "medium",
            action: "related_party_edge.update_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, related_party_edge_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/:related_party_edge_id/update/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/:related_party_edge_id/update/apply",
    { preHandler: requireInternal, schema: { params: RelatedPartyEdgeIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { related_party_edge_id } = request.params as { related_party_edge_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<RelatedPartyEdgeDecisionRow>(
        getPool(),
        `SELECT decision_id, decision_type, target_related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, evidence_ref, requested_by, status
           FROM clt1.related_party_edge_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.decision_type !== "update" || decisionRow.target_related_party_edge_id !== related_party_edge_id) {
        throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      const targetRows = await query<RelatedPartyEdgeRow>(getPool(), `SELECT * FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      const target = targetRows[0];
      if (!target) relatedPartyEdgeNotFound();
      validateRelatedPartyEdgeTransition(target.status, "update");

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: UPDATE_ACTION, resource: "related_party_edge", entityId: related_party_edge_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: UPDATE_ACTION,
        resource: "related_party_edge",
        entityId: related_party_edge_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.related_party_edge_update_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "high",
            action: "related_party_edge.update_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (txClient) => {
          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.related_party_edge_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedTarget = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.related_party_edge WHERE related_party_edge_id = $1 FOR UPDATE`,
            [related_party_edge_id],
          );
          if (lockedTarget.rows[0]?.status !== "active") {
            return { kind: "raced", error: new Clt1Error("CLT1_RELATED_PARTY_EDGE_INVALID_STATE") };
          }

          await txClient.query(
            `UPDATE clt1.related_party_edge SET
               evidence_ref = $2, approval_id = $3, version = version + 1, updated_at_utc = now()
             WHERE related_party_edge_id = $1`,
            [related_party_edge_id, decisionRow.evidence_ref, body.approval_id],
          );
          await txClient.query(
            `UPDATE clt1.related_party_edge_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_updated",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "high",
            action: "related_party_edge.update",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id },
          });
          return { kind: "applied" };
        });
      } catch (err) {
        await recordFailureAudit();
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, related_party_edge_id, status: "applied" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/:related_party_edge_id/remove/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/:related_party_edge_id/remove/request",
    { preHandler: requireInternal, schema: { params: RelatedPartyEdgeIdParams, body: RemoveRequestBody } },
    async (request, reply) => {
      const { related_party_edge_id } = request.params as { related_party_edge_id: string };
      const body = request.body as Static<typeof RemoveRequestBody>;
      assertPoolAvailable();

      const targetRows = await query<RelatedPartyEdgeRow>(getPool(), `SELECT * FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      const target = targetRows[0];
      if (!target) relatedPartyEdgeNotFound();
      validateRelatedPartyEdgeTransition(target.status, "remove");

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: REMOVE_ACTION, resource: "related_party_edge", entityId: related_party_edge_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1rped_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          decision_type: "remove",
          target_related_party_edge_id: related_party_edge_id,
          from_entity_type: null,
          from_entity_id: null,
          to_entity_type: null,
          to_entity_id: null,
          relationship_type: null,
          evidence_ref: null,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.related_party_edge_decision_request
               (decision_id, decision_type, target_related_party_edge_id, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,'remove',$2,$3,$4,'requested',$5,$6,$7)`,
            [decisionId, related_party_edge_id, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_remove_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "medium",
            action: "related_party_edge.remove_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, related_party_edge_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/related-party-edges/:related_party_edge_id/remove/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/related-party-edges/:related_party_edge_id/remove/apply",
    { preHandler: requireInternal, schema: { params: RelatedPartyEdgeIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { related_party_edge_id } = request.params as { related_party_edge_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<RelatedPartyEdgeDecisionRow>(
        getPool(),
        `SELECT decision_id, decision_type, target_related_party_edge_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, evidence_ref, requested_by, status
           FROM clt1.related_party_edge_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.decision_type !== "remove" || decisionRow.target_related_party_edge_id !== related_party_edge_id) {
        throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      const targetRows = await query<RelatedPartyEdgeRow>(getPool(), `SELECT * FROM clt1.related_party_edge WHERE related_party_edge_id = $1`, [related_party_edge_id]);
      const target = targetRows[0];
      if (!target) relatedPartyEdgeNotFound();
      validateRelatedPartyEdgeTransition(target.status, "remove");

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: REMOVE_ACTION, resource: "related_party_edge", entityId: related_party_edge_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: REMOVE_ACTION,
        resource: "related_party_edge",
        entityId: related_party_edge_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.related_party_edge_remove_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "high",
            action: "related_party_edge.remove_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (txClient) => {
          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.related_party_edge_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedTarget = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.related_party_edge WHERE related_party_edge_id = $1 FOR UPDATE`,
            [related_party_edge_id],
          );
          if (lockedTarget.rows[0]?.status !== "active") {
            return { kind: "raced", error: new Clt1Error("CLT1_RELATED_PARTY_EDGE_INVALID_STATE") };
          }

          await txClient.query(
            `UPDATE clt1.related_party_edge SET status = 'inactive', version = version + 1, updated_at_utc = now() WHERE related_party_edge_id = $1`,
            [related_party_edge_id],
          );
          await txClient.query(
            `UPDATE clt1.related_party_edge_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.related_party_edge_removed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "related_party_edge",
            entity_id: related_party_edge_id,
            severity: "high",
            action: "related_party_edge.remove",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id },
          });
          return { kind: "applied" };
        });
      } catch (err) {
        await recordFailureAudit();
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, related_party_edge_id, status: "inactive" }, meta(request)));
    },
  );
}
