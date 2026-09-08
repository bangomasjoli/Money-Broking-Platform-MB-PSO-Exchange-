# DEP-01 Deposit Execution / Inbound Receipt Blueprint Pack v1.2

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


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Credit-request coherent screening-bundle revalidation added:
   - WLT decision.
   - AML decision.
   - confirmation/finality evidence.
   - client eligibility.
   - same correlation/client/amount/asset/snapshot.
   - none stale or revoked.
2. AML-01 and WLT-01 revocation subscription added for in-flight deposits.
3. Revoked or de-cleared deposits are pulled back to quarantine before LED credit.
4. Inbound source-of-funds / own-source binding added:
   - client own KYC-verified account/wallet.
   - approved third-party source only by review.
   - unexpected source routes to SoF review.
   - SoF/SoW evidence for large/first deposits.
5. Per-source finality model added:
   - reorg-depth-aware crypto finality.
   - multi-source/indexer corroboration.
   - fiat return/recall window awareness.
   - economic finality evidence before LED credit evaluation.
6. Provider-identity-bound receipt authentication added:
   - provider signing identity.
   - mTLS/HMAC/signature.
   - key rotation.
   - file feed completeness / missing sequence detection.
   - independent bank/chain/custodian truth reconciliation.
7. Reference/correlation/amount integrity added:
   - unique-per-intent reference/address where supported.
   - address reuse policy.
   - expired/cancelled intent deposits quarantine.
   - partial/over/under/dust amount disposition.
8. LED pending creation timing clarified:
   - create on matched receipt or ensure unmatched pendings are sweepable.
9. Unmatched/rejected deposit return path defined as payout-controlled route.
10. Credit-time eligibility recheck added.
11. Inbound Travel Rule capture added for VASP-origin deposits.
12. Confirmation threshold governance bound to CFG-01.
13. Reversal events bind original correlation and saga.
14. New tests DEP1-TC-034 to DEP1-TC-067.

## v1.2 Final Rollup Summary

DEP-01 v1.2 is a non-substantive final rollup after Claude Opus final verification.

Status:
- All 5 critical gaps resolved in v1.1.
- All 6 recommended corrections resolved in v1.1.
- v1.2 fixes cosmetic rollup items only.
- DEP-01 is accepted / final verified.

Cosmetic fixes:
1. Updated `01_Module_Blueprint.md` Document Control pack version cell to v1.2.
2. Repinned baseline to accepted v1.2 clean rollups.
3. Added final accepted status note.

Control change from v1.1:
- None.

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
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted


Next module:
- WDR-01 Withdrawal / Payout Execution Rail.
