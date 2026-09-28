# AST-01 — 05 Database Design (v1.6)

**Status: REMEDIATED / AWAITING RE-REVIEW. Design only — no migration is created or numbered by this task.** Migration head is 071 at baseline `43f2f34`; numbering happens in the implementation task after re-checking the head. Conventions follow CFG-01: dedicated schema, `uuid` PKs, `varchar` + `CHECK` enums, opaque-string cross-module references (no FKs, no grants into other schemas — F3(c)), hash-only token storage, append-only tables by trigger + grant.

Schema **`ast1`**; runtime role `ast1_app` (illustrative). Changes from v1.0 are tagged **[v1.1: Fnn]**; changes from v1.1 (round-2 review [`04-review-r2.md`](../../../../03_implementation/tasks/AST-01/04-review-r2.md)) are tagged **[v1.2: Fnn]**; changes from v1.2 (round-3 review [`04-review-r3.md`](../../../../03_implementation/tasks/AST-01/04-review-r3.md): F26, F27, F28) are tagged **[v1.3: Fnn]**; changes from v1.3 (round-4 review [`04-review-r4.md`](../../../../03_implementation/tasks/AST-01/04-review-r4.md): F29, F30, F31, F32) are tagged **[v1.4: Fnn]**; changes from v1.4 (round-5 review [`04-review-r5.md`](../../../../03_implementation/tasks/AST-01/04-review-r5.md): F32(a) mechanism, F33, F34, F35) are tagged **[v1.5: Fnn]**; changes from v1.5 (round-6 review [`04-review-r6.md`](../../../../03_implementation/tasks/AST-01/04-review-r6.md): F36, F37, F38, F39) are tagged **[v1.6: Fnn]**. Earlier tags are kept as provenance.

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
17. **[v1.4: F29] The class binding is visible to SQL independently of any cached value.** Every classification record stores the asset class it was written against (`asset_class_at_record`, trigger-filled from the live `asset` row under the instrument's own lock, immutable). Backstop rule **B12** denies whenever that stored class no longer equals the asset's **current, live** `asset_class` — a comparison that does not depend on the correction writer having recomputed the cached fingerprint correctly, because `asset.asset_class` is not a cache: it is the row `ASSET_CLASS_CORRECTION` is defined to change.
18. **[v1.4: F30] Ordering safety is enforced, not assumed, and its scope is exact.** Every lock helper and `authoritative_state()` itself assert the session runs `READ COMMITTED` and fail closed (`AS007`) otherwise, because the sequence-order guarantee depends on a lock holder seeing every commit that happened while it waited. Sequence order is proven to equal commit order **only** for a pair of events that (i) lock a common instrument, or (ii) are both serialised by the exclusive lineage gate — never for an unrelated pair, and a caller-skipped lock order is itself fail-closed (rule 19).
19. **[v1.4: F31] Lock acquisition within level 2 is strictly ascending, enforced, and never self-first.** A lineage-wide writer derives its full affected set — including its own triggering instrument — **before** locking any of it, then locks the whole set ascending in one pass; the lock-level tracker additionally rejects a lower `instrument_id` acquired after a higher one in the same transaction (`AS006`), so an out-of-order caller fails closed instead of risking a deadlock.
20. **[v1.4: F32; mechanism v1.5: F32.a; corrected v1.6: F36] A referenced canonicalisation version is immutable, and "newest" is always a DB-assigned sequence.** Once any instrument references an `(address_format, canonicalisation_version)` pair, that pair's rule never changes and is never dropped; new behaviour is a new version, implemented as its **own, separate, immutable function** (never a shared multi-version function with a migration-supplied digest, §2.2). **What is mechanically enforced, exactly:** (1) the registered version-specific function's definition is unchanged — the freeze assertion **recomputes** the digest from PostgreSQL catalog state itself and compares it with the insert-only registry value, which no migration and no caller can supply or override; (2) the frozen vector corpus for every referenced pair still reproduces exactly; (3) every stored identity remains a fixed point under its own stored version; (4) no collision appears. This is **not** a claim of complete semantic freeze over every possible input a version's vectors do not exercise — §2.2 states this precisely. Every "newest/latest" comparison in this pack — records, merges, evidence, correction markers, and securities-market attestations (`attestation_seq`) — is a DB-assigned sequence value, never an application-suppliable timestamp. `class_correction_marker.marker_global_seq` is drawn from the **same shared** sequence as records/merges/evidence (`ast1.classification_global_seq`, §5.3), not a sequence of its own; `attestation_seq` alone is a dedicated sequence, because the attestation domain is unrelated to classification/lineage ordering (01 INV-21).
21. **[v1.5: F33] `ASSET_CLASS_CORRECTION`'s instrument-locking precondition is enforced by the trigger that changes the class, not only by application discipline.** `trg_asset_class_frozen` branch (b) itself calls the same lock helper the application calls (`ast1.lock_asset_instruments`) — enumerating and locking **every** instrument of the asset, including record-less ones, ascending — **before** it permits `asset_class` to change. A raw or defective correction writer that skips the application's own locking therefore still cannot change the class ahead of every instrument being locked; the property F29/INV-24 rests on no longer depends on writer discipline.
22. **[v1.5: F34; restored v1.6: F38] The lock-order tracker is a defined, transaction-local data structure with idempotent re-lock and no in-transaction upgrade, and it is authoritative only because every governed lock on levels 0–3 goes through it.** It holds the **set** of keys held per level with their mode, not only "the last id"; a request for a key already held at the same or a stronger mode is a no-op (no wait, no state change); a request for a stronger mode on an already-held key fails closed (`AS006`) rather than being attempted; the state is `set_config(..., true)` (transaction-local), so it — together with the row locks taken in the same subtransaction — reverts automatically and identically at `ROLLBACK TO SAVEPOINT`, `ROLLBACK` and `COMMIT`, with no reliance on `BEGIN` or on any pooler behaviour (§7A). **[v1.6: F38] Restored normative rule (present in v1.4, deleted without replacement in v1.5): every protocol and trigger acquisition of a governed lock at levels 0–3 goes through the named lock helpers — `lock_lineage_gate_shared()`, `lock_lineage_gate_exclusive()`, `lock_asset(...)`, `lock_instrument(...)`, `lock_instruments(...)` (a general ascending multi-row helper, of which `lock_affected_instruments`, `lock_merge_affected_instruments` and `lock_asset_instruments` are the named specialisations already used by the record trigger, the merge trigger and `trg_asset_class_frozen`), and `lock_token(...)`. No ordinary AST-01 runtime code or trigger issues its own `SELECT … FOR SHARE`/`SELECT … FOR UPDATE` against a governed object outside a helper's implementation. This is what makes the tracker's idempotency and upgrade rules decidable at all: a lock the tracker never saw is a lock the re-lock/upgrade logic cannot reason about (§7A).
23. **[v1.6: F37] An `INSTRUMENT` underlying link may target only an instrument whose own link set is already frozen.** The **source** rule is unchanged: the linking instrument must be `DRAFT`, and once it leaves `DRAFT` its underlying set is immutable (§4.3). The **new** rule: the **target** underlying instrument — the row named by `instrument_underlying.underlying_instrument_id` — must be `IDENTITY_LOCKED` or `RETIRED`, and must **not** be `DRAFT`, checked while the link-insert helper holds the target's own lock (§4.3, §7A). Recursively: a `DRAFT` instrument may add links; every instrument it points to is already non-`DRAFT`; every non-`DRAFT` target's own link set is therefore already frozen; so the full transitive underlying/basis tree of a classified instrument cannot later grow through a late link on some still-`DRAFT` intermediate (§7, §7A).

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
  CHECK (ast1.address_rule_supported(address_format, canonicalisation_version)),  -- [v1.3: F28.a] a network must name a rule the database can execute; a single boolean function call, no subquery
  FOREIGN KEY (address_format, canonicalisation_version) REFERENCES ast1.address_rule_version (address_format, canonicalisation_version)   -- [v1.6: F36] replaces v1.5's invalid CHECK…EXISTS(SELECT…); see §2.2
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
-- ONE IMMUTABLE, pure-SQL function PER registered (address_format, canonicalisation_version) pair [v1.6: F36] —
-- never a shared multi-version function with case arms for every version. Illustrative names:
ast1.canonicalise_evm_hex40_v1(p_raw text) RETURNS text            -- IMMUTABLE; NULL when p_raw is not a valid address for this exact version
ast1.canonicalise_base58_fixed_v1(p_raw text) RETURNS text         -- IMMUTABLE
ast1.canonicalise_tron_base58check_v1(p_raw text) RETURNS text     -- IMMUTABLE
-- … one such function per registered pair, each named after the exact rule it implements and never touched again once referenced (§2.2)

-- Registry-driven dispatcher: resolves the EXACT registered function for (p_address_format, p_version) from
-- ast1.address_rule_version and invokes it. STABLE, not IMMUTABLE (it reads a table) — still usable in a CHECK,
-- which only requires a deterministic result given the current database state, exactly the property the freeze
-- (§2.2) guarantees. The dispatcher itself contains NO format- or version-specific regex or case logic — it is
-- pure routing, so it cannot "silently route V1 to a new implementation": routing a version anywhere other than
-- its registered rule_function is unreachable by construction, and T-ADR-19 (10) inspects the dispatcher's own
-- definition to confirm this structurally.
ast1.canonicalise_address(p_address_format varchar, p_version varchar, p_raw text) RETURNS text   -- STABLE
ast1.address_rule_supported(p_address_format varchar, p_version varchar) RETURNS boolean          -- STABLE; existence check against the registry
```

- **Closed rule set, one function per version [v1.6: F36].** `address_format` is a closed vocabulary; each registered `(address_format, canonicalisation_version)` pair is implemented by its **own, separate, immutable function** — never a `CASE` arm inside one multi-version function, and never a function whose body a later migration edits while the version stays referenced. Adding a new version is a reviewed migration that **creates a new function** and registers it (§2.2); it never edits an existing referenced pair's function body. `canonicalise_address` is a thin dispatcher over the registry (above); it holds no rule semantics itself. Illustrative rules, fixed by the migration phase against the chain list WLT-01 supports (each row below is, concretely, one dedicated function plus one `address_rule_version` registration):

  | Format (illustrative) | Accepted raw input | Canonical output |
  |---|---|---|
  | `EVM_HEX40` | `^(0x\|0X)?[0-9A-Fa-f]{40}$` | `'0x' \|\| lower(hex40)` — an EIP-55 mixed-case checksum spelling and its lower-case form are **one** identity |
  | `BASE58_FIXED` (e.g. Solana-style) | `^[1-9A-HJ-NP-Za-km-z]{32,44}$` | identical (base58 is case-significant and has one spelling per byte string) |
  | `TRON_BASE58CHECK` | `^T[1-9A-HJ-NP-Za-km-z]{33}$` | identical; the hex `41…` spelling is **not** accepted as an alternative identity |
  | any other | — | **no rule ⇒ no `TOKEN_CONTRACT` instrument can be registered on that network** (fail closed) |

- **Where it is enforced (two layers).**
  1. **`CHECK` on `instrument`** (§4.2), surviving even a disabled trigger: `instrument_form <> 'TOKEN_CONTRACT' OR ast1.canonicalise_address(address_format, address_canonicalisation_version, contract_address_canonical) IS NOT DISTINCT FROM contract_address_canonical AND ... IS NOT NULL`. The stored value must equal its own canonical form.
  2. **`trg_instrument_address_canonical`** — `BEFORE INSERT OR UPDATE` on `instrument`. The two arms do **different** work and neither touches `network_registry` for a row that already has an identity: **`INSERT`** — for `TOKEN_CONTRACT` it (i) reads `network_registry` for `(chain, network)` — the network must be `ACTIVE` and carry a supported rule; (ii) **overwrites** `instrument.address_format` and `instrument.address_canonicalisation_version` from the registry (application values ignored, as `recorded_environment` is); (iii) computes `c := ast1.canonicalise_address(...)` over the supplied value and **raises `AS005` (`AST1_ADDRESS_NOT_CANONICAL`) when `c IS NULL` or `c <> supplied`**. The supplied value is never silently canonicalised or accepted "as close enough": the registration path must send the canonical value, and a raw spelling is an error. **`UPDATE`** [v1.4: F32.a] — compares `OLD` against `NEW` on `chain`, `network`, `contract_address_canonical`, `address_format`, `address_canonicalisation_version` and raises `AS002` if any differ (these columns are already immutable from insert, §4.2, and `trg_instrument_immutable_from_insert` enforces the same thing; this trigger is a second, independent check on the identity columns specifically). It **never re-reads `network_registry`** and never re-validates against the *current* rule or the network's *current* `ACTIVE`/`SUSPENDED` status — an `UPDATE` that leaves these columns untouched (retire, an identity lock, the correction's fingerprint recompute, any other tightening) succeeds regardless of what has since happened to the network row or the canonicalisation rule the instrument was registered under. The stored identity was validated once, at `INSERT`, under the version it names, and stays valid under that version forever (rule 20; below).
- **Uniqueness operates on validated values only.** `ux_ast1_instrument_token_identity` (§4.2) is created over `(chain, network, contract_address_canonical)`; because every row that reaches the index has passed the check above, two spellings of one contract cannot coexist as two rows, and a defect in the application's canonicaliser surfaces as an `AS005` rejection rather than a duplicate identity.
- **One canonicaliser.** The resolver canonicalises a requested reference with the **same SQL function** (`SELECT ast1.canonicalise_address(nr.address_format, nr.canonicalisation_version, $raw) FROM network_registry nr …`); a reference that yields `NULL` matches nothing (`INSTRUMENT_NOT_FOUND`). The TypeScript `canonicaliseContractAddress` is a **mirror** used for early client-side validation and is parity-tested against the SQL function over one shared vector corpus (T-ADR-03).
- **Versioning is append-only [v1.4: F32.a; per-function model v1.6: F36].** Each instrument stores the `address_canonicalisation_version` it was registered under (immutable). Once **any** instrument references an `(address_format, canonicalisation_version)` pair, that pair's **dedicated version-specific function** is **frozen**: no migration may `CREATE OR REPLACE` it, and the freeze assertion (§2.2) catches an attempt that tries anyway by recomputing its digest from the catalog. The function keeps working for as long as any row names it, so `CHECK`, the resolver, TypeScript parity and the sweep all keep working against a version nothing has re-defined out from under them, including across a dump/restore. **New canonicalisation behaviour is always a new `canonicalisation_version` and a new function.** A network row may adopt the new version for **future** registrations (`network_registry.canonicalisation_version` is itself an ordinary mutable column of that reference table); existing instruments keep the version — and therefore the exact rule — they were registered under. **Migrating existing identities to a new canonical form is a separate governed data task, never automatic**: it must first compute every affected instrument's prospective value under the new rule, fail closed on any collision it would create (never silently split or merge two identities), and only then, as its own reviewed migration, move the named instruments to the new version. The pre-activation sweep check (below) is this task's collision detector, not a routine part of ordinary operation.
- **What the database cannot check.** It has no checksum primitive, so it cannot tell a well-formed but mistyped address from the intended one (a typo that happens to be well-formed registers a wrong identity, which is harmless — OQ-8). Checksum validation, where a chain has one, stays in the TypeScript mirror and in `POST /instruments/validate`; it is advisory and never a precondition the database relies on.
- **Sweep (defence in depth) [v1.4: F32.a — re-canonicalises under each row's own stored version].** The integrity sweep re-canonicalises **every** stored `TOKEN_CONTRACT` identity under **the `canonicalisation_version` that instrument itself stores** — never the network's current version, which may since have moved on — and (a) flags any value that is not a fixed point of its own version's rule (a version is frozen once referenced, rule 20, so this is purely a tamper/corruption check, never a "the rule changed under us" false positive); (b) groups by `(chain, network, canonicalise-under-own-version(value))` **across every version registered on that network** and flags any group with more than one row (the unique index bypassed by a disabled trigger/index, or a cross-version collision a migration task's own check should have caught first); (c) checks the two identity indexes exist. A finding places a `SYSTEM` hold on each colliding or non-canonical instrument (`IDENTITY_COLLISION`, `IDENTITY_NOT_CANONICAL`) and emits `ast1.integrity.address_canonical_violation` (critical, worded against **the instrument's own stored version**, never "the current network rule" [v1.5: F32.a]). It never rewrites a row. A **planned** version migration's own pre-activation check (above) is a separate, one-off run over the prospective new values; this sweep rule is the standing, routine one.

### 2.2 Address rule version registry, golden vectors and the freeze assertion [v1.5: F32.a; corrected v1.6: F36]

**Problem history.** Rule 20 (§1) and §2.1's versioning paragraph state the freeze rule exactly, but v1.4 had no mechanical enforcement at all. v1.5 added a registry and an assertion, but the round-6 review (`04-review-r6.md` §5, §16 F36) found four concrete defects, each corrected below: (1) the "semantic digest" was **circular and undefined** — a no-argument assertion compared a migration-declared digest with a migration-declared digest, because the rule lived as one `CASE` arm inside a single multi-version function with no per-pair artefact to hash; (2) the required vector inventory **contradicted** the canonicaliser's own semantics (it demanded `expected_valid = false` for a mixed-case `EVM_HEX40` input the rule *accepts and lower-cases*); (3) the `network_registry` `CHECK … EXISTS (SELECT …)` is **not valid PostgreSQL** — `CHECK` constraints cannot contain subqueries; (4) the migration hook was described as "mechanically enforced, not a migration-author promise" while it was, in fact, exactly that: an author convention, with no automatic trigger in the project's actual `node-pg-migrate` harness.

**Corrected design.** §2.1 already moved to one immutable function per registered pair (`rule_function`). This section makes the freeze concrete around that: the registry stores the **exact function identity**, the digest is **computed by the database itself** at registration and re-verified by recomputing it from catalog state — never supplied or re-supplied by a migration author — and the vector model expresses "valid but not a fixed point" as a first-class case instead of contradicting itself.

```sql
-- Digest helper: derives a SHA-256 over a deterministic database representation of the referenced function.
-- STABLE (reads pg_catalog, never writes). Used ONLY by the registration trigger (below) and by the freeze
-- assertion; no caller and no migration author ever supplies a digest value directly.
ast1.function_definition_digest(p_function regprocedure) RETURNS char(64)
-- Conceptually: sha256( pg_get_functiondef(p_function::oid) || '|' || <identity/signature: schema, name, arg types,
-- return type> || '|' || <declared properties: provolatile, proisstrict, prosecdef> ). pg_get_functiondef() reflects
-- the function's actual current body, so a CREATE OR REPLACE that changes the body changes the digest deterministically.

ast1.address_rule_version (                    -- INSERT-ONLY; identifies ONE immutable version-specific canonicaliser function
  address_format varchar(32) NOT NULL, canonicalisation_version varchar(16) NOT NULL,
  rule_identifier varchar(64) NOT NULL,                     -- human-readable name of the rule as implemented
  rule_function regprocedure NOT NULL,                      -- [v1.6: F36] the EXACT registered function (e.g. ast1.canonicalise_evm_hex40_v1(text)) — not a shared multi-version function
  function_definition_sha256 char(64) NOT NULL,             -- [v1.6: F36] DATABASE-DERIVED at INSERT via ast1.function_definition_digest(rule_function); a caller-supplied value is always overwritten, never trusted
  created_at_utc timestamptz NOT NULL DEFAULT now(), created_by varchar(64) NOT NULL,
  PRIMARY KEY (address_format, canonicalisation_version),
  UNIQUE (rule_function)                                    -- one registry row per function: no two (format, version) pairs may share an implementation, which would defeat per-pair freeze granularity
);

ast1.address_rule_vector (                      -- INSERT-ONLY; frozen golden vectors for one version [v1.6: F36 — corrected vector model]
  address_format varchar(32) NOT NULL, canonicalisation_version varchar(16) NOT NULL, vector_id varchar(64) NOT NULL,
  raw_input text NOT NULL,
  expected_valid boolean NOT NULL,
  expected_canonical_value text,        -- NULL iff NOT expected_valid; = raw_input when the input is already canonical
  expected_fixed_point boolean,         -- NULL iff NOT expected_valid; TRUE iff raw_input = expected_canonical_value (a canonical input); FALSE for a valid-but-non-canonical input
  PRIMARY KEY (address_format, canonicalisation_version, vector_id),
  FOREIGN KEY (address_format, canonicalisation_version) REFERENCES ast1.address_rule_version,
  CHECK (expected_valid = (expected_canonical_value IS NOT NULL)),
  CHECK (expected_valid = (expected_fixed_point IS NOT NULL)),
  CHECK (expected_fixed_point IS NULL OR expected_fixed_point = (raw_input = expected_canonical_value))
);
```

- **Digest is database-derived, never migration-supplied [v1.6: F36].** `trg_address_rule_version_digest` — `BEFORE INSERT` on `address_rule_version` — computes `NEW.function_definition_sha256 := ast1.function_definition_digest(NEW.rule_function)` and **always overwrites** whatever the caller supplied (a distinct column is not even exposed for the caller to populate meaningfully; any value present in the insert statement is discarded). This is what removes the circularity the round-6 review found: the assertion below does not compare a declaration against a declaration, it compares a **stored, database-computed** value against a **freshly recomputed** one.
- **Immutability.** `trg_address_rule_version_immutable` / `trg_address_rule_vector_immutable` — `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement), for **every** role including the migration role and the table owner (the same model as `deployment_environment` and `lineage`, §2, §3) — raise `AS002`. The runtime role holds `SELECT` only; the migration role holds `INSERT, SELECT` only. A version number can therefore never be re-bound to a different function or a different digest, and neither can a single golden vector.
- **Vector coverage — corrected model [v1.6: F36].** A vector expresses three distinct, non-contradictory cases:
  - **INVALID input:** `expected_valid = false`, `expected_canonical_value = NULL`, `expected_fixed_point = NULL`.
  - **VALID, NON-CANONICAL input:** `expected_valid = true`, `expected_canonical_value = ` the canonical value, `expected_fixed_point = false`. This is the case v1.5's model could not express: a raw value the rule accepts and rewrites (for `EVM_HEX40`, any mixed-case or `0X`-prefixed spelling — the rule *does* accept it and lower-cases it, so demanding `expected_valid = false` for it was a contradiction of §2.1's own stated rule, not a vector requirement).
  - **VALID, CANONICAL input (fixed point):** `expected_valid = true`, `expected_canonical_value = raw_input`, `expected_fixed_point = true`.
  Required inventory is **format-specific**, not one universal template that could again contradict a format's own rules: each registered pair carries, at minimum, a canonical fixed-point vector; a valid-non-canonical vector wherever the format admits one (a format with exactly one spelling per identity, e.g. `BASE58_FIXED`, has none to give and is not required to invent one); an invalid-length vector; an invalid-prefix/form vector; a whitespace-handling vector; the format's own checksum/case rule exercised explicitly (for `EVM_HEX40`: a mixed-case EIP-55 input asserted **valid**, non-canonical, canonicalising to its lower-case form); and one vector per rejection class the rule's own definition calls out (e.g., for `TRON_BASE58CHECK`, the `41…` hex spelling asserted **invalid**, not an alternative identity). Vectors are frozen once registered (insert-only); no application caller may mutate or delete one, and correcting a wrong vector is itself a new version.

```sql
ast1.assert_address_rules_frozen() RETURNS void      -- migration/integrity assertion; VOLATILE
```
For **every** `(address_format, canonicalisation_version)` pair referenced by any row of `ast1.instrument` or `ast1.network_registry`, in order:
1. a matching `ast1.address_rule_version` row exists;
2. **[v1.6: F36]** its `function_definition_sha256` equals `ast1.function_definition_digest(rule_function)` **recomputed now, from PostgreSQL catalog state** — not a value any migration supplies. A `CREATE OR REPLACE FUNCTION` that altered the referenced version's implementation changes `pg_get_functiondef()`'s output and therefore the recomputed digest, so this step fails and the assertion raises. A migration that dropped and recreated the function under the same name gets a new `oid`; `rule_function` (a `regprocedure`, resolved to the old `oid`) then fails to resolve, which step 1 (or the `regprocedure` cast itself) catches;
3. the full required vector set (§ above, format-specific) exists for the pair in `ast1.address_rule_vector`;
4. **every** vector for the pair reproduces exactly against `ast1.canonicalise_address(address_format, canonicalisation_version, raw_input)` — the dispatcher, which resolves to `rule_function`: `expected_valid` ⇔ result `IS NOT NULL`; where `expected_valid`, result `= expected_canonical_value`; and `expected_fixed_point` ⇔ `(raw_input = expected_canonical_value)`;
5. **every** stored `ast1.instrument` row with that `(address_format, canonicalisation_version)` is a fixed point of the rule under its own version: `ast1.canonicalise_address(address_format, canonicalisation_version, contract_address_canonical) = contract_address_canonical` (this restates the `CHECK` of §4.2 as an explicit migration-time assertion, so a migration that somehow bypassed the `CHECK` is still caught);
6. no collision exists among the instruments captured under this pair's rule set (the same check the sweep's S9 rule performs, run here as a migration gate rather than a routine scan).

Any failure `RAISE`s and the calling migration transaction **aborts** — the migration does not partially apply.

**Dispatcher routing is frozen by construction, not by a separate digest [v1.6: F36].** `ast1.canonicalise_address` (§2.1) is pure routing: it resolves `rule_function` from the registry for `(p_address_format, p_version)` and invokes exactly that function. It contains no independent, version-specific semantics of its own, so there is no separate "dispatcher logic" that could silently re-route V1 to a new implementation while leaving the registry's `rule_function` pointer untouched — the pointer **is** the routing. `T-ADR-19` (10) inspects the dispatcher's own definition (`pg_get_functiondef`) to confirm structurally that it contains only a registry lookup and a call, never inline format/version-specific logic; this is a one-time structural property of the dispatcher's implementation, checked by static inspection, not a per-call runtime digest.

**What is actually proven — no stronger claim [v1.6: F36].** The mechanism does **not** prove arbitrary mathematical equivalence of every possible input based only on the golden vectors; it proves exactly four things, each independently checked above: (1) the registered version-specific function's definition is byte-for-byte unchanged from what was frozen at registration (step 2); (2) the frozen vector corpus still reproduces exactly under that function (step 4); (3) every stored identity remains a fixed point under its own stored version (step 5); (4) no collision has appeared among identities captured under the rule (step 6). A semantic change confined to an input outside the frozen vector corpus (§5.2 of the review) is **not** ruled out by this mechanism alone — it is ruled out only because the function itself, once registered, is never edited (step 2 catches any edit, on any input, because it hashes the whole function body, not just the vector-covered branches). Rule 20 (§1) and INV-23 (01 §3.7) state the property in exactly these terms; neither claims complete semantic freeze over every conceivable input.

**Automatic enforcement — the mechanism must actually be automatic, not an author reminder [v1.6: F36].** "Every migration must remember to call `ast1.assert_address_rules_frozen()`" is **not** mechanical enforcement, and v1.6 does not describe it as one. Today's harness (`node-pg-migrate` over `infra/migrations/*.cjs`) has **no post-migration hook configured** (confirmed by `04-review-r6.md` §5.3, re-confirming `04-review-r5.md` §5.3's original finding) — v1.6 does not claim otherwise. P1 implementation acceptance must instead **prove one of the following two mechanisms is installed and tested** before AST-01 P1 can be accepted; the blueprint documents the requirement, it does not pretend the mechanism is already live:
1. **(Preferred) A database event-trigger gate.** An `ast1`-owned `ddl_command_end` event trigger, created by the controlled migration/bootstrap role (the same role that already needs elevated privilege for other bootstrap DDL, §10), filtered to DDL affecting `ast1.canonicalise_address` and every per-version rule function, `ast1.address_rule_version`, `ast1.address_rule_vector`, `ast1.network_registry`, and `ast1.instrument`'s identity columns. On a matching `CREATE FUNCTION` / `ALTER FUNCTION` / `DROP FUNCTION` / `ALTER TABLE`, the trigger function calls `ast1.assert_address_rules_frozen()` **inside the same DDL transaction**, using `pg_event_trigger_ddl_commands()` to identify the affected objects. This is automatic for any DDL path — including one a migration author forgot to instrument — because it fires on the DDL itself, not on an author's closing statement.
2. **(Fallback) A mandatory migration-runner gate**, if the target PostgreSQL deployment cannot grant the privilege an event trigger needs: a gate that runs **automatically after every migration**, not as an opt-in step; **fails the migration/deployment** if `ast1.assert_address_rules_frozen()` fails; and **source-scans or manifests** the full set of AST-01 migrations touching the objects listed above, so an author cannot silently omit the call and have the gate stay silent about the omission (a migration in the manifest that does not itself call the assertion is a gate failure, not a pass).

Whichever mechanism the implementation installs, this is a **P1 acceptance criterion**, checked at implementation-review time, not asserted here as already built.

**`network_registry` constraint — corrected to valid PostgreSQL [v1.6: F36].** v1.5's `CHECK … EXISTS (SELECT …)` is **not valid SQL**: PostgreSQL rejects subqueries inside `CHECK` constraints. The corrected design uses two separate mechanisms:
- **A composite foreign key**, replacing the invalid `CHECK`: `FOREIGN KEY (address_format, canonicalisation_version) REFERENCES ast1.address_rule_version (address_format, canonicalisation_version)` on `ast1.network_registry` (§2, `ast1.network_registry`). This alone enforces "the registry row exists" — condition (i) of the old `CHECK`'s intent — with no subquery, because a `FOREIGN KEY` is a first-class constraint type, not a boolean expression.
- **A `BEFORE INSERT OR UPDATE` trigger**, `trg_network_registry_rule_ready`, for the conditions a `FOREIGN KEY` cannot express: (ii) the required vector corpus (§ above) exists for the pair in `ast1.address_rule_vector`; (iii) `ast1.address_rule_supported(address_format, canonicalisation_version)` reports the rule as implemented; and, where the pair is already referenced by a stored instrument, the freeze assertion's per-pair checks (steps 2, 4, 5, 6 above, scoped to this one pair) still pass. The trigger raises `AS004` if any condition fails, before the row is written.
No `CHECK` on `network_registry` references another table. Changing the network's current version affects **future** registrations only (rule 20; unchanged from v1.4); it never touches an existing instrument's stored version. **SQL-feasibility test note (10 T-ADR-19a):** the invalid `CHECK … EXISTS` construct itself is now a negative test — attempting to create it must fail with PostgreSQL's "cannot use subquery in check constraint" error, confirming the corrected FK/trigger pair is not merely a style preference but the only implementable form.

**Old-instrument updates are unaffected (unchanged from v1.4, restated for this section).** A retire, an identity lock, or a correction's fingerprint recompute validates against the instrument's **stored** rule version only (the `CHECK` of §4.2, evaluated under that version); it does not re-read `network_registry` or re-derive the instrument's identity against the network's **current** state (`trg_instrument_address_canonical`'s `UPDATE` arm, §2.1). A network becoming `SUSPENDED`, or its `canonicalisation_version` being bumped, changes nothing about an existing instrument's validity.

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

**`lineage_root()`'s contract [v1.4: F30.b].** It follows `merged_lineage_id → surviving_lineage_id` edges to a fixed point. It **raises** `AS004` (`AST1_LINEAGE_CYCLE`, the identity/lineage-invariant family that already covers "merge argument not a current root") — never returns `NULL`, an arbitrary lineage id or any other partial value — if it does not reach a fixed point within a bounded number of hops (a generous governed bound, illustratively 4096: merges are rare, governed, human-paced events, so a real lineage chain is always far shorter) or if it encounters an edge whose `surviving_lineage_id` does not itself resolve to a valid `lineage` row. Every caller of `lineage_root()` — the derivation, `authoritative_state()`, the resolver, the sweep, and `trg_lineage_merge_apply` itself — therefore either gets a definite, well-formed root or the whole calling statement fails closed; no caller can silently treat a corrupted or cyclic ancestry as "no merge history".

**[v1.2: F19.D] Lineage assignment is immutable from creation.** No role can `UPDATE` `asset.lineage_id`, `predecessor_declaration`, `predecessor_ref` or `predecessor_attested_by` (§4.1), and a merge does **not** update asset rows: it appends a `lineage_merge` row and `lineage_root()` follows it. The merge is the only governed lineage operation. There is **no un-merge and no loosening correction**: a wrongly *separate* lineage is fixed by a merge (tightening); a wrongly *merged* lineage is never split, and its members take the elevated path (fail-closed).

**`trg_lineage_merge_apply` [v1.3: F27; reordered v1.4: F30.b]** — `BEFORE INSERT` on `lineage_merge`. Its order is fixed, and it is what makes the sequencing rule non-optional even for a caller that skipped the application's own steps. **The gate is taken first, and every root/cycle/compatibility decision is made only after it is held** — a caller that skips the application's own locking (the exact case this trigger exists to cover) therefore never gets to make a security-relevant decision from a pre-gate, potentially stale read:

1. **Take the gate first:** `ast1.lock_lineage_gate_exclusive()` (§7A level 0). No decision below this line is made from a read taken before this lock.
2. **Only now, under the gate, resolve** both arguments to their **current** roots via `lineage_root(...)` (which itself fails closed on a cycle or malformed ancestry — above). A raw caller may have supplied original lineage/instrument references, not pre-resolved roots; resolution happens here, not before the gate. **[v1.5, editorial — F30.b residue]** `NEW.surviving_lineage_id` and `NEW.merged_lineage_id` are **overwritten to the resolved roots** before insert: the stored row records what was actually merged (the two trees' roots at the moment the gate was taken), not whatever non-root reference the caller may have originally named. This is what the reader needs to reconstruct history from `lineage_merge` alone, and it is what `UNIQUE (merged_lineage_id)` and the same-root refusal (step 3) actually operate on. The caller's original (possibly non-root) argument, if it differs, is preserved only in the governed change's payload, for audit of what was requested versus what was applied.
3. **Reject same root** (`AS004`): if both arguments resolve to one root — because they already are the same lineage, or because a concurrent merge (now committed and visible under this gate) already joined them — the insert is refused. This is what stops two opposite concurrent merges (`A→B` raw, `B→A` raw) from both committing: whichever commits second re-resolves under the gate to find both arguments already share a root, and is refused here, before it could form a cycle.
4. Require `lineage.synthetic` equal on both (now-resolved) roots (`AS004` otherwise).
5. Require the referenced `governed_change` (`change_id`) to be of kind `LINEAGE_MERGE`, `applied` **by this transaction** (the row's `xmin` is the current transaction id), targeting exactly these two roots (matched against the change's payload target identifiers, not the resolved roots, since the payload names what was approved).
6. **Lock the affected set:** `ast1.lock_merge_affected_instruments(surviving, merged)` — every instrument of both merge trees **and** every instrument whose transitive underlying chain reaches an instrument of either tree, `ORDER BY instrument_id ASC … FOR UPDATE` (the application takes the same locks as its first statements; re-locking is a no-op). The set is re-derived after the locks are held and the trigger raises `AS006` (`AST1_LOCK_SET_CHANGED`, retry) if it grew.
7. **Only now** assign `NEW.merge_global_seq := nextval('ast1.classification_global_seq')` and `NEW.recorded_at_utc := clock_timestamp()`. The value is never read from the caller; an application-supplied `merge_global_seq` is overwritten. Because steps 1–6 precede the draw and the gate is exclusive, two lineage-wide events (a real `SECURITY` record, a merge) are ordered by sequence in the same order in which they commit, and any classification writer is ordered against them by the gate (§7A).

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
- `trg_asset_class_frozen` **[F22; v1.3: F26, F28 note; v1.4: F29; v1.5: F33]** — `asset_class` may be updated only (a) while the asset has **no** instrument, or (b) inside the transaction that has just marked an `ASSET_CLASS_CORRECTION` governed change `applied` (the change row's `xmin` is the current transaction id) for exactly this asset and (from, to) — the correction path for a mislabelled class (AST-P-3; 01 §3.4). **Both branches first take `SELECT … FROM ast1.asset WHERE asset_id = OLD.asset_id FOR UPDATE` and only then evaluate "no instrument exists" / the correction preconditions** (§7A level 1). **[v1.5: F33] Branch (b) then itself calls `ast1.lock_asset_instruments(asset_id)`** — the same helper the application calls at its own step 3 (§7A "Asset class correction apply") — **before it evaluates any further correction precondition or permits the class change.** The helper enumerates **every** existing instrument of the asset (record-less ones included), drops any already held at the required mode (the idempotent re-lock of rule 22/§7A — a no-op when the application already took these locks), and acquires every remaining one `FOR UPDATE` ascending `instrument_id`. **This makes "every instrument is locked before the class changes" a property the trigger itself enforces, not an application convention a raw or defective writer could skip**: trigger 4's justification for its unlocked `asset_class` read (§5.1, below) now holds for **any** writer that reaches `UPDATE asset SET asset_class`, not only one that followed the documented protocol. A correction (i) never crosses the FIAT boundary once an instrument exists (`FIAT_CURRENCY` ⇔ `instrument_form = 'FIAT'`), (ii) when it moves a class **out of** `SECURITY`/`SECURITY_TOKEN` needs ≥ 2 attested approvers (`COMPLIANCE_OFFICER` + `MLRO`), because it loosens, (iii) leaves `lineage_id` untouched (lineage preserved), and (iv) **[v1.3: F26]** in the same transaction (a) recomputes the cached `instrument.identity_fingerprint` of **every** instrument of the asset (the fingerprint's `underlying[]` component hashes link descriptors only — never the linked instrument's class or fingerprint — so the correction changes the fingerprints of the corrected asset's instruments and of no other) — the only permitted post-lock write to that column — (b) inserts one `class_correction_marker` per instrument that has a classification record (§5.3), and (c) revokes every outstanding token of those instruments (`asset_class_corrected`). The old records stay in the ledger unchanged but can no longer be used: SQL sees the mismatch (`record_fingerprint_matches = false`, rule **B12**, §7) and the TypeScript derivation collapses them (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`, 01 §4.4). A new governed classification is mandatory before any eligibility can return. The trigger refuses branch (b) unless the marker rows and the token revocation for every instrument of the asset are present at the end of the transaction (a deferred constraint trigger, so the writer's statement order is free but the outcome is not optional). **[v1.4: F29]** That deferred constraint additionally requires, for every instrument of the asset that has a current record: `instrument.identity_fingerprint <> that record's superseded_record_fingerprint` (the correction's fingerprint write actually took effect — a writer that left the cached value unchanged cannot commit); `instrument.identity_fingerprint = ` the `class_correction_marker` row's `new_instrument_fingerprint` (the marker chains to what was actually written, not to some other value); and `class_correction_marker.asset_id = instrument.asset_id` for every marker the transaction wrote (a marker can never be attributed to the wrong asset). **[v1.6: F39(a) — scoped]** For an ordinary single-hop class change, this assertion is a **correctness backstop on the writer**, not the security control — B12 (§7, below) denies independently of it, by comparing the record's stored `asset_class_at_record` with the asset's **live** `asset_class`, which the correction is defined to change whether or not the fingerprint recompute is implemented correctly. **For round-trip revival prevention specifically, the deferred constraint IS additionally security-critical** (below): the live class-binding half of B12 is satisfied again the moment a round trip returns the class label to its original value, so for that one case the fingerprint-based deferred constraint is the only thing still denying.
- **[v1.5: F33] First-classification race, adjudicated.** With branch (b) locking every instrument of the asset — including a record-less one — before the class changes, the race the round-5 review found (`04-review-r5.md` §7) is closed at the lock, not by hoping the two statements interleave safely. For a record-less instrument X and a concurrent (correction C, first classification W of X), whichever of C's `lock_asset_instruments` call and W's `lock_instrument(X)` call (record-insert trigger 2) reaches X's row lock first is strictly ordered before the other by PostgreSQL's row-lock queue. **Either** (A) W locks X first: W's record commits under the **old** class (trigger 4 stamps the pre-correction `asset_class_at_record`); C then locks X, sees the committed record under its own locks, and its deferred constraint (above) covers X; once C commits, B12's `class_binding_matches` denies W's record, exactly as F29 intends. **Or** (B) C locks X first (and every other instrument of the asset) and commits: W's `lock_instrument(X)` then waits, and once granted, W's fresh `READ COMMITTED` read of `asset.asset_class` (trigger 4) sees the **corrected** class, so trigger 6 (`SECURITY_LABELLED`) evaluates against the new class and a `NON_SECURITY` proposal into a `SECURITY`-labelled class is refused. **Neither interleaving produces a `NON_SECURITY` record stamped with a `SECURITY`/`SECURITY_TOKEN` `asset_class_at_record`** — the specific outcome F29's property is required to survive — because X's row lock admits exactly one holder at a time and both writers take it before doing anything else that matters to this decision.
- **[v1.5: F33; invariant restated v1.6: F39(a)] Round-trip correction (`A → B → A`), stated.** A correction back to a class an asset previously held, with **no** intervening classification, recomputes each affected instrument's `identity_fingerprint` back to its pre-`A→B` value (the fingerprint depends on `asset_class` among other fields). **SQL invariant:** after every committed `ASSET_CLASS_CORRECTION`, each instrument whose current record predates the correction remains fingerprint-**incompatible** with that current record — the deferred constraint (`identity_fingerprint <> superseded_record_fingerprint`) refuses **any** commit, including a second correction's, that would make the stale record's fingerprint match again. For the round trip specifically, this is not merely a writer-correctness backstop: it is what denies after the live class-binding half of B12 (§7) has already gone back to matching (class `A` again = the stale record's stamped class `A`), so **for round-trip revival prevention the deferred fingerprint constraint is the security control**, not a supporting one. This is fail-closed and intended: an old record does **not** become usable again merely because the live class label has returned to its original value — the fingerprint check, the marker chain (§5.3), lineage/security history (§4.7A) and the current-record requirements of §5.1/§7 are all still evaluated exactly as for any other state. **[v1.6: F39(a)]** The live `asset_class` binding remains independently sufficient for an ordinary single-hop class change (where no revival question arises); it is the round-trip case specifically that needs the deferred fingerprint half, and none of this is satisfied by "the class matches again" alone. The operator route for a genuine `A → B → A` correction is the one T-FPR-05 already exercises for `A → B → C`: record an `UNRESOLVED` (or otherwise superseding) outcome between the two correction hops, so the second correction's deferred constraint has an actually-changed fingerprint to compare against. Where any ambiguity would otherwise arise, the design fails closed rather than silently reviving a pre-correction record.
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
- `trg_underlying_insert_only` — a row with `underlying_type = 'INSTRUMENT'` is insert-only (no `UPDATE`, no `DELETE` grant); the **source** rule (unchanged): **any** underlying row may be inserted only while the linking instrument is `DRAFT`. The instrument-to-instrument link feeds `elevated` and the lineage conjunct, so it cannot be edited away.
- **`trg_underlying_target_locked` [v1.6: F37, new].** For a row with `underlying_type = 'INSTRUMENT'`, the **target** — `underlying_instrument_id` — must be `IDENTITY_LOCKED` or `RETIRED`, and must **not** be `DRAFT`, checked while the insert protocol (§7A "Underlying link insert") holds the target's own lock. This is the corrective half of F37 (04-review-r6.md §16, option 1, recommended): the linking instrument may still be `DRAFT` (that is the whole point of registering a wrapper before it classifies), but whatever it links to must already be past `DRAFT` — its own link set already frozen by the source rule above. Refusal raises `AST1_UNDERLYING_TARGET_NOT_LOCKED`.
- `trg_underlying_no_cycle` — rejects a link that closes a cycle and any chain deeper than 8 (`AST1_UNDERLYING_CYCLE`).
- `trg_underlying_same_kind` — a synthetic instrument may link only a synthetic underlying instrument, and a real one only a real one (synthetic history never enters a real lineage decision and vice versa).

**Why this closes F37, stated once here and referenced from 01 §3.6/§4.7A and 05 §7.** Recursive property: a `DRAFT` instrument may add links; every instrument it points to is already non-`DRAFT` (the rule above); every non-`DRAFT` target's own underlying set is therefore already frozen (the source rule, unchanged, applied to that target when it was still `DRAFT`); so the full transitive underlying/basis tree reachable from any instrument's links is fixed **before** that instrument is ever linked to. Concretely, for the F37 sequence the review found (X links to U while both `DRAFT`, X classifies `NON_SECURITY`, U later — while still `DRAFT` — links to older-`SECURITY` V): the second step (U → V) is now refused outright, because at that point U is the **target** of X's earlier link and therefore had to be non-`DRAFT` (`IDENTITY_LOCKED` or `RETIRED`) *before* X's link to U could ever have been inserted in the first place — U could not have been X's underlying while U itself was still capable of adding a late link to V. The late-link security hole is closed at registration time, not by a post-hoc sweep.

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
  asset_class_at_record varchar(24) NOT NULL,              -- [v1.4: F29] filled by trigger from the LIVE ast1.asset.asset_class, read under the instrument's own lock; app value ignored; never updated (append-only table)
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
Triggers on INSERT (all read authoritative rows; none trusts the supplied values). **[v1.5: F33] Steps 2–8 below are one ordered `BEFORE INSERT` trigger function, not several independently-firing trigger objects** — PostgreSQL does not guarantee the firing order of separate triggers on one event (it is alphabetical by trigger name, which the design must not rely on for a correctness-bearing order), so a step that must see another step's result reads it from `NEW`, set within this same function, never from a second independent read:
1. Reject UPDATE/DELETE/TRUNCATE.
2. **Locks [v1.2: F18, F20; v1.3: F27, F28.b; reordered v1.4: F31].** In the order of §7A: (a) `ast1.lock_lineage_gate_shared()` — or `ast1.lock_lineage_gate_exclusive()` for a **real** instrument and `outcome = SECURITY_OR_SECURITY_TOKEN`; (b) for the **shared**-gate case (every non-`SECURITY`, non-elevated-apply record) simply `ast1.lock_instrument(instrument_id)` (`SELECT … FOR UPDATE` on the one instrument row) — no wider set exists to lock. (c) For the **exclusive**-gate case (a real `SECURITY` record), **the instrument is never locked on its own first**: under the gate, `ast1.lock_affected_instruments(instrument_id)` first **derives** the full affected set — the instrument itself, plus every instrument of its lineage merge tree, plus every instrument whose transitive underlying chain reaches that tree — entirely from `asset`/`instrument_underlying` rows read under the gate — **[v1.6: F37 — corrected; supersedes the v1.5 editorial reasoning]** stable not because the gate blocks *every* new instrument or underlying link (it does not: an instrument insert takes only the asset row `FOR SHARE`), and **not** because "any newcomer is necessarily record-less" (that v1.5 claim was false: a **classified** wrapper could previously become a newcomer to a tree through a late `DRAFT` underlying link on an intermediate instrument, F37). Stability now rests on §4.3's `trg_underlying_target_locked`: for a classified (non-`DRAFT`) instrument, its own underlying set is frozen (the source rule), and every instrument it targets was already non-`DRAFT` when linked (the new target rule), so each target's own underlying set was therefore already frozen when the link was added. Recursively, the transitive underlying graph reachable from any instrument is immutable **except through a lineage merge** — and a merge is gate-serialised and already covered by clause (b) below (F27). Therefore `B(X)` for a classified/non-`DRAFT` X cannot grow from a late link after X's classification; the set the trigger derives here is stable for the ordinary reason (every underlying reachable from a locked tree is itself already locked), not the discredited "record-less newcomer" reasoning. The set is still unconditionally **re-derived once every lock is held**, raising `AS006` if it somehow grew (defence in depth); no instrument lock is needed to read the rows this derivation reads — and only then locks the **whole set, including the instrument itself, ascending `instrument_id` in one pass, `ORDER BY instrument_id ASC … FOR UPDATE`**, re-derived after the locks are held (`AS006` if the set grew). This is what makes the pairing with `ASSET_CLASS_CORRECTION` and evidence-standard retirement — which also lock an asset's/tree's instruments purely ascending — free of the lock-order inversion a self-first acquisition would otherwise create (§7A cycle analysis). All of this precedes anything read below. The application's apply transaction takes the same locks as its first statements; the trigger makes the rule non-optional (§7A).
3. `record_seq` = previous max + 1 (under the lock); **`global_seq` = `nextval('ast1.classification_global_seq')` drawn only after the locks are held**, so two records that touch a common instrument, and a record and a merge on one tree, are ordered consistently with lock (hence commit) order; `recorded_at_utc := clock_timestamp()` (supplied value ignored).
4. Fill `recorded_environment` from `ast1.deployment_environment`; **[v1.3: F26 clarification]** `identity_fingerprint` must equal the instrument's cached `identity_fingerprint` read under the lock (SQL cannot recompute the canonical-JSON hash; the TypeScript apply recomputes it from the live columns and stops on disagreement, and the sweep re-verifies it, S4); **[v1.4: F29; justification corrected v1.6: F39(b)]** `asset_class_at_record` from the **live** `ast1.asset.asset_class` of the instrument's asset, read (unlocked `SELECT`) after the instrument's own row lock is held — safe **because `trg_asset_class_frozen` branch (b) itself locks this exact instrument, ascending over every instrument of the asset, via `lock_asset_instruments` before it permits `asset_class` to change (§4.1, INV-26)**, for any writer that reaches the `UPDATE`, not merely because the application's own apply protocol happens to do so in the documented order. So this record's read is strictly before or strictly after that correction's `UPDATE asset SET asset_class`, never during it, regardless of whether the correction writer followed §7A's documented steps; `lineage_id` from the asset root.
5. `outcome = 'SYNTHETIC_TEST_INSTRUMENT'` ⇔ `instrument.declared_synthetic` **[F09]**; instruments with **`instrument_form = 'FIAT'`** cannot receive any record **[F08, F22]**.
6. `NON_SECURITY_DIGITAL_ASSET` refused for asset classes `SECURITY` / `SECURITY_TOKEN` (`SECURITY_LABELLED`, AST-P-3) — **not** for `TOKENISED_DEBT`/`TOKENISED_FUND` (AST-HD-4). **[v1.5: F33]** This check reads **`NEW.asset_class_at_record`** (already stamped by step 4, above, in this same ordered function) — never a second, independent read of `ast1.asset.asset_class` — so the class this check tests and the class the record is stamped with are, by construction, the same read at the same point under the same lock. There is no window in which step 6 could see one class and step 4 stamp another.
7. **`elevated` (F06; v1.2: F19.B; v1.3: F27, F28.b):** `elevated_basis` is computed from the ledger: `OWN_LINEAGE` iff ∃ a real (non-synthetic) `SECURITY_OR_SECURITY_TOKEN` record in the same lineage **merge tree** (`lineage_root(record.lineage_id)` = the instrument's root) — any instrument, any time, **any evidence standard** (a provisional SECURITY determination still narrows); `UNDERLYING_LINEAGE` iff the same holds for the merge tree of any **transitive** underlying instrument of the proposed instrument (depth > 8 ⇒ true). `elevated := basis ≠ ∅`. A merge changes what is in the tree, so a merged-in `SECURITY` record makes the basis non-empty for every member of both sides. When `elevated ∧ outcome = 'NON_SECURITY_DIGITAL_ASSET'`, require (i) ≥ 2 distinct `checker_actor_ids`; (ii) `lineage_reviewed_attested`; (iii) **the sequence rule**: let the **review floor** `F` be the **newest triggering event over every basis tree** — the maximum of (α) `global_seq` of every real `SECURITY` record in the tree and (β) `merge_global_seq` of every `lineage_merge` edge of the tree **for which a real `SECURITY` record of the tree has `global_seq < merge_global_seq`** (a merge that joined security history; the same definition as clause (b) of `lineage_review_required`, §7). The case's evidence bundle must contain ≥ 1 item with **`evidence_global_seq > F`**, **[v1.5: F35.b; wording pinned as the one normative statement v1.6: F39(c)]** excluding any item whose `content_sha256` appears in the evidence bundle of **any** real (non-synthetic) `SECURITY_OR_SECURITY_TOKEN` record in `SEC(G)`, for **every** `G ∈ B(X)` — not "the newest" one, which names no ordering key and is ambiguous across several basis trees, and not "qualifying" or "contributing to the review floor" without defining it; excluding the bundle of every real `SECURITY`/`SECURITY_TOKEN` record in `SEC(G)` for every relevant `G ∈ B(X)` is strictly tighter and needs no recency choice at all. **01 §4.7 item 2 and 02 W3 use this exact statement, word for word** (v1.5 let them drift into narrower-sounding paraphrases; v1.6 pins one wording and cross-references it rather than restating it three ways); and (iv) **the explicit binding**: `case.follows_event_*` (set at submit by trigger from the ledger) must name the **same** event as the `F` recomputed now. If a further triggering event occurred between submit and apply, `F` has moved, the binding is stale and the record is refused (`AST1_ELEVATED_APPROVAL_REQUIRED`, reason `binding_stale`; the case is resubmitted with new evidence). Otherwise raise. The record stores `review_floor_global_seq := F`. **No `recorded_at_utc` value is read anywhere in this trigger.** A `NON_SECURITY` record that lacks (i)–(iv) is never appended, so a "reaffirmation" that is not elevated cannot clear a lineage review requirement (§7). The record's `outcome` is **not** automatically `SECURITY` for a wrapper: the path only forbids skipping the elevated review.
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
- **[v1.5: F35.c] One sequence source, stated once.** `marker_global_seq` is drawn from **`ast1.classification_global_seq`** — the **same shared** sequence as `classification_record.global_seq`, `lineage_merge.merge_global_seq` and `classification_evidence.evidence_global_seq` (§1 rule 12) — after the locks of §7A, never a sequence of its own. (`securities_market_admission_attestation.attestation_seq`, §6, remains its own dedicated sequence: that domain is unrelated to classification/lineage ordering, §1 rule 20.) `marker_global_seq` belonging to the shared domain does **not** by itself give it the commit-order guarantee for an arbitrary pair: that guarantee (§7A "Scope of the ordering guarantee") holds only for a pair serialised by a shared instrument lock or the exclusive gate. The one comparison this pack makes — "the newest marker explains the newest fingerprint" (above) — is always between two markers **of the same instrument**, drawn under that instrument's lock throughout the correction transaction, so clause (i) of the scope statement already covers it. A marker's sequence is never compared against a different instrument's event or against a gate-serialised event for a security decision.

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
  attestation_seq bigint NOT NULL UNIQUE,                   -- [v1.4: F32.b] DB-assigned (own sequence, ast1.attestation_seq); NO caller-supplied value; the ONLY ordering authority for "newest wins"
  received_from varchar(64) NOT NULL, received_at_utc timestamptz NOT NULL DEFAULT now()  -- trigger-filled; audit only, never compared
);
```
`trg_attestation_binding` **[F13; v1.4: F32.b; v1.5: F35.a]**: an `ADMITTED` INSERT requires the referenced record to be the instrument's **current** record with outcome `SECURITY_OR_SECURITY_TOKEN` (or synthetic→`SECURITY`, non-production); it takes `ast1.lock_instrument(instrument_id)` first (§7A level 2) and assigns `NEW.attestation_seq := nextval('ast1.attestation_seq')` under that lock — an application-supplied value is overwritten, and `received_at_utc` is trigger-filled and never read for ordering. Any later record makes the attestation stale by construction; C5 compares `classification_record_id` with the current record. A `WITHDRAWN` row (a tightening) is accepted regardless of record state. **"The newest row per `(instrument_id, admission_ref)` wins" means the row with the highest `attestation_seq`** for that pair — never the highest `received_at_utc`, which an `EXM-01`-side clock or a replayed call could misstate. A withdrawal therefore cannot be shadowed by a back-dated `received_at_utc`: it is ordered by when it was actually inserted (and locked) at AST-01, not by any value `EXM-01` supplies. **[v1.5: F35.a] `WITHDRAWN` is terminal per `(instrument_id, admission_ref)`.** Before inserting an `ADMITTED` row, the trigger (under the instrument lock already held above) checks whether **any** `WITHDRAWN` row already exists for the same `(instrument_id, admission_ref)` pair; if one does, the insert is refused (`AST1_ATTESTATION_INVALID`) regardless of `attestation_seq` ordering — a retried or delayed `ADMITTED` call (for example, a timed-out request `EXM-01` retries under a fresh idempotency key) can therefore never be **inserted** after a withdrawal for the same admission, let alone win by sequence. This closes the residual the sequence-ordering rule alone does not: `attestation_seq` correctly orders whichever rows exist, but says nothing about whether a **new** `ADMITTED` row for an already-withdrawn admission should exist at all. Re-admission after a genuine withdrawal requires a **new** `admission_ref`, issued by `EXM-01`'s own lifecycle (a new listing event), never a second `ADMITTED` row under the old one. This check does not depend on `received_at_utc` or any timestamp: it is an existence check over rows already committed and visible under the instrument lock.

**Key-column immutability [v1.2: F24].** A per-table `BEFORE UPDATE` trigger (`ast1.reject_key_update()`, key list below) makes the security-critical key columns immutable from `INSERT` for every role (`AS002`). A change of target is a **new row**, so an approved row cannot be retargeted to another instrument, product, domain or classification record by `UPDATE`.

| Table | Immutable from `INSERT` | Mutable (governed) |
|---|---|---|
| `product_admission` | `admission_id`, `instrument_id`, `product`, `classification_record_id`, `jurisdiction_assessed` | `status`, `approved_change_id`, `version` |
| `custody_support` | `instrument_id`, `domain`, `custody_model`, `custodian_ref`, `deposit_supported`, `withdrawal_supported` | `status`, `approved_change_id`, `version` |
| `instrument_operational_state` | `instrument_id`, `subject` (the PK) | `state`, `reason`, `approved_change_id`, `version` |
| `transfer_restriction_profile` | `instrument_id` | `status`, `approved_change_id`, `version` |
| `transfer_restriction`, `jurisdiction_rule` | everything except `status`, `lifted_change_id` | `status` (`ACTIVE → LIFTED` once), `lifted_change_id` |
| `securities_market_admission_attestation` | **append-only** (`INSERT, SELECT`): a withdrawal is a new `WITHDRAWN` row for the same `admission_ref`; the newest row per `(instrument_id, admission_ref)` wins **by `attestation_seq`, DB-assigned** [v1.4: F32.b] | — |

Every insert/update on these tables first calls `ast1.lock_instrument(instrument_id)` (§7A). A partial unique index `ux_ast1_custody_live (instrument_id, domain) WHERE status IN ('PROPOSED','APPROVED')` states the one-live-custody-row-per-domain rule explicitly.

## 7. The authoritative SQL backstop [v1.1: F04; v1.2: F18, F19, F20, F21, F23, F25; v1.3: F26, F27; v1.4: F29, F30]

v1.0 CHECKed `effective_outcome` etc. on the row being inserted — values written by the very code being guarded. v1.1 replaced that with a SQL function that **reads the ledger**. v1.2 keeps that design and extends the same function (a) to **token consumption**, not only mint, and (b) to the lineage, MYR, service-identity and real-instrument-basis conditions. **v1.3** (c) redefines the lineage condition so a **lineage merge** narrows exactly as a newer `SECURITY` record does (F27), and (d) adds the **record-to-instrument fingerprint comparison** and rule **B12**, so `ASSET_CLASS_CORRECTION` is visible to SQL (F26). **v1.4** (e) adds a **second, independent** input to B12 — the record's asset class at write time compared with the asset's live class — so B12 no longer depends on the correction writer having recomputed the cached fingerprint correctly (F29), and (f) makes the isolation level the whole function's safety rests on an asserted, fail-closed precondition rather than a documented assumption (F30.a).

```sql
ast1.authoritative_state(p_instrument_id uuid) RETURNS TABLE (
  instrument_form, declared_synthetic, synthetic_emulates, lifecycle_status,
  current_record_id, current_record_seq, current_global_seq, latest_outcome,   -- newest record only
  record_env_matches boolean, on_hold boolean, canonical_environment,
  standard_production_applicable boolean,   -- [F25] the newest record's standard is APPROVED and PRODUCTION-applicable
  record_fingerprint_matches boolean,       -- [v1.3: F26] newest record's identity_fingerprint = instrument.identity_fingerprint; see below
  class_binding_matches boolean,            -- [v1.4: F29] newest record's asset_class_at_record = the asset's LIVE asset_class, independent of the cached fingerprint; see below
  drift_explained_by_correction boolean,    -- [v1.3: F26] a verified class_correction_marker explains the mismatch (§5.3); label only, never a permission
  lineage_review_required boolean,          -- [F20; v1.3: F27] see below
  attr_myr_denominated boolean)             -- [F21]
```
**[v1.4: F30.a] Isolation precondition, asserted first.** Every one of the properties below — including the ordinary "current record" read — is a security guarantee only if this session runs `READ COMMITTED`, because a `REPEATABLE READ`/`SERIALIZABLE` snapshot taken before a concurrent writer's commit would let this function see a state older than what the lock protocol has already serialised against. Accordingly, `authoritative_state()`'s **first statement**, before any lock or read below, is `IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION … SQLSTATE 'AS007'; END IF` (`AST1_UNSUPPORTED_TX_ISOLATION`). v1.4 supports `READ COMMITTED` only; a session or pool that defaults to a stronger level fails every mint, consume, classification apply, evidence insert, lineage merge and `ASSET_CLASS_CORRECTION` closed, rather than silently running with a weaker guarantee than the design claims. The same assertion opens every lock helper (`lock_lineage_gate_shared/exclusive`, `lock_asset`, `lock_instrument`, `lock_affected_instruments`, `lock_merge_affected_instruments`, `lock_asset_instruments`), so a caller that reaches SQL through any path is covered, not only through `authoritative_state()`. This is a connection/pool-configuration requirement: the runtime pool must not set a session default above `READ COMMITTED` for any AST-01 connection.

It then takes `SELECT … FROM ast1.instrument WHERE instrument_id = p_instrument_id FOR SHARE` (idempotent inside a transaction that already holds a stronger lock on the row; §7A), then reads `ast1.instrument`, `ast1.asset` (for the **live** `asset_class`, F29), `ast1.classification_record` (max `record_seq`), `ast1.evidence_standard`, `ast1.instrument_hold`, `ast1.deployment_environment` and the lineage tables. It contains **no** matrix, only the minimum needed to decide the forbidden set. **[v1.3, review §7 implementation note]** `authoritative_state()`, `backstop_permits()`, `assert_token_consumable()` and every trigger function that takes a row lock must be declared `VOLATILE` (PostgreSQL rejects `FOR SHARE/UPDATE` in non-volatile functions, and under `READ COMMITTED` each statement must see commits made while it waited for a lock); **[v1.6: F36]** `canonicalise_address` and `address_rule_supported` are `STABLE` (they resolve/check against the `address_rule_version` registry, so they are not pure functions of their arguments alone); the per-version rule functions they dispatch to (e.g. `ast1.canonicalise_evm_hex40_v1`, §2.1) are the `IMMUTABLE` functions.

**`record_fingerprint_matches` [v1.3: F26].** Derived inside the function from two stored values: `current record.identity_fingerprint = instrument.identity_fingerprint`, where the record is the newest by `record_seq` and the instrument row is the one read under the lock. It is `true` when there is no current record (B2 handles that case), and it is **never** a parameter, a column of the log or token, or any application-supplied value. The database cannot recompute the fingerprint from the live identity columns (it is a canonical-JSON hash computed in TypeScript); it does not need to for the cases it must cover: identity columns are trigger-immutable after lock, so the **only** governed way the cached fingerprint changes is `ASSET_CLASS_CORRECTION` (§4.1 iv), and any change to that cached value is visible as a mismatch. A cached value that disagrees with the live columns (raw tampering) is the sweep's and the TypeScript derivation's job (T-INT-01), unchanged from v1.2. `drift_explained_by_correction` is `true` only when `record_fingerprint_matches = false` **and** a verified `class_correction_marker` explains it (§5.3); it selects a reason code and sweep behaviour and is **not** read by `backstop_permits` (B12 denies either way).

**`class_binding_matches` [v1.4: F29 — independent of `record_fingerprint_matches`].** Derived from two stored values, neither of them a cache the correction writer must remember to update correctly: `current record.asset_class_at_record = asset.asset_class`, where `asset_class_at_record` is trigger-filled at record insert (§5.1 trigger 4) from the asset's class **at that time**, and `asset.asset_class` is read **live**, under the lock, at evaluation time. Unlike `record_fingerprint_matches`, this comparison needs nothing cached on the instrument to have been correctly recomputed: `ASSET_CLASS_CORRECTION` is *defined* as `UPDATE asset SET asset_class` (§4.1), so the moment a correction commits, `asset.asset_class` has changed and `class_binding_matches` goes `false` for every instrument of that asset with a current record — **whether or not** the same transaction's fingerprint recompute (§4.1 iv(a)) ran correctly. This is what closes the R3→R4 gap: a defective correction writer that leaves the cached `identity_fingerprint` untouched (so `record_fingerprint_matches` stays `true`) cannot also leave `asset.asset_class` untouched, because changing it *is* the correction. It is `true` when there is no current record (B2 handles that case) and is never application-suppliable.

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
| **B12** [v1.3: F26; extended v1.4: F29] **IDENTITY / CLASSIFICATION BINDING DRIFT** | any subject (real or synthetic), instrument has a current record and (**`record_fingerprint_matches = false`** **or** **`class_binding_matches = false`**) | deny. Either condition alone is sufficient; they are evaluated independently — a defective correction writer that leaves the cached fingerprint untouched still trips B12 through `class_binding_matches`, because `asset.asset_class` is not a cache. Reported as `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when `drift_explained_by_correction`, `CLASSIFICATION_ASSET_CLASS_DRIFT` when only `class_binding_matches` is false and no marker explains it, else `CLASSIFICATION_IDENTITY_DRIFT` (the SQL error is `AS001` with rule tag `B12` in every case) |

**Rule order and compatibility with the hard rule [v1.3: F26; v1.4: F29].** B1 keeps reading `latest_outcome` (the newest record as stored), so a drifted `SECURITY` record still denies as `SECURITY` for every MB/PSO subject even after a correction moved its class; B12 is **additional**, not a replacement, and is evaluated after B1–B3 so the most specific reason wins. B12 makes every eligibility or action that *relies on the classification record* deny: no `allow` log row or token mint (`AS001`), no token consumption (`AS003`, via `assert_token_consumable` → `backstop_permits`), no `product_admission` insert or approval, no `ADMITTED` securities-market attestation, no custody approval and no operational enable. Withdrawals and other tightenings are still accepted. **[v1.4: F29]** Because `class_binding_matches` reads `asset.asset_class` live, this half of B12 is correct **even if every application-side recompute in the correction transaction has a defect** — the only way to make it pass again is the one thing that actually restores the state B12 is protecting: a new governed classification record whose `asset_class_at_record` is stamped, by trigger, from the asset's current (corrected) class.

It is deliberately **coarser than the matrix** (it only forbids), written **independently** of the TypeScript matrix, and covered by a parity test (T-DB-09): for every instrument state, whenever the TS matrix returns anything other than `ELIGIBLE` for B1–B12-relevant cells the backstop must also deny, and it must never allow a cell the matrix denies for B1/B3/B5/B8/B10/B11/B12. **[v1.3]** `lineage_review_required` (B8) and `record_fingerprint_matches` (B12) are parity-tested over generated ledgers that include merges (T-DB-17, T-LIN-24, T-FPR-08). **[v1.4]** `class_binding_matches` is parity-tested independently, including the case where `record_fingerprint_matches` is (wrongly) `true` (T-FPR-11). B9 duplicates the TS allow-list invariant (01 §5.8) in SQL and is parity-tested against it.

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
| S1 | Newest record's fingerprint ≠ instrument's cached fingerprint, **or** [v1.4: F29] the record's `asset_class_at_record` ≠ the asset's live `asset_class` — **either or both**, **and** a verified `class_correction_marker` explains the divergence (§5.3) | **Expected governed state** (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`) | **No hold.** Count and list in `ast1.integrity.sweep_completed`; informational `ast1.integrity.class_correction_reclassification_pending` (M). The instrument is `NOT_ASSESSED` until a new governed classification |
| S2 | Same divergence (fingerprint, class binding, or both), **no** verified marker | **Unexplained drift** (integrity failure) | `SYSTEM` hold `IDENTITY_DRIFT` (fingerprint) or `ASSET_CLASS_DRIFT` (class binding only) as applicable; critical `ast1.instrument.identity_drift_detected` (unchanged v1.2 behaviour, extended to the class-binding case) |
| S3 | A marker whose governing change is not an `applied` `ASSET_CLASS_CORRECTION` for the marker's asset and (from, to), or whose fingerprints do not chain to the instrument's current record | Marker does not verify ⇒ treated as **no marker** | as S2, plus `ast1.integrity.registry_tamper_suspected` |
| S4 | Cached fingerprint ≠ fingerprint recomputed from the live identity columns (TypeScript recompute) | Unexplained | as S2 (v1.2 T-INT-01) |
| S5 | **Lineage review (F27).** A current real `NON_SECURITY` instrument for which the sweep's own computation of `lineage_review_required` (§7, clauses (a) and (b)) is true, and: **(i)** SQL `authoritative_state().lineage_review_required` is false (divergence), **or (ii)** it has an outstanding token (revocation missed), **or (iii)** the triggering merge or `SECURITY` record has no `applied` governed change, or its propagation audit event (`…security_determination_propagated`) is absent | **Gap** — a control failed | revoke any outstanding token; `SYSTEM` hold `LINEAGE_REVIEW_GAP`; critical `ast1.integrity.lineage_gap_found`. Applies to the **`OWN_LINEAGE` and `UNDERLYING_LINEAGE`** bases and to the **merge-introduced** case |
| S6 | Same instrument, (i)–(iii) all false: the requirement is **explained** (a governed record or merge is in the ledger, the SQL predicate agrees, no token is live) | **Expected governed state**, awaiting the elevated review | **No hold.** Informational `ast1.integrity.lineage_review_pending` (M) with the trigger (`SECURITY_RECORD` / `LINEAGE_MERGE`) and event sequence |
| S7 | A current real `NON_SECURITY` record whose merge tree or underlying tree holds `SECURITY` history that is **not** reflected in `elevated_basis` although the record's `global_seq` is later than that history (a non-elevated record appended after the fact) — **the defence-in-depth net for a would-be visibility gap [v1.4: F30.a] if the isolation assertion (`AS007`) were ever bypassed** | Gap (the record trigger failed) | `SYSTEM` hold `LINEAGE_REVIEW_GAP`; critical `lineage_gap_found` |
| S8 | `lineage_merge.merge_global_seq` not strictly greater than every `global_seq` / `merge_global_seq` committed before it on its trees, per-instrument `record_seq` order ≠ `global_seq` order, duplicate sequence values across records/merges/evidence/markers | Ledger-order break | critical `ast1.integrity.registry_tamper_suspected`; `SYSTEM` hold on every instrument of the affected trees |
| S9 | Canonical address (§2.1): any stored `TOKEN_CONTRACT` identity that is not a fixed point of **its own stored `canonicalisation_version`'s rule** [v1.4: F32.a — never "the current rule": an instrument's version is frozen once referenced], any cross-version collision group, a missing identity index | Identity | `SYSTEM` hold `IDENTITY_NOT_CANONICAL` / `IDENTITY_COLLISION` on each row; critical `ast1.integrity.address_canonical_violation` |
| S10 | Trigger and grant inventory: `trg_lineage_immutable`, `trg_deployment_environment_immutable`, the token, key-immutability and identity triggers exist and are enabled; no `UPDATE` privilege on `lineage`; `lineage.synthetic` agrees with every instrument's `declared_synthetic` and with both sides of every merge | Integrity | critical `ast1.integrity.registry_tamper_suspected`; `SYSTEM` hold on every instrument whose lineage row disagrees |

The explained/unexplained split is deliberate: a **governed** state (a correction awaiting reclassification; a lineage awaiting elevated review) must not be mislabelled as an integrity attack and must not force a second, unrelated maker-checker (hold release) on top of the review that actually clears it, while a control that **failed** (unexplained drift, a live token on a review-required instrument, a divergence between two implementations) is exactly what a `SYSTEM` hold is for.

## 7A. Locking protocol, the global lock order, and the consumption, merge and correction transactions [v1.2: F18; v1.3: F26, F27; v1.4: F29, F30, F31]

**Principle.** The instrument row lock *is* the classification/hold/admission/operational lock for that instrument. Every writer of an eligibility input takes it `FOR UPDATE`; every reader that must be stable (mint, consume) takes it `FOR SHARE`. **[v1.4: F30.a] Reads are `READ COMMITTED`, and this is now an asserted precondition, not a documented assumption**: `authoritative_state()` and every lock helper raise `AS007` (`AST1_UNSUPPORTED_TX_ISOLATION`) if the session is not `READ COMMITTED` (§7). Correctness rests on the locks plus that assertion, not on `SERIALIZABLE`. **[v1.4: F30.c] Scope of the ordering guarantee.** Sequence order is proven to equal commit order **only** for a pair of events that (i) lock a common instrument, or (ii) are both serialised by the exclusive lineage gate (§below, level 0) — for example a real `SECURITY` record versus a sibling's later record, or two lineage-wide writers against each other. It is **not** a property of the sequence in general: two ordinary records or two evidence items on **different**, unrelated instruments can commit in either order relative to their sequence draws, and no security predicate in this pack compares such a pair. `class_correction_marker.marker_global_seq` participates in this guarantee only in the one case the pack actually uses it — comparing two markers **of the same instrument** (§5.3, "the newest marker explains the newest fingerprint"), which clause (i) already covers because the correction holds that instrument's lock throughout; a marker is never compared against a different instrument's events or against a gate-serialised event for a security decision. **[v1.3]** Two lineage-wide writers (a real `SECURITY` record, a lineage merge) and one asset-wide writer (`ASSET_CLASS_CORRECTION`) change the eligibility of instruments other than the one they are addressed to. They therefore take locks **above** the instrument level, and every path in the module is placed in one total order below.

### Global lock order (v1.3) — a transaction may only acquire locks in this order, never backwards

| Level | Lock | Mode / who | Why it exists |
|---:|---|---|---|
| **G** | `governed_change` row of the change being applied | `FOR UPDATE`; **apply transactions only**, first | Serialises a double apply; the change row is then updated to `applied` (already held). External calls (IAM-02 `execute-verify`) complete **before** level 0 is taken, so no gate, asset or instrument lock is ever held across a remote call; the `payload_hash` and every precondition are re-verified under the locks |
| **0** | `ast1.lineage_gate` (singleton row) | **`FOR SHARE`** by every classification-record writer and every classification-evidence writer; **`FOR UPDATE`** by the two lineage-wide writers (real `SECURITY` record apply, lineage merge apply) | Makes "which instruments can gain or lose `SECURITY` history" **stable** while a lineage-wide writer holds it: no instrument can receive a first record, no evidence can be added, and no other lineage-wide event can draw a sequence value, during the window. Hence sequence order = commit order for every pair of events **that share the gate or an instrument** (the exact scope stated above, INV-21/INV-25) — not a claim about unrelated events. *Optimisation left to implementation:* per-tree locks may replace the global gate only if a proof of the same property is recorded; the blueprint fixes the global gate as the normative default because classification writes are rare, governed events |
| **1** | `ast1.asset` row | **`FOR UPDATE`** by every asset-class writer (`ASSET_CLASS_CORRECTION`; a class edit while no instrument exists); **`FOR SHARE`** by the first/any instrument insert (`trg_instrument_asset_lock`) | Removes the class/form race with the first instrument insert (§4.1). Instrument inserts do not exclude each other |
| **2** | `ast1.instrument` rows | **ascending `instrument_id`**; `FOR UPDATE` for writers, `FOR SHARE` for mint and consume | The classification/hold/admission/operational lock, as in v1.2 |
| **3** | `ast1.eligibility_decision_token` rows | `FOR UPDATE` on consume; `UPDATE` on revoke | As in v1.2: instrument before token |
| **4** | append-only inserts (`classification_record`, `classification_evidence`, `lineage_merge`, `class_correction_marker`, `eligibility_decision_log`, holds, audit outbox) | no row lock others wait on | — |

Within a level a transaction takes several locks in ascending key order (`instrument_id`, `token_hash`); a level is never re-entered after a higher level has been taken, except the idempotent re-lock of a key the transaction already holds. **[v1.5: F34] The tracker, mechanically defined.**

- **Transaction-local state, exactly.** Every tracked value is set with `set_config('ast1.…', value, true)` — the third argument `is_local = true` is what makes it transaction-local. Such a value **disappears/reverts automatically** at `COMMIT` and at `ROLLBACK`; a `ROLLBACK TO SAVEPOINT` reverts it together with every row lock taken since that savepoint, because both are ordinary transaction/subtransaction state to PostgreSQL — the tracker and the actual row locks always agree, by construction, with no separate bookkeeping to keep in sync. No pooler action and no `BEGIN` are needed or relied on to reset it: a new transaction on the same session simply has never set these keys. **[v1.6: F38 — corrected `current_setting` semantics.]** `current_setting('ast1.…', true)` returns **`NULL`** for a genuinely fresh/unset key that this session has never placed a value for, and returns `''` only after an earlier `set_config` in this session created the placeholder and a later revert (transaction/subtransaction end) cleared its value back to empty — the two are different PostgreSQL states, not the same string. Every helper's parsing rule is: **`NULL` or `''` both mean "nothing held / empty tracker"** — no helper depends on one representation over the other, and none casts the raw result to a non-text type before checking for both (a helper that cast `''::bigint` directly would fail on the fresh-session case, since `''` never actually occurs there — only `NULL` does — but a helper that checked only for `''` and treated `NULL` as "zero" or "unset in a different sense" would be the one at risk of a three-valued-logic slip; v1.6 states the rule exactly so neither mistake is made). This is also what a connection-pool session-mode reuse or PgBouncer transaction-mode reuse produces — no special-case handling is needed either way, and no state ever leaks from one transaction into the next.
- **What is tracked.** The **highest lock level** reached in the transaction (`G`/`0`/`1`/`2`/`3`); the **lineage-gate mode** held, if any (`SHARE`/`EXCLUSIVE`); the **set** of asset ids held, each with its mode (`SHARE`/`UPDATE`); the **set** of instrument ids held, each with its mode (`SHARE`/`UPDATE`); the **highest `instrument_id`** successfully acquired at level 2 in this transaction (the intra-level ascending-order guard, rule 19/F31); and, where the implementation's lock-helper architecture tracks tokens explicitly, the set of `token_hash` keys held. The tracker knows the **set** of held instrument ids (and their modes), not only the last one — this is what makes the idempotent-re-lock and upgrade rules below decidable at all.
- **Lock strength.** `SHARE < UPDATE` (PostgreSQL `FOR SHARE` / `FOR UPDATE` on the same row). A request for a key is classified against what the tracker already shows for that exact key:
  1. **Held at the same mode.** Return immediately. **No** `SELECT … FOR …` is issued, and the tracker is not touched (there is nothing new to record).
  2. **Held at a stronger mode.** Return immediately, on the same terms — a caller holding `UPDATE` on a row that then asks for `SHARE` is already satisfied; no new statement, no tracker change.
  3. **Held at a weaker mode, stronger now requested.** **Fail `AS006`** before any new lock statement is issued. In-transaction lock **upgrade is never permitted** by AST-01's protocol (two transactions each holding `SHARE` and both then asking for `UPDATE` is exactly the two-sharer deadlock pattern this refusal exists to prevent). Writers must request the strong mode **first**: a writer never calls `authoritative_state()` (`FOR SHARE`) before `lock_instrument()` (`FOR UPDATE`) on the same row in one transaction, and never places an evidence insert (gate `SHARE`) ahead of a real-`SECURITY` record (gate `EXCLUSIVE`) in one transaction. Where a path's natural order would need `SHARE → UPDATE`, the path is reordered to take `UPDATE` first (below).
- **Multi-row set lock** (a lineage-wide or asset-wide writer locking many instrument ids at once): (1) deduplicate the requested ids; (2) sort ascending; (3) remove every id already held at the requested mode or stronger (rule 1/2 above, applied per id — this is what makes a re-lock of an already-held subset free); (4) if nothing remains, return success (a pure re-lock, e.g. a trigger re-locking a set the application already locked); (5) otherwise the **smallest remaining (new) id must be strictly greater than the highest new id previously acquired at level 2 in this transaction** — if not, **`AS006` before any database row-lock statement is attempted**, not after a wait; (6) acquire every remaining id `FOR UPDATE` ascending, one statement per id (or a single `ORDER BY … FOR UPDATE` scan, equivalently); (7) update the held-set and the highest-new-id marker **only after** every acquisition in the batch has actually succeeded — a batch that fails partway (lock timeout, `AS006` from a nested call) leaves the tracker exactly as it was before the batch, matching that no row lock was actually gained by the failed member and every prior member's lock is still held (PostgreSQL does not release earlier row locks on a later statement's failure within one transaction; only a full transaction or subtransaction rollback does, which is covered by the transaction-local semantics above). Requesting an already-held **lower** id after a higher one is legal (it is dropped in step 3, never reaches step 5); requesting a **new** lower id after a higher one is the exact case step 5 is written to refuse.
- **Re-lock sites, enumerated (every one is either idempotent because the row is already held, or itself follows the total order and is a genuine new acquisition):** the application's set lock at a writer's start, followed by that writer's own trigger re-locking the same set (real `SECURITY` apply's record-insert trigger 2(c); lineage merge's `trg_lineage_merge_apply` step 6; `ASSET_CLASS_CORRECTION`'s per-instrument fingerprint `UPDATE`s, each of which fires `trg_instrument_lock_on_write` → `lock_instrument()`, and — **[v1.5: F33]** `trg_asset_class_frozen` branch (b)'s own `lock_asset_instruments()` call, ahead of the application's step-3 locks or after them depending on which writer reaches the row first); `authoritative_state()`'s `FOR SHARE` read from inside a writer that already holds `FOR UPDATE` on the same row (rule 2, above); the token-consume trigger's re-lock of the instrument at level 2 after the token lock at level 3 (a re-lock of a row already held `FOR SHARE` from the consume protocol's own step 2); every hold/admission/custody/operational-state writer's `lock_instrument()` call, which is a fresh acquisition unless the same transaction already holds the row; case submit's identity-lock `UPDATE`, which is the transaction's first and only level-2 acquisition on its own instrument; the integrity sweep's multi-instrument `SYSTEM`-hold placements, which are required to lock ascending in one pass (like any other multi-row set lock) or to use one transaction per instrument — never an unordered acquisition across several instruments in one transaction; and — **[v1.6: F37/F38, new]** — the **underlying-link insert**'s helper-managed lock of **both** endpoints (source and target instrument ids, ascending) before the row is inserted (below, "Underlying link insert"), which is a genuine new acquisition on each id the transaction does not already hold, and an idempotent no-op on either id it does.
- **`authoritative_state()` and lock order.** If the calling writer already holds `UPDATE` on the instrument row, `authoritative_state()`'s internal `FOR SHARE` read is satisfied immediately by rule 2 (no new statement). If a path's natural call order would need `authoritative_state()`'s `SHARE` **before** the writer's own `UPDATE`, the path is reordered so the `UPDATE` (`lock_instrument()`) is taken first and `authoritative_state()` is called afterwards, from inside the same transaction, where its `SHARE` request is then a same-key no-op rather than an upgrade.
- **Savepoint semantics, worked through.** `BEGIN; lock A; SAVEPOINT s; lock B; ROLLBACK TO s;` — after the rollback, PostgreSQL has released row lock B (savepoint rollback releases locks acquired since the savepoint) and the tracker's record of B (added via `set_config(…, true)` inside the now-rolled-back subtransaction) reverts with it, because `is_local` settings are themselves subtransaction-scoped state; the tracker's record of A, set before the savepoint, is untouched. Locking a valid next row (for example, some `C > A`) afterwards behaves exactly as if B had never been requested: the highest-new-id marker is still at A's value, so `C > A` succeeds normally. **Transaction-mode connection pooling** (e.g. PgBouncer in transaction mode) carries no tracker state across transaction boundaries either, for the same reason: the state lives inside the PostgreSQL transaction/session's local settings, and a pooler that hands the physical connection to a different logical transaction after `COMMIT`/`ROLLBACK` inherits no `is_local` state from the one before it.
- **Privilege note (unchanged):** PostgreSQL requires `UPDATE` privilege to lock a row `FOR SHARE/UPDATE`; `ast1_app` therefore holds `UPDATE` on `instrument`, `asset`, `governed_change` and a column-level `UPDATE` on `lineage_gate.lock_token` only, while the immutability triggers reject any actual data change (a lock statement fires no `UPDATE` trigger).
- **Tracker scope — stated explicitly [v1.6: F38].** The tracker described above governs locks acquired **through the named AST-01 lock helpers only** (rule 22, §1). The PostgreSQL executor and constraint machinery also take locks the tracker never records: an `UPDATE`'s own tuple lock on the row it writes; a `FOREIGN KEY` reference's `FOR KEY SHARE` on the row it points to (taken by the executor when the referencing row is inserted or its FK columns change); and index/unique-constraint locking during insert. For each such implicit lock, one of two things is true, and this pack does not call an implicit lock "tracked" when it is not: **(A) already subsumed** — the transaction independently holds a stronger helper-taken lock on the same row for the whole window the implicit lock exists (for example, `trg_instrument_lock_on_write`'s `UPDATE` tuple lock on the instrument row it is itself updating, where `lock_instrument()` already holds `FOR UPDATE` on that same row before the statement runs); or **(B) unsupported / raw**, where safety relies on PostgreSQL's deadlock detector aborting one side rather than on the tracker ordering anything (the raw-SQL consume path, below, and — before v1.6's target-lock fix — the underlying-link insert's FK `KEY SHARE`s, now (A) instead of (B) for the reason given next).

**Why instrument before token (unchanged from v1.2).** The recommended review sequence starts with the token row. That order **inverts** against every mutator that must revoke tokens: a mutator holding an instrument lock then needs the token rows, while a consumer holding a token row then needs the instrument lock — a deadlock. The coherent order takes the instrument first everywhere. The token's `instrument_id` is immutable after mint (trigger), so reading it *unlocked* to find which instrument to lock cannot be stale. **Why gate and asset above the instrument (v1.3).** A lineage-wide or asset-wide writer must know its full set of instruments before it locks them; locking that set requires the set to be stable, which requires a lock **above** it. No path acquires level 0 or 1 while holding level 2 or 3, so adding them creates no inversion with the accepted v1.2 order (instrument(s) first, then token(s)), which is preserved without change.

### Who takes what (every writer; none unspecified)

| Path | Lock sequence | Notes |
|---|---|---|
| Classification record append, non-`SECURITY` (or synthetic) | G → 0 `SHARE` → 2 `X` (its instrument) → 3 (revoke tokens if it narrows) → 4 | trigger 2 enforces 0 and 2 |
| Classification evidence insert | 0 `SHARE` (real) → 2 `X` (the case's instrument) → 4 | draws `evidence_global_seq` (§5) |
| **Case submit** [v1.4: F31] | 2 `X` (its own instrument, to identity-lock it and stamp `follows_event_*` best-effort from the ledger) → 4 (case row) | No gate: the stamped `follows_event_*` is advisory — `apply` (below) recomputes the floor under the gate and refuses a stale binding (`binding_stale`), so submit's read needs no stronger guarantee |
| **Real `SECURITY` record apply** | G → 0 **`X`** → 2 (the **full** affected set — the instrument **and** every sibling/wrapper — derived under the gate, **then locked together, ascending, in one pass; never the instrument first**) → 3 → 4 | `lock_affected_instruments` (§5.1 trigger 2, reordered [v1.4: F31] to close the inversion against `ASSET_CLASS_CORRECTION`/retirement, §"Cycle analysis" below) |
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
| **Underlying link insert (`INSTRUMENT` kind)** [v1.6: F37/F38, new] | 2 `X` (source **and** target instrument ids, both `FOR UPDATE`, canonical ascending `instrument_id` order, via `lock_instrument`/`lock_instruments`) → (new row; FK `KEY SHARE`s on both, already self-held `FOR UPDATE`) → 4 | §"Underlying link insert" below. No gate: a link is not a lineage-wide event (it cannot join security history late, by construction, F37) |

### Cycle analysis (v1.4: F31 — corrected)

The waits-for graph is acyclic on the protocol path because **every arrow above goes from a lower level to a higher level or stays within a level in ascending key order**: no path takes G, 0, 1, 2, 3 out of that order, and **[v1.4]** no path acquires a level-2 lock, releases nothing, and then acquires a *lower* `instrument_id` than one it already holds (enforced by the intra-level guard, above) — this is the condition the v1.3 text asserted without it actually holding for the real-`SECURITY`-apply row, which locked its own instrument (an arbitrary point in the ascending order) before the rest of its set. With the reorder (§"Who takes what"), the claim "two writers on overlapping instrument sets: ascending order in both" is now true for **every** listed writer, including the two lineage-wide/asset-wide writers against each other. Checked pairwise for the listed participants — classification writer, hold, admission, custody, operational state, lineage merge, `ASSET_CLASS_CORRECTION`, evidence-standard retirement, token consume, token revoke, first instrument insert:

| Pair that could conflict | Shared resources | Outcome |
|---|---|---|
| lineage merge ↔ classification writer | gate (`X` vs `SHARE`), then instrument | serialised at level 0; whichever starts second waits, no cycle (both then descend) |
| lineage merge ↔ lineage merge / real `SECURITY` apply | gate `X` | strictly serial |
| lineage merge ↔ mint / consume / hold / admission / custody / operational | instrument rows (merge ascending `X`; others one row) | at most one instrument lock is held by the others, and they take nothing at levels below 2 while holding it, so no cycle; the merge may wait for a mint/consume to finish, and a later mint sees the merge |
| `ASSET_CLASS_CORRECTION` ↔ first instrument insert | asset row (`X` vs `SHARE`) | serialised at level 1 |
| `ASSET_CLASS_CORRECTION` ↔ classification writer | instrument rows (the correction takes them all, ascending; the writer takes one) | serialised at level 2; the correction never holds a gate, so it cannot wait on the writer's gate |
| `ASSET_CLASS_CORRECTION` ↔ lineage merge | instrument rows | both ascend; no cycle |
| **`ASSET_CLASS_CORRECTION` ↔ real `SECURITY` apply** [v1.4: F31 — the missing pair] | instrument rows of the asset (correction: every instrument of the asset, ascending, from step 3; real-`SECURITY` apply: the full affected set — which may include instruments of this asset as siblings/wrappers — ascending, from the reordered §5.1 trigger 2) | **Now provably no cycle**: both acquire their whole respective sets purely ascending, in one pass, with neither locking a member of the other's set "out of turn" first. Before the v1.4 reorder this pair was omitted from the table and could deadlock (the real-`SECURITY` apply's self-first instrument lock could be a *lower* id than one the correction had already taken ascending) |
| **evidence-standard retirement ↔ real `SECURITY` apply** [v1.4: F31 — the missing pair] | instrument rows (retirement: every affected instrument, ascending; real-`SECURITY` apply: its full set, ascending) | Same reasoning: both ascend purely, no cycle |
| `ASSET_CLASS_CORRECTION` ↔ mint / consume / hold / admission | instrument rows | as above |
| token consume ↔ token revoke (any writer) | instrument (`SHARE` vs `X`) then token | the consumer takes the instrument first; the revoker holds it `X` first, so the consumer waits and then sees the revocation |
| two writers on overlapping instrument sets | instrument rows | ascending order in both, **with no writer locking one member of its set before deriving the whole set** (the property the v1.4 reorder establishes); PostgreSQL never sees `A→B` against `B→A` |
| first instrument insert ↔ classification writer | none shared until the instrument exists | independent |
| **underlying link insert ↔ `ASSET_CLASS_CORRECTION` / real `SECURITY` apply / any other instrument-set writer** [v1.6: F37/F38 — the pair the round-6 review found unlisted and deadlock-prone under `FOR KEY SHARE` (`04-review-r6.md` §9)] | instrument rows (link insert: source and target, ascending, `FOR UPDATE`; the other writer: its own set, ascending, `FOR UPDATE`) | **No cycle**: the link insert now takes `FOR UPDATE` on both endpoints **before** the FK's own `FOR KEY SHARE` fires (the FK checks a row this same transaction already holds `FOR UPDATE`, so the FK acquisition is free), and it ascends exactly like every other listed writer. This removes the v1.5 "hidden edge" (FK `KEY SHARE` racing a helper's `FOR UPDATE`): the link insert no longer leaves the module's one instrument-set writer without a lock-order story of its own |

The one remaining out-of-order path is the **raw-SQL consume** (below): unsupported, fail-closed on deadlock. `lock_timeout` bounds every wait (≤ 5 s).

**Lock-set re-derivation (review §7 note, folded in).** A lineage-wide or asset-wide writer enumerates its affected set **after** taking levels G/0/1 (where the set of *classified* instruments cannot change: classification and evidence writers wait on the gate; instrument inserts wait on the asset row), locks it ascending, **re-derives it once every lock is held, and raises `AS006` / `AST1_LOCK_SET_CHANGED` (the transaction rolls back and the apply is retried) if the set grew.** An instrument that exists without a record at that moment has no token and nothing to narrow, and cannot obtain a record until the gate is released, at which point its first record sees the committed ledger.

### Lineage merge apply — one transaction [v1.3: F27; reordered v1.4: F30.b]

The application takes its locks in the **same order the trigger now enforces** (§3): the gate first, root resolution and cycle/compatibility checks only under it.

1. **G:** lock the `governed_change` row; IAM-02 `execute-verify` bound to the recomputed `payload_hash`; require IAM-02-attested approvers satisfying `COMPLIANCE_OFFICER` with `maker ∉ approvers` (as every apply, 04 §3). No level 0–3 lock is held during this call.
2. **Level 0:** `lock_lineage_gate_exclusive()`. **[v1.4: F30.b] Taken before any root or cycle decision below.**
3. **Resolve, under the gate,** the lineage roots of the two arguments (`lineage_root(...)`, which itself fails closed on a cycle or malformed ancestry, §3); require both to resolve to a definite, distinct root and `lineage.synthetic` equal on both. If the arguments now resolve to **one** root — because a concurrent merge committed and joined them while this transaction waited for the gate — refuse (`AS004`): this is what stops two racing opposite merges from ever forming a cycle (§3).
4. **Level 2:** enumerate the **affected instruments** — every instrument whose asset lineage lies in either (now-resolved) merge tree, plus every instrument whose transitive underlying chain reaches an instrument of either tree (wrappers, transitively, depth ≤ 8) — and lock them `FOR UPDATE` in ascending `instrument_id`; re-derive; `AS006` if the set grew.
5. **Authorised.** Only now, with the change verified, the gate held and every affected instrument locked, is the merge applied: mark the change `applied`, then `INSERT lineage_merge`. `trg_lineage_merge_apply` (§3) re-runs the same gate/root/lock sequence (a no-op re-lock on the protocol path) and assigns **`merge_global_seq`** from `ast1.classification_global_seq`; the caller cannot supply it.
6. **Identify the narrowed instruments.** Evaluate `lineage_review_required` (§7) — the same function B8 and the TypeScript conjunct use — for every affected **real** instrument. The narrowed set is every instrument for which it is now true, which is exactly the set whose current record predates the security history the merge introduced (older `SECURITY` joined to newer `NON_SECURITY`, the reverse, and wrappers through their underlying trees). Instruments for which it was already true stay true.
7. **Level 3 — revoke** every outstanding (unconsumed, unrevoked) token of every narrowed instrument (`revoked_reason = lineage_security_determination`).
8. **Audit, same transaction (outbox):** `ast1.lineage.merged` (critical; metadata: both roots, `merge_id`, `merge_global_seq`, `change_id`), `ast1.lineage.security_determination_propagated` (critical; `trigger = MERGE`, narrowed count and ids, wrapper ids) and `ast1.eligibility.instrument_revoked` per instrument.
9. **COMMIT.** From the commit onward every narrowed instrument derives `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` and SQL rule B8 denies. **The merge itself narrows; nothing later — no sweep, no second transaction — is required for safety.** Any token that somehow survives is rejected at consumption (B8 inside `assert_token_consumable`), which is tested by forcing the consume in SQL (T-LIN-19).

A failure at any step rolls back the whole transaction (no merge row, no revocation, no event); the change stays `requested` and the apply is retriable with a fresh IAM-02 approval, as for every apply.

### Asset class correction apply — one transaction [v1.3: F26; v1.4: F29; v1.5: F33]

1. **G:** lock the `governed_change` row; IAM-02 `execute-verify`; require the approvals of §4.1 (≥ 2 attested approvers, `COMPLIANCE_OFFICER` + `MLRO`, when leaving `SECURITY`/`SECURITY_TOKEN`; maker ≠ checker). No level 0–3 lock is held during this call.
2. **Level 1:** `SELECT … FROM ast1.asset WHERE asset_id = $a FOR UPDATE`. Instrument inserts on this asset now wait; any in flight has finished.
3. **Level 2:** enumerate **every instrument of the asset** (all lifecycle statuses) and lock them `FOR UPDATE` in ascending `instrument_id` (`lock_asset_instruments`); re-derive; `AS006` if the set grew (it cannot, unless level 1 was bypassed).
4. Re-verify preconditions under the locks: `(from, to)` equals the asset's current class and the change payload; the correction does not cross the FIAT boundary once an instrument exists; the approval strength required by the direction.
5. Mark the change `applied`; `UPDATE asset SET asset_class` — **[v1.5: F33]** `trg_asset_class_frozen` branch (b) itself re-locks every instrument of the asset (`lock_asset_instruments`, a no-op re-lock here since step 3 already holds them) **before** permitting this statement, so the property "every instrument is locked before the class changes" holds even if a caller reached this `UPDATE` without having done step 3 itself — **this single statement is what B12's `class_binding_matches` compares against from now on, independently of everything below** [v1.4: F29]; recompute and `UPDATE` each instrument's cached `identity_fingerprint`; `INSERT` one `class_correction_marker` (§5.3) per instrument that has a record (`marker_global_seq` drawn now, after the locks). The deferred constraint (§4.1) rejects a commit in which the fingerprint write did not actually change the cached value or the marker does not chain to it.
6. **Level 3 — revoke every outstanding token of every instrument of the asset** (`revoked_reason = asset_class_corrected`). Product admissions, custody rows and attestations are not edited: they are bound to the old record and are now unusable because B12 denies any action that relies on it.
7. **Audit, same transaction:** `ast1.asset.class_corrected` (critical; metadata: asset, from, to, change id, instruments, marker ids), `ast1.eligibility.instrument_revoked` per instrument. **No `SYSTEM` hold is placed**: the change is governed and expected; the instruments are `NOT_ASSESSED` (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`), which is not an integrity finding.
8. **COMMIT.** From the commit onward SQL rule B12 denies every allow-insert, consumption, admission approval and attestation that relies on the pre-correction record. **[v1.4: F29] This no longer depends on step 5's fingerprint recompute having been implemented correctly**: `class_binding_matches` compares the record's stamped `asset_class_at_record` against `asset.asset_class`, which step 5's `UPDATE` unconditionally changed — the same statement that *is* the correction — so B12 denies through this path even if the fingerprint half of step 5 has a defect. Correction **into** `SECURITY`/`SECURITY_TOKEN`: the stale `NON_SECURITY` record is unusable by SQL, and SQL accepts a new classification only as `SECURITY` or `UNRESOLVED` (trigger 6). Correction **out of** it: the previous `SECURITY` record remains in the lineage ledger, so `elevated_basis ∋ OWN_LINEAGE` and any new `NON_SECURITY` classification requires the elevated path (two attested checkers, review-floor evidence, binding); B1 keeps denying MB/PSO subjects on the stored `SECURITY` outcome in the meantime.

Eligibility returns **only** through a new governed classification record whose `identity_fingerprint` equals the instrument's corrected fingerprint (`record_fingerprint_matches` becomes true) **and** whose `asset_class_at_record` — stamped by trigger from the asset's now-current class — equals `asset.asset_class` (`class_binding_matches` becomes true) [v1.4: F29]. Both conditions are satisfied automatically by an ordinary new record (§5.1 triggers 4), so no extra application step is needed; but **either** one alone continuing to fail keeps B12 denying. Nothing else — no hold release, admission, marker deletion (impossible), flag or role — restores it.

### Underlying link insert — one transaction [v1.6: F37, F38 — new]

An `INSTRUMENT`-kind `instrument_underlying` insert (04 `POST …/instruments/{id}/underlyings`) is a governed lock-order path in its own right, not the raw FK-only path v1.5 left it as:

1. **Assert `READ COMMITTED`** — the same first-statement precondition as every other lock helper (§7, `AS007`).
2. **Resolve** the source instrument id (the path parameter — the linking, currently-`DRAFT` instrument) and the target instrument id (the request body's `underlying_instrument_id`), unlocked (both ids are immutable once assigned, so an unlocked read of "which two rows" cannot be stale).
3. **Lock both endpoints via the helper**, `lock_instruments({source, target})` (§7A "Multi-row set lock"), `FOR UPDATE`, in **canonical ascending `instrument_id` order** — the same helper and the same ordering rule every other multi-row acquisition in this module uses. A self-link (`source = target`) is already rejected by the table's own `CHECK`, so the set always has exactly two distinct members here. No raw `SELECT … FOR UPDATE` is issued outside this helper call (rule 22, §1).
4. **Require source = `DRAFT`** (unchanged source rule, §4.3) — else `AST1_INSTRUMENT_IMMUTABLE_FIELD`-family refusal (the linking instrument's link set is already frozen).
5. **Require target ≠ `DRAFT`** (`IDENTITY_LOCKED` or `RETIRED`) — the new target rule (§4.3 `trg_underlying_target_locked`), checked **under the target's own lock just taken in step 3**, so a concurrent identity-lock or retirement of the target cannot race this check: whichever of "the target's status changes" and "this insert's target-status read" happens first is fully ordered by the row lock, and the later one sees the committed result of the earlier — normal row-lock serialisation, no special-case reasoning needed.
6. **Verify real/synthetic compatibility** (`trg_underlying_same_kind`, unchanged) and **verify no cycle** / depth ≤ 8 (`trg_underlying_no_cycle`, unchanged).
7. **Insert** the `instrument_underlying` row. The two FK checks (`instrument_id`, `underlying_instrument_id` → `ast1.instrument`) each take `FOR KEY SHARE` on a row this same transaction already holds `FOR UPDATE` (step 3) — the executor's implicit lock is free, not a new wait, and creates no edge another transaction could wait on (§7A "Tracker scope").
8. **Audit**, same transaction: `ast1.instrument.underlying_linked` (metadata: source, target, `underlying_type`, target's lifecycle status at link time).

No gate is taken: unlike a real `SECURITY` record or a lineage merge, a link insert cannot join security history to an already-classified instrument late (that is exactly what step 5 forecloses), so it is not a lineage-wide event and needs no lineage-wide serialisation.

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
| SQL rule B12 at consumption (the token's instrument had its class corrected, or its cached fingerprint no longer matches the token's record) **[v1.3: F26; v1.4: F29]** — denies whether the correction writer updated the cached fingerprint correctly or not, because `class_binding_matches` reads the live `asset.asset_class` | steps 6–7 | `AST1_DECISION_STALE` | the correction transaction already revoked the token (`asset_class_corrected`); if it is somehow still live: revoke; **no `SYSTEM` hold when `drift_explained_by_correction`**, a `SYSTEM` hold (`BACKSTOP_TRIPPED`) when the drift is unexplained; audit |
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

`instrument (asset_id)`, `asset (lineage_id)`, `classification_record (instrument_id, record_seq DESC)`, `classification_record (lineage_id, outcome, global_seq)`, `instrument_underlying (underlying_instrument_id)` (reverse traversal for the affected set), `eligibility_decision_token (instrument_id) WHERE consumed_at_utc IS NULL AND revoked_at_utc IS NULL`, `classification_case (instrument_id, state)`, `product_admission (instrument_id, product)`, `instrument_hold (instrument_id) WHERE status='ACTIVE'`, `eligibility_decision_log (instrument_id, decided_at_utc)`, `governed_change (target_type, target_id)`, **[v1.3]** `lineage_merge (merged_lineage_id)`, `lineage_merge (surviving_lineage_id)`, `lineage_merge (merge_global_seq)`, `classification_record (outcome, global_seq) WHERE outcome = 'SECURITY_OR_SECURITY_TOKEN'` (the security-event scan of §7), `classification_evidence (case_id, evidence_global_seq)`, `class_correction_marker (instrument_id, marker_global_seq DESC)`, `instrument (asset_id)` (asset-wide enumeration), **[v1.4]** `securities_market_admission_attestation (instrument_id, admission_ref, attestation_seq DESC)` (the "newest wins" lookup, F32.b), `classification_record (instrument_id, asset_class_at_record)` (B12 class-binding scan, F29). **[v1.5]** `address_rule_version (address_format, canonicalisation_version)` (PK, the registry lookup, F32.a), `address_rule_vector (address_format, canonicalisation_version, vector_id)` (PK, the assertion function's vector scan, F32.a), `securities_market_admission_attestation (instrument_id, admission_ref, status) WHERE status = 'WITHDRAWN'` (the F35.a terminal-check lookup).

## 10. Privileges

| Object | `ast1_app` |
|---|---|
| `network_registry`, `deployment_environment` | `SELECT` only (no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`; `deployment_environment` is additionally trigger-immutable for every role, §2) |
| `classification_record`, `classification_evidence`, `eligibility_decision_log`, `lineage_merge`, `securities_market_admission_attestation`, **`class_correction_marker`** [v1.3: F26] | `INSERT, SELECT` only |
| **`lineage`** [v1.3: F28.c] | `INSERT, SELECT` only — **no `UPDATE`**, no `DELETE`, no `TRUNCATE`; additionally trigger-immutable for every role (§3) |
| **`lineage_gate`** [v1.3: F27] | `SELECT` and column-level `UPDATE (lock_token)` — needed only to take the row lock; any actual change is rejected by trigger |
| `network_registry` address rules [v1.3: F28.a] | `ast1.canonicalise_address` / `address_rule_supported` are owned by the migration role; the runtime role has `EXECUTE` only |
| **`address_rule_version`, `address_rule_vector`** [v1.5: F32.a] | Migration role: `INSERT, SELECT` only. Runtime role: `SELECT` only. Both additionally trigger-immutable for every role, including the migration role and the table owner (§2.2) |
| `eligibility_decision_token` **[v1.2: F18]** | `SELECT, INSERT`; column-level `UPDATE (consumed_at_utc, revoked_at_utc, revoked_reason)` only — no `UPDATE` on any binding column, no `DELETE` |
| `evidence_standard` | `SELECT`; status change via governed apply path |
| other tables | `SELECT, INSERT, UPDATE` — no `DELETE` anywhere; key-column `UPDATE`s are rejected by trigger regardless of grant (§6). `asset`/`instrument` lineage- and identity-critical columns likewise (§4) |
| any `iam2.*`, `cfg1.*`, `wlt1.*`, `clt1.*`, `kyc1.*`, `fnd.*` (beyond foundation outbox/idempotency objects granted to every service) | none (F3(c)) |

## 11. Data classification

Regulatory-critical, append-only: `classification_record`, `classification_evidence`, `eligibility_decision_log`, `governed_change`, `lineage_merge`, `class_correction_marker`, `lineage` (insert-only). Compliance configuration: admissions, holds, restrictions, jurisdiction rules, custody, standards, risk profile. Reference: `asset`, `instrument`, `issuer_reference`, `network_registry`, `lineage`. No client PII: `client_jurisdiction`/`client_class` in the log are attribute values with no client id.

## 12. Migration intent (not created here)

Sequenced by risk: (a) reference + `deployment_environment` (+ its immutability trigger) + **one immutable per-version canonicaliser function per registered `(address_format, canonicalisation_version)` pair, `ast1.function_definition_digest()`, `address_rule_version` (with `rule_function`/`function_definition_sha256`, database-derived), `address_rule_vector` (corrected valid/non-canonical/fixed-point model) and `ast1.assert_address_rules_frozen()` [v1.5: F32.a; corrected v1.6: F36]** + the `canonicalise_address`/`address_rule_supported` dispatchers (STABLE, registry-driven, no inline rule semantics) + the `network_registry` composite FK and `trg_network_registry_rule_ready` trigger **[v1.6: F36 — replaces the invalid v1.5 `CHECK…EXISTS`]** + **the P1-acceptance-gating automatic freeze-enforcement mechanism itself (a `ddl_command_end` event trigger, or the documented migration-runner fallback) [v1.6: F36 — not yet installed; a P1 acceptance criterion, not asserted as already live]** + lineage (+ `lineage` immutability, `lineage_gate`, `lineage_merge` with `merge_global_seq`, `lineage_root()`'s fail-closed cycle contract) + core (both canonical-identity unique indexes, the canonical-address CHECK, **`trg_underlying_target_locked` [v1.6: F37]**) + ledger (`global_seq`, the shared sequence, evidence sequence, **`classification_record.asset_class_at_record`** [v1.4: F29], **`ast1.attestation_seq`** [v1.4: F32.b]) + triggers (incl. the reordered `trg_lineage_merge_apply` and §5.1 trigger 2, F30.b/F31, **`trg_asset_class_frozen` branch (b)'s own `lock_asset_instruments()` call, `trg_attestation_binding`'s WITHDRAWN-terminal check [v1.5: F33, F35.a]**, and **the underlying-link insert protocol's helper-managed dual-endpoint lock [v1.6: F37/F38]**) + `authoritative_state` (incl. `record_fingerprint_matches`, **`class_binding_matches`**, `lineage_review_required` with the merge clause and the F37-stable `B(X)` reasoning, **and the `AS007` isolation assertion**)/`backstop_permits` (B1–B12, B12 now with the independent class-binding half)/`assert_token_consumable` + lock helpers **rebuilt on the mechanical transaction-local tracker of §7A [v1.5: F34], restored to helper-exclusive on levels 0–3, including a general ascending `lock_instruments()` multi-row helper [v1.6: F38]** (held-set per level/mode, idempotent re-lock, upgrade refusal, the intra-level ascending guard [v1.4: F31], correct `NULL`/`''` unset-key parsing [v1.6: F38]) + `class_correction_marker`; (b) conjunct tables (+ key-immutability triggers; `securities_market_admission_attestation.attestation_seq`); (c) governed change + decision log/token (+ token immutability/consumption triggers). Every migration in (a) that touches a per-version canonicaliser function, `ast1.address_rule_version`/`address_rule_vector`, `ast1.network_registry` or `ast1.instrument`'s identity columns is covered by the installed automatic freeze-enforcement mechanism above [v1.6: F36]. **No seed of any classification, any `APPROVED` evidence standard, or any instrument** except test fixtures created by the test harness.
