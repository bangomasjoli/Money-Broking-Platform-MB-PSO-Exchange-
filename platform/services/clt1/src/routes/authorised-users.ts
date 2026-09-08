/**
 * CLT-01 Phase 3 — authorised-user add/remove/suspend/reactivate + list routes (blueprint
 * `04_API_Specification.md` §4.1-§4.2 adapted to the approved Phase 3 scope — internal-only,
 * continuing the Phase 1/2 deviation from the blueprint's own literal public `/clt1/...` paths).
 *
 * `add`/`remove` are request/apply with mandatory IAM-02 execute-verify — blueprint Maker-Checker
 * Required item 5 verbatim ("Authorised user addition/removal"), byte-for-byte the same pattern
 * `routes/decisions.ts`'s `approve/request`+`approve/apply` established: `payload_hash` computed
 * over the decision-request row's own snapshotted fields at request time, recomputed from the
 * STORED row at apply time (never a re-submitted body); `execute-verify`'s `actor_id` bound to the
 * stored row's own `requested_by`, never a caller-supplied value; token-consumed-after-verify
 * discipline (a post-verify failure rolls the decision row back to `requested`, safely retriable,
 * plus a best-effort failure audit).
 *
 * `suspend`/`reactivate` are single-step, `checkPermission`-baseline-gated only — no blueprint
 * maker-checker requirement names either, and both are proportionate, reversible,
 * protective-control toggles (the same reasoning CFG-01 Phase 3B applied to kill-switch
 * activation vs. deactivation; Phase 2 applied to `reject`/`hold`).
 *
 * Every route requires the client to exist AND be `client_profile.status = 'active_limited'`
 * (approved Phase 3 precondition) — a rejected/held/nonexistent application never has a
 * `client_profile` row at all, so those cases surface as `CLT1_CLIENT_NOT_FOUND`.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  AUTHORISED_USER_ROLES,
  authorisedUserNotFound,
  isDuplicateActiveMembershipViolation,
  requireNotSelfAdd,
  safeAuthorisedUserResponse,
  validateAuthorisedUserTransition,
  type AuthorisedUserRole,
  type AuthorisedUserRow,
} from "../lib/authorised-users.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const AuthorisedUserIdParams = Type.Object(
  { client_id: Type.String({ minLength: 1, maxLength: 64 }), authorised_user_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);
const ListQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const RoleSchema = Type.Union(AUTHORISED_USER_ROLES.map((r) => Type.Literal(r)));

const AddRequestBody = Type.Object(
  {
    user_reference: Type.String({ minLength: 1, maxLength: 256 }),
    role: RoleSchema,
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
    // Authenticated Principal -> Client Membership Authority (frozen, load-bearing): OPTIONAL.
    // CLT legitimately governs declared signatories with no platform IAM account (migration
    // 023's own accepted `user_reference` semantics) — making this mandatory would silently
    // change that. Absent -> the resulting membership is UNBOUND and never resolves through the
    // authenticated-principal route. No regex/prefix validation, no IAM existence check, no IAM
    // dependency of any kind (frozen architecture).
    iam_user_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
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

const RemoveRequestBody = Type.Object(
  { requested_by: Type.String({ minLength: 1, maxLength: 64 }), reason: Type.Optional(Type.String({ maxLength: 128 })) },
  { additionalProperties: false },
);

const SuspendReactivateBody = Type.Object(
  { actor_id: Type.String({ minLength: 1, maxLength: 64 }), reason_code: Type.Optional(Type.String({ maxLength: 64 })) },
  { additionalProperties: false },
);

interface ClientProfileRow {
  client_id: string;
  status: string;
}

interface AuthorisedUserDecisionRow {
  decision_id: string;
  client_id: string;
  decision_type: "add" | "remove";
  target_authorised_user_id: string | null;
  user_reference: string | null;
  role: AuthorisedUserRole | null;
  requested_by: string;
  status: string;
  iam_user_id: string | null;
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

function addPayload(row: { decision_id: string; client_id: string; user_reference: string | null; role: string | null; requested_by: string; iam_user_id: string | null }): Record<string, unknown> {
  return { decision_id: row.decision_id, client_id: row.client_id, user_reference: row.user_reference, role: row.role, requested_by: row.requested_by, iam_user_id: row.iam_user_id };
}

function removePayload(row: { decision_id: string; client_id: string; target_authorised_user_id: string | null; requested_by: string }): Record<string, unknown> {
  return { decision_id: row.decision_id, client_id: row.client_id, target_authorised_user_id: row.target_authorised_user_id, requested_by: row.requested_by };
}

const ADD_ACTION = "clt1.authorised_user.add";
const REMOVE_ACTION = "clt1.authorised_user.remove";

export async function registerAuthorisedUserRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-users/add/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/add/request",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: AddRequestBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof AddRequestBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      requireNotSelfAdd(body.requested_by, body.user_reference);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: ADD_ACTION, resource: "authorised_user", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1aud_" + randomUUID();
      const iamUserId = body.iam_user_id ?? null;
      const payloadHash = fingerprint(addPayload({ decision_id: decisionId, client_id, user_reference: body.user_reference, role: body.role, requested_by: body.requested_by, iam_user_id: iamUserId }));

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.authorised_user_decision_request
               (decision_id, client_id, decision_type, user_reference, role, reason, requested_by, status, payload_hash, request_id, correlation_id, iam_user_id)
             VALUES ($1,$2,'add',$3,$4,$5,$6,'requested',$7,$8,$9,$10)`,
            [decisionId, client_id, body.user_reference, body.role, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id, iamUserId],
          );
          await publishAudit(client, {
            event_type: "clt1.authorised_user_add_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "medium",
            action: "authorised_user.add_request",
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
  // POST /internal/clt1/clients/:client_id/authorised-users/add/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/add/apply",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<AuthorisedUserDecisionRow>(
        getPool(),
        `SELECT decision_id, client_id, decision_type, target_authorised_user_id, user_reference, role, requested_by, status, iam_user_id
           FROM clt1.authorised_user_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.client_id !== client_id || decisionRow.decision_type !== "add") throw new Clt1Error("CLT1_AUTHORISED_USER_NOT_FOUND");
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: ADD_ACTION, resource: "authorised_user", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      // No DB lock held across this network call — see file header comment.
      const currentPayloadHash = fingerprint(addPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: ADD_ACTION,
        resource: "authorised_user",
        entityId: client_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      // From here on, IAM-02's decision token is CONSUMED — see routes/decisions.ts's own header
      // comment for why the decision-request row is deliberately NOT forced into a 'failed'
      // terminal status on a later failure.
      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.authorised_user_add_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: client_id,
            severity: "high",
            action: "authorised_user.add_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied"; authorisedUserId: string };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          const lockedDecision = await client.query<{ status: string }>(
            `SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1 FOR UPDATE`,
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

          const authorisedUserId = "clt1au_" + randomUUID();
          // May throw a 23505 unique-violation on idx_clt1_authorised_user_one_active_per_iam_client
          // (Authenticated Principal -> Client Membership Authority: at most one ACTIVE membership
          // per (iam_user_id, client_id)) — deliberately NOT caught here; the outer catch, after
          // withTransaction's own rollback, is the correct place to inspect and map it (same
          // discipline routes/related-party-edges.ts's own add/apply already established).
          await client.query(
            `INSERT INTO clt1.authorised_user (authorised_user_id, client_id, user_reference, role, status, requested_by, approval_id, iam_user_id)
             VALUES ($1,$2,$3,$4,'active',$5,$6,$7)`,
            [authorisedUserId, client_id, decisionRow.user_reference, decisionRow.role, decisionRow.requested_by, body.approval_id, decisionRow.iam_user_id],
          );
          await client.query(
            `UPDATE clt1.authorised_user_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(client, {
            event_type: "clt1.authorised_user_added",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorisedUserId,
            severity: "high",
            action: "authorised_user.add",
            result: "success",
            metadata: { decision_id: body.decision_id, client_id, approval_id: body.approval_id },
          });
          return { kind: "applied", authorisedUserId };
        });
      } catch (err) {
        await recordFailureAudit();
        if (isDuplicateActiveMembershipViolation(err)) throw new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE", { cause: err });
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, client_id, status: "applied", authorised_user_id: outcome.authorisedUserId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/remove/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/remove/request",
    { preHandler: requireInternal, schema: { params: AuthorisedUserIdParams, body: RemoveRequestBody } },
    async (request, reply) => {
      const { client_id, authorised_user_id } = request.params as { client_id: string; authorised_user_id: string };
      const body = request.body as Static<typeof RemoveRequestBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      const targetRows = await query<AuthorisedUserRow>(getPool(), `SELECT * FROM clt1.authorised_user WHERE authorised_user_id = $1 AND client_id = $2`, [authorised_user_id, client_id]);
      const target = targetRows[0];
      if (!target) authorisedUserNotFound();
      validateAuthorisedUserTransition(target.status, "remove");

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: REMOVE_ACTION, resource: "authorised_user", entityId: authorised_user_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1aud_" + randomUUID();
      const payloadHash = fingerprint(removePayload({ decision_id: decisionId, client_id, target_authorised_user_id: authorised_user_id, requested_by: body.requested_by }));

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.authorised_user_decision_request
               (decision_id, client_id, decision_type, target_authorised_user_id, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,'remove',$3,$4,$5,'requested',$6,$7,$8)`,
            [decisionId, client_id, authorised_user_id, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(client, {
            event_type: "clt1.authorised_user_remove_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorised_user_id,
            severity: "medium",
            action: "authorised_user.remove_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, client_id, authorised_user_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/remove/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/remove/apply",
    { preHandler: requireInternal, schema: { params: AuthorisedUserIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id, authorised_user_id } = request.params as { client_id: string; authorised_user_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<AuthorisedUserDecisionRow>(
        getPool(),
        `SELECT decision_id, client_id, decision_type, target_authorised_user_id, user_reference, role, requested_by, status, iam_user_id
           FROM clt1.authorised_user_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.client_id !== client_id || decisionRow.decision_type !== "remove" || decisionRow.target_authorised_user_id !== authorised_user_id) {
        throw new Clt1Error("CLT1_AUTHORISED_USER_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      await fetchActiveClientOrThrow(client_id);

      const targetRows = await query<AuthorisedUserRow>(getPool(), `SELECT * FROM clt1.authorised_user WHERE authorised_user_id = $1 AND client_id = $2`, [authorised_user_id, client_id]);
      const target = targetRows[0];
      if (!target) authorisedUserNotFound();
      validateAuthorisedUserTransition(target.status, "remove");

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: REMOVE_ACTION, resource: "authorised_user", entityId: authorised_user_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(removePayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: REMOVE_ACTION,
        resource: "authorised_user",
        entityId: authorised_user_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.authorised_user_remove_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorised_user_id,
            severity: "high",
            action: "authorised_user.remove_apply",
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
            `SELECT status FROM clt1.authorised_user_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedTarget = await client.query<{ status: string }>(
            `SELECT status FROM clt1.authorised_user WHERE authorised_user_id = $1 AND client_id = $2 FOR UPDATE`,
            [authorised_user_id, client_id],
          );
          const targetStatus = lockedTarget.rows[0]?.status;
          if (targetStatus !== "active" && targetStatus !== "suspended") {
            return { kind: "raced", error: new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE") };
          }

          // approval_id is NOT updated here — the grant deliberately scopes authorised_user's
          // UPDATE to status/version/updated_at_utc only; approval_id on this row represents the
          // ADD approval (set once at INSERT time) and is not overwritten on removal. The
          // removal's own approval reference is already captured on the
          // authorised_user_decision_request row itself.
          await client.query(
            `UPDATE clt1.authorised_user SET status = 'revoked', version = version + 1, updated_at_utc = now() WHERE authorised_user_id = $1`,
            [authorised_user_id],
          );
          await client.query(
            `UPDATE clt1.authorised_user_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(client, {
            event_type: "clt1.authorised_user_removed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorised_user_id,
            severity: "high",
            action: "authorised_user.remove",
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

      return reply.send(successEnvelope({ decision_id: body.decision_id, client_id, authorised_user_id, status: "revoked" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/suspend
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/suspend",
    { preHandler: requireInternal, schema: { params: AuthorisedUserIdParams, body: SuspendReactivateBody } },
    async (request, reply) => {
      const { client_id, authorised_user_id } = request.params as { client_id: string; authorised_user_id: string };
      const body = request.body as Static<typeof SuspendReactivateBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.actor_id, action: "clt1.authorised_user.suspend", resource: "authorised_user", entityId: authorised_user_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      let row: AuthorisedUserRow;
      try {
        row = await withTransaction(async (client) => {
          const rows = await query<AuthorisedUserRow>(
            client,
            `UPDATE clt1.authorised_user SET status = 'suspended', version = version + 1, updated_at_utc = now()
             WHERE authorised_user_id = $1 AND client_id = $2 AND status = 'active'
             RETURNING *`,
            [authorised_user_id, client_id],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE", { details: [{ field: "status", issue: "authorised user status changed concurrently or not found" }] });
          }
          await publishAudit(client, {
            event_type: "clt1.authorised_user_suspended",
            source_module: "CLT-01",
            actor_id: body.actor_id,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorised_user_id,
            severity: "medium",
            action: "authorised_user.suspend",
            result: "success",
            reason_code: body.reason_code,
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeAuthorisedUserResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/reactivate
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-users/:authorised_user_id/reactivate",
    { preHandler: requireInternal, schema: { params: AuthorisedUserIdParams, body: SuspendReactivateBody } },
    async (request, reply) => {
      const { client_id, authorised_user_id } = request.params as { client_id: string; authorised_user_id: string };
      const body = request.body as Static<typeof SuspendReactivateBody>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.actor_id, action: "clt1.authorised_user.reactivate", resource: "authorised_user", entityId: authorised_user_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      let row: AuthorisedUserRow;
      try {
        row = await withTransaction(async (client) => {
          // May throw a 23505 unique-violation on
          // idx_clt1_authorised_user_one_active_per_iam_client if another ACTIVE membership
          // already exists for the SAME (iam_user_id, client_id) — e.g. a new bound membership
          // (M2) was created while this one (M1, same iam_user_id + client_id) was suspended.
          // Deliberately NOT caught here; the outer catch is the correct place to inspect and map
          // it. This is intentional: the invariant is "at most one ACTIVE membership", never "one
          // historical lineage forever" — M1 remains suspended, M2 remains the sole active row.
          const rows = await query<AuthorisedUserRow>(
            client,
            `UPDATE clt1.authorised_user SET status = 'active', version = version + 1, updated_at_utc = now()
             WHERE authorised_user_id = $1 AND client_id = $2 AND status = 'suspended'
             RETURNING *`,
            [authorised_user_id, client_id],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE", { details: [{ field: "status", issue: "authorised user status changed concurrently or not found" }] });
          }
          await publishAudit(client, {
            event_type: "clt1.authorised_user_reactivated",
            source_module: "CLT-01",
            actor_id: body.actor_id,
            actor_type: "user",
            entity_type: "authorised_user",
            entity_id: authorised_user_id,
            severity: "medium",
            action: "authorised_user.reactivate",
            result: "success",
            reason_code: body.reason_code,
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        if (isDuplicateActiveMembershipViolation(err)) throw new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE", { cause: err });
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeAuthorisedUserResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/authorised-users
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/authorised-users",
    { preHandler: requireInternal, schema: { params: ClientIdParams, querystring: ListQuery } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const { actor_id } = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();
      await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "clt1.authorised_user.read", resource: "authorised_user", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const rows = await query<AuthorisedUserRow>(getPool(), `SELECT * FROM clt1.authorised_user WHERE client_id = $1 ORDER BY created_at_utc ASC`, [client_id]);

      return reply.send(successEnvelope({ client_id, authorised_users: rows.map(safeAuthorisedUserResponse) }, meta(request)));
    },
  );
}
