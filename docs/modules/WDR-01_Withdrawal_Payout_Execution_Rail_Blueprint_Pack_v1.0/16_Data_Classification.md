# WDR-01 Withdrawal / Payout Execution Rail
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Payout execution | Financial Critical | Audit retained |
| Decision bundle | Financial / AML Critical | Restricted |
| Provider instruction | Financial Critical | Hash/signature |
| Provider status event | Financial Evidence | Audit retained |
| Finality record | Financial Critical | LED-linked |
| Cancellation request | Financial Critical | Maker-checker |
| Return/reversal case | Financial / AML Critical | Restricted |
| Provider route | Security / Vendor Config | Approval |
| Auth key reference | Security Critical | No secrets stored |
| Reconciliation break | Security Critical | Exception workflow |

## 2. Prohibited Data

WDR-01 must not store:

1. provider private keys/secrets.
2. ledger journals.
3. client available balance source of truth.
4. wallet private keys.
5. Exchange order book/matching data.
6. hidden spread settings.

## 3. Protection Rules

1. Provider secrets stored only in secrets manager, referenced by key ID.
2. Payloads hash-linked and evidence retained.
3. Sensitive reads audited.
4. Evidence export requires maker-checker.
5. Travel Rule/AML data restricted.
