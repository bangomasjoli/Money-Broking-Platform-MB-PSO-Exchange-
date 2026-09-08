# CLT-01 Client Onboarding / Client Profile
## 02 Workflow

## 1. Workflow Scope

CLT-01 workflows cover application intake, client classification, retail lock, profile creation, authorised user setup, mandate setup, final approval, client profile amendment, duplicate review, downstream handoff, and reconciliation.

---

## 2. WF-CLT01-01 Start Application

### Trigger

Applicant or staff starts a client onboarding application.

### Steps

1. Capture applicant type and initial country/residency.
2. Call CFG-01 for onboarding feature availability.
3. If onboarding feature locked, deny/hold.
4. Create draft application.
5. Capture request/correlation ID.
6. Emit SEC-01 audit event.
7. Present required intake checklist.

### Fail-Closed Conditions

1. CFG-01 unavailable/unknown.
2. Client class unknown and required for progression.
3. Retail default lock applies.
4. SEC-01/FND audit outbox unavailable for sensitive application creation.

---

## 3. WF-CLT01-02 Client Classification

### Steps

1. Applicant selects/provides client type.
2. System captures evidence references for HNWI/professional/institutional claim.
3. System performs preliminary client-class classification.
4. If class evidence is not verified, treat class as retail-locked/held.
5. Verified class evidence requires maker-checker/Compliance where required.
6. Call CFG-01 using verified class to verify client class allowed.
7. If retail, unverified, or ineligible class, hold/reject according to policy.
8. If eligible verified class, allow progression.
9. Emit SEC-01 audit event.
10. Store classification version, verifier, evidence status and evidence reference.

---

## 4. WF-CLT01-03 Submit Application

### Steps

1. Applicant completes required intake fields.
2. Applicant confirms declarations/consents/terms.
3. System checks required fields.
4. System checks duplicate detection.
5. System calls CFG-01 gate.
6. Application status changes to submitted.
7. Handoff to KYC/KYB.
8. Handoff to AML/sanctions.
9. Emit SEC-01 audit event.

### Rules

1. Submission is not approval.
2. Submitted client cannot trade/deposit/withdraw.
3. Missing mandatory fields prevents submission.

---

## 5. WF-CLT01-04 Review and Final Approval

### Steps

1. Staff reviewer reviews application.
2. System verifies KYC/KYB delivery completed and CDD outcome is satisfactory/current.
3. System verifies AML/sanctions/PEP/adverse-media outcome is clear/current.
4. System verifies risk rating exists and is acceptable.
5. System verifies all required authorised-party outcomes pass.
6. System verifies duplicate and related-party critical findings are resolved.
7. System verifies CFG-01 gate still valid on verified client class.
8. System creates approval request in IAM-02.
9. Checker/Compliance approver performs step-up where required.
10. IAM-02 checks SoD and self-approval.
11. If approved, onboarding status changes to approved.
12. Client profile status becomes active_limited only for non-transactional setup/remediation, or active only after all downstream activation gates pass.
13. Emit SEC-01 audit event.

### Rules

1. Final approval does not grant trading/payment access alone.
2. Approval requires satisfactory downstream CDD/screening/risk outcomes, not merely handoff existence.
3. Same user cannot maker/checker own approval.
4. Sanctions hit, failed CDD, prohibited PEP/adverse-media result or risk rejection hard-blocks approval.

---

## 6. WF-CLT01-05 Client Profile Amendment

### Steps

1. User requests profile amendment.
2. IAM-02 permission check.
3. CFG-01 checks feature/client status.
4. Determine whether amendment is sensitive.
5. Sensitive amendment requires maker-checker and step-up.
6. Apply amendment as versioned profile update.
7. Trigger KYC/AML re-check where required.
8. Emit SEC-01 audit event.

---

## 7. WF-CLT01-06 Authorised User and Mandate Setup

### Steps

1. Client/staff requests authorised user or mandate setup.
2. Verify client status.
3. Verify authority evidence reference.
4. IAM-02 permission check.
5. Configure user role/mandate rules.
6. Configure client-side maker/checker threshold.
7. Sensitive setup requires approval.
8. Emit SEC-01 audit event.

### Rules

1. Authorised users cannot exceed mandate.
2. Client maker cannot approve own client-side action.
3. Mandate change may trigger KYC/KYB refresh.

---

## 8. WF-CLT01-07 Duplicate Review

### Steps

1. Duplicate detection flags possible duplicate.
2. Application status enters duplicate_review.
3. Staff reviewer reviews safe matching evidence.
4. Reviewer resolves as duplicate, not_duplicate, or requires_more_info.
5. Resolution emits SEC-01 audit event.
6. Approval cannot proceed until duplicate review resolved.

---

## 9. WF-CLT01-08 Status Suspension / Closure

### Steps

1. Staff/Compliance requests status change.
2. IAM-02 permission and approval where required.
3. Record reason and evidence reference.
4. Change status to suspended, closed, rejected, or restricted.
5. Notify downstream modules.
6. Emit SEC-01 audit event.
7. Reconciliation verifies downstream access is blocked.

---

## 10. WF-CLT01-09 Sensitive Read / Export

### Steps

1. User requests client profile read/export.
2. IAM-02 permission guard checks access.
3. Step-up/approval required for sensitive export.
4. SEC-01 sensitive read/export event emitted.
5. Data returned according to classification and role.
6. Export package expires.

---

## 11. WF-CLT01-10 Reconciliation

### Scheduled Checks

1. Draft application stale.
2. Submitted application without KYC/KYB handoff.
3. Submitted application without AML/sanctions handoff.
4. Approved profile with unresolved duplicate flag.
5. Active client with retail/ineligible class.
6. Suspended/closed client with downstream active access.
7. Client profile updated without audit ref.
8. Mandate expired but still active.

---

## 12. WF-CLT01-11 CDD Outcome Aggregation

### Trigger

KYC/KYB, AML/sanctions, PEP/adverse-media, or risk module returns an outcome.

### Steps

1. Receive downstream outcome event/API response.
2. Verify source module and payload hash.
3. Store outcome status separately from handoff delivery status.
4. Update aggregate onboarding outcome.
5. If all outcomes are satisfactory/current, allow review progression.
6. If outcome is failed, hit, rejected or stale, block approval and update client/application status.
7. Emit SEC-01 audit event.

### Outcome Model

```txt
handoff_delivery_status = pending/sent/received/failed/deadlettered/completed
kyc_kyb_outcome = pass/fail/pending/stale/remediation_required
aml_sanctions_outcome = clear/hit/pending/stale
pep_adverse_media_outcome = clear/hit/review_required
risk_rating_outcome = low/medium/high/prohibited/pending/stale
```

---

## 13. WF-CLT01-12 Authorised Party Screening

### Trigger

Authorised user, signatory, director, controller, or UBO is added/updated.

### Steps

1. Capture authorised-party identity and role.
2. Determine whether UBO threshold applies.
3. Create individual KYC/sanctions/PEP screening handoff.
4. Track delivery status and outcome status separately.
5. Block active authority until outcome is pass/clear.
6. If hit/fail, revoke or restrict authority and route to Compliance.
7. Emit SEC-01 audit event.
8. Propagate revocation to IAM-02 if authority was active.

---

## 14. WF-CLT01-13 Ongoing Monitoring / Perpetual KYC

### Trigger

Scheduled periodic review, document expiry, AML alert, sanctions re-hit, risk change, jurisdiction change, or downstream compliance feedback.

### Steps

1. Receive downstream status feedback.
2. Validate source and severity.
3. If critical, move client to restricted/suspended/review_required.
4. Revoke or revalidate affected authorised-party authority through IAM-02.
5. Notify downstream modules of CLT status change.
6. Require remediation and maker-checker approval before reinstatement.
7. Emit SEC-01 audit event.

---

## 15. WF-CLT01-14 Handoff Failure Handling

### Trigger

KYC/KYB, AML, PEP/adverse-media, or risk handoff fails or remains stuck.

### Steps

1. Retry according to retry policy.
2. Dead-letter after retry exhaustion.
3. Escalate to Operations/Compliance.
4. Block submission/approval progression while failed or dead-lettered.
5. Emit SEC-01 audit event.
6. Reconcile stuck handoffs.

---

## 16. WF-CLT01-15 Data Protection Request

### Trigger

Data subject requests access, rectification, erasure, restriction, or portability where supported.

### Steps

1. Verify requester authority.
2. Map requested data to lawful basis and retention class.
3. Determine whether AML/regulatory retention prevents deletion.
4. Apply access, rectification, restriction, pseudonymisation, or deny with lawful basis.
5. Notify downstream modules where copied data exists.
6. Emit SEC-01 audit event.
