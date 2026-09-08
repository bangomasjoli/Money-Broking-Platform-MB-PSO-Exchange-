/**
 * WLT-01 Phase 2B — wallet-analytics screening provider adaptor boundary (types only). No route
 * handler and no caller outside a future Phase 2C screening/receipt route may reach past this
 * boundary into a concrete provider implementation — every provider is selected through
 * `registry.ts`, never imported directly. Own copy, not imported from another service — F3(c)
 * (mirrors `services/aml1/src/lib/providers/types.ts`'s own shape by structural convention only,
 * never by cross-service import).
 *
 * PLATFORM-WIDE RAW-PAYLOAD RULE: a provider implementation may receive/hold whatever a future
 * real adaptor's own HTTP call returns in memory, but `WalletScreeningOutcome`'s `NormalizedResult`
 * shape has NO raw-body field of any kind — no `raw_payload`/`provider_payload`/`raw_response`.
 * Nothing downstream of a provider (the registry, a future application path, the database) can
 * ever be handed a raw vendor body, because the type this file exports has no place to put one.
 */
import type { AuthenticatedReceiptProvenance } from "../../plugins/receipt-auth.js";
export type { AuthenticatedReceiptProvenance };

export const RISK_STATUSES = ["clear", "review_required", "high_risk", "hit"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/**
 * WLT normalized-v1 risk-category vocabulary — an explicit WLT-01 implementation extension, NOT a
 * regulatory taxonomy, NOT a Labuan FSA prescribed list, NOT an approval policy, and NOT an
 * automatic transaction-blocking threshold. A provider's own raw category string that does not map
 * onto this closed set must never be silently dropped or bucketed — see `normalizeRiskCategories`
 * in `stub-provider.ts`'s sibling normalization helper, which fails closed (`invalid_response`) on
 * an unmapped category, the same "fail closed on the unrecognized" posture AML-01's own
 * `normalizeProviderMatches` established for its own category set.
 */
export const RISK_CATEGORIES = [
  "sanctions",
  "terrorism_financing",
  "mixer",
  "darknet",
  "scam",
  "stolen_funds",
  "ransomware",
  "gambling",
  "high_risk_exchange",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export function isKnownRiskCategory(value: string): value is RiskCategory {
  return (RISK_CATEGORIES as readonly string[]).includes(value);
}

/** Phase 2C-D3A — mirrors `isKnownRiskCategory` exactly. A receipt adaptor's own `normalizeReceipt`
 * must validate a raw provider-native risk-status string against this closed set BEFORE
 * constructing a `NormalizedScreeningResult` — the type itself already excludes `"pending"` from
 * `RiskStatus`, but that only helps code that already holds a well-typed value; untrusted
 * provider-native JSON must be checked at the boundary, the same way `normalizeRiskCategories` /
 * `normalizeExposure` already check their own untrusted inputs. */
export function isKnownRiskStatus(value: string): value is RiskStatus {
  return (RISK_STATUSES as readonly string[]).includes(value);
}

/**
 * WLT normalized-v1 exposure shape — Phase 2C-A type freeze (P2B-INF-3). Category-only, mirroring
 * the blueprint's own "direct/indirect exposure category capture"/"exposure flags" wording
 * (01_Module_Blueprint.md items 5-6, 177-179) — NOT a percentage/hop-count/entity-graph model,
 * which the blueprint does not describe. An explicit WLT implementation extension, not a
 * regulatory taxonomy. Bounded to `MAX_EXPOSURE_ENTRIES`; deduplicated; deterministically sorted
 * by category. `[]` means "screened, no relevant exposure" for a COMPLETE normalized result — the
 * underlying `wlt1.wallet_screening_result.direct_exposure`/`indirect_exposure` jsonb columns may
 * still be database-`NULL` for a `pending` row (not yet populated); a constructed
 * `NormalizedScreeningResult` for a `kind: "screened"` outcome must never use `null` for either
 * field — see `normalizeExposure` below, which never returns `null`, only `[]` or `undefined`
 * (fail-closed) for invalid input.
 */
export interface NormalizedExposureEntry {
  category: RiskCategory;
}
export type NormalizedExposure = readonly NormalizedExposureEntry[];

/** Bounded — an unbounded exposure array is itself an untrustworthy provider response. */
export const MAX_EXPOSURE_ENTRIES = 16;

/**
 * Pure, bounded exposure normalizer. Rejects (returns `undefined`, caller fails closed to
 * `invalid_response`) on: non-array input, more than `MAX_EXPOSURE_ENTRIES` entries, an entry with
 * any key other than `category`, a missing/non-string `category`, or a `category` outside
 * `RISK_CATEGORIES` (including the literal string `"unknown"`). Valid input is deduplicated and
 * sorted deterministically by category; an empty array input returns `[]`, never `null`/`undefined`.
 */
export function normalizeExposure(input: unknown): NormalizedExposure | undefined {
  if (!Array.isArray(input)) return undefined;
  if (input.length > MAX_EXPOSURE_ENTRIES) return undefined;
  const categories = new Set<RiskCategory>();
  for (const entry of input) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const keys = Object.keys(entry as Record<string, unknown>);
    if (keys.length !== 1 || keys[0] !== "category") return undefined;
    const rawCategory = (entry as Record<string, unknown>).category;
    if (typeof rawCategory !== "string") return undefined;
    const normalized = rawCategory.trim().toLowerCase();
    if (!isKnownRiskCategory(normalized)) return undefined;
    categories.add(normalized);
  }
  return Array.from(categories)
    .sort()
    .map((category) => ({ category }));
}

/** The MINIMIZED input WLT-01 sends to a provider — chain/network/canonical address, plus (Phase
 * 2C-D0, GAP-1 remediation) an opaque screening-correlation reference. No private key, seed
 * phrase, signing material, auth secret, or human identity of any kind.
 *
 * `screeningReferenceId` — GAP-1 remediation: independent Opus review proved that
 * `{chain, network, canonicalAddress}` alone is an UNSAFE correlation key for a future
 * asynchronous provider receipt (Phase 2C-D), because a canonical address is not unique — two
 * different clients/destinations may legitimately share one. This field is the server-generated
 * `wallet_screening_result.screening_result_id` of the screening attempt THIS provider call
 * belongs to — always the caller-side `screening_result_id`, never client-selected, never derived
 * from the wallet address, never a second independently-generated id. It is IDENTICAL across every
 * C3 retry of the same screening row/version (the same screening attempt, re-attempted), and
 * DIFFERENT for two destinations that happen to share a canonical address (two distinct screening
 * attempts). A provider is free to ignore this field entirely today (no asynchronous receipt path
 * exists yet); Phase 2C-D's own receipt route will require the provider to echo it back so the
 * receipt can be bound to the correct pending row without trusting the address alone. */
export interface WalletScreeningInput {
  chain: string;
  network: string;
  canonicalAddress: string;
  screeningReferenceId: string;
}

/**
 * A single normalized SCREENING result — screening facts only. No raw provider payload field
 * exists on this type; there is nowhere to put one. `riskCategories` must already be deduplicated
 * and sorted by the provider implementation (`stub-provider.ts` does this; a future real adaptor
 * must too). `directExposure`/`indirectExposure` are always bounded, category-only arrays (never
 * `null`) on a constructed result — see `NormalizedExposure` above.
 *
 * Phase 2C-B (P2CA-MED-1 remediation): `sourceAuthenticated`/`payloadHash` were REMOVED from this
 * type. Both were provider-owned evidence-provenance fields a provider adaptor has no honest way
 * to assert — a provider cannot know whether ITS OWN caller was an authenticated external source,
 * and a provider cannot manufacture receipt-payload evidence for a call that has no receipt. Those
 * facts now live on `ScreeningEvidenceEnvelope` (below), supplied by the APPLICATION layer that
 * knows which call path produced this result — see `lib/screening-application.ts`'s
 * `applyNormalizedScreeningResult`, the only function permitted to persist either value.
 */
export interface NormalizedScreeningResult {
  providerResultId: string;
  riskStatus: RiskStatus;
  riskScore: number | null;
  riskCategories: RiskCategory[];
  directExposure: NormalizedExposure;
  indirectExposure: NormalizedExposure;
  sanctionsExposure: boolean | null;
  clusterRef: string | null;
  issuedAtUtc: string;
  validUntilUtc: string | null;
}

/**
 * Phase 2C-D1/D2/D2R (P2CB-MED-2 remediation) — `AuthenticatedReceiptProvenance` is proof that
 * receipt authentication succeeded against the server's own bound configuration. The type is
 * imported here (type-only) from `plugins/receipt-auth.ts`, which OWNS the module-private `unique
 * symbol` brand AND the module-private constructor — neither is exported from that module, or from
 * this one. The brand alone prevents PLAIN-OBJECT forgery (a compile error, and JSON can never
 * produce a symbol key at runtime either) — it does NOT by itself prove the credential authority
 * behind a given value was the server's real configuration; see `receipt-auth.ts`'s own header
 * comment (H-D2-1 remediation) for the full history and the honest scope of what is actually
 * enforced. The ONLY production construction path for a value of this type is a config-bound
 * `Wlt1ProviderReceiptAuthenticator` (obtained from `createWlt1ProviderReceiptAuthenticator(config)`,
 * called exactly once at app boot in `server.ts`) — its own `.authenticate(...)` /
 * `AuthenticatedProviderReceipt.mintProvenance(...)`. An earlier design exported a standalone
 * `mintAuthenticatedReceiptProvenance` factory directly from THIS file (M-D1-1's original defect,
 * later found to persist in a different shape as H-D2-1 even after that factory was removed) —
 * both are gone; see `receipt-auth.ts` for the current architecture.
 *
 * This closes the ORIGINAL P2CB-MED-2 defect: before Phase 2C-D1, `ScreeningEvidenceEnvelope`'s
 * `provider_receipt` variant carried a bare `payloadHash: string` field, so ANY caller — a route
 * schema field, a provider adaptor's own result, or a direct `ScreeningApplicationService` caller
 * — could construct `{ sourceKind: "provider_receipt", payloadHash: "<anything>", ... }` and the
 * type system would accept it as authenticated evidence it never actually was.
 *
 * `AuthenticatedReceiptProvenance` wraps exactly the two facts that must never be caller-asserted
 * (`payloadHash`) or caller-implied (`sourceAuthenticated`, which `deriveSourceEvidence` below
 * derives from the mere PRESENCE of a valid provenance value, never a separate boolean field a
 * caller could set independently). `providerId`/`providerAdaptorVersion` remain unbranded at the
 * top level of `ScreeningEvidenceEnvelope` (unchanged) — those are already
 * application/registry-resolved values with their own existing binding checks in
 * `applyNormalizedScreeningResult`, not the vulnerable fields P2CB-MED-2 was about.
 *
 * Type-only cross-directory import (lib/providers -> plugins) is a deliberate, narrow exception to
 * this codebase's usual lib-does-not-depend-on-plugins layering — forced by the security
 * requirement that the brand/constructor live in exactly one file, which must be the file that
 * actually performs authentication. `import type` erases entirely at compile time (no runtime
 * dependency, no circularity risk — `receipt-auth.ts` imports nothing from this file).
 */

/**
 * Phase 2C-B (P2CA-MED-1 remediation) — the APPLICATION-OWNED evidence envelope. Distinguishes the
 * two ways a `NormalizedScreeningResult` can reach `applyNormalizedScreeningResult`, and supplies
 * exactly the provenance/binding facts a provider result must never self-assert:
 *
 *   - `synchronous_provider` — an in-process provider call with no external receipt. There is no
 *     credential to authenticate and no receipt body to hash; `source_authenticated` persists as
 *     `NULL` and `payload_hash` persists as `NULL` (never a fabricated value).
 *   - `provider_receipt` — an authenticated external callback (Phase 2C-D). By construction, an
 *     UNAUTHENTICATED receipt never reaches this envelope at all — authentication happens before
 *     application, so `source_authenticated` is always `TRUE` here, never `FALSE`. `provenance` is
 *     REQUIRED and can only be an `AuthenticatedReceiptProvenance` (Phase 2C-D1 — see above), never
 *     a bare string a caller could self-assert.
 *
 * `providerId`/`providerAdaptorVersion` are APPLICATION-RESOLVED binding metadata — the server's
 * own resolved provider instance (2C-C) or the authenticated receipt's own claimed identity
 * (2C-D) — never taken from `NormalizedScreeningResult` itself, which carries no such fields.
 * `applyNormalizedScreeningResult` compares these against the pending row's own immutable binding;
 * it never trusts them as truth on their own.
 */
export type ScreeningEvidenceEnvelope =
  | { sourceKind: "synchronous_provider"; providerId: string; providerAdaptorVersion: string }
  | { sourceKind: "provider_receipt"; providerId: string; providerAdaptorVersion: string; provenance: AuthenticatedReceiptProvenance };

/**
 * WLT normalized-v1 sanctions cross-field consistency rule (Phase 2C-A type freeze) — an internal
 * WLT normalization consistency rule, NOT a Labuan FSA-prescribed threshold: a screened result
 * claiming `sanctionsExposure === true` must also carry `riskStatus === "hit"` AND `riskCategories`
 * including `"sanctions"`, or the result is not trustworthy and must fail closed to
 * `invalid_response`. `riskStatus === "hit"` MAY legitimately carry `riskScore === null` — a
 * sanctions hit is a categorical signal, never a fabricated numeric score.
 */
export function isSanctionsConsistent(result: Pick<NormalizedScreeningResult, "sanctionsExposure" | "riskStatus" | "riskCategories">): boolean {
  if (result.sanctionsExposure !== true) return true;
  return result.riskStatus === "hit" && result.riskCategories.includes("sanctions");
}

/**
 * `kind: "screened"` — the provider completed a screen; `result` is fully normalized. `kind:
 * "unavailable"` — the provider could not be reached or declined to answer (network error,
 * timeout, 5xx-equivalent). `kind: "invalid_response"` — the provider responded but its response
 * could not be normalized/trusted (malformed body, or a raw category outside `RISK_CATEGORIES`) —
 * DISTINCT from `unavailable` so a later operator can tell "vendor down" from "vendor answered
 * something we cannot trust" apart. Both fail closed identically today (never `clear`) — no
 * business-policy threshold of any kind is implied by either variant.
 */
export type WalletScreeningOutcome =
  | { kind: "screened"; result: NormalizedScreeningResult }
  | { kind: "unavailable"; reasonCode: string }
  | { kind: "invalid_response"; reasonCode: string };

/**
 * Phase 2C-D3A — the input a version-addressed adaptor's own `normalizeReceipt` receives. Contains
 * ONLY provider-native receipt evidence and the server-owned context already established BEFORE
 * normalization runs (D2's own authenticated, replay/conflict-classified receipt) — never a
 * secret, never the raw request body, never client/destination identity, never the current
 * (as opposed to historical/frozen) provider configuration. `result` is the receipt's own
 * `result` field, entirely unparsed/untyped from this contract's point of view — the adaptor
 * alone knows how to interpret it for its own exact version. */
export interface ReceiptNormalizationInput {
  result: unknown;
  screeningReferenceId: string;
  providerResultId: string;
}

/**
 * Phase 2C-D3A — mirrors `WalletScreeningOutcome`'s own discriminated-result convention exactly
 * (never throws for an ordinary invalid-input case; a genuinely unexpected implementation bug may
 * still throw, which the caller treats as `invalid`). `kind: "normalized"` carries a
 * fully-validated `NormalizedScreeningResult` — but the ADAPTOR is responsible only for shape/
 * category/risk-status validity; TEMPORAL and sanctions-consistency validation is layered on by
 * the caller via the SAME shared validator `lib/screening-application.ts` exports and uses for the
 * synchronous path, never duplicated here. `kind: "invalid"` means the provider-native `result`
 * could not be normalized at all (malformed structure, unmapped category, unmapped risk status,
 * or an echoed `providerResultId` — if the adaptor's own format carries one internally — that does
 * not match the `input.providerResultId` context); `reasonCode` is a bounded, non-sensitive
 * diagnostic string, never raw provider content. */
export type ReceiptNormalizationOutcome = { kind: "normalized"; result: NormalizedScreeningResult } | { kind: "invalid"; reasonCode: string };

export interface WalletAnalyticsProvider {
  /** Stable identity stored in `wlt1.chain_coverage.provider_id` / `wlt1.wallet_screening_result.provider_id`. */
  readonly providerId: string;
  /** This adaptor's own implementation version, stored in `wallet_screening_result.provider_adaptor_version` — distinct from any future provider-reported list/data version. */
  readonly adaptorVersion: string;
  screen(input: WalletScreeningInput): Promise<WalletScreeningOutcome>;
  /**
   * Phase 2C-D3A — OPTIONAL: not every version-addressed adaptor supports asynchronous receipt
   * ingestion (a historical adaptor version predating receipt support legitimately has none; the
   * caller treats an absent method identically to an unresolvable adaptor version —
   * `adaptor_version_unavailable`, never a silent skip). MUST be pure, synchronous, and entirely
   * local: no network call, no database access, no mutation of any server state, no wall-clock
   * read (temporal fields are validated by the CALLER's shared validator, using the caller's own
   * clock — never the adaptor's). The receipt itself must carry every fact normalization needs;
   * this method may never reach out to "resolve" anything.
   */
  normalizeReceipt?(input: ReceiptNormalizationInput): ReceiptNormalizationOutcome;
}
