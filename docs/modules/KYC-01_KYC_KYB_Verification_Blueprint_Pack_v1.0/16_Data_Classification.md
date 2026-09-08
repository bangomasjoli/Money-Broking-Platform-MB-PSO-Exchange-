# KYC-01 KYC / KYB Verification
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| KYC/KYB case | Restricted / Compliance Sensitive | Access controlled |
| Identity evidence ref | Restricted / Personal Data | Encrypted/reference |
| Entity evidence ref | Restricted | Access controlled |
| Document checklist | Restricted | Case-scoped |
| Verification result | Restricted / Compliance Sensitive | Audit retained |
| Vendor payload hash | Security Critical | Integrity evidence |
| Ownership node | Restricted / Compliance Sensitive | AML/KYB access |
| UBO/controller data | Restricted / Personal Data | High protection |
| CDD outcome | Restricted / Compliance Sensitive | Outcome publication |
| Manual review | Restricted / Security Critical | Maker-checker |
| Periodic review | Restricted | Scheduled |
| Evidence access log | Security Critical | SEC-01 logged |
| Evidence export | Restricted / Security Critical | Approval/logging |

---

## 2. Prohibited Data

KYC-01 should not store:

1. Passwords.
2. MFA codes.
3. API secrets.
4. Wallet private keys.
5. Full payment instrument data.
6. Trading orders.
7. Ledger balances.
8. Raw documents outside approved evidence/document store.
9. Raw sanctions/PEP/adverse-media reports owned by AML module.
10. Unnecessary PII beyond CDD need.

---

## 3. Access Principles

1. Least privilege.
2. IAM-02 permission guard.
3. Step-up for sensitive export.
4. SEC-01 audit for sensitive read/export.
5. Evidence-scoped access.
6. Data minimisation.
7. Redaction for non-sensitive views.
8. Vendor service account scoped and source-authenticated.
9. Auditor export controlled.

---

## 4. Retention

| Data | Retention |
|---|---|
| KYC/KYB case | AML/CFT regulatory retention |
| Evidence refs | AML/CFT regulatory retention |
| Verification result | AML/CFT regulatory retention |
| UBO/controller data | AML/CFT regulatory retention |
| CDD outcome | AML/CFT regulatory retention |
| Manual review | Audit/regulatory retention |
| Vendor result inbox | Vendor/audit retention |
| Evidence access log | Security/audit retention |
