/**
 * WLT-01 Limits / Velocity / Concentration / First-Use. Implements the FROZEN architecture
 * exactly, in precedence order: the Mandatory-Control / Policy-Provisioning Final Closure > the
 * Schema / Policy-History / Denial-Evidence Final Micro-Correction > the Final
 * Implementation-Exactness Correction > the Implementation-Contract Architecture Addendum. No new
 * architectural decisions are made in this file.
 *
 * CONCENTRATION IS DEFERRED. This file contains no denominator, no threshold, no evaluation for
 * concentration anywhere — `wlt1.destination_limit_profile.concentration_limit` is CHECK-forced
 * NULL at the schema level (migration 066).
 *
 * ACCOUNTING SEMANTICS (frozen, load-bearing): a successful `verify-and-consume` records
 * AUTHORIZED INTENT, never settled/executed value. This module never reads a balance, writes a
 * ledger, or claims actual execution.
 *
 * PER-CLIENT ADVISORY LOCK (frozen, load-bearing): `pg_advisory_xact_lock(hashtext('wlt1.limit:'
 * || client_id))` — ONE lock per client, deliberately not per-asset, because first-use is
 * destination-lineage-wide across every asset a destination might be used with. The SAME lock
 * domain MUST be held by controlled policy provisioning (schema-owner activity, not implemented as
 * a runtime route here) before mutating any `destination_limit_profile` row for that client — this
 * file provides `acquireClientLimitLock` for that shared purpose, but this phase implements no
 * production caller of policy mutation.
 *
 * DUAL-SCOPE, BOTH MANDATORY-CLIENT / OPTIONAL-DESTINATION (frozen): a client-default profile
 * (`destination_id IS NULL`) is REQUIRED and always defines all five controls (enforced by the
 * migration's own `chk_wlt1_limit_profile_scope_required_controls`). A destination-specific
 * profile is OPTIONAL and may omit daily/rolling/first-use. Every control defined at either
 * resolved scope must independently pass — destination policy never replaces client policy.
 *
 * EXPLICIT DIMENSION, NO FX (frozen): wallet dimension = (client_id, 'wallet', asset_or_currency,
 * chain, network); fiat dimension = (client_id, 'fiat_payout', asset_or_currency, rail). No
 * valuation/conversion authority exists anywhere in this platform, so usage is strictly isolated
 * within the full dimension tuple — no cross-asset, no cross-network, no cross-rail aggregation.
 *
 * DECIMAL SAFETY (frozen): amounts are DB `numeric(38,18)`, parsed/compared here as fixed-point
 * `bigint` at scale 18 — JS floating-point `Number` is never used for a monetary comparison.
 *
 * BREACH PRECEDENCE (frozen, exact, deterministic — stop at first breach):
 *   1. policy_unavailable (client)   2. per_txn (client)     3. per_txn (destination)
 *   4. first_use (client)            5. first_use (destination)
 *   6. daily (client)                7. daily (destination)
 *   8. rolling (client)              9. rolling (destination)
 *
 * PRE_LIMIT VS LIMIT_POLICY (frozen): only an ACTUAL threshold/policy-availability evaluation
 * writes `wlt1.limit_evaluation` + `wlt1.limit_denied` — see `evaluateLimitBreach`'s own return
 * shape. Staleness/binding/substitution denials (`amount_mismatch`, `limits_version_changed`,
 * `limits_not_bound`, `binding_mismatch`, `asset_dimension_invalid`) never reach this module's
 * DB-writing functions; they are PRE_LIMIT and are handled entirely by the calling route.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, type Sql } from "@aix/foundation";

// -------------------------------------------------------------------------------------------
// Amount parsing — decimal STRING wire format only, DB numeric(38,18) authority, no JS Number.
// -------------------------------------------------------------------------------------------
const AMOUNT_GRAMMAR = /^(0|[1-9][0-9]{0,19})(\.[0-9]{1,18})?$/;
const AMOUNT_SCALE = 18n;
const AMOUNT_SCALE_MULTIPLIER = 10n ** AMOUNT_SCALE;

/** Parses and validates the wire-format amount string. Returns the ORIGINAL valid string (never a
 * reformatted one — the caller persists exactly what was validated) or `undefined` if the grammar
 * or the `> 0` requirement is not satisfied. Never uses `Number()`/`parseFloat()`. */
export function parseAmountString(raw: string): string | undefined {
  if (!AMOUNT_GRAMMAR.test(raw)) return undefined;
  if (toFixedPointBigInt(raw) <= 0n) return undefined;
  return raw;
}

/** Converts a validated decimal string into a fixed-point bigint at scale 18 — the sole
 * comparison/arithmetic representation this module ever uses for monetary values. */
export function toFixedPointBigInt(decimal: string): bigint {
  const [wholePart = "0", fractionPart = ""] = decimal.split(".");
  const paddedFraction = (fractionPart + "0".repeat(Number(AMOUNT_SCALE))).slice(0, Number(AMOUNT_SCALE));
  return BigInt(wholePart) * AMOUNT_SCALE_MULTIPLIER + BigInt(paddedFraction || "0");
}

// -------------------------------------------------------------------------------------------
// Asset/currency dimension grammar (no asset registry — bounded solely by active-policy
// resolution).
// -------------------------------------------------------------------------------------------
export const ASSET_OR_CURRENCY_GRAMMAR = /^[A-Z0-9]{2,16}$/;

export function isValidAssetOrCurrency(value: string): boolean {
  return ASSET_OR_CURRENCY_GRAMMAR.test(value);
}

// -------------------------------------------------------------------------------------------
// Per-client advisory lock — the SAME domain runtime limit evaluation and (future) controlled
// policy provisioning both use.
// -------------------------------------------------------------------------------------------
export async function acquireClientLimitLock(client: PoolClient, clientId: string): Promise<void> {
  await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.limit:${clientId}`]);
}

// -------------------------------------------------------------------------------------------
// Dimension + policy resolution.
// -------------------------------------------------------------------------------------------
export type LimitDestinationType = "wallet" | "fiat_payout";

export interface LimitDimension {
  destinationType: LimitDestinationType;
  assetOrCurrency: string;
  chain: string | null;
  network: string | null;
  rail: string | null;
}

export interface LimitProfileRow {
  limitProfileId: string;
  version: number;
  perTransactionLimit: string;
  dailyVelocityLimit: string | null;
  rollingVelocityLimit: string | null;
  rollingWindowHours: number | null;
  firstUseLimit: string | null;
  status: string;
}

interface LimitProfileSqlRow {
  limit_profile_id: string;
  version: number;
  per_transaction_limit: string;
  daily_velocity_limit: string | null;
  rolling_velocity_limit: string | null;
  rolling_window_hours: number | null;
  first_use_limit: string | null;
  status: string;
}

function toLimitProfileRow(row: LimitProfileSqlRow): LimitProfileRow {
  return {
    limitProfileId: row.limit_profile_id,
    version: row.version,
    perTransactionLimit: row.per_transaction_limit,
    dailyVelocityLimit: row.daily_velocity_limit,
    rollingVelocityLimit: row.rolling_velocity_limit,
    rollingWindowHours: row.rolling_window_hours,
    firstUseLimit: row.first_use_limit,
    status: row.status,
  };
}

const PROFILE_SELECT_COLUMNS = `limit_profile_id, version, per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status`;

/** Resolves the REQUIRED client-default active profile for the exact dimension. `null` if none —
 * the caller must treat this as `limit_policy_unavailable`. */
export async function resolveClientLimitProfile(sql: Sql, clientId: string, dimension: LimitDimension): Promise<LimitProfileRow | null> {
  const rows = await query<LimitProfileSqlRow>(
    sql,
    `SELECT ${PROFILE_SELECT_COLUMNS}
       FROM wlt1.destination_limit_profile
      WHERE client_id = $1 AND destination_id IS NULL AND destination_type = $2
        AND asset_or_currency = $3 AND chain IS NOT DISTINCT FROM $4 AND network IS NOT DISTINCT FROM $5 AND rail IS NOT DISTINCT FROM $6
        AND status = 'active'`,
    [clientId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail],
  );
  const row = rows[0];
  return row ? toLimitProfileRow(row) : null;
}

/** Resolves the OPTIONAL destination-specific active profile for the exact dimension. `null` if
 * none — destination-scope controls are simply not enforced (NO fallback to the client profile). */
export async function resolveDestinationLimitProfile(sql: Sql, clientId: string, destinationId: string, dimension: LimitDimension): Promise<LimitProfileRow | null> {
  const rows = await query<LimitProfileSqlRow>(
    sql,
    `SELECT ${PROFILE_SELECT_COLUMNS}
       FROM wlt1.destination_limit_profile
      WHERE client_id = $1 AND destination_id = $2 AND destination_type = $3
        AND asset_or_currency = $4 AND chain IS NOT DISTINCT FROM $5 AND network IS NOT DISTINCT FROM $6 AND rail IS NOT DISTINCT FROM $7
        AND status = 'active'`,
    [clientId, destinationId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail],
  );
  const row = rows[0];
  return row ? toLimitProfileRow(row) : null;
}

/** Re-resolves a specific historical policy row by its exact immutable identity — used to confirm
 * a decision's bound profile reference is still the currently-active row (staleness detection). */
export async function loadLimitProfileByIdentity(sql: Sql, limitProfileId: string, version: number): Promise<LimitProfileRow | null> {
  const rows = await query<LimitProfileSqlRow>(
    sql,
    `SELECT ${PROFILE_SELECT_COLUMNS} FROM wlt1.destination_limit_profile WHERE limit_profile_id = $1 AND version = $2`,
    [limitProfileId, version],
  );
  const row = rows[0];
  return row ? toLimitProfileRow(row) : null;
}

// -------------------------------------------------------------------------------------------
// First-use derivation — destination-lineage-wide (NOT per-asset), across ALL assets.
// -------------------------------------------------------------------------------------------
export async function computeFirstUse(sql: Sql, destinationId: string, whitelistVersion: number): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    sql,
    `SELECT EXISTS (
       SELECT 1 FROM wlt1.limit_evaluation
        WHERE destination_id = $1 AND whitelist_version = $2 AND result_status = 'pass'
     ) AS exists`,
    [destinationId, whitelistVersion],
  );
  return !rows[0]!.exists;
}

// -------------------------------------------------------------------------------------------
// Usage (velocity) sums — strictly dimension-isolated, DB-time authoritative, no counter table.
// -------------------------------------------------------------------------------------------
const CLIENT_USAGE_DIMENSION_WHERE = `client_id = $1 AND destination_type = $2 AND asset_or_currency = $3 AND chain IS NOT DISTINCT FROM $4 AND network IS NOT DISTINCT FROM $5 AND rail IS NOT DISTINCT FROM $6 AND result_status = 'pass'`;
const DESTINATION_USAGE_DIMENSION_WHERE = `destination_id = $1 AND destination_type = $2 AND asset_or_currency = $3 AND chain IS NOT DISTINCT FROM $4 AND network IS NOT DISTINCT FROM $5 AND rail IS NOT DISTINCT FROM $6 AND result_status = 'pass'`;

/** UTC-safe calendar-day boundary — corrected after an empirically-proven 8-hour drift under a
 * non-UTC session timezone using the naive `date_trunc('day', now() AT TIME ZONE 'UTC')` form
 * alone. This exact expression is required wherever a daily-window sum is computed. */
const UTC_DAY_BOUNDARY_SQL = `(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

export async function sumClientDailyUsage(sql: Sql, clientId: string, dimension: LimitDimension): Promise<bigint> {
  const rows = await query<{ total: string }>(
    sql,
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM wlt1.limit_evaluation
      WHERE ${CLIENT_USAGE_DIMENSION_WHERE} AND evaluated_at_utc >= ${UTC_DAY_BOUNDARY_SQL}`,
    [clientId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail],
  );
  return toFixedPointBigInt(rows[0]!.total);
}

export async function sumDestinationDailyUsage(sql: Sql, destinationId: string, dimension: LimitDimension): Promise<bigint> {
  const rows = await query<{ total: string }>(
    sql,
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM wlt1.limit_evaluation
      WHERE ${DESTINATION_USAGE_DIMENSION_WHERE} AND evaluated_at_utc >= ${UTC_DAY_BOUNDARY_SQL}`,
    [destinationId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail],
  );
  return toFixedPointBigInt(rows[0]!.total);
}

export async function sumClientRollingUsage(sql: Sql, clientId: string, dimension: LimitDimension, windowHours: number): Promise<bigint> {
  const rows = await query<{ total: string }>(
    sql,
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM wlt1.limit_evaluation
      WHERE ${CLIENT_USAGE_DIMENSION_WHERE} AND evaluated_at_utc > now() - ($7 * interval '1 hour')`,
    [clientId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail, windowHours],
  );
  return toFixedPointBigInt(rows[0]!.total);
}

export async function sumDestinationRollingUsage(sql: Sql, destinationId: string, dimension: LimitDimension, windowHours: number): Promise<bigint> {
  const rows = await query<{ total: string }>(
    sql,
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM wlt1.limit_evaluation
      WHERE ${DESTINATION_USAGE_DIMENSION_WHERE} AND evaluated_at_utc > now() - ($7 * interval '1 hour')`,
    [destinationId, dimension.destinationType, dimension.assetOrCurrency, dimension.chain, dimension.network, dimension.rail, windowHours],
  );
  return toFixedPointBigInt(rows[0]!.total);
}

// -------------------------------------------------------------------------------------------
// Pure breach evaluation — deterministic, no I/O, independently unit-testable. Callers supply
// already-resolved profiles and already-summed usage (DB-computed) so this function itself never
// touches the database.
// -------------------------------------------------------------------------------------------
export type LimitBreachType = "per_txn" | "first_use" | "daily" | "rolling";
export type LimitBreachScope = "client" | "destination";

export interface EvaluateLimitBreachInput {
  amount: string;
  firstUse: boolean;
  clientProfile: LimitProfileRow;
  destinationProfile: LimitProfileRow | null;
  clientDailyUsage: bigint;
  destinationDailyUsage: bigint;
  clientRollingUsage: bigint;
  destinationRollingUsage: bigint;
}

export type LimitBreachResult = { kind: "pass" } | { kind: "deny"; breachType: LimitBreachType; breachScope: LimitBreachScope };

export function evaluateLimitBreach(input: EvaluateLimitBreachInput): LimitBreachResult {
  const amount = toFixedPointBigInt(input.amount);

  // 2. per_txn (client) — always enforced (per_transaction_limit is NOT NULL on every profile).
  if (amount > toFixedPointBigInt(input.clientProfile.perTransactionLimit)) {
    return { kind: "deny", breachType: "per_txn", breachScope: "client" };
  }
  // 3. per_txn (destination) — only if a destination profile exists.
  if (input.destinationProfile && amount > toFixedPointBigInt(input.destinationProfile.perTransactionLimit)) {
    return { kind: "deny", breachType: "per_txn", breachScope: "destination" };
  }

  if (input.firstUse) {
    // 4. first_use (client) — mandatory on the client-default profile.
    const clientFirstUseLimit = input.clientProfile.firstUseLimit;
    if (clientFirstUseLimit !== null && amount > toFixedPointBigInt(clientFirstUseLimit)) {
      return { kind: "deny", breachType: "first_use", breachScope: "client" };
    }
    // 5. first_use (destination) — only if the destination profile defines it.
    const destinationFirstUseLimit = input.destinationProfile?.firstUseLimit ?? null;
    if (destinationFirstUseLimit !== null && amount > toFixedPointBigInt(destinationFirstUseLimit)) {
      return { kind: "deny", breachType: "first_use", breachScope: "destination" };
    }
  }

  // 6. daily (client) — mandatory on the client-default profile.
  const clientDailyLimit = input.clientProfile.dailyVelocityLimit;
  if (clientDailyLimit !== null && input.clientDailyUsage + amount > toFixedPointBigInt(clientDailyLimit)) {
    return { kind: "deny", breachType: "daily", breachScope: "client" };
  }
  // 7. daily (destination) — only if the destination profile defines it.
  const destinationDailyLimit = input.destinationProfile?.dailyVelocityLimit ?? null;
  if (destinationDailyLimit !== null && input.destinationDailyUsage + amount > toFixedPointBigInt(destinationDailyLimit)) {
    return { kind: "deny", breachType: "daily", breachScope: "destination" };
  }

  // 8. rolling (client) — mandatory on the client-default profile.
  const clientRollingLimit = input.clientProfile.rollingVelocityLimit;
  if (clientRollingLimit !== null && input.clientRollingUsage + amount > toFixedPointBigInt(clientRollingLimit)) {
    return { kind: "deny", breachType: "rolling", breachScope: "client" };
  }
  // 9. rolling (destination) — only if the destination profile defines it.
  const destinationRollingLimit = input.destinationProfile?.rollingVelocityLimit ?? null;
  if (destinationRollingLimit !== null && input.destinationRollingUsage + amount > toFixedPointBigInt(destinationRollingLimit)) {
    return { kind: "deny", breachType: "rolling", breachScope: "destination" };
  }

  return { kind: "pass" };
}

/** Maps a breach into the frozen, closed reason-code vocabulary — no new error codes, extends the
 * existing business-deny enums exactly. */
export function breachReasonCode(breachType: LimitBreachType): "per_transaction_limit_exceeded" | "first_use_limit_exceeded" | "daily_velocity_exceeded" | "rolling_velocity_exceeded" {
  switch (breachType) {
    case "per_txn":
      return "per_transaction_limit_exceeded";
    case "first_use":
      return "first_use_limit_exceeded";
    case "daily":
      return "daily_velocity_exceeded";
    case "rolling":
      return "rolling_velocity_exceeded";
  }
}

// -------------------------------------------------------------------------------------------
// Shared read+evaluate orchestration — identical sequence at evaluate-use (pre-check) and
// verify-and-consume (authoritative): resolve the REQUIRED client-default profile (missing ->
// policy_unavailable), derive first-use, resolve the OPTIONAL destination profile, sum usage per
// dimension, evaluate the frozen breach-precedence order. Never writes anything — the caller
// (route) owns the write side (deny evidence + audit on breach/policy_unavailable; decision-bind
// on evaluate-use pass; CAS + pass-row-insert on consume pass) because those differ per route.
// -------------------------------------------------------------------------------------------
export interface RunLimitEvaluationInput {
  clientId: string;
  destinationId: string;
  whitelistVersion: number;
  amount: string;
  dimension: LimitDimension;
}

export type LimitEvaluationOutcome =
  | { kind: "policy_unavailable"; firstUse: boolean }
  | { kind: "breach"; breachType: LimitBreachType; breachScope: LimitBreachScope; firstUse: boolean; clientProfile: LimitProfileRow; destinationProfile: LimitProfileRow | null }
  | { kind: "pass"; firstUse: boolean; clientProfile: LimitProfileRow; destinationProfile: LimitProfileRow | null };

export async function runLimitEvaluation(client: PoolClient, input: RunLimitEvaluationInput): Promise<LimitEvaluationOutcome> {
  const clientProfile = await resolveClientLimitProfile(client, input.clientId, input.dimension);
  const firstUse = await computeFirstUse(client, input.destinationId, input.whitelistVersion);

  if (!clientProfile) {
    return { kind: "policy_unavailable", firstUse };
  }

  const destinationProfile = await resolveDestinationLimitProfile(client, input.clientId, input.destinationId, input.dimension);

  const clientDailyUsage = clientProfile.dailyVelocityLimit !== null ? await sumClientDailyUsage(client, input.clientId, input.dimension) : 0n;
  const clientRollingUsage = clientProfile.rollingVelocityLimit !== null ? await sumClientRollingUsage(client, input.clientId, input.dimension, clientProfile.rollingWindowHours!) : 0n;
  const destinationDailyUsage = destinationProfile && destinationProfile.dailyVelocityLimit !== null ? await sumDestinationDailyUsage(client, input.destinationId, input.dimension) : 0n;
  const destinationRollingUsage = destinationProfile && destinationProfile.rollingVelocityLimit !== null ? await sumDestinationRollingUsage(client, input.destinationId, input.dimension, destinationProfile.rollingWindowHours!) : 0n;

  const breach = evaluateLimitBreach({
    amount: input.amount,
    firstUse,
    clientProfile,
    destinationProfile,
    clientDailyUsage,
    destinationDailyUsage,
    clientRollingUsage,
    destinationRollingUsage,
  });

  if (breach.kind === "deny") {
    return { kind: "breach", breachType: breach.breachType, breachScope: breach.breachScope, firstUse, clientProfile, destinationProfile };
  }
  return { kind: "pass", firstUse, clientProfile, destinationProfile };
}

// -------------------------------------------------------------------------------------------
// Durable evidence writes — INSERT-only, append-only wlt1.limit_evaluation.
// -------------------------------------------------------------------------------------------
const LIMIT_EVALUATION_ID_PREFIX = "wlt1lev_";

export function mintLimitEvaluationId(): string {
  return LIMIT_EVALUATION_ID_PREFIX + randomUUID();
}

export interface InsertDenyEvaluationInput {
  limitEvaluationId: string;
  decisionId: string | null;
  clientId: string;
  destinationId: string;
  destinationType: LimitDestinationType;
  whitelistVersion: number;
  limitsVersion: number;
  amount: string;
  dimension: LimitDimension;
  breachType: LimitBreachType | "policy_unavailable";
  breachScope: LimitBreachScope;
  firstUse: boolean;
  clientLimitProfile: LimitProfileRow | null;
  destinationLimitProfile: LimitProfileRow | null;
}

export async function insertDenyLimitEvaluation(client: PoolClient, input: InsertDenyEvaluationInput): Promise<void> {
  await query(
    client,
    `INSERT INTO wlt1.limit_evaluation
       (limit_evaluation_id, decision_id, client_id, destination_id, destination_type, whitelist_version, limits_version,
        amount, asset_or_currency, chain, network, rail, result_status, breach_type, breach_scope, first_use,
        client_limit_profile_id, client_limit_profile_version, destination_limit_profile_id, destination_limit_profile_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'deny',$13,$14,$15,$16,$17,$18,$19)`,
    [
      input.limitEvaluationId,
      input.decisionId,
      input.clientId,
      input.destinationId,
      input.destinationType,
      input.whitelistVersion,
      input.limitsVersion,
      input.amount,
      input.dimension.assetOrCurrency,
      input.dimension.chain,
      input.dimension.network,
      input.dimension.rail,
      input.breachType,
      input.breachScope,
      input.firstUse,
      input.clientLimitProfile?.limitProfileId ?? null,
      input.clientLimitProfile?.version ?? null,
      input.destinationLimitProfile?.limitProfileId ?? null,
      input.destinationLimitProfile?.version ?? null,
    ],
  );
}

export interface InsertPassEvaluationInput {
  limitEvaluationId: string;
  decisionId: string;
  consumptionId: string;
  executionRef: string;
  clientId: string;
  destinationId: string;
  destinationType: LimitDestinationType;
  whitelistVersion: number;
  limitsVersion: number;
  amount: string;
  dimension: LimitDimension;
  firstUse: boolean;
  clientLimitProfile: LimitProfileRow;
  destinationLimitProfile: LimitProfileRow | null;
}

/** Pure staleness check (Final Micro-Correction, load-bearing): a decision's BOUND profile
 * references must exactly match the CURRENTLY-resolved active profiles for its own dimension —
 * any drift (a version bump, a profile deactivated with no replacement, a destination profile
 * appearing when none was bound, or disappearing/changing when one was) fails closed as
 * `limits_version_changed`. Absence must remain absence: `null` bound destination-profile refs
 * are drift-free only if the current resolution is ALSO `null`. */
export function hasLimitPolicyDrift(input: {
  boundClientLimitProfileId: string;
  boundClientLimitProfileVersion: number;
  boundDestinationLimitProfileId: string | null;
  boundDestinationLimitProfileVersion: number | null;
  currentClientProfile: LimitProfileRow | null;
  currentDestinationProfile: LimitProfileRow | null;
}): boolean {
  if (!input.currentClientProfile) return true;
  if (input.currentClientProfile.limitProfileId !== input.boundClientLimitProfileId || input.currentClientProfile.version !== input.boundClientLimitProfileVersion) return true;
  const currentDestinationId = input.currentDestinationProfile?.limitProfileId ?? null;
  const currentDestinationVersion = input.currentDestinationProfile?.version ?? null;
  if (currentDestinationId !== input.boundDestinationLimitProfileId || currentDestinationVersion !== input.boundDestinationLimitProfileVersion) return true;
  return false;
}

/** Loads the ORIGINAL pass evaluation's own `limit_evaluation_id`/`first_use` for a completed
 * decision's replay path — `uq_wlt1_limit_evaluation_decision_pass` guarantees at most one such
 * row per decision. Used ONLY to reconstruct a historically-honest replay audit; never re-derives
 * `first_use` from current state (a replay must represent the original pass, not a fresh one). */
export async function loadPassLimitEvaluationByDecisionId(sql: Sql, decisionId: string): Promise<{ limitEvaluationId: string; firstUse: boolean } | undefined> {
  const rows = await query<{ limit_evaluation_id: string; first_use: boolean }>(
    sql,
    `SELECT limit_evaluation_id, first_use FROM wlt1.limit_evaluation WHERE decision_id = $1 AND result_status = 'pass'`,
    [decisionId],
  );
  const row = rows[0];
  return row ? { limitEvaluationId: row.limit_evaluation_id, firstUse: row.first_use } : undefined;
}

// -------------------------------------------------------------------------------------------
// wlt1.limit_denied audit metadata — exact frozen 17 keys, shared by evaluate-use.ts and
// decision-consume.ts (both call sites, never duplicated). No profile thresholds, no address, no
// PII, no service token.
// -------------------------------------------------------------------------------------------
export interface LimitDeniedAuditMetadataInput {
  limitEvaluationId: string;
  decisionId: string | null;
  clientId: string;
  destinationId: string;
  destinationType: LimitDestinationType;
  dimension: LimitDimension;
  amount: string;
  breachType: LimitBreachType | "policy_unavailable";
  breachScope: LimitBreachScope;
  firstUse: boolean;
  limitsVersion: number;
  clientLimitProfileId: string | null;
  destinationLimitProfileId: string | null;
  evaluatedAtUtc: Date;
}

export function buildLimitDeniedAuditMetadata(input: LimitDeniedAuditMetadataInput): Record<string, unknown> {
  return {
    limit_evaluation_id: input.limitEvaluationId,
    decision_id: input.decisionId,
    client_id: input.clientId,
    destination_id: input.destinationId,
    destination_type: input.destinationType,
    asset_or_currency: input.dimension.assetOrCurrency,
    chain: input.dimension.chain,
    network: input.dimension.network,
    rail: input.dimension.rail,
    amount: input.amount,
    breach_type: input.breachType,
    breach_scope: input.breachScope,
    first_use: input.firstUse,
    limits_version: input.limitsVersion,
    client_limit_profile_id: input.clientLimitProfileId,
    destination_limit_profile_id: input.destinationLimitProfileId,
    evaluated_at_utc: input.evaluatedAtUtc.toISOString(),
  };
}

export async function insertPassLimitEvaluation(client: PoolClient, input: InsertPassEvaluationInput): Promise<void> {
  await query(
    client,
    `INSERT INTO wlt1.limit_evaluation
       (limit_evaluation_id, decision_id, consumption_id, execution_ref, client_id, destination_id, destination_type,
        whitelist_version, limits_version, amount, asset_or_currency, chain, network, rail, result_status, first_use,
        client_limit_profile_id, client_limit_profile_version, destination_limit_profile_id, destination_limit_profile_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pass',$15,$16,$17,$18,$19)`,
    [
      input.limitEvaluationId,
      input.decisionId,
      input.consumptionId,
      input.executionRef,
      input.clientId,
      input.destinationId,
      input.destinationType,
      input.whitelistVersion,
      input.limitsVersion,
      input.amount,
      input.dimension.assetOrCurrency,
      input.dimension.chain,
      input.dimension.network,
      input.dimension.rail,
      input.firstUse,
      input.clientLimitProfile.limitProfileId,
      input.clientLimitProfile.version,
      input.destinationLimitProfile?.limitProfileId ?? null,
      input.destinationLimitProfile?.version ?? null,
    ],
  );
}
