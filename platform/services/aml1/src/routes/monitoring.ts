/**
 * AML-01 Phase 3C — route-triggered monitoring run routes (confirmed decision D3: no external
 * scheduler, no cron, no queue scheduler — a `monitoring_run` exists only because
 * `POST /internal/aml1/monitoring-runs` was called by an operator/orchestrator).
 *
 * ---------------------------------------------------------------------------------------
 * Concurrency safety — WHY the advisory lock spans candidate SELECTION *and* CLAIMING, not just
 * the SELECT.
 * ---------------------------------------------------------------------------------------
 * An earlier design held `pg_advisory_xact_lock` (the same idiom CFG-01's kill-switch activation
 * and SEC-01's alert/monitoring-rule engine already established) only around the candidate-SELECT
 * query. That does NOT prevent double-processing: two concurrent runs' SELECTs would still be
 * fully serialized by the lock, but since the FIRST run's SELECT doesn't itself change any
 * subject's "due" state (only the actual re-screen does, and that happened after the lock was
 * released), the SECOND run's SELECT — running immediately after the first commits — would see the
 * SAME subjects still "due" and select them again.
 *
 * The fix: PHASE A (locked) does candidate SELECTION *and* immediately CLAIMS every selected
 * candidate via `lib/rescreen.ts`'s `claimRescreen` (each claim is its own TX1 — an INSERT
 * reserving the subject via migration 039's own partial unique index, on a SEPARATE pooled
 * connection; the ADVISORY lock itself is held on ONE dedicated connection for the whole of Phase
 * A) — only after every candidate is claimed does Phase A commit and release the lock. A second
 * concurrent run's candidate-SELECT can only begin once ALL of the first run's claims are visible
 * (its own `screening_request` rows now `status='requested'`, no longer "due" — the SELECT query
 * itself excludes any subject whose latest request isn't `completed`), so it naturally excludes
 * every subject the first run already claimed.
 *
 * PHASE B (unlocked) then runs the (potentially slow) provider call + TX2 for each claim via
 * `completeRescreenClaim` — deliberately OUTSIDE the lock and outside any held transaction, so
 * concurrent monitoring runs are NOT forced to fully serialize on provider latency, only on the
 * (fast) claim step. This is also what "no direct provider calls inside monitoring transaction"
 * means in practice: the provider call never happens while any AML-01-owned transaction (lock or
 * otherwise) is open.
 *
 * ---------------------------------------------------------------------------------------
 * No unbounded retry inside one run.
 * ---------------------------------------------------------------------------------------
 * Each selected candidate is claimed and completed AT MOST ONCE. A provider outage (or any other
 * per-candidate failure, at either phase) is counted in `failures` and the run moves on — the
 * subject remains "due" (or, if claimed-but-failed, reverts to non-"due" only once a human/manual
 * re-screen resolves the resulting `failed` row) and will be reconsidered by a FUTURE run.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  createMonitoringRun,
  emitOverdueSignalsForCandidates,
  emitStuckScreeningSignalsForCandidates,
  finalizeMonitoringRun,
  selectListVersionChangedCandidates,
  selectPeriodicDueCandidates,
} from "../lib/monitoring.js";
import { claimRescreen, completeRescreenClaim, type RescreenClaim } from "../lib/rescreen.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const RunIdParams = Type.Object({ run_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ActorQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const CreateMonitoringRunBody = Type.Object(
  {
    trigger_reason: Type.Union([Type.Literal("periodic_due"), Type.Literal("list_version_changed")]),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    current_list_version: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    batch_size: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

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

interface MonitoringRunRow {
  run_id: string;
  status: string;
  trigger_reason: string;
  candidates_selected: number;
  rescreens_created: number;
  failures: number;
  started_at_utc: string;
  completed_at_utc: string | null;
}

/** Safe monitoring-run summary projection — no PII, no raw provider payload, no subject names, no
 * matched detail (the table itself carries none of these — see migration 039's own header
 * comment). */
function safeMonitoringRunResponse(row: MonitoringRunRow) {
  return {
    run_id: row.run_id,
    status: row.status,
    trigger_reason: row.trigger_reason,
    candidates_selected: row.candidates_selected,
    rescreens_created: row.rescreens_created,
    failures: row.failures,
    started_at_utc: row.started_at_utc,
    completed_at_utc: row.completed_at_utc,
  };
}

export async function registerMonitoringRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/monitoring-runs
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/monitoring-runs",
    { preHandler: requireInternal, schema: { body: CreateMonitoringRunBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof CreateMonitoringRunBody>;
      assertPoolAvailable();
      const config = app.config as Aml1Config;

      if (body.trigger_reason === "list_version_changed" && !body.current_list_version) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "current_list_version", issue: "required when trigger_reason is 'list_version_changed'" }],
        });
      }

      // Structural defence-in-depth — mirrors CFG-01's kill-switch `.activate` route: this
      // permission has no execute-verify fallback (requires_approval=false, migration 040), so the
      // baseline check IS the real gate and must be a genuine role-granted allow.
      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: "aml1.monitoring.run", resource: "monitoring_run" });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");
      if (baseline.reason !== "permission_granted") throw new Aml1Error("AML1_PERMISSION_DENIED");

      const requestedBatchSize = body.batch_size ?? config.monitoringBatchSizeDefault;
      const batchSize = Math.min(requestedBatchSize, config.monitoringBatchSizeMax);
      const runId = "aml1run_" + randomUUID();

      // ---------------------------------------------------------------------------------------
      // PHASE A (locked) — see file header comment. One dedicated connection holds the advisory
      // lock across candidate selection AND claiming; each claim itself runs on its OWN pooled
      // connection (lib/rescreen.ts's claimRescreen -> lib/screening-execution.ts's
      // beginScreening -> withTransaction).
      // ---------------------------------------------------------------------------------------
      const lockClient = await getPool().connect();
      const claims: RescreenClaim[] = [];
      let claimFailures = 0;
      let candidatesSelected = 0;
      try {
        await lockClient.query("BEGIN");
        await lockClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["aml1.monitoring_run"]);

        const selected =
          body.trigger_reason === "periodic_due"
            ? await selectPeriodicDueCandidates(lockClient, new Date(Date.now() - config.rescreenDueDays * 86_400_000), batchSize)
            : await selectListVersionChangedCandidates(lockClient, body.current_list_version as string, batchSize);
        candidatesSelected = selected.length;

        // Deliberately BEFORE the claim loop: this moves BOTH of this transaction's own writes
        // (the monitoring_run INSERT and the overdue/stuck-screening signal emissions below) ahead
        // of the claim loop, so a failure in either happens BEFORE any claim in THIS run commits —
        // not because it "preserves" the monitoring_run row on a later rollback (a rollback
        // discards this whole transaction, run row included; see the residual-risk note below for
        // what actually survives a failure here — the per-candidate CLAIMS, which commit on their
        // own separate connections, not this one).
        await createMonitoringRun(lockClient, {
          runId,
          triggerReason: body.trigger_reason,
          requestedBy: body.requested_by,
          candidatesSelected,
          requestId: request.ctx.request_id,
          correlationId: request.ctx.correlation_id,
        });

        if (body.trigger_reason === "periodic_due") {
          await emitOverdueSignalsForCandidates(lockClient, selected, body.requested_by, request.ctx.request_id, request.ctx.correlation_id);
        }

        // Phase 3D — stuck-requested-subject visibility (confirmed decision D6: detect + signal
        // only, never auto-recover/auto-fail). Runs for BOTH trigger reasons; never counted in
        // candidates_selected/rescreens_created/failures below (a fully separate code path — see
        // lib/monitoring.ts's own header comment).
        await emitStuckScreeningSignalsForCandidates(lockClient, config.stuckScreeningThresholdSeconds, batchSize, body.requested_by);

        for (const candidate of selected) {
          try {
            const claimOutcome = await claimRescreen({
              app,
              sourceScreeningRequestId: candidate.sourceScreeningRequestId,
              triggerReason: body.trigger_reason,
              requestedBy: body.requested_by,
              requestId: request.ctx.request_id,
              correlationId: request.ctx.correlation_id,
            });
            if (claimOutcome.kind === "claimed") {
              claims.push(claimOutcome.claim);
            } else {
              claimFailures += 1;
            }
          } catch {
            // A claim can genuinely fail (e.g. the partial-unique-index backstop firing against a
            // concurrent MANUAL re-screen of the same subject) — counted, never thrown out of Phase A.
            claimFailures += 1;
          }
        }

        await lockClient.query("COMMIT");
      } catch (err) {
        await lockClient.query("ROLLBACK").catch(() => {});
        lockClient.release();
        // RESIDUAL RISK, documented (mirrors the accepted "crash between TX1/TX2" posture
        // routes/screening.ts's own Phase 3B header comment already carries): each `claimRescreen`
        // above commits on its OWN pooled connection, independently of this lock-holding
        // transaction. If Phase A fails AFTER one or more claims already committed but BEFORE this
        // transaction itself commits (e.g. a lost connection, or the advisory-lock query itself
        // failing), those claimed `screening_request` rows remain durably `status='requested'` —
        // correct, safe, and non-corrupting (identical shape to any other in-flight screen), but
        // orphaned from a `monitoring_run` row and from Phase B's completion loop. No retry/resume
        // route exists for this case this phase — same "not implemented, not attempted, not
        // silently ignored" carry-forward discipline the Phase 3B provider lifecycle already
        // established for its own analogous crash window.
        if (err instanceof Aml1Error) throw err;
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      }
      lockClient.release();

      // ---------------------------------------------------------------------------------------
      // PHASE B (unlocked) — provider call + TX2 completion, exactly once per claimed candidate.
      // ---------------------------------------------------------------------------------------
      let rescreensCreated = 0;
      let failures = claimFailures;
      for (const claim of claims) {
        try {
          const outcome = await completeRescreenClaim(claim, { requestId: request.ctx.request_id, correlationId: request.ctx.correlation_id });
          if (outcome.kind === "completed") rescreensCreated += 1;
          else failures += 1;
        } catch {
          failures += 1;
        }
      }

      // ---------------------------------------------------------------------------------------
      // Finalize — atomic, throws AML1_MONITORING_RUN_INVALID_STATE if the row is somehow no
      // longer 'running' (see lib/monitoring.ts's own header comment).
      // ---------------------------------------------------------------------------------------
      const status = await withTransaction((client) =>
        finalizeMonitoringRun(client, {
          runId,
          candidatesSelected,
          rescreensCreated,
          failures,
          requestedBy: body.requested_by,
        }),
      ).catch((err) => {
        if (err instanceof Aml1Error) throw err;
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      });

      return reply.code(201).send(
        successEnvelope(
          { run_id: runId, status, trigger_reason: body.trigger_reason, candidates_selected: candidatesSelected, rescreens_created: rescreensCreated, failures },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/monitoring-runs/:run_id
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/monitoring-runs/:run_id",
    { preHandler: requireInternal, schema: { params: RunIdParams, querystring: ActorQuery } },
    async (request, reply) => {
      const { run_id } = request.params as { run_id: string };
      const { actor_id } = request.query as Static<typeof ActorQuery>;
      assertPoolAvailable();

      // No AML-01-specific "not found" code exists for this table (see lib/errors.ts's own Phase
      // 3C header comment) — reuses @aix/foundation's generic NOT_FOUND, same as CFG-01's own
      // kill-switch-apply precedent for an analogous generic-lookup-miss.
      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "aml1.monitoring.run", resource: "monitoring_run", entityId: run_id });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const rows = await query<MonitoringRunRow>(
        getPool(),
        `SELECT run_id, status, trigger_reason, candidates_selected, rescreens_created, failures, started_at_utc, completed_at_utc
           FROM aml1.monitoring_run WHERE run_id = $1`,
        [run_id],
      );
      const row = rows[0];
      if (!row) throw new AppError("NOT_FOUND");

      return reply.send(successEnvelope(safeMonitoringRunResponse(row), meta(request)));
    },
  );
}
