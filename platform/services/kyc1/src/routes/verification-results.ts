/**
 * KYC-01 Phase 1 — manual/registry verification-result receipt (part of WF-KYC01-03/WF-KYC01-04,
 * the deterministic subset only). `POST /internal/kyc1/cases/:case_id/verification-results`
 * accepts `source_type IN ('manual','registry')` ONLY — no vendor result, no biometric/liveness,
 * no proofing assurance, and no AML clearance claim of any kind this phase (all out of Phase 1
 * scope; migration 042's own `verification_result.source_type` CHECK structurally rejects
 * `'vendor'`).
 *
 * `result_type` must be applicable to the case's own `case_type`
 * (`lib/kyc-case.ts`'s `applicableResultTypesForCaseType`) — e.g. `result_type='entity'` on an
 * `individual` case is rejected as `KYC1_VERIFICATION_RESULT_INVALID`. `result_type='document'`
 * requires a `checklist_item_id` belonging to this case and updates that item's own status
 * (`verified`/`rejected`) atomically with the result insert; `result_type IN ('identity','entity')`
 * is a case-level finding, not tied to one specific document row.
 *
 * `payload_hash` is computed server-side (never caller-supplied) over the structured, non-free-text
 * submitted fields — genuine tamper-evidence, not a decorative column.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  applicableResultTypesForCaseType,
  normalizeChecklistItemRow,
  normalizeVerificationResultRow,
  safeVerificationResultResponse,
  type ChecklistItemRow,
  type KycCaseType,
  type VerificationResultRow,
} from "../lib/kyc-case.js";
import { fetchCaseOrThrow } from "./cases.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseIdParams = Type.Object({ case_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const SOURCE_TYPES = ["manual", "registry"] as const;
const RESULT_TYPES = ["document", "identity", "entity"] as const;
const RESULT_STATUSES = ["pass", "fail"] as const;

const AddVerificationResultBody = Type.Object(
  {
    source_type: Type.Union(SOURCE_TYPES.map((s) => Type.Literal(s))),
    source_id: Type.String({ minLength: 1, maxLength: 64 }),
    result_type: Type.Union(RESULT_TYPES.map((t) => Type.Literal(t))),
    result_status: Type.Union(RESULT_STATUSES.map((s) => Type.Literal(s))),
    checklist_item_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
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

export async function registerVerificationResultRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  app.post(
    "/internal/kyc1/cases/:case_id/verification-results",
    { preHandler: requireInternal, schema: { params: CaseIdParams, body: AddVerificationResultBody } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      const body = request.body as Static<typeof AddVerificationResultBody>;
      assertPoolAvailable();

      const caseRow = await fetchCaseOrThrow(case_id);
      const caseType = caseRow.case_type as KycCaseType;

      if (!applicableResultTypesForCaseType(caseType).includes(body.result_type)) {
        throw new Kyc1Error("KYC1_VERIFICATION_RESULT_INVALID", {
          details: [{ field: "result_type", issue: `'${body.result_type}' does not apply to case_type '${caseType}'` }],
        });
      }
      if (body.result_type === "document" && !body.checklist_item_id) {
        throw new Kyc1Error("KYC1_VERIFICATION_RESULT_INVALID", {
          details: [{ field: "checklist_item_id", issue: "required when result_type is 'document'" }],
        });
      }
      if (body.result_type !== "document" && body.checklist_item_id) {
        throw new Kyc1Error("KYC1_VERIFICATION_RESULT_INVALID", {
          details: [{ field: "checklist_item_id", issue: `must not be supplied when result_type is '${body.result_type}'` }],
        });
      }

      let resultRow: VerificationResultRow;
      try {
        resultRow = await withTransaction(async (client) => {
          let checklistItem: ChecklistItemRow | undefined;
          if (body.checklist_item_id) {
            const found = await client.query<ChecklistItemRow>(
              `SELECT checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc
                 FROM kyc1.document_checklist_item WHERE checklist_item_id = $1 AND case_id = $2 FOR UPDATE`,
              [body.checklist_item_id, case_id],
            );
            checklistItem = found.rows[0] ? normalizeChecklistItemRow(found.rows[0]) : undefined;
            if (!checklistItem) throw new Kyc1Error("KYC1_CHECKLIST_ITEM_NOT_FOUND");
          }

          const verificationResultId = "kyc1vr_" + randomUUID();
          const payloadHash = fingerprint({
            case_id,
            checklist_item_id: body.checklist_item_id ?? null,
            source_type: body.source_type,
            result_type: body.result_type,
            result_status: body.result_status,
          });

          const inserted = await client.query<VerificationResultRow>(
            `INSERT INTO kyc1.verification_result
               (verification_result_id, case_id, checklist_item_id, source_type, source_id, result_type, result_status, payload_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING verification_result_id, case_id, checklist_item_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc`,
            [
              verificationResultId,
              case_id,
              body.checklist_item_id ?? null,
              body.source_type,
              body.source_id,
              body.result_type,
              body.result_status,
              payloadHash,
            ],
          );
          const row = normalizeVerificationResultRow(inserted.rows[0]!);

          if (body.result_type === "document" && checklistItem) {
            const newStatus = body.result_status === "pass" ? "verified" : "rejected";
            await client.query(
              `UPDATE kyc1.document_checklist_item SET status = $2, verification_result_id = $3, updated_at_utc = now() WHERE checklist_item_id = $1`,
              [checklistItem.checklist_item_id, newStatus, verificationResultId],
            );
            await publishAudit(client, {
              event_type: body.result_status === "pass" ? "kyc1.document_verified" : "kyc1.document_rejected",
              source_module: "KYC-01",
              actor_id: request.ctx.actor_id ?? "kyc1_internal_service",
              actor_type: "service",
              entity_type: "document_checklist_item",
              entity_id: checklistItem.checklist_item_id,
              severity: "high",
              action: "checklist_item.verify",
              result: "success",
              metadata: { case_id, checklist_item_id: checklistItem.checklist_item_id, verification_result_id: verificationResultId, status: newStatus },
            });
          } else if (body.result_type === "identity") {
            await publishAudit(client, {
              event_type: body.result_status === "pass" ? "kyc1.identity_verified" : "kyc1.identity_failed",
              source_module: "KYC-01",
              actor_id: request.ctx.actor_id ?? "kyc1_internal_service",
              actor_type: "service",
              entity_type: "kyc_case",
              entity_id: case_id,
              severity: "high",
              action: "case.identity_verification",
              result: body.result_status === "pass" ? "success" : "failure",
              metadata: { case_id, verification_result_id: verificationResultId, result_status: body.result_status },
            });
          } else if (body.result_type === "entity") {
            await publishAudit(client, {
              event_type: body.result_status === "pass" ? "kyc1.entity_verified" : "kyc1.entity_failed",
              source_module: "KYC-01",
              actor_id: request.ctx.actor_id ?? "kyc1_internal_service",
              actor_type: "service",
              entity_type: "kyc_case",
              entity_id: case_id,
              severity: "high",
              action: "case.entity_verification",
              result: body.result_status === "pass" ? "success" : "failure",
              metadata: { case_id, verification_result_id: verificationResultId, result_status: body.result_status },
            });
          }

          return row;
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(safeVerificationResultResponse(resultRow), meta(request)));
    },
  );
}
