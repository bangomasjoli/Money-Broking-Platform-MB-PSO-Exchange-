# PRT-01 Client / Staff / Admin Portal Workflows
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | PRT-01 |
| Module name | Client / Staff / Admin Portal Workflows |
| Pack version | v1.2 |
| Status | Accepted / final verified; v1.2 is cosmetic final rollup only, no substantive control change from v1.1 |
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


### 5.15 Display Truth Non-Regression Model

Portal display truth must be mechanised. A cached status must never be more favourable than current source truth.

Rules:

1. every money/compliance/report status displayed must bind to source module, source object ID and source status version/epoch.
2. portal must compare cached version with current source/invalidation epoch before sensitive display.
3. portal must never render a status more advanced or favourable than current source truth.
4. if source is stale, absent, downgraded or unreachable, portal fails closed to less favourable / unavailable / pending / review state.
5. overlay precedence always applies:
   - incident/freeze.
   - AML/WLT revocation.
   - quarantine/restriction.
   - reversal/return/clawback.
   - report restatement.
   - REC critical warning.
6. cached positive status is suppressed if any higher-priority overlay exists.
7. "last known paid/credited/settled" must not be shown as current truth without revalidation.

Parameters:

```txt
display_cache_ttl_by_status_class = money_critical_seconds
source_status_staleness_threshold = fail_closed_after_threshold
source_status_version_scheme      = monotonic_per_object_sequence
non_regression_enforcement        = never_render_more_favourable_than_current_source
overlay_precedence_order          = freeze_quarantine_restatement_reversal_override_cached_positive
```

### 5.16 Object-Level Read Authorization

Every readable object must be authorised at object/row level, not only by role.

Rules:

1. client can read only own authorised objects.
2. client IDs/source refs in request path are never trusted.
3. staff read access is scoped to assigned cases, mandate, team or approved role scope.
4. management dashboards aggregate only approved scope.
5. auditor/regulator access is limited to approved evidence pack scope.
6. portal service account calls are re-scoped to authenticated end-user entitlement.
7. source module must receive end-user subject, entitlement scope and correlation ID.
8. failed object authorization is audited.
9. role permission alone is insufficient for object access.

Parameters:

```txt
object_ownership_model_per_resource = required
staff_worklist_scope                = assigned_case_or_mandate_not_role_wide
service_account_reauthorization_rule = source_call_re_scoped_to_end_user_entitlement
```

### 5.17 Push Invalidation / Revocation Subscription

Portal must receive immediate invalidation for freeze, revocation, restatement and reversal events.

Rules:

1. portal sessions subscribe to invalidation epoch stream.
2. INC freeze, AML/WLT revocation, REC restatement, DEP reversal, WDR return, TRD bust and LED correction increment relevant epoch.
3. active sessions and display caches must invalidate immediately.
4. loss of subscription forces fail-closed degraded display.
5. stale epoch blocks sensitive actions and sensitive displays until revalidated.
6. management dashboards cannot show green if invalidation feed unavailable.

Parameters:

```txt
invalidation_epoch_subscription   = required
max_acceptable_invalidation_lag   = defined_seconds
subscription_loss_behaviour       = assume_possibly_stale_force_revalidate
```

### 5.18 Export / Evidence Egress Hardening

Portal export is the platform's highest-consequence data egress and must be hardened.

Rules:

1. masking is applied by REC/SEC/INC/source policy engine, never by portal/browser.
2. portal must not receive unmasked payload that the user is not authorised to see.
3. export request captures recipient, purpose and lawful/regulatory basis.
4. export approval binds scope, masking, recipient and expiry.
5. generation time rechecks permission, freeze/legal hold/tipping-off.
6. download time rechecks permission, freeze/legal hold/tipping-off.
7. download token is recipient-bound, single-use and expiring.
8. watermark applied where policy requires.
9. disclosure log retained.
10. re-download beyond allowed ceiling requires new approval.

Parameters:

```txt
export_masking_locus                      = source_policy_engine_never_portal_side
export_download_token_ttl                 = single_use_recipient_bound_expiring
export_max_redownload_count               = default_1
export_watermark_policy                   = required_for_regulator_auditor_packs
export_recipient_purpose_basis_capture    = required
export_recheck_at_generation_and_download = permission_freeze_legal_hold_tipping_off
```

### 5.19 Hostile Browser / Input Integrity Boundary

The browser is untrusted.

Rules:

1. client-posted economics are never trusted.
2. quote acceptance must bind to server-issued quote ID, quote hash, fee, amount, asset, destination and validity.
3. accepted economics must be retrieved from TRD/source server record, not browser payload.
4. file uploads require allowed type/size, malware scan, content-type verification and parser hardening.
5. CSV/formula injection is neutralised.
6. SSRF/path traversal/parser abuse is blocked.
7. state-changing routes require CSRF protection.
8. clickjacking protection required.
9. session fixation protection required.
10. output encoding / anti-injection required.
11. rendered client-safe message integrity is protected.

Parameters:

```txt
quote_acceptance_binding = server_quote_id_hash_validity_reject_client_posted_economics
file_upload_policy       = allowed_types_size_malware_scan_csv_injection_ssrf_parser_controls
web_integrity_controls   = csrf_clickjacking_session_fixation_output_encoding
```

### 5.20 Notification Supersession and Reconcile-Before-Send

Notifications can arrive duplicated, delayed or out of order.

Rules:

1. every notification has source object, source version and notification version.
2. before sending, portal reconciles notification content against current source truth.
3. stale favourable notice is suppressed or superseded.
4. reversal/restatement/return notification supersedes prior paid/credited/settled notice.
5. mandatory regulatory/security notices cannot be opted out.
6. notification supersession is audit logged.

Parameters:

```txt
notification_supersession_rule = source_versioned_reconcile_before_send
```

### 5.21 Action-Bound Step-Up / Dynamic Linking

Step-up must bind to the action, not only recency.

Rules:

1. step-up freshness varies by action risk tier.
2. high-value payout authorisation binds step-up to action + amount + destination.
3. quote acceptance step-up/confirmation binds to quote ID/hash and fee disclosure where required.
4. sensitive export approval binds step-up to export scope and recipient.
5. unrelated or stale MFA cannot authorise new sensitive action.

Parameters:

```txt
session_idle_timeout                    = defined
session_absolute_timeout                = defined
step_up_freshness_by_action_risk_tier   = defined
high_value_step_up_binding              = action_amount_destination
```

### 5.22 Disclosed-Fee Display Truthfulness

Portal is the disclosure surface for the agency/disclosed-brokerage-only model.

Rules:

1. quote/trade screen must show disclosed fee/commission from TRD/LED source record.
2. fee must be itemised.
3. no AIX spread markup may be displayed or configured.
4. accepted economics must equal disclosed economics.
5. fee shown to client must equal fee charged in LED.
6. positive/negative adjustments follow TRD/LED rules.

Parameters:

```txt
disclosed_fee_display = source_trd_led_itemised_equal_to_charged_fee
```

### 5.23 Client-Safe Reason-Code Catalogue

Client-safe communication channel must be structurally separated from internal reasons.

Rules:

1. client-facing messages render only approved templates.
2. templates are keyed to client-safe reason codes.
3. internal AML/security/compliance reason codes are stored separately.
4. client channel cannot read internal reason field/store.
5. free-text to client is prohibited for restricted categories.
6. template approval authority depends on template type.

Parameters:

```txt
client_safe_reason_code_catalogue = required
template_approval_authority       = compliance_mlro_security_management_by_type
```

### 5.24 Correlation ID Propagation

Portal originates many user actions and must enter the E2E/SEC denominator.

Rules:

1. every sensitive portal action creates or receives FND correlation ID.
2. correlation ID is stored on portal action.
3. correlation ID is propagated to source module call.
4. correlation ID is emitted in SEC event.
5. E2E registry includes portal-originated sensitive action.
6. missing correlation ID blocks sensitive action.

Parameters:

```txt
correlation_id_propagation = every_source_call_and_sec_event
```

### 5.25 Source Unavailable / Degraded Display Rule

Source unavailable is never all-clear.

Rules:

1. if source unavailable, portal shows "status unavailable / cannot confirm" state.
2. stale-positive state is suppressed.
3. affordances requiring confirmable status are disabled.
4. management dashboards show degraded/unknown, not green.
5. degraded display is audited for critical screens.
6. source recovery triggers revalidation.

Parameters:

```txt
source_unavailable_display = unavailable_not_green_disable_sensitive_affordances
```

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
| Display Truth Engine | Non-regression and overlay precedence |
| Source Status Version Adapter | Source status version/epoch binding |
| Object Entitlement Engine | Object-level read authorization |
| Service Account Re-Scoping Adapter | Re-scopes backend calls to end-user entitlement |
| Invalidation Subscription Service | Push invalidation epoch handling |
| Export Egress Hardening Service | Source-side masking, token, watermark, disclosure log |
| Download Token Service | Recipient-bound single-use expiring download |
| Hostile Input Guard | Browser/input/upload/web integrity controls |
| Quote Acceptance Binding Guard | Server quote ID/hash economics binding |
| Notification Supersession Engine | Reconcile-before-send notifications |
| Dynamic Step-Up Binding Service | Action/amount/destination-bound MFA |
| Client-Safe Reason-Code Service | Client-safe template catalogue |
| Correlation Propagation Adapter | FND/E2E/SEC correlation stamping |
| Degraded Display Controller | Source unavailable / subscription-loss fail-closed UX |

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

### PRT1-FR-019 Display Non-Regression

Portal shall never display status more favourable than current source truth.

### PRT1-FR-020 Overlay Precedence

Portal shall apply freeze/quarantine/revocation/reversal/restatement overlays above cached positive status.

### PRT1-FR-021 Object-Level Read Authorization

Portal shall enforce object ownership/entitlement checks for every object read.

### PRT1-FR-022 Service Account Re-Scoping

Portal service account calls shall be re-scoped to authenticated end-user entitlement.

### PRT1-FR-023 Invalidation Subscription

Portal shall subscribe to invalidation epochs for freeze/revocation/restatement/reversal.

### PRT1-FR-024 Export Egress Hardening

Portal shall enforce source-side masking, disclosure log, recipient-bound token and rechecks.

### PRT1-FR-025 Hostile Browser Boundary

Portal shall treat browser input as untrusted and enforce anti-tamper/upload/web-integrity controls.

### PRT1-FR-026 Quote Acceptance Binding

Portal shall bind quote acceptance to server-issued quote ID/hash/validity/economics.

### PRT1-FR-027 Notification Supersession

Portal shall reconcile notifications against current source truth before send.

### PRT1-FR-028 Action-Bound Step-Up

Portal shall bind high-risk step-up to specific action and economic details.

### PRT1-FR-029 Disclosed-Fee Display

Portal shall show source-backed itemised fee equal to charged fee.

### PRT1-FR-030 Client-Safe Reason Codes

Portal shall structurally separate client-safe reason codes from internal reasons.

### PRT1-FR-031 Correlation Propagation

Portal shall propagate FND correlation ID into every sensitive source call and SEC event.

### PRT1-FR-032 Degraded Display

Portal shall display source-unavailable/degraded status as unknown/unavailable, never all-clear.

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
| Display non-regression | Required |
| Overlay precedence | Freeze/revocation/reversal/restatement override |
| Object authorization | Required |
| Service account re-scoping | Required |
| Push invalidation | Required |
| Export egress hardening | Required |
| Hostile browser boundary | Required |
| Quote economics binding | Required |
| Notification supersession | Required |
| Action-bound step-up | Required |
| Disclosed-fee display | Required |
| Client-safe reason code | Required |
| Correlation propagation | Required |
| Degraded display | Required |
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
29. cached status shown more favourable than source truth.
30. stale-positive status shown when source unavailable.
31. freeze/revocation/reversal/restatement overlay ignored.
32. client reads another client's object by ID substitution.
33. staff enumerates clients outside assigned/mandated scope.
34. portal service account uses broader authority than end user.
35. sensitive display/action continues after invalidation subscription loss.
36. export masking performed only in browser/portal after unmasked payload received.
37. export download token reused or forwarded without recipient binding.
38. export generated/downloaded without post-approval permission/freeze/tipping-off recheck.
39. client-posted quote economics accepted.
40. quote accepted without server quote ID/hash/validity binding.
41. unsafe file upload accepted.
42. CSRF/clickjacking/session-fixation/output-encoding controls missing.
43. stale notification sent after source reversal/restatement.
44. high-value step-up not bound to action/amount/destination.
45. fee shown differs from LED charged fee.
46. client-facing channel reads internal AML/security reason code.
47. sensitive portal action without correlation ID.
48. missing source displayed as green/all-clear.

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
19. Display non-regression defined.
20. Overlay precedence defined.
21. Object-level read authorization defined.
22. Service account re-scoping defined.
23. Push invalidation subscription defined.
24. Export egress hardening defined.
25. Hostile browser boundary defined.
26. Quote acceptance binding defined.
27. Notification supersession defined.
28. Action-bound step-up defined.
29. Disclosed-fee display truthfulness defined.
30. Client-safe reason-code separation defined.
31. Correlation ID propagation defined.
32. Source unavailable degraded-display rule defined.
33. Tests defined and passed.

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


## 14. Final Verification Note

PRT-01 v1.2 is accepted / final verified.

v1.2 is a cosmetic final rollup only. No substantive control change from v1.1.

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
- PRT-01 Client / Staff / Admin Portal Workflows v1.2 — Accepted

