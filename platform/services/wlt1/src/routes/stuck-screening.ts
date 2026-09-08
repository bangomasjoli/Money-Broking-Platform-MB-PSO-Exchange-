/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure.
 * Implements the FROZEN architecture (WLT-01 Named Vendor-Result Ingestion / Async Path
 * Implementation-Contract Architecture Addendum + Stuck-Screening Recovery Final
 * Micro-Clarification) exactly — no new architectural decisions are made in this file. The Final
 * Micro-Clarification supersedes the original addendum on every destination-id-discovery,
 * lock-ordering, replay-response, and race question below.
 *
 * TWO routes:
 *   - `GET /internal/wlt1/stuck-screenings` — bounded, deterministic, safe-projection visibility.
 *     No mutation, no audit, no sensitive disclosure.
 *   - `POST /internal/wlt1/stuck-screenings/:screening_result_id/recover` — the single operational
 *     recovery action: `pending -> failed`, destination `pending_screening -> draft`.
 *
 * THIS IS NOT A NEW ASYNC INGESTION PATH. `routes/provider-receipt.ts` + `wlt1.vendor_result_inbox`
 * remain the sole, unmodified, accepted async wallet-screening ingestion path. Neither is imported,
 * referenced, or touched here.
 *
 * NO IAM: both routes use only `requireInternal` (the same internal-service-token guard every
 * automated WLT-01 route uses). `actor_id` in the POST body is audit/idempotency attribution ONLY
 * — never an IAM authority claim, never checked against any permission.
 *
 * DESTINATION-ID DISCOVERY + LOCK ORDER (Final Micro-Clarification, load-bearing): the route
 * receives only `screening_result_id`. A NON-AUTHORITATIVE pre-read (`resolveDestinationIdForLockKey`,
 * outside any transaction) discovers the advisory-lock key; unknown id -> `404` BEFORE
 * `beginIdempotent` (a deterministic lookup failure never burns an Idempotency-Key). The mutation
 * transaction then acquires the SAME `wlt1.destination:<id>` advisory lock domain
 * `screening-application.ts`/`wallet-screening.ts` already use, BEFORE any row lock, then
 * authoritatively re-verifies everything under `FOR UPDATE` — the pre-read is never trusted.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, beginIdempotent, completeIdempotent, getPool, query, successEnvelope, withTransaction, type IdempotencyScope } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  fetchRecoveredScreeningForReplay,
  recoverStuckScreening,
  resolveDestinationIdForLockKey,
  safeStuckScreeningResponse,
  selectStuckScreeningRows,
  STUCK_SCREENING_LIST_LIMIT,
  STUCK_SCREENING_REASON_CODES,
  type RecoveredScreeningResult,
} from "../lib/stuck-screening.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const ScreeningResultIdParams = Type.Object({ screening_result_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ListQuery = Type.Object({ min_age_seconds: Type.Optional(Type.Integer({ minimum: 0 })) }, { additionalProperties: false });

const ReasonCodeSchema = Type.Union(STUCK_SCREENING_REASON_CODES.map((c) => Type.Literal(c)));

const RecoverBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason_code: ReasonCodeSchema,
  },
  { additionalProperties: false },
);
type RecoverBody = Static<typeof RecoverBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function recoveryResponse(result: RecoveredScreeningResult, reasonCode: string, replay: boolean): Record<string, unknown> {
  return {
    screening_result_id: result.screeningResultId,
    screening_result_version: result.screeningResultVersion,
    destination_id: result.destinationId,
    risk_status: "failed" as const,
    reason_code: reasonCode,
    destination_released: true,
    recovered_at_utc: result.recoveredAtUtc,
    replay,
  };
}

export async function registerStuckScreeningRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/wlt1/stuck-screenings
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/wlt1/stuck-screenings",
    { preHandler: requireInternal, schema: { querystring: ListQuery } },
    async (request, reply) => {
      const q = request.query as Static<typeof ListQuery>;
      assertPoolAvailable();
      const config = app.config as Wlt1Config;

      // min_age_seconds may only RAISE the effective threshold — never lower it below the
      // configured control floor.
      const effectiveThresholdSeconds = Math.max(config.stuckScreeningThresholdSeconds, q.min_age_seconds ?? 0);

      const rows = await selectStuckScreeningRows(getPool(), effectiveThresholdSeconds, STUCK_SCREENING_LIST_LIMIT);

      return reply.send(successEnvelope({ stuck_screenings: rows.map(safeStuckScreeningResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/wlt1/stuck-screenings/:screening_result_id/recover
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/wlt1/stuck-screenings/:screening_result_id/recover",
    { preHandler: requireInternal, schema: { params: ScreeningResultIdParams, body: RecoverBody } },
    async (request, reply) => {
      const { screening_result_id } = request.params as Static<typeof ScreeningResultIdParams>;
      const body = request.body as RecoverBody;
      assertPoolAvailable();
      const idempotencyKey = requireIdempotencyKey(request);
      const config = app.config as Wlt1Config;

      // Step 5: non-authoritative pre-read — discovers the advisory-lock key only.
      const destinationIdHint = await resolveDestinationIdForLockKey(getPool(), screening_result_id);
      if (!destinationIdHint) {
        // Unknown id — 404 BEFORE beginIdempotent. No idempotency row is ever created for this key.
        throw new Wlt1Error("WLT1_STUCK_SCREENING_NOT_FOUND");
      }

      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "service",
        action: "wlt1.stuck_screening.recover",
        key: idempotencyKey,
        request: { screening_result_id, ...body },
        sourceModule: "WLT-01",
      };

      // Step 6-16: ONE mutation transaction.
      let replayResult: RecoveredScreeningResult | undefined;
      let freshResult: RecoveredScreeningResult | undefined;
      try {
        await withTransaction(async (client) => {
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "duplicate") {
            if (idem.recordStatus === "completed") {
              if (!idem.resultRef) throw new AppError("INTERNAL_ERROR", { message: "Idempotent stuck-screening recovery replay has no result reference." });
              const replay = await fetchRecoveredScreeningForReplay(client, idem.resultRef);
              if (!replay) throw new AppError("INTERNAL_ERROR", { message: "Idempotent stuck-screening recovery replay target could not be resolved." });
              replayResult = replay;
              return;
            }
            // processing (or the currently-unreachable failed) — fail closed, zero mutation.
            throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
          }

          // new -> recovery. Step 8-14 (advisory lock, row locks, revalidation, mutation, audit)
          // run on THIS SAME client/transaction — recoverStuckScreening never opens its own.
          const outcome = await recoverStuckScreening(client, {
            screeningResultId: screening_result_id,
            destinationIdHint,
            actorId: body.actor_id,
            reasonCode: body.reason_code,
            thresholdSeconds: config.stuckScreeningThresholdSeconds,
          });

          if (outcome.kind === "invalid_state") throw new Wlt1Error("WLT1_STUCK_SCREENING_INVALID_STATE");

          await completeIdempotent(client, idemScope, outcome.result.screeningResultId);
          freshResult = outcome.result;
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (replayResult) {
        return reply.code(200).send(successEnvelope(recoveryResponse(replayResult, body.reason_code, true), meta(request)));
      }

      return reply.code(200).send(successEnvelope(recoveryResponse(freshResult!, body.reason_code, false), meta(request)));
    },
  );
}
