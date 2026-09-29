# AST-01 — 02 Workflow (v1.8)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Refines `WF-35` (Workflow Map v1.3 §33F) and interlocks with `WF-31`, `WF-32`, `WF-34`. `WF-35`'s later states (`eligibility_derived`, `operationally_eligible`, `activated`) are derived views or other modules' states, not AST-01 stored states (06 §9). Changes from v1.0 tagged **[v1.1: Fnn]**; from v1.1 tagged **[v1.2: Fnn]**; from v1.2 (round-3 review) tagged **[v1.3: Fnn]**; from v1.3 (round-4 review) tagged **[v1.4: Fnn]**; from v1.4 (round-5 review) tagged **[v1.5: Fnn]**.

Legend: **M** maker, **C** checker (IAM-02 approval, attested approver identity — 01 §4.8), **sys** system origin (integrity), **svc** service identity.

---

## W1. Instrument registration (`WF-35` steps 1–2)

| Step | Action | Actor | Rule |
|---:|---|---|---|
| 1 | Create issuer reference (if needed) | `RWA_OPERATIONS_OFFICER` / `ADMIN` | Descriptive only |
| 2 | **Create asset with a predecessor declaration** [F06] | same | `NONE_DECLARED` (attested; states `lineage_synthetic`) or `SAME_ECONOMIC_SUBJECT(ref)` → lineage assigned, **immutable from creation** [F19.D]; `lineage.synthetic` is fixed at this insert and can never be updated [v1.3: F28.c] |
| 3 | Create instrument `DRAFT` | same | Every `attr_*`, `amount_scale`, `declared_synthetic`/`synthetic_emulates` stated, **the last two and the code immutable from this insert** [F09]. Network in registry; contract canonicalised **and validated by the database** — a value that is not already canonical for the network's registered rule is rejected (`AST1_ADDRESS_NOT_CANONICAL`), never stored under a second spelling [v1.3: F28.a]; the instrument insert takes `lock_asset(asset_id, SHARE)` (via `trg_instrument_asset_lock`), so it cannot race an asset-class change [v1.3; helper form v1.7: F38]. **A canonical identity (token contract, or native `(chain, network)`) already registered in any status — including retired or abandoned — is rejected; there is no same-contract recreation** [F19.A/E]. `asset_id`, form, chain, network and contract are **immutable from this insert** [F19.D]. Run `POST /instruments/validate` first: a mistake in an insert-immutable field can only be abandoned, which consumes the identity (OQ-8) |
| 4 | Add underlying reference(s) | same | Stablecoin needs known backing before submission. An **instrument-to-instrument link is insert-only** (a lineage signal, cannot be removed) and, on the **linking (source)** side, `DRAFT`-only [F19.B/D]. **[v1.6: F37]** The **target** instrument named by the link must already be non-`DRAFT` (`IDENTITY_LOCKED` or `RETIRED`) — a link to a still-`DRAFT` target is refused (`AST1_UNDERLYING_TARGET_NOT_LOCKED`), so a wrapper's underlying chain is always already link-set-frozen at the moment it is referenced. **[v1.7: F40]** Both the source-`DRAFT` and the target-non-`DRAFT` checks are made by the database trigger `trg_underlying_insert_guard` **after it has itself locked both endpoint instruments** (`lock_instruments({source, target}, UPDATE)`), so they hold even for a raw insert that bypasses this workflow |
| 5 | Edit draft | same | Identity only in `DRAFT` |
| 6 | **Fiat:** register as reference data (`FIAT`, precision, MYR attribute, references) | same | No case, no admission, no eligibility [F08] |

Creation grants nothing: with no valid classification the instrument is `UNRESOLVED` and every subject denies (INV-02).

## W2. Classification (`WF-35` steps 2–4, `ASSET-RULE-002` rule 4)

```
DRAFT ─► open case ─► evidence ─► submit (M; computes `elevated`, lineage candidates) ─► IAM-02 approval (C, attested)
       ─► apply ─► record appended       │ reject / cancel ─► case closed; classification unchanged
```

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Open case (`INITIAL`/`RECLASSIFICATION`) | `INSTRUMENT_CLASSIFIER` | One open case per instrument; refused for fiat |
| 2 | Attach evidence | Classifier | Immutable, hashed |
| 3 | Declare proposed outcome, rationale, features assessment | `INSTRUMENT_CLASSIFIER` (M) | Validated against the approved evidence standard; `SECURITY_LABELLED` + `NON_SECURITY` refused [01 §3.4]; completeness gate |
| 4 | **Submit** — identity locks; `payload_hash`; **`elevated` computed from the lineage ledger** [F06]; lineage candidates listed | M | Payload binds instrument, fingerprint, lineage, outcome, bundle hash, standard, environment |
| 5 | Approval | `COMPLIANCE_OFFICER` (+ `MLRO` if `elevated`) (C) | **Approver identities must be IAM-02-attested** [F05]; maker ∉ approvers; checker who attached evidence excluded |
| 6 | **Apply** — recheck fingerprint/standard/lineage; append record (triggers recompute environment, lineage, `elevated`); revoke tokens if any subject narrows | sys | **Disabled until DCR-AST1-001(a)+(d) delivered** [F05] |
| 7 | Consumers see the new effective classification on their next evaluation; tokens for the instrument are stale | — | `verify-decision` revalidates against the current record id |

**Production:** step 3 cannot complete without an `APPROVED` PRODUCTION-applicable evidence standard, which requires `R4-Q3` to be answered by governance. **[v1.2: F25, `AST-R2-HD-01`]** A real instrument's `NON_SECURITY` needs a **production-applicable** standard in every environment; there is no provisional real classification. Non-production product testing uses **synthetic** instruments (W10). A non-production classification is never evidence in PRODUCTION (INV-08).

## W3. Reclassification, reversion, lineage [F06, AST-HD-8]

`elevated` = a real `SECURITY` determination anywhere in the instrument's lineage **or in the lineage of an instrument it wraps** (01 §4.7).

| Change | Approval |
|---|---|
| `UNRESOLVED → NON_SECURITY` where **not** `elevated` | M + `COMPLIANCE_OFFICER` |
| **Any** `→ NON_SECURITY` where **`elevated`** (including `SECURITY → UNRESOLVED → NON_SECURITY`, a replacement contract/asset in the same lineage, a wrapper of a security-determined instrument, and **reaffirmation of a sibling** held by `LINEAGE_SECURITY_REVIEW_REQUIRED`; retire→recreate on one contract is impossible) | M + `COMPLIANCE_OFFICER` **and** `MLRO`; **[editorial, v1.4]** ≥ 1 evidence item whose DB-assigned `evidence_global_seq` exceeds the **review floor** — the newest triggering event over every basis tree, which is a real `SECURITY` record's `global_seq` **or** the `merge_global_seq` of a merge that joined security history, whichever is newer (01 §4.7A) — **[v1.5: F35.b; wording pinned v1.6: F39(c)]** not reusing evidence whose `content_sha256` appears in the evidence bundle of **any** real (non-synthetic) `SECURITY`/`SECURITY_TOKEN` classification record in `SEC(G)`, for **every** relevant basis tree `G ∈ B(X)` — the exact statement of 05 §5.1 trigger 7(iii) and 01 §4.7 item 2; not "the newest" one (unkeyed, ambiguous) and not "qualifying" without defining it (v1.5's wording here, now withdrawn); "lineage reviewed" attested |
| `→ SECURITY`, `→ UNRESOLVED` | M + `COMPLIANCE_OFFICER` (a hold may bridge the gap) |
| Lineage merge | M + `COMPLIANCE_OFFICER`; irreversible; the only governed lineage operation [F19.D]. **[v1.3: F27] It narrows in its own transaction** (W12): every affected `NON_SECURITY` instrument whose review predates the joined security history becomes `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED`, tokens revoked. Clearing it is the **merge-triggered elevated reaffirmation** row below |
| **Merge-triggered elevated reaffirmation / review [v1.3: F27]** (`→ NON_SECURITY` again, or `SECURITY`/`UNRESOLVED`, on an instrument held by `LINEAGE_SECURITY_REVIEW_REQUIRED` because of a merge or a newer `SECURITY` record) | M + `COMPLIANCE_OFFICER` **and** `MLRO`; ≥ 1 evidence item with `evidence_global_seq` newer than the **review floor** (the newest triggering record *or merge*); the case is bound to that event (`follows_event_*`); "lineage reviewed" attested. A pre-merge record, or a reaffirmation without these, never clears it |
| `ASSET_CLASS_CORRECTION` (mislabelled class, AST-P-3) | M + `COMPLIANCE_OFFICER`; **+ `MLRO` when leaving `SECURITY`/`SECURITY_TOKEN`**; lineage preserved. **[v1.3: F26]** Applied by W13: every instrument of the asset is locked, tokens revoked (`asset_class_corrected`), earlier records become unusable in SQL (B12); `NOT_ASSESSED` `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` until a **new** governed classification (elevated where the lineage holds a `SECURITY` record) |

On apply of a record that ends eligibility for any subject, AST-01 revokes outstanding tokens and emits `ast1.eligibility.instrument_revoked`. For a **real `SECURITY` record**, apply first locks every affected instrument (lineage siblings and wrappers, ascending) and revokes their tokens too (W11). AST-01 does not cancel orders; consumers cancel or re-check in-flight work.

## W4. Holds [F07, AST-HD-6]

```
System-detected integrity failure ─► SYSTEM hold ─► INSTRUMENT_ON_HOLD immediately
Human concern ─► hold REQUEST (M) ─► IAM-02 approval (C) ─► HUMAN hold ─► INSTRUMENT_ON_HOLD
release (either origin): M + C ─► classification unchanged throughout
```
A hold **never** changes the classification outcome; a held `SECURITY` instrument still returns the MB-domain hard-rule reason. System holds fire on: **unexplained** fingerprint drift (a governed `ASSET_CLASS_CORRECTION` awaiting reclassification is expected: `NOT_ASSESSED`, no hold, W13), non-canonical or colliding contract identity, a lineage-propagation gap, synthetic-in-PRODUCTION, evidence-standard retirement, backstop trip (**placed by the application in a separate transaction after it catches the database error — the rolled-back transaction cannot persist it** [F24]), sweep anomalies. **No single-actor human hold exists** until the Role Matrix establishes one (DCR-AST1-006); `SYS-RULE-008` and the kill switch are precedent only.

## W5. Product admission (`WF-35` step 5)

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Request admission for (instrument, product), attesting `jurisdiction_assessed` | analyst/ops | Refused unless the matrix currently says `PERMITS` for the **current** record |
| 2 | Approve | `COMPLIANCE_OFFICER` (C) | Bound to `classification_record_id`; **DB trigger re-checks against the ledger** [F04] |
| 3 | Suspend / withdraw / re-approve | M + C | Human-initiated ⇒ maker-checker [F07] |

A newer classification record leaves the admission **inert** (never `ELIGIBLE`). Admission is not production activation (`DEC-014`). Pair activation is outside AST-01 (OQ-6).

## W6. Operational enablement (`WF-35` step 6) [F01]

Custody support approval (domain `MB_PSO` or `SECURITIES`) → operational state enable per domain-scoped subject → all M + C. Enabling an `MB_PSO` subject for a security outcome is refused by the backstop. Defaults `DISABLED`/`UNASSESSED`; absence denies.

## W7. Eligibility evaluation on an execution path

```
consumer (allow-listed for the subject)
  ─► evaluate {ONE canonical instrument selector, subject, consumer_service, client_facts, caller_ref}
      AST-01: canonical resolution (0 / >1 ⇒ deny, no token) → FIAT form? → not_applicable │ own environment → effective classification → hard rule → matrix → conjuncts
              → log (SQL backstop reads the ledger) → token bound to subject/domain/consumer/instrument/env/record
  ─► consumer ALSO evaluates CFG-01 (features/environment/activation) and IAM-02 (permission)
  ─► immediately before EACH routing/execution attempt: verify-decision (single use; subject/instrument/consumer/client-facts bound;
     ONE transaction, instrument lock first, SQL backstop re-run at the consuming UPDATE — 05 §7A)
```
`evaluate` is advisory; `verify-decision` gates. AST-01 unavailability is **deny** for the consumer. A token is **not** an order-lifetime entitlement: pending orders re-evaluate and re-verify at each attempt (`DEC-012` cl. 1 rule 5).

## W8. Securities-market admission attestation and `WF-32` sequencing [F13]

```
EXM-01 (WF-32 step 1) ─► evaluate SECONDARY_MARKET  (AST-01 steps 2–3; no attestation dependency)
   ─► admission review (step 4) ─► EXM-01 posts attestation (bound to the CURRENT record)
   ─► SECURITIES_MARKET can now derive ELIGIBLE (synthetic in non-production; real: NOT_ASSESSED, 01 §5.3⁵)
   ─► CFG-01 production gate (step 7)
```
Reclassification makes the attestation inert until re-attested. No circularity.

## W9. Evidence standard lifecycle

`DRAFT → APPROVED (M + C) → RETIRED`; PRODUCTION-applicable needs `r4q3_resolution_ref`. Retirement ⇒ SYSTEM holds on instruments relying on it.

## W10. Synthetic instrument lifecycle

Created `declared_synthetic` with `SYN-` code and `synthetic_emulates` (immutable from insert) in non-production; classified `SYNTHETIC_TEST_INSTRUMENT` with full control parity (Doc 00 §21A rule 7); may exercise the whole lifecycle including the securities route; **never** promoted; all-`INELIGIBLE` and a SYSTEM hold in PRODUCTION. To onboard the real analogue, W1–W2 start again on real evidence; the real instrument has its own (real) lineage and never inherits from the synthetic. **This is the only route for non-production product testing of eligible instruments** (`AST-R2-HD-01`): a provisional real-asset classification is never used to enable Spot/OTC/RWA/securities-market actions.

## W11. Real `SECURITY` record in a lineage [F20; v1.3: F27; v1.4: F31]

```
apply of a real SECURITY record on instrument A (elevated or not)
  A (OUTSIDE any DB transaction) [v1.8: F45]: unlocked read of the change; local prechecks; recompute payload_hash; IAM-02 execute-verify; capture verified_payload_hash + attested evidence — no AST lock, no open transaction
  0 BEGIN; G: lock_governed_change(change_id) — the FIRST lock in the transaction; re-read the change under it: still requested, payload immutable,
    recomputed payload_hash = verified_payload_hash, evidence still satisfies policy (else fail closed; a retry needs fresh IAM-02 verification)
  1 lock_lineage_gate_exclusive(); UNDER the gate, derive the full affected set — A itself, every member of A's merge tree,
    and every instrument wrapping any of them — from asset/underlying rows (no instrument lock needed to read them;
    stable NOT because "any newcomer is necessarily record-less" [v1.5 editorial reason, FALSE per F37: a late DRAFT
    underlying link can make a CLASSIFIED wrapper a newcomer] — but because every underlying link's TARGET must
    already be non-DRAFT (F37, 05 §4.3): a classified instrument's own underlying set is frozen, and every instrument
    it targets was already frozen when linked, so the underlying-LINK graph itself never changes after the relevant identity
    locks; lineage merges (which this same gate already serialises) change the lineage/merge-tree security history
    associated with nodes — the merge-tree roots that B(X) is read through — handled separately by F27 [v1.7 editorial]; the set is still re-derived after locking, AS006 if it grew [v1.6: F37 — corrected]); then lock the
    WHOLE set, A included, ascending id, lock_affected_instruments(A) → lock_instruments(set, UPDATE), in ONE pass — A is never locked first on its own [v1.4: F31];
    re-derive the set after locking, AS006/retry if it grew
  2 append the record (triggers: record_seq, global_seq after the locks, elevated / elevated_basis / review floor, standard checks)
  3 revoke outstanding tokens of A and of every affected instrument whose review predates the record (revoked_reason = lineage_security_determination) — via lock_instrument_tokens under the held instrument locks
  4 audit: ast1.lineage.security_determination_propagated (critical; trigger = RECORD) + instrument_revoked per instrument   — same transaction
  ─ effect, at commit, with no further write: every linked real NON_SECURITY instrument whose current record is older derives
    NOT_ASSESSED LINEAGE_SECURITY_REVIEW_REQUIRED (conjunct C0b) and SQL backstop B8 denies
  ─ release: the instrument gets a NEWER record through the elevated path (two attested checkers, evidence newer than the review floor, bound to the triggering event, "lineage reviewed")
```
No instrument's classification is rewritten. Nothing except a newer elevated record clears the conjunct. **[v1.4: F31]** Locking the full set in one ascending pass — rather than A first, then the rest — is what keeps this writer's lock order compatible with `ASSET_CLASS_CORRECTION` and evidence-standard retirement, which also lock their sets purely ascending (05 §7A "Cycle analysis"); v1.3's self-first order could deadlock against either.

## W12. Lineage merge apply [v1.3: F27; reordered v1.4: F30.b]

```
governed change LINEAGE_MERGE approved (M + COMPLIANCE_OFFICER, IAM-02-attested)
  A  (OUTSIDE any DB transaction) [v1.8: F45] unlocked read; local prechecks; IAM-02 execute-verify bound to the recomputed payload_hash; capture evidence — no AST lock, no open transaction
  G  BEGIN; lock_governed_change(change_id) — first lock in the transaction; re-read under it: still requested, payload immutable, payload_hash = verified_payload_hash, evidence still satisfies policy
  1  lock_lineage_gate_exclusive()                                                  [v1.4: F30.b] — taken BEFORE any root/cycle decision
  2  resolve both arguments to current lineage ROOTS, UNDER the gate (real/synthetic must agree; same root ⇒ refused AS004 —
     this is what stops two racing opposite raw merges from ever forming a cycle, 05 §3)
  3  enumerate affected instruments = every instrument of both merge trees + every instrument whose transitive underlying chain reaches either tree;
     lock_merge_affected_instruments(surviving, merged) — UPDATE, ascending instrument_id; re-derive the set (AS006 / retry if it grew)
  4  AUTHORISED: mark the change applied; INSERT lineage_merge
       └ trigger: re-runs the gate/root/lock sequence (idempotent re-lock on the protocol path: physical requests still issued, return immediately), then assigns merge_global_seq
         from ast1.classification_global_seq; the caller supplies none
  5  narrowed set := every affected real instrument for which lineage_review_required (05 §7, clauses (a)/(b)) is now true
     (older SECURITY joined to newer NON_SECURITY; newer SECURITY + older NON_SECURITY; wrappers through the underlying tree)
  6  revoke every outstanding token of the narrowed set (lineage_security_determination) — instruments already held UPDATE; tokens via lock_instrument_tokens, ascending (instrument_id, token_hash) [v1.7: F38.5]
  7  audit, same transaction: ast1.lineage.merged, ast1.lineage.security_determination_propagated (trigger = MERGE), instrument_revoked ×n
  8  COMMIT — the merge itself has narrowed; no sweep or later step is required
```
Any failure rolls back everything (no merge row, no revocation). A concurrent mint or consume for an affected instrument either commits first (the merge then finds and revokes its token) or sees the merge and denies. **[v1.4: F30.b]** Resolving roots only after the gate is held means a raw caller that skips the application's own steps still cannot make a security-relevant decision (which roots, whether they already coincide) from a read taken before the gate.

## W13. `ASSET_CLASS_CORRECTION` apply [v1.3: F26; v1.4: F29; v1.5: F33]

```
governed change ASSET_CLASS_CORRECTION approved (M + COMPLIANCE_OFFICER; + MLRO when leaving SECURITY/SECURITY_TOKEN)
  A  (OUTSIDE any DB transaction) [v1.8: F45] unlocked read; local prechecks; IAM-02 execute-verify bound to the recomputed payload_hash; capture evidence — no AST lock, no open transaction
  G  BEGIN; lock_governed_change(change_id) — first lock in the transaction; re-read under it and re-verify (requested, payload immutable, hash = verified_payload_hash, evidence)
  1  lock_asset(asset_id, UPDATE)                                              (a concurrent first-instrument insert holds lock_asset(…, SHARE): exactly one order)   [v1.7: F38 — helper, not a raw SELECT]
  2  lock_asset_instruments(asset_id) — EVERY instrument of the asset, UPDATE, ascending instrument_id; re-derive the set
  3  re-verify preconditions under the locks (from/to, not crossing FIAT, approval strength)
  4  mark the change applied; UPDATE asset_class [v1.5: F33 — trg_asset_class_frozen calls lock_asset(asset_id, UPDATE) again — an
     IDEMPOTENT re-lock: the exact key/mode is tracker-held from step 1, so no level check and no AS006 [v1.7: F38.4] — the physical FOR UPDATE request is still issued and returns at once [v1.8: F42] —
     and branch (b) itself re-locks every instrument of the asset before permitting this statement, an idempotent re-lock here since step 2 already holds them (physical requests return at once),
     so this precondition is SQL-enforced even for a writer that skipped steps 1-3] ── this statement alone is what
     B12's independent class-binding check (below) now compares against [v1.4: F29] ── ; recompute each instrument's
     cached identity_fingerprint; INSERT one class_correction_marker per classified instrument (governing change
     reference); deferred constraint rejects the commit if the fingerprint write did not actually change or the
     marker does not chain to it
  5  revoke every outstanding token of every instrument of the asset (asset_class_corrected) — tokens via lock_tokens / lock_instrument_tokens, ascending (instrument_id, token_hash), after the instrument locks [v1.7: F38.5]
  6  audit, same transaction: ast1.asset.class_corrected, instrument_revoked ×n     — NO system hold: this is a governed, expected state
  7  COMMIT — from here SQL rule B12 denies any allow-insert, consumption, admission approval or attestation relying on the old record —
     [v1.4: F29] through EITHER the fingerprint mismatch OR the class-binding mismatch, independently, so a defect in the fingerprint
     recompute of step 4 does not reopen eligibility: step 4's UPDATE asset_class is unconditional
  ─ afterwards: instruments are NOT_ASSESSED CLASSIFICATION_REQUIRED_AFTER_CORRECTION until a NEW governed classification (W2/W3) is applied
    into SECURITY-labelled class: only SECURITY / UNRESOLVED can be recorded; out of it: the old SECURITY record still forces the elevated path
```
An **unexplained** fingerprint change (no marker) is the integrity case: `CLASSIFICATION_IDENTITY_DRIFT`, `SYSTEM` hold (W4). An **unexplained class-binding mismatch** (no marker) is the same integrity case under reason `CLASSIFICATION_ASSET_CLASS_DRIFT` [v1.4: F29]. **[v1.5: F33]** A race between step 4 and a record-less instrument's first classification is serialised at the instrument row lock (05 §4.1 "First-classification race, adjudicated"): the record commits under whichever class was live when it locked its instrument, and SQL never sees a `NON_SECURITY` record stamped with the corrected `SECURITY`/`SECURITY_TOKEN` class. A round-trip `A → B → A` correction with no intervening classification does not by itself revive a stale record still predating both hops — the deferred constraint refuses the second hop in that case (05 §4.1). **[v1.8 editorial]** For a `RETIRED` classified instrument there is no intermediate-record route (classification needs `IDENTITY_LOCKED`): the correction does not restore its eligibility, B6 denies it on every subject, and a second hop that would return its fingerprint to the stale record's value fails closed — a separate governed replacement strategy would be needed, and none is designed here. **[v1.6: F39(a)]** For this round trip, the deferred fingerprint constraint is the security control, not merely a writer-correctness backstop: the live class-binding half of B12 alone would permit again once the label returns to `A`.
