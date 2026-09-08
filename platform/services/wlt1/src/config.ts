/**
 * WLT-01 configuration loader.
 *
 * Reuses @aix/foundation's `loadConfig` (fail-closed baseline: ENVIRONMENT/DATABASE_URL/PORT/
 * internal-service-token presence + minimum length) for the shared shape, then layers WLT-01's
 * own internal-identity token on top. `WLT1_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so WLT-01 has exactly ONE interim internal-identity
 * secret for its own `/internal/wlt1/*` routes — mirrors every prior service's own Phase 0
 * decision (services/aml1/src/config.ts, services/clt1/src/config.ts, services/kyc1/src/
 * config.ts, services/cfg1/src/config.ts, services/sec1/src/config.ts, services/iam2/src/
 * config.ts). Own copy, not imported — F3(c).
 *
 * APPROVED PHASE 0 DECISION (interim internal identity, carry-forward, not a new one): this is
 * the SAME interim shared-secret guard pattern every other service in this codebase already
 * carries as a documented, non-blocking carry-forward (IAM-02's own implementation notes §10.4
 * L3; SEC-01's F-5; CFG-01's L1/L2; CLT-01's own config.ts header; AML-01's own config.ts
 * header). No final service-identity model is designed here. This carry-forward will be MORE
 * consequential for WLT-01 than for any prior module once real routes land — a forged
 * `x-internal-service-token` against WLT-01's future `verify-and-consume` route is a direct path
 * to authorising a payout to an unwhitelisted destination, the single highest-value target this
 * codebase's interim identity model will ever protect. Flagged now, not deferred silently — see
 * the Phase 0 planning report §27.
 *
 * Phase 1B addition: `CLT1_BASE_URL` / `CLT1_INTERNAL_SERVICE_TOKEN` — WLT-01's first cross-module
 * HTTP dependency (`lib/clt1-client.ts`), used by the wallet-destination registration route's
 * client-status check (`GET /internal/clt1/clients/:client_id/status`). Named after the
 * DEPENDENCY, not the caller, mirroring every prior module's own convention (e.g. AML-01's own
 * `CLT1_BASE_URL`) — NOT `WLT1_CLT1_*`. No CFG-01/IAM-02/KYC-01/AML-01/SEC-01 base-URL/token field
 * exists yet — D-CFG (WLT-01_IMPLEMENTATION_NOTES.md) explicitly defers CFG-01 feature evaluation
 * past Phase 1B, and no IAM-02 permission check exists this phase either.
 *
 * Phase 2B addition: `WLT1_SCREENING_PROVIDER` — selects the ONE active wallet-analytics provider
 * (`lib/providers/registry.ts`), validated fail-closed against the registry's own known-id set at
 * load time (an unknown id is a startup-time `CONFIGURATION_INVALID`, never a runtime surprise).
 * Defaults to the deterministic stub (`stub-wallet-analytics-v1`) when unset — a dev/test
 * convenience, never a silent production default: `environment === "prod"` with the stub selected
 * ALSO fails closed at load time (mirrors AML-01's own identical `AML1_SCREENING_PROVIDER` guard,
 * structural convention only, never cross-service import). No provider timeout config exists —
 * `lib/providers/registry.ts`'s own `PROVIDER_CALL_TIMEOUT_MS` module constant is the bound, same
 * "module constant, not env var" precedent as this file's own CLT-01 HTTP client. No receipt-token
 * config and no screening-validity config exist yet — both are explicitly deferred to Phase 2C,
 * which introduces their first reachable consumer (no reachable screening/receipt route exists
 * this phase, so nothing would ever read either value). `screeningProviderImpl` is a test-only DI
 * seam (never populated from env) letting a test inject a hand-built `WalletAnalyticsProvider`
 * directly — mirrors `clt1FetchImpl` exactly.
 *
 * Phase 2C-B additions:
 *
 * `WLT1_SCREENING_MAX_VALIDITY_HOURS` — the internal WLT control ceiling
 * `lib/screening-application.ts`'s `applyNormalizedScreeningResult` uses to compute a screening
 * result's EFFECTIVE `valid_until_utc` (`min(providerValidUntil ?? +Infinity, issuedAtUtc +
 * ceiling)`). This is an INTERNAL WLT CONTROL EXTENSION, NOT a Labuan FSA-prescribed duration —
 * the accepted v1.2 blueprint carries `valid_until_utc` but defines no local maximum. Optional,
 * defaults to 720 (30 days) — chosen because Phase 2C ships no rescreening route yet; a shorter
 * ceiling would only push destinations toward re-registration churn with no supported refresh
 * path, which is a worse compliance posture than a defensible 30-day ceiling. A non-integer or
 * out-of-range (1-8760) override fails startup closed, same as every other WLT-01 config problem.
 *
 * Phase 2C-D1 addition — `WLT1_PROVIDER_RECEIPT_SECRETS`:
 *
 * SUPERSEDES the Phase 2C-B `WLT1_PROVIDER_RECEIPT_TOKEN` singular-secret field (removed). A
 * single global receipt secret cannot authenticate WHICH provider sent a receipt — Phase 2C-D's
 * own frozen architecture requires one credential PER provider, so provider identity is
 * established by possession of that provider's own secret, not merely asserted by an
 * `x-wlt1-provider-id` header value alone.
 *
 * FORMAT: a JSON object string, `{"<providerId>": "<secret>", ...}` — the smallest auditable
 * representation available without introducing a new config-file format or a CFG-01 runtime
 * dependency (CFG-01 governs feature flags/licence-lock, not per-provider credential material;
 * pulling it in here would be a real architectural layering violation, not a convenience). Chosen
 * over one `WLT1_PROVIDER_RECEIPT_SECRET_<PROVIDER_ID>`-per-variable convention because provider
 * ids may contain characters (`-`) that do not survive a clean env-var-name transformation, and a
 * single JSON value keeps the whole credential set in one auditable place.
 *
 * VALIDATION (all always enforced when the variable is present, regardless of `environment` —
 * malformed input is a config bug, not an environment-dependent policy choice):
 *   - must parse as JSON; a syntax error fails closed.
 *   - must be a flat object (no arrays, no nesting, no non-string values).
 *   - every key must be a KNOWN provider id (`isKnownWalletAnalyticsProviderId`) — an entry for a
 *     provider this build's registry does not recognise fails closed (mirrors
 *     `WLT1_SCREENING_PROVIDER`'s own known-id check).
 *   - every value must be a non-blank string of at least `PROVIDER_RECEIPT_SECRET_MIN_LENGTH`
 *     characters (a MINIMUM-LENGTH floor only — this does not measure or prove entropy).
 *   - a duplicate top-level key in the RAW JSON text fails closed — `JSON.parse` itself silently
 *     keeps only the last occurrence of a textually-duplicated key (per the JSON spec), which would
 *     let an operator's copy-paste mistake silently discard one provider's real secret; detected
 *     via a raw-text scan (`findDuplicateTopLevelJsonKeys`) BEFORE parsing is trusted.
 *
 * ABSENT is accepted in dev/test (mirrors every other WLT-01 "no reachable consumer yet" field's
 * own optional-until-real-consumer precedent) — the receipt map is simply empty, so every receipt
 * authentication attempt fails closed (a route that exists but can authenticate nothing is still
 * safe). In PRODUCTION, this is NOT latent: the receipt route is always registered once Phase
 * 2C-D1 ships, so `environment === "prod"` REQUIRES a valid entry for the currently-active
 * `screeningProviderId` — mirrors the exact "stub disallowed in prod" precedent this file's own
 * Phase 2B `WLT1_SCREENING_PROVIDER` guard already established. Never logged, audited, or returned
 * in any error message/detail by this loader.
 *
 * Phase 3A-1 additions — `WLT1_POC_CHALLENGE_TTL_MINUTES` / `WLT1_POC_MAX_ATTEMPTS`: no
 * Phase 3A-2/3A-3 challenge-issuance/verify route exists yet, so neither value has a reachable
 * consumer this slice — added now, exactly as `WLT1_SCREENING_MAX_VALIDITY_HOURS` was added ahead
 * of its own first reachable consumer. Both follow that SAME "Option B" fail-closed pattern:
 * absent -> the stated default; present -> must parse as a positive integer within the stated
 * inclusive range, or startup fails closed (`CONFIGURATION_INVALID`) — never a silently-clamped
 * value. Neither involves CFG-01 (per-instance operational tuning, not a feature flag/licence-lock
 * concern CFG-01 governs).
 *
 *   - `WLT1_POC_CHALLENGE_TTL_MINUTES` — how long an issued PoC challenge remains verifiable
 *     before expiring. Default 15, range 5-60.
 *   - `WLT1_POC_MAX_ATTEMPTS` — the maximum number of verification attempts a single challenge
 *     may receive before it is failed. Default 5, range 1-10.
 *
 * Phase 4A-1 additions — destination whitelist lifecycle / maker-checker approval / cooling-off:
 *
 *   - `WLT1_DESTINATION_COOLING_OFF_HOURS` — how long a destination remains in
 *     `approved_pending_cooling` after whitelist approval before it is eligible for lazy promotion
 *     to `active` (performed by the future Phase 4A-2 evaluate-use route, never by this config or
 *     by approve/apply itself). Default 24, range 1-720 (1 hour to 30 days). Same Option-B
 *     fail-closed pattern as every other WLT-01 bounded-integer config: absent -> default; present
 *     -> must parse as a positive integer within range, or startup fails closed
 *     (`CONFIGURATION_INVALID`).
 *   - `IAM2_BASE_URL` / `IAM2_INTERNAL_SERVICE_TOKEN` — WLT-01's first IAM-02 dependency
 *     (`lib/iam2-client.ts`), used by `routes/destination-approval.ts`'s `approve/request`
 *     (baseline `checkPermission`) and `approve/apply` (`verifyDecisionToken`/execute-verify).
 *     Named after the DEPENDENCY, not the caller, mirroring `CLT1_BASE_URL`'s own convention — NOT
 *     `WLT1_IAM2_*`. Both required; missing/blank fails startup closed. Never logged.
 *
 * Phase 4A-2 additions — evaluate-use / opaque decision-token issuance:
 *
 *   - `WLT1_DECISION_TOKEN_TTL_MINUTES` — the WLT-owned ceiling on a decision token's own validity
 *     window. Default 5, range 1-15 (mirrors AML-01 Phase 3E's own accepted decision-TTL
 *     discipline). The token's ACTUAL `expires_at_utc` is
 *     `MIN(issuedAt + this ceiling, aml.valid_until_utc, screening.valid_until_utc)` —
 *     `routes/evaluate-use.ts` never trusts this value alone as the expiry.
 *   - `AML1_BASE_URL` / `AML1_INTERNAL_SERVICE_TOKEN` — WLT-01's first AML-01 dependency
 *     (`lib/aml1-client.ts`), used by `routes/evaluate-use.ts`'s synchronous pre-transaction gate
 *     call. Named after the DEPENDENCY, mirroring `CLT1_BASE_URL`/`IAM2_BASE_URL`'s own convention.
 *     Both required; missing/blank fails startup closed. Never logged.
 *
 * No new CLT-01 config is added this phase — `evaluate-use`'s P-ROSTER consumption
 * (`lib/evaluate-use.ts`) reuses the EXISTING `clt1BaseUrl`/`clt1InternalServiceToken` fields
 * (Phase 1B) unchanged; a second CLT-01 base-URL/token pair would be a duplicate credential for
 * the exact same downstream service.
 *
 * Ongoing Rescreening additions — `lib/rescreening.ts`'s due-selection/batch bound. Same Option-B
 * fail-closed pattern as every other WLT-01 bounded-integer config: absent -> default; present ->
 * must parse as a positive integer within range, or startup fails closed
 * (`CONFIGURATION_INVALID`). No provider-timeout or retry-count config is added — the EXISTING
 * `PROVIDER_CALL_TIMEOUT_MS` module constant (`lib/providers/registry.ts`) remains the sole bound,
 * and there is no in-run retry (a failed candidate is counted and left for the next run).
 *
 *   - `WLT1_RESCREEN_LEAD_TIME_HOURS` — how far ahead of a destination's own `valid_until_utc` a
 *     periodic run treats it as due (`lib/rescreening.ts`'s own due predicate: `valid_until_utc IS
 *     NULL OR valid_until_utc < now() + this*interval '1 hour'`). Default 72, range 1-8760. Reuses
 *     `wallet_screening_result.valid_until_utc` as the sole freshness source of truth — no second,
 *     independently-drifting interval is introduced.
 *   - `WLT1_RESCREEN_BATCH_SIZE_DEFAULT` / `WLT1_RESCREEN_BATCH_SIZE_MAX` — bounded periodic-run
 *     batch size (`effective = min(caller ?? default, max)`), mirroring AML-01 Phase 3C's own
 *     `AML1_MONITORING_BATCH_SIZE_DEFAULT`/`_MAX` precedent, structural convention only, never
 *     cross-service import. Default 50, range 1-1000. Default max 200, range 1-1000.
 *     `rescreenBatchSizeDefault` must not exceed `rescreenBatchSizeMax`, or startup fails closed —
 *     same cross-validation AML-01's own config loader already applies to its identical pair.
 *
 * FIAT PAYOUT DESTINATIONS (APAC) additions — exactly +6 config fields:
 *
 *   - `WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS` — internal WLT control ceiling for fiat screening
 *     effective validity, mirrors `WLT1_SCREENING_MAX_VALIDITY_HOURS`'s own Option-B pattern.
 *     Default 720, range 1-8760.
 *   - `WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS` — internal WLT control ceiling for
 *     beneficiary-verification effective validity. Default 8760 (1 year — a bank account's own
 *     name-match verification is far more durable than a sanctions screen), range 24-17520.
 *   - `WLT1_FIAT_ENC_KEY` — the Placeholder-KMS passphrase `lib/fiat/encryption.ts`'s own
 *     domain-separated KDF derives the AES-256-GCM key from. ALWAYS required (not merely in
 *     prod) — mirrors every other required shared-secret field in this file
 *     (`wlt1InternalServiceToken`/`clt1InternalServiceToken`/etc.); no dev-only default key is
 *     ever fabricated. Minimum 32 characters. Never logged.
 *   - `WLT1_BENEFICIARY_VERIFICATION_PROVIDER` — selects the ONE active beneficiary-verification
 *     provider (`lib/beneficiary-verification/registry.ts`), validated fail-closed against the
 *     registry's own known-id set at load time. Defaults to the deterministic stub; the stub is
 *     disallowed when `ENVIRONMENT=prod` — same "fail closed at load time" guard
 *     `WLT1_SCREENING_PROVIDER` already established.
 *   - `WLT1_FIAT_SCREENING_PROVIDER` — selects the ONE active fiat-destination-screening provider
 *     (`lib/fiat-screening/registry.ts`). Same defaulting/fail-closed/stub-in-prod discipline as
 *     `WLT1_BENEFICIARY_VERIFICATION_PROVIDER`.
 *   - `WLT1_FIAT_VERIFICATION_REQUIRED` — compliance-posture flag; no reachable runtime consumer
 *     exists yet this phase (approval already unconditionally requires a fresh `verified` result
 *     per the frozen approval gates) — added now, exactly as `WLT1_SCREENING_MAX_VALIDITY_HOURS`
 *     was added ahead of its own first reachable consumer. Default `true`; `ENVIRONMENT=prod`
 *     MUST be `true` (a prod boot with this explicitly set `false` fails closed).
 *
 * EVIDENCE EXPORT addition — exactly ONE config field:
 *
 *   - `WLT1_EVIDENCE_EXPORT_MAX_RECORDS` — the hard TOTAL-record ceiling (summed across every
 *     requested evidence-type array) `lib/evidence-export.ts`'s own bounded collection strategy
 *     enforces during `apply`'s generation transaction — never a silent truncation; exceeding it
 *     fails the whole export closed with `WLT1_EVIDENCE_EXPORT_SCOPE_INVALID`. Same Option-B
 *     fail-closed pattern as every other WLT-01 bounded-integer config: absent -> the stated
 *     default; present -> must parse as a positive integer within the stated inclusive range, or
 *     startup fails closed (`CONFIGURATION_INVALID`). Default 5000, range 1-50000.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";
import { isKnownWalletAnalyticsProviderId } from "./lib/providers/registry.js";
import { STUB_PROVIDER_ID } from "./lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider } from "./lib/providers/types.js";
import { isKnownBeneficiaryVerificationProviderId } from "./lib/beneficiary-verification/registry.js";
import { STUB_PROVIDER_ID as BENEFICIARY_VERIFICATION_STUB_PROVIDER_ID } from "./lib/beneficiary-verification/stub-provider.js";
import { isKnownFiatScreeningProviderId } from "./lib/fiat-screening/registry.js";
import { STUB_PROVIDER_ID as FIAT_SCREENING_STUB_PROVIDER_ID } from "./lib/fiat-screening/stub-provider.js";
import { FIAT_ENC_KEY_MIN_LENGTH } from "./lib/fiat/encryption.js";

export interface Wlt1Config extends AppConfig {
  /** WLT-01's own interim internal-identity shared secret. Never logged. */
  wlt1InternalServiceToken: string;
  /** Base URL of CLT-01's HTTP surface, e.g. "http://localhost:8085". Phase 1B client-status dependency. */
  clt1BaseUrl: string;
  /** Shared secret expected by CLT-01's own internal-identity guard. Never logged. */
  clt1InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/clt1-client.ts (never populated from env) — lets
   * tests stub the CLT-01 HTTP call instead of requiring a live CLT-01 service. Mirrors every
   * prior module's own `clt1FetchImpl`/`iam2FetchImpl` exactly.
   */
  clt1FetchImpl?: typeof fetch;
  /** The ONE active wallet-analytics provider id (`lib/providers/registry.ts`). Validated against
   * the registry's known-id set at load time. */
  screeningProviderId: string;
  /**
   * Test-only dependency-injection seam (never populated from env) — lets a test inject a
   * hand-built `WalletAnalyticsProvider` directly instead of resolving `screeningProviderId`
   * through the registry. Mirrors `clt1FetchImpl` exactly. No Phase 2B route reads this yet.
   */
  screeningProviderImpl?: WalletAnalyticsProvider;
  /** Internal WLT control ceiling for screening-result effective validity, in hours. NOT a Labuan
   * FSA-prescribed duration. See this file's own Phase 2C-B header comment. */
  screeningMaxValidityHours: number;
  /**
   * Phase 2C-D1 — `providerId -> receipt secret`, frozen at boot. Never logged. Consumed
   * exclusively by the receipt-ingress auth guard's `timingSafeEqual` comparison against the
   * `x-wlt1-provider-receipt-token` header, keyed by the claimed `x-wlt1-provider-id`. Empty object
   * (never `undefined` — see `loadWlt1Config` below) when `WLT1_PROVIDER_RECEIPT_SECRETS` is unset,
   * so every downstream lookup is a plain map access with no separate "is this configured at all"
   * branch. See this file's own header comment for the full format/validation rules.
   */
  providerReceiptSecrets: Readonly<Record<string, string>>;
  /** Phase 3A-1 — minutes an issued PoC challenge remains verifiable before expiring. See this
   * file's own Phase 3A-1 header comment for the full Option-B default/range/fail-closed rule. */
  pocChallengeTtlMinutes: number;
  /** Phase 3A-1 — maximum verification attempts a single PoC challenge may receive. See this
   * file's own Phase 3A-1 header comment. */
  pocMaxAttempts: number;
  /** Phase 4A-1 — hours a destination remains `approved_pending_cooling` before it is eligible for
   * lazy promotion to `active`. See this file's own Phase 4A-1 header comment. */
  destinationCoolingOffHours: number;
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 4A-1 whitelist-approval
   * dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) — lets
   * tests stub the IAM-02 HTTP calls instead of requiring a live IAM-02 service. Mirrors
   * `clt1FetchImpl` exactly.
   */
  iam2FetchImpl?: typeof fetch;
  /** Phase 4A-2 — minutes ceiling on a decision token's own validity window. See this file's own
   * Phase 4A-2 header comment for the full expiry-formula rule. */
  decisionTokenTtlMinutes: number;
  /** Base URL of AML-01's HTTP surface, e.g. "http://localhost:8087". Phase 4A-2 pre-transaction
   * gate dependency. */
  aml1BaseUrl: string;
  /** Shared secret expected by AML-01's own internal-identity guard. Never logged. */
  aml1InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/aml1-client.ts (never populated from env) — lets
   * tests stub the AML-01 HTTP call instead of requiring a live AML-01 service. Mirrors
   * `iam2FetchImpl`/`clt1FetchImpl` exactly.
   */
  aml1FetchImpl?: typeof fetch;
  /** Ongoing Rescreening — hours ahead of `valid_until_utc` a periodic run treats a destination as
   * due. See this file's own Ongoing Rescreening header comment. */
  rescreenLeadTimeHours: number;
  /** Ongoing Rescreening — default periodic-run batch size when the caller supplies none. */
  rescreenBatchSizeDefault: number;
  /** Ongoing Rescreening — hard ceiling a caller-supplied `batch_size` is clamped to. */
  rescreenBatchSizeMax: number;
  /** Fiat Payout Destinations (APAC) — internal WLT control ceiling for fiat screening effective
   * validity, in hours. See this file's own Fiat APAC header comment. */
  fiatScreeningMaxValidityHours: number;
  /** Fiat Payout Destinations (APAC) — internal WLT control ceiling for beneficiary-verification
   * effective validity, in hours. */
  beneficiaryVerificationValidityHours: number;
  /** Fiat Payout Destinations (APAC) — Placeholder-KMS passphrase for
   * `lib/fiat/encryption.ts`'s own domain-separated KDF. ALWAYS required. Never logged. */
  fiatEncKey: string;
  /** Fiat Payout Destinations (APAC) — the ONE active beneficiary-verification provider id. */
  beneficiaryVerificationProviderId: string;
  /** Fiat Payout Destinations (APAC) — the ONE active fiat-destination-screening provider id. */
  fiatScreeningProviderId: string;
  /** Fiat Payout Destinations (APAC) — compliance-posture flag; `ENVIRONMENT=prod` MUST be
   * `true`. No reachable runtime consumer yet this phase. */
  fiatVerificationRequired: boolean;
  /** Evidence Export — hard TOTAL-record ceiling (summed across every requested evidence-type
   * array) enforced during generation. See this file's own Evidence Export header comment. */
  evidenceExportMaxRecords: number;
  /** Stuck-Screening Operational Closure — a `pending` wallet screening whose `updated_at_utc` is
   * at least this many seconds old is eligible for operator-driven recovery
   * (`lib/stuck-screening.ts`). Mirrors AML-01's own `AML1_STUCK_SCREENING_THRESHOLD_SECONDS`
   * precedent exactly — default 900, hard floor 300 (below-floor fails startup closed), no upper
   * bound (mirrors AML-01, which has none either). */
  stuckScreeningThresholdSeconds: number;
}

const DEFAULT_SCREENING_MAX_VALIDITY_HOURS = 720;
const SCREENING_MAX_VALIDITY_HOURS_MIN = 1;
const SCREENING_MAX_VALIDITY_HOURS_MAX = 8760;
const PROVIDER_RECEIPT_SECRET_MIN_LENGTH = 32;

const DEFAULT_POC_CHALLENGE_TTL_MINUTES = 15;
const POC_CHALLENGE_TTL_MINUTES_MIN = 5;
const POC_CHALLENGE_TTL_MINUTES_MAX = 60;

const DEFAULT_POC_MAX_ATTEMPTS = 5;
const POC_MAX_ATTEMPTS_MIN = 1;
const POC_MAX_ATTEMPTS_MAX = 10;

const DEFAULT_DESTINATION_COOLING_OFF_HOURS = 24;
const DESTINATION_COOLING_OFF_HOURS_MIN = 1;
const DESTINATION_COOLING_OFF_HOURS_MAX = 720;

const DEFAULT_DECISION_TOKEN_TTL_MINUTES = 5;
const DECISION_TOKEN_TTL_MINUTES_MIN = 1;
const DECISION_TOKEN_TTL_MINUTES_MAX = 15;

const DEFAULT_RESCREEN_LEAD_TIME_HOURS = 72;
const RESCREEN_LEAD_TIME_HOURS_MIN = 1;
const RESCREEN_LEAD_TIME_HOURS_MAX = 8760;

const DEFAULT_RESCREEN_BATCH_SIZE_DEFAULT = 50;
const DEFAULT_RESCREEN_BATCH_SIZE_MAX = 200;
const RESCREEN_BATCH_SIZE_MIN = 1;
const RESCREEN_BATCH_SIZE_MAX_CEILING = 1000;

const DEFAULT_FIAT_SCREENING_MAX_VALIDITY_HOURS = 720;
const FIAT_SCREENING_MAX_VALIDITY_HOURS_MIN = 1;
const FIAT_SCREENING_MAX_VALIDITY_HOURS_MAX = 8760;

const DEFAULT_BENEFICIARY_VERIFICATION_VALIDITY_HOURS = 8760;
const BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MIN = 24;
const BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MAX = 17520;

const DEFAULT_EVIDENCE_EXPORT_MAX_RECORDS = 5000;
const EVIDENCE_EXPORT_MAX_RECORDS_MIN = 1;
const EVIDENCE_EXPORT_MAX_RECORDS_MAX = 50000;

const DEFAULT_STUCK_SCREENING_THRESHOLD_SECONDS = 900;
const STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR = 300;

/** Detects a textually-duplicated top-level JSON object key BEFORE the string is trusted —
 * `JSON.parse` itself silently keeps only the last occurrence of a duplicated key (per the JSON
 * spec), which would let a copy-paste mistake in `WLT1_PROVIDER_RECEIPT_SECRETS` silently discard
 * one provider's real configured secret. A proportionate raw-text scan for THIS narrow, fully
 * flat (no nesting, string values only) config shape — not a general-purpose JSON tokenizer —
 * mirrors this codebase's own established "small dedicated text scan, not a platform-wide parser"
 * precedent (e.g. `wlt1-screening-composition-boundary.test.ts`'s own header comment). Returns the
 * first duplicated key found, or `undefined` if none. */
function findDuplicateTopLevelJsonKey(raw: string): string | undefined {
  const seen = new Set<string>();
  const keyPattern = /"((?:[^"\\]|\\.)*)"\s*:/g;
  for (const match of raw.matchAll(keyPattern)) {
    const key = match[1] as string;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

/** Parses/validates `WLT1_PROVIDER_RECEIPT_SECRETS`. Returns `{ secrets, problems }` — never
 * throws itself, so `loadWlt1Config` can accumulate this alongside every other config problem and
 * report all of them together in one `CONFIGURATION_INVALID` (existing convention below). */
function parseProviderReceiptSecrets(raw: string | undefined, isKnownProviderId: (id: string) => boolean): { secrets: Readonly<Record<string, string>>; problems: string[] } {
  if (raw === undefined || raw.trim() === "") return { secrets: Object.freeze({}), problems: [] };

  const duplicateKey = findDuplicateTopLevelJsonKey(raw);
  if (duplicateKey !== undefined) {
    return { secrets: Object.freeze({}), problems: [`WLT1_PROVIDER_RECEIPT_SECRETS contains a duplicate provider id key: '${duplicateKey}'`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { secrets: Object.freeze({}), problems: ["WLT1_PROVIDER_RECEIPT_SECRETS is not valid JSON"] };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { secrets: Object.freeze({}), problems: ["WLT1_PROVIDER_RECEIPT_SECRETS must be a flat JSON object of providerId -> secret"] };
  }

  const problems: string[] = [];
  const secrets: Record<string, string> = {};
  for (const [providerId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isKnownProviderId(providerId)) {
      problems.push(`WLT1_PROVIDER_RECEIPT_SECRETS names an unknown provider id: '${providerId}'`);
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`WLT1_PROVIDER_RECEIPT_SECRETS entry for '${providerId}' must be a non-blank string`);
      continue;
    }
    if (value.length < PROVIDER_RECEIPT_SECRET_MIN_LENGTH) {
      problems.push(`WLT1_PROVIDER_RECEIPT_SECRETS entry for '${providerId}' must be at least ${PROVIDER_RECEIPT_SECRET_MIN_LENGTH} characters`);
      continue;
    }
    secrets[providerId] = value;
  }
  return { secrets: Object.freeze(secrets), problems };
}

/** Parses a positive-integer env override, or returns the default. Returns `null` (not the
 * default) for a present-but-malformed value so the caller can fail closed on it, rather than
 * silently substituting the default for an operator typo. Mirrors AML-01's own
 * `parsePositiveIntOverride` precedent, structural convention only. */
function parsePositiveIntOverride(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function loadWlt1Config(env: RawEnv = process.env): Wlt1Config {
  const wlt1InternalServiceToken = env.WLT1_INTERNAL_SERVICE_TOKEN?.trim();
  const clt1BaseUrl = env.CLT1_BASE_URL?.trim();
  const clt1InternalServiceToken = env.CLT1_INTERNAL_SERVICE_TOKEN?.trim();
  const screeningProviderId = env.WLT1_SCREENING_PROVIDER?.trim() || STUB_PROVIDER_ID;
  const screeningMaxValidityHours = parsePositiveIntOverride(env.WLT1_SCREENING_MAX_VALIDITY_HOURS, DEFAULT_SCREENING_MAX_VALIDITY_HOURS);
  const { secrets: providerReceiptSecrets, problems: providerReceiptSecretProblems } = parseProviderReceiptSecrets(env.WLT1_PROVIDER_RECEIPT_SECRETS, isKnownWalletAnalyticsProviderId);
  const pocChallengeTtlMinutes = parsePositiveIntOverride(env.WLT1_POC_CHALLENGE_TTL_MINUTES, DEFAULT_POC_CHALLENGE_TTL_MINUTES);
  const pocMaxAttempts = parsePositiveIntOverride(env.WLT1_POC_MAX_ATTEMPTS, DEFAULT_POC_MAX_ATTEMPTS);
  const destinationCoolingOffHours = parsePositiveIntOverride(env.WLT1_DESTINATION_COOLING_OFF_HOURS, DEFAULT_DESTINATION_COOLING_OFF_HOURS);
  const iam2BaseUrl = env.IAM2_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM2_INTERNAL_SERVICE_TOKEN?.trim();
  const decisionTokenTtlMinutes = parsePositiveIntOverride(env.WLT1_DECISION_TOKEN_TTL_MINUTES, DEFAULT_DECISION_TOKEN_TTL_MINUTES);
  const aml1BaseUrl = env.AML1_BASE_URL?.trim();
  const aml1InternalServiceToken = env.AML1_INTERNAL_SERVICE_TOKEN?.trim();
  const rescreenLeadTimeHours = parsePositiveIntOverride(env.WLT1_RESCREEN_LEAD_TIME_HOURS, DEFAULT_RESCREEN_LEAD_TIME_HOURS);
  const rescreenBatchSizeDefault = parsePositiveIntOverride(env.WLT1_RESCREEN_BATCH_SIZE_DEFAULT, DEFAULT_RESCREEN_BATCH_SIZE_DEFAULT);
  const rescreenBatchSizeMax = parsePositiveIntOverride(env.WLT1_RESCREEN_BATCH_SIZE_MAX, DEFAULT_RESCREEN_BATCH_SIZE_MAX);
  const fiatScreeningMaxValidityHours = parsePositiveIntOverride(env.WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS, DEFAULT_FIAT_SCREENING_MAX_VALIDITY_HOURS);
  const beneficiaryVerificationValidityHours = parsePositiveIntOverride(env.WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS, DEFAULT_BENEFICIARY_VERIFICATION_VALIDITY_HOURS);
  const fiatEncKey = env.WLT1_FIAT_ENC_KEY?.trim();
  const beneficiaryVerificationProviderId = env.WLT1_BENEFICIARY_VERIFICATION_PROVIDER?.trim() || BENEFICIARY_VERIFICATION_STUB_PROVIDER_ID;
  const fiatScreeningProviderId = env.WLT1_FIAT_SCREENING_PROVIDER?.trim() || FIAT_SCREENING_STUB_PROVIDER_ID;
  const fiatVerificationRequiredRaw = env.WLT1_FIAT_VERIFICATION_REQUIRED?.trim();
  const fiatVerificationRequired = fiatVerificationRequiredRaw === undefined || fiatVerificationRequiredRaw === "" ? true : fiatVerificationRequiredRaw === "true";
  const evidenceExportMaxRecords = parsePositiveIntOverride(env.WLT1_EVIDENCE_EXPORT_MAX_RECORDS, DEFAULT_EVIDENCE_EXPORT_MAX_RECORDS);
  const stuckScreeningThresholdSeconds = parsePositiveIntOverride(env.WLT1_STUCK_SCREENING_THRESHOLD_SECONDS, DEFAULT_STUCK_SCREENING_THRESHOLD_SECONDS);

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it WLT-01's own token under the shared field name. A
  // missing/blank/too-short token fails startup closed (CONFIGURATION_INVALID), same as every
  // other service — no WLT-01-specific weak/default-token rule is added here.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: wlt1InternalServiceToken });

  const problems: string[] = [];
  if (!wlt1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as every prior module's equivalent check.
    problems.push("WLT1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!clt1BaseUrl) problems.push("CLT1_BASE_URL is required (WLT-01 -> CLT-01 client-status check)");
  if (!clt1InternalServiceToken) problems.push("CLT1_INTERNAL_SERVICE_TOKEN is required (shared secret with CLT-01)");
  if (!isKnownWalletAnalyticsProviderId(screeningProviderId)) {
    problems.push(`WLT1_SCREENING_PROVIDER '${screeningProviderId}' is not a known wallet-analytics provider id`);
  }
  // Production boot guard (Phase 2B): the deterministic stub must never be the active provider in
  // prod — fail closed at load time, before the app ever accepts a request, rather than silently
  // "screening" real wallet destinations against a fixture table. Same "fail startup closed" idiom
  // every other WLT-01 configuration problem already uses.
  if (base.environment === "prod" && screeningProviderId === STUB_PROVIDER_ID) {
    problems.push(`WLT1_SCREENING_PROVIDER must not be the deterministic stub ('${STUB_PROVIDER_ID}') when ENVIRONMENT=prod`);
  }
  if (screeningMaxValidityHours === null) {
    problems.push("WLT1_SCREENING_MAX_VALIDITY_HOURS must be a positive integer");
  } else if (screeningMaxValidityHours < SCREENING_MAX_VALIDITY_HOURS_MIN || screeningMaxValidityHours > SCREENING_MAX_VALIDITY_HOURS_MAX) {
    problems.push(`WLT1_SCREENING_MAX_VALIDITY_HOURS must be between ${SCREENING_MAX_VALIDITY_HOURS_MIN} and ${SCREENING_MAX_VALIDITY_HOURS_MAX}`);
  }
  if (pocChallengeTtlMinutes === null) {
    problems.push("WLT1_POC_CHALLENGE_TTL_MINUTES must be a positive integer");
  } else if (pocChallengeTtlMinutes < POC_CHALLENGE_TTL_MINUTES_MIN || pocChallengeTtlMinutes > POC_CHALLENGE_TTL_MINUTES_MAX) {
    problems.push(`WLT1_POC_CHALLENGE_TTL_MINUTES must be between ${POC_CHALLENGE_TTL_MINUTES_MIN} and ${POC_CHALLENGE_TTL_MINUTES_MAX}`);
  }
  if (pocMaxAttempts === null) {
    problems.push("WLT1_POC_MAX_ATTEMPTS must be a positive integer");
  } else if (pocMaxAttempts < POC_MAX_ATTEMPTS_MIN || pocMaxAttempts > POC_MAX_ATTEMPTS_MAX) {
    problems.push(`WLT1_POC_MAX_ATTEMPTS must be between ${POC_MAX_ATTEMPTS_MIN} and ${POC_MAX_ATTEMPTS_MAX}`);
  }
  if (destinationCoolingOffHours === null) {
    problems.push("WLT1_DESTINATION_COOLING_OFF_HOURS must be a positive integer");
  } else if (destinationCoolingOffHours < DESTINATION_COOLING_OFF_HOURS_MIN || destinationCoolingOffHours > DESTINATION_COOLING_OFF_HOURS_MAX) {
    problems.push(`WLT1_DESTINATION_COOLING_OFF_HOURS must be between ${DESTINATION_COOLING_OFF_HOURS_MIN} and ${DESTINATION_COOLING_OFF_HOURS_MAX}`);
  }
  if (!iam2BaseUrl) problems.push("IAM2_BASE_URL is required (WLT-01 -> IAM-02 whitelist-approval dependency)");
  if (!iam2InternalServiceToken) problems.push("IAM2_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");
  if (decisionTokenTtlMinutes === null) {
    problems.push("WLT1_DECISION_TOKEN_TTL_MINUTES must be a positive integer");
  } else if (decisionTokenTtlMinutes < DECISION_TOKEN_TTL_MINUTES_MIN || decisionTokenTtlMinutes > DECISION_TOKEN_TTL_MINUTES_MAX) {
    problems.push(`WLT1_DECISION_TOKEN_TTL_MINUTES must be between ${DECISION_TOKEN_TTL_MINUTES_MIN} and ${DECISION_TOKEN_TTL_MINUTES_MAX}`);
  }
  if (!aml1BaseUrl) problems.push("AML1_BASE_URL is required (WLT-01 -> AML-01 pre-transaction gate dependency)");
  if (!aml1InternalServiceToken) problems.push("AML1_INTERNAL_SERVICE_TOKEN is required (shared secret with AML-01)");
  if (rescreenLeadTimeHours === null) {
    problems.push("WLT1_RESCREEN_LEAD_TIME_HOURS must be a positive integer");
  } else if (rescreenLeadTimeHours < RESCREEN_LEAD_TIME_HOURS_MIN || rescreenLeadTimeHours > RESCREEN_LEAD_TIME_HOURS_MAX) {
    problems.push(`WLT1_RESCREEN_LEAD_TIME_HOURS must be between ${RESCREEN_LEAD_TIME_HOURS_MIN} and ${RESCREEN_LEAD_TIME_HOURS_MAX}`);
  }
  if (rescreenBatchSizeDefault === null) {
    problems.push("WLT1_RESCREEN_BATCH_SIZE_DEFAULT must be a positive integer");
  } else if (rescreenBatchSizeDefault < RESCREEN_BATCH_SIZE_MIN || rescreenBatchSizeDefault > RESCREEN_BATCH_SIZE_MAX_CEILING) {
    problems.push(`WLT1_RESCREEN_BATCH_SIZE_DEFAULT must be between ${RESCREEN_BATCH_SIZE_MIN} and ${RESCREEN_BATCH_SIZE_MAX_CEILING}`);
  }
  if (rescreenBatchSizeMax === null) {
    problems.push("WLT1_RESCREEN_BATCH_SIZE_MAX must be a positive integer");
  } else if (rescreenBatchSizeMax < RESCREEN_BATCH_SIZE_MIN || rescreenBatchSizeMax > RESCREEN_BATCH_SIZE_MAX_CEILING) {
    problems.push(`WLT1_RESCREEN_BATCH_SIZE_MAX must be between ${RESCREEN_BATCH_SIZE_MIN} and ${RESCREEN_BATCH_SIZE_MAX_CEILING}`);
  }
  if (rescreenBatchSizeDefault !== null && rescreenBatchSizeMax !== null && rescreenBatchSizeDefault > rescreenBatchSizeMax) {
    problems.push("WLT1_RESCREEN_BATCH_SIZE_DEFAULT must not exceed WLT1_RESCREEN_BATCH_SIZE_MAX");
  }
  if (fiatScreeningMaxValidityHours === null) {
    problems.push("WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS must be a positive integer");
  } else if (fiatScreeningMaxValidityHours < FIAT_SCREENING_MAX_VALIDITY_HOURS_MIN || fiatScreeningMaxValidityHours > FIAT_SCREENING_MAX_VALIDITY_HOURS_MAX) {
    problems.push(`WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS must be between ${FIAT_SCREENING_MAX_VALIDITY_HOURS_MIN} and ${FIAT_SCREENING_MAX_VALIDITY_HOURS_MAX}`);
  }
  if (beneficiaryVerificationValidityHours === null) {
    problems.push("WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS must be a positive integer");
  } else if (beneficiaryVerificationValidityHours < BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MIN || beneficiaryVerificationValidityHours > BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MAX) {
    problems.push(`WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS must be between ${BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MIN} and ${BENEFICIARY_VERIFICATION_VALIDITY_HOURS_MAX}`);
  }
  if (!fiatEncKey) {
    problems.push("WLT1_FIAT_ENC_KEY is required");
  } else if (fiatEncKey.length < FIAT_ENC_KEY_MIN_LENGTH) {
    problems.push(`WLT1_FIAT_ENC_KEY must be at least ${FIAT_ENC_KEY_MIN_LENGTH} characters`);
  }
  if (!isKnownBeneficiaryVerificationProviderId(beneficiaryVerificationProviderId)) {
    problems.push(`WLT1_BENEFICIARY_VERIFICATION_PROVIDER '${beneficiaryVerificationProviderId}' is not a known beneficiary-verification provider id`);
  }
  if (base.environment === "prod" && beneficiaryVerificationProviderId === BENEFICIARY_VERIFICATION_STUB_PROVIDER_ID) {
    problems.push(`WLT1_BENEFICIARY_VERIFICATION_PROVIDER must not be the deterministic stub ('${BENEFICIARY_VERIFICATION_STUB_PROVIDER_ID}') when ENVIRONMENT=prod`);
  }
  if (!isKnownFiatScreeningProviderId(fiatScreeningProviderId)) {
    problems.push(`WLT1_FIAT_SCREENING_PROVIDER '${fiatScreeningProviderId}' is not a known fiat-screening provider id`);
  }
  if (base.environment === "prod" && fiatScreeningProviderId === FIAT_SCREENING_STUB_PROVIDER_ID) {
    problems.push(`WLT1_FIAT_SCREENING_PROVIDER must not be the deterministic stub ('${FIAT_SCREENING_STUB_PROVIDER_ID}') when ENVIRONMENT=prod`);
  }
  if (fiatVerificationRequiredRaw !== undefined && fiatVerificationRequiredRaw !== "" && fiatVerificationRequiredRaw !== "true" && fiatVerificationRequiredRaw !== "false") {
    problems.push("WLT1_FIAT_VERIFICATION_REQUIRED must be 'true' or 'false'");
  }
  if (base.environment === "prod" && !fiatVerificationRequired) {
    problems.push("WLT1_FIAT_VERIFICATION_REQUIRED must be true when ENVIRONMENT=prod");
  }
  if (evidenceExportMaxRecords === null) {
    problems.push("WLT1_EVIDENCE_EXPORT_MAX_RECORDS must be a positive integer");
  } else if (evidenceExportMaxRecords < EVIDENCE_EXPORT_MAX_RECORDS_MIN || evidenceExportMaxRecords > EVIDENCE_EXPORT_MAX_RECORDS_MAX) {
    problems.push(`WLT1_EVIDENCE_EXPORT_MAX_RECORDS must be between ${EVIDENCE_EXPORT_MAX_RECORDS_MIN} and ${EVIDENCE_EXPORT_MAX_RECORDS_MAX}`);
  }
  if (stuckScreeningThresholdSeconds === null) {
    problems.push("WLT1_STUCK_SCREENING_THRESHOLD_SECONDS must be a positive integer");
  } else if (stuckScreeningThresholdSeconds < STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR) {
    problems.push(`WLT1_STUCK_SCREENING_THRESHOLD_SECONDS must be at least ${STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR} seconds`);
  }
  problems.push(...providerReceiptSecretProblems);
  // Production boot guard (Phase 2C-D1): the receipt route is always registered once this phase
  // ships (no feature flag) — a prod boot with no valid secret for the currently-active screening
  // provider would deploy a route that can never be authenticated, silently accepting nothing.
  // Fail closed at load time, mirroring this file's own identical "stub disallowed in prod" guard.
  if (base.environment === "prod" && providerReceiptSecretProblems.length === 0 && !Object.prototype.hasOwnProperty.call(providerReceiptSecrets, screeningProviderId)) {
    problems.push(`WLT1_PROVIDER_RECEIPT_SECRETS must include a valid secret for the active WLT1_SCREENING_PROVIDER ('${screeningProviderId}') when ENVIRONMENT=prod`);
  }

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical WLT-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    wlt1InternalServiceToken: wlt1InternalServiceToken as string,
    clt1BaseUrl: clt1BaseUrl as string,
    clt1InternalServiceToken: clt1InternalServiceToken as string,
    screeningProviderId,
    screeningMaxValidityHours: screeningMaxValidityHours as number,
    providerReceiptSecrets,
    pocChallengeTtlMinutes: pocChallengeTtlMinutes as number,
    pocMaxAttempts: pocMaxAttempts as number,
    destinationCoolingOffHours: destinationCoolingOffHours as number,
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
    decisionTokenTtlMinutes: decisionTokenTtlMinutes as number,
    aml1BaseUrl: aml1BaseUrl as string,
    aml1InternalServiceToken: aml1InternalServiceToken as string,
    rescreenLeadTimeHours: rescreenLeadTimeHours as number,
    rescreenBatchSizeDefault: rescreenBatchSizeDefault as number,
    rescreenBatchSizeMax: rescreenBatchSizeMax as number,
    fiatScreeningMaxValidityHours: fiatScreeningMaxValidityHours as number,
    beneficiaryVerificationValidityHours: beneficiaryVerificationValidityHours as number,
    fiatEncKey: fiatEncKey as string,
    beneficiaryVerificationProviderId,
    fiatScreeningProviderId,
    fiatVerificationRequired,
    evidenceExportMaxRecords: evidenceExportMaxRecords as number,
    stuckScreeningThresholdSeconds: stuckScreeningThresholdSeconds as number,
  };
}
