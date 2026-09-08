# KYC-01 KYC / KYB Verification
## 07 Permission Rules

## 1. Permission Namespace

```txt
kyc1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `kyc1.case.read` | Read KYC case |
| `kyc1.case.read_sensitive` | Read sensitive case data |
| `kyc1.case.create` | Create case |
| `kyc1.case.update` | Update case |
| `kyc1.evidence.add` | Add evidence reference |
| `kyc1.evidence.read` | Read evidence reference |
| `kyc1.evidence.export` | Export evidence |
| `kyc1.verification_result.receive` | Receive vendor/manual result |
| `kyc1.manual_review.request` | Request manual review |
| `kyc1.manual_review.approve` | Approve manual decision |
| `kyc1.edd.review` | Review EDD case |
| `kyc1.outcome.compute` | Compute outcome |
| `kyc1.outcome.publish` | Publish outcome |
| `kyc1.periodic_review.run` | Run periodic review |
| `kyc1.admin.configure` | Configure KYC module |
| `kyc1.vendor_reliance.manage` | Manage vendor reliance/accreditation |
| `kyc1.proofing_policy.manage` | Manage proofing assurance policy |
| `kyc1.evidence_store_contract.manage` | Manage evidence-store contract |
| `kyc1.ownership_lookthrough.review` | Review ownership look-through |
| `kyc1.edd_measure.approve` | Approve EDD measure |

---

## 3. Maker-Checker Required

Required for:

1. manual pass.
2. manual fail override.
3. EDD approval.
4. remediation clearance.
5. UBO exception.
6. duplicate verified identity exception.
7. document exception.
8. vendor result override.
9. stale outcome reinstatement.
10. evidence export.
11. vendor reliance approval.
12. proofing policy change.
13. evidence-store contract approval.
14. untraceable ownership EDD/fail decision.
15. EDD measure completion approval.

---

## 4. SoD Rules

1. Analyst who requests manual pass cannot approve it.
2. Evidence uploader cannot solely approve verification result.
3. EDD reviewer cannot approve own EDD escalation.
4. UBO exception requester cannot approve own exception.
5. Vendor service account cannot approve outcome.
6. Super Admin cannot bypass CDD outcome.
7. Break-glass cannot approve KYC/KYB outcome.
8. Outcome publisher cannot alter outcome payload.

---

## 5. Outcome Rules

CDD pass requires:

```txt
required_documents_verified = true
identity_or_entity_verified = true
ubo_controller_verification_complete = true where applicable
authorised_party_verification_complete = true where applicable
edd_required = false or edd_approved = true
duplicate_identity_unresolved = false
```

Hard block:

```txt
failed_identity_verification
failed_entity_verification
invalid_or_tampered_document
missing_ubo_verification
unapproved_edd_required
manual_override_without_approval
```

## 6. UBO / Vendor / Proofing Rules

1. UBO look-through must resolve to ultimate natural persons.
2. Untraceable ownership/control cannot pass.
3. Vendor result cannot pass unless vendor reliance is approved and result meets threshold.
4. Inconclusive vendor result cannot pass.
5. Required proofing assurance method must be satisfied before pass.
6. KYC pass cannot be interpreted as AML/sanctions/PEP clearance.
7. Evidence-store hash mismatch blocks evidence use.
