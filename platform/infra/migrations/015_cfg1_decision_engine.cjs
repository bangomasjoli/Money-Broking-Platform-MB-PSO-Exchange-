/* eslint-disable camelcase */

/**
 * 015_cfg1_decision_engine — CFG-01 Phase 2 runtime decision engine tables (blueprint
 * `05_Database_Design.md` §2.5/§2.6; approved Phase 2 scope).
 *
 * Creates `cfg1.feature_decision_log` and `cfg1.feature_decision_token` ONLY. No mutation
 * workflow, no kill-switch, no `feature`/`feature_version` seed data — Phase 1's `feature`
 * table remains empty (approved decision #5); this migration adds no rows to it.
 *
 * ---------------------------------------------------------------------------------------
 * F-1 CLOSURE — VERIFICATION, NOT REWRITE.
 * ---------------------------------------------------------------------------------------
 * `014_cfg1_core.cjs` is an already-applied migration on any environment that ran Phase 1 —
 * editing it in place would not re-run there. F-1's actual code fix lives in
 * `services/cfg1/src/lib/canonical.ts` (new `codePointCompare`) and everywhere that used
 * `String.prototype.localeCompare` for hash-relevant ordering (`doc00-baseline.ts`,
 * `integrity-seal.ts`). This migration's job is to PROVE — not assume — that the codepoint
 * comparator produces the SAME scope hashes as the `localeCompare`-computed hashes migration
 * 014 already seeded, on the REAL data in this database. If a future environment's data or
 * Doc00 baseline ever caused the two orderings to diverge, this migration fails loudly
 * (`throw`) rather than silently leaving a database whose seals no longer agree with the
 * corrected comparator. This is a genuine re-verification against live rows, not a hardcoded
 * assertion — it duplicates the exact same canonical-JSON/codepoint-ordering algorithm
 * `integrity-seal.ts` now uses (this migration cannot import TypeScript service source without
 * a build step, the same constraint 014 already documented) and queries the actual seeded
 * rows via `pgm.db.query`.
 */

const crypto = require("node:crypto");

function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Prefixed(value) {
  return "sha256:" + sha256Hex(value);
}

/** Byte-identical to services/cfg1/src/lib/canonical.ts's codePointCompare (F-1 closure). */
function codePointCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const DOC00_SOURCE_VERSION = "v1.3";

// Byte-identical to services/cfg1/src/lib/doc00-baseline.ts — see that file for the single
// source-of-truth rationale. Only what's needed to recompute the Doc00 baseline hash.
const DOC00_LICENCE_PROFILES = [
  { licence_code: "MB", licence_status: "approved", authority: "LFSA" },
  { licence_code: "PSO", licence_status: "approved", authority: "LFSA" },
  { licence_code: "EXCHANGE", licence_status: "pending", authority: "LFSA" },
];

const DOC00_PROHIBITED_FEATURES = [
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

// Allow-list fields, byte-identical to services/cfg1/src/lib/integrity-seal.ts's hash inputs.
function licenceProfileRowForHash(row) {
  return {
    licence_profile_id: row.licence_profile_id,
    licence_code: row.licence_code,
    licence_status: row.licence_status,
    authority: row.authority,
    evidence_ref: row.evidence_ref ?? null,
    evidence_authenticity_status: row.evidence_authenticity_status,
    version: row.version,
    status: row.status,
  };
}

function prohibitedFeatureRowForHash(row) {
  return {
    prohibited_feature_id: row.prohibited_feature_id,
    feature_code: row.feature_code,
    prohibition_reason: row.prohibition_reason,
    prohibition_source: row.prohibition_source,
    applies_until: row.applies_until,
    status: row.status,
    version: row.version,
  };
}

exports.up = async (pgm) => {
  pgm.sql(`
    -- §2.5 feature_decision_log — append-only decision evidence. No UPDATE/DELETE grant is
    -- ever given to role_cfg1_runtime for this table (see infra/grants/cfg1_runtime_grants.sql)
    -- — same append-only posture as sec1.audit_event.
    CREATE TABLE cfg1.feature_decision_log (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_log_id               varchar(64) NOT NULL UNIQUE,
      decision_id                   varchar(64) NOT NULL UNIQUE,
      feature_code                  varchar(128) NOT NULL,
      action                        varchar(128) NOT NULL,
      resource                      varchar(64),
      caller_module                 varchar(64) NOT NULL,
      client_id                     varchar(64),
      client_class                  varchar(32),
      environment                   varchar(16) NOT NULL,
      requested_config_version      int,
      decision                      varchar(16) NOT NULL CHECK (decision IN ('allow','deny')),
      reason_code                   varchar(32) NOT NULL,
      feature_config_version        int,
      licence_profile_version       int,
      prohibited_registry_version   int,
      prohibited_registry_hash      varchar(128),
      doc00_source_version          varchar(16),
      integrity_status              varchar(16) NOT NULL CHECK (integrity_status IN ('verified','failed')),
      payload_hash                  varchar(128) NOT NULL,
      audit_event_ref                varchar(128),
      request_id                     varchar(128) NOT NULL,
      correlation_id                  varchar(128) NOT NULL,
      occurred_at_utc                  timestamptz NOT NULL,
      created_at_utc                    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_cfg1_feature_decision_log_feature_occurred ON cfg1.feature_decision_log (feature_code, occurred_at_utc);
    CREATE INDEX idx_cfg1_feature_decision_log_correlation ON cfg1.feature_decision_log (correlation_id);

    -- §2.6 feature_decision_token — short-lived, bounded-reuse decision credential (approved
    -- decision #1: NOT single-use). Only ever issued for decision='allow' (a deny returns no
    -- token — CHECK enforces this structurally, not just by application discipline). token_hash
    -- only — the raw token is NEVER persisted (approved decision #12), same hash-only-at-rest
    -- convention as iam.session_token_hash / iam2.permission_decision_token.token_hash.
    CREATE TABLE cfg1.feature_decision_token (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id                      varchar(64) NOT NULL UNIQUE,
      decision_id                   varchar(64) NOT NULL,
      token_hash                    varchar(128) NOT NULL UNIQUE,
      feature_code                  varchar(128) NOT NULL,
      action                        varchar(128) NOT NULL,
      resource                      varchar(64),
      caller_module                 varchar(64) NOT NULL,
      client_id                     varchar(64),
      client_class                  varchar(32),
      environment                   varchar(16) NOT NULL,
      decision                      varchar(16) NOT NULL CHECK (decision IN ('allow')),
      reason_code                   varchar(32) NOT NULL,
      feature_config_version        int,
      licence_profile_version       int NOT NULL,
      prohibited_registry_version   int NOT NULL,
      prohibited_registry_hash      varchar(128) NOT NULL,
      doc00_source_version          varchar(16) NOT NULL,
      payload_hash                  varchar(128) NOT NULL,
      -- No 'expired'/'consumed' value: expiry is a DERIVED state (compared against
      -- expires_at_utc at verify time), never written by any code path this phase — a token is
      -- bounded-reuse (approved decision #1), not consumed-on-first-use. 'revoked' is written
      -- the moment any verify-decision mismatch is found (approved decision #3).
      status                        varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      expires_at_utc                timestamptz NOT NULL,
      revoked_at_utc                 timestamptz,
      revoked_reason                  varchar(32),
      last_verified_at_utc             timestamptz,
      created_at_utc                    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_cfg1_feature_decision_token_decision_id ON cfg1.feature_decision_token (decision_id);
    CREATE INDEX idx_cfg1_feature_decision_token_feature_code ON cfg1.feature_decision_token (feature_code);
    CREATE INDEX idx_cfg1_feature_decision_token_expires ON cfg1.feature_decision_token (expires_at_utc);
    CREATE INDEX idx_cfg1_feature_decision_token_status ON cfg1.feature_decision_token (status);
  `);

  // ===========================================================================================
  // F-1 CLOSURE VERIFICATION — real query against the live database, not an assumption.
  // ===========================================================================================
  const licenceRowsResult = await pgm.db.query(
    `SELECT licence_profile_id, licence_code, licence_status, authority, evidence_ref, evidence_authenticity_status, version, status
     FROM cfg1.licence_profile`,
  );
  const prohibitedRowsResult = await pgm.db.query(
    `SELECT prohibited_feature_id, feature_code, prohibition_reason, prohibition_source, applies_until, status, version
     FROM cfg1.prohibited_feature`,
  );
  const sealsResult = await pgm.db.query(
    `SELECT config_scope, config_hash, doc00_baseline_hash, doc00_source_version
     FROM cfg1.config_integrity_seal WHERE status = 'active'`,
  );

  const licenceRows = licenceRowsResult.rows;
  const prohibitedRows = prohibitedRowsResult.rows;
  const seals = sealsResult.rows;

  const licenceScopeHashCodepoint = sha256Prefixed(
    canonicalJson([...licenceRows].sort((a, b) => codePointCompare(a.licence_code, b.licence_code)).map(licenceProfileRowForHash)),
  );
  const prohibitedScopeHashCodepoint = sha256Prefixed(
    canonicalJson([...prohibitedRows].sort((a, b) => codePointCompare(a.feature_code, b.feature_code)).map(prohibitedFeatureRowForHash)),
  );
  const doc00HashCodepoint = sha256Prefixed(
    canonicalJson({
      doc00_source_version: DOC00_SOURCE_VERSION,
      licence_profiles: [...DOC00_LICENCE_PROFILES].sort((a, b) => codePointCompare(a.licence_code, b.licence_code)),
      prohibited_features: [...DOC00_PROHIBITED_FEATURES]
        .map((f) => ({ feature_code: f.feature_code, prohibition_reason: f.prohibition_reason, prohibition_source: f.prohibition_source, applies_until: f.applies_until }))
        .sort((a, b) => codePointCompare(a.feature_code, b.feature_code)),
    }),
  );

  const licenceSeal = seals.find((s) => s.config_scope === "licence_profile");
  const prohibitedSeal = seals.find((s) => s.config_scope === "prohibited_registry");

  const problems = [];
  if (!licenceSeal) {
    problems.push("no active licence_profile seal found");
  } else if (licenceSeal.config_hash !== licenceScopeHashCodepoint) {
    problems.push(
      `licence_profile scope hash under codepoint ordering (${licenceScopeHashCodepoint}) does not match the active Phase 1 seal (${licenceSeal.config_hash}) — F-1 divergence detected on real data`,
    );
  } else if (licenceSeal.doc00_baseline_hash !== doc00HashCodepoint) {
    problems.push(
      `licence_profile seal's doc00_baseline_hash (${licenceSeal.doc00_baseline_hash}) does not match the codepoint-ordered vendored Doc00 hash (${doc00HashCodepoint})`,
    );
  } else if (licenceSeal.doc00_source_version !== DOC00_SOURCE_VERSION) {
    problems.push(`licence_profile seal's doc00_source_version (${licenceSeal.doc00_source_version}) does not match vendored ${DOC00_SOURCE_VERSION}`);
  }

  if (!prohibitedSeal) {
    problems.push("no active prohibited_registry seal found");
  } else if (prohibitedSeal.config_hash !== prohibitedScopeHashCodepoint) {
    problems.push(
      `prohibited_registry scope hash under codepoint ordering (${prohibitedScopeHashCodepoint}) does not match the active Phase 1 seal (${prohibitedSeal.config_hash}) — F-1 divergence detected on real data`,
    );
  } else if (prohibitedSeal.doc00_baseline_hash !== doc00HashCodepoint) {
    problems.push(
      `prohibited_registry seal's doc00_baseline_hash (${prohibitedSeal.doc00_baseline_hash}) does not match the codepoint-ordered vendored Doc00 hash (${doc00HashCodepoint})`,
    );
  } else if (prohibitedSeal.doc00_source_version !== DOC00_SOURCE_VERSION) {
    problems.push(`prohibited_registry seal's doc00_source_version (${prohibitedSeal.doc00_source_version}) does not match vendored ${DOC00_SOURCE_VERSION}`);
  }

  if (problems.length > 0) {
    // Fail closed rather than proceed on a database whose Phase 1 seals would no longer verify
    // under the corrected (codepoint) comparator — this is precisely the class of divergence
    // F-1 exists to catch, so if it is ever real, the migration itself must refuse to continue.
    throw new Error(`015_cfg1_decision_engine F-1 verification failed:\n  - ${problems.join("\n  - ")}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    "015_cfg1_decision_engine: F-1 verification passed — codepoint-ordered recomputation matches the existing Phase 1 seals and vendored Doc00 baseline exactly (localeCompare and codepoint order agreed on this data; no live divergence existed, confirming the earlier Opus finding was latent, not active).",
  );
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS cfg1.feature_decision_token;
    DROP TABLE IF EXISTS cfg1.feature_decision_log;
  `);
};
