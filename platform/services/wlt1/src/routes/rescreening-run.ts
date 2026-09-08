/**
 * WLT-01 — `POST /internal/wlt1/rescreening-runs`. Implements the FROZEN architecture (WLT-01
 * Ongoing Rescreening Addendum, CLOSED + Run-Lifecycle Micro-Addendum, CLOSED) exactly — no new
 * architectural decisions are made in this file.
 *
 * ONE route, two `scope` values (`periodic_due` | `destination`) — no separate `/run`/`/trigger`
 * pair, no `GET` (the run is synchronous; the POST response IS the result).
 *
 * SYNCHRONOUS, NO NEW TIMEOUT (frozen): the request stays open until the run completes. No
 * `requestTimeout`/`connectionTimeout`/`AbortController`/`request.raw.on("close")` — a caller
 * disconnect does not interrupt server-side processing; the run still finalizes and audits.
 * Provider calls remain individually bounded by the EXISTING `PROVIDER_CALL_TIMEOUT_MS`
 * (`lib/providers/registry.ts`).
 *
 * SEQUENTIAL DISPATCH (frozen, load-bearing): the Phase-B loop below is a plain `for...of` with
 * `await` — one destination's provider call AND application fully complete before the next
 * begins. `Promise.all`/`Promise.allSettled` over candidates is forbidden.
 *
 * PHASE-A ERROR MAPPING (frozen, Run-Lifecycle Micro-Addendum Issue 10/18): a non-audit Phase-A
 * failure (pool/advisory-lock/candidate-selection/run-row-INSERT) maps to
 * `WLT1_SERVICE_UNAVAILABLE`; ONLY the stuck-reclaim audit path maps to `WLT1_AUDIT_REQUIRED`.
 * These are deliberately NOT the same blanket catch the revocation routes use.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, successEnvelope, withTransaction, query } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  finalizeRescreeningRun,
  findRunningRescreeningRun,
  insertRescreeningRun,
  isRescreeningRunStuck,
  loadDestinationScopeCandidate,
  mintRescreeningRunId,
  processRescreeningCandidate,
  reclaimStuckRescreeningRun,
  selectDuePeriodicCandidates,
  zeroRescreeningRunCounters,
  type RescreeningCandidate,
  type RescreeningCandidateOutcome,
  type RescreeningScope,
} from "../lib/rescreening.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const RescreeningRunBody = Type.Object(
  {
    scope: Type.Union([Type.Literal("periodic_due"), Type.Literal("destination")]),
    destination_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    client_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    batch_size: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
type RescreeningRunBody = Static<typeof RescreeningRunBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function validateCrossFields(body: RescreeningRunBody): void {
  if (body.scope === "periodic_due") {
    if (body.destination_id !== undefined) {
      throw new AppError("VALIDATION_ERROR", { details: [{ field: "destination_id", issue: "forbidden when scope is periodic_due" }] });
    }
    if (body.client_id !== undefined) {
      throw new AppError("VALIDATION_ERROR", { details: [{ field: "client_id", issue: "forbidden when scope is periodic_due" }] });
    }
  } else {
    if (body.destination_id === undefined) {
      throw new AppError("VALIDATION_ERROR", { details: [{ field: "destination_id", issue: "required when scope is destination" }] });
    }
    if (body.client_id === undefined) {
      throw new AppError("VALIDATION_ERROR", { details: [{ field: "client_id", issue: "required when scope is destination" }] });
    }
    if (body.batch_size !== undefined) {
      throw new AppError("VALIDATION_ERROR", { details: [{ field: "batch_size", issue: "forbidden when scope is destination" }] });
    }
  }
}

interface PhaseAOutcome {
  runId: string;
  startedAtUtc: Date;
  targetDestinationId: string | null;
  candidates: RescreeningCandidate[];
}

export async function registerRescreeningRunRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/rescreening-runs",
    { preHandler: requireInternal, schema: { body: RescreeningRunBody } },
    async (request, reply) => {
      const body = request.body as RescreeningRunBody;
      validateCrossFields(body);
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const scope = body.scope as RescreeningScope;
      const requestId = request.ctx.request_id ?? null;
      const correlationId = request.ctx.correlation_id ?? null;

      // -----------------------------------------------------------------------------------
      // PHASE A — locked (run advisory lock only). Active-run guard + stuck reclaim (the ONLY
      // Phase-A audit call) + candidate selection + new run-row INSERT, all in ONE transaction.
      // -----------------------------------------------------------------------------------
      let phaseA: PhaseAOutcome;
      try {
        phaseA = await withTransaction(async (client) => {
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", ["wlt1.rescreening_run"]);

          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;

          const running = await findRunningRescreeningRun(client);
          if (running) {
            if (!isRescreeningRunStuck(running.started_at_utc, nowUtc)) {
              throw new Wlt1Error("WLT1_RESCREENING_RUN_ACTIVE");
            }
            try {
              await reclaimStuckRescreeningRun(client, running.run_id, nowUtc, body.requested_by);
            } catch (err) {
              throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
            }
          }

          let candidates: RescreeningCandidate[];
          let targetDestinationId: string | null = null;
          if (scope === "periodic_due") {
            const batchSize = Math.min(body.batch_size ?? config.rescreenBatchSizeDefault, config.rescreenBatchSizeMax);
            candidates = await selectDuePeriodicCandidates(client, config.rescreenLeadTimeHours, batchSize);
          } else {
            const candidate = await loadDestinationScopeCandidate(client, body.destination_id as string, body.client_id as string);
            if (!candidate) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
            candidates = [candidate];
            targetDestinationId = candidate.destinationId;
          }

          const runId = mintRescreeningRunId();
          await insertRescreeningRun(client, {
            runId,
            scope,
            requestedBy: body.requested_by,
            targetDestinationId,
            candidatesSelected: candidates.length,
            requestId,
            correlationId,
          });

          return { runId, startedAtUtc: nowUtc, targetDestinationId, candidates };
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
      }

      // -----------------------------------------------------------------------------------
      // PHASE B — unlocked, STRICTLY SEQUENTIAL. Never Promise.all/allSettled over candidates.
      // -----------------------------------------------------------------------------------
      const counters = zeroRescreeningRunCounters();
      counters.candidatesSelected = phaseA.candidates.length;

      for (const candidate of phaseA.candidates) {
        let outcome: RescreeningCandidateOutcome;
        try {
          outcome = await processRescreeningCandidate(candidate, {
            scope,
            runId: phaseA.runId,
            screeningProviderId: config.screeningProviderId,
            screeningProviderImpl: config.screeningProviderImpl,
            screeningMaxValidityHours: config.screeningMaxValidityHours,
            rescreenLeadTimeHours: config.rescreenLeadTimeHours,
          });
        } catch {
          outcome = { kind: "failure" };
        }

        if (outcome.kind === "skipped") counters.skipped += 1;
        else if (outcome.kind === "failure") counters.failures += 1;
        else if (outcome.kind === "clear") counters.rescreenedClear += 1;
        else {
          counters.rescreenedAdverse += 1;
          if (outcome.revoked) counters.revocationsTriggered += 1;
        }
      }

      // -----------------------------------------------------------------------------------
      // FINALIZE — UPDATE + audit in ONE transaction. Any failure here (DB or audit) rolls back
      // and leaves the row `running` with its pre-finalization stored counters, reclaimable after
      // the stuck threshold; already-committed per-destination evidence/revocations survive.
      // -----------------------------------------------------------------------------------
      let finalized: { status: "completed" | "completed_with_errors"; completedAtUtc: Date };
      try {
        finalized = await withTransaction(async (client) => {
          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;
          return finalizeRescreeningRun(client, {
            runId: phaseA.runId,
            scope,
            requestedBy: body.requested_by,
            targetDestinationId: phaseA.targetDestinationId,
            counters,
            nowUtc,
          });
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(
        successEnvelope(
          {
            run_id: phaseA.runId,
            status: finalized.status,
            scope,
            candidates_selected: counters.candidatesSelected,
            rescreened_clear: counters.rescreenedClear,
            rescreened_adverse: counters.rescreenedAdverse,
            revocations_triggered: counters.revocationsTriggered,
            skipped: counters.skipped,
            failures: counters.failures,
            started_at_utc: phaseA.startedAtUtc.toISOString(),
            completed_at_utc: finalized.completedAtUtc.toISOString(),
          },
          meta(request),
        ),
      );
    },
  );
}
