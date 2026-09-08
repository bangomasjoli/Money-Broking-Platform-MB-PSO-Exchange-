# DEP-01 Deposit Execution / Inbound Receipt Blueprint Pack v1.0

## Module

DEP-01 Deposit Execution / Inbound Receipt

## Purpose

DEP-01 owns inbound deposit detection, external receipt evidence capture, deposit reference matching, deposit attribution preparation, inbound source data capture, and handoff to WLT-01 / AML-01 / LED-01 for screening, quarantine, backing and ledger credit.

DEP-01 does **not** credit client balances. LED-01 remains the only module that can post ledger journals and make funds/assets available.

DEP-01 answers:

```txt
Has an inbound bank/custodian/chain receipt been detected, authenticated, deduplicated, matched, evidenced, and handed off to WLT/AML/LED without prematurely crediting client balance?
```

## Core Scope

1. Fiat inbound bank receipt detection.
2. Crypto/digital asset inbound chain/custodian receipt detection.
3. Deposit intent / reference creation.
4. Client deposit reference matching.
5. External receipt evidence capture.
6. Source account/wallet extraction.
7. Confirmation status tracking.
8. Duplicate / replay detection.
9. Deposit mis-attribution prevention.
10. WLT-01 inbound source screening handoff.
11. AML-01 source/counterparty gate handoff where required.
12. LED-01 pending deposit creation handoff.
13. Deposit quarantine routing.
14. Chain reorg / bank recall / reversal notification to LED-01.
15. Deposit reconciliation.
16. SEC-01 audit evidence.
17. E2E saga/correlation integration.

## Strict Out of Scope

1. Ledger posting.
2. Available balance credit.
3. Client money safeguarding ownership.
4. AML screening decision ownership.
5. Wallet/source risk decision ownership.
6. Private key custody.
7. Blockchain signing.
8. Withdrawal / payout execution.
9. Trading / LP execution.
10. Exchange order book / matching.

## Pack Contents

1. `01_Module_Blueprint.md`
2. `02_Workflow.md`
3. `03_Diagrams.md`
4. `04_API_Specification.md`
5. `05_Database_Design.md`
6. `06_State_Machine.md`
7. `07_Permission_Rules.md`
8. `08_Audit_Log_Events.md`
9. `09_Error_Handling.md`
10. `10_Test_Cases.md`
11. `11_Claude_Prompt.md`
12. `12_Risk_And_Control_Map.md`
13. `13_Reconciliation_Design.md`
14. `14_Go_Live_Checklist.md`
15. `15_Regulatory_Mapping.md`
16. `16_Data_Classification.md`

Accepted baseline:
- FND-01 Platform Foundation v1.2 — Accepted
- IAM-01 Authentication / MFA / Session v1.2 — Accepted
- IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
- SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
- CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
- CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
- KYC-01 KYC / KYB Verification v1.2 — Accepted
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening v1.2 — Accepted
- WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
- LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
- TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
- E2E-01 Cross-Module End-to-End Fund-Flow Review v1.2 — Accepted

