# AST-01 — 05 Database Design

**Status: PLANNED / AWAITING REVIEW. Design only — no migration is created by this task and none is numbered.** Migration head is 071 at the baseline; AST-01's migrations are numbered by the implementation task when it is approved, after checking the head then. Follows CFG-01 conventions (dedicated schema, `uuid` PKs via `gen_random_uuid()`, opaque-string references across modules instead of FKs, hash-only token storage, append-only tables guarded by triggers and grants).

Schema: **`ast1`**. Runtime role `ast1_app` (name illustrative). **No grant on any other module's schema and no FK into one** (F3(c)); cross-module ids (`client_id`, IAM-02 `approval_id`, RWA-01 issuer id, EXM-01 admission id) are `varchar` references.

---

## 1. Design rules

1. **No column whose name matches `/eligib/i` exists outside the decision log and token tables** (INV-03). The decision log stores derived *outputs* for evidence; nothing reads it as input to a decision. T-SCH-01 enforces this on `information_schema.columns`.
2. **No `UNRESOLVED`-defaulting column.** UNRESOLVED is the absence of a valid record.
3. Identity-critical columns are immutable after `IDENTITY_LOCKED` (trigger).
4. Loosening-relevant tables have no `UPDATE` grant for the runtime role except through the governed apply routine's dedicated transaction path (the same role, but the service exposes no other write path — enforced by test T-GRANT-*).
5. All enums are `CHECK` constraints on `varchar` (matches existing migrations), never DB `ENUM`.
6. All timestamps `timestamptz` UTC; ids that cross the wire are `varchar(64)` alongside the `uuid` PK (CFG-01 `change_id` pattern).
7. `reason_code varchar(48)` (wider than CFG-01's 32 — `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` is 48 characters; verified by counting).

---

## 2. Reference tables

```sql
-- issuer_reference — descriptive; NOT KYB (RWA-01 owns issuers)
ast1.issuer_reference (
  issuer_ref_id     uuid PK,
  source            varchar(16)  NOT NULL CHECK (source IN ('RWA01','EXTERNAL')),
  external_ref      varchar(64),                 -- opaque RWA-01 issuer id when source='RWA01'
  legal_name        varchar(256) NOT NULL,
  lei               varchar(20),
  jurisdiction_code char(2)      NOT NULL,       -- ISO 3166-1 alpha-2
  verification_status varchar(24) NOT NULL DEFAULT 'UNVERIFIED'
                      CHECK (verification_status IN ('UNVERIFIED','VERIFIED_BY_SOURCE')),
  created_at_utc    timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'RWA01' OR external_ref IS NOT NULL)
);

-- network_registry — networks recognised for instrument identity; runtime READ-ONLY
ast1.network_registry (
  chain varchar(16), network varchar(16),
  address_format varchar(32) NOT NULL,
  canonicalisation_version varchar(16) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  PRIMARY KEY (chain, network)
);
```

## 3. Core tables

### 3.1 `asset`

```sql
ast1.asset (
  asset_id           uuid PK DEFAULT gen_random_uuid(),
  asset_code         varchar(16)  NOT NULL UNIQUE CHECK (asset_code ~ '^[A-Z0-9]{2,16}$'),
  asset_name         varchar(128) NOT NULL,
  asset_class        varchar(24)  NOT NULL
      CHECK (asset_class IN ('FIAT_CURRENCY','DIGITAL_CURRENCY','STABLECOIN','SECURITY','SECURITY_TOKEN',
                             'RWA_TOKEN','TOKENISED_DEBT','TOKENISED_FUND','TOKENISED_COMMODITY','OTHER_PERMITTED')),
  issuer_ref_id      uuid REFERENCES ast1.issuer_reference,
  origin_jurisdiction char(2),
  created_by         varchar(64) NOT NULL,
  created_at_utc     timestamptz NOT NULL DEFAULT now()
);
```
`asset_class` and `issuer_ref_id` are in the instrument fingerprint; trigger blocks change once **any** instrument of the asset is `IDENTITY_LOCKED`.

### 3.2 `instrument`

```sql
ast1.instrument (
  instrument_id      uuid PK DEFAULT gen_random_uuid(),
  instrument_code    varchar(48) NOT NULL UNIQUE CHECK (instrument_code ~ '^[A-Z0-9][A-Z0-9._:-]{1,47}$'),
  asset_id           uuid NOT NULL REFERENCES ast1.asset,
  instrument_form    varchar(20) NOT NULL CHECK (instrument_form IN ('FIAT','NATIVE_COIN','TOKEN_CONTRACT','OFF_CHAIN_RECORD')),
  chain              varchar(16), network varchar(16),
  contract_address_canonical varchar(128),
  token_standard     varchar(24),
  on_chain_decimals  smallint CHECK (on_chain_decimals BETWEEN 0 AND 36),
  amount_scale       smallint NOT NULL CHECK (amount_scale BETWEEN 0 AND 36),      -- NO DEFAULT
  -- declared prohibited-category characteristics: explicit, NOT NULL, NO DEFAULT
  attr_privacy_coin            boolean NOT NULL,
  attr_algorithmic_stablecoin  boolean NOT NULL,
  attr_yield_bearing           boolean NOT NULL,   -- staking/yield/lending-receipt features
  attr_derivative_like         boolean NOT NULL,   -- derivative, leveraged, margin-embedded
  attr_myr_denominated         boolean NOT NULL,
  declared_synthetic boolean NOT NULL,
  synthetic_emulates varchar(16) CHECK (synthetic_emulates IN ('NON_SECURITY','SECURITY')),
  identity_fingerprint char(64) NOT NULL,
  lifecycle_status   varchar(16) NOT NULL DEFAULT 'DRAFT'
      CHECK (lifecycle_status IN ('DRAFT','IDENTITY_LOCKED','RETIRED')),
  version            int NOT NULL DEFAULT 1,
  created_by         varchar(64) NOT NULL,
  created_at_utc     timestamptz NOT NULL DEFAULT now(),
  identity_locked_at_utc timestamptz,
  -- consistency
  CHECK (declared_synthetic = (instrument_code ~ '^SYN[.-]')),
  CHECK (declared_synthetic = (synthetic_emulates IS NOT NULL)),
  CHECK (instrument_form <> 'TOKEN_CONTRACT' OR (chain IS NOT NULL AND network IS NOT NULL AND contract_address_canonical IS NOT NULL AND on_chain_decimals IS NOT NULL)),
  CHECK (instrument_form <> 'NATIVE_COIN' OR (chain IS NOT NULL AND network IS NOT NULL AND contract_address_canonical IS NULL)),
  CHECK (on_chain_decimals IS NULL OR amount_scale <= on_chain_decimals),
  FOREIGN KEY (chain, network) REFERENCES ast1.network_registry
);
CREATE UNIQUE INDEX ux_ast1_instrument_onchain
  ON ast1.instrument (chain, network, contract_address_canonical)
  WHERE instrument_form = 'TOKEN_CONTRACT' AND lifecycle_status <> 'RETIRED';
```

Notes: `attr_*` NOT NULL/no default forces the proposer to state each characteristic (a forgotten default cannot silently mean "false"). Trigger `trg_instrument_identity_immutable` rejects UPDATE of every identity column and of `identity_fingerprint` when `lifecycle_status <> 'DRAFT'`, and rejects any `lifecycle_status` move not in SM-1. A `DELETE` grant does not exist.

### 3.3 `instrument_underlying`

```sql
ast1.instrument_underlying (
  underlying_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  underlying_type varchar(20) NOT NULL CHECK (underlying_type IN
     ('NONE_NATIVE','FIAT_CURRENCY','INSTRUMENT','COMMODITY','REAL_ESTATE','DEBT_OBLIGATION','FUND_UNITS','EQUITY','OTHER_DESCRIBED')),
  underlying_instrument_id uuid REFERENCES ast1.instrument,
  currency_code char(3),
  description text,
  backing_model varchar(20) NOT NULL DEFAULT 'UNKNOWN'
     CHECK (backing_model IN ('NATIVE','FULLY_RESERVED','PARTIALLY_RESERVED','ALGORITHMIC','ISSUER_OBLIGATION','UNKNOWN')),
  CHECK (underlying_instrument_id IS DISTINCT FROM instrument_id),
  CHECK ((underlying_type = 'INSTRUMENT') = (underlying_instrument_id IS NOT NULL))
);
```
`backing_model = 'ALGORITHMIC'` ⇒ trigger requires `instrument.attr_algorithmic_stablecoin = true`. Cycle/depth ≤ 5 check in trigger. Rows editable only while the instrument is `DRAFT`.

## 4. Classification tables

### 4.1 `evidence_standard`

```sql
ast1.evidence_standard (
  standard_id uuid PK, version int NOT NULL,
  applicable_environments text[] NOT NULL
      CHECK (applicable_environments <@ ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']::text[]),
  required_evidence_types text[] NOT NULL,
  features_assessment_schema jsonb NOT NULL,
  classifier_of_record_policy text NOT NULL,
  r4q3_resolution_ref varchar(128),           -- pointer to the governance decision answering R4-Q3
  status varchar(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_change_id varchar(64),
  UNIQUE (version),
  CHECK (NOT ('PRODUCTION' = ANY(applicable_environments)) OR status = 'DRAFT' OR r4q3_resolution_ref IS NOT NULL)
);
```
No standard row is seeded `APPROVED` for PRODUCTION. A **non-production test standard** is a test fixture created by the test setup, not a migration seed.

### 4.2 `classification_case`

```sql
ast1.classification_case (
  case_id uuid PK, case_ref varchar(64) NOT NULL UNIQUE,
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  case_kind varchar(16) NOT NULL CHECK (case_kind IN ('INITIAL','RECLASSIFICATION')),
  state varchar(20) NOT NULL DEFAULT 'EVIDENCE_PENDING'
     CHECK (state IN ('OPEN','EVIDENCE_PENDING','IN_REVIEW','CLASSIFIED','REJECTED','WITHDRAWN')),
  proposed_outcome varchar(32)
     CHECK (proposed_outcome IN ('NON_SECURITY_DIGITAL_ASSET','SECURITY_OR_SECURITY_TOKEN','SYNTHETIC_TEST_INSTRUMENT','UNRESOLVED')),
  proposed_synthetic_emulates varchar(16),
  rationale text, features_assessment jsonb,
  evidence_standard_id uuid REFERENCES ast1.evidence_standard,
  proposed_by varchar(64) NOT NULL,
  opened_at_utc timestamptz NOT NULL DEFAULT now(), closed_at_utc timestamptz
);
CREATE UNIQUE INDEX ux_ast1_case_one_open ON ast1.classification_case (instrument_id)
  WHERE state IN ('OPEN','EVIDENCE_PENDING','IN_REVIEW');
```

### 4.3 `classification_evidence` (immutable)

```sql
ast1.classification_evidence (
  evidence_id uuid PK, case_id uuid NOT NULL REFERENCES ast1.classification_case,
  evidence_type varchar(48) NOT NULL, title varchar(256) NOT NULL,
  content_sha256 char(64) NOT NULL, object_ref varchar(512) NOT NULL,  -- opaque pointer; no bytes stored
  classifier_of_record varchar(128),
  synthetic boolean NOT NULL,
  author_actor_id varchar(64) NOT NULL, recorded_at_utc timestamptz NOT NULL DEFAULT now()
);
```
Trigger: `synthetic` must equal the case instrument's `declared_synthetic`; no UPDATE/DELETE.

### 4.4 `classification_record` — the ledger (append-only)

```sql
ast1.classification_record (
  record_id uuid PK DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  record_seq bigint NOT NULL,                         -- per instrument, gapless, UNIQUE (instrument_id, record_seq)
  outcome varchar(32) NOT NULL CHECK (outcome IN
     ('NON_SECURITY_DIGITAL_ASSET','SECURITY_OR_SECURITY_TOKEN','SYNTHETIC_TEST_INSTRUMENT','UNRESOLVED')),
  synthetic_emulates varchar(16) CHECK (synthetic_emulates IN ('NON_SECURITY','SECURITY')),
  recorded_environment varchar(12) NOT NULL
     CHECK (recorded_environment IN ('DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION')),
  identity_fingerprint char(64) NOT NULL,
  case_id uuid NOT NULL REFERENCES ast1.classification_case,
  evidence_standard_id uuid REFERENCES ast1.evidence_standard,   -- NULL only when outcome='UNRESOLVED'
  evidence_bundle_hash char(64),
  rationale text NOT NULL,
  maker_actor_id varchar(64) NOT NULL,
  checker_actor_id varchar(64) NOT NULL,
  approval_id varchar(64) NOT NULL,
  governed_change_id varchar(64) NOT NULL,
  recorded_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, record_seq),
  CHECK (maker_actor_id <> checker_actor_id),                                     -- INV-05
  CHECK ((outcome = 'SYNTHETIC_TEST_INSTRUMENT') = (synthetic_emulates IS NOT NULL)),
  CHECK (outcome <> 'SYNTHETIC_TEST_INSTRUMENT' OR recorded_environment <> 'PRODUCTION'),   -- INV-07
  CHECK (outcome = 'UNRESOLVED' OR (evidence_standard_id IS NOT NULL AND evidence_bundle_hash IS NOT NULL))
);
```
Triggers: (a) reject UPDATE/DELETE; (b) `record_seq` = previous max + 1 under `SELECT … FOR UPDATE` on the instrument row; (c) `outcome = 'SYNTHETIC_TEST_INSTRUMENT'` iff the instrument is `declared_synthetic` — **a real instrument can never get a synthetic record and a synthetic instrument can never get any other** (INV-07 "unpromotable" is structural); (d) `NON_SECURITY_DIGITAL_ASSET` refused when the asset class is in `SECURITIES_PRESUMPTIVE` (HD-4); (e) the referenced standard must be `APPROVED` and applicable to `recorded_environment`. Grants: `INSERT, SELECT` only.

### 4.5 `instrument_hold`

```sql
ast1.instrument_hold (
  hold_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  reason_code varchar(48) NOT NULL, detail text,
  placed_by varchar(64) NOT NULL,                -- actor id, or 'system'
  placed_at_utc timestamptz NOT NULL DEFAULT now(),
  status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  release_change_id varchar(64), released_at_utc timestamptz,
  CHECK (status = 'ACTIVE' OR release_change_id IS NOT NULL)   -- a release needs a governed change
);
```

## 5. Conjunct tables (narrowing only)

```sql
ast1.product_admission (
  admission_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  product varchar(20) NOT NULL CHECK (product IN ('SPOT','OTC','PAY','RWA','SECONDARY_MARKET','EXCHANGE')),
  status varchar(10) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','SUSPENDED','WITHDRAWN')),
  classification_record_id uuid NOT NULL REFERENCES ast1.classification_record,   -- what it was approved against
  jurisdiction_assessed boolean NOT NULL,
  approved_change_id varchar(64),
  version int NOT NULL DEFAULT 1,
  CHECK (status <> 'APPROVED' OR (approved_change_id IS NOT NULL AND jurisdiction_assessed))
);
CREATE UNIQUE INDEX ux_ast1_admission_live ON ast1.product_admission (instrument_id, product)
  WHERE status IN ('PROPOSED','APPROVED','SUSPENDED');
```
Trigger `trg_admission_hard_rule`: if `product IN ('SPOT','OTC')`, the referenced record's `outcome` must not be `SECURITY_OR_SECURITY_TOKEN` and its `synthetic_emulates` must not be `SECURITY` — **raises even for status PROPOSED** (INV-01 layer 4). For `PAY` it likewise refuses security-outcome records (matrix ⁴). For `EXCHANGE`, `SECONDARY_MARKET` it requires a security outcome.

```sql
ast1.custody_support (
  custody_support_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  custody_model varchar(24) NOT NULL CHECK (custody_model IN ('THIRD_PARTY_CUSTODIAN','NOT_SUPPORTED')),
                                     -- deliberately NO value for AIX self-custody / AIX key custody
  custodian_ref varchar(64),
  deposit_supported boolean NOT NULL, withdrawal_supported boolean NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','WITHDRAWN')),
  approved_change_id varchar(64), version int NOT NULL DEFAULT 1,
  CHECK (custody_model = 'NOT_SUPPORTED' OR custodian_ref IS NOT NULL)
);

ast1.instrument_operational_state (
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  capability varchar(12) NOT NULL CHECK (capability IN ('DEPOSIT','WITHDRAWAL')),
  state varchar(10) NOT NULL DEFAULT 'DISABLED' CHECK (state IN ('DISABLED','ENABLED','SUSPENDED')),
  reason varchar(256), changed_by varchar(64) NOT NULL,
  approved_change_id varchar(64), version int NOT NULL DEFAULT 1, updated_at_utc timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, capability),
  CHECK (state <> 'ENABLED' OR approved_change_id IS NOT NULL)
);

ast1.transfer_restriction_profile (
  instrument_id uuid PK REFERENCES ast1.instrument,
  status varchar(16) NOT NULL DEFAULT 'UNASSESSED' CHECK (status IN ('UNASSESSED','NONE_CONFIRMED','DEFINED')),
  approved_change_id varchar(64), version int NOT NULL DEFAULT 1,
  CHECK (status = 'UNASSESSED' OR approved_change_id IS NOT NULL)
);

ast1.transfer_restriction (
  restriction_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  restriction_type varchar(32) NOT NULL CHECK (restriction_type IN
    ('HOLDER_WHITELIST_REQUIRED','LOCKUP_UNTIL','INVESTOR_CLASS_ONLY','MAX_HOLDER_COUNT','MIN_HOLDING',
     'ISSUER_CONSENT_REQUIRED','FORCED_TRANSFER_POSSIBLE','SANCTIONS_FREEZE_CAPABLE')),
  scope varchar(20) NOT NULL CHECK (scope IN ('DEPOSIT','WITHDRAWAL','SECONDARY_TRANSFER','ALL')),
  effect varchar(4) NOT NULL DEFAULT 'DENY' CHECK (effect = 'DENY'),        -- a restriction can never grant
  parameters jsonb NOT NULL,
  enforcement_points text[] NOT NULL CHECK (enforcement_points <@ ARRAY['WLT01','RWA04','EXP01','ONCHAIN']::text[]),
  onchain_enforced boolean NOT NULL, contract_ref varchar(128),
  status varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LIFTED')),
  lifted_change_id varchar(64)
);

ast1.jurisdiction_rule (
  rule_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  product varchar(20) NOT NULL, jurisdiction_code char(2) NOT NULL,
  effect varchar(10) NOT NULL CHECK (effect IN ('BLOCK','ALLOW_ONLY')),
  basis text NOT NULL,
  status varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LIFTED')), lifted_change_id varchar(64)
);

ast1.securities_market_admission_attestation (
  attestation_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  admission_ref varchar(64) NOT NULL,                  -- EXM-01 admission id, opaque
  status varchar(12) NOT NULL CHECK (status IN ('ADMITTED','WITHDRAWN')),
  classification_record_id uuid NOT NULL REFERENCES ast1.classification_record,
  received_from varchar(64) NOT NULL, received_at_utc timestamptz NOT NULL DEFAULT now()
);
```
Trigger: the referenced record must be `SECURITY_OR_SECURITY_TOKEN` (real, or synthetic emulating security in non-production). Table name deliberately avoids the string `exchange` (INV-14 covers routes; kept for consistency and to stay clear of `exchange.*` namespace confusion, `DEC-013` cl. 10).

## 6. Governance and evidence tables

```sql
ast1.governed_change (               -- mirrors cfg1.feature_state_change; approval fields reference IAM-02, no FK
  id uuid PK, change_id varchar(64) NOT NULL UNIQUE,
  change_kind varchar(40) NOT NULL,  -- see 07 §5 catalogue
  direction varchar(10) NOT NULL CHECK (direction IN ('LOOSEN','TIGHTEN')),
  target_type varchar(32) NOT NULL, target_id varchar(64) NOT NULL,
  environment varchar(12) NOT NULL,
  payload jsonb NOT NULL, payload_hash varchar(128) NOT NULL,
  requested_by varchar(64) NOT NULL,
  approval_id varchar(64), decision_token_hash varchar(128), checker_actor_id varchar(64),
  status varchar(10) NOT NULL DEFAULT 'requested'
     CHECK (status IN ('requested','approved','applied','rejected','cancelled','failed','rolled_back')),
  request_id varchar(128), correlation_id varchar(128),
  created_at_utc timestamptz NOT NULL DEFAULT now(), applied_at_utc timestamptz,
  CHECK (status <> 'applied' OR direction = 'TIGHTEN'
         OR (approval_id IS NOT NULL AND checker_actor_id IS NOT NULL
             AND checker_actor_id <> requested_by))                            -- local maker≠checker
);
```
A `TIGHTEN` change may be `applied` without an approval (the single-actor path, INV-09). A `LOOSEN` change can never be `applied` without an IAM-02 approval **and** a checker distinct from the maker — checked here in addition to IAM-02's own control, because `IAM2-FIND-002`/`IAM2-FIND-003` show IAM-02 does not yet evaluate entitlement or seed an approval policy.

### 6.1 Decision log and token — where the hard rule has its last line of defence

```sql
ast1.eligibility_decision_log (
  decision_id varchar(64) PK,
  instrument_id uuid REFERENCES ast1.instrument,           -- NULL if the instrument could not be resolved
  subject varchar(20) NOT NULL,                             -- product or 'DEPOSIT' / 'WITHDRAWAL'
  decision varchar(5) NOT NULL CHECK (decision IN ('allow','deny')),
  eligibility_state varchar(16) NOT NULL CHECK (eligibility_state IN ('ELIGIBLE','INELIGIBLE','NOT_ASSESSED')),
  reason_code varchar(48) NOT NULL,
  effective_outcome varchar(32) NOT NULL,
  synthetic_emulates varchar(16),
  classification_record_id uuid, classification_record_seq bigint,
  matrix_version varchar(16) NOT NULL,
  environment varchar(12) NOT NULL,                         -- AST-01's own canonical environment
  asserted_environment varchar(12),
  client_jurisdiction char(2), caller_service varchar(64) NOT NULL,
  request_id varchar(128), correlation_id varchar(128),
  decided_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'deny' OR eligibility_state = 'ELIGIBLE'),
  CHECK (eligibility_state <> 'ELIGIBLE' OR decision = 'allow'),
  -- INV-01, last line of defence
  CHECK (NOT (decision = 'allow' AND subject IN ('SPOT','OTC')
              AND (effective_outcome = 'SECURITY_OR_SECURITY_TOKEN' OR synthetic_emulates = 'SECURITY'))),
  CHECK (NOT (decision = 'allow' AND effective_outcome = 'UNRESOLVED')),                       -- INV-02
  CHECK (NOT (decision = 'allow' AND effective_outcome = 'SYNTHETIC_TEST_INSTRUMENT' AND environment = 'PRODUCTION'))  -- INV-07
);

ast1.eligibility_decision_token (
  token_hash varchar(128) PK,
  decision_id varchar(64) NOT NULL REFERENCES ast1.eligibility_decision_log,
  decision varchar(5) NOT NULL CHECK (decision = 'allow'),          -- only allow may mint
  subject varchar(20) NOT NULL, effective_outcome varchar(32) NOT NULL, synthetic_emulates varchar(16),
  instrument_id uuid NOT NULL, classification_record_seq bigint NOT NULL,
  payload_hash varchar(128) NOT NULL, expires_at_utc timestamptz NOT NULL,
  consumed_at_utc timestamptz, revoked_at_utc timestamptz, revoked_reason varchar(32),
  CHECK (NOT (subject IN ('SPOT','OTC') AND (effective_outcome = 'SECURITY_OR_SECURITY_TOKEN' OR synthetic_emulates = 'SECURITY')))
);
```
The log is append-only. Retention ≥ six years (DEC-012 cl. 1 rule 7; LFSA-DMB-2025 ¶5.12 target). No raw token is stored.

## 7. Indexes (illustrative)

`instrument (asset_id)`, `instrument (lifecycle_status)`, `classification_record (instrument_id, record_seq DESC)`, `classification_case (instrument_id, state)`, `product_admission (instrument_id, product)`, `eligibility_decision_log (instrument_id, decided_at_utc)`, `eligibility_decision_log (decided_at_utc)` (retention/partition key), `governed_change (target_type, target_id)`, `instrument_hold (instrument_id) WHERE status='ACTIVE'`.

## 8. Privileges (design)

| Object | `ast1_app` |
|---|---|
| `network_registry` | `SELECT` only |
| `classification_record`, `classification_evidence`, `eligibility_decision_log` | `INSERT, SELECT` only |
| `evidence_standard` | `SELECT`; `INSERT`/`UPDATE(status…)` only via governed apply path |
| other tables | `SELECT, INSERT, UPDATE` (no `DELETE` anywhere) |
| any `iam2.*`, `cfg1.*`, `wlt1.*`, `clt1.*`, `kyc1.*`, `fnd.*` (except the foundation outbox/idempotency objects the platform already grants every service) | none (F3(c)) |

## 9. Data classification

| Class | Tables | Note |
|---|---|---|
| Regulatory-critical, append-only | `classification_record`, `classification_evidence`, `eligibility_decision_log`, `governed_change` | Retain ≥ 6 years; export via evidence export (later phase) |
| Compliance configuration | `product_admission`, `transfer_restriction*`, `jurisdiction_rule`, `custody_support`, `evidence_standard` | Tamper-evident via audit; integrity sweep (T-INT-*) |
| Reference | `asset`, `instrument`, `issuer_reference`, `network_registry` | Not personal data. Issuer legal names/LEI are corporate data |
| No PII | — | AST-01 stores no client data; `client_jurisdiction` in the log is a country code with no client id (linkage is by `request_id`/`correlation_id` held by the caller) |

## 10. Migration intent (not created here)

One implementation task, sequenced by risk: (a) reference + core + classification ledger + triggers; (b) conjunct tables; (c) governed change + decision log/token; (d) `network_registry` seed (only networks WLT-01 already approves, reconciled per DCR-AST1-002). Each must ship with its DB-level tests (10 §T-DB) and must not seed any classification, any `APPROVED` evidence standard, or any instrument except test fixtures in the test harness.
