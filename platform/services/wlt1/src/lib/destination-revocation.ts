/**
 * WLT-01 — Destination Revocation + AML Revocation Signal Ingestion. Implements the FROZEN
 * architecture (WLT-01 Destination Revocation + AML Revocation Addendum, CLOSED + Response/
 * Revocation-ID Micro-Addendum, CLOSED) exactly — no new architectural decisions are made in this
 * file.
 *
 * ONE shared internal implementation for BOTH routes (`routes/destination-revoke.ts` /
 * `routes/aml-revocation.ts`) — the state-transition/evidence/response/audit logic below is never
 * duplicated across the two route adapters.
 *
 * Frozen global lock order: this module's callers take ONLY the `wlt1.destination` row lock — this
 * phase never touches `wlt1.destination_decision` (no bulk mutation of issued/consumed decisions;
 * they become invalid automatically via the EXISTING 4A-3/4B revocation_epoch/status checks — see
 * `lib/decision-verify.ts`'s own evaluator).
 *
 * REVOKED IS ABSORBING: once `wlt1.destination.status = 'revoked'`, `applyRevocationTransition`
 * below is a structural no-op forever (returns `transitioned: false`, performs no write) —
 * `revocation_epoch`/`destination_status_version` can never increment a second time for the same
 * destination via this path.
 *
 * MISBOUND signal_ref (frozen): the partial unique index on `signal_ref` is GLOBAL, not scoped per
 * destination. If a caller's `signal_id` already names evidence for a DIFFERENT destination/client
 * than the one being addressed, that is never treated as a duplicate replay for the CURRENT
 * target — the caller's own route maps it to the identical `WLT1_DESTINATION_NOT_FOUND` shape an
 * unknown/foreign destination produces (no oracle, no remap, no fabricated evidence).
 *
 * RESPONSE/AUDIT SHAPE (frozen, Response Micro-Addendum): a single 9-key response body and an
 * 11-key audit metadata allowlist serve BOTH routes and all five outcome scenarios (operator
 * first-revoke, operator already-revoked, AML first-signal, AML exact-duplicate signal_ref, AML
 * new-signal-against-already-revoked). `outcome` (`revoked`|`already_revoked`) plus
 * `evidence_recorded` (boolean) together distinguish all five without a wider enum — a genuinely
 * NEW `wlt1.destination_revocation` row was inserted this call (evidence_recorded: true) is
 * orthogonal to whether a destination-state TRANSITION occurred this call (outcome: revoked). Every
 * returned field is DB-authoritative (locked destination row post-mutation, or the inserted/located
 * evidence row) — never a caller-supplied echo.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@aix/foundation";

const REVOCATION_ID_PREFIX = "wlt1rev_";

/** `wlt1rev_` + a UUID (36 characters, lowercase hex + hyphens) — 44 characters total. Exact
 * structural analogue of `mintDecisionId`/`mintConsumptionId` (`decision-token.ts`/
 * `decision-consume.ts`). */
export const REVOCATION_ID_REGEX = /^wlt1rev_[0-9a-f-]{36}$/;

/** Minted ONLY immediately before INSERTing a genuinely NEW `wlt1.destination_revocation` row —
 * never for an operator idempotent already-revoked response, never for an AML exact-duplicate
 * `signal_ref` replay. No id is ever reserved merely for a failed/denied request. */
export function mintRevocationId(): string {
  return REVOCATION_ID_PREFIX + randomUUID();
}

export const REVOKED_STATUS = "revoked";

/**
 * Ongoing Rescreening widening (Run-Lifecycle Micro-Addendum, Issue 23 — type/constant surface
 * ONLY, no runtime behavior change): `"rescreening"` is WLT-01's own containment decision, made
 * from provider evidence WLT-01 evaluated directly — never AML-01's. Overloading `source:"aml"`
 * for this would fabricate AML provenance AML-01 never asserted and imply a `signal_ref` identity
 * (`aml1sig_*`) AML-01 never minted. See `infra/migrations/060_wlt1_rescreening_run.cjs`'s own
 * header comment for the matching CHECK-constraint widening.
 */
export type Wlt1RevocationSource = "operator" | "aml" | "rescreening";
export type Wlt1RevocationOutcome = "revoked" | "already_revoked";
export const OPERATOR_REASON_CODES = ["compromise", "client_request", "beneficiary_change", "operator_security_action", "administrative"] as const;
export type Wlt1OperatorReasonCode = (typeof OPERATOR_REASON_CODES)[number];
export const AML_REASON_CODE = "aml_risk_signal" as const;
export const RESCREENING_REASON_CODE = "rescreen_adverse" as const;
export type Wlt1RevocationReasonCode = Wlt1OperatorReasonCode | typeof AML_REASON_CODE | typeof RESCREENING_REASON_CODE;

export interface LockedDestinationRow {
  destinationId: string;
  clientId: string;
  status: string;
  revocationEpoch: number;
  destinationStatusVersion: number;
}

interface DestinationRevocationLockRow {
  destination_id: string;
  client_id: string;
  status: string;
  revocation_epoch: number;
  destination_status_version: number;
}

/** Row-locked read of exactly the columns this phase needs — never `SELECT *`. A `PoolClient`
 * (never a bare `Pool`) is required to meaningfully hold the lock across subsequent statements in
 * the same transaction, mirroring `lib/destination-approval.ts`'s own `loadDestinationForUpdate`/
 * `lib/evaluate-use.ts`'s own `loadDestinationEvalSnapshotForUpdate` precedent. */
export async function loadDestinationForRevocationUpdate(client: PoolClient, destinationId: string): Promise<LockedDestinationRow | null> {
  const rows = await query<DestinationRevocationLockRow>(
    client,
    `SELECT destination_id, client_id, status, revocation_epoch, destination_status_version
       FROM wlt1.destination
      WHERE destination_id = $1
      FOR UPDATE`,
    [destinationId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    destinationId: row.destination_id,
    clientId: row.client_id,
    status: row.status,
    revocationEpoch: row.revocation_epoch,
    destinationStatusVersion: row.destination_status_version,
  };
}

export interface RevocationEvidenceRow {
  revocationId: string;
  destinationId: string;
  clientId: string;
  source: Wlt1RevocationSource;
  reasonCode: Wlt1RevocationReasonCode;
  reasonDetail: string | null;
  actorId: string | null;
  signalRef: string | null;
  signalType: string | null;
  destinationStatusVersionAfter: number;
  revocationEpochAfter: number;
  revokedAtUtc: Date;
}

interface RevocationEvidenceDbRow {
  revocation_id: string;
  destination_id: string;
  client_id: string;
  source: string;
  reason_code: string;
  reason_detail: string | null;
  actor_id: string | null;
  signal_ref: string | null;
  signal_type: string | null;
  destination_status_version_after: number;
  revocation_epoch_after: number;
  revoked_at_utc: Date;
}

function toEvidenceRow(row: RevocationEvidenceDbRow): RevocationEvidenceRow {
  return {
    revocationId: row.revocation_id,
    destinationId: row.destination_id,
    clientId: row.client_id,
    source: row.source as Wlt1RevocationSource,
    reasonCode: row.reason_code as Wlt1RevocationReasonCode,
    reasonDetail: row.reason_detail,
    actorId: row.actor_id,
    signalRef: row.signal_ref,
    signalType: row.signal_type,
    destinationStatusVersionAfter: row.destination_status_version_after,
    revocationEpochAfter: row.revocation_epoch_after,
    revokedAtUtc: row.revoked_at_utc,
  };
}

/** Global lookup by `signal_ref` — the partial UNIQUE index's own durable idempotency backstop,
 * NOT scoped to a destination_id (a caller must independently confirm the returned row's own
 * `destinationId`/`clientId` match the current request before treating it as a duplicate — see
 * this file's own header comment on misbound signal_ref handling). */
export async function findRevocationBySignalRef(client: PoolClient, signalRef: string): Promise<RevocationEvidenceRow | null> {
  const rows = await query<RevocationEvidenceDbRow>(
    client,
    `SELECT revocation_id, destination_id, client_id, source, reason_code, reason_detail, actor_id, signal_ref, signal_type,
            destination_status_version_after, revocation_epoch_after, revoked_at_utc
       FROM wlt1.destination_revocation
      WHERE signal_ref = $1`,
    [signalRef],
  );
  const row = rows[0];
  return row ? toEvidenceRow(row) : null;
}

export interface RevokeTransitionResult {
  destination: LockedDestinationRow;
  transitioned: boolean;
}

/** Applies the FIRST-revocation state transition exactly once. Idempotent: called against an
 * already-`revoked` destination, this performs NO write and returns `transitioned: false` — the
 * absorbing-state guarantee lives here, in the one place both routes call through. `nowUtc` MUST be
 * PostgreSQL-authoritative (read inside the same transaction), never `Date.now()`/`new Date()`. */
export async function applyRevocationTransition(client: PoolClient, locked: LockedDestinationRow, nowUtc: Date): Promise<RevokeTransitionResult> {
  if (locked.status === REVOKED_STATUS) {
    return { destination: locked, transitioned: false };
  }
  const revocationEpoch = locked.revocationEpoch + 1;
  const destinationStatusVersion = locked.destinationStatusVersion + 1;
  // whitelist_version is deliberately NEVER touched — revocation terminates eligibility, it does
  // not create whitelist-activation lineage (frozen, load-bearing).
  await query(
    client,
    `UPDATE wlt1.destination
        SET status = $1, revocation_epoch = $2, destination_status_version = $3, updated_at_utc = $4
      WHERE destination_id = $5`,
    [REVOKED_STATUS, revocationEpoch, destinationStatusVersion, nowUtc.toISOString(), locked.destinationId],
  );
  return {
    destination: { ...locked, status: REVOKED_STATUS, revocationEpoch, destinationStatusVersion },
    transitioned: true,
  };
}

export interface InsertRevocationEvidenceInput {
  destinationId: string;
  clientId: string;
  source: Wlt1RevocationSource;
  reasonCode: Wlt1RevocationReasonCode;
  reasonDetail: string | null;
  actorId: string | null;
  signalRef: string | null;
  signalType: string | null;
  destinationStatusVersionAfter: number;
  revocationEpochAfter: number;
}

/** Mints a NEW `revocation_id` and INSERTs one evidence row. `revoked_at_utc` is read back via
 * `RETURNING` — PostgreSQL-authoritative, never a JavaScript clock. Callers decide WHETHER to call
 * this (idempotent paths never do); this function itself never checks for an existing row. */
export async function insertRevocationEvidence(client: PoolClient, input: InsertRevocationEvidenceInput): Promise<RevocationEvidenceRow> {
  const revocationId = mintRevocationId();
  const rows = await query<{ revoked_at_utc: Date }>(
    client,
    `INSERT INTO wlt1.destination_revocation
        (revocation_id, destination_id, client_id, source, reason_code, reason_detail, actor_id, signal_ref, signal_type,
         destination_status_version_after, revocation_epoch_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING revoked_at_utc`,
    [
      revocationId,
      input.destinationId,
      input.clientId,
      input.source,
      input.reasonCode,
      input.reasonDetail,
      input.actorId,
      input.signalRef,
      input.signalType,
      input.destinationStatusVersionAfter,
      input.revocationEpochAfter,
    ],
  );
  return {
    revocationId,
    destinationId: input.destinationId,
    clientId: input.clientId,
    source: input.source,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    actorId: input.actorId,
    signalRef: input.signalRef,
    signalType: input.signalType,
    destinationStatusVersionAfter: input.destinationStatusVersionAfter,
    revocationEpochAfter: input.revocationEpochAfter,
    revokedAtUtc: rows[0]!.revoked_at_utc,
  };
}

export interface RevocationResponseBody {
  outcome: Wlt1RevocationOutcome;
  evidence_recorded: boolean;
  revocation_id: string | null;
  destination_id: string;
  client_id: string;
  revocation_epoch: number;
  destination_status_version: number;
  revoked_at_utc: string | null;
  signal_ref: string | null;
}

/** The ONE common 9-key response shape for both routes — no extra keys, ever. `evidence` supplies
 * `revocation_id`/`revoked_at_utc`/`signal_ref` when present (a NEW row just inserted, or the
 * ORIGINAL row located by `signal_ref`); `null` for the operator idempotent already-revoked case,
 * which has no unambiguous single evidence row to name. */
export function buildRevocationResponse(input: {
  outcome: Wlt1RevocationOutcome;
  evidenceRecorded: boolean;
  evidence: RevocationEvidenceRow | null;
  destinationId: string;
  clientId: string;
  revocationEpoch: number;
  destinationStatusVersion: number;
}): RevocationResponseBody {
  return {
    outcome: input.outcome,
    evidence_recorded: input.evidenceRecorded,
    revocation_id: input.evidence?.revocationId ?? null,
    destination_id: input.destinationId,
    client_id: input.clientId,
    revocation_epoch: input.revocationEpoch,
    destination_status_version: input.destinationStatusVersion,
    revoked_at_utc: input.evidence ? input.evidence.revokedAtUtc.toISOString() : null,
    signal_ref: input.evidence?.signalRef ?? null,
  };
}

export interface RevocationAuditMetadata {
  [key: string]: unknown;
  destination_id: string;
  client_id: string;
  outcome: Wlt1RevocationOutcome;
  source: Wlt1RevocationSource;
  reason_code: Wlt1RevocationReasonCode;
  reason_detail: string | null;
  actor_id: string | null;
  signal_ref: string | null;
  revocation_id: string | null;
  revoked_at_utc: string | null;
  evidence_recorded: boolean;
}

/** Exactly the 11-key frozen audit metadata allowlist. Never includes address/natural_key_hash/
 * token_hash/decision_token/AML-screening-evidence-detail/poc_challenge_id/internal-service-token/
 * PII — this function is the ONE place both routes shape audit metadata, so neither can drift. */
export function buildRevocationAuditMetadata(input: {
  destinationId: string;
  clientId: string;
  outcome: Wlt1RevocationOutcome;
  source: Wlt1RevocationSource;
  reasonCode: Wlt1RevocationReasonCode;
  reasonDetail: string | null;
  actorId: string | null;
  signalRef: string | null;
  evidence: RevocationEvidenceRow | null;
}): RevocationAuditMetadata {
  return {
    destination_id: input.destinationId,
    client_id: input.clientId,
    outcome: input.outcome,
    source: input.source,
    reason_code: input.reasonCode,
    reason_detail: input.reasonDetail,
    actor_id: input.actorId,
    signal_ref: input.signalRef,
    revocation_id: input.evidence?.revocationId ?? null,
    revoked_at_utc: input.evidence ? input.evidence.revokedAtUtc.toISOString() : null,
    evidence_recorded: input.evidence !== null,
  };
}
