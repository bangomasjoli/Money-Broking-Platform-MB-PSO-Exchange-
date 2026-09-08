# 02 Software Requirement Specification  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 02_Software_Requirement_Specification_v1.1.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 2 / Software Requirement Specification |
| Version | v1.1 |
| Status | Revised after Claude Opus SRS review; payout, safeguarding, concurrency, best-execution, SoD, privacy, fee reversal, and testing gaps corrected |
| Prepared for | Product, compliance, architecture, development, QA, security, and implementation planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Base document 2 | 01_Project_Charter_v1.3.md |
| Base document 3 | 03_Master_Module_Index_v1.2.md |

---

## 1. Purpose

This Software Requirement Specification defines the high-level and module-level requirements for the AIX Money Broking Platform.

The purpose of this SRS is to convert the accepted licence scope, project charter, and master module index into structured software requirements before detailed module blueprints, database design, API design, and coding.

This SRS is not a coding document. It is the controlling requirement document for:

1. Product scope.
2. Functional requirements.
3. Non-functional requirements.
4. Security requirements.
5. Compliance requirements.
6. Ledger and money-movement requirements.
7. Vendor integration requirements.
8. Reporting requirements.
9. Portal requirements.
10. Future-locked Exchange exclusions.
11. Testing and acceptance planning.
12. Claude Code implementation boundaries.

---

## 2. Accepted Scope Baseline

The SRS is based on the following accepted scope:

```txt
Money Broking licence = approved
PSO licence = approved
Exchange application = pending
MVP client type = institutional and HNWI/professional only
Retail onboarding = disabled by default
Execution model = agency back-to-back
Revenue model = disclosed brokerage fee only
AIX spread markup = blocked
AIX inventory limit = zero
Self-custody = disabled
Third-party custody model = required
Client money safeguarding account = required
Exchange order book = locked
Matching engine = locked
Client-to-client matching = locked
Market making = blocked
Principal dealing = blocked
```

Traceability note:

```txt
This SRS uses 03_Master_Module_Index_v1.2.md as the accepted module index base.
All later module blueprints must trace back to 00, 01, 02, and 03.
```

---

## 3. Product Description

The AIX Money Broking Platform is a regulated Labuan Money Broking and Payment System Operator platform.

It supports:

1. Institutional and HNWI/professional client onboarding.
2. KYC/KYB and beneficial ownership.
3. AML risk management.
4. Sanctions and PEP screening.
5. Wallet screening.
6. Travel Rule enforcement.
7. OTC/RFQ broking.
8. MB Spot Broking Terminal.
9. External LP-backed agency execution.
10. Deposit and withdrawal workflow.
11. Client-money safeguarding.
12. Custody and bank reconciliation.
13. Double-entry ledger.
14. Settlement sequencing / DvP control.
15. Audit log and maker-checker.
16. Reporting.
17. Client, staff, admin, compliance, finance, operations, and management portals.

It does not support public exchange trading in MVP.

---

## 4. Product Vision

The platform must be a real production-grade regulated fintech platform, not a demo.

The system must be:

1. Modular.
2. Audit-ready.
3. Compliance-first.
4. Ledger-safe.
5. Scalable.
6. Secure.
7. Vendor-integrated.
8. Future-expandable.
9. Licence-boundary controlled.
10. Safe from accidental Exchange or principal-dealing behaviour.

---

## 5. User Classes and Roles

### 5.1 Client

Client types allowed in MVP:

```txt
Institutional client
HNWI / professional client
```

Retail onboarding is disabled by default.

Client users can:

1. Register.
2. Complete onboarding.
3. Submit KYC/KYB.
4. Upload documents.
5. Submit beneficial ownership information.
6. Submit SOF/SOW information.
7. Accept client agreement and risk disclosure.
8. View approval status.
9. Use OTC/RFQ if approved.
10. Use MB Spot Broking Terminal if approved.
11. Request deposit.
12. Request withdrawal.
13. Manage verified payout destinations.
14. View trade history.
15. Download statements and confirmations.
16. Submit support request.

### 5.2 Compliance Officer / MLRO

Compliance users can:

1. Review KYC/KYB.
2. Review beneficial ownership.
3. Review professional/accredited status.
4. Review sanctions and PEP results.
5. Review wallet screening.
6. Review AML risk score.
7. Approve, reject, or request more information.
8. Open and manage AML cases.
9. Review transaction monitoring alerts.
10. Freeze or suspend account where permitted.
11. Review Travel Rule information.
12. Manage STR/regulatory filing workflow.
13. Review asset whitelist approval.
14. Sign off compliance go-live gates.

### 5.3 Operations Officer

Operations users can:

1. Monitor OTC/RFQ requests.
2. Monitor MB Spot Broking requests.
3. Review quote lifecycle.
4. Review LP execution status.
5. Handle settlement exceptions.
6. Review deposit and withdrawal operations.
7. Review payout destination status.
8. Escalate failed, partial, disputed, or reversed transactions.

### 5.4 Finance Officer

Finance users can:

1. Review ledger entries.
2. Review client balances.
3. Perform reconciliations.
4. Review bank statements.
5. Review custodian statements.
6. Review LP reconciliation.
7. Review trial balance.
8. Export financial reports.
9. Review fee income.
10. Review client-money safeguarding reports.

### 5.5 Customer Support

Support users can:

1. View limited client status.
2. View transaction status.
3. Raise support tickets.
4. Escalate cases.
5. Cannot approve KYC.
6. Cannot approve withdrawals.
7. Cannot change ledger.
8. Cannot change feature flags.

### 5.6 Admin

Admin users can:

1. Manage staff users.
2. Manage roles and permissions.
3. Manage feature flags.
4. Manage system settings.
5. Manage asset configuration.
6. Manage vendor records.
7. View audit logs.
8. Cannot self-approve high-risk changes.

### 5.7 Super Admin

Super Admin can manage high-level system configuration but remains subject to:

1. Audit log.
2. Maker-checker.
3. Licence locks.
4. Feature flag restrictions.
5. No self-approval.
6. No deletion or modification of own audit trail.

---

## 6. Assumptions

The SRS assumes:

1. MB licence remains approved.
2. PSO licence remains approved.
3. Exchange approval remains pending.
4. Exchange modules remain locked.
5. Retail onboarding remains disabled.
6. All product flows use agency/back-to-back execution.
7. AIX uses disclosed brokerage fee only.
8. AIX does not apply principal spread markup.
9. AIX does not hold client private keys in MVP.
10. Third-party custody is required.
11. Client fiat safeguarding account is required.
12. LP, custodian, bank, and vendor choices must be confirmed before production.
13. Numeric limits, thresholds, and retention values may be configured in later module blueprints or master settings.
14. Compliance approval is required before go-live.

---

## 7. Constraints

The platform must obey these constraints:

1. No public exchange order book in MVP.
2. No matching engine in MVP.
3. No client-to-client matching in MVP.
4. No market making.
5. No principal dealing.
6. No proprietary trading.
7. No derivatives.
8. No margin trading.
9. No securities token support unless separately approved.
10. No privacy coins.
11. No algorithmic stablecoins.
12. No MYR trading pairs unless separately approved.
13. No self-custody wallet service unless separately approved.
14. No direct balance edits.
15. No ledger entry deletion.
16. No audit log deletion.
17. No production feature activation without approval.
18. No real PII in non-production.
19. No production secrets in code or AI prompts.
20. No LP execution without pre-funded hold.
21. No final client ledger credit before confirmed bank/custodian receipt where doing so creates AIX exposure.
22. No LP payment before client-side asset/fund control unless approved DvP or safeguarded settlement mechanism exists.

---

## 8. Functional Requirements — Foundation

### FND-SRS-001 Platform Configuration

The system shall provide controlled platform configuration for environment, system constants, operational limits, and core parameters.

Acceptance criteria:

1. Only authorised staff can view or edit platform configuration.
2. Sensitive configuration changes require maker-checker.
3. All changes are audit logged.
4. Unknown configuration state fails safe.

### FND-SRS-002 Feature Flags

The system shall provide backend-enforced feature flags.

Requirements:

1. Feature flags must control MVP and locked features.
2. Feature flags must default to disabled.
3. Unknown feature flag state must fail closed.
4. Locked Exchange features cannot be enabled by normal admin users.
5. Feature flag changes require audit log.
6. High-risk feature flag changes require maker-checker.

### FND-SRS-003 File and Document Management

The system shall support secure document upload, storage, review, classification, retention, and access control.

Requirements:

1. Each uploaded file must be linked to a client, module, and purpose.
2. File access must be permission-controlled.
3. Sensitive file read access must be logged.
4. File deletion must follow retention policy.
5. File uploads must be malware-scanned where applicable.
6. File storage must support encryption.

### FND-SRS-004 Idempotency

The system shall enforce idempotency on all financial and sensitive operations.

Required idempotent operations:

1. Ledger posting.
2. Trade booking.
3. Quote acceptance.
4. Deposit crediting.
5. Withdrawal submission.
6. Settlement status update.
7. Payment instruction.
8. Reversal posting.

### FND-SRS-005 Notification Engine

The system shall support email, SMS, and in-app notifications.

Notifications must support:

1. Onboarding status.
2. KYC request for information.
3. Quote issued.
4. Quote expired.
5. Trade confirmation.
6. Deposit status.
7. Withdrawal status.
8. Payout destination change.
9. Security events.
10. Compliance alerts where permitted.


### FND-SRS-006 Concurrency and Transactional Integrity

The system shall prevent race conditions, double spending, double holding, and out-of-order ledger posting.

Requirements:

1. Balance hold and ledger posting must be atomic.
2. Available balance checks must be performed inside the same database transaction as hold creation.
3. Concurrent operations must not allocate the same available balance twice.
4. Critical balance operations must use serializable isolation, row-level locking, or an equivalent safe mechanism.
5. Ledger posting must not commit if the related balance hold fails.
6. Balance hold must not commit if the related ledger entry fails where both are part of the same financial event.
7. Trade booking, withdrawal, deposit crediting, settlement, and reversal must be protected against concurrent state transition conflicts.
8. The system must return `CONCURRENCY_CONFLICT` when a concurrent operation invalidates the attempted action.
9. Idempotency prevents duplicate retries, but concurrency control must protect distinct simultaneous operations.
10. Concurrency failures must be audit logged where money movement is involved.

---

## 9. Functional Requirements — Identity, Access, and Security

### IAM-SRS-001 Authentication

The system shall provide secure authentication for clients and staff.

Requirements:

1. Password policy.
2. Session handling.
3. Failed login tracking.
4. Account lockout.
5. Password reset.
6. Device and IP logging.
7. Audit log for login events.

### IAM-SRS-002 MFA

The system shall support MFA.

Requirements:

1. Staff MFA is mandatory.
2. Client MFA is configurable and required for sensitive flows.
3. Withdrawal and payout destination changes must require step-up authentication where configured.
4. MFA reset must require controlled approval.

### IAM-SRS-003 RBAC and Permission Guard

The system shall enforce role-based access control.

Requirements:

1. Every protected API must check permission.
2. Frontend hiding is not enough.
3. Backend permission guard is the source of truth.
4. Permission changes require audit log.
5. High-risk permission changes require maker-checker.
6. Staff cannot approve their own maker-checker request.

### IAM-SRS-004 Sensitive Data Protection

The system shall protect sensitive data.

Requirements:

1. PII must be encrypted at rest where applicable.
2. KYC/KYB data must be access-controlled.
3. Travel Rule data must be access-controlled.
4. Bank and wallet data must be access-controlled.
5. Read access to sensitive PII must be logged.
6. Data classification must be defined per sensitive module.

---

## 10. Functional Requirements — Client and Onboarding

### CLT-SRS-001 Client Registration

The system shall allow eligible clients to register.

Requirements:

1. Registration must create a client user profile.
2. Retail onboarding must be disabled by default.
3. Client must select or be assigned a client type.
4. Registration does not grant product access.
5. Client status starts as pending.

### CLT-SRS-002 Client Type Scope

The system shall enforce MVP client scope.

Allowed MVP client types:

```txt
Institutional
HNWI / professional
```

Requirements:

1. Retail client type must be disabled by default.
2. Client type must control onboarding path.
3. Client type must control product access.
4. Any change to client type must be audit logged.
5. High-risk client type changes require compliance approval.

### CLT-SRS-003 Professional / Accredited Status Verification

The system shall support verification of institutional, HNWI, or professional eligibility.

Requirements:

1. Evidence must be uploaded or recorded.
2. Status must be reviewed by compliance.
3. Approval must be timestamped.
4. Rejection reason must be recorded.
5. Status must expire or be refreshed where required.
6. Product access must be blocked until eligible status is approved.

### CLT-SRS-004 Corporate KYB Onboarding

The system shall support corporate KYB onboarding.

Requirements:

1. Company profile.
2. Registration documents.
3. Directors.
4. Shareholders.
5. Beneficial owners.
6. Authorised representatives.
7. Corporate structure.
8. Source of funds.
9. Source of wealth where applicable.
10. Sanctions/PEP screening.

### CLT-SRS-005 Client Agreement and Consent

The system shall capture client agreement, agency terms, risk disclosure, privacy notice, and consent.

Requirements:

1. Client must accept required documents before product access.
2. Accepted version must be recorded.
3. Timestamp and IP must be recorded.
4. Updated agreement may require re-acceptance.
5. Consent records must be retrievable.

### CLT-SRS-006 Client Status Engine

The system shall manage client lifecycle status.

Required statuses:

```txt
draft
submitted
under_review
more_info_required
approved
rejected
suspended
frozen
closed
```

Rules:

1. Only approved clients can transact.
2. Suspended clients cannot trade, deposit, or withdraw.
3. Frozen clients cannot withdraw.
4. Rejected clients cannot transact.
5. Status changes require audit log.
6. Freeze/unfreeze requires maker-checker where configured.

---

## 11. Functional Requirements — Compliance and AML

### CMP-SRS-001 KYC/KYB Review

The system shall support compliance review of KYC/KYB submissions.

Requirements:

1. Review checklist.
2. Approve / reject / request more information.
3. Evidence attachment.
4. Reviewer notes.
5. Decision timestamp.
6. Audit log.

### CMP-SRS-002 AML Risk Scoring

The system shall calculate and maintain AML risk score.

Risk factors may include:

1. Client type.
2. Jurisdiction.
3. Business activity.
4. PEP status.
5. Sanctions exposure.
6. Wallet risk.
7. Transaction behaviour.
8. Source of funds.
9. Source of wealth.
10. Adverse media where available.

### CMP-SRS-003 Sanctions and PEP Screening

The system shall support sanctions and PEP screening.

Requirements:

1. Screening at onboarding.
2. Re-screening on list updates.
3. Screening before high-risk transactions where required.
4. Match status and decision record.
5. False-positive resolution.
6. Audit trail.

### CMP-SRS-004 Wallet Screening

The system shall support wallet screening for digital asset deposits and withdrawals.

Requirements:

1. Screen wallet address.
2. Record risk score.
3. Detect tainted funds, mixer exposure, sanctions exposure, or high-risk exposure where supported by vendor.
4. Approve, hold, quarantine, or reject.
5. Link screening result to transaction.
6. Escalate high-risk result to AML case.

### CMP-SRS-005 Travel Rule Enforcement

The system shall enforce Travel Rule data capture and block rules for relevant digital asset transfers.

Requirements:

1. Originator data.
2. Beneficiary data.
3. Wallet address.
4. Counterparty VASP data where applicable.
5. Self-hosted wallet handling.
6. Transfer block on missing required data.
7. Exception recording.
8. Secure retention.
9. Reportability.

### CMP-SRS-006 Transaction Monitoring and Alert Engine

The system shall monitor transactions and generate alerts.

Rules may include:

1. Velocity.
2. Structuring.
3. Threshold breach.
4. Unusual transaction size.
5. High-risk jurisdiction.
6. High-risk wallet exposure.
7. Repeated failed withdrawals.
8. Rapid in-out movement.
9. Pattern anomaly.
10. Manual compliance rule.

Requirements:

1. Alert must link to client and transaction.
2. Alert must have severity.
3. Alert must have status.
4. Alert may create AML case.
5. Alert closure must require reason.
6. Alert decisions must be audit logged.

### CMP-SRS-007 AML Case Management

The system shall support AML case workflow.

Required statuses:

```txt
open
under_review
escalated
request_info
closed_no_issue
closed_suspicious
filed
```

Requirements:

1. Case owner.
2. Case notes.
3. Evidence.
4. Linked alerts.
5. Linked transactions.
6. Escalation.
7. STR workflow linkage.
8. Audit trail.

### CMP-SRS-008 STR / Regulatory Filing Workflow

The system shall support internal STR/regulatory filing workflow.

Requirements:

1. Filing decision record.
2. Approver.
3. Filing status.
4. Supporting evidence.
5. Confidentiality control.
6. Restricted access.
7. Retention.

### CMP-SRS-009 Account Freeze and Suspension

The system shall allow authorised compliance users to freeze or suspend accounts.

Requirements:

1. Reason required.
2. Scope of freeze/suspension.
3. Effective time.
4. Maker-checker where configured.
5. Audit log.
6. Client access and transaction effects must be enforced by backend.

### CMP-SRS-010 Complaints / Dispute Management

The system shall include or reserve module support for complaints and disputes.

Minimum requirements:

1. Complaint record.
2. Client linkage.
3. Category.
4. Status.
5. Owner.
6. Resolution.
7. Evidence.
8. Audit log.

### CMP-SRS-011 Data-Subject Rights / Privacy

The system shall include or reserve module support for privacy requests.

Minimum requirements:

1. DSAR request record.
2. Identity verification.
3. Status.
4. Response due date.
5. Retention conflict handling.
6. Export or restricted disclosure workflow.
7. Audit log.

---

## 12. Functional Requirements — Vendors and External Integrations

### VND-SRS-001 Vendor Registry

The system shall maintain a registry of vendors and service providers.

Required vendor types:

1. LP.
2. Custodian.
3. Bank.
4. KYC/IDV provider.
5. Sanctions/PEP provider.
6. Blockchain analytics provider.
7. Cloud provider.
8. Notification provider.
9. Node/data provider.

### VND-SRS-002 Vendor Due Diligence

The system shall support vendor due diligence records.

Required fields:

1. Vendor name.
2. Service type.
3. Contract status.
4. SLA status.
5. Security review.
6. Data protection review.
7. Outsourcing/regulatory assessment.
8. Exit plan.
9. Risk rating.
10. Approval status.

### VND-SRS-003 LP Adapter

The system shall integrate with Binance or another approved LP through a controlled adapter.

Requirements:

1. LP must be approved.
2. LP credentials must be stored in KMS/vault.
3. LP outage must fail closed.
4. LP market data must be indicative and non-executable.
5. LP execution reference must be recorded.
6. LP partial fill/slippage must trigger void, re-quote, or reversal.
7. LP three-way reconciliation must be supported.
8. LP market-data licence must be confirmed before production display.

### VND-SRS-004 Custodian Integration

The system shall integrate with third-party custodian where applicable.

Requirements:

1. Custodian account structure.
2. Balance retrieval.
3. Transfer status.
4. Deposit address management if applicable.
5. Custodian statement.
6. Custodian reconciliation.
7. Custodian incident handling.
8. No AIX private-key custody in MVP.

### VND-SRS-005 Bank Integration / Statement Import

The system shall support bank integration or statement import.

Requirements:

1. Bank statement import.
2. Payment reference matching.
3. Deposit matching.
4. Withdrawal confirmation.
5. Client-money safeguarding account reconciliation.
6. Exception workflow.

---

## 13. Functional Requirements — Asset and Market Configuration

### AST-SRS-001 Asset Master

The system shall maintain supported asset records.

Required fields:

1. Asset code.
2. Asset name.
3. Asset type.
4. Decimal precision.
5. Status.
6. Risk classification.
7. Admissibility status.
8. Compliance approval status.

### AST-SRS-002 Approved Asset Whitelist

The system shall enforce only approved assets.

Ownership rule:

```txt
CMP-20 = compliance review and approval
AST-02 / AST-03 = technical enforcement and configuration
```

Requirements:

1. Asset cannot be enabled without compliance approval.
2. Block privacy coins.
3. Block algorithmic stablecoins.
4. Block securities tokens unless approved.
5. Block MYR pairs unless approved.
6. Asset changes require audit log and maker-checker where configured.

### AST-SRS-003 Pair Configuration

The system shall define approved broking pairs.

Requirements:

1. Pair must use approved assets.
2. Pair must have status.
3. Pair must define allowed client types.
4. Pair must define limits.
5. Pair must define fee rule.
6. Pair activation requires approval.

---

## 14. Functional Requirements — Product and Broking

### PRD-SRS-001 Fee Engine

The system shall calculate disclosed brokerage fee.

Requirements:

1. Fee must be disclosed before client confirmation.
2. Fee must be recorded separately from LP price.
3. AIX spread markup is prohibited.
4. Fee rule changes require audit log.
5. High-risk fee changes require maker-checker.
6. If trade is voided, failed, reversed, or re-quoted after fee hold/charge, the related fee must be released or reversed.
7. Fee reversal must be linked to the original quote, trade, settlement, and ledger reference.

### PRD-SRS-002 Pricing Engine

The system shall construct quotes from approved LP price source and disclosed brokerage fee.

Requirements:

1. LP price snapshot.
2. Quote timestamp.
3. Server UTC expiry.
4. Brokerage fee.
5. Client-visible final quote.
6. Quote validity.
7. Price deviation check.
8. Re-quote rule.
9. Audit trail.

### PRD-SRS-003 External LP Market Depth

The system may display external LP market depth.

Rules:

1. Must be labelled External LP Market Depth.
2. Must be indicative snapshot.
3. Must not be clickable for direct execution.
4. Must not be labelled AIX Order Book.
5. Must not imply AIX public exchange.
6. Market-data licence must be confirmed before production.
7. Display must include disclaimer.

### PRD-SRS-004 OTC/RFQ

The system shall support agency-only OTC/RFQ.

Requirements:

1. Approved client only.
2. Product access gate.
3. Asset/pair whitelist.
4. Pre-funded hold before LP execution.
5. Quote request.
6. Staff or system quote must be LP-derived with disclosed brokerage fee only.
7. Quote expiry.
8. Client acceptance.
9. Trade booking.
10. Ledger posting.
11. Settlement workflow.
12. No AIX principal role.
13. No AIX spread markup.
14. Manual staff price markup is prohibited.
15. Staff-entered quote must retain LP price source and best-execution evidence.

### PRD-SRS-005 MB Spot Broking Terminal

The system shall provide MB Spot Broking Terminal.

Requirements:

1. Client must be approved.
2. Client type must be eligible.
3. Product access must be allowed.
4. AML status must be acceptable.
5. Asset/pair must be approved.
6. Pre-funded hold must pass before LP execution.
7. Quote must show disclosed brokerage fee.
8. Quote expiry must use server UTC.
9. Client confirmation required.
10. LP execution reference stored.
11. Partial fill/slippage handled by void or re-quote.
12. Trade booking creates ledger event.
13. Settlement workflow starts.
14. No public order book.
15. No matching engine.
16. No client-to-client matching.

### PRD-SRS-006 Quote Lifecycle

Required quote statuses:

```txt
requested
priced
issued
accepted
expired
rejected
requote_required
cancelled
failed
```

Rules:

1. Expired quote cannot be accepted.
2. Accepted quote cannot be reused.
3. Re-quote requires fresh client confirmation.
4. Quote changes must be audit logged.

### PRD-SRS-007 Trade Booking

The system shall book trades only after all gates pass.

Required gates:

1. Feature flag enabled.
2. Client approved.
3. Client type eligible.
4. Professional/accredited status verified where applicable.
5. AML status acceptable.
6. Asset/pair approved.
7. Pre-funded hold successful.
8. LP execution successful or matched leg confirmed.
9. Quote accepted before expiry.
10. Idempotency key valid.


### PRD-SRS-008 Best Execution / Fair Pricing Check

The system shall enforce best-execution and fair-pricing checks before trade booking.

Requirements:

1. Quote must be validated against approved LP reference price before booking.
2. Price deviation tolerance must be configured.
3. Quote outside approved tolerance must be blocked with `BEST_EXECUTION_CHECK_FAILED`.
4. LP price snapshot must be stored.
5. LP source, timestamp, bid/ask where applicable, and quote basis must be stored.
6. Disclosed brokerage fee must be stored separately from LP price.
7. Manual quote markup is prohibited.
8. Conflict-of-interest evidence must be retained.
9. Best-execution failure must trigger re-quote or cancellation.
10. Best-execution check must be audit logged.

---

## 15. Functional Requirements — Money, Ledger, and Settlement

### MON-SRS-001 Double-Entry Ledger

The system shall implement double-entry ledger.

Requirements:

1. Every financial movement must create debit and credit entries.
2. Total debit must equal total credit.
3. Ledger entries are immutable.
4. Reversal uses reversing entries.
5. Ledger entry must reference source module.
6. Ledger entry must reference source transaction.
7. Idempotency required.
8. Trial balance must net to zero.

### MON-SRS-002 Client Balance

The system shall maintain client balances.

Balance types:

```txt
available
pending
held
frozen
settled
```

Rules:

1. Available balance cannot go negative.
2. Hold cannot exceed available balance.
3. Direct balance edit is prohibited.
4. Balance derives from ledger.
5. Frozen balance cannot be withdrawn.
6. Held balance cannot be used for another trade.

### MON-SRS-003 Pre-Funded Hold

The system shall lock client funds/assets before LP execution.

Requirements:

1. Hold created before LP execution.
2. Hold amount linked to quote/trade.
3. Hold expiry defined.
4. Hold release on quote expiry or failed execution.
5. Hold conversion to settlement on successful trade.
6. Hold cannot exceed available balance.
7. Hold events audit logged.

### MON-SRS-004 Deposit Workflow

The system shall support fiat and digital asset deposit workflows.

Requirements:

1. Deposit request or detection.
2. Bank/custodian confirmation.
3. Wallet screening where digital asset.
4. On-chain confirmation threshold where digital asset.
5. Compliance hold/quarantine where required.
6. Ledger credit only after required confirmation.
7. Deposit status tracking.
8. Reconciliation.

### MON-SRS-005 Withdrawal Workflow

The system shall support fiat and digital asset withdrawals.

Requirements:

1. Approved client only.
2. Verified payout destination required.
3. Travel Rule data required where applicable.
4. Wallet screening required where digital asset.
5. AML check.
6. Available balance check.
7. Maker-checker where required.
8. Ledger hold.
9. Bank/custodian release.
10. Status tracking.
11. Reconciliation.

### MON-SRS-006 Payout Destination Whitelist

The system shall manage verified payout destinations.

Destination types:

```txt
client_bank_account
crypto_wallet_address
```

Requirements:

1. Payout destination must be in the client's own verified name.
2. Third-party payout is prohibited by default.
3. Any exceptional third-party payout, if ever allowed in future, must require EDD, senior compliance approval, documented rationale, maker-checker, and separate policy approval.
4. Verification is required before activation.
5. New destination cooling-off is required.
6. Destination changes require audit log.
7. High-risk destination changes require maker-checker.
8. Withdrawal cannot proceed to unverified destination.
9. Withdrawal to third-party destination must be blocked with `THIRD_PARTY_PAYOUT_BLOCKED`.
10. Wallet destination must link to wallet screening and Travel Rule.
11. Bank destination must link to client bank account evidence.
12. Destination ownership evidence must be retained.

### MON-SRS-007 Settlement Sequencing / DvP

The system shall enforce settlement sequencing.

Requirements:

1. No final client ledger credit before confirmed receipt where this creates AIX exposure.
2. No LP payment before client-side fund/asset control unless approved DvP/safeguarded mechanism exists.
3. Use pre-funded holds where true DvP is unavailable.
4. Use suspense and clearing accounts.
5. Failed settlement triggers void, re-quote, reversal, or exception workflow.
6. Settlement evidence required.
7. Partial settlement must not create AIX residual position.

### MON-SRS-008 FX / Conversion Policy

The system shall support FX/conversion policy.

Requirements:

1. Rate source defined.
2. Rate timestamp captured.
3. Server UTC used.
4. Rounding policy defined.
5. Rate validity defined.
6. FX movement beyond tolerance triggers void or re-quote.
7. AIX must not absorb FX movement as principal unless separately approved.
8. Client confirmation required after re-quote.

### MON-SRS-009 Reconciliation

The system shall support reconciliation.

Required reconciliation:

1. Ledger vs bank.
2. Ledger vs custodian.
3. Ledger vs LP.
4. Client money daily reconciliation.
5. LP three-way reconciliation.
6. Custodian reconciliation.
7. Bank reconciliation.

### MON-SRS-010 Reconciliation Break Management

The system shall manage reconciliation breaks.

Requirements:

1. Break detection.
2. Break severity.
3. Owner assignment.
4. Investigation notes.
5. Evidence attachment.
6. Resolution status.
7. Escalation.
8. Audit log.
9. Linked reversal or adjustment where approved.
10. No deletion of original records.


### MON-SRS-011 Client Money Safeguarding Computation

The system shall compute and monitor the client-money safeguarding position.

Requirements:

1. System must compute total client money liability.
2. System must compute total safeguarded client money resources.
3. Client money resources must fully back client money liabilities at all times.
4. Any shortfall must trigger `CLIENT_MONEY_SHORTFALL`.
5. Shortfall must create high-severity finance/compliance alert.
6. Shortfall must require escalation and remediation workflow.
7. Client money must not be used for AIX operating expenses.
8. Client money must not be used for payroll, vendor payment, company debt, proprietary obligations, or non-client settlement.
9. Safeguarding computation must be linked to daily reconciliation.
10. Computation records must be retained for audit.
11. Manual override of safeguarding result must require maker-checker and reason.
12. Go-live requires client-money safeguarding computation to balance.

---

## 16. Functional Requirements — Reporting and Records

### RPT-SRS-001 Reporting Engine

The system shall provide reporting infrastructure.

Report features:

1. Filter.
2. Search.
3. Export.
4. Role-based access.
5. Audit of sensitive report access.
6. Scheduled reports where required.

### RPT-SRS-002 Required Reports

The system shall support:

1. Client statement.
2. Trade report.
3. Ledger report.
4. Reconciliation report.
5. Compliance report.
6. Travel Rule report.
7. Regulatory reporting support.
8. STR / filing record.
9. Audit report.
10. Management report.

### RPT-SRS-003 Records Retention and Archival

The system shall support records retention.

Requirements:

1. Retention policy by data type.
2. Archival.
3. Retrieval.
4. Legal hold where required.
5. Delete only where legally permitted.
6. Audit log of retention actions.

### RPT-SRS-004 Traceability Matrix

The system documentation shall include Requirements-Licence-Module Traceability Matrix.

The matrix must map:

1. Requirement ID.
2. Licence scope.
3. Module.
4. System rule.
5. API or workflow.
6. Audit event.
7. Test case.

---

## 17. Functional Requirements — Portals

### PRT-SRS-001 Client Portal

The Client Portal shall support:

1. Registration.
2. Onboarding.
3. Document upload.
4. Agreement acceptance.
5. Status tracking.
6. OTC/RFQ.
7. MB Spot Broking Terminal.
8. Deposit and withdrawal.
9. Payout destination management.
10. Statements and confirmations.
11. Support requests.

### PRT-SRS-002 Staff Portal

The Staff Portal shall support:

1. Client review.
2. Compliance review.
3. Operations workflows.
4. Trade monitoring.
5. Settlement monitoring.
6. Exception management.
7. Reports.

### PRT-SRS-003 Admin Portal

The Admin Portal shall support:

1. Staff user management.
2. Role and permission management.
3. Feature flag management.
4. Asset configuration.
5. Pair configuration.
6. Vendor registry.
7. System settings.
8. Audit log access.

### PRT-SRS-004 Compliance Workspace

The Compliance Workspace shall support:

1. KYC/KYB review.
2. AML risk scoring.
3. Screening review.
4. Transaction monitoring alerts.
5. AML cases.
6. STR workflow.
7. Travel Rule review.
8. Account freeze/suspension.

### PRT-SRS-005 Operations and Finance Workspace

Operations and Finance shall support:

1. Trade operations.
2. Deposit and withdrawal operations.
3. Settlement.
4. Ledger.
5. Reconciliation.
6. Reconciliation breaks.
7. Reports.

---

## 18. Functional Requirements — Operations and Governance

### OPS-SRS-001 Audit Log

The system shall maintain immutable audit log.

Requirements:

1. Append-only.
2. Tamper-evident hash-chain or equivalent.
3. Captures user, role, action, timestamp, IP, user agent.
4. Captures before/after values where applicable.
5. Logs read access to sensitive PII.
6. Cannot be deleted.
7. Cannot be modified by admin.
8. Searchable by authorised users.

### OPS-SRS-002 Maker-Checker

The system shall support maker-checker.

Sensitive actions requiring maker-checker may include:

1. Feature flag change.
2. Role/permission change.
3. Client status change.
4. Account freeze/unfreeze.
5. Withdrawal approval.
6. Ledger reversal.
7. Settlement completion.
8. Fee configuration change.
9. Asset/pair activation.
10. Payout destination approval.
11. Production deployment.


### OPS-SRS-006 Segregation of Duties

The system shall support segregation-of-duties controls.

Requirements:

1. A segregation-of-duties conflict matrix must be defined.
2. Staff who performed onboarding review should not approve high-risk withdrawals for the same client where configured.
3. Staff who created a payout destination should not approve the same payout destination.
4. Staff who created a ledger reversal request cannot approve it.
5. Staff who changed a role or permission cannot approve the same change.
6. Staff who initiated production deployment cannot approve the same deployment.
7. The system must prevent self-approval.
8. SoD conflict must return `SEGREGATION_OF_DUTIES_CONFLICT`.
9. SoD override, if allowed, must require senior approval and audit log.

### OPS-SRS-003 BCP / DR

The system shall support business continuity and disaster recovery planning.

Requirements:

1. Backup plan.
2. Restore test.
3. RTO and RPO targets.
4. Incident response.
5. DR test evidence.
6. Go-live gate.

### OPS-SRS-004 CI/CD and Delivery Controls

The system delivery process shall include:

1. Branch protection.
2. Pull request approval.
3. Automated tests.
4. SAST.
5. DAST where applicable.
6. Dependency scanning.
7. Secret scanning.
8. Docker image scanning where applicable.
9. Migration review.
10. Release approval.
11. Rollback plan.

### OPS-SRS-005 AI / Claude Governance

AI tools used for documentation, review, or coding must follow governance rules.

Requirements:

1. No real client PII in prompts.
2. No production secrets in prompts.
3. No LP credentials in prompts.
4. AI output requires human review.
5. Regulated logic requires compliance or expert review.
6. AI cannot modify production feature flags.
7. AI cannot bypass licence locks.
8. AI-generated code must go through PR and testing.

---

## 19. Future-Locked Exchange Requirements

The following modules are future-locked and excluded from MVP runtime:

1. AIX Public Order Book.
2. AIX Matching Engine.
3. AIX Public Market Depth.
4. Public Exchange Trading.
5. Client-to-Client Matching.
6. Public Market API.
7. Market Maker Engine.
8. Maker/Taker Fee Engine.
9. Resting Limit Orders.
10. Stop-Limit Orders.
11. GTC / Post-Only / IOC / FOK Orders.
12. Public Exchange Market Surveillance.

Requirements:

1. These modules must not be wired into MVP runtime.
2. These modules must not be visible to clients.
3. These modules must not share execution path with MB Spot Broking.
4. These modules must remain disabled by backend feature flags.
5. Activation requires Exchange approval and full documentation update.

---

## 20. Non-Functional Requirements

### NFR-SRS-001 Performance

The system should target:

| Requirement | Target |
|---|---:|
| Registered users | 1,000+ |
| Concurrent users | 1,000 |
| Normal API response | < 300 ms |
| Heavy API response | < 1,000 ms |
| Quote response | < 1 second |
| WebSocket reconnect if used | < 5 seconds |
| Uptime | 99.9% |

### NFR-SRS-002 Security

Security requirements:

1. MFA.
2. RBAC.
3. Permission guard.
4. Encryption in transit.
5. Encryption at rest for sensitive data.
6. Rate limiting.
7. Session timeout.
8. Secrets in KMS/vault.
9. Audit log.
10. Security monitoring.
11. Pen test before production.

### NFR-SRS-003 Reliability

Reliability requirements:

1. Backup.
2. Restore test.
3. DR plan.
4. Error monitoring.
5. Job retry rules.
6. Idempotency.
7. Fail-safe default deny.
8. LP outage fail closed.

### NFR-SRS-004 Maintainability

Maintainability requirements:

1. Modular architecture.
2. TypeScript.
3. API documentation.
4. Database migrations.
5. Code review.
6. Test coverage.
7. Logging.
8. Clear folder structure.

### NFR-SRS-005 Auditability

Auditability requirements:

1. Every sensitive action logged.
2. Every financial movement traceable.
3. Every trade linked to quote, LP reference, ledger, and settlement.
4. Every compliance decision logged.
5. Every configuration change logged.
6. Every report export logged where sensitive.


### NFR-SRS-006 Data Residency and Privacy

The system shall support data residency and privacy compliance requirements.

Requirements:

1. Data residency requirement must be defined before production.
2. PII and sensitive client data must be stored and processed according to approved data residency rules.
3. KYC/KYB, Travel Rule, bank, wallet, AML case, and document data must follow privacy controls.
4. PDPA/privacy requirements must be reflected in data classification documents.
5. Data export must be permission-controlled.
6. Data retention must follow approved retention policy.
7. Data-subject requests must be handled within privacy and regulatory retention limits.
8. Cross-border vendor processing must be reviewed before production.

---

## 21. Data Requirements

The platform must store and protect the following data categories:

1. User account data.
2. Client profile data.
3. Corporate KYB data.
4. Beneficial ownership data.
5. KYC documents.
6. SOF/SOW documents.
7. Professional/accredited status evidence.
8. Client agreement and consent records.
9. Screening results.
10. Wallet screening results.
11. Travel Rule data.
12. AML cases and alerts.
13. Vendor records.
14. Asset configuration.
15. Quote records.
16. Trade records.
17. Ledger entries.
18. Payment instructions.
19. Settlement records.
20. Reconciliation records.
21. Audit logs.
22. Reports.

Every module handling PII or sensitive data must have `16_Data_Classification.md`.

---

## 22. State Machine Requirements

The following modules must have explicit state machines:

1. Client onboarding.
2. KYC/KYB review.
3. Professional status verification.
4. AML case.
5. Transaction monitoring alert.
6. Account freeze/suspension.
7. Payout destination.
8. Quote lifecycle.
9. Trade booking.
10. Deposit.
11. Withdrawal.
12. Settlement.
13. Reconciliation break.
14. Maker-checker request.
15. Feature flag change.
16. Vendor approval.
17. Asset approval.
18. STR/regulatory filing workflow.

---

## 23. API Requirements

Every API must follow:

1. Authentication check.
2. Permission guard.
3. Feature flag guard.
4. Request validation.
5. Idempotency where required.
6. Audit log where sensitive.
7. Error response standard.
8. Rate limiting where required.
9. Data masking where applicable.
10. No direct access to locked features.

Financial APIs must additionally include:

1. Idempotency key.
2. Ledger reference.
3. Transaction reference.
4. Status transition guard.
5. Reversal path.
6. Reconciliation linkage.

---

## 24. Error Handling Requirements

The platform must implement standard error codes.

Minimum error categories:

```txt
AUTH_REQUIRED
PERMISSION_DENIED
FEATURE_DISABLED
VALIDATION_ERROR
CLIENT_NOT_APPROVED
CLIENT_SUSPENDED
CLIENT_FROZEN
KYC_REQUIRED
AML_BLOCKED
TRAVEL_RULE_DATA_MISSING
ASSET_NOT_ALLOWED
PAIR_NOT_ALLOWED
QUOTE_EXPIRED
QUOTE_REQUOTE_REQUIRED
INSUFFICIENT_AVAILABLE_BALANCE
PREFUNDED_HOLD_FAILED
PAYOUT_DESTINATION_NOT_VERIFIED
LP_UNAVAILABLE
LP_EXECUTION_FAILED
SETTLEMENT_FAILED
RECONCILIATION_BREAK
LEDGER_IMBALANCE
IDEMPOTENCY_CONFLICT
MAKER_CHECKER_REQUIRED
THIRD_PARTY_PAYOUT_BLOCKED
CLIENT_MONEY_SHORTFALL
BEST_EXECUTION_CHECK_FAILED
CONCURRENCY_CONFLICT
SEGREGATION_OF_DUTIES_CONFLICT
```

---

## 25. Testing Requirements

Testing must cover:

1. Unit tests.
2. Integration tests.
3. API tests.
4. Permission tests.
5. Feature flag tests.
6. State machine tests.
7. Ledger balancing tests.
8. Idempotency tests.
9. Quote expiry tests.
10. Pre-funded hold tests.
11. LP failure tests.
12. Settlement failure tests.
13. Reconciliation break tests.
14. AML rule tests.
15. Travel Rule block tests.
16. Payout destination tests.
17. Negative balance prevention tests.
18. Audit log tests.
19. Maker-checker tests.
20. Security tests.
21. UAT.
22. Performance / load testing.
23. Concurrency / race-condition testing for balance holds.
24. DvP / settlement sequencing tests.
25. Client-money safeguarding computation tests.
26. Best-execution / fair-pricing tests.
27. Third-party payout blocking tests.
28. Segregation-of-duties tests.
29. Pen test before go-live.

Minimum initial target:

```txt
80% test coverage for core business logic.
```

---

## 26. Go-Live Requirements

The platform must not go live until:

1. Compliance / MLRO sign-off obtained.
2. Principal Officer / management sign-off obtained.
3. Custody model approved.
4. Client-money safeguarding model approved.
5. Fiat banking partner confirmed.
6. Crypto custodian confirmed.
7. LP legal agreement confirmed.
8. LP market-data licence confirmed.
9. Vendor due diligence completed.
10. SRS approved.
11. Module blueprints approved.
12. Security architecture approved.
13. Testing strategy approved.
14. Pen test passed.
15. DR / backup restore test passed.
16. Ledger trial balance nets to zero.
17. Client-money reconciliation balances.
18. Feature flags verified.
19. Exchange-locked modules disabled.
20. Production deployment maker-checker approved.
21. Client-money safeguarding computation balances.
22. Concurrency tests passed for money-critical flows.
23. Best-execution / fair-pricing checks passed.
24. Third-party payout blocking verified.
25. Data residency and privacy controls approved.

---

## 27. Traceability Requirement

Every requirement in this SRS must be traceable to:

1. Licence scope.
2. Project Charter section.
3. Master Module Index module.
4. System rule.
5. API or workflow.
6. Audit log event.
7. Test case.

The traceability matrix will be expanded after SRS review.

---

## 28. Open Items for Later Documents

The following values must be defined in later documents before production:

1. Approved asset whitelist.
2. Approved fiat scope.
3. Jurisdiction allowlist.
4. Travel Rule threshold.
5. Per-trade limit.
6. Daily transaction limit.
7. AML record retention years.
8. Audit retention years.
9. Data residency.
10. LP price deviation limit.
11. LP counterparty exposure limit.
12. Crypto custodian.
13. Fiat banking partner.
14. Custody account structure.
15. FX rate source.
16. FX rounding policy.
17. DvP settlement sequence final values and exception timing.
18. Minimum cooling-off period for new payout destination.
19. Exact test coverage by module.
20. Production infrastructure.
21. Segregation-of-duties matrix details.
22. Client-money safeguarding computation formula details.
23. Best-execution tolerance values.
24. Data residency hosting location.

---

## 29. Additional SRS Control Parameters

```txt
withdrawal_own_name_only = true
third_party_payout = prohibited_by_default
third_party_payout_exception = edd_senior_compliance_approval_required

client_money_fully_backed_invariant = true
client_money_operational_use = prohibited
client_money_shortfall_alert = required
client_money_top_up_workflow = required

balance_operations_atomic = true
balance_isolation = serializable_or_row_lock
concurrent_hold_double_spend = prohibited
ledger_posting_atomic = true

best_execution_check = required_before_booking
best_execution_failure_blocks_trade = true
staff_quote_manual_markup = prohibited
fee_reversal_on_void = required

segregation_of_duties_matrix = required
self_approval = prohibited
sod_conflict_check = required

load_test_required = true
concurrency_test_required = true
dvp_sequence_test_required = true
client_money_safeguarding_test_required = true
best_execution_test_required = true

data_residency = required_before_production
pdpa_privacy_controls = required
```

---

## 30. Claude Model Usage

### 30.1 ChatGPT 5.5

Use for:

1. SRS drafting.
2. Requirements refinement.
3. Regulatory control mapping.
4. Module blueprint drafting.
5. API/database planning.
6. Claude prompt creation.

### 30.2 Claude Opus

Use for:

1. SRS review.
2. Licence-boundary review.
3. Ledger and settlement review.
4. AML/Travel Rule review.
5. Security and RBAC review.
6. Custody/client-money safeguarding review.

### 30.3 Claude Sonnet

Do not use Sonnet for coding until the relevant module blueprint is approved.

### 30.4 Claude Fable

Use later for UX copy, error messages, client-facing explanations, and onboarding text.

---

## 31. Claude Opus Review Prompt

```txt
Review this 02_Software_Requirement_Specification_v1.1.md as a principal fintech platform architect.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- The SRS is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
  - 03_Master_Module_Index_v1.2.md
- Platform must support institutional and HNWI/professional clients only in MVP.
- Retail onboarding is disabled by default.
- Platform supports OTC/RFQ, MB Spot Broking Terminal, external LP-backed agency/back-to-back execution, KYC/KYB, AML, Travel Rule enforcement, ledger, payment, settlement, audit log, maker-checker, reporting, custody/vendor/bank integration, payout destination whitelist, transaction monitoring, and governance controls.
- AIX revenue model is disclosed brokerage fee only.
- AIX spread markup, principal dealing, market making, internal matching, and client-to-client matching are blocked.
- Exchange order book, matching engine, public market depth, and public exchange trading must remain locked.

This v1.1 added third-party payout blocking, client-money safeguarding computation, concurrency/transactional integrity, best-execution/fair-pricing enforcement, segregation of duties, data residency/privacy NFR, fee reversal on voided trades, staff quote markup prohibition, additional error codes, and additional testing/go-live gates.

Review for:
1. Missing functional requirements.
2. Missing non-functional requirements.
3. Missing compliance / AML / Travel Rule requirements.
4. Missing custody and client-money safeguarding requirements.
5. Missing ledger, settlement, DvP, reconciliation, or payout-destination controls.
6. Missing vendor integration requirements.
7. Missing security, RBAC, audit, maker-checker requirements.
8. Missing state machines.
9. Missing testing and go-live gates.
10. Any requirement that may accidentally allow exchange-like or principal-dealing behaviour.
11. Any requirement that conflicts with 00, 01, or 03.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional requirements or parameters to add.
```

---

## 32. Next Document

After this SRS is reviewed and accepted, the next document should be:

```txt
04_Role_And_Permission_Matrix.md
```

Reason:

The role and permission matrix must lock who can access and approve each action before API and module blueprint design.
