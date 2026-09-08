# TRD-01 Quote / Trade / LP Execution Blueprint Pack v1.1

## Module

TRD-01 Quote / Trade / LP Execution

## Purpose

TRD-01 owns the agency/back-to-back quote, trade request, quote acceptance, liquidity-provider execution, fill handling, slippage/requote, and execution evidence workflow for the AIX Money Broking + PSO platform.

It is the trading-control layer that sits above LED-01 ledger/settlement and below client/admin portals.

It must never implement Exchange features, matching engine, order book, market making, principal dealing, client-to-client matching, AIX inventory, or AIX spread markup.

It covers:

1. Tradable instrument / pair configuration.
2. LP configuration and eligibility.
3. LP quote request.
4. Client quote generation.
5. Quote expiry and quote acceptance.
6. Client pre-trade eligibility checks.
7. LED-01 prefunded hold before LP execution.
8. AML-01 pre-transaction gate where required.
9. LP execution submission.
10. Fill / partial fill / reject / timeout handling.
11. Slippage tolerance and requote/void rules.
12. Execution report and confirmation.
13. Trade state machine.
14. No AIX principal exposure.
15. No AIX spread markup.
16. Disclosed brokerage/commission only.
17. LP outage fail-closed.
18. Execution reconciliation.
19. Audit and evidence export.

## Accepted Dependencies

- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC / KYB Verification accepted v1.2.
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening accepted v1.2.
- WLT-01 Wallet Screening / Payout Destination Whitelist accepted v1.2.
- LED-01 Ledger / Settlement / Safeguarding accepted v1.2.

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

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2
- SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2
- CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.2
- CLT-01_Client_Onboarding_Client_Profile_Blueprint_Pack_v1.2
- KYC-01_KYC_KYB_Verification_Blueprint_Pack_v1.2
- AML-01_Sanctions_PEP_Adverse_Media_Travel_Rule_Blueprint_Pack_v1.2
- WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.2
- LED-01_Ledger_Settlement_Safeguarding_Blueprint_Pack_v1.2


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Agency execution window removed by requiring either:
   - contingent/provisional client pricing until LP fill confirms; or
   - atomic accept-execute against a firm executable LP quote.
2. LP quote firmness / RFQ semantics added.
3. Client quote validity must be less than or equal to LP quote validity.
4. AIX principal window prohibited by construction.
5. Client-fill-to-LP-fill conservation invariant added:
   - client fill quantity equals external LP fill quantity, 1:1 or sum of tranches.
   - client execution price equals LP fill price net of disclosed brokerage/commission only.
   - unconserved client fill blocked.
6. Multi-LP/tranche aggregation and VWAP identity added.
7. Price-construction identity added:
   - client all-in price = LP price +/- disclosed commission only.
   - quote hash covers LP quote ID, LP price and LP payload hash.
   - price checked at quote build and fill.
8. LP timeout deterministic resolution protocol added:
   - idempotent LP order-status query-back.
   - late-fill guard.
   - no settlement against released hold or voided trade.
   - stuck reconciliation SLA.
9. Structural no-internalisation / no-netting controls added:
   - every client fill binds to distinct external LP fill ID.
   - one LP fill cannot support two client fills.
   - synthetic LP fills prohibited.
10. CFG-01 licence-lock revalidation added at execution and settlement.
11. Best-execution / LP-selection evidence added.
12. Positive slippage passes to client, never AIX.
13. Partial-fill residual hold release is atomic with LED-01.
14. Trade state compare-and-set guard added.
15. Client confirmation now reflects LED-01 actual settlement outcome, not optimistic handoff.
16. New tests TRD1-TC-041 to TRD1-TC-071.
