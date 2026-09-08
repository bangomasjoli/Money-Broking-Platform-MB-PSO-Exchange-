# Principal Fintech Platform Architect Review — CLT-01 Client Onboarding / Client Profile v1.0

| Item | Details |
|---|---|
| Reviewed pack | CLT-01 Client Onboarding / Client Profile Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong structure; **5 critical gaps** before acceptance. Most serious is C1 — onboarding approval is gated on handoff *existence*, not CDD *outcomes*. |

---

## 0. Summary

CLT-01 is the first business-tier module and inherits the control plane cleanly: the CFG-01 onboarding/client-class gate with retail-lock (consistent with CFG-01 §5.5B and 00 v1.3), IAM-02 maker-checker + SoD + self-approval block, SEC-01 sensitive-read logging with fail-closed, onboarding≠trading separation, status-binding, direct-DB-edit prohibition, and Super-Admin/break-glass cannot bypass. The five critical gaps share a theme: CLT-01 models the **intake pipeline** well but under-specifies the **CDD-outcome gating**, **authorised-party screening**, and **ongoing monitoring** that AML/CFT require, plus data-protection depth and class-verification rigour.

---

## Critical Gaps

### C1 — Approval is gated on handoff *existence*, not KYC/KYB + AML/sanctions + risk *outcomes* — **HIGHEST PRIORITY**
**Area:** WF-CLT01-04 steps 2–3 ("verifies KYC/KYB handoff status" / "AML handoff status"), 05 §2.7 `handoff_status` (pending/sent/received/failed/**completed**), prohibited #4/#5, 12 RISK-003/004.

Final approval checks that a KYC/KYB and AML handoff **exists and completed the round-trip** — but "completed" means the handoff message cycle finished, **not** that CDD passed or screening was clear. As written, a client can be approved while KYC is still pending, has *failed*, or returned a **sanctions/PEP hit**, so long as the handoff was sent. Under Labuan AML/CFT and FATF CDD you cannot establish the relationship or activate the client until CDD is **complete and satisfactory** and screening is **clear**.

Needed: gate approval (and any `active`/`active_limited` status) on **satisfactory, current CDD + screening + risk-rating outcomes**, not handoff creation; a **sanctions/PEP hit must hard-block** (no approval path); model handoff *result* (pass/fail/hit) distinctly from handoff *delivery*.

### C2 — Authorised signatories, directors, and UBOs are not screened
**Area:** §5.8 mandate controls, WF-CLT01-06, 05 §2.4 `authorised_user`, out-of-scope items (KYB handed off for the entity only).

Corporate/institutional onboarding hands off **KYB for the entity**, but each **authorised user, director, controller, and beneficial owner (UBO)** must be individually **KYC + sanctions/PEP screened** before mandate authority is granted. Nothing here requires screening of the natural persons who will act for the client — a classic CDD failure that lets a sanctioned individual operate a clean corporate shell.

Needed: every `authorised_user` and identified UBO/controller must have its **own verified identity + sanctions/PEP screening** (handoff + outcome gating per C1) before the mandate/authority is active; define the **UBO identification threshold**.

### C3 — No ongoing-monitoring / bidirectional status: a later AML hit or KYC expiry can't suspend the client
**Area:** §5.9 ("no downstream module should assume onboarding status without checking current status" — one-directional), §5.10 status-binding, WF-CLT01-08.

Onboarding is modelled as a **forward pipeline**: CLT → KYC/AML/risk → approved. But there is no contract for the **reverse** — a post-onboarding sanctions re-hit, an AML transaction alert, a periodic-review failure, or a KYC-document expiry driving the CLT profile back to `suspended`/`restricted`. A client cleared at onboarding therefore stays `active` after a later hit, defeating **perpetual KYC / trigger-based review** obligations.

Needed: a defined **downstream → CLT status-feedback / ongoing-monitoring contract** (AML/KYC/risk modules can force CLT suspension/review), plus periodic-review scheduling and expiry handling that changes client status.

### C4 — The eligibility gate relies on *unverified* evidence, so mis-classification defeats the retail lock
**Area:** §5.3/5.7, WF-CLT01-02 (capture ref → preliminary classify → CFG check), 05 §2.3 `client_classification_evidence.status` (provided/verified/rejected), TC-007.

Client-class drives whether the **retail lock** applies, but progression past the eligibility gate happens on a **preliminary/self-declared** classification with an evidence status that can be merely `provided` (not `verified`). TC-007 blocks "HNWI claimed *without* a ref," but "claimed *with* an unverified ref" isn't clearly held. Since the retail lock is only as strong as class verification, a misclassified retail applicant can be onboarded as institutional — a direct **licence-scope breach**.

Needed: eligible-class progression must require **verified** classification evidence (maker-checker / Compliance), not merely provided; treat unverified class as retail-locked until verification; log class as a controlled, audited attribute (already partly present) and re-gate through CFG-01 on the *verified* class.

### C5 — Data-protection depth is thin for a PII system-of-record (lawful basis, DSAR vs immutable audit, cross-border, retention)
**Area:** 16 Data Classification (good inventory/minimisation, but retention = "compliance/regulatory retention" undefined), §5.5, consent (`consent_record`).

For the client-data system of record handling **non-resident institutional PII**, the pack lacks: (a) explicit **lawful basis** (obligation vs consent — AML retention must not depend on withdrawable consent); (b) **data-subject rights** (access/rectification/erasure) reconciled with the **append-versioned profile + immutable SEC-01 audit** and downstream copies; (c) **cross-border storage/transfer basis** for PSO/client data (ties to CFG-01/SEC-01 jurisdiction items); (d) concrete **retention durations + destruction process** rather than "compliance/regulatory retention."

Needed: a defined DP model — lawful-basis map, DSAR/rectification/erasure handling (pseudonymise-not-delete where audit/AML retention applies), cross-border transfer basis, and retention schedule + post-retention destruction.

---

## Recommended Corrections

1. **Handoff failure handling:** `handoff_status.failed` has no retry/dead-letter/escalation defined; a failed or never-completed KYC/AML handoff must **block progression** (not just a *missing* handoff), with reconciliation for stuck handoffs.
2. **Mandate schema + revocation propagation:** `client_mandate.rules jsonb` is free-form — define/validate a schema and make it **consistent with the IAM-02 client-side dual-authorisation contract (WF-IAM02-10)** that MON withdrawal will rely on; authorised-user **revocation must propagate immediately** (revoke IAM sessions/authority, like IAM-02 revocation).
3. **Hard client-uniqueness + related-party graph:** add a uniqueness constraint preventing two `active` clients for the same verified identity, and an **associated-party/related-account graph** for AML (structuring/concentration), beyond same-entity `duplicate_candidate`.
4. **Consent lawful-basis + withdrawal:** capture withdrawal handling and distinguish obligation-based from consent-based processing.
5. **Define `active_limited` precisely:** state exactly what it permits and confirm it **cannot transact** (it's currently set at approval while downstream is pending).
6. **Make the client-side dual-auth setup (§5.8) explicitly reference IAM-02 WF-IAM02-10** so client maker≠approver is enforced by the permission engine, not just asserted here.

---

## Additional Parameters to Define

```txt
# CDD outcome gating (C1)
onboarding_approval_gate        = kyc_kyb_pass+aml_sanctions_clear+risk_rated   # not handoff_sent
sanctions_or_pep_hit            = hard_block_no_onboard
handoff_result_modelled         = pass_fail_hit_distinct_from_delivery

# Authorised-party screening (C2)
authorised_party_screening      = each_signatory_director_ubo_kyc_sanctions
ubo_identification_threshold    = to_be_defined

# Ongoing monitoring (C3)
ongoing_monitoring              = downstream_status_change_can_suspend_client
perpetual_kyc_trigger_review    = enabled
periodic_review_scheduling      = to_be_defined

# Class-evidence verification (C4)
class_progression_requires      = verified_classification_evidence_maker_checker
unverified_class                = treated_as_retail_locked

# Data protection (C5)
pii_lawful_basis                = defined_obligation_or_consent
dsar_rectification_erasure      = reconciled_with_immutable_audit_pseudonymise
cross_border_storage_basis      = defined_for_pso_client_data
retention_period_by_class       = to_be_defined
destruction_process             = defined_post_retention

# Corrections
handoff_failure                 = retry_deadletter_escalate;failed_blocks_progression
mandate_rules_schema            = validated_consistent_with_iam02_client_dual_auth
authorised_user_revocation      = immediate_propagation
client_uniqueness               = hard_constraint_on_verified_identity
related_party_graph             = enabled_for_aml
```

---

## Consistency Note

CLT-01 inherits the control plane cleanly: the CFG-01 onboarding/client-class gate (retail-lock consistent with CFG-01 §5.5B and 00 v1.3), IAM-02 maker-checker/SoD/self-approval, SEC-01 sensitive-read + fail-closed, onboarding≠trading, and status-binding are all present and consistent. The **client-side dual-authorisation setup (§5.8/WF-06) is the upstream of IAM-02 WF-IAM02-10** — that linkage should be made explicit (correction 6). The unifying theme of the gaps: CLT-01 models the **intake pipeline** well but under-specifies the **CDD-outcome gating** (C1), **authorised-party screening** (C2), and **ongoing monitoring** (C3) that AML/CFT require, plus data-protection depth (C5) and class-verification rigour (C4).

---

## Top Priorities

1. **C1** — gate approval on CDD/screening *outcomes*, not handoff existence; sanctions/PEP hit hard-blocks. This is the core AML onboarding control.
2. **C2** — screen every authorised signatory, director, and UBO, not just the entity.
3. **C3** — bidirectional status / ongoing monitoring so a later hit can suspend a cleared client.
4. **C4 / C5** — verified-evidence class gating (protect the retail lock) and a concrete data-protection model.
