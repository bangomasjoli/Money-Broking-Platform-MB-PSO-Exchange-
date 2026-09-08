/**
 * AML-01 configuration loader.
 *
 * Reuses @aix/foundation's `loadConfig` (fail-closed baseline: ENVIRONMENT/DATABASE_URL/PORT/
 * internal-service-token presence + minimum length) for the shared shape, then layers AML-01's
 * own internal-identity token on top. `AML1_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so AML-01 has exactly ONE interim internal-identity
 * secret for its own `/internal/aml1/*` routes — mirrors every prior service's own Phase 0
 * decision (services/clt1/src/config.ts, services/cfg1/src/config.ts, services/sec1/src/
 * config.ts, services/iam2/src/config.ts). Own copy, not imported — F3(c).
 *
 * APPROVED PHASE 0 DECISION (internal identity, carry-forward, not a new one): this is the SAME
 * interim shared-secret guard pattern every other service in this codebase already carries as a
 * documented, non-blocking carry-forward (IAM-02's own implementation notes §10.4 L3; SEC-01's
 * F-5; CFG-01's L1/L2; CLT-01's own config.ts header). No final service-identity model is
 * designed here. This carry-forward will be MORE consequential for AML-01 than for prior modules
 * once real routes land — AML-01 will process highly sensitive screening PII (sanctions/PEP/
 * adverse-media match detail, potentially including allegations tied to real natural persons),
 * arguably the most sensitive data category any module in this codebase handles. Flagged now,
 * not deferred silently.
 *
 * No business route exists in Phase 0 — the one route this phase registers (`GET
 * /internal/aml1/health`) is unauthenticated and does not query the database, so this config
 * carries no CLT1/IAM2/CFG1/SEC1 base-URL/token fields and no vendor/watchlist API key. Each is
 * added only in the phase that first needs it, named after the DEPENDENCY (not the caller),
 * mirroring every prior module's own convention — e.g. CLT-01's own `CFG1_BASE_URL`/
 * `IAM02_BASE_URL`, not `CLT1_CFG1_*`/`CLT1_IAM2_*`.
 *
 * Phase 2A addition: `CLT1_BASE_URL` / `CLT1_INTERNAL_SERVICE_TOKEN` — AML-01's first cross-module
 * HTTP dependency (`lib/clt1-client.ts`), used by the CLT-01 outcome-delivery/retry routes to POST
 * mapped screening outcomes into CLT-01's EXISTING application-outcome and authorised-party
 * screening-outcome receipt endpoints. Named after the DEPENDENCY, not the caller, mirroring
 * CLT-01's own `CFG1_BASE_URL`/`IAM02_BASE_URL` convention — NOT `AML1_CLT1_*`.
 * `CLT1_INTERNAL_SERVICE_TOKEN` here MUST be configured to the SAME shared-secret value CLT-01's
 * own `CLT1_INTERNAL_SERVICE_TOKEN` env var holds — the same operator-managed shared-secret-sync
 * caveat every other cross-service credential in this codebase already carries.
 *
 * Phase 2B addition: `IAM02_BASE_URL` / `IAM02_INTERNAL_SERVICE_TOKEN` — AML-01's first IAM-02
 * dependency (`lib/iam2-client.ts`), used by the match-inventory/sensitive-read/disposition
 * routes' `checkPermission` baseline call and by `confirm|dismiss/apply`'s `verifyDecisionToken`
 * execute-verify call. Same naming/shared-secret-sync convention as CLT-01's own identical
 * dependency (services/clt1/src/config.ts) — NOT `AML1_IAM2_*`.
 *
 * Phase 3B addition: `AML1_SCREENING_PROVIDER` — selects the ONE active screening provider
 * (`lib/providers/registry.ts`), validated fail-closed against the registry's own known-id set at
 * load time (an unknown id is a startup-time `CONFIGURATION_INVALID`, never a runtime surprise).
 * Defaults to the deterministic stub (`stub-v1`) when unset — a dev/test convenience, never a
 * silent production default: `environment === "prod"` with the stub selected ALSO fails closed at
 * load time (§ below) — production must explicitly configure a real provider once one exists.
 * `screeningProviderImpl` is a test-only DI seam (never populated from env) letting a test inject a
 * hand-built `ScreeningProvider` directly — e.g. to prove the registry's own timeout wrapper fires
 * on a provider that never resolves — mirrors `clt1FetchImpl`/`iam2FetchImpl` exactly.
 *
 * Phase 3C additions — none of these are secrets, so (unlike every token above) a missing/blank
 * value does not fail startup closed; each has a safe, documented numeric default instead, same
 * "config with a sane default, not a required secret" posture this codebase already applies to
 * ordinary tuning knobs:
 *   - `AML1_RESCREEN_DUE_DAYS` — `lib/monitoring.ts`'s `periodic_due` candidate-selection window
 *     (a subject's latest COMPLETED screen older than this many days is "due"). Default 90.
 *   - `AML1_MONITORING_BATCH_SIZE_DEFAULT` / `AML1_MONITORING_BATCH_SIZE_MAX` — bounded batch size
 *     for a single route-triggered monitoring run (confirmed requirement: "bounded batch only").
 *     Defaults 50 / 200. A caller-supplied `batch_size` above the max is clamped down, never
 *     rejected — mirrors the "cap, don't 400, on an oversized-but-well-formed request" posture
 *     already used elsewhere in this codebase for bounded reads.
 * A non-numeric or non-positive override for any of these three fails startup closed as
 * `CONFIGURATION_INVALID`, the same "fail closed on malformed config" discipline every other AML-01
 * setting already uses.
 *
 * Phase 3D addition:
 *   - `AML1_STUCK_SCREENING_THRESHOLD_SECONDS` — `lib/stuck-screening.ts`'s own definition of
 *     "stuck" (a `requested` screening request with a `pending` provider attempt older than this
 *     many seconds). Default 900 (15 minutes) — a wide margin over the provider call's own 5s
 *     timeout (`lib/providers/registry.ts`). Unlike `AML1_RESCREEN_DUE_DAYS`/
 *     `AML1_MONITORING_BATCH_SIZE_*`, this one carries a HARD MINIMUM FLOOR
 *     (`STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR` = 300s): a value below the floor fails startup
 *     closed as `CONFIGURATION_INVALID`, same as a non-positive/non-numeric override — confirmed
 *     Phase 3D decision D5. This is the ONE control standing between an operator and marking a
 *     genuinely in-flight screen `failed`; no per-request override of any kind exists (the recover
 *     route re-checks this SAME configured value against the request's actual age inside its own
 *     transaction — `routes/stuck-screening.ts` never trusts a caller-supplied age).
 *
 * Phase 3E additions (frozen architecture + addendum) — `routes/pre-transaction.ts`'s own
 * synchronous, evidence-based pre-transaction AML decision gate:
 *   - `AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS` — how old a subject's latest COMPLETED
 *     `clear`/fully-dismissed evidence may be and still support an `allow` decision. Default 2160
 *     (90 days) — deliberately anchored to `AML1_RESCREEN_DUE_DAYS`'s own default (90 days × 24),
 *     never a merely-convenient number: evidence counts as fresh exactly until AML-01 itself
 *     considers it due for re-screening. Bounds [1, 8760] (1 hour .. 1 year, mirrors
 *     `WLT1_SCREENING_MAX_VALIDITY_HOURS`'s own bound shape). A CROSS-FIELD boot check additionally
 *     enforces `evidenceMaxAgeHours <= rescreenDueDays * 24` — freshness can never outlive AML-01's
 *     own staleness policy — fails closed as `CONFIGURATION_INVALID` if violated, same as every
 *     other malformed-config path in this file. Does NOT apply to `confirmed_hit` — a hit is never
 *     "too old to matter" (frozen architecture, addendum Part 13).
 *   - `AML1_PRETRANSACTION_DECISION_TTL_MINUTES` — how long a returned `decision_id`/
 *     `valid_until_utc` remains valid for the CALLER's own binding purposes (e.g. a future WLT-01
 *     Phase 4A token). Deliberately short (default 5, bounds [1, 15]) because the frozen contract
 *     requires the caller to RE-EVALUATE per request, never cache a decision across requests — this
 *     TTL exists only to bound token binding, not to enable caching (frozen architecture Part J /
 *     addendum item 18). NEVER conflated with `AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS`, which
 *     governs how old the underlying screening EVIDENCE may be, a completely separate axis.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";
import { isKnownScreeningProviderId } from "./lib/providers/registry.js";
import { STUB_PROVIDER_ID } from "./lib/providers/stub-provider.js";
import type { ScreeningProvider } from "./lib/providers/types.js";

export interface Aml1Config extends AppConfig {
  /** AML-01's own interim internal-identity shared secret. Never logged. */
  aml1InternalServiceToken: string;
  /** Base URL of CLT-01's HTTP surface, e.g. "http://localhost:8085". Phase 2A outcome-delivery dependency. */
  clt1BaseUrl: string;
  /** Shared secret expected by CLT-01's own internal-identity guard. Never logged. */
  clt1InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/clt1-client.ts (never populated from env) — lets
   * tests stub the CLT-01 HTTP call instead of requiring a live CLT-01 service. Left undefined in
   * every real/loaded config; only ever set by hand in test fixtures. Mirrors CLT-01's own
   * `cfg1FetchImpl`/`iam2FetchImpl` exactly.
   */
  clt1FetchImpl?: typeof fetch;
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 2B permission/approval dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) — lets
   * tests stub the IAM-02 HTTP call instead of requiring a live IAM-02 service. Mirrors
   * Clt1Config's own `iam2FetchImpl` exactly.
   */
  iam2FetchImpl?: typeof fetch;
  /** The ONE active screening provider id (`lib/providers/registry.ts`). Validated against the
   * registry's known-id set at load time. */
  screeningProviderId: string;
  /**
   * Test-only dependency-injection seam for `routes/screening.ts` (never populated from env) —
   * lets a test inject a hand-built `ScreeningProvider` directly instead of resolving
   * `screeningProviderId` through the registry. Mirrors `clt1FetchImpl`/`iam2FetchImpl` exactly.
   */
  screeningProviderImpl?: ScreeningProvider;
  /** `lib/monitoring.ts`'s `periodic_due` due-window, in days. */
  rescreenDueDays: number;
  /** `routes/monitoring.ts`'s default bounded batch size when the caller omits `batch_size`. */
  monitoringBatchSizeDefault: number;
  /** `routes/monitoring.ts`'s hard cap — a caller-supplied `batch_size` above this is clamped down. */
  monitoringBatchSizeMax: number;
  /** `lib/stuck-screening.ts`'s own stuck-age threshold, in seconds. Hard floor enforced at load
   * time — see this file's own Phase 3D header comment. */
  stuckScreeningThresholdSeconds: number;
  /** `routes/pre-transaction.ts`'s own evidence-freshness ceiling, in hours. Cross-field bound
   * against `rescreenDueDays` enforced at load time — see this file's own Phase 3E header comment. */
  pretransactionEvidenceMaxAgeHours: number;
  /** `routes/pre-transaction.ts`'s own decision-validity window, in minutes. See this file's own
   * Phase 3E header comment. */
  pretransactionDecisionTtlMinutes: number;
}

const DEFAULT_RESCREEN_DUE_DAYS = 90;
const DEFAULT_MONITORING_BATCH_SIZE_DEFAULT = 50;
const DEFAULT_MONITORING_BATCH_SIZE_MAX = 200;
const DEFAULT_STUCK_SCREENING_THRESHOLD_SECONDS = 900;
/** Hard minimum — a 60x margin over the provider call's own 5s timeout. No config value below
 * this may ever be accepted; see this file's own Phase 3D header comment. */
const STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR = 300;

const DEFAULT_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS = 2160;
const PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MIN = 1;
const PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MAX = 8760;

const DEFAULT_PRETRANSACTION_DECISION_TTL_MINUTES = 5;
const PRETRANSACTION_DECISION_TTL_MINUTES_MIN = 1;
const PRETRANSACTION_DECISION_TTL_MINUTES_MAX = 15;

/** Parses a positive-integer env override, or returns the default. Returns `null` (not the
 * default) for a present-but-malformed value so the caller can fail closed on it, rather than
 * silently substituting the default for an operator typo. */
function parsePositiveIntOverride(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function loadAml1Config(env: RawEnv = process.env): Aml1Config {
  const aml1InternalServiceToken = env.AML1_INTERNAL_SERVICE_TOKEN?.trim();
  const clt1BaseUrl = env.CLT1_BASE_URL?.trim();
  const clt1InternalServiceToken = env.CLT1_INTERNAL_SERVICE_TOKEN?.trim();
  const iam2BaseUrl = env.IAM02_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM02_INTERNAL_SERVICE_TOKEN?.trim();
  const screeningProviderId = env.AML1_SCREENING_PROVIDER?.trim() || STUB_PROVIDER_ID;
  const rescreenDueDays = parsePositiveIntOverride(env.AML1_RESCREEN_DUE_DAYS, DEFAULT_RESCREEN_DUE_DAYS);
  const monitoringBatchSizeDefault = parsePositiveIntOverride(env.AML1_MONITORING_BATCH_SIZE_DEFAULT, DEFAULT_MONITORING_BATCH_SIZE_DEFAULT);
  const monitoringBatchSizeMax = parsePositiveIntOverride(env.AML1_MONITORING_BATCH_SIZE_MAX, DEFAULT_MONITORING_BATCH_SIZE_MAX);
  const stuckScreeningThresholdSeconds = parsePositiveIntOverride(env.AML1_STUCK_SCREENING_THRESHOLD_SECONDS, DEFAULT_STUCK_SCREENING_THRESHOLD_SECONDS);
  const pretransactionEvidenceMaxAgeHours = parsePositiveIntOverride(env.AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS, DEFAULT_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS);
  const pretransactionDecisionTtlMinutes = parsePositiveIntOverride(env.AML1_PRETRANSACTION_DECISION_TTL_MINUTES, DEFAULT_PRETRANSACTION_DECISION_TTL_MINUTES);

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it AML-01's own token under the shared field name. A
  // missing/blank/too-short token fails startup closed (CONFIGURATION_INVALID), same as every
  // other service — no AML-01-specific weak/default-token rule is added here.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: aml1InternalServiceToken });

  const problems: string[] = [];
  if (!aml1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as every prior module's equivalent check.
    problems.push("AML1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!clt1BaseUrl) problems.push("CLT1_BASE_URL is required (AML-01 -> CLT-01 outcome delivery)");
  if (!clt1InternalServiceToken) problems.push("CLT1_INTERNAL_SERVICE_TOKEN is required (shared secret with CLT-01)");
  if (!iam2BaseUrl) problems.push("IAM02_BASE_URL is required (AML-01 -> IAM-02 permission/approval guard)");
  if (!iam2InternalServiceToken) problems.push("IAM02_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");
  if (!isKnownScreeningProviderId(screeningProviderId)) {
    problems.push(`AML1_SCREENING_PROVIDER '${screeningProviderId}' is not a known screening provider id`);
  }
  if (rescreenDueDays === null) problems.push("AML1_RESCREEN_DUE_DAYS must be a positive integer");
  if (monitoringBatchSizeDefault === null) problems.push("AML1_MONITORING_BATCH_SIZE_DEFAULT must be a positive integer");
  if (monitoringBatchSizeMax === null) problems.push("AML1_MONITORING_BATCH_SIZE_MAX must be a positive integer");
  if (monitoringBatchSizeDefault !== null && monitoringBatchSizeMax !== null && monitoringBatchSizeDefault > monitoringBatchSizeMax) {
    problems.push("AML1_MONITORING_BATCH_SIZE_DEFAULT must not exceed AML1_MONITORING_BATCH_SIZE_MAX");
  }
  if (stuckScreeningThresholdSeconds === null) problems.push("AML1_STUCK_SCREENING_THRESHOLD_SECONDS must be a positive integer");
  if (stuckScreeningThresholdSeconds !== null && stuckScreeningThresholdSeconds < STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR) {
    problems.push(`AML1_STUCK_SCREENING_THRESHOLD_SECONDS must be at least ${STUCK_SCREENING_THRESHOLD_SECONDS_FLOOR} seconds`);
  }
  if (pretransactionEvidenceMaxAgeHours === null) {
    problems.push("AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS must be a positive integer");
  } else if (pretransactionEvidenceMaxAgeHours < PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MIN || pretransactionEvidenceMaxAgeHours > PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MAX) {
    problems.push(`AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS must be between ${PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MIN} and ${PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS_MAX}`);
  }
  if (pretransactionDecisionTtlMinutes === null) {
    problems.push("AML1_PRETRANSACTION_DECISION_TTL_MINUTES must be a positive integer");
  } else if (pretransactionDecisionTtlMinutes < PRETRANSACTION_DECISION_TTL_MINUTES_MIN || pretransactionDecisionTtlMinutes > PRETRANSACTION_DECISION_TTL_MINUTES_MAX) {
    problems.push(`AML1_PRETRANSACTION_DECISION_TTL_MINUTES must be between ${PRETRANSACTION_DECISION_TTL_MINUTES_MIN} and ${PRETRANSACTION_DECISION_TTL_MINUTES_MAX}`);
  }
  // Cross-field bound (frozen addendum): evidence freshness may never outlive AML-01's own
  // re-screen-due policy — same "cap one config value against another" discipline
  // monitoringBatchSizeDefault/monitoringBatchSizeMax already uses above.
  if (rescreenDueDays !== null && pretransactionEvidenceMaxAgeHours !== null && pretransactionEvidenceMaxAgeHours > rescreenDueDays * 24) {
    problems.push("AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS must not exceed AML1_RESCREEN_DUE_DAYS * 24");
  }
  // Production boot guard (Phase 3B): the deterministic stub must never be the active provider in
  // prod — fail closed at load time, before the app ever accepts a request, rather than silently
  // "screening" real subjects against a fixture table. Same "fail startup closed" idiom every other
  // AML-01 configuration problem already uses.
  if (base.environment === "prod" && screeningProviderId === STUB_PROVIDER_ID) {
    problems.push("AML1_SCREENING_PROVIDER must not be the deterministic stub ('stub-v1') when ENVIRONMENT=prod");
  }

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical AML-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    aml1InternalServiceToken: aml1InternalServiceToken as string,
    clt1BaseUrl: clt1BaseUrl as string,
    clt1InternalServiceToken: clt1InternalServiceToken as string,
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
    screeningProviderId,
    rescreenDueDays: rescreenDueDays as number,
    monitoringBatchSizeDefault: monitoringBatchSizeDefault as number,
    monitoringBatchSizeMax: monitoringBatchSizeMax as number,
    stuckScreeningThresholdSeconds: stuckScreeningThresholdSeconds as number,
    pretransactionEvidenceMaxAgeHours: pretransactionEvidenceMaxAgeHours as number,
    pretransactionDecisionTtlMinutes: pretransactionDecisionTtlMinutes as number,
  };
}
