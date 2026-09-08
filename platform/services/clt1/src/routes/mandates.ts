/**
 * CLT-01 Phase 3 — client-mandate create/update + current-mandate read routes (blueprint
 * `04_API_Specification.md` §4.3-§4.4 adapted to the approved Phase 3 scope — internal-only).
 *
 * `create`/`update` are request/apply with mandatory IAM-02 execute-verify — blueprint
 * Maker-Checker Required item 6 verbatim ("Mandate creation/change"), the same pattern
 * `routes/authorised-users.ts`'s `add`/`remove` and `routes/decisions.ts`'s `approve` use.
 * "Activate" from the brief's own "create/update/activate" workflow is consolidated into
 * `create` — the `client_mandate` row never exists in a pre-active state (mirrors
 * `client_profile`'s own precedent: it is inserted directly at `status='active'` only by a
 * successful `create/apply`), so there is no separate activation step to build.
 *
 * The partial unique index `idx_clt1_client_mandate_one_active_per_client` (migration 023)
 * enforces at most one active mandate per client at the DB level — `create/apply` for a client
 * that already has one fails the index, not a race condition CLT-01 has to reason about
 * separately. Phase 9 (F1 closure): the violation is mapped to a real 409
 * `CLT1_MANDATE_ALREADY_ACTIVE`, not collapsed into the generic `CLT1_AUDIT_REQUIRED` (503) —
 * applying the exact `isDuplicateEdgeViolation` (Phase 5) / `isAlreadyOpenViolation` (Phase 6)
 * pattern a third time.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  MANDATE_TYPES,
  MandateRulesSchema,
  mandateNotFound,
  safeMandateResponse,
  validateMandateRules,
  type ClientMandateRow,
  type MandateRules,
  type MandateType,
} from "../lib/mandates.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const MandateIdParams = Type.Object(
  { client_id: Type.String({ minLength: 1, maxLength: 64 }), mandate_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);
const ReadQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const MandateTypeSchema = Type.Union(MANDATE_TYPES.map((t) => Type.Literal(t)));

const CreateRequestBody = Type.Object(
  {
    mandate_type: MandateTypeSchema,
    rules: MandateRulesSchema,
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const UpdateRequestBody = Type.Object(
  {
    mandate_type: Type.Optional(MandateTypeSchema),
    rules: MandateRulesSchema,
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
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

interface MandateDecisionRow {
  decision_id: string;
  client_id: string;
  decision_type: "create" | "update";
  target_mandate_id: string | null;
  mandate_type: MandateType | null;
  rules: MandateRules;
  mandate_schema_version: string;
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

async function fetchActiveClientOrThrow(clientId: string): Promise<ClientProfileRow> {
  const rows = await query<ClientProfileRow>(getPool(), `SELECT client_id, status FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
  const row = rows[0];
  if (!row) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
  if (row.status !== "active_limited") throw new Clt1Error("CLT1_CLIENT_NOT_ACTIVE");
  return row;
}

function decisionPayload(row: { decision_id: string; client_id: string; target_mandate_id: string | null; mandate_type: string | null; rules: unknown; requested_by: string }): Record<string, unknown> {
  return { decision_id: row.decision_id, client_id: row.client_id, target_mandate_id: row.target_mandate_id, mandate_type: row.mandate_type, rules: row.rules, requested_by: row.requested_by };
}

/** Detects the specific partial-unique-index violation this table can raise (migration 023's
 * `idx_clt1_client_mandate_one_active_per_client`) so it can be mapped to a real 409, not the
 * generic CLT1_AUDIT_REQUIRED (503) — Phase 9 F1 closure, same pattern
 * `related-party-edges.ts`'s `isDuplicateEdgeViolation` / `duplicate-candidates.ts`'s
 * `isAlreadyOpenViolation` already established. */
function isDuplicateActiveMandateViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_clt1_client_mandate_one_active_per_client";
}

const CREATE_ACTION = "clt1.client_mandate.create";
const UPDATE_ACTION = "clt1.client_mandate.update";

export async function registerMandateRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/mandates/create/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/mandates/create/request",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: CreateRequestBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof CreateRequestBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);
      validateMandateRules(body.rules);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: CREATE_ACTION, resource: "client_mandate", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1mdec_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({ decision_id: decisionId, client_id, target_mandate_id: null, mandate_type: body.mandate_type, rules: body.rules, requested_by: body.requested_by }),
      );

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.client_mandate_decision_request
               (decision_id, client_id, decision_type, mandate_type, rules, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,'create',$3,$4,$5,$6,'requested',$7,$8,$9)`,
            [decisionId, client_id, body.mandate_type, JSON.stringify(body.rules), body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(client, {
            event_type: "clt1.client_mandate_create_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "medium",
            action: "client_mandate.create_request",
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

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/mandates/create/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/mandates/create/apply",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<MandateDecisionRow>(
        getPool(),
        `SELECT decision_id, client_id, decision_type, target_mandate_id, mandate_type, rules, mandate_schema_version, requested_by, status
           FROM clt1.client_mandate_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.client_id !== client_id || decisionRow.decision_type !== "create") throw new Clt1Error("CLT1_MANDATE_NOT_FOUND");
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: CREATE_ACTION, resource: "client_mandate", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: CREATE_ACTION,
        resource: "client_mandate",
        entityId: client_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.client_mandate_create_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "high",
            action: "client_mandate.create_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied"; mandateId: string };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          const lockedDecision = await client.query<{ status: string }>(
            `SELECT status FROM clt1.client_mandate_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          // Plain SELECT, not FOR UPDATE — `SELECT ... FOR UPDATE` requires the UPDATE privilege
          // in Postgres even for a lock-only read, but role_clt1_runtime deliberately has no
          // UPDATE grant on client_profile (no Phase 1/2/3 route ever mutates it). A plain read
          // is sufficient here: no other transaction in this codebase ever writes
          // client_profile.status, so there is nothing to race against.
          const lockedClient = await client.query<ClientProfileRow>(`SELECT client_id, status FROM clt1.client_profile WHERE client_id = $1`, [client_id]);
          if (lockedClient.rows[0]?.status !== "active_limited") {
            return { kind: "raced", error: new Clt1Error("CLT1_CLIENT_NOT_ACTIVE") };
          }

          const mandateId = "clt1mnd_" + randomUUID();
          await client.query(
            `INSERT INTO clt1.client_mandate
               (mandate_id, client_id, mandate_type, rules, mandate_schema_version, status, effective_from_utc, requested_by, approval_id)
             VALUES ($1,$2,$3,$4,$5,'active', now(), $6,$7)`,
            [mandateId, client_id, decisionRow.mandate_type, JSON.stringify(decisionRow.rules), decisionRow.mandate_schema_version, decisionRow.requested_by, body.approval_id],
          );
          await client.query(
            `UPDATE clt1.client_mandate_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(client, {
            event_type: "clt1.client_mandate_created",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_mandate",
            entity_id: mandateId,
            severity: "high",
            action: "client_mandate.create",
            result: "success",
            metadata: { decision_id: body.decision_id, client_id, approval_id: body.approval_id },
          });
          return { kind: "applied", mandateId };
        });
      } catch (err) {
        await recordFailureAudit();
        // Phase 9 F1 closure: a unique-violation on the one-active-mandate-per-client partial
        // index is now mapped to a real 409 CLT1_MANDATE_ALREADY_ACTIVE, not the generic
        // CLT1_AUDIT_REQUIRED (503) — the decision row is left 'requested' either way, safely
        // retriable once the existing active mandate is no longer active.
        if (isDuplicateActiveMandateViolation(err)) throw new Clt1Error("CLT1_MANDATE_ALREADY_ACTIVE", { cause: err });
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, client_id, status: "applied", mandate_id: outcome.mandateId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/mandates/:mandate_id/update/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/mandates/:mandate_id/update/request",
    { preHandler: requireInternal, schema: { params: MandateIdParams, body: UpdateRequestBody } },
    async (request, reply) => {
      const { client_id, mandate_id } = request.params as { client_id: string; mandate_id: string };
      const body = request.body as Static<typeof UpdateRequestBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);
      validateMandateRules(body.rules);

      const currentRows = await query<ClientMandateRow>(getPool(), `SELECT * FROM clt1.client_mandate WHERE mandate_id = $1 AND client_id = $2`, [mandate_id, client_id]);
      const current = currentRows[0];
      if (!current) mandateNotFound();
      if (current.status !== "active") throw new Clt1Error("CLT1_MANDATE_INVALID_STATE", { details: [{ field: "status", issue: "only an active mandate can be updated" }] });

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: UPDATE_ACTION, resource: "client_mandate", entityId: mandate_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1mdec_" + randomUUID();
      const mandateType = body.mandate_type ?? current.mandate_type;
      const payloadHash = fingerprint(
        decisionPayload({ decision_id: decisionId, client_id, target_mandate_id: mandate_id, mandate_type: mandateType, rules: body.rules, requested_by: body.requested_by }),
      );

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.client_mandate_decision_request
               (decision_id, client_id, decision_type, target_mandate_id, mandate_type, rules, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,'update',$3,$4,$5,$6,$7,'requested',$8,$9,$10)`,
            [decisionId, client_id, mandate_id, mandateType, JSON.stringify(body.rules), body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(client, {
            event_type: "clt1.client_mandate_update_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "client_mandate",
            entity_id: mandate_id,
            severity: "medium",
            action: "client_mandate.update_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, client_id, mandate_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/mandates/:mandate_id/update/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/mandates/:mandate_id/update/apply",
    { preHandler: requireInternal, schema: { params: MandateIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id, mandate_id } = request.params as { client_id: string; mandate_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<MandateDecisionRow>(
        getPool(),
        `SELECT decision_id, client_id, decision_type, target_mandate_id, mandate_type, rules, mandate_schema_version, requested_by, status
           FROM clt1.client_mandate_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.client_id !== client_id || decisionRow.decision_type !== "update" || decisionRow.target_mandate_id !== mandate_id) {
        throw new Clt1Error("CLT1_MANDATE_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: UPDATE_ACTION, resource: "client_mandate", entityId: mandate_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: UPDATE_ACTION,
        resource: "client_mandate",
        entityId: mandate_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.client_mandate_update_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_mandate",
            entity_id: mandate_id,
            severity: "high",
            action: "client_mandate.update_apply",
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
        outcome = await withTransaction(async (client) => {
          const lockedDecision = await client.query<{ status: string }>(
            `SELECT status FROM clt1.client_mandate_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedMandate = await client.query<{ status: string }>(`SELECT status FROM clt1.client_mandate WHERE mandate_id = $1 AND client_id = $2 FOR UPDATE`, [mandate_id, client_id]);
          if (lockedMandate.rows[0]?.status !== "active") {
            return { kind: "raced", error: new Clt1Error("CLT1_MANDATE_INVALID_STATE") };
          }

          await client.query(
            `UPDATE clt1.client_mandate SET
               mandate_type = $2, rules = $3, mandate_schema_version = $4, approval_id = $5,
               version = version + 1, updated_at_utc = now()
             WHERE mandate_id = $1`,
            [mandate_id, decisionRow.mandate_type, JSON.stringify(decisionRow.rules), decisionRow.mandate_schema_version, body.approval_id],
          );
          await client.query(
            `UPDATE clt1.client_mandate_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(client, {
            event_type: "clt1.client_mandate_changed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_mandate",
            entity_id: mandate_id,
            severity: "high",
            action: "client_mandate.update",
            result: "success",
            metadata: { decision_id: body.decision_id, client_id, approval_id: body.approval_id },
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

      return reply.send(successEnvelope({ decision_id: body.decision_id, client_id, mandate_id, status: "active" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/mandates/current
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/mandates/current",
    { preHandler: requireInternal, schema: { params: ClientIdParams, querystring: ReadQuery } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const { actor_id } = request.query as Static<typeof ReadQuery>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "clt1.client_mandate.read", resource: "client_mandate", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const rows = await query<ClientMandateRow>(getPool(), `SELECT * FROM clt1.client_mandate WHERE client_id = $1 AND status = 'active'`, [client_id]);
      const row = rows[0];
      if (!row) mandateNotFound();

      return reply.send(successEnvelope(safeMandateResponse(row), meta(request)));
    },
  );
}
