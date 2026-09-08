/**
 * CLT-01 Phase 2 — CDD outcome receipt + handoff-status tracking routes (blueprint
 * `04_API_Specification.md` §5.1-§5.5, adapted to the approved Phase 2 scope). Internal-only, and
 * — unlike routes/decisions.ts — internal-IDENTITY-guarded only, NOT IAM-02-permission-gated
 * (approved Phase 2 design decision: outcome receipt and handoff creation are service-to-service
 * ingestion/bookkeeping endpoints, called by a future KYC-01/AML-01 module or a test fixture, the
 * same posture CFG-01's own `evaluate()` and SEC-01's audit-ingestion API use for the identical
 * dependency shape — not a human-permission-checked action). The one exception is
 * `GET .../outcome-status`, which IS IAM-02-gated (`clt1.cdd_outcome.read`) since it is a human
 * operator's read, not a machine ingestion call.
 *
 * No actual KYC/KYB/AML/sanctions/PEP/adverse-media screening logic anywhere in this file — these
 * routes only RECEIVE and RECORD outcome data a future module (or a test fixture) supplies; see
 * lib/outcomes.ts for the pure gate-evaluation logic these routes call.
 *
 * `handoff_status` rows are delivery-tracking ONLY (blueprint data rule 12: "Handoff delivery is
 * separate from outcome status") — creating one never calls any external module, and a received
 * `cdd_outcome` is deliberately NOT auto-linked back into a `handoff_status` row.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.1 — atomic `kyc_kyb` receipt (migration `047_clt1_atomic_kyc_roster_binding.cjs`).
 * ---------------------------------------------------------------------------------------
 * Closes a confirmed, empirically-reproduced TOCTOU: a KYC-01 roster read (the accepted Phase 4A
 * `GET .../kyc-roster` contract) followed by an outcome POST here was never atomic with respect to
 * an intervening `authorised_party` mutation — this route never read `authorised_party` at all, so
 * a stale `pass` computed over an outdated roster was silently accepted. See the KYC-01 Phase 4
 * delivery-atomicity planning amendment for the reproduction.
 *
 * `expected_roster_hash` is now REQUIRED (and format-validated by the body schema's own `pattern`)
 * whenever `outcome_type = 'kyc_kyb'` — enforced by an explicit runtime check below, since a
 * cross-field "required when" rule cannot be expressed by TypeBox's `Type.Optional` alone. It is
 * OPTIONAL and ignored for every other `outcome_type` (`aml_sanctions`/`pep_adverse_media`/
 * `risk_rating` never touch the authorised-party roster) — AML-01's own accepted delivery client
 * (`services/aml1/src/lib/clt1-client.ts`) calls this exact route for non-`kyc_kyb` outcome types
 * and must continue to work completely unchanged.
 *
 * The `kyc_kyb` transaction below acquires `lib/kyc-roster.ts`'s shared application-scoped
 * advisory lock as its OWN FIRST STATEMENT (before any row read/lock/mutation — see that file's
 * own header comment for the full deadlock-freedom argument), re-reads the current application
 * status under that lock, and — for `kyc_kyb` only — recomputes the CURRENT roster digest via
 * `fetchCurrentRosterHash` (the accepted Phase 4A canonical helper, never reimplemented) and
 * compares it against the caller's `expected_roster_hash`. A mismatch is a `CLT1_KYC_ROSTER_STALE`
 * refusal: NO `cdd_outcome` row and NO rollup/`kyc_roster_hash` update are ever produced, but the
 * refusal itself IS durably audited (`clt1.kyc_outcome_refused`) via the same resolve-once,
 * commit-the-audit-then-throw-outside pattern KYC-01's own MED-3 fix established — never an
 * uncommitted/unaudited stale refusal, and never a `clt1.cdd_outcome_received` event on this path.
 * On an exact match, `cdd_outcome.kyc_roster_hash` is set once, immutably, to the digest THIS
 * receipt was accepted against, and `client_application.kyc_roster_hash` is updated to the SAME
 * value — read later by `routes/decisions.ts`'s `approve/apply` recheck, under the SAME lock, to
 * close the second, larger window (a roster that changes AFTER a genuine pass but BEFORE final
 * approval).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { applicationNotFound, validateTransition, type ClientApplicationRow } from "../lib/applications.js";
import {
  CDD_OUTCOME_STATUSES,
  CDD_OUTCOME_TYPES,
  CDD_RISK_RATINGS,
  isCddGateReady,
  rollupColumnForOutcomeType,
  type CddOutcomeStatus,
  type CddOutcomeType,
} from "../lib/outcomes.js";
import { acquireKycRosterLock, fetchCurrentRosterHash } from "../lib/kyc-roster.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const OutcomeStatusQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const OutcomeTypeSchema = Type.Union(CDD_OUTCOME_TYPES.map((t) => Type.Literal(t)));
const OutcomeStatusSchema = Type.Union(CDD_OUTCOME_STATUSES.map((s) => Type.Literal(s)));
const RiskRatingSchema = Type.Union(CDD_RISK_RATINGS.map((r) => Type.Literal(r)));

/** Phase 4A.1 — matches the exact `sha256:<64 hex>` format `@aix/foundation`'s `fingerprint()`
 * produces and the Phase 4A roster route already returns. A present-but-malformed value is
 * rejected by THIS schema pattern (mapped to the shared foundation `VALIDATION_ERROR`/400 by the
 * request-context error handler) — no bespoke format-error code. */
const ExpectedRosterHashSchema = Type.String({ pattern: "^sha256:[0-9a-f]{64}$", maxLength: 128 });

const ReceiveOutcomeBody = Type.Object(
  {
    outcome_type: OutcomeTypeSchema,
    outcome_status: OutcomeStatusSchema,
    risk_rating: Type.Optional(RiskRatingSchema),
    valid_until_utc: Type.Optional(Type.String({ maxLength: 40 })),
    source_module: Type.String({ minLength: 1, maxLength: 32 }),
    created_by: Type.String({ minLength: 1, maxLength: 64 }),
    expected_roster_hash: Type.Optional(ExpectedRosterHashSchema),
  },
  { additionalProperties: false },
);

const HandoffBody = Type.Object({ created_by: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

async function fetchApplicationOrThrow(applicationId: string): Promise<ClientApplicationRow> {
  const rows = await query<ClientApplicationRow>(getPool(), `SELECT * FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
  const row = rows[0];
  if (!row) applicationNotFound();
  return row;
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Clt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerOutcomeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -----------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/outcomes
  // -----------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/outcomes",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ReceiveOutcomeBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof ReceiveOutcomeBody>;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "receive-outcome");

      const isKycKyb = body.outcome_type === "kyc_kyb";
      if (isKycKyb && body.expected_roster_hash === undefined) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "expected_roster_hash", issue: "required when outcome_type='kyc_kyb'" }],
        });
      }

      const outcomeId = "clt1cdd_" + randomUUID();
      const rollupColumn = rollupColumnForOutcomeType(body.outcome_type as CddOutcomeType);

      type ReceiveOutcomeResult =
        | { kind: "raced"; error: Clt1Error }
        | { kind: "stale"; expectedRosterHash: string; currentRosterHash: string }
        | { kind: "applied"; outcome: { outcome_id: string; outcome_type: string; outcome_status: string; received_at_utc: string } };

      let result: ReceiveOutcomeResult;
      try {
        result = await withTransaction(async (client) => {
          // Phase 4A.1 — FIRST statement, before any row read/lock/mutation. See
          // lib/kyc-roster.ts's own header comment for the full ordering/deadlock-freedom
          // argument. Acquired unconditionally (not only for kyc_kyb) so a concurrent kyc_kyb
          // receipt on the SAME application is always serialized against any other outcome-type
          // receipt too — cheap, and removes any need to reason about cross-outcome-type races.
          await acquireKycRosterLock(client, application_id);

          const lockedAppRows = await query<{ status: string; applicant_type: ClientApplicationRow["applicant_type"] }>(
            client,
            `SELECT status, applicant_type FROM clt1.client_application WHERE application_id = $1`,
            [application_id],
          );
          const lockedApp = lockedAppRows[0];
          if (!lockedApp || lockedApp.status !== "under_review") {
            return { kind: "raced", error: new Clt1Error("CLT1_APPLICATION_INVALID_STATE", { details: [{ field: "status", issue: "application status changed concurrently" }] }) };
          }

          let acceptedRosterHash: string | null = null;
          if (isKycKyb) {
            const currentRosterHash = await fetchCurrentRosterHash(client, application_id, { application_status: lockedApp.status, applicant_type: lockedApp.applicant_type });
            if (currentRosterHash !== body.expected_roster_hash) {
              await publishAudit(client, {
                event_type: "clt1.kyc_outcome_refused",
                source_module: "CLT-01",
                actor_id: body.created_by,
                actor_type: "service",
                entity_type: "client_application",
                entity_id: application_id,
                severity: "high",
                action: "cdd_outcome.receive",
                result: "blocked",
                reason_code: "roster_stale",
                metadata: { application_id, expected_roster_hash: body.expected_roster_hash, current_roster_hash: currentRosterHash, reason_code: "roster_stale" },
              });
              return { kind: "stale", expectedRosterHash: body.expected_roster_hash!, currentRosterHash };
            }
            acceptedRosterHash = currentRosterHash;
          }

          const outcomeRows = await query<{ outcome_id: string; outcome_type: string; outcome_status: string; received_at_utc: string }>(
            client,
            `INSERT INTO clt1.cdd_outcome
               (outcome_id, application_id, client_id, source_module, outcome_type, outcome_status, risk_rating, valid_until_utc, created_by, request_id, correlation_id, kyc_roster_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING outcome_id, outcome_type, outcome_status, received_at_utc`,
            [
              outcomeId,
              application_id,
              current.client_id,
              body.source_module,
              body.outcome_type,
              body.outcome_status,
              body.risk_rating ?? null,
              body.valid_until_utc ?? null,
              body.created_by,
              request.ctx.request_id,
              request.ctx.correlation_id,
              acceptedRosterHash,
            ],
          );

          const updateRows = await query<{ application_id: string }>(
            client,
            `UPDATE clt1.client_application SET
               ${rollupColumn} = $2, version = version + 1, updated_at_utc = now()
               ${isKycKyb ? ", kyc_roster_hash = $3" : ""}
             WHERE application_id = $1 AND status = 'under_review'
             RETURNING application_id`,
            isKycKyb ? [application_id, body.outcome_status, acceptedRosterHash] : [application_id, body.outcome_status],
          );
          if (updateRows.length === 0) {
            // Unreachable in practice — we hold the advisory lock and just re-read this exact row
            // as 'under_review' above, and every other participant in the lock discipline must
            // acquire the SAME lock before writing `status`. Kept as defense in depth, matching
            // this file's own pre-047 precedent, rather than assumed impossible.
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }

          await publishAudit(client, {
            event_type: "clt1.cdd_outcome_received",
            source_module: "CLT-01",
            actor_id: body.created_by,
            actor_type: "service",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "high",
            action: "cdd_outcome.receive",
            result: "success",
            metadata: { outcome_id: outcomeId, outcome_type: body.outcome_type, outcome_status: body.outcome_status, source_module: body.source_module },
          });

          const badOutcome = body.outcome_status === "fail" || body.outcome_status === "hit" || body.outcome_status === "rejected";
          if (badOutcome) {
            await publishAudit(client, {
              event_type: "clt1.cdd_outcome_failed",
              source_module: "CLT-01",
              actor_id: body.created_by,
              actor_type: "service",
              entity_type: "client_application",
              entity_id: application_id,
              severity: "critical",
              action: "cdd_outcome.receive",
              result: "blocked",
              reason_code: body.outcome_status as CddOutcomeStatus,
              metadata: { outcome_id: outcomeId, outcome_type: body.outcome_type },
            });
          }

          return { kind: "applied", outcome: outcomeRows[0]! };
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (result.kind === "raced") throw result.error;
      if (result.kind === "stale") {
        throw new Clt1Error("CLT1_KYC_ROSTER_STALE", {
          details: [{ field: "expected_roster_hash", issue: `expected=${result.expectedRosterHash} current=${result.currentRosterHash}` }],
        });
      }

      return reply.code(201).send(successEnvelope(result.outcome, meta(request)));
    },
  );

  // -----------------------------------------------------------------------------------------
  // GET /internal/clt1/applications/:application_id/outcome-status — IAM-02-gated read.
  // -----------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/applications/:application_id/outcome-status",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, querystring: OutcomeStatusQuery } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const { actor_id } = request.query as Static<typeof OutcomeStatusQuery>;
      assertPoolAvailable();
      const current = await fetchApplicationOrThrow(application_id);

      const baseline = await checkPermission(iam2Config(app), {
        actorId: actor_id,
        action: "clt1.cdd_outcome.read",
        resource: "cdd_outcome",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      return reply.send(
        successEnvelope(
          {
            application_id,
            cdd_outcome_status: current.cdd_outcome_status,
            aml_sanctions_status: current.aml_sanctions_status,
            pep_adverse_media_status: current.pep_adverse_media_status,
            risk_rating_status: current.risk_rating_status,
            gate_ready: isCddGateReady(current),
          },
          meta(request),
        ),
      );
    },
  );

  // -----------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/handoff/kyc-kyb
  // POST /internal/clt1/applications/:application_id/handoff/aml
  // -----------------------------------------------------------------------------------------
  async function createHandoff(applicationId: string, targetModule: "KYC" | "AML", createdBy: string): Promise<{ handoff_id: string; target_module: string; delivery_status: string }> {
    const current = await fetchApplicationOrThrow(applicationId);
    validateTransition(current.status, "handoff");

    const handoffId = "clt1ho_" + randomUUID();
    try {
      return await withTransaction(async (client) => {
        const rows = await query<{ handoff_id: string; target_module: string; delivery_status: string }>(
          client,
          `INSERT INTO clt1.handoff_status (handoff_id, application_id, client_id, target_module, delivery_status, created_by)
           VALUES ($1,$2,$3,$4,'pending',$5)
           RETURNING handoff_id, target_module, delivery_status`,
          [handoffId, applicationId, current.client_id, targetModule, createdBy],
        );
        await publishAudit(client, {
          event_type: targetModule === "KYC" ? "clt1.kyc_handoff_created" : "clt1.aml_handoff_created",
          source_module: "CLT-01",
          actor_id: createdBy,
          actor_type: "service",
          entity_type: "client_application",
          entity_id: applicationId,
          severity: "medium",
          action: "handoff.create",
          result: "success",
          metadata: { handoff_id: handoffId, target_module: targetModule },
        });
        return rows[0]!;
      });
    } catch (err) {
      if (err instanceof Clt1Error) throw err;
      throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
    }
  }

  app.post(
    "/internal/clt1/applications/:application_id/handoff/kyc-kyb",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: HandoffBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof HandoffBody>;
      assertPoolAvailable();
      const handoff = await createHandoff(application_id, "KYC", body.created_by);
      return reply.code(201).send(successEnvelope(handoff, meta(request)));
    },
  );

  app.post(
    "/internal/clt1/applications/:application_id/handoff/aml",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: HandoffBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof HandoffBody>;
      assertPoolAvailable();
      const handoff = await createHandoff(application_id, "AML", body.created_by);
      return reply.code(201).send(successEnvelope(handoff, meta(request)));
    },
  );

  // -----------------------------------------------------------------------------------------
  // GET /internal/clt1/applications/:application_id/handoff-status
  // -----------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/applications/:application_id/handoff-status",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      assertPoolAvailable();
      await fetchApplicationOrThrow(application_id);

      const rows = await query<{ target_module: string; delivery_status: string; retry_count: number; sent_at_utc: string | null; completed_at_utc: string | null }>(
        getPool(),
        `SELECT target_module, delivery_status, retry_count, sent_at_utc, completed_at_utc
           FROM clt1.handoff_status WHERE application_id = $1 ORDER BY created_at_utc ASC`,
        [application_id],
      );

      return reply.send(successEnvelope({ application_id, handoffs: rows }, meta(request)));
    },
  );
}
