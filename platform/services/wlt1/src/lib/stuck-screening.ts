/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure.
 * Implements the FROZEN architecture (WLT-01 Named Vendor-Result Ingestion / Async Path
 * Implementation-Contract Architecture Addendum + Stuck-Screening Recovery Final
 * Micro-Clarification) exactly — no new architectural decisions are made in this file.
 *
 * THIS IS NOT A NEW ASYNC INGESTION PATH. `routes/provider-receipt.ts` + `wlt1.vendor_result_inbox`
 * already constitute the complete, accepted, authenticated, replay-safe async wallet-screening
 * ingestion path — neither is touched here. This file closes the ONE genuine operational gap: a
 * `pending` wallet screening whose provider never delivers a receipt and whose caller never
 * resumes (the C3 retry-claim path) sits blocked forever, with zero operator visibility and zero
 * platform-side recovery. Mirrors `services/aml1/src/lib/stuck-screening.ts`'s own accepted D1-D5
 * shape (own copy, F3(c)) — detect + recover, no worker, no queue, no sweeper.
 *
 * FAILED IS TERMINAL AND STRUCTURALLY IMMUTABLE under every existing runtime path — this file adds
 * `failed` as the ONE new value to `wallet_screening_result.risk_status` (migration 065's own pure
 * CHECK widening), but `ScreeningApplicationService.applyNormalizedScreeningResult`'s own P2B-LOW-1
 * one-way gate and `routes/wallet-screening.ts`'s own C3 retry-claim predicate both require
 * `risk_status = 'pending'` before any terminal mutation — `failed -> clear/review_required/
 * high_risk/hit` is therefore unreachable without modifying either file, and neither is modified.
 *
 * DESTINATION-ID DISCOVERY (Final Micro-Clarification Issue 1/§2-3): the route receives only
 * `screening_result_id`. `resolveDestinationIdForLockKey` performs a NON-AUTHORITATIVE pre-read
 * (no lock, no transaction) solely to discover the advisory-lock key — `destination_id` is
 * verified immutable at the GRANT level (absent from `wallet_screening_result`'s own column-scoped
 * UPDATE grant), so this pre-read can never legitimately go stale, but `recoverStuckScreening`
 * still re-verifies it authoritatively inside the locked transaction (defence in depth, mirrors
 * `wallet-screening.ts`'s own identical `row.destination_id !== destination_id` defensive check).
 *
 * LOCK ORDER (load-bearing, reuses the EXISTING `wlt1.destination:<id>` advisory-lock domain
 * `screening-application.ts`'s own `acquireDestinationLock` and `wallet-screening.ts`'s own C3
 * claim both already serialize through — no new lock domain): advisory lock -> destination
 * `FOR UPDATE` -> screening `FOR UPDATE` -> authoritative revalidation -> mutate.
 */
import type { PoolClient } from "pg";
import { publishAudit, query, type Sql } from "@aix/foundation";
import { Wlt1Error } from "./errors.js";

export const STUCK_SCREENING_REASON_CODES = ["provider_result_never_delivered", "provider_outage", "operator_containment"] as const;
export type StuckScreeningReasonCode = (typeof STUCK_SCREENING_REASON_CODES)[number];

// -------------------------------------------------------------------------------------------
// GET /internal/wlt1/stuck-screenings — bounded, deterministic, safe-projection listing.
// -------------------------------------------------------------------------------------------
export const STUCK_SCREENING_LIST_LIMIT = 200;

export interface StuckScreeningRow {
  screening_result_id: string;
  screening_result_version: number;
  destination_id: string;
  chain: string;
  network: string;
  provider_id: string;
  provider_adaptor_version: string;
  created_at_utc: string;
  last_attempt_at_utc: string;
  age_seconds: number;
  destination_status: string;
}

export interface SafeStuckScreeningResponse {
  screening_result_id: string;
  screening_result_version: number;
  destination_id: string;
  chain: string;
  network: string;
  provider_id: string;
  provider_adaptor_version: string;
  created_at_utc: string;
  last_attempt_at_utc: string;
  age_seconds: number;
  recoverable: boolean;
}

/** Single safe-response projection point (mirrors `aml1/lib/stuck-screening.ts`'s own identical
 * precedent) — never `canonical_address`/`address_hash`/`client_id`/`risk_score`/
 * `risk_categories`/raw provider payload; this query never selects any of those in the first
 * place, but the explicit projection keeps the "never spread a raw DB row into a response"
 * discipline every WLT-01 route follows. `recoverable` is DERIVED, never stored — a stuck-aged
 * pending screening whose destination has already moved off `pending_screening` (a narrower,
 * rarer crash shape) is listed but `recoverable: false`; `destination_status` itself is dropped
 * from the response — it exists only to derive this one boolean. */
export function safeStuckScreeningResponse(row: StuckScreeningRow): SafeStuckScreeningResponse {
  return {
    screening_result_id: row.screening_result_id,
    screening_result_version: row.screening_result_version,
    destination_id: row.destination_id,
    chain: row.chain,
    network: row.network,
    provider_id: row.provider_id,
    provider_adaptor_version: row.provider_adaptor_version,
    created_at_utc: row.created_at_utc,
    last_attempt_at_utc: row.last_attempt_at_utc,
    age_seconds: row.age_seconds,
    recoverable: row.destination_status === "pending_screening",
  };
}

/** Detection query — every `risk_status = 'pending'` screening whose `updated_at_utc` (the SAME
 * clock `wallet-screening.ts`'s own C3 retry-claim cooldown already uses) is at or before the
 * DB-relative cutoff. DB time authority throughout — `now()` and the threshold interval are both
 * evaluated inside Postgres, never `Date.now()`. Bounded by `limit` (`STUCK_SCREENING_LIST_LIMIT`
 * — never caller-supplied, never unbounded). */
export async function selectStuckScreeningRows(sql: Sql, thresholdSeconds: number, limit: number): Promise<StuckScreeningRow[]> {
  return query<StuckScreeningRow>(
    sql,
    `SELECT
       s.screening_result_id, s.screening_result_version, s.destination_id, s.chain, s.network,
       s.provider_id, s.provider_adaptor_version, s.created_at_utc, s.updated_at_utc AS last_attempt_at_utc,
       FLOOR(EXTRACT(EPOCH FROM (now() - s.updated_at_utc)))::int AS age_seconds,
       d.status AS destination_status
     FROM wlt1.wallet_screening_result s
     JOIN wlt1.destination d ON d.destination_id = s.destination_id
     WHERE s.risk_status = 'pending'
       AND s.updated_at_utc <= now() - ($1 * interval '1 second')
     ORDER BY s.updated_at_utc ASC, s.screening_result_id ASC
     LIMIT $2`,
    [thresholdSeconds, limit],
  );
}

// -------------------------------------------------------------------------------------------
// Non-authoritative pre-read — discovers the advisory-lock key only. NEVER trusted as proof the
// screening exists in a recoverable state; the mutation transaction re-verifies everything.
// -------------------------------------------------------------------------------------------
export async function resolveDestinationIdForLockKey(sql: Sql, screeningResultId: string): Promise<string | undefined> {
  const rows = await query<{ destination_id: string }>(sql, `SELECT destination_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
  return rows[0]?.destination_id;
}

// -------------------------------------------------------------------------------------------
// POST /internal/wlt1/stuck-screenings/:screening_result_id/recover — the single-step recovery
// transaction (Final Micro-Clarification's own frozen 17-step order; the idempotency wrapper
// itself lives in the route file, this function is TX steps 8-14 only).
// -------------------------------------------------------------------------------------------
export interface RecoverStuckScreeningInput {
  screeningResultId: string;
  destinationIdHint: string;
  actorId: string;
  reasonCode: StuckScreeningReasonCode;
  thresholdSeconds: number;
}

export interface RecoveredScreeningResult {
  screeningResultId: string;
  screeningResultVersion: number;
  destinationId: string;
  recoveredAtUtc: string;
}

export type RecoverStuckScreeningOutcome =
  | { kind: "invalid_state" }
  | { kind: "recovered"; result: RecoveredScreeningResult };

/** Runs entirely inside the CALLER's own already-open transaction (the SAME transaction that
 * already ran `beginIdempotent` and will run `completeIdempotent` after this returns) — the Final
 * Micro-Clarification's frozen "ONE mutation TX" requirement. This function does NOT open its own
 * `withTransaction`; nesting one here would silently open a SECOND connection/transaction and
 * break atomicity with the caller's idempotency begin/complete pair. */
export async function recoverStuckScreening(client: PoolClient, input: RecoverStuckScreeningInput): Promise<RecoverStuckScreeningOutcome> {
  // Step 8: advisory lock — the SAME domain acquireDestinationLock (screening-application.ts)
  // and the C3 claim (wallet-screening.ts) already serialize through. MUST precede both row locks.
  await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${input.destinationIdHint}`]);

  // Step 9: destination FOR UPDATE.
  const destinationRows = await query<{ status: string; destination_status_version: number }>(
    client,
    `SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`,
    [input.destinationIdHint],
  );
  const destination = destinationRows[0];

  // Step 10: screening FOR UPDATE — authoritative, never the pre-read.
  const screeningRows = await query<{ screening_result_id: string; screening_result_version: number; destination_id: string; risk_status: string; provider_id: string; provider_adaptor_version: string; updated_at_utc: string }>(
    client,
    `SELECT screening_result_id, screening_result_version, destination_id, risk_status, provider_id, provider_adaptor_version, updated_at_utc
       FROM wlt1.wallet_screening_result WHERE screening_result_id = $1 FOR UPDATE`,
    [input.screeningResultId],
  );
  const screening = screeningRows[0];

  // Step 11: destination_id cross-check — defence in depth; the pre-read's own lock key cannot
  // legitimately go stale (destination_id is absent from the runtime UPDATE grant), but a
  // screening_result_id must never be recovered under the wrong destination's lock.
  if (!screening || !destination || screening.destination_id !== input.destinationIdHint) {
    return { kind: "invalid_state" };
  }

  // Step 12: full authoritative revalidation — never trust the pre-read or a caller-supplied age.
  const ageRows = await query<{ age_seconds: number }>(client, `SELECT FLOOR(EXTRACT(EPOCH FROM (now() - $1::timestamptz)))::int AS age_seconds`, [screening.updated_at_utc]);
  const ageSeconds = ageRows[0]!.age_seconds;
  if (screening.risk_status !== "pending" || destination.status !== "pending_screening" || ageSeconds < input.thresholdSeconds) {
    return { kind: "invalid_state" };
  }

  // Step 13: recovery mutations — SAME transaction.
  const updatedScreeningRows = await query<{ screening_result_version: number; updated_at_utc: string }>(
    client,
    `UPDATE wlt1.wallet_screening_result
        SET risk_status = 'failed', updated_at_utc = now()
      WHERE screening_result_id = $1 AND risk_status = 'pending'
    RETURNING screening_result_version, updated_at_utc`,
    [input.screeningResultId],
  );
  const updatedScreening = updatedScreeningRows[0];
  if (!updatedScreening) {
    // Structurally unreachable under the FOR UPDATE lock already held, kept as a defensive
    // fail-closed guard rather than a silent success claim.
    throw new Wlt1Error("WLT1_AUDIT_REQUIRED");
  }

  const updatedDestinationRows = await query<{ destination_status_version: number }>(
    client,
    `UPDATE wlt1.destination
        SET status = 'draft', destination_status_version = destination_status_version + 1, updated_at_utc = now()
      WHERE destination_id = $1
    RETURNING destination_status_version`,
    [input.destinationIdHint],
  );
  const updatedDestination = updatedDestinationRows[0]!;

  // Step 14: audit — exactly 10 keys, no PII, no raw payload, no secret.
  await publishAudit(client, {
    event_type: "wlt1.screening_recovered",
    source_module: "WLT-01",
    actor_id: input.actorId,
    actor_type: "service",
    entity_type: "wallet_screening_result",
    entity_id: input.screeningResultId,
    metadata: {
      screening_result_id: input.screeningResultId,
      screening_result_version: updatedScreening.screening_result_version,
      destination_id: input.destinationIdHint,
      provider_id: screening.provider_id,
      provider_adaptor_version: screening.provider_adaptor_version,
      reason_code: input.reasonCode,
      pending_age_seconds: ageSeconds,
      destination_status_after: "draft",
      destination_status_version_after: updatedDestination.destination_status_version,
      recovered_at_utc: updatedScreening.updated_at_utc,
    },
  });

  return {
    kind: "recovered",
    result: {
      screeningResultId: input.screeningResultId,
      screeningResultVersion: updatedScreening.screening_result_version,
      destinationId: input.destinationIdHint,
      recoveredAtUtc: updatedScreening.updated_at_utc,
    },
  };
}

/** Loads a screening row by id for the completed-idempotency-replay branch — historically honest
 * reconstruction ONLY from durable, immutable sources (Final Micro-Clarification §10): never the
 * current destination status/version, which may have changed since this recovery ran. */
export async function fetchRecoveredScreeningForReplay(sql: Sql, screeningResultId: string): Promise<RecoveredScreeningResult | undefined> {
  const rows = await query<{ screening_result_id: string; screening_result_version: number; destination_id: string; risk_status: string; updated_at_utc: string }>(
    sql,
    `SELECT screening_result_id, screening_result_version, destination_id, risk_status, updated_at_utc FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`,
    [screeningResultId],
  );
  const row = rows[0];
  if (!row || row.risk_status !== "failed") return undefined;
  return { screeningResultId: row.screening_result_id, screeningResultVersion: row.screening_result_version, destinationId: row.destination_id, recoveredAtUtc: row.updated_at_utc };
}
