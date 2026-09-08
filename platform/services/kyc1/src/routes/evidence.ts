/**
 * KYC-01 Phase 1 — evidence reference receipt (WF-KYC01-02). `POST
 * /internal/kyc1/cases/:case_id/evidence` stores an OPAQUE evidence reference + optional hash
 * only — NEVER raw document content, never base64, never an uploaded file
 * (`lib/kyc-case.ts`'s `validateEvidenceRef` structurally refuses anything shaped like inline
 * content). Updates the matching checklist item (by `document_type`) if one already exists
 * (migration 042's own `idx_kyc1_checklist_item_case_document_type` unique index guarantees at
 * most one), or inserts a new ad-hoc, non-required item otherwise.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { normalizeChecklistItemRow, safeChecklistItemResponse, validateEvidenceRef, type ChecklistItemRow } from "../lib/kyc-case.js";
import { fetchCaseOrThrow } from "./cases.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseIdParams = Type.Object({ case_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const AddEvidenceBody = Type.Object(
  {
    document_type: Type.String({ minLength: 1, maxLength: 64 }),
    evidence_ref: Type.String({ minLength: 1, maxLength: 256 }),
    evidence_hash: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    expiry_date: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
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

export async function registerEvidenceRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  app.post(
    "/internal/kyc1/cases/:case_id/evidence",
    { preHandler: requireInternal, schema: { params: CaseIdParams, body: AddEvidenceBody } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      const body = request.body as Static<typeof AddEvidenceBody>;
      assertPoolAvailable();

      await fetchCaseOrThrow(case_id);
      validateEvidenceRef(body.evidence_ref);

      let checklistRow: ChecklistItemRow;
      try {
        checklistRow = await withTransaction(async (client) => {
          const existing = await client.query<ChecklistItemRow>(
            `SELECT checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc
               FROM kyc1.document_checklist_item WHERE case_id = $1 AND document_type = $2 FOR UPDATE`,
            [case_id, body.document_type],
          );

          let row: ChecklistItemRow;
          if (existing.rows[0]) {
            const updated = await client.query<ChecklistItemRow>(
              `UPDATE kyc1.document_checklist_item
                 SET evidence_ref = $2, evidence_hash = $3, expiry_date = $4,
                     status = CASE WHEN status = 'missing' THEN 'received' ELSE status END,
                     updated_at_utc = now()
               WHERE checklist_item_id = $1
               RETURNING checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc`,
              [existing.rows[0].checklist_item_id, body.evidence_ref, body.evidence_hash ?? null, body.expiry_date ?? null],
            );
            row = normalizeChecklistItemRow(updated.rows[0]!);
          } else {
            const checklistItemId = "kyc1item_" + randomUUID();
            const inserted = await client.query<ChecklistItemRow>(
              `INSERT INTO kyc1.document_checklist_item
                 (checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date)
               VALUES ($1,$2,$3,false,'received',$4,$5,$6)
               RETURNING checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc`,
              [checklistItemId, case_id, body.document_type, body.evidence_ref, body.evidence_hash ?? null, body.expiry_date ?? null],
            );
            row = normalizeChecklistItemRow(inserted.rows[0]!);
          }

          await publishAudit(client, {
            event_type: "kyc1.document_reference_added",
            source_module: "KYC-01",
            actor_id: request.ctx.actor_id ?? "kyc1_internal_service",
            actor_type: "service",
            entity_type: "document_checklist_item",
            entity_id: row.checklist_item_id,
            severity: "high",
            action: "checklist_item.evidence_add",
            result: "success",
            metadata: { case_id, checklist_item_id: row.checklist_item_id, document_type: body.document_type, status: row.status },
          });

          return row;
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(safeChecklistItemResponse(checklistRow), meta(request)));
    },
  );
}
