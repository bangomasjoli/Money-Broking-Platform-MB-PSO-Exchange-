# 05 Remediation R2 — AST-01: blueprint v1.2

- **Task ID:** AST-01
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.**
- **Remediating agent:** Claude Sonnet 5 (`claude-sonnet-5`); effort not specified in the invocation.
- **Reviewed blueprint:** v1.1 @ `e20b8ca` (kept **unchanged**; v1.0 also unchanged)
- **Review:** [04-review-r2.md](04-review-r2.md) at `ccec2ff` — verdict **REMEDIATE**; 2 HIGH (F17, F19), 3 MEDIUM (F18, F20, F21), 4 LOW (F22–F25)
- **Starting HEAD:** `ccec2ff` (branch `module/AST-01`, tree clean, `main` = `origin/main` = `43f2f34`)
- **Remediated pack:** [docs/02_modules/AST-01/blueprint/v1.2/](../../../02_modules/AST-01/blueprint/v1.2/README.md)
- **Independence note:** v1.2 is authored by the same model family as v1.0/v1.1 (`claude-sonnet-5`). The review it answers was context-independent but not model-family-independent. **A separate-context re-review is required** before any finding is closed. Findings below are marked *remediated*, not *closed*.

## Human decisions recorded (approved by Aiman)

| ID | Decision | Applied in |
|---|---|---|
| **AST-HD-5** | `SECURITY` / `SECURITY_TOKEN` ⇒ `PAY` = `INELIGIBLE`; default-deny unless a future authoritative master/regulatory decision expressly permits otherwise; no local override | 17 §1.1; 01 §5.3 ³ |
| **AST-HD-7** | `RWA` eligibility = the instrument is an **object of the RWA lifecycle**, not the currency/token used to pay for an RWA subscription | 17 §1.1; 01 §3.4 |
| **AST-P-3** | `SECURITY`/`SECURITY_TOKEN`-labelled class cannot receive `NON_SECURITY` while keeping that class; correction by governed replacement/correction with lineage preserved; **not** extended to `TOKENISED_DEBT`/`TOKENISED_FUND`; AST-HD-4 intact | 01 §3.4; 05 §4.1; T-CLS-15/16 |
| **AST-P-4** | Digital MYR fail-closed as **`NOT_ASSESSED` / `MYR_PAIR_CONTROL_UNRESOLVED`** (not `ASSET_NOT_ALLOWED`); no override in AST-01; consumers deny while `NOT_ASSESSED` | 01 §3.10; 05 §7 B10; 09; T-MYR |
| **AST-R2-HD-01** | Strict reading of Doc 00 §1.D rule 4: a real instrument with only a non-production/test/provisional classification is `NOT_ASSESSED`; non-production testing uses synthetic instruments. **Resolves F25** | 01 §4.3–4.5; 05 §5.1 trigger 8, B11; T-RNP |

The four v1.1 "pending" items (`HD-5`, `HD-7`, `P-3`, `P-4`) are no longer pending. `P-4` changed content (correction above).

## Finding map — round 2 (F17–F25)

| Finding | Sev | Status | v1.2 location | What was done |
|---|---|---|---|---|
| **F17** ambiguous instrument resolution | HIGH | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-002 (1),(5),(7)) | 01 INV-18, §3.11, §5.8; 04 §6.1, §6.4; 05 §4.2, §8.1; 09; 10 `T-RES-*`; 12 AR-21 | Canonical identity is the only key (token: chain+network+contract; native: chain+network; off-chain: code; fiat: reference surface). `{asset_code, chain, network}` removed. Exactly one selector; 0 ⇒ `INSTRUMENT_NOT_FOUND`, >1 ⇒ `INSTRUMENT_REFERENCE_AMBIGUOUS`, both `NOT_ASSESSED`, no token, logged with the canonical request. Sibling never guessed. WLT-01 must supply contract identity — WLT-01 has none today: **external integration gate**. Unregistered/ambiguous inbound ⇒ quarantine, no credit. Adversarial tests added |
| **F18** SQL backstop at consumption / TOCTOU | MED | **REMEDIATED** | 05 §7, **§7A**, §8.1, §10; 04 §6.2, §8; 06 SM-8; 09 §2.1; 10 `T-CON-*` | Token binding columns immutable (trigger + column-level grant). Mint and consume each one transaction. One lock order: instrument rows (ascending) before token rows; every writer of an eligibility input takes the instrument lock first; lineage-wide writers lock all affected instruments. Consume: instrument `FOR SHARE` → token `FOR UPDATE` → current record + conjunct state → recompute backstop → verify bindings → conditional consume; the `BEFORE UPDATE` trigger independently re-runs the backstop, so `SECURITY → MB/PSO` is blocked in SQL at consumption. Failure matrix specified. **Deviation from the review's suggested sequence, with reason:** the instrument lock is taken before the token lock (token-first inverts against mutators that revoke tokens ⇒ deadlock). No autonomous transactions |
| **F19** deterministic lineage signals | HIGH | **REMEDIATED** | 01 §3.3, §3.6, §3.9, §4.7; 05 §3, §4.1–4.3, §5.1; 10 `T-LIN-*`, T-SEC-10, T-CLS-14 | (A) native `(chain, network)` unique, all statuses. (B) transitive underlying link to a security-determined lineage ⇒ `elevated` (`UNDERLYING_LINEAGE`), wrapper **not** auto-`SECURITY`; link insert-only. (C) **code-hash claim withdrawn** (no data source; OQ-5). (D) lineage/predecessor/`asset_id`/identity keys immutable from `INSERT`; only irreversible merge. (E) same-contract recreation abandoned: identity registered once, ever; continuity trigger and the impossible retire→recreate text removed; replacement = new contract under lineage |
| **F20** SECURITY must affect siblings | MED | **REMEDIATED** | 01 §4.7A; 05 §7 (`lineage_review_required`, B8); 02 W11; 10 `T-LIN-08…13`, T-DER-13 | Derived conjunct `LINEAGE_SECURITY_REVIEW_REQUIRED`: a real `NON_SECURITY` instrument with a newer real `SECURITY` record in its lineage (or its underlying's lineage) is `NOT_ASSESSED` immediately at commit; tokens revoked in the same transaction and re-rejected at consume; no classification rewritten; cleared only by a newer elevated record. **Extension beyond the finding's wording, flagged:** wrappers of a security-determined instrument are treated like siblings |
| **F21** MYR control does not exist | MED | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-002/-004/-008(c)) | 01 §1.2, §3.10; 04 §2.2, §6.4; 09; 12 AR-22; 17 DCR-002/-004/-008, §2.1; 10 `T-MYR-*` | "Enforced" wording removed: no MYR-pair control exists; not enforced anywhere until OQ-6. AST-01 provides identity, the attribute and `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`. Consumers fail closed; a `myr_denominated` fiat leg in a trading pair is denied without a pair-level approval. DCR-008(c) now gates any consumer blueprint activating a fiat-quoted or MYR pair. (AST-HD-1's approved text is preserved and annotated, not rewritten) |
| **F22** fiat discriminator | LOW | **REMEDIATED** | 01 §5.2 step 0; 04 §6.1 step 3; 05 §4.1 `trg_asset_class_frozen`, B3; 10 T-DER-07, T-FIA-05/07, T-CLS-15 | Short-circuit on `instrument_form = FIAT`; class/form inconsistency ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`; `asset_class` frozen once an instrument exists (only governed `ASSET_CLASS_CORRECTION`, never across the fiat boundary); non-FIAT `not_applicable` ⇒ deny/error (DCR-004) |
| **F23** binding completeness | LOW | **REMEDIATED** | 01 §5.8; 04 §1.1, §6.1–6.2; 05 §7 (B9), §8.1; 10 `T-PLD-*` | `payload_hash` covers client jurisdiction/class (and any conjunct fact), caller reference, client reference, payload binding; verify re-supplies bound facts (changed facts ⇒ re-`evaluate`). Token trigger compares `consumer_service`. Allow-list = deep-frozen constant with `assertAllowlistInvariants()` (MB/PSO identities never on securities/RWA subjects; `WLT-01` only `*_MB_PSO`); duplicated in SQL B9 |
| **F24** schema hygiene | LOW | **REMEDIATED** | 05 §2, §5.2, §6, §7; 09 §2.1; 10 T-SCH-07/09, T-CON-11 | `deployment_environment` trigger-immutable for every role. Raising trigger never persists a hold: application catches and writes it, plus critical audit, in a separate transaction; failed transaction stays rolled back. Conjunct-row key columns immutable from insert; attestation append-only |
| **F25** real instrument + test classification | LOW | **RESOLVED BY HUMAN DECISION** (`AST-R2-HD-01`); application awaits re-review | 01 INV-19, §4.3–4.5; 05 §5.1 trigger 8, B11; 10 `T-RNP-*` | Strict reading adopted: real `NON_SECURITY` needs a production-applicable standard in every environment (write-time refusal + derived collapse `REAL_INSTRUMENT_NON_PRODUCTION_BASIS` + SQL B11); restrictive outcomes unaffected; synthetic instruments are the non-production route |

## Disposition of F01–F16 (current)

| Finding | Current disposition | Note |
|---|---|---|
| F01 MB-domain deposit path | **Carried via F17**; remediated in v1.2; awaits re-review | DCR-AST1-002 stays a go-live gate; WLT-01 contract-identity gap is an external integration gate |
| F02 token not bound | **External gate remains** (DCR-AST1-004) | F23 hardening applied |
| F03 real instruments derive securities route | **Closed by R2** — not regressed | Matrix ⁵, B5, T-DER-09 unchanged |
| F04 backstop trusts app columns | **Carried via F18**; remediated in v1.2; awaits re-review | |
| F05 no trustworthy checker identity | **External gate remains** (DCR-AST1-001(a)+(d)) | Unchanged |
| F06 elevated-approval bypass | **Carried via F19/F20**; remediated in v1.2; awaits re-review | |
| F07 holds | **Closed by R2** — not regressed | Hold origin table gains the separate-transaction note only |
| F08 fiat default | **Carried via F21 (and F22)**; remediated in v1.2; awaits re-review | |
| F09 synthetic single source of truth | **Closed by R2** — not regressed | Immutable-from-insert list extended, never shortened |
| F10 matrix totality | **Closed by R2** — not regressed | Footnote ⁷ added; totality rule and boot invariant unchanged |
| F11 open-question rule | **Closed by R2** — not regressed | |
| F12 SRS coverage | **Closed by R2** — not regressed | |
| F13 attestation currency | **Closed by R2** — not regressed | Attestation table made append-only (F24) without weakening binding |
| F14 citations | **Closed by R2** — not regressed | Permission map extended for new change kinds |
| F15 `EXCHANGE` enum | **Closed by R2** — not regressed | New routes (`…/instruments/validate`, `…/class-correction-request`) contain no prohibited fragment |
| F16 `task.json` validity | **Closed** | Validated again below |

## AR-19

Retained only for non-deterministic economic-subject continuity (01 §3.9; 12 AR-19). The deterministic signals — native identity, identity uniqueness, same-asset membership, declared predecessor, transitive underlying link, immutable lineage, sibling conjunct — are wired. The code-hash signal was **withdrawn** rather than modelled, so a code-identical redeployment sharing no issuer reference stays in the residual (no code source exists; OQ-5). This is a departure from the instruction's residual wording ("no code/fingerprint candidate exists"), taken under the instruction's "or remove the claim" option.

## DCR status (updated, none implemented)

| DCR | Change in v1.2 | Implemented? |
|---|---|---|
| 001 IAM-02 | Unchanged | **No** |
| 002 WLT-01/LED-01 | Contract/native identity required; ambiguous/unregistered inbound ⇒ quarantine, no credit; MYR consumer handling; **(7) WLT-01 has no contract-identity field — external integration gate** | **No** |
| 003 CFG-01 | Unchanged | **No** |
| 004 Consumers | Exact instrument identity; client-fact binding; frozen allow-list; MYR fail-closed; non-FIAT `not_applicable` = deny; re-evaluate at each attempt | **No** |
| 005 Document store | Unchanged | **No** |
| 006 Role Matrix | Adds `ASSET_CLASS_CORRECTION`, sibling reaffirmation | **No** |
| 007 FND-01 | Unchanged | **No** |
| 008 Masters | **(c) strengthened and now gates any consumer blueprint activating a fiat-quoted or MYR pair**; (g) informational record of `AST-R2-HD-01` | **No** |
| 009 Control layer | Refers to v1.2 or later | **No** — `DOCUMENT_REGISTER`, `CURRENT_STATE`, `MODULE_STATUS` not touched |

No DCR is claimed closed. IAM-02 DCRs stay external.

## New open item (not decided)

**OQ-8** — a canonical identity is registered once, ever, so a typo in an insert-immutable field of a never-locked `DRAFT` permanently consumes it. v1.2 adopts the recommended absolute rule plus a dry-run endpoint; whether to allow a governed correction for never-locked drafts is a human decision.

## task.json

Conductor-valid, `state: "IDLE"` (unchanged; **not** `PLAN_READY`). Inspected `aix-conductor/src/records.ts` `validateTaskManifest` and `src/state.ts`. `roundCounts` are counters consumed when the conductor *enters* `REVIEWING` / `REMEDIATION_REQUIRED`; the only legal exit from `IDLE` is `PLANNING`, so incrementing them would record lifecycle events that never occurred, and **`roundCounts` is left unchanged** (`review: 1`, `remediation: 1`). The actual round history is recorded here and in the two review/remediation record pairs: review 1 → remediation 1 (v1.1) → review 2 (`04-review-r2.md`) → remediation 2 (this record, v1.2). `findingsSummary` (data, not a lifecycle event) and `relevantRecordPaths` are updated to the open set after R2 (F01, F02, F04, F05, F06, F08, F17–F24; F25 resolved by human decision; F03, F07, F09–F16 closed) and to include `04-review-r2.md` and this file; `carryForwardIds` stays empty (its conductor semantics are undefined in the source). `title` is updated. Validator result: see the final report / the command output recorded at commit time (`{"ok":true,"errors":[]}`).

## Boundaries observed

Documentation only. No `platform/**`, migration, test code, IAM-02/WLT-01/LED-01/CFG-01 edit, master/register edit, or `main` merge. v1.0 and v1.1 files untouched.

## Next

Separate-context re-review of v1.2, focusing on: canonical resolution and the WLT-01 gate (F17); the lock order and its stated deviation from the suggested sequence, plus the consumption failure matrix (F18); lineage immutability, identity-registered-once and the withdrawn code-hash signal (F19); the lineage conjunct and its wrapper extension (F20); MYR fail-closed (F21); the production-basis rule (F25); and no regression of F03, F07, F09–F16.
