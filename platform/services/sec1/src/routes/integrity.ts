/**
 * SEC-01 Phase 3 integrity-verification-run route (blueprint §2.11; approved plan §6/§7).
 *
 * `POST /internal/sec1/integrity/verify-range` is guarded by the GENERIC internal-identity
 * guard (plugins/internal-identity.ts) — same rationale as routes/seals.ts: this is an
 * on-demand operational/administrative action over any stream range (sealed or not), not
 * attributable to a specific external source module.
 *
 * Explicit range input only this phase (caller supplies `stream_id` + `from_sequence_no`/
 * `to_sequence_no` — no "auto-detect what's unsealed" convenience yet, keeping the surface
 * minimal and testable, per the approved plan §7). No scheduler/cron wiring — callable
 * on-demand only.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeSec1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { getIntegrityVerificationRunById, runIntegrityVerification } from "../lib/integrity.js";
import { Sec1Error } from "../lib/errors.js";
import { createAlertForFailedIntegrityVerification } from "../lib/alerts.js";
import { writeMonitoringDeadLetter } from "../lib/monitoring-dead-letter.js";

const VerifyRangeBody = Type.Object(
  {
    stream_id: Type.String({ minLength: 1, maxLength: 160 }),
    from_sequence_no: Type.Integer({ minimum: 1 }),
    to_sequence_no: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export async function registerIntegrityRoutes(app: FastifyInstance): Promise<void> {
  const requireInternalIdentity = makeSec1InternalIdentityGuard(app.config.sec1InternalServiceToken);

  app.post(
    "/internal/sec1/integrity/verify-range",
    { preHandler: requireInternalIdentity, schema: { body: VerifyRangeBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof VerifyRangeBody>;
      if (body.from_sequence_no > body.to_sequence_no) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "from_sequence_no", issue: "must be <= to_sequence_no" }],
        });
      }
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "sec1_internal_service";

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "sec1.integrity.verify_range",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") {
          // P3-L1 fix: same key + same body — return the ORIGINAL recorded run instead of
          // inserting a second integrity_verification_run row for what is a single logical
          // request (a client retry after e.g. a network timeout).
          const priorRun = idem.resultRef ? await getIntegrityVerificationRunById(client, idem.resultRef) : null;
          if (!priorRun) {
            throw new Sec1Error("SEC1_AUDIT_PERSIST_FAILED", {
              message: "Prior integrity verification run could not be resolved for idempotent replay.",
            });
          }
          return priorRun;
        }
        const runResult = await runIntegrityVerification(client, {
          streamId: body.stream_id,
          fromSequenceNo: body.from_sequence_no,
          toSequenceNo: body.to_sequence_no,
        });
        await completeIdempotent(client, idemScope, runResult.verification_id);
        return runResult;
      });

      // Phase 5: closes the `failed -> alert_created` state-machine transition
      // (06_State_Machine.md §4) that Phase 3 built the `failed` half of but never wired to an
      // alert. Best-effort, run AFTER `result` is already computed/persisted above — the
      // verification result returned below is authoritative regardless of whether this
      // alert-creation side-effect succeeds. `createAlertForFailedIntegrityVerification` is
      // itself naturally idempotent (de-dupes on an already-open alert for this
      // verification_id), so this is safe to run on an idempotent-replay response too.
      if (result.result === "fail") {
        try {
          await withTransaction((client) =>
            createAlertForFailedIntegrityVerification(client, {
              verificationId: result.verification_id,
              streamId: result.stream_id,
              fromSequenceNo: result.from_sequence_no,
              toSequenceNo: result.to_sequence_no,
              gapCount: result.gap_count,
              mismatchCount: result.mismatch_count,
            }),
          );
        } catch (err) {
          const alertCreationFailureReason = `Failed to create alert for failed integrity verification ${result.verification_id}: ${
            err instanceof Error ? err.message : String(err)
          }`;
          try {
            await withTransaction((client) =>
              writeMonitoringDeadLetter(client, {
                auditEventRef: null,
                ruleId: null,
                failureReason: alertCreationFailureReason,
                severity: "critical",
              }),
            );
          } catch (dlqErr) {
            // Monitoring-of-monitoring failure — nothing further to do; the verification
            // result above is already returned to the caller regardless. LOW-1 (Opus review):
            // otherwise-silent, so log it. No sensitive payload/token/raw metadata — only
            // stable identifiers and the two (already-safe, code-generated) failure reasons.
            // Fastify's own request-scoped logger already attaches request/correlation IDs.
            request.log.warn(
              {
                code: "SEC1_MONITORING_DEAD_LETTER_WRITE_FAILED",
                entity_type: "integrity_verification_run",
                entity_id: result.verification_id,
                severity: "critical",
                original_failure_reason: alertCreationFailureReason,
                write_failure_reason: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
              },
              "sec1.monitoring_dead_letter write itself failed",
            );
          }
        }
      }

      return reply.send(successEnvelope(result, meta(request)));
    },
  );
}
