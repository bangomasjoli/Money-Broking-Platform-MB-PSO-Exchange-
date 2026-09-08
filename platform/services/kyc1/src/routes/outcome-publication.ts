/**
 * KYC-01 Phase 2A — application-level authoritative-outcome publication (approved Phase 2 planning
 * report design). `POST /internal/kyc1/applications/:application_id/publish-outcome` computes ONE
 * application-scoped aggregate over KYC-01's OWN current case set for the application
 * (`lib/authoritative-outcome.ts`'s `computeAuthoritativeOutcome`) and, if publishable, records it
 * as a NEW `kyc1.outcome_publication` row — deliberately APPLICATION-scoped, never case-scoped
 * (the Phase 2 planning report's own "Critical finding": a case-scoped publish route would let a
 * later party-anchor `pass` silently overwrite an earlier primary-anchor `fail` once delivered into
 * CLT-01's single last-write-wins `cdd_outcome_status` column).
 *
 * D1 (Phase 2A, NOW CLOSED FOR TECHNICAL ROSTER-BINDING CONSISTENCY BY PHASE 4B BELOW — see that
 * section's own header comment for what remains open): KYC-01 originally published over its OWN
 * case set only. Phase 4B replaces that with roster-bound completeness.
 *
 * D4 (approved) — the INFO-6 remedy: a `pass` aggregate is refused, NOT published, when a
 * contributing case's own evidence contains a tied conflicting `pass`/`fail` pair (the exact MED-1
 * scenario, resolved deterministically at compute-outcome time but semantically arbitrarily by a
 * random tie-break key — see `lib/authoritative-outcome.ts`'s own header comment). This is not a
 * business-rule change and does not touch `computeCddOutcome`/`compute-outcome` at all; it is a
 * publish-time gate only, UNCHANGED by Phase 4B — evidence-conflict detection runs over whichever
 * cases the (now roster-bound) aggregate actually contributes.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2B (CLT-01 delivery, LOW-5/LOW-6/LOW-7 closures) — see git history / prior implementation
 * notes for the full account. Summary of what is STILL true, extended by Phase 4B below:
 *   - `pg_advisory_xact_lock(hashtext('kyc1.outcome_publication:' + application_id))` — the FIRST
 *     statement of every publish/deliver transaction (LOW-5). UNCHANGED.
 *   - Two-phase delivery: TX1 (lock, re-validate, audit `attempted`, commit) -> HTTP OUTSIDE any
 *     transaction -> TX2 (re-lock, re-check, terminal write, audit, commit). UNCHANGED shape;
 *     TX1's re-validation step is EXTENDED by Phase 4B (see below).
 *   - MED-2's three-way terminal write (`succeeded`/`failed`/`superseded`) for the
 *     supersede-during-delivery ordering hazard. UNCHANGED.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4B — authoritative roster completeness, publication binding, atomic delivery integration
 * (migration `048_kyc1_publication_roster_binding.cjs`; depends on CLT-01 Phase 4A's roster
 * contract and Phase 4A.1's atomic-receipt contract, migration `047_clt1_atomic_kyc_roster_
 * binding.cjs`).
 * ---------------------------------------------------------------------------------------
 * CLOSES (for TECHNICAL ROSTER-BINDING CONSISTENCY — see the carry-forward note below for what
 * remains genuinely open): the KYC-01-side half of D1. `publish-outcome` now fetches CLT-01's
 * complete authorised-party roster (`lib/roster-client.ts`, the accepted Phase 4A contract) BEFORE
 * opening any transaction, derives the REQUIRED party set (`authority_status` ∈ {pending, active,
 * restricted, suspended} — `rejected`/`revoked` excluded, the approved Phase 4B compliance
 * decision), and refuses publication outright — never downgrading to `remediation_required` — when
 * any required party lacks a KYC-01 case or an outcome (`lib/authoritative-outcome.ts`'s
 * `computeRosterBoundOutcome`). A successful publication binds `roster_hash`,
 * `required_party_count`, `evaluated_party_count`, `contributing_party_ids`, and
 * `roster_fetched_at_utc` into the SAME immutable row as the existing aggregate evidence.
 * `POST .../deliver` sends that SAME stored `roster_hash` to CLT-01 as `expected_roster_hash`
 * (migration 047's own mandatory field for `kyc_kyb` receipts) — NEVER a freshly re-fetched value,
 * NEVER caller/request input — and additionally re-validates the roster/required-party-set/
 * aggregate BEFORE that HTTP call, extending (not replacing) the existing LOW-7 stale check.
 *
 * NOT CLOSED (carried forward, explicitly, not silently): OPERATIONAL authorised-party
 * completeness. CLT-01's currently supported HTTP surface can only populate `authorised_party` rows
 * AFTER an application has already been approved (every mutation route requires an active
 * `client_profile`, which does not exist until approval) — so, via the real, organic workflow, the
 * roster this route fetches during `under_review` is currently ALWAYS EMPTY. This route's
 * correctness does not depend on the roster being non-empty (an empty required set publishes freely
 * once the primary anchor resolves, exactly as Phase 2A always allowed), but the CLAIM "every
 * authorised party CLT-01 knows about has a matching KYC-01 case" is currently vacuously true, not
 * operationally proven. Phase 4A.2 (CLT-01 pre-approval authorised-party capture — NOT implemented
 * here, NOT in this phase's scope) is required before that claim has real content. D1 must not be
 * recorded as fully closed until then.
 *
 * APPLICATION-STATUS ELIGIBILITY: both routes require the CLT-01-reported `application_status` to
 * be exactly `under_review` — the same lifecycle window CLT-01's own atomic outcome-receipt
 * contract (migration 047) enforces server-side. Learned from the SAME roster-fetch call (the
 * roster response already carries `application_status` — no separate CLT-01 call is made to learn
 * it). An ineligible status is `KYC1_OUTCOME_NOT_PUBLISHABLE`/`reason_code: "application_status_
 * ineligible"` at publish time — no new outcome status is introduced; KYC-01's own case/outcome
 * model is entirely unaffected.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchCasesForApplication, fetchVerificationResults, type KycCaseType } from "../lib/kyc-case.js";
import {
  computeRosterBoundOutcome,
  detectTiedConflictingEvidence,
  type AuthoritativeCaseInput,
  type EvidenceConflictInput,
  type RosterBoundOutcomeResult,
} from "../lib/authoritative-outcome.js";
import { normalizeOutcomePublicationRow, safeOutcomePublicationResponse, type OutcomePublicationRow } from "../lib/outcome-publication.js";
import { deliverKycOutcome, type Clt1ClientConfig, type Clt1DeliveryResult } from "../lib/clt1-client.js";
import { fetchClt1KycRoster, type Clt1RosterResponse } from "../lib/roster-client.js";
import { requiredPartyIdsFromRoster, takeKycApplicationLock } from "../lib/roster-controls.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const PublicationIdParams = Type.Object({ publication_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const PublishOutcomeBody = Type.Object({ requested_by: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const DeliverOutcomeBody = Type.Object({ requested_by: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

/** The one application-lifecycle window CLT-01's own atomic receipt contract accepts a `kyc_kyb`
 * outcome in (migration 047's `WHERE status = 'under_review'` guarded UPDATE). */
const ELIGIBLE_APPLICATION_STATUS = "under_review";

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1Config(app: FastifyInstance): Clt1ClientConfig {
  const config = app.config as Kyc1Config;
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

/** Fetches KYC-01's OWN live case set for the application and maps it into
 * `AuthoritativeCaseInput[]` — shared by publish's own completeness computation and deliver's
 * revalidation. Pure data-fetch/map; all aggregation logic lives in
 * `lib/authoritative-outcome.ts`. */
async function fetchLiveCasesForAggregate(client: Sql, applicationId: string): Promise<AuthoritativeCaseInput[]> {
  const caseRows = await fetchCasesForApplication(client, applicationId);
  return caseRows.map((c) => ({
    caseId: c.case_id,
    caseType: c.case_type as KycCaseType,
    partyId: c.party_id,
    currentOutcomeStatus: c.current_outcome_status as AuthoritativeCaseInput["currentOutcomeStatus"],
    currentOutcomeId: c.current_outcome_id,
    createdAtUtc: c.created_at_utc,
  }));
}

/** Best-effort, audit-only observability for a refusal that never mutates `outcome_publication` —
 * mirrors `services/clt1/src/routes/decisions.ts`'s own `recordFailureAudit`. A failure to record
 * the refusal itself must never mask or replace the refusal's own error code, so this never throws
 * back into the caller. Safe, bounded metadata only — see this file's own header comment and the
 * approved Phase 4B audit model (no party IDs, no PII, no raw CLT response). */
async function recordRefusalAudit(applicationId: string, actorId: string, reasonCode: string, extraMetadata: Record<string, unknown>): Promise<void> {
  try {
    await withTransaction((client) =>
      publishAudit(client, {
        event_type: "kyc1.outcome_publication_refused",
        source_module: "KYC-01",
        actor_id: actorId,
        actor_type: "service",
        entity_type: "outcome_publication",
        entity_id: applicationId,
        severity: "medium",
        action: "outcome_publication.refuse",
        result: "blocked",
        reason_code: reasonCode,
        metadata: { application_id: applicationId, reason_code: reasonCode, ...extraMetadata },
      }),
    );
  } catch {
    // Best-effort only — see this function's own doc comment.
  }
}

type PublishOutcome =
  | { kind: "refused"; reasonCode: string; extraMetadata?: Record<string, unknown> }
  | { kind: "evidence_conflict"; aggregateStatus: "pass"; contributingCaseIds: string[] }
  | { kind: "published"; row: OutcomePublicationRow };

export async function registerOutcomePublicationRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/applications/:application_id/publish-outcome
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/kyc1/applications/:application_id/publish-outcome",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: PublishOutcomeBody } },
    async (request, reply) => {
      const { application_id } = request.params as Static<typeof ApplicationIdParams>;
      const body = request.body as Static<typeof PublishOutcomeBody>;
      const actorId = request.ctx.actor_id ?? "kyc1_internal_service";
      assertPoolAvailable();

      // Phase 4B, step 1-3 — OUTSIDE any KYC-01 transaction: fetch CLT-01's roster, validate it
      // (lib/roster-client.ts's own strict shape validation), confirm application-lifecycle
      // eligibility. No CLT HTTP call is ever made from inside a transaction — see this file's own
      // header comment.
      const rosterResult = await fetchClt1KycRoster(clt1Config(app), application_id);
      if (!rosterResult.ok) {
        await recordRefusalAudit(application_id, actorId, "roster_unavailable", {});
        throw new Kyc1Error("KYC1_CLT_UNAVAILABLE");
      }
      const roster = rosterResult.roster;

      if (roster.applicationStatus !== ELIGIBLE_APPLICATION_STATUS) {
        await recordRefusalAudit(application_id, actorId, "application_status_ineligible", { application_status: roster.applicationStatus });
        throw new Kyc1Error("KYC1_OUTCOME_NOT_PUBLISHABLE");
      }

      const requiredPartyIds = requiredPartyIdsFromRoster(roster);

      let outcome: PublishOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // LOW-5 fix — first statement, before any read/write. See this file's own header
          // comment and `takeKycApplicationLock`'s own doc comment.
          await takeKycApplicationLock(client, application_id);

          const liveCases = await fetchLiveCasesForAggregate(client, application_id);
          const result = computeRosterBoundOutcome(liveCases, { primarySubjectType: roster.primarySubjectType, requiredAuthorisedPartyIds: requiredPartyIds });

          if (!result.publishable) {
            return {
              kind: "refused",
              reasonCode: result.reasonCode as string,
              extraMetadata: { required_party_count: result.requiredPartyCount, evaluated_party_count: result.evaluatedPartyCount },
            };
          }

          if (result.aggregateStatus === "pass") {
            const evidenceRows: EvidenceConflictInput[] = [];
            for (const caseId of result.contributingCaseIds) {
              const results = await fetchVerificationResults(client, caseId);
              for (const r of results) evidenceRows.push({ caseId, resultType: r.result_type, resultStatus: r.result_status, receivedAtUtc: r.received_at_utc });
            }
            if (detectTiedConflictingEvidence(evidenceRows)) {
              return { kind: "evidence_conflict", aggregateStatus: "pass", contributingCaseIds: result.contributingCaseIds };
            }
          }

          // Supersede any existing active (non-superseded) publication for this application —
          // migration 043's own partial unique index guarantees at most one such row.
          const superseded = await client.query<{ publication_id: string }>(
            `UPDATE kyc1.outcome_publication SET status = 'superseded', version = version + 1
               WHERE application_id = $1 AND status <> 'superseded'
             RETURNING publication_id`,
            [application_id],
          );
          const supersededRow = superseded.rows[0];
          if (supersededRow) {
            await publishAudit(client, {
              event_type: "kyc1.outcome_publication_superseded",
              source_module: "KYC-01",
              actor_id: actorId,
              actor_type: "service",
              entity_type: "outcome_publication",
              entity_id: supersededRow.publication_id,
              severity: "medium",
              action: "outcome_publication.supersede",
              result: "success",
              metadata: { application_id, publication_id: supersededRow.publication_id },
            });
          }

          const publicationId = "kyc1pub_" + randomUUID();
          const payloadHash = fingerprint({
            application_id,
            aggregate_status: result.aggregateStatus,
            contributing_case_ids: result.contributingCaseIds,
            contributing_outcome_ids: result.contributingOutcomeIds,
            roster_hash: roster.rosterHash,
            required_party_count: result.requiredPartyCount,
            contributing_party_ids: result.contributingPartyIds,
          });

          const inserted = await client.query<OutcomePublicationRow>(
            `INSERT INTO kyc1.outcome_publication
               (publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, requested_by, request_id, correlation_id,
                roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
             RETURNING publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, status, attempt_count, failure_reason_code, response_ref, requested_by, version, created_at_utc, delivered_at_utc,
                       roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc`,
            [
              publicationId,
              application_id,
              result.aggregateStatus,
              JSON.stringify(result.contributingCaseIds),
              JSON.stringify(result.contributingOutcomeIds),
              payloadHash,
              body.requested_by,
              request.ctx.request_id ?? null,
              request.ctx.correlation_id ?? null,
              roster.rosterHash,
              result.requiredPartyCount,
              result.evaluatedPartyCount,
              JSON.stringify(result.contributingPartyIds),
            ],
          );
          const row = normalizeOutcomePublicationRow(inserted.rows[0]!);

          await publishAudit(client, {
            event_type: "kyc1.outcome_publication_requested",
            source_module: "KYC-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "outcome_publication",
            entity_id: publicationId,
            severity: "high",
            action: "outcome_publication.request",
            result: "success",
            metadata: {
              application_id,
              publication_id: publicationId,
              aggregate_status: result.aggregateStatus,
              contributing_case_ids: result.contributingCaseIds,
              requested_by: body.requested_by,
              roster_hash: roster.rosterHash,
              required_party_count: result.requiredPartyCount,
              evaluated_party_count: result.evaluatedPartyCount,
              extra_case_count: result.extraCaseCount,
            },
          });

          return { kind: "published", row };
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "refused") {
        await recordRefusalAudit(application_id, actorId, outcome.reasonCode, outcome.extraMetadata ?? {});
        throw new Kyc1Error("KYC1_OUTCOME_NOT_PUBLISHABLE");
      }
      if (outcome.kind === "evidence_conflict") {
        await recordRefusalAudit(application_id, actorId, "evidence_conflict", {
          aggregate_status: outcome.aggregateStatus,
          contributing_case_ids: outcome.contributingCaseIds,
        });
        throw new Kyc1Error("KYC1_OUTCOME_EVIDENCE_CONFLICT");
      }

      return reply.code(201).send(successEnvelope(safeOutcomePublicationResponse(outcome.row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/outcome-publications/:publication_id/deliver
  //
  // Handles BOTH the first delivery attempt (status='pending') and every retry (status='failed') —
  // approved D3: one route, not a separate /retry. See this file's own header comment for the full
  // TX1/HTTP/TX2 design, the ordering-hazard discussion, and the Phase 4B revalidation extension.
  // -------------------------------------------------------------------------------------------
  const PUBLICATION_COLUMNS =
    "publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, status, attempt_count, failure_reason_code, response_ref, requested_by, version, created_at_utc, delivered_at_utc, roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc";

  type StaleReason = "roster_changed" | "required_party_set_changed" | "aggregate_changed" | "contributing_outcome_changed";

  /** Phase 4B revalidation — extends the original LOW-7 stale check. Compares the CURRENTLY FETCHED
   * roster + a freshly recomputed live aggregate against the publication's own STORED evidence.
   * Returns `null` on an exact match (safe to deliver), or the single most-specific applicable
   * `StaleReason` otherwise. Priority order chosen so each branch is independently reachable by a
   * real scenario — see this file's own header comment. */
  function detectStaleness(roster: Clt1RosterResponse, liveCases: AuthoritativeCaseInput[], stored: OutcomePublicationRow): StaleReason | null {
    const currentRequiredIds = [...requiredPartyIdsFromRoster(roster)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const storedRequiredIds = stored.contributing_party_ids ?? [];
    const requiredSetChanged = currentRequiredIds.length !== storedRequiredIds.length || currentRequiredIds.some((id, i) => id !== storedRequiredIds[i]);
    if (requiredSetChanged) return "required_party_set_changed";

    if (roster.rosterHash !== stored.roster_hash) return "roster_changed";

    const live: RosterBoundOutcomeResult = computeRosterBoundOutcome(liveCases, { primarySubjectType: roster.primarySubjectType, requiredAuthorisedPartyIds: currentRequiredIds });
    if (!live.publishable) return "contributing_outcome_changed";

    const idsMatch =
      live.contributingCaseIds.length === stored.contributing_case_ids.length &&
      live.contributingCaseIds.every((id, i) => id === stored.contributing_case_ids[i]) &&
      live.contributingOutcomeIds.length === stored.contributing_outcome_ids.length &&
      live.contributingOutcomeIds.every((id, i) => id === stored.contributing_outcome_ids[i]);
    if (!idsMatch) return "contributing_outcome_changed";
    if (live.aggregateStatus !== stored.aggregate_status) return "aggregate_changed";

    return null;
  }

  type DeliverPrepared =
    | { kind: "invalid_state" }
    | { kind: "legacy_unbound"; applicationId: string }
    | { kind: "clt_unavailable"; applicationId: string }
    | { kind: "stale"; applicationId: string; reasonCode: StaleReason }
    | { kind: "ready"; row: OutcomePublicationRow };

  app.post(
    "/internal/kyc1/outcome-publications/:publication_id/deliver",
    { preHandler: requireInternal, schema: { params: PublicationIdParams, body: DeliverOutcomeBody } },
    async (request, reply) => {
      const { publication_id } = request.params as Static<typeof PublicationIdParams>;
      const body = request.body as Static<typeof DeliverOutcomeBody>;
      const actorId = request.ctx.actor_id ?? "kyc1_internal_service";
      assertPoolAvailable();

      // Unlocked pre-read (before any transaction, before any CLT-01 HTTP call): learn
      // application_id, and fail fast on a legacy (pre-048) publication — `roster_hash` is
      // INSERT-once and immutable (no UPDATE grant exists on it, ever), so an unlocked read of it
      // carries no race risk, unlike `status` below. Avoids wasting a CLT-01 roster fetch on a
      // publication that can never be delivered regardless.
      const preRead = await query<{ application_id: string; roster_hash: string | null }>(
        getPool(),
        `SELECT application_id, roster_hash FROM kyc1.outcome_publication WHERE publication_id = $1`,
        [publication_id],
      );
      const preReadRow = preRead[0];
      if (!preReadRow) throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_NOT_FOUND");
      const applicationId = preReadRow.application_id;

      if (preReadRow.roster_hash === null) {
        await recordRefusalAudit(applicationId, actorId, "legacy_publication_unbound", { publication_id });
        throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_STALE");
      }

      // Phase 4B — fetch the CURRENT roster OUTSIDE any transaction, before the lock, before any
      // CLT-01 delivery HTTP call. A fetch failure here is CLT-unavailability, never staleness.
      const rosterResult = await fetchClt1KycRoster(clt1Config(app), applicationId);

      // TX1 — take the lock, re-read under FOR UPDATE, validate state, THEN (if the roster fetch
      // above succeeded) run the full Phase 4B revalidation, audit "attempted", commit — releasing
      // the advisory lock before any HTTP call. Lock ordering: advisory lock always precedes any
      // row lock on this table — the publish route's own lock is taken before ITS first row touch
      // too, so the two can never deadlock against each other.
      let prepared: DeliverPrepared;
      try {
        prepared = await withTransaction(async (client) => {
          await takeKycApplicationLock(client, applicationId);

          const locked = await client.query<OutcomePublicationRow>(`SELECT ${PUBLICATION_COLUMNS} FROM kyc1.outcome_publication WHERE publication_id = $1 FOR UPDATE`, [publication_id]);
          const current = locked.rows[0]!;

          if (current.status !== "pending" && current.status !== "failed") {
            return { kind: "invalid_state" };
          }
          // Re-confirmed under the lock — immutable, but re-checked for defence in depth against
          // any future code path that might somehow reach here differently.
          if (current.roster_hash === null) {
            return { kind: "legacy_unbound", applicationId };
          }

          if (!rosterResult.ok) {
            return { kind: "clt_unavailable", applicationId };
          }

          const liveCases = await fetchLiveCasesForAggregate(client, applicationId);
          const staleReason = detectStaleness(rosterResult.roster, liveCases, current);
          if (staleReason) {
            return { kind: "stale", applicationId, reasonCode: staleReason };
          }

          await publishAudit(client, {
            event_type: "kyc1.outcome_delivery_attempted",
            source_module: "KYC-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "outcome_publication",
            entity_id: publication_id,
            severity: "medium",
            action: "outcome_publication.deliver_attempt",
            result: "success",
            metadata: { publication_id, application_id: applicationId, aggregate_status: current.aggregate_status, requested_by: body.requested_by },
          });

          return { kind: "ready", row: normalizeOutcomePublicationRow(current) };
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      if (prepared.kind === "invalid_state") throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_INVALID_STATE");
      if (prepared.kind === "legacy_unbound") {
        await recordRefusalAudit(prepared.applicationId, actorId, "legacy_publication_unbound", { publication_id });
        throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_STALE");
      }
      if (prepared.kind === "clt_unavailable") {
        await recordRefusalAudit(prepared.applicationId, actorId, "roster_unavailable", { publication_id });
        throw new Kyc1Error("KYC1_CLT_UNAVAILABLE");
      }
      if (prepared.kind === "stale") {
        await recordRefusalAudit(prepared.applicationId, actorId, prepared.reasonCode, { publication_id });
        throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_STALE");
      }

      const publicationSnapshot = prepared.row;

      // HTTP — outside any transaction, timeout-bounded, no raw request/response logging anywhere
      // (lib/clt1-client.ts's own doc comment). Phase 4B: expected_roster_hash comes EXCLUSIVELY
      // from the immutable publication row just re-confirmed above — never the request body, never
      // a freshly re-fetched roster, never caller/actor input.
      const result: Clt1DeliveryResult = await deliverKycOutcome(clt1Config(app), {
        applicationId: publicationSnapshot.application_id,
        aggregateStatus: publicationSnapshot.aggregate_status as "pass" | "fail" | "remediation_required",
        createdBy: body.requested_by,
        expectedRosterHash: publicationSnapshot.roster_hash as string,
      });

      // TX2 — re-lock, re-check the row is STILL the active publication (the ordering hazard this
      // file's header comment names), write the terminal status, audit, commit. `attempt_count`
      // increments here (approved D4 — AML-01 symmetry).
      //
      // MED-2 FIX (independent Opus review of Phase 2B, UNCHANGED by Phase 4B): the terminal write
      // is three-way (`succeeded`/`failed`/`superseded`) via a real discriminated result, never
      // inferred back out of `finalRow.status` — see this file's own header comment.
      //
      // PHASE 4B addition: CLT-01's own atomic-receipt stale-roster rejection (`result.kind ===
      // "stale"`, migration 047) is treated as its OWN outcome here too — recorded as `failed`
      // (queryable, retriable via explicit republish, never silently discarded), but surfaced to
      // the caller as `KYC1_OUTCOME_PUBLICATION_STALE`, NEVER `KYC1_CLT_DELIVERY_FAILED`/
      // `KYC1_CLT_UNAVAILABLE` — see this file's own header comment and `lib/clt1-client.ts`'s own
      // `Clt1DeliveryResult` doc comment.
      type DeliverOutcome = { kind: "succeeded" | "failed" | "superseded_during_delivery"; row: OutcomePublicationRow };
      let deliverOutcome: DeliverOutcome;
      try {
        deliverOutcome = await withTransaction(async (client) => {
          await takeKycApplicationLock(client, publicationSnapshot.application_id);

          const relocked = await client.query<OutcomePublicationRow>(`SELECT ${PUBLICATION_COLUMNS} FROM kyc1.outcome_publication WHERE publication_id = $1 FOR UPDATE`, [publication_id]);
          const current = relocked.rows[0];
          if (!current) throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_NOT_FOUND");

          // Ordering hazard: a fresh publish-outcome superseded THIS row while the HTTP call was
          // in flight. Never write 'succeeded' OR 'failed' over a superseded row — either would
          // re-enter it into the partial unique index above. The row's `status` stays exactly
          // 'superseded'; only the attempt evidence (attempt_count/failure_reason_code/
          // delivered_at_utc/version) advances, so the attempt is still durably recorded.
          const supersededDuringDelivery = current.status === "superseded";
          const succeeded = result.succeeded && !supersededDuringDelivery;
          const targetStatus: "succeeded" | "failed" | "superseded" = succeeded ? "succeeded" : supersededDuringDelivery ? "superseded" : "failed";

          // Proper narrowing (never an unchecked cast): `succeeded` false + NOT superseded implies
          // `result.succeeded` must itself be false (De Morgan on the line above), so
          // `!result.succeeded` below is always true in that branch — but written as a real type
          // guard rather than assumed, so a future edit here can't silently reintroduce an unsafe
          // cast on `result`.
          let failureReasonCode: string | null;
          if (succeeded) {
            failureReasonCode = null;
          } else if (supersededDuringDelivery) {
            failureReasonCode = "superseded_during_delivery";
          } else if (!result.succeeded) {
            failureReasonCode = result.kind === "stale" ? "clt_atomic_roster_rejection" : result.failureReasonCode;
          } else {
            // Unreachable — see the comment above.
            failureReasonCode = "superseded_during_delivery";
          }
          // Safe-minimal (approved D5): CLT-01's own `outcome_id` is never stored when this
          // publication is not the one whose delivery is authoritative — the superseding
          // publication's OWN delivery is what should carry a `response_ref`, not this one.
          const responseRef = succeeded && result.succeeded ? result.responseRef : null;

          const updated = await client.query<OutcomePublicationRow>(
            `UPDATE kyc1.outcome_publication SET
               status = $2, attempt_count = attempt_count + 1, response_ref = $3,
               failure_reason_code = $4, delivered_at_utc = now(), version = version + 1
             WHERE publication_id = $1
             RETURNING ${PUBLICATION_COLUMNS}`,
            [publication_id, targetStatus, responseRef, failureReasonCode],
          );
          const row = normalizeOutcomePublicationRow(updated.rows[0]!);

          await publishAudit(client, {
            event_type: succeeded ? "kyc1.outcome_delivery_succeeded" : "kyc1.outcome_delivery_failed",
            source_module: "KYC-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "outcome_publication",
            entity_id: publication_id,
            severity: succeeded ? "medium" : "high",
            action: "outcome_publication.deliver",
            result: succeeded ? "success" : "failure",
            reason_code: succeeded ? undefined : (failureReasonCode ?? undefined),
            metadata: {
              publication_id,
              application_id: current.application_id,
              aggregate_status: current.aggregate_status,
              status: row.status,
              attempt_count: row.attempt_count,
              response_ref: row.response_ref,
            },
          });

          return { kind: succeeded ? "succeeded" : supersededDuringDelivery ? "superseded_during_delivery" : "failed", row } as DeliverOutcome;
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      const finalRow = deliverOutcome.row;

      if (deliverOutcome.kind === "superseded_during_delivery") {
        // Both branches (CLT-01 accepted OR rejected) surface identically here — this publication
        // is no longer the authoritative one regardless of what CLT-01 itself said; see the
        // ordering-hazard comment above. `status` stayed 'superseded' the whole time (never
        // touched 'failed'), and the attempt was durably recorded in the SAME transaction.
        throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_STALE");
      }

      if (deliverOutcome.kind === "failed") {
        // Real type guard (`!result.succeeded`), not an assumption: `deliverOutcome.kind ===
        // "failed"` can only occur when `result.succeeded` was itself false — see TX2's own
        // three-way `targetStatus` derivation above — but that invariant lives inside the
        // transaction closure and is invisible to the compiler out here, so it is re-proven
        // explicitly rather than cast. Phase 4B: CLT's own atomic-receipt stale rejection maps to
        // KYC1_OUTCOME_PUBLICATION_STALE, never DELIVERY_FAILED/UNAVAILABLE.
        if (!result.succeeded && result.kind === "stale") throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_STALE");
        throw new Kyc1Error(!result.succeeded && result.kind === "rejected" ? "KYC1_CLT_DELIVERY_FAILED" : "KYC1_CLT_UNAVAILABLE");
      }

      return reply.send(successEnvelope(safeOutcomePublicationResponse(finalRow), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/kyc1/outcome-publications/:publication_id
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/kyc1/outcome-publications/:publication_id",
    { preHandler: requireInternal, schema: { params: PublicationIdParams } },
    async (request, reply) => {
      const { publication_id } = request.params as Static<typeof PublicationIdParams>;
      assertPoolAvailable();

      const rows = await query<OutcomePublicationRow>(
        getPool(),
        `SELECT publication_id, application_id, aggregate_status, contributing_case_ids, contributing_outcome_ids, payload_hash, status, attempt_count, failure_reason_code, response_ref, requested_by, version, created_at_utc, delivered_at_utc,
                roster_hash, required_party_count, evaluated_party_count, contributing_party_ids, roster_fetched_at_utc
           FROM kyc1.outcome_publication WHERE publication_id = $1`,
        [publication_id],
      );
      const row = rows[0];
      if (!row) throw new Kyc1Error("KYC1_OUTCOME_PUBLICATION_NOT_FOUND");

      return reply.send(successEnvelope(safeOutcomePublicationResponse(normalizeOutcomePublicationRow(row)), meta(request)));
    },
  );
}
