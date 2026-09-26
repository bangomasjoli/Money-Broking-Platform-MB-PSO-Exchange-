# AST-01 — 05 Database Design (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW. Design only — no migration is created or numbered by this task.** Migration head is 071 at baseline `43f2f34`; numbering happens in the implementation task after re-checking the head. Conventions follow CFG-01: dedicated schema, `uuid` PKs, `varchar` + `CHECK` enums, opaque-string cross-module references (no FKs, no grants into other schemas — F3(c)), hash-only token storage, append-only tables by trigger + grant.

Schema **`ast1`**; runtime role `ast1_app` (illustrative). Changes from v1.0 are tagged **[v1.1: Fnn]**.

---

## 1. Design rules

1. **No column matching `/eligib/i` exists outside the decision-log and token tables** (INV-03); those hold derived *outputs* for evidence and are never read as inputs.
2. **No `UNRESOLVED`-defaulting column.** UNRESOLVED is absence of a valid record.
3. Identity-critical columns are immutable after `IDENTITY_LOCKED`; **`instrument_code`, `declared_synthetic`, `synthetic_emulates` are immutable from `INSERT`** [F09].
4. `CHECK` enums on `varchar`; timestamps `timestamptz` UTC; wire ids `varchar(64)` beside `uuid` PKs.
5. `reason_code varchar(48)` (the longest master code is exactly 48 characters).
6. **[F04] The security backstop never trusts application-supplied denormalised columns.** Any column on the log/token tables that repeats a derived value (`effective_outcome`, environment, emulation) is an *audit copy*. Enforcement reads the ledger (§7).
7. **[F05] Approver identities are stored only as IAM-02-attested values** (DCR-AST1-001(d)); the DB constrains the stored values, it does not claim to verify them independently.

---

## 2. Reference tables

```sql
ast1.issuer_reference (
  issuer_ref_id uuid PK, source varchar(16) NOT NULL CHECK (source IN ('RWA01','EXTERNAL')),
  external_ref varchar(64), legal_name varchar(256) NOT NULL, lei varchar(20),
  jurisdiction_code char(2) NOT NULL,
  verification_status varchar(24) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED_BY_SOURCE')),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'RWA01' OR external_ref IS NOT NULL)
);

ast1.network_registry (                       -- runtime READ-ONLY
  chain varchar(16), network varchar(16), address_format varchar(32) NOT NULL,
  canonicalisation_version varchar(16) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  PRIMARY KEY (chain, network)
);

ast1.deployment_environment (                 -- [F04] one row, set at bootstrap/migration, NO runtime write grant
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  canonical_environment varchar(12) NOT NULL
    CHECK (canonical_environment IN ('DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION'))
);
```
`deployment_environment` is written once by the migration/bootstrap role from the validated `ENVIRONMENT` (`canonicalEnvironment`, unknown ⇒ `PRODUCTION`). The application cannot change it; the SQL backstop reads it instead of a value on the row being inserted. A boot check compares it with the service's own config and refuses to start on disagreement.

## 3. Lineage [v1.1: F06]

```sql
ast1.lineage (
  lineage_id uuid PK DEFAULT gen_random_uuid(),
  synthetic boolean NOT NULL,                   -- a real and a synthetic lineage never merge
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

ast1.lineage_merge (                            -- append-only, irreversible; governed change (maker-checker)
  merge_id uuid PK, surviving_lineage_id uuid NOT NULL REFERENCES ast1.lineage,
  merged_lineage_id uuid NOT NULL REFERENCES ast1.lineage,
  change_id varchar(64) NOT NULL, recorded_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (surviving_lineage_id <> merged_lineage_id),
  UNIQUE (merged_lineage_id)
);
```
Trigger: a merge requires both lineages to have the same `synthetic` value. `ast1.lineage_root(lineage_id)` follows merges to the root; **all lineage reads go through the root**, so a merge extends the history seen by every member.

## 4. Core tables

### 4.1 `asset`

```sql
ast1.asset (
  asset_id uuid PK DEFAULT gen_random_uuid(),
  asset_code varchar(16) NOT NULL UNIQUE CHECK (asset_code ~ '^[A-Z0-9]{2,16}$'),
  asset_name varchar(128) NOT NULL,
  asset_class varchar(24) NOT NULL CHECK (asset_class IN
     ('FIAT_CURRENCY','DIGITAL_CURRENCY','STABLECOIN','SECURITY','SECURITY_TOKEN','RWA_TOKEN',
      'TOKENISED_DEBT','TOKENISED_FUND','TOKENISED_COMMODITY','OTHER_PERMITTED')),
  issuer_ref_id uuid REFERENCES ast1.issuer_reference,
  origin_jurisdiction char(2),
  lineage_id uuid NOT NULL REFERENCES ast1.lineage,                       -- [F06]
  predecessor_declaration varchar(24) NOT NULL
     CHECK (predecessor_declaration IN ('NONE_DECLARED','SAME_ECONOMIC_SUBJECT')),
  predecessor_ref varchar(64),                                            -- instrument/asset id when declared
  predecessor_attested_by varchar(64) NOT NULL,                           -- proposer attestation
  created_by varchar(64) NOT NULL, created_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK (predecessor_declaration <> 'SAME_ECONOMIC_SUBJECT' OR predecessor_ref IS NOT NULL)
);
```
`asset_class`, `issuer_ref_id`, `lineage_id` are frozen once any instrument of the asset is `IDENTITY_LOCKED`. Trigger: `SAME_ECONOMIC_SUBJECT` forces `lineage_id` to the predecessor's lineage root.

### 4.2 `instrument`

```sql
ast1.instrument (
  instrument_id uuid PK DEFAULT gen_random_uuid(),
  instrument_code varchar(48) NOT NULL UNIQUE CHECK (instrument_code ~ '^[A-Z0-9][A-Z0-9._:-]{1,47}$'),
  asset_id uuid NOT NULL REFERENCES ast1.asset,
  instrument_form varchar(20) NOT NULL CHECK (instrument_form IN ('FIAT','NATIVE_COIN','TOKEN_CONTRACT','OFF_CHAIN_RECORD')),
  chain varchar(16), network varchar(16), contract_address_canonical varchar(128),
  token_standard varchar(24), on_chain_decimals smallint CHECK (on_chain_decimals BETWEEN 0 AND 36),
  amount_scale smallint NOT NULL CHECK (amount_scale BETWEEN 0 AND 36),                 -- NO DEFAULT
  attr_privacy_coin boolean NOT NULL, attr_algorithmic_stablecoin boolean NOT NULL,
  attr_yield_bearing boolean NOT NULL, attr_derivative_like boolean NOT NULL,
  attr_myr_denominated boolean NOT NULL,                                                -- NO DEFAULTS
  declared_synthetic boolean NOT NULL,
  synthetic_emulates varchar(16) CHECK (synthetic_emulates IN ('NON_SECURITY','SECURITY')),
  identity_fingerprint char(64) NOT NULL,
  lifecycle_status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IDENTITY_LOCKED','RETIRED')),
  version int NOT NULL DEFAULT 1,
  created_by varchar(64) NOT NULL, created_at_utc timestamptz NOT NULL DEFAULT now(), identity_locked_at_utc timestamptz,
  CHECK (declared_synthetic = (instrument_code ~ '^SYN[.-]')),
  CHECK (declared_synthetic = (synthetic_emulates IS NOT NULL)),
  CHECK (instrument_form <> 'TOKEN_CONTRACT' OR (chain IS NOT NULL AND network IS NOT NULL
         AND contract_address_canonical IS NOT NULL AND on_chain_decimals IS NOT NULL)),
  CHECK (instrument_form <> 'NATIVE_COIN' OR (chain IS NOT NULL AND network IS NOT NULL AND contract_address_canonical IS NULL)),
  CHECK (instrument_form <> 'FIAT' OR (chain IS NULL AND network IS NULL AND contract_address_canonical IS NULL
         AND NOT declared_synthetic AND NOT attr_privacy_coin AND NOT attr_algorithmic_stablecoin
         AND NOT attr_yield_bearing AND NOT attr_derivative_like)),                     -- [F08] fiat is reference data only
  CHECK (on_chain_decimals IS NULL OR amount_scale <= on_chain_decimals),
  FOREIGN KEY (chain, network) REFERENCES ast1.network_registry
);
CREATE UNIQUE INDEX ux_ast1_instrument_onchain ON ast1.instrument (chain, network, contract_address_canonical)
  WHERE instrument_form = 'TOKEN_CONTRACT';       -- [F06] RETIRED rows are NOT excluded: a retired contract identity can never be re-registered outside its lineage
```

Triggers:
- `trg_instrument_immutable_from_insert` **[F09]** — rejects UPDATE of `instrument_code`, `declared_synthetic`, `synthetic_emulates` in **any** status.
- `trg_instrument_identity_immutable` — rejects UPDATE of the remaining identity columns and `identity_fingerprint` when `lifecycle_status <> 'DRAFT'`; enforces SM-1 transitions (no return to `DRAFT`).
- `trg_instrument_fiat_form` **[F08]** — `instrument_form = 'FIAT'` ⇔ the asset's `asset_class = 'FIAT_CURRENCY'`.
- `trg_instrument_on_chain_continuity` **[F06]** — a new `TOKEN_CONTRACT` whose `(chain, network, contract_address_canonical)` equals **any** prior instrument (including `RETIRED`) must belong to an asset in that instrument's lineage root; otherwise `AST1_LINEAGE_CONTINUITY_REQUIRED`.
- Lineage `synthetic` flag must equal `declared_synthetic` (no synthetic instrument in a real lineage and vice versa).
No `DELETE` grant exists on any `ast1` table.

### 4.3 `instrument_underlying`, `instrument_risk_profile`

```sql
ast1.instrument_underlying (
  underlying_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  underlying_type varchar(20) NOT NULL CHECK (underlying_type IN
     ('NONE_NATIVE','FIAT_CURRENCY','INSTRUMENT','COMMODITY','REAL_ESTATE','DEBT_OBLIGATION','FUND_UNITS','EQUITY','OTHER_DESCRIBED')),
  underlying_instrument_id uuid REFERENCES ast1.instrument, currency_code char(3), description text,
  backing_model varchar(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (backing_model IN
     ('NATIVE','FULLY_RESERVED','PARTIALLY_RESERVED','ALGORITHMIC','ISSUER_OBLIGATION','UNKNOWN')),
  CHECK (underlying_instrument_id IS DISTINCT FROM instrument_id),
  CHECK ((underlying_type = 'INSTRUMENT') = (underlying_instrument_id IS NOT NULL))
);

ast1.instrument_risk_profile (                  -- [F12] informational; NOT an input to derivation in v1.1
  instrument_id uuid PK REFERENCES ast1.instrument,
  risk_tier varchar(12) NOT NULL DEFAULT 'UNASSESSED' CHECK (risk_tier IN ('UNASSESSED','LOW','MEDIUM','HIGH')),
  approved_change_id varchar(64), version int NOT NULL DEFAULT 1,
  CHECK (risk_tier = 'UNASSESSED' OR approved_change_id IS NOT NULL)
);
```

## 5. Classification tables

```sql
ast1.evidence_standard (
  standard_id uuid PK, version int NOT NULL UNIQUE,
  applicable_environments text[] NOT NULL CHECK (applicable_environments <@ ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']::text[]),
  required_evidence_types text[] NOT NULL, features_assessment_schema jsonb NOT NULL,
  classifier_of_record_policy text NOT NULL, r4q3_resolution_ref varchar(128),
  status varchar(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_change_id varchar(64),
  CHECK (NOT ('PRODUCTION' = ANY(applicable_environments)) OR status = 'DRAFT' OR r4q3_resolution_ref IS NOT NULL)
);

ast1.classification_case (
  case_id uuid PK, case_ref varchar(64) NOT NULL UNIQUE,
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  case_kind varchar(16) NOT NULL CHECK (case_kind IN ('INITIAL','RECLASSIFICATION')),
  state varchar(20) NOT NULL DEFAULT 'EVIDENCE_PENDING'
     CHECK (state IN ('OPEN','EVIDENCE_PENDING','IN_REVIEW','CLASSIFIED','REJECTED','WITHDRAWN')),
  proposed_outcome varchar(32) CHECK (proposed_outcome IN
     ('NON_SECURITY_DIGITAL_ASSET','SECURITY_OR_SECURITY_TOKEN','SYNTHETIC_TEST_INSTRUMENT','UNRESOLVED')),
  rationale text, features_assessment jsonb, evidence_standard_id uuid REFERENCES ast1.evidence_standard,
  lineage_reviewed_attested boolean NOT NULL DEFAULT false,                   -- [F06]
  proposed_by varchar(64) NOT NULL, opened_at_utc timestamptz NOT NULL DEFAULT now(), closed_at_utc timestamptz
);
CREATE UNIQUE INDEX ux_ast1_case_one_open ON ast1.classification_case (instrument_id)
  WHERE state IN ('OPEN','EVIDENCE_PENDING','IN_REVIEW');
-- trg: no case may be opened for a FIAT instrument [F08]
```
There is **no `proposed_synthetic_emulates`** — the instrument is the only source [F09].

```sql
ast1.classification_evidence (                     -- immutable
  evidence_id uuid PK, case_id uuid NOT NULL REFERENCES ast1.classification_case,
  evidence_type varchar(48) NOT NULL, title varchar(256) NOT NULL,
  content_sha256 char(64) NOT NULL, object_ref varchar(512) NOT NULL, classifier_of_record varchar(128),
  synthetic boolean NOT NULL, author_actor_id varchar(64) NOT NULL, recorded_at_utc timestamptz NOT NULL DEFAULT now()
);
```
Trigger: `synthetic` = the case instrument's `declared_synthetic`; a real instrument's bundle may not include an item from a synthetic case.

### 5.1 `classification_record` — the append-only ledger

```sql
ast1.classification_record (
  record_id uuid PK DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  record_seq bigint NOT NULL,
  outcome varchar(32) NOT NULL CHECK (outcome IN
     ('NON_SECURITY_DIGITAL_ASSET','SECURITY_OR_SECURITY_TOKEN','SYNTHETIC_TEST_INSTRUMENT','UNRESOLVED')),
  -- NO synthetic_emulates column: the instrument is the single source of truth [F09]
  recorded_environment varchar(12) NOT NULL,               -- filled by trigger from ast1.deployment_environment; app value ignored
  identity_fingerprint char(64) NOT NULL,
  lineage_id uuid NOT NULL,                                -- filled by trigger from the instrument's asset (root)
  case_id uuid NOT NULL REFERENCES ast1.classification_case,
  evidence_standard_id uuid REFERENCES ast1.evidence_standard, evidence_bundle_hash char(64),
  rationale text NOT NULL,
  maker_actor_id varchar(64) NOT NULL,
  checker_actor_ids text[] NOT NULL,                       -- [F05] IAM-02-ATTESTED approver identities only
  approval_policy_id varchar(64) NOT NULL,                 -- [F05] IAM-02-attested policy identity
  approval_id varchar(64) NOT NULL, governed_change_id varchar(64) NOT NULL,
  elevated boolean NOT NULL,                               -- [F06] computed by trigger from the ledger; app value ignored
  recorded_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, record_seq),
  CHECK (cardinality(checker_actor_ids) >= 1 AND NOT (maker_actor_id = ANY(checker_actor_ids))),   -- on attested values
  CHECK (NOT elevated OR (cardinality(checker_actor_ids) >= 2)),
  CHECK (outcome = 'UNRESOLVED' OR (evidence_standard_id IS NOT NULL AND evidence_bundle_hash IS NOT NULL)),
  CHECK (outcome <> 'SYNTHETIC_TEST_INSTRUMENT' OR recorded_environment <> 'PRODUCTION')
);
```
Triggers on INSERT (all read authoritative rows; none trusts the supplied values):
1. Reject UPDATE/DELETE.
2. `record_seq` = previous max + 1 under `SELECT … FOR UPDATE` on the instrument row.
3. Fill `recorded_environment` from `ast1.deployment_environment`; `identity_fingerprint` recomputed and compared; `lineage_id` from the instrument's asset root.
4. `outcome = 'SYNTHETIC_TEST_INSTRUMENT'` ⇔ `instrument.declared_synthetic` **[F09]**; fiat instruments cannot receive any record **[F08]**.
5. `NON_SECURITY_DIGITAL_ASSET` refused for asset classes `SECURITY` / `SECURITY_TOKEN` (`SECURITY_LABELLED`, §3.4) — **not** for `TOKENISED_DEBT`/`TOKENISED_FUND` (AST-HD-4).
6. **`elevated` (F06):** computed as `EXISTS (record r in the same lineage root, real (non-synthetic) instrument, r.outcome = 'SECURITY_OR_SECURITY_TOKEN')`. When `elevated ∧ outcome = 'NON_SECURITY_DIGITAL_ASSET'`: require ≥ 2 distinct `checker_actor_ids`, and the case's evidence bundle to contain ≥ 1 item with `recorded_at_utc >` the last such `SECURITY` record's `recorded_at_utc` whose `content_sha256` is not in that record's bundle; and `lineage_reviewed_attested`. Otherwise raise.
7. Evidence standard must be `APPROVED` and applicable to `recorded_environment`.
Grants: `INSERT, SELECT` only.

### 5.2 `instrument_hold` — a narrowing conjunct, not an outcome [F07]

```sql
ast1.instrument_hold (
  hold_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  hold_origin varchar(8) NOT NULL CHECK (hold_origin IN ('SYSTEM','HUMAN')),
  reason_code varchar(48) NOT NULL, detail text,
  placed_by varchar(64) NOT NULL, placed_change_id varchar(64),
  placed_at_utc timestamptz NOT NULL DEFAULT now(),
  status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  release_change_id varchar(64), released_at_utc timestamptz,
  CHECK (hold_origin = 'SYSTEM' OR placed_change_id IS NOT NULL),          -- a HUMAN hold requires an approved governed change
  CHECK (hold_origin = 'HUMAN' OR placed_by = 'system'),
  CHECK (status = 'ACTIVE' OR release_change_id IS NOT NULL)                -- release is always governed
);
```
A hold writes **no** `classification_record`. `SYSTEM` holds are inserted by the integrity sweep/derivation guard (or a trigger on a backstop trip) with no human approval.

## 6. Conjunct tables (narrowing only)

```sql
ast1.product_admission (
  admission_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  product varchar(20) NOT NULL CHECK (product IN ('SPOT','OTC','PAY','RWA','SECONDARY_MARKET','SECURITIES_MARKET')),
  status varchar(10) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','SUSPENDED','WITHDRAWN')),
  classification_record_id uuid NOT NULL REFERENCES ast1.classification_record,
  jurisdiction_assessed boolean NOT NULL, approved_change_id varchar(64), version int NOT NULL DEFAULT 1,
  CHECK (status <> 'APPROVED' OR (approved_change_id IS NOT NULL AND jurisdiction_assessed))
);
CREATE UNIQUE INDEX ux_ast1_admission_live ON ast1.product_admission (instrument_id, product)
  WHERE status IN ('PROPOSED','APPROVED','SUSPENDED');
```
`trg_admission_backstop` **[F04]** (BEFORE INSERT and BEFORE UPDATE to `APPROVED`): calls `ast1.backstop_permits(instrument_id, product)` (§7) and additionally requires `classification_record_id` **= the instrument's current maximum-`record_seq` record** — so an admission can neither be created nor approved against a stale record, and can never be created for `SPOT`/`OTC`/`PAY` against a `SECURITY` outcome (including `PROPOSED`).

```sql
ast1.custody_support (
  custody_support_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  custody_model varchar(24) NOT NULL CHECK (custody_model IN ('THIRD_PARTY_CUSTODIAN','NOT_SUPPORTED')),  -- no AIX self-custody value
  custodian_ref varchar(64),
  domain varchar(8) NOT NULL CHECK (domain IN ('MB_PSO','SECURITIES')),            -- [F01] custody is domain-scoped
  deposit_supported boolean NOT NULL, withdrawal_supported boolean NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','WITHDRAWN')),
  approved_change_id varchar(64), version int NOT NULL DEFAULT 1,
  CHECK (custody_model = 'NOT_SUPPORTED' OR custodian_ref IS NOT NULL)
);
-- trg: an APPROVED custody_support with domain='MB_PSO' is refused where the authoritative outcome is SECURITY (§7)

ast1.instrument_operational_state (
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  subject varchar(24) NOT NULL CHECK (subject IN ('DEPOSIT_MB_PSO','WITHDRAWAL_MB_PSO','DEPOSIT_SECURITIES','WITHDRAWAL_SECURITIES')),
  state varchar(10) NOT NULL DEFAULT 'DISABLED' CHECK (state IN ('DISABLED','ENABLED','SUSPENDED')),
  reason varchar(256), changed_by varchar(64) NOT NULL, approved_change_id varchar(64),
  version int NOT NULL DEFAULT 1, updated_at_utc timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, subject),
  CHECK (state <> 'ENABLED' OR approved_change_id IS NOT NULL)
);
-- trg: ENABLED for an MB_PSO subject refused via the backstop (§7)

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
  effect varchar(4) NOT NULL DEFAULT 'DENY' CHECK (effect = 'DENY'),
  parameters jsonb NOT NULL,
  enforcement_points text[] NOT NULL CHECK (enforcement_points <@ ARRAY['WLT01','RWA04','EXP01','ONCHAIN']::text[]),
  onchain_enforced boolean NOT NULL, contract_ref varchar(128),
  status varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LIFTED')), lifted_change_id varchar(64)
);

ast1.jurisdiction_rule (
  rule_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  product varchar(20) NOT NULL, jurisdiction_code char(2) NOT NULL,
  effect varchar(10) NOT NULL CHECK (effect IN ('BLOCK','ALLOW_ONLY')), basis text NOT NULL,
  status varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LIFTED')), lifted_change_id varchar(64)
);

ast1.securities_market_admission_attestation (
  attestation_id uuid PK, instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  admission_ref varchar(64) NOT NULL, status varchar(12) NOT NULL CHECK (status IN ('ADMITTED','WITHDRAWN')),
  classification_record_id uuid NOT NULL REFERENCES ast1.classification_record,
  received_from varchar(64) NOT NULL, received_at_utc timestamptz NOT NULL DEFAULT now()
);
```
`trg_attestation_binding` **[F13]**: INSERT requires the referenced record to be the instrument's **current** record with outcome `SECURITY_OR_SECURITY_TOKEN` (or synthetic→`SECURITY`, non-production). Any later record makes the attestation stale by construction; C5 compares `classification_record_id` with the current record.

## 7. The authoritative SQL backstop [v1.1: F04]

v1.0 CHECKed `effective_outcome` etc. on the row being inserted — values written by the very code being guarded. v1.1 replaces that with a SQL function that **reads the ledger**.

```sql
ast1.authoritative_state(p_instrument_id uuid) RETURNS TABLE (
  instrument_form, declared_synthetic, synthetic_emulates, lifecycle_status,
  current_record_id, current_record_seq, latest_outcome,          -- newest record only
  record_env_matches boolean, on_hold boolean, canonical_environment)
```
implemented over `ast1.instrument`, `ast1.classification_record` (max `record_seq`), `ast1.instrument_hold`, and `ast1.deployment_environment`. It contains **no** matrix, only the minimum needed to decide the forbidden set:

```sql
ast1.backstop_permits(p_instrument_id uuid, p_subject varchar) RETURNS boolean
```
Returns **false** (⇒ the trigger raises) when, using `authoritative_state`:

| # | Condition | Effect |
|---|---|---|
| B1 | `p_subject` ∈ MB/PSO set {`SPOT`,`OTC`,`PAY`,`DEPOSIT_MB_PSO`,`WITHDRAWAL_MB_PSO`} and the instrument's *emulated-or-actual* outcome is `SECURITY` (`latest_outcome = SECURITY_OR_SECURITY_TOKEN`, or `declared_synthetic ∧ synthetic_emulates = 'SECURITY'`) | deny |
| B2 | `p_subject` ∈ MB/PSO set and there is **no** current record, or `latest_outcome = 'UNRESOLVED'`, or `record_env_matches` is false | deny |
| B3 | any subject and `instrument_form = 'FIAT'` | deny (fiat never has an `allow`) |
| B4 | any subject and `latest_outcome = 'SYNTHETIC_TEST_INSTRUMENT'` and `canonical_environment = 'PRODUCTION'` | deny |
| B5 | any subject, real instrument (`declared_synthetic = false`), and subject ∈ securities-route set {`RWA` when outcome is SECURITY, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES`} with `latest_outcome = 'SECURITY_OR_SECURITY_TOKEN'` (F03) | deny |
| B6 | any subject and `on_hold` or `lifecycle_status = 'RETIRED'` | deny |
| B7 | `SECURITIES` domain subject and the *actual-or-emulated* outcome is `NON_SECURITY` (`latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'`, or `declared_synthetic ∧ synthetic_emulates = 'NON_SECURITY'`) | deny |

It is deliberately **coarser than the matrix** (it only forbids), written **independently** of the TypeScript matrix, and covered by a parity test (T-DB-09): for every instrument state, whenever the TS matrix returns anything other than `ELIGIBLE` for B1–B7-relevant cells the backstop must also deny, and it must never allow a cell the matrix denies for B1/B3/B5.

Triggers calling it:

| Table / event | Check |
|---|---|
| `eligibility_decision_log` `BEFORE INSERT` where `decision = 'allow'` | `instrument_id IS NOT NULL`; `backstop_permits(instrument_id, subject)`; `classification_record_id` = `current_record_id`. **The row's own `effective_outcome`, `environment` and `synthetic_emulates` columns are not consulted.** |
| `eligibility_decision_token` `BEFORE INSERT` | Same, plus the referenced log row must be `allow` |
| `product_admission` insert / approve | `backstop_permits(instrument_id, product)` and current-record binding (§6) |
| `securities_market_admission_attestation` insert | current-record binding (§6) and `backstop_permits(instrument_id, 'SECURITIES_MARKET')` |
| `custody_support` approve, `instrument_operational_state` enable | `backstop_permits` for the domain's subject |
| A raised backstop | Also writes a `SYSTEM` `instrument_hold` (reason `BACKSTOP_TRIPPED`) in an autonomous path and emits the critical event |

*Residual (stated in 01 §5.5):* the function guarantees no `allow` row exists for instrument X × subject unless X's ledger permits it; the application could still log the decision against the wrong instrument id. Consumers bind the instrument id at `verify-decision`, which closes that.

## 8. Governance and evidence tables

```sql
ast1.governed_change (
  id uuid PK, change_id varchar(64) NOT NULL UNIQUE,
  change_kind varchar(40) NOT NULL, direction varchar(10) NOT NULL CHECK (direction IN ('LOOSEN','TIGHTEN')),
  origin varchar(8) NOT NULL CHECK (origin IN ('HUMAN','SYSTEM','SERVICE')),
  target_type varchar(32) NOT NULL, target_id varchar(64) NOT NULL,
  environment varchar(12) NOT NULL,
  payload jsonb NOT NULL, payload_hash varchar(128) NOT NULL,
  requested_by varchar(64) NOT NULL,
  approval_id varchar(64), decision_token_hash varchar(128),
  approver_actor_ids text[],                              -- [F05] IAM-02-attested only
  approval_policy_id varchar(64),                         -- [F05] IAM-02-attested only
  status varchar(10) NOT NULL DEFAULT 'requested'
     CHECK (status IN ('requested','approved','applied','rejected','cancelled','failed','rolled_back')),
  request_id varchar(128), correlation_id varchar(128),
  created_at_utc timestamptz NOT NULL DEFAULT now(), applied_at_utc timestamptz,
  CHECK (status <> 'applied' OR origin IN ('SYSTEM','SERVICE')
         OR (approval_id IS NOT NULL AND approver_actor_ids IS NOT NULL AND approval_policy_id IS NOT NULL
             AND cardinality(approver_actor_ids) >= 1 AND NOT (requested_by = ANY(approver_actor_ids))))
);
```
**[F07]** The v1.0 rule "a `TIGHTEN` change may be applied without approval" is **removed**: a `HUMAN` change of either direction requires an IAM-02-attested approval. Only `SYSTEM` (integrity) and `SERVICE` (e.g. `EXM-01` attestation withdrawal) origins apply without human approval, and those change kinds are an enumerated allow-list in code and audited.

### 8.1 Decision log and token

```sql
ast1.eligibility_decision_log (
  decision_id varchar(64) PK,
  instrument_id uuid REFERENCES ast1.instrument,
  subject varchar(24) NOT NULL CHECK (subject IN
     ('SPOT','OTC','PAY','RWA','SECONDARY_MARKET','SECURITIES_MARKET',
      'DEPOSIT_MB_PSO','WITHDRAWAL_MB_PSO','DEPOSIT_SECURITIES','WITHDRAWAL_SECURITIES')),
  domain varchar(8) NOT NULL CHECK (domain IN ('MB_PSO','RWA','SECURITIES')),
  decision varchar(14) NOT NULL CHECK (decision IN ('allow','deny','not_applicable')),
  eligibility_state varchar(14) NOT NULL CHECK (eligibility_state IN ('ELIGIBLE','INELIGIBLE','NOT_ASSESSED','NOT_APPLICABLE')),
  reason_code varchar(48) NOT NULL,
  -- audit copies (NOT trusted by the backstop):
  effective_outcome varchar(32) NOT NULL, hold_active boolean NOT NULL,
  classification_record_id uuid, classification_record_seq bigint,
  matrix_version varchar(24) NOT NULL,
  environment varchar(12) NOT NULL, asserted_environment varchar(12),
  client_jurisdiction char(2), client_class varchar(24),
  caller_service varchar(64) NOT NULL, consumer_service varchar(64) NOT NULL,
  request_id varchar(128), correlation_id varchar(128), decided_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK ((decision = 'allow') = (eligibility_state = 'ELIGIBLE')),
  CHECK ((decision = 'not_applicable') = (eligibility_state = 'NOT_APPLICABLE')),
  CHECK (decision <> 'allow' OR (instrument_id IS NOT NULL AND classification_record_id IS NOT NULL)),
  CHECK (domain = CASE WHEN subject IN ('SPOT','OTC','PAY','DEPOSIT_MB_PSO','WITHDRAWAL_MB_PSO') THEN 'MB_PSO'
                       WHEN subject = 'RWA' THEN 'RWA' ELSE 'SECURITIES' END)
);
-- BEFORE INSERT trigger: §7 backstop (authoritative), NOT the columns above.

ast1.eligibility_decision_token (
  token_hash varchar(128) PK,
  decision_id varchar(64) NOT NULL REFERENCES ast1.eligibility_decision_log,
  decision varchar(5) NOT NULL CHECK (decision = 'allow'),
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  subject varchar(24) NOT NULL, domain varchar(8) NOT NULL,
  consumer_service varchar(64) NOT NULL,                                   -- [F02]
  environment varchar(12) NOT NULL,
  classification_record_id uuid NOT NULL, classification_record_seq bigint NOT NULL,
  matrix_version varchar(24) NOT NULL,
  payload_hash varchar(128) NOT NULL, expires_at_utc timestamptz NOT NULL,
  consumed_at_utc timestamptz, revoked_at_utc timestamptz, revoked_reason varchar(32)
);
-- BEFORE INSERT trigger: §7 backstop; the row must equal the referenced log row on instrument/subject/domain/record.
```
Log is append-only; retention ≥ six years (DEC-012 cl. 1 rule 7; LFSA-DMB-2025 ¶5.12 target, effective 1 January 2027 — not currently in force). No raw token stored.

## 9. Indexes (illustrative)

`instrument (asset_id)`, `asset (lineage_id)`, `classification_record (instrument_id, record_seq DESC)`, `classification_record (lineage_id, outcome)`, `classification_case (instrument_id, state)`, `product_admission (instrument_id, product)`, `instrument_hold (instrument_id) WHERE status='ACTIVE'`, `eligibility_decision_log (instrument_id, decided_at_utc)`, `governed_change (target_type, target_id)`.

## 10. Privileges

| Object | `ast1_app` |
|---|---|
| `network_registry`, `deployment_environment` | `SELECT` only |
| `classification_record`, `classification_evidence`, `eligibility_decision_log`, `lineage_merge` | `INSERT, SELECT` only |
| `evidence_standard` | `SELECT`; status change via governed apply path |
| other tables | `SELECT, INSERT, UPDATE` — no `DELETE` anywhere |
| any `iam2.*`, `cfg1.*`, `wlt1.*`, `clt1.*`, `kyc1.*`, `fnd.*` (beyond foundation outbox/idempotency objects granted to every service) | none (F3(c)) |

## 11. Data classification

Regulatory-critical, append-only: `classification_record`, `classification_evidence`, `eligibility_decision_log`, `governed_change`, `lineage_merge`. Compliance configuration: admissions, holds, restrictions, jurisdiction rules, custody, standards, risk profile. Reference: `asset`, `instrument`, `issuer_reference`, `network_registry`, `lineage`. No client PII: `client_jurisdiction`/`client_class` in the log are attribute values with no client id.

## 12. Migration intent (not created here)

Sequenced by risk: (a) reference + `deployment_environment` + lineage + core + ledger + triggers + `authoritative_state`/`backstop_permits`; (b) conjunct tables; (c) governed change + decision log/token. **No seed of any classification, any `APPROVED` evidence standard, or any instrument** except test fixtures created by the test harness.
