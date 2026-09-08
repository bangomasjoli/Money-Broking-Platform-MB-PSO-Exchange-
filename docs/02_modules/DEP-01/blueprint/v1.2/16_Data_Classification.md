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

## v1.1 Data Classification Additions

| Data | Classification | Protection |
|---|---|---|
| Credit screening bundle | Financial Critical / AML Sensitive | Audit retained |
| Revocation signal | AML/Security Critical | Immediate action |
| Source-of-funds review | AML Sensitive | Restricted |
| Provider identity/key ref | Security Critical | Secrets governance |
| File feed sequence | Financial Evidence | Audit retained |
| Finality model evidence | Financial Critical | Reconciliation |
| Amount disposition | Financial Critical | Policy/audit |
| Return case | Financial/AML Critical | Compliance review |
| Inbound Travel Rule data | AML Sensitive | Restricted |

Rules:

1. SoF/SoW and Travel Rule data require restricted access.
2. Provider keys/secrets are not stored in DEP tables; only references/key IDs.
3. Credit-bundle evidence is regulatory evidence.
4. Reversal correlation evidence must be retained with original receipt.
