---
document_id: ARC-10
title: Master Testing Strategy
version: v1.2
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Testing strategy
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: v1.0, v1.1 (archived)
baseline_commit: 780e116
---

# 10 Master Testing Strategy  
# AIX Money Broking Platform

## Document Control

| Item | Details |
|---|---|
| Document name | 10_Master_Testing_Strategy_v1.2.md |
| Platform | AIX Money Broking Platform |
| Document type | SDLC Phase 2 / Master Testing Strategy |
| Version | v1.2 |
| Status | Accepted for Master Deployment Strategy after sub-section numbering hygiene cleanup; no substantive testing change from v1.1 |
| Prepared for | QA, security, compliance, product, architecture, development, DevOps, operations, finance, and management |
| Base document 1 | 00_Licence_Scope_And_Feature_Lock_v1.3.md |
| Base document 2 | 01_Project_Charter_v1.3.md |
| Base document 3 | 03_Master_Module_Index_v1.2.md |
| Base document 4 | 02_Software_Requirement_Specification_v1.2.md |
| Base document 5 | 04_Role_And_Permission_Matrix_v1.2.md |
| Base document 6 | 05_Master_Workflow_Map_v1.2.md |
| Base document 7 | 06_Master_System_Rules_v1.2.md |
| Base document 8 | 07_Master_Data_Flow_v1.2.md |
| Base document 9 | 08_Master_Technical_Architecture_v1.2.md |
| Base document 10 | 09_Master_Security_Architecture_v1.2.md |

---

## 1. Purpose

This document defines the master testing strategy for the AIX Money Broking Platform.

The purpose is to ensure every approved requirement, workflow, system rule, role/permission, data flow, technical architecture component, security control, and go-live gate is testable before implementation.

This testing strategy is the control layer that proves:

1. The platform stays within Money Broking and PSO scope.
2. Exchange-like behaviour remains blocked.
3. AIX does not act as principal, market maker, or internal exchange.
4. Client-money, ledger, settlement, and reconciliation controls work.
5. KYC/KYB, AML, Travel Rule, sanctions, wallet screening, and STR controls work.
6. RBAC, maker-checker, SoD, audit, and sensitive-read controls work.
7. Security, privacy, resilience, backup, DR, and incident controls work.
8. Go-live cannot proceed unless critical controls pass or are formally risk accepted.

---

## 2. Testing Scope Baseline

The testing strategy is based on the accepted platform boundary:

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

## 3. Testing Principles

### 3.1 Risk-Based Testing

Critical controls receive the highest testing priority.

Critical areas include:

1. Licence scope and Exchange lock.
2. Principal exposure prevention.
3. Ledger and balance integrity.
4. Client-money safeguarding.
5. Deposit, withdrawal, and settlement.
6. LP execution and DvP sequence.
7. AML, sanctions, STR, Travel Rule, and wallet screening.
8. RBAC, maker-checker, and SoD.
9. Audit-write atomicity and tamper evidence.
10. Per-client isolation.
11. Webhook and vendor security.
12. Backup, DR, ransomware recovery, and go-live gates.

### 3.2 Negative Testing is Mandatory

Every Critical and High control must have a negative test.

Examples:

1. Attempt action without permission.
2. Attempt self-approval.
3. Attempt trade without pre-funded hold.
4. Attempt withdrawal to third-party destination.
5. Attempt deposit credit from unverified webhook.
6. Attempt direct ledger edit.
7. Attempt exchange module access.
8. Attempt cross-client data access.
9. Attempt STR read by unauthorised role.
10. Attempt production deployment without go-live gate approval.

### 3.3 Backend Enforcement Testing

UI-only tests are not sufficient.

Every critical gate must be tested at:

1. API level.
2. Backend service level.
3. Workflow level.
4. Data/state level.
5. Audit/log level.

### 3.4 Evidence-Based Testing

Every test execution must produce evidence:

1. Test case ID.
2. Requirement/rule/workflow reference.
3. Environment.
4. Test data.
5. Expected result.
6. Actual result.
7. Screenshot/log/export where relevant.
8. Defect ID where failed.
9. Sign-off status.
10. Retest status.

### 3.5 No Production Data in Testing

Testing must use synthetic or approved masked data only unless production testing is formally approved.

---

## 4. Test Levels

| Test Level | Purpose | Owner |
|---|---|---|
| Unit Test | Test business logic in isolation | Development |
| Integration Test | Test module-to-module and vendor adapter interaction | Development / QA |
| API Test | Test backend endpoints, validation, permissions, idempotency | QA / Development |
| Workflow Test | Test state transitions, maker-checker, SoD, audit | QA / Product |
| Security Test | Test auth, RBAC, isolation, encryption, webhook, vulnerabilities | Security / QA |
| Compliance Test | Test KYC, AML, Travel Rule, STR, reporting, retention | Compliance / QA |
| Financial Control Test | Test ledger, balance, holds, settlement, reconciliation, safeguarding | Finance / QA |
| Data Flow Test | Test data movement, classification, masking, residency | QA / Security |
| Performance Test | Test load, latency, concurrency, batch timing | QA / DevOps |
| Resilience Test | Test vendor outage, backup, DR, scheduler, fail closed | DevOps / QA |
| UAT | Validate business readiness | Product / Operations / Compliance / Finance |
| Go-Live Test | Final production readiness gate | Management / Compliance / Security / DevOps |

---

## 5. Test Environment Strategy

| Environment | Test Purpose | Data Rule |
|---|---|---|
| Local Development | Unit and developer tests | Synthetic only |
| Development | Early integration testing | Synthetic only |
| Test / QA | Formal QA tests | Synthetic or masked |
| UAT | Business validation | Synthetic or approved masked |
| Staging | Production-like technical validation | Masked/synthetic unless approved |
| Production | Smoke, monitoring, go-live verification only | Live data with strict control |
| DR / Restore Test | Backup and disaster recovery validation | Controlled backup copy |

Rules:

1. Production credentials must not be used outside production.
2. Sandbox vendor credentials must not be used in production.
3. Test data must clearly identify non-real clients.
4. Exchange-lock tests must run in every production-like environment.
5. Security, ledger, reconciliation, and safeguarding tests must run before go-live.
6. Failed Critical test blocks go-live unless formally risk accepted where allowed.

---

## 6. Traceability Strategy

Every test must trace to at least one source item:

```txt
Requirement
→ Rule
→ Workflow
→ Data Flow
→ Architecture Component
→ Security Control
→ API / Module
→ Test Case
```

### 6.1 Traceability Matrix Columns

| Column | Description |
|---|---|
| Test ID | Unique test reference |
| Test Category | Functional, security, financial, compliance, performance, resilience |
| Requirement ID | SRS or module requirement |
| Rule ID | System rule |
| Workflow ID | Workflow map item |
| Data Flow ID | Data flow item |
| Permission / Role | RBAC reference |
| Architecture Component | Technical/security component |
| Risk / Control | Risk addressed |
| Expected Result | Pass condition |
| Evidence Required | Required proof |
| Owner | Responsible team |
| Priority | Critical/High/Medium/Low |
| Automation Status | Manual/Automated/Planned |
| Go-Live Blocking | Yes/No |

### 6.2 Traceability Coverage Audit

A formal traceability coverage audit is mandatory before go-live.

The audit must verify forward and backward coverage across:

1. SRS requirements.
2. System rules.
3. Workflows.
4. Data flows.
5. Technical architecture components.
6. Security controls.
7. Role and permission rules.
8. Audit events.
9. Error codes.
10. Test cases.

### 6.3 Forward Coverage Rule

Every upstream item must map to at least one test case.

Required forward coverage:

| Upstream Item | Coverage Requirement |
|---|---|
| Every SRS requirement | At least one test |
| Every Critical / High system rule | At least one positive and one negative test |
| Every workflow | At least one state-transition test |
| Every data flow | At least one data movement/control test |
| Every security control | At least one security test |
| Every role/permission control | At least one RBAC/SoD test |
| Every money-critical flow | Financial control + audit + reconciliation test |
| Every go-live gate | Evidence test or checklist item |

### 6.4 Orphan Test Rule

Every test must map back to at least one upstream item.

Rules:

1. No orphan tests.
2. No Critical or High requirement without a test.
3. No Critical or High system rule without a negative test.
4. No workflow without state-transition coverage.
5. No data flow handling Restricted / Highly Restricted / Financial Critical data without a data-control test.
6. No go-live gate without evidence.
7. Traceability gaps are go-live blockers unless formally risk accepted where allowed.

### 6.5 Traceability Coverage Metrics

Minimum coverage before go-live:

```txt
critical_requirement_test_coverage = 100%
critical_rule_negative_test_coverage = 100%
workflow_test_coverage = 100%
data_flow_test_coverage_for_restricted_financial_security_data = 100%
security_control_test_coverage = 100%
orphan_test_count = 0
go_live_gate_evidence_coverage = 100%
```

---

## 7. Licence Scope and Exchange-Lock Testing

### 7.1 Test Objectives

Prove that the MVP cannot behave like an exchange, principal dealer, market maker, or internal matching venue.

### 7.2 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| LIC-TC-001 | Access public order book route | Blocked |
| LIC-TC-002 | Access matching engine route | Blocked |
| LIC-TC-003 | Attempt client-to-client matching | Blocked |
| LIC-TC-004 | Attempt market maker function | Blocked |
| LIC-TC-005 | Attempt maker/taker fee engine | Blocked |
| LIC-TC-006 | Attempt resting order creation | Blocked |
| LIC-TC-007 | Attempt public exchange market API | Blocked |
| LIC-TC-008 | Attempt retail onboarding by default | Blocked |
| LIC-TC-009 | Attempt AIX spread markup | Blocked |
| LIC-TC-010 | Attempt principal trade booking | Blocked |
| LIC-TC-011 | Break-glass attempts to enable exchange module | Blocked |
| LIC-TC-012 | Super Admin attempts to enable exchange flag | Blocked |

Required error codes:

```txt
EXCHANGE_MODULE_LOCKED
LICENCE_SCOPE_BLOCKED
PRINCIPAL_EXPOSURE_BLOCKED
SPREAD_MARKUP_BLOCKED
```

---

## 8. Client Onboarding and Product Access Testing

### 8.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| CLT-TC-001 | Institutional client completes onboarding | Workflow moves to review |
| CLT-TC-002 | Retail client tries onboarding | Blocked |
| CLT-TC-003 | Missing KYC documents | More-info / blocked |
| CLT-TC-004 | Missing beneficial ownership | Blocked |
| CLT-TC-005 | Missing SOF/SOW where required | Blocked |
| CLT-TC-006 | High-risk client triggers EDD | EDD required |
| CLT-TC-007 | Product access before approval | Blocked |
| CLT-TC-008 | Agreement not accepted | Product access blocked |
| CLT-TC-009 | Professional status expired | Access restricted |
| CLT-TC-010 | Periodic KYC overdue | Access restricted/suspended |
| CLT-TC-011 | Sanctions list update triggers re-screening | Re-screening run created |
| CLT-TC-012 | Sanctions true match | Freeze/review triggered |

---

## 9. RBAC, Maker-Checker, and SoD Testing

### 9.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| RBAC-TC-001 | User without permission calls protected API | Denied |
| RBAC-TC-002 | Client tries to access another client record | Denied |
| RBAC-TC-003 | Staff accesses restricted record without permission | Denied |
| RBAC-TC-004 | Auditor attempts restricted STR export | Denied or approval-gated |
| RBAC-TC-005 | Maker approves own request | Blocked |
| RBAC-TC-006 | Client initiator approves own withdrawal | Blocked |
| RBAC-TC-007 | Admin approves own role change | Blocked |
| RBAC-TC-008 | LP payment maker approves same payment | Blocked |
| RBAC-TC-009 | Break-glass grantor is recipient | Blocked |
| RBAC-TC-010 | Complaint owner closes own complaint without oversight | Blocked |
| RBAC-TC-011 | All SOD-001 to SOD-020 conflicts tested | Blocked where applicable |
| RBAC-TC-012 | Sensitive read access logged | Audit event created |

---

## 10. Authentication, Session, MFA, and Impersonation Testing

### 10.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| AUTH-TC-001 | Successful staff login with MFA | Session issued |
| AUTH-TC-002 | Failed login brute force | Progressive delay / lockout |
| AUTH-TC-003 | Password reset token reuse | Blocked |
| AUTH-TC-004 | MFA reset without maker-checker | Blocked |
| AUTH-TC-005 | Admin without phishing-resistant MFA in production | Blocked or risk-accepted |
| AUTH-TC-006 | Session token in logs | Not present |
| AUTH-TC-007 | New device login | Notification / step-up |
| AUTH-TC-008 | Session invalidated after password reset | Old session revoked |
| AUTH-TC-009 | Support-view without approval | Blocked |
| AUTH-TC-010 | Support-view executes client transaction | Blocked |
| AUTH-TC-011 | Support-view access | Read-only and heightened-audited |
| AUTH-TC-012 | Break-glass bypasses impersonation rule | Blocked |
| AUTH-TC-013 | Role/permission revoked while session active | Access revoked immediately or on enforced revalidation |
| AUTH-TC-014 | Privileged role downgraded during session | Privileged access removed / step-up required |

---

## 11. API and Application Security Testing

### 11.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| API-TC-001 | Invalid schema | Validation error |
| API-TC-002 | Unknown critical field | Rejected |
| API-TC-003 | Invalid asset precision | Rejected |
| API-TC-004 | Invalid enum/state transition | Rejected |
| API-TC-005 | SQL injection attempt | Blocked |
| API-TC-006 | XSS payload in text field | Sanitised/rejected |
| API-TC-007 | Rate-limit exceeded | Throttled |
| API-TC-008 | CSRF attempt where applicable | Blocked |
| API-TC-009 | Sensitive error message leakage | Not disclosed |
| API-TC-010 | Missing correlation ID | Generated or rejected |
| API-TC-011 | File upload malware | Rejected/quarantined |
| API-TC-012 | Oversized upload | Rejected |
| API-TC-013 | API backward compatibility / version contract | Breaking change blocked or versioned |
| API-TC-014 | Consumer-driven API contract test | Contract failure blocks release |

---

## 12. Webhook and Vendor Security Testing

### 12.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| WH-TC-001 | Valid custodian webhook | Accepted |
| WH-TC-002 | Invalid HMAC/signature | Rejected |
| WH-TC-003 | Replay webhook | Rejected/idempotent no-op |
| WH-TC-004 | Unknown vendor callback | Rejected |
| WH-TC-005 | Invalid payload schema | Rejected |
| WH-TC-006 | Spoofed deposit confirmed callback | No balance credit |
| WH-TC-007 | Duplicate payment callback | Idempotent no duplicate posting |
| WH-TC-008 | LP execution callback with invalid reference | Rejected |
| WH-TC-009 | Bank webhook verification failure spike | Security alert |
| WH-TC-010 | Vendor TLS/certificate failure | Fail closed |
| WH-TC-011 | Money vendor certificate pinning test | Invalid endpoint blocked |
| WH-TC-012 | Vendor credentials not in KMS/vault | Go-live blocked |
| WH-TC-013 | Certificate expiry on vendor endpoint | Fail closed / alert |
| WH-TC-014 | Vendor secret rotation | Rotation succeeds without leakage |
| WH-TC-015 | Webhook HMAC secret rotation | Old/new transition controlled |
| WH-TC-016 | HMAC/certificate rotation audit | Audit event recorded |
| WH-TC-017 | Vendor adapter contract change | Contract test fails before release |

### 12.2 Notification Functional Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| NOTIF-TC-001 | OTP delivery | Delivered through approved vendor |
| NOTIF-TC-002 | OTP payload minimisation | No unnecessary PII |
| NOTIF-TC-003 | Security notification for new device/location | Notification sent |
| NOTIF-TC-004 | Notification contains STR/AML sensitive data | Blocked |
| NOTIF-TC-005 | Notification vendor unavailable | Retry / alert / safe fallback |
| NOTIF-TC-006 | Notification delivery status callback | Processed without sensitive logging |

---

## 13. Deposit, Withdrawal, and Payout Destination Testing

### 13.1 Deposit Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| DEP-TC-001 | Fiat deposit with confirmed bank receipt | Credited |
| DEP-TC-002 | Fiat deposit without bank confirmation | Not credited |
| DEP-TC-003 | Unmatched fiat deposit | Suspense/clearing |
| DEP-TC-004 | Unmatched deposit investigation resolved | Match or return |
| DEP-TC-005 | Digital asset deposit below confirmation threshold | Not credited |
| DEP-TC-006 | High-risk wallet deposit | Compliance hold |
| DEP-TC-007 | Digital deposit credit without maker-checker | Blocked |
| DEP-TC-008 | Deposit credit from unverified webhook | Blocked |
| DEP-TC-009 | Deposit from unverified source account | Quarantined / investigation |
| DEP-TC-010 | Deposit from third-party source | Blocked, quarantined, or compliance review |
| DEP-TC-011 | Source-of-funds mismatch | Compliance hold / EDD |
| DEP-TC-012 | Wrong network / wrong asset deposit | Exception / no credit until resolved |

### 13.2 Payout and Withdrawal Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| WDR-TC-001 | Add own-name payout destination | Review/cooling-off |
| WDR-TC-002 | Add third-party destination | Blocked |
| WDR-TC-003 | Payout destination without client-side approval where required | Blocked |
| WDR-TC-004 | Withdrawal before cooling-off ends | Blocked |
| WDR-TC-005 | Withdrawal with insufficient balance | Blocked |
| WDR-TC-006 | Withdrawal above client limit | Blocked/held |
| WDR-TC-007 | Rapid withdrawal velocity breach | Alert/hold |
| WDR-TC-008 | High-value withdrawal | Senior/dual approval required |
| WDR-TC-009 | Withdrawal missing Travel Rule data | Blocked |
| WDR-TC-010 | High-risk wallet withdrawal | Blocked/review |
| WDR-TC-011 | Withdrawal release without hold | Blocked |
| WDR-TC-012 | Withdrawal release to unverified destination | Blocked |

---

## 14. Quote, OTC/RFQ, Spot Broking, and LP Testing

### 14.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| TRD-TC-001 | Request quote for approved client/pair | Quote issued |
| TRD-TC-002 | Request quote for unapproved pair | Blocked |
| TRD-TC-003 | Quote uses unapproved FX source | Blocked |
| TRD-TC-004 | Quote expiry exceeded | Cannot accept |
| TRD-TC-005 | Manual quote markup attempt | Blocked |
| TRD-TC-006 | Best-execution check fails | Trade blocked |
| TRD-TC-007 | Accept quote without pre-funded hold | LP execution blocked |
| TRD-TC-008 | Large trade without client-side approval | Blocked |
| TRD-TC-009 | LP unavailable | Fail closed |
| TRD-TC-010 | LP partial fill | Void/re-quote/reversal |
| TRD-TC-011 | LP slippage beyond tolerance | Re-quote/void |
| TRD-TC-012 | LP execution creates residual AIX position | Blocked |
| TRD-TC-013 | External LP Market Depth displays as AIX Order Book | Blocked |
| TRD-TC-014 | Client-to-client matching attempt | Blocked |
| TRD-TC-015 | End-of-day aggregate AIX position check | Aggregate AIX inventory = zero |
| TRD-TC-016 | Aggregate position after partial fills/reversals | No residual AIX position |
| TRD-TC-017 | Aggregate LP/trade/ledger position reconciliation | Matched / breaks escalated |

---

## 15. Ledger, Balance, Idempotency, and Concurrency Testing

### 15.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| LED-TC-001 | Balanced posting | Debit equals credit |
| LED-TC-002 | Imbalanced posting | Blocked |
| LED-TC-003 | Direct ledger edit | Blocked |
| LED-TC-004 | Direct ledger delete | Blocked |
| LED-TC-005 | Direct balance edit | Blocked |
| LED-TC-006 | Hold exceeds available balance | Blocked |
| LED-TC-007 | Negative balance attempt | Blocked |
| LED-TC-008 | Concurrent withdrawals double-spend same balance | One succeeds / others blocked |
| LED-TC-009 | Duplicate idempotency key same payload | Safe replay |
| LED-TC-010 | Duplicate idempotency key different payload | Rejected |
| LED-TC-011 | Idempotency keys stored only in cache | Blocked |
| LED-TC-012 | Rounding breaks trial balance | Blocked |
| LED-TC-013 | Sub-precision leakage into balance | Blocked |
| LED-TC-014 | Reversal without approval | Blocked |
| LED-TC-015 | Money-event outbox delivery after commit | Event delivered once or safely retried |
| LED-TC-016 | Money-event duplicate publish | Idempotent no duplicate side effect |
| LED-TC-017 | Money-event outbox retry | Retry succeeds or remains visible |
| LED-TC-018 | Money-event dead-letter | Alert and controlled remediation |
| LED-TC-019 | Committed financial action with missing outbox event | Critical alert / reconciliation catches gap |

---

## 16. Settlement, Reconciliation, and Safeguarding Testing

### 16.1 Settlement Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| SET-TC-001 | Settlement with complete DvP evidence | Completed |
| SET-TC-002 | Client credit before confirmed receipt where exposure exists | Blocked |
| SET-TC-003 | LP payment without approval | Blocked |
| SET-TC-004 | LP payment before safeguarded sequence | Blocked |
| SET-TC-005 | Settlement evidence missing | Exception |
| SET-TC-006 | Settlement failure | Void/reversal/exception |

### 16.2 Reconciliation Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| REC-TC-001 | Ledger vs bank matched | Matched |
| REC-TC-002 | Ledger vs custodian break | Break workflow |
| REC-TC-003 | Ledger vs LP break | Break workflow |
| REC-TC-004 | Break closure without evidence | Blocked |
| REC-TC-005 | Break closure without checker | Blocked |
| REC-TC-006 | Ledger adjustment outside reversal workflow | Blocked |

### 16.3 Safeguarding Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| SAFE-TC-001 | Client money fully backed | Pass |
| SAFE-TC-002 | Client-money shortfall | Critical alert |
| SAFE-TC-003 | Shortfall closure without Finance/Compliance approval | Blocked |
| SAFE-TC-004 | Client money used for AIX operations | Blocked |
| SAFE-TC-005 | Daily safeguarding scheduler missed run | Critical alert |
| SAFE-TC-006 | Safeguarding go-live balance | Must pass |

---

## 17. AML, STR, Travel Rule, Wallet Screening, and Freeze Testing

### 17.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| AML-TC-001 | Transaction monitoring rule triggers alert | Alert created |
| AML-TC-002 | AML alert closure without reason | Blocked |
| AML-TC-003 | STR access by unauthorised staff | Denied |
| AML-TC-004 | STR visible to client/support | Not visible |
| AML-TC-005 | STR filing without MLRO approval | Blocked |
| AML-TC-006 | STR filing evidence retained | Evidence stored |
| AML-TC-007 | Travel Rule missing required data | Transfer blocked |
| AML-TC-008 | Counterparty VASP not approved | Transfer blocked/review |
| AML-TC-009 | Wallet screening high-risk | Transfer blocked/review |
| AML-TC-010 | Sanctions true match | Freeze workflow |
| AML-TC-011 | Freeze without maker-checker | Blocked |
| AML-TC-012 | Unfreeze without resolution evidence | Blocked |
| AML-TC-013 | Periodic KYC refresh missed/overdue | Restrict/suspend |
| AML-TC-014 | Sanctions list update re-screening | Re-screen job created |
| AML-TC-015 | STR/tipping-off leakage through notification or statement | Blocked / no sensitive disclosure |
| AML-TC-016 | Director / UBO / authorised representative sanctions screening | Screening completed and linked |
| AML-TC-017 | PEP match handling | EDD/review triggered |
| AML-TC-018 | Related-party adverse screening result | Compliance review / hold |

---

## 18. Offboarding, Account Closure, and Complaints Testing

### 18.1 Offboarding / Account Closure Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| OFF-TC-001 | Client requests account closure | Closure workflow starts |
| OFF-TC-002 | Closure with open trade | Blocked |
| OFF-TC-003 | Closure with open settlement | Blocked |
| OFF-TC-004 | Closure with available/held/frozen balance | Blocked until resolved |
| OFF-TC-005 | Final balance return to verified own-name destination | Completed only to approved destination |
| OFF-TC-006 | Closure with unresolved reconciliation break | Blocked |
| OFF-TC-007 | Closure with AML/STR restriction | Blocked / compliance review |
| OFF-TC-008 | Custody exit / asset return path | No client asset stranded |
| OFF-TC-009 | Ledger zeroing / final balance after closure | Zero or formally retained according to policy |
| OFF-TC-010 | Records retention applied on closure | Retention/legal hold applied |
| OFF-TC-011 | Product access revoked after closure | Access blocked |
| OFF-TC-012 | Payout destinations deactivated after closure | Inactive |

### 18.2 Complaints Lifecycle Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| CMP-TC-001 | Complaint submitted by client/support | Case created |
| CMP-TC-002 | Complaint acknowledgement SLA/timer | SLA tracked |
| CMP-TC-003 | Complaint assigned to owner | Owner recorded |
| CMP-TC-004 | Complaint owner closes own complaint without oversight | Blocked or checker required |
| CMP-TC-005 | Complaint closure without evidence | Blocked |
| CMP-TC-006 | Complaint escalation threshold reached | Escalation created |
| CMP-TC-007 | Complaint involving transaction/ledger issue | Linked to relevant record |
| CMP-TC-008 | Complaint involving AML/security issue | Compliance/Security review triggered |
| CMP-TC-009 | Complaint resolution approved | Closure audit event |
| CMP-TC-010 | Complaint report/export | Permission and audit enforced |


---

## 19. Data Protection, Privacy, and Retention Testing

### 19.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| DATA-TC-001 | Sensitive data encrypted at rest | Pass |
| DATA-TC-002 | Field-level encryption for MFA/bank/STR/Travel Rule fields | Pass |
| DATA-TC-003 | Tokenised field export | Masked/tokenised |
| DATA-TC-004 | Sensitive read access | Audit event |
| DATA-TC-005 | Audit-log read/export | Meta-audit event |
| DATA-TC-006 | PII appears in logs | Fail/block |
| DATA-TC-007 | Data residency unresolved | Go-live blocked |
| DATA-TC-008 | Cross-border vendor data flow unapproved | Blocked |
| DATA-TC-009 | DSAR without identity verification | Blocked |
| DATA-TC-010 | DSAR deletion conflicts with AML retention | Deletion blocked |
| DATA-TC-011 | Archive retrieval | Access logged |
| DATA-TC-012 | Legal hold overrides deletion | Pass |

---

## 20. Audit, Logging, and Monitoring Testing

### 20.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| AUD-TC-001 | Sensitive action commits | Audit/outbox written atomically |
| AUD-TC-002 | Audit service unavailable | Durable audit outbox committed or action blocked |
| AUD-TC-003 | Missing audit reconciliation detects gap | Critical alert |
| AUD-TC-004 | Audit log delete attempt | Blocked |
| AUD-TC-005 | Audit log modify attempt | Blocked |
| AUD-TC-006 | Hash-chain tamper test | Tamper detected |
| AUD-TC-007 | Log contains OTP/session token | Fail |
| AUD-TC-008 | Log PII scrubbing | Pass |
| AUD-TC-009 | Break-glass event | Heightened audit |
| AUD-TC-010 | Exchange-locked route attempt | Security alert |
| AUD-TC-011 | Monitoring rule detects ledger imbalance | Critical alert |
| AUD-TC-012 | Monitoring detects failed backup | Alert |

---

## 21. Backup, DR, Ransomware, and Resilience Testing

### 21.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| DR-TC-001 | Backup encryption | Pass |
| DR-TC-002 | Backup residency approved | Pass |
| DR-TC-003 | Backup restore test | Pass |
| DR-TC-004 | Backup access logged | Pass |
| DR-TC-005 | Immutable/WORM backup retention | Pass |
| DR-TC-006 | Isolated/air-gapped backup copy | Pass |
| DR-TC-007 | Backup tamper/delete attempt | Blocked/alert |
| DR-TC-008 | Ransomware recovery tabletop | Completed |
| DR-TC-009 | Restore integrity verification | Pass |
| DR-TC-010 | DR restore does not enable exchange modules | Pass |
| DR-TC-011 | LP outage | Fail closed |
| DR-TC-012 | Custodian outage | Holds/exception |
| DR-TC-013 | Bank outage | Holds/exception |
| DR-TC-014 | Scheduler missed reconciliation run | Critical alert |
| DR-TC-015 | Queue dead-letter for money job | Alert/controlled retry |

---

## 22. CI/CD, Supply Chain, and Deployment Testing

### 22.1 Required Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| CICD-TC-001 | Direct push to main | Blocked |
| CICD-TC-002 | PR without review | Blocked |
| CICD-TC-003 | Secret committed to repo | Secret scan fails |
| CICD-TC-004 | SAST critical finding | Build fails or risk acceptance |
| CICD-TC-005 | Dependency critical finding | Build fails or risk acceptance |
| CICD-TC-006 | SBOM generated | Pass |
| CICD-TC-007 | Build artefact signing/provenance | Pass |
| CICD-TC-008 | Production deploy without maker-checker | Blocked |
| CICD-TC-009 | DB migration not backward compatible | Blocked |
| CICD-TC-010 | Blue-green/rolling in-flight transaction test | Pass |
| CICD-TC-011 | Production feature flag mismatch | Blocked |
| CICD-TC-012 | Exchange module enabled after deploy | Blocked |
| CICD-TC-013 | Certificate rotation / expiry deployment | No outage or fail-safe alert |
| CICD-TC-014 | HMAC secret rotation deployment | Old/new transition controlled |

### 22.2 Data Migration Integrity Tests

| Test ID | Scenario | Expected Result |
|---|---|---|
| MIG-TC-001 | Financial migration preserves trial balance | Before = after |
| MIG-TC-002 | Balance migration no drift | Client balances unchanged/reconciled |
| MIG-TC-003 | Hold migration no orphaned holds | No orphan/duplicate holds |
| MIG-TC-004 | Ledger migration preserves immutability | Original entries unchanged |
| MIG-TC-005 | Migration rollback for financial schema | Safe rollback or forward fix documented |
| MIG-TC-006 | Migration creates reconciliation break | Break detected and controlled |
| MIG-TC-007 | Migration with idempotency records | No duplicate side effects |
| MIG-TC-008 | Migration audit evidence | Evidence retained |

---

## 23. Performance, Load, and Scalability Testing

### 23.1 Required Test Areas

1. Login and session load.
2. Quote request load.
3. LP adapter timeout behaviour.
4. Ledger posting concurrency.
5. Withdrawal concurrency.
6. Payout destination submission burst.
7. File upload load.
8. Screening job throughput.
9. Reconciliation batch timing.
10. Reporting read replica / read-model load.
11. Audit event throughput.
12. Scheduler job overlap control.
13. Notification throughput.
14. Backup performance impact.

Performance targets must be defined before production and mapped to SRS non-functional requirements.

---

## 24. UAT Strategy

### 24.1 UAT Participants

| Area | UAT Owner |
|---|---|
| Client onboarding | Compliance / Operations |
| Product access | Compliance / Product |
| OTC/RFQ | Operations |
| Spot Broking | Operations |
| Deposits | Finance / Operations |
| Withdrawals | Finance / Operations / Compliance |
| Ledger and reports | Finance |
| AML/Travel Rule | Compliance / MLRO |
| Reconciliation | Finance |
| Safeguarding | Finance / Compliance |
| Admin/IAM | Admin / Security |
| Reporting | Management / Compliance |
| Complaints/DSAR | Support / DPO |

### 24.2 UAT Exit Criteria

UAT can exit only if:

1. Critical scenarios pass.
2. High scenarios pass or formally risk accepted.
3. No open Critical defect.
4. No unresolved licence-scope defect.
5. No unresolved client-money defect.
6. No unresolved AML/Travel Rule defect.
7. No unresolved security Critical defect.
8. UAT sign-off obtained from domain owners.

---

## 25. Defect Management

### 25.1 Defect Severity

| Severity | Meaning | Go-Live Impact |
|---|---|---|
| Critical | Licence breach, client-money risk, security breach, AML failure, ledger integrity issue | Blocks go-live unless formal risk acceptance is allowed and approved |
| High | Major workflow, reporting, security, or operational control failure | Blocks go-live unless approved |
| Medium | Non-critical workflow or usability issue | May go-live if accepted |
| Low | Cosmetic or minor issue | Does not block unless cumulative risk |

### 25.2 Mandatory Critical Defect Categories

The following always default to Critical:

1. Exchange module accessible.
2. Principal exposure possible.
3. Client money can be misused.
4. Ledger imbalance possible.
5. Direct ledger/balance edit possible.
6. Withdrawal to unverified/third-party destination possible.
7. Missing KYC/AML gate.
8. STR visible to unauthorised role.
9. Cross-client data leak.
10. Audit missing for sensitive action.
11. Backup/DR failure.
12. Production secret leakage.
13. Ransomware recovery failure.
14. Break-glass bypasses licence lock.
15. Spoofed webhook can credit balance.
16. Traceability coverage gap for Critical control.
17. Aggregate AIX inventory non-zero.
18. Money-event outbox delivery failure.
19. Deposit from unverified third-party source not detected.
20. Financial data migration causes balance drift.

---

## 26. Automation Strategy

### 26.1 Automation Priority

Automate first:

1. Unit tests for core rules.
2. API permission tests.
3. Feature flag tests.
4. Licence-lock tests.
5. Ledger/balance/idempotency tests.
6. Workflow transition tests.
7. RBAC/SoD tests.
8. Webhook security tests.
9. Data isolation tests.
10. Regression tests for Critical controls.

Manual or semi-manual testing may remain for:

1. UAT.
2. Pen test.
3. DR tabletop.
4. Ransomware tabletop.
5. Compliance judgement cases.
6. STR filing evidence review.
7. Management sign-off.

### 26.2 Minimum Coverage

Minimum target:

```txt
core business logic coverage >= 80%
critical rule negative-test coverage = 100%
licence-lock negative-test coverage = 100%
money-critical workflow coverage = 100%
security go-live gate evidence = 100%
traceability_forward_coverage_for_critical_items = 100%
orphan_test_count = 0
```

---

## 27. Go-Live Testing Gate

Go-live cannot proceed unless the following are completed:

1. Traceability coverage audit completed with 100% Critical-control coverage and zero orphan tests.
2. Requirements test coverage complete.
3. Critical and High test cases executed.
4. No open Critical defects.
5. Licence-lock test suite passed.
6. Exchange module block suite passed.
7. RBAC/SoD/maker-checker suite passed.
8. Client-side approval suite passed.
9. KYC/AML/Travel Rule suite passed.
10. Deposit/withdrawal suite passed.
11. Ledger/balance/idempotency suite passed.
12. Settlement/reconciliation/safeguarding suite passed.
13. Webhook/vendor security suite passed.
14. Per-client isolation suite passed.
15. Audit-write atomicity suite passed.
16. Encryption and field-level encryption suite passed.
17. Backup/DR/ransomware recovery suite passed.
18. Performance/load test completed.
19. Pen test completed or formally risk accepted.
20. DR restore test completed.
21. Data residency approved.
22. Monitoring and alerting verified.
23. CI/CD deployment gate passed.
24. Production feature flags verified.
25. Future-locked Exchange disabled verified.
26. Offboarding/account-closure test suite passed.
27. Complaints lifecycle test suite passed.
28. Aggregate AIX zero-inventory test passed.
29. Money-event outbox suite passed.
30. Deposit-source verification tests passed.
31. Data-migration integrity tests passed.
32. Certificate/secret/HMAC rotation tests passed.
33. Notification functional tests passed.
34. Permission-revocation propagation test passed.
35. Compliance/MLRO sign-off.
36. Security sign-off.
37. Finance sign-off.
38. Operations sign-off.
39. Management/Principal Officer sign-off.

Risk acceptance must record:

1. Named approver.
2. Rationale.
3. Residual-risk rating.
4. Remediation owner.
5. Target remediation date.
6. Expiry/review date.

---

## 28. Test Evidence Repository

Test evidence must be stored in a controlled repository.

Evidence types:

1. Test execution report.
2. Automated test output.
3. API response evidence.
4. Screenshots.
5. Audit logs.
6. Reconciliation output.
7. Safeguarding computation.
8. Pen test report.
9. Vulnerability remediation evidence.
10. DR restore evidence.
11. Ransomware tabletop evidence.
12. Go-live sign-off.
13. Risk acceptance record.

Rules:

1. Evidence repository access is restricted.
2. Evidence retention follows records policy.
3. Sensitive evidence must be encrypted.
4. Evidence export requires approval.
5. Evidence must link to test ID and requirement/rule/workflow.

---

## 29. Testing-to-Rule Mapping

| Test Area | Key Rules Covered |
|---|---|
| Licence / Exchange Lock | LIC-RULE-001, LIC-RULE-002, LIC-RULE-003, LIC-RULE-004, ASSET-RULE-001 |
| Client / Product Access | CLT-RULE-001, CLT-RULE-002, CLT-RULE-003 |
| RBAC / SoD / Maker-Checker | SYS-RULE-001, SOD-RULE-001, IAM-RULE-001, IAM-RULE-002 |
| Feature Flags / Configuration | CFG-RULE-001, CFG-RULE-002, CFG-RULE-003 |
| KYC / AML / STR | AML-RULE-001, AML-RULE-002, AML-RULE-003, AML-RULE-004, AML-RULE-005, AML-RULE-006 |
| Travel Rule / Wallet | TR-RULE-001, TR-RULE-002 |
| Payout / Withdrawal | PAY-RULE-001, PAY-RULE-002, PAY-RULE-003 |
| Deposit / Suspense | DEP-RULE-001, DEP-RULE-002, DEP-RULE-003 |
| Quote / LP / Best Execution | QTE-RULE-001, QTE-RULE-002, QTE-RULE-003, FX-RULE-001, LP-RULE-001, LP-RULE-002, LP-RULE-003, LP-RULE-004 |
| Ledger / Balance / Idempotency | LED-RULE-001, LED-RULE-002, LED-RULE-003, LED-RULE-004, LED-RULE-005 |
| Settlement / Reconciliation | SET-RULE-001, SET-RULE-002, SET-RULE-003 |
| Safeguarding | SAFE-RULE-001, SAFE-RULE-002, SAFE-RULE-003 |
| Freeze / Offboarding | FRZ-RULE-001, FRZ-RULE-002, OFF-RULE-001 |
| Vendor / Secrets / Webhook | VND-RULE-001, VND-RULE-002, VND-RULE-003, VND-RULE-004, SEC-RULE-003 |
| Audit / Break-Glass | SEC-RULE-001, SEC-RULE-002 |
| Complaints | CMP-RULE-001 |
| Privacy / Records | DATA-RULE-001, DATA-RULE-002, DATA-RULE-003, REC-RULE-001, PRIV-RULE-001 |
| Reporting | RPT-RULE-001, RPT-RULE-002, RPT-RULE-003 |
| Reliability / Go-Live | REL-RULE-001, GOV-RULE-001 |
| CI/CD / Deployment | SYS-RULE-005, GOV-RULE-001 |

### 29.1 Testing-to-Workflow / Data Flow / Security Coverage

The traceability matrix must also cover:

| Upstream Layer | Coverage Rule |
|---|---|
| Workflow Map | Every WF-01 to WF-29 must have at least one workflow/state test |
| Data Flow Map | Every DF-01 to DF-27 must have at least one data-control test |
| Technical Architecture | Every Critical architecture component must have at least one technical/integration test |
| Security Architecture | Every Critical/High security control must have at least one security test |
| Threat Model | Every top threat must have at least one mitigation test |
| Go-Live Gate | Every gate must have evidence |

Required audit result:

```txt
traceability_coverage_audit = pass
orphan_test_check = pass
critical_control_coverage = 100%
```

---

## 30. Open Testing Decisions

The following must be finalised before module implementation:

1. Test management tool.
2. Automated API test framework.
3. Unit test framework.
4. E2E test framework.
5. Security testing tools.
6. Performance/load testing tool.
7. Test data generation approach.
8. Mock/sandbox vendor approach.
9. Webhook simulation tool.
10. Ledger concurrency test harness.
11. Reconciliation test dataset.
12. Safeguarding test formula dataset.
13. Pen test provider and scope.
14. DR/ransomware tabletop method.
15. Evidence repository location.
16. Go-live sign-off workflow.
17. Risk acceptance workflow.
18. Production smoke test checklist.
19. Traceability coverage audit tool/process.
20. Orphan test detection process.
21. Offboarding and complaints test data scenarios.
22. Aggregate zero-inventory reconciliation test method.
23. Money-event outbox test harness.
24. Deposit-source verification evidence rules.
25. Financial data-migration test dataset.
26. Certificate/secret/HMAC rotation test procedure.
27. Notification functional test setup.
28. Vendor adapter contract test framework.
29. Permission-revocation session test method.

---

## 31. Module Blueprint Testing Requirements

Every module blueprint must include:

1. Unit test cases.
2. API test cases.
3. Workflow test cases.
4. Permission tests.
5. Negative tests.
6. Audit event tests.
7. Error-code tests.
8. Data classification tests.
9. Security tests.
10. Integration tests where applicable.
11. UAT scenarios.
12. Go-live checklist.
13. Traceability mapping.
14. Forward coverage and orphan-test check.
15. Contract tests for external/internal API dependencies.
16. Data-migration tests where module owns financial or restricted data.

High-risk modules additionally require:

1. Concurrency tests.
2. Idempotency tests.
3. Reconciliation tests.
4. Safeguarding tests.
5. Pen-test scope.
6. Threat-model test scenarios.
7. Operational runbook tests.

---

## 32. Additional Testing Parameters

```txt
traceability_coverage_audit = required
every_upstream_item_has_test = required_for_requirement_rule_workflow_dataflow_control
orphan_test_check = required
critical_control_coverage = 100_percent

offboarding_test_coverage = required
complaints_test_coverage = required

aggregate_aix_position_zero_test = required
money_event_outbox_test = required
deposit_source_verification_test = required
data_migration_integrity_test = required

threat_model_to_test_mapping = required
cert_secret_hmac_rotation_test = required
notification_functional_test = required
permission_revocation_propagation_test = required
vendor_adapter_contract_test = required
api_backward_compatibility_test = required

related_party_ubo_sanctions_test = required
pep_handling_test = required
tipping_off_notification_statement_test = required
```


---

## 33. Claude Model Usage

### 33.1 Planning Model

Use for:

1. Test strategy refinement.
2. Test case generation.
3. Traceability matrix drafting.
4. Module blueprint testing pack.
5. Claude prompt creation.

### 33.2 Claude Opus

Use for:

1. Review of this Master Testing Strategy.
2. Regulated fintech test coverage review.
3. Money-control and ledger testing review.
4. Security and compliance test review.
5. Go-live gate review.
6. Traceability review.

### 33.3 Claude Sonnet

Do not use Sonnet for coding until the testing strategy, deployment strategy, and relevant module blueprint test cases are approved.

### 33.4 Claude Fable

Use later for user-facing test messages, QA notes, support wording, and error explanation text.

---

## 34. Claude Opus Review Prompt

```txt
Review this 10_Master_Testing_Strategy_v1.2.md as a principal fintech platform architect and regulated fintech QA/security/compliance reviewer.

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
  - 07_Master_Data_Flow_v1.2.md
  - 08_Master_Technical_Architecture_v1.2.md
  - 09_Master_Security_Architecture_v1.2.md
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Platform includes onboarding, KYC/KYB, AML, Travel Rule, transaction monitoring, payout destination whitelist, OTC/RFQ, MB Spot Broking Terminal, LP-backed agency execution, pre-funded hold, best-execution check, ledger, deposit, withdrawal, client-money safeguarding, settlement, reconciliation, audit log, maker-checker, client-side dual authorization, complaints, DSAR/privacy, break-glass access, account freeze/suspension, offboarding, periodic KYC refresh, FX/precision controls, reporting, and admin/staff/client portals.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

This v1.2 keeps the substantive v1.1 corrections and only fixes three sub-section numbering hygiene items in §19, §20, and §21. v1.1 added traceability coverage audit with forward coverage and orphan-test checks, offboarding/account-closure tests, complaints lifecycle tests, aggregate AIX zero-inventory tests, money-event outbox tests, deposit-source verification tests, data-migration integrity tests, certificate/secret/HMAC rotation tests, AML edge tests, notification functional tests, vendor/API contract tests, permission-revocation propagation tests, CFG/CMP rule mapping, and expanded go-live gates/parameters.

Review for:
1. Missing test categories.
2. Missing licence-lock or exchange-lock tests.
3. Missing client eligibility, KYC/KYB, AML, STR, Travel Rule, wallet screening, or compliance tests.
4. Missing RBAC, maker-checker, SoD, client-side approval, or impersonation tests.
5. Missing deposit, withdrawal, payout destination, client-money, safeguarding, reconciliation, or settlement tests.
6. Missing quote, LP, best-execution, FX, precision, slippage, pre-funded hold, or principal-exposure tests.
7. Missing ledger, balance, idempotency, concurrency, audit, or reversal tests.
8. Missing webhook, vendor, bank, custodian, LP, or outage tests.
9. Missing security, privacy, field-level encryption, threat-model, ransomware, backup, DR, CI/CD, or deployment tests.
10. Missing performance, load, UAT, evidence, defect, automation, or go-live gate controls.
11. Missing traceability from requirements/rules/workflows/data flows/architecture/security to tests.
12. Any gap that could allow exchange-like behaviour, principal dealing, client-money misuse, AML failure, audit failure, or cross-client data leakage to go untested.
13. Any conflict with 00, 01, 03, 02, 04, 05, 06, 07, 08, or 09.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional testing requirements or parameters to add.
```

---

## 35. Next Document

After this Master Testing Strategy document is reviewed and accepted, the next document should be:

```txt
11_Master_Deployment_Strategy.md
```

Reason:

Deployment strategy should be written after testing strategy is reviewed, so production deployment gates, release controls, environment hardening, rollback, go-live sequencing, monitoring, DR, and post-go-live support are aligned with the approved testing and security requirements.
