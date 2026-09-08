# CLT-01 Client Onboarding / Client Profile
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Client application | Restricted / Personal Data | Access controlled |
| Client profile | Restricted / Personal Data | Access controlled |
| Client class | Restricted | Approval/audit |
| Classification evidence ref | Restricted | Reference only |
| Country/jurisdiction | Restricted | Access controlled |
| Authorised user | Restricted / Personal Data | Mandate controlled |
| Mandate | Restricted / Security Critical | Approval/audit |
| Consent record | Restricted / Legal | Audit retained |
| Handoff status | Restricted | Integrity hash |
| Duplicate candidate | Restricted | Reviewer-only |
| Status history | Restricted / Security Critical | Append history |
| Evidence export | Restricted / Security Critical | Approval/logging |

---

## 2. Prohibited Data

CLT-01 should not store:

1. Full raw KYC/KYB verification results where downstream reference is enough.
2. Sanctions/PEP raw screening details where downstream reference is enough.
3. Wallet private keys.
4. Payment instrument full details.
5. Passwords.
6. MFA codes.
7. API secrets.
8. Full AML suspicious report content.
9. Ledger balances.
10. Trading orders.

---

## 3. Access Principles

1. Least privilege.
2. IAM-02 permission guard required.
3. SEC-01 audit for sensitive read/export.
4. Step-up for sensitive export.
5. Approval for sensitive amendment.
6. Client can view own permitted profile subset only.
7. Staff read is role/scoped.
8. Auditor read is evidence-scoped.
9. Data minimisation required.
10. PII redaction for non-sensitive views.

---

## 4. Retention

| Data | Retention |
|---|---|
| Client application | Compliance/regulatory retention |
| Client profile | Client lifecycle + regulatory retention |
| Client class evidence refs | Compliance retention |
| Consent records | Legal/regulatory retention |
| Mandate records | Client lifecycle + audit retention |
| Status history | Audit/regulatory retention |
| Handoff records | Audit/regulatory retention |
| Evidence exports | Export/evidence retention |
