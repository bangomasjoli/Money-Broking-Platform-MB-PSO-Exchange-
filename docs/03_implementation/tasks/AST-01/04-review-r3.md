# 04 Review R3 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.2)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.2 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `f769689` on `module/AST-01` (v1.2 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (review R1, `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (review R2, `REMEDIATE`) → `f769689` (v1.2).
- **Reviewed against:** `DEC-012`, `DEC-013`, `DEC-014`; Doc 00 v1.5 §1.D (rule 4), §12A, §12B, §12E.2, §21A; Master Module Index v1.4 §19; SRS v1.3 `AST-SRS-001`, `001A`, `002`; Role & Permission Matrix v1.3 §19 rule 9, §19A, §23, §28; Master Workflow Map v1.3 `WF-32`, `WF-35`; Master System Rules v1.3 `ASSET-RULE-001`, `ASSET-RULE-002`, `SYS-RULE-009`, `SYS-RULE-010`, `LED-RULE-005`; `CURRENT_STATE.md`; prior records `04-review.md`, `04-review-r2.md`, `05-remediation.md`, `05-remediation-r2.md`.
- **Not relied on:** the status columns in `05-remediation-r2.md` and the v1.2 README. Every disposition below comes from the v1.2 text, the masters and, where a seam needed it, the source.

## Decision

# **REMEDIATE**

v1.2 closes most of round 2 correctly:
- **Resolution (F17).** Canonical identity is the only key. Ambiguity and absence deny with no token.
- **Consumption (F18).** Consumption is a single transaction under a coherent lock graph, with the SQL backstop re-run at the consuming `UPDATE`.
- **Lineage (F19).** The deterministic lineage signals are wired, and the code-hash claim is honestly withdrawn.
- **MYR (F21).** MYR is fail-closed and no longer misrepresented as enforced.
- **Fiat, binding, hygiene (F22–F24).** Fiat is keyed on form, the token binding is complete, and the schema hygiene is fixed.
- **F25.** The strict Doc 00 §1.D rule 4 reading is applied consistently.

The remaining work is **two MEDIUM defects** and one LOW, all correctable by the blueprint author without a human decision:
- **AST-01-F27 (MEDIUM).** The lineage merge does not fail-close existing `NON_SECURITY` members. The sibling conjunct is keyed on `global_seq`, so a governed merge that joins an older `SECURITY` determination into a lineage leaves a newer, never-elevated `NON_SECURITY` member MB-eligible. The merge is the tool v1.2 names for linking a detected replacement to its `SECURITY` history, so this is the exact AR-19 remedy path. F20 is superseded by this finding.
- **AST-01-F26 (MEDIUM).** `ASSET_CLASS_CORRECTION`'s collapse is TypeScript-only. The correction's safety effect ("every earlier record collapses to `UNRESOLVED`; admissions, tokens and attestations become stale") is enforced only by the derivation's fingerprint check. The SQL backstop does not see it, tokens are not revoked, and the correction is not in the §7A writer list.
- **AST-01-F28 (LOW).** Three DB-level hygiene gaps on inputs that the canonical-identity and lineage controls rely on.

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§16).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `f769689` (local and `origin/module/AST-01`) |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34` (`git ls-remote` confirms origin). Untouched |
| Diff `43f2f34..f769689` | 5 commits, 43 files, **0 paths** outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**` |
| v1.0, v1.1 packs | Present; v1.2 commit `ccec2ff..f769689` adds only `v1.2/**`, `05-remediation-r2.md`, and edits `task.json` and the module README |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It is not a resumption of any authoring, remediation or review session. The only inputs were the task brief and the repository.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1 and R2. The v1.2 author is `claude-sonnet-5`. The review is **context-independent but not model-family-independent** with respect to the earlier reviews. Under the MIG-005 precedent the human decides with that known.

## 3. Seams verified in source and masters (read-only)

| Claim | Verified at | Result |
|---|---|---|
| WLT-01 has no contract-identity field (DCR-002(7)) | `platform/infra/migrations/049_wlt1_core.cjs:195` (`chain_coverage` unique on `(chain, network)`), `066_wlt1_limits.cjs:78` (`asset_or_currency varchar(16)`); every "contract" hit in WLT-01 migrations is prose ("Implementation-Contract") | **True.** The gap is accurately recorded |
| No MYR-pair control exists | `grep -ril myr platform/{services,packages,infra}`: only WLT-01 fiat payout code (`061_wlt1_fiat_payout_destination.cjs`, `services/wlt1/src/{lib/fiat,routes}/…`) | **True.** No v1.2 text claims otherwise (sweep in §9) |
| Migration head 071 | `platform/infra/migrations/071_cfg1_environment_scope.cjs` is last; `CURRENT_STATE.md:27` agrees | True |
| Doc 00 §1.D rule 4 wording (F25) | `00_Licence_Scope_And_Feature_Lock_v1.5.md:161`: "a real instrument is never eligible on the strength of a test classification" | Consistent with `AST-R2-HD-01` as applied |
| `ASSET-RULE-001` MYR semantics (AST-P-4) | `06_Master_System_Rules_v1.3.md:551, 567, 2062`: MYR **pairs** prohibited "unless separately approved"; "MYR pair support requires separate approval" | `NOT_ASSESSED` pending an approval owner is consistent with "unless separately approved". AST-01 has no override path (rule 6 respected) |
| Route-fragment guard (F15) | `platform/packages/foundation/src/no-exchange.ts` `PROHIBITED_EXCHANGE_FRAGMENTS` (15 fragments), run over all 37 route strings extracted from v1.2 | **0 hits**. No `exchange.*` identifier in v1.2 |
| `task.json` conductor-valid | `aix-conductor/dist/records.js` `validateTaskManifest` (dist newer than `src/records.ts`), run read-only; conductor repository clean before and after | `{"ok":true,"errors":[]}` |

## 4. Non-negotiable security property

Property: a `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`.

| Attack vector | Assessment |
|---|---|
| Wrong sibling resolution | **Defeated.** The only keys are `instrument_id`, `instrument_code`, `(chain, network, contract_address_canonical)` and native `(chain, network)`; `{asset_code, chain, network}` is removed (04 §6.1; T-RES-01/02). No path leads from a contract to any instrument but its own (01 §3.11 item 6) |
| Ambiguous resolution | **Defeated.** Both identity indexes cover every status; the resolver still counts, and >1 ⇒ `INSTRUMENT_REFERENCE_AMBIGUOUS`, no token (T-RES-03) |
| Token mutation | **Defeated.** Binding columns are trigger-immutable plus a column-level grant (05 §7, §10; T-CON-01, T-SCH-08) |
| Token reuse / stale token | **Defeated.** Single-use conditional consume; DB clock expiry; current-record equality and `backstop_permits` re-run at the consuming `UPDATE` (05 §7 `assert_token_consumable`, §7A step 7) |
| Lineage escape | **Mostly defeated.** Identity is registered once; lineage fields are immutable; the underlying link is insert-only; `elevated` is trigger-computed. **Open:** a merge does not narrow existing `NON_SECURITY` members (**F27**) |
| Wrapper escape | **Defeated** for links declared before classification (`UNDERLYING_LINEAGE`, conjunct C0b). **Open** only through the same merge gap when the underlying's lineage is merged later (F27) |
| Native-asset recreation | **Defeated.** `ux_ast1_instrument_native_identity` covers all statuses (T-LIN-01) |
| MYR fallback | **Defeated.** Digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`; B10 denies any `allow`; no override (T-MYR-*) |
| Fiat `not_applicable` handling | **Defeated.** Keyed on the immutable `instrument_form`; B3 is form-based; non-`FIAT` `not_applicable` ⇒ deny (DCR-004(h)) |
| Consumer-service confusion | **Defeated.** Frozen, boot-asserted allow-list; `consumer_service` in `payload_hash` and compared at insert and consume; SQL B9 (T-PLD-*) |

**Summary.** For an instrument whose **own** outcome is `SECURITY`, reaching any MB/PSO subject is blocked at four layers: the matrix, derivation, SQL at mint and consume, and binding. The residual paths are instruments whose own outcome is `NON_SECURITY` but which governance has linked to a `SECURITY` determination (F27), or whose class has been corrected into `SECURITY`/`SECURITY_TOKEN` (F26 — TS denies, SQL does not).

## 5. Disposition of round-2 findings F17–F25

| Finding | Disposition | Basis |
|---|---|---|
| **F17** Canonical identity | **EXTERNAL GATE REMAINS (DCR-AST1-002(7))** | AST-01 side complete and correct: token `(chain, network, contract_address_canonical)` and native `(chain, network)` unique over all statuses (05 §4.2); exactly one selector; 0 ⇒ `INSTRUMENT_NOT_FOUND`, >1 ⇒ `INSTRUMENT_REFERENCE_AMBIGUOUS`, both deny / `NOT_ASSESSED` / no token, logged with `requested_instrument_ref` (05 §8.1 CHECK); never a sibling, symbol or asset code; retired instruments resolve to `INSTRUMENT_RETIRED`. The WLT-01 schema gap is recorded accurately (verified §3). Quarantine = no ledger credit and never credited under a sibling's classification (DCR-002(5)); a token is single-use and bound to `instrument_id`, so no earlier MB decision can be reused. LOW hardening in F28(a) |
| **F18** SQL backstop at consumption | **CLOSED IN BLUEPRINT** | See §7. Immutable token bindings; one transaction; authoritative state and backstop re-run at consume; coherent lock graph; failure leaves the token unconsumed; the deny does not depend on the separate hold transaction (T-CON-11); B1 blocks `SECURITY → MB/PSO` in SQL at consume. The instrument-before-token deviation is **correct** |
| **F19** Deterministic lineage signals | **CLOSED IN BLUEPRINT** | (A) native identity unique in all statuses; (B) transitive underlying ⇒ `elevated` (`UNDERLYING_LINEAGE`), wrapper not auto-`SECURITY`, link insert-only and `DRAFT`-only; (C) code-hash claim withdrawn — acceptable, no source exists (OQ-5); (D) `lineage_id`, predecessor fields, `asset_id` and identity keys immutable from `INSERT`; (E) the contradiction is resolved — identity registered once, the continuity trigger and retire→recreate text removed. See §8 |
| **F20** Sibling narrowing | **SUPERSEDED BY NEW FINDING (F27)** | The derived conjunct C0b / B8 is sound for a `SECURITY` record **appended** into an existing lineage: it is immediate, revokes tokens, rewrites nothing and clears only by a newer elevated record. It does **not** fire when an older `SECURITY` determination enters the lineage through a **merge** (F27) |
| **F21** MYR | **EXTERNAL GATE REMAINS (DCR-AST1-008(c), OQ-6)** | "Enforced" wording removed everywhere (sweep §9). Digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`, no token, B10, no override. Consumers must deny a MYR digital instrument, and a `myr_denominated` fiat leg in a trading pair without a recorded pair-level approval (DCR-004(h), 04 §2.2, §6.4). MYR payment and payout rails are explicitly unaffected. The pair-control owner and rule remain external and are accurately gated |
| **F22** Fiat discriminator | **CLOSED IN BLUEPRINT** | Step 0 and B3 key on `instrument_form = 'FIAT'`. The form is immutable from `INSERT`. `asset_class` is frozen once an instrument exists, and a correction never crosses the fiat boundary. A class/form inconsistency denies `ELIGIBILITY_STATE_UNREADABLE`. `not_applicable` is never returned for a non-`FIAT` form, and a consumer receiving one treats it as a deny (T-FIA-07). Implementation note in §13 |
| **F23** Binding completeness | **CLOSED IN BLUEPRINT** | `payload_hash` = instrument, subject, domain, consumer service, environment, record id, matrix version, `client_facts` (jurisdiction, class, any conjunct fact), `caller_ref`, `client_ref`, `payload_binding` (04 §6.1 step 11). Verify re-supplies them, and an omission or change ⇒ mismatch ⇒ re-`evaluate` (04 §6.2). The token trigger compares `consumer_service` at insert and consume. The allow-list is a deep-frozen constant with `assertAllowlistInvariants()`; `WLT-01` = exactly `{DEPOSIT_MB_PSO, WITHDRAWAL_MB_PSO}`; duplicated in SQL B9 |
| **F24** Schema hygiene | **CLOSED IN BLUEPRINT** | `deployment_environment` trigger-immutable for every role, TRUNCATE included. The raising trigger never persists a hold; the application writes it in a separate transaction. Conjunct-row keys are immutable from `INSERT`, and the attestation table is append-only. Instrument identity keys and lineage fields are immutable. New residue on other inputs is in F28 (b)(c) |
| **F25** Real instrument + test classification | **CLOSED IN BLUEPRINT (by `AST-R2-HD-01`)** | See §10 |

## 6. Older findings: regression check

| Finding | Status in v1.2 | Basis |
|---|---|---|
| **F02** Token binding (consumer adoption) | **EXTERNAL GATE REMAINS (DCR-AST1-004)** — not claimed closed | 17 §2, 05-remediation-r2 "External gate remains" |
| **F05** Checker identity | **EXTERNAL GATE REMAINS (DCR-AST1-001(a)+(d))** — not claimed closed | 01 §4.8, INV-05; apply disabled until IAM-02 attests; stub labelled |
| F03 Real securities-route | Not regressed | Matrix ⁵ unchanged; B5; T-DER-09 |
| F07 Holds | Not regressed | C0 conjunct; human maker-checker; SYSTEM immediate; precedent-only citations (01 §4.6, 07 §5) |
| F09 Synthetic single source | Not regressed | Immutable-from-insert list extended, never shortened (05 §4.2) |
| F10 Matrix totality | Not regressed | Totality rule and boot invariant unchanged. C0b and C1m are conjuncts after `PERMITS`, not matrix cells |
| F11 Open-question rule | Not regressed | §5.9 buckets; OQ-6 added as a boundary case |
| F12 SRS coverage | Not regressed | 01 §10 unchanged |
| F13 Attestation currency | Not regressed | Current-record binding kept; table now append-only |
| F14 Citations | Not regressed | 07 §5 maps the new kinds (`ASSET_CLASS_CORRECTION`, sibling reaffirmation) to §19 rule 9 / §28 or DCR-006 |
| F15 `EXCHANGE` enum | Not regressed | 0 fragment hits over 37 routes (§3) |
| F16 `task.json` | Not regressed | Validator `{"ok":true,"errors":[]}` (§3) |

F01, F04, F06 and F08 were superseded in R2 by F17, F18, F19/F20 and F21/F22. Their dispositions follow those rows.

## 7. SQL / locking adjudication (F18)

Judged from the actual protocol in 05 §7 and §7A, not the remediation summary.

**Lock graph.**

| Participant | Locks held and order |
|---|---|
| Single-instrument writer (record, hold, admission, custody, operational, restrictions, attestation, retire, revoke) | Instrument *I* `FOR UPDATE` → (optional) token rows of *I* |
| Lineage-wide writer (real `SECURITY` record; merge) | All affected instruments ascending `FOR UPDATE` → token rows |
| Mint | Instrument `FOR SHARE` → inserts (log, token) |
| Consume | Token id read **unlocked** (immutable) → instrument `FOR SHARE` → token `FOR UPDATE` → trigger `FOR SHARE` (re-entrant no-op) |

- Every participant acquires instrument locks before token locks, and multi-instrument sets are ascending. Mint and consume hold at most one instrument lock and acquire nothing before it.
- The waits-for graph is therefore acyclic on the protocol path. The raw-SQL consume inverts the order, is declared unsupported, and fails closed on deadlock.

**Adjudication of the deviation.** The token-first sequence suggested in R2 would indeed invert against revoking writers (instrument → token) and deadlock. Taking the instrument first is the correct choice. Reading `token.instrument_id` unlocked is sound because the column is immutable after mint. **No finding.**

| Required property | Result |
|---|---|
| Token security-critical columns immutable | Yes: trigger (`AS002`) plus column-level `UPDATE` grant on the three state columns only; `expires_at_utc`, `payload_hash` and `decision_id` included |
| Consumption is one transaction | Yes (§7A steps 1–8; T-CON-08) |
| Authoritative state / backstop re-run at consumption | Yes: app step 6 **and** the independent `BEFORE UPDATE` trigger via `assert_token_consumable()` |
| Writers use compatible locks | Yes for every writer listed. **Missing:** `ASSET_CLASS_CORRECTION` (F26) |
| Sibling-lineage changes cannot race consumption | Yes for an appended `SECURITY` record (affected set locked). A merge locks both sides but does not narrow (F27) |
| Failure leaves token unconsumed | Yes; the failure matrix is explicit; side effects happen in separate transactions |
| Deny does not need the separate hold transaction | Yes (T-CON-11) |
| `SECURITY → MB/PSO` blocked in SQL at consume | Yes: B1 via `backstop_permits` inside `assert_token_consumable` (T-CON-03) |

**Implementation notes (not findings).**
- `authoritative_state()` and the trigger functions must be `VOLATILE` (PostgreSQL rejects `FOR SHARE` in non-volatile functions, and each statement must see post-wait commits under `READ COMMITTED`).
- A lineage-wide writer must re-derive its affected set after acquiring the locks and fail or retry if it grew.

## 8. Lineage / AR-19 adjudication (F19, F20)

| Path | Result |
|---|---|
| Native identity reuse | Closed: unique `(chain, network)` over all statuses |
| Same contract reuse | Closed: unique over all statuses; no continuity trigger needed |
| Replacement contract | Enters via same asset, declared predecessor or merge; `elevated` for the first `NON_SECURITY` |
| Same asset | Closed: instruments inherit the asset's lineage; `asset_id` immutable |
| Declared predecessor | Closed: trigger forces the root at insert; fields immutable |
| Lineage merge | **Future records:** closed (`elevated` reads the merged root). **Existing members:** **open (F27)** |
| Wrapper underlying (direct and transitive, depth ≤ 8, > 8 ⇒ elevated) | Closed for `elevated`. C0b covers later determinations, except via a merge of the underlying's lineage (F27) |
| Draft mutation | Closed: immutable from `INSERT` in every status |
| Asset correction | Lineage preserved (no lineage write). Collapse enforcement is TS-only (F26) |
| Sibling `SECURITY` determination | Closed for an appended record: immediate derived conjunct, tokens revoked, no rewrite, cleared only by a newer elevated record, per-instrument classification unchanged (T-LIN-08/09/12) |
| Wrapper not auto-`SECURITY` | Confirmed (01 §4.7, T-LIN-03) |

**AR-19.**
- The residual is now stated as genuinely non-deterministic: no canonical match, no underlying link, no declared predecessor, no same-asset membership, and no surfaced candidate. The code-hash withdrawal is honest; a proposer-typed hash would add nothing.
- AR-19 is acceptable as a stated residual **once F27 is corrected**. Its remedy for a later-detected continuity is the merge, and today a merge does not narrow the linked `NON_SECURITY` members.
- The declared underlying link is itself human-entered. A wrapper registered without declaring its underlying falls inside AR-19, and the text covers this ("no underlying relationship exists").

## 9. MYR / fiat adjudication (F21, F22)

Sweep of v1.2 for "enforced" near "MYR": every hit states that nothing enforces MYR pairs (01 §1.2, §3.10; 04 §2.2 note; 12 AR-22, §3, §4; 17 OQ-6). There is **no claim that a pair control exists.**

| Check | Result |
|---|---|
| Digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`, no token, no activation | Yes: C1m, B10 (any subject), T-MYR-01/03 |
| Not permanent prohibited-category semantics | Yes: not in `ASSET_NOT_ALLOWED` (09, T-CNJ-01); relaxing it needs a later blueprint once an owner exists. Consistent with `ASSET-RULE-001` "unless separately approved" |
| Consumers required to deny until the owner/rule exists | Yes: DCR-004(h), DCR-008(c), 04 §6.4 |
| Ordinary MYR payment/payout rails not prohibited | Yes, stated in 01 §3.10, 04 §2.2, DCR-002(4), DCR-004(h). Fiat is never `evaluate`d, and the fiat surface returns `pair_control_required`, not a deny |
| Fiat short circuit on form; class/form frozen; digital cannot get `not_applicable` | Yes (§5 F22 row) |

## 10. F25 / `AST-R2-HD-01` adjudication

- Applied at write time (05 §5.1 trigger 8), at derivation (01 §4.4 row, footnote ⁷) and in SQL (B11).
- Restrictive outcomes are unaffected and still count for lineage (T-RNP-04, T-LIN-13).
- Synthetic instruments are the only non-production route (01 §4.5, W10).
- Every mention of "provisional" or "non-production standard" in v1.2 was swept: none permits a real instrument on a test classification.
- Consequence AR-26 is stated honestly: no real instrument is eligible anywhere until `R4-Q3` yields a production-applicable standard (T-RNP-06).

## 11. New findings

Severity uses the `OPEN_FINDINGS` vocabulary.

### AST-01-F27 — MEDIUM — A lineage merge does not fail-close existing `NON_SECURITY` members; the sibling conjunct is keyed on record sequence only

- **Affected sections:** 01 §3.9 (D, "Candidate surfacing"), §4.7A; 05 §3, §7 (`lineage_review_required`, B8), §7A; 02 W3 ("Lineage merge"), W11; 04 §5 (`lineage-merges/request`), §7 sweep; 08 (`ast1.lineage.merged`); 10 T-CLS-17, T-SEC-10, T-LIN-*, T-INT-05; 12 AR-19.
- **Evidence:**
  - `lineage_review_required` is true only when a real `SECURITY` record *r* exists in the instrument's lineage root (or an underlying's root) with **`r.global_seq > current_global_seq`** (05 §7; 01 §4.7A "newer than its own current record"; T-CLS-17 "clears … for determinations older than the new record").
  - A merge appends a `lineage_merge` row and changes `lineage_root()`. It writes no record, carries no sequence, and revokes no token. 02 W3 lists it as maker-checker only; 04 §5 and 08 describe no propagation.
  - **Scenario.**
    - Lineage L2 holds A: a real `SECURITY` record at `global_seq` 10.
    - Asset NEW is created later with `NONE_DECLARED` (lineage L1). Its instrument B receives a real `NON_SECURITY` record at `global_seq` 50. It is non-elevated, correctly, because L1 then had no `SECURITY` history. B is admitted and MB-eligible.
    - Compliance then judges NEW continuous with A and applies the governed merge L1 → L2 (the path 01 §3.9 prescribes for surfaced candidates).
  - **Result.** B's root now contains A's `SECURITY` record, but 10 < 50, so C0b and B8 stay false. B remains `ELIGIBLE` for `SPOT` and `DEPOSIT_MB_PSO`, and its outstanding tokens stay consumable.
  - B's `NON_SECURITY` record was never reviewed on the elevated path against A's determination. So 01 §4.7A's premise ("because the lineage now holds a `SECURITY` determination, no non-elevated record can be appended") does not hold for records appended **before** the merge.
  - The same happens for a wrapper W when its underlying's lineage is later merged with a `SECURITY` lineage.
  - The integrity sweep checks only the `UNDERLYING_LINEAGE` basis (04 §7, T-INT-05). The `OWN_LINEAGE` case is not detected even asynchronously.
  - 05 §3 calls the merge "a tightening" and says the members "take the elevated path", but only **future** records do.
- **Why it matters:**
  - The merge is the only governed remedy v1.2 offers for the AR-19 case, where continuity is discovered after the fact.
  - It currently records the link without narrowing the linked `NON_SECURITY` instrument. That instrument stays MB-eligible although governance has recorded it as the same economic subject as a determined security.
  - This is the "lineage merge" and "sibling `SECURITY` determination" attack in the brief.
- **Required correction:**
  1. Give `lineage_merge` a `global_seq` drawn from `ast1.classification_global_seq` **after** the merge has locked both lineages' members (it already locks them, 05 §3).
  2. Redefine `lineage_review_required` so a `SECURITY` record counts as "newer" relative to an instrument X when either its own `global_seq` or the `global_seq` of the merge that first joined its lineage into X's root (or into the root of an underlying of X) exceeds X's `current_global_seq`. A fail-closed over-approximation is acceptable, for example any merge newer than X's record into a root that holds a real `SECURITY` record. State it identically in TS (C0b) and SQL (B8), and parity-test it.
  3. In the merge apply transaction:
     - revoke the outstanding tokens of every affected member (`lineage_security_determination`);
     - emit `ast1.lineage.security_determination_propagated`;
     - lock and revoke instruments whose underlying reaches either merged lineage, as W11 does.
  4. Extend the integrity sweep to the `OWN_LINEAGE` basis: any current real `NON_SECURITY` record whose root holds a real `SECURITY` record without an elevated record after the linkage ⇒ `SYSTEM` hold and `lineage_gap_found`.
  5. Correct 01 §4.7A, 02 W3 and W11, 05 §3 and §7, and T-CLS-17 accordingly.
  6. Add T-LIN tests for both merge directions (older `SECURITY` joined to a newer `NON_SECURITY`, and the reverse), the underlying-lineage merge, token revocation at merge, and consume rejection after merge.
- **Implementation impact:**
  - Small: one column, one predicate, merge-apply steps and tests.
  - Blocker for **P1** (the `authoritative_state` / B8 definition and the `lineage_merge` schema) and for **P3/P4** (merge apply).
  - Not a blocker for the AST-01 boundary otherwise.
- **Human decision:** **No.** Classification stays per instrument (AST-HD-9). This is the same derived, deny-only conjunct AST-HD-6 already approves.

### AST-01-F26 — MEDIUM — `ASSET_CLASS_CORRECTION`'s "earlier records collapse" is enforced only in TypeScript; the SQL backstop, token revocation and lock protocol do not see it

- **Affected sections:** 01 §3.4 ("Class correction"), §4.4 (drift row), §5.5; 05 §4.1 `trg_asset_class_frozen` (iv), §4.2 `trg_instrument_identity_immutable`, §7 (`authoritative_state`, B1–B11, `assert_token_consumable`), §7A (writer list); 02 W3, W4; 04 §2.1 (`class-correction-request`); 06 SM-8 (revocation reasons); 10 T-CLS-15.
- **Evidence:**
  - The correction's only safety mechanism is recomputing `instrument.identity_fingerprint`. Every earlier record then fails the **derivation's** fingerprint check (01 §4.4, `CLASSIFICATION_IDENTITY_DRIFT`).
  - `authoritative_state()` returns `current_record_id`, `latest_outcome`, `record_env_matches`, `on_hold`, `standard_production_applicable`, `lineage_review_required` and `attr_myr_denominated`. It has **no fingerprint comparison** (05 §7).
  - The correction appends no record. So `current_record_id` is unchanged, and every current-record binding in SQL still passes: token consume, admission approval, attestation.
  - No token revocation is specified for a correction (04 §2.1, 02 W3; no revocation reason in 06 SM-8). The correction is also absent from the §7A writer list. Its instrument `UPDATE`s take row locks implicitly, in unspecified order.
  - **Concrete case: correction *into* `SECURITY_TOKEN`.**
    - Instrument X: class `DIGITAL_CURRENCY`, a production-applicable real `NON_SECURITY` record, `SPOT` admission `APPROVED`, a token outstanding.
    - Compliance corrects the class to `SECURITY_TOKEN` (a tightening, one checker).
    - TypeScript collapses X (drift, and `SECURITY_LABELLED` × `NON_SECURITY` ⇒ ⁴), so the protocol path denies.
    - But in SQL every B-rule passes on the stale `NON_SECURITY` record. A raw `allow` insert, a raw consume `UPDATE` of the outstanding token, and a `SPOT` admission approval are all accepted by the triggers.
    - This is precisely the state AST-P-3 forbids (a `SECURITY`-labelled class holding a `NON_SECURITY` outcome). It was unreachable in v1.1 and is reachable in v1.2 only through the correction.
  - A system hold on drift (02 W4) would eventually add B6, but only if the TypeScript guard or sweep fires. The pack does not say whether a correction-induced drift places a hold or is expected.
- **Assessment:**
  - Not a classification bypass in the derivation: TS and `verify-decision` deny.
  - INV-01 is not literally breached, because B1 is outcome-based and the outcome is not `SECURITY`.
  - It is, however, the **only narrowing event in v1.2 invisible to the SQL backstop**. New record, hold, lineage determination, standard retirement and environment mismatch all reach it.
  - The pack's claim that "admission/tokens/attestations become stale" holds only at the layer the backstop exists to distrust.
- **Required correction:**
  1. Add `record_fingerprint_matches` to `authoritative_state()`: newest record's `identity_fingerprint` = the instrument's stored `identity_fingerprint`. Add **B12**: any subject, a mismatch ⇒ deny. B1 keeps reading `latest_outcome`, so a drifted `SECURITY` still denies as `SECURITY`.
  2. Add `ASSET_CLASS_CORRECTION` apply to the §7A writers: lock every instrument of the asset in ascending order `FOR UPDATE` before the asset update. Revoke their outstanding tokens with a new reason, e.g. `asset_class_corrected`.
  3. State whether correction-induced drift places a `SYSTEM` hold. Either is safe once B12 exists; say which, so the sweep does not treat it as an unexplained anomaly.
  4. Add tests:
     - correction into `SECURITY_TOKEN` ⇒ raw `allow` insert, raw consume and admission approval raise (`AS001`/`AS003`);
     - correction out of `SECURITY` ⇒ B1 still denies until a new elevated classification;
     - tokens are revoked in the correction transaction.
- **Implementation impact:**
  - Small.
  - Blocker for **P1** (the `authoritative_state` / B12 definition) and for **P3** (enabling correction apply).
- **Human decision:** **No.** AST-P-3 is unchanged; this makes its approved correction path enforce what it claims.

### AST-01-F28 — LOW — DB-level hygiene on inputs the identity and lineage controls rely on

- **Affected sections:** 05 §2 (`network_registry`), §3 (`lineage`), §4.2 (identity indexes), §5 (`classification_evidence`), §5.1 (`classification_record.recorded_at_utc`, trigger 7), §10; 01 §3.7, §4.7 item 2; 10 T-RES-07, T-INT-05.
- **Evidence and required correction:**

  **(a) Canonical form is enforced only by TypeScript.**
  - *Evidence:* `contract_address_canonical` carries no DB constraint that it is in canonical form for its network. The canonical form is guaranteed only by the shared TS function (01 §3.7; T-RES-07 tests that function).
  - *Risk:* a registration-path defect that stores a non-canonical variant defeats `ux_ast1_instrument_token_identity`, because the same contract can then be registered twice under different spellings. It also makes the resolver miss the non-canonical row.
  - *Correction:* enforce the canonical form in the database, either with a SQL canonicaliser or format CHECK keyed on `network_registry.address_format` / `canonicalisation_version`, or with a trigger that rejects non-canonical values. Make the sweep re-canonicalise and detect collisions.

  **(b) Timestamps used by the elevated evidence rule are application-suppliable.**
  - *Evidence:* the "new evidence" rule (05 §5.1 trigger 7; 01 §4.7) compares `classification_evidence.recorded_at_utc` with the newest `SECURITY` record's `recorded_at_utc`. Both are `DEFAULT now()` columns that an `INSERT` may supply.
  - *Correction:* fill both by trigger (as `recorded_environment` is) or compare sequence values instead.

  **(c) `lineage.synthetic` can be updated.**
  - *Evidence:* `lineage.synthetic` falls under the general `UPDATE` grant (05 §10), yet it gates real/synthetic merge separation.
  - *Correction:* make it immutable from `INSERT`.
- **Implementation impact:** P1 schema; small.
- **Human decision:** **No.**

## 12. `ASSET_CLASS_CORRECTION` adjudication

| Question | Result |
|---|---|
| Preserves lineage | **Yes.** No lineage field changes (`trg_asset_lineage_immutable`); history follows the root |
| Cannot cross fiat/digital improperly | **Yes.** Refused across `FIAT_CURRENCY` once an instrument exists; `instrument_form` is immutable |
| Correction out of `SECURITY`/`SECURITY_TOKEN` is elevated | **Yes.** `COMPLIANCE_OFFICER` + `MLRO` attested (05 §4.1 (ii), 02 W3, 07 §5). The later `NON_SECURITY` classification is additionally elevated wherever the lineage holds a `SECURITY` record, which it will if the labelled class ever carried one |
| Old records unusable, not silently reinterpreted | **In derivation, yes** (fingerprint includes `asset_class`; TS recomputes). **In SQL, no** (F26) |
| New classification mandatory | Yes in derivation; in SQL only after F26 |
| Admission / tokens / attestations become stale | In derivation, yes (current record collapses). **No token revocation; SQL bindings still pass** (F26) |
| Not a generic identity-rewrite path | **Yes.** The trigger admits only `asset_class`, only in the transaction that marked a matching governed change `applied`, for exactly that asset and (from, to), plus the cached fingerprint. Identity keys, `asset_id` and lineage stay immutable |

**Verdict.** The design is sound in shape and is **not a classification bypass**. It becomes complete with F26.

## 13. OQ-8 adjudication (never-locked `DRAFT` typo)

**Adjudication: acceptable conservative behaviour, not a safety defect, non-blocking for blueprint acceptance.** It is fail-closed: a consumed identity can only fail to be registered, never be reused.

The operational cost is real and should inform the human decision before production onboarding. A typo in the address itself consumes a *wrong* identity (harmless). The costly cases are those where the **correct** identity is consumed:
- the right contract registered under the wrong `asset_id`, which is repairable only by a merge and a class correction;
- a real contract registered as a `SYN-` synthetic instrument, which permanently blocks the real registration in that database.

If a correction path is later wanted, it must stay fail-closed:
- apply only to instruments that never left `DRAFT` and are referenced by no case, record, underlying link, admission, log row or token;
- be maker-checkered;
- tombstone the row instead of deleting it.

Unlike v1.1, the identity index must not exclude such rows in a way that could free an identity with history. **The decision stays with the human; no change is required for acceptance.**

Related implementation note (not a finding): `trg_asset_class_frozen` "no instrument exists" versus a concurrent first-instrument insert can race (the FK takes only `KEY SHARE`). The outcome is a class/form inconsistency that already denies (`ELIGIBILITY_STATE_UNREADABLE`, B3 by form). Lock the asset row `FOR UPDATE` in both paths.

## 14. Human decisions (not changed here)

| ID | Recorded as | Accurate? |
|---|---|---|
| **AST-HD-5** | Approved: `SECURITY` ⇒ `PAY` `INELIGIBLE`, default-deny, no local override (17 §1.1; B1; ³) | Yes |
| **AST-HD-7** | Approved: `RWA` = object of the RWA lifecycle, not the payment currency (17 §1.1; 01 §3.4) | Yes |
| **AST-P-3** | Approved: `SECURITY`/`SECURITY_TOKEN` class + `NON_SECURITY` refused; correction with lineage preserved; not extended to `TOKENISED_DEBT`/`TOKENISED_FUND`; AST-HD-4 intact (17 §1.1; trigger 6; T-CLS-16) | Yes (enforcement completeness: F26) |
| **AST-P-4** | Approved with correction: digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`, no override (17 §1.1; C1m; B10) | Yes |
| **AST-R2-HD-01** | Approved: strict Doc 00 §1.D rule 4; real + test/provisional-only ⇒ `NOT_ASSESSED`; synthetic for non-production testing (17 §1.1; INV-19; B11) | Yes |

17 §1.2 correctly records no pending human decision other than **OQ-8**, which is open and not decided.

## 15. DCR review

| DCR | Required content | Present? |
|---|---|---|
| **002** WLT-01/LED-01 | Canonical contract/native identity (1); ambiguous/unregistered ⇒ quarantine (5); no credit, including LED-01 (5); never credited under a sibling (5); MYR handling (4); current schema gap (7) | **All present and accurate** (gap verified §3) |
| **004** Consumers | Exact identity (b); client-fact binding (c); allow-list (a); MYR fail-closed (h); non-`FIAT` `not_applicable` = deny (h); re-evaluation per attempt (d) | **All present** |
| **008(c)** Masters | Gates any consumer blueprint activating a fiat-quoted or MYR pair, and go-live | **Accurate** (17 §2, §2.1) |
| 001, 003, 005, 006, 007, 009 | Unchanged or extended for the new change kinds (006: `ASSET_CLASS_CORRECTION`, sibling reaffirmation) | Accurate |

No DCR is implemented, which is correct. External DCRs need not be implemented for blueprint acceptance, and the blueprint states them honestly. **F27 should extend DCR-006's elevated-rule text to cover merge-triggered reaffirmation.**

## 16. `task.json` / task state

- **State:** `IDLE`. It is conductor-valid (`{"ok":true,"errors":[]}`) and fail-closed: the implementation gate starts only from `PLAN_READY`.
- **Not changed by this review.** Strict validity does not require a change.
- **No lifecycle event is invented:** `roundCounts`, `findingsSummary` and `relevantRecordPaths` are left for the next conductor or remediation checkpoint (they do not yet list this R3 or F26–F28).
- **`PLAN_READY` must not be set** by any author or reviewer. It is written only by the human `approve-plan` checkpoint after an ACCEPT re-review.

## 17. Required before the next re-review

1. Correct **F27** and **F26** (MEDIUM) in a v1.3 pack. v1.2 stays unchanged as reviewed evidence.
2. Fix **F28** (a)–(c), or record why not.
3. Optionally fold in the implementation notes (§7, §13). They are not acceptance conditions.
4. Re-review with a separate context. Only the F20 area (via F27), the `ASSET_CLASS_CORRECTION` path (via F26) and F28 need re-examination. F17–F19 and F21–F25 are dispositioned above, and F03, F07 and F09–F16 are not regressed.

---

AIX AST-01 v1.2 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
