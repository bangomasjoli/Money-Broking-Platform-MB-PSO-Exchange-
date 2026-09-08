/**
 * KYC-01 Phase 3A — the sensitive evidence-read route. This is KYC-01's FIRST IAM-02-gated route
 * and the ONLY route in the entire module that ever returns `evidence_ref`/`evidence_hash`
 * (`lib/kyc-case.ts`'s `safeChecklistItemSensitiveResponse` — every other route uses the narrowed
 * `safeChecklistItemResponse`, Phase 3A D3).
 *
 * IMPORTANT — this route returns an evidence REFERENCE, not a document. KYC-01 stores no document
 * content anywhere; `evidence_ref` is an opaque external pointer (e.g. an S3 key/DMS token) and
 * `evidence_hash` is a tamper-evidence hash of whatever that pointer resolves to elsewhere. Never
 * raw content, never base64, never a `data:` URI, never a vendor payload — `lib/kyc-case.ts`'s own
 * `validateEvidenceRef` structurally refuses anything shaped like inline content at write time, so
 * there is nothing document-shaped this route could return even if it wanted to.
 *
 * `GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail?actor_id=<actor_id>` —
 * keyed by `checklist_item_id` alone (globally UNIQUE, migration 042) rather than nested under
 * `:case_id/...` — a `case_id` path segment would be redundant and only introduce a mismatch
 * failure mode (approved Phase 3A planning report D4). `evidence_ref` deliberately never appears
 * in the URL (would leak into access logs/proxies) — it is a QUERY-scoped `actor_id` and a
 * RESPONSE-body-only sensitive field, mirrors `aml1.matches.ts`'s own `sensitive-detail` route
 * shape exactly (single-record, no list, no search).
 *
 * PERMISSION-BEFORE-EXISTENCE (mirrors AML-01's own Phase 3A Low-2 fix, applied here from day
 * one): `checkPermission` is called BEFORE the checklist-item row is ever fetched. An
 * unpermissioned caller must never learn whether a `checklist_item_id` exists — both "denied" and
 * "denied because it doesn't exist" collapse to the identical `KYC1_PERMISSION_DENIED`/403, never
 * a 404. Only once permission has genuinely passed does an unknown id resolve to the EXISTING
 * `KYC1_CHECKLIST_ITEM_NOT_FOUND` — no new `KYC1_SENSITIVE_EVIDENCE_NOT_FOUND` code (a second name
 * for an already-covered condition, `lib/errors.ts`'s own reachable-code-path-only discipline).
 *
 * AUDIT-BEFORE-RETURN, FAIL-CLOSED (mirrors `aml1.sensitive_match_detail_read` /
 * `sec1.audit_event.read_sensitive`): the `kyc1.sensitive_evidence_read` audit commits in its own
 * transaction BEFORE the response is sent. If the audit write fails, the read fails as
 * `KYC1_AUDIT_REQUIRED` — no unlogged sensitive disclosure, ever. Audit metadata never carries
 * `evidence_ref`/`evidence_hash` — logging the sensitive value into the audit trail would defeat
 * the route's own purpose.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchChecklistItemById, safeChecklistItemSensitiveResponse } from "../lib/kyc-case.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const ChecklistItemIdParams = Type.Object({ checklist_item_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ActorQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Kyc1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerSensitiveEvidenceRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  app.get(
    "/internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail",
    { preHandler: requireInternal, schema: { params: ChecklistItemIdParams, querystring: ActorQuery } },
    async (request, reply) => {
      const { checklist_item_id } = request.params as Static<typeof ChecklistItemIdParams>;
      const { actor_id } = request.query as Static<typeof ActorQuery>;
      assertPoolAvailable();

      // Permission-before-existence — see this file's own header comment. No row is fetched
      // above this line.
      const baseline = await checkPermission(iam2Config(app), {
        actorId: actor_id,
        action: "kyc1.evidence.sensitive_read",
        resource: "document_checklist_item",
        entityId: checklist_item_id,
      });
      if (!baseline.allowed) {
        throw new Kyc1Error(baseline.reason === "iam2_unavailable" ? "KYC1_IAM2_UNAVAILABLE" : "KYC1_PERMISSION_DENIED");
      }

      const row = await fetchChecklistItemById(getPool(), checklist_item_id);
      if (!row) throw new Kyc1Error("KYC1_CHECKLIST_ITEM_NOT_FOUND");

      // Audit-before-return, same transaction, fail-closed — if the audit write fails, the read
      // fails. No evidence_ref/evidence_hash/PII in audit metadata.
      try {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "kyc1.sensitive_evidence_read",
            source_module: "KYC-01",
            actor_id,
            actor_type: "user",
            entity_type: "document_checklist_item",
            entity_id: checklist_item_id,
            severity: "high",
            action: "checklist_item.sensitive_read",
            result: "success",
            metadata: { checklist_item_id, case_id: row.case_id, document_type: row.document_type },
          }),
        );
      } catch (err) {
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeChecklistItemSensitiveResponse(row), meta(request)));
    },
  );
}
