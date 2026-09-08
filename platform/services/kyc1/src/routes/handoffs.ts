/**
 * KYC-01 Phase 1 — case creation from CLT-01 handoff (WF-KYC01-01). `POST /internal/kyc1/handoffs`
 * is called externally by an operator/orchestrator (there is no service-to-service event bus in
 * this codebase — mirrors AML-01's own screening-request creation and CLT-01's own
 * `POST .../handoff/kyc-kyb` trigger route, both externally invoked). No CLT-01 HTTP call is made
 * this phase — `application_id`/`client_id`/`party_id` are opaque, unverified caller-supplied
 * references (approved Phase 1 design decision, mirrors AML-01 Phase 1's own `subject_ref`
 * posture — see migration 042's own header comment).
 *
 * Creates the case AND its deterministic default checklist (`DEFAULT_CHECKLIST_BY_CASE_TYPE`) in
 * the SAME transaction, then publishes `kyc1.handoff_received` and `kyc1.case_created` — two
 * distinct events for two distinct facts ("a handoff arrived" vs "a case now exists"), mirroring
 * the blueprint's own WF-KYC01-01 step list. Duplicate-active-case prevention: migration 042's own
 * partial unique index is the race-safe backstop, mapped to `KYC1_CASE_ALREADY_EXISTS`.
 *
 * PHASE 4A.2B — the actual case INSERT + checklist creation + `kyc1.case_created` audit is now the
 * SHARED `lib/kyc-case-creation.ts`'s `createKycCaseWithChecklist`, the same function
 * `routes/roster-sync.ts` calls for a CLT-01-roster-driven `authorised_party` case. This route
 * still generates `caseId` itself and still publishes `kyc1.handoff_received` FIRST, in the SAME
 * transaction, BEFORE calling the shared function — a behaviour-preserving refactor: the exact
 * request/response/error/audit-ordering contract below is unchanged from Phase 1.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { KYC_CASE_TYPES, isDuplicateActiveCaseViolation, safeChecklistItemResponse, safeKycCaseResponse, type ChecklistItemRow, type KycCaseRow } from "../lib/kyc-case.js";
import { createKycCaseWithChecklist } from "../lib/kyc-case-creation.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseTypeSchema = Type.Union(KYC_CASE_TYPES.map((t) => Type.Literal(t)));

const CreateHandoffBody = Type.Object(
  {
    application_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    party_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    case_type: CaseTypeSchema,
    created_from_handoff_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false },
);

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function registerHandoffRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  app.post(
    "/internal/kyc1/handoffs",
    { preHandler: requireInternal, schema: { body: CreateHandoffBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof CreateHandoffBody>;
      assertPoolAvailable();

      if (body.case_type === "authorised_party" && !body.party_id) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "party_id", issue: "required when case_type is 'authorised_party'" }],
        });
      }

      const caseId = "kyc1case_" + randomUUID();
      const actorId = request.ctx.actor_id ?? "kyc1_internal_service";

      let caseRow: KycCaseRow;
      let checklistRows: ChecklistItemRow[];
      try {
        const result = await withTransaction(async (client) => {
          // kyc1.handoff_received is published FIRST, in this SAME transaction, BEFORE the shared
          // case-creation call — preserves the exact Phase 1 audit ordering. The shared function
          // (lib/kyc-case-creation.ts) publishes ONLY kyc1.case_created; it never publishes this
          // event (see that file's own header comment — a handoff is this route's own fact, never
          // roster-sync's).
          await publishAudit(client, {
            event_type: "kyc1.handoff_received",
            source_module: "KYC-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "kyc_case",
            entity_id: caseId,
            severity: "medium",
            action: "kyc_case.handoff_received",
            result: "success",
            metadata: { case_id: caseId, application_id: body.application_id, case_type: body.case_type },
          });

          return createKycCaseWithChecklist(client, {
            caseId,
            applicationId: body.application_id,
            caseType: body.case_type,
            clientId: body.client_id ?? null,
            partyId: body.party_id ?? null,
            createdFromHandoffId: body.created_from_handoff_id ?? null,
            requestId: request.ctx.request_id ?? null,
            correlationId: request.ctx.correlation_id ?? null,
            actorId,
          });
        });
        caseRow = result.caseRow;
        checklistRows = result.checklistRows;
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        if (isDuplicateActiveCaseViolation(err)) throw new Kyc1Error("KYC1_CASE_ALREADY_EXISTS", { cause: err });
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(
        successEnvelope(
          { ...safeKycCaseResponse(caseRow), checklist: checklistRows.map(safeChecklistItemResponse) },
          meta(request),
        ),
      );
    },
  );
}
