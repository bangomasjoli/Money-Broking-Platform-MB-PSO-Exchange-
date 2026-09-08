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

## 7. Go-Live Criteria

```txt
source_truth_status_tests_passed = true
permission_action_tests_passed = true
client_workflow_tests_passed = true
masking_tipping_export_tests_passed = true
incident_exchange_admin_tests_passed = true
reporting_dashboard_tests_passed = true
critical_control_coverage = 100_percent
```
