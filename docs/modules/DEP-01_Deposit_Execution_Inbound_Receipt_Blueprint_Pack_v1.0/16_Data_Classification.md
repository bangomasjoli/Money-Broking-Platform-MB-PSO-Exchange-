# DEP-01 Deposit Execution / Inbound Receipt
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Deposit intent | Restricted / Financial |
| External receipt | Restricted / Financial Critical |
| Raw payload hash | Security Critical |
| Source account/wallet metadata | Restricted / AML Sensitive |
| Sender/remitter metadata | Restricted / AML Sensitive |
| Deposit match | Financial Critical |
| Confirmation status | Financial Critical |
| Screening handoff | AML Sensitive |
| LED handoff | Financial Critical |
| Quarantine case | Security / Financial Critical |
| Reversal event | Financial Critical |
| Reconciliation break | Security Critical |

## 2. Prohibited Data

DEP-01 must not store:

1. private keys.
2. raw client passwords/MFA secrets.
3. available balance source of truth.
4. ledger journals.
5. hidden spread configs.
6. Exchange order book or matching data.
7. raw KYC document copies unless required by evidence policy.

## 3. Protection Rules

1. Source account/wallet identifiers should be hashed/masked where possible.
2. Raw provider payloads should be stored in controlled evidence store or hash-linked object store.
3. Sensitive reads require SEC-01 audit.
4. Evidence export requires maker-checker.
5. Retention follows longest applicable regulatory/evidence requirement.
