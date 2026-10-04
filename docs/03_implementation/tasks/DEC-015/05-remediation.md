# 05 Remediation — DEC-015 (round 1)

- **Approved by:** human owner (Aiman), Round-1 remediation instruction, 2026-10-04 — remediation to STR-04 v0.2 only; no acceptance, no implementation
- **Implementation agent:** architecture author / claude-opus-5-5 / HIGH (documentation remediation; same model family as author and Round-1 reviewer — Round 2 should be separate-context)
- **Baseline commit:** `f9538b0ced1b11c5bceb1fc545f0126160b9445c` (`main` = `origin/main`, tree clean at preflight)
- **Resulting commit:** the commit that introduces this file (a file cannot contain its own hash; reported in the turn report)
- **Round-1 review:** `04-review.md`, verdict **REMEDIATE**, committed at `f9538b0`; it reviewed STR-04 **v0.1** at `b47deaa`
- **Source version → remediated version:** STR-04 v0.1 → **STR-04 v0.2**; STR-04A/B/C v0.1 → **v0.2**
- **Status after this record:** **ROUND-1 REMEDIATED / AWAITING ROUND-2 INDEPENDENT REVIEW.** DEC-015 **NOT_ACCEPTED**. Implementation **NOT AUTHORISED**. No finding is closed: every row below is *remediated, ready for re-review*, and only an independent Round-2 reviewer can verify closure.

## Findings being remediated

DEC015-R01…R17 from `04-review.md` §3 (HIGH 4 · MEDIUM 10 · LOW 3; blocking R01–R06).

## Approved remediation scope

- **Create:** `docs/05_strategy/AIX_Client_Asset_Fiat_Banking_Virtual_Account_Custody_Settlement_Architecture_v0.2.md` (STR-04 v0.2); `…/AIX_Bank_PSP_Settlement_Provider_Requirements_v0.2.md` (STR-04A v0.2); `…/AIX_Institutional_Custodian_Requirements_v0.2.md` (STR-04B v0.2); `…/AIX_LP_OTC_Counterparty_Requirements_v0.2.md` (STR-04C v0.2); this file.
- **Update:** `docs/00_project_state/CURRENT_STATE.md` (DEC-015 pointer only); `docs/DOCUMENT_REGISTER.md` (§4d STR-04/04A/04B/04C rows to v0.2, v0.1 retained).
- **Preserve unchanged:** every v0.1 document; `DECISION_LOG.md`; `OPEN_FINDINGS.md`; `docs/01_masters/**`; `docs/02_modules/**`; `platform/**`; `origin/module/ACC-01`; `origin/module/AST-01`; `task.json` (see "task.json" below).
- **Not created:** `06-acceptance.md`.

## Per-finding remediation

Status vocabulary: **REMEDIATED / READY FOR RE-REVIEW** (never "closed" in this record).

| Finding | Sev. | Review issue | Remediation decision | STR-04 v0.2 sections | Supporting-document changes | Status | Residual dependency | Human decision |
|---|---|---|---|---|---|---|---|---|
| **R01** | HIGH | Safeguarding invariant undefined under asynchronous settlement; negative client balances could net away another client's shortfall (−1,000 / +1,000 / 0 passes) | Coverage per asset × **external resource pool**; each client × subaccount claim floored at zero; negatives held as **Client Deficit** (separate receivable / exposure, never negative entitlement, never offset); no cross-pool, cross-legal-pool or cross-currency netting; aggregate and legal-pool views are reports only; AIX-owned amounts (unswept fee payable) and resources under unproven third-party claims excluded from qualifying resources; separate treatment of settled claims, pending outbound, suspense, verified resources, in-flight claims, settlement receivables, counterparty receivables and one-leg exposure; in-flight claims moved to a **settlement-exposure view** (reported and limit-controlled in window, exception past window, never a pool shortfall); receivables qualify only on proven `EV-29` criteria (fail closed = zero); scenarios for cash-first buy, asset-first sell, one-leg-complete, bank recall, custodian reversal, counterparty default; shortfall ⇒ pool blocked, recovery order, restoration X6 only under `EV-35`; recall-exposure window (`EV-36`); reconciled with Module Index l.793 `client_negative_balance = prohibited` | §7.4, §9.3, §16.4 (X6), §16.6, §17.1–§17.8, §33.3–§33.4, §40 rows 8, 14, 22, 46, 50, §41 (EV-07, EV-29, EV-35, EV-36), §43 M-43/M-44, §54 Q2–Q5, §57 I | STR-04A BNK-REQ-007, -043 | REMEDIATED / READY FOR RE-REVIEW | `EV-07`, `EV-29`, `EV-35`, `EV-36` (external; triggers LCF/LCA) | None |
| **R02** | HIGH | Entitlement had no location dimension; per-location invariant, reservation location and outflow source undefined; pooled VA could pay one client from others' money | Entitlement dimension **client × subaccount × asset × resource pool (S × A × P)**; three-level model (location / resource pool / legal safeguarding pool); per-pool amount states (available, reserved, pending, settled, blocked, unavailable); deterministic **source selection** for trade reservation, withdrawal, settlement, fee sweep, refund and return; no silent split; `INSUFFICIENT_AVAILABLE_AT_SOURCE`; payouts never exceed the reservation at that pool; pooled-VA **allocation modes** with `UNSUPPORTED` fail-closed; every allocation dimension must remain provable | §7.2, §7.4, §8.1, §8.2, §9.1, §9.3, §9.6, §10.2, §11.1, §11.5, §16.3, §18.1–§18.2, §23, §41 (EV-28), §54 Q1, Q8, §57 J | STR-04A BNK-REQ-025, -026 (per-VA debit limitation, debit attribution), BNK-REQ-007 | REMEDIATED / READY FOR RE-REVIEW | `EV-28`; pool-definition owner per HD-DEC015-01 (before §56 step 6) | HD-DEC015-01 (ownership only) |
| **R03** | HIGH | AIX corporate "timing advance" is client financing and was pre-authorised by the decision text | **Removed.** Unconditional rule: AIX corporate funds must not advance, bridge, finance or temporarily cover a client-funded obligation because the client leg is delayed, missing or unavailable; no AIX-corporate-funded leg precedes a client leg; outcomes limited to reject / hold / re-quote / cancel where permitted / wait for verified funding / settlement exception; corporate venue prefunding / credit support never the source of value for a client obligation; LPs whose model would need it cannot settle that client obligation; any future need is a separate decision. **HD-DEC015-03 recorded as NOT REQUIRED** (history preserved) | §6 P-04, §7.5, §16.4, §19.1–§19.4, §25.4, §26, §30.1, §33.6, §49, §50, §54 Q6, §57 N, §58 | STR-04C LPC-REQ-020, -061 | REMEDIATED / READY FOR RE-REVIEW | None | HD-DEC015-03 **not required** |
| **R04** | HIGH | "AIX holds no client signing key" too imprecise for MPC / orchestration | **Custody-control model**: 17 separately represented facets (K1–K17: key, key share, MPC share, HSM control, recovery material, recovery authority, policy admin, initiator, approver, quorum seat, emergency override, whitelist admin, wallet admin, ability to reconstruct signing authority, ability to move unilaterally, legal custody, operational control); principle that AIX must not by itself reconstruct, move, recover to itself, bypass or re-policy; **control indicators** ⇒ self-custody in substance unless `EV-34` concludes otherwise; AIX participation recorded and externally validated; lacking a complete key ≠ non-custodial; IAM-02 approvals request, never complete | §6 P-20, §7.3, §13.1–§13.4, §14, §37.2, §41 (EV-34), §54 Q14, §57 D | STR-04B §2.3A `CUS-REQ-070`…`077`; `CUS-REQ-002`, `-020`, `-022`, `-023` reworded | REMEDIATED / READY FOR RE-REVIEW | `EV-34` (legal classification) | None |
| **R05** | MEDIUM | Reservation expiry could release funds while execution status unknown (contradiction §32 vs §33.1) | Normative release rule: no timer release once an execution attempt exists; `EXECUTION_UNKNOWN` + `reconcile_required` protects the full amount; release only on authoritative no-fill / cancel / final unfilled quantity / terminal state or consumption; `EXPIRED` only with no attempt; internal release only after provider confirms hold release; provider-hold expiry: renew / extend, stop progression before expiry, or `HOLD_LOST` fail-closed; explicit late-fill handling (while unknown; after authoritative no-fill — parked, never auto-settled, never corporate-funded; duplicate fill) | §18.3, §18.5, §18.6, §32 rule 2, §33.1, §40 rows 5, 15, 16, 30–38, §43 B-24–B-26, M-45, §48, §54 Q9–Q11 | STR-04A BNK-REQ-033 (extension); STR-04C LPC-REQ-006–009, -065 | REMEDIATED / READY FOR RE-REVIEW | None (relies on existing TRD-01 v1.2 §5.20 query-back) | None |
| **R06** | MEDIUM | Diagrams bypassed module ownership (`BANK-->>LED`, `LED->>WDR`); two hold requesters; ingress owner and credential cardinality undefined | Every diagram routes provider → **Provider Event Ingress** → owning lifecycle module → governed instruction to LED-01; REC-01 detective in parallel; **one requester** per reservation requests both reservation and hold; LED-01 owns the accounting reservation and **binding**; WDR-01 owns the hold-instruction lifecycle and transmission; correlation = `reservation_id`; orphan-hold path; event ownership table by lifecycle; ingress = FND-01 shared component owning no business state (D-6, proposed); credential cardinality per provider × environment × function | §6 P-19, §8.2, §17.6, §18.1, §21.2, §22.1, §25.1, §35.1, §35.3, §35.7, §36, §37.1, §53 D-3/D-6 | — | REMEDIATED / READY FOR RE-REVIEW | D-6 placement subject to Round-2 and human acceptance; IMP-02 perimeter and masters 08/09 later | None |
| **R07** | MEDIUM | LP legal capacity, LP-default allocation and LP net settlement presumed | Neither "client bears LP default" nor "AIX bears LP default" assumed; `claim_holder` (`EV-30`) and `loss_bearer` (`EV-31`) held behind abstractions with fail-closed values; `settlement_basis` from evidence (`EV-33`): gross / net-payment-aggregation / legal-netting / unverified; no client's funds settle another client's obligation under any basis; legal netting across clients unusable for client obligations; set-off, credit support, collateral, close-out and finality as EVs | §26, §30.3, §33.3, §40 rows 46–47, §41 (EV-30, EV-31, EV-33), §54 Q18–Q19, §57 Q | STR-04C LPC-REQ-010 (now MUST), §2.6 LPC-REQ-060…065 | REMEDIATED / READY FOR RE-REVIEW | `EV-30`, `EV-31`, `EV-33` | None |
| **R08** | MEDIUM | D-4 obligation model absorbed the order lifecycle; LED-01 became orchestrator | Five lifecycles separated (order, execution, reservation, accounting obligation, orchestration, posting, external transfer) with owners; obligation starts at the fill; LED-01 owns accounting obligation, leg accounting status and transition guards only (DvP controllers re-scoped as guards); orchestration with the product workflow owner — TRD-01 Spot/OTC *(proposed)*, PAY-01, RWA-03/04, EXC-01, WDR-01, DEP-01; finality separate from `accounting_settled`; D-4 corrected | §30.2, §31.1–§31.4, §33.5, §36.1–§36.3, §43 B-27, M-46, §45 (TRD-01), §53 D-4, §57 K | — | REMEDIATED / READY FOR RE-REVIEW | Module Index v1.5 wording for TRD-01 orchestration (or the alternative non-posting LED-01 controller — recorded in §53 D-4) | None |
| **R09** | MEDIUM | Fee accrual crossed books outside the enumeration; subaccount fee payable blocked closure; unbounded sweep; network-fee overcharge possible | Lifecycle: client fee reserve → fee earned (**X1**, enumerated internal-evidence cross-book event of two single-book journals) → corporate receivable / revenue → bounded sweep (**X2**) → refund / reversal (**X3**); **pool-level** AIX Fee Payable (no subaccount object); `fee_sweep_max_latency` with fail-closed breach handling and deny-on-missing configuration; AIX fee money deducted from qualifying resources; variable charges capped at the disclosed / approved maximum — client approval for more or AIX absorbs | §9.3, §16.4, §17.2 rule 7, §20.1–§20.9, §34 R8, §38, §40 row 23, §48, §57 O | STR-04A BNK-REQ-050; STR-04B CUS-REQ-066; STR-04C LPC-REQ-030 | REMEDIATED / READY FOR RE-REVIEW | `EV-07` (whether any fee holding period is permitted) | None |
| **R10** | MEDIUM | ACC-01 analysis incomplete: closed CDA allow-list; DEC-015 numbering collision; "Contradictions found: None" wrong | ACC-01 stays `DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`; **FI-ACC-5** maps every DEC-015 drain activity to CDA-1…CDA-4 or a readiness precondition (fee payable moved to pool level, so no fee drain); one uncovered activity (release of unexecuted order reservations) resolved preferably by a WF-27 consumer precondition, fallback a CDA-5 list-text amendment at ACC-01's next revision; post-seal external events post to pool-level Pool Exception; **FI-ACC-6**: DCR-ACC-GOV-01 provisional `DEC-015` must be renumbered at ACC-01's next controlled revision; "Contradictions found" corrected; ACC-01 not modified | §1, §9.5, §20.4, §23.1 rule 2, §43.3 A-02, A-10, A-11, §51, §57 Z | — | REMEDIATED / READY FOR RE-REVIEW | ACC-01 next controlled revision (text items only); WF-27 rebaseline | None |
| **R11** | MEDIUM | Uninstructed, provider-evidenced client outflows had no owner or posting path; hold enforceability not an EV | Observed-outflow lifecycle owned by WDR-01: ingress → WDR-01 classify → governed LED-01 posting (deficit if excess; Pool Exception if unattributable) → REC-01; behaviour during `closing` and after seal; compliance consequence (WLT-01 / AML-01 pre-transaction / Travel Rule did not run → AML-01 monitoring input); resources that others can debit without an **enforceable** hold are not trading resources; "a software reservation does not legally restrict a bank account"; `EV-32` (hold enforceability, set-off, legal orders, freeze, recall, provider correction) | §10.2, §10.3, §11.5, §23, §23.1, §35.7, §40 rows 29, 41–45, §41 (EV-32), §54 Q12–Q13 | STR-04A BNK-REQ-011…014, -038, -039, -049 | REMEDIATED / READY FOR RE-REVIEW | `EV-32` | None |
| **R12** | MEDIUM | HD-DEC015-01 framing and timing; D-1 broadened WLT-01; fact split undefined | D-1 corrected: WLT-01 keeps destinations and gains custody deposit-address assignment / eligibility only — not fiat VAs, underlying accounts, safeguarding accounts, pools, arrangements, legal relationships, balances or beneficial-ownership facts; VA registry → DEP-01 (proposed; alternative recorded); **field-level owner table**; HD-DEC015-01 reframed to the shared provider identity / DD / WF-19 record for **all** provider types (Vendor, LP, Custodian, Bank, PSP, settlement agent, paying agent, escrow provider, payment rail) with module-owned rail arrangements; **Option D recommended**; trigger before §56 step 6; PNF-08 merged | §8.1, §9.1, §11.2, §36.1–§36.4, §41.2 PNF-08, §43 M-20, M-21, M-29, §53 D-1/D-2, §56 step 5a, §58 | STR-04A/B/C §1 (evidence recorded on the shared record / arrangement) | REMEDIATED / READY FOR RE-REVIEW | HD-DEC015-01 decision | **HD-DEC015-01 — OPEN** |
| **R13** | MEDIUM | AST-01: stale LQD-01 `custodian_ref` claim; single-custodian assumption unrecorded; no custodian ↔ location rule | A-06 corrected (`custodian_ref` → legal custodian on the shared provider record, not LQD-01); "one custodian per instrument" withdrawn as a decided fact → **HD-DEC015-02** (A single active custodian with sequenced cutover / B concurrent custodians; B ⇒ controlled AST-01 revision before `PLAN_READY`); **consistency rule** §13.5; arrangement verification enforced at the location, not in AST-01 approval (FI-AST-1 revised) | §13.5, §14, §43.3 A-06, A-07, §52, §54 Q32, §58 | STR-04B CUS-REQ-014, -063 | REMEDIATED / READY FOR RE-REVIEW | HD-DEC015-02 decision | **HD-DEC015-02 — OPEN** |
| **R14** | MEDIUM | Failure-mode matrix gaps | Rows 5, 8, 14, 16, 19, 29 corrected; rows **30–50** added: hold release failure, orphan hold, hold disappears, hold lost after execution, internal-without-external, external-without-internal, late fill (both cases), duplicate fill, provider correction after settlement, receipt confirmed / posting failed, direct bank debit, provider-originated debit, account frozen, legal order, set-off, counterparty default, netting dispute, provider-complete / ledger-pending, stale custodian evidence, pool coverage failure — each with state, movement, availability, reservation, escalation, reconciliation, maker-checker, evidence | §40 | — | REMEDIATED / READY FOR RE-REVIEW | None | None |
| **R15** | LOW | REC-01 snapshots in the preventive path; no conflict rule; terminology clash | REC-01 detective only; preventive authority = LED-01 state + fresh movement-scoped provider read + bound hold evidence; REC-01 can deny (blocking break) but never authorise; disagreement ⇒ fail closed where material + break, no convenient choice; three artefact names disambiguated | §16.3, §16.7, §34.3, §34.4, §53 D-5, §54 Q16 | STR-04A BNK-REQ-030; STR-04B CUS-REQ-050 | REMEDIATED / READY FOR RE-REVIEW | None | None |
| **R16** | LOW | Provider requirement gaps | **STR-04A v0.2**: per-VA debit limitation, debit attribution, hold enforceability / priority, set-off, legal orders, client direct withdrawal, freeze, hold conversion, uninstructed debit events, data protection. **STR-04B v0.2**: fee schedule / transparency, data protection, privacy, data residency, control-indicator evidence. **STR-04C v0.2**: BCP/DR, audit rights, exit / termination / migration, data security, gross vs net, netting / set-off, default, credit support, finality, erroneous-confirmation policy. No candidate is claimed to support anything | STR-04 §41 cross-references | STR-04A/B/C v0.2 (all three) | REMEDIATED / READY FOR RE-REVIEW | Provider evidence in WF-19 | None |
| **R17** | LOW | Consistency and governance nits | Every sub-item corrected — table below | §37.1, §41.2, §43.5, §56 | — | REMEDIATED / READY FOR RE-REVIEW | None | None |

### R17 sub-items

| Review item (`04-review.md` R17) | Correction | Document / section changed | Status |
|---|---|---|---|
| §43.5 G-05 says "PNF-01…07", but ten PNFs exist | G-05 now reads PNF-01…10, references the Round-1 dispositions and states that R01–R17 are remediation items, not findings | STR-04 v0.2 §43.5 G-05 | REMEDIATED / READY FOR RE-REVIEW |
| §41.2 table lists PNF-10 before PNF-07 | Table re-ordered PNF-01…PNF-10, with a Round-1 disposition column | STR-04 v0.2 §41.2 | REMEDIATED / READY FOR RE-REVIEW |
| §56 step 8 (DEP-01/WDR-01/REC-01) should depend on step 5 (masters 08/09) | Step 8 now depends on **5**, 6, 7; FND-01 ingress (8b) also depends on 5; step 6 additionally depends on HD-DEC015-01 (5a) | STR-04 v0.2 §56; §46.1 DEC015-T10 | REMEDIATED / READY FOR RE-REVIEW |
| §37.1 "Reservation create/release only by WDR-01 service identity" should say *provider hold instruction* | Row renamed "Provider hold instruction controls": provider hold instructions (place / extend / release / convert) transmitted only by the WDR-01 service identity, for a `reservation_id` from its single requester; release subject to §18.3 | STR-04 v0.2 §37.1 | REMEDIATED / READY FOR RE-REVIEW |

## Proposed new findings — Round-1 disposition (history preserved, nothing promoted)

| PNF | Round-1 disposition | v0.2 treatment |
|---|---|---|
| PNF-01…PNF-06 | Confirmed new | Unchanged severity; disposition column added (§41.2) |
| PNF-07 | Downgrade MEDIUM → LOW | Recorded as **LOW (was MEDIUM)** |
| PNF-08 | Reframe / merge into R12 | Recorded as merged into R12 / HD-DEC015-01; scope all provider types; trigger before §56 step 6 |
| PNF-09 | Confirmed new | Unchanged |
| PNF-10 | Confirmed new | Unchanged |

`OPEN_FINDINGS.md` is **not** modified; promotion is a later human governance decision.

## Human decisions after remediation

| ID | Status | Notes |
|---|---|---|
| HD-DEC015-01 | **OPEN** | Shared provider identity / DD / WF-19 record owner for all provider types + field-level split; **recommended Option D**; decide before WLT-01 / LED-01 (and DEP-01 VA registry) consuming blueprint work — §56 step 5a |
| HD-DEC015-02 | **OPEN** | A single active custodian per instrument × domain with sequenced cutover, or B concurrent custodians under governed policy; decide **before AST-01 `PLAN_READY`**; B requires a controlled AST-01 revision (not made here) |
| HD-DEC015-03 | **NOT REQUIRED** | Proposed by the Round-1 review only if the corporate timing advance were retained. v0.2 removes that architecture option (R03), so the question does not arise. Recorded for history, not erased |

No other human decision was raised.

## ACC-01 / AST-01 compatibility

| Module | Branch head (re-verified) | v0.2 classification | Future integration |
|---|---|---|---|
| ACC-01 | `origin/module/ACC-01` = `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be` | `DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY` | FI-ACC-1…FI-ACC-6: attesters; `treasury` wording; `resolve` consumption; A2-Q1/Q2; **FI-ACC-5 closure-drain mapping**; **FI-ACC-6 DEC-015 renumbering** (text, next controlled revision). Fee-payable placement moved to pool level, so no subaccount fee object enters closure. No structural ACC-01 change |
| AST-01 | `origin/module/AST-01` = `1978f2e24192b7d893939b25ec9176cc9920791a` | `DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`, subject to HD-DEC015-02 | FI-AST-1 (`custodian_ref` → legal custodian on the shared record; verification at the location), FI-AST-2 (HD-DEC015-02), FI-AST-3…5 unchanged |

Neither branch was checked out, merged, rebased, cherry-picked, advanced or modified.

## Mandatory re-search

Re-run at `f9538b0` over `docs/` and `platform/` (excluding `90_archive/`, `*/reviews/`,
`node_modules/` and the DEC-015 documents) for every term in the remediation instruction §36,
plus the ACC-01/AST-01 branches read-only. Results and dispositions: STR-04 v0.2 §55. New material
hits added to the impact matrix: Module Index l.793 and the other negative-balance rules (M-43,
M-44, B-28), the master 08 hold-expiry sweep (M-45), Module Index FND-01/TRD-01 rows (M-46),
TRD-01 v1.2 §5.20 / `TRD1-FR-030` (B-24), LED-01 §5.22 hold pinning (B-25), `E2E-TC-021` (B-26),
LED-01 DvP controllers (B-27), ACC-01 DCR-ACC-GOV-01 (A-10) and the closure barrier (A-11). The
terms "timing advance", "corporate funds", "gross settlement", "fee payable", "closure drain" and
"set-off" have **0** hits on `main` outside DEC-015 files; all 37 netting hits are client-netting
prohibitions, consistent with §30.3.

## task.json

**Unchanged.** `tasks/README.md` defines `roundCounts` and `reviewer` but no rule requires a
remediation-time transition, and the precedents transcribe review/round state at the acceptance
checkpoint (MIG-004: `c3ac87d` → `43f2f34` set `reviewer`, `roundCounts.review` and `state` in the
acceptance commit; same pattern for MIG-005 and IMP02-MA-HARDEN-001). `04-review.md` §11 states the
same convention. No `PLAN_READY`, acceptance or implementation state is created.

## Result

All seventeen Round-1 findings are remediated in STR-04 v0.2 and STR-04A/B/C v0.2 and are **ready
for Round-2 independent review**. Residuals are external validation items (`EV-07`, `EV-28`…`EV-36`)
and two open human decisions (HD-DEC015-01, HD-DEC015-02), each with a recorded trigger. No
disagreement with the Round-1 review is recorded; where v0.2 chose between options the review
offered (D-4 orchestration owner; FI-ACC-5 preferred resolution; VA registry in DEP-01), the
alternative is recorded for Round-2 to test.

## Validation evidence (pre-commit)

| Check | Result |
|---|---|
| Preflight | `main`; `HEAD` = `origin/main` = `f9538b0ced1b11c5bceb1fc545f0126160b9445c`; `git status --short`, `git diff --stat`, `git diff` empty |
| `git fetch origin --prune` then heads (pre-commit) | `HEAD` = `origin/main` = `f9538b0…`; `origin/module/ACC-01` = `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be`; `origin/module/AST-01` = `1978f2e24192b7d893939b25ec9176cc9920791a` (unchanged) |
| `git diff --check` | rc=0, no output; no trailing whitespace in the five new files |
| Changed-file allowlist | Modified: `docs/00_project_state/CURRENT_STATE.md` (2 lines), `docs/DOCUMENT_REGISTER.md` (4 rows, §4d). New: STR-04 v0.2, STR-04A v0.2, STR-04B v0.2, STR-04C v0.2, this file. **Nothing else** |
| Forbidden paths | No change to any v0.1 document, `DECISION_LOG.md`, `OPEN_FINDINGS.md`, `docs/01_masters/**`, `docs/02_modules/**`, `platform/**` (no code, migration, test, seed, sealed hash, guard, capability or production-activation change); no `06-acceptance.md`; `task.json` unchanged |
| STR-04 v0.2 structure | 58 `##` sections; 8 Mermaid diagrams, fences balanced, no `;` inside Mermaid blocks; no diagram edge from a provider to LED-01 or from LED-01 to a provider or WDR-01; ends with the `ROUND-1 REMEDIATED / AWAITING ROUND-2 INDEPENDENT REVIEW` / `NOT_ACCEPTED` / `NOT AUTHORISED` block |
| Stale-assumption scan of v0.2 | "timing advance", "holds no client signing key", "whichever first", "one legal custodian per instrument", "LQD-01 arrangement", "sole source", "WLT-01 owns", "REC-01 snapshot" occur only in removal, prohibition, correction or history context. No provider is described as selected or capable; no legal conclusion or regulatory approval asserted; Exchange approval remains `EV-22` |
