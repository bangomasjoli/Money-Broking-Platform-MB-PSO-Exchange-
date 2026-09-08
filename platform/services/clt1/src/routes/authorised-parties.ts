/**
 * CLT-01 Phase 4 — authorised-party add/update/remove/activate/restrict/reject/suspend + list +
 * screening-outcome routes (blueprint `04_API_Specification.md` §6.1-§6.2 adapted to the
 * approved Phase 4 scope — internal-only, continuing the Phase 1-3 deviation from the blueprint's
 * own literal public `/clt1/...` paths).
 *
 * `add`/`update`/`remove`/`activate` are request/apply with mandatory IAM-02 execute-verify —
 * the same pattern `routes/authorised-users.ts`'s `add`/`remove` and `routes/mandates.ts`'s
 * `create`/`update` use: `payload_hash` computed over the decision-request row's own snapshotted
 * fields at request time, recomputed from the STORED row at apply time (never a re-submitted
 * body); `execute-verify`'s `actor_id` bound to the stored row's own `requested_by`, never a
 * caller-supplied value; token-consumed-after-verify discipline. No blueprint "Maker-Checker
 * Required" item names authorised_party directly — this is a documented, reasoned extension of
 * the same abuse-prone-in-both-directions reasoning Phase 3 applied to `authorised_user.remove`.
 *
 * `restrict`/`reject`/`suspend` are single-step, `checkPermission`-baseline-gated only — no
 * reactivation path exists (approved design decision; the blueprint's own state diagram draws no
 * arrow back to `active`/`pending` from any of these).
 *
 * Every mutating route requires the client to exist AND be `client_profile.status =
 * 'active_limited'` (same Phase 3 precondition) — the stored `authorised_party` row is
 * APPLICATION-scoped (see lib/authorised-parties.ts header comment), not client-scoped: every
 * route resolves `client_id -> client_profile.application_id` before touching
 * `clt1.authorised_party`, but the table itself carries no `client_id` column.
 *
 * `ownership_percentage` (a `numeric` column) is deliberately stringified before it ever enters
 * a payload-hash computation — node-postgres returns `numeric` columns as strings (never JS
 * numbers, to avoid float-precision loss), so a request-time hash computed over a JS number and
 * an apply-time hash recomputed from the same value read back as a string would silently diverge
 * and produce a permanent payload_hash mismatch on every single request carrying this field. Both
 * `decisionPayload()` and the INSERT/UPDATE call sites normalise to `String(...)` up front so the
 * hash is stable across the request -> stored-row -> apply round trip. `add`/`update`'s request
 * handlers additionally call `validateOwnershipPercentagePrecision` (Opus Phase 4 review L1) —
 * without it, a schema-valid sub-hundredths value (e.g. `0.0000001`) renders via JS's own
 * `String(...)` as exponential notation (`"1e-7"`), which Postgres's `numeric` column does NOT
 * preserve on round-trip (it re-renders in plain decimal form), silently diverging the
 * request-time and apply-time hashes and permanently failing `apply` with a misleading
 * `CLT1_APPROVAL_REQUIRED`. Rejecting excess precision outright (400 `VALIDATION_ERROR`) closes
 * this at the boundary without ever silently rounding a caller-submitted value — enforced as a
 * pure-function check, not TypeBox's `multipleOf` keyword, which was tried first and found
 * unreliable for decimal step values (see the function's own doc comment in
 * lib/authorised-parties.ts for the empirical proof).
 *
 * `update/apply`'s `ownership_percentage`/`sec_audit_ref` UPDATE uses `COALESCE(...)` against the
 * live row (Opus Phase 4 review M1) — an omitted field in `update/request` must preserve the
 * existing value, not silently null it; this mirrors the screening-outcome route's own COALESCE
 * handling of `sec_audit_ref`, which the unconditional-overwrite version below it inconsistently
 * did not follow.
 *
 * Screening-outcome receipt is internal-identity-only, no IAM-02 permission check — mirrors
 * `routes/outcomes.ts`'s `cdd_outcome` receipt exactly: service-to-service ingestion, not a
 * human-permission-checked action. No external screening call of any kind.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.1 — every transaction in this file that can change `authorised_party` membership,
 * `party_type`, `authority_status`, or `version` (every field the Phase 4A roster contract's
 * `roster_hash` is computed over) now acquires `lib/kyc-roster.ts`'s shared application-scoped
 * advisory lock (`acquireKycRosterLock`) as its OWN FIRST STATEMENT — before the existing
 * `SELECT ... FOR UPDATE` row locks, before any INSERT/UPDATE. This is what makes
 * `routes/outcomes.ts`'s `kyc_kyb` receipt (and `routes/decisions.ts`'s `approve/apply` roster
 * recheck) able to treat a roster it reads under the SAME lock as genuinely current — see
 * lib/kyc-roster.ts's own header comment for the full ordering/deadlock-freedom argument. `client.
 * application_id` is always already resolved (via `fetchActiveClientOrThrow`) BEFORE the
 * transaction opens in every route below, so the lock key is always known before `withTransaction`
 * is ever called — no route here needs a separate read-only preflight for this purpose.
 *
 * `restrict`/`reject`/`suspend` (via `registerSingleStepTransition`, one shared function
 * registering three routes) and the screening-outcome receipt are included: none of them looks
 * like a "roster mutation" from its own name, but `restrict`/`reject`/`suspend` change
 * `authority_status` and screening-outcome bumps `version` — both are hashed fields.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { acquireKycRosterLock } from "../lib/kyc-roster.js";
import {
  AUTHORISED_PARTY_TYPES,
  IDENTITY_VERIFICATION_STATUSES,
  SANCTIONS_PEP_STATUSES,
  authorisedPartyNotFound,
  requireScreeningPassForActivation,
  safeAuthorisedPartyResponse,
  validateAuthorisedPartyTransition,
  validateOwnershipPercentagePrecision,
  type AuthorisedPartyRow,
  type AuthorisedPartyType,
} from "../lib/authorised-parties.js";
import {
  applyPartyAdd,
  applyPartyRemoval,
  applyPartyUpdate,
  listAuthorisedPartiesForApplication,
  POST_APPROVAL_PARTY_STATUSES,
  recordPartyScreeningOutcome,
  requestPartyAdd,
  requestPartyRemoval,
  requestPartyUpdate,
} from "../lib/authorised-party-service.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const AuthorisedPartyIdParams = Type.Object(
  { client_id: Type.String({ minLength: 1, maxLength: 64 }), authorised_party_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);
const ListQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const PartyTypeSchema = Type.Union(AUTHORISED_PARTY_TYPES.map((t) => Type.Literal(t)));

// Precision (Opus Phase 4 review L1) is enforced by `validateOwnershipPercentagePrecision`
// (lib/authorised-parties.ts) at each request handler, NOT by TypeBox's `multipleOf` keyword —
// `multipleOf` was tried first and found unreliable (it rejects ordinary values, including whole
// integers, due to `0.01` having no exact binary floating-point representation; see that
// function's own doc comment for the empirical proof). `minimum`/`maximum` stay as TypeBox
// constraints since simple comparisons don't share that failure mode.
const OwnershipPercentageSchema = Type.Optional(Type.Number({ minimum: 0, maximum: 100 }));

const AddRequestBody = Type.Object(
  {
    party_type: PartyTypeSchema,
    party_reference: Type.String({ minLength: 1, maxLength: 256 }),
    ownership_percentage: OwnershipPercentageSchema,
    sec_audit_ref: Type.Optional(Type.String({ maxLength: 256 })),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const UpdateRequestBody = Type.Object(
  {
    ownership_percentage: OwnershipPercentageSchema,
    sec_audit_ref: Type.Optional(Type.String({ maxLength: 256 })),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const RemoveActivateRequestBody = Type.Object(
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

const RestrictRejectSuspendBody = Type.Object(
  { actor_id: Type.String({ minLength: 1, maxLength: 64 }), reason_code: Type.Optional(Type.String({ maxLength: 64 })) },
  { additionalProperties: false },
);

const IdentityStatusSchema = Type.Union(IDENTITY_VERIFICATION_STATUSES.map((s) => Type.Literal(s)));
const SanctionsStatusSchema = Type.Union(SANCTIONS_PEP_STATUSES.map((s) => Type.Literal(s)));

const ScreeningOutcomeBody = Type.Object(
  {
    identity_verification_status: Type.Optional(IdentityStatusSchema),
    sanctions_pep_status: Type.Optional(SanctionsStatusSchema),
    sec_audit_ref: Type.Optional(Type.String({ maxLength: 256 })),
    source_module: Type.String({ minLength: 1, maxLength: 32 }),
    created_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

interface ClientProfileRow {
  client_id: string;
  status: string;
  application_id: string;
}

interface AuthorisedPartyDecisionRow {
  decision_id: string;
  application_id: string;
  decision_type: "add" | "update" | "remove" | "activate";
  target_authorised_party_id: string | null;
  party_type: AuthorisedPartyType | null;
  party_reference: string | null;
  ownership_percentage: string | null;
  sec_audit_ref: string | null;
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
  const rows = await query<ClientProfileRow>(getPool(), `SELECT client_id, status, application_id FROM clt1.client_profile WHERE client_id = $1`, [clientId]);
  const row = rows[0];
  if (!row) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
  if (row.status !== "active_limited") throw new Clt1Error("CLT1_CLIENT_NOT_ACTIVE");
  return row;
}

/** P-ROSTER's own query — selects ONLY `authorised_party_id` for `authority_status = 'active'` rows,
 * never the full row. Data minimization is enforced at the SQL projection itself, not merely by
 * response-shape stripping, so no PII-bearing column can ever reach this route's response by
 * accident. Deterministic order (`created_at_utc ASC`) matches `listAuthorisedPartiesForApplication`'s
 * own existing convention — no new ordering semantics invented. */
async function listActiveAuthorisedPartyRefs(applicationId: string): Promise<string[]> {
  const rows = await query<{ authorised_party_id: string }>(
    getPool(),
    `SELECT authorised_party_id FROM clt1.authorised_party WHERE application_id = $1 AND authority_status = 'active' ORDER BY created_at_utc ASC`,
    [applicationId],
  );
  return rows.map((r) => r.authorised_party_id);
}

/** Normalises `ownership_percentage` to a string (or null) BEFORE it ever enters a payload-hash
 * computation — see file header comment for why this is required, not cosmetic. */
function normaliseOwnership(value: number | string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function decisionPayload(row: {
  decision_id: string;
  application_id: string;
  decision_type: string;
  target_authorised_party_id: string | null;
  party_type: string | null;
  party_reference: string | null;
  ownership_percentage: string | number | null;
  sec_audit_ref: string | null;
  requested_by: string;
}): Record<string, unknown> {
  return {
    decision_id: row.decision_id,
    application_id: row.application_id,
    decision_type: row.decision_type,
    target_authorised_party_id: row.target_authorised_party_id,
    party_type: row.party_type,
    party_reference: row.party_reference,
    ownership_percentage: normaliseOwnership(row.ownership_percentage),
    sec_audit_ref: row.sec_audit_ref,
    requested_by: row.requested_by,
  };
}

const ADD_ACTION = "clt1.authorised_party.add";
const UPDATE_ACTION = "clt1.authorised_party.update";
const REMOVE_ACTION = "clt1.authorised_party.remove";
const ACTIVATE_ACTION = "clt1.authorised_party.activate";

export async function registerAuthorisedPartyRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/add/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/add/request",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: AddRequestBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof AddRequestBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      if (body.ownership_percentage !== undefined) validateOwnershipPercentagePrecision(body.ownership_percentage);

      const result = await requestPartyAdd({
        applicationId: client.application_id,
        partyType: body.party_type,
        partyReference: body.party_reference,
        ownershipPercentage: body.ownership_percentage ?? null,
        secAuditRef: body.sec_audit_ref ?? null,
        requestedBy: body.requested_by,
        reason: body.reason ?? null,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/add/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/add/apply",
    { preHandler: requireInternal, schema: { params: ClientIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const result = await applyPartyAdd({
        applicationId: client.application_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: POST_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, status: "applied", authorised_party_id: result.authorisedPartyId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/update/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/update/request",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: UpdateRequestBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof UpdateRequestBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      if (body.ownership_percentage !== undefined) validateOwnershipPercentagePrecision(body.ownership_percentage);

      const result = await requestPartyUpdate({
        applicationId: client.application_id,
        authorisedPartyId: authorised_party_id,
        ownershipPercentage: body.ownership_percentage ?? null,
        secAuditRef: body.sec_audit_ref ?? null,
        requestedBy: body.requested_by,
        reason: body.reason ?? null,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, authorised_party_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/update/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/update/apply",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const result = await applyPartyUpdate({
        applicationId: client.application_id,
        authorisedPartyId: authorised_party_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: POST_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, authorised_party_id, status: "applied" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/remove/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/remove/request",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: RemoveActivateRequestBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof RemoveActivateRequestBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const result = await requestPartyRemoval({
        applicationId: client.application_id,
        authorisedPartyId: authorised_party_id,
        requestedBy: body.requested_by,
        reason: body.reason ?? null,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, authorised_party_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/remove/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/remove/apply",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const result = await applyPartyRemoval({
        applicationId: client.application_id,
        authorisedPartyId: authorised_party_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: POST_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, client_id, authorised_party_id, status: "revoked" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/request",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: RemoveActivateRequestBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof RemoveActivateRequestBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [authorised_party_id, client.application_id]);
      const target = targetRows[0];
      if (!target) authorisedPartyNotFound();
      validateAuthorisedPartyTransition(target.authority_status, "activate");
      // Screening gate is checked again, defensively, inside the locked apply transaction below
      // (the row could be screened differently between request and apply) — this pre-check exists
      // only to fail fast and avoid wasting an approval cycle on a request that can never apply.
      requireScreeningPassForActivation(target.identity_verification_status, target.sanctions_pep_status);

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: ACTIVATE_ACTION, resource: "authorised_party", entityId: authorised_party_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1apd_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          application_id: client.application_id,
          decision_type: "activate",
          target_authorised_party_id: authorised_party_id,
          party_type: null,
          party_reference: null,
          ownership_percentage: null,
          sec_audit_ref: null,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.authorised_party_decision_request
               (decision_id, application_id, decision_type, target_authorised_party_id, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,'activate',$3,$4,$5,'requested',$6,$7,$8)`,
            [decisionId, client.application_id, authorised_party_id, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(txClient, {
            event_type: "clt1.authorised_party_activate_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "authorised_party",
            entity_id: authorised_party_id,
            severity: "medium",
            action: "authorised_party.activate_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, client_id, authorised_party_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/activate/apply",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);
      const client = await fetchActiveClientOrThrow(client_id);

      const decisionRows = await query<AuthorisedPartyDecisionRow>(
        getPool(),
        `SELECT decision_id, application_id, decision_type, target_authorised_party_id, party_type, party_reference, ownership_percentage, sec_audit_ref, requested_by, status
           FROM clt1.authorised_party_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.application_id !== client.application_id || decisionRow.decision_type !== "activate" || decisionRow.target_authorised_party_id !== authorised_party_id) {
        throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [authorised_party_id, client.application_id]);
      const target = targetRows[0];
      if (!target) authorisedPartyNotFound();
      validateAuthorisedPartyTransition(target.authority_status, "activate");
      requireScreeningPassForActivation(target.identity_verification_status, target.sanctions_pep_status);

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: ACTIVATE_ACTION, resource: "authorised_party", entityId: authorised_party_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: ACTIVATE_ACTION,
        resource: "authorised_party",
        entityId: authorised_party_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.authorised_party_activate_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "authorised_party",
            entity_id: authorised_party_id,
            severity: "high",
            action: "authorised_party.activate_apply",
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
          await acquireKycRosterLock(txClient, client.application_id);

          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedTarget = await txClient.query<{ authority_status: string; identity_verification_status: string; sanctions_pep_status: string }>(
            `SELECT authority_status, identity_verification_status, sanctions_pep_status FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2 FOR UPDATE`,
            [authorised_party_id, client.application_id],
          );
          const lockedRow = lockedTarget.rows[0];
          if (!lockedRow || lockedRow.authority_status !== "pending") {
            return { kind: "raced", error: new Clt1Error("CLT1_AUTHORISED_PARTY_INVALID_STATE") };
          }
          // Re-checked here, inside the lock, defensively — see routes' own header comment on why
          // the request-time check alone is not sufficient (screening can change between request
          // and apply).
          try {
            requireScreeningPassForActivation(lockedRow.identity_verification_status as never, lockedRow.sanctions_pep_status as never);
          } catch (err) {
            return { kind: "raced", error: err as Clt1Error };
          }

          await txClient.query(
            `UPDATE clt1.authorised_party SET authority_status = 'active', approval_id = $2, version = version + 1, updated_at_utc = now() WHERE authorised_party_id = $1`,
            [authorised_party_id, body.approval_id],
          );
          await txClient.query(
            `UPDATE clt1.authorised_party_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.authorised_party_activated",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "authorised_party",
            entity_id: authorised_party_id,
            severity: "high",
            action: "authorised_party.activate",
            result: "success",
            metadata: { decision_id: body.decision_id, application_id: client.application_id, approval_id: body.approval_id },
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

      return reply.send(successEnvelope({ decision_id: body.decision_id, client_id, authorised_party_id, status: "active" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/restrict
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/reject
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/suspend
  //
  // `fromStatus`/`toStatus` are bound as query parameters ($3/$4), not interpolated into the SQL
  // string (Opus Phase 4 review L2) — both are TypeScript literal-union-typed and supplied only by
  // the three hardcoded call sites below, so the prior interpolated form was never exploitable,
  // but parameterizing keeps every query in this file uniformly bound, removing the one template
  // a future edit could otherwise silently turn into a real injection path.
  // -------------------------------------------------------------------------------------------
  function registerSingleStepTransition(pathSegment: "restrict" | "reject" | "suspend", action: string, fromStatus: "pending" | "active", toStatus: "restricted" | "rejected" | "suspended", eventType: string): void {
    app.post(
      `/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/${pathSegment}`,
      { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: RestrictRejectSuspendBody } },
      async (request, reply) => {
        const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
        const body = request.body as Static<typeof RestrictRejectSuspendBody>;
        assertPoolAvailable();
        const client = await fetchActiveClientOrThrow(client_id);

        const baseline = await checkPermission(iam2Config(app), { actorId: body.actor_id, action, resource: "authorised_party", entityId: authorised_party_id });
        if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

        let row: AuthorisedPartyRow;
        try {
          row = await withTransaction(async (txClient) => {
            await acquireKycRosterLock(txClient, client.application_id);

            const rows = await query<AuthorisedPartyRow>(
              txClient,
              `UPDATE clt1.authorised_party SET authority_status = $3, version = version + 1, updated_at_utc = now()
               WHERE authorised_party_id = $1 AND application_id = $2 AND authority_status = $4
               RETURNING *`,
              [authorised_party_id, client.application_id, toStatus, fromStatus],
            );
            if (rows.length === 0) {
              throw new Clt1Error("CLT1_AUTHORISED_PARTY_INVALID_STATE", { details: [{ field: "authority_status", issue: "authorised party status changed concurrently or not found" }] });
            }
            await publishAudit(txClient, {
              event_type: eventType,
              source_module: "CLT-01",
              actor_id: body.actor_id,
              actor_type: "user",
              entity_type: "authorised_party",
              entity_id: authorised_party_id,
              severity: "medium",
              action: `authorised_party.${pathSegment}`,
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

        return reply.send(successEnvelope(safeAuthorisedPartyResponse(row), meta(request)));
      },
    );
  }

  registerSingleStepTransition("restrict", "clt1.authorised_party.restrict", "pending", "restricted", "clt1.authorised_party_restricted");
  registerSingleStepTransition("reject", "clt1.authorised_party.reject", "pending", "rejected", "clt1.authorised_party_rejected");
  registerSingleStepTransition("suspend", "clt1.authorised_party.suspend", "active", "suspended", "clt1.authorised_party_suspended");

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/screening-outcome
  // Internal-identity-only — no IAM-02 permission check, mirrors routes/outcomes.ts's cdd_outcome
  // receipt exactly. No external screening call of any kind.
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/screening-outcome",
    { preHandler: requireInternal, schema: { params: AuthorisedPartyIdParams, body: ScreeningOutcomeBody } },
    async (request, reply) => {
      const { client_id, authorised_party_id } = request.params as { client_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ScreeningOutcomeBody>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      // A malformed-body condition, not an authority_status transition problem — reuses the
      // shared foundation VALIDATION_ERROR (same discipline lib/mandates.ts's validateMandateRules
      // already established), not CLT1_AUTHORISED_PARTY_INVALID_STATE (which errors.ts documents
      // as specifically an authority_status transition code).
      if (body.identity_verification_status === undefined && body.sanctions_pep_status === undefined) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "body", issue: "at least one of identity_verification_status or sanctions_pep_status is required" }],
        });
      }

      const row = await recordPartyScreeningOutcome({
        applicationId: client.application_id,
        authorisedPartyId: authorised_party_id,
        identityVerificationStatus: body.identity_verification_status ?? null,
        sanctionsPepStatus: body.sanctions_pep_status ?? null,
        secAuditRef: body.sec_audit_ref ?? null,
        sourceModule: body.source_module,
        createdBy: body.created_by,
        allowedApplicationStatuses: POST_APPROVAL_PARTY_STATUSES,
      });

      return reply.send(successEnvelope(safeAuthorisedPartyResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/authorised-parties
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/authorised-parties",
    { preHandler: requireInternal, schema: { params: ClientIdParams, querystring: ListQuery } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const { actor_id } = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "clt1.authorised_party.read", resource: "authorised_party", entityId: client.application_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const rows = await listAuthorisedPartiesForApplication(client.application_id);

      return reply.send(successEnvelope({ client_id, authorised_parties: rows.map(safeAuthorisedPartyResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/authorised-parties/active-refs
  //
  // P-ROSTER (WLT-01 Phase 4A prerequisite, per the Opus architecture freeze): a machine-to-machine
  // reference seam so WLT-01's future evaluate-use can obtain the authorised_party_id values AML-01
  // Phase 3E requires as `subject_refs[].subject_ref`. Deliberately NOT the human list route above:
  // no `actor_id`, no `checkPermission` IAM-02 call — this returns bare identifiers only, never the
  // PII-bearing `safeAuthorisedPartyResponse` shape, so there is nothing here for a human-permission
  // gate to protect. Internal-service-token auth only, same as every other CLT-01 machine seam
  // (e.g. `kyc-roster`).
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/authorised-parties/active-refs",
    { preHandler: requireInternal, schema: { params: ClientIdParams } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      assertPoolAvailable();
      const client = await fetchActiveClientOrThrow(client_id);

      const authorisedPartyRefs = await listActiveAuthorisedPartyRefs(client.application_id);

      return reply.send(successEnvelope({ client_id, authorised_party_refs: authorisedPartyRefs }, meta(request)));
    },
  );
}
