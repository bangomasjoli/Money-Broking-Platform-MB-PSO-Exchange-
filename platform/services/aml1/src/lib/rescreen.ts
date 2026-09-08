/**
 * AML-01 Phase 3C — the re-screen helper (confirmed decision D1). BOTH the direct manual re-screen
 * route (`routes/rescreen.ts`) and the route-triggered monitoring run (`routes/monitoring.ts`) run
 * through this SAME source-resolution + carry-forward logic — "create re-screen requests using the
 * same re-screen helper/path logic", confirmed Phase 3C scope — never a second, drifting copy.
 *
 * A re-screen NEVER mutates the original screening request/result/match evidence (confirmed
 * decision D1: history stays append-only) — this file only ever INSERTs a brand-new
 * `screening_request` row (via `lib/screening-execution.ts`), copying the source's own snapshot
 * fields forward. The caller never resupplies subject PII — every declared-identity field comes
 * from the SOURCE's own `screening_subject_snapshot` row, never from request input (confirmed
 * Phase 3C requirement: "caller must not resupply subject PII").
 *
 * Loop prevention: an in-flight (`status='requested'`) screening request for the same
 * `(subject_type, subject_ref)` is checked PROACTIVELY here (the common case, a clean read before
 * ever attempting a write) — migration 039's own partial unique index
 * (`idx_aml1_screening_request_one_inflight_per_subject`) is the race-safe backstop
 * (`lib/screening-execution.ts`'s `beginScreening` maps that specific constraint violation to
 * `AML1_RESCREEN_NOT_ALLOWED` when `inFlightDuplicateErrorCode` is supplied, exactly as it is here).
 *
 * `provenance` and `subject_nature` are both CARRIED FORWARD from the source snapshot, never
 * re-derived or caller-supplied (confirmed requirement: "provenance must be carried forward"; "do
 * not unlock kyc_verified_identity" — carrying forward `declared_identity` from a source that only
 * ever holds `declared_identity`, per `WRITABLE_SCREENING_PROVENANCE`, structurally cannot produce
 * `kyc_verified_identity` this phase).
 *
 * ---------------------------------------------------------------------------------------
 * `performRescreen` (composed) vs `claimRescreen`/`completeRescreenClaim` (split).
 * ---------------------------------------------------------------------------------------
 * `performRescreen` runs the full begin+complete lifecycle in one call — used by
 * `routes/rescreen.ts`'s direct, single re-screen route. `routes/monitoring.ts`'s batch flow needs
 * the two phases SEPARATELY: claim every selected candidate (its TX1) WHILE STILL HOLDING the
 * route's advisory lock, then run the (potentially slow) provider calls + TX2 AFTER the lock is
 * released — see `routes/monitoring.ts`'s own header comment for why. `claimRescreen`/
 * `completeRescreenClaim` expose exactly that split; `performRescreen` is implemented in terms of
 * them so the two paths can never drift apart.
 */
import { randomUUID } from "node:crypto";
import { getPool, query } from "@aix/foundation";
import type { FastifyInstance } from "fastify";
import { beginScreening, completeScreening, type ScreeningTriggerReason } from "./screening-execution.js";
import { resolveScreeningProvider } from "./providers/registry.js";
import type { ProviderScreeningPayload, ScreeningProvider, SubjectNature } from "./providers/types.js";
import type { DeclaredIdentity, ScreeningProvenance, ScreeningSubjectType } from "./screening.js";
import type { Aml1Config } from "../config.js";

interface SourceRequestRow {
  screening_request_id: string;
  subject_type: ScreeningSubjectType;
  subject_ref: string;
  subject_parent_ref: string | null;
}

interface SourceSnapshotRow {
  name: string;
  registration_number: string | null;
  country: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  provenance: ScreeningProvenance;
  subject_nature: SubjectNature | null;
}

export function resolveConfiguredProvider(app: FastifyInstance): ScreeningProvider {
  const config = app.config as Aml1Config;
  return config.screeningProviderImpl ?? resolveScreeningProvider(config.screeningProviderId);
}

export interface RescreenSourceInput {
  sourceScreeningRequestId: string;
  requestedBy: string;
}

export type ResolveRescreenSourceOutcome =
  | { kind: "source_not_found" }
  | { kind: "not_allowed" }
  | {
      kind: "resolved";
      subjectType: ScreeningSubjectType;
      subjectRef: string;
      subjectParentRef: string | null;
      subjectNature: SubjectNature;
      provenance: ScreeningProvenance;
      declaredIdentity: DeclaredIdentity;
    };

/** Shared source-lookup + PII-carry-forward + in-flight-duplicate check — the common first half of
 * both `claimRescreen` and (transitively) `performRescreen`. */
async function resolveRescreenSource(sourceScreeningRequestId: string): Promise<ResolveRescreenSourceOutcome> {
  const sourceRows = await query<SourceRequestRow>(
    getPool(),
    `SELECT screening_request_id, subject_type, subject_ref, subject_parent_ref FROM aml1.screening_request WHERE screening_request_id = $1`,
    [sourceScreeningRequestId],
  );
  const source = sourceRows[0];
  if (!source) return { kind: "source_not_found" };

  const snapshotRows = await query<SourceSnapshotRow>(
    getPool(),
    `SELECT name, registration_number, country, date_of_birth, nationality, provenance, subject_nature
       FROM aml1.screening_subject_snapshot WHERE screening_request_id = $1 ORDER BY created_at_utc DESC LIMIT 1`,
    [sourceScreeningRequestId],
  );
  const snapshot = snapshotRows[0];
  // Structural invariant — every screening_request row is created with exactly one snapshot in
  // the same TX1 (lib/screening-execution.ts) — should never be absent. Guarded defensively as
  // "source not found" rather than assumed.
  if (!snapshot) return { kind: "source_not_found" };
  // subject_nature is NOT NULL-enforced by application logic (every Phase 3B+ snapshot write
  // always supplies it) but the column itself is nullable (pre-Phase-3B historical rows could, in
  // principle, predate it) — guarded the same way for the same structural reason.
  if (!snapshot.subject_nature) return { kind: "source_not_found" };

  const inFlight = await query<{ exists_flag: number }>(
    getPool(),
    `SELECT 1 AS exists_flag FROM aml1.screening_request WHERE subject_type = $1 AND subject_ref = $2 AND status = 'requested'`,
    [source.subject_type, source.subject_ref],
  );
  if (inFlight.length > 0) return { kind: "not_allowed" };

  const declaredIdentity: DeclaredIdentity = {
    name: snapshot.name,
    ...(snapshot.registration_number ? { registration_number: snapshot.registration_number } : {}),
    ...(snapshot.country ? { country: snapshot.country } : {}),
    ...(snapshot.date_of_birth ? { date_of_birth: snapshot.date_of_birth } : {}),
    ...(snapshot.nationality ? { nationality: snapshot.nationality } : {}),
  };

  return {
    kind: "resolved",
    subjectType: source.subject_type,
    subjectRef: source.subject_ref,
    subjectParentRef: source.subject_parent_ref,
    subjectNature: snapshot.subject_nature,
    provenance: snapshot.provenance,
    declaredIdentity,
  };
}

export interface RescreenClaim {
  screeningRequestId: string;
  attemptId: string;
  subjectType: ScreeningSubjectType;
  subjectRef: string;
  subjectParentRef: string | null;
  requestedBy: string;
  provider: ScreeningProvider;
  providerPayload: ProviderScreeningPayload;
}

export type ClaimRescreenOutcome = { kind: "source_not_found" } | { kind: "not_allowed" } | { kind: "claimed"; claim: RescreenClaim };

export interface ClaimRescreenInput {
  app: FastifyInstance;
  sourceScreeningRequestId: string;
  triggerReason: ScreeningTriggerReason;
  requestedBy: string;
  requestId?: string;
  correlationId?: string;
}

/** Phase 1 of the split flow (see file header) — resolves + reserves the subject (TX1) but does
 * NOT call the provider. Used by `routes/monitoring.ts` while its advisory lock is still held. */
export async function claimRescreen(input: ClaimRescreenInput): Promise<ClaimRescreenOutcome> {
  const resolved = await resolveRescreenSource(input.sourceScreeningRequestId);
  if (resolved.kind !== "resolved") return resolved;

  const screeningRequestId = "aml1req_" + randomUUID();
  const attemptId = "aml1attempt_" + randomUUID();
  const provider = resolveConfiguredProvider(input.app);

  const { providerPayload } = await beginScreening({
    screeningRequestId,
    attemptId,
    subjectType: resolved.subjectType,
    subjectRef: resolved.subjectRef,
    subjectParentRef: resolved.subjectParentRef,
    subjectNature: resolved.subjectNature,
    provenance: resolved.provenance,
    requestedBy: input.requestedBy,
    declaredIdentity: resolved.declaredIdentity,
    rescreenOfRequestId: input.sourceScreeningRequestId,
    triggerReason: input.triggerReason,
    provider,
    requestId: input.requestId,
    correlationId: input.correlationId,
    createdEventType: "aml1.rescreen_requested",
    inFlightDuplicateErrorCode: "AML1_RESCREEN_NOT_ALLOWED",
  });

  return {
    kind: "claimed",
    claim: {
      screeningRequestId,
      attemptId,
      subjectType: resolved.subjectType,
      subjectRef: resolved.subjectRef,
      subjectParentRef: resolved.subjectParentRef,
      requestedBy: input.requestedBy,
      provider,
      providerPayload,
    },
  };
}

export type PerformRescreenOutcome =
  | { kind: "source_not_found" }
  | { kind: "not_allowed" }
  | { kind: "completed"; screeningRequestId: string; matchedCategories: string[] }
  | { kind: "failed"; screeningRequestId: string; errorCode: "AML1_SCREENING_PROVIDER_UNAVAILABLE" | "AML1_VENDOR_RESPONSE_INVALID" }
  | { kind: "aborted"; screeningRequestId: string };

/** Phase 2 of the split flow (see file header) — the provider call + TX2, run OUTSIDE the
 * advisory-lock transaction/scope. Phase 3D: `completeScreening`'s own TX2 concurrency guard can
 * return `{ kind: "aborted" }` if this claim's request was recovered as stuck while the provider
 * call was still in flight — passed straight through, never treated as `failed` (it is not a
 * provider failure; the request is already durably `failed` via recovery, not this call). */
export async function completeRescreenClaim(claim: RescreenClaim, opts: { emitPotentialMatchSignals?: boolean; requestId?: string; correlationId?: string } = {}): Promise<PerformRescreenOutcome> {
  const outcome = await completeScreening({
    screeningRequestId: claim.screeningRequestId,
    attemptId: claim.attemptId,
    subjectType: claim.subjectType,
    subjectRef: claim.subjectRef,
    subjectParentRef: claim.subjectParentRef,
    requestedBy: claim.requestedBy,
    provider: claim.provider,
    providerPayload: claim.providerPayload,
    completedEventType: "aml1.rescreen_completed",
    emitPotentialMatchSignals: opts.emitPotentialMatchSignals ?? true,
    requestId: opts.requestId,
    correlationId: opts.correlationId,
  });

  if (outcome.kind === "failed") return { kind: "failed", screeningRequestId: outcome.screeningRequestId, errorCode: outcome.errorCode };
  if (outcome.kind === "aborted") return { kind: "aborted", screeningRequestId: outcome.screeningRequestId };
  return { kind: "completed", screeningRequestId: outcome.screeningRequestId, matchedCategories: outcome.matchedCategories };
}

export interface PerformRescreenInput {
  app: FastifyInstance;
  sourceScreeningRequestId: string;
  triggerReason: ScreeningTriggerReason;
  requestedBy: string;
  requestId?: string;
  correlationId?: string;
  /** Phase 3C only — see `lib/screening-execution.ts`'s own `emitPotentialMatchSignals` parameter.
   * Defaults to `true` — every re-screen path emits `potential_match_unresolved` signals per
   * confirmed decision D9. */
  emitPotentialMatchSignals?: boolean;
}

/** The composed, single-call form — `claimRescreen` immediately followed by
 * `completeRescreenClaim`. Used by `routes/rescreen.ts`'s direct re-screen route. */
export async function performRescreen(input: PerformRescreenInput): Promise<PerformRescreenOutcome> {
  const claimOutcome = await claimRescreen(input);
  if (claimOutcome.kind !== "claimed") return claimOutcome;
  return completeRescreenClaim(claimOutcome.claim, {
    emitPotentialMatchSignals: input.emitPotentialMatchSignals,
    requestId: input.requestId,
    correlationId: input.correlationId,
  });
}
