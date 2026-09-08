/**
 * AML-01 Phase 3D — stuck requested-screening detection + operator recovery routes (closes Phase
 * 3C MEDIUM-1: a crashed/orphaned in-flight `screening_request` could silently and permanently
 * remove a subject from AML re-screening). All actual lifecycle logic (the detection query, the
 * safe projection, the recovery transaction) lives in `lib/stuck-screening.ts` — this file is
 * routing + IAM-02 gating only, same split every other AML-01 route file follows.
 *
 * Confirmed Phase 3D decisions:
 *   D2 — single-step, permission-gated recovery; no maker-checker. The recover route asserts a
 *        genuine `permission_granted` baseline (mirrors CFG-01's kill-switch `.activate` /
 *        `routes/monitoring.ts`'s own identical structural assertion) — `approval_required`/
 *        `step_up_required` never authorises recovery, because there is no execute-verify fallback
 *        for this permission (migration 041: `requires_approval=false`).
 *   D4 — `reason_code` is a closed enum (`lib/stuck-screening.ts`'s own
 *        `STUCK_SCREENING_REASON_CODES`) — a TypeBox literal union makes any other value
 *        structurally impossible to submit; no free text ever reaches this route.
 *
 * `GET .../stuck` is bounded (`STUCK_SCREENING_LIST_LIMIT`, mirrors `routes/risk-signals.ts`'s own
 * `RISK_SIGNAL_LIST_LIMIT` precedent) — never a caller-adjustable page size, never a global
 * unbounded dump. `min_age_seconds` may only RAISE the effective threshold above the configured
 * `AML1_STUCK_SCREENING_THRESHOLD_SECONDS` floor, never lower it.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { STUCK_SCREENING_REASON_CODES, recoverStuckScreening, safeStuckScreeningResponse, selectStuckScreeningRows } from "../lib/stuck-screening.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const ScreeningRequestIdParams = Type.Object({ screening_request_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ReasonCodeSchema = Type.Union(STUCK_SCREENING_REASON_CODES.map((c) => Type.Literal(c)));

const ListQuery = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    min_age_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

const RecoverBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason_code: ReasonCodeSchema,
  },
  { additionalProperties: false },
);

/** Bounded, structural — never exceeded regardless of how many requests are stuck. */
const STUCK_SCREENING_LIST_LIMIT = 200;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerStuckScreeningRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/screening-requests/stuck
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/screening-requests/stuck",
    { preHandler: requireInternal, schema: { querystring: ListQuery } },
    async (request, reply) => {
      const q = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();
      const config = app.config as Aml1Config;

      const baseline = await checkPermission(iam2Config(app), { actorId: q.actor_id, action: "aml1.screening.stuck_read", resource: "screening" });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      // min_age_seconds may only RAISE the effective threshold — never lower it below the
      // configured floor (confirmed Phase 3D requirement; see this file's own header comment).
      const effectiveThresholdSeconds = Math.max(config.stuckScreeningThresholdSeconds, q.min_age_seconds ?? 0);

      const rows = await selectStuckScreeningRows(getPool(), effectiveThresholdSeconds, STUCK_SCREENING_LIST_LIMIT);

      return reply.send(successEnvelope({ stuck_screening_requests: rows.map(safeStuckScreeningResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/screening-requests/:screening_request_id/recover
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/screening-requests/:screening_request_id/recover",
    { preHandler: requireInternal, schema: { params: ScreeningRequestIdParams, body: RecoverBody } },
    async (request, reply) => {
      const { screening_request_id } = request.params as { screening_request_id: string };
      const body = request.body as Static<typeof RecoverBody>;
      assertPoolAvailable();
      const config = app.config as Aml1Config;

      // Structural defence-in-depth — mirrors CFG-01's kill-switch `.activate` / `routes/
      // monitoring.ts`'s own `permission_granted` assertion: this permission has no execute-verify
      // fallback (requires_approval=false, migration 041), so the baseline check IS the real gate
      // and must be a genuine role-granted allow — approval_required/step_up_required never
      // authorises recovery (confirmed decision D2).
      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.actor_id,
        action: "aml1.screening.stuck_recover",
        resource: "screening",
        entityId: screening_request_id,
      });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");
      if (baseline.reason !== "permission_granted") throw new Aml1Error("AML1_PERMISSION_DENIED");

      const outcome = await recoverStuckScreening({
        screeningRequestId: screening_request_id,
        actorId: body.actor_id,
        reasonCode: body.reason_code,
        thresholdSeconds: config.stuckScreeningThresholdSeconds,
      });

      if (outcome.kind === "not_found") throw new Aml1Error("AML1_STUCK_SCREENING_NOT_FOUND");
      if (outcome.kind === "invalid_state") throw new Aml1Error("AML1_STUCK_SCREENING_INVALID_STATE");
      if (outcome.kind === "too_fresh") throw new Aml1Error("AML1_STUCK_SCREENING_TOO_FRESH");

      return reply.send(successEnvelope(safeStuckScreeningResponse(outcome.row), meta(request)));
    },
  );
}
