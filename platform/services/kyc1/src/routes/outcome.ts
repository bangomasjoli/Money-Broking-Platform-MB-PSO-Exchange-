/**
 * KYC-01 Phase 1 — deterministic CDD outcome computation + read (WF-KYC01-07, deterministic
 * subset). `POST /internal/kyc1/cases/:case_id/compute-outcome` is fully DETERMINISTIC — no human
 * override, no maker-checker, no AML clearance claim, no vendor input. It derives the outcome
 * purely from the case's own current `document_checklist_item`/`verification_result` rows
 * (`lib/outcome-engine.ts`'s `computeCddOutcome`, a pure function) and always resolves directly to
 * `pass`/`fail`/`remediation_required` in the same call — never a persisted `pending` row (see
 * migration 042's own header comment).
 *
 * `cdd_outcome` is APPEND-VERSIONED (blueprint Database Design §1 rule 2) — every call INSERTs a
 * NEW row with an incremented `outcome_version`, never updates an existing one. A case whose
 * LATEST outcome is already `'pass'` is terminal this phase — recomputing over it throws
 * `KYC1_CASE_INVALID_STATE` (see lib/errors.ts's own header comment for the full rationale); a
 * `'fail'`/`'remediation_required'` case may be recomputed freely as new evidence arrives.
 *
 * PHASE 3B — RECOMPUTE-LOCK (D5, approved Phase 3B planning report): a case whose latest
 * `cdd_outcome.outcome_reason` is `manual_override_pass`/`_fail`/`_remediation_required`
 * (`routes/outcome-override.ts`'s own apply route) is ALSO terminal against this route, regardless
 * of `outcome_status` — without this, a routine `compute-outcome` call would silently overwrite a
 * human-approved override with a fresh evidence-derived result, defeating the entire point of the
 * override. Reuses the EXISTING `KYC1_CASE_INVALID_STATE` (no new error code — the reachable-
 * code-path-only discipline `lib/errors.ts` applies to itself). Correction of an overridden case
 * uses the SAME path Phase 2A's own D4 already established for a terminal `pass`: open a NEW case
 * for the same anchor (migration 042's own partial unique index only blocks a duplicate ACTIVE
 * case, never a duplicate completed one) — `lib/authoritative-outcome.ts`'s own layer (b) picks the
 * new case as that anchor's representative immediately (LOW-7), so the correction window is
 * visible to the aggregate from the moment the corrective case is created.
 *
 * `GET .../outcome` returns the LATEST (highest `outcome_version`) row only.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchChecklistItems, fetchVerificationResults, normalizeKycCaseRow, type KycCaseRow, type KycCaseType } from "../lib/kyc-case.js";
import { computeCddOutcome, normalizeCddOutcomeRow, safeCddOutcomeResponse, type CddOutcomeRow } from "../lib/outcome-engine.js";
import { MANUAL_OVERRIDE_REASON_CODES } from "../lib/outcome-override.js";
import { fetchCaseOrThrow } from "./cases.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseIdParams = Type.Object({ case_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

/** `pending_documents`/`remediation` -> outcome-derived case status. `pass`/`fail` both resolve
 * the case to `'completed'` — see migration 042's own header comment (`kyc_case.status` tracks
 * "has processing concluded", not "did it pass"; the actual pass/fail value lives on
 * `current_outcome_status`). */
export function caseStatusForOutcome(outcomeStatus: "pass" | "fail" | "remediation_required"): "completed" | "remediation" {
  return outcomeStatus === "remediation_required" ? "remediation" : "completed";
}

/** PHASE 3B recompute-lock (D5) — true when the case's CURRENT outcome was produced by
 * `routes/outcome-override.ts`'s own apply route, regardless of `outcome_status`. See this file's
 * own header comment. */
async function isOverriddenCase(sql: Sql, currentOutcomeId: string | null): Promise<boolean> {
  if (!currentOutcomeId) return false;
  const rows = await query<{ outcome_reason: string }>(sql, `SELECT outcome_reason FROM kyc1.cdd_outcome WHERE outcome_id = $1`, [currentOutcomeId]);
  const reason = rows[0]?.outcome_reason;
  return Boolean(reason && MANUAL_OVERRIDE_REASON_CODES.has(reason));
}

export async function registerOutcomeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/cases/:case_id/compute-outcome
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/kyc1/cases/:case_id/compute-outcome",
    { preHandler: requireInternal, schema: { params: CaseIdParams } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      assertPoolAvailable();

      let outcomeRow: CddOutcomeRow;
      try {
        outcomeRow = await withTransaction(async (client) => {
          const caseRows = await client.query<KycCaseRow>(
            `SELECT case_id, application_id, client_id, party_id, case_type, status, current_outcome_status, current_outcome_id, created_from_handoff_id, created_at_utc, updated_at_utc
               FROM kyc1.kyc_case WHERE case_id = $1 FOR UPDATE`,
            [case_id],
          );
          const caseRow = caseRows.rows[0] ? normalizeKycCaseRow(caseRows.rows[0]) : undefined;
          if (!caseRow) throw new Kyc1Error("KYC1_CASE_NOT_FOUND");
          // A case whose LATEST outcome is already 'pass' is terminal this phase — see this
          // file's own header comment.
          if (caseRow.current_outcome_status === "pass") throw new Kyc1Error("KYC1_CASE_INVALID_STATE");
          // PHASE 3B recompute-lock (D5) — see this file's own header comment.
          if (await isOverriddenCase(client, caseRow.current_outcome_id)) throw new Kyc1Error("KYC1_CASE_INVALID_STATE");

          const checklistItems = await fetchChecklistItems(client, case_id);
          const verificationResults = await fetchVerificationResults(client, case_id);

          const engineResult = computeCddOutcome({
            caseType: caseRow.case_type as KycCaseType,
            checklistItems: checklistItems.map((c) => ({ required: c.required, status: c.status })),
            verificationResults: verificationResults.map((v) => ({
              verificationResultId: v.verification_result_id,
              resultType: v.result_type,
              resultStatus: v.result_status,
              receivedAtUtc: v.received_at_utc,
            })),
          });

          const versionRows = await client.query<{ next_version: number }>(
            `SELECT COALESCE(MAX(outcome_version), 0) + 1 AS next_version FROM kyc1.cdd_outcome WHERE case_id = $1`,
            [case_id],
          );
          const outcomeVersion = versionRows.rows[0]!.next_version;

          const evidenceRefs = {
            checklist_item_ids: checklistItems.map((c) => c.checklist_item_id),
            verification_result_ids: verificationResults.map((v) => v.verification_result_id),
          };

          const outcomeId = "kyc1outcome_" + randomUUID();
          const payloadHash = fingerprint({
            case_id,
            outcome_status: engineResult.outcomeStatus,
            outcome_reason: engineResult.outcomeReason,
            verification_scope: engineResult.verificationScope,
            evidence_refs: evidenceRefs,
            outcome_version: outcomeVersion,
          });

          const inserted = await client.query<CddOutcomeRow>(
            `INSERT INTO kyc1.cdd_outcome
               (outcome_id, case_id, outcome_status, outcome_reason, verification_scope, evidence_refs, outcome_version, payload_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING outcome_id, case_id, outcome_status, outcome_reason, verification_scope, evidence_refs, outcome_version, created_at_utc`,
            [
              outcomeId,
              case_id,
              engineResult.outcomeStatus,
              engineResult.outcomeReason,
              JSON.stringify(engineResult.verificationScope),
              JSON.stringify(evidenceRefs),
              outcomeVersion,
              payloadHash,
            ],
          );
          const row = normalizeCddOutcomeRow(inserted.rows[0]!);

          await client.query(
            `UPDATE kyc1.kyc_case SET status = $2, current_outcome_status = $3, current_outcome_id = $4, updated_at_utc = now() WHERE case_id = $1`,
            [case_id, caseStatusForOutcome(engineResult.outcomeStatus), engineResult.outcomeStatus, outcomeId],
          );

          await publishAudit(client, {
            event_type: "kyc1.outcome_computed",
            source_module: "KYC-01",
            actor_id: request.ctx.actor_id ?? "kyc1_internal_service",
            actor_type: "service",
            entity_type: "cdd_outcome",
            entity_id: outcomeId,
            severity: "high",
            action: "cdd_outcome.compute",
            result: "success",
            reason_code: engineResult.outcomeReason,
            metadata: { case_id, outcome_id: outcomeId, outcome_status: engineResult.outcomeStatus, outcome_version: outcomeVersion },
          });

          return row;
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(safeCddOutcomeResponse(outcomeRow), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/kyc1/cases/:case_id/outcome
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/kyc1/cases/:case_id/outcome",
    { preHandler: requireInternal, schema: { params: CaseIdParams } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      assertPoolAvailable();
      await fetchCaseOrThrow(case_id);

      const rows = await query<CddOutcomeRow>(
        getPool(),
        `SELECT outcome_id, case_id, outcome_status, outcome_reason, verification_scope, evidence_refs, outcome_version, created_at_utc
           FROM kyc1.cdd_outcome WHERE case_id = $1 ORDER BY outcome_version DESC LIMIT 1`,
        [case_id],
      );
      const row = rows[0];
      if (!row) throw new Kyc1Error("KYC1_OUTCOME_NOT_FOUND");

      return reply.send(successEnvelope(safeCddOutcomeResponse(normalizeCddOutcomeRow(row)), meta(request)));
    },
  );
}
