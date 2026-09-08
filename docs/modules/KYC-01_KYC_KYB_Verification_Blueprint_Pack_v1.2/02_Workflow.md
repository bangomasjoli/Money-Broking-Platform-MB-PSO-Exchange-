# KYC-01 KYC / KYB Verification
## 02 Workflow

## 1. Workflow Scope

KYC-01 workflows cover case creation, document checklist, identity/entity verification, UBO verification, authorised-party verification, CDD outcome computation, EDD routing, remediation, periodic review, outcome publication and reconciliation.

---

## 2. WF-KYC01-01 Case Creation from CLT Handoff

### Trigger

CLT-01 sends KYC/KYB handoff.

### Steps

1. Receive CLT handoff.
2. Verify source module and payload hash.
3. Verify application/client/party reference.
4. Determine case type: individual, entity, authorised_party.
5. Create KYC/KYB case.
6. Generate document checklist.
7. Set case status to open/pending_documents.
8. Emit SEC-01 audit event.
9. Publish delivery acknowledgement to CLT-01.

### Rules

1. Delivery acknowledgement is not CDD outcome.
2. Case creation does not pass onboarding.
3. Invalid handoff is rejected and dead-lettered/escalated.

---

## 3. WF-KYC01-02 Document Collection and Evidence Reference

### Steps

1. Receive document/evidence reference from CLT/document store/vendor.
2. Validate document type against checklist.
3. Store document reference, hash and metadata.
4. Mark checklist item received.
5. Check expiry and completeness.
6. Emit audit event.

### Rules

1. Raw sensitive document access is controlled.
2. Expired/invalid/tampered document cannot satisfy checklist.
3. Missing required checklist item prevents pass.

---

## 4. WF-KYC01-03 Individual Identity Verification

### Steps

1. Load individual case.
2. Validate required identity evidence references.
3. Determine required proofing assurance level by class, risk and channel.
4. Perform document authenticity check.
5. Perform liveness/biometric binding where non-face-to-face or policy requires.
6. Perform address verification where required.
7. Cross-check verified identity against CLT-01 application data.
8. Send to accredited vendor/manual verification if applicable.
9. Receive vendor/manual result.
10. Verify result source identity, vendor accreditation, payload hash, confidence threshold and validity window.
11. Store verification result with assurance method/level.
12. If pass, mark identity verified.
13. If fail/inconclusive/mismatch/below-threshold, route to remediation, EDD or manual review.
14. Emit SEC-01 audit event.

---

## 5. WF-KYC01-04 Entity KYB Verification

### Steps

1. Load entity case.
2. Verify legal name, registration number, jurisdiction and status.
3. Capture corporate registry evidence reference.
4. Verify authorised representative evidence.
5. Cross-check verified entity details against CLT-01 application data.
6. Build ownership/control structure.
6. Identify directors/controllers/UBOs.
7. Create party verification cases where required.
8. Emit audit event.

---

## 6. WF-KYC01-05 UBO / Ownership Verification

### Steps

1. Load ownership/control structure.
2. Recursively trace each ownership/control branch through intermediate entities to ultimate natural persons.
3. Apply configured UBO threshold.
4. Aggregate indirect ownership across branches.
5. Model trust/nominee roles including settlor, trustee, beneficiary, protector, nominee and controller.
6. Identify UBOs/controllers requiring verification.
7. Verify each UBO/controller through party verification.
8. If any branch is untraceable, route to EDD or fail; never pass.
9. If threshold coverage incomplete, mark remediation_required.
10. If structure complex/high-risk, route to EDD.
11. Emit audit event.

---

## 7. WF-KYC01-06 Authorised Party Verification

### Steps

1. Receive authorised-party case from CLT-01.
2. Verify identity evidence.
3. Verify authority evidence reference.
4. Verify role and mandate relationship.
5. Return pass/fail/remediation outcome for authorised party.
6. Publish outcome to CLT-01.
7. Emit SEC-01 audit event.

---

## 8. WF-KYC01-07 CDD Outcome Computation

### Steps

1. Load case and verification results.
2. Check required documents complete.
3. Check identity/entity verified.
4. Check UBO/controller verification complete.
5. Check authorised-party verification where applicable.
6. Check remediation/EDD status.
7. Check KYC/AML boundary dependencies and confirm KYC pass is identity/entity only, not screening.
8. Compute outcome: pass/fail/pending/stale/remediation_required.
9. Set validity/review date based on risk class and result-validity policy.
10. Publish outcome to CLT-01.
11. Emit SEC-01 audit event.

### Hard Blocks

1. Missing required identity/entity verification.
2. Missing UBO/controller verification.
3. Invalid/tampered/expired document.
4. Failed verification.
5. Unresolved duplicate verified identity.
6. EDD required but not approved.
7. Untraceable ownership/control branch.
8. Required evidence-store hash re-verification fails.
9. Vendor result inconclusive/below threshold/expired/unaccredited.

---

## 9. WF-KYC01-08 Enhanced Due Diligence

### Trigger

EDD trigger identified.

### Steps

1. Set case to EDD required.
2. Create EDD review task.
3. IAM-02 permission/approval for EDD decision.
4. Compliance/MLRO reviews evidence.
5. Approve, reject, or request remediation.
6. Publish outcome to CLT-01 if final.
7. Emit SEC-01 audit event.

---

## 10. WF-KYC01-09 Remediation

### Steps

1. Reviewer/vendor marks remediation required.
2. Remediation request sent to CLT-01/applicant.
3. Applicant provides updated evidence reference.
4. Re-verify evidence.
5. Compute updated outcome.
6. Publish outcome.
7. Emit audit event.

---

## 11. WF-KYC01-10 Periodic Review / Stale Outcome

### Trigger

Review due, document expiry, downstream trigger, risk event, or manual request.

### Steps

1. Identify case due for review.
2. Set outcome to stale if review overdue or evidence expired.
3. Publish stale outcome to CLT-01.
4. Request refreshed evidence.
5. Re-run required verification.
6. Publish updated outcome.
7. Emit SEC-01 audit event.

---

## 12. WF-KYC01-11 Sensitive Evidence Read / Export

### Steps

1. User requests evidence read/export.
2. IAM-02 permission check.
3. Step-up/approval where sensitive export.
4. SEC-01 sensitive read/export event emitted.
5. Evidence returned according to classification and scope.
6. Export package expires.

---

## 13. WF-KYC01-12 Reconciliation

### Scheduled Checks

1. CLT handoff without KYC case.
2. KYC case without outcome.
3. Outcome not published to CLT.
4. Passed outcome with missing required document.
5. Passed outcome with missing UBO verification.
6. Stale/expired evidence but pass outcome still active.
7. Manual override without IAM-02 approval.
8. Vendor result without source identity/payload hash.
9. Sensitive read/export without SEC-01 audit.

---

## 14. WF-KYC01-13 Vendor Reliance / Degraded Mode

### Trigger

Vendor is configured, result received, or vendor is unavailable.

### Steps

1. Verify vendor accreditation/reliance status.
2. Confirm vendor is regulated/supervised or otherwise approved by Compliance.
3. Confirm underlying CDD records are obtainable on demand.
4. Validate vendor result source, signature, payload hash, confidence score and result validity window.
5. If vendor unavailable, fail closed or route to approved manual fallback.
6. Inconclusive or below-threshold result cannot pass.
7. Emit SEC-01 audit event.

---

## 15. WF-KYC01-14 Evidence Store Verification

### Trigger

Evidence is added, read, exported, used in outcome computation, or reconciled.

### Steps

1. Request evidence metadata from approved evidence store.
2. Verify evidence-store access is IAM-02-bound.
3. Verify encryption/retention contract is active.
4. Recompute or retrieve evidence hash.
5. Compare with KYC-01 stored evidence hash.
6. If mismatch, block use and raise Critical SEC-01 alert.
7. Apply retention/destruction/legal hold policy aligned to CLT-01.
8. Emit SEC-01 audit event.

---

## 16. WF-KYC01-15 KYC / AML Boundary and EDD Trigger

### Trigger

AML-01 returns PEP/adverse-media/sanctions/EDD trigger or screening dependency status.

### Steps

1. Receive AML trigger/outcome reference.
2. Confirm KYC pass remains identity/entity-only.
3. If AML requires EDD/remediation, set KYC case to EDD/remediation/stale where applicable.
4. Do not publish overall CDD-ready status from KYC alone.
5. Publish KYC identity/entity outcome to CLT-01 with scope indicator.
6. Emit SEC-01 audit event.
