/**
 * CLT-01 Phase 2 — review/approve/reject/hold decision routes (blueprint `04_API_Specification.md`
 * §2.6-§2.8, `06_State_Machine.md` application diagram, `07_Permission_Rules.md`, approved Phase 2
 * scope). CLT-01's first real IAM-02 integration.
 *
 * `start-review` (moved here from routes/applications.ts) is now IAM-02-permission-gated
 * (`clt1.application.review`) instead of the Phase 1 internal-identity-only guard, and now
 * REQUIRES a real `reviewer_id` (Phase 1 left it optional) — the actor IAM-02's baseline check is
 * run against.
 *
 * `reject`/`hold` are single-step, `checkPermission`-baseline-gated actions
 * (`clt1.application.reject`/`.hold`) — approved Phase 2 design decision: only the
 * capability-granting action (`approve`, which creates a `client_profile` row) needs the full
 * maker-checker ceremony; reject/hold merely stop progression and are cheap to reconsider later,
 * the same proportionality CFG-01 Phase 3B applied to kill-switch activation vs. deactivation.
 *
 * `approve` is request/apply with IAM-02 execute-verify — mirrors
 * `services/cfg1/src/routes/feature-changes.ts` exactly: `request` computes and stores a
 * `payload_hash` over `{decision_id, application_id, client_class_claimed, requested_by}`
 * (`client_class_claimed` SNAPSHOT taken at request time, stored on
 * `clt1.application_decision_request` — apply recomputes the SAME hash from this STORED row,
 * never a live re-read of `client_application`); `apply` calls IAM-02's `execute-verify` with
 * `actor_id` bound to the STORED row's own `requested_by` (never a caller-supplied value — the
 * token IAM-02 minted is bound to the ORIGINAL requester, not the approver); the IAM-02 approval
 * itself is created by an operator OUTSIDE these routes via IAM-02's own EXISTING
 * `/iam2/approvals/request` + `/iam2/approvals/:id/approve` endpoints — CLT-01 builds no
 * maker-checker tables of its own beyond `application_decision_request`'s request/apply binding
 * row.
 *
 * TOKEN-CONSUMED-AFTER-VERIFY DISCIPLINE (identical to CFG-01's own): IAM-02's execute-verify call
 * happens BEFORE this route opens its own local transaction — the token is consumed the moment
 * `verifyDecisionToken` returns `authorised: true`. A failure anywhere after that point does NOT
 * force the decision-request row into a separate `failed` terminal status (that write would face
 * the same audit-durability requirement that may itself be what's broken); the apply transaction
 * simply rolls back and the row is left exactly as `requested`, safely retriable with a FRESH
 * IAM-02 approval. `recordFailureAudit()` makes a best-effort, audit-only attempt at
 * observability when the failure is not itself an audit/outbox failure.
 *
 * SELF-APPROVAL: `approve/request` blocks when `requested_by === assigned_reviewer` (blueprint SoD
 * rule 1: "Application reviewer cannot approve own review") — a CLT-01-owned check IAM-02 has no
 * way to know about, mirroring CFG-01 Phase 3B's own `activated_by`-vs-proposer self-block.
 * IAM-02's own approve endpoint separately blocks requester==approver; execute-verify never
 * exposes approver identity back to CLT-01 (services/iam2/src/routes/approvals.ts), so whether the
 * eventual APPROVER is also the assigned reviewer cannot be checked from CLT-01's side — a
 * documented, accepted limitation, not an invented approver identity.
 *
 * FINAL APPROVAL PRECONDITIONS (all re-checked, defense in depth, both before the network calls
 * AND again inside the locked transaction): application still `under_review`; at least one KYC and
 * one AML `handoff_status` row exist (blueprint data rule 3); all four CDD rollup statuses read
 * `pass` (lib/outcomes.ts); no `duplicate_candidate` touching this application (or one of its
 * `authorised_party` nodes) has an unresolved-or-adverse status (Phase 7, lib/duplicate-candidates.ts
 * — see below); a fresh CFG-01 onboarding-gate re-check passes. Only on success does
 * `client_profile` get its one and only row, at `status = 'active_limited'` — non-transactional,
 * no wallet/deposit/withdrawal/trading/settlement/Exchange capability (approved Phase 2 design
 * decisions #10/#11).
 *
 * PHASE 7 — DUPLICATE-CANDIDATE APPROVAL GATE (final approval compliance gate wiring). Blocks
 * `approve/request` and `approve/apply` if any `clt1.duplicate_candidate` touching
 * `application:application_id` or `party:<authorised_party_id under this application>` (either
 * side of the pair, bounded single-hop, mirrors Phase 6's own client-scoped read query shape) has
 * status `open`/`duplicate`/`needs_more_info` — `evaluateDuplicateCandidateGateForApproval`
 * (lib/duplicate-candidates.ts) throws `CLT1_DUPLICATE_REVIEW_REQUIRED` (409). `duplicate` blocks
 * because it means a reviewer already CONFIRMED an adverse duplicate finding — approving anyway
 * would defeat the entire point of that review; only `not_duplicate` (reviewer-confirmed safe) or
 * an empty candidate list allows approval. No `client` node check — `client_profile` does not
 * exist until this exact apply transaction creates it, so no pre-existing candidate can reference
 * it. `related_party_edge` and `authorised_party` screening status are DELIBERATELY NOT checked
 * here (approved Phase 7 design decisions — see lib/duplicate-candidates.ts's own header comment):
 * `related_party_edge` is a declarative relationship record, not a finding outcome; `authorised_
 * party` screening effects stay local to Phase 4's own party-activation gate. The candidate list is
 * NOT included in `payload_hash` — re-checked fresh at both `request` and `apply` (same "dynamic,
 * not hash-bound" posture the CDD/handoff gates above already use), so a candidate that becomes
 * blocking between request and apply fails the apply, never silently passes on a stale snapshot.
 *
 * Phase 2 L1 CLOSED: the approval-failure audit wrapper event was renamed from the CDD-specific
 * `clt1.cdd_gate_denied` to the generic `clt1.application_approval_denied` — Phase 7 adds a THIRD
 * distinct failure family (duplicate-review) through this exact same function, making the old
 * CDD-specific name actively misleading rather than just imprecise. `reason_code` continues to
 * carry the specific `Clt1Error.code` for every family (CFG gate denial, CDD outcome failure, KYC/
 * AML handoff missing, duplicate review required) — this rename is a name-only fix, not a new
 * observability mechanism.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.1 — approval-gate roster-staleness recheck (migration
 * `047_clt1_atomic_kyc_roster_binding.cjs`). Closes the SECOND, larger window the KYC-01 Phase 4
 * delivery-atomicity planning amendment identified: a genuine `kyc_kyb` pass can be accepted by
 * `routes/outcomes.ts` at one moment, and the authorised-party roster can change AFTER that
 * acceptance but BEFORE final approval executes — a window that can span days, not milliseconds,
 * and that nothing previously re-checked.
 *
 * `approve/apply`'s locked transaction now acquires `lib/kyc-roster.ts`'s shared advisory lock as
 * its OWN FIRST STATEMENT (before the existing `application_decision_request`/`client_application`
 * `FOR UPDATE` row locks below), then — as a FOURTH approval precondition alongside the existing
 * CDD/handoff/duplicate-candidate gates — requires `client_application.kyc_roster_hash` to be
 * non-NULL (a `kyc_kyb` outcome was genuinely accepted under this binding at some point) AND to
 * exactly equal the CURRENT roster digest, recomputed fresh under the same lock via
 * `fetchCurrentRosterHash` (the accepted Phase 4A canonical helper, never reimplemented). A NULL
 * or mismatched binding is `CLT1_KYC_ROSTER_STALE` — no `client_profile` row is created, the
 * application is not approved, and the refusal is durably audited via the SAME
 * `recordFailureAudit`/`clt1.application_approval_denied` wrapper every other approval-gate
 * failure already uses (`reason_code: 'CLT1_KYC_ROSTER_STALE'`), not a second, decorative refusal
 * event.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { evaluateOnboardingGate, type Cfg1ClientConfig } from "../lib/cfg1-client.js";
import { applicationNotFound, interpretCfgGate, safeApplicationResponse, validateTransition, type ClientApplicationRow } from "../lib/applications.js";
import { evaluateCddGateForApproval, requireHandoffsForApproval } from "../lib/outcomes.js";
import { evaluateDuplicateCandidateGateForApproval, type DuplicateCandidateGateRow } from "../lib/duplicate-candidates.js";
import { acquireKycRosterLock, fetchCurrentRosterHash } from "../lib/kyc-roster.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const StartReviewBody = Type.Object({ reviewer_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const ApproveRequestBody = Type.Object(
  { requested_by: Type.String({ minLength: 1, maxLength: 64 }), reason: Type.Optional(Type.String({ maxLength: 256 })) },
  { additionalProperties: false },
);

const ApproveApplyBody = Type.Object(
  {
    decision_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

const RejectHoldBody = Type.Object(
  { actor_id: Type.String({ minLength: 1, maxLength: 64 }), reason_code: Type.Optional(Type.String({ maxLength: 64 })) },
  { additionalProperties: false },
);

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Clt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

function cfg1ClientConfig(config: Clt1Config): Cfg1ClientConfig {
  return { baseUrl: config.cfg1BaseUrl, internalServiceToken: config.cfg1InternalServiceToken, fetchImpl: config.cfg1FetchImpl };
}

async function fetchApplicationOrThrow(applicationId: string): Promise<ClientApplicationRow> {
  const rows = await query<ClientApplicationRow>(getPool(), `SELECT * FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
  const row = rows[0];
  if (!row) applicationNotFound();
  return row;
}

/** Phase 7 — final approval compliance gate fetch. Bounded, single-hop, non-recursive: every
 * `duplicate_candidate` touching this application OR any of its `authorised_party` nodes, in
 * either the subject or matched role (mirrors Phase 6's own client-scoped read query shape
 * exactly). Selects `duplicate_candidate_id`/`status` only — no `evidence_ref`, no
 * `party_reference`, no PII. No `related_party_edge` query (approved design decision — see file
 * header comment). Accepts a plain `Sql` (pool or transaction client) so the SAME helper serves
 * both the pre-check (pool) and the in-transaction re-check (locked client) call sites below. */
async function fetchTouchingDuplicateCandidatesForApproval(sql: Sql, applicationId: string): Promise<DuplicateCandidateGateRow[]> {
  const partyRows = await query<{ authorised_party_id: string }>(sql, `SELECT authorised_party_id FROM clt1.authorised_party WHERE application_id = $1`, [applicationId]);
  const partyIds = partyRows.map((r) => r.authorised_party_id);
  return query<DuplicateCandidateGateRow>(
    sql,
    `SELECT duplicate_candidate_id, status FROM clt1.duplicate_candidate
     WHERE (subject_type = 'application' AND subject_ref = $1) OR (matched_type = 'application' AND matched_ref = $1)
        OR (subject_type = 'party' AND subject_ref = ANY($2)) OR (matched_type = 'party' AND matched_ref = ANY($2))`,
    [applicationId, partyIds],
  );
}

interface DecisionRequestRow {
  decision_id: string;
  application_id: string;
  client_class_claimed: string;
  requested_by: string;
  status: string;
  payload_hash: string;
}

function decisionPayload(row: { decision_id: string; application_id: string; client_class_claimed: string; requested_by: string }): Record<string, unknown> {
  return { decision_id: row.decision_id, application_id: row.application_id, client_class_claimed: row.client_class_claimed, requested_by: row.requested_by };
}

const APPROVE_ACTION = "clt1.application.approve";

export async function registerDecisionRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/start-review
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/start-review",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: StartReviewBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof StartReviewBody>;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "start-review");

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.reviewer_id,
        action: "clt1.application.review",
        resource: "application",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      let row: ClientApplicationRow;
      try {
        row = await withTransaction(async (client) => {
          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               status = 'under_review',
               under_review_at_utc = now(),
               assigned_reviewer = $2,
               version = version + 1,
               updated_at_utc = now()
             WHERE application_id = $1 AND status = 'submitted'
             RETURNING *`,
            [application_id, body.reviewer_id],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }
          await publishAudit(client, {
            event_type: "clt1.application_under_review",
            source_module: "CLT-01",
            actor_id: body.reviewer_id,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "medium",
            action: "start_review",
            result: "success",
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeApplicationResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/approve/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/approve/request",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ApproveRequestBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof ApproveRequestBody>;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "approve-request");

      if (current.assigned_reviewer && body.requested_by === current.assigned_reviewer) {
        throw new Clt1Error("CLT1_SELF_APPROVAL_BLOCKED");
      }

      // Phase 7 — cheap, local, fail-fast: before spending an IAM-02 network round-trip on a
      // request that would fail at apply anyway. Re-checked again at apply (see below).
      const touchingCandidates = await fetchTouchingDuplicateCandidatesForApproval(getPool(), application_id);
      evaluateDuplicateCandidateGateForApproval(touchingCandidates);

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.requested_by,
        action: APPROVE_ACTION,
        resource: "application",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1dec_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({ decision_id: decisionId, application_id, client_class_claimed: current.client_class_claimed, requested_by: body.requested_by }),
      );

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO clt1.application_decision_request
               (decision_id, application_id, decision, client_class_claimed, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,$2,'approve',$3,$4,$5,'requested',$6,$7,$8)`,
            [decisionId, application_id, current.client_class_claimed, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(client, {
            event_type: "clt1.application_approval_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "medium",
            action: "approve_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, application_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/approve/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/approve/apply",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ApproveApplyBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof ApproveApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<DecisionRequestRow>(
        getPool(),
        `SELECT decision_id, application_id, client_class_claimed, requested_by, status, payload_hash
           FROM clt1.application_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.application_id !== application_id) applicationNotFound();
      if (decisionRow!.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "approve-apply");

      // Pre-checks (cheap, local) before spending IAM-02/CFG-01 network round-trips — avoids
      // consuming a single-use IAM-02 decision token for an apply that would fail anyway. Both
      // are re-checked again inside the locked transaction below as defense in depth.
      const handoffRows = await query<{ target_module: string }>(
        getPool(),
        `SELECT DISTINCT target_module FROM clt1.handoff_status WHERE application_id = $1`,
        [application_id],
      );
      const targetModules = new Set(handoffRows.map((r) => r.target_module));
      requireHandoffsForApproval({ hasKyc: targetModules.has("KYC"), hasAml: targetModules.has("AML") });
      evaluateCddGateForApproval(current);
      const touchingCandidates = await fetchTouchingDuplicateCandidatesForApproval(getPool(), application_id);
      evaluateDuplicateCandidateGateForApproval(touchingCandidates);

      const baseline = await checkPermission(iam2, {
        actorId: decisionRow!.requested_by,
        action: APPROVE_ACTION,
        resource: "application",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      // No DB lock held across this network call — see file header comment.
      const currentPayloadHash = fingerprint(decisionPayload(decisionRow!));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow!.requested_by,
        action: APPROVE_ACTION,
        resource: "application",
        entityId: application_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      // From here on, IAM-02's decision token is CONSUMED — see file header comment for why the
      // decision-request row is deliberately NOT forced into a 'failed' terminal status on a
      // later failure.
      const requestedBy = decisionRow!.requested_by;
      async function recordFailureAudit(reasonCode: string): Promise<void> {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "clt1.application_approval_denied",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "high",
            action: "approve_apply",
            result: "failure",
            reason_code: reasonCode,
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only — see file header comment.
        });
      }

      // Fresh CFG-01 onboarding-gate re-check — defense in depth, mirrors Phase 1's own
      // create->submit double-check extended to a third checkpoint (create -> submit -> approve).
      const gate = await evaluateOnboardingGate(cfg1ClientConfig(app.config), {
        clientClass: current.client_class_claimed,
        applicationId: application_id,
        environment: app.config.environment,
      });
      if (!gate.allowed) {
        await recordFailureAudit(gate.reasonCode);
        interpretCfgGate(gate);
      }

      type ApplyOutcome =
        | { kind: "raced"; error: Clt1Error }
        | { kind: "gate_failed"; error: Clt1Error }
        | { kind: "applied"; clientId: string };

      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Phase 4A.1 — FIRST statement, before any row lock. See lib/kyc-roster.ts's own header
          // comment for the full ordering/deadlock-freedom argument.
          await acquireKycRosterLock(client, application_id);

          const lockedDecision = await client.query<{ status: string }>(
            `SELECT status FROM clt1.application_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }

          const lockedApp = await client.query<ClientApplicationRow>(`SELECT * FROM clt1.client_application WHERE application_id = $1 FOR UPDATE`, [application_id]);
          const appRow = lockedApp.rows[0];
          if (!appRow || appRow.status !== "under_review") {
            return { kind: "raced", error: new Clt1Error("CLT1_APPLICATION_INVALID_STATE") };
          }

          try {
            const freshHandoffs = await query<{ target_module: string }>(client, `SELECT DISTINCT target_module FROM clt1.handoff_status WHERE application_id = $1`, [application_id]);
            const freshModules = new Set(freshHandoffs.map((r) => r.target_module));
            requireHandoffsForApproval({ hasKyc: freshModules.has("KYC"), hasAml: freshModules.has("AML") });
            evaluateCddGateForApproval(appRow);
            // Phase 7 — re-checked fresh, inside the lock, immediately before the irreversible
            // client_profile INSERT: a candidate that appeared (or transitioned to a blocking
            // status) between request and this exact moment must fail the apply, not silently pass
            // on the request-time snapshot (see file header comment — not hash-bound, by design).
            const freshTouchingCandidates = await fetchTouchingDuplicateCandidatesForApproval(client, application_id);
            evaluateDuplicateCandidateGateForApproval(freshTouchingCandidates);
            // Phase 4A.1 — fourth approval precondition: the roster this application was last
            // accepted a kyc_kyb pass against must still be the CURRENT roster, recomputed fresh
            // under the SAME advisory lock. A NULL binding (no kyc_kyb outcome ever accepted under
            // this contract) is refused identically to a mismatched one — never treated as "no
            // check configured, allow by default".
            const currentRosterHash = await fetchCurrentRosterHash(client, application_id, { application_status: appRow.status, applicant_type: appRow.applicant_type });
            if (appRow.kyc_roster_hash === null || appRow.kyc_roster_hash !== currentRosterHash) {
              throw new Clt1Error("CLT1_KYC_ROSTER_STALE", {
                details: [{ field: "kyc_roster_hash", issue: `stored=${appRow.kyc_roster_hash ?? "null"} current=${currentRosterHash}` }],
              });
            }
          } catch (gateErr) {
            if (gateErr instanceof Clt1Error) return { kind: "gate_failed", error: gateErr };
            throw gateErr;
          }

          const clientId = "clt1client_" + randomUUID();
          await client.query(
            `INSERT INTO clt1.client_profile
               (client_id, application_id, applicant_type, legal_name, registration_number, country_of_incorporation, client_class, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active_limited')`,
            [clientId, application_id, appRow.applicant_type, appRow.legal_name, appRow.registration_number, appRow.country_of_incorporation, appRow.client_class_claimed],
          );

          await client.query(
            `UPDATE clt1.client_application SET
               status = 'approved', client_id = $2, approved_at_utc = now(), approval_id = $3,
               version = version + 1, updated_at_utc = now()
             WHERE application_id = $1`,
            [application_id, clientId, body.approval_id],
          );

          await client.query(
            `UPDATE clt1.application_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );

          await publishAudit(client, {
            event_type: "clt1.application_approved",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "high",
            action: "approve",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id, client_id: clientId },
          });
          await publishAudit(client, {
            event_type: "clt1.client_profile_created",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "client_profile",
            entity_id: clientId,
            severity: "high",
            action: "client_profile.create",
            result: "success",
            metadata: { application_id, status: "active_limited" },
          });

          return { kind: "applied", clientId };
        });
      } catch (err) {
        await recordFailureAudit("apply_transaction_failed");
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") throw outcome.error;
      if (outcome.kind === "gate_failed") {
        await recordFailureAudit(outcome.error.code);
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, application_id, status: "approved", client_id: outcome.clientId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/reject
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/reject",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: RejectHoldBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof RejectHoldBody>;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "reject");

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.actor_id,
        action: "clt1.application.reject",
        resource: "application",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      let row: ClientApplicationRow;
      try {
        row = await withTransaction(async (client) => {
          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               status = 'rejected', rejected_at_utc = now(), rejection_reason = $2,
               version = version + 1, updated_at_utc = now()
             WHERE application_id = $1 AND status = 'under_review'
             RETURNING *`,
            [application_id, body.reason_code ?? null],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }
          await publishAudit(client, {
            event_type: "clt1.application_rejected",
            source_module: "CLT-01",
            actor_id: body.actor_id,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "high",
            action: "reject",
            result: "success",
            reason_code: body.reason_code,
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeApplicationResponse(row), meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/applications/:application_id/hold
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/applications/:application_id/hold",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: RejectHoldBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as Static<typeof RejectHoldBody>;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "hold");

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.actor_id,
        action: "clt1.application.hold",
        resource: "application",
        entityId: application_id,
      });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      let row: ClientApplicationRow;
      try {
        row = await withTransaction(async (client) => {
          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               status = 'held', held_at_utc = now(), hold_reason = $2,
               version = version + 1, updated_at_utc = now()
             WHERE application_id = $1 AND status = 'under_review'
             RETURNING *`,
            [application_id, body.reason_code ?? null],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }
          await publishAudit(client, {
            event_type: "clt1.application_held",
            source_module: "CLT-01",
            actor_id: body.actor_id,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "medium",
            action: "hold",
            result: "success",
            reason_code: body.reason_code,
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeApplicationResponse(row), meta(request)));
    },
  );
}
