# WLT-01 Wallet Screening / Payout Destination Whitelist
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Wallet address | Restricted / AML Sensitive | Hash/reference; access controlled |
| Wallet screening result | Restricted / Compliance Sensitive | Audit retained |
| Wallet risk category | Restricted / Compliance Sensitive | Compliance access |
| Payout destination | Restricted / Financial Data | Tokenised/masked |
| Bank account token | Restricted / Financial Data | Tokenised |
| Beneficiary name hash | Restricted / Personal Data | Hash/redacted |
| Beneficiary relationship | Restricted | Access controlled |
| Whitelist status | Security Critical | Versioned/audited |
| Destination decision token | Security Critical | Short-lived |
| AML decision reference/hash | Security Critical | Integrity |
| Travel Rule data | Restricted / Personal Data | Minimise |
| Vendor payload hash | Security Critical | Integrity |
| Revocation event | Security Critical | Audit |
| Sensitive access log | Security Critical | SEC-01 logged |

---

## 2. Prohibited Data

WLT-01 must not store:

1. Private keys.
2. Seed phrases.
3. Transaction signing material.
4. Full raw bank account where token/reference is enough.
5. Raw KYC documents.
6. Raw STR/suspicion reports.
7. Ledger balances.
8. Trading orders.
9. Payment execution credentials.
10. Unnecessary Travel Rule personal data.

---

## 3. Access Principles

1. Least privilege.
2. IAM-02 permission guard.
3. Client-side mandate access.
4. SEC-01 audit for sensitive read/export.
5. Masking/tokenisation for payout data.
6. Hash/reference for wallet/bank data where possible.
7. Role-based redaction.
8. Export expiry.
9. Vendor service account scoped and source-authenticated.

---

## 4. Retention

| Data | Retention |
|---|---|
| Wallet destination | Client lifecycle + AML retention |
| Wallet screening result | AML/CFT retention |
| Payout destination | Client lifecycle + payment/AML retention |
| Beneficiary evidence refs | AML/KYC/payment retention |
| Destination approval | Audit/regulatory retention |
| Destination decision | Operational/audit retention |
| Revocation event | Audit/regulatory retention |
| Sensitive access log | Security/audit retention |
