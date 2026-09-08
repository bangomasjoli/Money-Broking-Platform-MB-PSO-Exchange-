/**
 * WLT-01 — Ongoing Rescreening. Implements the FROZEN architecture (WLT-01 Ongoing Rescreening
 * Addendum, CLOSED + Run-Lifecycle Micro-Addendum, CLOSED) exactly — no new architectural
 * decisions are made in this file.
 *
 * GOVERNING INVARIANT (the single most important rule of this phase, restated here because every
 * function below exists to uphold it): ongoing rescreening NEVER persists a `risk_status='pending'`
 * `wlt1.wallet_screening_result` row. `lib/destination-approval.ts`'s `loadLatestScreening` selects
 * evidence by `screening_result_version DESC`, and `evaluate-use.ts`'s gate denies unless the
 * LATEST row is `clear` — inserting a pending N+1 row before the provider returns would silently
 * suspend a live, whitelisted destination merely because a rescreen started. The model is instead:
 * mint `screening_result_id` -> call the provider at transaction depth 0 -> obtain a FINAL result
 * -> validate it -> open one short application transaction -> append ONE TERMINAL row at
 * `MAX(version)+1`. A provider failure persists NO row at all; the abandoned id is never reused.
 *
 * SEQUENTIAL DISPATCH (frozen, load-bearing): the Phase-B candidate loop in
 * `routes/rescreening-run.ts` is a plain `for...of` with `await` — this file's own
 * `processRescreeningCandidate` is written to be called exactly that way. `Promise.all`/
 * `Promise.allSettled` over candidates is forbidden.
 *
 * REUSE, NEVER DUPLICATE: `validateNormalizedScreeningResult` (`lib/screening-application.ts`),
 * `screenViaProvider`/`resolveCurrentWalletAnalyticsProvider` (`lib/providers/registry.ts`),
 * `fetchActiveChainCoverage` (`lib/chain-coverage.ts`), `loadLatestScreening`
 * (`lib/destination-approval.ts`), and `applyRevocationTransition`/`insertRevocationEvidence`/
 * `buildRevocationAuditMetadata` (`lib/destination-revocation.ts`) are all imported UNMODIFIED and
 * called in-process — never an HTTP self-call, never a second AML/screening engine.
 * `applyNormalizedScreeningResult` is deliberately NOT reused: it requires
 * `destination.status='pending_screening'` plus an existing `pending` row, which is exactly the
 * onboarding shape this phase must never create.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, publishAudit, query, withTransaction, type Sql } from "@aix/foundation";
import { fetchActiveChainCoverage } from "./chain-coverage.js";
import { loadLatestScreening } from "./destination-approval.js";
import { resolveCurrentWalletAnalyticsProvider, screenViaProvider } from "./providers/registry.js";
import { isSanctionsConsistent, type WalletAnalyticsProvider, type WalletScreeningInput } from "./providers/types.js";
import { validateNormalizedScreeningResult } from "./screening-application.js";
import { applyRevocationTransition, insertRevocationEvidence, buildRevocationAuditMetadata, RESCREENING_REASON_CODE, type LockedDestinationRow } from "./destination-revocation.js";
import type { Wlt1Config } from "../config.js";

// -------------------------------------------------------------------------------------------
// Identifiers
// -------------------------------------------------------------------------------------------

const RUN_ID_PREFIX = "wlt1rsr_";
/** `wlt1rsr_` + a UUID (36 characters, lowercase hex + hyphens) — 44 characters total. Fourth
 * instance of the unbroken WLT identifier convention (`wlt1dec_`/`wlt1con_`/`wlt1rev_`). */
export const RUN_ID_REGEX = /^wlt1rsr_[0-9a-f-]{36}$/;

export function mintRescreeningRunId(): string {
  return RUN_ID_PREFIX + randomUUID();
}

const SCREENING_RESULT_ID_PREFIX = "wlt1screen_";

/** Own copy of the identical format `routes/wallet-screening.ts`'s module-private
 * `newScreeningResultId` uses — that helper is not exported (F3(c)-style "own copy", not a
 * cross-file reuse of a private symbol). Minted BEFORE the provider call; abandoned (never
 * persisted) if the provider call does not produce a final result. */
export function mintRescreeningScreeningResultId(): string {
  return SCREENING_RESULT_ID_PREFIX + randomUUID();
}

// -------------------------------------------------------------------------------------------
// Run lifecycle constants/types
// -------------------------------------------------------------------------------------------

/** A `running` row older than this is stuck and reclaimable by the next request. Module constant,
 * never config — mirrors `PROVIDER_CALL_TIMEOUT_MS`'s own "module constant, not env var"
 * precedent. */
export const RESCREENING_STUCK_THRESHOLD_SECONDS = 3600;

export type RescreeningScope = "periodic_due" | "destination";
export type RescreeningRunStatus = "running" | "completed" | "completed_with_errors" | "failed";
export type RescreeningCompletionReason = "normal" | "reclaimed_stuck";

/** Whitelist-eligible states this phase may select — `evaluate-use.ts:174-181`'s own eligible-set,
 * reused verbatim. `revoked` (terminal, no rehabilitation flow) and every onboarding state
 * (`draft`/`pending_screening`/`pending_review`) are never selectable. */
export const RESCREENING_ELIGIBLE_STATUSES = ["active", "approved_pending_cooling"] as const;
export type RescreeningEligibleStatus = (typeof RESCREENING_ELIGIBLE_STATUSES)[number];

export function isRescreeningEligibleStatus(status: string): status is RescreeningEligibleStatus {
  return (RESCREENING_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/** Pure — a `running` row started before `nowUtc - RESCREENING_STUCK_THRESHOLD_SECONDS` is stuck.
 * Both timestamps MUST be PostgreSQL-authoritative (never `Date.now()`/`new Date()`). */
export function isRescreeningRunStuck(startedAtUtc: Date, nowUtc: Date): boolean {
  return startedAtUtc.getTime() < nowUtc.getTime() - RESCREENING_STUCK_THRESHOLD_SECONDS * 1000;
}

/** Pure — the frozen terminal-status formula (Run-Lifecycle Micro-Addendum Issue 2/3). Counters
 * only; `skipped` never influences this, and zero candidates with zero failures is `completed`. */
export function classifyRescreeningRunStatus(failures: number): "completed" | "completed_with_errors" {
  return failures > 0 ? "completed_with_errors" : "completed";
}

export interface RescreeningRunCounters {
  candidatesSelected: number;
  rescreenedClear: number;
  rescreenedAdverse: number;
  revocationsTriggered: number;
  skipped: number;
  failures: number;
}

export function zeroRescreeningRunCounters(): RescreeningRunCounters {
  return { candidatesSelected: 0, rescreenedClear: 0, rescreenedAdverse: 0, revocationsTriggered: 0, skipped: 0, failures: 0 };
}

export interface RescreeningRunAuditMetadata {
  [key: string]: unknown;
  run_id: string;
  scope: RescreeningScope;
  status: RescreeningRunStatus;
  completion_reason: RescreeningCompletionReason;
  requested_by: string;
  target_destination_id: string | null;
  candidates_selected: number;
  rescreened_clear: number;
  rescreened_adverse: number;
  revocations_triggered: number;
  skipped: number;
  failures: number;
}

/** Exactly the frozen 12-key `wlt1.rescreening_run_completed` audit metadata (Run-Lifecycle
 * Micro-Addendum Issue 6/11) — the ONE place this shape is built, so the normal-finalization and
 * stuck-reclaim call sites can never drift apart. No `outcome` key. */
export function buildRescreeningRunAuditMetadata(input: {
  runId: string;
  scope: RescreeningScope;
  status: RescreeningRunStatus;
  completionReason: RescreeningCompletionReason;
  requestedBy: string;
  targetDestinationId: string | null;
  counters: RescreeningRunCounters;
}): RescreeningRunAuditMetadata {
  return {
    run_id: input.runId,
    scope: input.scope,
    status: input.status,
    completion_reason: input.completionReason,
    requested_by: input.requestedBy,
    target_destination_id: input.targetDestinationId,
    candidates_selected: input.counters.candidatesSelected,
    rescreened_clear: input.counters.rescreenedClear,
    rescreened_adverse: input.counters.rescreenedAdverse,
    revocations_triggered: input.counters.revocationsTriggered,
    skipped: input.counters.skipped,
    failures: input.counters.failures,
  };
}

// -------------------------------------------------------------------------------------------
// Run-row DB access (Phase A / finalize) — callers hold the run advisory lock for all of these.
// -------------------------------------------------------------------------------------------

interface RunningRunRow {
  run_id: string;
  started_at_utc: Date;
}

/** `SELECT ... FOR UPDATE` the current `running` row, if any. At most one can ever exist — no
 * other WHERE clause is needed. */
export async function findRunningRescreeningRun(client: PoolClient): Promise<RunningRunRow | null> {
  const rows = await query<RunningRunRow>(client, `SELECT run_id, started_at_utc FROM wlt1.rescreening_run WHERE status = 'running' FOR UPDATE`, []);
  return rows[0] ?? null;
}

/** Marks a stuck `running` row `failed` — the ONLY Phase-A mutation, and the ONLY Phase-A audit
 * call. `nowUtc` MUST be PostgreSQL-authoritative. */
export async function reclaimStuckRescreeningRun(client: PoolClient, runId: string, nowUtc: Date, requestedBy: string): Promise<void> {
  await query(client, `UPDATE wlt1.rescreening_run SET status = 'failed', completed_at_utc = $1 WHERE run_id = $2`, [nowUtc.toISOString(), runId]);
  const counters = await readRescreeningRunCounters(client, runId);
  await publishAudit(client, {
    event_type: "wlt1.rescreening_run_completed",
    source_module: "WLT-01",
    actor_id: "wlt1_internal_service",
    actor_type: "service",
    entity_type: "rescreening_run",
    entity_id: runId,
    metadata: buildRescreeningRunAuditMetadata({
      runId,
      scope: (await readRescreeningRunScope(client, runId)) as RescreeningScope,
      status: "failed",
      completionReason: "reclaimed_stuck",
      requestedBy,
      targetDestinationId: await readRescreeningRunTargetDestinationId(client, runId),
      counters,
    }),
  });
}

interface RunScopeRow {
  scope: string;
  target_destination_id: string | null;
}

async function readRescreeningRunScope(client: PoolClient, runId: string): Promise<string> {
  const rows = await query<RunScopeRow>(client, `SELECT scope, target_destination_id FROM wlt1.rescreening_run WHERE run_id = $1`, [runId]);
  return rows[0]!.scope;
}

async function readRescreeningRunTargetDestinationId(client: PoolClient, runId: string): Promise<string | null> {
  const rows = await query<RunScopeRow>(client, `SELECT scope, target_destination_id FROM wlt1.rescreening_run WHERE run_id = $1`, [runId]);
  return rows[0]!.target_destination_id;
}

interface RunCountersRow {
  candidates_selected: number;
  rescreened_clear: number;
  rescreened_adverse: number;
  revocations_triggered: number;
  skipped: number;
  failures: number;
}

/** Reads the run row's OWN stored counters — used verbatim for stuck-reclaim audits (Run-Lifecycle
 * Micro-Addendum Issue 7/12: never reconstructed from per-destination evidence; a reclaimed run's
 * counters may under-report committed work, which `completion_reason:"reclaimed_stuck"` itself
 * flags to a reader — forensic truth lives in `wallet_screening_result`/its own audits, not here). */
export async function readRescreeningRunCounters(client: PoolClient, runId: string): Promise<RescreeningRunCounters> {
  const rows = await query<RunCountersRow>(
    client,
    `SELECT candidates_selected, rescreened_clear, rescreened_adverse, revocations_triggered, skipped, failures FROM wlt1.rescreening_run WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0]!;
  return {
    candidatesSelected: row.candidates_selected,
    rescreenedClear: row.rescreened_clear,
    rescreenedAdverse: row.rescreened_adverse,
    revocationsTriggered: row.revocations_triggered,
    skipped: row.skipped,
    failures: row.failures,
  };
}

export interface InsertRescreeningRunInput {
  runId: string;
  scope: RescreeningScope;
  requestedBy: string;
  targetDestinationId: string | null;
  candidatesSelected: number;
  requestId: string | null;
  correlationId: string | null;
}

export async function insertRescreeningRun(client: PoolClient, input: InsertRescreeningRunInput): Promise<void> {
  await query(
    client,
    `INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, target_destination_id, candidates_selected, request_id, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.runId, input.scope, input.requestedBy, input.targetDestinationId, input.candidatesSelected, input.requestId, input.correlationId],
  );
}

export interface FinalizeRescreeningRunInput {
  runId: string;
  scope: RescreeningScope;
  requestedBy: string;
  targetDestinationId: string | null;
  counters: RescreeningRunCounters;
  nowUtc: Date;
}

export interface FinalizedRescreeningRun {
  status: "completed" | "completed_with_errors";
  completedAtUtc: Date;
}

/** Finalize transaction body — UPDATE + audit in the SAME transaction (caller wraps this in
 * `withTransaction`; an audit failure rolls back the UPDATE too, leaving the row `running` with
 * its ORIGINAL stored counters, reclaimable after the stuck threshold). */
export async function finalizeRescreeningRun(client: PoolClient, input: FinalizeRescreeningRunInput): Promise<FinalizedRescreeningRun> {
  const status = classifyRescreeningRunStatus(input.counters.failures);
  await query(
    client,
    `UPDATE wlt1.rescreening_run
        SET status = $1, candidates_selected = $2, rescreened_clear = $3, rescreened_adverse = $4,
            revocations_triggered = $5, skipped = $6, failures = $7, completed_at_utc = $8
      WHERE run_id = $9`,
    [
      status,
      input.counters.candidatesSelected,
      input.counters.rescreenedClear,
      input.counters.rescreenedAdverse,
      input.counters.revocationsTriggered,
      input.counters.skipped,
      input.counters.failures,
      input.nowUtc.toISOString(),
      input.runId,
    ],
  );
  await publishAudit(client, {
    event_type: "wlt1.rescreening_run_completed",
    source_module: "WLT-01",
    actor_id: "wlt1_internal_service",
    actor_type: "service",
    entity_type: "rescreening_run",
    entity_id: input.runId,
    metadata: buildRescreeningRunAuditMetadata({
      runId: input.runId,
      scope: input.scope,
      status,
      completionReason: "normal",
      requestedBy: input.requestedBy,
      targetDestinationId: input.targetDestinationId,
      counters: input.counters,
    }),
  });
  return { status, completedAtUtc: input.nowUtc };
}

// -------------------------------------------------------------------------------------------
// Candidate selection (Phase A, under the run advisory lock — read-only, no destination lock)
// -------------------------------------------------------------------------------------------

export interface RescreeningCandidate {
  destinationId: string;
  clientId: string;
}

interface CandidateRow {
  destination_id: string;
  client_id: string;
}

/** Due predicate + ordering exactly as frozen: a destination is due when its LATEST evidence's
 * `valid_until_utc` is NULL (including "no evidence row exists at all" via the LEFT JOIN) or falls
 * within the lead-time window, computed by PostgreSQL `now()` — never a JavaScript clock.
 * `NULLS FIRST` is load-bearing (Run-Lifecycle Micro-Addendum Issue 16/27): NULL validity is the
 * WEAKEST evidence and must not starve behind dated rows under a batch cap. No OFFSET/cursor —
 * each successful clear rescreen writes a later `valid_until_utc`, so repeated runs self-drain. */
export async function selectDuePeriodicCandidates(client: PoolClient, leadTimeHours: number, batchSize: number): Promise<RescreeningCandidate[]> {
  const rows = await query<CandidateRow>(
    client,
    `WITH latest AS (
       SELECT DISTINCT ON (destination_id) destination_id, valid_until_utc
       FROM wlt1.wallet_screening_result
       ORDER BY destination_id, screening_result_version DESC
     )
     SELECT d.destination_id, d.client_id
       FROM wlt1.destination d
       LEFT JOIN latest l ON l.destination_id = d.destination_id
      WHERE d.status IN ('active', 'approved_pending_cooling')
        AND (l.valid_until_utc IS NULL OR l.valid_until_utc < now() + ($1 * interval '1 hour'))
      ORDER BY l.valid_until_utc ASC NULLS FIRST, d.destination_id ASC
      LIMIT $2`,
    [leadTimeHours, batchSize],
  );
  return rows.map((r) => ({ destinationId: r.destination_id, clientId: r.client_id }));
}

/** `scope:"destination"` candidate resolution — existence + client-binding ONLY (no due check, no
 * eligible-status check: a forced rescreen bypasses due-date, and a known-but-ineligible
 * destination is a legitimate Phase-B SKIP, never a 404). Unknown destination or a client_id
 * mismatch both return `null`, collapsing to the SAME `WLT1_DESTINATION_NOT_FOUND` shape — no
 * cross-client existence oracle. */
export async function loadDestinationScopeCandidate(sql: Sql, destinationId: string, clientId: string): Promise<RescreeningCandidate | null> {
  const rows = await query<CandidateRow>(sql, `SELECT destination_id, client_id FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  const row = rows[0];
  if (!row || row.client_id !== clientId) return null;
  return { destinationId: row.destination_id, clientId: row.client_id };
}

// -------------------------------------------------------------------------------------------
// Per-destination processing (Phase B) — provider call at depth 0, then one locked application tx.
// -------------------------------------------------------------------------------------------

export type RescreeningCandidateOutcome = { kind: "skipped" } | { kind: "failure" } | { kind: "clear" } | { kind: "adverse"; revoked: boolean };

interface WalletDestinationRow {
  chain: string;
  network: string;
  canonical_address: string;
  address_hash: string;
}

interface LockedDestinationFullRow {
  destination_id: string;
  client_id: string;
  status: string;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
}

export interface ProcessRescreeningCandidateDeps {
  scope: RescreeningScope;
  runId: string;
  screeningProviderId: string;
  screeningProviderImpl?: WalletAnalyticsProvider;
  screeningMaxValidityHours: number;
  rescreenLeadTimeHours: number;
}

/** The full per-destination pipeline, called sequentially (never in parallel) by the Phase-B loop
 * in `routes/rescreening-run.ts`. Provider I/O happens BEFORE any lock is taken; the application
 * transaction that follows performs no network call. Never throws for an ordinary
 * ineligible/failed candidate — the caller's own `for...of` still wraps this in `try/catch` as
 * defence-in-depth (an unexpected implementation error is also a `failure`, never a thrown
 * request-level exception that would abort the whole run). */
export async function processRescreeningCandidate(candidate: RescreeningCandidate, deps: ProcessRescreeningCandidateDeps): Promise<RescreeningCandidateOutcome> {
  // STEP 1 — cheap unlocked pre-check: avoid a wasted provider call for an already-ineligible
  // destination. NOT authoritative — the application transaction below re-checks under lock.
  const preRows = await query<{ status: string }>(getPool(), `SELECT status FROM wlt1.destination WHERE destination_id = $1`, [candidate.destinationId]);
  const preStatus = preRows[0]?.status;
  if (preStatus === undefined || !isRescreeningEligibleStatus(preStatus)) {
    return { kind: "skipped" };
  }

  // STEP 2 — chain coverage (unlocked, depth 0).
  const walletRows = await query<WalletDestinationRow>(
    getPool(),
    `SELECT chain, network, canonical_address, address_hash FROM wlt1.wallet_destination WHERE destination_id = $1`,
    [candidate.destinationId],
  );
  const wallet = walletRows[0];
  if (!wallet) return { kind: "skipped" };

  const coverage = await fetchActiveChainCoverage(getPool(), wallet.chain, wallet.network);
  if (!coverage) return { kind: "skipped" };

  // STEP 3 — mint id BEFORE the provider call; resolve provider (registry, or test DI overriding
  // only the callable/adaptorVersion — providerId always comes from chain_coverage, never a test
  // seam, mirroring wallet-screening.ts's own established discipline).
  const screeningResultId = mintRescreeningScreeningResultId();
  let provider: WalletAnalyticsProvider;
  try {
    const registryProvider = resolveCurrentWalletAnalyticsProvider(coverage.provider_id);
    provider = deps.screeningProviderImpl
      ? { providerId: registryProvider.providerId, adaptorVersion: deps.screeningProviderImpl.adaptorVersion, screen: deps.screeningProviderImpl.screen }
      : registryProvider;
  } catch {
    return { kind: "failure" };
  }

  const input: WalletScreeningInput = { chain: wallet.chain, network: wallet.network, canonicalAddress: wallet.canonical_address, screeningReferenceId: screeningResultId };
  const outcome = await screenViaProvider(provider, input);
  if (outcome.kind !== "screened") {
    return { kind: "failure" };
  }

  // Defensive re-check (mirrors screening-application.ts's own identical defensive posture) —
  // structurally near-impossible since the stub/adaptor already enforces this, but never trusted
  // merely because today's provider happens to be correct.
  if (!isSanctionsConsistent(outcome.result)) {
    return { kind: "failure" };
  }

  let validated: { effectiveValidUntil: Date };
  try {
    validated = validateNormalizedScreeningResult(outcome.result, deps.screeningMaxValidityHours, new Date());
  } catch {
    return { kind: "failure" };
  }

  // STEP 4 — application transaction. Advisory lock -> row lock -> AUTHORITATIVE re-check ->
  // append terminal evidence (+ maybe revoke) -> audits -> COMMIT. No network occurs in here.
  try {
    return await withTransaction(async (client) => {
      await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${candidate.destinationId}`]);

      const destRows = await query<LockedDestinationFullRow>(
        client,
        `SELECT destination_id, client_id, status, destination_status_version, whitelist_version, revocation_epoch
           FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`,
        [candidate.destinationId],
      );
      const dest = destRows[0];
      // Structurally near-impossible (destination_id is immutable, no DELETE grant) — defended
      // anyway. Also defends the (equally structurally-impossible) client_id drift case.
      if (!dest || dest.client_id !== candidate.clientId) return { kind: "skipped" as const };

      // AUTHORITATIVE eligibility re-check — this is what actually catches "destination became
      // revoked/non-eligible while the provider call was in flight" (case B/C). Discards the
      // provider result entirely: no evidence row, no revocation, revoked is NEVER resurrected.
      if (!isRescreeningEligibleStatus(dest.status)) return { kind: "skipped" as const };

      const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
      const nowUtc = nowRows[0]!.now_utc;

      // Periodic scope ONLY: re-verify still-due under lock (case D — another process may have
      // refreshed evidence between selection and this application). Manual scope deliberately
      // bypasses due-date logic entirely, per the frozen architecture.
      if (deps.scope === "periodic_due") {
        const latest = await loadLatestScreening(client, candidate.destinationId);
        const dueThreshold = nowUtc.getTime() + deps.rescreenLeadTimeHours * 60 * 60 * 1000;
        const stillDue = !latest || latest.validUntilUtc === null || latest.validUntilUtc.getTime() < dueThreshold;
        if (!stillDue) return { kind: "skipped" as const };
      }

      const versionRows = await query<{ max_version: number }>(
        client,
        `SELECT COALESCE(MAX(screening_result_version), 0) AS max_version FROM wlt1.wallet_screening_result WHERE destination_id = $1`,
        [candidate.destinationId],
      );
      const newVersion = Number(versionRows[0]?.max_version ?? 0) + 1;
      const result = outcome.result;
      const isAdverse = result.riskStatus !== "clear";

      // ONE terminal row, single INSERT — never a pending row, never mutated afterward.
      // Synchronous-provider envelope: source_authenticated/payload_hash both NULL (no external
      // receipt to authenticate/hash), mirroring screening-application.ts's own
      // `deriveSourceEvidence` for `sourceKind:"synchronous_provider"`.
      await query(
        client,
        `INSERT INTO wlt1.wallet_screening_result
           (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, provider_result_id,
            chain, network, address_hash, risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure,
            sanctions_exposure, cluster_ref, payload_hash, source_authenticated, issued_at_utc, valid_until_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL,NULL,$17,$18)`,
        [
          screeningResultId,
          candidate.destinationId,
          newVersion,
          provider.providerId,
          provider.adaptorVersion,
          result.providerResultId,
          wallet.chain,
          wallet.network,
          wallet.address_hash,
          result.riskStatus,
          result.riskScore,
          JSON.stringify(result.riskCategories),
          JSON.stringify(result.directExposure),
          JSON.stringify(result.indirectExposure),
          result.sanctionsExposure,
          result.clusterRef,
          result.issuedAtUtc,
          validated.effectiveValidUntil.toISOString(),
        ],
      );

      // Rescreening-path emission: existing 6-key shape + exactly ONE new key, run_id — never
      // touches screening-application.ts's own onboarding-path 6-key emission.
      await publishAudit(client, {
        event_type: "wlt1.wallet_screening_completed",
        source_module: "WLT-01",
        actor_id: "wlt1_internal_service",
        actor_type: "service",
        entity_type: "wallet_screening_result",
        entity_id: screeningResultId,
        metadata: {
          destination_id: candidate.destinationId,
          screening_result_id: screeningResultId,
          screening_result_version: newVersion,
          risk_status: result.riskStatus,
          provider_id: provider.providerId,
          valid_until_utc: validated.effectiveValidUntil.toISOString(),
          run_id: deps.runId,
        },
      });

      if (result.riskStatus === "high_risk") {
        await publishAudit(client, {
          event_type: "wlt1.wallet_high_risk_detected",
          source_module: "WLT-01",
          actor_id: "wlt1_internal_service",
          actor_type: "service",
          entity_type: "wallet_screening_result",
          entity_id: screeningResultId,
          metadata: { destination_id: candidate.destinationId, screening_result_id: screeningResultId, risk_status: result.riskStatus },
        });
      }
      if (result.sanctionsExposure === true) {
        await publishAudit(client, {
          event_type: "wlt1.wallet_sanctions_exposure",
          source_module: "WLT-01",
          actor_id: "wlt1_internal_service",
          actor_type: "service",
          entity_type: "wallet_screening_result",
          entity_id: screeningResultId,
          metadata: { destination_id: candidate.destinationId, screening_result_id: screeningResultId, risk_status: result.riskStatus },
        });
      }

      // ONE result decision — hit and sanctionsExposure=true are evaluated together, never as two
      // independent branches, so a result carrying BOTH still revokes exactly once.
      let revoked = false;
      if (result.riskStatus === "hit" || result.sanctionsExposure === true) {
        const locked: LockedDestinationRow = {
          destinationId: dest.destination_id,
          clientId: dest.client_id,
          status: dest.status,
          revocationEpoch: dest.revocation_epoch,
          destinationStatusVersion: dest.destination_status_version,
        };
        const transition = await applyRevocationTransition(client, locked, nowUtc);
        revoked = transition.transitioned;
        const evidence = await insertRevocationEvidence(client, {
          destinationId: dest.destination_id,
          clientId: dest.client_id,
          source: "rescreening",
          reasonCode: RESCREENING_REASON_CODE,
          reasonDetail: null,
          actorId: null,
          signalRef: screeningResultId,
          signalType: null,
          destinationStatusVersionAfter: transition.destination.destinationStatusVersion,
          revocationEpochAfter: transition.destination.revocationEpoch,
        });
        await publishAudit(client, {
          event_type: "wlt1.destination_revoked",
          source_module: "WLT-01",
          actor_id: "wlt1_internal_service",
          actor_type: "service",
          entity_type: "destination",
          entity_id: dest.destination_id,
          metadata: buildRevocationAuditMetadata({
            destinationId: dest.destination_id,
            clientId: dest.client_id,
            outcome: transition.transitioned ? "revoked" : "already_revoked",
            source: "rescreening",
            reasonCode: RESCREENING_REASON_CODE,
            reasonDetail: null,
            actorId: null,
            signalRef: screeningResultId,
            evidence,
          }),
        });
      }

      return isAdverse ? ({ kind: "adverse", revoked } as const) : ({ kind: "clear" } as const);
    });
  } catch {
    return { kind: "failure" };
  }
}
