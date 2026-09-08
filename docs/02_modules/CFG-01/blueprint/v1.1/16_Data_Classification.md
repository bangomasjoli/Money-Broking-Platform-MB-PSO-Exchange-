# CFG-01 Feature Flag / Licence Lock  
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Licence profile | Restricted / Security Critical | Approval/audit required |
| Licence evidence ref | Restricted | Access controlled |
| Feature registry | Confidential / Restricted | Change controlled |
| Prohibited feature registry | Security Critical | Hard-blocked, approval required, signed/sealed |
| Feature state change | Restricted / Security Critical | Approval/audit |
| Feature decision log | Restricted | Audit/evidence |
| Feature decision token | Security Critical | Hash/reference only; binds feature/licence/prohibited versions |
| Kill-switch record | Security Critical | Audit/review |
| Deployment gate check | Restricted | Deployment evidence |
| Handoff reconciliation | Security Critical | Audit retained |
| Feature version/config hash | Security Critical | Integrity evidence |
| Config integrity seal | Security Critical | Signed/sealed to Doc 00 baseline |
| Exchange activation ceremony | Security Critical | Board/Compliance/Management evidence |
| LFSA evidence authenticity record | Restricted / Security Critical | Verified source evidence |
| Feature gate mapping | Security Critical | IAM-02 binding evidence |
| Audit outage mode record | Security Critical | Resilience evidence |
| Synthetic non-prod exception | Restricted / Security Critical | Quarantined, no real client data |
| Evidence export | Restricted / Security Critical | Approval/logging |

---

## 2. Prohibited Data

CFG-01 should not store:

1. Client KYC documents.
2. AML case details.
3. Full audit event payloads.
4. Secrets/API keys.
5. MFA codes/tokens.
6. Private keys.
7. Payment instrument full details.
8. Ledger entries beyond references.
9. Full regulatory report contents where reference is enough.

---

## 3. Access Principles

1. Least privilege.
2. IAM-02 permission guard required.
3. Step-up for sensitive changes.
4. Approval for licence-sensitive changes.
5. SEC-01 audit for sensitive read/write.
6. No direct DB edits.
7. Evidence export controlled.
8. Super Admin cannot bypass licence lock.
9. Break-glass cannot enable locked feature.
10. Config integrity seal required for licence/prohibited changes.
11. Exchange activation evidence requires higher access and approval.
12. Synthetic non-prod exception cannot contain real client/PSO/payment data.

---

## 4. Retention

| Data | Retention |
|---|---|
| Licence profile history | Life of platform + regulatory retention |
| Prohibited feature registry | Life of platform + audit retention |
| Feature change history | Audit/regulatory retention |
| Decision logs | Audit/security retention |
| Deployment gate checks | Deployment/evidence retention |
| Handoff reconciliation | Audit/regulatory retention |
| Kill-switch records | Security/audit retention |
| Evidence exports | Export/evidence retention |
| Config integrity seals | Life of platform + audit/regulatory retention |
| Exchange activation ceremony | Life of platform + regulatory retention |
| LFSA evidence authenticity records | Life of platform + regulatory retention |
