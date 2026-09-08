/* eslint-disable camelcase */

/**
 * 014_cfg1_core — CFG-01 Feature Flag / Licence Lock, Phase 1 core registries + sealed baseline
 * (blueprint `05_Database_Design.md`; approved Phase 1 scope).
 *
 * Creates schema `cfg1` and the 5 tables the approved Phase 1 scope covers: `licence_profile`,
 * `feature`, `prohibited_feature`, `feature_version`, `config_integrity_seal`. Deliberately does
 * NOT create `feature_state_change`, `feature_decision_log`, `feature_decision_token`,
 * `kill_switch`, `deployment_gate_check`, `handoff_reconciliation`, `exchange_activation_
 * ceremony`, `feature_gate_mapping`, `out_of_band_change_finding`, or `audit_outage_mode` — all
 * belong to later, explicitly deferred phases (runtime decision engine, change workflow,
 * kill-switch, deployment gate, reconciliation, Exchange activation ceremony, audit-outage
 * mode), mirroring how 008_sec1_core.cjs phased SEC-01's own schema.
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALLS (documentation-artifact + trimmed-column-set decisions, approved before
 * coding — see CFG-01 Phase 1 planning notes):
 * ---------------------------------------------------------------------------------------
 *   - `05_Database_Design.md` §2.1 lists `signature_ref` and `doc00_baseline_hash` TWICE each
 *     on `cfg1.licence_profile` — a documentation duplication, not two distinct columns. Each
 *     is defined exactly once below.
 *   - The blueprint also lists BOTH `registry_hash` ("Registry hash") and `config_hash`
 *     ("Signed config hash") on `licence_profile` — the same duplication pattern applied to a
 *     different pair of near-identical names. Only `config_hash` is implemented (a per-row
 *     content hash, consistent naming with `config_integrity_seal.config_hash`'s scope-level
 *     hash); `registry_hash` is treated as the same documentation artifact as above.
 *   - `evidence_verification_source`, `evidence_verified_by`, `effective_from_utc`,
 *     `effective_to_utc` (present in the blueprint's full `licence_profile` column list) are
 *     deliberately NOT added this phase — nothing in Phase 1 populates or reads them (no real
 *     evidence-verification workflow exists yet; that is Phase 5's Exchange Activation
 *     Ceremony or a future licence-profile-change workflow's job). Added only when a real
 *     caller needs them, per the same "only add what this stage's code can actually use"
 *     discipline every prior module's own first schema slice followed.
 *
 * ---------------------------------------------------------------------------------------
 * RLS DESIGN — NONE of these 5 tables have row-level security.
 * ---------------------------------------------------------------------------------------
 * All 5 are either global catalogues/state with no single "owner" row (`licence_profile`,
 * `feature`, `prohibited_feature`, `config_integrity_seal`) or an append-only version-history
 * table (`feature_version`) — mirrors `iam2.role`/`iam2.permission`/`iam2.sod_rule` (no RLS,
 * global catalogue) and `iam2.approval_request`/`sec1.audit_event` (no RLS, evidence/audit-
 * trail table), neither of which carry RLS for the identical reason. Access control for a real
 * read/write surface is an application-layer / IAM-02-permission-guard concern for later
 * phases, not a per-row DB ownership concept these tables have.
 *
 * STRUCTURAL IMMUTABILITY (Phase 1, no mutation workflow exists yet): enforced by GRANT, not by
 * a trigger or CHECK constraint — `role_cfg1_runtime` receives SELECT-only on all 5 tables (see
 * infra/grants/cfg1_runtime_grants.sql). A `role_cfg1_runtime`-connected caller cannot INSERT,
 * UPDATE, or DELETE any row in this schema, proven directly under the real runtime role in
 * `tests/integration/cfg1-db.test.ts`, not merely by the absence of a mutation route.
 *
 * AT-MOST-ONE-ACTIVE-SEAL-PER-SCOPE: enforced structurally by a partial unique index on
 * `config_integrity_seal (config_scope) WHERE status = 'active'` — the DB itself cannot hold two
 * simultaneously-active seals for the same scope, independent of any application-level check.
 * The readiness route's own "duplicate active seal" check (services/cfg1/src/lib/
 * integrity-seal.ts) is deliberate defense-in-depth on top of this constraint, per blueprint
 * §5.4A rule 6: "migration/DBA/infra writes must not become trusted until reconciled" — an
 * out-of-band write by a superuser (who is not bound by ordinary grants) could still violate an
 * index constraint only by dropping it first, which is a detectable, auditable act in itself,
 * but the readiness check does not assume the constraint can never be bypassed.
 *
 * SEED DATA (catalogue/licence-baseline data, not business data — appropriate to seed in a
 * migration, same precedent as SEC-01's `event_schema`/`source_identity_binding` seed rows):
 *   - `licence_profile`: exactly 3 rows (MB approved, PSO approved, EXCHANGE pending), computed
 *     from the SAME vendored Doc00 baseline constant (`services/cfg1/src/lib/doc00-baseline.ts`)
 *     the readiness route recomputes against at request time — this migration duplicates the
 *     canonical-JSON + sha256 algorithm inline (plain JS; migrations cannot import the service's
 *     TypeScript source without a build step) so the seeded `config_hash`/`doc00_baseline_hash`
 *     values are byte-identical to what the TypeScript library independently recomputes. This is
 *     PROVEN, not merely asserted: `tests/integration/cfg1-db.test.ts`'s "readiness clean state
 *     returns 200" test is the actual cross-check between the two copies.
 *   - `prohibited_feature`: exactly 30 rows, the full approved registry (see inline list below),
 *     all `status='active'`.
 *   - `config_integrity_seal`: exactly 2 rows (`config_scope='licence_profile'`,
 *     `config_scope='prohibited_registry'`), both `status='active'`, `config_version=1`.
 *   - `feature` / `feature_version`: created empty. Populating the ~25 ordinary MVP business
 *     feature flags (client onboarding, KYC, OTC/RFQ, ...) is deferred to whichever later phase
 *     first builds the runtime decision engine or change workflow that actually consumes them —
 *     Phase 1's job is the licence-lock baseline, not the full feature catalogue.
 *
 * GRANTS: see infra/grants/cfg1_runtime_grants.sql (separate file, applied by a privileged
 * role, same convention as fnd/iam/iam2/sec1).
 */

const crypto = require("node:crypto");

/**
 * Duplicated, byte-identical algorithm to services/cfg1/src/lib/canonical.ts's `canonicalJson`
 * — see that file's header comment for why a migration cannot import TypeScript service source.
 * Recursive lexicographic key sort at every nesting depth; array order preserved (meaningful).
 */
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

/** Single-quote SQL string-literal escaping for migration-authored constant strings. */
function sqlLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const DOC00_SOURCE_VERSION = "v1.3";

// Byte-identical to services/cfg1/src/lib/doc00-baseline.ts's DOC00_LICENCE_PROFILES — see that
// file's header for the single source-of-truth rationale (this migration duplicates the DATA,
// not just the algorithm, for the same "no cross-language import" reason).
const DOC00_LICENCE_PROFILES = [
  { licence_code: "MB", licence_status: "approved", authority: "LFSA" },
  { licence_code: "PSO", licence_status: "approved", authority: "LFSA" },
  { licence_code: "EXCHANGE", licence_status: "pending", authority: "LFSA" },
];

// Byte-identical to services/cfg1/src/lib/doc00-baseline.ts's DOC00_PROHIBITED_FEATURES — the
// full approved 30-code registry. `applies_until`: the 5 codes that are genuinely locked ONLY
// because Exchange approval is pending use 'until_formal_exchange_licence_approval' (Doc00 §6);
// `exchange.market_maker` and `exchange.principal_dealing` use 'permanent' even though they
// share the exchange.* namespace, because Doc00 §4.1/§8.1 and Master System Rules LIC-RULE-003
// frame market-making/principal-dealing as permanent MB-module-inherent restrictions, not
// restrictions that lapse when Exchange is approved — a deliberate distinction, not an
// oversight. Every other code is 'permanent' (MVP-scope business-model restrictions that would
// require a new licence-scope document revision, not merely the Phase 5 Exchange ceremony, to
// ever lift).
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

if (DOC00_PROHIBITED_FEATURES.length !== 30) {
  throw new Error(
    `014_cfg1_core migration invariant violated: expected exactly 30 approved prohibited-feature codes, found ${DOC00_PROHIBITED_FEATURES.length}. Fail closed rather than seed an incomplete registry.`,
  );
}

// Allow-list fields bound into each seal's hash — mirrors services/cfg1/src/lib/
// integrity-seal.ts exactly (explicit field list, never a raw row dump; excludes mutable
// runtime-only fields like created_at_utc/updated_at_utc/last_integrity_check_utc so a
// readiness call can never invalidate its own seal).
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

exports.up = (pgm) => {
  const nowIso = new Date().toISOString();

  // Build full seed row objects first (so the per-row/scope hashes are computed against
  // EXACTLY what gets inserted, not a re-derived approximation).
  const licenceProfileRows = DOC00_LICENCE_PROFILES.map((p, i) => ({
    licence_profile_id: `licprof_${p.licence_code.toLowerCase()}`,
    licence_code: p.licence_code,
    licence_status: p.licence_status,
    authority: p.authority,
    evidence_ref: null,
    evidence_authenticity_status: "unverified",
    version: 1,
    status: "active",
    seedOrder: i,
  }));

  const prohibitedFeatureRows = DOC00_PROHIBITED_FEATURES.map((f) => ({
    prohibited_feature_id: `prohfeat_${f.feature_code.replace(/\./g, "_")}`,
    feature_code: f.feature_code,
    prohibition_reason: f.prohibition_reason,
    prohibition_source: f.prohibition_source,
    applies_until: f.applies_until,
    status: "active",
    version: 1,
  }));

  // Doc00 baseline hash: sha256 over the SAME canonical facts services/cfg1/src/lib/
  // doc00-baseline.ts's computeDoc00BaselineHash() computes — rows sorted by their own code so
  // the hash is reproducible regardless of array-literal order.
  const doc00BaselineHash = sha256Prefixed(
    canonicalJson({
      doc00_source_version: DOC00_SOURCE_VERSION,
      licence_profiles: [...DOC00_LICENCE_PROFILES].sort((a, b) => a.licence_code.localeCompare(b.licence_code)),
      prohibited_features: [...DOC00_PROHIBITED_FEATURES]
        .map((f) => ({ feature_code: f.feature_code, prohibition_reason: f.prohibition_reason, prohibition_source: f.prohibition_source, applies_until: f.applies_until }))
        .sort((a, b) => a.feature_code.localeCompare(b.feature_code)),
    }),
  );

  // Per-row content hash for each licence_profile row (defence-in-depth below the scope-level
  // seal — see migration header).
  const licenceProfileConfigHashes = licenceProfileRows.map((r) => sha256Prefixed(canonicalJson(licenceProfileRowForHash(r))));

  // Scope-level seal hashes — canonical JSON over the array of allow-listed rows, ordered by
  // the row's own stable business key ascending.
  const licenceProfileScopeHash = sha256Prefixed(
    canonicalJson([...licenceProfileRows].sort((a, b) => a.licence_code.localeCompare(b.licence_code)).map(licenceProfileRowForHash)),
  );
  const prohibitedRegistryScopeHash = sha256Prefixed(
    canonicalJson([...prohibitedFeatureRows].sort((a, b) => a.feature_code.localeCompare(b.feature_code)).map(prohibitedFeatureRowForHash)),
  );

  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS cfg1;

    -- §2.1 licence_profile — licence-lock source of truth (approved Phase 1 trimmed column set;
    -- see migration header for the deferred/duplicate-artifact columns).
    CREATE TABLE cfg1.licence_profile (
      id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      licence_profile_id              varchar(64) NOT NULL UNIQUE,
      licence_code                    varchar(16) NOT NULL UNIQUE
                                         CHECK (licence_code IN ('MB','PSO','EXCHANGE')),
      licence_status                  varchar(16) NOT NULL
                                         CHECK (licence_status IN ('approved','pending','locked','suspended','revoked','retired')),
      authority                       varchar(32) NOT NULL,
      evidence_ref                    varchar(128),
      evidence_authenticity_status    varchar(16) NOT NULL DEFAULT 'unverified'
                                         CHECK (evidence_authenticity_status IN ('unverified','verified','rejected')),
      version                         int NOT NULL DEFAULT 1,
      config_hash                     varchar(128) NOT NULL,
      doc00_baseline_hash             varchar(128) NOT NULL,
      status                          varchar(16) NOT NULL DEFAULT 'active'
                                         CHECK (status IN ('active','inactive','superseded')),
      approved_ref                    varchar(128),
      sec_audit_ref                   varchar(128),
      signed_change_ref               varchar(128),
      signature_ref                   varchar(128),
      last_integrity_check_utc        timestamptz,
      created_at_utc                  timestamptz NOT NULL DEFAULT now(),
      updated_at_utc                  timestamptz NOT NULL DEFAULT now()
    );

    -- §2.2 feature — canonical business-feature registry. Created empty this phase (see
    -- migration header). licence_profile_id is a soft reference (no FK) — the exact
    -- cross-reference shape is a Phase 2/3 decision, made when real feature rows first exist.
    CREATE TABLE cfg1.feature (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      feature_id            varchar(64) NOT NULL UNIQUE,
      feature_code          varchar(128) NOT NULL UNIQUE,
      feature_name          varchar(256) NOT NULL,
      current_state         varchar(16) NOT NULL DEFAULT 'disabled'
                               CHECK (current_state IN ('enabled','disabled','locked','prohibited')),
      licence_profile_id    varchar(64),
      version                int NOT NULL DEFAULT 1,
      created_at_utc         timestamptz NOT NULL DEFAULT now(),
      updated_at_utc         timestamptz NOT NULL DEFAULT now()
    );

    -- §2.3 prohibited_feature — hard-blocked registry, structurally separate from cfg1.feature.
    -- Cannot be enabled through any feature_state_change-shaped workflow because no such
    -- workflow exists yet (Phase 3) and role_cfg1_runtime has no write grant on this table at
    -- all (Phase 1) — see infra/grants/cfg1_runtime_grants.sql.
    CREATE TABLE cfg1.prohibited_feature (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      prohibited_feature_id    varchar(64) NOT NULL UNIQUE,
      feature_code             varchar(128) NOT NULL UNIQUE,
      prohibition_reason       varchar(256) NOT NULL,
      prohibition_source       varchar(64) NOT NULL,
      applies_until            varchar(64) NOT NULL DEFAULT 'permanent',
      status                   varchar(16) NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','inactive')),
      version                  int NOT NULL DEFAULT 1,
      approved_ref             varchar(128),
      created_at_utc            timestamptz NOT NULL DEFAULT now(),
      updated_at_utc            timestamptz NOT NULL DEFAULT now()
    );

    -- §2.10 feature_version — append-only per-feature version history. Created empty this phase
    -- (cfg1.feature is empty; nothing to version yet). feature_id is a soft reference, same
    -- rationale as cfg1.feature.licence_profile_id.
    CREATE TABLE cfg1.feature_version (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      feature_version_id       varchar(64) NOT NULL UNIQUE,
      feature_id               varchar(64) NOT NULL,
      feature_code             varchar(128) NOT NULL,
      version                  int NOT NULL,
      state_snapshot            jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at_utc             timestamptz NOT NULL DEFAULT now()
    );

    -- §2.11 config_integrity_seal — interim sha256 hash-seal (decision #6-#10: no fake
    -- KMS/PKI/digital signature; real signing/KMS deferred). The partial unique index below
    -- makes "at most one active seal per scope" a DB-enforced invariant, not merely an
    -- application-level check — see migration header.
    CREATE TABLE cfg1.config_integrity_seal (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      config_integrity_seal_id    varchar(64) NOT NULL UNIQUE,
      config_scope                varchar(32) NOT NULL
                                     CHECK (config_scope IN ('licence_profile','prohibited_registry','feature')),
      config_version               int NOT NULL,
      config_hash                  varchar(128) NOT NULL,
      doc00_baseline_hash          varchar(128) NOT NULL,
      doc00_source_version         varchar(16) NOT NULL,
      seal_method                  varchar(16) NOT NULL DEFAULT 'sha256'
                                      CHECK (seal_method IN ('sha256')),
      signed_by                    varchar(64),
      signature_ref                varchar(128),
      approval_id                  varchar(64),
      sec_audit_ref                varchar(128),
      status                       varchar(16) NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active','superseded','failed')),
      created_at_utc                timestamptz NOT NULL DEFAULT now(),
      verified_at_utc               timestamptz
    );

    -- Structural "at most one active seal per scope" invariant.
    CREATE UNIQUE INDEX cfg1_config_integrity_seal_one_active_per_scope
      ON cfg1.config_integrity_seal (config_scope) WHERE status = 'active';

    -- §3 indexes (subset applicable to the 5 tables built this phase).
    CREATE INDEX idx_cfg1_licence_profile_code_status_version ON cfg1.licence_profile (licence_code, status, version);
    CREATE INDEX idx_cfg1_feature_code_state_version ON cfg1.feature (feature_code, current_state, version);
    CREATE INDEX idx_cfg1_prohibited_feature_code_status ON cfg1.prohibited_feature (feature_code, status);
    CREATE INDEX idx_cfg1_config_integrity_seal_scope_version_status ON cfg1.config_integrity_seal (config_scope, config_version, status);

    -- =====================================================================================
    -- SEED DATA
    -- =====================================================================================

    INSERT INTO cfg1.licence_profile
      (licence_profile_id, licence_code, licence_status, authority, evidence_ref, evidence_authenticity_status, version, config_hash, doc00_baseline_hash, status, created_at_utc, updated_at_utc)
    VALUES
      ${licenceProfileRows
        .map(
          (r, i) =>
            `('${r.licence_profile_id}', '${r.licence_code}', '${r.licence_status}', '${r.authority}', NULL, '${r.evidence_authenticity_status}', ${r.version}, '${licenceProfileConfigHashes[i]}', '${doc00BaselineHash}', '${r.status}', '${nowIso}', '${nowIso}')`,
        )
        .join(",\n      ")};

    INSERT INTO cfg1.prohibited_feature
      (prohibited_feature_id, feature_code, prohibition_reason, prohibition_source, applies_until, status, version, created_at_utc, updated_at_utc)
    VALUES
      ${prohibitedFeatureRows
        .map(
          (r) =>
            `('${r.prohibited_feature_id}', '${r.feature_code}', ${sqlLiteral(r.prohibition_reason)}, '${r.prohibition_source}', '${r.applies_until}', '${r.status}', ${r.version}, '${nowIso}', '${nowIso}')`,
        )
        .join(",\n      ")};

    INSERT INTO cfg1.config_integrity_seal
      (config_integrity_seal_id, config_scope, config_version, config_hash, doc00_baseline_hash, doc00_source_version, seal_method, status, created_at_utc)
    VALUES
      ('seal_licence_profile_v1', 'licence_profile', 1, '${licenceProfileScopeHash}', '${doc00BaselineHash}', '${DOC00_SOURCE_VERSION}', 'sha256', 'active', '${nowIso}'),
      ('seal_prohibited_registry_v1', 'prohibited_registry', 1, '${prohibitedRegistryScopeHash}', '${doc00BaselineHash}', '${DOC00_SOURCE_VERSION}', 'sha256', 'active', '${nowIso}');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS cfg1 CASCADE;`);
};
