# LED-01 Ledger / Settlement / Safeguarding
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Ledger account | Restricted / Financial Critical | Access controlled |
| Journal | Restricted / Financial Critical | Immutable |
| Journal line | Restricted / Financial Critical | Immutable |
| Balance snapshot | Restricted / Financial Critical | Derived/hash |
| Hold/reserve | Restricted / Financial Critical | Settlement control |
| Deposit | Restricted / Financial Critical | Client money evidence |
| Settlement | Restricted / Financial Critical | Execution control |
| Safeguarding position | Restricted / Regulatory Critical | Finance/Compliance |
| Reconciliation run | Restricted / Regulatory Evidence | Audit retained |
| Reconciliation break | Restricted / Security Critical | Exception workflow |
| Freeze | Security Critical | Approval/audit |
| Period close | Restricted / Finance Critical | Approval/audit |
| WLT decision ref/hash | Security Critical | Integrity |
| AML decision ref/hash | Security Critical | Integrity |

---

## 2. Prohibited Data

LED-01 must not store:

1. private keys.
2. payment execution credentials.
3. raw KYC documents.
4. raw STR/suspicion data.
5. hidden spread configs.
6. Exchange order book data.
7. matching engine state.
8. client passwords/MFA secrets.
9. sandbox/test financial postings in production ledger.

---

## 3. Access Principles

1. least privilege.
2. IAM-02 permission guard.
3. finance/compliance role segregation.
4. SEC-01 audit for sensitive read/export.
5. no direct DB financial edits.
6. service accounts scoped to event posting only.
7. production ledger access restricted.
8. evidence exports approved and expiring.
9. segregation between prod/test ledgers.

---

## 4. Retention

| Data | Retention |
|---|---|
| Journals | Financial/regulatory retention |
| Journal lines | Financial/regulatory retention |
| Balance snapshots | Finance/audit retention |
| Holds/settlements | Financial/regulatory retention |
| Reconciliation | Audit/regulatory retention |
| Safeguarding reports | Regulatory retention |
| Freeze/incident records | Security/regulatory retention |
| Evidence exports | Export/evidence retention |
