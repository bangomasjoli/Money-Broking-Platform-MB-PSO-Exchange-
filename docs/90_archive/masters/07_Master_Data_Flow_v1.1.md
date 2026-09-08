# 07 Master Data Flow  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 07_Master_Data_Flow_v1.1.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 2 / Master Data Flow and Data-Control Map |
| Version | v1.1 |
| Status | Revised after Claude Opus data-flow review; authentication/session/MFA, backup/DR, STR filing, logging/PII scrubbing, notification/OTP, complete store inventory, and data-flow-to-rule mapping added |
| Prepared for | Product, compliance, architecture, security, development, QA, operations, finance, and implementation planning |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Base document 2 | 01_Project_Charter_v1.3.md |
| Base document 3 | 03_Master_Module_Index_v1.2.md |
| Base document 4 | 02_Software_Requirement_Specification_v1.2.md |
| Base document 5 | 04_Role_And_Permission_Matrix_v1.2.md |
| Base document 6 | 05_Master_Workflow_Map_v1.2.md |
| Base document 7 | 06_Master_System_Rules_v1.2.md |

---

## 1. Purpose

This document defines the master data flow for the AIX Money Broking Platform.

The purpose is to map how data moves across portals, backend services, databases, vendors, custody, bank, LP, compliance tools, reporting, audit, and future-locked modules.

This document answers:

1. What data enters the platform?
2. Where is the data stored?
3. Which service processes the data?
4. Which external vendor receives or returns data?
5. Which data flows are sensitive or regulated?
6. Which data flows require encryption, masking, read-access logging, or audit?
7. Which flows trigger ledger, balance, settlement, reconciliation, or safeguarding records?
8. Which flows must fail closed?
9. Which flows must never occur because they breach licence scope?
10. Which flows must be refined in module blueprints?

---

## 2. Scope Baseline

The data flow is based on the accepted platform boundary:

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

## 3. Data Flow Principles

### 3.1 Data Minimisation

Only data required for onboarding, compliance, broking, payment, settlement, reporting, audit, and legal retention may be collected or processed.

### 3.2 Backend-Controlled Data Movement

Frontend does not decide whether sensitive data can move.

Backend services must enforce:

1. Role and permission.
2. Feature flag.
3. Client status.
4. Workflow state.
5. Licence boundary.
6. Data classification.
7. Encryption requirement.
8. Audit requirement.
9. Vendor approval status.
10. Data residency rule.

### 3.3 Sensitive Data Protection

Sensitive data must be encrypted, access-controlled, and logged when read.

Sensitive data includes:

1. PII.
2. KYC/KYB documents.
3. Beneficial ownership.
4. Source of funds.
5. Source of wealth.
6. Professional/accredited status evidence.
7. Bank account data.
8. Wallet ownership evidence.
9. Travel Rule data.
10. AML/STR records.
11. Wallet screening results.
12. Client-money safeguarding records.
13. Ledger and balance records.
14. Audit log exports.
15. Vendor due diligence and security records.

### 3.4 Fail-Closed Vendor Flow

If external vendor data cannot be obtained, verified, parsed, authenticated, or reconciled, the related workflow must fail closed or move to controlled exception state.

### 3.5 No Unapproved External Disclosure

No client PII, KYC, KYB, Travel Rule, AML, wallet, bank, ledger, or transaction data may be sent to:

1. Unapproved vendors.
2. AI prompts.
3. Public logs.
4. Email attachments without approval.
5. Client-visible pages for other clients.
6. Future-locked Exchange modules.
7. Unapproved analytics tools.

---

## 4. Data Classification Model

| Classification | Examples | Controls |
|---|---|---|
| Public | Public website text, generic FAQ | Integrity control |
| Internal | Internal configuration, non-sensitive settings | RBAC |
| Confidential | Client profile, vendor records, support tickets | RBAC, audit where sensitive |
| Restricted | KYC/KYB, BO, SOF/SOW, bank, wallet, Travel Rule | Encryption, masking, read-access logging |
| Highly Restricted | STR, AML case, sanctions true match, audit exports, secrets | Strict RBAC, encryption, read-access logging, export approval |
| Financial Critical | Ledger, balance, settlement, safeguarding, reconciliation | Immutable records, idempotency, reconciliation, audit |
| Security Critical | Secrets, MFA reset, roles, permissions, break-glass | KMS/vault, maker-checker, audit, SoD |

Every module handling Restricted, Highly Restricted, Financial Critical, or Security Critical data must have `16_Data_Classification.md`.

---

## 5. Primary Systems and Data Stores

### 5.1 Internal Systems

| System | Purpose | Data Handled |
|---|---|---|
| Client Portal | Client onboarding, trading, deposits, withdrawals, statements | Client profile, documents, quotes, withdrawals |
| Staff Portal | Operations, compliance, finance, support | Workflow data, cases, approvals |
| Admin Portal | Admin settings, users, roles, feature flags | IAM, config, vendor, asset data |
| API Gateway | Authentication, validation, routing, rate limits | API requests and responses |
| Auth Service | Login, MFA, session | Credentials, MFA, sessions |
| RBAC / Permission Service | Permission checks | Roles, permissions, policies |
| Workflow Engine | State transitions | Workflow states and approvals |
| Compliance Engine | KYC/KYB, AML, Travel Rule, transaction monitoring | Compliance records |
| Product / Quote Engine | OTC/RFQ, spot quote, fee and pricing | Quote, LP price, fee |
| LP Adapter | LP price, execution, status | LP market data, execution reference |
| Ledger Service | Double-entry ledger | Ledger entries, balances, holds |
| Payment / Settlement Service | Deposit, withdrawal, settlement, LP payment | Payment instructions, settlement states |
| Reconciliation Service | Bank/custodian/LP/ledger reconciliation | Statements, breaks |
| Reporting Service | Reports and exports | Report datasets |
| Audit Service | Append-only audit logs | Audit events |
| Notification Service | Email/SMS/in-app notification | Notification metadata |
| File Service | Secure document storage | Documents and evidence |
| Security Monitoring | Security and incident logs | Security events |
| Job Queue / Worker | Async screening, reports, reconciliation | Job payloads |

### 5.2 External Systems

| External System | Purpose | Data Shared |
|---|---|---|
| KYC / IDV Vendor | Identity/company verification | Client identity, documents |
| Sanctions / PEP Vendor | Screening | Names, identifiers, entities |
| Blockchain Analytics Vendor | Wallet screening | Wallet address, transaction hash |
| On-Chain Node / Data Provider | Blockchain confirmation and transaction monitoring | Transaction hash, block height, confirmation count |
| Counterparty VASP Registry / Data Source | Travel Rule support | VASP information |
| LP / Binance or Approved LP | Price, execution, settlement status | Asset pair, quote request, execution data |
| Approved FX / Rate Source | FX or conversion rate reference | Rate, timestamp, currency pair, source reference |
| Third-Party Custodian | Digital asset custody, balances, transfers | Custody account, asset movement |
| Bank / Statement Source | Fiat receipt, payment status, safeguarding | Bank statement, payment instruction |
| Cloud Provider | Hosting | Encrypted data and infrastructure logs |
| Notification Vendor | Email/SMS/OTP | Contact details, message metadata |
| Pen Test / Security Vendor | Security testing | Test scope and non-production data only |

---

## 6. Master Data Flow Diagram

```mermaid
flowchart LR
  Client[Client Portal] --> API[API Gateway]
  Staff[Staff/Admin Portals] --> API

  API --> Auth[Auth + MFA]
  API --> RBAC[RBAC + Permission Guard]
  API --> WF[Workflow Engine]

  WF --> CMP[Compliance Engine]
  WF --> PRD[Product + Quote Engine]
  WF --> MON[Money + Ledger + Settlement]
  WF --> RPT[Reporting Engine]
  WF --> AUD[Audit Service]

  CMP --> KYC[KYC/IDV Vendor]
  CMP --> SAN[Sanctions/PEP Vendor]
  CMP --> WAL[Blockchain Analytics]
  CMP --> TR[Travel Rule / VASP Data]

  PRD --> LP[Approved LP / Binance]
  MON --> CUS[Third-Party Custodian]
  MON --> BANK[Bank / Statement Source]
  MON --> REC[Reconciliation Engine]
  REC --> AUD

  RPT --> Archive[Records Retention / Archive]
  AUD --> Archive

  API --> File[Secure File Store]
  File --> Archive

  subgraph Locked[Future-Locked Exchange Scope]
    OB[AIX Public Order Book]
    ME[AIX Matching Engine]
    EX[Public Exchange Trading]
  end

  API -. blocked .-> Locked
```

---

## 7. Master Data Domains

| Domain | Data Examples | Primary Owner | Classification |
|---|---|---|---|
| IAM | Users, sessions, MFA, roles | Security/Admin | Security Critical |
| Client | Client profile, contact, status | Compliance/Ops | Confidential / Restricted |
| KYC/KYB | Documents, BO, SOF/SOW | Compliance | Restricted |
| AML | Risk score, alerts, cases, STR | Compliance/MLRO | Highly Restricted |
| Travel Rule | Originator/beneficiary data | Compliance | Restricted / Highly Restricted |
| Wallet Screening | Wallet risk, disposition | Compliance | Restricted |
| Product | Product access, asset/pair config | Product/Compliance | Internal / Confidential |
| Quote/Trade | Quotes, fees, LP evidence, confirmations | Ops | Financial Critical |
| Ledger/Balance | Ledger, balance, holds, reversals | Finance | Financial Critical |
| Payment/Settlement | Deposits, withdrawals, LP payment | Ops/Finance | Financial Critical |
| Reconciliation | Bank/custodian/LP matching, breaks | Finance | Financial Critical |
| Safeguarding | Liability/resources computation | Finance/Compliance | Financial Critical |
| Vendor | Vendor DD, contracts, SLA, exit plan | Admin/Domain Owner | Confidential |
| Reporting | Reports, exports, regulatory filings | Domain Owner | Varies |
| Audit | Audit events, hash chain | Security/Audit | Security Critical |
| Privacy | DSAR, privacy requests | DPO | Restricted |
| Complaints | Complaints/disputes | Support/Compliance | Confidential / Restricted |

---

## 8. Complete Data Store Inventory

Every referenced data store must have an owner, classification, retention rule, encryption rule, and access-control policy.

| Data Store | Owner | Classification | Notes |
|---|---|---|---|
| User Store | Security/Admin | Security Critical | Staff/client users, role linkage |
| Credential Store | Security | Security Critical | Password hashes, reset tokens, MFA linkage |
| Session Store | Security | Security Critical | Session/token metadata |
| MFA Secret Store | Security | Security Critical | MFA secrets, recovery status |
| Client Profile Store | Compliance/Ops | Confidential / Restricted | Client identity and status |
| Consent Store | Compliance | Restricted | Agreement version, timestamp, IP, consent |
| File Store | Compliance/Security | Restricted / Highly Restricted | KYC/KYB, SOF/SOW, evidence |
| Compliance Store | Compliance/MLRO | Restricted / Highly Restricted | KYC decisions, AML cases, STR notes |
| Screening Result Store | Compliance | Restricted / Highly Restricted | Sanctions/PEP/wallet screening |
| Travel Rule Store | Compliance | Restricted / Highly Restricted | Originator/beneficiary data |
| Product Access Store | Compliance/Product | Confidential | Eligibility and access flags |
| Payout Destination Store | Ops/Finance/Compliance | Restricted | Bank accounts, wallet destinations, evidence |
| Quote Store | Operations | Financial Critical | Quote, expiry, LP snapshot, fee |
| Trade Store | Operations/Finance | Financial Critical | Trade booking and confirmation |
| Ledger Store | Finance | Financial Critical | Immutable double-entry ledger |
| Balance Store / Projection | Finance | Financial Critical | Derived balances and holds |
| Suspense / Clearing Account Store | Finance | Financial Critical | Unmatched or pending money |
| Settlement Store | Ops/Finance | Financial Critical | Settlement states and evidence |
| Reconciliation Store | Finance | Financial Critical | Bank/custodian/LP matching |
| Safeguarding Store | Finance/Compliance | Financial Critical | Client-money liability/resources computation |
| Alert Store | Compliance/Security | Restricted / Security Critical | AML/security/transaction monitoring alerts |
| Vendor Registry Store | Admin/Domain Owner | Confidential | Vendor status and DD metadata |
| FX Policy Store | Finance/Product | Financial Critical | Approved rate source, tolerance, validity |
| Precision Policy Store | Finance/Product | Financial Critical | Asset decimals, rounding policy |
| Report Store | Domain Owner | Varies | Generated reports |
| Export Store | Domain Owner/Security | Restricted / Highly Restricted | Controlled exports |
| Regulator Submission Evidence Store | Compliance/MLRO | Highly Restricted | STR/regulatory filing evidence |
| Audit Store | Security/Audit | Security Critical | Append-only audit events |
| Archive Store | Records Owner | Varies | Retained records and legal hold |
| Data Inventory Store | DPO/Security | Restricted | DSAR and data-location mapping |
| Backup Store | Security/Tech | Varies / Encrypted | Backup and replica datasets |
| Log / Telemetry Store | Security/Tech | Internal / Security Critical | Scrubbed app/security logs |
| Break-Glass Store | Security/Management | Security Critical | Emergency access records |

Rules:

1. Stores handling Restricted, Highly Restricted, Financial Critical, or Security Critical data must be encrypted at rest.
2. Sensitive store read access must be logged.
3. Store ownership must be assigned before module blueprint approval.
4. Any store not listed here but created later must be added through change control.

---

## 9. DF-01 Client Registration and Onboarding Data Flow

### 9.1 Flow Summary

Client onboarding data moves from Client Portal to API, File Service, Client Profile Store, Compliance Engine, Screening Vendors, and Audit Service.

### 9.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | API Gateway | Registration data | Validation, rate limit |
| 2 | API Gateway | Auth Service | User credentials | Password policy, MFA |
| 3 | Client Portal | File Service | KYC/KYB documents | Encryption, malware scan |
| 4 | API Gateway | Client Profile Store | Client profile | RBAC, audit |
| 5 | Client Profile Store | Compliance Engine | Client profile, BO, SOF/SOW | Restricted access |
| 6 | Compliance Engine | Screening Vendors | Name/entity identifiers | Vendor approval |
| 7 | Screening Vendors | Compliance Engine | Screening result | Sensitive read audit |
| 8 | Compliance Engine | Workflow Engine | Decision/status | Maker-checker |
| 9 | Workflow Engine | Audit Service | Audit event | Append-only |
| 10 | Workflow Engine | Notification Service | Status notice | Data minimisation |

### 9.3 Data Controls

1. Retail onboarding data path is blocked by default.
2. Client cannot access transaction modules from onboarding data alone.
3. KYC/KYB documents must be encrypted and access logged.
4. Screening results are Restricted or Highly Restricted depending on result.
5. Compliance decision must be immutable through decision log.

---

## 10. DF-02 Professional / Accredited Status Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | File Service | Eligibility evidence | Encryption |
| 2 | File Service | Compliance Engine | Evidence metadata | Sensitive read audit |
| 3 | Compliance Engine | Workflow Engine | Review decision | Maker-checker |
| 4 | Workflow Engine | Client Profile Store | Eligibility status | Product access gate |
| 5 | Workflow Engine | Audit Service | Decision audit | Append-only |

Rules:

1. Product access remains blocked until status is approved.
2. Evidence must be retained according to data retention policy.
3. Expired status triggers refresh-required flow.

---

## 11. DF-03 KYC/KYB, Beneficial Ownership, SOF/SOW, and EDD Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | Client Profile Store | BO and ownership structure | Validation |
| 2 | Client Portal | File Service | SOF/SOW evidence | Encryption |
| 3 | Compliance Engine | Sanctions/PEP Vendor | BO/director/representative data | Approved vendor only |
| 4 | Vendor | Compliance Engine | Screening result | Restricted |
| 5 | Compliance Engine | AML Risk Engine | Risk factors | AML rules |
| 6 | AML Risk Engine | Compliance Workspace | Risk score | Sensitive read audit |
| 7 | Compliance Workspace | Workflow Engine | EDD requirement / decision | Maker-checker |
| 8 | Workflow Engine | Audit Service | Decision log | Append-only |

Rules:

1. Missing BO, SOF/SOW, or EDD blocks product access.
2. Screening of beneficial owners must be linked to client record.
3. EDD evidence must be access controlled.

---

## 12. DF-04 Product Access and Agreement Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Compliance Engine | Product Access Service | Client approval data | Eligibility gate |
| 2 | Client Portal | Consent Store | Agreement acceptance | Version, timestamp, IP |
| 3 | Product Access Service | Client Profile Store | Product access flag | Maker-checker |
| 4 | Product Access Service | Audit Service | Product access event | Append-only |
| 5 | Product Access Service | Client Portal | Allowed modules | Backend source of truth |

Rules:

1. UI visibility must not replace backend product access check.
2. Product access requires approved client, professional status, AML clearance, agreement acceptance, and asset/pair eligibility.

---

## 13. DF-05 Payout Destination Whitelist Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | API Gateway | Payout destination request | Validation, MFA |
| 2 | API Gateway | Workflow Engine | Request metadata | Client-side approval check |
| 3 | Client Approver | Workflow Engine | Client-side approval | SoD check |
| 4 | Client Portal | File Service | Ownership evidence | Encryption |
| 5 | Workflow Engine | Compliance Engine | Destination review data | Own-name rule |
| 6 | Compliance Engine | Blockchain Analytics Vendor | Wallet address if crypto | Wallet screening |
| 7 | Compliance/Ops/Finance | Workflow Engine | Approval decision | Maker-checker |
| 8 | Workflow Engine | Payout Destination Store | Approved destination | Cooling-off hard gate |
| 9 | Workflow Engine | Audit Service | Audit events | Append-only |

Rules:

1. Third-party payout destination is blocked by default.
2. New destination cannot be used before cooling-off period ends.
3. Client-side dual authorization is required where mandate/threshold applies.
4. Crypto wallet destination links to Travel Rule and wallet screening.

---

## 14. DF-06 Fiat Deposit and Suspense Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Bank / Statement Source | Bank Integration | Statement line / receipt | Bank evidence |
| 2 | Client Portal | Deposit Service | Deposit notice | Optional notice |
| 3 | Deposit Service | Matching Engine | Reference, amount, sender | Matching rules |
| 4 | Matching Engine | Suspense / Clearing Account | Unmatched funds | No client credit |
| 5 | Ops/Finance | Deposit Workflow | Investigation evidence | Maker-checker |
| 6 | Deposit Workflow | Compliance Engine | AML review if required | Risk-based |
| 7 | Deposit Workflow | Ledger Service | Credit request | Idempotency |
| 8 | Ledger Service | Balance Service | Ledger-derived balance | Atomic operation |
| 9 | Reconciliation Service | Bank/Ledger Stores | Match result | Reconciliation |
| 10 | Safeguarding Service | Safeguarding Store | Liability/resource update | Full-backing invariant |

Rules:

1. Bank receipt confirmation is required before credit.
2. Unmatched deposit must go to suspense / clearing account.
3. Unmatched deposit cannot increase client available balance.
4. Return must be to verified source where applicable.
5. Deposit credit must link to ledger and reconciliation.

---

## 15. DF-07 Digital Asset Deposit Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Custodian / Node Provider | Deposit Monitoring Service | Transaction hash / asset / amount | Vendor approved |
| 2 | Deposit Monitoring Service | Confirmation Engine | On-chain confirmation data | Threshold |
| 3 | Deposit Monitoring Service | Blockchain Analytics Vendor | Wallet / transaction data | Wallet screening |
| 4 | Vendor | Compliance Engine | Wallet risk result | AML review |
| 5 | Deposit Service | Suspense / Clearing Account | Unmatched deposit | No client credit |
| 6 | Compliance/Ops/Finance | Workflow Engine | Credit decision | Maker-checker |
| 7 | Workflow Engine | Ledger Service | Credit instruction | Idempotency |
| 8 | Ledger Service | Balance Service | Client balance | Atomic ledger/balance |
| 9 | Reconciliation Service | Custodian/Ledger Stores | Reconciliation record | Break handling |
| 10 | Audit Service | Audit Store | Deposit audit trail | Append-only |

Rules:

1. Approved deposit address is required.
2. On-chain/custodian confirmation threshold must be met.
3. Wallet screening must clear or be reviewed.
4. Digital deposit credit requires maker-checker.
5. Custodian reconciliation is required.

---

## 16. DF-08 Withdrawal Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | Withdrawal Service | Withdrawal request | MFA, validation |
| 2 | Withdrawal Service | Client/Profile/Product Services | Client and product status | Product access gate |
| 3 | Withdrawal Service | Payout Destination Store | Destination data | Own-name, cooling-off |
| 4 | Withdrawal Service | Client Approval Workflow | Approval request | Dual auth where required |
| 5 | Withdrawal Service | Ledger Service | Hold request | Atomic hold |
| 6 | Withdrawal Service | Travel Rule Service | Originator/beneficiary data | Travel Rule |
| 7 | Withdrawal Service | Blockchain Analytics Vendor | Wallet screening data | Crypto only |
| 8 | Compliance/Ops/Finance | Workflow Engine | Approval decisions | Maker-checker |
| 9 | Payment Service | Bank/Custodian | Release instruction | Approved destination |
| 10 | Bank/Custodian | Payment Service | Release status | Evidence |
| 11 | Ledger Service | Ledger/Balance Store | Settlement posting | Double-entry |
| 12 | Reconciliation Service | Bank/Custodian/Ledger | Reconciliation data | Break management |
| 13 | Audit Service | Audit Store | Workflow events | Append-only |

Rules:

1. Withdrawal to third-party destination is blocked.
2. Client-side approval occurs before staff-side release where required.
3. Withdrawal hold must be atomic.
4. Bank/custodian release must be linked to approved withdrawal.
5. Reconciliation path is required.

---

## 17. DF-09 OTC/RFQ Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | RFQ Service | RFQ request | Product access gate |
| 2 | RFQ Service | Compliance/Product Services | Eligibility data | KYC/AML/product |
| 3 | RFQ Service | LP Adapter | RFQ pricing request | Approved LP |
| 4 | LP Adapter | Pricing Engine | LP price snapshot | Market data licence |
| 5 | Pricing Engine | Fee Engine | Brokerage fee | Disclosed fee only |
| 6 | Pricing Engine | Best-Execution Service | LP reference / tolerance | Fair pricing |
| 7 | Quote Service | Client Portal | Quote | Server UTC expiry |
| 8 | Client Portal | Quote Service | Quote acceptance | Client confirmation |
| 9 | Quote Service | Client Approval Workflow | Large trade approval | Dual auth where required |
| 10 | Quote Service | Ledger Service | Pre-funded hold request | Atomic hold |
| 11 | Execution Service | LP Adapter | LP execution request | Hold required |
| 12 | LP Adapter | Execution Service | Execution reference/status | LP evidence |
| 13 | Trade Service | Ledger/Settlement Services | Trade booking | Double-entry / DvP |
| 14 | Audit Service | Audit Store | Quote/trade events | Append-only |

Rules:

1. Quote must be LP-derived.
2. AIX spread markup is blocked.
3. Best-execution check must pass before booking.
4. LP execution cannot fire before pre-funded hold.
5. Partial fill/slippage results in void, re-quote, or reversal.

---

## 18. DF-10 MB Spot Broking Terminal Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client Portal | Spot Quote Service | Pair/amount/side | Product access |
| 2 | Spot Quote Service | Asset/Pair Config | Pair eligibility | Asset lock |
| 3 | Spot Quote Service | LP Adapter | Indicative LP price request | Approved LP |
| 4 | LP Adapter | Pricing Engine | LP snapshot | External LP only |
| 5 | Pricing Engine | Client Portal | Quote + disclosed fee | No order book |
| 6 | Client Portal | Quote Service | Acceptance | Server UTC check |
| 7 | Quote Service | Ledger Service | Pre-funded hold | Atomic hold |
| 8 | Execution Service | LP Adapter | Execution request | Hold confirmed |
| 9 | LP Adapter | Trade Service | LP execution reference | LP evidence |
| 10 | Trade Service | Settlement/Ledger Services | Booking and settlement | DvP |
| 11 | Audit Service | Audit Store | Events | Append-only |

Rules:

1. External LP market depth is indicative only.
2. No AIX order book data flow exists.
3. No matching engine data flow exists.
4. No client-to-client order data flow exists.

---

## 19. DF-11 LP Execution, Settlement Payment, and DvP Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Trade Service | Ledger Service | Pre-funded hold status | Required |
| 2 | Execution Service | LP Adapter | Execution order | Approved LP |
| 3 | LP Adapter | Execution Service | Execution reference | Evidence |
| 4 | Execution Service | Settlement Service | Matched leg details | DvP |
| 5 | Settlement Service | LP Payment Workflow | LP payment request | Maker |
| 6 | Ops/Finance Checker | LP Payment Workflow | Approval | Checker |
| 7 | Payment Service | Bank/Custodian/LP | LP payment / settlement instruction | DvP/safeguarded control |
| 8 | LP/Bank/Custodian | Settlement Service | Settlement status | Evidence |
| 9 | Ledger Service | Ledger Store | Settlement postings | Double-entry |
| 10 | Reconciliation Service | LP/Ledger/Trade Stores | Three-way reconciliation | Break management |
| 11 | Audit Service | Audit Store | Settlement events | Append-only |

Rules:

1. LP payment cannot be released before DvP/safeguarded sequence passes.
2. LP payment requires maker-checker.
3. LP execution and ledger/trade record must reconcile.
4. Settlement failure triggers exception, reversal, void, or re-quote.

---

## 20. DF-12 Ledger, Balance, Hold, and Reversal Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Source Workflow | Ledger Service | Posting request | Idempotency |
| 2 | Ledger Service | Ledger Store | Debit/credit entries | Immutable |
| 3 | Ledger Service | Balance Service | Balance projection | Derived from ledger |
| 4 | Balance Service | Ledger Store | Hold/release reference | Atomic transaction |
| 5 | Ledger Service | Trial Balance Engine | Ledger totals | Debit = credit |
| 6 | Reversal Workflow | Ledger Service | Reversal request | Maker-checker |
| 7 | Ledger Service | Ledger Store | Reversing entry | No deletion |
| 8 | Audit Service | Audit Store | Ledger events | Append-only |

Rules:

1. Direct balance edit is prohibited.
2. Direct ledger edit/delete is prohibited.
3. Holds cannot exceed available balance.
4. Available balance cannot go negative.
5. Concurrent operations cannot double-spend same balance.

---

## 21. DF-13 Reconciliation and Break Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Bank | Reconciliation Service | Bank statement | Bank evidence |
| 2 | Custodian | Reconciliation Service | Custodian statement | Custody evidence |
| 3 | LP | Reconciliation Service | LP execution/settlement report | LP evidence |
| 4 | Ledger Store | Reconciliation Service | Ledger entries | Financial critical |
| 5 | Reconciliation Service | Break Management | Mismatch record | Owner required |
| 6 | Finance/Ops | Break Management | Investigation evidence | Maker |
| 7 | Finance Manager | Break Management | Closure approval | Checker |
| 8 | Ledger Service | Ledger Store | Reversal/adjustment if approved | Controlled posting |
| 9 | Audit Service | Audit Store | Break events | Append-only |

Rules:

1. Reconciliation breaks cannot be deleted.
2. Break closure requires evidence and checker.
3. Ledger adjustment must use controlled reversal/adjustment workflow.

---

## 22. DF-14 Client-Money Safeguarding Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Ledger Store | Safeguarding Service | Client money liability | Financial critical |
| 2 | Bank/Custodian Stores | Safeguarding Service | Safeguarded resources | Financial critical |
| 3 | Safeguarding Service | Safeguarding Store | Computation result | Full-backing invariant |
| 4 | Safeguarding Service | Alert/Workflow Engine | Shortfall alert | High severity |
| 5 | Finance/Compliance | Safeguarding Workflow | Investigation/remediation | Maker-checker |
| 6 | Reporting Service | Report Store | Safeguarding report | Export controlled |
| 7 | Audit Service | Audit Store | Computation events | Append-only |

Rules:

1. Client money resources must fully back client liabilities.
2. Client money must not be used for AIX operations.
3. Shortfall creates high-severity workflow.

---

## 23. DF-15 Transaction Monitoring, AML Case, Travel Rule, and Wallet Screening Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Ledger/Trade/Deposit/Withdrawal Stores | Transaction Monitoring Engine | Transaction data | AML rules |
| 2 | Monitoring Engine | Alert Store | Alert | Severity |
| 3 | Alert Store | AML Case Management | Case data | Restricted |
| 4 | Compliance User | AML Case Management | Notes/evidence/decision | Sensitive read audit |
| 5 | AML Case | Freeze Workflow | Freeze request where required | Maker-checker |
| 6 | Digital Asset Flow | Travel Rule Service | Originator/beneficiary data | Required fields |
| 7 | Travel Rule Service | VASP/Counterparty Source | VASP data | Approved source |
| 8 | Wallet Flow | Blockchain Analytics Vendor | Wallet/tx hash | Approved vendor |
| 9 | Vendor | Compliance Engine | Wallet risk result | Review disposition |
| 10 | Audit Service | Audit Store | AML/TR/wallet events | Append-only |

Rules:

1. Missing Travel Rule data blocks transfer.
2. High-risk wallet results block workflow pending review.
3. STR records are highly restricted.
4. Sanctions true match may trigger freeze workflow.

---

## 24. DF-16 Account Freeze, Suspension, and Offboarding Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | AML/Sanctions/Fraud/Regulatory Source | Freeze Workflow | Trigger reason | Required evidence |
| 2 | Compliance | Freeze Workflow | Scope/effective time | Maker |
| 3 | Compliance Officer/MLRO | Freeze Workflow | Approval | Checker |
| 4 | Freeze Workflow | Client Status Engine | Restriction state | Backend enforcement |
| 5 | Client Status Engine | Product/Payment/Trade Services | Restriction signal | Default deny |
| 6 | Client/Compliance | Offboarding Workflow | Closure request | Reason |
| 7 | Offboarding Workflow | Ledger/Settlement/Reconciliation | Open obligation scan | No stranded money |
| 8 | Offboarding Workflow | Payment Service | Balance return to own-name destination | Controlled withdrawal |
| 9 | Offboarding Workflow | Records Retention | Retention action | Legal hold |
| 10 | Audit Service | Audit Store | Freeze/offboarding events | Append-only |

Rules:

1. Freeze scope must be enforced across all transaction modules.
2. Offboarding cannot close account with open balance, trade, settlement, withdrawal, or reconciliation break.
3. Balance return must use verified own-name payout destination.

---

## 25. DF-17 Periodic KYC Refresh and Sanctions Re-Screening Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Scheduler / Screening Vendor | Compliance Engine | Refresh trigger / list update | Risk schedule |
| 2 | Compliance Engine | Screening Vendor | Client/BO/representative data | Vendor approved |
| 3 | Vendor | Compliance Engine | Screening result | Restricted |
| 4 | Compliance Engine | Client Portal | Refresh request | Data minimisation |
| 5 | Client Portal | File Service | Updated evidence | Encryption |
| 6 | Compliance User | Workflow Engine | Refresh decision | Maker-checker |
| 7 | Workflow Engine | Product Access Service | Restrict/suspend/restore access | Backend gate |
| 8 | Audit Service | Audit Store | Refresh events | Append-only |

Rules:

1. Refresh overdue may restrict product access.
2. Sanctions list update must trigger re-screening.
3. Unresolved high-risk result may trigger freeze/suspension.

---

## 26. DF-18 Asset, Pair, FX, and Precision Configuration Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Admin/Ops | Asset Config Service | Asset record | Maker |
| 2 | Compliance | Asset Review Workflow | Admissibility decision | Checker |
| 3 | Asset Config Service | Product Services | Approved asset/pair list | Backend enforcement |
| 4 | Admin/Finance | FX Policy Store | Rate source/tolerance/rounding | Maker-checker |
| 5 | Admin/Finance | Precision Policy Store | Asset decimals/rounding | Maker-checker |
| 6 | Pricing/Ledger Services | FX/Precision Stores | Runtime policy lookup | Required |
| 7 | Audit Service | Audit Store | Config events | Append-only |

Rules:

1. Prohibited asset categories are blocked.
2. Asset without precision policy is blocked.
3. Unapproved FX source is blocked.
4. Rounding must not create undisclosed spread or ledger imbalance.

---

## 27. DF-19 Vendor, Custodian, Bank, LP, Secret, and Exit Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Domain Owner/Admin | Vendor Registry | Vendor record | Maker |
| 2 | Domain Owner | File Service | DD/contract/SLA/exit plan | Secure storage |
| 3 | Security/Compliance/Finance/Ops | Vendor Workflow | Reviews/approvals | Maker-checker |
| 4 | Security/Tech | KMS/Vault | API secrets | No plaintext access |
| 5 | Vendor Registry | Integration Services | Approved vendor status | Runtime gate |
| 6 | Custodian/Bank/LP | Integration Services | Operational data | Approved channel |
| 7 | Vendor Termination | Custody Exit Workflow | Migration/return plan | No stranded assets |
| 8 | Audit Service | Audit Store | Vendor/secret events | Append-only |

Rules:

1. Vendor cannot receive data before approval.
2. Secrets must not enter logs, AI prompts, tickets, or code.
3. Custody exit must define asset return or migration route.
4. LP failover remains disabled until separately approved.

---

## 28. DF-20 Reporting, Regulatory Filing, Audit, and Records Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Operational Stores | Reporting Service | Report data | Permission |
| 2 | Reporting Service | Data Minimisation Layer | Report dataset | Masking/filtering |
| 3 | Domain Owner | Report Workflow | Review decision | Maker |
| 4 | Compliance/MLRO/Management | Report Workflow | Approval | Checker |
| 5 | Reporting Service | Export Store | Export file | Audit/export control |
| 6 | Reporting Service | Regulator Submission Evidence Store | Filing evidence | Restricted |
| 7 | Audit Service | Audit Store | Report/export events | Append-only |
| 8 | Records Service | Archive Store | Archived records | Retention |

Rules:

1. STR/AML export is highly restricted and approval-gated.
2. Regulatory report submission must retain evidence.
3. Sensitive export requires audit log.

---

## 29. DF-21 Complaints, Disputes, DSAR, and Privacy Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Client/Support | Complaint Service | Complaint/dispute | Case record |
| 2 | Support/Compliance | Complaint Workflow | Assignment/evidence/resolution | Maker-checker where needed |
| 3 | Client/Support | Privacy/DSAR Service | DSAR request | Identity verification |
| 4 | DPO/Compliance | Data Inventory | Search request | Restricted |
| 5 | Data Stores | DPO Workspace | DSAR response dataset | Data minimisation |
| 6 | DPO/Compliance | DSAR Workflow | Approval/restriction decision | Checker |
| 7 | DSAR Service | Export Store | Response package | Audit/export control |
| 8 | Audit Service | Audit Store | Privacy/complaint events | Append-only |

Rules:

1. DPO owns privacy/DSAR workflow.
2. Retention/legal conflict must be checked before data release or deletion.
3. Complaint owner cannot close own complaint without oversight.

---

## 30. DF-22 Admin Configuration, IAM, and Break-Glass Data Flow

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Admin/Security | IAM Service | User/role/permission change | Maker |
| 2 | Security/Super Admin | IAM Workflow | Approval | Checker |
| 3 | Admin | Feature Flag Service | Feature flag change | Licence lock |
| 4 | Domain Checker | Feature Flag Workflow | Approval | Maker-checker |
| 5 | Security/Tech | Break-Glass Workflow | Emergency request | Reason |
| 6 | Senior Approver | Break-Glass Workflow | Approval | Grantor != recipient |
| 7 | Break-Glass User | System Services | Emergency action | Heightened audit |
| 8 | Audit Service | Audit Store | IAM/config/break-glass events | Append-only |

Rules:

1. Role/permission changes require maker-checker.
2. Future-locked Exchange flags cannot be enabled.
3. Break-glass cannot bypass licence lock or audit logging.
4. Emergency access must be time-boxed.

---

## 31. DF-23 Authentication / Session / MFA / OTP Data Flow

### 31.1 Flow Purpose

To map credential, session, MFA, password reset, and OTP data movement.

### 31.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | User Browser | API Gateway | Login request | TLS, validation, rate limit |
| 2 | API Gateway | Auth Service | Credentials | No logging of password |
| 3 | Auth Service | Credential Store | Password hash comparison | Salted hash, no plaintext |
| 4 | Auth Service | MFA Service | MFA challenge | Step-up control |
| 5 | MFA Service | MFA Secret Store | MFA secret / factor metadata | Encrypted at rest |
| 6 | MFA / Auth Service | Notification Vendor | OTP or login notification payload | Data minimisation |
| 7 | Notification Vendor | User Device | OTP / notification | Approved vendor |
| 8 | User Browser | Auth Service | OTP / MFA response | Replay protection |
| 9 | Auth Service | Session Store | Session/token metadata | Short-lived token, rotation |
| 10 | Auth Service | Audit Service | Login / MFA / reset event | Append-only |
| 11 | Password Reset Flow | Credential Store | Reset token state | Short-lived, single-use |
| 12 | Security Monitoring | Alert Store | Suspicious login/rate event | Security alert |

### 31.3 Rules

1. Passwords, OTPs, recovery codes, and session tokens must not be logged.
2. Passwords must be hashed, never encrypted as retrievable plaintext.
3. MFA secrets must be encrypted at rest.
4. Session tokens must be short-lived or revocable according to policy.
5. OTP payload to notification vendor must be minimised.
6. Login, failed login, MFA reset, password reset, and suspicious access must be audit logged.
7. Rate limiting and replay protection are required.
8. MFA reset requires maker-checker.

---

## 32. DF-24 Backup, Replication, and DR Data Flow

### 32.1 Flow Purpose

To map backup, replica, restore-test, and disaster-recovery data movement for sensitive and financial data.

### 32.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Production Databases | Backup Service | Database backup | Encryption before/at storage |
| 2 | File Store | Backup Service | Document backup | Encryption, access control |
| 3 | Audit Store | Backup Service | Audit backup | Append-only integrity |
| 4 | Backup Service | Backup Store | Encrypted backup set | KMS/vault keys |
| 5 | Backup Store | DR Environment / Restore Test | Restore copy | Approved restore test |
| 6 | DR Environment | Security/Tech | Restore evidence | No live client exposure |
| 7 | Backup Service | Monitoring/Alert Store | Backup success/failure event | Alert on failure |
| 8 | Backup Store | Archive/Retention Store | Retention metadata | Residency and retention |

### 32.3 Rules

1. Backups of Restricted, Highly Restricted, Financial Critical, or Security Critical data must be encrypted.
2. Backup key management must use KMS/vault or approved key service.
3. Backup location must comply with approved data residency.
4. Cross-border backup replication requires approval.
5. Restore tests must use controlled access.
6. Backup failures must alert Security/Tech and be audit logged.
7. Backup access must be restricted and logged.
8. Backup deletion must follow retention policy and legal hold.

---

## 33. DF-25 STR Filing to FIU / Regulator Data Flow

### 33.1 Flow Purpose

To map highly restricted suspicious transaction reporting or equivalent regulatory filing data flow separately from routine reporting.

### 33.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | AML Case Management | STR Workflow | Suspicious case data | Highly restricted |
| 2 | MLRO / Compliance Officer | STR Workflow | Filing decision | Maker-checker / senior approval |
| 3 | STR Workflow | Filing Package Store | STR package and evidence | Encryption, strict RBAC |
| 4 | STR Workflow | FIU / Regulator Channel | STR filing payload | Approved secure channel |
| 5 | FIU / Regulator Channel | Regulator Submission Evidence Store | Receipt / acknowledgement | Evidence retention |
| 6 | STR Workflow | Audit Service | Filing event | Highly restricted audit |
| 7 | STR Workflow | Client Portal / Support Workspace | No client-visible data | Tipping-off protection |

### 33.3 Rules

1. STR filing data is Highly Restricted.
2. STR workflow access is limited to authorised Compliance / MLRO roles.
3. STR data must never be visible to client or support users.
4. Tipping-off protection must be enforced.
5. Filing channel must be approved and secure.
6. Submission receipt and evidence must be retained.
7. STR export requires approval and audit logging.

---

## 34. DF-26 Application / Security Log and PII Scrubbing Data Flow

### 34.1 Flow Purpose

To map application logs, security logs, telemetry, and PII scrubbing before log storage or monitoring.

### 34.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Application Services | Log Processor | Application event | Structured logging |
| 2 | API Gateway/Auth/Security Services | Security Log Processor | Security event | Sensitive event tagging |
| 3 | Log Processor | PII Scrubber | Log payload | Masking/redaction |
| 4 | PII Scrubber | Log / Telemetry Store | Scrubbed logs | Retention/residency |
| 5 | Security Monitoring | Alert Store | Security alert | Restricted access |
| 6 | Incident Workflow | Audit Store | Incident evidence | Audit link |
| 7 | Log Store | Reporting/Security Workspace | Log query result | RBAC and read logging |

### 34.3 Rules

1. Logs must not contain passwords, OTPs, session tokens, production secrets, full bank details, full KYC documents, STR contents, or full Travel Rule payloads.
2. PII must be masked or redacted unless explicitly required for approved security investigation.
3. Log access must be RBAC-controlled.
4. Security events must be retained according to approved policy.
5. Log storage must follow data residency rules.
6. Production secrets must never enter logs.

---

## 35. DF-27 Notification / OTP Delivery Data Flow

### 35.1 Flow Purpose

To map data sent to notification vendors for email, SMS, OTP, security alerts, client workflow notices, and operational alerts.

### 35.2 Data Flow Table

| Step | Source | Destination | Data | Control |
|---:|---|---|---|---|
| 1 | Workflow/Auth/Alert Service | Notification Service | Notification request | Template policy |
| 2 | Notification Service | Template Store | Template ID and variables | Data minimisation |
| 3 | Notification Service | Notification Vendor | Contact details and minimal message payload | Approved vendor |
| 4 | Notification Vendor | User / Staff Device | Message delivery | Vendor SLA |
| 5 | Notification Vendor | Notification Service | Delivery status | Metadata only |
| 6 | Notification Service | Audit Service | Notification event | Audit where sensitive |

### 35.3 Rules

1. Notification payload must be minimised.
2. OTP, password reset, and security messages must not include unnecessary PII.
3. STR, AML case details, full KYC data, bank details, and Travel Rule payloads must not be sent through ordinary notifications.
4. Notification vendor must be approved before production.
5. Notification data residency must be reviewed before production.


---

## 36. Future-Locked Exchange Data Flow Block

### 36.1 Blocked Data Flows

The following data flows must not exist in MVP runtime:

```txt
Client order -> AIX public order book
Client order -> AIX matching engine
Client order -> another client order
Client order -> AIX market maker engine
Client order -> public exchange execution engine
AIX market data -> public exchange market depth
Maker/taker fee calculation -> client trade
Resting limit order -> order book store
Stop-limit order -> order book store
Public market API -> client trading
```

### 36.2 Rule

Any attempted flow to future-locked Exchange modules must be blocked by backend feature flag, licence lock, permission guard, and deployment configuration.

Error code:

```txt
EXCHANGE_MODULE_LOCKED
```

---

## 37. Data Retention and Archival Flow

| Data Type | Retention Owner | Retention Control |
|---|---|---|
| KYC/KYB | Compliance | Retention policy, legal hold |
| AML/STR | MLRO | Highly restricted retention |
| Travel Rule | Compliance | Secure retention |
| Ledger | Finance | Immutable financial record |
| Audit Log | Security/Audit | Append-only, no deletion |
| Client Agreement | Compliance | Versioned consent retention |
| Vendor DD | Domain Owner | Contract and exit-plan retention |
| Reports | Domain Owner | Report archive |
| DSAR | DPO | Privacy retention and restriction |
| Complaints | Compliance/Support | Case retention |
| Security Logs | Security | Security retention policy |

Rules:

1. Retention deletion cannot override AML, audit, legal, or financial retention.
2. Archive access requires permission.
3. Archive retrieval must be audit logged for sensitive data.

---

## 38. Data Residency and Cross-Border Flow

Data residency must be approved before production.

Cross-border data flow must be reviewed for:

1. KYC/IDV vendor.
2. Sanctions/PEP vendor.
3. Blockchain analytics vendor.
4. LP.
5. Custodian.
6. Bank.
7. Cloud provider.
8. Notification vendor.
9. Security vendor.
10. Backup / DR location.
11. Log / telemetry storage.
12. Notification / OTP vendor.

Rules:

1. Cross-border vendor processing requires vendor due diligence.
2. Sensitive cross-border transfer requires approved purpose.
3. Data residency violation blocks production go-live.
4. Data residency controls must be documented in module data classification files.

Error code:

```txt
DATA_RESIDENCY_VIOLATION
```

---

## 39. Data-Flow-to-Rule Mapping Matrix

This matrix links data flows to the controlling system rules in `06_Master_System_Rules_v1.2.md`.

| Data Flow | Main Rules Enforced |
|---|---|
| DF-01 Client Registration and Onboarding | SYS-RULE-001, SYS-RULE-005, CLT-RULE-001, AML-RULE-001, AML-RULE-006, DATA-RULE-001, SEC-RULE-003 |
| DF-02 Professional / Accredited Status | CLT-RULE-001, CLT-RULE-002, DATA-RULE-001, DATA-RULE-002, SEC-RULE-003 |
| DF-03 KYC/KYB, BO, SOF/SOW, EDD | AML-RULE-001, AML-RULE-006, AML-RULE-002, DATA-RULE-001, DATA-RULE-002, SEC-RULE-003 |
| DF-04 Product Access and Agreement | CLT-RULE-002, CFG-RULE-002, REC-RULE-001, DATA-RULE-001 |
| DF-05 Payout Destination Whitelist | PAY-RULE-001, CLT-RULE-003, SOD-RULE-001, TR-RULE-002, DATA-RULE-001 |
| DF-06 Fiat Deposit and Suspense | DEP-RULE-001, DEP-RULE-003, LED-RULE-001, SAFE-RULE-001, SET-RULE-002 |
| DF-07 Digital Asset Deposit | DEP-RULE-002, DEP-RULE-003, TR-RULE-002, LED-RULE-001, SET-RULE-002 |
| DF-08 Withdrawal | PAY-RULE-001, PAY-RULE-002, PAY-RULE-003, CLT-RULE-003, TR-RULE-001, LED-RULE-003, SOD-RULE-001 |
| DF-09 OTC/RFQ | QTE-RULE-001, QTE-RULE-002, FX-RULE-001, LP-RULE-001, LIC-RULE-003, LED-RULE-003 |
| DF-10 MB Spot Broking Terminal | QTE-RULE-001, QTE-RULE-002, QTE-RULE-003, LP-RULE-001, LIC-RULE-002, LIC-RULE-003 |
| DF-11 LP Execution, Settlement Payment, DvP | LP-RULE-001, LP-RULE-002, LP-RULE-003, LP-RULE-004, SET-RULE-001, LIC-RULE-003 |
| DF-12 Ledger, Balance, Hold, Reversal | LED-RULE-001, LED-RULE-002, LED-RULE-003, LED-RULE-004, LED-RULE-005 |
| DF-13 Reconciliation and Break | SET-RULE-002, SET-RULE-003, LED-RULE-001, SAFE-RULE-001 |
| DF-14 Client-Money Safeguarding | SAFE-RULE-001, SAFE-RULE-002, SAFE-RULE-003, SET-RULE-002 |
| DF-15 Transaction Monitoring, AML, Travel Rule, Wallet | AML-RULE-004, AML-RULE-005, TR-RULE-001, TR-RULE-002, FRZ-RULE-001 |
| DF-16 Freeze, Suspension, Offboarding | FRZ-RULE-001, FRZ-RULE-002, OFF-RULE-001, PAY-RULE-001, REC-RULE-001 |
| DF-17 Periodic KYC Refresh / Re-Screening | AML-RULE-002, AML-RULE-003, CLT-RULE-002, FRZ-RULE-001 |
| DF-18 Asset, Pair, FX, Precision Config | ASSET-RULE-001, FX-RULE-001, LED-RULE-005, CFG-RULE-002 |
| DF-19 Vendor, Custodian, Bank, LP, Secret, Exit | VND-RULE-001, VND-RULE-002, VND-RULE-003, VND-RULE-004, SEC-RULE-003 |
| DF-20 Reporting, Regulatory Filing, Audit, Records | RPT-RULE-001, RPT-RULE-002, RPT-RULE-003, REC-RULE-001, SEC-RULE-002 |
| DF-21 Complaints, Disputes, DSAR, Privacy | CMP-RULE-001, PRIV-RULE-001, DATA-RULE-003, REC-RULE-001 |
| DF-22 Admin Config, IAM, Break-Glass | IAM-RULE-001, IAM-RULE-002, SEC-RULE-001, SEC-RULE-002, SOD-RULE-001 |
| DF-23 Authentication / Session / MFA / OTP | IAM-RULE-001, SYS-RULE-005, SEC-RULE-003, VND-RULE-002, SEC-RULE-002 |
| DF-24 Backup, Replication, DR | REL-RULE-001, DATA-RULE-003, SEC-RULE-003, REC-RULE-001 |
| DF-25 STR Filing to FIU / Regulator | AML-RULE-005, RPT-RULE-001, REC-RULE-001, DATA-RULE-001, SEC-RULE-003 |
| DF-26 Application / Security Log and PII Scrubbing | SYS-RULE-005, SEC-RULE-002, SEC-RULE-003, DATA-RULE-001, DATA-RULE-003 |
| DF-27 Notification / OTP Delivery | IAM-RULE-001, VND-RULE-001, SYS-RULE-005, DATA-RULE-003 |
| Future-Locked Exchange Data Flow Block | LIC-RULE-002, LIC-RULE-003, CFG-RULE-001 |

Rules:

1. Every module blueprint must trace its data flow to at least one system rule.
2. Every Critical or High rule must have at least one related data flow or a stated reason why it is configuration-only.
3. The traceability matrix must link: requirement → rule → workflow → data flow → API → test.


---

## 40. Data Flow Security Controls

Every sensitive data flow must define:

1. Source.
2. Destination.
3. Data fields.
4. Classification.
5. Encryption in transit.
6. Encryption at rest.
7. RBAC permission.
8. Feature flag dependency.
9. Workflow state dependency.
10. Audit event.
11. Retention rule.
12. Vendor approval dependency where applicable.
13. Error code.
14. Test case.

---

## 41. Master Data Flow Testing Requirements

Data flow testing must include:

1. Permission-denied data access tests.
2. Sensitive read-access logging tests.
3. Encryption configuration tests.
4. Data masking tests.
5. Data export approval tests.
6. Cross-client data isolation tests.
7. Vendor approval gate tests.
8. Vendor outage fail-closed tests.
9. PII not sent to unapproved vendor tests.
10. AI prompt / secret leakage prevention tests.
11. Ledger-to-balance consistency tests.
12. Bank/custodian/LP reconciliation data tests.
13. Unmatched deposit suspense data tests.
14. Travel Rule missing data block tests.
15. Wallet screening risk block tests.
16. Client-money safeguarding computation tests.
17. Future-locked Exchange data flow block tests.
18. Data retention and archival tests.
19. DSAR privacy export tests.
20. Data residency gate tests.
21. Authentication/session/MFA data-flow tests.
22. OTP/notification vendor minimisation tests.
23. Backup encryption and restore data-flow tests.
24. Backup residency tests.
25. STR filing tipping-off protection tests.
26. STR submission evidence retention tests.
27. Log PII scrubbing tests.
28. Store inventory completeness tests.
29. Data-flow-to-rule traceability tests.
30. FX rate lineage quote-trade-ledger-report tests.

---

## 42. Open Items for Module Blueprints

The following must be finalised per module:

1. Exact data fields.
2. Exact database tables.
3. Exact encryption fields.
4. Exact masking rules.
5. Exact audit event payload.
6. Exact retention period.
7. Exact export formats.
8. Exact vendor payload schema.
9. Exact Travel Rule schema.
10. Exact wallet screening schema.
11. Exact LP adapter request/response.
12. Exact bank statement import format.
13. Exact custodian balance/transfer format.
14. Exact reconciliation matching fields.
15. Exact safeguarding formula inputs.
16. Exact FX rate source and precision data schema.
17. Exact data residency evidence.
18. Exact archive retrieval process.
19. Exact credential/session/MFA token schema.
20. Exact OTP vendor payload schema.
21. Exact backup encryption and retention policy.
22. Exact DR restore-test evidence format.
23. Exact STR filing channel and evidence schema.
24. Exact log scrubbing/masking pattern.
25. Exact complete store inventory per module.
26. Exact data-flow-to-rule traceability matrix in RPT-13.
27. Exact FX rate lineage fields from quote to report.

---

## 43. Additional Data Flow Parameters

```txt
auth_session_mfa_flow_mapped = required
credential_plaintext_storage = prohibited
password_otp_token_logging = prohibited
session_token_short_lived_or_revocable = required
notification_vendor_pii = minimised

backup_data_flow = encrypted_and_residency_controlled
backup_restore_test_flow = required
backup_key_management = kms_or_approved_key_service

str_filing_flow = confidential_tipping_off_protected
str_client_visibility = prohibited
str_submission_evidence_retention = required

log_pii_scrubbing = required
production_secret_in_logs = prohibited
log_residency_control = required

data_flow_to_rule_mapping = required
store_inventory_complete = required
onchain_node_provider_listed = true
fx_rate_lineage_traceable = quote_trade_ledger_report
```


---

## 44. Claude Model Usage

### 44.1 ChatGPT 5.5

Use for:

1. Data-flow refinement.
2. Data classification planning.
3. Module blueprint drafting.
4. API/database data mapping.
5. Audit event and test mapping.
6. Claude prompt creation.

### 44.2 Claude Opus

Use for:

1. Review of this Master Data Flow.
2. Data privacy/security review.
3. Client-money and ledger data-flow review.
4. AML/Travel Rule data-flow review.
5. Vendor/LP/custody/bank data-flow review.
6. Licence-boundary and future-locked flow review.

### 44.3 Claude Sonnet

Do not use Sonnet for coding until the relevant module blueprint is approved.

### 44.4 Claude Fable

Use later for user-facing wording and privacy/support messages.

---

## 45. Claude Opus Review Prompt

```txt
Review this 07_Master_Data_Flow_v1.1.md as a principal fintech platform architect and regulated fintech data/security reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- This document is based on:
  - 00_Licence_Scope_And_Feature_Lock_v1.3.md
  - 01_Project_Charter_v1.3.md
  - 03_Master_Module_Index_v1.2.md
  - 02_Software_Requirement_Specification_v1.2.md
  - 04_Role_And_Permission_Matrix_v1.2.md
  - 05_Master_Workflow_Map_v1.2.md
  - 06_Master_System_Rules_v1.2.md
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Platform includes onboarding, KYC/KYB, AML, Travel Rule, transaction monitoring, payout destination whitelist, OTC/RFQ, MB Spot Broking Terminal, LP-backed agency execution, pre-funded hold, best-execution check, ledger, deposit, withdrawal, client-money safeguarding, settlement, reconciliation, audit log, maker-checker, client-side dual authorization, complaints, DSAR/privacy, break-glass access, account freeze/suspension, offboarding, periodic KYC refresh, FX/precision controls, reporting, and admin/staff/client portals.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

This v1.1 added DF-23 Authentication / Session / MFA / OTP, DF-24 Backup / Replication / DR, DF-25 STR Filing to FIU / Regulator, DF-26 Application / Security Log and PII Scrubbing, DF-27 Notification / OTP Delivery, a complete data store inventory, on-chain node and approved FX/rate source listings, data-flow-to-rule mapping, backup residency controls, STR tipping-off controls, and FX rate lineage requirements.

Review for:
1. Missing data flows.
2. Missing data stores.
3. Missing external data integrations.
4. Missing sensitive-data controls.
5. Missing encryption, masking, or read-access logging controls.
6. Missing AML/KYC/Travel Rule data flows.
7. Missing deposit, withdrawal, ledger, balance, settlement, reconciliation, or safeguarding data flows.
8. Missing LP, custodian, bank, vendor, or outage data flows.
9. Missing reporting, audit, privacy, DSAR, or retention data flows.
10. Missing data residency or cross-border controls.
11. Missing testability and data-flow-to-rule mapping.
12. Any data flow that could accidentally allow exchange-like or principal-dealing behaviour.
13. Any conflict with 00, 01, 03, 02, 04, 05, or 06.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional data-flow requirements or parameters to add.
```

---

## 46. Next Document

After this Master Data Flow document is reviewed and accepted, the next document should be:

```txt
08_Master_Technical_Architecture.md
```

Reason:

Technical architecture should be written after rules and data flows are locked, so system components, services, databases, queues, integrations, and deployment patterns match the regulatory workflow and data-control requirements.
