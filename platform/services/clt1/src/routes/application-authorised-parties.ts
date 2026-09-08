/**
 * CLT-01 Phase 4A.2A — application-keyed pre-approval authorised-party capture.
 *
 * Closes the exact chronological inversion the Phase 4A.2 planning report identified: every
 * existing authorised-party route (`routes/authorised-parties.ts`) is client-keyed and gated on
 * `fetchActiveClientOrThrow` (`client_profile.status = 'active_limited'`), which only exists AFTER
 * final approval — unusable while the application is still `under_review`, the exact window this
 * module's own KYC-01 roster contract (Phase 4A) and roster-bound publication (KYC-01 Phase 4B)
 * need a populated roster in.
 *
 * The planning report's own decisive finding drives this file's shape: `clt1.authorised_party` and
 * `clt1.authorised_party_decision_request` were ALREADY application-scoped, not client-scoped —
 * neither table has ever had a `client_id` column. `client_id` was always only the EXISTING
 * routes' own lookup key, never a fact the underlying maker-checker/locking/audit logic needed.
 * This file therefore adds NO new business logic: every route below resolves `application_id`
 * directly (never through a `client_id`/`client_profile` lookup) and calls the EXACT SAME shared
 * service functions `routes/authorised-parties.ts`'s own client-keyed routes call
 * (`lib/authorised-party-service.ts`) — there is only one implementation of maker-checker request
 * creation, decision-token verification, apply-time payload-hash verification, advisory locking,
 * party INSERT/UPDATE/revoke, screening-result update, audit publication, and failure mapping.
 *
 * SCOPE, DELIBERATELY NARROW (Phase 4A.2A only):
 *   - `add`/`update`/`remove` (request + apply) and `screening-outcome` only. NO application-keyed
 *     `activate`/`restrict`/`reject`/`suspend` — those remain client-keyed-only, unchanged, in
 *     `routes/authorised-parties.ts`. Activation is a post-capture concern gated on screening/KYC
 *     outcomes; exposing it pre-approval would blur "a party is captured" with "a party is usable",
 *     which this phase deliberately keeps separate (see this phase's own implementation notes).
 *   - NO KYC-01 outbound call, NO roster-sync, NO CLT-to-KYC push client of any kind — Phase 4A.2B's
 *     job, not this file's.
 *   - NO new migration, NO new grant, NO new IAM-02 permission — the 8 existing
 *     `clt1.authorised_party.*` permissions already key on `resource='authorised_party'` + action
 *     with `entityId` already the application-scoped identifier the existing routes pass; changing
 *     the PATH key from `client_id` to `application_id` changes nothing the permission model reads.
 *
 * LIFECYCLE: permitted only while `client_application.status` is `draft`/`submitted`/`under_review`
 * (`lib/applications.ts`'s `authorised-party-capture` action; screening-outcome uses the narrower
 * `authorised-party-screening` action, `under_review` only — a screening result presupposes a party
 * already exists to screen). Refused as `CLT1_APPLICATION_INVALID_STATE` — genuinely an
 * application-lifecycle problem, not an authorised-party-state one. `held` is deliberately excluded:
 * no action anywhere in CLT-01 currently permits `held` as a FROM state (no resume/unhold
 * transition exists for ANY action yet), so `held` cannot be distinguished from a dead end here
 * without a separate lifecycle change — tracked as a carry-forward, not solved in this phase.
 *
 * SECURITY REMEDIATION (post-review): `fetchApplicationForPartyCaptureOrThrow` below is a
 * preflight fail-fast ONLY — it is NOT the authoritative lifecycle control. Every route that
 * mutates the roster (add/update/remove apply, screening-outcome) additionally passes
 * `PRE_APPROVAL_PARTY_STATUSES`/`PRE_APPROVAL_SCREENING_STATUSES` into the shared service, which
 * re-validates the SAME allowed-status list under a `client_application` row lock taken INSIDE the
 * mutation transaction, after `acquireKycRosterLock` — see `lib/authorised-party-service.ts`'s own
 * header comment for the full TOCTOU this closes (an independent Opus review empirically proved a
 * party could be inserted into an application that had already become `rejected`/`approved`
 * between this preflight and the transaction actually committing).
 *
 * NO ARTIFICIAL ROSTER FREEZE: Phase 4A.1's atomic-receipt hash comparison and KYC-01 Phase 4B's
 * delivery-time staleness checks already make concurrent roster mutation during `under_review` fail
 * closed (any change invalidates the roster hash, which forces republish) — this file adds no
 * additional locking beyond the SAME `acquireKycRosterLock` advisory lock the shared service layer
 * already takes.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { AUTHORISED_PARTY_TYPES, IDENTITY_VERIFICATION_STATUSES, SANCTIONS_PEP_STATUSES, safeAuthorisedPartyResponse, validateOwnershipPercentagePrecision } from "../lib/authorised-parties.js";
import {
  applyPartyAdd,
  applyPartyRemoval,
  applyPartyUpdate,
  fetchApplicationForPartyCaptureOrThrow,
  listAuthorisedPartiesForApplication,
  PRE_APPROVAL_PARTY_STATUSES,
  PRE_APPROVAL_SCREENING_STATUSES,
  recordPartyScreeningOutcome,
  requestPartyAdd,
  requestPartyRemoval,
  requestPartyUpdate,
} from "../lib/authorised-party-service.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ApplicationPartyIdParams = Type.Object(
  { application_id: Type.String({ minLength: 1, maxLength: 64 }), authorised_party_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);
const ListQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const PartyTypeSchema = Type.Union(AUTHORISED_PARTY_TYPES.map((t) => Type.Literal(t)));
// Precision enforcement lives in validateOwnershipPercentagePrecision (see
// routes/authorised-parties.ts's own header comment for why TypeBox's multipleOf is not used).
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

export async function registerApplicationAuthorisedPartyRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/add/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/add/request",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: AddRequestBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof AddRequestBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      if (body.ownership_percentage !== undefined) validateOwnershipPercentagePrecision(body.ownership_percentage);

      const result = await requestPartyAdd({
        applicationId: application_id,
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

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/add/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/add/apply",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      const result = await applyPartyAdd({
        applicationId: application_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: PRE_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, status: "applied", authorised_party_id: result.authorisedPartyId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/update/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/update/request",
    { preHandler: requireInternal, schema: { params: ApplicationPartyIdParams, body: UpdateRequestBody } },
    async (request, reply) => {
      const { application_id, authorised_party_id } = request.params as { application_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof UpdateRequestBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      if (body.ownership_percentage !== undefined) validateOwnershipPercentagePrecision(body.ownership_percentage);

      const result = await requestPartyUpdate({
        applicationId: application_id,
        authorisedPartyId: authorised_party_id,
        ownershipPercentage: body.ownership_percentage ?? null,
        secAuditRef: body.sec_audit_ref ?? null,
        requestedBy: body.requested_by,
        reason: body.reason ?? null,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, authorised_party_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/update/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/update/apply",
    { preHandler: requireInternal, schema: { params: ApplicationPartyIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { application_id, authorised_party_id } = request.params as { application_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      const result = await applyPartyUpdate({
        applicationId: application_id,
        authorisedPartyId: authorised_party_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: PRE_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, authorised_party_id, status: "applied" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/remove/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/remove/request",
    { preHandler: requireInternal, schema: { params: ApplicationPartyIdParams, body: RemoveRequestBody } },
    async (request, reply) => {
      const { application_id, authorised_party_id } = request.params as { application_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof RemoveRequestBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      const result = await requestPartyRemoval({
        applicationId: application_id,
        authorisedPartyId: authorised_party_id,
        requestedBy: body.requested_by,
        reason: body.reason ?? null,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, authorised_party_id, status: "requested", payload_hash: result.payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/remove/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/remove/apply",
    { preHandler: requireInternal, schema: { params: ApplicationPartyIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { application_id, authorised_party_id } = request.params as { application_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      const result = await applyPartyRemoval({
        applicationId: application_id,
        authorisedPartyId: authorised_party_id,
        decisionId: body.decision_id,
        approvalId: body.approval_id,
        decisionToken: body.decision_token,
        allowedApplicationStatuses: PRE_APPROVAL_PARTY_STATUSES,
        iam2: iam2Config(app),
      });

      return reply.send(successEnvelope({ decision_id: result.decisionId, application_id, authorised_party_id, status: "revoked" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/screening-outcome
  // Internal-identity-only — no IAM-02 permission check, mirrors the client-keyed sibling and
  // routes/outcomes.ts's cdd_outcome receipt exactly. Never activates the party (see file header).
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/authorised-parties/:authorised_party_id/screening-outcome",
    { preHandler: requireInternal, schema: { params: ApplicationPartyIdParams, body: ScreeningOutcomeBody } },
    async (request, reply) => {
      const { application_id, authorised_party_id } = request.params as { application_id: string; authorised_party_id: string };
      const body = request.body as Static<typeof ScreeningOutcomeBody>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-screening");

      // A malformed-body condition, not an authority_status transition problem — reuses the
      // shared foundation VALIDATION_ERROR, mirroring the client-keyed sibling route exactly.
      if (body.identity_verification_status === undefined && body.sanctions_pep_status === undefined) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "body", issue: "at least one of identity_verification_status or sanctions_pep_status is required" }],
        });
      }

      const row = await recordPartyScreeningOutcome({
        applicationId: application_id,
        authorisedPartyId: authorised_party_id,
        identityVerificationStatus: body.identity_verification_status ?? null,
        sanctionsPepStatus: body.sanctions_pep_status ?? null,
        secAuditRef: body.sec_audit_ref ?? null,
        sourceModule: body.source_module,
        createdBy: body.created_by,
        allowedApplicationStatuses: PRE_APPROVAL_SCREENING_STATUSES,
      });

      return reply.send(successEnvelope(safeAuthorisedPartyResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/applications/:application_id/authorised-parties
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/applications/:application_id/authorised-parties",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, querystring: ListQuery } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const { actor_id } = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();
      await fetchApplicationForPartyCaptureOrThrow(application_id, "authorised-party-capture");

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "clt1.authorised_party.read", resource: "authorised_party", entityId: application_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const rows = await listAuthorisedPartiesForApplication(application_id);

      return reply.send(successEnvelope({ application_id, authorised_parties: rows.map(safeAuthorisedPartyResponse) }, meta(request)));
    },
  );
}
