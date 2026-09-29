# 04 Review R7 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.6)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.6 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `292face` on `module/AST-01` (v1.6 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (R1 `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (R2 `REMEDIATE`) → `f769689` (v1.2) → `56b0d6d` (R3 `REMEDIATE`) → `b56950f` (v1.3) → `3c222f4` (R4 `REMEDIATE`) → `a33cc3d` (v1.4) → `32fadb0` (R5 `REMEDIATE`) → `bd753f8` (v1.5) → `3d1dc25` (R6 `REMEDIATE`) → `292face` (v1.6).
- **Reviewed against:** `04-review-r6.md` (primary: F36, F37, F38, F39; closed: F29, F30, F31 inversion, F32(b), F33, F35; external gates: F02, F05, F17, F21), and the v1.6 pack itself.
- **Not relied on:** `05-remediation-r6.md` (not read) and the v1.6 README "what changed" column. Every disposition below comes from the normative v1.6 text: 05 §§1, 2.1–2.2, 4.1–4.3, 5.1, 7, 7A, 10, 12; 01 INV-17/20/23/26, §§3.4, 3.6, 3.7, 4.7, 4.7A; 02 W1, W3, W11–W13; 04 §§2, 6, 8; 06 SM-1; 09; 10. Each was checked against PostgreSQL locking, MVCC, catalog, event-trigger and constraint semantics, and against a word-level diff of v1.5 → v1.6.

## Decision

# **REMEDIATE**

v1.6 does the hard part of each round-6 finding correctly:
- **F37 (the MEDIUM).** The target rule is the right design. The recursive proof holds on the protocol path, and the concurrency story for "target identity-lock vs link insert" is sound.
- **F39.** It is accurate everywhere.
- **F36.** The per-version function, the database-computed digest, the three-case vector model, the composite FK and the honest P1 enforcement criterion are all real progress.

The verdict cannot be `ACCEPT`:

| ID | Sev | Summary |
|---|---|---|
| **AST-01-F38** (carried) | LOW | **Still open.** Rule 22 restores helper exclusivity, but every raw-lock site the R6 review named is still written as raw `SELECT … FOR …` in the normative steps. That includes the correction's step 2, the one site that decides whether the trigger's asset re-lock is a no-op or a false `AS006`. The pack's own static-scan test T-LOK-07(m) would fail against the pack's own text. The asset re-lock is still missing from the re-lock enumeration. Two helper lists are stale, and one `AS006` row lacks case (4) |
| **AST-01-F40** (new, adjacent to F37) | LOW | Two premises of the F37 recursion are enforced only by workflow on the raw path. (i) The underlying-link trigger does not take the dual-endpoint lock itself, so the **source**-`DRAFT` check can race the source's identity lock. (ii) No SQL rule refuses a classification record on a `DRAFT` instrument, so "classified ⇒ non-`DRAFT`" is not a database invariant. Either one lets a basis tree grow after a record without SQL noticing. This is the F33 lesson ("SQL-enforced, not application discipline") not yet applied to F37 |
| **AST-01-F41** (new, supersedes F36) | LOW | The freeze boundary is incomplete. (i) The dispatcher's routing is not digest-frozen (only a one-time structural test), so V1 can silently adopt V2 semantics. (ii) The freeze machinery itself (digest helper, assertion) is outside both the frozen set and the event-trigger filter. (iii) The dependency closure of a per-version function is unconstrained, yet the pack claims the body hash catches "any edit, on any input". (iv) v1.6 put **STABLE, table-reading** functions inside `CHECK` constraints, a pattern PostgreSQL documents as unsupported (dump/restore). (v) The "required vector classes" are not machine-identifiable. (vi) The fallback gate still allows an author-maintained manifest |

- **No `SECURITY` → MB/PSO path exists.** B1 is textually unchanged and reads the stored outcome. F40 and F41 weaken defence-in-depth layers that sit under the protocol path.
- **None of these needs a human decision.**

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§15).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `292face` (local and `origin/module/AST-01`, after `git fetch`) |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34`, untouched |
| Diff `43f2f34..292face` | 13 commits, 99 files. Every changed path is under `docs/02_modules/AST-01/**` or `docs/03_implementation/tasks/AST-01/**`; **0 paths** outside |
| v1.0–v1.5 unchanged | `git diff <version commit> HEAD -- blueprint/v1.x` is empty (0 lines) for v1.0 `78ec1e4`, v1.1 `e20b8ca`, v1.2 `f769689`, v1.3 `b56950f`, v1.4 `a33cc3d` and v1.5 `bd753f8`. Each version directory (12 files) and each earlier review file has exactly one commit |
| v1.6 commit | Adds `v1.6/**` (12 files) and `05-remediation-r6.md`; edits the module README and `task.json` (title, findings summary, record paths, `updatedAt`) |
| Migration head | `platform/infra/migrations` holds 71 files, head `071_cfg1_environment_scope.cjs`. `migrate:up` is plain `node-pg-migrate -m infra/migrations --no-check-order up` with no post-migration hook. This matches the v1.6 claim (05 §2.2), which does **not** say a hook exists |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It resumes no authoring, remediation or earlier review session. Its only inputs were the task brief, the repository, and (read-only) the conductor's `validateTaskManifest`.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1–R6. The v1.6 author is `claude-sonnet-5` (per the `292face` trailer). The review is **context-independent but not model-family-independent** with respect to the earlier reviews.
- **Seams checked read-only.** `aix-conductor/dist/records.js` `validateTaskManifest(task.json)` ⇒ `{"ok":true,"errors":[]}`. The conductor repository was clean before and after.

## 3. Dispositions

### 3.1 Round-6 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F36** Canonicaliser-freeze mechanism | **SUPERSEDED BY NEW FINDING (AST-01-F41)** | §5. Required corrections 1–5 of R6 are each substantially done: per-version function, DB-computed digest, three-case vector model, FK + trigger, and an honest P1 criterion. The new design leaves the dispatcher, the freeze machinery and rule-function dependencies outside the frozen boundary. It also introduces table-reading functions inside `CHECK`, and it still overclaims ("any edit, on any input") |
| **F37** Late underlying link | **CLOSED IN BLUEPRINT** | §6. Option 1 is adopted. The recursion is proven for every graph mutation, and target-lock concurrency is deterministic. Two premises are enforced by workflow only on a raw path; that is carried as the new, adjacent **F40**, which does not reopen F37's protocol-path closure |
| **F38** Helper exclusivity | **STILL OPEN** | §7. Items 3 (`NULL`/`''`), 4 (tracker scope) and 5 (link insert in "Who takes what") are done; item 6 is done in the database-error table only. Items 1 (rewrite the raw sites as helper calls) and 2 (enumerate the trigger's asset re-lock) are **not done** |
| **F39** Security-reasoning precision | **CLOSED IN BLUEPRINT** | §8. (a), (b) and (c) are all correct and consistent across 01, 02, 05 and 12 |

### 3.2 Findings closed earlier (regression-checked)

| Finding | Result |
|---|---|
| **F29** Class binding independent of the cached fingerprint | **CLOSED, no regression.** B12 and `class_binding_matches` are textually unchanged. The B-table has no changed row in the v1.5 → v1.6 diff |
| **F30** Ordering and visibility | **CLOSED, no regression.** The `AS007` assertion still opens `authoritative_state()` and "every lock helper". The enumerated helper lists omit the new `lock_instruments`/`lock_token` (carried in F38) |
| **F31** Original self-first inversion | **CLOSED, no regression.** The real-`SECURITY` apply still derives its set under the gate and locks it ascending in one pass (05 §5.1 2(c); only the stability *reason* was rewritten) |
| **F32(b)** Attestation ordering | **CLOSED, no regression.** `attestation_seq` is unchanged |
| **F33** SQL-enforced correction locking | **CLOSED, no regression.** Branch (b)'s `lock_asset_instruments()` is unchanged. Its asset lock is still written raw (F38), which does not affect the instrument-locking property F33 established |
| **F35** `WITHDRAWN` terminal, `SEC(G)` exclusion, marker sequence | **CLOSED, no regression.** The exclusion wording is now identical in 01/02/05 (F39(c)) |

### 3.3 External gates

| Finding | Disposition |
|---|---|
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)) |
| **F17** Canonical identity (WLT-01) | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7)) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6) |

## 4. Non-negotiable property

A `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`. **Holds.**
- B1 reads the stored `latest_outcome`.
- `assert_token_consumable` (i)–(v) is unchanged.
- The v1.5 → v1.6 word diff removes no predicate from §7, from B1–B12 or from `lineage_review_required`. Removed text is only superseded mechanism description (F36), the false "record-less newcomer" reason (F37) and the "backstop, not the security control" sentence (F39).

---

## 5. F36 — per-version canonicaliser freeze

### 5.1 Architecture as written

- **Per-version functions.** 05 §2.1 defines one `IMMUTABLE` function per registered pair (e.g. `ast1.canonicalise_evm_hex40_v1(text)`).
- **Registry.** `address_rule_version.rule_function regprocedure` names that exact function, with `UNIQUE (rule_function)`.
- **Digest.** `function_definition_sha256` is computed by `trg_address_rule_version_digest` (`BEFORE INSERT`, always overwrites) through `ast1.function_definition_digest(regprocedure)`. That helper hashes `pg_get_functiondef()`, the identity/signature, and `provolatile`/`proisstrict`/`prosecdef`.
- **Dispatcher.** `canonicalise_address` is a `STABLE` dispatcher that resolves `rule_function` from the registry.

| Attack | Result |
|---|---|
| `CREATE OR REPLACE FUNCTION` on the V1 function, same name and signature, changed body | **Detected.** The body changes `pg_get_functiondef()`, so step 2's recomputed digest differs from the stored one. Under the event-trigger design the DDL transaction aborts |
| Migration supplies a digest on `INSERT` | **Overwritten** by the trigger. Existing rows are immutable (`AS002`, every role) and the PK blocks a second row. **The caller does not control the digest**, within the stated model (a table owner disabling triggers is the out-of-band DBA case S10 inventories) |
| `DROP` + re-`CREATE` under the same name | `regprocedure` records no `pg_depend` edge, so the drop succeeds and the stored OID dangles. The text says "step 1 (or the `regprocedure` cast itself) catches" it. **Inaccurate:** step 1 passes (the row exists). Detection comes from step 2 only if the comparison is `NULL`-safe (`pg_get_functiondef` on a missing OID yields no definition), or from step 4 via the dispatcher. Fail-closed if implemented `NULL`-safe, which is F41(vi) |
| **Dispatcher routing changes while the V1 function does not** | **Not detected — F41(i).** See §5.3 |

### 5.2 Function digest — what it does and does not capture

A digest over `pg_get_functiondef()` is a sound **identity** check for the wrapper's own text and declared properties. It freezes semantics only if the function is self-contained. v1.6 does not constrain that; the only mention is a code comment, "ONE IMMUTABLE, pure-SQL function". The following dependencies are **not** in the digest:

| Dependency | In the digest? | Drift possible? |
|---|---|---|
| A user-defined helper called by the rule (e.g. `ast1.hex_norm()`) | No (only the call text) | **Yes**: `CREATE OR REPLACE` of the helper changes V1's semantics, and step 2 passes |
| A table read (PostgreSQL does not verify `IMMUTABLE`) | No | **Yes** |
| `current_setting(...)` / session GUC | No | **Yes** |
| Unqualified names resolved through `search_path` | Only if the function carries `SET search_path` (then `pg_get_functiondef` prints it) | Yes, without such a clause |
| Extension functions | No | **Yes** |
| Built-in `lower()`/regex engine across PostgreSQL major versions | No | Behaviour: vectors only. Representation: a re-rendered `pg_get_functiondef` can permanently fail step 2 for a frozen version with no re-baseline path (fail-closed availability) |

Yet 05 §2.2 "What is actually proven" says step 2 "catches any edit, on any input, because it hashes the whole function body", and rule 20 / INV-23 repeat the claim. **The claimed freeze ignores dependency drift.** This is raised as F41(iii), per the brief.

### 5.3 Dispatcher routing — not bound strongly enough

05 §2.2 "Dispatcher routing is frozen by construction" says the pointer *is* the routing. That is true only while the dispatcher body stays a pure registry lookup, and nothing freezes the body:
- `canonicalise_address` is owned by the migration role (§10).
- It has no registry row and no digest.
- T-ADR-19 is described as "a one-time structural property … not a per-call runtime digest".
- The assertion's step 4 calls the vectors **through** the dispatcher.

**Attack.** A migration replaces the dispatcher so that `(EVM_HEX40, V1)` routes to `canonicalise_evm_hex40_v2`, or to a new inline branch. V2 agrees with V1 on every V1 vector but, say, rejects `0X` or accepts a new spelling.
- Step 2 passes (the V1 function is untouched).
- Steps 3–4 pass (the vectors agree).
- Step 5 passes (stored lower-case values are fixed points under both).
- Step 6 passes.
- The event trigger fires on the dispatcher DDL, but the assertion it calls does not check the dispatcher.

From then on the resolver, the instrument `CHECK` and new registrations under V1 use V2 semantics. **V1 can silently begin using V2 semantics.** This is F41(i).

The same applies one level up. `function_definition_digest()`, `assert_address_rules_frozen()`, `address_rule_supported()` and the registration trigger function are replaceable by the migration role. None is in the event-trigger filter (§2.2 item 1 lists the dispatcher, the rule functions, the two registry tables, `network_registry` and the `instrument` identity columns). Replacing the digest helper with one that returns the stored value makes every later step 2 vacuous, and **no gate fires**. This is F41(ii).

### 5.4 Vector model

| Requirement | Result |
|---|---|
| Three categories | **Correct.** Invalid `(false, NULL, NULL)`; valid non-canonical `(true, c, false)`; valid fixed point `(true, raw, true)`. The three table `CHECK`s encode exactly this, and step 4 checks all three |
| `EVM_HEX40` mixed case | **Consistent.** `valid = true`, `fixed_point = false`, canonical = lower-case form, matching §2.1's accept-and-lower-case rule. The R6 contradiction is gone |
| Corpus cannot lose vectors | **Yes.** Insert-only, trigger-immutable for every role |
| Corpus cannot be empty / lose mandatory **format-specific** classes | **Not mechanically defined.** `address_rule_vector` has no class/category column, and no table or function states each format's required classes (length, prefix/form, whitespace, checksum/case, TRON `41…`). Step 3 ("the full required vector set … exists"), `trg_network_registry_rule_ready` (ii) and T-ADR-20 ("omit one required vector category ⇒ `AS004`") all require SQL to recognise categories it cannot see. Only the three structural cases are derivable from `expected_*`. This is F41(v) |
| Stored instruments remain fixed points | **Yes** (step 5) |
| Collision scan | **Yes** (step 6, as the migration gate; S9 as the routine sweep) |

### 5.5 `network_registry` — FK + trigger, and a new `CHECK` problem

- **The invalid `CHECK … EXISTS (SELECT …)` is gone.** The composite FK `(address_format, canonicalisation_version) → address_rule_version` is valid PostgreSQL. The `BEFORE INSERT OR UPDATE` trigger is feasible. T-ADR-19a's negative test is correct: PostgreSQL rejects subqueries in `CHECK`.
- **But v1.6 kept the same semantics under a function name.**
  - `network_registry` still has `CHECK (ast1.address_rule_supported(...))`, which 05 §2.1 describes as "STABLE; existence check against the registry".
  - The `instrument` `CHECK` now calls the **STABLE, registry-reading** `canonicalise_address`. v1.5's version was `IMMUTABLE`; v1.6 removed "IMMUTABLE and usable in a CHECK".
  - PostgreSQL's documentation (Check Constraints) states that it does not support `CHECK` constraints that reference table data other than the row being checked. Such constraints are not re-validated, and a dump/restore can fail because rows are not loaded in a satisfying order (parallel `pg_restore` makes this likelier).
- The pack asserts the opposite in three places: "still usable in a CHECK" (§2.1), "No CHECK on `network_registry` references another table" (§2.2), and "including across a dump/restore" (§2.1 Versioning). This is F41(iv).
- **Readiness-trigger gap.** The trigger runs the digest and vector-reproduction checks only "where the pair is already referenced by a stored instrument". A network can therefore adopt a registered-but-unreferenced pair whose function was edited after registration. The mismatch surfaces only at the next filtered DDL. This is F41(vi).
- **Network version bump:** affects future registrations only. **Old instrument:** interpreted under its stored version, with the `UPDATE` arm comparing `OLD`/`NEW` only (T-ADR-18). **Holds.**

### 5.6 Automatic enforcement — acceptance criterion

v1.6 states honestly that neither mechanism is installed and makes one of them a **P1 implementation-acceptance criterion** (05 §2.2, §12; INV-23; T-ADR-22 binary: "omitting the manual call still fails the deployment"). This is the right form for a blueprint, and no implementation code is required here.

| Option | Adequate against "author forgot to call the assertion"? |
|---|---|
| **A. `ddl_command_end` event trigger** | **Yes, as specified.** It fires on the DDL itself, inside the DDL transaction, whatever the author wrote. **Condition:** its filter and the frozen set must include the freeze machinery and the dispatcher (F41(i)(ii)). Otherwise a migration can neutralise the check without firing it |
| **B. Mandatory runner gate** | **Almost.** Two gaps. (1) "source-scans **or manifests**": an author-maintained manifest moves "forgot to call" to "forgot to list". Scope must be derived mechanically (every migration whose SQL touches `ast1` identity or freeze objects, found by scan). (2) `node-pg-migrate` commits each migration, so a gate that runs *after* the migration can only fail the deployment, not abort the migration. The abort comes from the in-migration call that the scan enforces. The text should say so, and the gate must be the only accepted deployment path. F41(vii) |

**Adjudication:** the criterion is concrete and binary, and Option A satisfies it. Option B needs the two tightenings above. With them, "migration author forgot to call the assertion" cannot pass P1 acceptance under either option.

---

## 6. F37 — late underlying link

### 6.1 Rule as written

- **Source rule (unchanged).** An `instrument_underlying` row may be inserted only while the linking instrument is `DRAFT`. Rows are insert-only, with no `UPDATE` or `DELETE`.
- **Target rule (new).** `trg_underlying_target_locked`: an `INSTRUMENT` link's target must be `IDENTITY_LOCKED` or `RETIRED`. It is checked "while the insert protocol (§7A) holds the target's own lock", and refusal raises `AST1_UNDERLYING_TARGET_NOT_LOCKED` (`AS004`).
- **SM-1 (06, 05 §4.2).** `DRAFT → IDENTITY_LOCKED | RETIRED`, `IDENTITY_LOCKED → RETIRED`, "any → `DRAFT`: forbidden", enforced by `trg_instrument_identity_immutable`.

### 6.2 Recursive basis-tree proof (re-derived)

**Claim.** For every instrument Y that is non-`DRAFT` at time t, the instrument set reachable from Y through `instrument_underlying` at t is fixed forever after t.

**Proof** by induction on link-insert order:
1. Y's own out-links are frozen once Y is non-`DRAFT` (source rule), and Y never returns to `DRAFT` (SM-1).
2. Every direct target T of Y was non-`DRAFT` when its link was inserted (target rule), and so is non-`DRAFT` at every later time.
3. By the induction hypothesis, T's reachable set was already fixed at that insert.
4. Hence Y's reachable set is the union of fixed sets over a fixed out-link set. ∎

Corollaries:
- **No cycle is possible.** A link S → T needs S `DRAFT`, and every instrument reachable from T is non-`DRAFT`, so S is not reachable from T. The cycle check is structurally redundant but harmless.
- **Depth.** The depth of an existing non-`DRAFT` instrument's chain never changes.

`B(X)` (05 §7) is the set of merge-tree **roots** of X's own asset and of every transitive underlying of X. With the reachable set fixed, `B(X)` changes only when a root changes, which happens only through a governed `lineage_merge` (clause (b), gate-serialised; F27). `SEC(G)` grows only through **new** records, which have higher `global_seq` (clause (a)).

**Brief's attack sequences:**

| Sequence | Result |
|---|---|
| U `DRAFT`, X `DRAFT`, X → U | **Refused** (target `DRAFT`). T-LIN-29 |
| U links, U identity-locks, X → U, X classifies | **Allowed.** U's tree, including any `SECURITY` history, is already in `B(X)` when X classifies, so X is elevated. T-LIN-30/32 |
| After U is non-`DRAFT`, U → V2 | **Refused** (source rule). T-LIN-31 |

### 6.3 Other graph mutations

| Operation | Mutates the underlying graph or `B(X)` after lock? |
|---|---|
| Underlying-row `UPDATE` / `DELETE` / `TRUNCATE` | No: trigger-rejected, and no `DELETE` grant anywhere |
| Asset lineage change (`asset.lineage_id`, predecessor fields) | No: immutable from insert for every role |
| `instrument.asset_id` | No: immutable from insert |
| Lineage merge | Changes merge trees (roots), not the underlying graph. Covered by clause (b) and merge-apply narrowing (F27) |
| Retire | No link change. `RETIRED` is terminal (no return to `DRAFT`) and keeps all identity/link rows. **Safe as a target** |
| Replacement instrument (new contract under a declared predecessor) | Joins a merge tree. Its own records are new (clause (a)). Its own links can only point to non-`DRAFT` targets and do not enter any **other** instrument's `B(·)`, because `B(X)` follows X's underlyings, not those of X's tree-mates |
| New `DRAFT` wrapper W → X | Changes `B(W)` only. W has no record (on the protocol path) |

**No operation other than the underlying-link insert and a lineage merge can change the transitive basis graph**, and the insert is now closed on the protocol path. Two premises used above hold only by workflow on a raw path: the source-`DRAFT` check being serialised against the source's identity lock, and "has a record ⇒ non-`DRAFT`". This is F40.

### 6.4 Underlying-link concurrency (protocol path, 05 §7A)

The protocol: `READ COMMITTED` → `lock_instruments({source, target})` ascending, `FOR UPDATE` → source `DRAFT` → target non-`DRAFT` → same-kind / cycle → insert (FK `KEY SHARE`s self-held) → audit.

| Race | Outcome |
|---|---|
| Target identity-lock vs source link insert | Case submit's identity-lock `UPDATE` fires `trg_instrument_lock_on_write` → `lock_instrument(T)` `FOR UPDATE`, which conflicts with the link's `FOR UPDATE` on T. **Link first:** it reads T `DRAFT` and is refused. **Lock first:** after its commit, the link's next statement (a new `READ COMMITTED` snapshot inside a `VOLATILE` function) reads `IDENTITY_LOCKED` and succeeds. Deterministic and safe (T-LIN-33). Even an **unlocked** target read would be safe: lifecycle is monotone away from `DRAFT`, so a committed non-`DRAFT` read is permanent and a `DRAFT` read refuses |
| Source identity-lock vs link insert | Serialised on S's `FOR UPDATE`. The link reads S under the lock and is refused once S is locked. **Safe on the protocol path** (the raw path is F40(i)) |
| Two links that might close a cycle | Impossible by §6.2: both endpoints of any new link cannot be `DRAFT`. S1 → T1 and T1 → S1 cannot both pass, because each target must be non-`DRAFT` and each source `DRAFT` |
| Link insert vs real-`SECURITY` apply / merge / correction | All lock level-2 sets ascending. The link takes no level 0/1 lock. A merge or apply that enumerated before a link committed re-derives after locking and raises `AS006` if a new (record-less, `DRAFT`) wrapper appeared: retry, availability only |

---

## 7. F38 — helper exclusivity

### 7.1 Rule restored; text not conformed

Rule 22 (05 §1) restores the rule and extends it: "No ordinary AST-01 runtime code or trigger issues its own `SELECT … FOR SHARE`/`SELECT … FOR UPDATE` against a governed object outside a helper's implementation". It names `lock_lineage_gate_shared/exclusive`, `lock_asset`, `lock_instrument`, `lock_instruments` (with three specialisations) and `lock_token`. The **normative steps still say the opposite** at every site R6 F38 correction 1 named:

| Site | v1.6 text | Required |
|---|---|---|
| 05 §4.1 `trg_asset_class_frozen` | "Both branches first take `SELECT … FROM ast1.asset WHERE asset_id = OLD.asset_id FOR UPDATE`" | `lock_asset(…, UPDATE)` |
| 05 §4.2 `trg_instrument_asset_lock` | "`SELECT … FROM ast1.asset WHERE asset_id = NEW.asset_id FOR SHARE`" | `lock_asset(…, SHARE)` |
| 05 §7 `authoritative_state()` | "It then takes `SELECT … FROM ast1.instrument … FOR SHARE`" | `lock_instrument(…, SHARE)` |
| 05 §7A correction **step 2** | "`SELECT … FROM ast1.asset WHERE asset_id = $a FOR UPDATE`" | `lock_asset(…, UPDATE)` |
| 05 §7A mint step 1; 04 §6.1 | "`SELECT … FROM ast1.instrument … FOR SHARE`" | `lock_instrument(…, SHARE)` |
| 05 §7A consume steps 2–3; 04 §6.2 | raw instrument `FOR SHARE`, raw token `FOR UPDATE` | `lock_instrument`, `lock_token` |

**T-LOK-07(m)** (static scan: zero raw governed locks outside the helpers) would fail against these specified steps. **T-LOK-07(i)** already assumes step 2 is `lock_asset`, contradicting 05 §7A step 2. An implementer has two normative instructions that disagree. That is exactly the ambiguity F38 existed to remove.

### 7.2 Trigger asset re-lock (the correction path)

The tracker rules themselves are correct.
- Rule 1 (held at the same mode) and rule 2 (held at a stronger mode) return **before** any level check, with no SQL statement and no tracker mutation.
- "A level is never re-entered … except the idempotent re-lock of a key the transaction already holds" exempts the level-1-after-level-2 case.

So **if both** the application's step 2 and the trigger's asset lock go through `lock_asset`, the trigger's request is a pure no-op and there is **no false `AS006`**. The outcome depends on which form each site uses:

| Step 2 | Trigger asset lock | Result |
|---|---|---|
| helper | helper | No-op, correct |
| raw (as 05 §7A reads) | helper (as rule 22 requires) | The tracker sees a **new** level-1 key while at level 2 ⇒ **`AS006` on every correction** (fail-closed, availability) |
| helper | raw (as 05 §4.1 reads) | No wait (row already held), but it violates rule 22 and T-LOK-07(m) |

Also:
- The re-lock enumeration (05 §7A) still lists only branch (b)'s `lock_asset_instruments()`, **not** the trigger's own asset re-lock. That was R6 F38 correction 2.
- T-LOK-07(i) mentions "the same asset" but asserts only on the instrument set.

### 7.3 Tracker `NULL` / `''`

**Closed.** 05 §7A states that a fresh key yields `NULL`, a reverted key yields `''`, and both mean "nothing held", with no cast before the check. T-LOK-07(l) builds both states in one run.

### 7.4 Implicit locks

The scope statement (05 §7A "Tracker scope") is honest: it does not call implicit locks "tracked". Per path:

| Implicit lock | Covered by |
|---|---|
| Link insert FK `KEY SHARE` ×2 | (A) **on the protocol path**: both endpoints already held `FOR UPDATE`. On a raw insert they are unordered and conflict with helpers' `FOR UPDATE`: deadlock-abort (B), **not stated** (F40(i)) |
| Record / evidence / marker / log / token FK `KEY SHARE` on the instrument, asset, change row or case | (A): the referenced instrument, asset or change row is already held at `SHARE`/`UPDATE`, and `KEY SHARE` is weaker. The case and `evidence_standard` rows are never locked `FOR UPDATE` by anyone, so `KEY SHARE` conflicts with nothing there |
| Instrument insert FK on `asset` / `network_registry` | Asset: (A), held `FOR SHARE`. `network_registry`: runtime-read-only, and migration updates are non-key (`NO KEY UPDATE`), so there is no conflict |
| `UPDATE asset SET asset_class` executor tuple lock | (A): held `FOR UPDATE` |
| `trg_instrument_lock_on_write` targets | (A) |
| **Token revoke `UPDATE` tuple locks (level 3)** | **Neither (A) nor (B) as defined.** The token row is not itself held, but every token writer first holds that token's instrument `FOR UPDATE`, and consumers hold it `FOR SHARE`, so token rows are only ever contended under an instrument lock. The argument is sound but is not the one stated. Either route revocation through `lock_token` or state the guard-lock argument (F38 residue) |
| Raw consume (3 → 2) | (B), stated, fail-closed |

### 7.5 `AS006`

| Location | Four cases (lock-set changed; descending new id; prohibited upgrade; invalid level)? |
|---|---|
| 09 database-error table `AS006` | **Yes**: all four enumerated |
| 09 thrown-error row `AST1_LOCK_SET_CHANGED` | **No**: only set-grew, descending id and upgrade. Case (4), invalid-level acquisition, is missing |
| 01 INV-20, 12 AR-31/36/40 | Refer to `AS006` without contradicting the four cases |

### 7.6 Other residue

- 05 §7's `AS007` helper list and T-ISO-04 enumerate seven helpers, without `lock_instruments` or `lock_token`.
- T-LOK-07(m) scans `ast1.governed_change` for raw locks, but rule 22 covers levels 0–3 and names no helper for level G.
- 01 §3.6 cites "`04-review-r6.md` §16 F36→ renumbered F37". F37 was never renumbered (editorial).

---

## 8. F39 — security-reasoning precision

### 8.1 Round trip `A → B → A` — accurate, commit refused

- **Text.** 05 §4.1 now scopes the "writer-correctness backstop" sentence to the single-hop case and states: "for round-trip revival prevention the deferred fingerprint constraint **is** the security control". 01 §3.4, 02 W13 and 12 AR-41 match. T-FPR-14 is a diagnostic that forces the bypass and shows `class_binding_matches = true` again. **No text still calls the constraint non-security.**
- **Commit-refusal proof.** Let r be I's current record (class A, fingerprint fA).
  - **Hop 1 (A → B).** Cache = fB. The constraint `cache ≠ marker.superseded_record_fingerprint (= r.fp = fA)` holds, and the marker chains to fB.
  - **Hop 2 (B → A), correct recompute.** Cache = fA = r.fp, so the deferred constraint fails and **commit is refused**.
  - **Hop 2, defective writer** (cache left at fB, or any fX ≠ fA). It commits, but `record_fingerprint_matches = false` and B12 denies.
  - **Both hops in one transaction** (two applied changes). Each deferred check reads the final state: cache fA = r.fp ⇒ refused, and the hop-1 marker's `new_instrument_fingerprint` (fB) ≠ cache ⇒ refused.
  - **`SET CONSTRAINTS … IMMEDIATE`** only moves the check earlier, before the fingerprint `UPDATE`, which fails closed.
  - The cache is writable after lock only inside a correction transaction (`trg_instrument_identity_immutable`).
- **Invariant.** After every committed correction, cache ≠ every stale current record's fingerprint. **Holds.**

### 8.2 Trigger 4 — justified by SQL

05 §5.1 step 4 now cites `trg_asset_class_frozen` branch (b) / INV-26. The record trigger holds X `FOR UPDATE` before it reads `asset.asset_class`. Branch (b) must lock every instrument of the asset, X included, before the new asset tuple is written. So the read is strictly before or after any committed class change, for any writer. **Correct.**

### 8.3 Evidence exclusion — one rule in 01, 02 and 05

| Location | Wording |
|---|---|
| 05 §5.1 trigger 7(iii) | exclude any item whose `content_sha256` appears in the bundle of **any** real `SECURITY_OR_SECURITY_TOKEN` record in `SEC(G)`, for **every** `G ∈ B(X)` |
| 01 §4.7 item 2 | same: "**any** real (non-synthetic) `SECURITY`/`SECURITY_TOKEN` classification record in `SEC(G)`, for **every** relevant basis tree `G ∈ B(X)`" |
| 02 W3 row 2 | same: "**any** … record in `SEC(G)`, for **every** relevant basis tree `G ∈ B(X)`" |

- No narrower wording remains: "contributing …" and "qualifying" appear only where the text withdraws them.
- The evidence must also be newer than the floor (`evidence_global_seq > F`: 01 item 2, 02 W3, 05 7(iii)).
- It must be bound to the triggering event (`follows_event_*`, `binding_stale`: 01 item 4, 05 7(iv)).
- T-SEC-13/14 pin both. **Closed.**

---

## 9. Full security regression

| Property | Result |
|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** (§4) |
| B1 unchanged | **Holds** (no B-row in the diff) |
| B8 ≡ C0b parity | **Holds**: `lineage_review_required` is textually unchanged (T-DB-17, T-LIN-24) |
| F27 merge narrowing in-transaction | **Holds** (§7A merge steps 6–9 unchanged) |
| B12 = fingerprint **and** live class binding | **Holds**; round-trip reasoning corrected (§8.1) |
| `READ COMMITTED` assertion | **Holds** as a rule ("every lock helper"); the enumerated lists are stale (F38) |
| Gate-first merge | **Holds** (05 §3 steps 1–7 unchanged) |
| `WITHDRAWN` terminal | **Holds** (INV-27, T-ATT-04) |
| Attestation ordering | **Holds** (`attestation_seq`) |
| Marker ordering | **Holds** (shared sequence, same-instrument comparison only) |
| Canonical exact identity | **Holds**: both unique indexes and the `INSERT` trigger's `AS005`. The `CHECK` layer now depends on table data (F41(iv)) |
| Synthetic cannot become real | **Holds** (insert-immutable `declared_synthetic`; same-kind link/merge; lineage flag equality) |
| `lineage.synthetic` immutable | **Holds** (`trg_lineage_immutable`, every role) |
| No `exchange.*` namespace | **Holds** (0 hits in v1.6) |

## 10. Full lock graph (supported paths, after F37/F38)

Levels: G (change row) → 0 (gate) → 1 (asset) → 2 (instruments, ascending) → 3 (tokens) → 4 (append-only).

| Path | Sequence | In order? |
|---|---|---|
| Record, non-`SECURITY` | G → 0 `S` → 2 X → 3 → 4 | yes |
| Real `SECURITY` apply | G → 0 `X` → derive set → 2 set ascending (one pass) → re-derive → 3 → 4 | yes |
| Evidence insert | 0 `S` → 2 X → 4 | yes |
| Case submit (identity lock) | 2 X → 4 | yes |
| Lineage merge | G → 0 `X` → roots under gate → 2 ascending → trigger re-lock (no-op) → 3 → 4 | yes |
| Class correction (protocol) | G → 1 `X` → 2 all ascending → `UPDATE asset` (tuple lock subsumed; trigger re-locks 1 and 2: no-op **if both helper-taken**, F38) → 3 → 4 | yes |
| Class correction (raw writer) | executor 1 → trigger 1 `X` → 2 ascending → class change | yes |
| Instrument insert | 1 `S` → FK (subsumed) → 4 | yes |
| Hold / admission / custody / operational / attestation / retire / restrictions / jurisdiction | (G) → 2 X → (3) → 4 | yes |
| Evidence-standard retirement | (G) → 2 ascending → 3 → 4 | yes |
| Mint | 2 `S` → 4 | yes |
| Consume | 2 `S` → 3 `X` → trigger 2 `S` (held) | yes |
| Token revoke (standalone) | 2 X → 3 | yes |
| Sweep hold | per instrument, or one ascending set | yes |
| **Underlying link insert** | 2 {source, target} ascending `X` → FK `KEY SHARE` ×2 (self-held) → 4 | **yes** |

**Pairwise:**
- The link insert takes no level 0/1 lock and at most two level-2 rows, ascending, while every other writer's level-2 set is also ascending. No two ascending acquisitions can form a cycle, and the link never waits on the gate or an asset row.
- Correction ↔ link: the correction holds the asset and then instruments, and the link never needs the asset.
- The R6 FK `KEY SHARE` two-cycle is **gone on the protocol path**.
- **No supported path introduces a cycle.**

**Unsupported (fail-closed):**
- Raw consume: stated.
- Raw link insert: unordered FK `KEY SHARE` against `FOR UPDATE`, deadlock-abort, **not stated** (F40).
- Mixed raw/helper writer: a false `AS006` before waiting (F38).

## 11. Latest / newest / current / most-recent audit (whole v1.6)

- Hit counts are v1.5 → v1.6: 01 31→32, 05 83→85, all other files equal.
- Every line v1.6 added was inspected, and every security-relevant rule re-checked:

| Rule | Ordering key | Status |
|---|---|---|
| Current record, `latest_outcome`, `current_record_id`, "newest record" (B-rules, consume step 5, admission/attestation binding, marker `superseded_record_id`, correction invariant "current record predates") | max `record_seq` under the instrument lock | OK |
| Review floor "newest triggering event over every basis tree", `follows_event_*` | max `global_seq` / qualifying `merge_global_seq` | OK |
| Elevated-evidence exclusion | none needed (every `SEC(G)`, every `G ∈ B(X)`) | OK, one wording |
| "Newest marker explains newest fingerprint" | same-instrument `marker_global_seq` | OK |
| Attestation "newest wins" | `attestation_seq` + `WITHDRAWN` terminal | OK |
| `network_registry` "current" version/status | future registrations only; never re-applied to stored rows | OK |
| Freeze digest / registry | no recency: exact registered row, exact function | OK |
| Token expiry | DB `clock_timestamp()`, an expiry check, not an ordering | OK |

No security recency depends on a caller timestamp or an ambiguous row choice.

## 12. OQ-8

**OPEN / UNDECIDED / NON-BLOCKING** (17 §3; README; not resolved). F37's target rule constrains new links only. F40's proposed record-on-`DRAFT` refusal constrains records, not the correction of a `DRAFT` typo. Neither decides OQ-8.

## 13. External gates

F02 (DCR-AST1-004), F05 (DCR-AST1-001(a)+(d)), F17 (DCR-AST1-002(7)) and F21 (DCR-AST1-008(c), OQ-6) are stated in 17 §2 as gates. None is claimed closed, and no DCR is implemented or executed.

## 14. Implementation authorisation

None. Even an `ACCEPT` would be blueprint acceptance only, pending the human/conductor `approve-plan` checkpoint.

## 15. Task state

- `task.json`: `state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` absent. It is conductor-valid (`{"ok":true,"errors":[]}`).
- **Not modified by this review.** No lifecycle event is invented. `findingsSummary` lists F36–F39 as open. Reconciling it (F36 → F41; F37 and F39 closed; F38 open; F40 new) is left to the next remediation checkpoint.
- `PLAN_READY` must not be set by any author or reviewer.

---

## 16. Findings (open after this review)

Severity uses the `OPEN_FINDINGS` vocabulary. **None requires a human decision.**

### AST-01-F38 — LOW — Helper exclusivity restored as a rule but not applied to the specified steps (carried, STILL OPEN)

- **Evidence:** §7.1–7.6.
  - Raw `SELECT … FOR …` remains at 05 §4.1, §4.2 (`trg_instrument_asset_lock`), §7 (`authoritative_state()`), §7A correction step 2, mint step 1, consume steps 2–3, and 04 §6.1/§6.2.
  - T-LOK-07(m) would fail against them, and T-LOK-07(i) contradicts 05 §7A step 2.
  - The trigger's asset re-lock is absent from the re-lock enumeration.
  - `AST1_LOCK_SET_CHANGED` lacks case (4).
  - The `AS007` / T-ISO-04 helper lists omit `lock_instruments` and `lock_token`.
  - T-LOK-07(m) scans level G, which has no helper.
  - The token-revoke tuple lock is covered by neither (A) nor (B) as stated.
- **Affected sections:** 05 §4.1, §4.2, §7 (isolation paragraph, `authoritative_state()`), §7A (re-lock enumeration, "Tracker scope", correction step 2, mint, consume); 04 §6.1, §6.2; 02 W13 step 1; 09 `AST1_LOCK_SET_CHANGED`; 10 T-ISO-04, T-LOK-07(i)(m).
- **Required correction:**
  1. Rewrite each listed site as a helper call with its mode.
  2. Add `trg_asset_class_frozen`'s asset re-lock (level 1 after level 2, same key, same mode ⇒ rule 1, exempt from the level check) to the re-lock enumeration, and make T-LOK-07(i) assert on the asset key too.
  3. Add `lock_instruments` and `lock_token` to the `AS007` list and T-ISO-04.
  4. Name a level-G helper, or exclude level G from rule 22's scan explicitly.
  5. Add case (4) to `AST1_LOCK_SET_CHANGED`.
  6. Route revocation through `lock_token`, or state the instrument-guard argument for token tuple locks.
  7. Fix the 01 §3.6 "renumbered" citation.
- **Implementation impact:** helper-contract text and tests. Blocks P1 (lock helpers, triggers).
- **Human decision:** No.

### AST-01-F40 — LOW — F37's recursion premises are workflow-only on the raw path (new; adjacent to F37, does not reopen it)

- **Evidence:**
  - **(i) The source-`DRAFT` check can race the source's identity lock.**
    - `trg_underlying_insert_only` and `trg_underlying_target_locked` are "checked while the insert protocol (§7A) holds the target's own lock". The locks are taken by the application's steps 1–6, and no text makes the trigger take them (contrast `trg_asset_class_frozen` branch (b), F33 / INV-26). `ast1_app` holds `INSERT` on `instrument_underlying` (05 §10).
    - **Race.** A raw `INSERT` S → V starts while S's case submit (`lock_instrument(S)` `FOR UPDATE`, `UPDATE` → `IDENTITY_LOCKED`) is in flight.
      1. The `BEFORE` trigger reads the committed state `DRAFT` and passes.
      2. The RI check's `FOR KEY SHARE` on S waits for the submit's `FOR UPDATE`.
      3. Once the submit commits, the RI check succeeds (key unchanged).
    - The link commits after S is locked. If that transaction stays open across a later classification of S, or of a wrapper X that links to S once it is locked, `B(S)`/`B(X)` gains V's older `SECURITY` history after the record. B8/C0b stay false and B12 passes (the cached fingerprint was computed at submit). Only the TypeScript fingerprint recompute (for S) or sweep S7 (for X) notices: the F37 shape again.
    - Separately, the raw insert's FK `KEY SHARE`s are an unordered deadlock-abort path that "Tracker scope" does not list.
    - The **target** check is safe even unlocked, because lifecycle is monotone away from `DRAFT`.
  - **(ii) "Classified ⇒ non-`DRAFT`" is not a database invariant.** 05 rule 23, §4.3, §5.1 2(c) and 01 §4.7A equate "classified" with "non-`DRAFT`". Only workflow establishes it (06 SM-1: identity lock at first case submit).
    - No record-trigger step (05 §5.1 1–8) refuses a `classification_record` on a `DRAFT` instrument, and `lifecycle_status` appears in no record condition. B6 denies `RETIRED` only.
    - A defective apply that records against a `DRAFT` instrument leaves it free to add links after its record (the source rule allows `DRAFT`), again invisible to SQL.
- **Affected sections:** 05 §1 rule 23, §4.3 (both triggers), §5.1 (steps 2/5), §7 (B-table, optional), §7A ("Underlying link insert", "Tracker scope"); 01 INV-17, §3.6, §4.7A; 10 T-LIN.
- **Required correction:**
  1. Make one ordered underlying-insert trigger function first call `lock_instruments({instrument_id, underlying_instrument_id})`, a no-op re-lock on the protocol path per rule 22. Then check source = `DRAFT`, target ≠ `DRAFT`, same-kind and no-cycle under those locks. State this as SQL-enforced, not protocol-dependent. The FK `KEY SHARE`s are then self-held on every path.
  2. In the record trigger, under the instrument lock of step 2, refuse any record when `lifecycle_status = 'DRAFT'`. State "a classified instrument is non-`DRAFT`" as a SQL invariant.
  3. Tests, with the sweep disabled:
     - a raw link insert barrier-raced against the source's identity lock (hold the link transaction open) must be refused or serialised;
     - a raw record insert for a `DRAFT` instrument must be refused.
- **Implementation impact:** P1 (two trigger conditions, two tests). No new event, sequence or clause.
- **Human decision:** No. This tightens behaviour within F19.B / AST-HD-8 and removes no capability, since records already only follow submit.

### AST-01-F41 — LOW — Canonicaliser freeze boundary incomplete (supersedes F36)

- **Evidence:** §5.2–5.6.
  - **(i)** The dispatcher's routing is not frozen. It is owned by the migration role and has no registry digest. T-ADR-19 is "one-time". Assertion step 4 runs through the dispatcher, so a re-route that agrees on the vectors passes every step and V1 silently adopts V2 semantics.
  - **(ii)** `function_definition_digest`, `assert_address_rules_frozen`, `address_rule_supported`, the registration and immutability trigger functions, and the event-trigger function are neither in the event-trigger filter nor in the frozen set. Replacing the digest helper makes step 2 vacuous, and no gate fires.
  - **(iii)** No normative self-containment rule exists for per-version functions (helpers, tables, GUCs, `search_path`, extensions), yet 05 §2.2, rule 20 and INV-23 claim the body hash catches "any edit, on any input".
  - **(iv)** The `instrument` `CHECK` calls the STABLE, registry-reading `canonicalise_address`, and `network_registry` keeps a `CHECK` on the registry-reading `address_rule_supported`. PostgreSQL does not support `CHECK` constraints that read other tables (no re-validation; dump/restore load-order failures). The pack asserts they are fine, that "no CHECK on `network_registry` references another table", and that the design survives "a dump/restore".
  - **(v)** Required vector classes are not machine-identifiable (no class column, no per-format requirement), so step 3, `trg_network_registry_rule_ready` (ii) and T-ADR-20 are undefined.
  - **(vi)** The readiness trigger runs the digest and vector checks only for pairs an instrument already references. Step 2 must be `NULL`-safe for a dangling `regprocedure`, and the "step 1 catches it" text is inaccurate. The digest input representation and the PostgreSQL-upgrade procedure are unpinned.
  - **(vii)** Fallback gate: "or manifests" permits an author-maintained list, and a post-run gate cannot abort a migration that has already committed.
- **Affected sections:** 05 §1 rule 20, §2 (`network_registry` `CHECK`), §2.1 (dispatcher comment, "Versioning", closed rule set), §2.2 (digest helper, registry, vector table, steps 2–3, "Dispatcher routing", "What is actually proven", automatic enforcement, readiness trigger), §4.2 `CHECK`, §7 (`STABLE` note), §10, §12; 01 INV-23, §3.7; 12 AR-34/38; 10 T-ADR-13, T-ADR-19/20/22/23.
- **Required correction:**
  1. Freeze the dispatcher (and `address_rule_supported`) with a DB-computed digest in an insert-only row that the assertion recomputes. Any change is a new, reviewed registration. Step 4 must also evaluate every vector **directly** against `rule_function` and require equality with the dispatcher's result.
  2. Bring the freeze machinery inside the boundary: add the digest helper, the assertion, the registration/immutability trigger functions and the event-trigger function to the event-trigger filter and to the self-digested set. Alternatively, have them owned by the bootstrap role, which the migration role cannot act as. State which.
  3. Add a normative, registration-enforced self-containment rule for per-version functions: no user-defined function calls, no table or GUC reads, only `pg_catalog` built-ins, schema-qualified or under a function-level `SET search_path = pg_catalog`. One implementable form: SQL-standard bodies, so `pg_depend` records dependencies and registration asserts every dependency is in `pg_catalog`. Restate "what is proven" so built-in/engine drift across PostgreSQL upgrades is covered by the vectors, not the digest.
  4. Remove table reads from `CHECK`. Either use an `IMMUTABLE`, routing-only dispatcher (a closed `CASE` over registered pairs, itself digest-frozen per item 1, with each new version a new dispatcher registration verified against every existing pair's vectors), or drop the `CHECK` layer and name the `INSERT` trigger, step 5 and S9 as the controls. Drop the `address_rule_supported` `CHECK` (the FK and trigger cover it). Correct the dump/restore claim.
  5. Add a `vector_class` column (a `CHECK` enum) and an insert-only per-format required-class table, or a digest-frozen `IMMUTABLE` function. Step 3 and the readiness trigger check the class set. Rewrite T-ADR-20 against it.
  6. Make the readiness trigger run the digest and vector reproduction unconditionally for the pair. Make step 2 `NULL`-safe (`IS DISTINCT FROM`) and fail a dangling `rule_function` explicitly. Pin the digest's input representation and the PostgreSQL-upgrade re-baseline procedure, which must be fail-closed and governed.
  7. For the fallback gate: derive scope by scan, not manifest; require the in-migration assertion call for every scoped migration (the abort mechanism); make the gate the only accepted deployment path. T-ADR-22 must test omission under both options.
- **Implementation impact:** P1 schema and migration text: one more registry/digest row, one vector column plus table, a changed `CHECK` layer, event-trigger filter scope. No runtime eligibility change.
- **Human decision:** No. If Option A is chosen, whether the bootstrap role may hold superuser to create the event trigger is an ordinary platform-ops choice.

## 17. Required before the next re-review

1. Correct **F38, F40, F41** in a v1.7 pack. v1.6 stays unchanged as reviewed evidence.
2. Editorial items (not findings):
   - **T-LIN-30** allows V `DRAFT`, which the target rule refuses. Construct V non-`DRAFT`.
   - **T-LIN-33** attributes U's identity lock to the "record-insert trigger". It is case submit's identity-lock `UPDATE`.
   - **02 W11** says "the transitive graph changes only via a lineage merge". The underlying graph never changes; merges change merge-tree roots.
   - **05 §5.1 2(c)** says "already locked" where it means identity-locked, not row-locked.
   - **T-ADR-23** cites `infra/migrations` (actual path `platform/infra/migrations`), and its "expected to fail" semantics should be stated as an assertion of absence.
3. The next re-review should examine F38, F40 and F41, plus a regression spot-check of:
   - the F37 recursion under trigger-taken link locks;
   - the correction path with helper-only asset locks (T-LOK-07(i)(m));
   - the `CHECK` layer after F41(iv);
   - the lock graph.

   F29, F30, F31 (inversion), F32(b), F33, F35, F37 and F39 are closed above.
4. Implementation remains unauthorised. `PLAN_READY` remains unset.

---

AIX AST-01 v1.6 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
