/**
 * KYC-01 Phase 4A.2B — KYC-owned roster synchronisation.
 *
 * Closes the operational half of D1 (authorised-party-roster-completeness): CLT-01 Phase 4A.2A
 * made pre-approval authorised-party capture organically reachable, but nothing yet turned a
 * captured CLT-01 party into a KYC-01 `authorised_party` case — the only pre-Phase-4A.2B way to get
 * one was the externally-invoked `POST /internal/kyc1/handoffs` route, driven by an operator, not
 * by CLT-01's own roster state. `POST .../roster-sync` fetches CLT-01's authoritative roster (the
 * accepted Phase 4A contract, via the accepted Phase 4B roster client, `lib/roster-client.ts`) and
 * creates exactly one KYC-01 `authorised_party` case for every REQUIRED party that has no KYC-01
 * case at all — never a second, competing case-creation algorithm: every INSERT goes through the
 * SAME shared function `routes/handoffs.ts` uses (`lib/kyc-case-creation.ts`).
 *
 * ANCHOR-EXISTENCE RULE (the load-bearing correctness property of this route — see the approved
 * Phase 4A.2B planning report §5/§6/§10): "does ANY `kyc_case` row already exist for
 * `(application_id, 'authorised_party', party_id)`" — ANY status, computed or not, completed or
 * not, including one with an already-open corrective case. This is DELIBERATELY stronger than
 * migration 042's own partial unique index (which only blocks a duplicate ACTIVE case). Routine
 * sync must NEVER create a second case for an anchor that already has one, because
 * `lib/authoritative-outcome.ts`'s `selectAuthoritativeCasePerAnchor` always picks the LATEST case
 * per anchor as that anchor's representative, regardless of status — inserting a fresh, uncomputed
 * case over an anchor that already has a `completed`/`pass` case would silently make that anchor
 * (and therefore the whole application) UNPUBLISHABLE again (`party_outcome_pending`), the exact
 * regression a routine, idempotent retry must never cause. Correction of an already-decided anchor
 * remains the SEPARATE, deliberate corrective-case path this route never triggers.
 *
 * TRANSACTION SHAPE — one transaction for the whole sync (never one per party): the CLT-01 roster
 * fetch happens OUTSIDE any transaction (no CLT HTTP call is ever made from inside a KYC-01
 * transaction — the same discipline `routes/outcome-publication.ts` already established), then a
 * SINGLE transaction takes the SAME application-scoped advisory lock `publish-outcome`/`deliver`
 * already use (`lib/roster-controls.ts`'s `takeKycApplicationLock` — unchanged namespace,
 * `kyc1.outcome_publication:<application_id>`, now also serialising roster-sync against them),
 * reads the anchor-existence set for every REQUIRED party id, creates every missing case, and
 * publishes ONE summary audit — all-or-nothing: a failure partway through rolls back every case,
 * every checklist row, and every `kyc1.case_created` audit created so far in this call, so a retry
 * always starts from a clean, fully-idempotent state.
 *
 * DOES NOT: create the primary (`individual`/`entity`) case (that stays the accepted
 * `POST .../handoffs` workflow's own job — creating it here would risk a second, competing
 * primary-resolution algorithm and a real `anchor_ambiguous` risk); compute outcomes; publish or
 * deliver an application outcome; approve anything. `primary_anchor_present` is REPORTED, never
 * enforced — `routes/outcome-publication.ts`'s own publish route remains the sole authority for
 * `primary_missing`/`primary_type_mismatch`/`anchor_ambiguous`.
 *
 * PII: the response and the summary audit carry only opaque `authorised_party_id`/`case_id` values
 * (created anchors only — never `party_reference`, `party_type`, names, or any other CLT-01 field),
 * a content-digest `roster_hash`, and bounded counts — mirrors every other Phase 4B roster-facing
 * response's own PII posture exactly.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchClt1KycRoster, type Clt1RosterResponse } from "../lib/roster-client.js";
import type { Clt1ClientConfig } from "../lib/clt1-client.js";
import { isDuplicateActiveCaseViolation } from "../lib/kyc-case.js";
import { createKycCaseWithChecklist } from "../lib/kyc-case-creation.js";
import { requiredPartyIdsFromRoster, takeKycApplicationLock } from "../lib/roster-controls.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
/** Empty body only — every input this route needs comes from the path + CLT-01's own roster,
 * never the caller. `additionalProperties: false` rejects any unexpected business field. */
const RosterSyncBody = Type.Object({}, { additionalProperties: false });

/** The SAME lifecycle window CLT-01's own atomic receipt contract (migration 047) and KYC-01's own
 * Phase 4B publish/deliver routes require — learned from the SAME roster-fetch call, no separate
 * CLT-01 call. */
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

/** Existence-only, ANY status — see this file's own header comment. Returns the subset of
 * `requiredPartyIds` that ALREADY have at least one `authorised_party` case. */
async function fetchExistingAnchorPartyIds(client: Sql, applicationId: string, requiredPartyIds: readonly string[]): Promise<Set<string>> {
  if (requiredPartyIds.length === 0) return new Set();
  const rows = await client.query<{ party_id: string }>(
    `SELECT DISTINCT party_id FROM kyc1.kyc_case WHERE application_id = $1 AND case_type = 'authorised_party' AND party_id = ANY($2::varchar[])`,
    [applicationId, requiredPartyIds],
  );
  return new Set(rows.rows.map((r) => r.party_id));
}

/** The accepted primary-anchor resolution rule (`lib/authoritative-outcome.ts`'s own
 * `computeRosterBoundOutcome`), reused as a plain existence check ONLY — never a second
 * primary-resolution/ambiguity algorithm. This route only ever REPORTS the result; it never
 * refuses or blocks on it — `routes/outcome-publication.ts` remains the sole authority for
 * `primary_missing`/`primary_type_mismatch`/`anchor_ambiguous`. */
async function hasPrimaryAnchor(client: Sql, applicationId: string, primarySubjectType: "individual" | "entity"): Promise<boolean> {
  const rows = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM kyc1.kyc_case WHERE application_id = $1 AND case_type = $2 AND party_id IS NULL) AS exists`,
    [applicationId, primarySubjectType],
  );
  return rows.rows[0]?.exists ?? false;
}

/** Best-effort, audit-only observability for a refusal that never opens a sync transaction —
 * mirrors `routes/outcome-publication.ts`'s own `recordRefusalAudit`. Never throws back into the
 * caller — a failure to record the refusal itself must never mask or replace the refusal's own
 * error code. */
async function recordRosterSyncRefusal(applicationId: string, actorId: string, reasonCode: string, extraMetadata: Record<string, unknown>): Promise<void> {
  try {
    await withTransaction((client) =>
      publishAudit(client, {
        event_type: "kyc1.roster_sync_processed",
        source_module: "KYC-01",
        actor_id: actorId,
        actor_type: "service",
        entity_type: "roster_sync",
        entity_id: applicationId,
        severity: "medium",
        action: "roster_sync.process",
        result: "blocked",
        reason_code: reasonCode,
        metadata: { application_id: applicationId, reason_code: reasonCode, ...extraMetadata },
      }),
    );
  } catch {
    // Best-effort only — see this function's own doc comment.
  }
}

interface CreatedAnchor {
  party_id: string;
  case_id: string;
}

interface SyncOutcome {
  createdAnchors: CreatedAnchor[];
  primaryAnchorPresent: boolean;
}

export async function registerRosterSyncRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/applications/:application_id/roster-sync
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/kyc1/applications/:application_id/roster-sync",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: RosterSyncBody } },
    async (request, reply) => {
      const { application_id } = request.params as Static<typeof ApplicationIdParams>;
      const actorId = request.ctx.actor_id ?? "kyc1_internal_service";
      assertPoolAvailable();

      // Outside any transaction, before the lock — no CLT HTTP call is ever made from inside a
      // KYC-01 transaction. See this file's own header comment.
      const rosterResult = await fetchClt1KycRoster(clt1Config(app), application_id);
      if (!rosterResult.ok) {
        await recordRosterSyncRefusal(application_id, actorId, "roster_unavailable", {});
        throw new Kyc1Error("KYC1_CLT_UNAVAILABLE");
      }
      const roster: Clt1RosterResponse = rosterResult.roster;

      if (roster.applicationStatus !== ELIGIBLE_APPLICATION_STATUS) {
        await recordRosterSyncRefusal(application_id, actorId, "application_status_ineligible", { application_status: roster.applicationStatus });
        throw new Kyc1Error("KYC1_APPLICATION_INVALID_STATE");
      }

      const requiredPartyIds = requiredPartyIdsFromRoster(roster);

      let outcome: SyncOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Same key, same lock — first statement, before any read/write. Now also serialises
          // roster-sync against publish/deliver for the same application (see this file's own
          // header comment and lib/roster-controls.ts's own doc comment).
          await takeKycApplicationLock(client, application_id);

          const primaryAnchorPresent = await hasPrimaryAnchor(client, application_id, roster.primarySubjectType);
          const existingAnchorPartyIds = await fetchExistingAnchorPartyIds(client, application_id, requiredPartyIds);
          const missingPartyIds = requiredPartyIds.filter((id) => !existingAnchorPartyIds.has(id));

          const createdAnchors: CreatedAnchor[] = [];
          for (const partyId of missingPartyIds) {
            const caseId = "kyc1case_" + randomUUID();
            const { caseRow } = await createKycCaseWithChecklist(client, {
              caseId,
              applicationId: application_id,
              caseType: "authorised_party",
              clientId: null,
              partyId,
              createdFromHandoffId: null,
              requestId: request.ctx.request_id ?? null,
              correlationId: request.ctx.correlation_id ?? null,
              actorId,
            });
            createdAnchors.push({ party_id: partyId, case_id: caseRow.case_id });
          }
          createdAnchors.sort((a, b) => (a.party_id < b.party_id ? -1 : a.party_id > b.party_id ? 1 : 0));

          await publishAudit(client, {
            event_type: "kyc1.roster_sync_processed",
            source_module: "KYC-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "roster_sync",
            entity_id: application_id,
            severity: "medium",
            action: "roster_sync.process",
            result: "success",
            metadata: {
              application_id,
              roster_hash: roster.rosterHash,
              required_party_count: requiredPartyIds.length,
              created_count: createdAnchors.length,
              skipped_count: requiredPartyIds.length - createdAnchors.length,
              primary_anchor_present: primaryAnchorPresent,
            },
          });

          return { createdAnchors, primaryAnchorPresent };
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        // A genuine 23505 raced by a concurrent case-creation path OUTSIDE this route's own lock
        // (e.g. a directly-invoked handoff for the same anchor) — reuses the EXISTING duplicate-
        // case mapping, never a second name for the identical condition. The whole transaction
        // still rolls back atomically; no partial sync state is ever committed.
        if (isDuplicateActiveCaseViolation(err)) throw new Kyc1Error("KYC1_CASE_ALREADY_EXISTS", { cause: err });
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(200).send(
        successEnvelope(
          {
            application_id,
            roster_hash: roster.rosterHash,
            application_status: roster.applicationStatus,
            primary_anchor_present: outcome.primaryAnchorPresent,
            required_party_count: requiredPartyIds.length,
            created_count: outcome.createdAnchors.length,
            skipped_count: requiredPartyIds.length - outcome.createdAnchors.length,
            created_anchors: outcome.createdAnchors,
          },
          meta(request),
        ),
      );
    },
  );
}
