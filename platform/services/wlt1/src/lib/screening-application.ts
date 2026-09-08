/**
 * WLT-01 Phase 2C-B/2C-C1 — the ONE authoritative screening-result application service
 * (`createScreeningApplication` -> `applyNormalizedScreeningResult`). No route reaches this yet —
 * Phase 2C-C (synchronous provider invocation) and Phase 2C-D (authenticated provider receipt)
 * will both call this SAME function so the terminal-state transition logic exists in exactly one
 * place, never duplicated between the two call paths (mirrors AML-01's own
 * `lib/screening-execution.ts` "shared execution core" precedent, by structural convention only,
 * never by cross-service import — F3(c)).
 *
 * P2CB-MED-1 remediation (Phase 2C-C1): independent Opus review proved the Phase 2C-B API
 * (`applyNormalizedScreeningResult({..., screeningMaxValidityHours})`) let ANY caller persist an
 * arbitrary validity ceiling — 8760/87600/876000 hours were all accepted regardless of the boot
 * config's own validated 1-8760 range, because the ceiling was a bare caller-supplied primitive,
 * never actually read from `Wlt1Config`. The compliance-control ceiling must not be
 * caller-selectable. `createScreeningApplication(config: Wlt1Config)` is now the ONLY way to
 * obtain an `applyNormalizedScreeningResult` — it captures `config.screeningMaxValidityHours`
 * ONCE, by closure, at construction time. The returned method's own input type has NO
 * `screeningMaxValidityHours` field at all — the deletion itself is the control, not an optional
 * or defaulted parameter that would leave the same hole open. There is no other exported function
 * in this module that accepts a validity-ceiling primitive; the only way to influence the
 * persisted ceiling is to control the `Wlt1Config` the service was constructed from, and the only
 * producer of a `Wlt1Config` is `config.ts`'s own `loadWlt1Config`, which already fails startup
 * closed on a non-integer or out-of-range (1-8760) override. This file never reads `process.env`
 * and never re-parses the override itself — `Wlt1Config` is the single source of truth.
 *
 * L1 remediation (Phase 2C-C1): the temporal-validation block below now requires an EXPLICIT
 * UTC offset (`Z` or `+HH:MM`/`-HH:MM`) on `issuedAtUtc`/`validUntilUtc` BEFORE any `Date`
 * construction is attempted — `new Date(...)`/`Date.parse` alone are too permissive (they silently
 * reinterpret a timezone-naive string like `"2026-08-11T10:00:00"` using the SERVER's local
 * timezone, which is exactly the ambiguity a field literally named `...Utc` must never have). This
 * is a WLT-LOCAL screening-result persistence contract — not a SEC-01/platform-wide change; no
 * other module's timestamp handling is touched. A syntactically valid offset is then parsed and
 * MUST still describe a real calendar date/time (`2026-13-45T00:00:00Z` fails here, not at the
 * regex stage) — persisted via `.toISOString()`, which normalizes ANY accepted explicit-offset
 * input (`+08:00` or `Z`) to the identical UTC instant, never a server-timezone reinterpretation.
 *
 * P2CA-MED-1 remediation: this function is the ONLY place `wallet_screening_result.
 * source_authenticated`/`payload_hash` are ever written, and it derives both EXCLUSIVELY from the
 * caller-supplied `ScreeningEvidenceEnvelope` — never from `NormalizedScreeningResult`, which
 * carries neither field (see `providers/types.ts`'s own header comment). `synchronous_provider` ->
 * `source_authenticated = NULL`, `payload_hash = NULL` (no external source to authenticate, no
 * receipt body to hash). `provider_receipt` -> `source_authenticated = TRUE` (an unauthenticated
 * receipt never reaches this function at all — authentication is Phase 2C-D's responsibility,
 * performed strictly before this call), `payload_hash` = the caller's own validated-receipt
 * fingerprint. P2CB-MED-2 (`provider_receipt` provenance is currently caller-forgeable) remains
 * OPEN — Phase 2C-C1 does not touch this; it is a hard Phase 2C-D entry gate.
 *
 * P2B-LOW-1 remediation: this function is the sole authoritative one-way `pending -> exactly one
 * terminal state` gate. `wallet_screening_result`'s own column grant permits arbitrary UPDATEs at
 * the SQL level (grants cannot encode a state machine) — this function is what makes the
 * transition actually one-way: it accepts ONLY a row currently `risk_status = 'pending'`, verifies
 * it is still the CURRENT (highest-version) attempt for its destination, and never re-applies a
 * result to an already-terminal row (a second direct call after terminal is a hard rejection, not
 * idempotent success — replay semantics belong to a future outer caller layer, e.g. Phase 2C-D's
 * own receipt-replay handling, never to this function).
 *
 * TRANSACTION OWNERSHIP: this function opens, commits, and rolls back its OWN transaction — no
 * caller may supply an already-open one. Lock order (never inverted, matches
 * `lib/destinations.ts`'s own registration-lock precedent): `wlt1.destination:<destinationId>`
 * advisory lock, THEN `SELECT ... FOR UPDATE` on both the destination and target screening rows.
 * Any provider/HTTP call happens strictly BEFORE this function is invoked, at transaction depth 0
 * — this function itself performs no I/O beyond the database.
 */
import { publishAudit, query, withTransaction, type Sql } from "@aix/foundation";
import { Wlt1Error } from "./errors.js";
import { isSanctionsConsistent, type NormalizedScreeningResult, type RiskCategory, type ScreeningEvidenceEnvelope } from "./providers/types.js";
import type { Wlt1Config } from "../config.js";

/** Fixed module constant, never an environment variable — mirrors `providers/registry.ts`'s own
 * `PROVIDER_CALL_TIMEOUT_MS` precedent. A provider-reported `issuedAtUtc` more than this far in
 * the future is untrustworthy, not merely "a bit early". */
const MAX_PROVIDER_FUTURE_SKEW_SECONDS = 120;

/**
 * L1 — the WLT-LOCAL strict provider-timestamp grammar. RFC-3339-style, with a MANDATORY explicit
 * UTC offset (`Z`, or a numeric `+HH:MM`/`-HH:MM`) — a timezone-naive timestamp (no trailing
 * offset at all) is syntactically rejected here, before `Date` ever sees it. Exported so sibling
 * test files (and the deterministic stub provider's own tests) can assert a generated timestamp
 * against the SAME grammar this function enforces, rather than duplicating the pattern.
 */
export const RFC3339_UTC_OFFSET_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

interface PendingDestinationRow {
  destination_id: string;
  status: string;
  destination_status_version: number;
}

interface PendingScreeningRow {
  screening_result_id: string;
  destination_id: string;
  screening_result_version: number;
  provider_id: string;
  provider_adaptor_version: string;
  risk_status: string;
}

export interface ApplyNormalizedScreeningResultInput {
  destinationId: string;
  screeningResultId: string;
  result: NormalizedScreeningResult;
  evidence: ScreeningEvidenceEnvelope;
}

export interface ApplyNormalizedScreeningResultOutput {
  destinationId: string;
  screeningResultId: string;
  screeningResultVersion: number;
  riskStatus: NormalizedScreeningResult["riskStatus"];
  destinationStatus: "pending_review";
  destinationStatusVersion: number;
  validUntilUtc: string;
}

export interface ScreeningApplicationService {
  applyNormalizedScreeningResult(input: ApplyNormalizedScreeningResultInput): Promise<ApplyNormalizedScreeningResultOutput>;
}

/** Derives the persisted `source_authenticated`/`payload_hash` pair from the evidence envelope —
 * the ONLY place either value is computed. `FALSE` is never produced: an unauthenticated receipt
 * must never reach this function (Phase 2C-D's own responsibility, enforced before this call).
 * Phase 2C-D1 (P2CB-MED-2 remediation): `sourceAuthenticated = true` is derived from the mere
 * PRESENCE of a `provider_receipt` envelope's `provenance` field — never a separate boolean this
 * function reads off the envelope — and that field can only ever be a real
 * `AuthenticatedReceiptProvenance`, which nothing outside the receipt-ingress route can construct
 * (see `providers/types.ts`'s own header comment for the full unforgeability mechanism). */
function deriveSourceEvidence(evidence: ScreeningEvidenceEnvelope): { sourceAuthenticated: boolean | null; payloadHash: string | null } {
  if (evidence.sourceKind === "synchronous_provider") {
    return { sourceAuthenticated: null, payloadHash: null };
  }
  return { sourceAuthenticated: true, payloadHash: evidence.provenance.payloadHash };
}

/** `effectiveValidUntil = min(providerValidUntil ?? +Infinity, issuedAtUtc + ceilingHours)`. The
 * DB stores this EFFECTIVE value — never the unconstrained provider expiry — clipping a
 * far-future provider expiry rather than rejecting it. */
function computeEffectiveValidUntil(issuedAtUtc: Date, providerValidUntil: Date | null, ceilingHours: number): Date {
  const localCeiling = new Date(issuedAtUtc.getTime() + ceilingHours * 60 * 60 * 1000);
  if (providerValidUntil === null) return localCeiling;
  return providerValidUntil.getTime() < localCeiling.getTime() ? providerValidUntil : localCeiling;
}

function invalidResult(issue: string): never {
  throw new Wlt1Error("WLT1_VENDOR_RESULT_INVALID", { details: [{ issue }] });
}

function invalidState(issue: string): never {
  throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE", { details: [{ issue }] });
}

/**
 * L1 — parses a provider timestamp under the strict grammar. Syntax is checked FIRST (a
 * timezone-naive/local-text/no-offset string fails here, with a `_syntax_invalid` reason, never
 * reaching `Date` at all); only a syntactically valid explicit-offset string is then handed to
 * `Date`, which still independently rejects an impossible calendar value (e.g.
 * `2026-13-45T00:00:00Z`) with a `_unparseable` reason — the same reason code Phase 2C-B already
 * used, so no accepted negative-path test wording changes.
 */
function parseStrictUtcTimestamp(raw: string, fieldIssuePrefix: string): Date {
  if (!RFC3339_UTC_OFFSET_PATTERN.test(raw)) {
    invalidResult(`${fieldIssuePrefix}_syntax_invalid`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    invalidResult(`${fieldIssuePrefix}_unparseable`);
  }
  return parsed;
}

async function acquireDestinationLock(client: Sql, destinationId: string): Promise<void> {
  await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);
}

/**
 * Phase 2C-D3A (Part Q option A — no behavior change to the synchronous path): the pure temporal +
 * sanctions-consistency validation ALL normalized results must pass, extracted from what was
 * previously inlined directly inside `applyNormalizedScreeningResultInternal` — same checks, same
 * order, same `Wlt1Error`/reason-code shape, byte-for-byte. Exported so `routes/provider-receipt.ts`
 * (Phase 2C-D3A's own receipt-normalization pipeline) can apply the IDENTICAL rule set a receipt's
 * normalized result must satisfy BEFORE it is even eligible for a future terminal application —
 * never a second, independently-drifting rule set. `now` is an explicit parameter (never `new
 * Date()` read internally) so this function is itself pure/deterministic and trivially testable;
 * `applyNormalizedScreeningResultInternal` below passes its own freshly-read `new Date()`, exactly
 * as it always has. Throws `Wlt1Error("WLT1_VENDOR_RESULT_INVALID", ...)` on any failure — the
 * SAME error shape every caller of this function already expects.
 */
export function validateNormalizedScreeningResult(
  result: NormalizedScreeningResult,
  screeningMaxValidityHours: number,
  now: Date,
): { issuedAt: Date; providerValidUntil: Date | null; effectiveValidUntil: Date } {
  const issuedAt = parseStrictUtcTimestamp(result.issuedAtUtc, "issued_at_utc");
  if (issuedAt.getTime() > now.getTime() + MAX_PROVIDER_FUTURE_SKEW_SECONDS * 1000) invalidResult("issued_at_utc_excessively_future");

  let providerValidUntil: Date | null = null;
  if (result.validUntilUtc !== null) {
    providerValidUntil = parseStrictUtcTimestamp(result.validUntilUtc, "valid_until_utc");
    if (providerValidUntil.getTime() <= issuedAt.getTime()) invalidResult("valid_until_utc_not_after_issued_at_utc");
  }
  const effectiveValidUntil = computeEffectiveValidUntil(issuedAt, providerValidUntil, screeningMaxValidityHours);
  if (effectiveValidUntil.getTime() <= now.getTime()) invalidResult("effective_valid_until_already_expired");

  // Defensive re-check (Gate 2C-A already enforces this at provider-result construction time, but
  // this function is the true persistence authority and must not trust an upstream caller) — a
  // future non-stub caller could hand-construct a result bypassing the stub's own construction path.
  if (!isSanctionsConsistent(result)) invalidResult("sanctions_exposure_inconsistent");

  return { issuedAt, providerValidUntil, effectiveValidUntil };
}

/**
 * The private persistence core — never exported. The ONLY way to reach this function is through
 * `createScreeningApplication(...).applyNormalizedScreeningResult(...)`, which supplies
 * `screeningMaxValidityHours` from a validated `Wlt1Config` by closure. No exported production
 * caller may choose the validity ceiling directly (P2CB-MED-1).
 */
async function applyNormalizedScreeningResultInternal(
  screeningMaxValidityHours: number,
  input: ApplyNormalizedScreeningResultInput,
): Promise<ApplyNormalizedScreeningResultOutput> {
  const { destinationId, screeningResultId, result, evidence } = input;

  // ---------------------------------------------------------------------------------------------
  // Temporal validation happens BEFORE the transaction opens — pure computation, no reason to hold
  // any lock while parsing timestamps.
  // ---------------------------------------------------------------------------------------------
  const now = new Date();
  const { issuedAt, effectiveValidUntil } = validateNormalizedScreeningResult(result, screeningMaxValidityHours, now);

  const { sourceAuthenticated, payloadHash } = deriveSourceEvidence(evidence);

  return withTransaction(async (client) => {
    await acquireDestinationLock(client, destinationId);

    const destinationRows = await query<PendingDestinationRow>(
      client,
      `SELECT destination_id, status, destination_status_version FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`,
      [destinationId],
    );
    const destination = destinationRows[0];
    if (!destination) {
      throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
    }

    const screeningRows = await query<PendingScreeningRow>(
      client,
      `SELECT screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, risk_status
         FROM wlt1.wallet_screening_result WHERE screening_result_id = $1 FOR UPDATE`,
      [screeningResultId],
    );
    const screening = screeningRows[0];
    if (!screening) invalidState("screening_result_not_found");
    if (screening.destination_id !== destinationId) invalidState("screening_result_destination_mismatch");
    if (destination.status !== "pending_screening") invalidState("destination_not_pending_screening");
    // P2B-LOW-1: the one-way gate — only a genuinely pending row may be terminally applied. A
    // second application against an already-terminal row, or against `revoked`/`draft`, is
    // rejected here, never silently treated as idempotent success.
    if (screening.risk_status !== "pending") invalidState("screening_result_not_pending");

    const currentVersionRows = await query<{ max_version: number }>(
      client,
      `SELECT COALESCE(MAX(screening_result_version), 0) AS max_version FROM wlt1.wallet_screening_result WHERE destination_id = $1`,
      [destinationId],
    );
    if (Number(currentVersionRows[0]?.max_version ?? 0) !== screening.screening_result_version) {
      invalidState("screening_result_superseded_by_newer_version");
    }

    // Provider binding: loaded from the pending row, never trusted from the result object (which
    // carries no such fields) — the evidence envelope's claimed binding must match the row that was
    // created for THIS provider at initiation time.
    if (screening.provider_id !== evidence.providerId || screening.provider_adaptor_version !== evidence.providerAdaptorVersion) {
      invalidResult("provider_binding_mismatch");
    }

    await query(
      client,
      `UPDATE wlt1.wallet_screening_result
          SET risk_status = $1, risk_score = $2, risk_categories = $3, direct_exposure = $4, indirect_exposure = $5,
              sanctions_exposure = $6, cluster_ref = $7, provider_result_id = $8, source_authenticated = $9,
              payload_hash = $10, issued_at_utc = $11, valid_until_utc = $12, updated_at_utc = now()
        WHERE screening_result_id = $13`,
      [
        result.riskStatus,
        result.riskScore,
        JSON.stringify(result.riskCategories as readonly RiskCategory[]),
        JSON.stringify(result.directExposure),
        JSON.stringify(result.indirectExposure),
        result.sanctionsExposure,
        result.clusterRef,
        result.providerResultId,
        sourceAuthenticated,
        payloadHash,
        issuedAt.toISOString(),
        effectiveValidUntil.toISOString(),
        screeningResultId,
      ],
    );

    const newDestinationStatusVersion = destination.destination_status_version + 1;
    await query(
      client,
      `UPDATE wlt1.destination SET status = 'pending_review', destination_status_version = $1, updated_at_utc = now() WHERE destination_id = $2`,
      [newDestinationStatusVersion, destinationId],
    );

    // Audits — inside the SAME transaction as the two updates above; a publish failure rolls back
    // the whole transaction, leaving the screening row pending and the destination unchanged (no
    // half-applied evidence).
    await publishAudit(client, {
      event_type: "wlt1.wallet_screening_completed",
      source_module: "WLT-01",
      actor_id: "wlt1_internal_service",
      actor_type: "service",
      entity_type: "wallet_screening_result",
      entity_id: screeningResultId,
      metadata: {
        destination_id: destinationId,
        screening_result_id: screeningResultId,
        screening_result_version: screening.screening_result_version,
        risk_status: result.riskStatus,
        provider_id: evidence.providerId,
        valid_until_utc: effectiveValidUntil.toISOString(),
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
        metadata: { destination_id: destinationId, screening_result_id: screeningResultId, risk_status: result.riskStatus },
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
        metadata: { destination_id: destinationId, screening_result_id: screeningResultId, risk_status: result.riskStatus },
      });
    }

    return {
      destinationId,
      screeningResultId,
      screeningResultVersion: screening.screening_result_version,
      riskStatus: result.riskStatus,
      destinationStatus: "pending_review",
      destinationStatusVersion: newDestinationStatusVersion,
      validUntilUtc: effectiveValidUntil.toISOString(),
    };
  });
}

/**
 * P2CB-MED-1 closure — the ONE production entry point for screening-result application. Captures
 * `config.screeningMaxValidityHours` ONCE by closure from a validated `Wlt1Config` (the only
 * producer of one is `config.ts`'s own `loadWlt1Config`, which already fails startup closed on an
 * invalid override) — no caller of the returned service method can supply, override, or bypass
 * this ceiling. Intended to be constructed ONCE at server composition (mirrors how
 * `makeWlt1InternalIdentityGuard(app.config.wlt1InternalServiceToken)` is built once from
 * `app.config` in `routes/wallet-destinations.ts`) and reused across every call.
 */
export function createScreeningApplication(config: Wlt1Config): ScreeningApplicationService {
  const screeningMaxValidityHours = config.screeningMaxValidityHours;
  return {
    applyNormalizedScreeningResult: (input: ApplyNormalizedScreeningResultInput) => applyNormalizedScreeningResultInternal(screeningMaxValidityHours, input),
  };
}
