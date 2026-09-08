/**
 * WLT-01 Phase 2C-C2/2C-C3 — the internal screening-initiation AND resume route.
 *
 * `POST /internal/wlt1/wallet-destinations/:destination_id/screen` is the FIRST reachable caller
 * of `services/wlt1/src/lib/screening-application.ts`'s configured service. This route receives
 * ONLY the already-constructed `ScreeningApplicationService` (`registerScreeningRoutes`'s own
 * `deps` parameter) — never a `Wlt1Config`, never `createScreeningApplication`, never
 * `screeningMaxValidityHours`. `server.ts` is the SOLE production site that constructs the
 * service, once per Fastify app boot, from the app's own validated config (P2CC1-MED-1 closure —
 * see `tests/unit/wlt1-screening-composition-boundary.test.ts` for the committed source guard).
 *
 * ONE ROUTE, TWO LIFECYCLE ENTRY POINTS (Phase 2C-C3 reuses the accepted Phase 2C-C2 route rather
 * than adding `/retry`/`/resume` — the caller cannot know server-side lifecycle state, and a
 * second route would split one idempotency contract across two endpoints):
 *   - `destination.status = draft`            -> C2 INITIATION path (unchanged from Phase 2C-C2):
 *     advisory lock -> destination lookup -> idempotency -> chain-coverage/provider resolution ->
 *     version allocation -> pending row INSERT -> destination transition -> requested audit ->
 *     idempotency completion -> commit -> provider call -> terminal apply or leave pending.
 *   - `destination.status = pending_screening` -> C3 RESUME path (new): the SAME
 *     `screening_result_id`/`screening_result_version` is reused — no INSERT, no version
 *     allocation, no `destination_status_version` increment, no re-emitted
 *     `wlt1.wallet_screening_requested` audit. A durable 30-second compare-and-set claim on the
 *     pending row's own `updated_at_utc` (see `attemptRetryClaim` below) admits at most one
 *     provider invocation per 30-second window across any number of concurrent NEW idempotency
 *     keys; the loser(s) receive a truthful `provider_attempt: "throttled"` 202, never a provider
 *     call. Provider/adaptor identity frozen on the pending row at initiation is treated as
 *     immutable evidence binding for that screening version — if the CURRENT `chain_coverage`
 *     provider identity or the CURRENT registry adaptor version has drifted since initiation, the
 *     resume fails closed (`WLT1_SERVICE_UNAVAILABLE`, no provider call, no state mutation) rather
 *     than silently mixing two provider identities into one screening version's evidence trail.
 *     Recovering a drifted screening requires a future new-version rescreen workflow — explicitly
 *     OUT OF SCOPE for Phase 2C-C3.
 *   - `destination.status = pending_review` or `revoked` -> `WLT1_DESTINATION_INVALID_STATE`
 *     for a NEW key (a same-key replay of either path still rehydrates current truth first, before
 *     this branch is ever reached — see IDEMPOTENCY UNIT below).
 *
 * IDEMPOTENCY UNIT IS "ONE SUBMITTED REQUEST", NOT "ONE PROVIDER OUTCOME": `completeIdempotent`
 * fires inside the transaction, before the provider is ever called — true for BOTH the C2
 * initiation path and the C3 claim path (including the throttled/claim-lost branch, which also
 * completes its key: a throttled key can never later become provider ownership; the caller must
 * submit a NEW key after the cooldown). `beginIdempotent` runs BEFORE the lifecycle branch
 * (deliberately, unchanged since C2) — a same-key replay arriving after the destination has moved
 * to any later state must rehydrate CURRENT truth, never receive `WLT1_DESTINATION_INVALID_STATE`
 * and never re-attempt a claim or a provider call.
 *
 * C2 DEAD-END REMOVED (Phase 2C-C3): a destination stranded in `pending_screening` — provider
 * `unavailable`/`invalid_response`, or a process failure at any point after TX-1 committed — is now
 * recoverable: a NEW `Idempotency-Key` submitted 30+ seconds after the pending row's last claim
 * timestamp reuses the SAME screening row/version and invokes the provider again. The ONLY
 * exceptions (deliberately fail-closed, not a bug) are provider-identity drift and
 * adaptor-version drift since initiation, and an internal data-integrity failure (missing pending
 * row, or a pending row whose chain/network/address_hash no longer correlates with
 * `wallet_destination`) — all three require a future new-version rescreen workflow, not C3.
 *
 * TRANSACTION-DEPTH-0 PROVIDER INVOCATION: the provider is called only after `withTransaction`'s
 * own promise resolves — never inside the advisory lock, never inside a row lock, whether the
 * outcome came from the C2 initiation path or the C3 claim path. Every path through the
 * transaction either returns a plain outcome object or throws; there is no code path that can
 * begin a provider call before COMMIT.
 *
 * COOLDOWN STORAGE (Phase 2C-C3 architecture decision, NOT a schema change): the retry-claim
 * timestamp is `wallet_screening_result.updated_at_utc` itself — already `NOT NULL DEFAULT now()`
 * at INSERT time (so the very first cooldown window starts automatically at initiation) and
 * already covered by `role_wlt1_runtime`'s existing column-scoped UPDATE grant. No migration 053,
 * no new column. This is sound ONLY because the terminal-application UPDATE
 * (`screening-application.ts`) is currently the ONLY other production code path that ever mutates
 * a `wallet_screening_result` row, and it only runs when transitioning a row AWAY from `pending`
 * (after which retry eligibility is moot) — see the committed
 * `tests/unit/wlt1-screening-pending-row-mutation-boundary.test.ts` source guard, which fails
 * loudly the moment a future phase (most plausibly Phase 2C-D's receipt/inbox processing) adds
 * ANY other production UPDATE against this table. If that guard ever trips, `updated_at_utc` can
 * no longer safely double as the retry-claim clock, and a dedicated
 * `last_provider_attempt_at_utc` column (migration 053) becomes mandatory at that time — not
 * before.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  getPool,
  publishAudit,
  query,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
  type Sql,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { fetchActiveChainCoverage } from "../lib/chain-coverage.js";
import { resolveCurrentWalletAnalyticsProvider, screenViaProvider } from "../lib/providers/registry.js";
import type { WalletAnalyticsProvider } from "../lib/providers/types.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";
import type { ScreeningApplicationService } from "../lib/screening-application.js";

const ScreenBody = Type.Object({}, { additionalProperties: false });
const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function newScreeningResultId(): string {
  return "wlt1screen_" + randomUUID();
}

/** Detects migration 050's partial unique index violation
 * (`idx_wlt1_wallet_screening_result_one_pending`) — the DB backstop for a race this route's own
 * `draft`-only guard should already have prevented. Mapped to `WLT1_DESTINATION_INVALID_STATE`
 * (the screening ATTEMPT is duplicated, not the destination identity — `WLT1_DESTINATION_DUPLICATE`
 * would be misleading), mirroring `lib/destinations.ts`'s own `isDuplicateNaturalKeyViolation`
 * precedent for the identical "named partial unique index -> specific error code" pattern. */
function isOnePendingScreeningViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_wlt1_wallet_screening_result_one_pending";
}

/** WLT-local bounded allowlist — a provider's own `reasonCode` is typed `string` (unbounded) and
 * must never be echoed raw into an HTTP response. Every reason the accepted stub actually emits
 * (`stub-provider.ts`) plus `screenViaProvider`'s own timeout/error reasons (`registry.ts`) map to
 * themselves; anything unrecognised (a future real adaptor's own vendor-specific text) collapses
 * to a single generic bounded code — never leaking arbitrary vendor content. */
const KNOWN_PROVIDER_REASON_CODES = new Set([
  "provider_unavailable",
  "provider_timeout",
  "provider_error",
  "no_stub_fixture_configured",
  "provider_malformed_response",
  "unmapped_risk_category",
  "invalid_direct_exposure",
  "invalid_indirect_exposure",
  "sanctions_exposure_inconsistent",
]);
function normalizeReasonCode(raw: string): string {
  return KNOWN_PROVIDER_REASON_CODES.has(raw) ? raw : "provider_error";
}

/** P2CC2-HIGH-1-adjacent (Phase 2C-C3): a route-INTERNAL bounded reason, never a provider output —
 * deliberately kept OUT of `KNOWN_PROVIDER_REASON_CODES`/`normalizeReasonCode`, which exist
 * exclusively to bound a provider's own free-text `reasonCode`. `"throttled"` means "THIS request
 * was denied ownership of the provider-retry claim by the durable 30-second cooldown" — it is
 * never a provider response and must never be confused with one. */
const THROTTLED_REASON_CODE = "retry_cooldown_active";

/** Phase 2C-C3 fixed retry-claim cooldown — a technical anti-amplification window, never a
 * business parameter: no env var, no CFG-01 setting, no caller input, no per-provider override. */
const RETRY_CLAIM_COOLDOWN_SECONDS = 30;

interface DestinationLockRow {
  status: string;
  destination_status_version: number;
}

interface WalletDestinationForScreeningRow {
  chain: string;
  network: string;
  canonical_address: string;
  address_hash: string;
}

async function fetchWalletDestinationForScreening(sql: Sql, destinationId: string): Promise<WalletDestinationForScreeningRow | undefined> {
  const rows = await query<WalletDestinationForScreeningRow>(
    sql,
    `SELECT chain, network, canonical_address, address_hash FROM wlt1.wallet_destination WHERE destination_id = $1`,
    [destinationId],
  );
  return rows[0];
}

/**
 * P2CC2-HIGH-1 remediation — TWO DISTINCT, mutually exclusive 202 response shapes, enforced at
 * compile time (checked by `npx tsc -b --force`, which DOES cover this production file, unlike
 * test files). `provider_attempt`/`reason_code` may be present ONLY when THIS request actually
 * observed a provider outcome directly (the initial-path `unavailable`/`invalid_response` branch)
 * — never fabricated on a same-key replay, which has no truthful source for either field because
 * C2 deliberately persists no provider-attempt disposition. The two builder functions below are
 * the ONLY places a 202 body is constructed — no other code path may assemble one, so the two
 * shapes can never be accidentally merged or partially filled.
 */
interface ScreenPendingObservedBody {
  destination_id: string;
  screening_result_id: string;
  screening_result_version: number;
  destination_status: string;
  risk_status: "pending";
  /** "unavailable"/"invalid_response": THIS request called the provider and observed that
   * outcome directly. "throttled" (Phase 2C-C3): THIS request attempted to obtain the durable
   * retry-claim and was denied by the active cooldown — it never reached the provider at all.
   * `provider_attempt` therefore names the disposition of THIS request's OWN attempt to invoke
   * the provider, not necessarily a provider response. */
  provider_attempt: "unavailable" | "invalid_response" | "throttled";
  reason_code: string;
  retryable: true;
}

interface ScreenPendingUnknownBody {
  destination_id: string;
  screening_result_id: string;
  screening_result_version: number;
  destination_status: string;
  risk_status: "pending";
  retryable: true;
}

/** THIS request directly observed the provider outcome — the only case where `provider_attempt`/
 * `reason_code` may be reported at all. */
function pendingObservedBody(input: {
  destinationId: string;
  screeningResultId: string;
  screeningResultVersion: number;
  providerAttempt: "unavailable" | "invalid_response" | "throttled";
  reasonCode: string;
}): ScreenPendingObservedBody {
  return {
    destination_id: input.destinationId,
    screening_result_id: input.screeningResultId,
    screening_result_version: input.screeningResultVersion,
    destination_status: "pending_screening",
    risk_status: "pending",
    provider_attempt: input.providerAttempt,
    reason_code: input.reasonCode,
    retryable: true,
  };
}

/** No provider outcome is known to THIS request (same-key replay of a still-pending row) — the
 * generic truthful shape. `provider_attempt`/`reason_code` are structurally absent, never
 * fabricated, because the DB does not durably record what actually happened on any prior attempt
 * (C2 deliberately persists no provider-attempt disposition — see the file header). */
function pendingUnknownBody(input: {
  destinationId: string;
  screeningResultId: string;
  screeningResultVersion: number;
  destinationStatus: string;
}): ScreenPendingUnknownBody {
  return {
    destination_id: input.destinationId,
    screening_result_id: input.screeningResultId,
    screening_result_version: input.screeningResultVersion,
    destination_status: input.destinationStatus,
    risk_status: "pending",
    retryable: true,
  };
}

interface ScreeningRouteStateRow {
  screening_result_id: string;
  destination_id: string;
  screening_result_version: number;
  risk_status: string;
  valid_until_utc: string | null;
  destination_status: string;
}

async function fetchScreeningRouteState(sql: Sql, screeningResultId: string): Promise<ScreeningRouteStateRow | undefined> {
  const rows = await query<ScreeningRouteStateRow>(
    sql,
    `SELECT s.screening_result_id, s.destination_id, s.screening_result_version, s.risk_status, s.valid_until_utc,
            d.status AS destination_status
       FROM wlt1.wallet_screening_result s
       JOIN wlt1.destination d ON d.destination_id = s.destination_id
      WHERE s.screening_result_id = $1`,
    [screeningResultId],
  );
  return rows[0];
}

/** The one currently-pending `wallet_screening_result` row for a `pending_screening` destination
 * (Phase 2C-C3 resume path) — loaded `FOR UPDATE`, never chosen by `ORDER BY version DESC LIMIT
 * 1`; the DB's own `idx_wlt1_wallet_screening_result_one_pending` partial unique index guarantees
 * at most one row can ever match `(destination_id, risk_status='pending')`. */
interface PendingScreeningRow {
  screening_result_id: string;
  screening_result_version: number;
  provider_id: string;
  provider_adaptor_version: string;
  chain: string;
  network: string;
  address_hash: string;
}

async function fetchOnePendingScreeningForUpdate(sql: Sql, destinationId: string): Promise<PendingScreeningRow[]> {
  return query<PendingScreeningRow>(
    sql,
    `SELECT screening_result_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash
       FROM wlt1.wallet_screening_result
      WHERE destination_id = $1 AND risk_status = 'pending'
      FOR UPDATE`,
    [destinationId],
  );
}

type Tx1Outcome =
  | { kind: "duplicate"; row: ScreeningRouteStateRow }
  | {
      kind: "created";
      screeningResultId: string;
      screeningResultVersion: number;
      chain: string;
      network: string;
      canonicalAddress: string;
      provider: WalletAnalyticsProvider;
    }
  | {
      /** Phase 2C-C3: a NEW idempotency key against `pending_screening` was denied the retry
       * claim by the durable 30-second cooldown — no provider call was made. */
      kind: "throttled";
      screeningResultId: string;
      screeningResultVersion: number;
      destinationStatus: string;
    };

export interface RegisterScreeningRoutesDeps {
  screeningApplication: ScreeningApplicationService;
}

export async function registerScreeningRoutes(app: FastifyInstance, deps: RegisterScreeningRoutesDeps): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard(app.config.wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/wallet-destinations/:destination_id/screen",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: ScreenBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "wlt1.wallet_destination.screen",
        key: idempotencyKey,
        request: { destination_id },
        sourceModule: "WLT-01",
      };

      let outcome: Tx1Outcome;
      try {
        outcome = await withTransaction(async (client) => {
          // Step 3: advisory lock — same namespace `screening-application.ts` itself takes for
          // terminal application, so initiation and terminal application always serialize.
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destination_id}`]);

          const destRows = await query<DestinationLockRow>(client, `SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`, [
            destination_id,
          ]);
          const destination = destRows[0];
          if (!destination) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");

          // Step 4: idempotency BEFORE the lifecycle-state check — a same-key replay must
          // rehydrate current state even after the destination has moved past `draft`.
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "duplicate") {
            const screeningResultId = idem.resultRef;
            if (!screeningResultId) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent screening replay has no result reference." });
            }
            const row = await fetchScreeningRouteState(client, screeningResultId);
            // Defence-in-depth: never trust result_ref alone across destinations, even though the
            // idempotency fingerprint (which embeds destination_id) already guarantees this.
            if (!row || row.destination_id !== destination_id) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent screening replay target could not be resolved for this destination." });
            }
            return { kind: "duplicate", row };
          }

          // Step 5: lifecycle branch. `draft` -> C2 initiation (unchanged). `pending_screening`
          // -> C3 resume/retry claim (new). Anything else (`pending_review`/`revoked`) -> a NEW
          // key is rejected; a same-key replay never reaches this branch at all (handled above).
          if (destination.status === "draft") {
            const wd = await fetchWalletDestinationForScreening(client, destination_id);
            if (!wd) {
              // A `draft` destination row with no matching wallet_destination row would be a
              // genuine data-integrity defect (registration always inserts both together) — not a
              // caller-triggerable business outcome.
              throw new AppError("INTERNAL_ERROR", { message: "Destination has no associated wallet_destination row." });
            }

            const coverage = await fetchActiveChainCoverage(client, wd.chain, wd.network);
            if (!coverage) throw new Wlt1Error("WLT1_UNSUPPORTED_CHAIN");

            let registryProvider: WalletAnalyticsProvider;
            try {
              registryProvider = resolveCurrentWalletAnalyticsProvider(coverage.provider_id);
            } catch (err) {
              // The chain-coverage row names a provider id absent from the frozen registry — an
              // internal WLT/provider configuration failure, never exposed to the caller. Resolution
              // ALWAYS runs against coverage.provider_id, even when a test implementation is
              // injected below — chain_coverage is never bypassed as the identity source
              // (P2CC2-LOW-2 remediation).
              throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
            }
            // A test-only screeningProviderImpl may replace the CALLABLE implementation and its own
            // adaptorVersion (the adaptor actually used to normalize the result), but NEVER the
            // authoritative providerId — that always comes from chain_coverage via the registry
            // lookup above. The pending row and the terminal-application evidence both read from
            // this SAME resolved `provider` object below, so they can never diverge.
            const testProviderImpl = (app.config as Wlt1Config).screeningProviderImpl;
            const provider: WalletAnalyticsProvider = testProviderImpl
              ? { providerId: registryProvider.providerId, adaptorVersion: testProviderImpl.adaptorVersion, screen: testProviderImpl.screen }
              : registryProvider;

            const versionRows = await query<{ max_version: number }>(
              client,
              `SELECT COALESCE(MAX(screening_result_version), 0) AS max_version FROM wlt1.wallet_screening_result WHERE destination_id = $1`,
              [destination_id],
            );
            const screeningResultVersion = Number(versionRows[0]?.max_version ?? 0) + 1;
            const screeningResultId = newScreeningResultId();

            try {
              await query(
                client,
                `INSERT INTO wlt1.wallet_screening_result
                   (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [screeningResultId, destination_id, screeningResultVersion, provider.providerId, provider.adaptorVersion, wd.chain, wd.network, wd.address_hash],
              );
            } catch (err) {
              if (isOnePendingScreeningViolation(err)) throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE", { cause: err });
              throw err;
            }

            const newDestinationStatusVersion = destination.destination_status_version + 1;
            await query(client, `UPDATE wlt1.destination SET status = 'pending_screening', destination_status_version = $1, updated_at_utc = now() WHERE destination_id = $2`, [
              newDestinationStatusVersion,
              destination_id,
            ]);

            await publishAudit(client, {
              event_type: "wlt1.wallet_screening_requested",
              source_module: "WLT-01",
              actor_id: actorId,
              actor_type: "service",
              entity_type: "wallet_screening_result",
              entity_id: screeningResultId,
              metadata: {
                destination_id,
                screening_result_id: screeningResultId,
                screening_result_version: screeningResultVersion,
                provider_id: provider.providerId,
                chain: wd.chain,
                network: wd.network,
              },
            });

            await completeIdempotent(client, idemScope, screeningResultId);

            return {
              kind: "created",
              screeningResultId,
              screeningResultVersion,
              chain: wd.chain,
              network: wd.network,
              canonicalAddress: wd.canonical_address,
              provider,
            };
          }

          if (destination.status === "pending_screening") {
            // Phase 2C-C3 resume path. Step 6: the ONE pending row, FOR UPDATE — never
            // `ORDER BY version DESC LIMIT 1`. The partial unique index
            // `idx_wlt1_wallet_screening_result_one_pending` guarantees at most one row can ever
            // match; `!== 1` therefore also catches the (structurally impossible, but never
            // silently trusted) zero-row case as the SAME internal-integrity failure.
            const pendingRows = await fetchOnePendingScreeningForUpdate(client, destination_id);
            if (pendingRows.length !== 1) {
              throw new AppError("INTERNAL_ERROR", {
                message: "Destination is pending_screening but does not have exactly one pending screening row.",
              });
            }
            const pending = pendingRows[0]!;

            // Step 7-8: destination-data correlation. `wallet_destination` carries no UPDATE grant
            // (identity edits are revoke-and-replace only), so divergence from the pending row's
            // own frozen chain/network/address_hash would be a genuine internal-integrity defect,
            // never a caller-triggerable outcome.
            const wd = await fetchWalletDestinationForScreening(client, destination_id);
            if (!wd) {
              throw new AppError("INTERNAL_ERROR", { message: "Destination has no associated wallet_destination row." });
            }
            if (wd.chain !== pending.chain || wd.network !== pending.network || wd.address_hash !== pending.address_hash) {
              throw new AppError("INTERNAL_ERROR", {
                message: "Pending screening row identity no longer correlates with wallet_destination.",
              });
            }

            // Step 9: current active chain coverage for this chain/network.
            const coverage = await fetchActiveChainCoverage(client, wd.chain, wd.network);
            if (!coverage) throw new Wlt1Error("WLT1_UNSUPPORTED_CHAIN");

            // PROVIDER-IDENTITY DRIFT (fail closed, no provider call, no state mutation): the
            // pending row's `provider_id` is the frozen evidence-binding identity for THIS
            // screening version. If `chain_coverage`'s CURRENT provider has since changed, resuming
            // under the new identity would silently mix two provider identities into one
            // screening version's evidence trail — recovery requires a future new-version rescreen
            // workflow, explicitly out of Phase 2C-C3 scope. Thrown here (before any
            // `completeIdempotent`) so the WHOLE transaction rolls back, mirroring this exact file's
            // own established precedent for `WLT1_SERVICE_UNAVAILABLE`/`WLT1_UNSUPPORTED_CHAIN` in
            // the draft path above — a configuration-class failure, safe to retry fresh with the
            // same key once corrected.
            if (coverage.provider_id !== pending.provider_id) {
              throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
            }

            // Step 10: resolve the callable implementation through the frozen registry — ALWAYS
            // from `coverage.provider_id` (which the check above already proved equals
            // `pending.provider_id`), never bypassed, preserving P2CC2-LOW-2.
            let registryProvider: WalletAnalyticsProvider;
            try {
              registryProvider = resolveCurrentWalletAnalyticsProvider(coverage.provider_id);
            } catch (err) {
              throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
            }
            const testProviderImpl = (app.config as Wlt1Config).screeningProviderImpl;
            const provider: WalletAnalyticsProvider = testProviderImpl
              ? { providerId: registryProvider.providerId, adaptorVersion: testProviderImpl.adaptorVersion, screen: testProviderImpl.screen }
              : registryProvider;

            // Step 11: ADAPTOR-VERSION DRIFT (fail closed, same rationale as identity drift above).
            // The pending row's `provider_adaptor_version` is immutable evidence binding — allowing
            // a drifted adaptor to proceed would spend a real provider call only to be rejected
            // later by `screening-application.ts`'s own `provider_binding_mismatch` guard at apply
            // time (strictly worse: wasted call, same failure). Fail closed BEFORE the provider is
            // ever invoked instead.
            if (provider.adaptorVersion !== pending.provider_adaptor_version) {
              throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
            }

            // Step 12: durable 30-second compare-and-set retry claim. `rowCount === 1` -> this
            // request now OWNS the next provider invocation for this screening row; `rowCount ===
            // 0` -> another request already owns the current window (or the window has not yet
            // opened since the last attempt) -> throttled. Never updates the timestamp on the
            // throttled path. See this file's own header comment for why `updated_at_utc` is sound
            // as this clock today, and the committed
            // `wlt1-screening-pending-row-mutation-boundary.test.ts` guard that keeps it that way.
            const claimRows = await query<{ screening_result_id: string }>(
              client,
              `UPDATE wlt1.wallet_screening_result
                  SET updated_at_utc = now()
                WHERE screening_result_id = $1
                  AND risk_status = 'pending'
                  AND updated_at_utc <= now() - interval '${RETRY_CLAIM_COOLDOWN_SECONDS} seconds'
              RETURNING screening_result_id`,
              [pending.screening_result_id],
            );

            if (claimRows.length === 0) {
              // Step 13B: claim lost -> throttled. Idempotency key COMPLETES regardless (locked
              // design) — this key can never later become provider ownership; the caller must
              // submit a NEW key after the cooldown. No provider call.
              await completeIdempotent(client, idemScope, pending.screening_result_id);
              return {
                kind: "throttled",
                screeningResultId: pending.screening_result_id,
                screeningResultVersion: pending.screening_result_version,
                destinationStatus: destination.status,
              };
            }

            // Step 13A: claim won. SAME screening_result_id/version reused — no INSERT, no version
            // allocation, no `destination_status_version` increment (destination remains
            // `pending_screening`; only terminal application later performs its own accepted
            // transition), no re-emitted `wlt1.wallet_screening_requested` audit (a retry claim is
            // not a compliance decision or lifecycle transition — durable evidence of ownership
            // already exists via the idempotency record and the advanced claim timestamp).
            await completeIdempotent(client, idemScope, pending.screening_result_id);

            return {
              kind: "created",
              screeningResultId: pending.screening_result_id,
              screeningResultVersion: pending.screening_result_version,
              chain: wd.chain,
              network: wd.network,
              canonicalAddress: wd.canonical_address,
              provider,
            };
          }

          // `pending_review` / `revoked`: a NEW key is rejected outright. A same-key replay of
          // either state is already handled by the duplicate-rehydration branch above and never
          // reaches here.
          throw new Wlt1Error("WLT1_DESTINATION_INVALID_STATE");
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        // Anything else reaching here inside an otherwise fully-validated transaction is an
        // unexpected failure — the realistic cause is an audit/outbox write failure (mirrors
        // wallet-destinations.ts's own identical catch-order precedent).
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "duplicate") {
        const row = outcome.row;
        if (row.risk_status === "pending") {
          // P2CC2-HIGH-1: THIS request did not observe any provider outcome — it only rehydrated
          // an existing pending row. No provider_attempt/reason_code may be reported; the DB does
          // not durably know whether the prior attempt was unavailable, invalid_response, still
          // in flight, or never actually reached the provider at all.
          return reply.code(202).send(
            successEnvelope(
              pendingUnknownBody({
                destinationId: destination_id,
                screeningResultId: row.screening_result_id,
                screeningResultVersion: row.screening_result_version,
                destinationStatus: row.destination_status,
              }),
              meta(request),
            ),
          );
        }
        return reply.send(
          successEnvelope(
            {
              destination_id,
              screening_result_id: row.screening_result_id,
              screening_result_version: row.screening_result_version,
              destination_status: row.destination_status,
              risk_status: row.risk_status,
              valid_until_utc: row.valid_until_utc,
            },
            meta(request),
          ),
        );
      }

      if (outcome.kind === "throttled") {
        // Phase 2C-C3: THIS request was denied the retry claim by the durable 30-second cooldown
        // — it never reached the provider. Truthful observed disposition, never a provider
        // response; no provider call occurred and none occurs here either.
        return reply.code(202).send(
          successEnvelope(
            pendingObservedBody({
              destinationId: destination_id,
              screeningResultId: outcome.screeningResultId,
              screeningResultVersion: outcome.screeningResultVersion,
              providerAttempt: "throttled",
              reasonCode: THROTTLED_REASON_CODE,
            }),
            meta(request),
          ),
        );
      }

      // Step 17: provider invocation — STRICTLY outside TX-1, transaction depth 0. Reached by BOTH
      // a fresh C2 initiation (`draft`) and a won C3 retry claim (`pending_screening` resume) —
      // downstream handling (provider call, terminal application, response shape) is identical
      // either way; only the transaction that produced `outcome` differed.
      const providerOutcome = await screenViaProvider(outcome.provider, {
        chain: outcome.chain,
        network: outcome.network,
        canonicalAddress: outcome.canonicalAddress,
        // GAP-1 (Phase 2C-D0): the provider is told exactly WHICH screening attempt this call
        // belongs to, via the server-generated screening_result_id — identical across every C3
        // retry of the SAME row/version (outcome.screeningResultId is unconditionally reused on
        // resume, never re-minted), and distinct for two destinations that happen to share a
        // canonical address, since each has its own screening_result_id. Never client-selected,
        // never derived from the address.
        screeningReferenceId: outcome.screeningResultId,
      });

      if (providerOutcome.kind === "screened") {
        let applied;
        try {
          applied = await deps.screeningApplication.applyNormalizedScreeningResult({
            destinationId: destination_id,
            screeningResultId: outcome.screeningResultId,
            result: providerOutcome.result,
            evidence: { sourceKind: "synchronous_provider", providerId: outcome.provider.providerId, providerAdaptorVersion: outcome.provider.adaptorVersion },
          });
        } catch (err) {
          if (err instanceof Wlt1Error || err instanceof AppError) throw err;
          // TX-1 already committed durably; only the terminal-application transaction failed and
          // rolled back its own mutation. Screening stays pending, destination stays
          // pending_screening — an accepted C2 stranded-pending case, recoverable only by
          // Phase 2C-C3's resume/retry.
          throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
        }
        return reply.code(200).send(
          successEnvelope(
            {
              destination_id,
              screening_result_id: outcome.screeningResultId,
              screening_result_version: applied.screeningResultVersion,
              destination_status: applied.destinationStatus,
              risk_status: applied.riskStatus,
              valid_until_utc: applied.validUntilUtc,
            },
            meta(request),
          ),
        );
      }

      // unavailable / invalid_response — leave pending, never terminally applied, never 422 (the
      // caller cannot repair a provider outage or a malformed vendor response). THIS request
      // directly observed the outcome above, so provider_attempt/reason_code are truthful here.
      return reply.code(202).send(
        successEnvelope(
          pendingObservedBody({
            destinationId: destination_id,
            screeningResultId: outcome.screeningResultId,
            screeningResultVersion: outcome.screeningResultVersion,
            providerAttempt: providerOutcome.kind,
            reasonCode: normalizeReasonCode(providerOutcome.reasonCode),
          }),
          meta(request),
        ),
      );
    },
  );
}
