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
4. Call CFG-01 to verify client class allowed.
5. If retail or ineligible class, hold/reject according to policy.
6. If eligible class, allow progression.
7. Emit SEC-01 audit event.
8. Store classification version and evidence reference.

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
2. System verifies KYC/KYB handoff status.
3. System verifies AML/sanctions handoff status.
4. System verifies duplicate flags reviewed.
5. System verifies CFG-01 gate still valid.
6. System creates approval request in IAM-02.
7. Checker/Compliance approver performs step-up where required.
8. IAM-02 checks SoD and self-approval.
9. If approved, onboarding status changes to approved.
10. Client profile status becomes active_limited or active_pending_downstream according to downstream status.
11. Emit SEC-01 audit event.

### Rules

1. Final approval does not grant trading/payment access alone.
2. Approval requires downstream module readiness according to policy.
3. Same user cannot maker/checker own approval.

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
