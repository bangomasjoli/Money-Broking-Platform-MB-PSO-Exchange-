/**
 * Vendored canonical extraction of `00_Licence_Scope_And_Feature_Lock_v1.3.md`'s licence-status
 * and prohibited-scope facts — approved decisions #3/#4/#5 (CFG-01 Phase 1 planning): CFG-01
 * must NOT hash the live `aix-platform-docs` markdown file at runtime (a production deployment
 * that only ships the `aix-platform` code repo would not have that file, and Doc00's own
 * prose/formatting can change without its LICENCE FACTS changing — hashing the file bytes would
 * make the seal brittle to irrelevant edits). Instead, the specific facts CFG-01 actually needs
 * to enforce are extracted ONCE into this versioned, in-repo constant and hashed deterministically
 * from there.
 *
 * `DOC00_SOURCE_VERSION` must be bumped by hand, with this file's contents re-derived from the
 * new Doc00 version, whenever `00_Licence_Scope_And_Feature_Lock` is revised in a way that
 * changes licence status or the prohibited-feature scope — there is no automated sync
 * mechanism, the same "kept in sync by the operator" caveat every other cross-repo/cross-service
 * constant in this codebase already carries (e.g. SEC-01's `SEC1_INGEST_TOKEN_*` env vars vs.
 * services/iam's own token).
 *
 * `infra/migrations/014_cfg1_core.cjs` duplicates BOTH of the constants below, byte-for-byte, in
 * plain JS (a migration cannot import TypeScript service source without a build step) — kept
 * deliberately in sync by hand; `tests/unit/cfg1-doc00-baseline.test.ts` and the readiness
 * integration test are what actually prove the two copies still agree, not a shared import.
 */
import { canonicalJson, codePointCompare, sha256Prefixed } from "./canonical.js";

export const DOC00_SOURCE_VERSION = "v1.3";

export interface Doc00LicenceProfileFact {
  licence_code: "MB" | "PSO" | "EXCHANGE";
  licence_status: "approved" | "pending";
  authority: string;
}

/** Doc00 §3 "Current Licence Status" table, verbatim. */
export const DOC00_LICENCE_PROFILES: readonly Doc00LicenceProfileFact[] = [
  { licence_code: "MB", licence_status: "approved", authority: "LFSA" },
  { licence_code: "PSO", licence_status: "approved", authority: "LFSA" },
  { licence_code: "EXCHANGE", licence_status: "pending", authority: "LFSA" },
];

export interface Doc00ProhibitedFeatureFact {
  feature_code: string;
  prohibition_reason: string;
  prohibition_source: string;
  applies_until: string;
}

/**
 * The approved 30-code reconciled prohibited-feature registry (blueprint
 * `07_Permission_Rules.md` §7's 19 codes + Doc00 §8 "Prohibited Scope" / §9.2 "Disabled Feature
 * Flags" derived additions) — see `infra/migrations/014_cfg1_core.cjs`'s header comment for the
 * `applies_until` reasoning (5 codes are Exchange-approval-pending-only; the rest, including
 * `exchange.market_maker`/`exchange.principal_dealing`, are permanent MB-module-inherent
 * restrictions).
 */
export const DOC00_PROHIBITED_FEATURES: readonly Doc00ProhibitedFeatureFact[] = [
  { feature_code: "exchange.public_order_book", prohibition_reason: "Exchange application pending; AIX public order book locked (Doc00 §6)", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval" },
  { feature_code: "exchange.matching_engine", prohibition_reason: "Exchange application pending; internal matching engine locked (Doc00 §6)", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval" },
  { feature_code: "exchange.client_to_client_matching", prohibition_reason: "Exchange application pending; client-to-client matching locked (Doc00 §6)", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval" },
  { feature_code: "exchange.public_exchange_trading", prohibition_reason: "Exchange application pending; public exchange trading locked (Doc00 §6)", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval" },
  { feature_code: "exchange.public_market_depth", prohibition_reason: "Exchange application pending; AIX market depth as exchange locked (Doc00 §6)", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval" },
  { feature_code: "exchange.market_maker", prohibition_reason: "Market making blocked; not Money Broking MVP scope (Doc00 §8.1, MSR LIC-RULE-003)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "exchange.principal_dealing", prohibition_reason: "Principal dealing blocked; AIX acts as broker/intermediary only (Doc00 §4.1/§8.1, MSR LIC-RULE-003)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "pricing.aix_spread_markup", prohibition_reason: "Revenue model is disclosed brokerage fee only; spread markup prohibited (Doc00 §4.2, MSR LIC-RULE-004)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "onboarding.retail_default", prohibition_reason: "MVP client type scope is institutional/HNWI-professional only; retail onboarding disabled by default (Doc00 §10.2A, MSR CLT-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "audit.bypass", prohibition_reason: "Audit log must be append-only and tamper-evident; bypass prohibited (Doc00 §10.9, MSR SEC-RULE-002)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "permission.bypass", prohibition_reason: "Backend permission guard is the source of truth; bypass prohibited (MSR SYS-RULE-002)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "kyc.bypass", prohibition_reason: "KYC/KYB approval required before any transaction (MSR AML-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "aml.bypass", prohibition_reason: "AML status must be checked before trade booking and withdrawal (Doc00 §10.3)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "travel_rule.bypass", prohibition_reason: "Travel Rule enforcement required for digital asset transfers (MSR TR-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "ledger.direct_edit", prohibition_reason: "Direct ledger editing prohibited; double-entry ledger required (MSR LED-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "balance.direct_edit", prohibition_reason: "Client balance must be derived from ledger; direct balance edit prohibited (MSR LED-RULE-002)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "client_approval.bypass", prohibition_reason: "Client-side dual authorization required for sensitive actions (MSR CLT-RULE-003)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "lp_settlement_approval.bypass", prohibition_reason: "LP settlement payment requires maker-checker approval (MSR LP-RULE-004)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "break_glass_logging.bypass", prohibition_reason: "Break-glass access must be heightened-audit logged, never silent (MSR SEC-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "securities.token_trading", prohibition_reason: "Securities token trading requires separate approval; not approved for MB MVP (Doc00 §8.1, MSR ASSET-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "advisory.investment_unlicensed", prohibition_reason: "Investment advice requires separate licensing; not part of approved MB/PSO scope (Doc00 §1/§5)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "custody.self_custody_wallet", prohibition_reason: "Self-custody wallet service prohibited; third-party custody model required (Doc00 §8.2)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "credit.lending_borrowing", prohibition_reason: "Lending or borrowing of client assets prohibited in MVP (Doc00 §8.1)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "derivatives.trading", prohibition_reason: "Derivatives trading prohibited in MVP (Doc00 §8.1, MSR ASSET-RULE-001)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "trading.margin_leverage", prohibition_reason: "Margin trading for digital assets prohibited in MVP (Doc00 §8.1)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "product.staking", prohibition_reason: "Staking service prohibited in MVP (Doc00 §8.1)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "product.yield_earn", prohibition_reason: "Yield/earn product prohibited in MVP (Doc00 §8.1)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "pricing.internal_fallback", prohibition_reason: "No internal fallback pricing; LP outage must fail closed (Doc00 §7.4/§9.2, MSR LP-RULE-002)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "inventory.internal_account", prohibition_reason: "AIX inventory limit is zero; no naked or internal inventory position (Doc00 §4.1/§4.3)", prohibition_source: "Doc00", applies_until: "permanent" },
  { feature_code: "liquidity.synthetic", prohibition_reason: "Liquidity model is external-LP-backed only; no synthetic or internal liquidity (Doc00 §7.5)", prohibition_source: "Doc00", applies_until: "permanent" },
];

if (DOC00_PROHIBITED_FEATURES.length !== 30) {
  // Structural self-check: this constant must always carry exactly the approved 30-code
  // registry. A future accidental edit that added/removed a row without updating this count
  // fails at import time rather than silently seeding/verifying an incomplete registry.
  throw new Error(
    `doc00-baseline.ts invariant violated: expected exactly 30 approved prohibited-feature codes, found ${DOC00_PROHIBITED_FEATURES.length}.`,
  );
}

/**
 * The Doc00 baseline hash — sha256 over the SAME canonical facts
 * `infra/migrations/014_cfg1_core.cjs` computes at seed time (see that file's header). Rows are
 * sorted by their own stable code before hashing so the result is reproducible regardless of
 * this array's literal declaration order.
 *
 * Phase 2 F-1 closure: ordering uses `codePointCompare`, not `String.prototype.localeCompare` —
 * see `canonical.ts`'s header comment on `codePointCompare` for why a locale-dependent
 * comparator is unsafe for a hash that must agree between a migration (seed time) and this
 * service (decision time), potentially on different hosts.
 */
export function computeDoc00BaselineHash(): string {
  return sha256Prefixed(
    canonicalJson({
      doc00_source_version: DOC00_SOURCE_VERSION,
      licence_profiles: [...DOC00_LICENCE_PROFILES].sort((a, b) => codePointCompare(a.licence_code, b.licence_code)),
      prohibited_features: [...DOC00_PROHIBITED_FEATURES]
        .map((f) => ({
          feature_code: f.feature_code,
          prohibition_reason: f.prohibition_reason,
          prohibition_source: f.prohibition_source,
          applies_until: f.applies_until,
        }))
        .sort((a, b) => codePointCompare(a.feature_code, b.feature_code)),
    }),
  );
}
