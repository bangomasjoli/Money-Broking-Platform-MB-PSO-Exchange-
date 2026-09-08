/**
 * KYC-01 Phase 1 — case and checklist read routes. All internal-identity-guarded, all safe
 * projections (no raw evidence content, no PII — the schema carries none this phase). The list
 * route is bounded and requires at least one scoping filter (`application_id` or `client_id`) —
 * never a global unbounded dump, mirrors AML-01's own `GET /internal/aml1/risk-signals` subject-
 * scoped precedent.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, query, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchChecklistItems, normalizeKycCaseRow, safeChecklistItemResponse, safeKycCaseResponse, type KycCaseRow } from "../lib/kyc-case.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseIdParams = Type.Object({ case_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ListQuery = Type.Object(
  {
    application_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    client_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false },
);

/** Bounded, structural — never exceeded regardless of how many cases match. */
const CASE_LIST_LIMIT = 200;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function fetchCaseOrThrow(caseId: string): Promise<KycCaseRow> {
  const rows = await query<KycCaseRow>(
    getPool(),
    `SELECT case_id, application_id, client_id, party_id, case_type, status, current_outcome_status, current_outcome_id, created_from_handoff_id, created_at_utc, updated_at_utc
       FROM kyc1.kyc_case WHERE case_id = $1`,
    [caseId],
  );
  const row = rows[0];
  if (!row) throw new Kyc1Error("KYC1_CASE_NOT_FOUND");
  return normalizeKycCaseRow(row);
}

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/kyc1/cases/:case_id
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/kyc1/cases/:case_id",
    { preHandler: requireInternal, schema: { params: CaseIdParams } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      assertPoolAvailable();
      const caseRow = await fetchCaseOrThrow(case_id);
      return reply.send(successEnvelope(safeKycCaseResponse(caseRow), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/kyc1/cases?application_id=&client_id=
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/kyc1/cases",
    { preHandler: requireInternal, schema: { querystring: ListQuery } },
    async (request, reply) => {
      const q = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();

      if (!q.application_id && !q.client_id) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ issue: "at least one of application_id or client_id is required" }],
        });
      }

      const rows = await query<KycCaseRow>(
        getPool(),
        `SELECT case_id, application_id, client_id, party_id, case_type, status, current_outcome_status, current_outcome_id, created_from_handoff_id, created_at_utc, updated_at_utc
           FROM kyc1.kyc_case
          WHERE ($1::varchar IS NULL OR application_id = $1)
            AND ($2::varchar IS NULL OR client_id = $2)
          ORDER BY created_at_utc DESC
          LIMIT $3`,
        [q.application_id ?? null, q.client_id ?? null, CASE_LIST_LIMIT],
      );

      return reply.send(successEnvelope({ cases: rows.map(normalizeKycCaseRow).map(safeKycCaseResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/kyc1/cases/:case_id/checklist
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/kyc1/cases/:case_id/checklist",
    { preHandler: requireInternal, schema: { params: CaseIdParams } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      assertPoolAvailable();
      await fetchCaseOrThrow(case_id);
      const items = await fetchChecklistItems(getPool(), case_id);
      return reply.send(successEnvelope({ case_id, checklist: items.map(safeChecklistItemResponse) }, meta(request)));
    },
  );
}
