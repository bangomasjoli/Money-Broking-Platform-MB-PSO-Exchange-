# 05 Remediation R7 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.7)

- **Task ID:** AST-01
- **Type:** Documentation-only remediation of `04-review-r7.md` (`REMEDIATE`, against v1.6 `292face`). No implementation, no migration, no merge.
- **Starting HEAD:** `ecaf628` on `module/AST-01` (clean; `main` = `origin/main` = `43f2f34`, untouched).
- **New pack:** `docs/02_modules/AST-01/blueprint/v1.7/` (12 files). v1.0–v1.6 are unchanged reviewed historical evidence.
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. Implementation is **not authorised**. `PLAN_READY` is not set.
- **History:** v1.0 `78ec1e4` → R1 `45d9a2f` → v1.1 `e20b8ca` → R2 `ccec2ff` → v1.2 `f769689` → R3 `56b0d6d` → v1.3 `b56950f` → R4 `3c222f4` → v1.4 `a33cc3d` → R5 `32fadb0` → v1.5 `bd753f8` → R6 `3d1dc25` → v1.6 `292face` → R7 `ecaf628` → v1.7 (this remediation).

## 1. Dispositions

| Finding | Sev | R7 disposition | v1.7 status |
|---|---|---|---|
| **F38** Helper exclusivity | LOW | STILL OPEN | **Remediated — awaiting re-review** |
| **F40** Underlying-insert / classification-on-`DRAFT` premises SQL-enforced | LOW | NEW | **Remediated — awaiting re-review** |
| **F41** Canonicaliser freeze boundary (supersedes F36) | LOW | NEW | **Remediated — awaiting re-review** |
| F36 | LOW | SUPERSEDED BY F41 | Superseded (not separately open) |
| F37 | MEDIUM | CLOSED IN BLUEPRINT | **Closed, preserved** — proof restated on SQL premises (F40) without reopening it |
| F39 | LOW | CLOSED IN BLUEPRINT | **Closed, preserved** — wording untouched |
| F29, F30, F31 (original inversion), F32(b), F33, F35 | — | CLOSED | **Closed, preserved** (regression map §6) |
| F02, F05, F17, F21 | — | EXTERNAL GATES | **Remain external gates** (DCR-AST1-004 / -001(a)+(d) / -002(7) / -008(c) + OQ-6), unclosed |
| OQ-8 | — | OPEN / UNDECIDED / NON-BLOCKING | **Unchanged.** F40 creates no draft-identity correction path |

No round-7 finding requires a human decision (`04-review-r7.md` §16).

## 2. F38 — helper exclusivity made real

| Required (brief) | v1.7 location |
|---|---|
| F38.1 one governed-lock rule over G, 0, 1, 2, 3; complete helper family; level-G helper | 05 §1 rule 22; §7A "Lock helper family" (12 helpers): `lock_governed_change` (G), `lock_lineage_gate_shared/exclusive` (0), `lock_asset` (1), `lock_instrument`, `lock_instruments`, `lock_affected_instruments`, `lock_merge_affected_instruments`, `lock_asset_instruments` (2), `lock_token`, `lock_tokens`, `lock_instrument_tokens` (3). Level G resolved by `lock_governed_change`; scan covers G–3 with the helper implementations excluded |
| F38.2 rewrite every raw normative site | 05 §4.1 `trg_asset_class_frozen`; §4.2 `trg_instrument_asset_lock`; §7 `authoritative_state()`; §7A principle, level table, "Who takes what", merge steps 1/4/7, correction steps 1/2/3/5/6, mint step 1, consume steps 2–3, token trigger; 04 §6.1, §6.2, apply steps, §8; 02 W11–W13; 05 §5.1 steps 2(b)/(c); T-FPR-06, T-LOK-06. Full hit audit in §2.1 |
| F38.3 isolation assertion first in every helper; lists/tests match | 05 §7 (list of 12); 09 `AS007` row; T-ISO-04 (enumerates `ast1.lock_*` from the catalog and fails on any difference) |
| F38.4 asset re-lock site | 05 §4.1; §7A "Re-lock sites" item 2 (formal enumeration); §7A correction steps 2 and 5; 02 W13; **T-LOK-07(i)** (asserts asset key **and** instrument set; negative control with a raw step 2 shows the false `AS006` case (4)) |
| F38.5 token revocation | 05 §7A "Token revocation" (new); level-3 row; "Who takes what"; §7 token trigger (3); 04 §8; 02 W11–W13; **T-LOK-07(n)** |
| F38.6 tracker / `AS006` | 05 §7A "AS006 — the four cases" (`NULL`/`''` both empty); 09 thrown row **and** database row; 01 INV-20; README; **T-LOK-10, T-LOK-11** |
| F38.7 static scan | **T-LOK-07(m)** rewritten: inputs (platform AST implementation files + AST migration SQL/function bodies), procedure, exclusions (twelve helper bodies only), exact acceptance condition **ZERO raw governed row-lock statements against levels G–3 outside the named helper implementations**; states no implementation exists |

### 2.1 Raw `FOR SHARE` / `FOR UPDATE` audit of the whole v1.7 pack

Classes: **A** helper-implementation description; **B** normative caller description (must be a helper call); **C** executor-implicit lock; **R** the rule statement / test instrumentation.

| Site | Class | Treatment |
|---|---|---|
| 05 §1 rule 22 (the prohibition) | R | states the rule |
| 05 §4.1 (`trg_asset_class_frozen`, first hit) | **B** | → `lock_asset(OLD.asset_id, UPDATE)`; idempotent re-lock stated |
| 05 §4.1 race paragraph | **B** | → `lock_asset(…, SHARE/UPDATE)`; the `FOR SHARE`/`FOR UPDATE` mapping stays only as helper-implementation note (A) |
| 05 §4.1 `FOR KEY SHARE` (FK) | C | executor lock, unchanged |
| 05 §4.2 `trg_instrument_asset_lock` | **B** | → `lock_asset(NEW.asset_id, SHARE)` |
| 05 §5.1 2(b), 2(c) | **B** | → `lock_instrument(id, UPDATE)`, `lock_instruments(set, UPDATE)` |
| 05 §7 `authoritative_state()` | **B** | → `lock_instrument(id, SHARE)` |
| 05 §7 `VOLATILE` note | A | PostgreSQL restriction on the helper implementations |
| 05 §7A notation, lock strength, set-lock step 6, privilege note | A | helper implementation / privilege description |
| 05 §7A tracker scope | C | FK `KEY SHARE`, UPDATE tuple lock |
| 05 §7A correction step 2; merge step 4; mint step 1; consume steps 2–3 | **B** | → helper calls with modes |
| 05 §4.3 / §7A underlying-link | A/C | trigger calls `lock_instruments`; FK `KEY SHARE` subsumed |
| 04 §6.1, §6.2, apply steps, §8 | **B** | → helper calls |
| 02 W1 step 3, W11, W12, W13 (incl. step 1) | **B** | → helper calls |
| 01 §3.6.. / correction paragraph | **B** | → helper form |
| 10 T-LOK-07(a)/(i)/(m), T-LIN-40, T-LOK-07(k) | R | instrumentation / negative control / scan definition |
| 12 AR-42 | R | describes the defect |

After v1.7 there is **no class-B hit**.

## 3. F40 — SQL-enforced premises of F37

| Required | v1.7 location |
|---|---|
| F40.1 one ordered underlying-insert trigger; first act = `lock_instruments({instrument_id, underlying_instrument_id}, UPDATE)`; only then read statuses | 05 §4.3 **`trg_underlying_insert_guard`** (six ordered steps; replaces four separately-firing triggers); §1 rule 23; §7A "Underlying link insert" (protocol now a convenience); 04 underlyings endpoint; 02 W1 step 4. For non-`INSTRUMENT` kinds the trigger locks the source (`lock_instrument`) because the source-`DRAFT` rule applies to every underlying row |
| F40.2 FK locks subsumed | 05 §4.3; §7A "Tracker scope" case (A); cycle-analysis row; **T-LIN-40** |
| F40.3 no classification record on `DRAFT` | 05 §1 rule 24; §5.1 **step 2A** (after the instrument lock, before semantics); 09 `AST1_INSTRUMENT_NOT_IDENTITY_LOCKED` (`AS004`); 06 row; 08 event. **Valid lifecycle: `IDENTITY_LOCKED` only.** `RETIRED` is refused **because that is the existing policy** (06 SM-1: terminal; B6 denies; no governed historical-classification action exists anywhere in v1.0–v1.6) — recorded, **not changed** |
| F40.4 basis-tree invariant restated | 05 §4.3 premises **P1–P3** (all SQL-enforced) and the recursive proof; 01 §3.6, §4.7A, INV-17; holds with the sweep disabled |
| Tests (the six required) | **T-LIN-36** (raw insert vs source identity lock, both orders), **T-LIN-37** (raw insert locks first), **T-LIN-38** (raw record on `DRAFT`/`RETIRED` refused), **T-LIN-39** (idempotent re-lock, zero false `AS006`), **T-LIN-40** (FK no reverse edge), **T-LIN-41** (sweep disabled, F37 attack impossible on every path) |

## 4. F41 — freeze boundary

| Required | v1.7 location |
|---|---|
| F41.1 bootstrap trust boundary | 05 §1 rule 25; §2.2.1 (ownership table; role separation is the boundary; no self-proving digest; P1 proves the privilege model); **T-ADR-24** |
| F41.2 one rule function per pair, IMMUTABLE/STRICT/schema-qualified/self-contained | §2.1; §2.2.2 |
| F41.3 self-containment | §2.2.3 — SQL-standard body so `pg_depend` sees dependencies; allow-list `approved_primitive` (pg_catalog built-ins / frozen bootstrap primitives / pinned extensions); explicit refusals (tables, GUC, `current_user`, time, randomness, mutable UDFs, unapproved extensions, unqualified `search_path`); `SQLValueFunction` node scan for keyword forms that record no dependency; explicit `COLLATE "C"`; closure hash; **T-ADR-25** |
| F41.4 digest scope | §2.2.4 (DB-computed; caller cannot supply; scope = the registered function; not engine semantics) |
| F41.5 dispatcher routing | §2.1 (generic registry lookup, no `CASE`, bootstrap-owned); §2.2.8 step 5 (direct vs dispatcher equality); **T-ADR-19** |
| F41.6 `address_rule_supported` | **Removed** (§2.1, §2, §10) |
| F41.7 no table-reading `CHECK` | §1 rule 26; §2 `network_registry` (FK + readiness trigger only); §4.2 (canonical-address `CHECK` removed; row-local `NOT NULL` check kept); §2.1 (`trg_instrument_address_canonical` authoritative, before unique-index admission, stamps format/version); trigger-disable privileges; **T-ADR-01/04/19a/25, T-ADR-27(e)** |
| F41.8 vector classes | §2.2.5 (`vector_class` closed vocabulary + row-local class/structure `CHECK`s; `address_rule_vector_requirement`, applicability + universal floor); §2.2.6; **T-ADR-20** |
| F41.9 readiness trigger always | §2.2.7 (six checks, unconditional); **T-ADR-20(e)(f)** |
| F41.10 dangling function | §2.2.8 step 1 explicit `RULE_FUNCTION_MISSING`; `IS DISTINCT FROM` throughout; **T-ADR-26** |
| F41.11 one mechanism | §2.2.9 (`ddl_command_end` **and** `sql_drop` — `ddl_command_end` does not fire for `DROP` — on one bootstrap-owned function; manifest/runner fallback **withdrawn**; platform cannot install ⇒ P1 STOPS for a separately reviewed equivalent gate); **T-ADR-22/23/27** |
| F41.12 PostgreSQL major version | §2.2.10 (pin per registration; fail closed `PG_MAJOR_UNREVIEWED`; append-only `address_rule_rebaseline`; original digest never updated); **T-ADR-26/27(f)** |
| F41 tests 1–15 | T-ADR-13 (2), 15, 19 (3, 4), 20 (8, 9), 22 (1, 15), 24 (11, 3), 25 (5, 6, 7, 12), 26 (10, 14), 27 (13, 15) |

## 5. Editorial items

| Item | Fix |
|---|---|
| T-LIN-30 | V constructed non-`DRAFT` before use as a target |
| T-LIN-33 | U's identity lock = case submit's identity-lock `UPDATE` (`trg_instrument_lock_on_write`), not the record trigger |
| 02 W11 | "the underlying-LINK graph never changes after the relevant identity locks; merges change lineage/merge-tree security history (roots), handled by F27" |
| 05 §5.1 2(c) | "`IDENTITY_LOCKED`/`RETIRED` — a lifecycle state, not a PostgreSQL row lock" |
| T-ADR-23 | path `platform/infra/migrations`; stated as an assertion of absence today and of the named artefact at P1 (no "expected to fail") |
| 01 §3.6 | citation corrected to "`04-review-r6.md` §16, finding F37" (no "renumbered") |

## 6. Regression map (nothing weakened)

F37 late-link closure: preserved, now SQL-enforced (T-LIN-29…35 kept, 36…41 added). F39: text untouched. F33: `trg_asset_class_frozen` still locks every instrument before the class changes (now preceded by `lock_asset`, idempotent). F29/B12: no B-row changed. F27 merge narrowing: merge steps 6–9 unchanged apart from helper names. B8/C0b: `lineage_review_required` unchanged. `READ COMMITTED`: strengthened (12 helpers). Gate-first merge, `WITHDRAWN` terminal, `attestation_seq`, marker ordering, digital MYR fail-closed, fiat `instrument_form`, real/test-only classification, synthetic/real separation, `lineage.synthetic` immutability, consumer binding, no `exchange.*`: no text touched. **No `SECURITY → MB/PSO` path exists; B1 and `assert_token_consumable` are unchanged.**

## 7. Files

Created: `docs/02_modules/AST-01/blueprint/v1.7/**` (12 files), this record. Modified: `docs/02_modules/AST-01/README.md`, `task.json` (title, findings summary, record paths, `updatedAt`). Nothing outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**`. `platform/**`, migrations, masters, `OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`: untouched.

## 8. Task state

`state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` not set. `findingsSummary`: BLOCKER 0, HIGH 3, MEDIUM 1, LOW 3 (external gates F02, F05, F17, F21; pending re-review F38, F40, F41). `validateTaskManifest` ⇒ `{"ok":true,"errors":[]}`.

---

AIX AST-01 ROUND-7 REMEDIATION:
COMPLETE — v1.7 READY FOR SEPARATE-CONTEXT RE-REVIEW / IMPLEMENTATION NOT AUTHORISED
