# Principal Fintech Platform Architect Review — Final Verification

## Document Reviewed: AML-01 Sanctions/PEP/Adverse-Media/Travel-Rule Screening v1.1

| Item | Details |
|---|---|
| Reviewed pack | AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening Blueprint Pack v1.1 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/KYC-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Final Verification |
| Verdict | **All 5 critical gaps resolved; all 6 recommended corrections landed.** Tests 43 → 67; tables 10 → 18; FR 20 → 36. **Acceptance-ready.** One cosmetic version-cell nit only. |

---

## 0. Summary

Final verification pass on AML-01. The v1.1 revision closes every AML-domain gap from the v1.0 review with matching principles (§5.16–5.27), functional requirements, schema tables/columns, prohibited-behaviour entries, data rules, and dedicated tests. The suite expanded from **43 (TC-001–043) to 67 (TC-001–067)**, with four new sections (pre-transaction/list-update, coverage/50%/input-quality, STR/FP/outcome-freshness, and PEP/jurisdiction/de-listing/Travel-Rule) mapping one-to-one onto the gaps and corrections. AML-01 is ready for acceptance.

---

## 1. Critical Gaps — Resolution Status

| # | Prior Gap | Status | Evidence in v1.1 |
|---|---|---|---|
| C1 | No real-time pre-transaction sanctions gate + list-update SLA | **Resolved** | **§5.16** synchronous pre-transaction gate mandatory before funds/asset/transfer/settlement/payout/Travel-Rule movement (all flows must call AML-01 or verify a current decision; screens client/counterparty/beneficiary/originator/VASP/newly-listed; unknown/stale/missing ⇒ deny/hold; action/counterparty/amount-scoped short-lived decision; **hard contract with MON/settlement/payment/Travel-Rule**); **§5.17** list-update SLA + **interim blocking** of affected parties + SLA-breach Critical alert + decision-token invalidation; new **`pre_transaction_screening`** (2.11) + **`list_update_event`** (2.12) tables; components **Pre-Transaction Sanctions Gate** + **List Update SLA Controller**; **FR-021/022/036**; prohibited #21/#22; data rules 15/16; tests **TC-044–048** |
| C2 | List coverage, 50% rule, matching quality unspecified | **Resolved** | **§5.18** mandated coverage baseline (UN/OFAC/EU/UK-HMT/MAS/Malaysia-MOHA + configurable) + matching-quality standard (alias/fuzzy/transliteration/name-variation/DOB/nationality/ID + **non-suppressible threshold floor**); **§5.19** ownership-based sanctions consuming **KYC-01 UBO tree** (every UBO-to-natural-person screened; newly-discovered UBO triggers; aggregate direct+indirect; **50% rule**; untraced branch ≠ clear; stale KYC graph ⇒ pending/review); new **`ownership_sanctions_result`** (2.13); `match_candidate.threshold_floor`; `screening_result.list_freshness_ref`; components **Sanctions Coverage Policy Engine** + **Ownership-Based Sanctions Engine**; **FR-023/024/025/036**; prohibited #23/#24/#31; data rules 17/18; tests **TC-049–054** |
| C3 | STR statutory clock/ownership not modelled | **Resolved** | **§5.20** suspicion formation starts a statutory clock; suspicion→MLRO deadline + MLRO filing/not-filing deadline recorded; FIU/BNM filing owner + statutory deadline defined; escalation before breach; **transaction-during-pending-STR policy (proceed/hold/block/escalate) with no tipping-off**; `str_case` gains `suspicion_formed_at_utc`/`mlro_review_due_utc`/`filing_due_utc`/`pending_transaction_policy`; component **STR Clock Manager**; **FR-027/028**; prohibited #27/#28; data rule 20; tests **TC-055–057** |
| C4 | Sanctions FP governance under-controlled | **Resolved** | **§5.21** sanctions FP requires **dual Compliance/MLRO review** (distinct approvers); standing FP **periodic re-attestation** + material-change revalidation; adverse-media FP control can't be reused for sanctions; can't lower threshold below floor; time-bound; new **`false_positive_attestation`** (2.15); component **Sanctions FP Reattestation Engine**; **FR-029/030**; prohibited #29/#30/#31; data rule 21; tests **TC-058/059** |
| C5 | No screening-input-quality gate (GIGO) | **Resolved** | **§5.22** minimum screening-input dataset by party type (individual: name/DOB/nationality/ID/aliases; entity: legal-name/reg-number/jurisdiction/aliases/UBO-list); **name-only ≠ clear**; incomplete input ⇒ pending/review; sourced from KYC-01; new **`screening_input_quality`** (2.14); `screening_result.input_quality_status`; component **Screening Input Quality Gate**; **FR-026**; prohibited #25/#26; data rule 19; tests **TC-052** |

---

## 2. Recommended Corrections — Resolution Status

| # | Correction | Status | Evidence |
|---|---|---|---|
| 1 | AML outcome tamper-evidence + freshness | **Resolved** | **§5.23** hash-sealed outcome; CLT verifies payload hash before use; validity window; **new hit/list update/profile/ownership change/freshness failure revokes prior clear**; revocation published; `aml_outcome` gains `outcome_hash`/`revoked_at_utc`/`revocation_reason`; **FR-031**; component **AML Outcome Seal Service**; prohibited #32/#33; data rule 22; tests TC-060/061 |
| 2 | PEP depth (foreign/domestic/RCA/de-classification) | **Resolved** | **§5.24**; **FR-032**; component **PEP/RCA Policy Engine**; prohibited #34; data rule 23; tests TC-062/063 |
| 3 | Screening scope from KYC UBO graph | **Resolved** | §5.19 (consumes KYC-01 UBO tree, every UBO screened) |
| 4 | Country/FATF jurisdiction source | **Resolved** | **§5.25**; new **`jurisdiction_screening`** (2.16); **FR-033**; component **Country Risk Screening Engine**; prohibited #35; test TC-064 |
| 5 | De-listing controlled unblock | **Resolved** | **§5.26**; new **`delisting_review`** (2.17); **FR-034**; component **De-Listing Review Engine**; prohibited #36; data rule 24; test TC-065 |
| 6 | Travel Rule threshold + sunrise | **Resolved** | **§5.27**; new **`travel_rule_policy`** (2.18); **FR-035**; component **Travel Rule Threshold/Sunrise Engine**; prohibited #37; data rule 25; tests TC-066/067 |

---

## 3. Remaining Items (cosmetic — non-blocking)

1. **`01` §1 Document Control** still shows `Pack version | v1.0` while this is the v1.1 pack (the Status line correctly records the revision) — bump the version cell. (Same nit as KYC-01 v1.1; worth a shared checklist for future rollups.)

No control is affected.

---

## 4. Verdict

AML-01 v1.1 is **substantively resolved and acceptance-ready.** The most serious gap — C1, treating sanctions as an onboarding/periodic check rather than a real-time obligation — is now closed: a synchronous pre-transaction sanctions gate is a hard contract with the payment/settlement/Travel-Rule flows, and a sanctions-list update triggers interim blocking of affected parties under a defined SLA with decision-token invalidation. Coverage is mandated across the major regimes with a matching-quality standard and a non-suppressible threshold floor; ownership-based (50%) sanctions now consume KYC-01's UBO graph so the natural person behind an entity is screened, and an untraced or stale ownership branch can never be "clear" (C2). The STR statutory clock, MLRO/FIU filing deadlines, and the transaction-during-pending-STR policy are modelled with tipping-off protection preserved (C3); sanctions false-positives require dual MLRO review with periodic re-attestation (C4); and no party can be cleared on thin/name-only input (C5). All six corrections landed, including a hash-sealed, revocable AML outcome with a CLT-verified freshness contract, foreign/domestic/RCA PEP depth, FATF jurisdiction screening, controlled de-listing unblock, and Travel-Rule threshold/sunrise handling. Coverage expanded 43 → 67 tests with go-live criteria to match.

The business-tier integration is now tight and symmetric: the KYC≠AML boundary holds both ways (KYC-01 §5.18 ↔ AML-01 §5.2), AML-01 consumes KYC-01's UBO graph (§5.19) and drives KYC-01 EDD triggers, and the CLT-01 combined-CDD gate (§5.14) is fed by a sealed, freshness-controlled AML outcome. The sanctions hard-block-no-bypass posture and control-plane inheritance (IAM-02 maker-checker/SoD, SEC-01 sensitive-read + fail-closed, CFG-01 gate, FND correlation) remain intact.

Recommend: **accept AML-01 at v1.1** (a clean v1.2 rollup can fix the version-cell nit). The compliance sub-tier (CLT-01 + KYC-01 + AML-01) is now complete — onboarding is gated on verified identity **and** current, sealed screening outcomes, with a real-time sanctions gate ready for the money modules.

Next per build order: the **money tier** — **wallet-screening / payout-destination whitelist** (which consumes AML-01's pre-transaction gate and Travel-Rule support), then **ledger / settlement** and **quote / trade / LP execution**. These carry the client-money safeguarding, DvP sequencing, and pre-funded-hold controls — expect the heaviest fund-flow scrutiny yet.
