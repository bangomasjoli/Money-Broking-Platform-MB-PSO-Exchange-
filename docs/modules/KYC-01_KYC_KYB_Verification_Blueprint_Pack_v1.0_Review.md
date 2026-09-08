# Principal Fintech Platform Architect Review — KYC-01 KYC/KYB Verification v1.0

| Item | Details |
|---|---|
| Reviewed pack | KYC-01 KYC/KYB Verification Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong structure and clean CLT-01 pairing; **5 critical gaps** before acceptance. Most serious is C1 — UBO look-through to ultimate natural persons is not enforced. |

---

## 0. Summary

KYC-01 pairs cleanly with CLT-01: it produces the CDD outcomes CLT-01 §5.14 gates on, separates handoff delivery from outcome (matching CLT-01), verifies authorised parties before authority activates (matching CLT-01 §5.15), supports perpetual KYC/periodic review (matching §5.16), applies maker-checker + SoD to manual decisions, authenticates vendor results (source auth + payload hash), stores evidence-as-reference, and has strong reconciliation (pass-with-missing-doc/UBO detection). Sanctions/PEP are correctly deferred to AML-01. The five gaps are in the **verification assurance and dependency** dimensions — the quality of the verification, not the plumbing.

---

## Critical Gaps

### C1 — UBO/ownership look-through to ultimate natural persons is not enforced; layered/nominee/trust structures can hide the controller — **HIGHEST PRIORITY**
**Area:** §5.4, WF-KYC01-05, 05 §2.4 `ownership_node` (node_type individual/entity/trust/nominee, `linked_party_case_id`), 07 §5 outcome rules.

The model identifies UBOs at a threshold but doesn't require **recursion through intermediate entities down to natural persons**. For layered ownership (entity → entity → individual) nothing forces the tree to resolve to the ultimate controllers; there's no **indirect-ownership aggregation** across branches, no modelling of **trust/nominee roles** (settlor/trustee/beneficiary/protector), and — critically — **no rule that an untraceable ownership structure forces EDD/fail** rather than pass. For a platform onboarding institutions and HNWI, this is *the* core KYB control: finding the natural person behind the entity. As written, the real controller can sit one layer above the threshold and never be verified.

Needed: mandatory **look-through to natural persons**, indirect-ownership aggregation, trust/nominee role modelling, and **"unable to determine ownership/control ⇒ EDD or fail, never pass."**

### C2 — Third-party/vendor reliance framework and degraded-mode are undefined
**Area:** §5.10, WF-KYC01-03 (vendor verification), 05 §2.3/§2.7 (`verification_result`, `vendor_result_inbox`), Open Items 3/4/9.

CDD quality depends **entirely on external vendors** (identity, corporate registry), yet the pack only authenticates the vendor *message* (source auth + payload hash — good) without a **reliance framework**: under FATF R.17 / Labuan AML rules, reliance on a third party for CDD requires satisfying that the third party is **regulated/supervised** and that **underlying CDD records are obtainable on demand**. Also missing: **vendor-outage behaviour** (fail-closed / manual fallback), **result validity window**, and a **confidence-score acceptance policy** (`confidence_score` exists but no threshold, no inconclusive handling, no multi-source corroboration). The vendor is a single point of CDD integrity with no governance around it.

Needed: a vendor accreditation/reliance framework, records-obtainable contract, degraded-mode fallback, confidence thresholds, and result-validity windows.

### C3 — Identity-proofing assurance level is unspecified: "verified = pass" is a boolean with no method standard
**Area:** §5.3, WF-KYC01-03, 05 §2.3 `verification_result.result_status` (pass/fail/inconclusive), §5.8 (non-face-to-face is an EDD trigger).

Identity verification collapses to a boolean pass — nothing specifies the **assurance level or method**: document authenticity check, **liveness / biometric binding** (anti-impersonation) for non-face-to-face onboarding, address verification. A weak vendor check and a strong one both yield "pass." Non-face-to-face is correctly an EDD trigger, but the **baseline proofing standard** by client class and risk is missing, as is **source-of-wealth / source-of-funds** for high-risk/HNWI.

Needed: defined identity-proofing assurance levels/methods by client class + risk (document authenticity, liveness/biometric binding for remote, address verification), and SoW/SoF requirements for high-risk/HNWI EDD.

### C4 — KYC↔AML boundary is a dangling contract; a KYC "pass" can be misread as full CDD
**Area:** §4 (sanctions/PEP out of scope), §5.8 ("politically exposed indicator from downstream AML module **when integrated**"), §5.6 outcome (no screening component), CLT-01 §5.14.

Sanctions/PEP/screening are correctly delegated to AML-01, but **CDD in the regulatory sense includes screening**, and here a KYC-01 "pass" carries no screening dimension while the PEP-driven EDD trigger depends on AML "**when integrated**" — a dangling dependency. Nothing states that KYC "pass" = identity/entity verification **only**, and the KYC↔AML EDD linkage isn't a hard contract, so a case could finalize CDD-pass with a PEP-driven EDD path that was never wired.

Needed: state explicitly that **KYC-01 pass = identity/entity verification only (not screening)**; make the **KYC↔AML integration for PEP/EDD a hard contract** (not "when integrated"); and confirm the combined CDD decision (CLT-01) requires **both** KYC pass and AML clear.

### C5 — The evidence/document store security boundary is deferred to an undefined external
**Area:** §5.10 / 05 rule 4 ("raw sensitive documents should live in approved document/evidence store; KYC-01 stores references/hashes"), Open Item 8, `document_checklist_item.evidence_hash`.

The actual store holding the most sensitive PII (passports, proof of address, corporate/ownership documents) is **undefined**, and there's no contract for: **encryption at rest**, **access control** on the documents themselves and its relationship to IAM-02, **hash re-verification on read** (the stored `evidence_hash` should be checked against the store to detect tampering — currently stored but never verified), and **retention/destruction of the documents** (not just the refs). The crown-jewel PII protection is entirely deferred.

Needed: an evidence-store contract — encryption at rest, IAM-02-bound access control, hash re-verification on read (tamper detection), and retention/destruction aligned with the CLT-01 data-protection model.

---

## Recommended Corrections

1. **Cross-check verified identity vs CLT-01 applicant data** (name/DOB/entity details); a mismatch must route to remediation/EDD, not pass (§5.7 item 8 names the risk but no control).
2. **Vendor confidence-score acceptance policy + inconclusive handling** — define what score/status constitutes a pass; `inconclusive` must not silently drop.
3. **Deterministic outcome validity window** — define KYC-pass validity by risk class separate from document expiry (Open Item 7), so `stale` is computed, not ad hoc.
4. **Extend reconciliation** to detect: an authorised party marked active in CLT-01 while its KYC party-outcome is not `pass`; and a `pass` outcome with any untraced ownership branch (ties C1).
5. **Align the verified-identity hash basis with CLT-01 `verified_identity`** so duplicate-identity detection is consistent across KYC-01 and CLT-01 (currently `ownership_node.name_hash` and the KYC duplicate check use their own basis).
6. **Enumerate minimum EDD measures** (enhanced ownership verification, SoW/SoF, senior-management approval) rather than only routing to EDD.

---

## Additional Parameters to Define

```txt
# UBO look-through (C1)
ubo_lookthrough                 = recurse_to_natural_persons
ubo_untraceable                 = edd_or_fail_not_pass
ubo_indirect_aggregation        = enabled
trust_nominee_roles             = settlor_trustee_beneficiary_protector_modelled

# Vendor reliance (C2)
vendor_reliance_framework       = regulated_supervised_records_obtainable
vendor_outage_mode              = fail_closed_or_manual_fallback
vendor_result_validity          = risk_based_window
vendor_confidence_threshold     = to_be_defined
multi_source_corroboration      = risk_based

# Identity proofing (C3)
identity_proofing_assurance     = defined_by_class_and_risk
liveness_biometric_binding      = required_non_face_to_face
document_authenticity_check     = required
source_of_wealth_funds          = required_edd_high_risk_hnwi

# KYC/AML boundary (C4)
kyc_pass_scope                  = identity_entity_only_not_screening
kyc_aml_edd_contract            = hard_not_when_integrated
combined_cdd_requires           = kyc_pass+aml_clear

# Evidence store (C5)
evidence_store_encryption_at_rest = required
evidence_hash_reverified_on_read  = true
evidence_store_access_control     = iam2_bound
evidence_retention_destruction    = defined_aligned_with_clt01

# Corrections
identity_vs_application_crosscheck = mismatch_to_remediation_edd
verified_identity_hash_basis       = aligned_with_clt01
```

---

## Consistency Note

KYC-01 pairs cleanly with CLT-01: it is the authoritative provider of the CDD outcome CLT-01 §5.14 gates on, it separates delivery from outcome (matching CLT-01), verifies authorised parties before authority activates (matching CLT-01 §5.15), and supports perpetual KYC/periodic review (matching §5.16). Control-plane inheritance is clean (IAM-02 maker-checker/SoD, SEC-01 sensitive-read + fail-closed, CFG-01 gate, FND correlation). Sanctions/PEP are correctly deferred to AML-01, but that **boundary needs hardening** (C4), and the **verified-identity hash basis should align with CLT-01** (correction 5). The unifying theme: KYC-01 models the CDD *lifecycle* well but under-specifies the *verification assurance* (C1 UBO depth, C2 vendor reliance, C3 proofing standard) and the *evidence-store security* (C5).

---

## Top Priorities

1. **C1** — enforce UBO look-through to natural persons; untraceable ownership ⇒ EDD/fail. The core KYB control.
2. **C2** — a third-party reliance framework + vendor degraded-mode; CDD quality depends entirely on vendors.
3. **C3** — define identity-proofing assurance levels (liveness/biometric for remote) and SoW/SoF for HNWI.
4. **C4 / C5** — harden the KYC↔AML boundary and define the evidence-store security contract.
