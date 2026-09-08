# Principal Fintech Platform Architect Review — AML-01 Sanctions/PEP/Adverse-Media/Travel-Rule v1.0

| Item | Details |
|---|---|
| Reviewed pack | AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/KYC-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong structure; **5 critical gaps** before acceptance. Most serious is C1 — screening is modelled at onboarding/periodic time, not as a real-time pre-transaction gate. |

---

## 0. Summary

AML-01 is the strongest business-tier initial draft so far. It correctly handles the hardest primitives: handoff/case/outcome separation, the KYC≠AML-clear boundary (symmetric with KYC-01 §5.18), sanctions true-hit hard-block with no Super-Admin/break-glass/service-account override, true-hit → MLRO escalation, STR with tipping-off protection (restricted access + safe reason codes), ongoing rescreening on list update, Travel Rule support with missing-data≠clear, list-version capture, vendor source-auth + payload-hash + fail-closed degraded mode, and maker-checker + SoD. It closes KYC-01 §5.18's "AML-triggered EDD" contract via the KYC EDD trigger. The five gaps are in the deeper AML domain — the **when**, the **coverage**, and the **statutory obligations** of screening.

---

## Critical Gaps

### C1 — No real-time / pre-transaction sanctions gate, and no hard SLA for list-update rescreening with interim blocking — **HIGHEST PRIORITY**
**Area:** §5.9 ("rescreen … before key high-risk actions **where policy requires**"), WF-AML01-06, §4 (transaction monitoring out of scope), Open Item 10 (list update SLA).

Screening is modelled as onboarding + periodic/event rescreening — but sanctions is a **strict-liability, real-time obligation**. A payment, transfer, or settlement must be screened **synchronously before funds move** (the specific counterparty/beneficiary, and any party newly-listed mid-relationship), and a **sanctions-list update must propagate within a hard SLA** with affected parties **blocked in the interim**. As written, "before key high-risk actions where policy requires" is soft, the MON/settlement integration is undefined, and the list-update→rescreen latency is an open item — so a party listed today could transact tomorrow before the periodic rescreen runs.

Needed: a **synchronous pre-transaction sanctions screening gate** as a hard contract with the payment/settlement (MON) and Travel Rule flows; a **defined list-update rescreening SLA** with **interim blocking** of affected parties until rescreened.

### C2 — Sanctions list coverage, ownership-based (50%) sanctions, and matching quality are unspecified
**Area:** §5.6/§5.12 (list version + vendor integrity), 05 §2.2 `screening_result`, Open Items 1–3.

"No match = clear" is only as strong as **coverage and matching quality**, both undefined: no mandated **regime coverage** (UN, OFAC, EU, UK/HMT, MAS, Malaysia/MOHA), no **ownership-based sanctions (50% rule)** — an entity ≥50% owned or controlled by a sanctioned person is itself sanctioned, which requires screening the **KYC-01 UBO tree**, not just the named party — no **list-freshness assurance** (a vendor could serve a stale list under a valid version string), and no **matching-quality standard** (aliases, fuzzy matching, transliteration, name variations, DOB/nationality corroboration).

Needed: a mandated list-coverage policy; **50%-rule ownership-based sanctions using KYC-01's ownership graph**; list-freshness monitoring; and a matching-quality standard.

### C3 — STR filing is under-owned: the statutory FIU clock, deadline, and continue/hold-transaction rules aren't modelled
**Area:** §5.11 (STR prep + tipping-off), §4 ("FIU portal submission … unless later module owns it"), Open Item 6, 05 §2.9 `str_case` (status draft/review/approved_to_file/not_file/closed).

STR preparation, tipping-off protection, and the MLRO decision record are present, but the **actual FIU filing is deferred/unowned** while STR carries a **statutory deadline** that starts at suspicion formation (Malaysia AMLA: report to the FIU/BNM within the prescribed period). Missing: the **filing SLA + escalation clock**, the **internal-suspicion → MLRO timeline**, and the **rules on whether/how a transaction proceeds while an STR is pending** (proceed, hold, or block — without tipping off). The `str_case` has no deadline/clock fields.

Needed: model the **suspicion→MLRO→file clock with statutory deadline + escalation**, define the **transaction-handling-during-pending-STR** policy (no tipping-off), and resolve STR/FIU ownership with the reporting module.

### C4 — False-positive/allowlist governance is under-controlled for sanctions, and standing clearances lack re-attestation
**Area:** §5.7 (false-positive control), WF-AML01-03, 05 §2.4 `match_decision`, 07 §3 maker-checker.

A "false positive" on a **sanctions** possible-match effectively **permanently whitelists** that party, yet false-positive handling is generic — the same control for a low-risk adverse-media FP and a high-risk sanctions FP. Sanctions false-positives should require **dual Compliance/MLRO review** (distinct from adverse-media), standing FP decisions need **periodic re-attestation** (not only revalidation on list change), and the **match threshold** needs a **floor that can't be lowered to suppress** true matches (threshold config is maker-checkered but has no floor).

Needed: elevated dual-review for sanctions false-positives, periodic re-attestation of standing allow/FP decisions, and a non-suppressible threshold floor.

### C5 — No screening-input-quality gate (GIGO): screening on incomplete identity data can't be "clear"
**Area:** §5.6 (`search_input_hash`), WF-AML01-02, dependency on KYC-01/CLT-01 data.

Match quality depends entirely on the **identity dataset** fed in. Screening a name with no DOB/nationality/ID produces unreliable results (false negatives), yet nothing requires a **minimum screening-input dataset** or blocks a "clear" on thin input. A party screened on name-only should be `review`/`pending`, never `clear`.

Needed: a **minimum screening-input dataset by party type** (name + DOB + nationality + ID reference where available), sourced from KYC-01; screening on incomplete input → `review_required`, never `clear`.

---

## Recommended Corrections

1. **AML outcome tamper-evidence + freshness contract:** the screening outcome that gates onboarding (and later transactions) is a mutable table with reconciliation as the only defence — add hash-seal/tamper-evidence (or align with SEC-01 anchoring), an explicit **AML→CLT validity window with immediate revocation on a new hit**, and require CLT-01 to verify the publication `payload_hash`.
2. **PEP depth:** distinguish **foreign vs domestic PEP** (different FATF risk), cover **RCAs (relatives and close associates)**, and define **PEP de-classification/persistence** after leaving office.
3. **Tie screening scope to KYC-01's ownership tree** so every UBO/controller resolved to a natural person (and any newly-discovered one) is auto-screened — not just the named client/party (ties C2's 50% rule).
4. **Country/jurisdiction screening source:** §5 lists it but no **high-risk-jurisdiction / FATF grey-black-list** source or handling is defined.
5. **De-listing / removal path:** rescreening compares prior clear/FP decisions for *new* matches — also handle a **list removal (de-listing)** with a controlled unblock path (approval), not only additions.
6. **Travel Rule threshold + sunrise:** define the **applicability (de-minimis) threshold** and the **counterparty-VASP "sunrise" handling** (counterparty not Travel-Rule-capable).

---

## Additional Parameters to Define

```txt
# Real-time sanctions gate (C1)
sanctions_screening             = pre_transaction_synchronous_gate
transaction_screening_contract  = hard_with_mon_settlement_and_travel_rule
list_update_rescreen_sla_seconds = to_be_defined
list_update_interim             = block_affected_until_rescreened

# Coverage / 50% rule / matching (C2)
sanctions_list_coverage         = un_ofac_eu_uk_mas_malaysia_moha
ownership_based_sanctions_50pct = enabled_using_kyc_ubo_tree
list_freshness_assurance        = required
matching_quality                = alias_fuzzy_transliteration_variations

# STR clock (C3)
str_filing_owner                = defined
str_filing_deadline             = statutory_sla
suspicion_to_mlro_clock         = defined
transaction_during_pending_str  = policy_defined_no_tipping_off

# FP governance (C4)
sanctions_false_positive_review = dual_compliance_mlro
standing_fp_reattestation       = periodic
match_threshold_floor           = cannot_suppress_true_match

# Input quality (C5)
min_screening_input_dataset     = name_dob_nationality_id_by_party_type
incomplete_input                = review_not_clear

# Corrections
aml_outcome_freshness           = validity_window+revoke_on_new_hit
pep_scope                       = foreign_domestic_rca
screening_scope_from_kyc        = all_ubos_to_natural_persons
travel_rule_threshold           = de_minimis_defined
travel_rule_sunrise             = counterparty_vasp_incapable_handling
```

---

## Consistency Note

AML-01 pairs cleanly with the accepted business tier: the **KYC≠AML boundary is symmetric** with KYC-01 §5.18, and the **AML→KYC EDD trigger** closes KYC-01's "AML-triggered EDD" contract. The sanctions **hard-block-no-bypass** posture is consistent with IAM-02/CFG-01, and control-plane inheritance (IAM-02 maker-checker/SoD, SEC-01 sensitive-read + fail-closed, CFG-01 gate, FND correlation) is intact. Two integration threads need tightening: the **screening scope must consume KYC-01's UBO graph** (C2/correction 3), and the **STR/FIU ownership boundary** (Open Item 6) must be resolved with the future reporting module. The unifying theme: AML-01 models the *screening lifecycle and hit-handling* well but under-specifies the *timing* (C1 real-time gate), *coverage/quality* (C2, C5), and *statutory STR obligations* (C3).

---

## Top Priorities

1. **C1** — a synchronous pre-transaction sanctions gate + list-update rescreening SLA with interim blocking. Sanctions is real-time and strict-liability.
2. **C2** — mandated list coverage, ownership-based (50%) sanctions via the KYC UBO tree, and matching quality.
3. **C3** — model the STR statutory clock/deadline and the transaction-during-pending-STR policy.
4. **C4 / C5** — sanctions false-positive dual-review + re-attestation, and a minimum screening-input-quality gate.
