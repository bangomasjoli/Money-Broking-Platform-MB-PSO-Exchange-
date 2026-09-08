# PRT-01 Client / Staff / Admin Portal Workflows
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | PRT-01 |
| Module name | Client / Staff / Admin Portal Workflows |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Portal / UX / Workflow Presentation |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2, WLT-01 v1.2, LED-01 v1.2, TRD-01 v1.2, E2E-01 v1.2, DEP-01 v1.2, WDR-01 v1.2, REC-01 v1.2, INC-01 v1.2 |
| Provides outcome to | Client Portal, Staff Portal, Admin Portal, Compliance Portal, Finance Portal, Management Dashboard |

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
- WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted
- REC-01 Reconciliation / Finance Reporting v1.2 — Accepted
- INC-01 Incident / Freeze / Recovery v1.2 — Accepted


---

## 2. Module Purpose

PRT-01 defines portal workflows that safely expose the accepted backend controls to users.

PRT-01 does not own regulated decisions or financial state. It only displays, requests, submits and routes actions to source modules. All material statuses must come from source modules. All sensitive actions must be permissioned, audited and fail closed.

---

## 3. In Scope

PRT-01 covers:

1. client login landing and account status display.
2. client onboarding/KYC progress display.
3. client deposit-intent creation display.
4. client withdrawal request display.
5. client payout destination management display.
6. client quote/trade request/acceptance workflow display.
7. client portfolio/balance/transaction history display.
8. client documents and evidence downloads.
9. client notifications and status messages.
10. staff case worklists.
11. staff onboarding/KYC/AML/WLT review screens.
12. staff deposit/withdrawal/trade monitoring screens.
13. finance reconciliation and report screens.
14. compliance monitoring and approval screens.
15. security/admin user/session/permission screens.
16. management dashboards.
17. maker-checker and dual-authorisation interaction.
18. incident/freeze-aware UX.
19. report/export controls.
20. masking and sensitive data display controls.
21. portal audit events.

---

## 4. Out of Scope

PRT-01 does not implement:

1. ledger source of truth.
2. balance source of truth.
3. deposit receipt/finality/credit.
4. payout rail instruction/finality.
5. trade/LP execution.
6. AML/sanctions decision.
7. WLT screening/whitelist decision.
8. KYC/KYB decision.
9. reconciliation rule decision.
10. incident freeze/resume decision.
11. Exchange order book.
12. matching engine.
13. market making.
14. principal dealing.
15. AIX spread markup.

---

## 5. Critical Principles

### 5.1 Portal Is Not Source of Truth

PRT-01 must not own or calculate authoritative financial/compliance statuses.

Rules:

1. balance shown comes from LED-01.
2. trade status comes from TRD-01 + LED outcome.
3. deposit status comes from DEP-01 + LED outcome.
4. withdrawal status comes from WDR-01 + LED outcome.
5. reconciliation status comes from REC-01.
6. incident/freeze status comes from INC-01.
7. AML/WLT/KYC statuses come from owning modules.
8. portal-cached data cannot be treated as source truth.

### 5.2 Status Truthfulness

Portal status must reflect backend truth and must not prematurely show success.

Rules:

1. deposit cannot show credited before LED credit.
2. withdrawal cannot show paid before rail finality + LED outcome.
3. trade cannot show filled/settled before TRD + LED confirmation.
4. incident/freeze cannot be hidden from affected workflow.
5. cancelled cannot be shown if external execution occurred.
6. pending/review/quarantine/restricted states must be visible where appropriate.
7. report status must show draft/final/restated/open-break warnings.

### 5.3 Permission and Context Enforcement

Every portal action must enforce:

1. authenticated session.
2. MFA/step-up where required.
3. IAM-02 permission.
4. SoD/maker-checker.
5. client mandate/dual-authorisation.
6. account/freeze restrictions.
7. CFG licence/feature lock.
8. backend validation.

Frontend hiding a button is not a control.

### 5.4 Licence Lock / Exchange Feature Blocking

The portal must not expose Exchange features.

Prohibited:

1. public order book.
2. market depth.
3. matching engine.
4. client-to-client trading.
5. market-maker tools.
6. principal inventory screen.
7. AIX spread-markup configuration.
8. public exchange-style trading UI.
9. securities/STO workflow unless separately approved.

### 5.5 AML Tipping-Off Safe UX

Portal messages must avoid tipping-off.

Rules:

1. client-facing AML/sanctions hold messages must be generic.
2. do not reveal sanctions/PEP/adverse-media screening details.
3. do not reveal investigation triggers.
4. compliance-only reason codes are restricted.
5. message templates require compliance approval.
6. staff view distinguishes internal reason from client-safe message.

### 5.6 Masking and Data Minimisation

Sensitive data display must be masked by default.

Sensitive data includes:

1. KYC/KYB documents.
2. personal data.
3. beneficial ownership data.
4. bank account details.
5. wallet addresses where policy requires.
6. Travel Rule payload.
7. AML reason codes.
8. audit evidence.
9. incident evidence.
10. export packages.

### 5.7 Maker-Checker UX

Portal must guide maker-checker without bypass.

Rules:

1. maker action creates pending approval.
2. checker sees full evidence and change diff.
3. same user cannot approve own action where SoD applies.
4. approval/rejection requires reason.
5. no silent auto-approval for high-risk actions.
6. approval state comes from IAM-02/source module.

### 5.8 Client Dual Authorisation UX

Client-side dual authorisation must be supported where mandate requires.

Rules:

1. request creator cannot solely approve where mandate requires.
2. approver identity and role verified.
3. pending authorisation visible.
4. expiry and rejection handled.
5. action cannot proceed until backend confirms authorisation.

### 5.9 Incident / Freeze-Aware UX

Portal must respect active freezes and incidents.

Rules:

1. affected actions disabled by backend denial.
2. client/staff status displays approved client-safe messages.
3. freeze release only after INC resume gate.
4. portal cannot hide active material restriction.
5. attempts during freeze are audited.
6. degraded-mode restrictions are reflected.

### 5.10 Evidence / Export Controls

Evidence and reports exposed through portal must follow REC/SEC/INC controls.

Rules:

1. evidence export requires permission and approval.
2. sensitive export masked by policy.
3. report must show run ID, period, status and warnings.
4. final/restated report status must be visible.
5. export downloads are audited.
6. evidence cannot be edited through portal.

### 5.11 UI / API Consistency

Portal must not rely on frontend-only validation.

Rules:

1. backend must revalidate every action.
2. API error must be safely displayed.
3. user cannot alter hidden fields to bypass control.
4. idempotency required for sensitive submissions.
5. source module state mismatch blocks action.
6. stale UI state requires refresh/revalidation.

### 5.12 Notifications and Communication Controls

Portal notifications must be controlled.

Rules:

1. messages use approved templates.
2. AML/security/incident messages require relevant approval.
3. notifications include appropriate status without disclosing restricted reason.
4. client messages must not contradict backend truth.
5. delivery and read status may be tracked.
6. opt-out cannot disable mandatory regulatory/security notices.

### 5.13 Admin Portal Boundaries

Admin portal must not become a superuser bypass.

Rules:

1. admin cannot directly edit balances.
2. admin cannot directly edit ledger.
3. admin cannot bypass KYC/AML/WLT/LED/TRD/DEP/WDR/REC/INC.
4. admin cannot delete audit events.
5. admin cannot enable Exchange features.
6. admin high-risk configuration requires maker-checker.

### 5.14 Accessibility, Session Safety and UX Reliability

Portal must support safe usability.

Rules:

1. session timeout and re-auth for sensitive actions.
2. double-submit protection.
3. clear status for pending/failed/rejected actions.
4. no ambiguous money status.
5. error messages do not leak sensitive data.
6. critical alerts are visible to relevant staff.

---

## 6. Actors

| Actor | Role |
|---|---|
| Client User | Uses client portal |
| Client Approver | Authorises client-side actions |
| Operations Staff | Handles operational worklists |
| Compliance / MLRO | Handles AML/KYC/WLT/restricted reviews |
| Finance Staff | Views reconciliation/finance reports |
| Security Admin | Reviews sessions/security events |
| System Admin | Configures non-financial admin settings |
| Management User | Views dashboards/reports |
| Auditor / Regulator Viewer | Controlled evidence/report access |
| Portal Service Account | Calls source module APIs |

---

## 7. Dependencies

1. IAM-01/IAM-02 for identity, session, MFA, permissions, SoD.
2. CFG-01 for licence/feature locks.
3. CLT/KYC/AML/WLT for client and compliance status.
4. LED for balances, holdings, reserve and settlement status.
5. TRD for quote/trade workflow.
6. DEP for deposit workflow.
7. WDR for withdrawal/payout workflow.
8. REC for reconciliation/report status and evidence packs.
9. INC for incident/freeze/recovery status.
10. SEC for audit and security monitoring.
11. E2E for correlation/evidence navigation.

---

## 8. Components

| Component | Description |
|---|---|
| Portal Shell | Common layout/navigation |
| Client Dashboard | Client view |
| Staff Worklist | Staff case/action list |
| Compliance Console | AML/KYC/WLT review views |
| Finance Console | REC/LED/report views |
| Security/Admin Console | IAM/SEC/admin views |
| Management Dashboard | High-level KPIs/status |
| Status Truth Adapter | Source-of-truth status display |
| Permission UI Guard | UI gating + backend permission binding |
| Masking Engine | Sensitive data masking |
| Template Message Engine | Approved messages |
| Maker-Checker UI | Approval workflow display |
| Client Dual-Auth UI | Client mandate approval display |
| Incident Banner Service | Freeze/incident UX |
| Export Controller | Evidence/report download flow |
| Audit Event Publisher | Portal audit events |
| Idempotency Guard | Double-submit protection |

---

## 9. Functional Requirements

### PRT1-FR-001 Source-Truth Display

Portal shall display statuses from source modules only.

### PRT1-FR-002 Status Truthfulness

Portal shall not display success before backend finality/outcome.

### PRT1-FR-003 Permission Enforcement

Portal shall enforce IAM/CFG/freeze context for every action.

### PRT1-FR-004 Client Portal

Portal shall provide client onboarding, deposit, withdrawal, trade, statement and notification workflows.

### PRT1-FR-005 Staff Worklist

Portal shall provide staff worklists and case views.

### PRT1-FR-006 Compliance Console

Portal shall provide AML/KYC/WLT restricted review views.

### PRT1-FR-007 Finance Console

Portal shall provide reconciliation, safeguarding and finance reporting views.

### PRT1-FR-008 Admin/Security Console

Portal shall provide user/session/security/admin views without financial bypass.

### PRT1-FR-009 Management Dashboard

Portal shall provide management overview dashboards.

### PRT1-FR-010 Masking and Data Minimisation

Portal shall mask sensitive data by default.

### PRT1-FR-011 Maker-Checker UX

Portal shall support maker-checker workflows.

### PRT1-FR-012 Client Dual Authorisation

Portal shall support client mandate dual-authorisation.

### PRT1-FR-013 Incident/Frozen State Display

Portal shall reflect approved incident/freeze status and backend denials.

### PRT1-FR-014 Evidence / Export Controls

Portal shall enforce approval/masking/audit for evidence exports.

### PRT1-FR-015 Tipping-Off Safe Messages

Portal shall use approved client-safe AML/security/incident messages.

### PRT1-FR-016 No Exchange Feature Exposure

Portal shall prohibit Exchange UI features.

### PRT1-FR-017 Backend Revalidation

Portal shall ensure backend revalidation of every sensitive action.

### PRT1-FR-018 Portal Audit

Portal shall emit SEC audit events for sensitive views/actions/exports.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Source-truth display | Required |
| Backend revalidation | Required |
| Frontend-only control | Prohibited |
| Sensitive data masking | Required |
| Audit | SEC-01 integrated |
| Export approval | Required |
| Exchange UI | Prohibited |
| Client-status truth | Required |
| Tipping-off safety | Required |
| Accessibility | Required |
| Double-submit protection | Required |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

PRT-01 must not allow:

1. ledger posting.
2. balance editing.
3. direct reserve release.
4. direct payout execution.
5. direct deposit credit.
6. direct trade execution.
7. AML/WLT/KYC decision override.
8. REC break closure bypass.
9. INC freeze release bypass.
10. audit event deletion/editing.
11. admin superuser financial bypass.
12. frontend-only permission control.
13. stale UI state submitting sensitive action without backend revalidation.
14. displaying withdrawal paid before WDR finality + LED outcome.
15. displaying deposit credited before LED credit.
16. displaying trade settled before TRD + LED outcome.
17. exposing AML/sanctions reason to client.
18. tipping-off communication.
19. raw sensitive export without approval.
20. hiding material open break in report.
21. hiding active incident/freeze where relevant.
22. public order book UI.
23. market depth UI.
24. matching engine UI.
25. client-to-client trading UI.
26. principal inventory UI.
27. AIX spread-markup UI.
28. Exchange trading UI.

---

## 12. Acceptance Criteria

PRT-01 is accepted only if:

1. Source-of-truth display defined.
2. Status truthfulness defined.
3. IAM/CFG/INC context enforcement defined.
4. Client portal workflows defined.
5. Staff portal workflows defined.
6. Compliance console defined.
7. Finance console defined.
8. Admin/security console boundaries defined.
9. Management dashboard defined.
10. Masking and minimisation defined.
11. Maker-checker UX defined.
12. Client dual-authorisation UX defined.
13. Incident/freeze-aware UX defined.
14. Evidence/export controls defined.
15. Tipping-off-safe messages defined.
16. Exchange UI prohibited.
17. Backend revalidation defined.
18. Portal audit defined.
19. Tests defined and passed.

---

## 13. Open Items

1. Final UI wireframes.
2. Final client wording templates.
3. Final dashboard KPIs.
4. Final role menu structure.
5. Final data masking policy.
6. Final portal session timeout values.
7. Final document/evidence download format.
8. Final accessibility standard.
