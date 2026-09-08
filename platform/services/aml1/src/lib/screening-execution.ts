/**
 * AML-01 — the shared two-phase (TX1 -> provider call OUTSIDE any transaction -> TX2) screening
 * execution core, extracted from `routes/screening.ts`'s own Phase 3B implementation so Phase 3C's
 * re-screen/monitoring paths (`lib/rescreen.ts`) can run through the EXACT SAME lifecycle
 * (confirmed Phase 3C decision: "re-screen runs through existing Phase 3B provider lifecycle";
 * monitoring "create[s] re-screen requests using the same re-screen helper/path logic") instead of
 * a second, drifting copy of this logic. `routes/screening.ts`'s own `POST .../screening-requests`
 * handler is refactored to call `executeScreening` too — its own behaviour (audit event names,
 * error codes, response shape) is UNCHANGED by this extraction; only the code's location moved.
 *
 * Unlike `lib/screening.ts` / `lib/match-disposition.ts` (deliberately pure, no DB/HTTP), THIS
 * file performs real DB writes and the real provider call — it is the shared "route body", not
 * pure business logic, same posture `lib/clt1-client.ts`/`lib/iam2-client.ts` already have for
 * their own DB-free-but-IO-performing role.
 *
 * `executeScreening` = `beginScreening` (TX1) followed immediately by `completeScreening`
 * (provider call + TX2) — used by `routes/screening.ts` (original create) and by
 * `lib/rescreen.ts`'s `performRescreen` (the single, direct manual/API-triggered re-screen path).
 *
 * The TWO STEPS are exposed SEPARATELY for `routes/monitoring.ts`'s own batch flow, which needs to
 * CLAIM every selected candidate (run every candidate's TX1 — reserving the subject via migration
 * 039's own partial unique index) WHILE STILL HOLDING the route's advisory lock, and only run the
 * (potentially slow, per-candidate) provider calls + TX2 AFTER the lock is released — see
 * `routes/monitoring.ts`'s own header comment for the full concurrency-safety rationale. Splitting
 * the two phases is what makes that possible without holding the advisory-lock transaction open
 * across a batch of provider calls (which `lib/monitoring.ts`'s "no direct provider calls inside
 * monitoring transaction" discipline forbids).
 */
import { randomUUID } from "node:crypto";
import { fingerprint, getPool, publishAudit, query, withTransaction } from "@aix/foundation";
import {
  buildProviderScreeningPayload,
  clampFailureReasonCode,
  deriveOverallStatus,
  normalizeProviderMatches,
  safeScreeningResponse,
  type DeclaredIdentity,
  type NormalizedMatch,
  type ScreeningProvenance,
  type ScreeningSubjectType,
  type SafeScreeningResponse,
} from "./screening.js";
import { emitRiskSignal, severityForUnresolvedMatch } from "./risk-signals.js";
import { screenViaProvider } from "./providers/registry.js";
import type { ProviderScreeningPayload, ScreeningProvider, SubjectNature } from "./providers/types.js";
import { Aml1Error, type Aml1ErrorCode } from "./errors.js";

export type ScreeningTriggerReason = "manual" | "periodic_due" | "list_version_changed";

/** Detects migration 039's partial unique index violation (`idx_aml1_screening_request_one_inflight_per_subject`)
 * so `beginScreening` can map it to a caller-supplied code instead of the generic
 * `AML1_AUDIT_REQUIRED` catch-all — mirrors CLT-01's own `isAlreadyOpenViolation` precedent
 * (`routes/duplicate-candidates.ts`). */
function isInFlightDuplicateViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_aml1_screening_request_one_inflight_per_subject";
}

export interface BeginScreeningInput {
  screeningRequestId: string;
  attemptId: string;
  subjectType: ScreeningSubjectType;
  subjectRef: string;
  subjectParentRef: string | null;
  subjectNature: SubjectNature;
  provenance: ScreeningProvenance;
  requestedBy: string;
  declaredIdentity: DeclaredIdentity;
  rescreenOfRequestId: string | null;
  triggerReason: ScreeningTriggerReason | null;
  provider: ScreeningProvider;
  requestId?: string;
  correlationId?: string;
  createdEventType: string;
  /** Phase 3C only — see file header comment. Left `undefined` by the original create route. */
  inFlightDuplicateErrorCode?: Aml1ErrorCode;
}

export interface BeginScreeningResult {
  providerPayload: ProviderScreeningPayload;
}

/**
 * TX1 — INSERT the request ('requested'), its PII snapshot, and a 'pending' provider attempt;
 * publish the created-event; commit. Returns the MINIMIZED provider payload `completeScreening`
 * needs for the actual provider call — computed here (not recomputed later) so the payload-hash
 * bound into `screening_provider_attempt.request_payload_hash` and the payload actually sent are
 * guaranteed identical.
 */
export async function beginScreening(input: BeginScreeningInput): Promise<BeginScreeningResult> {
  const { screeningRequestId, attemptId, provider, requestedBy } = input;
  const providerPayload = buildProviderScreeningPayload(input.subjectNature, input.declaredIdentity);
  const requestPayloadHash = fingerprint(providerPayload);

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO aml1.screening_request
           (screening_request_id, subject_type, subject_ref, subject_parent_ref, provenance, status, requested_by, rescreen_of_request_id, trigger_reason, request_id, correlation_id)
         VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8,$9,$10)`,
        [
          screeningRequestId,
          input.subjectType,
          input.subjectRef,
          input.subjectParentRef,
          input.provenance,
          requestedBy,
          input.rescreenOfRequestId,
          input.triggerReason,
          input.requestId ?? null,
          input.correlationId ?? null,
        ],
      );

      await client.query(
        `INSERT INTO aml1.screening_subject_snapshot
           (screening_request_id, subject_type, name, registration_number, country, date_of_birth, nationality, provenance, subject_nature)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          screeningRequestId,
          input.subjectType,
          input.declaredIdentity.name,
          input.declaredIdentity.registration_number ?? null,
          input.declaredIdentity.country ?? null,
          input.declaredIdentity.date_of_birth ?? null,
          input.declaredIdentity.nationality ?? null,
          input.provenance,
          input.subjectNature,
        ],
      );

      await client.query(
        `INSERT INTO aml1.screening_provider_attempt
           (attempt_id, screening_request_id, provider_id, provider_adaptor_version, request_payload_hash, status)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [attemptId, screeningRequestId, provider.providerId, provider.adaptorVersion, requestPayloadHash],
      );

      await publishAudit(client, {
        event_type: input.createdEventType,
        source_module: "AML-01",
        actor_id: requestedBy,
        actor_type: "service",
        entity_type: "screening_request",
        entity_id: screeningRequestId,
        severity: "medium",
        action: "screening_request.create",
        result: "success",
        metadata: {
          screening_request_id: screeningRequestId,
          subject_type: input.subjectType,
          subject_ref: input.subjectRef,
          subject_nature: input.subjectNature,
          attempt_id: attemptId,
          provider_id: provider.providerId,
          provider_adaptor_version: provider.adaptorVersion,
          ...(input.rescreenOfRequestId
            ? { rescreen_of_request_id: input.rescreenOfRequestId, trigger_reason: input.triggerReason }
            : {}),
        },
      });
    });
  } catch (err) {
    if (err instanceof Aml1Error) throw err;
    if (input.inFlightDuplicateErrorCode && isInFlightDuplicateViolation(err)) {
      throw new Aml1Error(input.inFlightDuplicateErrorCode, { cause: err });
    }
    throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
  }

  return { providerPayload };
}

export interface CompleteScreeningInput {
  screeningRequestId: string;
  attemptId: string;
  subjectType: ScreeningSubjectType;
  subjectRef: string;
  subjectParentRef: string | null;
  requestedBy: string;
  provider: ScreeningProvider;
  providerPayload: ProviderScreeningPayload;
  completedEventType: string;
  requestId?: string;
  correlationId?: string;
  /** Phase 3C only — see file header comment. `false`/unset for the original create route. */
  emitPotentialMatchSignals?: boolean;
}

export type ExecuteScreeningOutcome =
  | { kind: "completed"; screeningRequestId: string; matchedCategories: string[] }
  | { kind: "failed"; screeningRequestId: string; errorCode: "AML1_SCREENING_PROVIDER_UNAVAILABLE" | "AML1_VENDOR_RESPONSE_INVALID" }
  | { kind: "aborted"; screeningRequestId: string };

/**
 * Provider call (OUTSIDE any transaction, timeout-bounded — `lib/providers/registry.ts`) followed
 * by TX2 — record the provider-attempt outcome; on success write result/matches and complete the
 * request (Phase 3C: optionally emit `potential_match_unresolved` risk signals in the SAME
 * transaction — atomic with the match rows they describe); on any failure, fail the request.
 *
 * Phase 3D TX2 concurrency guard: once `routes/stuck-screening.ts`'s recover route exists, a
 * `screening_request` this function is mid-flight on can be marked `failed` by an operator BEFORE
 * this provider call returns (the whole point of stuck-screening recovery is to unblock a request
 * exactly like this one). Without a guard, a late-landing TX2 here would write `screening_result`/
 * `screening_match` rows and resurrect `status` back to `completed` UNDER an operator's own
 * `failed` decision — silently corrupting the very evidence recovery just recorded. `FOR UPDATE`
 * here (the row's own lock, the SAME one the recover route's transaction takes) makes the two
 * transactions serialize on this one row: whichever commits first wins, and the loser observes the
 * winner's outcome. The re-check MUST be the very first statement in this transaction, BEFORE any
 * `screening_result`/`screening_match` INSERT — otherwise a losing TX2 would leave orphaned
 * evidence rows attached to a request its own transaction is about to discover was recovered.
 */
export async function completeScreening(input: CompleteScreeningInput): Promise<ExecuteScreeningOutcome> {
  const { screeningRequestId, attemptId, provider, requestedBy, providerPayload } = input;

  const startedAtMs = Date.now();
  const providerOutcome = await screenViaProvider(provider, providerPayload);
  const latencyMs = Date.now() - startedAtMs;

  let normalizedMatches: NormalizedMatch[] | null = null;
  let overallStatus: "clear" | "potential_match" | null = null;
  let failureReasonCode: string | null = null;
  let failureErrorCode: "AML1_SCREENING_PROVIDER_UNAVAILABLE" | "AML1_VENDOR_RESPONSE_INVALID" | null = null;
  let responsePayloadHash: string | null = null;

  if (providerOutcome.kind === "unavailable") {
    failureReasonCode = clampFailureReasonCode(providerOutcome.reasonCode);
    failureErrorCode = "AML1_SCREENING_PROVIDER_UNAVAILABLE";
  } else if (providerOutcome.kind === "invalid_response") {
    failureReasonCode = clampFailureReasonCode(providerOutcome.reasonCode);
    failureErrorCode = "AML1_VENDOR_RESPONSE_INVALID";
  } else {
    responsePayloadHash = fingerprint({ listVersion: providerOutcome.listVersion, providerReferenceId: providerOutcome.providerReferenceId, rawMatches: providerOutcome.rawMatches });
    normalizedMatches = normalizeProviderMatches(providerOutcome.rawMatches);
    if (normalizedMatches === null) {
      failureReasonCode = clampFailureReasonCode("unknown_match_category");
      failureErrorCode = "AML1_VENDOR_RESPONSE_INVALID";
    } else {
      overallStatus = deriveOverallStatus(normalizedMatches);
    }
  }

  let outcome: ExecuteScreeningOutcome;
  try {
    outcome = await withTransaction(async (client) => {
      // TX2 concurrency guard — see this function's own header comment. Must be the FIRST
      // statement, before any screening_result/screening_match INSERT.
      const guardRows = await client.query<{ status: string }>(
        `SELECT status FROM aml1.screening_request WHERE screening_request_id = $1 FOR UPDATE`,
        [screeningRequestId],
      );
      if (guardRows.rows[0]?.status !== "requested") {
        return { kind: "aborted", screeningRequestId } as ExecuteScreeningOutcome;
      }

      if (overallStatus !== null && normalizedMatches !== null) {
        await client.query(
          `UPDATE aml1.screening_provider_attempt SET
             status = 'succeeded', provider_reference_id = $2, provider_list_version = $3,
             response_payload_hash = $4, latency_ms = $5, checked_at_utc = now()
           WHERE attempt_id = $1`,
          [
            attemptId,
            providerOutcome.kind === "screened" ? providerOutcome.providerReferenceId : null,
            providerOutcome.kind === "screened" ? providerOutcome.listVersion : null,
            responsePayloadHash,
            latencyMs,
          ],
        );

        const screeningResultId = "aml1res_" + randomUUID();
        const screenedAtUtc = new Date().toISOString();
        await client.query(
          `INSERT INTO aml1.screening_result (screening_result_id, screening_request_id, overall_status, provider_ref, screened_at_utc)
           VALUES ($1,$2,$3,$4,$5)`,
          [screeningResultId, screeningRequestId, overallStatus, provider.providerId, screenedAtUtc],
        );

        const matchedCategories: string[] = [];
        for (const match of normalizedMatches) {
          const screeningMatchId = "aml1match_" + randomUUID();
          await client.query(
            `INSERT INTO aml1.screening_match (screening_match_id, screening_result_id, category, score, list_source, matched_name, match_detail)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [screeningMatchId, screeningResultId, match.category, match.score, match.list_source, match.matched_name, match.match_detail],
          );
          matchedCategories.push(match.category);

          if (input.emitPotentialMatchSignals) {
            await emitRiskSignal(client, {
              signalType: "potential_match_unresolved",
              subjectType: input.subjectType,
              subjectRef: input.subjectRef,
              subjectParentRef: input.subjectParentRef,
              screeningRequestId,
              screeningMatchId,
              severity: severityForUnresolvedMatch(match.category),
              actorId: requestedBy,
              actorType: "service",
              requestId: input.requestId,
              correlationId: input.correlationId,
            });
          }
        }

        await client.query(`UPDATE aml1.screening_request SET status = 'completed', completed_at_utc = now(), version = version + 1 WHERE screening_request_id = $1`, [
          screeningRequestId,
        ]);

        await publishAudit(client, {
          event_type: input.completedEventType,
          source_module: "AML-01",
          actor_id: requestedBy,
          actor_type: "service",
          entity_type: "screening_request",
          entity_id: screeningRequestId,
          severity: matchedCategories.length > 0 ? "high" : "medium",
          action: "screening_request.screen",
          result: "success",
          reason_code: overallStatus,
          metadata: {
            screening_request_id: screeningRequestId,
            overall_status: overallStatus,
            matched_categories: [...new Set(matchedCategories)],
            attempt_id: attemptId,
            provider_id: provider.providerId,
            provider_list_version: providerOutcome.kind === "screened" ? providerOutcome.listVersion : null,
            provider_reference_id: providerOutcome.kind === "screened" ? providerOutcome.providerReferenceId : null,
          },
        });

        return { kind: "completed", screeningRequestId, matchedCategories: [...new Set(matchedCategories)] };
      }

      // Failure path — provider unavailable OR its response could not be trusted/normalized.
      await client.query(
        `UPDATE aml1.screening_provider_attempt SET
           status = 'failed', failure_reason_code = $2, latency_ms = $3, checked_at_utc = now()
         WHERE attempt_id = $1`,
        [attemptId, failureReasonCode, latencyMs],
      );
      await client.query(`UPDATE aml1.screening_request SET status = 'failed', version = version + 1 WHERE screening_request_id = $1`, [screeningRequestId]);
      await publishAudit(client, {
        event_type: "aml1.screening_failed",
        source_module: "AML-01",
        actor_id: requestedBy,
        actor_type: "service",
        entity_type: "screening_request",
        entity_id: screeningRequestId,
        severity: "high",
        action: "screening_request.screen",
        result: "failure",
        reason_code: failureReasonCode ?? undefined,
        metadata: { screening_request_id: screeningRequestId, attempt_id: attemptId, provider_id: provider.providerId, status: "failed" },
      });

      return { kind: "failed", screeningRequestId, errorCode: failureErrorCode as "AML1_SCREENING_PROVIDER_UNAVAILABLE" | "AML1_VENDOR_RESPONSE_INVALID" };
    });
  } catch (err) {
    if (err instanceof Aml1Error) throw err;
    throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
  }

  return outcome;
}

export interface ExecuteScreeningInput extends Omit<BeginScreeningInput, "createdEventType">, Pick<CompleteScreeningInput, "completedEventType" | "emitPotentialMatchSignals"> {
  createdEventType: string;
}

/** `beginScreening` immediately followed by `completeScreening` — the composed, single-call form
 * used by `routes/screening.ts` (original create) and `lib/rescreen.ts`'s `performRescreen` (the
 * direct, single re-screen path). `routes/monitoring.ts`'s batch flow calls the two phases
 * separately instead — see this file's own header comment. */
export async function executeScreening(input: ExecuteScreeningInput): Promise<ExecuteScreeningOutcome> {
  const { providerPayload } = await beginScreening(input);
  return completeScreening({ ...input, providerPayload });
}

interface ScreeningRequestRow {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  provenance: string;
  status: string;
}

interface ScreeningResultRow {
  overall_status: string;
  screened_at_utc: string;
}

/** Shared safe-response fetch — used by both `routes/screening.ts` (original create + read) and
 * `routes/rescreen.ts` (Phase 3C). Throws `AML1_SCREENING_REQUEST_NOT_FOUND` if the id doesn't
 * exist. Byte-identical to `routes/screening.ts`'s own pre-extraction private function. */
export async function fetchSafeScreeningResponse(screeningRequestId: string): Promise<SafeScreeningResponse> {
  const requestRows = await query<ScreeningRequestRow>(
    getPool(),
    `SELECT screening_request_id, subject_type, subject_ref, provenance, status FROM aml1.screening_request WHERE screening_request_id = $1`,
    [screeningRequestId],
  );
  const requestRow = requestRows[0];
  if (!requestRow) throw new Aml1Error("AML1_SCREENING_REQUEST_NOT_FOUND");

  const resultRows = await query<ScreeningResultRow>(
    getPool(),
    `SELECT overall_status, screened_at_utc FROM aml1.screening_result WHERE screening_request_id = $1`,
    [screeningRequestId],
  );
  const resultRow = resultRows[0];

  let matchedCategories: string[] = [];
  if (resultRow) {
    const categoryRows = await query<{ category: string }>(
      getPool(),
      `SELECT DISTINCT category FROM aml1.screening_match
         WHERE screening_result_id = (SELECT screening_result_id FROM aml1.screening_result WHERE screening_request_id = $1)
         ORDER BY category`,
      [screeningRequestId],
    );
    matchedCategories = categoryRows.map((r) => r.category);
  }

  return safeScreeningResponse({
    ...requestRow,
    result: resultRow ? { overall_status: resultRow.overall_status, screened_at_utc: resultRow.screened_at_utc, matched_categories: matchedCategories } : null,
  });
}
