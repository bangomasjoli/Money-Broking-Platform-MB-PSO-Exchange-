/**
 * WLT-01 Phase 2C-D1/D2/D2R/D3A/D3B — authenticated provider-receipt ingress: `POST
 * /internal/wlt1/provider-results/receipt`.
 *
 * ONE GENERIC ROUTE, NOT PROVIDER-SPECIFIC: no `:provider_id` path parameter — provider identity
 * is established EXCLUSIVELY by `receipt-auth.ts`'s own authentication guard (possession of the
 * per-provider secret the SERVER's own validated config was booted with), never trusted merely
 * because the URL or body says provider X. This route has its OWN dedicated authentication guard
 * (`makeWlt1ProviderReceiptAuthGuard`) — the generic `requireInternal`/`x-internal-service-token`
 * guard every other WLT-01 route uses is NOT sufficient here and is NOT applied to this route,
 * because that guard only proves "some approved AIX-internal caller", never WHICH provider sent
 * this specific receipt.
 *
 * H-D2-1 REMEDIATION (Phase 2C-D2R): this route no longer reads `app.config.providerReceiptSecrets`
 * directly — it receives an already-constructed `Wlt1ProviderReceiptAuthenticator` via
 * `RegisterProviderReceiptRoutesDeps` (mirrors `registerScreeningRoutes`'s own
 * `RegisterScreeningRoutesDeps.screeningApplication` dependency-injection shape exactly). This
 * route file never imports `Wlt1Config`, `loadWlt1Config`, or `createWlt1ProviderReceiptAuthenticator`
 * itself — see `receipt-auth.ts`'s own header comment for the full rationale.
 *
 * TX-A: authenticate, capture/hash the raw receipt bytes, validate the minimum envelope shape,
 * durably record the receipt as `wlt1.vendor_result_inbox` evidence — unchanged since Phase 2C-D1.
 *
 * PHASE 2C-D3A — EXACT-VERSION NORMALIZATION / PERMANENT STALE CLASSIFICATION: for a genuinely
 * fresh, eligible receipt (D2's own replay/conflict classification already final), this route
 * resolves the EXACT historical `(provider_id, provider_adaptor_version)` adaptor the target
 * screening was frozen against (`resolveWalletAnalyticsProviderVersion` — NEVER the current/latest
 * adaptor, never `chain_coverage`), normalizes the receipt's own `result` via that adaptor's
 * OPTIONAL `normalizeReceipt` (pure, local, no I/O — see `providers/types.ts`), and validates the
 * normalized output through the SAME shared `validateNormalizedScreeningResult` the synchronous
 * path uses (`lib/screening-application.ts`, Part Q — never a second, independently-drifting rule
 * set). Three PERMANENT stale conditions (screening already terminal or its destination no longer
 * `pending_screening`, screening superseded by a newer version, or the historical adaptor
 * version/its `normalizeReceipt` unavailable) map to `WLT1_RECEIPT_STALE` (409) — provider
 * redelivery of this EXACT receipt will never recover it; only a future new-version rescreen can.
 * An invalid normalized result (bad shape, unmapped category/risk-status, a `providerResultId`
 * that disagrees with the receipt envelope's own, failed temporal/sanctions-consistency
 * validation) maps to `WLT1_VENDOR_RESULT_INVALID` (422) and transitions the inbox row
 * `received -> rejected` / `invalid_normalized_result`.
 *
 * PHASE 2C-D3B — TERMINAL APPLICATION / received -> processed / TERMINAL-EVIDENCE RECONCILIATION:
 * a receipt that survives every D3A check is no longer left `received` with a temporary subgate
 * response. `reconcileOrApplyReceivedReceipt` is the single shared pipeline both a genuinely fresh
 * `received` row AND an exact-duplicate `received` replay (D2 same-hash) funnel through:
 *
 *   1. Terminal-evidence reconciliation (attempted FIRST, before any normalization): if the target
 *      `wallet_screening_result` is already terminal, this route does NOT assume the receipt caused
 *      it — a synchronous result may have won, a different receipt may have won, or THIS exact
 *      receipt may have won but the process crashed before the inbox row's own `received ->
 *      processed` transition (TX-B/TX-C crash window: `ScreeningApplicationService` runs its own
 *      transaction — TX-B — durably committing the terminal screening/destination/audit; this
 *      route's own separate `received -> processed` inbox transition — TX-C — is a SECOND,
 *      later transaction that can fail to run at all). Reconciliation applies ONLY when ALL FIVE
 *      fields match exactly: `source_authenticated = TRUE`, `payload_hash`, `provider_result_id`,
 *      and `provider_id` on the terminal screening row equal this receipt's own values, AND the
 *      screening row is in fact this receipt's own target. On an exact match, the inbox row is
 *      transitioned `received -> processed` directly — NO re-normalization, NO second call to
 *      `ScreeningApplicationService`, NO second terminal audit — and `200` is returned. A
 *      terminal-but-non-matching screening (synchronous evidence, or a different receipt's
 *      evidence) is NEVER reconciled; it is classified `received -> rejected` /
 *      `screening_not_pending` (or `screening_superseded`), same as any other D3A stale condition.
 *   2. If the screening is still genuinely pending (no reconciliation applies), this route performs
 *      the SAME exact-version normalization D3A already describes above, then calls the EXISTING,
 *      already-constructed `ScreeningApplicationService.applyNormalizedScreeningResult` — the SAME
 *      authority `wallet-screening.ts`'s synchronous path uses (injected via
 *      `RegisterProviderReceiptRoutesDeps.screeningApplication`, constructed exactly once in
 *      `server.ts` per P2CC1-MED-1; this route never constructs a second instance and never imports
 *      `createScreeningApplication`). This route duplicates NONE of that service's own locking,
 *      validation, terminal `wallet_screening_result`/destination mutation, or audit publication.
 *      On success, the inbox row is transitioned `received -> processed` (conditional
 *      `UPDATE ... WHERE processing_status = 'received' RETURNING ...` — L-D3A-1, see below) and
 *      `200 {received: true, applied: true}` is returned.
 *   3. Any unexpected (non-`Wlt1Error`/non-`AppError`) failure from the service — including a
 *      required-audit-publication failure, mirroring `wallet-screening.ts`'s own established
 *      `WLT1_AUDIT_REQUIRED` mapping exactly — leaves the inbox row EXACTLY `received` (its own
 *      transaction never committed) and this route returns `503`. The service's own thrown
 *      `WLT1_DESTINATION_INVALID_STATE` (a stale/superseded race the service's locked re-check
 *      caught) is mapped to receipt semantics — `WLT1_RECEIPT_STALE` (409), never the screen-facing
 *      code — and `WLT1_VENDOR_RESULT_INVALID` is passed through as `422`.
 *
 * Provider redelivery remains LOAD-BEARING even after D3B: there is still no worker and no
 * raw/normalized result persistence (unchanged below), so recovery from a genuine transient
 * failure, an audit-publication failure, or the TX-B/TX-C crash window described above depends
 * entirely on the provider redelivering this exact receipt — which reconciliation (step 1 above)
 * or a fresh normalize-and-apply attempt (step 2) will then resolve idempotently. `503` is now
 * reserved for these genuine failure/crash-recovery cases only — a valid, eligible receipt against
 * a healthy pending screening no longer receives a temporary subgate response.
 *
 * L-D3A-1 (carried into D3B): every `received`-originating terminal transition — both
 * `received -> rejected` and `received -> processed` — uses `transitionInboxFromReceived`, a
 * conditional `UPDATE ... WHERE inbox_id = $1 AND processing_status = 'received' RETURNING ...`.
 * Zero rows updated means another writer already moved the row to a terminal state first; this
 * route re-reads the authoritative current status and responds/reconciles against THAT, and NEVER
 * blindly assumes its own update succeeded or reopens an already-`processed`/`rejected` row.
 *
 * PHASE 2C-D3C — M-D3B-1 CLOSURE (race-produced stale-rejection healing): independent Opus review
 * of Phase 2C-D3B proved a reachable defect in the ordinary case of two genuinely concurrent
 * exact-duplicate deliveries (same provider_result_id/payload_hash/inbox_id — an ordinary webhook
 * timeout-and-retry, never a new architecture): both may pass the unlocked reconciliation precheck
 * (screening still pending), both normalize, then race inside `ScreeningApplicationService`'s own
 * LOCKED gate — the winner commits TX-B; the loser's own locked re-check throws
 * `WLT1_DESTINATION_INVALID_STATE`/`screening_result_not_pending`. Before this remediation that was
 * mapped straight to a PERMANENT `received -> rejected`, producing a durable inconsistency
 * (screening terminal with this receipt's own evidence, inbox permanently rejected) that every
 * future exact-byte replay would replay forever. `isTerminalEvidenceForInbox` (the SAME pure
 * five-field helper the reconciliation branch above already uses) is now also checked in the
 * post-service catch, BEFORE converting to a rejection — if it matches, `resolveMatchingEvidenceOutcome`
 * reconciles to `processed` instead, healing an already-race-rejected row via
 * `healRaceProducedStaleRejection` when necessary (the ONE narrow, DB-predicate-bounded exception
 * to "rejected never reopens" anywhere in this codebase — reachable ONLY for the two race-producible
 * reasons, `screening_not_pending`/`screening_superseded`, and ONLY after evidence match is
 * independently proven). The SAME healing check also covers a genuinely LATER exact-duplicate
 * delivery replaying an already race-rejected row (the route handler's own `duplicate_exact`/
 * `rejected` branch). Evidence that does NOT match THIS inbox's own receipt (a different receipt
 * won, or a synchronous result won) remains permanently stale, exactly as before — this is never a
 * general reopening of arbitrary rejected rows.
 *
 * D3C's full deterministic race-barrier suite (receipt-vs-synchronous both directions, receipt-vs-
 * C3-claim both directions, two-different-provider_result_id-same-screening arbitration) proves this
 * route's existing serialization (the service's own advisory + FOR UPDATE locks) is sufficient for
 * all five frozen races — no new lock domain, no new destination/screening write path, no receipt-
 * specific inbox locking.
 *
 * NO RAW/NORMALIZED RESULT PERSISTENCE (unchanged since D1): the parsed `result` and any normalized
 * value derived from it exist ONLY in this request's own memory — never written to any column,
 * never staged anywhere. `vendor_result_inbox` gained no new column.
 *
 * PHASE 2C-D2 — REPLAY / TAMPER INTEGRITY: durable replay identity is the composite
 * `(provider_id, provider_result_id)` — the pre-existing DB unique index
 * (`idx_wlt1_vendor_result_inbox_replay`, migration 050) remains the sole replay authority; no new
 * migration, no second replay table. On a replay of that key:
 *   - SAME server-computed `payload_hash` as the original row -> EXACT DUPLICATE. Never a second
 *     row, never an overwrite, never an audit. The response mirrors the ORIGINAL row's own
 *     `processing_status` (`received` -> 202, `processed` -> 200, `rejected` -> 202/`received:
 *     false`, matching D1's own bounded non-success shape) — never the freshly-computed
 *     classification of THIS delivery, since the original row is immutable and authoritative.
 *   - DIFFERENT server-computed `payload_hash` -> CONFLICT (`WLT1_RECEIPT_CONFLICT`, HTTP 409):
 *     content-level tamper evidence, not a harmless retry. The original row is NEVER mutated;
 *     instead exactly one `wlt1.provider_receipt_conflict_detected` audit event is durably recorded,
 *     in the SAME transaction as the detection, before the 409 is returned — an audit-persistence
 *     failure rolls the whole transaction back and surfaces `WLT1_AUDIT_REQUIRED` (the established
 *     L3 pattern; see wallet-destinations.ts / wallet-screening.ts's own identical catch-order
 *     precedent), never a false claim that the conflict was durably recorded.
 * Insertion uses `INSERT ... ON CONFLICT (provider_id, provider_result_id) DO NOTHING RETURNING`
 * rather than a try/catch around a plain INSERT: Postgres itself serializes concurrent inserts of
 * the SAME key (the loser's statement blocks until the winner commits or aborts), so the
 * immediately-following SELECT of the existing row — same transaction, READ COMMITTED's per-
 * statement snapshot — always observes a fully-committed, consistent original row. This gives
 * correct identical/identical and identical/conflicting concurrency behaviour for free, with no
 * application-level locking needed on this route's own hot path (tests use a deliberate advisory-
 * lock barrier only to make the OUTCOME deterministic for assertions, never as a correctness
 * requirement of the production code itself).
 *
 * P2CB-MED-2 / M-D1-1 REMEDIATION (the reason this route exists): before Phase 2C-D1,
 * `ScreeningEvidenceEnvelope`'s `provider_receipt` variant carried a bare `payloadHash: string`
 * field any caller could set to assert unearned authenticity. Phase 2C-D1 closed plain-object
 * forgery with a branded type, but an independent review (M-D1-1) proved the D1 shape — a
 * standalone EXPORTED `mintAuthenticatedReceiptProvenance` factory — was still directly callable
 * by any other production module without authentication. Phase 2C-D2 removed that standalone
 * factory, but a FOLLOW-UP independent review (H-D2-1) proved the D2 shape still had a caller-
 * supplied credential-authority hole: the exported `authenticateProviderReceipt(secrets, ...)`
 * accepted an arbitrary secrets map as an ordinary argument, so any production module could
 * fabricate its own map and still obtain a real, brand-matching capability. Phase 2C-D2R
 * (H-D2-1 remediation) closed this: the ONLY way to obtain the capability is now through a
 * config-BOUND `Wlt1ProviderReceiptAuthenticator`, constructed exactly once in `server.ts` from the
 * server's own validated `Wlt1Config`, and handed to this route via `RegisterProviderReceiptRoutesDeps`
 * — no route file, and no other production file, can construct one itself or supply it a different
 * credential source (see `receipt-auth.ts`'s own header comment for the full rationale, including
 * the honest scope of what this composition-site binding does and does not guarantee). This route
 * is the ONLY place in the codebase that calls `receiptAuth.mintProvenance(...)` (see the committed
 * single-minting-site source guard, `tests/unit/wlt1-receipt-evidence-boundary.test.ts`) — and it
 * only holds `receiptAuth` at all because `receipt-auth.ts`'s own guard has already authenticated
 * the caller against the server-bound authenticator. D1/D2 do not themselves construct an evidence
 * envelope or call the application service (that is D3's job), but the capability this route
 * establishes is what is intended to make D3's future call safe.
 *
 * RAW-BODY CAPTURE (load-bearing for `payload_hash`): a route-scoped `preParsing` hook
 * (`captureRawReceiptBody`) buffers the exact incoming bytes, enforcing the frozen 64 KiB route
 * limit itself (never relying solely on Fastify's own post-hoc `bodyLimit` check) BEFORE handing an
 * equivalent stream back to Fastify's normal JSON body parser — so `request.body` still parses and
 * schema-validates exactly as any other WLT-01 route's body does, while `request.wlt1RawBody` is
 * separately available in the handler for hashing. This is the SOLE reason a WLT-01 route needs a
 * custom content-type-parser mechanism at all; no other route in this service does.
 *
 * PAYLOAD_HASH: SHA-256 over the EXACT raw bytes received (never `JSON.stringify(parsedBody)`,
 * never canonical JSON, never `@aix/foundation`'s own `fingerprint()` — that function canonicalizes
 * JSON, which destroys byte-level tamper evidence, and produces a `"sha256:" + 64hex` = 71-char
 * value that does not fit `vendor_result_inbox.payload_hash varchar(64)`). Stored as 64 lowercase
 * hex characters, no prefix.
 *
 * NO RAW PAYLOAD PERSISTED: the raw body exists only transiently, for hashing and JSON parsing —
 * this route never writes it to any column. `vendor_result_inbox` has no column to put one in, by
 * design (migration 050's own header comment). Data minimization is structural, not a policy this
 * route could accidentally violate.
 *
 * AUTHENTICATED-BUT-INVALID CORRELATION (D1's narrowest possible classification, D3 owns the
 * rest): after authentication succeeds, this route looks up `screening_reference_id` against
 * `wlt1.wallet_screening_result.screening_result_id`. Unknown reference -> durably recorded as
 * `processing_status = 'rejected'`, `rejection_reason_code = 'screening_not_found'`. Known
 * reference bound to a DIFFERENT provider than the one that just authenticated -> `rejected` /
 * `provider_binding_mismatch` (checked against `wallet_screening_result.provider_id` — the
 * screening version's own FROZEN evidence-binding identity — never against the CURRENT
 * `chain_coverage.provider_id`, which is a deliberately different rule from C3's own
 * provider-drift check: a late receipt from the provider that actually owns the pending version
 * must not be rejected merely because chain_coverage has since been repointed elsewhere). Neither
 * case reaches `ScreeningApplicationService` — D1 records evidence only, never applies it.
 */
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, getPool, publishAudit, query, successEnvelope, withTransaction, type Sql } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1ProviderReceiptAuthGuard, type Wlt1ProviderReceiptAuthenticator } from "../plugins/receipt-auth.js";
import { Wlt1Error } from "../lib/errors.js";
import { resolveWalletAnalyticsProviderVersion } from "../lib/providers/registry.js";
import { validateNormalizedScreeningResult } from "../lib/screening-application.js";
import type { ScreeningApplicationService } from "../lib/screening-application.js";
import type {
  ReceiptNormalizationInput,
  ReceiptNormalizationOutcome,
  WalletAnalyticsProvider,
  AuthenticatedReceiptProvenance,
  NormalizedScreeningResult,
} from "../lib/providers/types.js";

/** Fixed route-specific ceiling, never the global Fastify default (1 MiB) — a technical
 * anti-abuse bound for this ingress point specifically, not a business parameter. No env var, no
 * caller override. */
const RECEIPT_BODY_LIMIT_BYTES = 64 * 1024;

/** Route-scoped `preParsing` hook: drains the incoming payload stream into a `Buffer` while
 * enforcing `RECEIPT_BODY_LIMIT_BYTES` itself (destroys the stream and fails closed the moment the
 * running total exceeds the limit — never buffers an unbounded body in memory first and checks
 * after the fact), stores the exact bytes on `request.wlt1RawBody`, and returns an equivalent
 * readable stream so Fastify's own default JSON content-type parser can still run normally
 * afterward. `request.body` and this route's own TypeBox schema validation are therefore entirely
 * unaffected — this hook only intercepts the BYTES, never the parsing/validation behavior. */
async function captureRawReceiptBody(request: FastifyRequest, _reply: FastifyReply, payload: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of payload as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > RECEIPT_BODY_LIMIT_BYTES) {
      // Throwing here inside a `for await...of` loop invokes the async iterator's own `return()`
      // per the JS iteration protocol, which for a Node.js Readable stream properly tears the
      // stream down — no separate explicit destroy call is needed or (per this type) available.
      throw new AppError("VALIDATION_ERROR", {
        details: [{ issue: `request body exceeds the ${RECEIPT_BODY_LIMIT_BYTES}-byte limit for this route` }],
      });
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);
  (request as FastifyRequest & { wlt1RawBody?: Buffer }).wlt1RawBody = rawBody;
  const stream = Readable.from(rawBody);
  // Fastify docs: the returned stream should carry receivedEncodedLength so the framework can
  // correctly match it against the original Content-Length — we reconstruct the identical byte
  // count, so this is always exactly rawBody.length.
  (stream as NodeJS.ReadableStream & { receivedEncodedLength?: number }).receivedEncodedLength = rawBody.length;
  return stream;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set ONLY by captureRawReceiptBody's own preParsing hook — the exact raw bytes this request
     * arrived with, before any JSON parsing. Used exclusively for SHA-256 hashing. */
    wlt1RawBody?: Buffer;
  }
}

/** Frozen minimum receipt body (Phase 2C-D architecture). `additionalProperties: false` — a body
 * attempting `source_authenticated`/`sourceAuthenticated`/`payload_hash`/`payloadHash`/
 * `provider_id`/`providerId`/`provider_adaptor_version`/`providerAdaptorVersion`/`risk_status`/
 * `riskStatus` (or any other field) at the root is rejected outright by TypeBox/Fastify schema
 * validation — none of those are legal request fields; every one of them is a server-owned fact
 * established elsewhere (authentication, hashing, DB lookup), never caller-asserted. `result` is
 * passed through UNTOUCHED and UNPERSISTED in Phase 2C-D1 — this route authenticates and records
 * evidence only; a future receipt adaptor (Phase 2C-D3) normalizes it, never this route. */
const ReceiptBody = Type.Object(
  {
    screening_reference_id: Type.String({ minLength: 1, maxLength: 64 }),
    provider_result_id: Type.String({ minLength: 1, maxLength: 128 }),
    result: Type.Unknown(),
  },
  { additionalProperties: false },
);

/** `provider_result_id` validation beyond TypeBox's own length bound: non-empty (already enforced
 * by `minLength: 1`), printable-ASCII subset only, and — critically for replay-key integrity —
 * leading/trailing whitespace is REJECTED, never silently trimmed, and case is never folded. If
 * ordinary normalization were applied here, two textually-different-but-equivalent-after-trimming
 * values could collide onto (or diverge from) the SAME `(provider_id, provider_result_id)` replay
 * key ambiguously — replay protection must never depend on an implicit normalization decision. */
const PRINTABLE_ASCII_NO_LEADING_TRAILING_WHITESPACE = /^\S(?:[\x20-\x7e]*\S)?$/;

function isValidProviderResultId(value: string): boolean {
  return PRINTABLE_ASCII_NO_LEADING_TRAILING_WHITESPACE.test(value);
}

/** Bounded, server-owned evidence classification a receipt is durably recorded under.
 * `screening_not_found`/`provider_binding_mismatch` are D1's own (both knowable from a plain
 * existence/binding check). Phase 2C-D3A adds three PERMANENT stale-precheck reasons
 * (`screening_not_pending`/`screening_superseded`/`adaptor_version_unavailable` — see this file's
 * own header comment for the exact taxonomy) plus `invalid_normalized_result` (a normalized
 * receipt that fails shape/category/risk-status/cross-check/temporal/sanctions-consistency
 * validation). Never `payload_conflict` (tamper/conflict classification is Phase 2C-D2's own
 * responsibility, and never mutates the inbox at all). */
type ReceiptRejectionReasonCode =
  | "screening_not_found"
  | "provider_binding_mismatch"
  | "screening_not_pending"
  | "screening_superseded"
  | "adaptor_version_unavailable"
  | "invalid_normalized_result";

/** The three D3A-only PERMANENT stale-precheck reasons, plus D2's own bounded reject-vs-stale-vs-
 * invalid HTTP mapping (`classifyRejectionReasonHttp` below) — never re-derived ad hoc at each call
 * site. */
type RejectionHttpClass = "d1_bounded" | "stale" | "invalid";

function classifyRejectionReasonHttp(reasonCode: ReceiptRejectionReasonCode): RejectionHttpClass {
  switch (reasonCode) {
    case "screening_not_found":
    case "provider_binding_mismatch":
      return "d1_bounded";
    case "screening_not_pending":
    case "screening_superseded":
    case "adaptor_version_unavailable":
      return "stale";
    case "invalid_normalized_result":
      return "invalid";
  }
}

interface ScreeningCorrelationRow {
  destination_id: string;
  provider_id: string;
  provider_adaptor_version: string;
  risk_status: string;
  screening_result_version: number;
  destination_status: string;
  max_version: number;
  /** Phase 2C-D3B — terminal-evidence fields, NULL until a terminal application has occurred
   * (`ScreeningApplicationService` is the only writer). Used ONLY by
   * `reconcileOrApplyReceivedReceipt`'s own five-field exact-match check below — D1/D2/D3A never
   * read these three columns. */
  source_authenticated: boolean | null;
  payload_hash: string | null;
  provider_result_id: string | null;
}

/** Extended (Phase 2C-D3A, further extended 2C-D3B) beyond D1's own minimal `destination_id,
 * provider_id` — a single read-only query (no `FOR UPDATE`; this route never locks the screening/
 * destination rows itself, see this file's own header comment) supplies EVERY fact D1's binding
 * check, D3A's own PERMANENT stale prechecks, AND D3B's own terminal-evidence reconciliation need,
 * avoiding extra round trips and any TOCTOU window between separate reads. `max_version` mirrors
 * `applyNormalizedScreeningResultInternal`'s own identical superseded-version check exactly (same
 * query shape, read-only precheck here vs. that function's own authoritative locked check — this is
 * intentionally NOT a shared helper: this is a read-only, race-tolerant precheck/reconciliation
 * read, never the authoritative terminal-application gate, which remains solely
 * `ScreeningApplicationService`'s job). Called twice in D3B's own pipeline: once inside TX-A (D1/D2/
 * D3A classification, unchanged), and once more, freshly, by `reconcileOrApplyReceivedReceipt`
 * AFTER TX-A commits — the second call is what makes reconciliation/recovery race-tolerant, since it
 * never trusts a snapshot taken before the current request began its own post-commit work. */
async function fetchScreeningCorrelation(sql: Sql, screeningReferenceId: string): Promise<ScreeningCorrelationRow | undefined> {
  const rows = await query<ScreeningCorrelationRow>(
    sql,
    `SELECT wsr.destination_id, wsr.provider_id, wsr.provider_adaptor_version, wsr.risk_status,
            wsr.screening_result_version, d.status AS destination_status,
            (SELECT COALESCE(MAX(screening_result_version), 0)::int FROM wlt1.wallet_screening_result WHERE destination_id = wsr.destination_id) AS max_version,
            wsr.source_authenticated, wsr.payload_hash, wsr.provider_result_id
       FROM wlt1.wallet_screening_result wsr
       JOIN wlt1.destination d ON d.destination_id = wsr.destination_id
      WHERE wsr.screening_result_id = $1`,
    [screeningReferenceId],
  );
  return rows[0];
}

/** Phase 2C-D3A classification result for a screening-correlation lookup: either a bounded
 * rejection reason, or — ONLY when the receipt is genuinely eligible (D1 binding passes AND every
 * D3A permanent-stale precheck passes AND an exact-version adaptor with `normalizeReceipt` exists)
 * — `rejectionReasonCode: null`, meaning INSERT-time eligibility. Deliberately NOT named anything
 * implying "eligible to terminally apply" (e.g. `isEligibleToApply`) — this is a read-only precheck
 * result, never transactional application authority; the resolved adaptor itself is intentionally
 * NOT carried out of this function (Phase 2C-D3B's own `reconcileOrApplyReceivedReceipt` always
 * re-resolves it fresh, post-commit, race-tolerantly — see that function's own header comment) —
 * `ScreeningApplicationService` remains the sole authoritative, locked terminal-application gate. */
interface ReceiptClassification {
  destinationId: string | null;
  rejectionReasonCode: ReceiptRejectionReasonCode | null;
}

function classifyPermanentReceiptRejection(target: ScreeningCorrelationRow | undefined, authenticatedProviderId: string): ReceiptClassification {
  if (!target) {
    return { destinationId: null, rejectionReasonCode: "screening_not_found" };
  }
  if (target.provider_id !== authenticatedProviderId) {
    return { destinationId: target.destination_id, rejectionReasonCode: "provider_binding_mismatch" };
  }
  // D3A PERMANENT stale prechecks (Part G) — read-only, race-tolerant: if a concurrent actor
  // terminals/supersedes this screening a moment after this SELECT, that is safely caught later by
  // D3B's own authoritative locked gate; this precheck never claims more authority than a snapshot.
  if (target.risk_status !== "pending" || target.destination_status !== "pending_screening") {
    return { destinationId: target.destination_id, rejectionReasonCode: "screening_not_pending" };
  }
  if (target.screening_result_version !== target.max_version) {
    return { destinationId: target.destination_id, rejectionReasonCode: "screening_superseded" };
  }
  let resolvedProvider: WalletAnalyticsProvider;
  try {
    resolvedProvider = resolveWalletAnalyticsProviderVersion(target.provider_id, target.provider_adaptor_version);
  } catch {
    // Unknown historical (provider_id, provider_adaptor_version) pair — never a current/latest
    // fallback (Part B is load-bearing: this must resolve the EXACT frozen version or fail closed).
    return { destinationId: target.destination_id, rejectionReasonCode: "adaptor_version_unavailable" };
  }
  if (typeof resolvedProvider.normalizeReceipt !== "function") {
    // A known historical adaptor version with NO receipt-normalization capability at all is treated
    // identically to an unresolvable version — no distinction the caller could act on differently.
    return { destinationId: target.destination_id, rejectionReasonCode: "adaptor_version_unavailable" };
  }
  return { destinationId: target.destination_id, rejectionReasonCode: null };
}

/** The three `vendor_result_inbox.processing_status` values a pre-existing row can carry — D2 must
 * correctly classify a replay against any of them (`processed` is future-facing: D2/D3A never
 * CREATE a `processed` row — that remains Phase 2C-D3B's own scope — but must still classify a
 * replay against one correctly if a later phase's fixture produces one). */
type ExistingReceiptStatus = "received" | "processed" | "rejected";

interface ExistingInboxRow {
  inbox_id: string;
  payload_hash: string;
  processing_status: ExistingReceiptStatus;
  rejection_reason_code: ReceiptRejectionReasonCode | null;
  /** Phase 2C-D3B — needed to attempt reconciliation/recovery on a same-hash `received` replay
   * (Part C); D1/D2 never read this column on the replay path (they only ever compared hashes and
   * read `processing_status`). Non-null for any row this route itself ever inserts (a `received` or
   * `rejected` row always has SOME classification result, and D1's own `screening_not_found` case
   * stores `screening_result_id = NULL` — reconciliation is simply skipped for that case, exactly
   * like it already is for any other `rejected` row). */
  screening_result_id: string | null;
}

async function fetchExistingReceipt(sql: Sql, providerId: string, providerResultId: string): Promise<ExistingInboxRow | undefined> {
  const rows = await query<ExistingInboxRow>(
    sql,
    `SELECT inbox_id, payload_hash, processing_status, rejection_reason_code, screening_result_id FROM wlt1.vendor_result_inbox WHERE provider_id = $1 AND provider_result_id = $2`,
    [providerId, providerResultId],
  );
  return rows[0];
}

type Tx1Outcome =
  | { kind: "received"; inboxId: string }
  | { kind: "rejected"; reasonCode: ReceiptRejectionReasonCode }
  | { kind: "duplicate_exact"; inboxId: string; existingStatus: ExistingReceiptStatus; rejectionReasonCode: ReceiptRejectionReasonCode | null; screeningResultId: string | null }
  | { kind: "conflict" };

// ---------------------------------------------------------------------------------------------
// Phase 2C-D3B — terminal application, received->processed lifecycle, terminal-evidence
// reconciliation, TX-B/TX-C crash-window closure. NO new receipt concurrency architecture, NO
// D3C race-hardening matrix — this section handles ordinary races only through the SAME
// mechanisms D2/D3A already established: the service's own existing serialization (advisory +
// FOR UPDATE locks), conditional inbox transitions, and race-tolerant read-only reconciliation.
// ---------------------------------------------------------------------------------------------

/** L-D3A-1 remediation: the ONE place any D3-owned inbox row transitions AWAY from `received`.
 * Uses a conditional `WHERE ... AND processing_status = 'received'` predicate with `RETURNING`,
 * and — critically — NEVER blindly assumes the UPDATE succeeded. A zero-row result means some
 * OTHER actor already transitioned this row first; this function re-reads the row's OWN
 * authoritative current state and reports it back to the caller, which must reconcile against
 * THAT state rather than the transition it originally intended. `processed`/`rejected` never
 * reopen — this predicate structurally cannot ever overwrite either. */
type InboxTransitionResult =
  | { kind: "transitioned" }
  | { kind: "already"; status: ExistingReceiptStatus; rejectionReasonCode: ReceiptRejectionReasonCode | null };

async function transitionInboxFromReceived(
  target: "processed" | "rejected",
  inboxId: string,
  rejectionReasonCode: ReceiptRejectionReasonCode | null,
): Promise<InboxTransitionResult> {
  return withTransaction(async (client): Promise<InboxTransitionResult> => {
    const updated = await query<{ inbox_id: string }>(
      client,
      `UPDATE wlt1.vendor_result_inbox
          SET processing_status = $2, rejection_reason_code = $3, updated_at_utc = now()
        WHERE inbox_id = $1 AND processing_status = 'received'
        RETURNING inbox_id`,
      [inboxId, target, rejectionReasonCode],
    );
    if (updated.length === 1) return { kind: "transitioned" };

    // Zero rows: another actor already moved this row away from `received` (or it never existed,
    // which is structurally unreachable — inbox rows are never deleted by this codebase). Re-read
    // the row's OWN current, authoritative state — never overwrite it, never guess.
    const current = await query<{ processing_status: ExistingReceiptStatus; rejection_reason_code: ReceiptRejectionReasonCode | null }>(
      client,
      `SELECT processing_status, rejection_reason_code FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`,
      [inboxId],
    );
    if (!current[0]) {
      throw new Error(`inbox row ${inboxId} vanished during a terminal transition attempt`);
    }
    return { kind: "already", status: current[0].processing_status, rejectionReasonCode: current[0].rejection_reason_code };
  }).catch((err) => {
    if (err instanceof Wlt1Error || err instanceof AppError) throw err;
    throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
  });
}

/** Maps `ScreeningApplicationService`'s own SCREEN-FACING `WLT1_DESTINATION_INVALID_STATE` reason
 * onto the RECEIPT-facing stale vocabulary — this receipt-ingress API must never leak a
 * `/screen`-route error code to a provider webhook caller (Part F.4). Every one of the service's
 * own `invalidState(...)` reasons collapses onto exactly the two D3A stale reasons already in use;
 * `screening_result_superseded_by_newer_version` is the only one mapping to `screening_superseded`,
 * every other reason (not-found/destination-mismatch/not-pending-screening/not-pending) mapping to
 * `screening_not_pending` — identical collapsing rule D3A's own precheck already uses. */
function mapServiceStaleIssueToReceiptReason(details: ReadonlyArray<{ issue: string }>): "screening_not_pending" | "screening_superseded" {
  return details[0]?.issue === "screening_result_superseded_by_newer_version" ? "screening_superseded" : "screening_not_pending";
}

/** Shared exact-version normalize + validate pipeline — IDENTICAL logic to what Phase 2C-D3A
 * inlines for the fresh-receipt case, extracted so `reconcileOrApplyReceivedReceipt` (the fresh
 * AND the duplicate-recovery paths both funnel through it) never independently re-implements or
 * drifts from it. Returns the validated `NormalizedScreeningResult` on success; on any failure
 * (adaptor-reported invalid, providerResultId cross-check mismatch, or the shared
 * `validateNormalizedScreeningResult` throwing `WLT1_VENDOR_RESULT_INVALID`) returns `undefined` —
 * the caller is responsible for the `received -> rejected` / `invalid_normalized_result`
 * transition, never this function (kept as a pure classification step, no DB access). */
function normalizeAndValidateReceipt(
  provider: WalletAnalyticsProvider,
  rawProviderResult: unknown,
  screeningReferenceId: string,
  providerResultId: string,
  screeningMaxValidityHours: number,
): { result: NormalizedScreeningResult } | undefined {
  const normalizationInput: ReceiptNormalizationInput = { result: rawProviderResult, screeningReferenceId, providerResultId };
  let normalization: ReceiptNormalizationOutcome;
  try {
    normalization = provider.normalizeReceipt!(normalizationInput);
  } catch {
    return undefined;
  }
  if (normalization.kind === "invalid") return undefined;
  // Part D — the normalized result's OWN claimed providerResultId must exactly equal the receipt
  // envelope's provider_result_id. Never allow provider-controlled normalized output to redefine
  // replay identity.
  if (normalization.result.providerResultId !== providerResultId) return undefined;
  try {
    validateNormalizedScreeningResult(normalization.result, screeningMaxValidityHours, new Date());
  } catch (err) {
    if (err instanceof Wlt1Error && err.code === "WLT1_VENDOR_RESULT_INVALID") return undefined;
    throw err;
  }
  return { result: normalization.result };
}

/** Phase 2C-D3B outcome of `reconcileOrApplyReceivedReceipt` — deliberately mirrors
 * `classifyRejectionReasonHttp`'s own three-way HTTP split (`d1_bounded` never applies here, since
 * every rejection reason this function can produce is D3A/D3B-owned). `still_received` is the
 * transient/no-progress case: the inbox row remains exactly `received`, and the caller must return
 * a non-2xx so the provider knows to redeliver (Part T/61 — a 2xx here would be a false claim of
 * completion under an architecture with no worker and no persisted raw/normalized result). */
type ReconciliationOutcome =
  | { kind: "processed" }
  | { kind: "rejected"; reasonCode: ReceiptRejectionReasonCode }
  | { kind: "still_received" };

/** Phase 2C-D3C (M-D3B-1) — the ONE pure five-field terminal-evidence match implementation, used
 * by BOTH the pre-normalization reconciliation branch (top of `reconcileOrApplyReceivedReceipt`)
 * AND the post-service stale-race catch further below — never two subtly different criteria. "This
 * inbox's own receipt" is proven, never inferred from terminal-status alone (Part B, unchanged). */
function isTerminalEvidenceForInbox(
  target: Pick<ScreeningCorrelationRow, "source_authenticated" | "payload_hash" | "provider_result_id" | "provider_id">,
  inbox: { payloadHash: string; providerResultId: string; authenticatedProviderId: string },
): boolean {
  return (
    target.source_authenticated === true &&
    target.payload_hash === inbox.payloadHash &&
    target.provider_result_id === inbox.providerResultId &&
    target.provider_id === inbox.authenticatedProviderId
  );
}

/** Phase 2C-D3C (M-D3B-1) — the ONE narrow, explicitly bounded exception to L-D3A-1's "rejected
 * never reopens" rule. Independent Opus review of Phase 2C-D3B proved a reachable defect: two
 * genuinely concurrent exact-duplicate receipt deliveries (same provider, same provider_result_id,
 * same payload_hash, same inbox_id — an ordinary webhook timeout-and-retry) can both pass this
 * function's own UNLOCKED precheck (screening still pending), both normalize, then race inside
 * `ScreeningApplicationService`'s own LOCKED terminal-application gate: the winner commits TX-B
 * (screening terminal, carrying THIS EXACT receipt's own evidence); the loser's own locked
 * re-check then observes `screening_result_not_pending` and throws — which, before this
 * remediation, this file mapped straight to a PERMANENT `received -> rejected` without ever
 * checking whether the "stale" condition was in fact this receipt's own successful application
 * that simply won the race a moment earlier. That produced a durable, self-perpetuating
 * inconsistency (screening terminal with this receipt's own evidence, inbox permanently
 * `rejected/screening_not_pending`, every future exact-byte replay replaying the false rejection
 * forever).
 *
 * This function is invoked ONLY after the caller has ALREADY independently proven, via
 * `isTerminalEvidenceForInbox`, that persisted terminal evidence exactly matches THIS inbox's own
 * receipt — it never re-derives that proof itself, and it is NEVER reachable for any other
 * rejection reason (`invalid_normalized_result`, `adaptor_version_unavailable`,
 * `screening_not_found`, `provider_binding_mismatch`, or a `screening_not_pending`/
 * `screening_superseded` whose evidence does NOT match this inbox — a genuinely different receipt
 * or a synchronous result won, which remains permanently rejected exactly as before). The UPDATE's
 * own `rejection_reason_code IN (...)` predicate is a second, independent, DB-level bound: even a
 * caller mistake could never heal an unrelated rejection reason. */
async function healRaceProducedStaleRejection(inboxId: string): Promise<InboxTransitionResult> {
  return withTransaction(async (client): Promise<InboxTransitionResult> => {
    const updated = await query<{ inbox_id: string }>(
      client,
      `UPDATE wlt1.vendor_result_inbox
          SET processing_status = 'processed', rejection_reason_code = NULL, updated_at_utc = now()
        WHERE inbox_id = $1
          AND processing_status = 'rejected'
          AND rejection_reason_code IN ('screening_not_pending', 'screening_superseded')
        RETURNING inbox_id`,
      [inboxId],
    );
    if (updated.length === 1) return { kind: "transitioned" };
    const current = await query<{ processing_status: ExistingReceiptStatus; rejection_reason_code: ReceiptRejectionReasonCode | null }>(
      client,
      `SELECT processing_status, rejection_reason_code FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`,
      [inboxId],
    );
    if (!current[0]) {
      throw new Error(`inbox row ${inboxId} vanished during a race-healing transition attempt`);
    }
    return { kind: "already", status: current[0].processing_status, rejectionReasonCode: current[0].rejection_reason_code };
  }).catch((err) => {
    if (err instanceof Wlt1Error || err instanceof AppError) throw err;
    throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
  });
}

/** Phase 2C-D3C (M-D3B-1) — shared outcome resolution for "evidence proves THIS inbox's own
 * receipt already applied", reused by BOTH the pre-normalization reconciliation branch and the
 * post-service stale-race catch below (never two divergent implementations). Attempts the ordinary
 * `received -> processed` transition first (the common case — a fresh reconciliation or a crash-
 * window replay); only reaches for the narrow `healRaceProducedStaleRejection` exception when the
 * row is ALREADY `rejected` under one of the two race-producible reasons. */
async function resolveMatchingEvidenceOutcome(inboxId: string): Promise<ReconciliationOutcome> {
  const transition = await transitionInboxFromReceived("processed", inboxId, null);
  if (transition.kind === "transitioned" || (transition.kind === "already" && transition.status === "processed")) {
    return { kind: "processed" };
  }
  if (transition.kind === "already" && transition.status === "rejected") {
    if (transition.rejectionReasonCode === "screening_not_pending" || transition.rejectionReasonCode === "screening_superseded") {
      const healed = await healRaceProducedStaleRejection(inboxId);
      if (healed.kind === "transitioned" || (healed.kind === "already" && healed.status === "processed")) {
        return { kind: "processed" };
      }
      if (healed.kind === "already") {
        // Healing lost its own race (moved to something else in between) — never invent success.
        return { kind: "rejected", reasonCode: healed.rejectionReasonCode! };
      }
    }
    return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
  }
  return { kind: "still_received" };
}

/**
 * Phase 2C-D3B — the ONE place a `received` inbox row (fresh OR a same-hash duplicate replay) is
 * either reconciled against already-committed terminal evidence, classified as newly-discovered
 * PERMANENT stale, or genuinely terminally applied via the existing, authoritative
 * `ScreeningApplicationService`. Called AFTER TX-A/D2's own classification is already final —
 * never before (Part K: D2 conflict/duplicate classification always precedes this). Performs its
 * OWN fresh, race-tolerant re-read of the target screening/destination state — never trusts a
 * snapshot computed earlier in this request or in an ORIGINAL request that may have run long ago
 * (the duplicate-recovery case). No `FOR UPDATE` of any kind is taken here (Part P) — the only
 * authoritative lock acquisition remains inside `ScreeningApplicationService` itself, unchanged.
 */
async function reconcileOrApplyReceivedReceipt(params: {
  inboxId: string;
  screeningResultId: string;
  authenticatedProviderId: string;
  providerResultId: string;
  payloadHash: string;
  provenance: AuthenticatedReceiptProvenance;
  rawProviderResult: unknown;
  screeningMaxValidityHours: number;
  screeningApplication: ScreeningApplicationService;
}): Promise<ReconciliationOutcome> {
  const target = await fetchScreeningCorrelation(getPool(), params.screeningResultId);
  if (!target) {
    // Structurally unreachable — screening rows are never deleted by this codebase — but this
    // function makes no authority claims beyond what it can prove, so an inconsistent read is
    // treated as transient rather than silently proceeding.
    return { kind: "still_received" };
  }

  if (target.risk_status !== "pending") {
    // TERMINAL — this may be because THIS exact receipt already applied (a TX-B-committed/TX-C-
    // interrupted crash window), a DIFFERENT receipt won, or a synchronous result won. The
    // five-field exact match is the ONLY basis for inferring "this receipt caused it" — no
    // terminal-state-only shortcut (Part B).
    const evidenceMatches = isTerminalEvidenceForInbox(target, {
      payloadHash: params.payloadHash,
      providerResultId: params.providerResultId,
      authenticatedProviderId: params.authenticatedProviderId,
    });

    if (evidenceMatches) {
      // M-D3B-1: this covers BOTH the ordinary TX-B-committed/TX-C-interrupted crash-window replay
      // (row is `received`, transitions cleanly to `processed`) AND a race-produced `rejected` row
      // from a prior concurrent exact-duplicate delivery that lost the terminal-application race —
      // `resolveMatchingEvidenceOutcome`'s own narrow healing exception applies only to the latter.
      return resolveMatchingEvidenceOutcome(params.inboxId);
    }

    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "screening_not_pending");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "screening_not_pending" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }

  // Still nominally `pending` — mirror D3A's own precheck OR-condition exactly (a `pending`
  // screening whose destination has already moved off `pending_screening` is anomalous — both
  // fields only ever change together, inside the SAME ScreeningApplicationService transaction —
  // but this function claims no more authority than a snapshot, so it fails closed identically to
  // D3A rather than attempting evidence reconciliation against a non-terminal row).
  if (target.destination_status !== "pending_screening") {
    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "screening_not_pending");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "screening_not_pending" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }

  if (target.screening_result_version !== target.max_version) {
    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "screening_superseded");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "screening_superseded" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }

  // Genuinely still eligible — resolve the EXACT historical adaptor (never current/latest; Part B
  // is load-bearing here exactly as it is in D3A's own precheck — no re-resolution through the
  // CURRENT provider configuration).
  let resolvedProvider: WalletAnalyticsProvider;
  try {
    resolvedProvider = resolveWalletAnalyticsProviderVersion(target.provider_id, target.provider_adaptor_version);
  } catch {
    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "adaptor_version_unavailable");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "adaptor_version_unavailable" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }
  if (typeof resolvedProvider.normalizeReceipt !== "function") {
    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "adaptor_version_unavailable");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "adaptor_version_unavailable" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }

  const normalized = normalizeAndValidateReceipt(
    resolvedProvider,
    params.rawProviderResult,
    params.screeningResultId,
    params.providerResultId,
    params.screeningMaxValidityHours,
  );
  if (!normalized) {
    const transition = await transitionInboxFromReceived("rejected", params.inboxId, "invalid_normalized_result");
    if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "invalid_normalized_result" };
    if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
    if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
    return { kind: "still_received" };
  }

  // Terminal application — the ONLY authority for locking, pending-only/highest-version/provider-
  // binding revalidation, the terminal wallet_screening_result/destination UPDATEs, and terminal
  // audit publication remains ScreeningApplicationService itself (Part A). No duplicate logic here.
  try {
    await params.screeningApplication.applyNormalizedScreeningResult({
      destinationId: target.destination_id,
      screeningResultId: params.screeningResultId,
      result: normalized.result,
      evidence: {
        sourceKind: "provider_receipt",
        providerId: target.provider_id,
        providerAdaptorVersion: target.provider_adaptor_version,
        provenance: params.provenance,
      },
    });
  } catch (err) {
    if (err instanceof Wlt1Error && err.code === "WLT1_DESTINATION_INVALID_STATE") {
      // The service's own authoritative, LOCKED re-check caught a "not pending"/"superseded"
      // condition this function's own unlocked precheck missed — a genuine race. M-D3B-1: before
      // converting this to a PERMANENT rejection, re-read authoritative terminal evidence and check
      // it against THIS inbox's own values via the SAME pure helper the top-of-function
      // reconciliation branch uses. If it matches, another concurrent execution of THIS SAME
      // receipt simply won the terminal-application race a moment earlier — not a genuinely
      // different/stale condition — and `resolveMatchingEvidenceOutcome` reconciles it to
      // `processed` (healing a race-produced stale rejection if one already exists) with NO
      // re-normalization, NO second service call, NO second terminal audit. Only when evidence does
      // NOT match THIS inbox's own receipt (a different receipt won, or a synchronous result won)
      // is this genuinely stale — never leak the screen-facing code in that case either.
      const postServiceTarget = await fetchScreeningCorrelation(getPool(), params.screeningResultId);
      if (
        postServiceTarget &&
        isTerminalEvidenceForInbox(postServiceTarget, {
          payloadHash: params.payloadHash,
          providerResultId: params.providerResultId,
          authenticatedProviderId: params.authenticatedProviderId,
        })
      ) {
        return resolveMatchingEvidenceOutcome(params.inboxId);
      }
      const reason = mapServiceStaleIssueToReceiptReason(err.details);
      const transition = await transitionInboxFromReceived("rejected", params.inboxId, reason);
      if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: reason };
      if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
      if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
      return { kind: "still_received" };
    }
    if (err instanceof Wlt1Error && err.code === "WLT1_VENDOR_RESULT_INVALID") {
      // Defensive — D3A's own pre-validation above already applies the IDENTICAL shared rules, so
      // this should be unreachable in practice; if the service's own revalidation still disagrees,
      // fail exactly the way an invalid receipt already does.
      const transition = await transitionInboxFromReceived("rejected", params.inboxId, "invalid_normalized_result");
      if (transition.kind === "transitioned") return { kind: "rejected", reasonCode: "invalid_normalized_result" };
      if (transition.kind === "already" && transition.status === "processed") return { kind: "processed" };
      if (transition.kind === "already" && transition.status === "rejected") return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
      return { kind: "still_received" };
    }
    if (err instanceof Wlt1Error || err instanceof AppError) throw err;
    // Unexpected failure (the realistic cause is a required-audit/outbox write failing inside the
    // service's OWN transaction, which already rolled back its terminal mutation — mirrors
    // wallet-screening.ts's own identical catch-order precedent) — the inbox row is left EXACTLY
    // `received`; no transition is attempted. The provider must redeliver.
    return { kind: "still_received" };
  }

  // Application committed. TX-C: received -> processed. If this step itself fails (crash window),
  // the inbox row is left `received` with the screening ALREADY terminal and evidence-matching —
  // exactly the state a later exact-hash replay reconciles via the branch at the top of this
  // function, with zero reapplication and zero second terminal audit.
  const transition = await transitionInboxFromReceived("processed", params.inboxId, null);
  if (transition.kind === "transitioned" || (transition.kind === "already" && transition.status === "processed")) {
    return { kind: "processed" };
  }
  if (transition.kind === "already" && transition.status === "rejected") {
    return { kind: "rejected", reasonCode: transition.rejectionReasonCode! };
  }
  return { kind: "still_received" };
}

export interface RegisterProviderReceiptRoutesDeps {
  receiptAuthenticator: Wlt1ProviderReceiptAuthenticator;
  /** Phase 2C-D3A — the SAME validated `Wlt1Config.screeningMaxValidityHours` ceiling
   * `createScreeningApplication(config)` captures by closure (P2CB-MED-1), threaded to this route
   * so its own `validateNormalizedScreeningResult` call uses the IDENTICAL ceiling the synchronous
   * path uses — never a route-chosen/re-derived value, never a second competing source of truth.
   * `server.ts` passes `config.screeningMaxValidityHours` directly at composition time; this route
   * never imports `Wlt1Config`/`loadWlt1Config` itself (unchanged from D2R). */
  screeningMaxValidityHours: number;
  /** Phase 2C-D3B — the SAME `ScreeningApplicationService` instance `server.ts` constructs exactly
   * once via `createScreeningApplication(config)` (P2CC1-MED-1) and already hands to
   * `registerScreeningRoutes`. This route NEVER constructs its own instance and NEVER imports
   * `createScreeningApplication` (see the committed composition-boundary source guard,
   * `tests/unit/wlt1-screening-composition-boundary.test.ts`) — it only ever calls
   * `.applyNormalizedScreeningResult(...)` on the instance handed to it, exactly the way
   * `wallet-screening.ts`'s own synchronous path does. This is the ONLY terminal-application
   * authority D3B uses; no duplicate lock/validation/audit logic is implemented in this file. */
  screeningApplication: ScreeningApplicationService;
}

export async function registerProviderReceiptRoutes(app: FastifyInstance, deps: RegisterProviderReceiptRoutesDeps): Promise<void> {
  const requireReceiptAuth = makeWlt1ProviderReceiptAuthGuard(deps.receiptAuthenticator);

  app.post(
    "/internal/wlt1/provider-results/receipt",
    {
      preParsing: captureRawReceiptBody,
      bodyLimit: RECEIPT_BODY_LIMIT_BYTES,
      preHandler: requireReceiptAuth,
      schema: { body: ReceiptBody },
    },
    async (request, reply) => {
      // preHandler (requireReceiptAuth) has already run and succeeded, or this handler is never
      // reached — request.wlt1ReceiptAuth is therefore guaranteed set here. M-D1-1: this
      // capability object is the ONLY source of both the authenticated provider identity AND the
      // ability to mint provenance — there is no standalone factory this route (or any other
      // production file) can import instead.
      const receiptAuth = request.wlt1ReceiptAuth!;
      const authenticatedProviderId = receiptAuth.providerId;
      // captureRawReceiptBody's own preParsing hook has already run — the raw bytes are captured
      // before this handler, regardless of auth outcome; but no DB work happens unless auth
      // already succeeded (this handler is unreachable otherwise).
      const rawBody = request.wlt1RawBody as Buffer;
      const { screening_reference_id: screeningReferenceId, provider_result_id: providerResultId, result: rawProviderResult } = request.body as Static<typeof ReceiptBody>;

      if (!isValidProviderResultId(providerResultId)) {
        throw new AppError("VALIDATION_ERROR", {
          details: [{ field: "provider_result_id", issue: "must be printable ASCII with no leading/trailing whitespace" }],
        });
      }

      // Server-computed, over the EXACT raw bytes — never the parsed/re-serialized body, never a
      // caller-supplied value (the request schema above structurally cannot carry one).
      const payloadHash = createHash("sha256").update(rawBody).digest("hex");

      // P2CB-MED-2 / M-D1-1 / H-D2-1: mint provenance via the AUTHENTICATED capability object
      // itself — there is no standalone factory to import instead, and this capability could only
      // have come from `receipt-auth.ts`'s own config-bound authenticator (see that file's header
      // comment for the credential-authority binding this now relies on). This is the single
      // production call site the committed source guard
      // (tests/unit/wlt1-receipt-evidence-boundary.test.ts) locks down. D2 does not yet hand this
      // to ScreeningApplicationService (that is Phase 2C-D3's own responsibility, once
      // normalization exists) — minting it now proves the capability is genuinely live and
      // authentication-gated end to end, not merely defined and unused.
      const provenance = receiptAuth.mintProvenance(payloadHash);

      const outcome = await withTransaction(async (client): Promise<Tx1Outcome> => {
        const target = await fetchScreeningCorrelation(client, screeningReferenceId);
        const classification = classifyPermanentReceiptRejection(target, authenticatedProviderId);
        const { destinationId, rejectionReasonCode } = classification;

        const inboxId = "wlt1inbox_" + randomUUID();
        const processingStatus = rejectionReasonCode === null ? "received" : "rejected";

        // ON CONFLICT DO NOTHING, never DO UPDATE — immutable evidence is never overwritten. A
        // returned row means this delivery was genuinely new; no row returned means
        // (provider_id, provider_result_id) already exists and must be classified below.
        const inserted = await query<{ inbox_id: string }>(
          client,
          `INSERT INTO wlt1.vendor_result_inbox
             (inbox_id, provider_id, provider_result_id, destination_id, screening_result_id, result_type,
              payload_hash, source_authenticated, processing_status, rejection_reason_code, received_at_utc)
           VALUES ($1, $2, $3, $4, $5, 'wallet_screening', $6, true, $7, $8, now())
           ON CONFLICT (provider_id, provider_result_id) DO NOTHING
           RETURNING inbox_id`,
          [inboxId, authenticatedProviderId, providerResultId, destinationId, target ? screeningReferenceId : null, provenance.payloadHash, processingStatus, rejectionReasonCode],
        );

        if (inserted.length === 1) {
          if (rejectionReasonCode !== null) {
            return { kind: "rejected", reasonCode: rejectionReasonCode };
          }
          // Eligible fresh receipt — D2 conflict/duplicate classification (this whole function)
          // has already run to completion; normalization (Phase 2C-D3A) happens strictly AFTER
          // this transaction commits (Part 37/70/73: pure/local, no DB access, never before D2's
          // own replay/conflict classification is final).
          return { kind: "received", inboxId: inserted[0]!.inbox_id };
        }

        // Replay of an existing (provider_id, provider_result_id) — read the ORIGINAL row, scoped
        // to the AUTHENTICATED provider_id only (never a different provider's row can be reached
        // here, since the replay key itself is provider-scoped). Postgres blocks this statement's
        // own INSERT above until any concurrently-inserting transaction for the SAME key commits
        // or aborts, so this SELECT — same transaction, READ COMMITTED's per-statement snapshot —
        // always observes a fully-committed, consistent original row.
        const existing = await fetchExistingReceipt(client, authenticatedProviderId, providerResultId);
        if (!existing) {
          // vendor_result_inbox rows are never deleted by this codebase — a row that conflicted a
          // moment ago must still exist. Treated as an unexpected failure (mapped to
          // WLT1_AUDIT_REQUIRED below) rather than silently proceeding on an inconsistent read.
          throw new Error("provider receipt replay row vanished between INSERT ON CONFLICT and SELECT");
        }

        if (existing.payload_hash === provenance.payloadHash) {
          // Exact duplicate: identical authenticated provider_id + provider_result_id + server-
          // computed payload_hash. Never a tamper conflict, never a second row, never an audit —
          // the ORIGINAL row's own processing_status/rejection_reason_code govern the response,
          // never this delivery's freshly (re)computed classification. Phase 2C-D3A does NOT
          // re-normalize/re-evaluate a duplicate `received` row (that is Phase 2C-D3B's own
          // crash-recovery scope) — the response is built purely from the stored row below.
          return {
            kind: "duplicate_exact",
            inboxId: existing.inbox_id,
            existingStatus: existing.processing_status,
            rejectionReasonCode: existing.rejection_reason_code,
            screeningResultId: existing.screening_result_id,
          };
        }

        // Conflicting duplicate: same replay key, DIFFERENT server-computed payload_hash — genuine
        // content-level tamper evidence, not a harmless retry (this also naturally covers a
        // resubmission with the SAME provider_result_id but a different screening_reference_id or
        // differently-formatted-but-semantically-equivalent JSON body, since screening_reference_id
        // and the raw JSON bytes are both part of what payload_hash is computed over — hash
        // identity is authoritative, never a correlation field). The original row is NEVER
        // mutated. Persisted here, in the SAME transaction as detection — an audit-persistence
        // failure throws, rolling back this entire transaction (including the no-op INSERT
        // attempt above), and is mapped to WLT1_AUDIT_REQUIRED by the catch below, never a false
        // claim that the conflict was durably recorded. D3A does NOT run normalizeReceipt before
        // this classification — conflict detection strictly precedes normalization (Part K).
        await publishAudit(client, {
          event_type: "wlt1.provider_receipt_conflict_detected",
          source_module: "WLT-01",
          actor_id: `wlt1_provider_receipt:${authenticatedProviderId}`,
          actor_type: "service",
          entity_type: "vendor_result_inbox",
          entity_id: existing.inbox_id,
          metadata: {
            provider_id: authenticatedProviderId,
            provider_result_id: providerResultId,
            inbox_id: existing.inbox_id,
            screening_result_id: target ? screeningReferenceId : null,
            reason: "payload_hash_mismatch",
          },
        });

        return { kind: "conflict" };
      }).catch((err) => {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        // Anything else reaching here inside an otherwise fully-validated transaction is an
        // unexpected failure — the realistic cause is the conflict-audit publish above (mirrors
        // wallet-destinations.ts / wallet-screening.ts's own identical catch-order precedent).
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      });

      if (outcome.kind === "conflict") {
        // The audit is already durably committed at this point (the transaction above only
        // returns this kind after publishAudit succeeded) — this throw is purely to produce the
        // 409 response; it does not, and must not, undo anything.
        throw new Wlt1Error("WLT1_RECEIPT_CONFLICT");
      }

      if (outcome.kind === "rejected") {
        const httpClass = classifyRejectionReasonHttp(outcome.reasonCode);
        if (httpClass === "d1_bounded") {
          // D1's own bounded non-success shape, unchanged (Part W).
          return reply.code(202).send(successEnvelope({ received: false }, meta(request)));
        }
        // httpClass === "stale" — a fresh TX-A insert never produces "invalid" (that reason is
        // only ever set by the POST-commit normalization stage below, on an ALREADY-received row).
        throw new Wlt1Error("WLT1_RECEIPT_STALE");
      }

      // Minimal, conservative response body — no risk/customer/screening detail of any kind, and
      // never a hint of the ORIGINAL row's own hash/status/destination/client for a duplicate.
      if (outcome.kind === "duplicate_exact") {
        if (outcome.existingStatus === "processed") {
          // D2's own pre-existing idempotent-already-processed shape — UNCHANGED (Part J): no
          // normalization, no application, no audit, no state change.
          return reply.code(200).send(successEnvelope({ received: true }, meta(request)));
        }
        if (outcome.existingStatus === "received") {
          // Phase 2C-D3B (Part C) — D2's own prior behavior here was "202, no application"; D3B
          // intentionally supersedes that for a same-hash `received` duplicate: attempt
          // reconciliation-or-application via the EXACT same pipeline a fresh receipt uses. This is
          // precisely how D3B closes TX-B-committed/TX-C-interrupted crash recovery — the provider's
          // own retry IS the recovery mechanism (no worker, no persisted normalized result).
          if (outcome.screeningResultId === null) {
            // Structurally unreachable for a `received` row (only D1's `screening_not_found`
            // rejection ever stores a NULL screening_result_id, and that is never `received`) —
            // defensive fail-closed transient rather than a silent skip.
            throw new Wlt1Error("WLT1_AUDIT_REQUIRED");
          }
          const reconciliation = await reconcileOrApplyReceivedReceipt({
            inboxId: outcome.inboxId,
            screeningResultId: outcome.screeningResultId,
            authenticatedProviderId,
            providerResultId,
            payloadHash: provenance.payloadHash,
            provenance,
            rawProviderResult,
            screeningMaxValidityHours: deps.screeningMaxValidityHours,
            screeningApplication: deps.screeningApplication,
          });
          if (reconciliation.kind === "processed") {
            return reply.code(200).send(successEnvelope({ received: true, applied: true }, meta(request)));
          }
          if (reconciliation.kind === "rejected") {
            const httpClass = classifyRejectionReasonHttp(reconciliation.reasonCode);
            if (httpClass === "stale") throw new Wlt1Error("WLT1_RECEIPT_STALE");
            throw new Wlt1Error("WLT1_VENDOR_RESULT_INVALID");
          }
          // still_received — transient; the provider must redeliver (Part 61: never a false 2xx).
          throw new Wlt1Error("WLT1_AUDIT_REQUIRED");
        }
        // "rejected": replay the ORIGINAL bounded classification verbatim from the stored
        // rejection_reason_code — NEVER re-normalize/re-evaluate a rejected row (Part J/I).
        //
        // M-D3B-1 (Phase 2C-D3C): a genuinely LATER exact-duplicate delivery may be replaying a
        // RACE-PRODUCED stale rejection left behind by a PRIOR concurrent exact-duplicate delivery
        // whose own terminal-application attempt lost the race after already reading a
        // now-stale snapshot — never a genuinely different/stale condition. Only the two
        // race-producible reasons are eligible for this narrow check; every other rejection reason
        // replays verbatim below, exactly as D2/D3A/D3B established.
        if (
          (outcome.rejectionReasonCode === "screening_not_pending" || outcome.rejectionReasonCode === "screening_superseded") &&
          outcome.screeningResultId !== null
        ) {
          const target = await fetchScreeningCorrelation(getPool(), outcome.screeningResultId);
          if (
            target &&
            isTerminalEvidenceForInbox(target, { payloadHash: provenance.payloadHash, providerResultId, authenticatedProviderId })
          ) {
            const healed = await resolveMatchingEvidenceOutcome(outcome.inboxId);
            if (healed.kind === "processed") {
              return reply.code(200).send(successEnvelope({ received: true, applied: true }, meta(request)));
            }
            // Evidence matched but the row moved to something else in between (e.g. someone else's
            // healing attempt lost its own race) — fall through to the ordinary replay below,
            // never invent success.
          }
        }
        const httpClass = classifyRejectionReasonHttp(outcome.rejectionReasonCode!);
        if (httpClass === "d1_bounded") {
          return reply.code(202).send(successEnvelope({ received: false }, meta(request)));
        }
        if (httpClass === "stale") {
          throw new Wlt1Error("WLT1_RECEIPT_STALE");
        }
        throw new Wlt1Error("WLT1_VENDOR_RESULT_INVALID");
      }

      // outcome.kind === "received" — a genuinely fresh, eligible receipt. D2's own replay/conflict
      // classification is already final. Phase 2C-D3B: attempt reconciliation (a defensive check —
      // for a genuinely fresh row this will normally find the screening still pending) or terminal
      // application via the SAME shared pipeline the duplicate-recovery path above uses — never a
      // second, independently-drifting implementation.
      const reconciliation = await reconcileOrApplyReceivedReceipt({
        inboxId: outcome.inboxId,
        screeningResultId: screeningReferenceId,
        authenticatedProviderId,
        providerResultId,
        payloadHash: provenance.payloadHash,
        provenance,
        rawProviderResult,
        screeningMaxValidityHours: deps.screeningMaxValidityHours,
        screeningApplication: deps.screeningApplication,
      });
      if (reconciliation.kind === "processed") {
        // Part D — fresh valid receipt terminally applied. Minimal body, no risk/screening/
        // destination/provider detail of any kind.
        return reply.code(200).send(successEnvelope({ received: true, applied: true }, meta(request)));
      }
      if (reconciliation.kind === "rejected") {
        const httpClass = classifyRejectionReasonHttp(reconciliation.reasonCode);
        if (httpClass === "stale") throw new Wlt1Error("WLT1_RECEIPT_STALE");
        throw new Wlt1Error("WLT1_VENDOR_RESULT_INVALID");
      }
      // still_received — transient failure (the realistic cause is a required-audit/outbox write
      // failing inside ScreeningApplicationService's own transaction, which already rolled back its
      // terminal mutation). The inbox row remains EXACTLY `received`; a non-2xx is essential here —
      // see this file's own header comment for the full provider-redelivery-prerequisite rationale.
      throw new Wlt1Error("WLT1_AUDIT_REQUIRED");
    },
  );
}
