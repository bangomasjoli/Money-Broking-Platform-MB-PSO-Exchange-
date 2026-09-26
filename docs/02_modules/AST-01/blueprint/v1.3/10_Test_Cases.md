# AST-01 — 10 Test Cases (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW. No test code is written by this task.** Strategy follows Master Testing Strategy: `vitest`, real Postgres for DB-level tests (the repository's existing pattern), pure-function tests without I/O for derivation. Every test here maps to an invariant (01 §2), and the security hard rule gets **exhaustive** rather than sampled coverage.

Test IDs are stable; the implementation task's `03-evidence.md` must report pass/fail per ID. **v1.3** adds `T-LIN-15…27` (lineage merge, F27), suites `T-FPR` (F26), `T-ADR` (F28) and `T-LOK` (lock order) and amends `T-DER-13`, `T-SEC-10`, `T-RES-07`, `T-CON-07/12/14`, `T-SCH-07/10/11/12`, `T-CLS-15/17/18`, `T-HLD-03`, `T-DB`, `T-INT` (tagged **[v1.3: Fnn]**). **v1.2** added suites `T-RES`, `T-CON`, `T-PLD`, `T-LIN`, `T-MYR`, `T-RNP` and amended `T-DER`, `T-SEC-10`, `T-DOM-06`, `T-FIA`, `T-SCH`, `T-CLS`, `T-EVD`, `T-CNJ`, `T-HLD`, `T-DB`, `T-INT` (tagged **[v1.2: Fnn]**).

## T-DER — derivation (pure function, exhaustive)

| ID | Test |
|---|---|
| T-DER-01 | **Total-grid boot invariant and oracle [F10]:** for every (outcome state ∈ {UNRESOLVED, NON_SECURITY, SECURITY, SYNTH→NON_SECURITY, SYNTH→SECURITY}) × (**all 10 asset classes**) × (**all 10 subjects**) × (environment ∈ 5 canonical + unknown) — assert a defined result in the vocabulary, and compare against an independently hand-written oracle in the test (not derived from the constant) |
| T-DER-02 | **Totality:** remove one cell from a test-only clone of `ELIGIBILITY_MATRIX_V2` ⇒ that cell evaluates `NOT_ASSESSED` `MATRIX_CELL_NOT_DEFINED`, and `assertMatrixInvariants()` flags the clone; **no cell may evaluate `PERMITS`/`ELIGIBLE` by default** |
| T-DER-03 | Every conjunct (C0–C6) failing individually turns `PERMITS` into a non-`ELIGIBLE`; **none** turns `INELIGIBLE`/`NOT_ASSESSED` into `ELIGIBLE` (property test, random conjunct states) (INV-04, AST-HD-2) |
| T-DER-04 | `NON_SECURITY` × `RWA_FAMILY` × {Spot, OTC, Pay, MB custody} ⇒ `NOT_ASSESSED` (`R4-Q6`/`R4-Q7` not assumed); × `RWA` subject ⇒ `PERMITS`; × `SECONDARY_MARKET` ⇒ `NOT_ASSESSED` (01 §5.9) |
| T-DER-05 | Determinism and purity (no clock, no I/O) |
| T-DER-06 | Class is narrowing only: no class alone yields `ELIGIBLE` without a classification |
| T-DER-07 | `OTHER_PERMITTED` ⇒ `NOT_ASSESSED`; **`instrument_form = FIAT` ⇒ `NOT_APPLICABLE` for every subject, never `INELIGIBLE`** [F08]. **[v1.2: F22]** The discriminator is the **form**: a digital instrument whose asset class is forced (test DB) to `FIAT_CURRENCY` never yields `not_applicable` and, with a `SECURITY` record, still denies MB/PSO with the hard-rule reason; a `FIAT`-form instrument on a non-fiat class denies `ELIGIBILITY_STATE_UNREADABLE` |
| T-DER-08 | Deposit/withdrawal **per domain**: each conjunct removed ⇒ not `ELIGIBLE`; ≥ 1 same-domain admission required; **`SECURITY` × `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO` ⇒ `INELIGIBLE` even when `RWA`/`SECONDARY_MARKET`/`SECURITIES_MARKET` subjects permit** [F01] |
| T-DER-09 | **Real `SECURITY` × {`RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES}` ⇒ `NOT_ASSESSED` `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED` in every environment** [F03]; **synthetic→SECURITY in non-production ⇒ `PERMITS`** on the same cells; synthetic in PRODUCTION ⇒ `INELIGIBLE` |
| T-DER-10 | `SECURITIES_MARKET` chain: `SECONDARY_MARKET` derives without any attestation; `SECURITIES_MARKET` requires the attestation **bound to the current record**; a newer record ⇒ `SECURITIES_MARKET_ATTESTATION_STALE` [F13] |
| T-DER-11 | A hold yields `INSTRUMENT_ON_HOLD` **without altering `effective_outcome`**; a held `SECURITY` instrument still returns `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for MB/PSO subjects [F07] |
| T-DER-12 | `TOKENISED_DEBT`/`TOKENISED_FUND` start `UNRESOLVED`, accept `NON_SECURITY` or `SECURITY` on evidence, and are **not** rejected by the class-label rule (AST-HD-4); `SECURITY`/`SECURITY_TOKEN` classes + `NON_SECURITY` ⇒ `AST1_CLASS_CLASSIFICATION_CONFLICT` |
| T-DER-13 | **[F20; v1.3: F27]** Conjunct C0b: a real `NON_SECURITY` instrument with a newer real `SECURITY` record on a lineage sibling or underlying-lineage instrument, **or a merge newer than its record that joined a tree already holding a real `SECURITY` record (own or underlying tree)** ⇒ `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` for **every** subject; no such record or merge ⇒ unchanged; a synthetic `SECURITY` never triggers it; property test with random lineage graphs |
| T-DER-14 | **[F21]** Conjunct C1m: digital `attr_myr_denominated` ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` for every subject (see T-MYR); order C0 → C0b → C1 → C1m: privacy-coin + MYR ⇒ `INELIGIBLE` `ASSET_NOT_ALLOWED` |
| T-DER-15 | **[F25]** A real `NON_SECURITY` record without a production-applicable standard derives `UNRESOLVED` ⇒ `NOT_ASSESSED` `REAL_INSTRUMENT_NON_PRODUCTION_BASIS` (see T-RNP); a real `SECURITY` outcome is unaffected (restrictive) |
| T-DER-16 | **[F17, F22]** Formula order: canonical resolution precedes everything (0 / >1 ⇒ deny, no token); fiat decided by form; hard rule precedes environment mismatch (unchanged) |

## T-SEC — the hard rule (INV-01) — **release-blocking**

| ID | Test |
|---|---|
| T-SEC-01 | Property test over all inputs: `SECURITY` outcome (real or synthetic-emulating) × **every MB/PSO-domain subject** (`SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`) **never** yields `ELIGIBLE`, all classes, all environments including DEVELOPMENT/TEST/UAT/DEMO and unknown, with every conjunct at its most permissive value |
| T-SEC-02 | Matrix boot self-test: a test-only clone with a `SECURITY×MB/PSO` cell set to `PERMITS` (or any undefined cell defaulting to permit) ⇒ `assertMatrixInvariants()` throws; the service refuses to start |
| T-SEC-03 | **Authoritative SQL backstop [F04]:** raw `INSERT` into `eligibility_decision_log` with `decision='allow'` for an MB/PSO subject where the **ledger** says `SECURITY` ⇒ raises, **even when the row's own `effective_outcome`/`environment`/`synthetic_emulates` columns are falsified to say `NON_SECURITY`**. Same for the token table |
| T-SEC-04 | Backstop with **no current record**, `UNRESOLVED`, environment mismatch (via `deployment_environment`), fiat, synthetic-in-PRODUCTION, held, retired, real security on a securities-route subject ⇒ each raises for `allow` |
| T-SEC-05 | `allow` whose `classification_record_id` is **not the current record** ⇒ raises |
| T-SEC-06 | `product_admission` for `SPOT`/`OTC`/`PAY` against a `SECURITY` record ⇒ raises **even `PROPOSED`**; admission approved against a **stale** record ⇒ raises [F04, AST-HD-2] |
| T-SEC-07 | Admission/custody/operational APIs for MB/PSO subjects on a security instrument ⇒ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` + event |
| T-SEC-08 | End-to-end: `NON_SECURITY`, admission `APPROVED`, `ELIGIBLE`, token → reclassify `SECURITY` → `verify-decision` ⇒ `AST1_DECISION_STALE`; tokens revoked; `instrument_revoked` event |
| T-SEC-09 | New `SECURITY` record leaves the earlier Spot admission **inert**, not eligible |
| T-SEC-10 | **Elevated-path bypass suite [F06; v1.2: F19]:** `SECURITY → UNRESOLVED → NON_SECURITY`; new asset with `SAME_ECONOMIC_SUBJECT` predecessor; merged lineage; **wrapper whose underlying's lineage holds a `SECURITY` record**; replacement contract under the same asset — **each** requires two distinct attested checkers and evidence whose **DB-assigned `evidence_global_seq` exceeds the review floor** (the newest `SECURITY` record or merge), bound to that event, else `AST1_ELEVATED_APPROVAL_REQUIRED` [v1.3: F27, F28.b]. **Retire → recreate on the same contract or native identity is not a path**: it is rejected by identity uniqueness (T-LIN-01/02) |
| T-SEC-11 | `verify-decision` re-asserts the hard rule in code for MB/PSO subjects even if a token row is forced into a test DB lacking the constraint |
| T-SEC-12 | **Parity [T-DB-09]:** SQL backstop vs TypeScript matrix over all instrument states — the backstop denies wherever B1/B3/B5 apply and never allows a cell the matrix denies for B1/B3/B5 |

## T-DOM — domain and consumer binding [F01, F02]

| ID | Test |
|---|---|
| T-DOM-01 | A token minted for `RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES` **does not verify** for `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO` (`AST1_DECISION_BINDING_MISMATCH`) — full cross-product of subjects |
| T-DOM-02 | Token minted for consumer A does not verify for consumer B; caller-stated `subject`/`instrument_id` must equal the token's |
| T-DOM-03 | Service allow-list: an MB-domain service (`OMS-01`, `TRD-01`, `WLT-01`, `PAY-01`) calling any `RWA`/`SECURITIES` subject ⇒ `AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER` before any state is read; `WLT-01` calling `DEPOSIT_SECURITIES` refused |
| T-DOM-04 | `consumer_service` distinct from caller only if **both** allow-listed for the subject |
| T-DOM-05 | Token bound to `classification_record_id` (not only seq): a record replaced with same seq (forced in test) ⇒ stale |
| T-DOM-06 | Consumer contract tests (stubs, for DCR-AST1-002/-004): unsolicited inbound security-token deposit ⇒ evaluate `DEPOSIT_MB_PSO` ⇒ `INELIGIBLE` ⇒ quarantine, no credit. **[v1.2: F17]** The identifying data is the contract identity (T-RES-11): an unregistered, ambiguous or symbol-only inbound is quarantined with no credit too |

## T-FIA — fiat reference data [F08, AST-HD-1]

| ID | Test |
|---|---|
| T-FIA-01 | `evaluate` for a fiat instrument ⇒ `200`, `decision: not_applicable`, `NOT_APPLICABLE`, `SUBJECT_NOT_APPLICABLE_FIAT`, **no token**, never `deny`/`INELIGIBLE`; log row written; **no `allow` can be inserted for fiat** (backstop B3) |
| T-FIA-02 | Fiat cannot receive a classification case/record/admission/hold-derived outcome (triggers) |
| T-FIA-03 | `GET /currencies/{iso}` returns precision, `myr_denominated`, `classification_regime: NOT_APPLICABLE_FIAT`; retired/missing ⇒ `404 AST1_CURRENCY_NOT_FOUND` |
| T-FIA-04 | Contract test: a Spot pair `USDT/MYR` evaluates only the digital leg via `evaluate`; the fiat leg is a reference lookup — no consumer path treats `not_applicable` as deny |
| T-FIA-05 | Fiat form ⇔ fiat class; fiat cannot be synthetic or carry digital-only attributes. **[v1.2: F22]** Enforced on instrument insert **and on asset update** (`trg_asset_class_frozen`); `asset_class` cannot change once an instrument exists except by governed `ASSET_CLASS_CORRECTION`, which never crosses the fiat boundary |
| T-FIA-06 | **[v1.2: F21, AST-P-4]** Digital instrument with `attr_myr_denominated` ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` (**not** `ASSET_NOT_ALLOWED`; no override) — see T-MYR. Fiat `myr_denominated` is an attribute on the reference surface only |
| T-FIA-07 | **[v1.2: F22]** AST-01 never returns `not_applicable` for a non-`FIAT`-form instrument (property test); consumer contract test: a consumer that receives `not_applicable` for a non-fiat instrument treats it as deny/error |

## T-RES — canonical instrument resolution [v1.2: F17] — **release-blocking**

| ID | Test |
|---|---|
| T-RES-01 | **Sibling contracts:** asset `ABC` with I1 (contract `0x1`, `NON_SECURITY`, admitted, MB-eligible) and I2 (contract `0x2`, `SECURITY`) on the **same network**. `evaluate` `DEPOSIT_MB_PSO` (and `SPOT`) with `instrument_ref` = I2's contract ⇒ resolves to **I2 only** ⇒ `INELIGIBLE`; it never resolves to I1 and no I1 token results |
| T-RES-02 | `{asset_code, chain, network}` alone is **not accepted**: schema error `400`; no request/response schema contains it as a selector (schema scan) |
| T-RES-03 | **Ambiguity:** force two matches (test DB without the unique index) ⇒ `deny`, `NOT_ASSESSED`, `INSTRUMENT_REFERENCE_AMBIGUOUS`, no token, log row has a null instrument and the canonical `requested_instrument_ref`, critical event; the resolver never picks one |
| T-RES-04 | **0 matches:** unregistered contract, or an address that does not canonicalise for its network ⇒ `deny`, `NOT_ASSESSED`, `INSTRUMENT_NOT_FOUND`, no token, logged |
| T-RES-05 | Exactly one selector: none, two, or conflicting selectors ⇒ schema error (consumer treats as deny) |
| T-RES-06 | **Native:** `(chain, network, native: true)` resolves the single native instrument; a second `NATIVE_COIN` for the same `(chain, network)` in any status is rejected |
| T-RES-07 | Canonicalisation: case/checksum/format variants of one address resolve identically and collide on registration; **[v1.3: F28.a] registration (database check) and resolution use the same SQL function, and the TypeScript mirror is parity-tested against it (T-ADR-01…05)** |
| T-RES-08 | A retired instrument's contract resolves to it (`INSTRUMENT_RETIRED`, `INELIGIBLE`), never "not found"; its identity cannot be registered again |
| T-RES-09 | `asserted_asset_code` mismatch ⇒ `INSTRUMENT_REFERENCE_MISMATCH`; a matching assertion never changes which instrument resolves |
| T-RES-10 | **Adversarial:** a token for I1 presented to `verify-decision` naming I2 (or the reverse) ⇒ `AST1_DECISION_BINDING_MISMATCH`; a transfer of I2 can never consume an I1 token |
| T-RES-11 | **WLT-01 consumer contract (stub, DCR-AST1-002):** unsolicited inbound of the **`SECURITY` sibling contract** ⇒ `INELIGIBLE` ⇒ quarantine, **no ledger credit**; unregistered contract ⇒ quarantine; ambiguous/unidentifiable instrument ⇒ quarantine; a transfer carrying only a symbol or asset code ⇒ not credited (the stub has no path that guesses a sibling) |
| T-RES-12 | Fiat is never resolved through `evaluate` (returns `not_applicable` by form; the reference endpoint is the surface) |

## T-CON — token consumption, TOCTOU and lock order [v1.2: F18] — **release-blocking**

| ID | Test |
|---|---|
| T-CON-01 | Raw `UPDATE` of any token binding column (`decision_id`, `instrument_id`, `subject`, `domain`, `consumer_service`, `environment`, `classification_record_id`, `classification_record_seq`, `matrix_version`, `payload_hash`, `expires_at_utc`) ⇒ `AS002`; the app role holds no column privilege for them; `consumed_at_utc`/`revoked_at_utc`/`revoked_reason` cannot be cleared or rewritten |
| T-CON-02 | Mint a valid token; commit a real `SECURITY` record; raw consume `UPDATE` ⇒ `AS003`, token not consumed. Repeat for a hold placed after mint, an admission suspended after mint, and a lineage `SECURITY` on a sibling (B8) |
| T-CON-03 | **Hard rule at consumption:** force a token for an MB/PSO subject onto an instrument whose ledger says `SECURITY` (test DB with the insert triggers disabled) ⇒ the consuming `UPDATE` raises (B1) and `verify-decision` returns `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`; the `SYSTEM` hold is written in a **separate** transaction |
| T-CON-04 | **Mint vs `SECURITY` apply**, barrier-synchronised at every step: no committed `allow` against a superseded record; either the mint commits first and the writer then revokes the new token, or the mint denies |
| T-CON-05 | **Consume vs `SECURITY` apply:** the consume commits before the writer, or fails `AST1_DECISION_STALE`; it never succeeds after the writer's commit |
| T-CON-06 | **Consume of a sibling token vs a `SECURITY` apply on another lineage member** (lineage-wide lock): the consume precedes the determination or is stale; never consumed after it |
| T-CON-07 | **Lock order / deadlock:** N mixed writers (record, hold, admission, custody, operational, revoke, lineage `SECURITY`, merge, **`ASSET_CLASS_CORRECTION`, first instrument insert**) and consumers on overlapping instrument sets [v1.3; full cycle test T-LOK-02] ⇒ no deadlock on the protocol path; any `55P03`/`40P01` ⇒ `AST1_DECISION_UNAVAILABLE`, token left unconsumed |
| T-CON-08 | Consumption is **one transaction**: kill the process between any two steps ⇒ the token is neither consumed nor is an audit row persisted |
| T-CON-09 | **Failure matrix (05 §7A):** each row yields the stated error, token state and follow-up, the follow-up runs in a **separate** transaction, and the failed transaction leaves no consumption, hold or event behind |
| T-CON-10 | `consumer_service` on the token differing from the referenced log row (forced) ⇒ rejected at insert and at consume |
| T-CON-11 | **No autonomous transaction:** after an `AS001`, no hold row exists until the application's separate transaction runs; if that transaction fails, the next `evaluate` still denies (the denial does not depend on the hold) |
| T-CON-12 | Every writer listed in 05 §7A takes `ast1.lock_instrument()` (after its upstream locks) and the table triggers take it too; a test that inspects writers/triggers fails if one omits it. Lineage-wide writers lock the gate then affected instruments in ascending id; **[v1.3]** `ASSET_CLASS_CORRECTION` and the merge apply are in the inspected set (T-LOK-01) |
| T-CON-14 | **[v1.3: F27, F26]** Consume vs **merge** and vs **`ASSET_CLASS_CORRECTION`**, barrier-synchronised at every step: the consume commits before the writer or fails `AST1_DECISION_STALE`; a token is never consumed after either commit (T-LIN-22, T-FPR-06) |
| T-CON-13 | Stale-token behaviour: token minted → record superseded → `verify-decision` ⇒ `AST1_DECISION_STALE`, token revoked (separate txn), audit; a binding-mismatch call does **not** burn the token |

## T-PLD — payload and allow-list binding [v1.2: F23]

| ID | Test |
|---|---|
| T-PLD-01 | `payload_hash` covers instrument, subject, domain, consumer, environment, record, matrix version, **client jurisdiction, client class (and any client fact a conjunct uses), `caller_ref`, `client_ref`, payload binding**: mutating each one at `verify-decision` ⇒ `AST1_DECISION_BINDING_MISMATCH` |
| T-PLD-02 | Client jurisdiction changes between `evaluate` and `verify-decision`: the re-supplied fact no longer hashes ⇒ mismatch; the consumer must re-`evaluate`. Verify derives with the bound facts, never fetches its own |
| T-PLD-03 | `assertAllowlistInvariants()` throws (service refuses to start) for a test-only clone that allow-lists `WLT-01` for `DEPOSIT_SECURITIES`, any MB/PSO identity for a securities/RWA subject, a securities/RWA identity for an MB/PSO subject, or an undefined subject; the real constant is deep-frozen (mutation fails) |
| T-PLD-04 | SQL B9 ⇄ TS allow-list parity: for every (service, subject) the two agree on the MB/PSO-identity rule |
| T-PLD-05 | The token trigger compares `consumer_service` with the log row at insert and at consume |

## T-LIN — lineage, identity and sibling fail-closed [v1.2: F19, F20] — **release-blocking**

| ID | Test |
|---|---|
| T-LIN-01 | **Native:** register the native instrument for `(c, n)`; retire it; register a native instrument for `(c, n)` again under a new asset with `NONE_DECLARED` ⇒ `AST1_INSTRUMENT_DUPLICATE_IDENTITY` (`AS004`). The unique index covers every status |
| T-LIN-02 | **Token:** the same for a contract, including an abandoned `DRAFT`. **No retire→recreate path exists** on the same identity (no route, trigger or text describes one) |
| T-LIN-03 | **Wrapper:** W whose `INSTRUMENT` underlying S (depth 1, 2 and 3) is in a lineage holding a real `SECURITY` record ⇒ W's `→ NON_SECURITY` needs the elevated path (`elevated_basis ∋ UNDERLYING_LINEAGE`), else `AST1_ELEVATED_APPROVAL_REQUIRED`; W is **not** auto-`SECURITY` and can be classified `NON_SECURITY` with elevated evidence; depth > 8 ⇒ treated as elevated |
| T-LIN-04 | Underlying link is insert-only: `UPDATE`/`DELETE` rejected; insert after identity lock rejected; cycle, depth > 8 and real↔synthetic link rejected (`AST1_UNDERLYING_CYCLE`) |
| T-LIN-05 | **Immutability:** `UPDATE` of `asset.lineage_id`, `predecessor_declaration`, `predecessor_ref`, `predecessor_attested_by`, `instrument.asset_id`, `chain`, `network`, `contract_address_canonical`, `instrument_form` ⇒ `AS002` in `DRAFT` and every later status, for every role including the table owner; a merge changes `lineage_root()` without touching asset rows |
| T-LIN-06 | Moving an instrument out of a `SECURITY` lineage by editing its asset while `DRAFT` is impossible (T-LIN-05), and `elevated` is still computed true |
| T-LIN-07 | **No code-hash claim:** schema/API/test scan finds no enforcement or candidate signal named code hash in v1.2 (only the withdrawal note) |
| T-LIN-08 | **Sibling conjunct:** lineage {A, B}; B `NON_SECURITY`, admitted, `ELIGIBLE`, token outstanding; commit a real `SECURITY` record on A ⇒ (i) B derives `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` for **every** subject **at commit**, with no further write; (ii) B's outstanding tokens are revoked in the same transaction; (iii) a token forced past revocation is rejected at consume (B8); (iv) B's classification record is byte-identical (no rewrite) |
| T-LIN-09 | **Release:** only a **newer** record on B through the elevated path (two attested checkers, new post-`SECURITY` evidence, "lineage reviewed") clears it; a non-elevated `NON_SECURITY` on B is refused; hold release, admission approval, configuration and every role fail to clear it |
| T-LIN-10 | **Wrapper as sibling:** W already `NON_SECURITY`; a real `SECURITY` determination later lands in S's lineage ⇒ W derives `LINEAGE_SECURITY_REVIEW_REQUIRED` |
| T-LIN-11 | Synthetic: `SYN→SECURITY` never triggers the conjunct or `elevated` on real instruments; real↔synthetic lineage merge and underlying link are rejected |
| T-LIN-12 | **Race:** concurrent real `SECURITY` apply on A and `NON_SECURITY` apply on B (same lineage) serialise: A first ⇒ B's record is refused as un-elevated; B first ⇒ B's record is older than A's and B is fail-closed by C0b. B is never usable after both commit |
| T-LIN-13 | A provisional (non-production-standard) real `SECURITY` record still counts for `elevated` and C0b (restrictive direction) |
| T-LIN-14 | Integrity sweep detects a uniqueness breach in restored data and a current real `NON_SECURITY` record lacking `UNDERLYING_LINEAGE`; places a `SYSTEM` hold; emits `ast1.integrity.lineage_gap_found` |

## T-LIN (continued) — lineage merge fail-closes existing members [v1.3: F27] — **release-blocking**

Common fixture: real lineage trees, real instruments, `global_seq` values written as numbers for readability. "Merge" = the governed apply of 05 §7A / W12. Every test also asserts the **TypeScript C0b result equals the SQL `authoritative_state().lineage_review_required` / B8 result** (parity), and that the classification record of every affected instrument is byte-identical afterwards (no rewrite, no silent `SECURITY`).

| ID | Test |
|---|---|
| **T-LIN-15** (A) | **Older `SECURITY` + newer `NON_SECURITY`, then merge.** Tree L2 holds A with a real `SECURITY` record (`global_seq` 10). Asset NEW (lineage L1, `NONE_DECLARED`); its instrument B gets a production-applicable real `NON_SECURITY` record (`global_seq` 50), is admitted, `ELIGIBLE` for `SPOT` and `DEPOSIT_MB_PSO`, token outstanding. Apply the governed merge L1 → L2. **At commit:** B derives `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` for **every** subject (clause (b): `merge_global_seq` > 50 and a `SECURITY` record with `global_seq` 10 < `merge_global_seq`); SQL B8 denies; B's tokens are revoked; audit `ast1.lineage.merged` and `…security_determination_propagated` (`trigger = MERGE`) exist; **no sweep has run** |
| **T-LIN-16** (B) | **Newer `SECURITY` + older `NON_SECURITY`, then merge.** B `NON_SECURITY` at 50 in L1; A gets a real `SECURITY` record at 70 in **L2** (B unaffected before the merge: different trees). Merge L1 ↔ L2 at 80 ⇒ B narrowed (clauses (a) and (b) both true). Repeat with the merge direction reversed (surviving/merged swapped) and with `SECURITY` on the surviving side and on the merged side: **every combination narrows every member of both trees** |
| **T-LIN-17** (C) | **Underlying-lineage merge.** Wrapper W (`NON_SECURITY`, admitted, `ELIGIBLE`, token outstanding) whose underlying U (depth 1, 2 and 3) is in tree T1; T1 is merged into T2 holding an older real `SECURITY` record ⇒ W is narrowed at commit (`lineage_review_trigger = UNDERLYING_LINEAGE`), W's tokens revoked, W is in the merge's affected set although its own lineage is untouched; depth > 8 ⇒ treated as required. A wrapper whose underlying is **not** in either tree is untouched |
| **T-LIN-18** (D) | **Outstanding token revoked by the merge.** Mint tokens for several subjects and consumers on B (and W); apply the merge; assert `revoked_at_utc` set, `revoked_reason = lineage_security_determination`, in the **same** transaction as the `lineage_merge` insert (kill the process after the insert but before commit ⇒ neither the merge nor any revocation persists); `ast1.eligibility.instrument_revoked` per instrument; instruments **not** narrowed keep their tokens |
| **T-LIN-19** (E) | **Forced token consume after merge denied by SQL.** With the revocation removed from a test DB (or a token minted with the insert triggers disabled), a raw `UPDATE … SET consumed_at_utc` on B's token ⇒ `AS003` from `assert_token_consumable()` (B8), token not consumed; `verify-decision` returns `AST1_DECISION_STALE`; a `SYSTEM` hold `LINEAGE_REVIEW_GAP` follows in a **separate** transaction (a live token on a review-required instrument means propagation failed) |
| **T-LIN-20** (F) | **New elevated review after the merge clears.** B receives a newer `NON_SECURITY` record through the elevated path — two attested checkers (`COMPLIANCE_OFFICER` + `MLRO`), "lineage reviewed", ≥ 1 evidence item with `evidence_global_seq` **greater than the merge's `merge_global_seq`** (the review floor), `follows_event_kind = LINEAGE_MERGE` naming this merge, content not reused from the `SECURITY` record's bundle ⇒ `lineage_review_required` becomes false (the record's `global_seq` exceeds every triggering value); B still needs a fresh admission against the new record and a fresh token. Also clears via a newer `SECURITY` or `UNRESOLVED` record (which deny by other rules) |
| **T-LIN-21** (G) | **Non-elevated reaffirmation does not clear.** A `RECLASSIFICATION` case reaffirming `NON_SECURITY` on B with **one** checker, or without lineage-reviewed attestation, or with evidence whose `evidence_global_seq` is **below** the merge's, or with a stale `follows_event_*` (a second merge landed between submit and apply) ⇒ the trigger raises `AST1_ELEVATED_APPROVAL_REQUIRED`; **no record is appended**; B stays `NOT_ASSESSED`. A **pre-merge** `NON_SECURITY` record (lower `global_seq`) never clears the requirement however it is presented; hold release, admission approval, configuration and every role fail to clear it |
| **T-LIN-22** (H) | **Concurrent merge and token consumption / mint serialise safely** (barrier-synchronised at every step): (i) consume of B's token vs merge apply — the consume commits first (the merge then finds and revokes nothing further) or fails `AST1_DECISION_STALE`; a token is **never** consumed after the merge's commit; (ii) mint for B vs merge — either the mint commits first and the merge revokes the new token, or the mint sees the merge and denies; (iii) two merges touching a common tree serialise on the gate; (iv) classification of a not-yet-classified instrument in an affected tree during the merge waits on the gate and, after commit, is elevated by the trigger. No deadlock (`40P01`); any lock timeout ⇒ `AST1_DECISION_UNAVAILABLE`, token unconsumed |
| T-LIN-23 | **`merge_global_seq`.** Assigned by the database from the **same** sequence as `classification_record.global_seq`; a caller-supplied value (including one lower than existing records) is overwritten; strictly greater than every value committed earlier on the affected trees; drawn only after the gate and every affected instrument are locked (verified by instrumenting the trigger: the draw is its last statement); duplicate values impossible (`UNIQUE`); merge arguments that are not current roots, or a real/synthetic pair, are refused (`AS004`) |
| T-LIN-24 | **Predicate parity.** Generate random ledgers — records (real/synthetic, all outcomes), merges in random tree shapes, underlying chains, elevated and non-elevated reaffirmations — and assert the TypeScript C0b equals SQL `lineage_review_required` (B8) **and** the sweep's independent computation for every instrument; clause (b) is exercised with `SECURITY` before and after each merge; a synthetic `SECURITY` never contributes |
| T-LIN-25 | **Over-approximation is documented and safe.** Merging an unrelated clean tree into a security-holding tree in which member M was elevated-reviewed *before* the merge narrows M (availability cost, 12 AR-24); merging two clean trees narrows nobody; a `SECURITY` record that lands after such a merge narrows via clause (a). No instrument is ever eligible that the exact (side-aware) definition would deny |
| T-LIN-26 | **Merge as review-floor event.** Evidence recorded (`evidence_global_seq`) after the older `SECURITY` record but **before** the merge does **not** satisfy the elevated evidence rule for a post-merge review; evidence after the merge does |
| T-LIN-27 | **Wrapper propagation at merge.** Every wrapper (transitively) of an instrument of either tree is in the merge's lock set, its narrowing is evaluated by the same predicate, and its tokens are revoked; a wrapper added (`DRAFT`) concurrently is excluded by the gate/asset protocol and, once classified, is elevated by the trigger |

## T-FPR — record-to-identity binding, `ASSET_CLASS_CORRECTION` and B12 [v1.3: F26] — **release-blocking**

| ID | Test |
|---|---|
| **T-FPR-01** | **Correction *into* `SECURITY_TOKEN`.** Instrument X: class `DIGITAL_CURRENCY`, production-applicable real `NON_SECURITY` record, `SPOT` admission `APPROVED`, token outstanding. Apply the governed correction to `SECURITY_TOKEN`. Then: a **raw `allow` insert** for X ⇒ `AS001` (B12); a **raw consume `UPDATE`** of a token forced past revocation ⇒ `AS003` (B12), not consumed; **`product_admission` approval** and a fresh `PROPOSED` admission ⇒ `AS001`; an `ADMITTED` securities-market attestation against the stale record ⇒ `AS001`; custody approval / operational enable ⇒ `AS001`; **every outstanding token of X was revoked in the correction transaction** with `revoked_reason = asset_class_corrected`. `evaluate` returns `NOT_ASSESSED` `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` (B1 does not fire: the stored outcome is `NON_SECURITY`; B12 does) |
| **T-FPR-02** | **Correction *out of* `SECURITY`.** X: class `SECURITY_TOKEN`, real `SECURITY` record. Correct to `DIGITAL_CURRENCY` (`COMPLIANCE_OFFICER` + `MLRO`). B1 still denies every MB/PSO subject on the stored `SECURITY` outcome (a drifted `SECURITY` denies as `SECURITY`); B12 denies the rest; a new `NON_SECURITY` record for X requires the **elevated** path (`elevated_basis ∋ OWN_LINEAGE`: the old `SECURITY` record is still in the lineage) — a non-elevated attempt raises `AST1_ELEVATED_APPROVAL_REQUIRED`; siblings in the lineage are unaffected by the correction itself |
| **T-FPR-03** | **Eligible only after a new valid classification.** After a correction, X never becomes eligible through hold release, admission, custody, configuration, deleting/altering a marker (`AS002`/no grant), or re-applying the old record. It becomes eligible only when a **new** governed record whose `identity_fingerprint` equals the instrument's corrected fingerprint exists **and** a fresh admission/token follow; at that point `record_fingerprint_matches = true` and the marker explains nothing. Correction into a `SECURITY`-labelled class then `NON_SECURITY` ⇒ refused (`CLASS_CLASSIFICATION_CONFLICT`); only `SECURITY`/`UNRESOLVED` can be recorded |
| **T-FPR-04** | **Unexplained fingerprint drift still holds.** Change an instrument's cached fingerprint (or an identity column) by direct SQL on a test DB with the trigger disabled, with **no** marker ⇒ TypeScript `CLASSIFICATION_IDENTITY_DRIFT`, SQL B12 denies, the sweep places a `SYSTEM` hold `IDENTITY_DRIFT`, critical `ast1.instrument.identity_drift_detected`. Add a **forged marker** (no `applied` governing change, wrong asset, wrong from/to, fingerprints that do not chain to the current record) ⇒ treated as **no** marker: same outcome plus `registry_tamper_suspected` |
| **T-FPR-05** | **Governed correction is not an attack.** After a valid correction: no `SYSTEM` hold is written, no `identity_drift_detected` event, reason `CLASSIFICATION_REQUIRED_AFTER_CORRECTION`; the sweep lists the instrument as pending (`ast1.integrity.class_correction_reclassification_pending`) and places no hold; two corrections in a row (A→B→C) without reclassification each add a marker and the newest explains the current fingerprint |
| **T-FPR-06** | **Locking.** The correction takes governed change → asset `FOR UPDATE` → **all** instruments of the asset ascending → tokens; barrier-synchronised races: (i) versus **first instrument insert** (both orders: insert-first ⇒ the correction sees the instrument and locks it; correction-first ⇒ the insert waits and sees the final class/form rule); (ii) versus mint and consume on any instrument of the asset (consume commits first or fails stale; mint denies after); (iii) versus a classification writer on one instrument; (iv) versus a lineage merge and a real `SECURITY` apply touching the same instruments. No deadlock; no interleaving leaves a live token or an allow row for the old record after the correction commits |
| **T-FPR-07** | **Atomicity.** Kill the process between any two steps of W13 ⇒ the class is unchanged, no fingerprint changed, no marker, tokens live (or everything applied). The deferred constraint on branch (b) of `trg_asset_class_frozen` rejects a commit that updated the class without the markers and the revocation |
| **T-FPR-08** | **Parity.** For generated (record, instrument, marker) states, TypeScript "fingerprint check" equals SQL `record_fingerprint_matches`; B12 denies whenever it is false, for every subject and every conjunct-row action; B12 never allows what the matrix denies; B1 still wins the reason for a drifted `SECURITY` |
| **T-FPR-09** | **Not application-suppliable.** No function parameter, table column, request or response field carries `record_fingerprint_matches` or `drift_explained_by_correction` as input (schema/API scan); `authoritative_state()` derives them from stored rows only; the marker table is `INSERT, SELECT` only and its trigger accepts an insert only inside the correction transaction |
| **T-FPR-10** | Correction preconditions unchanged: refused across the FIAT boundary once an instrument exists; needs `COMPLIANCE_OFFICER` + `MLRO` when leaving `SECURITY`/`SECURITY_TOKEN`; lineage untouched; `asset_class` update outside a correction ⇒ `AS002`/`AST1_ASSET_CLASS_FROZEN` once an instrument exists; the request lists the instruments and tokens it will affect |

## T-ADR — canonical address, server-authoritative evidence ordering, immutable `lineage.synthetic` [v1.3: F28] — **release-blocking**

| ID | Test |
|---|---|
| **T-ADR-01** (a) | **Non-canonical address rejected by the database.** `INSERT` of a `TOKEN_CONTRACT` instrument whose `contract_address_canonical` is mixed-case/EIP-55, `0X`-prefixed, unprefixed, padded with whitespace, the wrong length or not hex ⇒ `AS005` (`AST1_ADDRESS_NOT_CANONICAL`) from the trigger; with the trigger **disabled** the `CHECK` rejects the same values. The supplied value is never silently canonicalised or stored |
| **T-ADR-02** (a) | **No second spelling.** Registering `0xAbC…` (checksum spelling) and `0xabc…` for the same contract: the first must arrive canonical (else `AS005`); a second registration of the canonical value ⇒ `AST1_INSTRUMENT_DUPLICATE_IDENTITY`. The unique index only ever sees validated values; a defect injected into the application's canonicaliser surfaces as `AS005`, not as two rows |
| **T-ADR-03** (a) | **One canonicaliser.** The TypeScript mirror equals `ast1.canonicalise_address` over one shared vector corpus per supported format (valid, invalid, case variants, prefix variants, EIP-55 samples); the resolver's canonicalisation is the SQL function (a reference that yields `NULL` ⇒ `INSTRUMENT_NOT_FOUND`); `POST /instruments/validate` reports the same verdict as the insert trigger |
| **T-ADR-04** (a) | **Registry binding.** A network with no supported rule, or `SUSPENDED`, cannot carry a `TOKEN_CONTRACT` instrument (`AS005`); a `network_registry` row naming an unsupported `(address_format, canonicalisation_version)` violates its `CHECK`; an application-supplied `address_format`/`address_canonicalisation_version` is overwritten from the registry; both columns are immutable after insert |
| **T-ADR-05** (a) | **Sweep re-canonicalisation.** On a test DB with the trigger and index disabled, insert two spellings of one contract and one non-fixed-point value ⇒ the sweep flags the collision group and the non-canonical row, places `SYSTEM` holds (`IDENTITY_COLLISION`, `IDENTITY_NOT_CANONICAL`), emits `ast1.integrity.address_canonical_violation`, and **rewrites nothing**; a missing identity index is flagged. A proposed rule-version bump that re-maps an existing identity fails the pre-activation sweep |
| **T-ADR-06** (b) | **Evidence sequence is DB-assigned.** An application-supplied `evidence_global_seq` or `recorded_at_utc` on a `classification_evidence` insert is overwritten; the value is drawn from `ast1.classification_global_seq` after the instrument lock (and the lineage gate `FOR SHARE` for a real instrument); the same holds for `classification_record.recorded_at_utc`, `lineage_merge.recorded_at_utc` and `lineage.created_at_utc` |
| **T-ADR-07** (b) | **Back-dating is powerless.** Insert evidence with a forged future `recorded_at_utc`, then again with a forged past one, and skew the DB clock: the elevated-evidence decision is identical — it depends only on `evidence_global_seq` versus the review floor. Evidence inserted **before** a `SECURITY` record or merge never counts as newer, whatever its supplied timestamp |
| **T-ADR-08** (b) | **Explicit binding.** `case.follows_event_*` is computed by trigger at submit and cannot be supplied; at apply the recomputed floor must name the same event, else `AST1_ELEVATED_APPROVAL_REQUIRED` (`binding_stale`); a record's `review_floor_global_seq` equals the recomputed floor |
| **T-ADR-09** (b) | **Ordering under concurrency.** Evidence insert on X racing a real `SECURITY` apply (or a merge) that affects X serialises: the sequence order equals the commit order in every barrier-synchronised interleaving; there is no interleaving in which evidence that committed before the event carries a higher sequence, or the reverse |
| **T-ADR-10** (b) | **No wall clock in security ordering.** Schema/source scan of every trigger, function and query that decides elevated evidence, `lineage_review_required`, B8 or the sweep's lineage rules: none references `recorded_at_utc`, `created_at_utc`, `now()` or `clock_timestamp()` for an ordering decision (the two `clock_timestamp()` uses are the token-expiry check and the audit fill) |
| **T-ADR-11** (c) | **`lineage.synthetic` immutable.** `UPDATE lineage SET synthetic = …` by the runtime role ⇒ privilege denied (`INSERT, SELECT` only); by the migration role and by the **table owner** ⇒ `AS002` from `trg_lineage_immutable`; `DELETE` and `TRUNCATE` likewise; no other lineage column is updatable. Flipping the flag by any route is impossible, so a real history cannot become synthetic or the reverse |
| **T-ADR-12** (c) | **Source and consequences.** `lineage.synthetic` is set once at asset creation (`lineage_synthetic`, or the predecessor root's value; a disagreeing request is rejected); an instrument whose `declared_synthetic` differs from its lineage's is rejected at insert; real↔synthetic merge and underlying link are rejected; the sweep flags any disagreement between `lineage.synthetic`, `declared_synthetic` and both sides of every merge (S10) |

## T-LOK — the global lock order [v1.3: F26, F27]

| ID | Test |
|---|---|
| **T-LOK-01** | **Conformance.** Instrument the lock helpers; for **every** path in the "Who takes what" table of 05 §7A (classification writer, evidence insert, real `SECURITY` apply, merge apply, class correction apply, first instrument insert, asset insert, hold, admission, custody, operational, restrictions, attestation, retire, revoke, sweep hold, mint, consume) assert the recorded acquisition sequence is non-decreasing in level (G < gate < asset < instrument < token) and ascending within a level. A path that acquires a lower level after a higher one fails the test |
| **T-LOK-02** | **Cycle stress.** Run all ten participant kinds concurrently on overlapping assets, lineages and instrument sets (including wrappers): no `40P01` deadlock on the protocol path over ≥ 10⁴ randomised schedules; every `55P03` maps to `AST1_DECISION_UNAVAILABLE` (mint/consume) or a retriable apply error; no interleaving violates a safety property (no allow/consume after a narrowing event committed) |
| **T-LOK-03** | **Fail-closed helpers.** Requesting the gate, an asset lock or an instrument lock after a token lock (or the gate after an instrument lock) raises `AS006` and takes nothing; a lock statement issued by hand in the wrong order is caught by the inventory test rather than deadlocking in production |
| **T-LOK-04** | **Affected set is stable.** With a merge or `SECURITY` apply holding the gate and its instruments, a concurrent (i) first record on an existing unclassified instrument, (ii) evidence insert, (iii) new instrument insert, (iv) new asset with a declared predecessor, (v) `DRAFT` wrapper link — each either waits or cannot yet affect safety; after commit the new record is elevated and sequenced after the event. The re-derivation after locking finds no growth in any run; when growth is forced (test hook) the transaction rolls back with `AS006` and no partial state |
| **T-LOK-05** | **No lock across a remote call.** During IAM-02 `execute-verify` (stub with an artificial delay) `pg_locks` shows no gate, asset, instrument or token lock held by the applying session — only, at most, the change row |
| **T-LOK-06** | **Privileges.** The runtime role can `SELECT … FOR SHARE/UPDATE` `lineage_gate`, `asset`, `instrument`, `governed_change` rows and cannot change `lineage_gate` (trigger `AS002`) |

## T-MYR — digital MYR, fail-closed with no override [v1.2: F21, AST-P-4]

| ID | Test |
|---|---|
| T-MYR-01 | A digital instrument with `attr_myr_denominated = true` ⇒ `NOT_ASSESSED`, `MYR_PAIR_CONTROL_UNRESOLVED`, for **every** subject in every environment; never `ELIGIBLE`; **not** `ASSET_NOT_ALLOWED`; no token (property test) |
| T-MYR-02 | **No override path:** no endpoint, role (including `SUPER_ADMIN`), configuration value, flag, hold release, admission or record clears it (route/schema/grant scan) |
| T-MYR-03 | Backstop B10: raw `allow` insert for a digital MYR instrument ⇒ `AS001` |
| T-MYR-04 | Precedence: a MYR-denominated privacy coin ⇒ `INELIGIBLE` `ASSET_NOT_ALLOWED`; a MYR-denominated `SECURITY` instrument ⇒ hard-rule `INELIGIBLE` for MB/PSO |
| T-MYR-05 | Consumer contract tests (stubs, DCR-AST1-004/-008(c)): a consumer given `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` does not activate the instrument or its pair; a `myr_denominated` **fiat** leg in a trading pair is denied without a recorded pair-level approval, and with no owner; a MYR payout rail is unaffected |

## T-RNP — real instruments and non-production classification [v1.2: F25, AST-R2-HD-01]

| ID | Test |
|---|---|
| T-RNP-01 | A **real** instrument with proposed `NON_SECURITY` under a non-production standard is refused at submit and apply (`AST1_EVIDENCE_STANDARD_NOT_PRODUCTION_APPLICABLE`); the DB trigger refuses a forced insert |
| T-RNP-02 | A forced real `NON_SECURITY` record (test DB without the trigger) with a non-production standard, in each of DEVELOPMENT/TEST/UAT/DEMO/PRODUCTION ⇒ every subject `NOT_ASSESSED` `REAL_INSTRUMENT_NON_PRODUCTION_BASIS`; no token; SQL B11 denies a raw `allow` |
| T-RNP-03 | A production-applicable standard later retired ⇒ collapse (`EVIDENCE_STANDARD_NOT_ESTABLISHED`) in every environment |
| T-RNP-04 | A real `SECURITY` or `UNRESOLVED` record under a non-production standard stays in force (restrictive) and counts for lineage |
| T-RNP-05 | A synthetic instrument under a non-production standard: `SYN→NON_SECURITY` derives as before in non-production (the testing route) and `INELIGIBLE` in PRODUCTION |
| T-RNP-06 | With no approved production-applicable standard (today), **no real instrument in any environment derives `ELIGIBLE` for any subject** (exhaustive) |

## T-SCH — schema shape (INV-03)

| ID | Test |
|---|---|
| T-SCH-01 | Introspect `information_schema.columns` for schema `ast1`: **no** column name matches `/eligib/i` except an allow-list `{eligibility_decision_log.eligibility_state, eligibility_decision_token.*}`; adding one fails the test |
| T-SCH-02 | No table/column named or defaulting to a classification outcome; `UNRESOLVED` appears only as a `CHECK` member on `classification_case`/`classification_record` |
| T-SCH-03 | `instrument.attr_*`, `amount_scale`, `declared_synthetic` are `NOT NULL` with **no default** |
| T-SCH-04 | No `DELETE` grant on any `ast1` table for the runtime role; no `UPDATE` on ledger/evidence/log/lineage merge |
| T-SCH-06 | **[F09]** `classification_record` has **no** synthetic-emulation column; `instrument_code`, `declared_synthetic`, `synthetic_emulates` are rejected on any UPDATE in every status |
| T-SCH-11 | **[v1.3: F28.c]** `lineage`: the runtime role has `INSERT, SELECT` only (privilege introspection); `synthetic` is `NOT NULL` with no default; `trg_lineage_immutable` exists for `UPDATE`, `DELETE` and `TRUNCATE` |
| T-SCH-12 | **[v1.3]** Trigger/grant/function inventory (the sweep's S10): `trg_lineage_immutable`, `trg_lineage_gate_immutable`, `trg_lineage_merge_apply`, `trg_evidence_server_order`, `trg_instrument_address_canonical`, `trg_instrument_asset_lock`, the token, key-immutability and identity triggers, `canonicalise_address`, the address CHECK and the class-correction marker trigger exist and are enabled; the runtime role has `EXECUTE` but not `OWNERSHIP` of the address functions |
| T-SCH-07 | `deployment_environment` is single-row, has no runtime `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` grant, **and `UPDATE`/`DELETE`/`TRUNCATE` are rejected by trigger for every role including the migration/bootstrap role** (`AS002`) [v1.2: F24] |
| T-SCH-08 | **[v1.2: F18]** `eligibility_decision_token`: the runtime role has `UPDATE` only on `consumed_at_utc`, `revoked_at_utc`, `revoked_reason` (privilege introspection) |
| T-SCH-09 | **[v1.2: F24]** Key-column immutability (05 §6 table): `UPDATE` of any key column of `product_admission`, `custody_support`, `instrument_operational_state`, `transfer_restriction_profile`, `transfer_restriction`, `jurisdiction_rule`, `instrument_hold` ⇒ `AS002`; the attestation table is append-only; an approved admission cannot be retargeted to another instrument, product or record by `UPDATE` |
| T-SCH-10 | **[v1.2: F17, F19; v1.3: F28.a]** Both canonical-identity unique indexes exist, are unconditional on `lifecycle_status`, and the boot check fails when either is missing or is scoped to non-retired rows; the canonical-address `CHECK` exists on `instrument` |
| T-SCH-05 | No FK or grant into other modules' schemas (F3(c)) |

## T-CLS — classification lifecycle

| ID | Test |
|---|---|
| T-CLS-01 | New instrument: derives `UNRESOLVED`; evaluating any product denies; no record exists |
| T-CLS-02 | Full happy path: propose → case → evidence → submit → IAM-02 approval → apply → record with `record_seq=1`; identity locked |
| T-CLS-03 | **[F05]** With an IAM-02 stub implementing the extended contract: maker ∈ attested approvers ⇒ rejected at the service and at the DB CHECK. **With a stub returning no approver identity ⇒ `AST1_APPROVER_ATTESTATION_MISSING`, nothing applied.** Governed classification apply is disabled in configuration until DCR-AST1-001(a)+(d) |
| T-CLS-04 | Checker who attached evidence ⇒ `AST1_CHECKER_CONFLICT` |
| T-CLS-05 | Approval bound to a different `payload_hash` ⇒ `AST1_APPROVAL_INVALID`; evidence added after request ⇒ `AST1_PAYLOAD_DRIFT`; change stays `requested`, retriable with a fresh approval |
| T-CLS-06 | Records append-only: UPDATE/DELETE via SQL rejected; `record_seq` gapless under concurrent submits (advisory lock/row lock test) |
| T-CLS-07 | Identity drift: mutate an identity column by direct SQL on a test DB without the trigger ⇒ derivation collapses to `UNRESOLVED` `CLASSIFICATION_IDENTITY_DRIFT` and integrity sweep places a system hold |
| T-CLS-08 | Identity edit after lock ⇒ `AST1_INSTRUMENT_IDENTITY_LOCKED` |
| T-CLS-09 | `elevated` and `elevated_basis` are computed **by trigger from the ledger** (own lineage and transitive underlying); an application-supplied `elevated=false` is ignored; two attested checkers (`COMPLIANCE_OFFICER` + `MLRO`) and new post-`SECURITY` evidence required (AST-HD-8) |
| T-CLS-10 | `SECURITY`/`SECURITY_TOKEN` class + `NON_SECURITY` ⇒ `AST1_CLASS_CLASSIFICATION_CONFLICT`; `TOKENISED_DEBT`/`TOKENISED_FUND` not rejected by class label (AST-HD-4) |
| T-CLS-11 | Reversion to `UNRESOLVED` record ⇒ all products `NOT_ASSESSED` |
| T-CLS-12 | Only one non-terminal case per instrument |
| T-CLS-14 | **Lineage [F06; v1.2: F19]:** a canonical identity registered in any status cannot be registered again (`AST1_INSTRUMENT_DUPLICATE_IDENTITY`; there is no continuity trigger to satisfy); a replacement contract enters via same-asset membership, a declared predecessor or a merge; lineage merge irreversible; real and synthetic lineages cannot merge; integrity sweep flags identity-uniqueness breaches (`ast1.integrity.lineage_gap_found`). Detailed suite: `T-LIN-*` |
| T-CLS-15 | **[v1.2: F22, AST-P-3]** `asset_class` frozen once an instrument exists (`AST1_ASSET_CLASS_FROZEN`); `ASSET_CLASS_CORRECTION` is the only change, keeps `lineage_id`, needs `COMPLIANCE_OFFICER` + `MLRO` when leaving `SECURITY`/`SECURITY_TOKEN`, never crosses the fiat boundary, recomputes the cached fingerprint so earlier records become unusable — **[v1.3: F26] `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when explained by the governing marker (no hold), `CLASSIFICATION_IDENTITY_DRIFT` only when unexplained**, visible to SQL as B12 — revokes tokens, and a new (elevated where applicable) classification is then required. Detailed suite: `T-FPR-*` |
| T-CLS-16 | **[v1.2: AST-P-3]** `SECURITY`/`SECURITY_TOKEN`-labelled class + `NON_SECURITY` is refused for the labelled class **only**: `TOKENISED_DEBT`, `TOKENISED_FUND` and all other classes are unaffected (AST-HD-4); a mislabelled class on a registered contract has **no** same-contract re-registration route — only `ASSET_CLASS_CORRECTION` or a replacement contract under lineage |
| T-CLS-17 | **[v1.2: F20]** Reaffirmation: a `RECLASSIFICATION` case on a `NON_SECURITY` sibling whose proposed outcome equals its current one is accepted only through the elevated path and, once applied, clears `LINEAGE_SECURITY_REVIEW_REQUIRED` for determinations **and merges** older than the new record (T-LIN-20/21). **[v1.3: F27]** |
| T-CLS-18 | **[v1.3: F27]** A merge-triggered reaffirmation is one case kind with the same approvals as the sibling reaffirmation (M + `COMPLIANCE_OFFICER` + `MLRO`); its `submit` response lists the triggering merge as the review floor and the binding it will record |
| T-CLS-13 | Submission gate: stablecoin without known backing ⇒ `INSTRUMENT_PROFILE_INCOMPLETE`; missing precision ⇒ `ASSET_PRECISION_INVALID` |

## T-EVD — evidence standard (R4-Q3 modelled, not answered)

| ID | Test |
|---|---|
| T-EVD-01 | PRODUCTION config: submitting/applying a classification with no approved production standard ⇒ `EVIDENCE_STANDARD_NOT_ESTABLISHED`; instrument stays `UNRESOLVED` |
| T-EVD-02 | A standard applicable to PRODUCTION cannot reach `APPROVED` without `r4q3_resolution_ref` (DB CHECK) |
| T-EVD-03 | **[v1.2: F25]** A non-production standard allows classification of **synthetic** instruments and the **restrictive** outcomes of real instruments in DEV/TEST/UAT/DEMO; it **cannot** carry a real `NON_SECURITY` (T-RNP-01) |
| T-EVD-04 | Retiring a standard ⇒ system holds on instruments relying on it (in covered environments) |
| T-EVD-05 | No evidence-standard row exists after migrations (nothing seeded APPROVED) |
| T-EVD-06 | `features_assessment` validated against the standard's own schema; AST-01 contains no hard-coded securities-features checklist (grep test on source) |

## T-SYN — synthetic instruments (INV-07, `AST-SRS-001A`, AST-HD-3) [F09]

| ID | Test |
|---|---|
| T-SYN-01 | Synthetic outcome in `PRODUCTION` ⇒ all subjects `INELIGIBLE` `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, critical event, SYSTEM hold |
| T-SYN-02 | Real instrument + synthetic outcome ⇒ refused; synthetic instrument + `NON_SECURITY`/`SECURITY` outcome ⇒ refused (no promotion path) |
| T-SYN-03 | `declared_synthetic ⇔ synthetic_emulates IS NOT NULL ⇔ code ~ '^SYN[.-]'` (CHECKs, all directions) |
| T-SYN-04 | **Single source of truth:** there is no emulation column on the record; a record cannot contradict the instrument. `synthetic_emulates` valid only for a declared synthetic instrument |
| T-SYN-05 | `instrument_code`, `declared_synthetic`, `synthetic_emulates` **immutable from INSERT** — UPDATE rejected in `DRAFT` and every later status |
| T-SYN-06 | Synthetic→SECURITY in non-production: Spot/OTC/Pay/MB custody never eligible (T-SEC-01); securities-route subjects derive normally (T-DER-09) |
| T-SYN-07 | Restoring a non-production DB into a PRODUCTION-config service: every record's `recorded_environment` (trigger-filled from `deployment_environment`) ≠ PRODUCTION ⇒ everything collapses to `UNRESOLVED` (INV-08) |
| T-SYN-08 | Synthetic evidence cannot enter a real instrument's bundle; synthetic and real lineages never merge |

## T-ENV — environment handling (INV-06)

| ID | Test |
|---|---|
| T-ENV-01 | Own environment used, not the caller's; caller asserts `dev` against a `prod` service ⇒ deny `environment_mismatch`, log row carries authoritative value, critical event, **no token** |
| T-ENV-02 | `staging` and unknown ⇒ PRODUCTION behaviour |
| T-ENV-03 | Token issued under one environment does not verify under another (`AST1_DECISION_BINDING_MISMATCH`) |
| T-ENV-04 | Control parity: identical derived output in all five environments for a non-synthetic instrument with identical state |
| T-ENV-05 | Permanently prohibited/security request with mismatched environment denies as the hard-rule/prohibited reason, not as mismatch (precedence, as `MIG-004`) |

## T-CNJ — conjunct controls (narrow-only)

| ID | Test |
|---|---|
| T-CNJ-01 | Prohibited attributes (`privacy_coin`, `algorithmic_stablecoin`, `yield_bearing`, `derivative_like`, `ALGORITHMIC` backing) each ⇒ `ASSET_NOT_ALLOWED`; no endpoint or role (incl. Super Admin) can clear one. **[v1.2: F21]** Digital `myr_denominated` is **not** in this list: it is `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` (T-MYR). Fiat `myr_denominated` is an attribute only (T-FIA-06) |
| T-CNJ-02 | Admission requires `PERMITS` for the **current** record; approved admission against a superseded record ⇒ inert `PRODUCT_ADMISSION_NOT_APPROVED`; **an admission never converts `INELIGIBLE`/`NOT_ASSESSED` into `ELIGIBLE`** (AST-HD-2) |
| T-CNJ-03 | Jurisdiction: `BLOCK`, `ALLOW_ONLY`, missing jurisdiction with `ALLOW_ONLY` ⇒ `CLIENT_JURISDICTION_REQUIRED`; no rule + `jurisdiction_assessed=false` cannot approve admission |
| T-CNJ-04 | Transfer restriction: `effect` other than `DENY` rejected (CHECK); `UNASSESSED` profile blocks RWA/secondary/Exchange and security-outcome withdrawal; published `restrictions` list returned to caller |
| T-CNJ-05 | Custody: no enum value for AIX self-custody; `NOT_SUPPORTED`/absent ⇒ deposit/withdrawal not eligible |
| T-CNJ-06 | Operational state `ENABLED` requires an approved governed change (CHECK); **every human-initiated change, including suspend/disable, is maker-checkered** (INV-09); only SYSTEM/SERVICE origins apply without human approval, from an enumerated allow-list |
| T-CNJ-07 | Attestation from `EXM-01` for a non-security instrument, or bound to a non-current record ⇒ `AST1_ATTESTATION_INVALID`; later classification record ⇒ attestation inert (`ast1.securities_market_admission.stale`) [F13] |
| T-CNJ-08 | Precision: `amount_scale > on_chain_decimals` ⇒ `ASSET_PRECISION_INVALID`; scale immutable after lock |
| T-CNJ-09 | Network not in registry ⇒ `AST1_NETWORK_NOT_REGISTERED`; duplicate canonical identity **in any status** (token contract; native `(chain, network)`) ⇒ `AST1_INSTRUMENT_DUPLICATE_IDENTITY`; address canonicalisation makes case/format variants collide; `POST /instruments/validate` persists nothing and consumes no identity [v1.2: F17, F19.E] |
| T-CNJ-10 | Underlying: self-reference/cycle rejected; `ALGORITHMIC` requires the attribute (cycle, depth and real↔synthetic detail in T-LIN-04) |

## T-HLD — holds and revocation [F07, AST-HD-6]

| ID | Test |
|---|---|
| T-HLD-01 | A **human** hold requires an approved governed change (CHECK `hold_origin='HUMAN' ⇒ placed_change_id`); there is **no single-actor human path**; release is maker-checker |
| T-HLD-02 | A hold **writes no classification record and leaves `effective_outcome` unchanged**; response shows `hold: true`, reason `INSTRUMENT_ON_HOLD` |
| T-HLD-03 | **System** holds fire immediately with no approval for: **unexplained** fingerprint mismatch (a governed correction awaiting reclassification places **none**, T-FPR-05), non-canonical/colliding contract identity, a failed lineage propagation, synthetic-in-PRODUCTION, standard retirement, backstop trip, sweep anomalies. **[v1.2: F24]** After a backstop trip the hold is written by the application in a **separate** transaction — never by the raising trigger (T-CON-11) |
| T-HLD-04 | Outstanding tokens revoked on hold; release restores nothing beyond removing the conjunct |
| T-HLD-05 | Held `SECURITY` instrument: MB/PSO subjects still return the hard-rule reason (hold does not mask it) |

## T-TOK — evaluate/verify

| ID | Test |
|---|---|
| T-TOK-01 | Token single-use under concurrency (N parallel verifies ⇒ exactly one success); **TTL 60 s**; a token is not reusable across routing attempts (AST-HD-10) |
| T-TOK-02 | Expired token rejected (clock injected; the DB clock also rejects at consume); `payload_binding`, **subject, consumer, instrument, record-id, client facts, caller/client reference** mismatch rejected (T-DOM-*, T-PLD-*) |
| T-TOK-03 | Only `allow` mints; deny returns `token: null`; DB CHECK on token `decision` |
| T-TOK-04 | Every evaluate outcome writes exactly one log row incl. unresolved instrument |
| T-TOK-05 | Internal error/timeout in evaluate ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`, never allow |

## T-API — contract and boundary

| ID | Test |
|---|---|
| T-API-04a | Fiat: no classification, eligibility-setting or admission route accepts a fiat instrument; `GET /currencies/{iso}` is the fiat surface [F08] |
| T-API-01 | No request or response schema in the OpenAPI/zod set contains an eligibility-setting field; the only eligibility fields are derived outputs |
| T-API-02 | Every eligibility response contains `conjunct` and `not_evaluated` (INV-10); never `access`/`granted` |
| T-API-03 | Unlisted service identity ⇒ `SERVICE_IDENTITY_REQUIRED` before any state read |
| T-API-04 | Idempotent replay returns the original result; fingerprint mismatch errors |
| T-API-05 | Stale `expected_version` ⇒ `AST1_VERSION_CONFLICT` |

## T-BND — module boundary (INV-13, INV-14)

| ID | Test |
|---|---|
| T-BND-01 | `findProhibitedExchangeRoutes(ast1RouteTable)` returns empty; boot self-test present |
| T-BND-02 | Import test: no `services/*` source from another service imported; only `@aix/foundation` |
| T-BND-03 | AST-01 exposes no order, matching, quoting, pricing, ledger-posting or issuance function (route and export scan) |
| T-BND-04 | **[F15]** The word `exchange` appears in no AST-01 route path and no new `exchange.*` identifier is introduced; the enum value **`EXCHANGE` does not exist** — the domain is `SECURITIES_MARKET`; grep test over source and schema |

## T-AUD — audit and evidence (INV-12)

| ID | Test |
|---|---|
| T-AUD-01 | Each state-changing route emits its 08 event in the same transaction (kill the process between write and publish ⇒ neither persists) |
| T-AUD-02 | Decision-log row contains record id/seq and matrix version for every decision; reconstruction test rebuilds "why" from ledger + log alone |
| T-AUD-03 | No evidence bytes, raw tokens or client ids in audit metadata (secret-scan test on captured events) |
| T-AUD-04 | Decision log and classification tables reject UPDATE/DELETE |

## T-DB — database backstops (run against a real migrated DB)

`T-DB-01` identity immutability trigger **and immutability of `instrument_code`/`declared_synthetic`/`synthetic_emulates` from insert**; `T-DB-02` lifecycle transition guard (no `IDENTITY_LOCKED → DRAFT`); `T-DB-03` `record_seq` gapless/unique; `T-DB-04` class/outcome trigger; `T-DB-05` standard applicability trigger; `T-DB-06` `governed_change` CHECK: a `HUMAN` change is `applied` only with attested approvers/policy and maker ∉ approvers, for **both** directions (no TIGHTEN exemption); `T-DB-07` partial unique index (one open case; one live admission per instrument/product); `T-DB-08` privilege matrix (05 §10); `T-DB-09` **SQL backstop ⇄ TS matrix parity (T-SEC-12)**; `T-DB-10` `classification_record` trigger recomputes `recorded_environment`, `lineage_id`, `elevated`, ignoring supplied values; `T-DB-11` attestation/admission binding to the current record; **[v1.2]** `T-DB-12` token immutability and the consumption trigger (T-CON-01…03); `T-DB-13` key-column immutability triggers (T-SCH-09); `T-DB-14` `deployment_environment` immutability for every role (T-SCH-07); `T-DB-15` asset/instrument lineage- and identity-critical triggers and both unique indexes (T-LIN-01/05, T-SCH-10); `T-DB-16` `lock_instrument` / `lock_affected_instruments` ordering (T-CON-07/12); `T-DB-17` backstop B8–B11 parity with the TS matrix and B9 with the TS allow-list; **[v1.3]** `T-DB-18` B12 and `record_fingerprint_matches` (T-FPR-01/08/09); `T-DB-19` `merge_global_seq` assignment and the merge trigger (T-LIN-23); `T-DB-20` canonical-address CHECK and trigger (T-ADR-01…05); `T-DB-21` evidence sequence and elevated-evidence rule (T-ADR-06…10); `T-DB-22` `lineage` immutability (T-ADR-11/12, T-SCH-11); `T-DB-23` lock helpers with level tracking (T-LOK-*).

## T-INT — integrity sweep

`T-INT-01` detects fingerprint drift; `T-INT-02` detects orphaned admissions; `T-INT-03` detects synthetic rows in PRODUCTION; `T-INT-04` idempotent and non-destructive (only places holds/emits events); `T-INT-05` **[v1.2]** detects an identity-uniqueness breach and a current real `NON_SECURITY` record lacking `UNDERLYING_LINEAGE` (T-LIN-14); **[v1.3]** `T-INT-06` distinguishes **explained** from **unexplained** fingerprint mismatch: a verified correction marker ⇒ no hold, informational event; no/forged marker ⇒ `SYSTEM` hold (T-FPR-04/05); `T-INT-07` lineage review via the **merge-introduced** case and the underlying case: explained (no control failed) ⇒ no hold and `lineage_review_pending`; divergence, a live token, a missing governing change/propagation audit, or a non-elevated record after security history ⇒ `SYSTEM` hold `LINEAGE_REVIEW_GAP` + `lineage_gap_found` (T-LIN-19, S5–S7); `T-INT-08` canonical-address re-canonicalisation and collision detection (T-ADR-05); `T-INT-09` ledger-order break and trigger/grant inventory (S8, S10); `T-INT-10` the sweep never rewrites a row and is idempotent; **safety does not depend on the sweep** — every T-LIN/T-FPR safety assertion above is made with the sweep disabled.

## T-ERR

`T-ERR-01` every thrown code has HTTP mapping and is documented in 09; `T-ERR-02` every reason code length ≤ 48 (column width); `T-ERR-03` master-defined codes spelled verbatim.

## Non-goals of this suite

No trading, matching, ledger, issuance or venue tests (other modules). No test asserts that any real asset is or is not a security. No test depends on `R4-Q*` being answered.
