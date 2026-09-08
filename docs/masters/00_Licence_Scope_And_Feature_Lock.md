# 00 Licence Scope and Feature Lock  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 00_Licence_Scope_And_Feature_Lock.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 0 / Licence Scope Control |
| Prepared for | Development, architecture, compliance, and system design |
| Version | v1.0 |
| Status | Initial development control document |

---

## 1. Purpose

This document defines the licence scope, feature activation rules, locked modules, prohibited system functions, and development boundaries for the AIX Money Broking Platform.

The purpose of this document is to prevent the platform from being developed as an unrestricted crypto exchange or generic trading platform.

The platform must be developed based on the current licence status:

1. Money Broking licence is approved.
2. Payment System Operator licence is approved.
3. Exchange application is still pending.

Therefore, the system may proceed with Money Broking and PSO-related modules, but Exchange-related features must remain disabled until Exchange approval is granted.

This document must be read before preparing the SRS, database design, API design, frontend page map, or Claude Code implementation prompt.

---

## 2. Regulatory Reference

The platform must be designed with reference to the following Labuan FSA regulatory areas:

| Area | Regulatory reference |
|---|---|
| Money Broking | Guidelines on the Establishment of Money Broking Business in Labuan IBFC |
| Digital Money Broking Platform | Guidelines on the Management of Digital Money Broking Platform |
| Digital Financial Services | Labuan FSA DFS approval requirement |
| Travel Rule | Guidelines on Travel Rule for Labuan Digital Financial Services |
| AML/CFT/CPF | Labuan FSA AML/CFT/CPF and TFS requirements |
| Payment System Operator | PSO regulatory requirements and applicable LFSA guidance |

Labuan FSA states that Labuan entities require prior approval before undertaking DFS-related activities such as digital asset exchanges, crypto trading platforms, blockchain tokens, and e-payment systems.

The Labuan money broking guideline covers application, operational, and regulatory requirements for Labuan money broking business.

The Travel Rule guideline applies preventive measures for digital asset transfers involving Labuan reporting institutions.

The digital money broking platform guideline is relevant for system controls, platform governance, order handling, auditability, security, and operational control of digital money broking platforms.

---

## 3. Current Licence Status

| Licence / Approval | Status | Platform treatment |
|---|---|---|
| Money Broking Licence | Approved | Active build scope |
| Payment System Operator Licence | Approved | Active build scope |
| Exchange Application | Pending | Locked until approval |

### 3.1 Money Broking Status

Money Broking licence is approved.

The platform may build modules related to:

1. OTC/RFQ broking.
2. Spot broking request flow.
3. Client onboarding.
4. KYC/KYB.
5. Trade booking.
6. Brokerage fee calculation.
7. Client and staff portals.
8. Audit log.
9. Reporting.
10. Ledger records linked to broking transactions.

### 3.2 PSO Status

Payment System Operator licence is approved.

The platform may build modules related to:

1. Deposit workflow.
2. Withdrawal workflow.
3. Payment instruction.
4. Payment status tracking.
5. Settlement tracking.
6. Client money ledger.
7. Reconciliation.
8. Payment reporting.
9. Transaction reference tracking.

### 3.3 Exchange Status

Exchange application is pending.

The platform must not activate:

1. Live order book.
2. Matching engine.
3. Market depth.
4. Public market trading.
5. Open exchange-style trading.
6. Public market pair listing as an exchange.
7. Exchange-style order matching.

Exchange-related features may be documented and planned as future modules, but they must remain disabled in the live system until approval is granted.

---

## 4. Approved Build Scope

The following modules are approved for documentation, system design, and MVP development.

### 4.1 Client Portal

1. Account registration.
2. Login and MFA.
3. Client profile.
4. Organisation profile.
5. KYC/KYB submission.
6. Beneficial ownership submission.
7. Document upload.
8. Account status view.
9. OTC/RFQ request.
10. Spot broking request.
11. Trade history.
12. Deposit request.
13. Withdrawal request.
14. Settlement status.
15. Statement download.
16. Support request.
17. Notification centre.

### 4.2 Staff Portal

1. Client review.
2. KYC/KYB review.
3. Document verification.
4. Compliance notes.
5. Risk scoring.
6. Client approval, rejection, or request for more information.
7. OTC/RFQ quote handling.
8. Trade booking.
9. Settlement monitoring.
10. Deposit and withdrawal review.
11. Maker-checker approval.
12. Case management.
13. Audit log viewing.
14. Reports.

### 4.3 Admin Portal

1. User management.
2. Role and permission management.
3. Feature flag management.
4. Asset configuration.
5. Asset pair configuration.
6. Fee configuration.
7. Limit configuration.
8. System settings.
9. Staff access control.
10. Audit log.
11. Report export.

### 4.4 Compliance Module

1. Client risk profile.
2. KYC/KYB status.
3. Beneficial owner records.
4. Source of funds.
5. Source of wealth.
6. Sanctions screening status.
7. PEP screening status.
8. Wallet screening status.
9. Travel Rule readiness.
10. Suspicious activity case.
11. Account freeze.
12. Account suspension.
13. Enhanced due diligence.
14. Compliance decision log.

### 4.5 OTC/RFQ Module

1. Client RFQ request.
2. Asset pair selection.
3. Buy or sell side.
4. Amount entry.
5. Quote request validation.
6. Staff quote input.
7. LP or counterparty quote record.
8. Client quote calculation.
9. Spread calculation.
10. Fee calculation.
11. Quote expiry.
12. Quote acceptance.
13. Quote rejection.
14. Trade booking.
15. Settlement tracking.
16. RFQ audit trail.

### 4.6 Spot Broking Request Module

The first version of spot broking must be built as a brokered request flow, not a full exchange order book.

Allowed features:

1. Client selects asset pair.
2. Client enters buy or sell request.
3. System shows indicative or firm quote.
4. Client confirms request.
5. System books trade after validation.
6. Ledger entries are created.
7. Settlement workflow starts.
8. Trade confirmation is generated.

Not allowed in MVP:

1. Public order book.
2. Open market matching engine.
3. Market depth.
4. Exchange-style order matching.

### 4.7 Payment and Settlement Module

1. Deposit request.
2. Deposit status tracking.
3. Withdrawal request.
4. Withdrawal review.
5. Payment instruction.
6. Settlement reference.
7. Settlement proof.
8. Reconciliation status.
9. Failed settlement handling.
10. Settlement report.

### 4.8 Ledger Module

1. Double-entry ledger.
2. Client fiat account.
3. Client digital asset account.
4. Settlement pending account.
5. Fee income account.
6. Counterparty payable or receivable account.
7. Pending balance.
8. Available balance.
9. Frozen balance.
10. Ledger reversal.
11. Ledger reconciliation.
12. Ledger audit trail.

### 4.9 Reporting Module

1. Client statement.
2. Trade confirmation.
3. RFQ report.
4. Deposit report.
5. Withdrawal report.
6. Settlement report.
7. Ledger report.
8. Audit log report.
9. Compliance report.
10. Management report.

---

## 5. Locked / Pending Scope

The following features must be locked because the Exchange application is still pending.

| Feature | Status | Reason |
|---|---|---|
| Live order book | Locked | Exchange approval pending |
| Matching engine | Locked | Exchange approval pending |
| Market depth | Locked | Exchange approval pending |
| Public exchange trading | Locked | Exchange approval pending |
| Public market pair listing | Locked | Exchange approval pending |
| Exchange-style trade matching | Locked | Exchange approval pending |
| Market maker function | Locked | Not part of MB MVP |
| Public API for market trading | Locked | Exchange approval pending |
| Open retail exchange screen | Locked | Exchange approval pending |

The locked scope may exist as future backlog items, but it must not be exposed to clients, staff, admin users, public users, API users, or production environments.

---

## 6. Prohibited Scope

The following features must not be developed or activated unless separately approved by management and regulator where required.

### 6.1 Trading and Product Prohibitions

1. Principal dealing under the MB module.
2. Proprietary trading.
3. Market making.
4. Derivatives.
5. Securities token trading.
6. Margin trading for digital assets.
7. Lending or borrowing of client assets.
8. Staking service.
9. Yield product.
10. Algorithmic stablecoin support.
11. Privacy coin support.
12. Unapproved asset listing.
13. MYR trading pair.
14. Exchange order book before approval.

### 6.2 Custody Prohibitions

1. Self-custody wallet service.
2. Private key custody by AIX unless separately approved.
3. Client asset commingling.
4. Company asset and client asset mixing.
5. Off-ledger balance adjustment.
6. Manual balance editing without ledger transaction.

### 6.3 System Prohibitions

1. Balance update without ledger entry.
2. Sensitive admin action without audit log.
3. Trade booking without approved client status.
4. Withdrawal without compliance and settlement checks.
5. Quote acceptance after expiry.
6. Feature activation from frontend only.
7. Staff approval of own maker-checker request.
8. Production activation of locked exchange features.
9. API bypass of disabled features.
10. Deletion of audit logs.

---

## 7. Feature Flags

The platform must implement backend-enforced feature flags.

Frontend hiding is not enough. If a feature is disabled, the backend API must also block access.

### 7.1 Enabled MVP Feature Flags

```txt
feature_client_onboarding = enabled
feature_kyc_kyb = enabled
feature_document_upload = enabled
feature_compliance_review = enabled
feature_beneficial_ownership = enabled
feature_source_of_funds = enabled
feature_source_of_wealth = enabled

feature_otc_rfq = enabled
feature_spot_broking_request = enabled
feature_trade_booking = enabled
feature_brokerage_fee = enabled

feature_deposit = enabled
feature_withdrawal = enabled
feature_payment_instruction = enabled
feature_payment_settlement = enabled
feature_reconciliation = enabled

feature_double_entry_ledger = enabled
feature_audit_log = enabled
feature_maker_checker = enabled
feature_reports = enabled
feature_notifications = enabled

feature_travel_rule_readiness = enabled
feature_wallet_screening = enabled
feature_aml_case_management = enabled
feature_account_freeze = enabled
feature_account_suspension = enabled
```

### 7.2 Disabled / Locked Feature Flags

```txt
feature_exchange_orderbook = disabled
feature_matching_engine = disabled
feature_market_depth = disabled
feature_public_exchange_trading = disabled
feature_public_market_pair_listing = disabled
feature_public_market_api = disabled

feature_derivatives = disabled
feature_margin_trading = disabled
feature_securities_token = disabled
feature_market_making = disabled
feature_proprietary_trading = disabled
feature_self_custody_wallet = disabled
feature_staking = disabled
feature_yield_product = disabled

feature_MYR_trading_pair = disabled
feature_privacy_coin = disabled
feature_algorithmic_stablecoin = disabled
```

### 7.3 Feature Flag Enforcement Rules

1. Feature flags must be stored in database.
2. Feature flags must be checked by backend middleware or service guard.
3. Frontend must not be the only control.
4. Admin changes to feature flags must require permission.
5. High-risk feature flag changes must require maker-checker approval.
6. Every feature flag change must create an audit log.
7. Locked exchange features must not be enabled by normal admin users.
8. Locked exchange features require management and regulatory approval confirmation before activation.

---

## 8. Core System Rules

### 8.1 Licence Boundary Rules

1. The platform must operate within approved MB and PSO scope.
2. Exchange features must remain disabled until Exchange approval is granted.
3. AIX acts as broker/intermediary under the MB module.
4. AIX must not act as principal, market maker, or proprietary trader under the MB module.
5. The system must not allow exchange-style order matching before approval.
6. Spot broking request flow must remain brokered and controlled.
7. Payment and settlement features must not become custody service unless separately approved.

### 8.2 Client Eligibility Rules

1. Client must complete onboarding before using transaction modules.
2. Client must pass KYC/KYB before trading.
3. Client must have approved status before RFQ or spot broking request.
4. Rejected client cannot trade.
5. Suspended client cannot trade, deposit, or withdraw.
6. Frozen client cannot withdraw.
7. Client risk profile must be created before transaction approval.
8. Beneficial ownership must be collected for corporate clients.
9. Source of funds must be captured where required.
10. Source of wealth must be captured where required.

### 8.3 AML/KYC Rules

1. Every client must go through CDD.
2. High-risk clients must go through EDD.
3. PEP screening status must be recorded.
4. Sanctions screening status must be recorded.
5. Wallet screening status must be recorded where digital asset transfers are involved.
6. Suspicious activity must create a compliance case.
7. Compliance must be able to freeze or suspend account.
8. Compliance decisions must record user, date, reason, and evidence.
9. AML status must be checked before trade booking and withdrawal.
10. Transaction monitoring rules must be supported in the system.

### 8.4 Travel Rule Readiness Rules

1. Digital asset transfers must support Travel Rule data capture.
2. Originator information must be stored where applicable.
3. Beneficiary information must be stored where applicable.
4. Wallet address must be linked to the client where possible.
5. Counterparty VASP or financial institution data must be stored where applicable.
6. Transfer must not proceed if required Travel Rule data is missing.
7. Post-facto Travel Rule submission must not be the intended design.
8. Travel Rule records must be audit-ready.
9. Travel Rule exceptions must be recorded.
10. Travel Rule data must be protected as sensitive information.

### 8.5 OTC/RFQ Rules

1. Only approved clients can create RFQ.
2. RFQ must include asset pair, side, amount, and quote type.
3. RFQ must have status.
4. Quote must have expiry timestamp.
5. Expired quote cannot be accepted.
6. Quote must show fee and spread where applicable.
7. Quote must record price source or LP quote.
8. Quote must record whether it is firm or indicative.
9. Client acceptance must be timestamped.
10. Accepted RFQ must create trade booking.
11. Trade booking must trigger ledger process.
12. RFQ cannot skip required status sequence.

### 8.6 Spot Broking Rules

1. Spot broking MVP must use brokered request flow.
2. Spot broking must not operate as full public exchange.
3. Client must confirm before trade booking.
4. Price, fee, spread, and settlement details must be shown before confirmation.
5. Trade confirmation must be generated after booking.
6. Spot broking request must create audit log.
7. Spot broking trade must use ledger entries.
8. Spot broking cannot use locked matching engine.

### 8.7 Payment and Settlement Rules

1. Deposit must be linked to client account.
2. Withdrawal must be reviewed before processing.
3. Settlement must have status.
4. Settlement must have reference number.
5. Settlement proof must be stored where applicable.
6. Failed settlement must be escalated.
7. Settlement completion must require permission.
8. High-risk settlement must require maker-checker.
9. Payment and settlement must be reconciled.
10. Client money and company money must be separated in ledger.

### 8.8 Ledger Rules

1. Every balance movement must use double-entry ledger.
2. Direct balance editing is prohibited.
3. Total debit must equal total credit.
4. Ledger transaction must have clear source module.
5. Ledger transaction must have reference ID.
6. Ledger reversal must not delete original entry.
7. Ledger reversal must create new reversing entries.
8. Pending balance, available balance, and frozen balance must be separated.
9. Ledger entries must be immutable after posting.
10. Ledger reports must be exportable.

### 8.9 Audit Log Rules

1. Every sensitive action must create audit log.
2. Audit logs must not be deleted.
3. Audit logs must capture before and after values where applicable.
4. Audit logs must capture user ID.
5. Audit logs must capture role.
6. Audit logs must capture IP address.
7. Audit logs must capture user agent.
8. Audit logs must capture timestamp.
9. Audit logs must capture module and action.
10. Audit logs must be searchable by authorised staff.

### 8.10 Maker-Checker Rules

1. Sensitive actions must support maker-checker.
2. Staff cannot approve own request.
3. Settlement approval may require checker.
4. Withdrawal approval may require checker.
5. Feature flag change may require checker.
6. Fee configuration change may require checker.
7. Role permission change may require checker.
8. Ledger reversal must require checker.
9. Account freeze or unfreeze may require checker.
10. Checker decision must be logged.

---

## 9. Development Rule

Developers must follow the rules below.

### 9.1 General Development Rules

1. Do not build active exchange order-book features.
2. Do not build active matching engine.
3. Do not expose locked features in production.
4. Do not bypass feature flags.
5. Do not update balances directly.
6. Do not skip audit logs.
7. Do not allow client access to another client’s data.
8. Do not allow staff action without permission check.
9. Do not allow expired quote acceptance.
10. Do not allow rejected or suspended clients to trade.

### 9.2 Backend Rules

1. Backend must enforce all feature flags.
2. Backend must enforce all permissions.
3. Backend must validate client status before transaction modules.
4. Backend must check AML status where required.
5. Backend must create audit logs for sensitive actions.
6. Backend must use ledger service for financial postings.
7. Backend must reject locked feature API calls.
8. Backend must protect Travel Rule and AML data.
9. Backend must validate all request bodies.
10. Backend must return consistent error codes.

### 9.3 Frontend Rules

1. Frontend must hide disabled features.
2. Frontend must show account status clearly.
3. Frontend must show quote expiry clearly.
4. Frontend must show fee, spread, and settlement details before confirmation.
5. Frontend must prevent duplicate submission.
6. Frontend must display compliance pending status.
7. Frontend must not expose internal system settings to client.
8. Frontend must not store secrets.
9. Frontend must not calculate final ledger balances.
10. Frontend must show proper error messages from backend.

### 9.4 Database Rules

1. Use soft delete where required.
2. Do not delete financial records.
3. Do not delete audit logs.
4. Use indexes for high-volume tables.
5. Use unique references for transactions.
6. Store timestamps for all key events.
7. Separate client account, ledger account, and user account.
8. Separate client funds and company funds in ledger design.
9. Store feature flag changes.
10. Store approval decisions.

### 9.5 Production Safety Rules

1. Locked Exchange features must remain disabled in production.
2. Production feature flag change must require authorised approval.
3. Production database changes must use migration.
4. Production secrets must not be stored in code.
5. Production logs must not expose passwords, tokens, or sensitive documents.
6. Production deployment must include rollback plan.
7. Production access must be limited.
8. Production admin actions must be logged.
9. Production system must have monitoring.
10. Production release must pass testing checklist.

---

## 10. MVP Boundary

The MVP must focus on approved MB and PSO functions only.

### 10.1 MVP Includes

1. Authentication.
2. MFA.
3. User management.
4. Role and permission.
5. Client onboarding.
6. KYC/KYB.
7. Beneficial ownership.
8. Document upload.
9. Compliance review.
10. Client approval workflow.
11. OTC/RFQ request.
12. RFQ quote handling.
13. RFQ acceptance or rejection.
14. Spot broking request flow.
15. Trade booking.
16. Deposit request.
17. Withdrawal request.
18. Payment instruction.
19. Settlement tracking.
20. Double-entry ledger.
21. Audit log.
22. Maker-checker.
23. Feature flags.
24. Admin portal.
25. Staff portal.
26. Client portal.
27. Reports.
28. Travel Rule readiness.
29. AML case management.
30. Account freeze and suspension.

### 10.2 MVP Excludes

1. Full exchange order book.
2. Matching engine.
3. Market depth.
4. Public exchange trading.
5. Public exchange API.
6. Market maker function.
7. Proprietary trading.
8. Securities token trading.
9. Derivatives.
10. Margin trading.
11. Self-custody wallet.
12. Staking.
13. Yield product.
14. Algorithmic stablecoin.
15. Privacy coin.
16. MYR trading pair.

### 10.3 MVP Success Criteria

The MVP is considered successful when:

1. Client can register.
2. Client can complete onboarding.
3. Client can submit KYC/KYB.
4. Compliance can approve or reject client.
5. Approved client can submit OTC/RFQ request.
6. Staff can issue quote.
7. Client can accept valid quote before expiry.
8. System can book trade.
9. Ledger entries are created correctly.
10. Settlement status can be tracked.
11. Deposit and withdrawal workflow works.
12. Reports can be generated.
13. All sensitive actions are logged.
14. Disabled exchange features remain inaccessible.
15. Rejected or suspended clients cannot trade.
16. Travel Rule data fields are available for relevant digital asset transfers.

---

## 11. Initial Developer Parameters

These parameters must be included in later SRS, database design, API design, and Claude Code prompt.

```txt
licence_money_broking_status = approved
licence_pso_status = approved
licence_exchange_status = pending

platform_role = broker_intermediary
principal_dealing = blocked
proprietary_trading = blocked
market_making = blocked

client_onboarding_required = true
kyc_kyb_required = true
beneficial_ownership_required = true
source_of_funds_required = true
source_of_wealth_required = conditional
pep_screening_required = true
sanctions_screening_required = true
wallet_screening_required = true
travel_rule_readiness_required = true

double_entry_ledger_required = true
audit_log_required = true
maker_checker_required = true
feature_flag_required = true
backend_feature_flag_enforcement = true

exchange_orderbook = disabled
matching_engine = disabled
market_depth = disabled
public_exchange_trading = disabled

otc_rfq = enabled
spot_broking_request = enabled
payment_settlement = enabled
deposit_withdrawal = enabled
reconciliation = enabled

myr_trading_pair = disabled
privacy_coin = disabled
algorithmic_stablecoin = disabled
securities_token = disabled
derivatives = disabled
margin_trading = disabled
self_custody_wallet = disabled
```

---

## 12. Instruction for Next SDLC Document

After this document is accepted, the next document to prepare is:

```txt
01_Project_Charter.md
```

The Project Charter must use this licence scope as its base.

No SRS, database design, API design, or Claude Code implementation should start until this Licence Scope and Feature Lock document is accepted.
