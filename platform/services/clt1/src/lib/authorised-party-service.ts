/**
 * CLT-01 Phase 4A.2A — shared, application-keyed authorised-party maker-checker service layer.
 *
 * Extracted from `routes/authorised-parties.ts`'s original client-keyed route bodies
 * (behaviour-preserving: every function below is the SAME logic those routes already ran, minus
 * the `client_id -> client_profile.application_id` resolution step, which both route families now
 * perform independently before calling in here — see `fetchApplicationForPartyCaptureOrThrow`
 * below and `fetchActiveClientOrThrow` in `routes/authorised-parties.ts`). This is intentional:
 * these functions never read `client_id`/`client_profile` at all, because the underlying
 * `clt1.authorised_party`/`clt1.authorised_party_decision_request` tables never carried a
 * `client_id` column in the first place (Phase 4's own design) — `client_id` was always only a
 * client-keyed ROUTE's lookup key, never a business fact these functions needed.
 *
 * Both route families (`routes/authorised-parties.ts`, client-keyed, post-approval maintenance;
 * `routes/application-authorised-parties.ts`, application-keyed, pre-approval capture) call
 * EXACTLY these functions — there is only one implementation of maker-checker request creation,
 * decision-token verification, apply-time payload-hash verification, advisory locking, party
 * INSERT/UPDATE/revoke, screening-result update, audit publication, and failure mapping.
 *
 * `activate`/`restrict`/`reject`/`suspend` are deliberately NOT included here — Phase 4A.2A's own
 * scope excludes pre-approval activation; those four remain client-keyed-only, unchanged, still
 * defined directly in `routes/authorised-parties.ts`.
 */
import { randomUUID } from "node:crypto";
import { fingerprint, getPool, publishAudit, query, withTransaction, type Sql } from "@aix/foundation";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "./iam2-client.js";
import { acquireKycRosterLock } from "./kyc-roster.js";
import {
  authorisedPartyNotFound,
  requireNotSelfAction,
  validateAuthorisedPartyTransition,
  type AuthorisedPartyRow,
  type AuthorisedPartyType,
  type IdentityVerificationStatus,
  type SanctionsPepStatus,
} from "./authorised-parties.js";
import { applicationNotFound, validateTransition, type ApplicationStatus } from "./applications.js";
import { Clt1Error } from "./errors.js";

export const ADD_ACTION = "clt1.authorised_party.add";
export const UPDATE_ACTION = "clt1.authorised_party.update";
export const REMOVE_ACTION = "clt1.authorised_party.remove";

/**
 * SECURITY-CRITICAL — Opus review of the initial Phase 4A.2A implementation found (CRITICAL-1/
 * CRITICAL-2, empirically proven) that `fetchApplicationForPartyCaptureOrThrow`'s lifecycle check
 * ran ONLY as a route preflight — outside any transaction, before `acquireKycRosterLock`. Because
 * `reject`/`hold` take no roster lock, and the preflight-to-transaction window spans a DB read plus
 * TWO IAM-02 HTTP round-trips (`checkPermission`, `verifyDecisionToken`), a party could be
 * INSERTed into an application that had already become `rejected`/`held`/`approved` by the time
 * the mutation actually committed — including AFTER Phase 4A.1's own approval roster-hash recheck
 * had already passed, producing an approved client holding an authorised party no KYC outcome ever
 * covered. `fetchApplicationForPartyCaptureOrThrow` remains a legitimate fail-fast optimisation
 * (cheap 404/409 before touching IAM-02 at all) but is NEVER the authoritative control.
 *
 * The authoritative control is `lockAndAssertApplicationLifecycle` below: a
 * `SELECT ... FOR UPDATE` on `clt1.client_application`, taken AFTER `acquireKycRosterLock`, INSIDE
 * the SAME transaction that performs the party mutation — so the row lock (which reject/hold DO
 * take implicitly via their own `client_application` `UPDATE ... WHERE application_id = $1`, an
 * ordinary row-level lock every Postgres UPDATE acquires) makes a concurrent reject/hold either
 * block until this transaction commits/rolls back, or have already committed and be visible to
 * this read — there is no window left in either ordering.
 *
 * The allowed-status set is passed in by the CALLING ROUTE as a typed, trusted
 * `allowedApplicationStatuses` list — never derived from the request body, a query parameter, or
 * any other caller-controlled input — so the pre-approval route family and the client-keyed
 * post-approval route family can never accidentally share (or silently weaken to) the wrong
 * lifecycle policy. See `PRE_APPROVAL_PARTY_STATUSES` / `PRE_APPROVAL_SCREENING_STATUSES` /
 * `POST_APPROVAL_PARTY_STATUSES` below.
 */
type LifecycleCheckResult = { ok: true } | { ok: false; error: Clt1Error };

/** The authoritative, transaction-local, row-locked lifecycle guard. MUST be called after
 * `acquireKycRosterLock` and before any `authorised_party`/`authorised_party_decision_request`
 * write or `publishAudit` call in the SAME transaction. Never throws for the ordinary "wrong
 * status" case — returns a discriminated result so callers fold it into their existing "raced"
 * outcome handling (matching the decision-request/party-row lock checks already in this file),
 * never collapsing a genuine `CLT1_APPLICATION_INVALID_STATE` into the generic
 * `CLT1_AUDIT_REQUIRED` an unexpected transaction failure maps to. */
async function lockAndAssertApplicationLifecycle(txClient: Sql, applicationId: string, allowedApplicationStatuses: readonly ApplicationStatus[]): Promise<LifecycleCheckResult> {
  const rows = await query<{ status: ApplicationStatus }>(txClient, `SELECT status FROM clt1.client_application WHERE application_id = $1 FOR UPDATE`, [applicationId]);
  const row = rows[0];
  // Structurally unreachable in practice (client_application has no DELETE grant and every caller
  // of these functions already resolved a real application_id before entering the transaction —
  // via fetchApplicationForPartyCaptureOrThrow pre-approval, or client_profile's own FK
  // post-approval) — handled explicitly rather than assumed, the same defense-in-depth discipline
  // this file's other locked re-reads already apply.
  if (!row) return { ok: false, error: new Clt1Error("CLT1_APPLICATION_NOT_FOUND") };
  if (!allowedApplicationStatuses.includes(row.status)) {
    return {
      ok: false,
      error: new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
        details: [{ field: "status", issue: `cannot mutate an authorised party while the application is in status '${row.status}'` }],
      }),
    };
  }
  return { ok: true };
}

/** Trusted lifecycle policy for the application-keyed pre-approval route family
 * (`routes/application-authorised-parties.ts`) — list/add/update/remove. Passed by that route
 * file's own call sites, never by caller input. Mirrors `lib/applications.ts`'s own
 * `authorised-party-capture` action's allowed-status list exactly (kept as a literal here, not a
 * re-export, so a change to one is never silently assumed to apply to the other — the preflight
 * and the transaction-local check are independent, intentionally redundant controls). */
export const PRE_APPROVAL_PARTY_STATUSES: readonly ApplicationStatus[] = ["draft", "submitted", "under_review"];

/** Trusted lifecycle policy for the application-keyed pre-approval screening-outcome route —
 * narrower than party capture itself (a screening result presupposes a party already exists to
 * screen). Mirrors `authorised-party-screening`'s own allowed-status list. */
export const PRE_APPROVAL_SCREENING_STATUSES: readonly ApplicationStatus[] = ["under_review"];

/** Trusted lifecycle policy for the existing client-keyed post-approval route family
 * (`routes/authorised-parties.ts`) — add/update/remove/screening-outcome. `client_profile` (and
 * therefore `fetchActiveClientOrThrow`'s own `active_limited` gate) never exists before
 * `client_application.status` reaches `approved`, and no action anywhere in
 * `lib/applications.ts`'s own `ALLOWED_STATUSES_FOR_ACTION` ever transitions AWAY from `approved`
 * — verified directly against that table, not assumed — so `approved` is the sole, stable
 * post-approval status these routes can ever legitimately observe. */
export const POST_APPROVAL_PARTY_STATUSES: readonly ApplicationStatus[] = ["approved"];

export interface PartyCaptureApplicationRow {
  application_id: string;
  status: string;
}

/**
 * Application-keyed resolution for pre-approval party capture — the counterpart to
 * `fetchActiveClientOrThrow` for the NEW route family. Queries `clt1.client_application` directly;
 * never reads `clt1.client_profile`; never requires a `client_id`. Returns
 * `CLT1_APPLICATION_NOT_FOUND` for an unknown application (never `CLT1_CLIENT_NOT_FOUND` — this
 * path has no client concept to be wrong about), then validates the permitted lifecycle for
 * `action` (`CLT1_APPLICATION_INVALID_STATE` on refusal — a genuine application-lifecycle problem,
 * not an authorised-party-state problem). Column-scoped SELECT — no PII (`legal_name`,
 * `applicant_email`, `registration_number`, `country_of_incorporation`) is ever read here, mirroring
 * `routes/kyc-roster.ts`'s own column-scoped read.
 */
export async function fetchApplicationForPartyCaptureOrThrow(
  applicationId: string,
  action: "authorised-party-capture" | "authorised-party-screening",
): Promise<PartyCaptureApplicationRow> {
  const rows = await query<PartyCaptureApplicationRow>(getPool(), `SELECT application_id, status FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
  const row = rows[0];
  if (!row) applicationNotFound();
  validateTransition(row.status, action);
  return row;
}

/** Normalises `ownership_percentage` to a string (or null) BEFORE it ever enters a payload-hash
 * computation — see `routes/authorised-parties.ts`'s own header comment for why this is required,
 * not cosmetic (node-postgres returns `numeric` as a string; a request-time hash computed over a
 * JS number would silently diverge from the apply-time hash recomputed from the stored string). */
function normaliseOwnership(value: number | string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function decisionPayload(row: {
  decision_id: string;
  application_id: string;
  decision_type: string;
  target_authorised_party_id: string | null;
  party_type: string | null;
  party_reference: string | null;
  ownership_percentage: string | number | null;
  sec_audit_ref: string | null;
  requested_by: string;
}): Record<string, unknown> {
  return {
    decision_id: row.decision_id,
    application_id: row.application_id,
    decision_type: row.decision_type,
    target_authorised_party_id: row.target_authorised_party_id,
    party_type: row.party_type,
    party_reference: row.party_reference,
    ownership_percentage: normaliseOwnership(row.ownership_percentage),
    sec_audit_ref: row.sec_audit_ref,
    requested_by: row.requested_by,
  };
}

interface AuthorisedPartyDecisionRow {
  decision_id: string;
  application_id: string;
  decision_type: "add" | "update" | "remove" | "activate";
  target_authorised_party_id: string | null;
  party_type: AuthorisedPartyType | null;
  party_reference: string | null;
  ownership_percentage: string | null;
  sec_audit_ref: string | null;
  requested_by: string;
  status: string;
}

async function fetchDecisionRowOrThrow(decisionId: string): Promise<AuthorisedPartyDecisionRow> {
  const rows = await query<AuthorisedPartyDecisionRow>(
    getPool(),
    `SELECT decision_id, application_id, decision_type, target_authorised_party_id, party_type, party_reference, ownership_percentage, sec_audit_ref, requested_by, status
       FROM clt1.authorised_party_decision_request WHERE decision_id = $1`,
    [decisionId],
  );
  const row = rows[0];
  if (!row) throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
  return row;
}

async function checkBaseline(iam2: Iam2ClientConfig, actorId: string, action: string, entityId: string): Promise<void> {
  const baseline = await checkPermission(iam2, { actorId, action, resource: "authorised_party", entityId });
  if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");
}

async function recordFailureAudit(eventType: string, actorId: string, entityType: "client_application" | "authorised_party", entityId: string, decisionId: string, action: string): Promise<void> {
  await withTransaction((txClient) =>
    publishAudit(txClient, {
      event_type: eventType,
      source_module: "CLT-01",
      actor_id: actorId,
      actor_type: "user",
      entity_type: entityType,
      entity_id: entityId,
      severity: "high",
      action,
      result: "failure",
      metadata: { decision_id: decisionId },
    }),
  ).catch(() => {
    // Best-effort only — see every original route's own identical comment.
  });
}

// -------------------------------------------------------------------------------------------
// ADD
// -------------------------------------------------------------------------------------------
export interface RequestPartyAddInput {
  applicationId: string;
  partyType: AuthorisedPartyType;
  partyReference: string;
  ownershipPercentage: number | null;
  secAuditRef: string | null;
  requestedBy: string;
  reason: string | null;
  requestId: string | null | undefined;
  correlationId: string | null | undefined;
  iam2: Iam2ClientConfig;
}

export async function requestPartyAdd(input: RequestPartyAddInput): Promise<{ decisionId: string; payloadHash: string }> {
  requireNotSelfAction(input.requestedBy, input.partyReference);
  await checkBaseline(input.iam2, input.requestedBy, ADD_ACTION, input.applicationId);

  const decisionId = "clt1apd_" + randomUUID();
  const payloadHash = fingerprint(
    decisionPayload({
      decision_id: decisionId,
      application_id: input.applicationId,
      decision_type: "add",
      target_authorised_party_id: null,
      party_type: input.partyType,
      party_reference: input.partyReference,
      ownership_percentage: input.ownershipPercentage,
      sec_audit_ref: input.secAuditRef,
      requested_by: input.requestedBy,
    }),
  );

  try {
    await withTransaction(async (txClient) => {
      await txClient.query(
        `INSERT INTO clt1.authorised_party_decision_request
           (decision_id, application_id, decision_type, party_type, party_reference, ownership_percentage, sec_audit_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
         VALUES ($1,$2,'add',$3,$4,$5,$6,$7,$8,'requested',$9,$10,$11)`,
        [decisionId, input.applicationId, input.partyType, input.partyReference, normaliseOwnership(input.ownershipPercentage), input.secAuditRef, input.reason, input.requestedBy, payloadHash, input.requestId, input.correlationId],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_add_requested",
        source_module: "CLT-01",
        actor_id: input.requestedBy,
        actor_type: "user",
        entity_type: "client_application",
        entity_id: input.applicationId,
        severity: "medium",
        action: "authorised_party.add_request",
        result: "success",
        metadata: { decision_id: decisionId },
      });
    });
  } catch (err) {
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  return { decisionId, payloadHash };
}

export interface ApplyPartyInput {
  applicationId: string;
  decisionId: string;
  approvalId: string;
  decisionToken: string;
  iam2: Iam2ClientConfig;
  /** Trusted, route-supplied lifecycle policy — see `PRE_APPROVAL_PARTY_STATUSES`/
   * `POST_APPROVAL_PARTY_STATUSES` above. Re-validated under a row lock inside the mutation
   * transaction; never sourced from request body/query/caller input. */
  allowedApplicationStatuses: readonly ApplicationStatus[];
}

export async function applyPartyAdd(input: ApplyPartyInput): Promise<{ decisionId: string; authorisedPartyId: string }> {
  const decisionRow = await fetchDecisionRowOrThrow(input.decisionId);
  if (decisionRow.application_id !== input.applicationId || decisionRow.decision_type !== "add") throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
  if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

  await checkBaseline(input.iam2, decisionRow.requested_by, ADD_ACTION, input.applicationId);

  const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
  const verify = await verifyDecisionToken(input.iam2, {
    decisionToken: input.decisionToken,
    approvalId: input.approvalId,
    actorId: decisionRow.requested_by,
    action: ADD_ACTION,
    resource: "authorised_party",
    entityId: input.applicationId,
    currentPayloadHash,
  });
  if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

  const requestedBy = decisionRow.requested_by;
  type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied"; authorisedPartyId: string };
  let outcome: ApplyOutcome;
  try {
    outcome = await withTransaction(async (txClient) => {
      await acquireKycRosterLock(txClient, input.applicationId);

      const lockedDecision = await txClient.query<{ status: string }>(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1 FOR UPDATE`, [input.decisionId]);
      if (lockedDecision.rows[0]?.status !== "requested") {
        return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
      }

      // Authoritative, transaction-local, row-locked lifecycle guard — see this file's own
      // header comment (CRITICAL-1/CRITICAL-2 remediation). MUST run before the INSERT below.
      const lifecycle = await lockAndAssertApplicationLifecycle(txClient, input.applicationId, input.allowedApplicationStatuses);
      if (!lifecycle.ok) return { kind: "raced", error: lifecycle.error };

      const authorisedPartyId = "clt1ap_" + randomUUID();
      await txClient.query(
        `INSERT INTO clt1.authorised_party
           (authorised_party_id, application_id, party_type, party_reference, ownership_percentage, sec_audit_ref, requested_by, approval_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [authorisedPartyId, input.applicationId, decisionRow.party_type, decisionRow.party_reference, decisionRow.ownership_percentage, decisionRow.sec_audit_ref, decisionRow.requested_by, input.approvalId],
      );
      await txClient.query(
        `UPDATE clt1.authorised_party_decision_request SET status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now() WHERE decision_id = $1`,
        [input.decisionId, input.approvalId, fingerprint(input.decisionToken)],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_added",
        source_module: "CLT-01",
        actor_id: requestedBy,
        actor_type: "user",
        entity_type: "authorised_party",
        entity_id: authorisedPartyId,
        severity: "high",
        action: "authorised_party.add",
        result: "success",
        metadata: { decision_id: input.decisionId, application_id: input.applicationId, approval_id: input.approvalId, party_type: decisionRow.party_type },
      });
      if (decisionRow.party_type === "ubo") {
        await publishAudit(txClient, {
          event_type: "clt1.ubo_identified",
          source_module: "CLT-01",
          actor_id: requestedBy,
          actor_type: "user",
          entity_type: "authorised_party",
          entity_id: authorisedPartyId,
          severity: "high",
          action: "authorised_party.add",
          result: "success",
          metadata: { decision_id: input.decisionId, application_id: input.applicationId },
        });
      }
      return { kind: "applied", authorisedPartyId };
    });
  } catch (err) {
    await recordFailureAudit("clt1.authorised_party_add_failed", requestedBy, "client_application", input.applicationId, input.decisionId, "authorised_party.add_apply");
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  if (outcome.kind === "raced") {
    await recordFailureAudit("clt1.authorised_party_add_failed", requestedBy, "client_application", input.applicationId, input.decisionId, "authorised_party.add_apply");
    throw outcome.error;
  }

  return { decisionId: input.decisionId, authorisedPartyId: outcome.authorisedPartyId };
}

// -------------------------------------------------------------------------------------------
// UPDATE
// -------------------------------------------------------------------------------------------
export interface RequestPartyUpdateInput {
  applicationId: string;
  authorisedPartyId: string;
  ownershipPercentage: number | null;
  secAuditRef: string | null;
  requestedBy: string;
  reason: string | null;
  requestId: string | null | undefined;
  correlationId: string | null | undefined;
  iam2: Iam2ClientConfig;
}

export async function requestPartyUpdate(input: RequestPartyUpdateInput): Promise<{ decisionId: string; payloadHash: string }> {
  const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [input.authorisedPartyId, input.applicationId]);
  const target = targetRows[0];
  if (!target) authorisedPartyNotFound();
  validateAuthorisedPartyTransition(target.authority_status, "update");

  await checkBaseline(input.iam2, input.requestedBy, UPDATE_ACTION, input.authorisedPartyId);

  const decisionId = "clt1apd_" + randomUUID();
  const payloadHash = fingerprint(
    decisionPayload({
      decision_id: decisionId,
      application_id: input.applicationId,
      decision_type: "update",
      target_authorised_party_id: input.authorisedPartyId,
      party_type: null,
      party_reference: null,
      ownership_percentage: input.ownershipPercentage,
      sec_audit_ref: input.secAuditRef,
      requested_by: input.requestedBy,
    }),
  );

  try {
    await withTransaction(async (txClient) => {
      await txClient.query(
        `INSERT INTO clt1.authorised_party_decision_request
           (decision_id, application_id, decision_type, target_authorised_party_id, ownership_percentage, sec_audit_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
         VALUES ($1,$2,'update',$3,$4,$5,$6,$7,'requested',$8,$9,$10)`,
        [decisionId, input.applicationId, input.authorisedPartyId, normaliseOwnership(input.ownershipPercentage), input.secAuditRef, input.reason, input.requestedBy, payloadHash, input.requestId, input.correlationId],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_update_requested",
        source_module: "CLT-01",
        actor_id: input.requestedBy,
        actor_type: "user",
        entity_type: "authorised_party",
        entity_id: input.authorisedPartyId,
        severity: "medium",
        action: "authorised_party.update_request",
        result: "success",
        metadata: { decision_id: decisionId },
      });
    });
  } catch (err) {
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  return { decisionId, payloadHash };
}

export async function applyPartyUpdate(input: ApplyPartyInput & { authorisedPartyId: string }): Promise<{ decisionId: string }> {
  const decisionRow = await fetchDecisionRowOrThrow(input.decisionId);
  if (decisionRow.application_id !== input.applicationId || decisionRow.decision_type !== "update" || decisionRow.target_authorised_party_id !== input.authorisedPartyId) {
    throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
  }
  if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

  const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [input.authorisedPartyId, input.applicationId]);
  const target = targetRows[0];
  if (!target) authorisedPartyNotFound();
  validateAuthorisedPartyTransition(target.authority_status, "update");

  await checkBaseline(input.iam2, decisionRow.requested_by, UPDATE_ACTION, input.authorisedPartyId);

  const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
  const verify = await verifyDecisionToken(input.iam2, {
    decisionToken: input.decisionToken,
    approvalId: input.approvalId,
    actorId: decisionRow.requested_by,
    action: UPDATE_ACTION,
    resource: "authorised_party",
    entityId: input.authorisedPartyId,
    currentPayloadHash,
  });
  if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

  const requestedBy = decisionRow.requested_by;
  type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
  let outcome: ApplyOutcome;
  try {
    outcome = await withTransaction(async (txClient) => {
      await acquireKycRosterLock(txClient, input.applicationId);

      const lockedDecision = await txClient.query<{ status: string }>(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1 FOR UPDATE`, [input.decisionId]);
      if (lockedDecision.rows[0]?.status !== "requested") {
        return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
      }

      // Authoritative, transaction-local, row-locked lifecycle guard — see this file's own
      // header comment (CRITICAL-1/CRITICAL-2 remediation). MUST run before the UPDATE below.
      const lifecycle = await lockAndAssertApplicationLifecycle(txClient, input.applicationId, input.allowedApplicationStatuses);
      if (!lifecycle.ok) return { kind: "raced", error: lifecycle.error };

      const lockedTarget = await txClient.query<{ authority_status: string }>(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2 FOR UPDATE`, [
        input.authorisedPartyId,
        input.applicationId,
      ]);
      const targetStatus = lockedTarget.rows[0]?.authority_status;
      if (targetStatus !== "pending" && targetStatus !== "active") {
        return { kind: "raced", error: new Clt1Error("CLT1_AUTHORISED_PARTY_INVALID_STATE") };
      }

      await txClient.query(
        `UPDATE clt1.authorised_party SET
           ownership_percentage = COALESCE($2, ownership_percentage),
           sec_audit_ref = COALESCE($3, sec_audit_ref),
           approval_id = $4, version = version + 1, updated_at_utc = now()
         WHERE authorised_party_id = $1`,
        [input.authorisedPartyId, decisionRow.ownership_percentage, decisionRow.sec_audit_ref, input.approvalId],
      );
      await txClient.query(
        `UPDATE clt1.authorised_party_decision_request SET status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now() WHERE decision_id = $1`,
        [input.decisionId, input.approvalId, fingerprint(input.decisionToken)],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_updated",
        source_module: "CLT-01",
        actor_id: requestedBy,
        actor_type: "user",
        entity_type: "authorised_party",
        entity_id: input.authorisedPartyId,
        severity: "high",
        action: "authorised_party.update",
        result: "success",
        metadata: { decision_id: input.decisionId, application_id: input.applicationId, approval_id: input.approvalId },
      });
      return { kind: "applied" };
    });
  } catch (err) {
    await recordFailureAudit("clt1.authorised_party_update_failed", requestedBy, "authorised_party", input.authorisedPartyId, input.decisionId, "authorised_party.update_apply");
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  if (outcome.kind === "raced") {
    await recordFailureAudit("clt1.authorised_party_update_failed", requestedBy, "authorised_party", input.authorisedPartyId, input.decisionId, "authorised_party.update_apply");
    throw outcome.error;
  }

  return { decisionId: input.decisionId };
}

// -------------------------------------------------------------------------------------------
// REMOVE (authority_status -> revoked; never a DELETE)
// -------------------------------------------------------------------------------------------
export interface RequestPartyRemovalInput {
  applicationId: string;
  authorisedPartyId: string;
  requestedBy: string;
  reason: string | null;
  requestId: string | null | undefined;
  correlationId: string | null | undefined;
  iam2: Iam2ClientConfig;
}

export async function requestPartyRemoval(input: RequestPartyRemovalInput): Promise<{ decisionId: string; payloadHash: string }> {
  const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [input.authorisedPartyId, input.applicationId]);
  const target = targetRows[0];
  if (!target) authorisedPartyNotFound();
  validateAuthorisedPartyTransition(target.authority_status, "remove");
  requireNotSelfAction(input.requestedBy, target.party_reference);

  await checkBaseline(input.iam2, input.requestedBy, REMOVE_ACTION, input.authorisedPartyId);

  const decisionId = "clt1apd_" + randomUUID();
  const payloadHash = fingerprint(
    decisionPayload({
      decision_id: decisionId,
      application_id: input.applicationId,
      decision_type: "remove",
      target_authorised_party_id: input.authorisedPartyId,
      party_type: null,
      party_reference: null,
      ownership_percentage: null,
      sec_audit_ref: null,
      requested_by: input.requestedBy,
    }),
  );

  try {
    await withTransaction(async (txClient) => {
      await txClient.query(
        `INSERT INTO clt1.authorised_party_decision_request
           (decision_id, application_id, decision_type, target_authorised_party_id, reason, requested_by, status, payload_hash, request_id, correlation_id)
         VALUES ($1,$2,'remove',$3,$4,$5,'requested',$6,$7,$8)`,
        [decisionId, input.applicationId, input.authorisedPartyId, input.reason, input.requestedBy, payloadHash, input.requestId, input.correlationId],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_remove_requested",
        source_module: "CLT-01",
        actor_id: input.requestedBy,
        actor_type: "user",
        entity_type: "authorised_party",
        entity_id: input.authorisedPartyId,
        severity: "medium",
        action: "authorised_party.remove_request",
        result: "success",
        metadata: { decision_id: decisionId },
      });
    });
  } catch (err) {
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  return { decisionId, payloadHash };
}

export async function applyPartyRemoval(input: ApplyPartyInput & { authorisedPartyId: string }): Promise<{ decisionId: string }> {
  const decisionRow = await fetchDecisionRowOrThrow(input.decisionId);
  if (decisionRow.application_id !== input.applicationId || decisionRow.decision_type !== "remove" || decisionRow.target_authorised_party_id !== input.authorisedPartyId) {
    throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
  }
  if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

  const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [input.authorisedPartyId, input.applicationId]);
  const target = targetRows[0];
  if (!target) authorisedPartyNotFound();
  validateAuthorisedPartyTransition(target.authority_status, "remove");

  await checkBaseline(input.iam2, decisionRow.requested_by, REMOVE_ACTION, input.authorisedPartyId);

  const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
  const verify = await verifyDecisionToken(input.iam2, {
    decisionToken: input.decisionToken,
    approvalId: input.approvalId,
    actorId: decisionRow.requested_by,
    action: REMOVE_ACTION,
    resource: "authorised_party",
    entityId: input.authorisedPartyId,
    currentPayloadHash,
  });
  if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

  const requestedBy = decisionRow.requested_by;
  type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
  let outcome: ApplyOutcome;
  try {
    outcome = await withTransaction(async (txClient) => {
      await acquireKycRosterLock(txClient, input.applicationId);

      const lockedDecision = await txClient.query<{ status: string }>(`SELECT status FROM clt1.authorised_party_decision_request WHERE decision_id = $1 FOR UPDATE`, [input.decisionId]);
      if (lockedDecision.rows[0]?.status !== "requested") {
        return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
      }

      // Authoritative, transaction-local, row-locked lifecycle guard — see this file's own
      // header comment (CRITICAL-1/CRITICAL-2 remediation). MUST run before the UPDATE below.
      const lifecycle = await lockAndAssertApplicationLifecycle(txClient, input.applicationId, input.allowedApplicationStatuses);
      if (!lifecycle.ok) return { kind: "raced", error: lifecycle.error };

      const lockedTarget = await txClient.query<{ authority_status: string }>(`SELECT authority_status FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2 FOR UPDATE`, [
        input.authorisedPartyId,
        input.applicationId,
      ]);
      const targetStatus = lockedTarget.rows[0]?.authority_status;
      if (!targetStatus || targetStatus === "revoked") {
        return { kind: "raced", error: new Clt1Error("CLT1_AUTHORISED_PARTY_INVALID_STATE") };
      }

      await txClient.query(`UPDATE clt1.authorised_party SET authority_status = 'revoked', version = version + 1, updated_at_utc = now() WHERE authorised_party_id = $1`, [input.authorisedPartyId]);
      await txClient.query(
        `UPDATE clt1.authorised_party_decision_request SET status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now() WHERE decision_id = $1`,
        [input.decisionId, input.approvalId, fingerprint(input.decisionToken)],
      );
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_removed",
        source_module: "CLT-01",
        actor_id: requestedBy,
        actor_type: "user",
        entity_type: "authorised_party",
        entity_id: input.authorisedPartyId,
        severity: "high",
        action: "authorised_party.remove",
        result: "success",
        metadata: { decision_id: input.decisionId, application_id: input.applicationId, approval_id: input.approvalId },
      });
      return { kind: "applied" };
    });
  } catch (err) {
    await recordFailureAudit("clt1.authorised_party_remove_failed", requestedBy, "authorised_party", input.authorisedPartyId, input.decisionId, "authorised_party.remove_apply");
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }

  if (outcome.kind === "raced") {
    await recordFailureAudit("clt1.authorised_party_remove_failed", requestedBy, "authorised_party", input.authorisedPartyId, input.decisionId, "authorised_party.remove_apply");
    throw outcome.error;
  }

  return { decisionId: input.decisionId };
}

// -------------------------------------------------------------------------------------------
// SCREENING OUTCOME — internal-identity-only, no IAM-02 permission check (mirrors
// routes/outcomes.ts's cdd_outcome receipt exactly). Never activates the party.
// -------------------------------------------------------------------------------------------
export interface RecordScreeningOutcomeInput {
  applicationId: string;
  authorisedPartyId: string;
  identityVerificationStatus: IdentityVerificationStatus | null;
  sanctionsPepStatus: SanctionsPepStatus | null;
  secAuditRef: string | null;
  sourceModule: string;
  createdBy: string;
  /** Trusted, route-supplied lifecycle policy — see `PRE_APPROVAL_SCREENING_STATUSES`/
   * `POST_APPROVAL_PARTY_STATUSES` above. Re-validated under a row lock inside the mutation
   * transaction; never sourced from request body/query/caller input. */
  allowedApplicationStatuses: readonly ApplicationStatus[];
}

export async function recordPartyScreeningOutcome(input: RecordScreeningOutcomeInput): Promise<AuthorisedPartyRow> {
  const targetRows = await query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE authorised_party_id = $1 AND application_id = $2`, [input.authorisedPartyId, input.applicationId]);
  const target = targetRows[0];
  if (!target) authorisedPartyNotFound();

  try {
    return await withTransaction(async (txClient) => {
      await acquireKycRosterLock(txClient, input.applicationId);

      // Authoritative, transaction-local, row-locked lifecycle guard — see this file's own
      // header comment (CRITICAL-1/CRITICAL-2 remediation). MUST run before the UPDATE below.
      const lifecycle = await lockAndAssertApplicationLifecycle(txClient, input.applicationId, input.allowedApplicationStatuses);
      if (!lifecycle.ok) throw lifecycle.error;

      const rows = await query<AuthorisedPartyRow>(
        txClient,
        `UPDATE clt1.authorised_party SET
           identity_verification_status = COALESCE($2, identity_verification_status),
           sanctions_pep_status = COALESCE($3, sanctions_pep_status),
           sec_audit_ref = COALESCE($4, sec_audit_ref),
           last_screened_at_utc = now(),
           screening_source_module = $5,
           version = version + 1,
           updated_at_utc = now()
         WHERE authorised_party_id = $1 AND application_id = $6
         RETURNING *`,
        [input.authorisedPartyId, input.identityVerificationStatus, input.sanctionsPepStatus, input.secAuditRef, input.sourceModule, input.applicationId],
      );
      if (rows.length === 0) authorisedPartyNotFound();
      await publishAudit(txClient, {
        event_type: "clt1.authorised_party_screened",
        source_module: "CLT-01",
        actor_id: input.createdBy,
        actor_type: "service",
        entity_type: "authorised_party",
        entity_id: input.authorisedPartyId,
        severity: "high",
        action: "authorised_party.screening_outcome_receive",
        result: "success",
        metadata: { identity_verification_status: input.identityVerificationStatus, sanctions_pep_status: input.sanctionsPepStatus, source_module: input.sourceModule },
      });
      return rows[0]!;
    });
  } catch (err) {
    if (err instanceof Clt1Error) throw err;
    throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
  }
}

// -------------------------------------------------------------------------------------------
// LIST — safe projection, deterministic ordering, identical to the existing client-keyed route.
// -------------------------------------------------------------------------------------------
export async function listAuthorisedPartiesForApplication(applicationId: string): Promise<AuthorisedPartyRow[]> {
  return query<AuthorisedPartyRow>(getPool(), `SELECT * FROM clt1.authorised_party WHERE application_id = $1 ORDER BY created_at_utc ASC`, [applicationId]);
}
