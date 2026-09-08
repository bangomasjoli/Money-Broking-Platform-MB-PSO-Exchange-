# WDR-01 Withdrawal / Payout Execution Rail Blueprint Pack v1.1

## Module

WDR-01 Withdrawal / Payout Execution Rail

## Purpose

WDR-01 owns outbound payout and withdrawal execution instructions to bank, custodian, blockchain or payment rails after upstream controls have approved the action.

WDR-01 is the outbound execution boundary. It must not approve destinations, screen AML, post ledger, create available balance, bypass LED reserves, bypass WLT verify-and-consume, or bypass Travel Rule / payout controls.

It answers:

```txt
Can this approved withdrawal or payout instruction be safely submitted to the correct external rail, tracked to finality, reconciled, and reported back to LED-01 without creating AIX exposure or bypassing WLT/AML/LED controls?
```

## Core Scope

1. Withdrawal / payout execution instruction intake from LED-01 or authorised payout workflow.
2. Rail routing to approved bank/custodian/blockchain/payment provider.
3. WLT-01 destination verify-and-consume validation.
4. AML-01 pre-transaction gate validation.
5. Travel Rule payload validation where applicable.
6. LED-01 atomic reserve / hold validation before external instruction.
7. External payout instruction creation.
8. Provider authentication and payload signing.
9. Maker-checker / client dual-authorisation enforcement where required.
10. Execution status tracking.
11. Finality / settlement confirmation from rail.
12. Failed / returned / reversed payout handling.
13. Duplicate / replay / idempotency protection.
14. Outbound sanctions/freeze interruption.
15. Payout reconciliation.
16. SEC-01 audit evidence.
17. E2E saga / correlation integration.

## Strict Out of Scope

1. Wallet screening decision ownership.
2. AML screening decision ownership.
3. Ledger posting.
4. Available balance calculation.
5. Client money safeguarding.
6. Private key custody.
7. Trade execution.
8. Exchange order book / matching.
9. AIX principal funding.
10. AIX spread markup.

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
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Atomic revalidate-and-transmit added:
   - WLT/AML revocation epoch.
   - CFG kill-switch.
   - LED reserve pinned/valid.
   - IAM/dual-auth current.
   - same correlation/client/destination/amount/asset.
   - no change between last check and point of no return.
2. Outbound payout value-conservation added:
   - reserved = amount sent + disclosed rail/network fee + bounded residual.
   - network fee, partial payout and rail-side FX disposition.
   - no AIX principal or operational absorption.
3. Last-mile beneficiary integrity added:
   - signed payload destination equals WLT canonical destination.
   - canonical destination hash.
   - build-to-provider-receipt tamper evidence.
   - high-value beneficiary four-eyes verification.
4. Batch/file payout model added:
   - batch envelope.
   - item-level finality.
   - partial-batch handling.
   - batch-level and item-level idempotency.
   - outbound file checksum/manifest completeness.
5. Double-pay protection added:
   - exclusive one LED reserve to at-most-one successful send.
   - logical payout dedup across execution rows.
   - duplicate request cannot produce second send.
6. State transitions bound to status_version compare-and-set.
7. executed_late disposition defined as actual settlement + exception.
8. Provider signing-key governance added, including rotation, expiry, revocation and HSM/secrets boundary.
9. Travel Rule payload consistency at send added.
10. Pinned-reserve SLA and stuck-payout escalation added.
11. Client-facing status truthfulness added.
12. New tests WDR1-TC-041 to WDR1-TC-076.
