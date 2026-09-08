# 03 Master Module Index  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 03_Master_Module_Index_v1.2.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 2 / Master Module Control |
| Version | v1.2 |
| Status | Accepted for SRS preparation after blueprint scope, module priority numbering, and build sequence consistency corrections |
| Prepared for | Product, compliance, architecture, development, testing, and Claude Code planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Base document 2 | 01_Project_Charter_v1.3.md |

---

## 1. Purpose of This Document

This document defines the complete module index for the AIX Money Broking Platform.

The purpose is to lock every platform module before writing the full Software Requirement Specification.

This document answers:

1. What modules exist in the platform?
2. Which modules are in MVP?
3. Which modules are locked future modules?
4. Which modules are compliance-critical?
5. Which modules are money-movement-critical?
6. Which modules must be completed before other modules?
7. Which modules require their own blueprint pack?
8. Which modules must never be partially wired into MVP because they belong to Exchange scope?
9. Which Claude model should be used for review or implementation?

---

## 2. Source Scope

This module index is based on the accepted platform scope:

```txt
00_Licence_Scope_And_Feature_Lock_v1.3.md
01_Project_Charter_v1.3.md
```

Core accepted scope:

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

---

## 3. Module Classification

Each module is classified using the following labels.

| Label | Meaning |
|---|---|
| MVP | Must be designed for MVP |
| MVP-Critical | Required before MVP can safely launch |
| Compliance-Critical | Required for AML/KYC/Travel Rule/licence control |
| Money-Critical | Required for client assets, ledger, payment, settlement, or reconciliation |
| Security-Critical | Required for security, audit, access, or production control |
| Vendor-Critical | Depends on external vendor or regulated service provider |
| Future-Locked | Must not be active or partially wired in MVP |
| Optional-Later | Not required for MVP but may be planned later |

---

## 4. Required Blueprint Pack per Module

Every active MVP module must have its own module blueprint pack.

### 4.1 Standard Blueprint Pack

Each active MVP module folder must contain:

```txt
01_Module_Blueprint.md
02_Workflow.md
03_Diagrams.md
04_API_Specification.md
05_Database_Design.md
06_State_Machine.md
07_Permission_Rules.md
08_Audit_Log_Events.md
09_Error_Handling.md
10_Test_Cases.md
11_Claude_Prompt.md
```

### 4.2 High-Risk Module Additions

For high-risk modules, add:

```txt
12_Risk_And_Control_Map.md
13_Reconciliation_Design.md
14_Go_Live_Checklist.md
```

High-risk modules include:

1. Ledger.
2. Client Balance.
3. Deposit.
4. Withdrawal.
5. Settlement.
6. Custody.
7. LP Adapter.
8. OTC/RFQ.
9. MB Spot Broking.
10. Travel Rule.
11. AML Case Management.
12. Feature Flags.
13. Maker-Checker.
14. Audit Log.
15. Transaction Monitoring.
16. Payout Destination Whitelist.
17. Professional / Accredited Status Verification.
18. Reconciliation Break Management.

### 4.3 Compliance-Critical Module Additions

Every module classified as `Compliance-Critical` must include:

```txt
15_Regulatory_Mapping.md
```

This file must map the module to:

1. Licence scope.
2. AML/KYC/Travel Rule requirement where applicable.
3. Client asset / market conduct requirement where applicable.
4. Internal policy or SOP requirement.
5. Related system rule.
6. Related audit log event.
7. Related report or evidence record.

This applies to all Compliance-Critical modules, not only the high-risk list.

### 4.4 PII / Sensitive-Data Module Additions

Every module that handles client PII, KYC/KYB data, Travel Rule data, wallet data, bank data, documents, compliance notes, or sensitive internal records must include:

```txt
16_Data_Classification.md
```

This file must define:

1. Data classification.
2. PII/sensitive fields.
3. Encryption requirement.
4. Access control requirement.
5. Read-access logging requirement.
6. Retention rule.
7. Export/download restriction.
8. Masking/redaction rule.
9. Data deletion or archival rule where legally allowed.
10. Privacy/PDPA handling note.

This applies to all PII or sensitive-data modules, not only the high-risk list.

### 4.5 Combined Requirement Rule

If a module is both Compliance-Critical and PII-sensitive, it must include both:

```txt
15_Regulatory_Mapping.md
16_Data_Classification.md
```

---

## 5. Master Module Groups

The platform is divided into 12 module groups.

| Group Code | Group Name |
|---|---|
| FND | Foundation Modules |
| IAM | Identity, Access, and Security Modules |
| CLT | Client and Onboarding Modules |
| CMP | Compliance and AML Modules |
| VND | Vendor and External Integration Modules |
| PRD | Product and Trading/Broking Modules |
| AST | Asset and Market Configuration Modules |
| MON | Money, Ledger, and Settlement Modules |
| RPT | Reporting and Records Modules |
| PRT | Portal Modules |
| OPS | Operations, Monitoring, and Governance Modules |
| FUT | Future-Locked Exchange Modules |

---

## 6. Foundation Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| FND-01 | Platform Configuration | MVP | Security-Critical | Stores environment, system constants, platform settings | Feature Flags, Audit Log |
| FND-02 | Feature Flags | MVP-Critical | Security-Critical | Backend-enforced module activation and licence lock control | RBAC, Maker-Checker, Audit Log |
| FND-03 | System Settings | MVP | Security-Critical | Controlled admin settings for platform behaviour | RBAC, Audit Log |
| FND-04 | Notification Engine | MVP | MVP | Email/SMS/in-app notifications | User, Templates, Audit Log |
| FND-05 | File and Document Management | MVP-Critical | Compliance-Critical | Secure upload, storage, review, and retention of documents | KYC/KYB, Records Retention |
| FND-06 | Error Handling Standard | MVP | Security-Critical | Common API and UI error structure | All modules |
| FND-07 | API Response Standard | MVP | Security-Critical | Common response envelope and error code format | All backend modules |
| FND-08 | Idempotency Service | MVP-Critical | Money-Critical | Prevent duplicate financial operations and duplicate postings | Ledger, Payment, Settlement |
| FND-09 | Job Queue / Background Worker | MVP | MVP | Async processing for screening, notifications, reports, reconciliation | Redis/BullMQ, Audit Log |
| FND-10 | Reference Data | MVP | MVP | Countries, currencies, ID types, document types, risk values | Onboarding, AML, Travel Rule |

---

## 7. Identity, Access, and Security Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| IAM-01 | Authentication | MVP-Critical | Security-Critical | Login, session, token handling | User Management |
| IAM-02 | MFA | MVP-Critical | Security-Critical | Multi-factor authentication for staff and selected client flows | Authentication |
| IAM-03 | User Management | MVP-Critical | Security-Critical | Staff and client user account management | RBAC, Audit Log |
| IAM-04 | Role-Based Access Control | MVP-Critical | Security-Critical | Role and permission enforcement | User Management |
| IAM-05 | Permission Guard | MVP-Critical | Security-Critical | Backend permission enforcement per API/action | RBAC |
| IAM-06 | Session Management | MVP | Security-Critical | Session expiry, device tracking, login limits | Authentication |
| IAM-07 | Security Event Log | MVP | Security-Critical | Login, failed login, password reset, MFA event logging | Audit Log |
| IAM-08 | Secret Management Interface | MVP-Critical | Security-Critical | Integration with KMS/vault for secrets | Infrastructure |
| IAM-09 | Data Encryption Layer | MVP-Critical | Security-Critical | Encryption for sensitive PII/KYC/Travel Rule data | Database, File Storage |
| IAM-10 | Rate Limiting and Abuse Protection | MVP | Security-Critical | Prevent brute force and abuse | API Gateway |

---

## 8. Client and Onboarding Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| CLT-01 | Client Registration | MVP-Critical | MVP | Client account creation | Authentication |
| CLT-02 | Client Profile | MVP-Critical | Compliance-Critical | Stores client identity, type, status, and profile data | KYC/KYB |
| CLT-03 | Client Type Scope | MVP-Critical | Compliance-Critical | Enforces institutional and HNWI/professional scope | Feature Flags, Compliance |
| CLT-04 | Retail Onboarding Lock | MVP-Critical | Compliance-Critical | Keeps retail onboarding disabled by default | Feature Flags |
| CLT-05 | Corporate KYB Onboarding | MVP-Critical | Compliance-Critical | Corporate/institutional onboarding workflow | Beneficial Ownership |
| CLT-06 | HNWI / Professional Client Onboarding | MVP-Critical | Compliance-Critical | HNWI/professional onboarding workflow | SOF/SOW |
| CLT-07 | Beneficial Ownership | MVP-Critical | Compliance-Critical | Captures ownership and control structure | KYB |
| CLT-08 | Source of Funds | MVP-Critical | Compliance-Critical | Captures source of funds evidence | KYC/KYB |
| CLT-09 | Source of Wealth | MVP-Critical | Compliance-Critical | Captures source of wealth where required | KYC/KYB |
| CLT-10 | Client Agreement and Consent | MVP-Critical | Compliance-Critical | Captures agency terms, risk disclosure, consent, e-sign | Document Management |
| CLT-11 | Client Status Engine | MVP-Critical | Compliance-Critical | Controls pending, approved, rejected, suspended, frozen status | Compliance Review |
| CLT-12 | Client Limit Profile | MVP-Critical | Compliance-Critical | Per-trade, daily, monthly, and risk-based limits | AML Risk, Product Access |
| CLT-13 | Product Access Control | MVP-Critical | Compliance-Critical | Controls which products/modules a client can access | Client Type, KYC Status |
| CLT-14 | Professional / Accredited Status Verification | MVP-Critical | Compliance-Critical | Evidences and verifies institutional, HNWI, or professional eligibility status | Client Type Scope, KYC/KYB, SOF/SOW |

---

## 9. Compliance and AML Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| CMP-01 | KYC/KYB Review | MVP-Critical | Compliance-Critical | Review and approval of client onboarding | Client Profile |
| CMP-02 | Compliance Decision Log | MVP-Critical | Compliance-Critical | Records approve/reject/request-info decisions | Audit Log |
| CMP-03 | AML Risk Scoring | MVP-Critical | Compliance-Critical | Risk-based client scoring | KYC/KYB |
| CMP-04 | Sanctions Screening | MVP-Critical | Compliance-Critical / Vendor-Critical | Screens clients and counterparties | Screening Vendor |
| CMP-05 | PEP Screening | MVP-Critical | Compliance-Critical / Vendor-Critical | PEP identification and review | Screening Vendor |
| CMP-06 | Sanctions Re-Screening | MVP-Critical | Compliance-Critical | Re-screen on list update | Screening Vendor, Job Queue |
| CMP-07 | Enhanced Due Diligence | MVP-Critical | Compliance-Critical | EDD workflow for high-risk clients | AML Risk |
| CMP-08 | Wallet Screening | MVP-Critical | Compliance-Critical / Vendor-Critical | Screens digital asset wallet addresses | Blockchain Analytics Vendor |
| CMP-09 | Deposit Wallet Screening Disposition | MVP-Critical | Compliance-Critical / Money-Critical | Approve, hold, quarantine, or reject screened deposits | Wallet Screening |
| CMP-10 | Travel Rule Enforcement | MVP-Critical | Compliance-Critical | Originator/beneficiary information capture and block rules | Client Profile, Transfers |
| CMP-11 | Counterparty VASP Due Diligence | MVP-Critical | Compliance-Critical | Maintains counterparty VASP records | Travel Rule |
| CMP-12 | Self-Hosted Wallet Handling | MVP-Critical | Compliance-Critical | Controls unhosted wallet transfer process | Travel Rule, Wallet Screening |
| CMP-13 | AML Case Management | MVP-Critical | Compliance-Critical | Investigation and escalation workflow | Transaction Monitoring, Screening |
| CMP-14 | STR / Regulatory Filing Workflow | MVP-Critical | Compliance-Critical | Internal workflow for suspicious transaction reporting | AML Case |
| CMP-15 | Threshold Transaction Reporting | MVP | Compliance-Critical | Captures threshold reporting requirements | Ledger, Transactions |
| CMP-16 | Periodic KYC/CDD Refresh | MVP | Compliance-Critical | Risk-based periodic review | Client Profile |
| CMP-17 | Account Freeze / Suspension | MVP-Critical | Compliance-Critical / Money-Critical | Blocks trading, withdrawal, or access | Client Status, Ledger |
| CMP-18 | Compliance Notes | MVP | Compliance-Critical | Internal compliance notes and evidence | Audit Log |
| CMP-19 | Approved Jurisdiction Control | MVP-Critical | Compliance-Critical | Jurisdiction allowlist and sanctioned-country block | Client Profile |
| CMP-20 | Approved Asset Whitelist Review | MVP-Critical | Compliance-Critical | Compliance approval/review step for supported assets | Asset Config |
| CMP-21 | Transaction Monitoring & Alert Engine | MVP-Critical | Compliance-Critical | Rules engine for velocity, structuring, threshold breaches, abnormal behaviour, alerts, and escalation | Ledger, Transactions, AML Case |
| CMP-22 | Complaints / Dispute Management | Optional-Later | Compliance-Critical | Market conduct complaints and dispute register | Client Portal, Support Workspace |
| CMP-23 | Data-Subject Rights / Privacy | Optional-Later | Compliance-Critical | PDPA/DSAR request handling within retention rules | Records Retention, Data Encryption |

---

## 10. Vendor and External Integration Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| VND-01 | Vendor Registry | MVP-Critical | Vendor-Critical | Stores approved vendors and status | Admin, Compliance |
| VND-02 | Vendor Due Diligence | MVP-Critical | Vendor-Critical | Due diligence, SLA, security, exit plan records | Document Management |
| VND-03 | LP Registry | MVP-Critical | Vendor-Critical | Stores approved LPs, status, limits, legal agreements | LP Adapter |
| VND-04 | LP Adapter | MVP-Critical | Vendor-Critical / Money-Critical | Connects to Binance or approved LP | Secret Management |
| VND-05 | Backup LP Readiness | Optional-Later | Vendor-Critical | Secondary LP support for concentration risk | LP Registry |
| VND-06 | Market Data Licence Control | MVP-Critical | Vendor-Critical | Records data display rights and restrictions | LP Market Data |
| VND-07 | Custodian Integration | MVP-Critical | Vendor-Critical / Money-Critical | Third-party custodian account, balance, transfer, reconciliation | Custody Provider |
| VND-08 | Bank Integration / Statement Import | MVP-Critical | Vendor-Critical / Money-Critical | Bank statement, payment status, reconciliation | Fiat Banking Partner |
| VND-09 | KYC / IDV Vendor Integration | MVP | Vendor-Critical / Compliance-Critical | ID verification or KYB support | KYC/KYB |
| VND-10 | Sanctions / PEP Vendor Integration | MVP-Critical | Vendor-Critical / Compliance-Critical | Screening integration | Screening |
| VND-11 | Blockchain Analytics Integration | MVP-Critical | Vendor-Critical / Compliance-Critical | Wallet risk, tainted funds, mixer exposure | Wallet Screening |
| VND-12 | On-Chain Node / Data Provider | MVP-Critical | Vendor-Critical / Money-Critical | Blockchain deposit monitoring | Wallet Infra |
| VND-13 | Notification Vendor Integration | MVP | Vendor-Critical | Email/SMS/OTP notification service | Notification Engine |
| VND-14 | Cloud / Infrastructure Provider Control | MVP-Critical | Vendor-Critical / Security-Critical | Hosting, outsourcing, data residency control | Infrastructure |

---

## 11. Asset and Market Configuration Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| AST-01 | Asset Master | MVP-Critical | Compliance-Critical | Defines supported assets and metadata | Approved Asset Whitelist |
| AST-02 | Approved Asset Whitelist | MVP-Critical | Compliance-Critical | Enforces only approved assets | Compliance Review |
| AST-03 | Asset Admissibility Review | MVP-Critical | Compliance-Critical | Screens assets against prohibited categories | Compliance |
| AST-04 | Asset Precision and Rounding Policy | MVP-Critical | Money-Critical | Defines decimal precision and rounding | Ledger, Pricing |
| AST-05 | Fiat Currency Scope | MVP-Critical | Compliance-Critical / Money-Critical | Defines approved fiat currencies | Banking |
| AST-06 | Trading / Broking Pair Configuration | MVP-Critical | Compliance-Critical | Defines approved pairs | Asset Master |
| AST-07 | MYR Pair Lock | MVP-Critical | Compliance-Critical | Blocks MYR trading pair unless approved | Feature Flags |
| AST-08 | Privacy Coin Lock | MVP-Critical | Compliance-Critical | Blocks privacy coin support | Asset Whitelist |
| AST-09 | Algorithmic Stablecoin Lock | MVP-Critical | Compliance-Critical | Blocks algorithmic stablecoin support | Asset Whitelist |
| AST-10 | Securities Token Lock | MVP-Critical | Compliance-Critical | Blocks securities token support unless approved | Asset Whitelist |

### 11.1 Asset Whitelist Ownership Rule

The asset whitelist control is split as follows:

```txt
CMP-20 = Compliance review and approval of asset admissibility.
AST-02 / AST-03 = System enforcement and configuration store.
```

Rules:

1. Compliance owns the asset approval decision.
2. Asset configuration owns technical enforcement.
3. No asset or pair can be enabled unless CMP review is approved and AST enforcement is configured.
4. Privacy coins, algorithmic stablecoins, securities tokens, and MYR pairs remain blocked unless separately approved.

---

## 12. Product and Broking Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| PRD-01 | Fee Engine | MVP-Critical | Money-Critical | Disclosed brokerage fee calculation | Product Config, Ledger |
| PRD-02 | AIX Spread Markup Lock | MVP-Critical | Compliance-Critical | Blocks AIX spread markup | Feature Flags, Pricing |
| PRD-03 | Pricing Engine | MVP-Critical | Money-Critical | Quote construction from LP price + disclosed fee | LP Adapter |
| PRD-04 | Best Execution / Fair Pricing Evidence | MVP-Critical | Compliance-Critical | Stores LP snapshot, price source, quote, execution evidence | Pricing, LP |
| PRD-05 | External LP Market Depth | MVP | Compliance-Critical | Non-executable indicative LP depth display | Market Data Licence |
| PRD-06 | LP Indicative Snapshot Control | MVP-Critical | Compliance-Critical | Prevents continuous executable order-book behaviour | LP Market Data |
| PRD-07 | OTC/RFQ | MVP-Critical | Compliance-Critical / Money-Critical | Agency RFQ request, quote, acceptance, trade booking | Pricing, LP, Compliance, Pre-Funded Hold |
| PRD-08 | MB Spot Broking Terminal | MVP-Critical | Compliance-Critical / Money-Critical | Client quote-and-confirm spot broking interface | Pricing, LP, Client Eligibility, Pre-Funded Hold |
| PRD-09 | Quote Lifecycle | MVP-Critical | Money-Critical | Requested, quoted, expired, accepted, rejected, re-quoted | Pricing |
| PRD-10 | Quote Expiry Engine | MVP-Critical | Money-Critical | Server UTC expiry enforcement | Pricing |
| PRD-11 | LP Partial Fill / Slippage Handling | MVP-Critical | Money-Critical | Void or re-quote; no AIX absorption | LP Adapter, Settlement |
| PRD-12 | Price Alert | Optional-Later | MVP | Alert-only non-resting price notification | Notification |
| PRD-13 | Trade Booking | MVP-Critical | Money-Critical | Creates brokered trade record | Quote Lifecycle, Pre-Funded Hold, Ledger |
| PRD-14 | Trade Confirmation | MVP-Critical | Compliance-Critical | Client confirmation and audit evidence | Trade Booking |
| PRD-15 | Product Access Gate | MVP-Critical | Compliance-Critical | Blocks access if client/product not eligible | Client Status, Asset Whitelist |

---

## 13. Money, Ledger, and Settlement Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| MON-01 | Chart of Accounts | MVP-Critical | Money-Critical | Ledger account structure | Ledger |
| MON-02 | Double-Entry Ledger | MVP-Critical | Money-Critical | Immutable debit/credit financial posting | Idempotency |
| MON-03 | Ledger Posting Engine | MVP-Critical | Money-Critical | Controlled posting logic | Chart of Accounts |
| MON-04 | Ledger Reversal | MVP-Critical | Money-Critical | Reversal without deletion | Ledger |
| MON-05 | Trial Balance Invariant | MVP-Critical | Money-Critical | Ensures total debit equals total credit | Ledger |
| MON-06 | Client Balance | MVP-Critical | Money-Critical | Available, pending, held, frozen balances; prohibits negative balances and over-holds | Ledger |
| MON-07 | Suspense / Clearing Accounts | MVP-Critical | Money-Critical | Handles pending and exception flows | Ledger |
| MON-08 | Deposit Workflow | MVP-Critical | Money-Critical | Fiat or digital asset deposit lifecycle | Bank/Custodian |
| MON-09 | Digital Asset Deposit Monitoring | MVP-Critical | Money-Critical / Vendor-Critical | On-chain confirmation monitoring | Node Provider, Wallet Screening |
| MON-10 | On-Chain Confirmation Threshold | MVP-Critical | Money-Critical | Defines confirmation requirement before credit | Blockchain Infra |
| MON-11 | Withdrawal Workflow | MVP-Critical | Money-Critical / Compliance-Critical | Withdrawal request, review, approval, release | Travel Rule, Wallet Screening, Payout Destination Whitelist |
| MON-12 | Payment Instruction | MVP-Critical | Money-Critical | Payment creation and approval | Bank Integration |
| MON-13 | Settlement Engine | MVP-Critical | Money-Critical | Trade settlement lifecycle | Ledger, Custodian, Bank |
| MON-14 | Settlement Sequencing / DvP | MVP-Critical | Money-Critical | Prevents AIX exposure by controlling sequence | Custody, Bank, LP |
| MON-15 | Pre-Funded Hold | MVP-Critical | Money-Critical | Locks client funds/assets before execution | Client Balance |
| MON-16 | FX / Conversion Policy | MVP-Critical | Money-Critical | Rate source, timestamp, rounding, re-quote/void rule | Pricing, Ledger |
| MON-17 | Reconciliation Engine | MVP-Critical | Money-Critical | Ledger vs bank/custodian/LP reconciliation | Ledger |
| MON-18 | Daily Client Money Reconciliation | MVP-Critical | Money-Critical | Daily safeguarding reconciliation | Bank |
| MON-19 | LP Three-Way Reconciliation | MVP-Critical | Money-Critical | LP execution vs trade vs ledger | LP Adapter, Ledger |
| MON-20 | Custodian Reconciliation | MVP-Critical | Money-Critical / Vendor-Critical | Custodian records vs platform ledger | Custodian |
| MON-21 | Bank Reconciliation | MVP-Critical | Money-Critical / Vendor-Critical | Bank statement vs platform ledger | Bank |
| MON-22 | Statement Generation | MVP | Money-Critical | Client statements and ledger extracts | Ledger |
| MON-23 | Client Money Safeguarding Account Control | MVP-Critical | Money-Critical | Bank-level segregation control | Bank |
| MON-24 | Custody Account Structure | MVP-Critical | Money-Critical | Custody account/sub-account model | Custodian |
| MON-25 | Settlement Exception Management | MVP-Critical | Money-Critical | Failed, partial, disputed, reversed settlement cases | Settlement |
| MON-26 | Payout Destination Whitelist | MVP-Critical | Money-Critical / Compliance-Critical | Verified bank accounts and whitelisted wallet addresses with cooling-off and maker-checker | Client Profile, Wallet Screening, Travel Rule, Bank Integration |
| MON-27 | Reconciliation Break / Exception Management | MVP-Critical | Money-Critical | Handles ledger vs bank/custodian/LP breaks with escalation and audit trail | Reconciliation Engine, Audit Log |

---

## 14. Reporting and Records Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| RPT-01 | Reporting Engine | MVP | MVP | Common reporting infrastructure | Database |
| RPT-02 | Client Statement Report | MVP | Money-Critical | Client account/trade/settlement statement | Ledger |
| RPT-03 | Trade Report | MVP | Compliance-Critical | Trade history and execution evidence | Trade Booking |
| RPT-04 | Ledger Report | MVP-Critical | Money-Critical | Ledger transaction and balance reports | Ledger |
| RPT-05 | Reconciliation Report | MVP-Critical | Money-Critical | Bank/custodian/LP reconciliation report | Reconciliation |
| RPT-06 | Compliance Report | MVP-Critical | Compliance-Critical | KYC, AML, risk, freeze, screening reports | Compliance |
| RPT-07 | Travel Rule Report | MVP-Critical | Compliance-Critical | Transfer data and exceptions | Travel Rule |
| RPT-08 | Regulatory Reporting | MVP-Critical | Compliance-Critical | LFSA / regulatory reporting support | Compliance, Ledger |
| RPT-09 | STR / Filing Record | MVP-Critical | Compliance-Critical | Filing evidence and status tracking | AML Case |
| RPT-10 | Management Report | MVP | MVP | Management dashboard and exports | Reporting Engine |
| RPT-11 | Audit Report | MVP-Critical | Security-Critical | Audit log search/export | Audit Log |
| RPT-12 | Records Retention / Archival | MVP-Critical | Compliance-Critical | Retention, archival, retrieval, deletion control | Document Management |
| RPT-13 | Requirements-Licence-Module Traceability Matrix | MVP-Critical | Compliance-Critical | Maps requirements to licence scope and modules | SRS, Module Index |

---

## 15. Portal Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| PRT-01 | Client Portal | MVP-Critical | MVP | Client-facing onboarding, broking, deposits, reports | Auth, RBAC |
| PRT-02 | Staff Portal | MVP-Critical | MVP | Operations, compliance, finance workspace | Auth, RBAC |
| PRT-03 | Admin Portal | MVP-Critical | Security-Critical | Admin settings, users, roles, feature flags | RBAC, Maker-Checker |
| PRT-04 | Compliance Workspace | MVP-Critical | Compliance-Critical | Compliance review and case management UI | Compliance Modules |
| PRT-05 | Operations Workspace | MVP-Critical | Money-Critical | Trade, settlement, exceptions UI | Product, Settlement |
| PRT-06 | Finance Workspace | MVP-Critical | Money-Critical | Ledger and reconciliation UI | Ledger, Reconciliation |
| PRT-07 | Support Workspace | MVP | MVP | Ticket and client status view | Client Profile |
| PRT-08 | Management Dashboard | MVP | MVP | Executive and operational metrics | Reporting |
| PRT-09 | Design System | MVP | MVP | UI component standards and accessibility | All portals |
| PRT-10 | UX Copy and Error Message Library | MVP | MVP | Standardised wording and safe terminology | Fable review |

---

## 16. Operations, Monitoring, and Governance Modules

| ID | Module | Status | Classification | Purpose | Key Dependencies |
|---|---|---|---|---|---|
| OPS-01 | Audit Log | MVP-Critical | Security-Critical | Immutable sensitive-action logging | All modules |
| OPS-02 | Audit Hash-Chain / Tamper Evidence | MVP-Critical | Security-Critical | Tamper-evident audit design | Audit Log |
| OPS-03 | Audit Read Access Logging | MVP-Critical | Security-Critical | Logs read access to PII/KYC/Travel Rule data | Audit Log |
| OPS-04 | Maker-Checker | MVP-Critical | Security-Critical | Approval workflow for sensitive actions | RBAC, Audit |
| OPS-05 | Production Change Control | MVP-Critical | Security-Critical | Maker-checker for deployment and high-risk config | CI/CD |
| OPS-06 | Incident Log | MVP | Security-Critical | Incident records and follow-up | Monitoring |
| OPS-07 | BCP / DR | MVP-Critical | Security-Critical | Backup, recovery, continuity | Infrastructure |
| OPS-08 | System Health Monitoring | MVP | Security-Critical | System status, uptime, alerts | Infrastructure |
| OPS-09 | Security Monitoring | MVP | Security-Critical | Security alerts, suspicious activity | Logs |
| OPS-10 | CI/CD Pipeline | MVP-Critical | Security-Critical | Build, test, scan, deploy | GitHub Actions |
| OPS-11 | Test Coverage Control | MVP-Critical | Security-Critical | 80% minimum core business logic target | Testing Strategy |
| OPS-12 | Pen Test Management | MVP-Critical | Security-Critical | Pen test finding and remediation tracker | Security Lead |
| OPS-13 | AI / Claude Governance | MVP-Critical | Security-Critical | No PII/secrets in prompts, human review rules | Development Process |
| OPS-14 | RACI / Governance Control | MVP-Critical | MVP | Sponsor, MLRO, technical, ops, finance accountability | Project Charter |
| OPS-15 | Charter Change Control | MVP-Critical | MVP | Controlled changes to scope, execution, custody, licence locks | Governance |
| OPS-16 | Vendor Governance | MVP-Critical | Vendor-Critical | Due diligence, SLA, exit plan, outsourcing review | Vendor Registry |

---

## 17. Future-Locked Exchange Modules

These modules must not be active or partially wired into MVP live paths.

| ID | Module | Status | Classification | Reason Locked |
|---|---|---|---|---|
| FUT-01 | AIX Public Order Book | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-02 | AIX Matching Engine | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-03 | AIX Public Market Depth | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-04 | Public Exchange Trading | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-05 | Client-to-Client Matching | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-06 | Public Market API | Future-Locked | Exchange Scope | Exchange application pending |
| FUT-07 | Market Maker Engine | Future-Locked | Prohibited MVP | Not MB scope |
| FUT-08 | Maker/Taker Fee Engine | Future-Locked | Exchange Scope | Exchange order-book behaviour |
| FUT-09 | Resting Limit Orders | Future-Locked | Exchange Scope | Exchange order-book behaviour |
| FUT-10 | Stop-Limit Orders | Future-Locked | Exchange Scope | Exchange order-book behaviour |
| FUT-11 | GTC / Post-Only / IOC / FOK Orders | Future-Locked | Exchange Scope | Exchange order-book behaviour |
| FUT-12 | Market Surveillance for Public Exchange | Future-Locked | Future Exchange | Required only if Exchange approved |

Rules:

1. Future-locked modules may be documented as future scope only.
2. Future-locked modules must not be connected to MVP runtime.
3. Future-locked modules must not share execution path with MB Spot Broking.
4. Future-locked modules must not be visible to clients.
5. Future-locked modules must not be enabled by normal admin users.
6. Future-locked modules require licence approval, management approval, compliance review, and documentation update before activation.

---

## 18. Recommended Build Sequence

The build sequence must not start with the trading screen.

### Phase A — Documentation and Architecture

| Sequence | Module / Document |
|---:|---|
| A1 | 00 Licence Scope and Feature Lock |
| A2 | 01 Project Charter |
| A3 | 03 Master Module Index |
| A4 | 02 Software Requirement Specification |
| A5 | 04 Role and Permission Matrix |
| A6 | 05 Master Workflow Map |
| A7 | 06 Master System Rules |
| A8 | 07 Master Data Flow |
| A9 | 08 Master Technical Architecture |
| A10 | 09 Master Security Architecture |
| A11 | 10 Master Testing Strategy |
| A12 | 11 Master Deployment Strategy |

### Phase B — Foundation and Security

| Sequence | Module |
|---:|---|
| B1 | Platform Configuration |
| B2 | Feature Flags |
| B3 | User Management |
| B4 | Authentication |
| B5 | MFA |
| B6 | RBAC |
| B7 | Permission Guard |
| B8 | Audit Log |
| B9 | Maker-Checker |
| B10 | File and Document Management |
| B11 | Notification Engine |

### Phase C — Client and Compliance

| Sequence | Module |
|---:|---|
| C1 | Client Registration |
| C2 | Client Profile |
| C3 | Client Type Scope |
| C4 | Retail Onboarding Lock |
| C5 | Corporate KYB Onboarding |
| C6 | HNWI / Professional Onboarding |
| C7 | Professional / Accredited Status Verification |
| C8 | Beneficial Ownership |
| C9 | Source of Funds / Source of Wealth |
| C10 | Client Agreement and Consent |
| C11 | KYC/KYB Review |
| C12 | AML Risk Scoring |
| C13 | Sanctions / PEP Screening |
| C14 | Sanctions Re-Screening |
| C15 | Enhanced Due Diligence |
| C16 | Approved Jurisdiction Control |
| C17 | Wallet Screening |
| C18 | Deposit Wallet Screening Disposition |
| C19 | Travel Rule Enforcement |
| C20 | Counterparty VASP Due Diligence |
| C21 | Self-Hosted Wallet Handling |
| C22 | Transaction Monitoring & Alert Engine |
| C23 | AML Case Management |
| C24 | STR / Regulatory Filing Workflow |
| C25 | Threshold Transaction Reporting |
| C26 | Periodic KYC/CDD Refresh |
| C27 | Account Freeze / Suspension |
| C28 | Approved Asset Whitelist Review |
| C29 | Compliance Notes |

### Phase D — Vendor, Custody, Bank, and LP Integrations

| Sequence | Module |
|---:|---|
| D1 | Vendor Registry |
| D2 | Vendor Due Diligence |
| D3 | Crypto Custody Provider Architecture |
| D4 | Custodian Integration |
| D5 | Fiat Banking / Client Money Safeguarding |
| D6 | Bank Integration / Statement Import |
| D7 | On-Chain Node / Data Provider |
| D8 | Blockchain Analytics Integration |
| D9 | LP Registry |
| D10 | LP Adapter |
| D11 | Market Data Licence Control |
| D12 | Backup LP Readiness / Concentration Control |

### Phase E — Money, Ledger, Settlement, and Product

| Sequence | Module |
|---:|---|
| E1 | Chart of Accounts |
| E2 | Double-Entry Ledger |
| E3 | Client Balance |
| E4 | Suspense / Clearing Accounts |
| E5 | Ledger Reversal |
| E6 | Payout Destination Whitelist |
| E7 | Deposit Workflow |
| E8 | Withdrawal Workflow |
| E9 | Settlement Sequencing / DvP |
| E10 | Settlement Engine |
| E11 | Reconciliation |
| E12 | Reconciliation Break / Exception Management |
| E13 | Client Statement |
| E14 | Asset Master |
| E15 | Approved Asset Whitelist |
| E16 | Pair Configuration |
| E17 | Fee Engine |
| E18 | Pricing Engine |
| E19 | Best Execution Evidence |
| E20 | OTC/RFQ |
| E21 | MB Spot Broking Terminal |

### Phase F — Reporting, Testing, Deployment

| Sequence | Module |
|---:|---|
| F1 | Reporting Engine |
| F2 | Compliance Reports |
| F3 | Ledger Reports |
| F4 | Regulatory Reporting |
| F5 | Records Retention |
| F6 | System Health Monitoring |
| F7 | Incident Log |
| F8 | BCP / DR |
| F9 | CI/CD Pipeline |
| F10 | Pen Test Management |
| F11 | Production Change Control |

---

## 19. Module Dependency Rules

The following dependency rules are mandatory.

### 19.1 Feature Flag Dependency

No module can be activated unless:

1. Backend feature flag exists.
2. Feature flag default state is defined.
3. Permission guard exists.
4. Audit log event exists.
5. Maker-checker is configured where required.

### 19.2 Compliance Dependency

No client can access transaction modules unless:

1. Client type is allowed.
2. KYC/KYB is approved.
3. AML risk profile exists.
4. Sanctions/PEP status is acceptable.
5. Account is not rejected, suspended, or frozen.
6. Product access is allowed.
7. Asset/pair is approved.
8. Professional / accredited status is verified where applicable.
9. Transaction monitoring rules are active.

### 19.3 Money Movement Dependency

No deposit, withdrawal, settlement, or trade balance movement can be finalised unless:

1. Double-entry ledger exists.
2. Idempotency exists.
3. Audit log exists.
4. Client balance service exists.
5. Reconciliation path exists.
6. Custody/bank confirmation path exists.
7. Settlement sequencing / DvP rule exists.
8. Exception and reversal workflow exists.
9. Pre-funded hold exists before LP execution.
10. Available balance cannot go negative.
11. Holds cannot exceed available balance.
12. Verified payout destination exists for withdrawals.
13. Reconciliation break workflow exists.

### 19.4 LP Execution Dependency

No LP-backed quote or execution can be active unless:

1. LP is approved.
2. LP legal agreement exists.
3. LP market-data licence position is confirmed.
4. LP API credentials are stored in KMS/vault.
5. LP outage fails closed.
6. LP partial fill/slippage rule exists.
7. Best execution evidence is stored.
8. Three-way reconciliation exists.
9. Client pre-funding is held before LP execution fires.
10. Available balance cannot go negative.
11. LP execution cannot proceed if pre-funded hold fails.

### 19.5 Exchange Lock Dependency

No future exchange module can be active unless:

1. Exchange approval is granted.
2. Licence Scope document is updated.
3. Project Charter is updated.
4. SRS is updated.
5. Feature flags are changed through approval.
6. Compliance signs off.
7. Management signs off.
8. Deployment approval is completed.

---

## 20. Module Blueprint Priority List

The first module blueprint packs to prepare should be:

```txt
01_feature_flags
02_audit_log
03_maker_checker
04_authentication_rbac
05_client_onboarding
06_kyc_kyb_compliance_review
07_client_status_and_product_access
08_professional_accredited_status_verification
09_transaction_monitoring_alert_engine
10_travel_rule_enforcement
11_payout_destination_whitelist
12_double_entry_ledger
13_client_balance
14_custody_and_client_money_safeguarding
15_settlement_sequencing_dvp
16_deposit_withdrawal
17_reconciliation
18_reconciliation_break_management
19_lp_adapter
20_pricing_quote_engine
21_otc_rfq
22_mb_spot_broking_terminal
```

Reason:

These modules create the control spine of the platform. The trading terminal must come after compliance, ledger, custody, settlement, and LP controls.

---

## 21. Recommended Folder Structure

```txt
aix-platform-docs/
  00_Licence_Scope_And_Feature_Lock_v1.3.md
  01_Project_Charter_v1.3.md
  02_Software_Requirement_Specification.md
  03_Master_Module_Index_v1.2.md
  04_Role_And_Permission_Matrix.md
  05_Master_Workflow_Map.md
  06_Master_System_Rules.md
  07_Master_Data_Flow.md
  08_Master_Technical_Architecture.md
  09_Master_Security_Architecture.md
  10_Master_Testing_Strategy.md
  11_Master_Deployment_Strategy.md

  modules/
    01_foundation/
    02_identity_access_security/
    03_client_onboarding/
    04_compliance_aml/
    05_vendor_integrations/
    06_assets_market_config/
    07_product_broking/
    08_money_ledger_settlement/
    09_reporting_records/
    10_portals/
    11_operations_governance/
    12_future_locked_exchange/
```

Each module folder must follow the blueprint pack format stated in Section 4.

---

## 22. Additional Module Parameters

```txt
transaction_monitoring_engine = required
transaction_monitoring_rules = velocity_structuring_threshold_pattern
transaction_alert_to_case_link = required

withdrawal_destination_whitelist_required = true
withdrawal_destination_types = bank_account_and_crypto_wallet
withdrawal_new_destination_cooling_off = required
withdrawal_destination_maker_checker = required

professional_status_verification_required = true
retail_onboarding_lock_dependency = professional_status_verification

pre_funding_required_before_lp_execution = true
client_negative_balance = prohibited
hold_amount_cannot_exceed_available_balance = true
lp_execution_requires_prefunded_hold = true

vendor_integration_precedes_money_movement = true
custodian_bank_lp_integration_before_deposit_settlement = true

reconciliation_break_management = required
reconciliation_break_escalation = required
reconciliation_break_audit_trail = required

asset_whitelist_owner = AST_enforce_CMP_review
per_module_regulatory_mapping = required_for_all_compliance_critical_modules
per_module_data_classification = required_for_all_pii_sensitive_modules

complaints_dispute_management_module = optional_later
data_subject_rights_privacy_module = optional_later
```

---

## 23. Claude Model Usage

### 23.1 ChatGPT 5.5

Use for:

1. Master module design.
2. SDLC documentation.
3. Module blueprint drafting.
4. Workflow and state-machine planning.
5. Database/API planning.
6. Security and compliance mapping.
7. Claude prompt creation.

### 23.2 Claude Opus

Use for:

1. Review of this Master Module Index.
2. Review of high-risk modules.
3. Licence boundary review.
4. Ledger/custody/settlement review.
5. AML/Travel Rule review.
6. Security/RBAC/audit review.

### 23.3 Claude Sonnet

Use later for:

1. Coding module skeletons.
2. Backend implementation.
3. Frontend implementation.
4. Test implementation.
5. Refactoring.

Do not use Sonnet yet for coding until module blueprints are approved.

### 23.4 Claude Fable

Use later for:

1. UX wording.
2. Error messages.
3. Client-facing explanations.
4. Empty states.
5. Onboarding guidance.

---

## 24. Claude Opus Review Prompt

```txt
Review this 03_Master_Module_Index_v1.2.md as a principal fintech platform architect.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This module index is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
- Platform must support OTC/RFQ, MB Spot Broking Terminal, external LP-backed agency/back-to-back execution, onboarding, KYC/KYB, AML, Travel Rule enforcement, ledger, payment, settlement, audit log, maker-checker, reporting, admin/staff/client portals, custody/vendor/bank integration, and governance controls.
- AIX revenue model is disclosed brokerage fee only.
- AIX spread markup, principal dealing, market making, internal matching, and client-to-client matching are blocked.
- Exchange order book, matching engine, public market depth, and public exchange trading must remain locked.
- MVP client scope is institutional and HNWI/professional only. Retail onboarding is disabled by default.

Review for:
1. Missing modules.
2. Modules that should be merged or split.
3. Wrong module sequencing.
4. Missing dependencies.
5. Missing licence boundary controls.
6. Missing money-movement controls.
7. Missing custody/client-money safeguarding controls.
8. Missing AML/Travel Rule controls.
9. Missing audit/RBAC/security controls.
10. Any module that may accidentally allow exchange-like or principal-dealing behaviour.
11. Any Future-Locked Exchange module that should not be documented or wired yet.
12. Whether the blueprint pack structure is sufficient.

Do not write code.

This v1.2 includes the v1.1 fixes, corrects the Module Blueprint Priority List numbering, makes Regulatory Mapping mandatory for all Compliance-Critical modules, makes Data Classification mandatory for all PII/sensitive-data modules, and reconciles Phase C build sequencing with CLT-14, CMP-21, and the other MVP-Critical compliance modules.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional modules or parameters to add.
```

---

## 25. Next Document

After this Master Module Index is reviewed and accepted, the next document should be:

```txt
02_Software_Requirement_Specification.md
```

Reason:

The SRS can now be written using a controlled module catalogue and dependency structure.
