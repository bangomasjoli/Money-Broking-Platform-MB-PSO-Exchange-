# PRT-01 Client / Staff / Admin Portal Workflows
## 10 Test Cases

## 1. Source Truth / Status Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-001 | Balance displayed from LED only | Pass | Critical |
| PRT1-TC-002 | Withdrawal shown paid on provider ack only | Blocked/pending | Critical |
| PRT1-TC-003 | Deposit shown credited before LED credit | Blocked/pending | Critical |
| PRT1-TC-004 | Trade shown settled before TRD+LED outcome | Blocked/pending | Critical |
| PRT1-TC-005 | Stale status submitted | Backend revalidation | Critical |

## 2. Permission / Action Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-006 | Hidden button exposed by user | Backend denial | Critical |
| PRT1-TC-007 | Sensitive action without MFA | Step-up required | Critical |
| PRT1-TC-008 | User without permission opens restricted view | Denied | Critical |
| PRT1-TC-009 | Same user approves own SoD action | Blocked | Critical |
| PRT1-TC-010 | Duplicate submit | Idempotent result/conflict | Critical |

## 3. Client Workflow Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-011 | Client creates deposit intent | Routed to DEP | Critical |
| PRT1-TC-012 | Client requests withdrawal | Routed to WDR/LED controls | Critical |
| PRT1-TC-013 | Client dual-auth required | Pending approver | Critical |
| PRT1-TC-014 | Client accepts quote | Routed to TRD | Critical |
| PRT1-TC-015 | Quote expired | Backend rejects | Critical |

## 4. Masking / Tipping-Off / Export Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-016 | Client AML hold reason displayed | Blocked/generic message | Critical |
| PRT1-TC-017 | Staff lacks restricted permission | Masked/denied | Critical |
| PRT1-TC-018 | Sensitive export without approval | Blocked | Critical |
| PRT1-TC-019 | Evidence download | Audited | High |
| PRT1-TC-020 | Message template unapproved | Not usable | Critical |

## 5. Incident / Exchange / Admin Boundary Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-021 | Action attempted during freeze | Backend denial + approved message | Critical |
| PRT1-TC-022 | Freeze hidden from staff workflow | Blocked | Critical |
| PRT1-TC-023 | Admin edits balance | Blocked | Critical |
| PRT1-TC-024 | Admin clears REC break | Blocked | Critical |
| PRT1-TC-025 | Exchange order book UI enabled | Blocked | Critical |
| PRT1-TC-026 | Market depth UI enabled | Blocked | Critical |
| PRT1-TC-027 | AIX spread markup UI enabled | Blocked | Critical |
| PRT1-TC-028 | Audit event delete via portal | Blocked | Critical |

## 6. Reporting / Dashboard Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-029 | Report with open critical breaks | Warning visible | Critical |
| PRT1-TC-030 | Restated report | Superseded status visible | High |
| PRT1-TC-031 | Management dashboard hides safeguarding deficit | Blocked/alert | Critical |
| PRT1-TC-032 | Auditor evidence pack lacks approval | Blocked | Critical |


## 7. v1.1 Display Truth / Non-Regression Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-033 | Paid status cached, WDR later returns payout | Cached paid suppressed; returned shown | Critical |
| PRT1-TC-034 | Credited deposit later reversed | Reversal overlay wins | Critical |
| PRT1-TC-035 | Report final later restated | Restated warning shown | Critical |
| PRT1-TC-036 | INC freeze active over positive balance/action screen | Freeze overlay wins | Critical |
| PRT1-TC-037 | Source unavailable for balance | Status unavailable, not green/zero | Critical |
| PRT1-TC-038 | Cached status lacks source version | Display blocked/revalidated | Critical |

## 8. v1.1 Object Authorization Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-039 | Client A requests Client B balance by ID | Denied/audited | Critical |
| PRT1-TC-040 | Client A downloads Client B document | Denied/audited | Critical |
| PRT1-TC-041 | Staff enumerates unassigned clients | Denied/limited | Critical |
| PRT1-TC-042 | Portal service account fetches broader data than user entitlement | Blocked | Critical |
| PRT1-TC-043 | Auditor accesses outside evidence pack scope | Denied | Critical |

## 9. v1.1 Invalidation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-044 | INC freeze event pushed to active session | Cache invalidated/actions disabled | Critical |
| PRT1-TC-045 | AML revocation event pushed | Client-safe restricted state shown | Critical |
| PRT1-TC-046 | REC restatement event pushed | Report status updated | Critical |
| PRT1-TC-047 | Invalidation subscription lost | Fail-closed/revalidate | Critical |
| PRT1-TC-048 | Management dashboard feed missing | Degraded, not green | Critical |

## 10. v1.1 Export / Evidence Egress Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-049 | Portal receives raw unmasked export and masks client-side | Blocked | Critical |
| PRT1-TC-050 | Export without recipient/purpose/basis | Blocked | Critical |
| PRT1-TC-051 | Download token reused | Blocked/audited | Critical |
| PRT1-TC-052 | Download token used by different recipient | Blocked | Critical |
| PRT1-TC-053 | Permission revoked after approval before download | Download blocked | Critical |
| PRT1-TC-054 | Freeze/legal hold after export approval | Generation/download blocked | Critical |
| PRT1-TC-055 | Auditor pack lacks watermark/disclosure log | Blocked/warning | High |

## 11. v1.1 Hostile Browser / Input Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-056 | Client alters quote price in browser | Rejected | Critical |
| PRT1-TC-057 | Client alters fee/amount/destination in quote acceptance | Rejected | Critical |
| PRT1-TC-058 | Quote acceptance missing server quote hash | Rejected | Critical |
| PRT1-TC-059 | Malware file upload | Rejected/quarantined | Critical |
| PRT1-TC-060 | CSV formula injection upload | Sanitized/rejected | High |
| PRT1-TC-061 | CSRF state-changing request | Blocked | Critical |
| PRT1-TC-062 | Clickjacking attempt | Blocked | High |
| PRT1-TC-063 | Session fixation attempt | Blocked | Critical |
| PRT1-TC-064 | XSS/output injection in client-safe message | Encoded/blocked | Critical |

## 12. v1.1 Notification / Step-Up / Fee Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-065 | Paid notification queued then payout reversed before send | Paid suppressed/superseded | Critical |
| PRT1-TC-066 | Duplicate/out-of-order notifications | Supersession correct | High |
| PRT1-TC-067 | High-value payout step-up not bound to amount/destination | Rejected | Critical |
| PRT1-TC-068 | Unrelated recent MFA used for payout approval | Rejected | Critical |
| PRT1-TC-069 | Fee displayed differs from TRD/LED charged fee | Blocked | Critical |
| PRT1-TC-070 | AIX spread displayed as spread/markup | Blocked | Critical |

## 13. v1.1 Communication / Correlation / Degraded Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| PRT1-TC-071 | Client-facing AML message reads internal reason code | Blocked | Critical |
| PRT1-TC-072 | Restricted category uses free-text client message | Blocked | Critical |
| PRT1-TC-073 | Sensitive action without correlation ID | Blocked | Critical |
| PRT1-TC-074 | Correlation missing in source call | Blocked/break | Critical |
| PRT1-TC-075 | Correlation missing in SEC event | Break | Critical |
| PRT1-TC-076 | Source unavailable displayed blank/zero/all-clear | Blocked; unavailable state | Critical |
| PRT1-TC-077 | Portal-originated action missing from E2E registry | Break | Critical |
| PRT1-TC-078 | REC portal reconciliation detects false final status | Critical break | Critical |

---

## 14. Go-Live Criteria

```txt
source_truth_status_tests_passed = true
permission_action_tests_passed = true
client_workflow_tests_passed = true
masking_tipping_export_tests_passed = true
incident_exchange_admin_tests_passed = true
reporting_dashboard_tests_passed = true
display_truth_tests_passed = true
object_authorization_tests_passed = true
invalidation_tests_passed = true
export_egress_tests_passed = true
hostile_input_tests_passed = true
notification_stepup_fee_tests_passed = true
communication_correlation_degraded_tests_passed = true
critical_control_coverage = 100_percent
```
