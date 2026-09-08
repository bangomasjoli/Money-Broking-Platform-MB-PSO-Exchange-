# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 08 Reconciliation And Evidence Map

## 1. Evidence Chain by Flow

### 1.1 Deposit

| Step | Evidence |
|---|---|
| Inbound receipt | bank/custodian/chain ref |
| Source screening | WLT source screening ID |
| AML decision | AML pre-transaction/source decision |
| Backing check | LED backing encumbrance |
| Ledger credit | LED journal ID/hash |
| Audit | SEC event refs |
| Reconciliation | LED/WLT recon run |

### 1.2 Trade

| Step | Evidence |
|---|---|
| Quote request | TRD quote request event |
| LP quote | LP quote ID + payload hash |
| Client quote | quote hash + fee disclosure |
| Acceptance | client approval/mandate evidence |
| CFG revalidation | CFG decision token at acceptance/execution/settlement |
| AML gate | AML pre-transaction decision |
| LED hold | LED hold ID / atomic reservation |
| LP execution | LP order ID/client_order_ref |
| LP fill | external LP fill ID/payload hash |
| Conservation | TRD fill conservation record |
| Settlement | LED DvP settlement ID |
| Confirmation | LED actual outcome sync |
| Audit | SEC event refs |

### 1.3 Withdrawal / Payout

| Step | Evidence |
|---|---|
| Payout request | source request/idempotency |
| Destination decision | WLT verify-and-consume decision |
| AML gate | AML pre-transaction decision |
| LED reserve | atomic reservation/hold |
| Rail execution | external confirmation |
| Ledger settlement | LED journal hash |
| Audit | SEC event refs |

## 2. Cross-Module Reconciliation Matrix

| Reconciliation | Modules |
|---|---|
| Onboarding outcome vs KYC/AML | CLT, KYC, AML |
| Client status vs trade/payout | CLT, TRD, LED, WLT |
| AML revocation vs destinations/trades | AML, WLT, TRD, LED |
| Destination use vs whitelist | WLT, LED |
| Deposit source vs ledger credit | WLT, AML, LED |
| Trade hold vs LP execution | TRD, LED |
| LP fill vs client fill | TRD |
| Client fill vs LED settlement | TRD, LED |
| Ledger liabilities vs safeguarded assets | LED |
| Prohibited feature registry vs permissions/config | CFG, IAM, TRD |
| Audit expected events vs emitted events | SEC, all modules |

## 3. Critical Evidence Gaps

Any missing item below blocks go-live:

1. SEC audit ref for critical action.
2. CFG runtime decision for licence-sensitive action.
3. AML current decision for money movement.
4. WLT verify-and-consume for payout/withdrawal destination.
5. LED atomic reservation for payout/trade.
6. External LP fill for client fill.
7. LED settlement truth for final settled confirmation.
8. Journal hash-chain integrity.
9. Safeguarding full-backing evidence.
