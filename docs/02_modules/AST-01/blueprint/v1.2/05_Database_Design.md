# AST-01 — 05 Database Design (v1.2)

**Status: REMEDIATED / AWAITING RE-REVIEW. Design only — no migration is created or numbered by this task.** Migration head is 071 at baseline `43f2f34`; numbering happens in the implementation task after re-checking the head. Conventions follow CFG-01: dedicated schema, `uuid` PKs, `varchar` + `CHECK` enums, opaque-string cross-module references (no FKs, no grants into other schemas — F3(c)), hash-only token storage, append-only tables by trigger + grant.

Schema **`ast1`**; runtime role `ast1_app` (illustrative). Changes from v1.0 are tagged **[v1.1: Fnn]**; changes from v1.1 (round-2 review [`04-review-r2.md`](../../../../03_implementation/tasks/AST-01/04-review-r2.md)) are tagged **[v1.2: Fnn]**. v1.1 tags are kept as provenance.

---

## 1. Design rules

1. **No column matching `/eligib/i` exists outside the decision-log and token tables** (INV-03); those hold derived *outputs* for evidence and are never read as inputs.
2. **No `UNRESOLVED`-defaulting column.** UNRESOLVED is absence of a valid record.
3. Identity-critical columns are immutable after `IDENTITY_LOCKED`; **`instrument_code`, `declared_synthetic`, `synthetic_emulates` are immutable from `INSERT`** [F09].
4. `CHECK` enums on `varchar`; timestamps `timestamptz` UTC; wire ids `varchar(64)` beside `uuid` PKs.
5. `reason_code varchar(48)` (the longest master code is exactly 48 characters).
6. **[F04] The security backstop never trusts application-supplied denormalised columns.** Any column on the log/token tables that repeats a derived value (`effective_outcome`, environment, emulation) is an *audit copy*. Enforcement reads the ledger (§7).
7. **[F05] Approver identities are stored only as IAM-02-attested values** (DCR-AST1-001(d)); the DB constrains the stored values, it does not claim to verify them independently.
8. **[v1.2: F18] One lock order, one consumption transaction.** Every path that can change an eligibility input takes the **instrument row lock first** (§7A). Token consumption is a single transaction. The SQL backstop runs at token **mint and at token consumption**, and token binding columns are immutable after mint.
9. **[v1.2: F19] Lineage-critical identity is immutable from `INSERT`**: `asset.lineage_id`, the predecessor fields, `instrument.asset_id` and the on-chain identity keys. The only lineage-changing operation is the governed, irreversible lineage merge.
10. **[v1.2: F19/F20] A canonical on-chain identity is registered once, ever** (unique over all statuses). A `SECURITY` determination narrows its lineage siblings through a **derived conjunct**, never by rewriting their classifications.
11. **[v1.2: F24] Key columns of conjunct rows are immutable from `INSERT`.** A change of target is a new row, never an `UPDATE`.

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

**[v1.2: F24] Immutability.** `trg_deployment_environment_immutable` — `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement) — raises `AS002` for **every** role, including the migration/bootstrap role, once the row exists; the `singleton` primary key blocks a second row. The runtime role additionally holds no `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` privilege on it (§10). Changing the value is an out-of-band, audited DBA action that is not an application capability and is still refused at boot if it disagrees with service configuration.

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

**[v1.2: F19.D] Lineage assignment is immutable from creation.** No role can `UPDATE` `asset.lineage_id`, `predecessor_declaration`, `predecessor_ref` or `predecessor_attested_by` (§4.1), and a merge does **not** update asset rows: it appends a `lineage_merge` row and `lineage_root()` follows it. The merge is the only governed lineage operation. There is **no un-merge and no loosening correction**: a wrongly *separate* lineage is fixed by a merge (tightening); a wrongly *merged* lineage is never split, and its members take the elevated path (fail-closed). The merge transaction locks every instrument of both lineages in ascending `instrument_id` order before it inserts (§7A).

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
Triggers **[v1.2: F19.D, F22]**:
- `trg_asset_lineage_immutable` — rejects `UPDATE` of `lineage_id`, `predecessor_declaration`, `predecessor_ref`, `predecessor_attested_by` in **every** status, for every role (`AS002`). This replaces v1.1's "frozen once an instrument locks", which left the fields editable while `DRAFT`.
- `trg_asset_lineage_on_insert` — `SAME_ECONOMIC_SUBJECT` forces `lineage_id` to the predecessor's lineage **root** at insert; `NONE_DECLARED` creates a new lineage.
- `trg_asset_class_frozen` **[F22]** — `asset_class` may be updated only (a) while the asset has **no** instrument, or (b) inside the transaction that has just marked an `ASSET_CLASS_CORRECTION` governed change `applied` for exactly this asset and (from, to) — the correction path for a mislabelled class (AST-P-3; 01 §3.4). A correction (i) never crosses the FIAT boundary once an instrument exists (`FIAT_CURRENCY` ⇔ `instrument_form = 'FIAT'`), (ii) when it moves a class **out of** `SECURITY`/`SECURITY_TOKEN` needs ≥ 2 attested approvers (`COMPLIANCE_OFFICER` + `MLRO`), because it loosens, (iii) leaves `lineage_id` untouched (lineage preserved), and (iv) recomputes the cached `instrument.identity_fingerprint` of the asset's instruments — the only permitted post-lock write to that column — so every earlier record collapses to `UNRESOLVED` (`CLASSIFICATION_IDENTITY_DRIFT`) and a new governed classification is required.
- `issuer_ref_id` is frozen once any instrument of the asset is `IDENTITY_LOCKED`.

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
  CHECK (instrument_form <> 'OFF_CHAIN_RECORD' OR (chain IS NULL AND network IS NULL AND contract_address_canonical IS NULL)),   -- [v1.2: F17] no on-chain identity ⇒ resolved by id/code only
  CHECK (on_chain_decimals IS NULL OR amount_scale <= on_chain_decimals),
  FOREIGN KEY (chain, network) REFERENCES ast1.network_registry
);
-- [v1.2: F17, F19.A, F19.E] Canonical on-chain identity. Both indexes cover EVERY lifecycle_status (RETIRED and abandoned DRAFT rows are NOT excluded):
CREATE UNIQUE INDEX ux_ast1_instrument_token_identity ON ast1.instrument (chain, network, contract_address_canonical)
  WHERE instrument_form = 'TOKEN_CONTRACT';       -- one instrument per contract, ever
CREATE UNIQUE INDEX ux_ast1_instrument_native_identity ON ast1.instrument (chain, network)
  WHERE instrument_form = 'NATIVE_COIN';          -- one native-coin instrument per (chain, network), ever
```

Canonical identity and lineage-critical fields **[v1.2: F17, F19]**:

| Form | Canonical identity (the only resolution key) | Uniqueness |
|---|---|---|
| `TOKEN_CONTRACT` | `(chain, network, contract_address_canonical)` | `ux_ast1_instrument_token_identity`, all statuses |
| `NATIVE_COIN` | `(chain, network)` — the native coin of that network; `contract_address_canonical` is `NULL` | `ux_ast1_instrument_native_identity`, all statuses |
| `OFF_CHAIN_RECORD` | none on-chain (`instrument_code`, unique) | `instrument_code` unique |
| `FIAT` | ISO 4217 code via the fiat reference surface (`instrument_code`); never an `evaluate` key | `instrument_code` unique |

`asset_code` is **not** an identity key: several instruments (contracts) may share an asset and network. It is a label used only as an optional consistency assertion (04 §6.1). `network_registry` holds one row per real network; aliasing one network under two keys would defeat native-identity uniqueness and is a registry-content error, not a supported state.

**A canonical identity is registered exactly once, ever.** A retired, abandoned-draft, or replaced instrument keeps its identity permanently; a second instrument with the same identity is rejected by the index (`AST1_INSTRUMENT_DUPLICATE_IDENTITY`, `AS004`). There is no retire-and-recreate on the same contract or native identity, and no continuity trigger for it (v1.1's `trg_instrument_on_chain_continuity` is **removed**: it could never fire). A replacement contract has a **new** address and enters through a declared predecessor or the asset's lineage (01 §3.9). A real and a synthetic instrument can never share an identity either: the second registration collides.

Triggers:
- `trg_instrument_immutable_from_insert` **[F09; v1.2: F19.D]** — rejects `UPDATE` in **any** status of: `instrument_code`, `declared_synthetic`, `synthetic_emulates`, **`asset_id`, `instrument_form`, `chain`, `network`, `contract_address_canonical`** (the last five are lineage-/identity-critical: they select the asset lineage and the canonical identity). A typo in these is corrected only by abandoning the `DRAFT`, which permanently consumes the identity; `POST /instruments/validate` (04 §2.1) is the dry-run that exists to catch it first (OQ-8).
- `trg_instrument_identity_immutable` — rejects `UPDATE` of the remaining identity columns and `identity_fingerprint` when `lifecycle_status <> 'DRAFT'`; enforces SM-1 transitions (no return to `DRAFT`). The one exception is the `ASSET_CLASS_CORRECTION` transaction recomputing the cached fingerprint (§4.1).
- `trg_instrument_fiat_form` **[F08; v1.2: F22]** — `instrument_form = 'FIAT'` ⇔ the asset's `asset_class = 'FIAT_CURRENCY'`, checked at instrument `INSERT`; the reverse direction is guarded by `trg_asset_class_frozen` (§4.1), so an asset-side update cannot create an inconsistency.
- Lineage `synthetic` flag must equal `declared_synthetic` (no synthetic instrument in a real lineage and vice versa).
- `trg_instrument_lock_on_write` — every `UPDATE` (retire, identity lock, draft edits) first calls `ast1.lock_instrument()` (§7A).
No `DELETE` grant exists on any `ast1` table.

## 4.3 `instrument_underlying`, `instrument_risk_profile`

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

Triggers **[v1.2: F19.B, F19.D]**:
- `trg_underlying_insert_only` — a row with `underlying_type = 'INSTRUMENT'` is insert-only (no `UPDATE`, no `DELETE` grant); **any** underlying row may be inserted only while the instrument is `DRAFT`. The instrument-to-instrument link feeds `elevated` and the lineage conjunct, so it cannot be edited away.
- `trg_underlying_no_cycle` — rejects a link that closes a cycle and any chain deeper than 8 (`AST1_UNDERLYING_CYCLE`).
- `trg_underlying_same_kind` — a synthetic instrument may link only a synthetic underlying instrument, and a real one only a real one (synthetic history never enters a real lineage decision and vice versa).

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
  elevated_basis text[] NOT NULL DEFAULT '{}',             -- [v1.2: F19] trigger-computed ⊆ {OWN_LINEAGE, UNDERLYING_LINEAGE}
  global_seq bigint NOT NULL UNIQUE,                       -- [v1.2: F20] trigger-assigned from ast1.classification_global_seq AFTER the instrument locks are held; orders records across a lineage
  recorded_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, record_seq),
  CHECK (cardinality(checker_actor_ids) >= 1 AND NOT (maker_actor_id = ANY(checker_actor_ids))),   -- on attested values
  CHECK (NOT elevated OR (cardinality(checker_actor_ids) >= 2)),
  CHECK (elevated = (cardinality(elevated_basis) > 0)),
  CHECK (outcome = 'UNRESOLVED' OR (evidence_standard_id IS NOT NULL AND evidence_bundle_hash IS NOT NULL)),
  CHECK (outcome <> 'SYNTHETIC_TEST_INSTRUMENT' OR recorded_environment <> 'PRODUCTION')
);
```
Triggers on INSERT (all read authoritative rows; none trusts the supplied values):
1. Reject UPDATE/DELETE/TRUNCATE.
2. **Locks [v1.2: F18, F20].** Call `ast1.lock_instrument(instrument_id)` (`SELECT … FOR UPDATE` on the instrument row). For a **real** instrument and `outcome = SECURITY_OR_SECURITY_TOKEN`, also call `ast1.lock_affected_instruments(instrument_id)`: every instrument of the lineage root **and** every instrument whose transitive underlying chain reaches that lineage, `ORDER BY instrument_id ASC … FOR UPDATE`, taken **before** anything below is read. The application's apply transaction takes the same locks as its first statements; the trigger makes the rule non-optional (§7A).
3. `record_seq` = previous max + 1 (under the lock); **`global_seq` = `nextval('ast1.classification_global_seq')` drawn only after the locks are held**, so two records that touch a common instrument are ordered consistently with lock (hence commit) order.
4. Fill `recorded_environment` from `ast1.deployment_environment`; `identity_fingerprint` recomputed and compared; `lineage_id` from the asset root.
5. `outcome = 'SYNTHETIC_TEST_INSTRUMENT'` ⇔ `instrument.declared_synthetic` **[F09]**; instruments with **`instrument_form = 'FIAT'`** cannot receive any record **[F08, F22]**.
6. `NON_SECURITY_DIGITAL_ASSET` refused for asset classes `SECURITY` / `SECURITY_TOKEN` (`SECURITY_LABELLED`, AST-P-3) — **not** for `TOKENISED_DEBT`/`TOKENISED_FUND` (AST-HD-4).
7. **`elevated` (F06, v1.2: F19.B):** `elevated_basis` is computed from the ledger: `OWN_LINEAGE` iff ∃ a real (non-synthetic) `SECURITY_OR_SECURITY_TOKEN` record in the same lineage root — any instrument, any time, **any evidence standard** (a provisional SECURITY determination still narrows); `UNDERLYING_LINEAGE` iff the same holds for the lineage root of any **transitive** underlying instrument of the proposed instrument (depth > 8 ⇒ true). `elevated := basis ≠ ∅`. When `elevated ∧ outcome = 'NON_SECURITY_DIGITAL_ASSET'`: require ≥ 2 distinct `checker_actor_ids`, the case's evidence bundle to contain ≥ 1 item with `recorded_at_utc >` the newest such `SECURITY` record (across **all** basis lineages) whose `content_sha256` is not in that record's bundle, and `lineage_reviewed_attested`. Otherwise raise. The record's `outcome` is **not** automatically `SECURITY` for a wrapper: the path only forbids skipping the elevated review.
8. **Evidence standard [v1.2: F25].** The standard must be `APPROVED` and applicable to `recorded_environment`. If the instrument is **real** and `outcome = 'NON_SECURITY_DIGITAL_ASSET'`, the standard must additionally be **PRODUCTION-applicable** (`'PRODUCTION' = ANY(applicable_environments) ∧ r4q3_resolution_ref IS NOT NULL`); otherwise raise (`AST1_EVIDENCE_STANDARD_NOT_PRODUCTION_APPLICABLE`). A real instrument therefore has no provisional `NON_SECURITY` record; non-production standards serve **synthetic** instruments and the restrictive outcomes (`SECURITY`, `UNRESOLVED`) only (AST-R2-HD-01).
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
A hold writes **no** `classification_record`. `SYSTEM` holds are inserted by the integrity sweep/derivation guard, or by the application in a **separate controlled transaction after it catches a backstop error** (§7) — never by the raising trigger itself, because a raise rolls back everything the trigger did, including a hold insert. `SYSTEM` holds are inserted with no human approval.

**[v1.2: F24]** `instrument_hold`'s key columns (`instrument_id`, `hold_origin`, `reason_code`, `placed_by`, `placed_change_id`, `placed_at_utc`) are immutable from insert; only `status` (`ACTIVE → RELEASED` once), `release_change_id`, `released_at_utc` change. Hold insert and release call `ast1.lock_instrument()` first (§7A).

A hold is **not** the mechanism for lineage-linked security history: that is a **derived conjunct** (§7, `lineage_review_required`; 01 §4.7A), so it needs no rows, cannot be forgotten and takes effect at the commit of the triggering record.

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
`trg_attestation_binding` **[F13]**: an `ADMITTED` INSERT requires the referenced record to be the instrument's **current** record with outcome `SECURITY_OR_SECURITY_TOKEN` (or synthetic→`SECURITY`, non-production). Any later record makes the attestation stale by construction; C5 compares `classification_record_id` with the current record. A `WITHDRAWN` row (a tightening) is accepted regardless of record state.

**Key-column immutability [v1.2: F24].** A per-table `BEFORE UPDATE` trigger (`ast1.reject_key_update()`, key list below) makes the security-critical key columns immutable from `INSERT` for every role (`AS002`). A change of target is a **new row**, so an approved row cannot be retargeted to another instrument, product, domain or classification record by `UPDATE`.

| Table | Immutable from `INSERT` | Mutable (governed) |
|---|---|---|
| `product_admission` | `admission_id`, `instrument_id`, `product`, `classification_record_id`, `jurisdiction_assessed` | `status`, `approved_change_id`, `version` |
| `custody_support` | `instrument_id`, `domain`, `custody_model`, `custodian_ref`, `deposit_supported`, `withdrawal_supported` | `status`, `approved_change_id`, `version` |
| `instrument_operational_state` | `instrument_id`, `subject` (the PK) | `state`, `reason`, `approved_change_id`, `version` |
| `transfer_restriction_profile` | `instrument_id` | `status`, `approved_change_id`, `version` |
| `transfer_restriction`, `jurisdiction_rule` | everything except `status`, `lifted_change_id` | `status` (`ACTIVE → LIFTED` once), `lifted_change_id` |
| `securities_market_admission_attestation` | **append-only** (`INSERT, SELECT`): a withdrawal is a new `WITHDRAWN` row for the same `admission_ref`; the newest row per `(instrument_id, admission_ref)` wins | — |

Every insert/update on these tables first calls `ast1.lock_instrument(instrument_id)` (§7A). A partial unique index `ux_ast1_custody_live (instrument_id, domain) WHERE status IN ('PROPOSED','APPROVED')` states the one-live-custody-row-per-domain rule explicitly.

## 7. The authoritative SQL backstop [v1.1: F04; v1.2: F18, F19, F20, F21, F23, F25]

v1.0 CHECKed `effective_outcome` etc. on the row being inserted — values written by the very code being guarded. v1.1 replaced that with a SQL function that **reads the ledger**. v1.2 keeps that design and extends the same function (a) to **token consumption**, not only mint, and (b) to the lineage, MYR, service-identity and real-instrument-basis conditions.

```sql
ast1.authoritative_state(p_instrument_id uuid) RETURNS TABLE (
  instrument_form, declared_synthetic, synthetic_emulates, lifecycle_status,
  current_record_id, current_record_seq, current_global_seq, latest_outcome,   -- newest record only
  record_env_matches boolean, on_hold boolean, canonical_environment,
  standard_production_applicable boolean,   -- [F25] the newest record's standard is APPROVED and PRODUCTION-applicable
  lineage_review_required boolean,          -- [F20] see below
  attr_myr_denominated boolean)             -- [F21]
```
It first takes `SELECT … FROM ast1.instrument WHERE instrument_id = p_instrument_id FOR SHARE` (idempotent inside a transaction that already holds a stronger lock on the row; §7A), then reads `ast1.instrument`, `ast1.classification_record` (max `record_seq`), `ast1.evidence_standard`, `ast1.instrument_hold`, `ast1.deployment_environment` and the lineage tables. It contains **no** matrix, only the minimum needed to decide the forbidden set.

**`lineage_review_required` [F20].** True iff the instrument is real, `latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'`, and ∃ a real (non-synthetic) `classification_record` *r* with `r.outcome = 'SECURITY_OR_SECURITY_TOKEN'`, `r.instrument_id ≠ p_instrument_id`, **`r.global_seq > current_global_seq`** (the determination is newer than this instrument's own current record), whose instrument is (a) in the same lineage root, or (b) in the lineage root of any transitive underlying instrument (depth > 8 ⇒ true). It clears only when the instrument itself receives a **newer** record, which — because the lineage now holds a `SECURITY` determination — can only be appended by the elevated governed path (§5.1 trigger 7). Nothing else clears it. No classification record is rewritten.

```sql
ast1.backstop_permits(p_instrument_id uuid, p_subject varchar, p_consumer_service varchar DEFAULT NULL) RETURNS boolean
```
Returns **false** (⇒ the trigger raises `AS001`) when, using `authoritative_state`:

| # | Condition | Effect |
|---|---|---|
| B1 | `p_subject` ∈ MB/PSO set {`SPOT`,`OTC`,`PAY`,`DEPOSIT_MB_PSO`,`WITHDRAWAL_MB_PSO`} and the instrument's *emulated-or-actual* outcome is `SECURITY` (`latest_outcome = SECURITY_OR_SECURITY_TOKEN`, or `declared_synthetic ∧ synthetic_emulates = 'SECURITY'`) | deny |
| B2 | `p_subject` ∈ MB/PSO set and there is **no** current record, or `latest_outcome = 'UNRESOLVED'`, or `record_env_matches` is false | deny |
| B3 | any subject and **`instrument_form = 'FIAT'`** (form, not class) | deny (fiat never has an `allow`) |
| B4 | any subject and `latest_outcome = 'SYNTHETIC_TEST_INSTRUMENT'` and `canonical_environment = 'PRODUCTION'` | deny |
| B5 | any subject, real instrument (`declared_synthetic = false`), and subject ∈ securities-route set {`RWA` when outcome is SECURITY, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES`} with `latest_outcome = 'SECURITY_OR_SECURITY_TOKEN'` (F03) | deny |
| B6 | any subject and `on_hold` or `lifecycle_status = 'RETIRED'` | deny |
| B7 | `SECURITIES` domain subject and the *actual-or-emulated* outcome is `NON_SECURITY` (`latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'`, or `declared_synthetic ∧ synthetic_emulates = 'NON_SECURITY'`) | deny |
| **B8** [F20] | any subject, real instrument, `lineage_review_required` | deny |
| **B9** [F23] | `p_consumer_service` is an **MB/PSO service identity** (constant set in `ast1.mb_pso_service_identities()`: `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01`, `WLT-01`, `PAY-01`) and `p_subject` ∉ MB/PSO set; or `p_consumer_service = 'WLT-01'` and `p_subject` ∉ {`DEPOSIT_MB_PSO`,`WITHDRAWAL_MB_PSO`} | deny |
| **B10** [F21] | any subject, non-fiat instrument with `attr_myr_denominated = true` | deny (`MYR_PAIR_CONTROL_UNRESOLVED`; no override) |
| **B11** [F25] | any subject, **real** instrument, `latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'` and **not** `standard_production_applicable` | deny |

It is deliberately **coarser than the matrix** (it only forbids), written **independently** of the TypeScript matrix, and covered by a parity test (T-DB-09): for every instrument state, whenever the TS matrix returns anything other than `ELIGIBLE` for B1–B11-relevant cells the backstop must also deny, and it must never allow a cell the matrix denies for B1/B3/B5/B8/B10/B11. B9 duplicates the TS allow-list invariant (01 §5.8) in SQL and is parity-tested against it.

```sql
ast1.assert_token_consumable(p_token_hash varchar) RETURNS void   -- [F18] raises AS003 unless ALL hold:
```
 (i) the token row's `instrument_id, subject, domain, consumer_service, environment, classification_record_id, matrix_version` **equal** the referenced `eligibility_decision_log` row (which is `allow`); (ii) `consumer_service` equals the log row's `consumer_service` [F23]; (iii) `classification_record_id = authoritative_state().current_record_id`; (iv) `backstop_permits(instrument_id, subject, consumer_service)` is true **now**; (v) `revoked_at_utc IS NULL`, `consumed_at_utc IS NULL` and `expires_at_utc > clock_timestamp()`.

Triggers calling it:

| Table / event | Check |
|---|---|
| `eligibility_decision_log` `BEFORE INSERT` where `decision = 'allow'` | `instrument_id IS NOT NULL`; `backstop_permits(instrument_id, subject, consumer_service)`; `classification_record_id` = `current_record_id`. **The row's own `effective_outcome`, `environment` and `synthetic_emulates` columns are not consulted.** |
| `eligibility_decision_token` `BEFORE INSERT` | Same, plus the referenced log row must be `allow` and every binding column must equal it |
| **`eligibility_decision_token` `BEFORE UPDATE` [F18]** | **(1) immutability:** rejects a change to any column other than `consumed_at_utc`, `revoked_at_utc`, `revoked_reason` (`AS002`); those three are one-way (`NULL → value`, never cleared or rewritten). **(2) consumption:** when the update sets `consumed_at_utc`, the trigger takes the instrument lock (`FOR SHARE`, a no-op if the protocol already holds it) and calls `assert_token_consumable()`; on failure it raises `AS003` and the row is **not** consumed. Revocation is never blocked (a tightening) |
| `product_admission` insert / approve | `backstop_permits(instrument_id, product)` and current-record binding (§6) |
| `securities_market_admission_attestation` `ADMITTED` insert | current-record binding (§6) and `backstop_permits(instrument_id, 'SECURITIES_MARKET')` |
| `custody_support` approve, `instrument_operational_state` enable | `backstop_permits` for the domain's subject |
| A raised backstop (`AS001`, `AS003`) | **The trigger only raises.** The failed transaction stays **rolled back** and no `allow` row or consumption persists. The **application** catches the integrity error and, in a **separate controlled transaction** (which takes the instrument lock first), places a `SYSTEM` `instrument_hold` (`BACKSTOP_TRIPPED`) and writes the critical audit event (§7A failure handling). No autonomous transaction exists or is assumed [F24] |

*Residual (stated in 01 §5.5):* the function guarantees no `allow` row exists for instrument X × subject unless X's ledger permits it; the application could still log the decision against the wrong instrument id. Consumers bind the instrument id at `verify-decision`, and instrument resolution is canonical and never ambiguous (01 §3.11), which closes that.

## 7A. Locking protocol and the consumption transaction [v1.2: F18]

**Principle.** The instrument row lock *is* the classification/hold/admission/operational lock for that instrument. Every writer of an eligibility input takes it `FOR UPDATE`; every reader that must be stable (mint, consume) takes it `FOR SHARE`. Reads are `READ COMMITTED`; correctness rests on the locks, not on `SERIALIZABLE`.

**Global lock order** — a transaction may only acquire locks in this order, never backwards:

1. **Instrument rows**, in ascending `instrument_id` (a single instrument, or a set for lineage-wide operations).
2. **Token rows** (`eligibility_decision_token`, `FOR UPDATE` on consume; `UPDATE` on revoke).
3. Append-only inserts (`classification_record`, `eligibility_decision_log`, holds, audit outbox) take no row lock others wait on.

**Why instrument before token.** The recommended review sequence starts with the token row. That order **inverts** against every mutator that must revoke tokens: a mutator holding an instrument lock then needs the token rows, while a consumer holding a token row then needs the instrument lock — a deadlock. The coherent order takes the instrument first everywhere. The token's `instrument_id` is immutable after mint (trigger), so reading it *unlocked* to find which instrument to lock cannot be stale. All other steps of the recommended sequence are kept.

**Writers that take the instrument lock first (`FOR UPDATE`).** Classification record append; hold place/release; `product_admission` insert/approve/suspend/withdraw; `custody_support` and `instrument_operational_state` changes; transfer-restriction and jurisdiction-rule changes; `securities_market_admission_attestation` insert; instrument identity lock and retire; `SYSTEM` hold placement from the sweep or after a backstop trip; token revocation on narrowing; evidence-standard retirement (per affected instrument, ascending). **Lineage-wide writers** additionally lock **every affected instrument, ascending, before the first write**: a real `SECURITY` record (`lock_affected_instruments`, §5.1 trigger 2) and a lineage merge (both lineages' members). Each writer calls `ast1.lock_instrument()` as its first statement; the table triggers call it too, so a writer that forgets still holds the lock at write time.

**Mint (`evaluate`, allow path) — one transaction.**
1. `SELECT … FROM ast1.instrument WHERE instrument_id = $i FOR SHARE`.
2. Read all inputs (record, holds, admissions, custody, operational state, attestation, lineage state, client facts supplied by the caller).
3. Derive (TypeScript) and compute the authoritative backstop (`backstop_permits`).
4. `INSERT` log row and token row (both re-run the backstop by trigger).
5. `COMMIT`. A concurrent writer's `FOR UPDATE` waited for step 5, so a mutation either commits **before** the mint transaction reads (and the mint denies) or **after** it commits (and the writer then revokes the newly minted token).

**Consume (`verify-decision`) — one transaction.**
1. Read `token.instrument_id` **unlocked** (immutable). Unknown token ⇒ `AST1_DECISION_NOT_FOUND`.
2. `SELECT … FROM ast1.instrument … FOR SHARE` (blocks while any writer holds the instrument, including a lineage-wide writer that locked it as an affected sibling).
3. `SELECT … FROM ast1.eligibility_decision_token WHERE token_hash = $h FOR UPDATE`; check unexpired (DB `clock_timestamp()`), unconsumed, unrevoked.
4. Check the bindings against the request: authenticated service = `consumer_service`; stated `subject` and `instrument_id` equal the token's; environment = own; `payload_hash` recomputed from the **bound facts** the consumer re-supplies (client facts, caller reference, payload binding — 04 §6.2).
5. Resolve the **current** classification record (newest by `record_seq`) — stable because record inserts need `FOR UPDATE` on the row this transaction holds `FOR SHARE`. Read the hold, admission, custody, operational, attestation and lineage state under the same lock. (Lineage siblings and wrappers are covered because a `SECURITY` writer locks them as affected instruments.)
6. **Recompute the authoritative backstop** (`backstop_permits`) and the TypeScript re-derivation. Require `token.classification_record_id = current record`.
7. `UPDATE … SET consumed_at_utc = clock_timestamp() WHERE token_hash = $h AND consumed_at_utc IS NULL AND revoked_at_utc IS NULL`. The `BEFORE UPDATE` trigger **independently** re-runs `assert_token_consumable()` (steps 3, 5, 6 in SQL), so a consumer that skipped or mis-implemented them still cannot consume a stale or security-bound token. `SECURITY → MB/PSO` is therefore blocked at consumption by SQL, not only by TypeScript.
8. `COMMIT` (consumption and the audit outbox row commit together, or neither does).

`lock_timeout` is set to a short constant (≤ 5 s) for both transactions. A lock timeout (`55P03`) or deadlock (`40P01`) aborts the transaction: the token is **not** consumed and the caller receives `AST1_DECISION_UNAVAILABLE`, which a consumer treats as deny (it may retry the same unconsumed token within its TTL).

**Raw-SQL path.** A raw `UPDATE … SET consumed_at_utc` outside the protocol takes the token row lock first, then the trigger takes the instrument lock — the inverted order. That path is unsupported; if it deadlocks against a writer, PostgreSQL aborts one side and the consume fails (fail-closed). The trigger's checks still apply to it.

**Failure behaviour at consumption** (the failed transaction always stays rolled back; the token is not consumed):

| Condition | Where detected | Caller sees | Follow-up (separate transactions) |
|---|---|---|---|
| Token expired / consumed / revoked | steps 3, DB clock | `AST1_DECISION_EXPIRED` / `_CONSUMED` / `_REVOKED` | audit (replay of a consumed token: H) |
| Binding mismatch (service, subject, instrument, environment, payload) | step 4 | `AST1_DECISION_BINDING_MISMATCH` | audit H (C for a cross-domain subject); token **not** burned, so another service cannot deny a legitimate consumer |
| Record superseded or a conjunct now denies; TypeScript and SQL agree | steps 5–6 | `AST1_DECISION_STALE` | revoke the token (`instrument_reclassified` / `hold_placed` / `lineage_security_determination` / …); audit H |
| TypeScript says `ELIGIBLE` but SQL denies (divergence), or the SQL trigger raises `AS003` after the app saw no problem | step 7 | `AST1_DECISION_STALE` (fail-closed) | revoke; **`SYSTEM` hold `BACKSTOP_TRIPPED`** and `ast1.eligibility.consume_backstop_triggered` (C) |
| SQL hard rule B1 (`SECURITY` → MB/PSO) at consumption | steps 6–7 | `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` (422) | revoke; `SYSTEM` hold; critical event — a token existed for a security outcome, which the mint backstop should have prevented, so data or code is wrong |
| Lock timeout / deadlock | anywhere | `AST1_DECISION_UNAVAILABLE` | none; token unconsumed |

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
  client_jurisdiction char(2), client_class varchar(24),                   -- the client facts used by the derivation (bound into payload_hash) [F23]
  caller_ref varchar(128),                                                  -- [v1.2: F23] opaque order/operation reference from the caller (not PII); also bound into payload_hash
  requested_instrument_ref jsonb,                                           -- [v1.2: F17] canonical form of what was asked (kind + canonical values, no PII); NOT NULL when instrument_id is NULL
  payload_hash varchar(128),                                                -- [v1.2: F23] set on every allow
  caller_service varchar(64) NOT NULL, consumer_service varchar(64) NOT NULL,
  request_id varchar(128), correlation_id varchar(128), decided_at_utc timestamptz NOT NULL DEFAULT now(),
  CHECK ((decision = 'allow') = (eligibility_state = 'ELIGIBLE')),
  CHECK ((decision = 'not_applicable') = (eligibility_state = 'NOT_APPLICABLE')),
  CHECK (decision <> 'allow' OR (instrument_id IS NOT NULL AND classification_record_id IS NOT NULL AND payload_hash IS NOT NULL)),
  CHECK (instrument_id IS NOT NULL OR requested_instrument_ref IS NOT NULL),      -- [v1.2: F17] an unresolved reference is still evidenced
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
  consumer_service varchar(64) NOT NULL,                                   -- [F02] compared with the log row at insert AND at consumption [v1.2: F23]
  environment varchar(12) NOT NULL,
  classification_record_id uuid NOT NULL, classification_record_seq bigint NOT NULL,
  matrix_version varchar(24) NOT NULL,
  payload_hash varchar(128) NOT NULL, expires_at_utc timestamptz NOT NULL,
  consumed_at_utc timestamptz, revoked_at_utc timestamptz, revoked_reason varchar(32)
);
-- BEFORE INSERT: §7 backstop; every binding column must equal the referenced log row (instrument, subject, domain, consumer_service, environment, record, matrix_version, payload_hash).
-- BEFORE UPDATE [v1.2: F18]: only consumed_at_utc / revoked_at_utc / revoked_reason may change, one-way; consumption re-runs assert_token_consumable() (§7). Column-level UPDATE grant only (§10).
-- revoked_reason ∈ {instrument_reclassified, hold_placed, environment_mismatch, admission_suspended, attestation_stale, lineage_security_determination, backstop_reject, manual}
```
Log is append-only; retention ≥ six years (DEC-012 cl. 1 rule 7; LFSA-DMB-2025 ¶5.12 target, effective 1 January 2027 — not currently in force). No raw token stored.

## 9. Indexes (illustrative)

`instrument (asset_id)`, `asset (lineage_id)`, `classification_record (instrument_id, record_seq DESC)`, `classification_record (lineage_id, outcome, global_seq)`, `instrument_underlying (underlying_instrument_id)` (reverse traversal for the affected set), `eligibility_decision_token (instrument_id) WHERE consumed_at_utc IS NULL AND revoked_at_utc IS NULL`, `classification_case (instrument_id, state)`, `product_admission (instrument_id, product)`, `instrument_hold (instrument_id) WHERE status='ACTIVE'`, `eligibility_decision_log (instrument_id, decided_at_utc)`, `governed_change (target_type, target_id)`.

## 10. Privileges

| Object | `ast1_app` |
|---|---|
| `network_registry`, `deployment_environment` | `SELECT` only (no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`; `deployment_environment` is additionally trigger-immutable for every role, §2) |
| `classification_record`, `classification_evidence`, `eligibility_decision_log`, `lineage_merge`, `securities_market_admission_attestation` | `INSERT, SELECT` only |
| `eligibility_decision_token` **[v1.2: F18]** | `SELECT, INSERT`; column-level `UPDATE (consumed_at_utc, revoked_at_utc, revoked_reason)` only — no `UPDATE` on any binding column, no `DELETE` |
| `evidence_standard` | `SELECT`; status change via governed apply path |
| other tables | `SELECT, INSERT, UPDATE` — no `DELETE` anywhere; key-column `UPDATE`s are rejected by trigger regardless of grant (§6). `asset`/`instrument` lineage- and identity-critical columns likewise (§4) |
| any `iam2.*`, `cfg1.*`, `wlt1.*`, `clt1.*`, `kyc1.*`, `fnd.*` (beyond foundation outbox/idempotency objects granted to every service) | none (F3(c)) |

## 11. Data classification

Regulatory-critical, append-only: `classification_record`, `classification_evidence`, `eligibility_decision_log`, `governed_change`, `lineage_merge`. Compliance configuration: admissions, holds, restrictions, jurisdiction rules, custody, standards, risk profile. Reference: `asset`, `instrument`, `issuer_reference`, `network_registry`, `lineage`. No client PII: `client_jurisdiction`/`client_class` in the log are attribute values with no client id.

## 12. Migration intent (not created here)

Sequenced by risk: (a) reference + `deployment_environment` (+ its immutability trigger) + lineage + core (both canonical-identity unique indexes) + ledger (`global_seq`) + triggers + `authoritative_state`/`backstop_permits`/`assert_token_consumable` + lock helpers; (b) conjunct tables (+ key-immutability triggers); (c) governed change + decision log/token (+ token immutability/consumption triggers). **No seed of any classification, any `APPROVED` evidence standard, or any instrument** except test fixtures created by the test harness.
