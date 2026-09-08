# 00 Licence Scope and Feature Lock  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 00_Licence_Scope_And_Feature_Lock_v1.2.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 0 / Licence Scope Control |
| Version | v1.2 |
| Status | Revised after principal fintech architect review |
| Prepared for | Development, architecture, compliance, product, and system design |
| Primary purpose | Lock approved licence scope, block exchange behaviour, enforce agency/back-to-back execution, and define system controls before SRS or coding |

---

## 1. Purpose

This document defines the licence scope, feature activation rules, locked modules, prohibited functions, and development boundaries for the AIX Money Broking Platform.

The purpose is to prevent the platform from being developed as:

1. A generic crypto exchange.
2. An unrestricted trading platform.
3. A proprietary trading platform.
4. A market maker platform.
5. A public order-book exchange before Exchange approval is granted.
6. A principal-dealing platform disguised as money broking.

The current licence position is:

1. Money Broking licence is approved.
2. Payment System Operator licence is approved.
3. Exchange application is still pending.

Therefore, the system may proceed with approved Money Broking and PSO-related modules, but all Exchange-related features must remain locked until Exchange approval is granted.

This document must be read before preparing:

1. Project Charter.
2. Software Requirement Specification.
3. Master Module Index.
4. Database Design.
5. API Specification.
6. Frontend Page Map.
7. Claude Code implementation prompts.
8. Any production deployment plan.

---

## 2. Regulatory Reference Base

The platform must be designed with reference to the following Labuan FSA regulatory areas.

| Area | Reference |
|---|---|
| Money Broking | Guidelines on the Establishment of Money Broking Business in Labuan IBFC |
| Digital Money Broking Platform | Guidelines on the Management of Digital Money Broking Platform |
| Digital Financial Services | Labuan FSA DFS approval requirements |
| Market Conduct | Guidelines on Market Conduct for Labuan Digital Financial Intermediaries |
| Travel Rule | Guidelines on Travel Rule for Labuan Digital Financial Services |
| AML/CFT/CPF/TFS | Guidelines on AML/CFT/CPF and TFS for Labuan Key Reporting Institutions |
| Digital Currency Admission | Admissibility Framework for Digital Currencies |
| Payment / Settlement | PSO licence scope and relevant LFSA guidance |
| Outsourcing / External Vendors | LFSA external service / outsourcing expectations where applicable |
| Technology / Cyber Risk | Technology management, digital governance, security, access, logging, and monitoring expectations |

### 2.1 Developer Interpretation

For development purposes, the platform must be treated as:

```txt
A regulated Labuan Money Broking + PSO platform
with agency/back-to-back OTC/RFQ and MB Spot Broking,
using external LP market data and execution where approved,
not as AIX's own public exchange until Exchange approval is granted.
```

---

## 3. Current Licence Status

| Licence / Approval | Status | System Treatment |
|---|---|---|
| Money Broking Licence | Approved | Active build scope |
| Payment System Operator Licence | Approved | Active build scope |
| Exchange Application | Pending | Locked until approval |

---

## 4. Licence Boundary Principles

The following principles control the whole platform.

### 4.1 Agency / Broker-Only Principle

AIX must act as broker/intermediary only under the MB module.

AIX must not:

1. Act as principal.
2. Take proprietary trading position.
3. Act as market maker.
4. Act as liquidity provider.
5. Earn undisclosed spread margin.
6. Carry naked inventory or market risk.
7. Match one AIX client against another AIX client before Exchange approval.

### 4.2 Revenue Model

The approved MVP revenue model is:

```txt
Disclosed brokerage fee / commission only.
```

The following are prohibited:

```txt
AIX spread markup as principal margin.
Hidden spread.
Undisclosed markup.
Principal-risk price absorption.
Market-making revenue.
```

If LP spread exists, it must be treated as LP pricing and disclosed transparently where applicable. AIX revenue must be recorded separately as brokerage fee or commission.

### 4.3 Execution Model

The approved MVP execution model is:

```txt
Agency back-to-back execution.
```

This means:

1. A client trade must be tied to a firm or secured LP leg.
2. AIX must not show an executable client quote unless the LP leg is firm, secured, or otherwise controlled according to the approved execution design.
3. Every brokered trade must be matched to a completed LP execution or approved counterparty leg.
4. AIX inventory limit is zero.
5. Naked position is not allowed.
6. If LP execution fails, the client trade must not be absorbed by AIX as principal.
7. LP failure handling must be defined before production.

---

## 5. Approved Build Scope

The following modules are approved for documentation, system design, and MVP development.

### 5.1 Money Broking Scope

Allowed modules:

1. Client onboarding.
2. KYC/KYB.
3. Beneficial ownership collection.
4. AML risk profile.
5. Source of funds / source of wealth.
6. OTC/RFQ broking.
7. MB Spot Broking Terminal.
8. LP-backed quote request.
9. Agency/back-to-back trade booking.
10. Disclosed brokerage fee calculation.
11. Client trade history.
12. Trade confirmation.
13. Reporting.
14. Audit log.

### 5.2 PSO Scope

Allowed modules:

1. Deposit workflow.
2. Withdrawal workflow.
3. Payment instruction.
4. Payment status tracking.
5. Settlement tracking.
6. Client money ledger.
7. Payment reconciliation.
8. Payment reference tracking.
9. Payment reports.

### 5.3 Compliance Scope

Allowed modules:

1. KYC/KYB review.
2. AML risk scoring.
3. Sanctions screening.
4. PEP screening.
5. Beneficial ownership.
6. Wallet screening.
7. Travel Rule enforcement.
8. AML case management.
9. STR / regulatory filing workflow.
10. Account freeze.
11. Account suspension.
12. Enhanced due diligence.
13. Compliance notes.
14. Compliance decision log.
15. Periodic CDD/KYC refresh.
16. Sanctions re-screening on list update.
17. Threshold transaction reporting.
18. Tainted-funds / mixer handling.

### 5.4 Platform Foundation Scope

Allowed modules:

1. Authentication.
2. MFA.
3. Role-based access control.
4. Feature flags.
5. Audit log.
6. Maker-checker.
7. Notification.
8. Document management.
9. Admin portal.
10. Staff portal.
11. Client portal.
12. System settings.
13. Reporting.
14. System health monitoring.

---

## 6. Exchange Pending / Locked Scope

The following features must remain disabled because the Exchange application is pending.

| Feature | Status | Reason |
|---|---|---|
| AIX public order book | Locked | Exchange approval pending |
| AIX internal matching engine | Locked | Exchange approval pending |
| AIX market depth as exchange | Locked | Exchange approval pending |
| Public exchange trading | Locked | Exchange approval pending |
| Open exchange-style market | Locked | Exchange approval pending |
| Client-to-client matching | Locked | Exchange approval pending |
| Market maker engine | Locked | Not MB MVP |
| Principal dealing engine | Locked | Not MB scope |
| Public market API | Locked | Exchange approval pending |
| Resting exchange limit orders | Locked | Exchange approval pending |
| Stop-limit order book | Locked | Exchange approval pending |
| Post-only orders | Locked | Exchange order-book behaviour |
| Good-till-cancelled exchange orders | Locked | Exchange order-book behaviour |

### 6.1 Important Design Rule

The platform may display external LP market information, but it must not represent that data as AIX's own exchange order book.

Allowed label:

```txt
External LP Market Depth
```

Avoid label:

```txt
AIX Order Book
```

---

## 7. LP-Backed Spot Broking Model

AIX may use Binance or another approved liquidity provider behind the MB Spot Broking Terminal.

### 7.1 Approved Concept

The user interface may look like a professional broking terminal with:

1. Chart.
2. Asset pair selector.
3. External LP market depth.
4. Non-executable LP market information.
5. Buy / sell quote ticket.
6. Open requests.
7. Trade history.
8. Asset summary.

### 7.2 Prohibited Terminal Behaviour

The terminal must not:

1. Allow client to click LP depth level to execute directly.
2. Let client order rest inside AIX order book.
3. Match client order with another AIX client.
4. Display AIX public exchange order book.
5. Display AIX matching engine output.
6. Use market-maker or maker/taker fee model.
7. Use GTC, post-only, stop-limit, or resting limit order behaviour in MVP.
8. Display trade tape in a way that implies AIX public exchange activity.
9. Redistribute Binance or LP data without required market-data rights.

### 7.3 System Execution Model

The backend must follow this model:

```txt
Client
↓
AIX MB Spot Broking Terminal
↓
AIX Quote Engine
↓
AIX LP Adapter
↓
Binance / approved LP
↓
AIX Trade Booking
↓
AIX Ledger
↓
AIX Settlement
↓
AIX Reporting
```

The backend must not follow this model:

```txt
Client order
↓
AIX public order book
↓
AIX matching engine
↓
Client-to-client execution
```

### 7.4 LP-Backed Spot Broking Rules

1. Binance or another approved LP may provide market data and liquidity.
2. LP market depth may be displayed only as indicative external depth.
3. LP depth must be non-executable and non-clickable.
4. Client execution must go through AIX quote confirmation.
5. AIX must record LP price snapshot.
6. AIX must record client quote.
7. AIX must record disclosed brokerage fee.
8. AIX must record LP execution reference where applicable.
9. AIX must record slippage where applicable.
10. AIX must not expose Binance API directly to the client.
11. AIX must not present external LP depth as AIX's own order book.
12. AIX must not operate an internal matching engine before Exchange approval.
13. AIX must not match one AIX client against another AIX client before Exchange approval.
14. LP outage must fail closed.
15. No internal fallback price source is allowed when LP is unavailable.

### 7.5 LP Model Parameters

```txt
liquidity_model = external_lp_backed
primary_lp = Binance_or_approved_LP
displayed_depth_source = external_lp
displayed_depth_type = indicative_snapshot
lp_depth_executable = false
internal_orderbook = disabled
internal_matching_engine = disabled
client_to_client_matching = disabled
aix_market_making = disabled
aix_principal_dealing = disabled

lp_due_diligence_required = true
lp_api_integration_required = true
lp_order_reference_required = true
lp_execution_report_required = true
lp_slippage_record_required = true
lp_outage_behaviour = fail_closed_no_internal_fallback
lp_rate_limit_handling_required = true
lp_price_snapshot_required = true
lp_price_deviation_limit_pct = to_be_defined
lp_counterparty_exposure_limit = to_be_defined
lp_three_way_reconciliation_required = true
lp_secret_management = kms_vault
lp_environment = sandbox_in_nonprod_only
lp_market_data_redistribution_licensed = required
best_available_terms_evidence = required
```

---

## 8. Prohibited Scope

The following features must not be developed or activated unless separately approved by management and regulator where required.

### 8.1 Trading and Product Prohibitions

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
14. AIX exchange order book before approval.
15. Internal client-to-client matching before Exchange approval.
16. AIX spread markup as principal revenue.
17. Price Target Request as executable resting order.

### 8.2 Custody Prohibitions

1. Self-custody wallet service.
2. Private key custody by AIX unless separately approved.
3. Client asset commingling.
4. Company asset and client asset mixing.
5. Off-ledger balance adjustment.
6. Manual balance editing without ledger transaction.

### 8.3 System Prohibitions

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
11. Direct client access to LP account.
12. Hidden or undisclosed spread.
13. Internal fallback pricing during LP outage.
14. Client quote execution without firm/secured LP leg.
15. Carrying unhedged/naked position.

---

## 9. Feature Flags

The platform must implement backend-enforced feature flags.

Frontend hiding is not enough. If a feature is disabled, the backend API must also block access.

### 9.1 Enabled MVP Feature Flags

```txt
feature_client_onboarding = enabled
feature_kyc_kyb = enabled
feature_document_upload = enabled
feature_compliance_review = enabled
feature_beneficial_ownership = enabled
feature_source_of_funds = enabled
feature_source_of_wealth = enabled

feature_otc_rfq = enabled
feature_mb_spot_broking_terminal = enabled
feature_spot_broking_request = enabled
feature_external_lp_market_depth = enabled
feature_lp_backed_quote = enabled
feature_agency_back_to_back_execution = enabled
feature_trade_booking = enabled
feature_disclosed_brokerage_fee = enabled

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

feature_travel_rule_enforcement = enabled
feature_wallet_screening = enabled
feature_aml_case_management = enabled
feature_account_freeze = enabled
feature_account_suspension = enabled
```

### 9.2 Disabled / Locked Feature Flags

```txt
feature_exchange_orderbook = disabled
feature_matching_engine = disabled
feature_market_depth_as_aix_exchange = disabled
feature_public_exchange_trading = disabled
feature_public_market_pair_listing = disabled
feature_public_market_api = disabled
feature_client_to_client_matching = disabled

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
feature_aix_spread_markup = disabled
feature_executable_price_target_request = disabled
feature_internal_fallback_pricing = disabled
```

### 9.3 Feature Flag Enforcement Rules

1. Feature flags must be stored in the database.
2. Feature flags must be enforced by backend middleware or service guard.
3. Frontend must also hide disabled features, but frontend is not the source of truth.
4. Admin changes to feature flags must require permission.
5. High-risk feature flag changes must require maker-checker approval.
6. Every feature flag change must create an audit log.
7. Locked exchange features must not be enabled by normal admin users.
8. Locked exchange features require management and regulatory approval confirmation before activation.
9. Backend API must reject disabled-feature requests with `FEATURE_DISABLED`.
10. Locked feature API routes should not be publicly documented until enabled.
11. Feature flag default state must be disabled.
12. Unknown feature flag state must fail closed.
13. System fail-safe default must be deny.

---

## 10. Core System Rules

### 10.1 Licence Boundary Rules

1. The platform must operate within approved MB and PSO scope.
2. Exchange features must remain disabled until Exchange approval is granted.
3. AIX acts as broker/intermediary under the MB module.
4. AIX must not act as principal, market maker, or proprietary trader under the MB module.
5. The system must not allow exchange-style order matching before approval.
6. Spot broking must remain quote-and-confirm, LP-backed, and brokered.
7. Payment and settlement features must not become custody service unless separately approved.
8. LP market data must be labelled as external LP market depth, not AIX order book.
9. AIX revenue must be disclosed brokerage fee, not principal spread.
10. AIX inventory limit must be zero.

### 10.2 Client Eligibility Rules

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
11. Client type scope must be defined before production.
12. Jurisdiction allowlist must be defined before production.
13. Sanctioned-country blocking must be enforced.
14. Per-trade and daily transaction limits must be enforced.

### 10.3 AML/KYC Rules

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
11. KYC/CDD periodic refresh must be configured by risk rating.
12. Sanctions re-screening must run on list updates.
13. STR / regulatory filing workflow must exist.
14. Threshold transaction reporting must exist.
15. Digital asset deposits must go through wallet screening disposition.
16. Tainted-funds or mixer exposure must trigger quarantine or compliance review.

### 10.4 Travel Rule Enforcement Rules

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
11. Travel Rule threshold must be configured before production.
12. Self-hosted / unhosted wallet handling must be defined.
13. Counterparty VASP due diligence must be required where applicable.
14. Sunrise-issue handling must be defined.
15. Missing Travel Rule data must block transfer where required.

### 10.5 OTC/RFQ Rules

1. Only approved clients can create RFQ.
2. RFQ must include asset pair, side, amount, and quote type.
3. RFQ must have status.
4. Quote must have expiry timestamp.
5. Expired quote cannot be accepted.
6. Quote must show disclosed brokerage fee.
7. Quote must record price source or LP quote.
8. Quote must record whether it is firm or indicative.
9. Client acceptance must be timestamped.
10. Accepted RFQ must create trade booking.
11. Trade booking must trigger ledger process.
12. RFQ cannot skip required status sequence.
13. For executable quote, LP leg must be firm or secured first.
14. LP failure must not create AIX principal exposure.

### 10.6 MB Spot Broking Rules

1. Spot broking MVP must use brokered quote-and-confirm flow.
2. Spot broking must not operate as a full public exchange.
3. Client must confirm before trade booking.
4. Price, fee, and settlement details must be shown before confirmation.
5. Trade confirmation must be generated after booking.
6. Spot broking request must create audit log.
7. Spot broking trade must use ledger entries.
8. Spot broking cannot use locked matching engine.
9. External LP depth may be displayed only as external indicative market data.
10. Client order must not rest inside an AIX order book.
11. Client order must not match against another AIX client.
12. LP execution reference must be recorded where applicable.
13. LP depth must be non-executable and non-clickable.
14. Quote expiry must use server-authoritative UTC time.
15. Quote acceptance after expiry must be blocked.
16. LP outage disables quoting and execution.
17. No internal fallback quote source is allowed.
18. Price Target Request, if retained, must be alert-only and non-resting.

### 10.7 Payment and Settlement Rules

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
11. Client money daily reconciliation is required.
12. Three-way reconciliation is required where LP execution is involved.

### 10.8 Ledger Rules

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
11. Asset precision and rounding policy must be defined.
12. FX rate must be captured where fiat/digital asset conversion is involved.
13. System-wide trial balance must net to zero.
14. Ledger posting must be idempotent.
15. On-chain deposit confirmation threshold must be configured.
16. Suspense and clearing accounts must exist where required.

### 10.9 Audit Log Rules

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
11. Audit log must be append-only.
12. Audit log must be tamper-evident using hash-chain or equivalent.
13. Audit log retention years must be configured.
14. Read access to sensitive PII must be logged.
15. Admin must not be able to modify their own audit trail.

### 10.10 Maker-Checker Rules

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

### 10.11 Best Execution / Fair Pricing Rules

1. Best execution / fair pricing policy is required.
2. LP price snapshot must be retained.
3. Client quote must be retained.
4. LP execution report must be retained.
5. Price deviation limit must be enforced.
6. Quote rejection due to price movement must be recorded.
7. Client must see disclosed brokerage fee before confirmation.
8. Evidence must be retained for audit and client dispute handling.

---

## 11. UI Naming Control

The platform must use terminology that reflects MB/PSO scope and avoids implying that AIX is already operating a public exchange.

### 11.1 Preferred UI Terms

| Use This | Avoid This |
|---|---|
| Spot Broking | AIX Exchange |
| MB Spot Broking Terminal | Exchange Terminal |
| External LP Market Depth | AIX Order Book |
| Instant Quote | Market Order |
| Open Requests | Open Orders |
| Quote History | Order Book History |
| Trade History | Exchange Trade Feed |
| Price Alert | Price Target Request as execution instruction |
| Quote Validity | Time in Force |
| External Market Activity | AIX Market Activity |
| Brokered Trade | Matched Trade |
| Disclosed Brokerage Fee | AIX Spread |

### 11.2 MVP Disabled UI Concepts

1. Stop-limit.
2. Post-only.
3. Good-till-cancelled.
4. Fill-or-kill.
5. Immediate-or-cancel.
6. Public order book.
7. Maker/taker fee model.
8. Market maker panel.
9. Public exchange depth.
10. Internal matching engine status.
11. Executable price target request.
12. Click-to-trade depth ladder.
13. Public trade tape that implies AIX exchange execution.

### 11.3 Terminal Disclaimer Requirement

The MB Spot Broking Terminal must display a clear note such as:

```txt
Market data shown is indicative external LP market data. It is not an AIX exchange order book. All executions are subject to quote confirmation, eligibility checks, and brokered execution.
```

---

## 12. Development Rules

### 12.1 General Development Rules

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
11. Do not implement AIX spread markup.
12. Do not implement internal fallback pricing.

### 12.2 Backend Rules

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
11. Backend must separate external LP market data from internal execution records.
12. Backend must store LP price snapshots for trade evidence.
13. Backend must use idempotency keys for financial operations.
14. Backend must use server-authoritative UTC for quote expiry.
15. Backend must fail safe by default.

### 12.3 Frontend Rules

1. Frontend must hide disabled features.
2. Frontend must show account status clearly.
3. Frontend must show quote expiry clearly.
4. Frontend must show fee and settlement details before confirmation.
5. Frontend must prevent duplicate submission.
6. Frontend must display compliance pending status.
7. Frontend must not expose internal system settings to client.
8. Frontend must not store secrets.
9. Frontend must not calculate final ledger balances.
10. Frontend must show proper error messages from backend.
11. Frontend must label LP data as external LP market depth.
12. Frontend must not label external LP depth as AIX order book.
13. Frontend must not allow clickable execution from LP depth.
14. Frontend must not rely on client-side clock for expiry.

### 12.4 Database Rules

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
11. Store LP price snapshot and execution reference.
12. Store brokerage fee, quote expiry, acceptance time, and settlement reference.
13. Store idempotency keys for financial operations.
14. Store audit hash-chain values or tamper-evidence metadata.
15. Encrypt PII/KYC/Travel Rule sensitive data at rest.

### 12.5 Production Safety Rules

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
11. Production uses real LP keys only after approval.
12. Non-production uses LP sandbox only.
13. Non-production must not use real PII.
14. Secrets must be stored in KMS or vault.
15. Data residency requirement must be confirmed before production.

---

## 13. MVP Boundary

The MVP must focus on approved MB and PSO functions only.

### 13.1 MVP Includes

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
14. MB Spot Broking Terminal.
15. External LP Market Depth display.
16. LP-backed quote request.
17. Agency/back-to-back trade booking.
18. Deposit request.
19. Withdrawal request.
20. Payment instruction.
21. Settlement tracking.
22. Double-entry ledger.
23. Audit log.
24. Maker-checker.
25. Feature flags.
26. Admin portal.
27. Staff portal.
28. Client portal.
29. Reports.
30. Travel Rule enforcement.
31. AML case management.
32. Account freeze and suspension.
33. Approved asset whitelist.
34. Jurisdiction controls.
35. Transaction limits.
36. Best execution evidence.

### 13.2 MVP Excludes

1. Full AIX exchange order book.
2. AIX matching engine.
3. AIX market depth as exchange.
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
17. Client-to-client matching.
18. Resting public exchange orders.
19. AIX spread markup.
20. Internal fallback pricing.
21. Executable price target request.

### 13.3 MVP Success Criteria

The MVP is considered successful when:

1. Client can register.
2. Client can complete onboarding.
3. Client can submit KYC/KYB.
4. Compliance can approve or reject client.
5. Approved client can submit OTC/RFQ request.
6. Staff can issue quote.
7. Client can accept valid quote before expiry.
8. Client can use MB Spot Broking Terminal to request and confirm brokered spot quote.
9. System can store external LP price snapshot.
10. System can store client quote and LP execution reference where applicable.
11. System can book agency/back-to-back trade.
12. Ledger entries are created correctly.
13. Settlement status can be tracked.
14. Deposit and withdrawal workflow works.
15. Reports can be generated.
16. All sensitive actions are logged.
17. Disabled exchange features remain inaccessible.
18. Rejected or suspended clients cannot trade.
19. Travel Rule enforcement fields and blocking rules are available for relevant digital asset transfers.
20. AIX inventory remains zero.
21. No AIX spread markup is applied.
22. LP outage fails closed.

---

## 14. High-Level Licence Boundary Diagram

```mermaid
flowchart TD
    A[AIX Platform] --> B[Approved MB Scope]
    A --> C[Approved PSO Scope]
    A --> D[Pending Exchange Scope - Locked]

    B --> B1[OTC/RFQ]
    B --> B2[MB Spot Broking Terminal]
    B --> B3[Agency Back-to-Back Trade Booking]
    B --> B4[Disclosed Brokerage Fee]

    C --> C1[Deposit]
    C --> C2[Withdrawal]
    C --> C3[Payment Instruction]
    C --> C4[Settlement]
    C --> C5[Reconciliation]

    D --> D1[Public Order Book]
    D --> D2[Matching Engine]
    D --> D3[AIX Market Depth]
    D --> D4[Public Exchange Trading]

    D1 -. locked .-> X[Disabled by Feature Flag]
    D2 -. locked .-> X
    D3 -. locked .-> X
    D4 -. locked .-> X
```

---

## 15. LP-Backed Spot Broking Diagram

```mermaid
flowchart TD
    A[Client opens MB Spot Broking Terminal] --> B[Select asset pair]
    B --> C[Enter buy/sell amount]
    C --> D[System checks KYC/AML/client status]
    D --> E{Approved?}
    E -- No --> F[Block request]
    E -- Yes --> G[Fetch External LP Indicative Snapshot]
    G --> H[Check LP price deviation and availability]
    H --> I{LP available and firm?}
    I -- No --> J[Disable quote / fail closed]
    I -- Yes --> K[Generate client quote with disclosed brokerage fee]
    K --> L[Show quote and server UTC expiry]
    L --> M{Client accepts before expiry?}
    M -- No --> N[Quote expired]
    M -- Yes --> O[Confirm LP execution / matched leg]
    O --> P{LP execution success?}
    P -- No --> Q[Void / reject client trade, no principal absorption]
    P -- Yes --> R[Record LP execution reference]
    R --> S[Create brokered trade]
    S --> T[Post double-entry ledger]
    T --> U[Start settlement workflow]
    U --> V[Generate trade confirmation]
```

---

## 16. Initial Developer Parameters

These parameters must be included in later SRS, database design, API design, and Claude Code prompt.

```txt
licence_money_broking_status = approved
licence_pso_status = approved
licence_exchange_status = pending

platform_role = broker_intermediary
execution_model = agency_back_to_back
revenue_model = disclosed_brokerage_fee
principal_dealing = blocked
proprietary_trading = blocked
market_making = blocked
principal_spread_markup = blocked
lp_spread_disclosure = required_pre_trade
aix_inventory_limit = 0
naked_position_allowed = false
lp_leg_firm_before_client_quote = true
lp_hedge_failure_handling = void_client_trade

client_onboarding_required = true
kyc_kyb_required = true
beneficial_ownership_required = true
source_of_funds_required = true
source_of_wealth_required = conditional
pep_screening_required = true
sanctions_screening_required = true
wallet_screening_required = true
travel_rule_enforcement_required = true

liquidity_model = external_lp_backed
primary_lp = Binance_or_approved_LP
displayed_depth_source = external_lp
displayed_depth_type = indicative_snapshot
lp_depth_executable = false
internal_orderbook = disabled
internal_matching_engine = disabled
client_to_client_matching = disabled
aix_market_making = disabled
aix_principal_dealing = disabled

lp_due_diligence_required = true
lp_api_integration_required = true
lp_order_reference_required = true
lp_execution_report_required = true
lp_slippage_record_required = true
lp_outage_behaviour = fail_closed_no_internal_fallback
lp_rate_limit_handling_required = true
lp_price_snapshot_required = true
lp_price_deviation_limit_pct = to_be_defined
lp_counterparty_exposure_limit = to_be_defined
lp_three_way_reconciliation_required = true
lp_secret_management = kms_vault
lp_environment = sandbox_in_nonprod_only
lp_market_data_redistribution_licensed = required
best_available_terms_evidence = required

travel_rule_enforcement = true
travel_rule_threshold = to_be_defined
self_hosted_wallet_handling = required
counterparty_vasp_dd_required = true
travel_rule_block_on_missing_data = true

kyc_periodic_refresh_required = true
sanctions_rescreen_on_list_update = true
str_regulatory_filing_workflow = true
threshold_transaction_reporting = true
deposit_wallet_screening_required = true
aml_record_retention_years = to_be_defined

asset_precision_policy_required = true
fx_rate_capture_required = true
system_trial_balance_zero_invariant = true
ledger_idempotency_required = true
deposit_confirmation_threshold_required = true
client_money_daily_reconciliation = true

audit_log_append_only = true
audit_log_tamper_evidence = hash_chain
audit_read_access_logging = true
audit_retention_years = to_be_defined

approved_asset_whitelist = to_be_defined
approved_fiat_scope = to_be_defined
client_type_scope = to_be_confirmed
jurisdiction_allowlist = to_be_defined
sanctioned_country_block = true
per_trade_limit = to_be_defined
daily_transaction_limit = to_be_defined

feature_flag_default_state = disabled
fail_safe_default = deny
quote_expiry_time_source = server_utc
pii_encryption_at_rest = true
data_residency = to_be_confirmed
best_execution_policy_required = true

double_entry_ledger_required = true
audit_log_required = true
maker_checker_required = true
feature_flag_required = true
backend_feature_flag_enforcement = true

exchange_orderbook = disabled
matching_engine = disabled
market_depth_as_aix_exchange = disabled
public_exchange_trading = disabled

otc_rfq = enabled
mb_spot_broking_terminal = enabled
spot_broking_request = enabled
external_lp_market_depth = enabled
lp_backed_quote = enabled
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

## 17. Instruction for Next SDLC Document

After this document is accepted, the next document to prepare is:

```txt
01_Project_Charter.md
```

The Project Charter must use this licence scope as its base.

No SRS, database design, API design, or Claude Code implementation should start until this Licence Scope and Feature Lock document is accepted.

---

## 18. Claude Model Usage for This Document

### 18.1 Claude Opus

Use Claude Opus to review this document because it involves licence boundary, architecture, compliance, and high-risk product design.

### 18.2 Claude Sonnet

Do not use Claude Sonnet yet. Coding has not started.

### 18.3 Claude Fable

Do not use Claude Fable yet. UX copy is not the current priority.

---

## 19. Claude Opus Review Prompt

```txt
Review this 00_Licence_Scope_And_Feature_Lock_v1.2.md document as a principal fintech architect.

Context:
- Money Broking licence is approved.
- PSO licence is approved.
- Exchange application is pending.
- Platform will support OTC/RFQ, MB Spot Broking Terminal, LP-backed agency/back-to-back execution, onboarding, KYC/KYB, ledger, payment, settlement, audit log, admin portal, staff portal, client portal, and reporting.
- Binance or another approved LP may provide external indicative market depth and liquidity.
- AIX revenue model is disclosed brokerage fee only, not spread markup.
- AIX must keep inventory limit at zero and avoid naked principal position.
- Exchange order-book, internal matching engine, market depth as AIX exchange, client-to-client matching, and public exchange trading must remain disabled until Exchange approval is granted.
- Platform must include Travel Rule enforcement, AML/KYC, audit log, maker-checker, feature flags, best execution evidence, and double-entry ledger.

Review for:
1. Missing feature flags.
2. Missing system restrictions.
3. Risk of accidentally building an exchange.
4. Risk of acting as principal instead of broker.
5. Missing audit and ledger controls.
6. Missing AML/KYC and Travel Rule controls.
7. Missing LP integration controls.
8. Missing developer instructions.
9. Missing MVP boundary controls.
10. Unsafe UI wording.
11. Any unresolved contradiction with agency/back-to-back execution.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional parameters to add.
```
