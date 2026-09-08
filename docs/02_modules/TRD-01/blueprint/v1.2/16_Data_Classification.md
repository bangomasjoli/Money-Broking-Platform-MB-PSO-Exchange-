# TRD-01 Quote / Trade / LP Execution
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| LP quote | Restricted / Trading Sensitive | Access controlled |
| Client quote | Restricted / Trading Sensitive | Client/staff scoped |
| Trade | Restricted / Financial Critical | Audit retained |
| LP order | Restricted / Trading Sensitive | Source auth/hash |
| LP fill | Restricted / Financial Critical | Execution evidence |
| Client fill | Restricted / Financial Critical | Confirmation evidence |
| Settlement handoff | Restricted / Financial Critical | LED evidence |
| Fee disclosure | Restricted / Financial Evidence | Audit retained |
| Slippage policy | Restricted / Control Config | Approval |
| LP profile | Restricted / Vendor Config | Approval |
| Reconciliation break | Restricted / Security Critical | Exception workflow |
| Quote hash/payload hash | Security Critical | Integrity |

---

## 2. Prohibited Data

TRD-01 must not store:

1. private keys.
2. payment execution credentials.
3. ledger balances as source of truth.
4. AIX inventory positions.
5. order book data.
6. matching engine state.
7. client-to-client matching data.
8. market maker settings.
9. hidden spread settings.
10. raw KYC documents.
11. raw STR/suspicion data.

---

## 3. Access Principles

1. least privilege.
2. IAM-02 permission guard.
3. SEC-01 audit for sensitive read/export.
4. LP credentials/secrets not exposed.
5. client sees own quote/trade only.
6. staff access role-scoped.
7. evidence exports approved and expiring.
8. prohibited Exchange fields cannot be configured.

---

## 4. Retention

| Data | Retention |
|---|---|
| Quotes | Trading/audit retention |
| Trades | Financial/regulatory retention |
| LP orders/fills | Financial/regulatory retention |
| Settlement handoffs | Financial/regulatory retention |
| Fee disclosures | Financial/regulatory retention |
| Reconciliation | Audit/regulatory retention |
| Evidence exports | Export/evidence retention |

## v1.1 Data Classification Additions

Additional protected data:

| Data | Classification | Protection |
|---|---|---|
| Execution model | Restricted / Control Critical | Quote/trade bound |
| Fill conservation record | Financial Critical | Audit retained |
| Price construction record | Financial Critical | Fee/no-spread evidence |
| LP timeout resolution | Trading Sensitive / Critical | Query-back evidence |
| CFG revalidation result | Security Critical | Execution/settlement gate |
| LP selection record | Restricted / Best-Execution Evidence | Audit retained |
| Settlement confirmation sync | Financial Critical | LED outcome evidence |

Rules:

1. Fill conservation and price identity records are regulatory evidence.
2. CFG revalidation evidence is security-critical.
3. LP selection rationale must be retained.
4. Client confirmation status must be traceable to LED-01 outcome.
