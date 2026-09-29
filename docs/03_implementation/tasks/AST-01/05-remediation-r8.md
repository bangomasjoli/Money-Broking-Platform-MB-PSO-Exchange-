# 05 Remediation R8 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.8)

- **Task ID:** AST-01
- **Type:** Documentation-only remediation of `04-review-r8.md` (`REMEDIATE`, against v1.7 `93139f8`, recorded at `12f6727`). No implementation, no migration, no merge.
- **Starting HEAD:** `12f6727` on `module/AST-01` (clean; `main` = `origin/main` = `43f2f34`, untouched).
- **New pack:** `docs/02_modules/AST-01/blueprint/v1.8/` (12 files). v1.0–v1.7 are unchanged reviewed historical evidence.
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. Implementation is **not authorised**. `PLAN_READY` is not set.
- **History:** v1.0 `78ec1e4` → R1 `45d9a2f` → v1.1 `e20b8ca` → R2 `ccec2ff` → v1.2 `f769689` → R3 `56b0d6d` → v1.3 `b56950f` → R4 `3c222f4` → v1.4 `a33cc3d` → R5 `32fadb0` → v1.5 `bd753f8` → R6 `3d1dc25` → v1.6 `292face` → R7 `ecaf628` → v1.7 `d71bd04` (+ cleanup `93139f8`) → R8 `12f6727` → v1.8 (this remediation).

## 1. Dispositions

| Finding | Sev | R8 disposition | v1.8 status |
|---|---|---|---|
| **F42** Tracker trusted as proof of lock ownership | LOW | NEW | **Remediated — awaiting re-review** (§2) |
| **F43** Role separation not bound to the actual migration identity; no bootstrap install path; no P1 gate | LOW | NEW (supersedes F41 with F44) | **Remediated — awaiting re-review** (§3); platform dependency recorded as **DCR-AST1-010** (not implemented) |
| **F44** Bootstrap name resolution, dispatcher invocation, `pg_depend` rule, trigger-order bypass, `regprocedure`, digest selection | LOW | NEW (supersedes F41 with F43) | **Remediated — awaiting re-review** (§4) |
| **F45** Level G lock and open transaction across IAM-02 `execute-verify` | LOW | NEW | **Remediated — awaiting re-review** (§5) |
| F41 | LOW | SUPERSEDED BY F43/F44 | Superseded (not separately open) |
| F38, F40 | LOW | CLOSED IN BLUEPRINT | **Closed, preserved** — F42 is a new attack on the re-lock rule, fixed in the helper contract (not by reopening F38/F40) |
| F29, F30, F31 (original inversion), F32(b), F33, F35, F37, F39 | — | CLOSED | **Closed, preserved** (regression map §9) |
| F02, F05, F17, F21 | — | EXTERNAL GATES | **Remain external gates** (DCR-AST1-004 / -001(a)+(d) / -002(7) / -008(c) + OQ-6), unclosed |
| OQ-8 | — | OPEN / UNDECIDED / NON-BLOCKING | **Unchanged.** No draft-correction path is created |
| TM-R8-1 | (task metadata) | PRECISION ITEM | Dispositioned in §7 — **left unchanged for conductor reconciliation; not fabricated** |

No round-8 finding requires a human design decision (`04-review-r8.md` §16). F43's platform-side question (whether the platform adopts a non-superuser migration identity) is a platform-ops decision taken through **DCR-AST1-010**; it is recorded, not made.

## 2. F42 — the tracker is advisory, never proof of lock ownership

| Required (brief) | v1.8 location |
|---|---|
| Tracker = ordering state only; never proof of a granted row lock | 05 §1 rule 22 (re-scoped); §7A "The tracker is advisory — what a forged tracker can and cannot do"; 01 INV-20; 04 §8 |
| Same/stronger held ⇒ skip ordering/level bookkeeping, do **not** advance tracker state, **but still issue the PostgreSQL row-lock statement** | 05 §7A "Lock strength and the PHYSICAL-LOCK-ALWAYS rule" (rules 1–4); "Multi-row set lock" (partition H/N; physical acquisition of **all** requested ids; tracker updated for N only); "Lock helper family" preamble ("every helper issues the row-lock statement on every call"); token-helper rows |
| Withdraw all normative "zero `SELECT … FOR …`" claims | 05 §7A ("(v1.7's normative claim … is **withdrawn**)"), §4.1, §4.3, §7, "Re-lock sites", §7A underlying-link step 7, the §7A level table; 02 W12/W13; 10 T-LOK-07(b)/(i)/(n), T-LIN-39. Correct property stated: no additional conflicting lock when genuinely held; no wait expected for a lock already owned at sufficient strength; no tracker mutation; no false `AS006`; the physical lock statement still executes |
| Honest consequence of a forged tracker; no tamper-proof claim | 05 §7A "The tracker is advisory" (inaccurate bookkeeping, spurious `AS006`, or an ordinary lock wait/deadlock aborted fail-closed; runtime safety rests on actual PostgreSQL locks + database constraints/triggers); "Forged-tracker note" after the full lock graph; AR-45 |
| Confirm physical verify/acquire at the security-bearing trigger sites | 05 §7A **"Security-bearing lock sites"** table: `trg_underlying_insert_guard`, `trg_asset_class_frozen`, classification-record trigger 2, real `SECURITY` apply, lineage merge (`trg_lineage_merge_apply` step 6), token consume/revocation, attestation/admission/custody/operational/hold/retire writers, `trg_instrument_asset_lock`, `trg_instrument_lock_on_write`, evidence trigger, `authoritative_state()`. "No trigger may skip its physical lock merely because a GUC says held." Also stated at 05 §4.1 (asset trigger, F33 preserved under a forged tracker) and §4.3 (guard step 1 and the F37 proof) |
| Rewrite T-LOK-07(b)/(i) and T-LIN-39 (no zero-statement assertion) | 10 **T-LOK-07(b)**, **T-LOK-07(i)**, **T-LIN-39**: assert the physical request; returns without blocking (`lock_timeout` 50 ms, no `Lock` wait event); tracker unchanged; no `AS006`; actual lock still held (second-session `NOWAIT` probe) |
| Forged-tracker negative tests (source+target; asset; instrument; token) | 10 **T-LOK-12** (a) source+target raw underlying insert; (b) asset / `trg_asset_class_frozen` / first-instrument insert; (c) instrument sites; (d) gate + affected set; (e) token consume/revoke. **T-LIN-42**: the L/M two-forged-inserts F37 scenario in both orders, single-forged variants, and a negative-control build. T-LIN-41 and T-FPR-12 extended |
| Optional static scan of tracker-key access; not relied on for safety | 10 **T-LOK-13** (optional; states that safety does not rely on it) |

## 3. F43 — platform migration identity / bootstrap boundary

| Required (brief) | v1.8 location |
|---|---|
| Define `AST_MIGRATION_IDENTITY` = the **actual** deployment migration identity, with the P1 requirement list | 05 §2.2.0 table (nine requirements: `rolsuper = false`; not a bootstrap member directly/indirectly; no `SET ROLE`; no self-grant; no `ALTER`/`DROP`/re-own of bootstrap objects; no event-trigger disable/drop; no `session_replication_role`/`event_triggers`; not the `ast1` owner; no equivalent bypass path); rule 27; §10 privileges row |
| State honestly that the bootstrap role is a controlled **superuser**, not the routine migration runner | 05 §2.2.0 (P5: an event trigger's owner must be a superuser); §2.2.1 bullet 1; rule 25 amended |
| Separate reviewed privileged bootstrap install path; routine `migrate:up` must not run as the bootstrap role | 05 §2.2.0 "Bootstrap install path" (`AST-P1-BOOTSTRAP-INSTALL`: what it creates/owns); §12 "Step 0 is not a migration" and (a) split; §10 |
| P1 stop gate | 05 §2.2.0 **`AST-P1-MIGRATION-IDENTITY-GATE`** (stops if superuser / bootstrap member / owns `ast1` / can bypass; no silent fallback; else separate architecture review); §2.2.9 (independent of the event-trigger gate); rule 27 |
| New platform DCR; not implemented; classification | 17 **DCR-AST1-010** (target: platform migration/deployment infrastructure; classification **AST-01 P1 IMPLEMENTATION GATE**; facts: one `migrate:up` connection, `003`/`007` record a `postgres` superuser identity); §2.1 blocks-table row; README; platform configuration **not modified** |
| Rewrite T-ADR-24 to run as the actual deployment identity; a dummy role is insufficient | 10 **T-ADR-24** (connects with the deployment's own migration configuration; asserts `rolsuper`, `pg_has_role`, `SET ROLE`, `ALTER`/`DROP` of bootstrap objects, event-trigger disable, `ast1` ownership, `session_replication_role`/`event_triggers`, bypass; fails and stops P1 otherwise); **T-ADR-28** (install path separate from routine `migrate:up`; gate is a real stop; blueprint-time assertion of today's platform state); T-ADR-27(g) |
| Risk record | 12 **AR-46** |

## 4. F44 — three F41 mechanisms unsound or unspecified, plus precision

| Item | v1.8 location |
|---|---|
| **(a)** Bootstrap name resolution: `SET search_path = pg_catalog`, qualified references, INVOKER/DEFINER stated per function, `PUBLIC` `EXECUTE` revoked; step-0 `proconfig` self-check; shadowing test | 05 §2.2.1a (rules 1–4; per-function table — **all SECURITY INVOKER; none DEFINER**; pin mandatory if any were DEFINER); §2.2.5 `bootstrap_inventory`; §2.2.8 step 0(b); rule 28(a); **T-ADR-29** (P3 shadowing reproduction; identical result under default and hostile path; config-drift tests) |
| **(b)** Dispatcher invocation pattern | 05 §2.1 **"Dispatcher invocation pattern — exact"** (static lookup with bind parameters → `pg_catalog.to_regprocedure` → verify `pg_proc` row: signature `(text)→text`, `provolatile = 'i'`, registered owner, language, not DEFINER, pinned `proconfig` → `EXECUTE format('SELECT %I.%I($1)', …) USING p_raw`; `p_raw` stays a bind parameter, no SQL injection). Precision noted: rendering a `regprocedure` through `%s` includes the argument list and may render unqualified, so the name is derived as `%I.%I` from the resolved OID's catalog rows (an OID-derived equivalent, which the brief permits); **T-ADR-30** |
| **(c)** Dependency policy must not rely on `pg_depend` alone | 05 **§2.2.3 rewritten**: `pg_depend` claim withdrawn (secondary only); allowed form = `LANGUAGE SQL`, SQL-standard body, no dynamic SQL/PL/`EXECUTE`/relation reads/subqueries/unqualified references/session state; registration inspects the **stored parsed body** (`prosqlbody`) and enumerates function, operator (+ implementing function), type, collation, relation/range-table entry and `SQLValueFunction`-class constructs; **default-deny** on unrecognised nodes; every function/operator in `approved_primitive` **and** `provolatile = 'i'`; any relation reference (table **or** system catalog) refused; explicit refusals; `approved_primitive` bootstrap-owned/insert-only with exact identity, owner, volatility, per-major approval, digest/closure where applicable; no unfrozen user helper. §2.2.5 `approved_primitive`; §2.2.8 step 3; rule 28(c); **T-ADR-25** (asserts first that `pg_depend` would have accepted each case) |
| **(d)** Final-row canonical validation + trigger inventory | 05 **§2.2.12**: `trg_instrument_address_final` (`AFTER INSERT OR UPDATE`, `DEFERRABLE INITIALLY IMMEDIATE`, `ENABLE ALWAYS`; re-reads the stored row; `INSERT` fixed-point under stored format/version; `UPDATE` identity columns = `OLD`); bootstrap-owned trigger inventory (`bootstrap_inventory`, assertion step 0(c), `UNAPPROVED_TRIGGER`); honest limits; §4.2 trigger bullet; §2.1; **T-ADR-31** (P6 reproduction: early validation passes, later `BEFORE` trigger rewrites, `AFTER` backstop refuses) |
| **(e)** Remove durable `regprocedure`; `pg_upgrade` | 05 §2.2.5 `rule_function_identity text` (row-local shape `CHECK`; registration validates `to_regprocedure` resolution and canonical rendering), `registered_owner`, `original_definition_sha256`, `registration_pg_major`; **§2.2.13**; dispatcher, digest helper (`function_definition_digest(text)`), assertion, readiness trigger, §2.2.7, §12, 09, 10 updated; optional same-cluster OID cache only if non-authoritative; **T-ADR-32** (zero `reg*` columns across `ast1`; restore re-resolution; `pg_upgrade --check` where possible) |
| **(f)** Rebaseline digest selection | 05 **§2.2.10 rewritten**: running major = `registration_pg_major` ⇒ `original_definition_sha256`; otherwise **exactly one** accepted append-only rebaseline row keyed `(address_format, canonicalisation_version, pg_major_version)` ⇒ that row's DB-computed digest/closure; no "latest", no timestamp ordering; `trg_address_rule_rebaseline_register` computes digest/closure and re-runs verification (caller supplies none); §2.2.5 rebaseline table; §2.2.8 steps 0(a), 2, 3; §2.2.7; **T-ADR-33** |
| Precision 1: `ddl_command_end` **does** fire for `DROP`; `sql_drop` kept for dropped-object details | 05 §2.2.9; 10 T-ADR-22(b) (asserts both fire) |
| Precision 2: misroute detection only where a vector differs; prevention = ownership + immutable routing | 05 §2.2.8 step 5 and the dispatcher-routing paragraph; §2.2.11 (3); 10 T-ADR-19(d) (stated limit) |
| Precision 3: which digest after a major rebaseline | 05 §2.2.10, §2.2.8 steps 2–3 (see (f)) |
| Risk record | 12 **AR-47** (and AR-44 cross-reference) |

## 5. F45 — never hold a DB lock or transaction across the IAM-02 remote call

| Required (brief) | v1.8 location |
|---|---|
| Phase A outside any transaction: unlocked read; local prechecks; recompute payload hash; IAM-02 `execute-verify`; capture `verified_payload_hash` and evidence | 05 §7A **"Governed apply protocol — IAM-02 outside the transaction"** (steps 1–5); rule 29 |
| Phase B: `BEGIN` → `lock_governed_change` (G) → locked re-read → require `requested`, immutable payload, `recomputed payload_hash == verified_payload_hash`, evidence still matches policy, no prohibited state change → levels 0→1→2→3→writes → apply → `COMMIT` | same subsection (steps 6–12); level-G row (rewritten); "Lineage merge apply" step 1 and "Asset class correction apply" step 1 (each split into Phase A / Phase B); 04 §3 `apply` steps; 02 W11, W12, W13; 08 `ast1.governed_change.apply_reverify_refused`; failure ⇒ `AST1_CHANGE_STATE_INVALID` / `AST1_APPROVAL_INVALID`; retry needs fresh IAM-02 verification |
| No normative flow says BEGIN/lock → IAM → continue | Whole-pack sweep for `execute-verify`, `IAM-02`, `remote call` (results in §9): every remaining hit is a Phase A step, a prohibition, a history note (05 §7A subsection intro), or unrelated attestation text |
| T-LOK-05: no row lock **and** no open transaction across IAM-02; update T-ISO-01 | 10 **T-LOK-05** (`pg_locks` + `pg_stat_activity`: no `xact_start`/`backend_xid`; `lock_governed_change` is the first lock after the stub returns; static no-IAM-between-BEGIN-and-COMMIT check); **T-ISO-01** rewritten (unlocked IAM window with concurrent commits, then the locked re-check; plus the `REPEATABLE READ` Phase B `AS007` case); T-ISO-02 adjusted |
| Lock order unchanged: G first **inside** the apply transaction; G → 0 → 1 → 2 → 3 → 4 | 05 §7A subsection "Why the unlocked window widens no eligibility"; full lock graph (Phase A shown outside the transaction); 12 **AR-31** and **AR-48** |

## 6. Editorial items

| Item | v1.8 location |
|---|---|
| Round-trip `A → B → A` on an asset with a `RETIRED` classified instrument: state the real fail-closed behaviour; no replacement workflow invented | 05 §4.1 (round-trip paragraph: no intermediate-record route for `RETIRED` because step 2A refuses; `ASSET_CLASS_CORRECTION` does not restore eligibility through a new classification; B6 denies; the deferred fingerprint rule prevents revival; a second hop that would revive a retired member's stale fingerprint is refused permanently — a separate governed replacement strategy is required and is **not** designed); 01 §3.4; 02 W13; 10 T-FPR-13(c) |
| Case submit computes/records `identity_fingerprint` only after `lock_instrument(X, UPDATE)` | 05 §7A "Who takes what" case-submit row; 10 T-LIN-37 aligned |
| `lock_token`/`lock_tokens` require the instrument row(s) already held; no token-before-instrument path | 05 §7A helper family rows (`lock_token`, `lock_tokens`, `lock_instrument_tokens`); "Token revocation"; 04 §8 |
| Second lineage-gate mode classified once | **AS006 case (3)** when `SHARE` → `EXCLUSIVE` on the same gate; case (4) only for a new level/order acquisition — 05 §7A "AS006", 09 (thrown row and database row), 10 T-LOK-10 (which had placed it in case (4)); 05's helper table and §7A already used (3) |
| T-LOK-07(m) must not cite `05-remediation-r7.md` | 10 T-LOK-07(m) rewritten to state only its own acceptance condition |

## 7. TM-R8-1 — task-metadata `roundCounts`

**Inspected before editing** (conductor `~/aix-conductor` at `00a7bde`, read-only): `src/types.ts` `RoundCounters`; `src/state.ts` `ROUND_ON_ENTER` and `transitionTask`; `src/records.ts` (`roundCounts: { ...record.rounds }`, `validateTaskManifest`); `config/example.config.json` `loopLimits`; `state/tasks/`.

**Findings.**
- `roundCounts` in `task.json` is a **mirror of the conductor runtime `TaskRecord.rounds`** (`records.ts`: `roundCounts: { ...record.rounds }`).
- Those counters change **only** inside `transitionTask`, when the task *enters* `PLANNING`, `REVIEWING`, `REMEDIATION_REQUIRED` or `ESCALATION_REQUIRED`, and each entry is checked against a loop limit (example configuration: `maxReviewRounds` 3, `maxRemediationRounds` 2); an over-limit entry is redirected to `HUMAN_DECISION_REQUIRED` and the counter is rolled back.
- AST-01 has **no conductor runtime task record** (`state/tasks/` holds only `IMP02-MA-HARDEN-001` and one provider-validation run). Its rounds R1–R8 were run by hand, outside the conductor state machine; no `transitionTask` produced the present values (`review: 1`, `remediation: 1`), and no sequence of legal conductor transitions produces `review = 8`, `remediation = 8` under the documented limits.
- The manifest validator checks only that each counter is a non-negative integer, so `8/8` would *validate* — but it would be a hand-written value presented as a conductor-derived lifecycle fact.

**Outcome used: the values are NOT changed.** `roundCounts` stays `{ planning: 1, architecture: 0, review: 1, remediation: 1, escalation: 0 }`. Fabricating counters to match a manual review history would invent lifecycle transitions the conductor never made. TM-R8-1 is therefore **recorded here and left for conductor reconciliation** (the review's own instruction: reconcile "at the next remediation checkpoint"). It is a task-metadata precision item, not a blueprint finding; it affects no blueprint text. For the record, the actual manual history is **8 reviews (R1–R8)** and **8 completed remediations (v1.1–v1.8, this record being the eighth)**. `planning = 1`, `architecture = 0`, `escalation = 0` are unchanged.

`findingsSummary` **is** updated (§8): that field is a declarative summary of recorded findings, not a transition-derived counter.

## 8. `findingsSummary` after this remediation (pending re-review)

Severities verified from the actual review files before writing: F02 **HIGH** (`04-review.md` "AST-01-F02 — HIGH"), F05 **HIGH** (`04-review.md` "AST-01-F05 — HIGH"), F17 **HIGH** (`04-review-r2.md` "AST-01-F17 — HIGH"), F21 **MEDIUM** (`04-review-r2.md` "AST-01-F21 — MEDIUM"), F42–F45 **LOW** each (`04-review-r8.md` §16).

| Group | IDs |
|---|---|
| External gates (open) | F02 (HIGH), F05 (HIGH), F17 (HIGH), F21 (MEDIUM) |
| Remediated — awaiting re-review | F42, F43, F44, F45 (LOW each) |
| Closed | F38, F40 |
| Superseded | F41 (by F43/F44) |

`findingsSummary.open`: **BLOCKER 0, HIGH 3, MEDIUM 1, LOW 4**; `openFindingIds`: `AST-01-F02, F05, F17, F21, F42, F43, F44, F45`. Nothing is promoted to `OPEN_FINDINGS.md` by this branch.

## 9. Regression map (nothing weakened)

**Byte-identical v1.7 → v1.8 (checked by hash):** the twelve B-rows (B1–B12 table and the paragraph that follows it); `lineage_review_required` clauses (a)/(b) and the clearing paragraph; `assert_token_consumable` (i)–(v); record triggers 5–8 (synthetic, `SECURITY_LABELLED`, elevated, evidence standard); INV-01…16, 18, 19, 21, 22, 24–27 rows in 01; `trg_lineage_immutable`. The lineage §3 differs by one parenthetical (the merge trigger's re-lock wording, F42). No predicate was removed or weakened.

| Property | v1.8 |
|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** — B1 untouched; `assert_token_consumable` untouched |
| B1–B12 | **Holds** (byte-identical) |
| F27 merge narrowing | **Holds** — merge steps 2–9 unchanged; step 1 split into Phase A / G and the re-lock wording |
| B8 ≡ C0b parity | **Holds** (`lineage_review_required` byte-identical) |
| B12 class binding | **Holds** — including under a forged tracker (F33: `trg_asset_class_frozen` physically locks every instrument first, T-LOK-12(b), T-FPR-12) |
| `READ COMMITTED` enforcement | **Holds** — 12 helpers + `authoritative_state()`; under F45 the first helper of Phase B raises `AS007` (T-ISO-01(c), T-ISO-02) |
| F33 correction locks | **Holds** (physical requests, ascending, forged-tracker-safe) |
| F35 `WITHDRAWN` terminal; `SEC(G)` exclusion | **Holds** (trigger 7 and attestation text untouched) |
| F37 basis-tree proof | **Holds, strengthened**: now stated to rest on physical row locks and to survive a forged tracker (05 §4.3; T-LIN-41/42) |
| F38 helper exclusivity | **Holds**; helper family unchanged (12 helpers); T-ISO-04 list unchanged |
| F40 raw underlying guard | **Holds** (step 1 unchanged; wording of the re-lock corrected) |
| Attestation ordering; marker ordering | **Holds** (untouched) |
| Digital MYR fail-closed (B10); real/test-only fail-closed (B11, step 8, B4); synthetic never real; `lineage.synthetic` immutable; consumer binding (B9) | **Holds** (untouched) |
| No `exchange.*` identifier | **Holds** (only prohibitions: 04 l.18, 08, 10, 12, 17) |
| **IAM sweep (`execute-verify` / `IAM-02` / `remote call` over all of v1.8)** | No normative flow runs IAM-02 between `BEGIN` and `COMMIT`. Remaining hits: Phase A steps (05 §7A, 04 §3, 02, level-G row), prohibitions and cross-references (rule 29, INV-20, AR-31/AR-48, T-LOK-05, T-ISO-01), the v1.7 history note in the §7A subsection, and attestation-contract text (DCR-AST1-001(d), 07, 09) |
| **Stale-claim sweep** | No remaining normative "zero `SELECT … FOR …`", "no new statement", "authoritative only because", "regprocedure column", `function_definition_sha256` (other than a dated rename note in the `T-DB-32` history line) or `05-remediation-r7.md` citation in a test |

## 10. Files

Created: `docs/02_modules/AST-01/blueprint/v1.8/**` (12 files), this record. Modified: `docs/02_modules/AST-01/README.md` (lineage, current pack, reviews, findings), `docs/03_implementation/tasks/AST-01/task.json` (title, `findingsSummary`, `relevantRecordPaths`, `updatedAt`; **`roundCounts` deliberately unchanged**, §7). Nothing outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**`. `platform/**`, actual migrations and migration configuration, other module docs, masters, `OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`: untouched.

## 11. Task state

`state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` absent, no acceptance record. `validateTaskManifest(task.json)` ⇒ `{"ok":true,"errors":[]}` (conductor `dist/records.js`, read-only).

---

AIX AST-01 ROUND-8 REMEDIATION:
COMPLETE — v1.8 READY FOR SEPARATE-CONTEXT RE-REVIEW / IMPLEMENTATION NOT AUTHORISED
