# AST-01 — 05 Database Design (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW. Design only — no migration is created or numbered by this task.** Migration head is 071 at baseline `43f2f34`; numbering happens in the implementation task after re-checking the head. Conventions follow CFG-01: dedicated schema, `uuid` PKs, `varchar` + `CHECK` enums, opaque-string cross-module references (no FKs, no grants into other schemas — F3(c)), hash-only token storage, append-only tables by trigger + grant.

Schema **`ast1`**; runtime role `ast1_app` (illustrative). Changes from v1.0 are tagged **[v1.1: Fnn]**; changes from v1.1 (round-2 review [`04-review-r2.md`](../../../../03_implementation/tasks/AST-01/04-review-r2.md)) are tagged **[v1.2: Fnn]**; changes from v1.2 (round-3 review [`04-review-r3.md`](../../../../03_implementation/tasks/AST-01/04-review-r3.md): F26, F27, F28) are tagged **[v1.3: Fnn]**. Earlier tags are kept as provenance.

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
12. **[v1.3: F27, F28.b] One ordering domain, no wall clock.** Classification records, lineage merges and classification evidence draw their ordering value from the **same** sequence, `ast1.classification_global_seq`, only after the locks of §7A are held. Every ordering decision that affects security (record vs record, record vs merge, evidence vs event, the lineage conjunct, the elevated-evidence rule) compares these sequence values. **No timestamp, and no application-supplied value, participates in any security ordering**; every `*_at_utc` on the ledger, evidence and merge tables is filled by trigger and is audit-only.
13. **[v1.3: F27] A lineage merge is a ledger event.** It carries a DB-assigned `merge_global_seq` and narrows every affected instrument **in the merge transaction**, by the same derived predicate (`lineage_review_required`, §7) that a newer `SECURITY` record uses. Safety never waits for a sweep.
14. **[v1.3: F26] The record's identity binding is visible to SQL.** `authoritative_state()` derives `record_fingerprint_matches` from stored values; backstop rule **B12** denies on a mismatch. `ASSET_CLASS_CORRECTION` is a governed, locked, token-revoking writer, never an implicit side effect.
15. **[v1.3: F28.a] The database rejects a non-canonical contract identity.** The unique identity index therefore operates only on values the database itself has validated (§2.1).
16. **[v1.3: F28.c] `lineage` rows are insert-only.** `lineage.synthetic` cannot be edited by any role.

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
  PRIMARY KEY (chain, network),
  CHECK (ast1.address_rule_supported(address_format, canonicalisation_version))   -- [v1.3: F28.a] a network must name a rule the database can execute
);

ast1.deployment_environment (                 -- [F04] one row, set at bootstrap/migration, NO runtime write grant
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  canonical_environment varchar(12) NOT NULL
    CHECK (canonical_environment IN ('DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION'))
);
```
`deployment_environment` is written once by the migration/bootstrap role from the validated `ENVIRONMENT` (`canonicalEnvironment`, unknown ⇒ `PRODUCTION`). The application cannot change it; the SQL backstop reads it instead of a value on the row being inserted. A boot check compares it with the service's own config and refuses to start on disagreement.

**[v1.2: F24] Immutability.** `trg_deployment_environment_immutable` — `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement) — raises `AS002` for **every** role, including the migration/bootstrap role, once the row exists; the `singleton` primary key blocks a second row. The runtime role additionally holds no `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` privilege on it (§10). Changing the value is an out-of-band, audited DBA action that is not an application capability and is still refused at boot if it disagrees with service configuration.

### 2.1 Canonical contract identity is validated by the database [v1.3: F28.a]

**Problem (F28.a).** v1.2 guaranteed the canonical form of `contract_address_canonical` only through one TypeScript function. A registration-path defect that stored a second spelling of one contract would defeat `ux_ast1_instrument_token_identity` and make the resolver miss the row.

**Contract.** The database owns a versioned, deterministic canonicaliser and refuses any value that is not already in its output form. It never rewrites a supplied value.

```sql
-- IMMUTABLE, pure SQL; NULL when the raw value is not a valid address for the format
ast1.canonicalise_address(p_address_format varchar, p_version varchar, p_raw text) RETURNS text
ast1.address_rule_supported(p_address_format varchar, p_version varchar) RETURNS boolean   -- IMMUTABLE
```

- **Closed rule set.** `address_format` is a closed vocabulary; each `(address_format, canonicalisation_version)` pair is implemented **inside the function** (adding or changing a rule is a reviewed migration that replaces the function; the runtime role cannot). Rules are pure SQL (regular expression plus a case rule) so `canonicalise_address` is `IMMUTABLE` and usable in a `CHECK`. Illustrative rules, fixed by the migration phase against the chain list WLT-01 supports:

  | Format (illustrative) | Accepted raw input | Canonical output |
  |---|---|---|
  | `EVM_HEX40` | `^(0x\|0X)?[0-9A-Fa-f]{40}$` | `'0x' \|\| lower(hex40)` — an EIP-55 mixed-case checksum spelling and its lower-case form are **one** identity |
  | `BASE58_FIXED` (e.g. Solana-style) | `^[1-9A-HJ-NP-Za-km-z]{32,44}$` | identical (base58 is case-significant and has one spelling per byte string) |
  | `TRON_BASE58CHECK` | `^T[1-9A-HJ-NP-Za-km-z]{33}$` | identical; the hex `41…` spelling is **not** accepted as an alternative identity |
  | any other | — | **no rule ⇒ no `TOKEN_CONTRACT` instrument can be registered on that network** (fail closed) |

- **Where it is enforced (two layers).**
  1. **`CHECK` on `instrument`** (§4.2), surviving even a disabled trigger: `instrument_form <> 'TOKEN_CONTRACT' OR ast1.canonicalise_address(address_format, address_canonicalisation_version, contract_address_canonical) IS NOT DISTINCT FROM contract_address_canonical AND ... IS NOT NULL`. The stored value must equal its own canonical form.
  2. **`trg_instrument_address_canonical`** — `BEFORE INSERT OR UPDATE` on `instrument` (the `UPDATE` arm exists only so that a mutation attempt is refused with a specific error; `contract_address_canonical` is already immutable, §4.2). For `TOKEN_CONTRACT` it (i) reads `network_registry` for `(chain, network)` — the network must be `ACTIVE` and carry a supported rule; (ii) **overwrites** `instrument.address_format` and `instrument.address_canonicalisation_version` from the registry (application values ignored, as `recorded_environment` is); (iii) computes `c := ast1.canonicalise_address(...)` over the supplied value and **raises `AS005` (`AST1_ADDRESS_NOT_CANONICAL`) when `c IS NULL` or `c <> supplied`**. The supplied value is never silently canonicalised or accepted "as close enough": the registration path must send the canonical value, and a raw spelling is an error.
- **Uniqueness operates on validated values only.** `ux_ast1_instrument_token_identity` (§4.2) is created over `(chain, network, contract_address_canonical)`; because every row that reaches the index has passed the check above, two spellings of one contract cannot coexist as two rows, and a defect in the application's canonicaliser surfaces as an `AS005` rejection rather than a duplicate identity.
- **One canonicaliser.** The resolver canonicalises a requested reference with the **same SQL function** (`SELECT ast1.canonicalise_address(nr.address_format, nr.canonicalisation_version, $raw) FROM network_registry nr …`); a reference that yields `NULL` matches nothing (`INSTRUMENT_NOT_FOUND`). The TypeScript `canonicaliseContractAddress` is a **mirror** used for early client-side validation and is parity-tested against the SQL function over one shared vector corpus (T-ADR-03).
- **Versioning.** Each instrument stores the `address_canonicalisation_version` it was registered under (immutable). A version bump is a reviewed migration; before it is activated the sweep must show that every stored identity is a fixed point of the new rule and that no two identities collide under it. A bump that would re-map an existing identity is a governed data task outside this pack (it would otherwise silently split or merge identities).
- **What the database cannot check.** It has no checksum primitive, so it cannot tell a well-formed but mistyped address from the intended one (a typo that happens to be well-formed registers a wrong identity, which is harmless — OQ-8). Checksum validation, where a chain has one, stays in the TypeScript mirror and in `POST /instruments/validate`; it is advisory and never a precondition the database relies on.
- **Sweep (defence in depth).** The integrity sweep re-canonicalises **every** stored `TOKEN_CONTRACT` identity under the **current** registry rule and (a) flags any value that is not a fixed point, (b) groups by `(chain, network, canonicalise(value))` and flags any group with more than one row (the unique index bypassed by a disabled trigger/index, or a rule change), (c) checks the two identity indexes exist. A finding places a `SYSTEM` hold on each colliding or non-canonical instrument (`IDENTITY_COLLISION`, `IDENTITY_NOT_CANONICAL`) and emits `ast1.integrity.address_canonical_violation` (critical). It never rewrites a row.

## 3. Lineage [v1.1: F06; v1.3: F27, F28.c]

```sql
ast1.lineage (                                  -- [v1.3: F28.c] INSERT-ONLY; no column is ever updated
  lineage_id uuid PK DEFAULT gen_random_uuid(),
  synthetic boolean NOT NULL,                   -- fixed at INSERT; a real and a synthetic lineage never merge; NO default, NO update route
  created_at_utc timestamptz NOT NULL           -- [v1.3] trigger-filled (clock_timestamp()); an application value is overwritten
);
```
**`lineage.synthetic` is immutable from `INSERT` [v1.3: F28.c].** `trg_lineage_immutable` is a `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement) trigger that raises `AS002` for **every** role — the runtime role, the migration role and the table owner (the same model as `deployment_environment`, §2; disabling or dropping the trigger is an out-of-band DBA action that the sweep's trigger inventory check detects, T-SCH-12). The runtime role holds `INSERT, SELECT` only, so no `UPDATE` route exists even before the trigger. **Source of the value (clarification; v1.2 did not state one):** `trg_asset_lineage_on_insert` sets it once — for `SAME_ECONOMIC_SUBJECT` from the predecessor root's `synthetic`, and for `NONE_DECLARED` from the create-asset request's explicit `lineage_synthetic` boolean (04 §2.1; required for `NONE_DECLARED`, and it must equal the predecessor root's value otherwise, else the asset insert is rejected). The instrument insert already requires `lineage.synthetic = instrument.declared_synthetic` (§4.2), so a wrongly flagged lineage can only ever fail closed (its instruments are rejected); it can never be flipped afterwards. **Real and synthetic histories therefore cannot be converted into one another by editing the lineage row, and the merge and underlying-link "same kind" rules (below, §4.3) rest on an immutable value.**

```sql
ast1.lineage_gate (                             -- [v1.3: F27] singleton; exists only to be locked (§7A level 0); never carries data
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  lock_token boolean NOT NULL DEFAULT true
);
```
Seeded with its one row by the migration. `trg_lineage_gate_immutable` raises `AS002` on any `UPDATE`, `DELETE` or `TRUNCATE` for every role; a `SELECT … FOR SHARE/UPDATE` fires no such trigger, so the row is lockable but never changeable.

```sql
ast1.lineage_merge (                            -- append-only, irreversible; governed change (maker-checker)
  merge_id uuid PK, surviving_lineage_id uuid NOT NULL REFERENCES ast1.lineage,
  merged_lineage_id uuid NOT NULL REFERENCES ast1.lineage,
  change_id varchar(64) NOT NULL,
  merge_global_seq bigint NOT NULL UNIQUE,     -- [v1.3: F27] DB-assigned by trigger from ast1.classification_global_seq; NO caller-supplied value
  recorded_at_utc timestamptz NOT NULL,         -- [v1.3: F28.b] trigger-filled; audit only, never used for ordering
  CHECK (surviving_lineage_id <> merged_lineage_id),
  UNIQUE (merged_lineage_id)
);
```
`ast1.lineage_root(lineage_id)` follows merges to the root; **all lineage reads go through the root**, so a merge extends the history seen by every member — **in both directions**: the members of the surviving tree see the merged tree's history, and the members of the merged tree see the surviving tree's.

**[v1.2: F19.D] Lineage assignment is immutable from creation.** No role can `UPDATE` `asset.lineage_id`, `predecessor_declaration`, `predecessor_ref` or `predecessor_attested_by` (§4.1), and a merge does **not** update asset rows: it appends a `lineage_merge` row and `lineage_root()` follows it. The merge is the only governed lineage operation. There is **no un-merge and no loosening correction**: a wrongly *separate* lineage is fixed by a merge (tightening); a wrongly *merged* lineage is never split, and its members take the elevated path (fail-closed).

**`trg_lineage_merge_apply` [v1.3: F27]** — `BEFORE INSERT` on `lineage_merge`. Its order is fixed, and it is what makes the sequencing rule non-optional even for a caller that skipped the application's own steps:

1. Require `lineage.synthetic` equal on both lineages, **and require both arguments to be current roots** (`lineage_root(x) = x`; the merge API resolves any lineage or instrument reference to its root before it reaches SQL). Two distinct roots cannot form a cycle.
2. Require the referenced `governed_change` (`change_id`) to be of kind `LINEAGE_MERGE`, `applied` **by this transaction** (the row's `xmin` is the current transaction id), targeting exactly these two roots.
3. **Take the locks** (§7A order): `ast1.lock_lineage_gate_exclusive()`; then `ast1.lock_merge_affected_instruments(surviving, merged)` — every instrument of both merge trees **and** every instrument whose transitive underlying chain reaches an instrument of either tree, `ORDER BY instrument_id ASC … FOR UPDATE` (the application takes the same locks as its first statements; re-locking is a no-op). The set is re-derived after the locks are held and the trigger raises `AS006` (`AST1_LOCK_SET_CHANGED`, retry) if it grew.
4. **Only now** assign `NEW.merge_global_seq := nextval('ast1.classification_global_seq')` and `NEW.recorded_at_utc := clock_timestamp()`. The value is never read from the caller; an application-supplied `merge_global_seq` is overwritten. Because steps 1–3 precede the draw and the gate is exclusive, two lineage-wide events (a real `SECURITY` record, a merge) are ordered by sequence in the same order in which they commit, and any classification writer is ordered against them by the gate (§7A).

The **narrowing** that follows the insert (identify affected instruments, revoke tokens, audit) is the merge apply transaction, §7A.

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
- `trg_asset_class_frozen` **[F22; v1.3: F26, F28 note]** — `asset_class` may be updated only (a) while the asset has **no** instrument, or (b) inside the transaction that has just marked an `ASSET_CLASS_CORRECTION` governed change `applied` (the change row's `xmin` is the current transaction id) for exactly this asset and (from, to) — the correction path for a mislabelled class (AST-P-3; 01 §3.4). **Both branches first take `SELECT … FROM ast1.asset WHERE asset_id = OLD.asset_id FOR UPDATE` and only then evaluate "no instrument exists" / the correction preconditions** (§7A level 1). A correction (i) never crosses the FIAT boundary once an instrument exists (`FIAT_CURRENCY` ⇔ `instrument_form = 'FIAT'`), (ii) when it moves a class **out of** `SECURITY`/`SECURITY_TOKEN` needs ≥ 2 attested approvers (`COMPLIANCE_OFFICER` + `MLRO`), because it loosens, (iii) leaves `lineage_id` untouched (lineage preserved), and (iv) **[v1.3: F26]** in the same transaction (a) recomputes the cached `instrument.identity_fingerprint` of **every** instrument of the asset (the fingerprint's `underlying[]` component hashes link descriptors only — never the linked instrument's class or fingerprint — so the correction changes the fingerprints of the corrected asset's instruments and of no other) — the only permitted post-lock write to that column — (b) inserts one `class_correction_marker` per instrument that has a classification record (§5.3), and (c) revokes every outstanding token of those instruments (`asset_class_corrected`). The old records stay in the ledger unchanged but can no longer be used: SQL sees the mismatch (`record_fingerprint_matches = false`, rule **B12**, §7) and the TypeScript derivation collapses them (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`, 01 §4.4). A new governed classification is mandatory before any eligibility can return. The trigger refuses branch (b) unless the marker rows and the token revocation for every instrument of the asset are present at the end of the transaction (a deferred constraint trigger, so the writer's statement order is free but the outcome is not optional).
- **Race with the first instrument insert [v1.3; review §13 note].** The FK from `instrument.asset_id` to `asset` takes only `FOR KEY SHARE`, which does **not** conflict with the `UPDATE` of a non-key column, so the FK alone would let "no instrument exists" (branch a) race a concurrent first insert. `trg_instrument_asset_lock` (§4.2) therefore takes `SELECT … FROM ast1.asset … FOR SHARE` before an instrument is inserted, and every asset-class writer takes `FOR UPDATE` on the same row before it decides. `FOR SHARE` and `FOR UPDATE` conflict, so exactly one order occurs: the class writer first (the insert then waits, and sees the final class and form rule), or the insert first (the class writer then waits, then sees an instrument and refuses branch a / takes the correction path). No class/form interleaving is possible, so it does not need a later control to deny it.
- `issuer_ref_id` is frozen once any instrument of the asset is `IDENTITY_LOCKED`.

### 4.2 `instrument`

```sql
ast1.instrument (
  instrument_id uuid PK DEFAULT gen_random_uuid(),
  instrument_code varchar(48) NOT NULL UNIQUE CHECK (instrument_code ~ '^[A-Z0-9][A-Z0-9._:-]{1,47}$'),
  asset_id uuid NOT NULL REFERENCES ast1.asset,
  instrument_form varchar(20) NOT NULL CHECK (instrument_form IN ('FIAT','NATIVE_COIN','TOKEN_CONTRACT','OFF_CHAIN_RECORD')),
  chain varchar(16), network varchar(16), contract_address_canonical varchar(128),
  address_format varchar(32), address_canonicalisation_version varchar(16),               -- [v1.3: F28.a] trigger-filled from network_registry; immutable; NULL unless TOKEN_CONTRACT
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
  CHECK (instrument_form <> 'TOKEN_CONTRACT' OR (address_format IS NOT NULL AND address_canonicalisation_version IS NOT NULL
         AND ast1.canonicalise_address(address_format, address_canonicalisation_version, contract_address_canonical) IS NOT NULL
         AND ast1.canonicalise_address(address_format, address_canonicalisation_version, contract_address_canonical) = contract_address_canonical)),   -- [v1.3: F28.a] the stored value equals its own canonical form (§2.1)
  CHECK (instrument_form = 'TOKEN_CONTRACT' OR (address_format IS NULL AND address_canonicalisation_version IS NULL)),
  CHECK (instrument_form <> 'NATIVE_COIN' OR (chain IS NOT NULL AND network IS NOT NULL AND contract_address_canonical IS NULL)),
  CHECK (instrument_form <> 'FIAT' OR (chain IS NULL AND network IS NULL AND contract_address_canonical IS NULL
         AND NOT declared_synthetic AND NOT attr_privacy_coin AND NOT attr_algorithmic_stablecoin
         AND NOT attr_yield_bearing AND NOT attr_derivative_like)),                     -- [F08] fiat is reference data only
  CHECK (instrument_form <> 'OFF_CHAIN_RECORD' OR (chain IS NULL AND network IS NULL AND contract_address_canonical IS NULL)),   -- [v1.2: F17] no on-chain identity ⇒ resolved by id/code only
  CHECK (on_chain_decimals IS NULL OR amount_scale <= on_chain_decimals),
  FOREIGN KEY (chain, network) REFERENCES ast1.network_registry
);
-- [v1.2: F17, F19.A, F19.E] Canonical on-chain identity. Both indexes cover EVERY lifecycle_status (RETIRED and abandoned DRAFT rows are NOT excluded).
-- [v1.3: F28.a] Every row reaching the token index has passed the canonical-form CHECK and trigger (§2.1), so the index operates only on validated canonical values:
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
- `trg_instrument_immutable_from_insert` **[F09; v1.2: F19.D]** — rejects `UPDATE` in **any** status of: `instrument_code`, `declared_synthetic`, `synthetic_emulates`, **`asset_id`, `instrument_form`, `chain`, `network`, `contract_address_canonical`, `address_format`, `address_canonicalisation_version`** (the last seven are lineage-/identity-critical: they select the asset lineage and the canonical identity). A typo in these is corrected only by abandoning the `DRAFT`, which permanently consumes the identity; `POST /instruments/validate` (04 §2.1) is the dry-run that exists to catch it first (OQ-8).
- `trg_instrument_identity_immutable` — rejects `UPDATE` of the remaining identity columns and `identity_fingerprint` when `lifecycle_status <> 'DRAFT'`; enforces SM-1 transitions (no return to `DRAFT`). The one exception is the `ASSET_CLASS_CORRECTION` transaction recomputing the cached fingerprint (§4.1).
- `trg_instrument_asset_lock` **[v1.3: first-instrument race]** — `BEFORE INSERT`: `SELECT … FROM ast1.asset WHERE asset_id = NEW.asset_id FOR SHARE` (§7A level 1) before any check that reads the asset's class or lineage. It is the counterpart of the `FOR UPDATE` taken by every asset-class writer (§4.1).
- `trg_instrument_address_canonical` **[v1.3: F28.a]** — `BEFORE INSERT OR UPDATE`: rejects a non-canonical contract identity and overwrites `address_format` / `address_canonicalisation_version` from `network_registry` (§2.1).
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
  -- [v1.3: F28.b, F27] set at SUBMIT by trigger from the ledger under the locks of §7A; the maker cannot supply them. NULL unless the submission is elevated.
  follows_event_kind varchar(16) CHECK (follows_event_kind IN ('SECURITY_RECORD','LINEAGE_MERGE')),
  follows_event_id uuid,                                                        -- record_id or merge_id of the newest triggering event (the review floor, §5.1 trigger 7)
  follows_event_global_seq bigint,                                              -- that event's global_seq / merge_global_seq
  CHECK ((follows_event_kind IS NULL) = (follows_event_id IS NULL) AND (follows_event_id IS NULL) = (follows_event_global_seq IS NULL)),
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
  synthetic boolean NOT NULL, author_actor_id varchar(64) NOT NULL,
  evidence_global_seq bigint NOT NULL UNIQUE,      -- [v1.3: F28.b] DB-assigned from ast1.classification_global_seq under the locks below; an application value is overwritten
  recorded_at_utc timestamptz NOT NULL             -- [v1.3: F28.b] trigger-filled (clock_timestamp()); audit only, never compared
);
```
Trigger: `synthetic` = the case instrument's `declared_synthetic`; a real instrument's bundle may not include an item from a synthetic case.

**`trg_evidence_server_order` [v1.3: F28.b]** — `BEFORE INSERT` on `classification_evidence`, in this order: (1) for a real instrument, `ast1.lock_lineage_gate_shared()`; (2) `ast1.lock_instrument(<the case's instrument>)` (`FOR UPDATE`); (3) `NEW.evidence_global_seq := nextval('ast1.classification_global_seq')`; (4) `NEW.recorded_at_utc := clock_timestamp()`. **Exact invariant (INV-21):** *evidence item E is newer than event e (a real `SECURITY` record or a lineage merge) for instrument X if and only if `E.evidence_global_seq > e.global_seq` (`e.merge_global_seq` for a merge). Both values are drawn by the database from one sequence while the drawing transaction holds X's row lock, and — for a `SECURITY` record or a merge — the lineage gate exclusively and every affected instrument (X included). Two such events therefore cannot draw in one order and commit in the other, and no application-supplied timestamp or sequence enters the comparison.* The evidence table is insert-only, so an item's sequence never changes.

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
  global_seq bigint NOT NULL UNIQUE,                       -- [v1.2: F20] trigger-assigned from ast1.classification_global_seq AFTER the locks of §7A are held; the ONE ordering domain shared with lineage_merge.merge_global_seq and classification_evidence.evidence_global_seq [v1.3]
  review_floor_global_seq bigint,                          -- [v1.3: F27, F28.b] trigger-computed for an elevated record: the newest triggering event it had to follow (audit copy of §5.1 trigger 7)
  recorded_at_utc timestamptz NOT NULL,                    -- [v1.3: F28.b] trigger-filled (clock_timestamp()); an application value is overwritten; audit only, NEVER used for ordering
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
2. **Locks [v1.2: F18, F20; v1.3: F27, F28.b].** In the order of §7A: (a) `ast1.lock_lineage_gate_shared()` — or `ast1.lock_lineage_gate_exclusive()` for a **real** instrument and `outcome = SECURITY_OR_SECURITY_TOKEN`; (b) `ast1.lock_instrument(instrument_id)` (`SELECT … FOR UPDATE` on the instrument row); (c) for the exclusive case, also `ast1.lock_affected_instruments(instrument_id)`: every instrument of the lineage merge tree of the instrument **and** every instrument whose transitive underlying chain reaches that tree, `ORDER BY instrument_id ASC … FOR UPDATE`, re-derived after the locks are held (`AS006` if the set grew). All of this precedes anything read below. The application's apply transaction takes the same locks as its first statements; the trigger makes the rule non-optional (§7A).
3. `record_seq` = previous max + 1 (under the lock); **`global_seq` = `nextval('ast1.classification_global_seq')` drawn only after the locks are held**, so two records that touch a common instrument, and a record and a merge on one tree, are ordered consistently with lock (hence commit) order; `recorded_at_utc := clock_timestamp()` (supplied value ignored).
4. Fill `recorded_environment` from `ast1.deployment_environment`; **[v1.3: F26 clarification]** `identity_fingerprint` must equal the instrument's cached `identity_fingerprint` read under the lock (SQL cannot recompute the canonical-JSON hash; the TypeScript apply recomputes it from the live columns and stops on disagreement, and the sweep re-verifies it, S4); `lineage_id` from the asset root.
5. `outcome = 'SYNTHETIC_TEST_INSTRUMENT'` ⇔ `instrument.declared_synthetic` **[F09]**; instruments with **`instrument_form = 'FIAT'`** cannot receive any record **[F08, F22]**.
6. `NON_SECURITY_DIGITAL_ASSET` refused for asset classes `SECURITY` / `SECURITY_TOKEN` (`SECURITY_LABELLED`, AST-P-3) — **not** for `TOKENISED_DEBT`/`TOKENISED_FUND` (AST-HD-4).
7. **`elevated` (F06; v1.2: F19.B; v1.3: F27, F28.b):** `elevated_basis` is computed from the ledger: `OWN_LINEAGE` iff ∃ a real (non-synthetic) `SECURITY_OR_SECURITY_TOKEN` record in the same lineage **merge tree** (`lineage_root(record.lineage_id)` = the instrument's root) — any instrument, any time, **any evidence standard** (a provisional SECURITY determination still narrows); `UNDERLYING_LINEAGE` iff the same holds for the merge tree of any **transitive** underlying instrument of the proposed instrument (depth > 8 ⇒ true). `elevated := basis ≠ ∅`. A merge changes what is in the tree, so a merged-in `SECURITY` record makes the basis non-empty for every member of both sides. When `elevated ∧ outcome = 'NON_SECURITY_DIGITAL_ASSET'`, require (i) ≥ 2 distinct `checker_actor_ids`; (ii) `lineage_reviewed_attested`; (iii) **the sequence rule**: let the **review floor** `F` be the **newest triggering event over every basis tree** — the maximum of (α) `global_seq` of every real `SECURITY` record in the tree and (β) `merge_global_seq` of every `lineage_merge` edge of the tree **for which a real `SECURITY` record of the tree has `global_seq < merge_global_seq`** (a merge that joined security history; the same definition as clause (b) of `lineage_review_required`, §7). The case's evidence bundle must contain ≥ 1 item with **`evidence_global_seq > F`** counting only items whose `content_sha256` is not in the bundle of the newest real `SECURITY` record of any basis tree; and (iv) **the explicit binding**: `case.follows_event_*` (set at submit by trigger from the ledger) must name the **same** event as the `F` recomputed now. If a further triggering event occurred between submit and apply, `F` has moved, the binding is stale and the record is refused (`AST1_ELEVATED_APPROVAL_REQUIRED`, reason `binding_stale`; the case is resubmitted with new evidence). Otherwise raise. The record stores `review_floor_global_seq := F`. **No `recorded_at_utc` value is read anywhere in this trigger.** A `NON_SECURITY` record that lacks (i)–(iv) is never appended, so a "reaffirmation" that is not elevated cannot clear a lineage review requirement (§7). The record's `outcome` is **not** automatically `SECURITY` for a wrapper: the path only forbids skipping the elevated review.
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

### 5.3 `class_correction_marker` — an explained fingerprint change [v1.3: F26]

A governed `ASSET_CLASS_CORRECTION` changes every instrument's cached `identity_fingerprint` **on purpose**. SQL rule B12 must deny on the resulting mismatch (§7), and the derivation and the sweep must be able to tell this **expected, governed** state from an **unexplained** drift, without a `SYSTEM` hold and without calling the correction an integrity attack. The distinction is data, not judgement:

```sql
ast1.class_correction_marker (                     -- INSERT-ONLY; written only by the correction transaction
  marker_id uuid PK DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES ast1.instrument,
  asset_id uuid NOT NULL REFERENCES ast1.asset,
  change_id varchar(64) NOT NULL REFERENCES ast1.governed_change (change_id),   -- the GOVERNING change reference
  from_class varchar(24) NOT NULL, to_class varchar(24) NOT NULL,
  superseded_record_id uuid NOT NULL REFERENCES ast1.classification_record,     -- the instrument's current record at correction time
  superseded_record_fingerprint char(64) NOT NULL,                              -- that record's identity_fingerprint
  new_instrument_fingerprint char(64) NOT NULL,                                 -- the instrument's cached fingerprint after the correction
  marker_global_seq bigint NOT NULL UNIQUE,                                     -- from ast1.classification_global_seq, after the locks
  recorded_at_utc timestamptz NOT NULL,                                         -- trigger-filled; audit only
  CHECK (from_class <> to_class),
  UNIQUE (instrument_id, change_id)
);
```
- **Explained drift** ≡ ∃ a marker *m* for the instrument with `m.superseded_record_fingerprint = current record's identity_fingerprint` **and** `m.new_instrument_fingerprint = the instrument's current identity_fingerprint`, whose `change_id` is an `applied` governed change of kind `ASSET_CLASS_CORRECTION` targeting the marker's asset with payload (`from_class`, `to_class`). This is exposed by `authoritative_state()` as `drift_explained_by_correction` (§7) and mirrored by the TypeScript derivation. Two corrections in a row without a reclassification each add a marker whose `superseded_record_*` is still the same current record, so the newest marker explains the newest fingerprint.
- **Unexplained drift** ≡ `record_fingerprint_matches = false` and no such marker. It keeps the v1.2 behaviour: `CLASSIFICATION_IDENTITY_DRIFT`, a `SYSTEM` hold, the critical `ast1.instrument.identity_drift_detected`.
- **A marker never permits anything.** B12 denies in both cases; the marker only selects the reason code (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION` versus `CLASSIFICATION_IDENTITY_DRIFT`), the audit event and whether the sweep places a hold. A forged marker can therefore mislabel a tamper but cannot make anything eligible; the sweep verifies each marker's governing change (§7 sweep rules) and treats a marker whose change does not verify as **no** marker.
- **A marker stops explaining anything once the instrument receives a new record** whose `identity_fingerprint` equals the instrument's current fingerprint (`record_fingerprint_matches` becomes true). Markers remain as history.
- Written only by `trg_asset_class_frozen` branch (b)'s transaction (the insert trigger checks the change is `applied` by the current transaction for this asset and (from, to), and that `superseded_record_id` is the instrument's newest record). `INSERT, SELECT` grants only.

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

## 7. The authoritative SQL backstop [v1.1: F04; v1.2: F18, F19, F20, F21, F23, F25; v1.3: F26, F27]

v1.0 CHECKed `effective_outcome` etc. on the row being inserted — values written by the very code being guarded. v1.1 replaced that with a SQL function that **reads the ledger**. v1.2 keeps that design and extends the same function (a) to **token consumption**, not only mint, and (b) to the lineage, MYR, service-identity and real-instrument-basis conditions. **v1.3** (c) redefines the lineage condition so a **lineage merge** narrows exactly as a newer `SECURITY` record does (F27), and (d) adds the **record-to-instrument fingerprint comparison** and rule **B12**, so `ASSET_CLASS_CORRECTION` is visible to SQL (F26).

```sql
ast1.authoritative_state(p_instrument_id uuid) RETURNS TABLE (
  instrument_form, declared_synthetic, synthetic_emulates, lifecycle_status,
  current_record_id, current_record_seq, current_global_seq, latest_outcome,   -- newest record only
  record_env_matches boolean, on_hold boolean, canonical_environment,
  standard_production_applicable boolean,   -- [F25] the newest record's standard is APPROVED and PRODUCTION-applicable
  record_fingerprint_matches boolean,       -- [v1.3: F26] newest record's identity_fingerprint = instrument.identity_fingerprint; see below
  drift_explained_by_correction boolean,    -- [v1.3: F26] a verified class_correction_marker explains the mismatch (§5.3); label only, never a permission
  lineage_review_required boolean,          -- [F20; v1.3: F27] see below
  attr_myr_denominated boolean)             -- [F21]
```
It first takes `SELECT … FROM ast1.instrument WHERE instrument_id = p_instrument_id FOR SHARE` (idempotent inside a transaction that already holds a stronger lock on the row; §7A), then reads `ast1.instrument`, `ast1.classification_record` (max `record_seq`), `ast1.evidence_standard`, `ast1.instrument_hold`, `ast1.deployment_environment` and the lineage tables. It contains **no** matrix, only the minimum needed to decide the forbidden set. **[v1.3, review §7 implementation note]** `authoritative_state()`, `backstop_permits()`, `assert_token_consumable()` and every trigger function that takes a row lock must be declared `VOLATILE` (PostgreSQL rejects `FOR SHARE/UPDATE` in non-volatile functions, and under `READ COMMITTED` each statement must see commits made while it waited for a lock); `canonicalise_address` / `address_rule_supported` are the only `IMMUTABLE` functions.

**`record_fingerprint_matches` [v1.3: F26].** Derived inside the function from two stored values: `current record.identity_fingerprint = instrument.identity_fingerprint`, where the record is the newest by `record_seq` and the instrument row is the one read under the lock. It is `true` when there is no current record (B2 handles that case), and it is **never** a parameter, a column of the log or token, or any application-supplied value. The database cannot recompute the fingerprint from the live identity columns (it is a canonical-JSON hash computed in TypeScript); it does not need to for the cases it must cover: identity columns are trigger-immutable after lock, so the **only** governed way the cached fingerprint changes is `ASSET_CLASS_CORRECTION` (§4.1 iv), and any change to that cached value is visible as a mismatch. A cached value that disagrees with the live columns (raw tampering) is the sweep's and the TypeScript derivation's job (T-INT-01), unchanged from v1.2. `drift_explained_by_correction` is `true` only when `record_fingerprint_matches = false` **and** a verified `class_correction_marker` explains it (§5.3); it selects a reason code and sweep behaviour and is **not** read by `backstop_permits` (B12 denies either way).

**`lineage_review_required` [F20; v1.3: F27 — one definition, stated identically in TypeScript (C0b) and here].** Let *c* be X's current record and `c.global_seq` = `current_global_seq`. For an instrument X define its **basis trees** *B(X)*: the lineage merge tree (identified by its root, `lineage_root(...)`) of X's own asset, and the merge tree of each **transitive underlying instrument** of X (`instrument_underlying`, depth ≤ 8). For a tree *G*: **SEC(G)** = the real (non-synthetic) `classification_record`s with `outcome = 'SECURITY_OR_SECURITY_TOKEN'` and `lineage_root(record.lineage_id) = G`; **MERGES(G)** = the `lineage_merge` rows with `lineage_root(merged_lineage_id) = G` (every edge of the tree). Then `lineage_review_required(X)` is **true** iff X is real, `latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'`, and (`depth > 8` on any underlying chain, fail-closed) **or** ∃ *G* ∈ *B(X)* such that

- **(a) newer `SECURITY` record:** ∃ *r* ∈ SEC(*G*), `r.instrument_id ≠ X`, **`r.global_seq > c.global_seq`**; **or**
- **(b) merge after X's review that joined security history:** ∃ *m* ∈ MERGES(*G*) with **`m.merge_global_seq > c.global_seq`** and ∃ *r* ∈ SEC(*G*) with **`r.global_seq < m.merge_global_seq`**.

Clause (b) is the **documented fail-closed over-approximation**. Read with the merge tree already formed, it says: *a merge newer than X's current record whose tree holds a real `SECURITY` record recorded before that merge.* (If such a record entered the tree only through a **later** merge, that later merge is itself a clause-(b) event for X, so nothing is missed.) It covers, without needing to know which side each instrument came from, all four cases of F27: (1) an older `SECURITY` record joined to a newer `NON_SECURITY` instrument; (2) a newer `SECURITY` record and an older `NON_SECURITY` instrument that a merge then puts in one tree (clause (a) also fires); (3) a merge of an **underlying's** tree (*G* ∈ *B(X)* through the underlying chain); (4) a `SECURITY` record that lands in the tree later (clause (a)). It over-approximates when a merge joins an unrelated clean tree into a tree whose members were already elevated-reviewed: those members become `NOT_ASSESSED` until re-reviewed. That is a deliberate availability cost (12 AR-24) and never a safety gap. Because `global_seq` and `merge_global_seq` come from **one** sequence drawn under the lock protocol of §7A, "after X's current record" is a comparison of two DB-assigned values; no timestamp and no caller value is involved.

**Clearing.** The condition clears when X's `current_global_seq` exceeds every triggering value, i.e. when X receives a **newer** record. Because the merge tree now holds a `SECURITY` record, that record can only be appended by the elevated path (§5.1 trigger 7: two attested checkers, `lineage_reviewed_attested`, evidence with `evidence_global_seq` newer than the review floor **and** the explicit `follows_event_*` binding to the newest triggering event, merges included). A pre-merge `NON_SECURITY` record has a lower `global_seq` than the merge, so it can **never** clear a post-merge requirement, and a reaffirmation that does not meet the elevated requirements is refused by the trigger and therefore never becomes a record. The classification of X is **not** rewritten and is **not** made `SECURITY`: eligibility becomes `NOT_ASSESSED` / `LINEAGE_SECURITY_REVIEW_REQUIRED` (01 §4.7A). Nothing else — no hold release, admission, flag, role or configuration — clears it.

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
| **B8** [F20; v1.3: F27] | any subject, real instrument, `lineage_review_required` (clauses (a) newer `SECURITY` record **or** (b) merge after X's review that joined security history) | deny |
| **B9** [F23] | `p_consumer_service` is an **MB/PSO service identity** (constant set in `ast1.mb_pso_service_identities()`: `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01`, `WLT-01`, `PAY-01`) and `p_subject` ∉ MB/PSO set; or `p_consumer_service = 'WLT-01'` and `p_subject` ∉ {`DEPOSIT_MB_PSO`,`WITHDRAWAL_MB_PSO`} | deny |
| **B10** [F21] | any subject, non-fiat instrument with `attr_myr_denominated = true` | deny (`MYR_PAIR_CONTROL_UNRESOLVED`; no override) |
| **B11** [F25] | any subject, **real** instrument, `latest_outcome = 'NON_SECURITY_DIGITAL_ASSET'` and **not** `standard_production_applicable` | deny |
| **B12** [v1.3: F26] **IDENTITY / CLASSIFICATION FINGERPRINT DRIFT** | any subject (real or synthetic), instrument has a current record and **`record_fingerprint_matches = false`** | deny. Reported as `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when `drift_explained_by_correction`, else `CLASSIFICATION_IDENTITY_DRIFT` (the SQL error is `AS001` with rule tag `B12` in both cases) |

**Rule order and compatibility with the hard rule [v1.3: F26].** B1 keeps reading `latest_outcome` (the newest record as stored), so a drifted `SECURITY` record still denies as `SECURITY` for every MB/PSO subject even after a correction moved its class; B12 is **additional**, not a replacement, and is evaluated after B1–B3 so the most specific reason wins. B12 makes every eligibility or action that *relies on the classification record* deny: no `allow` log row or token mint (`AS001`), no token consumption (`AS003`, via `assert_token_consumable` → `backstop_permits`), no `product_admission` insert or approval, no `ADMITTED` securities-market attestation, no custody approval and no operational enable. Withdrawals and other tightenings are still accepted.

It is deliberately **coarser than the matrix** (it only forbids), written **independently** of the TypeScript matrix, and covered by a parity test (T-DB-09): for every instrument state, whenever the TS matrix returns anything other than `ELIGIBLE` for B1–B12-relevant cells the backstop must also deny, and it must never allow a cell the matrix denies for B1/B3/B5/B8/B10/B11/B12. **[v1.3]** `lineage_review_required` (B8) and `record_fingerprint_matches` (B12) are parity-tested over generated ledgers that include merges (T-DB-17, T-LIN-24, T-FPR-08). B9 duplicates the TS allow-list invariant (01 §5.8) in SQL and is parity-tested against it.

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

## 7.1 Integrity sweep rules (defence in depth; safety never depends on them) [v1.3: F26, F27, F28]

The sweep (`POST /internal/ast1/integrity/sweep`, 04 §7) only **places holds and emits events**; it never edits a ledger row. It computes each condition **independently of** `authoritative_state()` (its own queries, written separately and parity-tested), so it also detects a defect in the derivation the backstop shares. Every rule below denies *already* through the derived predicates or the SQL backstop; the sweep exists to notice a control that did not do its job.

| # | Condition | Class | Action |
|---|---|---|---|
| S1 | Newest record's fingerprint ≠ instrument's cached fingerprint, **and** a verified `class_correction_marker` explains it (§5.3) | **Expected governed state** (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`) | **No hold.** Count and list in `ast1.integrity.sweep_completed`; informational `ast1.integrity.class_correction_reclassification_pending` (M). The instrument is `NOT_ASSESSED` until a new governed classification |
| S2 | Same mismatch, **no** verified marker | **Unexplained drift** (integrity failure) | `SYSTEM` hold `IDENTITY_DRIFT`; critical `ast1.instrument.identity_drift_detected` (unchanged v1.2 behaviour) |
| S3 | A marker whose governing change is not an `applied` `ASSET_CLASS_CORRECTION` for the marker's asset and (from, to), or whose fingerprints do not chain to the instrument's current record | Marker does not verify ⇒ treated as **no marker** | as S2, plus `ast1.integrity.registry_tamper_suspected` |
| S4 | Cached fingerprint ≠ fingerprint recomputed from the live identity columns (TypeScript recompute) | Unexplained | as S2 (v1.2 T-INT-01) |
| S5 | **Lineage review (F27).** A current real `NON_SECURITY` instrument for which the sweep's own computation of `lineage_review_required` (§7, clauses (a) and (b)) is true, and: **(i)** SQL `authoritative_state().lineage_review_required` is false (divergence), **or (ii)** it has an outstanding token (revocation missed), **or (iii)** the triggering merge or `SECURITY` record has no `applied` governed change, or its propagation audit event (`…security_determination_propagated`) is absent | **Gap** — a control failed | revoke any outstanding token; `SYSTEM` hold `LINEAGE_REVIEW_GAP`; critical `ast1.integrity.lineage_gap_found`. Applies to the **`OWN_LINEAGE` and `UNDERLYING_LINEAGE`** bases and to the **merge-introduced** case |
| S6 | Same instrument, (i)–(iii) all false: the requirement is **explained** (a governed record or merge is in the ledger, the SQL predicate agrees, no token is live) | **Expected governed state**, awaiting the elevated review | **No hold.** Informational `ast1.integrity.lineage_review_pending` (M) with the trigger (`SECURITY_RECORD` / `LINEAGE_MERGE`) and event sequence |
| S7 | A current real `NON_SECURITY` record whose merge tree or underlying tree holds `SECURITY` history that is **not** reflected in `elevated_basis` although the record's `global_seq` is later than that history (a non-elevated record appended after the fact) | Gap (the record trigger failed) | `SYSTEM` hold `LINEAGE_REVIEW_GAP`; critical `lineage_gap_found` |
| S8 | `lineage_merge.merge_global_seq` not strictly greater than every `global_seq` / `merge_global_seq` committed before it on its trees, per-instrument `record_seq` order ≠ `global_seq` order, duplicate sequence values across records/merges/evidence/markers | Ledger-order break | critical `ast1.integrity.registry_tamper_suspected`; `SYSTEM` hold on every instrument of the affected trees |
| S9 | Canonical address (§2.1): any stored `TOKEN_CONTRACT` identity that is not a fixed point of the current rule, any collision group, a missing identity index | Identity | `SYSTEM` hold `IDENTITY_NOT_CANONICAL` / `IDENTITY_COLLISION` on each row; critical `ast1.integrity.address_canonical_violation` |
| S10 | Trigger and grant inventory: `trg_lineage_immutable`, `trg_deployment_environment_immutable`, the token, key-immutability and identity triggers exist and are enabled; no `UPDATE` privilege on `lineage`; `lineage.synthetic` agrees with every instrument's `declared_synthetic` and with both sides of every merge | Integrity | critical `ast1.integrity.registry_tamper_suspected`; `SYSTEM` hold on every instrument whose lineage row disagrees |

The explained/unexplained split is deliberate: a **governed** state (a correction awaiting reclassification; a lineage awaiting elevated review) must not be mislabelled as an integrity attack and must not force a second, unrelated maker-checker (hold release) on top of the review that actually clears it, while a control that **failed** (unexplained drift, a live token on a review-required instrument, a divergence between two implementations) is exactly what a `SYSTEM` hold is for.

## 7A. Locking protocol, the global lock order, and the consumption, merge and correction transactions [v1.2: F18; v1.3: F26, F27]

**Principle.** The instrument row lock *is* the classification/hold/admission/operational lock for that instrument. Every writer of an eligibility input takes it `FOR UPDATE`; every reader that must be stable (mint, consume) takes it `FOR SHARE`. Reads are `READ COMMITTED`; correctness rests on the locks, not on `SERIALIZABLE`. **[v1.3]** Two lineage-wide writers (a real `SECURITY` record, a lineage merge) and one asset-wide writer (`ASSET_CLASS_CORRECTION`) change the eligibility of instruments other than the one they are addressed to. They therefore take locks **above** the instrument level, and every path in the module is placed in one total order below.

### Global lock order (v1.3) — a transaction may only acquire locks in this order, never backwards

| Level | Lock | Mode / who | Why it exists |
|---:|---|---|---|
| **G** | `governed_change` row of the change being applied | `FOR UPDATE`; **apply transactions only**, first | Serialises a double apply; the change row is then updated to `applied` (already held). External calls (IAM-02 `execute-verify`) complete **before** level 0 is taken, so no gate, asset or instrument lock is ever held across a remote call; the `payload_hash` and every precondition are re-verified under the locks |
| **0** | `ast1.lineage_gate` (singleton row) | **`FOR SHARE`** by every classification-record writer and every classification-evidence writer; **`FOR UPDATE`** by the two lineage-wide writers (real `SECURITY` record apply, lineage merge apply) | Makes "which instruments can gain or lose `SECURITY` history" **stable** while a lineage-wide writer holds it: no instrument can receive a first record, no evidence can be added, and no other lineage-wide event can draw a sequence value, during the window. Hence sequence order = commit order for all classification events (INV-21). *Optimisation left to implementation:* per-tree locks may replace the global gate only if a proof of the same property is recorded; the blueprint fixes the global gate as the normative default because classification writes are rare, governed events |
| **1** | `ast1.asset` row | **`FOR UPDATE`** by every asset-class writer (`ASSET_CLASS_CORRECTION`; a class edit while no instrument exists); **`FOR SHARE`** by the first/any instrument insert (`trg_instrument_asset_lock`) | Removes the class/form race with the first instrument insert (§4.1). Instrument inserts do not exclude each other |
| **2** | `ast1.instrument` rows | **ascending `instrument_id`**; `FOR UPDATE` for writers, `FOR SHARE` for mint and consume | The classification/hold/admission/operational lock, as in v1.2 |
| **3** | `ast1.eligibility_decision_token` rows | `FOR UPDATE` on consume; `UPDATE` on revoke | As in v1.2: instrument before token |
| **4** | append-only inserts (`classification_record`, `classification_evidence`, `lineage_merge`, `class_correction_marker`, `eligibility_decision_log`, holds, audit outbox) | no row lock others wait on | — |

Within a level a transaction takes several locks in ascending key order (`instrument_id`, `token_hash`); a level is never re-entered after a higher level has been taken, except the idempotent re-lock of a row the transaction already holds (a trigger's `lock_instrument()` after the application locked it). Lock helpers (`lock_lineage_gate_shared/exclusive`, `lock_asset`, `lock_instrument`, `lock_affected_instruments`, `lock_merge_affected_instruments`, `lock_asset_instruments`) are the only code that takes these locks; each records the highest level taken in a transaction-local setting (e.g. `set_config('ast1.lock_level', …, true)`) and raises if called for a lower level afterwards (`AS006`), so an out-of-order caller fails closed instead of deadlocking. **Privilege note:** PostgreSQL requires `UPDATE` privilege to lock a row `FOR SHARE/UPDATE`; `ast1_app` therefore holds `UPDATE` on `instrument`, `asset`, `governed_change` and a column-level `UPDATE` on `lineage_gate.lock_token` only, while the immutability triggers reject any actual data change (a lock statement fires no `UPDATE` trigger).

**Why instrument before token (unchanged from v1.2).** The recommended review sequence starts with the token row. That order **inverts** against every mutator that must revoke tokens: a mutator holding an instrument lock then needs the token rows, while a consumer holding a token row then needs the instrument lock — a deadlock. The coherent order takes the instrument first everywhere. The token's `instrument_id` is immutable after mint (trigger), so reading it *unlocked* to find which instrument to lock cannot be stale. **Why gate and asset above the instrument (v1.3).** A lineage-wide or asset-wide writer must know its full set of instruments before it locks them; locking that set requires the set to be stable, which requires a lock **above** it. No path acquires level 0 or 1 while holding level 2 or 3, so adding them creates no inversion with the accepted v1.2 order (instrument(s) first, then token(s)), which is preserved without change.

### Who takes what (every writer; none unspecified)

| Path | Lock sequence | Notes |
|---|---|---|
| Classification record append, non-`SECURITY` (or synthetic) | G → 0 `SHARE` → 2 `X` (its instrument) → 3 (revoke tokens if it narrows) → 4 | trigger 2 enforces 0 and 2 |
| Classification evidence insert | 0 `SHARE` (real) → 2 `X` (the case's instrument) → 4 | draws `evidence_global_seq` (§5) |
| **Real `SECURITY` record apply** | G → 0 **`X`** → 2 `X` (the instrument, then every affected instrument, ascending) → 3 → 4 | `lock_affected_instruments` (§5.1 trigger 2) |
| **Lineage merge apply** | G → 0 **`X`** → 2 `X` (every instrument of both trees and every wrapper reaching them, ascending) → 3 → 4 | §"Lineage merge apply" below; `merge_global_seq` drawn after the locks |
| **`ASSET_CLASS_CORRECTION` apply** | G → 1 **`X`** (asset) → 2 `X` (**every** instrument of the asset, ascending) → 3 (revoke) → 4 | §"Asset class correction apply" below. Takes no gate: it writes no record and no lineage event |
| **First / any instrument insert** | 1 `SHARE` (its asset) → (new row) → 4 | `trg_instrument_asset_lock`; excluded by an asset-class writer |
| Asset insert (declared predecessor) | none above the new row | the asset has no instruments yet; membership of a lineage is read dynamically through `lineage_root()`, so a concurrent merge cannot strand it |
| Hold place/release, `SYSTEM` hold (sweep or after a backstop trip) | (G) → 2 `X` → 3 (revoke) → 4 | |
| `product_admission`, `custody_support`, `instrument_operational_state`, restrictions, jurisdiction rules, attestation insert, identity lock, retire, risk profile | (G) → 2 `X` → (3 revoke on narrowing) → 4 | table triggers call `lock_instrument()` too |
| Evidence-standard retirement | (G) → 2 `X` per affected instrument, ascending → 3 → 4 | |
| Token revoke (standalone) | 2 `X` → 3 | |
| **Mint** (`evaluate` allow) | 2 `SHARE` → 4 | no gate, asset or token lock |
| **Consume** (`verify-decision`) | 2 `SHARE` → 3 `X` | unchanged |

### Cycle analysis (v1.3)

The waits-for graph is acyclic on the protocol path because **every arrow above goes from a lower level to a higher level or stays within a level in ascending key order**: no path takes G, 0, 1, 2, 3 out of that order. Checked pairwise for the listed participants — classification writer, hold, admission, custody, operational state, lineage merge, `ASSET_CLASS_CORRECTION`, token consume, token revoke, first instrument insert:

| Pair that could conflict | Shared resources | Outcome |
|---|---|---|
| lineage merge ↔ classification writer | gate (`X` vs `SHARE`), then instrument | serialised at level 0; whichever starts second waits, no cycle (both then descend) |
| lineage merge ↔ lineage merge / real `SECURITY` apply | gate `X` | strictly serial |
| lineage merge ↔ mint / consume / hold / admission / custody / operational | instrument rows (merge ascending `X`; others one row) | at most one instrument lock is held by the others, and they take nothing at levels below 2 while holding it, so no cycle; the merge may wait for a mint/consume to finish, and a later mint sees the merge |
| `ASSET_CLASS_CORRECTION` ↔ first instrument insert | asset row (`X` vs `SHARE`) | serialised at level 1 |
| `ASSET_CLASS_CORRECTION` ↔ classification writer | instrument rows (the correction takes them all, ascending; the writer takes one) | serialised at level 2; the correction never holds a gate, so it cannot wait on the writer's gate |
| `ASSET_CLASS_CORRECTION` ↔ lineage merge | instrument rows | both ascend; no cycle |
| `ASSET_CLASS_CORRECTION` ↔ mint / consume / hold / admission | instrument rows | as above |
| token consume ↔ token revoke (any writer) | instrument (`SHARE` vs `X`) then token | the consumer takes the instrument first; the revoker holds it `X` first, so the consumer waits and then sees the revocation |
| two writers on overlapping instrument sets | instrument rows | ascending order in both; PostgreSQL never sees `A→B` against `B→A` |
| first instrument insert ↔ classification writer | none shared until the instrument exists | independent |

The one out-of-order path is the **raw-SQL consume** (below): unsupported, fail-closed on deadlock. `lock_timeout` bounds every wait (≤ 5 s).

**Lock-set re-derivation (review §7 note, folded in).** A lineage-wide or asset-wide writer enumerates its affected set **after** taking levels G/0/1 (where the set of *classified* instruments cannot change: classification and evidence writers wait on the gate; instrument inserts wait on the asset row), locks it ascending, **re-derives it once every lock is held, and raises `AS006` / `AST1_LOCK_SET_CHANGED` (the transaction rolls back and the apply is retried) if the set grew.** An instrument that exists without a record at that moment has no token and nothing to narrow, and cannot obtain a record until the gate is released, at which point its first record sees the committed ledger.

### Lineage merge apply — one transaction [v1.3: F27]

1. **G:** lock the `governed_change` row; IAM-02 `execute-verify` bound to the recomputed `payload_hash`; require IAM-02-attested approvers satisfying `COMPLIANCE_OFFICER` with `maker ∉ approvers` (as every apply, 04 §3). No level 0–3 lock is held during this call.
2. **Identify** the lineage roots of the two arguments (resolved server-side; both must be current roots, real/synthetic equal).
3. **Level 0:** `lock_lineage_gate_exclusive()`.
4. **Level 2:** enumerate the **affected instruments** — every instrument whose asset lineage lies in either merge tree, plus every instrument whose transitive underlying chain reaches an instrument of either tree (wrappers, transitively, depth ≤ 8) — and lock them `FOR UPDATE` in ascending `instrument_id`; re-derive; `AS006` if the set grew.
5. **Authorised.** Only now, with the change verified, the gate held and every affected instrument locked, is the merge applied: mark the change `applied`, then `INSERT lineage_merge`. `trg_lineage_merge_apply` (§3) assigns **`merge_global_seq`** from `ast1.classification_global_seq`; the caller cannot supply it.
6. **Identify the narrowed instruments.** Evaluate `lineage_review_required` (§7) — the same function B8 and the TypeScript conjunct use — for every affected **real** instrument. The narrowed set is every instrument for which it is now true, which is exactly the set whose current record predates the security history the merge introduced (older `SECURITY` joined to newer `NON_SECURITY`, the reverse, and wrappers through their underlying trees). Instruments for which it was already true stay true.
7. **Level 3 — revoke** every outstanding (unconsumed, unrevoked) token of every narrowed instrument (`revoked_reason = lineage_security_determination`).
8. **Audit, same transaction (outbox):** `ast1.lineage.merged` (critical; metadata: both roots, `merge_id`, `merge_global_seq`, `change_id`), `ast1.lineage.security_determination_propagated` (critical; `trigger = MERGE`, narrowed count and ids, wrapper ids) and `ast1.eligibility.instrument_revoked` per instrument.
9. **COMMIT.** From the commit onward every narrowed instrument derives `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` and SQL rule B8 denies. **The merge itself narrows; nothing later — no sweep, no second transaction — is required for safety.** Any token that somehow survives is rejected at consumption (B8 inside `assert_token_consumable`), which is tested by forcing the consume in SQL (T-LIN-19).

A failure at any step rolls back the whole transaction (no merge row, no revocation, no event); the change stays `requested` and the apply is retriable with a fresh IAM-02 approval, as for every apply.

### Asset class correction apply — one transaction [v1.3: F26]

1. **G:** lock the `governed_change` row; IAM-02 `execute-verify`; require the approvals of §4.1 (≥ 2 attested approvers, `COMPLIANCE_OFFICER` + `MLRO`, when leaving `SECURITY`/`SECURITY_TOKEN`; maker ≠ checker). No level 0–3 lock is held during this call.
2. **Level 1:** `SELECT … FROM ast1.asset WHERE asset_id = $a FOR UPDATE`. Instrument inserts on this asset now wait; any in flight has finished.
3. **Level 2:** enumerate **every instrument of the asset** (all lifecycle statuses) and lock them `FOR UPDATE` in ascending `instrument_id` (`lock_asset_instruments`); re-derive; `AS006` if the set grew (it cannot, unless level 1 was bypassed).
4. Re-verify preconditions under the locks: `(from, to)` equals the asset's current class and the change payload; the correction does not cross the FIAT boundary once an instrument exists; the approval strength required by the direction.
5. Mark the change `applied`; `UPDATE asset SET asset_class` (`trg_asset_class_frozen` branch b); recompute and `UPDATE` each instrument's cached `identity_fingerprint`; `INSERT` one `class_correction_marker` (§5.3) per instrument that has a record (`marker_global_seq` drawn now, after the locks).
6. **Level 3 — revoke every outstanding token of every instrument of the asset** (`revoked_reason = asset_class_corrected`). Product admissions, custody rows and attestations are not edited: they are bound to the old record and are now unusable because B12 denies any action that relies on it.
7. **Audit, same transaction:** `ast1.asset.class_corrected` (critical; metadata: asset, from, to, change id, instruments, marker ids), `ast1.eligibility.instrument_revoked` per instrument. **No `SYSTEM` hold is placed**: the change is governed and expected; the instruments are `NOT_ASSESSED` (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`), which is not an integrity finding.
8. **COMMIT.** From the commit onward SQL rule B12 denies every allow-insert, consumption, admission approval and attestation that relies on the pre-correction record, whatever the application does. Correction **into** `SECURITY`/`SECURITY_TOKEN`: the stale `NON_SECURITY` record is unusable by SQL, and SQL accepts a new classification only as `SECURITY` or `UNRESOLVED` (trigger 6). Correction **out of** it: the previous `SECURITY` record remains in the lineage ledger, so `elevated_basis ∋ OWN_LINEAGE` and any new `NON_SECURITY` classification requires the elevated path (two attested checkers, review-floor evidence, binding); B1 keeps denying MB/PSO subjects on the stored `SECURITY` outcome in the meantime.

Eligibility returns **only** through a new governed classification record whose `identity_fingerprint` equals the instrument's corrected fingerprint (`record_fingerprint_matches` becomes true). Nothing else — no hold release, admission, marker deletion (impossible), flag or role — restores it.

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

**Raw-SQL path.** A raw `UPDATE … SET consumed_at_utc` outside the protocol takes the token row lock first, then the trigger takes the instrument lock — the inverted order (level 3 before level 2). That path is unsupported; if it deadlocks against a writer, PostgreSQL aborts one side and the consume fails (fail-closed). The trigger's checks still apply to it.

**Failure behaviour at consumption** (the failed transaction always stays rolled back; the token is not consumed):

| Condition | Where detected | Caller sees | Follow-up (separate transactions) |
|---|---|---|---|
| Token expired / consumed / revoked | steps 3, DB clock | `AST1_DECISION_EXPIRED` / `_CONSUMED` / `_REVOKED` | audit (replay of a consumed token: H) |
| Binding mismatch (service, subject, instrument, environment, payload) | step 4 | `AST1_DECISION_BINDING_MISMATCH` | audit H (C for a cross-domain subject); token **not** burned, so another service cannot deny a legitimate consumer |
| Record superseded or a conjunct now denies; TypeScript and SQL agree | steps 5–6 | `AST1_DECISION_STALE` | revoke the token (`instrument_reclassified` / `hold_placed` / `lineage_security_determination` / …); audit H |
| TypeScript says `ELIGIBLE` but SQL denies (divergence), or the SQL trigger raises `AS003` after the app saw no problem | step 7 | `AST1_DECISION_STALE` (fail-closed) | revoke; **`SYSTEM` hold `BACKSTOP_TRIPPED`** and `ast1.eligibility.consume_backstop_triggered` (C) |
| SQL hard rule B1 (`SECURITY` → MB/PSO) at consumption | steps 6–7 | `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` (422) | revoke; `SYSTEM` hold; critical event — a token existed for a security outcome, which the mint backstop should have prevented, so data or code is wrong |
| SQL rule B12 at consumption (the token's instrument had its class corrected, or its cached fingerprint no longer matches the token's record) **[v1.3: F26]** | steps 6–7 | `AST1_DECISION_STALE` | the correction transaction already revoked the token (`asset_class_corrected`); if it is somehow still live: revoke; **no `SYSTEM` hold when `drift_explained_by_correction`**, a `SYSTEM` hold (`BACKSTOP_TRIPPED`) when the drift is unexplained; audit |
| Lineage review required (B8 clause (a) or (b)) at consumption **[v1.3: F27]** | steps 5–7 | `AST1_DECISION_STALE` | revoke (`lineage_security_determination`); the merge/record transaction already revoked it, so a live token means propagation failed: `SYSTEM` hold and `ast1.integrity.lineage_gap_found` |
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
  consumed_at_utc timestamptz, revoked_at_utc timestamptz, revoked_reason varchar(32)          -- ≤ 32 chars: 'lineage_security_determination' = 30, 'asset_class_corrected' = 21
);
-- BEFORE INSERT: §7 backstop; every binding column must equal the referenced log row (instrument, subject, domain, consumer_service, environment, record, matrix_version, payload_hash).
-- BEFORE UPDATE [v1.2: F18]: only consumed_at_utc / revoked_at_utc / revoked_reason may change, one-way; consumption re-runs assert_token_consumable() (§7). Column-level UPDATE grant only (§10).
-- revoked_reason ∈ {instrument_reclassified, hold_placed, environment_mismatch, admission_suspended, attestation_stale, lineage_security_determination, asset_class_corrected [v1.3: F26], backstop_reject, manual}
-- lineage_security_determination is used for BOTH a newer real SECURITY record and a lineage merge that joined security history (the audit event's metadata carries trigger = RECORD | MERGE).
```
Log is append-only; retention ≥ six years (DEC-012 cl. 1 rule 7; LFSA-DMB-2025 ¶5.12 target, effective 1 January 2027 — not currently in force). No raw token stored.

## 9. Indexes (illustrative)

`instrument (asset_id)`, `asset (lineage_id)`, `classification_record (instrument_id, record_seq DESC)`, `classification_record (lineage_id, outcome, global_seq)`, `instrument_underlying (underlying_instrument_id)` (reverse traversal for the affected set), `eligibility_decision_token (instrument_id) WHERE consumed_at_utc IS NULL AND revoked_at_utc IS NULL`, `classification_case (instrument_id, state)`, `product_admission (instrument_id, product)`, `instrument_hold (instrument_id) WHERE status='ACTIVE'`, `eligibility_decision_log (instrument_id, decided_at_utc)`, `governed_change (target_type, target_id)`, **[v1.3]** `lineage_merge (merged_lineage_id)`, `lineage_merge (surviving_lineage_id)`, `lineage_merge (merge_global_seq)`, `classification_record (outcome, global_seq) WHERE outcome = 'SECURITY_OR_SECURITY_TOKEN'` (the security-event scan of §7), `classification_evidence (case_id, evidence_global_seq)`, `class_correction_marker (instrument_id, marker_global_seq DESC)`, `instrument (asset_id)` (asset-wide enumeration).

## 10. Privileges

| Object | `ast1_app` |
|---|---|
| `network_registry`, `deployment_environment` | `SELECT` only (no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`; `deployment_environment` is additionally trigger-immutable for every role, §2) |
| `classification_record`, `classification_evidence`, `eligibility_decision_log`, `lineage_merge`, `securities_market_admission_attestation`, **`class_correction_marker`** [v1.3: F26] | `INSERT, SELECT` only |
| **`lineage`** [v1.3: F28.c] | `INSERT, SELECT` only — **no `UPDATE`**, no `DELETE`, no `TRUNCATE`; additionally trigger-immutable for every role (§3) |
| **`lineage_gate`** [v1.3: F27] | `SELECT` and column-level `UPDATE (lock_token)` — needed only to take the row lock; any actual change is rejected by trigger |
| `network_registry` address rules [v1.3: F28.a] | `ast1.canonicalise_address` / `address_rule_supported` are owned by the migration role; the runtime role has `EXECUTE` only |
| `eligibility_decision_token` **[v1.2: F18]** | `SELECT, INSERT`; column-level `UPDATE (consumed_at_utc, revoked_at_utc, revoked_reason)` only — no `UPDATE` on any binding column, no `DELETE` |
| `evidence_standard` | `SELECT`; status change via governed apply path |
| other tables | `SELECT, INSERT, UPDATE` — no `DELETE` anywhere; key-column `UPDATE`s are rejected by trigger regardless of grant (§6). `asset`/`instrument` lineage- and identity-critical columns likewise (§4) |
| any `iam2.*`, `cfg1.*`, `wlt1.*`, `clt1.*`, `kyc1.*`, `fnd.*` (beyond foundation outbox/idempotency objects granted to every service) | none (F3(c)) |

## 11. Data classification

Regulatory-critical, append-only: `classification_record`, `classification_evidence`, `eligibility_decision_log`, `governed_change`, `lineage_merge`, `class_correction_marker`, `lineage` (insert-only). Compliance configuration: admissions, holds, restrictions, jurisdiction rules, custody, standards, risk profile. Reference: `asset`, `instrument`, `issuer_reference`, `network_registry`, `lineage`. No client PII: `client_jurisdiction`/`client_class` in the log are attribute values with no client id.

## 12. Migration intent (not created here)

Sequenced by risk: (a) reference + `deployment_environment` (+ its immutability trigger) + `canonicalise_address` and the address rules + lineage (+ `lineage` immutability, `lineage_gate`, `lineage_merge` with `merge_global_seq`) + core (both canonical-identity unique indexes, the canonical-address CHECK) + ledger (`global_seq`, the shared sequence, evidence sequence) + triggers + `authoritative_state` (incl. `record_fingerprint_matches`, `lineage_review_required` with the merge clause)/`backstop_permits` (B1–B12)/`assert_token_consumable` + lock helpers with level tracking + `class_correction_marker`; (b) conjunct tables (+ key-immutability triggers); (c) governed change + decision log/token (+ token immutability/consumption triggers). **No seed of any classification, any `APPROVED` evidence standard, or any instrument** except test fixtures created by the test harness.
