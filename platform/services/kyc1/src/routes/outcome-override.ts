/**
 * KYC-01 Phase 3B — maker-checker manual outcome override (approved Phase 3B planning report). The
 * ONLY permitted override target is the case-level `cdd_outcome` status (D2) — `verification_
 * result`/`document_checklist_item`/publication-eligibility/evidence-conflict/stale-publication
 * refusals are all explicitly FORBIDDEN override targets; no code in this file ever mutates any of
 * them.
 *
 * APPEND-ONLY (D3): apply INSERTs a NEW `cdd_outcome` row (same append-versioned discipline
 * `compute-outcome` already uses, `routes/outcome.ts`) — never UPDATEs an existing `cdd_outcome`
 * row, never touches `verification_result`/`document_checklist_item` in any way. `role_kyc1_
 * runtime` carries no UPDATE grant on `cdd_outcome`/`verification_result` for exactly this reason
 * (`infra/grants/kyc1_runtime_grants.sql`) — the override apply route COULD NOT mutate evidence
 * even if its own logic tried to.
 *
 * Two routes, both internal-identity-gated and `kyc1.outcome.override`-permission-gated:
 *   - `POST /internal/kyc1/cases/:case_id/outcome-override/request` — creates a `requested` row.
 *     No IAM-02 approval needed to REQUEST (mirrors every prior maker-checker table in this
 *     codebase) — the baseline `checkPermission` call only catches genuine `deny`/`licence_locked`/
 *     IAM-02 outages before wasting an approval cycle (`kyc1.outcome.override` carries `requires_
 *     approval=true`, so `approval_required` PASSES the baseline — see `lib/iam2-client.ts`'s own
 *     header comment for why treating it as a denial would be the CFG-01 Phase 3A F-1 regression).
 *   - `POST /internal/kyc1/cases/:case_id/outcome-override/apply` — requires a genuine IAM-02
 *     execute-verify decision token bound to the STORED request row's own payload hash and
 *     `requested_by` actor. This is the REAL gate; the baseline check above it is advisory-only.
 *
 * CONCURRENCY (mirrors `routes/outcome-publication.ts`'s own LOW-5/MED-2 precedent exactly): both
 * routes take `pg_advisory_xact_lock(hashtext('kyc1.manual_override:' + case_id))` as the FIRST
 * statement of the transaction that writes — never held across the IAM-02 HTTP call in either
 * route. A raced concurrent REQUEST for the same case resolves to a clean `KYC1_OVERRIDE_INVALID_
 * STATE` (migration 045's own `idx_kyc1_manual_override_request_one_open_per_case` partial unique
 * index is the defensive backstop, `isDuplicateOpenOverrideViolation`). A raced concurrent APPLY
 * for the SAME override resolves to the identical clean `KYC1_OVERRIDE_INVALID_STATE` — NEVER a
 * raw `23505` surfacing as `KYC1_AUDIT_REQUIRED`, the exact MED-2 shape from Phase 2B applied here
 * from day one rather than discovered by review.
 *
 * `status='cancelled'` remains migration 045's own forward-compatible, UNREACHABLE lifecycle value
 * this phase — no cancel route exists. `status='failed'` IS reachable (MED-3 fix, below) — a raced
 * apply is rejected `KYC1_OVERRIDE_INVALID_STATE` WITHOUT writing `failed` (the row is simply left
 * `requested` or `applied`, whichever it already was), but a genuine case-state-drift refusal DOES
 * write `failed`, atomically with its own refusal audit.
 *
 * IAM-02 HTTP calls are NEVER made while a DB transaction is open, in either route — every
 * `checkPermission`/`verifyDecisionToken` call happens in a plain pre-transaction read/validate
 * phase; the mutating transaction itself only re-locks, re-validates, and writes (mirrors AML-01's
 * own `confirm`/`dismiss` apply route exactly, and `routes/outcome-publication.ts`'s own TX1-HTTP-
 * TX2 shape for the identical reason: never hold a DB connection open across an external call).
 *
 * MED-3 FIX (independent Opus review of Phase 3B): the ORIGINAL version of this file bound an
 * override approval only to `{override_id, case_id, target_type, target_outcome_status,
 * reason_code, requested_by}` — never to the case OUTCOME that existed at request time. A request
 * approved while a case was `remediation_required` could be applied AFTER genuinely adverse
 * evidence had already recomputed the case to `fail`, silently masking the fail finding (and D5's
 * own recompute-lock then made it unreassertable except via a new case) — reproduced empirically by
 * the independent review, not a theoretical concern. Fixed via migration 045's own new
 * `approved_against_outcome_id`/`approved_against_outcome_status` columns: the REQUEST route
 * captures the case's CURRENT outcome from its own locked re-read (never the unlocked preflight
 * read) and stores it on the row; the canonical payload hash (`overridePayload`, `lib/outcome-
 * override.ts`) now includes both fields, so the IAM-02 approval itself is cryptographically bound
 * to that exact snapshot; and the APPLY route's final transaction compares the case's CURRENT
 * `current_outcome_id`/`current_outcome_status` against the stored snapshot before ever inserting a
 * `cdd_outcome` row — any mismatch (including a same-status-different-version drift, e.g. a
 * corrective re-verification landing a NEW `fail` row) refuses `KYC1_CASE_INVALID_STATE` and
 * transitions the override to `status='failed'`, atomically with a `kyc1.manual_override_refused`
 * audit (`reason_code: "case_state_changed"`) — never inserting a `cdd_outcome` row, never touching
 * `kyc_case`, never emitting `manual_override_applied`. A fresh request for the case's new current
 * outcome may be created immediately afterward (the `failed` row vacates the `one_open_per_case`
 * partial index exactly like `applied` already does).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeKyc1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchChecklistItems, fetchVerificationResults, normalizeKycCaseRow, type KycCaseRow, type KycCaseType } from "../lib/kyc-case.js";
import { computeCddOutcome } from "../lib/outcome-engine.js";
import { fetchCaseOrThrow } from "./cases.js";
import { caseStatusForOutcome } from "./outcome.js";
import {
  checkSelfOverrideBlocked,
  isDuplicateOpenOverrideViolation,
  manualOverrideOutcomeReason,
  MANUAL_OVERRIDE_REASON_CODES,
  overrideNotFound,
  overridePayload,
  safeOverrideRequestResponse,
  type ManualOverrideRequestRow,
} from "../lib/outcome-override.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Kyc1Error } from "../lib/errors.js";
import type { Kyc1Config } from "../config.js";

const CaseIdParams = Type.Object({ case_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const OverrideRequestBody = Type.Object(
  {
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    target_outcome_status: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("remediation_required")]),
    reason_code: Type.Union([
      Type.Literal("system_derived_outcome_incorrect"),
      Type.Literal("manual_evidence_review"),
      Type.Literal("documented_compliance_exception"),
    ]),
  },
  { additionalProperties: false },
);

const OverrideApplyBody = Type.Object(
  {
    override_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

const OVERRIDE_REQUEST_COLUMNS = "override_id, case_id, target_type, target_outcome_status, reason_code, approved_against_outcome_id, approved_against_outcome_status, requested_by, approval_id, status, payload_hash, applied_outcome_id, created_at_utc, applied_at_utc";
const KYC_CASE_COLUMNS = "case_id, application_id, client_id, party_id, case_type, status, current_outcome_status, current_outcome_id, created_from_handoff_id, created_at_utc, updated_at_utc";

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Kyc1Error("KYC1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Kyc1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

/** Case-scoped advisory lock — see this file's own header comment. Namespaced (`kyc1.manual_
 * override:` prefix) to avoid hash-space collision with `outcome-publication.ts`'s own
 * `kyc1.outcome_publication:`-prefixed application-scoped lock (different key space entirely, but
 * namespacing costs nothing and documents intent). */
async function takeCaseOverrideLock(client: Sql, caseId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kyc1.manual_override:${caseId}`]);
}

async function fetchLatestOutcomeReason(sql: Sql, outcomeId: string | null): Promise<string | null> {
  if (!outcomeId) return null;
  const rows = await query<{ outcome_reason: string }>(sql, `SELECT outcome_reason FROM kyc1.cdd_outcome WHERE outcome_id = $1`, [outcomeId]);
  return rows[0]?.outcome_reason ?? null;
}

/** The one case-state condition this file ever refuses on — reused across both the pre-transaction
 * check and the in-transaction re-check (see this file's own header comment). Not exported: no
 * caller outside this file needs it. */
function caseIsOverridable(currentOutcomeStatus: string | null, latestOutcomeReason: string | null, targetStatus: string): boolean {
  if (!currentOutcomeStatus) return false;
  if (latestOutcomeReason && MANUAL_OVERRIDE_REASON_CODES.has(latestOutcomeReason)) return false;
  if (currentOutcomeStatus === targetStatus) return false;
  return true;
}

/** Best-effort refusal audit for the self-override SoD block — mirrors `routes/outcome-
 * publication.ts`'s own `recordRefusalAudit` precedent exactly: no compliance-critical state was
 * mutated by the refusal itself (no override row was created), so a failure to record this audit
 * does not also need to fail the response — `KYC1_SELF_OVERRIDE_BLOCKED` is thrown regardless.
 * `actor_id` is a generic service identity, NEVER `requested_by` — logging the blocked requester's
 * own asserted identity as `actor_id` would defeat `lib/errors.ts`'s own "do not log requested_by
 * value" rule for this event. */
async function recordSelfOverrideRefusalAudit(caseId: string): Promise<void> {
  try {
    await withTransaction((client) =>
      publishAudit(client, {
        event_type: "kyc1.manual_override_refused",
        source_module: "KYC-01",
        actor_id: "kyc1_internal_service",
        actor_type: "service",
        entity_type: "cdd_outcome",
        entity_id: caseId,
        severity: "medium",
        action: "cdd_outcome.override_refuse",
        result: "blocked",
        reason_code: "self_override_blocked",
        metadata: { case_id: caseId, requested_by_present: true, reason_code: "self_override_blocked" },
      }),
    );
  } catch {
    // Best-effort only — see this function's own doc comment.
  }
}

export async function registerOutcomeOverrideRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeKyc1InternalIdentityGuard((app.config as Kyc1Config).kyc1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/cases/:case_id/outcome-override/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/kyc1/cases/:case_id/outcome-override/request",
    { preHandler: requireInternal, schema: { params: CaseIdParams, body: OverrideRequestBody } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      const body = request.body as Static<typeof OverrideRequestBody>;
      assertPoolAvailable();

      // Pre-transaction validation — plain reads, no lock (the final transaction below re-locks
      // and re-validates from scratch before writing; this phase only needs to fail fast and
      // avoid calling IAM-02 for an obviously-doomed request).
      const caseRow = await fetchCaseOrThrow(case_id);
      const latestReason = await fetchLatestOutcomeReason(getPool(), caseRow.current_outcome_id);
      if (!caseIsOverridable(caseRow.current_outcome_status, latestReason, body.target_outcome_status)) {
        throw new Kyc1Error("KYC1_CASE_INVALID_STATE");
      }

      // Self-override SoD (D6) — checked BEFORE the IAM-02 baseline call; a blocked request never
      // reaches IAM-02 and creates no override row. See lib/outcome-override.ts's own header
      // comment for the registry-only-case limitation.
      const selfCheckRows = await query<{ blocked: boolean }>(
        getPool(),
        `SELECT EXISTS(SELECT 1 FROM kyc1.verification_result WHERE case_id = $1 AND source_type = 'manual' AND source_id = $2) AS blocked`,
        [case_id, body.requested_by],
      );
      try {
        checkSelfOverrideBlocked(selfCheckRows[0]?.blocked ?? false);
      } catch (err) {
        if (err instanceof Kyc1Error && err.code === "KYC1_SELF_OVERRIDE_BLOCKED") {
          await recordSelfOverrideRefusalAudit(case_id);
        }
        throw err;
      }

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: "kyc1.outcome.override", resource: "cdd_outcome", entityId: case_id });
      if (!baseline.allowed) {
        throw new Kyc1Error(baseline.reason === "iam2_unavailable" ? "KYC1_IAM2_UNAVAILABLE" : "KYC1_PERMISSION_DENIED");
      }

      const overrideId = "kyc1ovr_" + randomUUID();

      type RequestOutcome = { kind: "case_invalid_state" } | { kind: "duplicate_open_request" } | { kind: "created"; row: ManualOverrideRequestRow };
      let outcome: RequestOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Case-scoped lock — FIRST statement, before any read/write. See this file's own header
          // comment.
          await takeCaseOverrideLock(client, case_id);

          const lockedRows = await client.query<KycCaseRow>(`SELECT ${KYC_CASE_COLUMNS} FROM kyc1.kyc_case WHERE case_id = $1 FOR UPDATE`, [case_id]);
          const lockedCase = lockedRows.rows[0] ? normalizeKycCaseRow(lockedRows.rows[0]) : undefined;
          if (!lockedCase) throw new Kyc1Error("KYC1_CASE_NOT_FOUND");

          const lockedReason = await fetchLatestOutcomeReason(client, lockedCase.current_outcome_id);
          if (!caseIsOverridable(lockedCase.current_outcome_status, lockedReason, body.target_outcome_status)) {
            return { kind: "case_invalid_state" };
          }

          // Proactive check-then-insert — the partial unique index is the race-safe backstop, but
          // under the advisory lock above this is never actually racy (mirrors kyc_case's own
          // anchor-uniqueness idiom).
          const existingOpen = await client.query(`SELECT 1 FROM kyc1.manual_override_request WHERE case_id = $1 AND status = 'requested'`, [case_id]);
          if (existingOpen.rows.length > 0) {
            return { kind: "duplicate_open_request" };
          }

          // MED-3 fix — captured from THIS locked re-read, never the unlocked preflight read
          // above (`caseRow`). `current_outcome_id` is guaranteed non-null here: `caseIsOverridable`
          // already required `current_outcome_status` (and therefore, by the write-together
          // invariant, `current_outcome_id`) to be non-null to reach this point.
          const approvedAgainstOutcomeId = lockedCase.current_outcome_id!;
          const approvedAgainstOutcomeStatus = lockedCase.current_outcome_status!;
          const payloadHash = fingerprint(
            overridePayload({
              override_id: overrideId,
              case_id,
              target_type: "cdd_outcome",
              target_outcome_status: body.target_outcome_status,
              reason_code: body.reason_code,
              approved_against_outcome_id: approvedAgainstOutcomeId,
              approved_against_outcome_status: approvedAgainstOutcomeStatus,
              requested_by: body.requested_by,
            }),
          );

          let inserted;
          try {
            inserted = await client.query<ManualOverrideRequestRow>(
              `INSERT INTO kyc1.manual_override_request
                 (override_id, case_id, target_type, target_outcome_status, reason_code, approved_against_outcome_id, approved_against_outcome_status, requested_by, status, payload_hash, request_id, correlation_id)
               VALUES ($1,$2,'cdd_outcome',$3,$4,$5,$6,$7,'requested',$8,$9,$10)
               RETURNING ${OVERRIDE_REQUEST_COLUMNS}`,
              [overrideId, case_id, body.target_outcome_status, body.reason_code, approvedAgainstOutcomeId, approvedAgainstOutcomeStatus, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
            );
          } catch (err) {
            if (isDuplicateOpenOverrideViolation(err)) return { kind: "duplicate_open_request" };
            throw err;
          }
          const row = inserted.rows[0]!;

          await publishAudit(client, {
            event_type: "kyc1.manual_override_requested",
            source_module: "KYC-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "cdd_outcome",
            entity_id: case_id,
            severity: "medium",
            action: "cdd_outcome.override_request",
            result: "success",
            metadata: { override_id: overrideId, case_id, target_type: "cdd_outcome", target_outcome_status: body.target_outcome_status, reason_code: body.reason_code },
          });

          return { kind: "created", row };
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "case_invalid_state") throw new Kyc1Error("KYC1_CASE_INVALID_STATE");
      if (outcome.kind === "duplicate_open_request") throw new Kyc1Error("KYC1_OVERRIDE_INVALID_STATE");

      return reply.code(201).send(successEnvelope(safeOverrideRequestResponse(outcome.row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/kyc1/cases/:case_id/outcome-override/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/kyc1/cases/:case_id/outcome-override/apply",
    { preHandler: requireInternal, schema: { params: CaseIdParams, body: OverrideApplyBody } },
    async (request, reply) => {
      const { case_id } = request.params as Static<typeof CaseIdParams>;
      const body = request.body as Static<typeof OverrideApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      // Preflight — plain reads, IAM-02 calls, all OUTSIDE any DB transaction. See this file's
      // own header comment.
      const overrideRows = await query<ManualOverrideRequestRow>(getPool(), `SELECT ${OVERRIDE_REQUEST_COLUMNS} FROM kyc1.manual_override_request WHERE override_id = $1`, [body.override_id]);
      const overrideRow = overrideRows[0];
      if (!overrideRow || overrideRow.case_id !== case_id) overrideNotFound();
      if (overrideRow.status !== "requested") throw new Kyc1Error("KYC1_OVERRIDE_INVALID_STATE");

      // actor_id is the STORED requester, NEVER a caller-presented identity from the apply body —
      // mirrors AML-01's own confirm/dismiss apply route exactly.
      const baseline = await checkPermission(iam2, { actorId: overrideRow.requested_by, action: "kyc1.outcome.override", resource: "cdd_outcome", entityId: case_id });
      if (!baseline.allowed) {
        throw new Kyc1Error(baseline.reason === "iam2_unavailable" ? "KYC1_IAM2_UNAVAILABLE" : "KYC1_PERMISSION_DENIED");
      }

      // Recomputed from the STORED row, never from caller-supplied apply-body fields.
      const currentPayloadHash = fingerprint(overridePayload(overrideRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: overrideRow.requested_by,
        action: "kyc1.outcome.override",
        resource: "cdd_outcome",
        entityId: case_id,
        currentPayloadHash,
      });
      if (!verify.authorised) {
        throw new Kyc1Error(verify.reason === "iam2_unavailable" ? "KYC1_IAM2_UNAVAILABLE" : "KYC1_APPROVAL_REQUIRED");
      }

      // Final apply transaction — re-lock/re-validate everything from scratch (the preflight
      // reads above are not trusted for the actual write; approval and preflight state can go
      // stale between the HTTP round-trip to IAM-02 and this point).
      type ApplyOutcome = { kind: "raced" } | { kind: "case_state_changed" } | { kind: "applied"; outcomeId: string; outcomeStatus: string; outcomeVersion: number };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          await takeCaseOverrideLock(client, case_id);

          const relockedOverrideRows = await client.query<ManualOverrideRequestRow>(`SELECT ${OVERRIDE_REQUEST_COLUMNS} FROM kyc1.manual_override_request WHERE override_id = $1 FOR UPDATE`, [body.override_id]);
          const relockedOverride = relockedOverrideRows.rows[0];
          if (!relockedOverride || relockedOverride.status !== "requested") {
            return { kind: "raced" };
          }

          const relockedCaseRows = await client.query<KycCaseRow>(`SELECT ${KYC_CASE_COLUMNS} FROM kyc1.kyc_case WHERE case_id = $1 FOR UPDATE`, [case_id]);
          const relockedCase = relockedCaseRows.rows[0] ? normalizeKycCaseRow(relockedCaseRows.rows[0]) : undefined;
          if (!relockedCase) throw new Kyc1Error("KYC1_CASE_NOT_FOUND");

          // MED-3 fix — THE control. The case's CURRENT outcome must still exactly match the
          // snapshot this override's approval was granted against — compared by ID (not merely by
          // status), so a same-status-different-version drift (e.g. a corrective re-verification
          // landing a NEW row with the identical status) is also caught, which a status-only
          // comparison would miss (see this file's own header comment / migration 045's own header
          // comment for the reproduced exploit this closes).
          const caseStateChanged =
            relockedCase.current_outcome_id !== relockedOverride.approved_against_outcome_id ||
            relockedCase.current_outcome_status !== relockedOverride.approved_against_outcome_status;

          // Defence-in-depth only — re-running caseIsOverridable() here is expected to always agree
          // with the exact-match comparison above when nothing has changed (if the snapshot matches,
          // the same case-outcome row that was already validated overridable at request time is
          // still the current one). The snapshot comparison above is the ACTUAL MED-3 control.
          const stillOverridable = !caseStateChanged
            ? caseIsOverridable(relockedCase.current_outcome_status, await fetchLatestOutcomeReason(client, relockedCase.current_outcome_id), relockedOverride.target_outcome_status)
            : false;

          if (caseStateChanged || !stillOverridable) {
            await client.query(`UPDATE kyc1.manual_override_request SET status = 'failed' WHERE override_id = $1`, [relockedOverride.override_id]);

            // actor_id is a generic service identity, NEVER requested_by — see
            // recordSelfOverrideRefusalAudit's own doc comment for the identical reasoning.
            await publishAudit(client, {
              event_type: "kyc1.manual_override_refused",
              source_module: "KYC-01",
              actor_id: "kyc1_internal_service",
              actor_type: "service",
              entity_type: "cdd_outcome",
              entity_id: case_id,
              severity: "medium",
              action: "cdd_outcome.override_refuse",
              result: "blocked",
              reason_code: "case_state_changed",
              metadata: { override_id: relockedOverride.override_id, case_id, reason_code: "case_state_changed" },
            });

            return { kind: "case_state_changed" };
          }

          const previousOutcomeStatus = relockedCase.current_outcome_status;
          const targetStatus = relockedOverride.target_outcome_status as "pass" | "fail" | "remediation_required";

          // Same structured-snapshot logic the normal compute path uses (routes/outcome.ts) — the
          // engine's own verification_scope is the evidence snapshot; outcome_status/outcome_
          // reason are the override's own values, never the engine's computed ones.
          const checklistItems = await fetchChecklistItems(client, case_id);
          const verificationResults = await fetchVerificationResults(client, case_id);
          const engineResult = computeCddOutcome({
            caseType: relockedCase.case_type as KycCaseType,
            checklistItems: checklistItems.map((c) => ({ required: c.required, status: c.status })),
            verificationResults: verificationResults.map((v) => ({
              verificationResultId: v.verification_result_id,
              resultType: v.result_type,
              resultStatus: v.result_status,
              receivedAtUtc: v.received_at_utc,
            })),
          });

          const versionRows = await client.query<{ next_version: number }>(`SELECT COALESCE(MAX(outcome_version), 0) + 1 AS next_version FROM kyc1.cdd_outcome WHERE case_id = $1`, [case_id]);
          const outcomeVersion = versionRows.rows[0]!.next_version;

          const evidenceRefs = { checklist_item_ids: checklistItems.map((c) => c.checklist_item_id), verification_result_ids: verificationResults.map((v) => v.verification_result_id) };
          const outcomeReason = manualOverrideOutcomeReason(targetStatus);
          const outcomeId = "kyc1outcome_" + randomUUID();
          const payloadHash = fingerprint({
            case_id,
            outcome_status: targetStatus,
            outcome_reason: outcomeReason,
            verification_scope: engineResult.verificationScope,
            evidence_refs: evidenceRefs,
            outcome_version: outcomeVersion,
            override_id: relockedOverride.override_id,
          });

          // APPEND-ONLY (D3) — INSERT only, never an UPDATE to any prior cdd_outcome row.
          await client.query(
            `INSERT INTO kyc1.cdd_outcome (outcome_id, case_id, outcome_status, outcome_reason, verification_scope, evidence_refs, outcome_version, payload_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [outcomeId, case_id, targetStatus, outcomeReason, JSON.stringify(engineResult.verificationScope), JSON.stringify(evidenceRefs), outcomeVersion, payloadHash],
          );

          // Same four columns, same helper `compute-outcome` already uses — no widened grant
          // needed.
          await client.query(
            `UPDATE kyc1.kyc_case SET status = $2, current_outcome_status = $3, current_outcome_id = $4, updated_at_utc = now() WHERE case_id = $1`,
            [case_id, caseStatusForOutcome(targetStatus), targetStatus, outcomeId],
          );

          await client.query(
            `UPDATE kyc1.manual_override_request SET status = 'applied', approval_id = $2, decision_token_hash = $3, applied_outcome_id = $4, applied_at_utc = now() WHERE override_id = $1`,
            [relockedOverride.override_id, body.approval_id, fingerprint(body.decision_token), outcomeId],
          );

          await publishAudit(client, {
            event_type: "kyc1.manual_override_applied",
            source_module: "KYC-01",
            actor_id: relockedOverride.requested_by,
            actor_type: "user",
            entity_type: "cdd_outcome",
            entity_id: outcomeId,
            severity: "high",
            action: "cdd_outcome.override_apply",
            result: "success",
            metadata: {
              override_id: relockedOverride.override_id,
              case_id,
              outcome_id: outcomeId,
              outcome_status: targetStatus,
              outcome_version: outcomeVersion,
              previous_outcome_status: previousOutcomeStatus,
              approval_id: body.approval_id,
            },
          });

          return { kind: "applied", outcomeId, outcomeStatus: targetStatus, outcomeVersion };
        });
      } catch (err) {
        if (err instanceof Kyc1Error) throw err;
        throw new Kyc1Error("KYC1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") throw new Kyc1Error("KYC1_OVERRIDE_INVALID_STATE");
      // MED-3 fix — a case-state-changed refusal is about the CASE's own state (it drifted since
      // the approval was granted), not the override row's lifecycle state — reuses
      // KYC1_CASE_INVALID_STATE, mirroring the request route's own identical semantic split.
      if (outcome.kind === "case_state_changed") throw new Kyc1Error("KYC1_CASE_INVALID_STATE");

      // Never auto-publish, never auto-deliver — explicit republish/redelivery required (D2/§10).
      // The existing Phase 2B machinery handles the interaction unchanged: the prior active
      // publication's own stored snapshot no longer matches this case's new live aggregate, so a
      // subsequent /deliver call on it fails KYC1_OUTCOME_PUBLICATION_STALE before any CLT-01 HTTP
      // call — no new code needed here for that to be true.
      return reply.send(
        successEnvelope(
          {
            override_id: body.override_id,
            case_id,
            outcome_id: outcome.outcomeId,
            outcome_status: outcome.outcomeStatus,
            outcome_version: outcome.outcomeVersion,
            republish_required: true,
            redelivery_required: true,
          },
          meta(request),
        ),
      );
    },
  );
}
